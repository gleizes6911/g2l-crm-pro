import { Prisma, UserRole } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  calculateTicpeRemboursement,
  computeFuelFinancials,
  computeRecoverableVat,
  normalizeTx,
  resolveWexLicensePlateForImport,
  roundCurrency,
  selectTicpeRateForTransaction,
  type TicpeTauxRow,
} from "@/lib/fleet/formulas";
import {
  WebfleetDataSchema,
  WexApiTransactionRawSchema,
  WexDataSchema,
  WexLoginResponseSchema,
  WexSearchResponseSchema,
  type WebfleetData,
  type WexApiTransactionRaw,
  type WexData,
} from "@/lib/validations/fleet";
import type { ZodIssue } from "zod";

type ExternalPayload = WexData | WebfleetData;

export type PreparedImport = {
  provider: "wex" | "webfleet";
  action: string;
  externalId: string | null;
  importedAt: string;
  source: ExternalPayload;
  normalized: {
    vehicle: {
      registration: string | null;
      name: string | null;
    };
    driver: {
      id: string | null;
      name: string | null;
    };
    location: {
      latitude: number | null;
      longitude: number | null;
    };
    eventType: string | null;
  };
  computed?: {
    consommation_estimee_litres: number | null;
    recuperation_tva: number;
    remboursement_ticpe: number;
  };
  raw_wex_transaction?: unknown;
  g2l_transaction_carburant_id?: string;
};

export class FleetValidationError extends Error {
  readonly issues: ZodIssue[];

  constructor(message: string, issues: ZodIssue[]) {
    super(message);
    this.name = "FleetValidationError";
    this.issues = issues;
  }
}

export class FleetService {
  async importFromWex(options?: {
    fromDate?: string;
    toDate?: string;
    userId?: string | null;
  }) {
    const token = await this.wexLogin();
    const transactions = await this.wexSearchTransactions(token, options);
    const results: { externalId: string; auditLogId: string; transactionId: string }[] = [];

    const ticpeRows = await this.loadTicpeRows();

    for (const transaction of transactions) {
      const rawDetail = await this.wexGetTransactionDetails(token, transaction.id);
      const parsedDetail = WexApiTransactionRawSchema.safeParse(rawDetail);
      if (!parsedDetail.success) {
        throw new FleetValidationError("Reponse details WEX invalide.", parsedDetail.error.issues);
      }

      const detail = parsedDetail.data;
      const detailRecord = detail as Record<string, unknown>;
      const txNode = this.pickRecord(detailRecord, ["tx", "transaction"]);
      const detailsNode = this.pickRecord(detailRecord, ["details", "transactionDetails", "detail"]);
      const lineItemsRaw = detailRecord.lineItems ?? detailRecord.lines ?? detailRecord.items;
      const lineItems = Array.isArray(lineItemsRaw) ? lineItemsRaw : null;
      const mergedTx =
        Object.keys(txNode).length > 0 ? (txNode as Record<string, unknown>) : detailRecord;

      const normalized = normalizeTx({
        tx: mergedTx,
        details:
          Object.keys(detailsNode).length > 0 ? (detailsNode as Record<string, unknown>) : null,
        lineItems,
      });

      const cardNumber = this.extractCardNumber(detail);
      const carte =
        cardNumber !== null
          ? await prisma.g2LCarteCarburant.findFirst({
              where: { numero_carte: cardNumber },
              select: { id: true, vehicule: { select: { immatriculation: true } } },
            })
          : null;

      const plate = resolveWexLicensePlateForImport(
        detail,
        carte?.vehicule?.immatriculation ?? null
      );

      const amountTtc = normalized.amount_ttc ?? this.extractAmountTtc(detail);
      const volumeLitres =
        normalized.volume_litres ?? this.extractVolumeLitres(detail);
      const vatRate = normalized.vat_rate ?? this.extractVatRate(detail);
      const fuelCode = normalized.fuel_code ?? this.extractFuelCode(detail);
      const transactionDate = this.extractTransactionDate(detail);
      const regionCode = this.extractRegionCode(detail);

      const tauxCents = selectTicpeRateForTransaction(ticpeRows, {
        transaction_date: transactionDate,
        carburant_code: fuelCode ?? "GO",
        region_code: regionCode,
      });

      const financials = computeFuelFinancials({
        amountTtc,
        vatRate,
        fuelCode,
        volumeLiters: volumeLitres,
        ticpeTauxCents: tauxCents,
      });

      const montantHt =
        normalized.amount_ht !== null && normalized.amount_ht !== undefined
          ? normalized.amount_ht
          : financials.amountHt;
      const montantTva =
        normalized.amount_ht !== null && normalized.amount_ht !== undefined
          ? roundCurrency(amountTtc - montantHt)
          : financials.amountVat;
      const montantTvaRecuperable = computeRecoverableVat(fuelCode, montantTva);

      const remboursementTicpe = calculateTicpeRemboursement(volumeLitres ?? 0, tauxCents);

      const vehicule = plate.registration
        ? await prisma.g2LVehicule.findFirst({
            where: { immatriculation: plate.registration },
            select: { id: true },
          })
        : null;

      const ticpeRecord =
        tauxCents !== null
          ? await prisma.g2LTicpeTaux.findFirst({
              where: {
                carburant_code: { equals: fuelCode ?? "GO", mode: "insensitive" },
                date_debut: { lte: transactionDate },
                OR: [{ date_fin: null }, { date_fin: { gte: transactionDate } }],
              },
              orderBy: { date_debut: "desc" },
              select: { id: true },
            })
          : null;

      const synthetic = this.buildSyntheticWexPayload(
        detail,
        plate.registration ?? "UNKNOWN",
        transactionDate.toISOString()
      );

      const prepared = this.processExternalData(synthetic);

      const created = await prisma.g2LTransactionCarburant.create({
        data: {
          external_transaction_id: detail.id,
          fournisseur: "WEX",
          date_transaction: transactionDate,
          type_carburant: fuelCode ?? null,
          volume_litres:
            volumeLitres !== null && volumeLitres !== undefined
              ? new Prisma.Decimal(volumeLitres)
              : null,
          prix_litre_ttc:
            normalized.prix_litre_ttc !== null && normalized.prix_litre_ttc !== undefined
              ? new Prisma.Decimal(normalized.prix_litre_ttc)
              : null,
          montant_ttc: new Prisma.Decimal(amountTtc),
          montant_ht: new Prisma.Decimal(montantHt),
          montant_tva: new Prisma.Decimal(montantTva),
          montant_tva_recuperable: new Prisma.Decimal(montantTvaRecuperable),
          montant_ticpe: new Prisma.Decimal(financials.amountTicpe),
          consommation_estimee_litres:
            volumeLitres !== null && volumeLitres !== undefined
              ? new Prisma.Decimal(volumeLitres)
              : null,
          immatriculation: plate.registration,
          vehicule_id: vehicule?.id ?? null,
          carte_carburant_id: carte?.id ?? null,
          ticpe_taux_id: ticpeRecord?.id ?? null,
          metadata: detail as Prisma.InputJsonValue,
        },
      });

      const enriched: PreparedImport = {
        ...prepared,
        computed: {
          consommation_estimee_litres: volumeLitres ?? null,
          recuperation_tva: montantTvaRecuperable,
          remboursement_ticpe: remboursementTicpe,
        },
        raw_wex_transaction: detail,
        g2l_transaction_carburant_id: created.id,
      };

      const auditLog = await this.saveImportAudit(enriched, { userId: options?.userId });
      results.push({ externalId: detail.id, auditLogId: auditLog.id, transactionId: created.id });
    }

    return {
      importedCount: results.length,
      results,
    };
  }

  processExternalData(data: unknown): PreparedImport {
    const validation = this.validateExternalData(data);
    if (!validation.success) {
      throw new FleetValidationError(
        "Le payload d'import ne correspond ni au format WEX ni au format Webfleet.",
        validation.issues
      );
    }

    const payload = validation.data;
    const provider = validation.provider;
    const root = payload as Record<string, unknown>;
    const vehicle = this.pickRecord(root, ["vehicle", "truck", "asset"]);
    const driver = this.pickRecord(root, ["driver", "chauffeur"]);
    const position = this.pickRecord(root, ["position", "location"]);

    return {
      provider,
      action: `import:${provider}`,
      externalId: this.pickString(root, ["externalId", "eventId", "id"]),
      importedAt: new Date().toISOString(),
      source: payload,
      normalized: {
        vehicle: {
          registration:
            this.pickString(vehicle, ["registration", "plate", "immatriculation"]) ??
            this.pickString(root, ["registration", "plate"]),
          name:
            this.pickString(vehicle, ["name", "label"]) ??
            this.pickString(root, ["vehicleName", "assetName"]),
        },
        driver: {
          id:
            this.pickString(driver, ["id", "driverId"]) ??
            this.pickString(root, ["driverId"]),
          name:
            this.pickString(driver, ["name", "fullName"]) ??
            this.pickString(root, ["driverName", "chauffeur"]),
        },
        location: {
          latitude:
            this.pickNumber(position, ["lat", "latitude"]) ??
            this.pickNumber(root, ["lat", "latitude"]),
          longitude:
            this.pickNumber(position, ["lng", "longitude"]) ??
            this.pickNumber(root, ["lng", "longitude"]),
        },
        eventType:
          this.pickString(root, ["eventType", "type", "status"]) ??
          this.pickString(position, ["eventType", "type"]),
      },
    };
  }

  async saveImportAudit(
    preparedData: PreparedImport,
    options?: { userId?: string | null }
  ) {
    const userId = await this.resolveUserId(options?.userId ?? null);

    return prisma.auditLog.create({
      data: {
        action: preparedData.action,
        userId,
        metadata: preparedData as Prisma.InputJsonValue,
      },
    });
  }

  private async loadTicpeRows(): Promise<TicpeTauxRow[]> {
    const rows = await prisma.g2LTicpeTaux.findMany();
    return rows.map((row) => ({
      carburant_code: row.carburant_code,
      region_code: row.region_code,
      taux_cents: Number(row.taux_cents),
      date_debut: row.date_debut,
      date_fin: row.date_fin,
    }));
  }

  private buildSyntheticWexPayload(
    raw: WexApiTransactionRaw,
    plate: string,
    timestampIso: string
  ): WexData {
    const record = raw as Record<string, unknown>;
    const eventType =
      this.pickString(record, ["status", "type", "eventType", "transactionType"]) ??
      "transaction_import";

    return {
      source: "wex",
      eventId: raw.id,
      eventType,
      timestamp: timestampIso,
      vehicle: { plate },
      raw: { wex: raw },
    };
  }

  private async resolveUserId(candidateUserId: string | null): Promise<string> {
    if (candidateUserId) {
      const existing = await prisma.user.findUnique({
        where: { id: candidateUserId },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    const technicalEmail = "system-import@g2l.local";
    const technicalUser = await prisma.user.upsert({
      where: { email: technicalEmail },
      update: {},
      create: {
        email: technicalEmail,
        passwordHash: "system-managed",
        role: UserRole.EXPLOIT,
        metadata: { system: true, purpose: "fleet-import" },
      },
      select: { id: true },
    });

    return technicalUser.id;
  }

  /** Même base que `legacy-api/services/wexService.js` : IFCS en priorité, sinon WEX Connect. */
  private wexApiBaseUrl(): string {
    return (
      (process.env.WEX_BASE_URL || process.env.WEX_API_BASE_URL || "").replace(/\/$/, "") || ""
    );
  }

  /** Login IFCS (Basic + password grant) — identique au legacy ; sinon login minimal JSON (WEX Connect). */
  private wexUsesIfcsLogin(): boolean {
    return Boolean(
      process.env.WEX_USERNAME &&
        process.env.WEX_PASSWORD &&
        process.env.WEX_CLIENT_ID &&
        process.env.WEX_CLIENT_SECRET
    );
  }

  private wexApiVersionHeaders(): Record<string, string> {
    return this.wexUsesIfcsLogin() ? { "API-Version": "2.0.0" } : {};
  }

  private async wexLogin(): Promise<string> {
    const endpoint = this.wexApiBaseUrl();
    const clientId = process.env.WEX_CLIENT_ID;
    const clientSecret = process.env.WEX_CLIENT_SECRET;

    if (!endpoint || !clientId || !clientSecret) {
      throw new Error(
        "Configuration WEX manquante. Renseignez WEX_BASE_URL (ou WEX_API_BASE_URL), WEX_CLIENT_ID et WEX_CLIENT_SECRET."
      );
    }

    const username = process.env.WEX_USERNAME;
    const password = process.env.WEX_PASSWORD;

    let response: Response;

    if (username && password) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      response = await fetch(`${endpoint}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basic}`,
          "API-Version": "2.0.0",
        },
        body: JSON.stringify({
          grant_type: "password",
          username,
          password,
        }),
        cache: "no-store",
      });
    } else {
      response = await fetch(`${endpoint}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
        cache: "no-store",
      });
    }

    const rawText = await response.text();
    let json: unknown = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const hint =
        !username || !password
          ? " (essayez aussi WEX_USERNAME / WEX_PASSWORD pour l’API IFCS, comme l’API legacy)"
          : "";
      throw new Error(
        `Echec login WEX (${response.status})${hint}: ${rawText?.slice(0, 400) || "sans corps"}`
      );
    }

    const parsed = WexLoginResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FleetValidationError("Reponse login WEX invalide.", parsed.error.issues);
    }

    const d = parsed.data;
    if ("accessToken" in d) return d.accessToken;
    if ("access_token" in d) return d.access_token;
    return d.token;
  }

  private async wexSearchTransactions(
    token: string,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<Array<{ id: string }>> {
    const endpoint = this.wexApiBaseUrl();
    if (!endpoint) {
      throw new Error("WEX_BASE_URL ou WEX_API_BASE_URL est requis.");
    }

    const response = await fetch(`${endpoint}/transaction/search-transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...this.wexApiVersionHeaders(),
      },
      body: JSON.stringify({
        fromDate: options?.fromDate,
        toDate: options?.toDate,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Echec search-transactions WEX (${response.status})`);
    }

    const json = await response.json();
    const parsed = WexSearchResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FleetValidationError(
        "Reponse search-transactions WEX invalide.",
        parsed.error.issues
      );
    }

    return parsed.data.transactions;
  }

  private async wexGetTransactionDetails(
    token: string,
    transactionId: string
  ): Promise<WexApiTransactionRaw> {
    const endpoint = this.wexApiBaseUrl();
    if (!endpoint) {
      throw new Error("WEX_BASE_URL ou WEX_API_BASE_URL est requis.");
    }

    const response = await fetch(`${endpoint}/transaction/details`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...this.wexApiVersionHeaders(),
      },
      body: JSON.stringify({ id: transactionId }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Echec details WEX (${response.status})`);
    }

    return (await response.json()) as WexApiTransactionRaw;
  }

  private extractAmountTtc(raw: WexApiTransactionRaw): number {
    const record = raw as Record<string, unknown>;
    const value = this.pickNumber(record, [
      "amountTtc",
      "amount_ttc",
      "totalAmount",
      "total_amount",
      "amount",
    ]);
    if (value === null) {
      throw new Error("Impossible de determiner le montant TTC de la transaction WEX.");
    }
    return value;
  }

  private extractVatRate(raw: WexApiTransactionRaw): number {
    const record = raw as Record<string, unknown>;
    return (
      this.pickNumber(record, ["vatRate", "vat_rate", "taxRate", "tva_rate"]) ?? 20
    );
  }

  private extractFuelCode(raw: WexApiTransactionRaw): string | null {
    const record = raw as Record<string, unknown>;
    return (
      this.pickString(record, ["fuelCode", "fuel_code", "productCode", "fuelType", "type_carburant"]) ??
      null
    );
  }

  private extractVolumeLitres(raw: WexApiTransactionRaw): number | null {
    const record = raw as Record<string, unknown>;
    return this.pickNumber(record, [
      "volumeLiters",
      "volume_litres",
      "quantity",
      "liters",
      "volume",
    ]);
  }

  private extractTransactionDate(raw: WexApiTransactionRaw): Date {
    const record = raw as Record<string, unknown>;
    const rawDate =
      this.pickString(record, [
        "transactionDate",
        "transaction_date",
        "date",
        "postedDate",
        "posted_date",
      ]) ?? null;
    if (!rawDate) {
      return new Date();
    }
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }

  private extractRegionCode(raw: WexApiTransactionRaw): string | null {
    const record = raw as Record<string, unknown>;
    return (
      this.pickString(record, ["regionCode", "region_code", "countryCode", "country_code"]) ?? null
    );
  }

  private extractCardNumber(raw: WexApiTransactionRaw): string | null {
    const record = raw as Record<string, unknown>;
    const direct = this.pickString(record, ["cardNumber", "card_number", "pan"]);
    if (direct) return direct;
    const card = this.pickRecord(record, ["card"]);
    return this.pickString(card, ["number", "pan", "maskedPan", "embossing"]);
  }

  private validateExternalData(
    data: unknown
  ):
    | { success: true; provider: "wex"; data: WexData }
    | { success: true; provider: "webfleet"; data: WebfleetData }
    | { success: false; issues: ZodIssue[] } {
    const wex = WexDataSchema.safeParse(data);
    if (wex.success) {
      return { success: true, provider: "wex", data: wex.data };
    }

    const webfleet = WebfleetDataSchema.safeParse(data);
    if (webfleet.success) {
      return { success: true, provider: "webfleet", data: webfleet.data };
    }

    return {
      success: false,
      issues: [...wex.error.issues, ...webfleet.error.issues],
    };
  }

  private pickRecord(
    data: Record<string, unknown>,
    keys: string[]
  ): Record<string, unknown> {
    for (const key of keys) {
      const value = data[key];
      if (this.isRecord(value)) return value;
    }
    return {};
  }

  private pickString(
    data: Record<string, unknown>,
    keys: string[]
  ): string | null {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return null;
  }

  private pickNumber(
    data: Record<string, unknown>,
    keys: string[]
  ): number | null {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const num = Number(value);
        if (Number.isFinite(num)) return num;
      }
    }
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
