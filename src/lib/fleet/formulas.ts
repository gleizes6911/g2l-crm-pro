export type RegistrationResolutionResult = {
  registration: string | null;
  source:
    | "linked_vehicle_card"
    | "details_licensePlate"
    | "tx_licensePlate"
    | "card_embossing"
    | "none";
};

export type FinancialComputationInput = {
  amountTtc: number;
  vatRate: number;
  fuelCode?: string | null;
  volumeLiters?: number | null;
  /** Centimes par litre (table ticpe_taux.taux_cents) */
  ticpeTauxCents?: number | null;
};

export type TicpeTauxRow = {
  carburant_code: string;
  region_code: string | null;
  taux_cents: number;
  date_debut: Date;
  date_fin: Date | null;
};

export type NormalizeTxInput = {
  tx?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  lineItems?: unknown[] | null;
};

export type NormalizedTx = {
  volume_litres: number | null;
  prix_litre_ttc: number | null;
  amount_ttc: number | null;
  amount_ht: number | null;
  vat_rate: number | null;
  fuel_code: string | null;
  /** Référence métier WEX (alias : transaction_ref, externalRef, …) */
  transaction_ref: string | null;
  /** Numéro / PAN masqué tel que renvoyé par WEX */
  card_number: string | null;
  sources: {
    volume: "lineItems" | "details" | "tx" | "none";
    amount_ht: "lineItems" | "details" | "tx" | "computed_vat" | "none";
    amount_ttc: "tx" | "details" | "lineItems" | "computed" | "none";
    prix_litre_ttc: "computed" | "tx" | "details" | "none";
  };
};

const GAZOLE_CODES = new Set(["GO", "GAZOLE", "DIESEL", "B7", "B10"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNumber(obj: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Alias WEX / agrégateurs — ordre = priorité lecture (legacy bloc 2). */
const WEX_VOLUME_LINE_KEYS = [
  "quantity",
  "fuelQuantity",
  "volume",
  "liters",
  "volumeLiters",
  "volume_litres",
  "transQuantity",
  "lineQuantity",
  "soldQuantity",
  "totalTransLineQuantity",
  "qty",
  "fuelQty",
];

const WEX_VOLUME_DETAIL_KEYS = [
  "totalTransQuantity",
  "totalQuantity",
  "transQuantity",
  "volume",
  "totalVolume",
  "fuelQuantity",
  "quantityLiters",
  "volume_litres",
  "volumeLiters",
  "quantity",
  "liters",
];

const WEX_VOLUME_TX_KEYS = [
  "totalTransQuantity",
  "totalQuantity",
  "transQuantity",
  "volumeLiters",
  "volume_litres",
  "quantity",
  "fuelQuantity",
  "totalVolume",
  "liters",
  "volume",
];

const WEX_TTC_TX_KEYS = [
  "grossTransAmount",
  "totalGrossAmount",
  "grossAmount",
  "amountTtc",
  "amount_ttc",
  "totalTransAmount",
  "transGrossAmount",
  "totalAmount",
  "total_amount",
  "transactionAmount",
  "transAmount",
  "invoiceTotal",
  "amount",
  "total",
];

const WEX_TTC_DETAIL_KEYS = [
  "grossTransAmount",
  "totalGrossAmount",
  "grossAmount",
  "amountTtc",
  "amount_ttc",
  "totalAmount",
  "total_amount",
  "transactionAmount",
  "amount",
];

const WEX_TTC_LINE_KEYS = [
  "amountTtc",
  "amount_ttc",
  "grossAmount",
  "grossTransAmount",
  "lineGrossAmount",
  "total",
  "amount",
  "extendedAmount",
];

const WEX_HT_DETAIL_KEYS = [
  "netTransAmount",
  "totalNetAmount",
  "netAmount",
  "amountHt",
  "amount_ht",
  "totalNet",
  "total_ht",
  "transNetAmount",
];

const WEX_HT_TX_KEYS = [
  "netTransAmount",
  "totalNetAmount",
  "netAmount",
  "amountHt",
  "amount_ht",
  "totalNet",
  "transNetAmount",
];

const WEX_HT_LINE_KEYS = [
  "amountHt",
  "amount_ht",
  "netAmount",
  "net",
  "total_ht",
  "lineNetAmount",
];

const WEX_VAT_KEYS = ["vatRate", "vat_rate", "taxRate", "vatPercent", "tva_rate", "totalTaxRate"];

const WEX_FUEL_TX_KEYS = [
  "fuelCode",
  "fuel_code",
  "fuelType",
  "fuel_grade",
  "fuelGrade",
  "productCode",
  "commodityCode",
  "itemFuelType",
  "fuelProductCode",
];

const WEX_PRICE_KEYS = [
  "prixLitreTtc",
  "prix_litre_ttc",
  "unitPriceTtc",
  "unit_price_ttc",
  "pricePerLiterTtc",
  "pricePerLiter",
  "unitGrossPrice",
  "grossUnitPrice",
];

/**
 * Normalisation legacy transaction carburant : fusion `tx` + `details` + `lineItems`
 * avec tous les alias de champs WEX connus (transaction_ref, cardNumber, totalTransQuantity, etc.).
 * Sortie prête pour le mapping Prisma (`G2LTransactionCarburant`).
 */
export function normalizeTx(input: NormalizeTxInput): NormalizedTx {
  const tx = input.tx ?? null;
  const details = input.details ?? null;
  const lineItems = Array.isArray(input.lineItems) ? input.lineItems : null;

  const sources: NormalizedTx["sources"] = {
    volume: "none",
    amount_ht: "none",
    amount_ttc: "none",
    prix_litre_ttc: "none",
  };

  let volume_litres: number | null = null;
  if (lineItems) {
    let sum = 0;
    let found = false;
    for (const li of lineItems) {
      if (!isRecord(li)) continue;
      const q = pickNumber(li, WEX_VOLUME_LINE_KEYS);
      if (q !== null) {
        sum += q;
        found = true;
      }
    }
    if (found) {
      volume_litres = sum;
      sources.volume = "lineItems";
    }
  }
  if (volume_litres === null) {
    const q = pickNumber(details, WEX_VOLUME_DETAIL_KEYS);
    if (q !== null) {
      volume_litres = q;
      sources.volume = "details";
    }
  }
  if (volume_litres === null && tx) {
    const q = pickNumber(tx, WEX_VOLUME_TX_KEYS);
    if (q !== null) {
      volume_litres = q;
      sources.volume = "tx";
    }
  }

  let amount_ttc: number | null = pickNumber(tx, WEX_TTC_TX_KEYS);
  if (amount_ttc !== null && amount_ttc !== 0) sources.amount_ttc = "tx";
  if ((amount_ttc === null || amount_ttc === 0) && details) {
    const v = pickNumber(details, WEX_TTC_DETAIL_KEYS);
    if (v !== null && v !== 0) {
      amount_ttc = v;
      sources.amount_ttc = "details";
    }
  }
  if ((amount_ttc === null || amount_ttc === 0) && lineItems) {
    let sum = 0;
    let found = false;
    for (const li of lineItems) {
      if (!isRecord(li)) continue;
      const v = pickNumber(li, WEX_TTC_LINE_KEYS);
      if (v !== null) {
        sum += v;
        found = true;
      }
    }
    if (found) {
      amount_ttc = sum;
      sources.amount_ttc = "lineItems";
    }
  }

  let amount_ht: number | null = pickNumber(details, WEX_HT_DETAIL_KEYS);
  if (amount_ht !== null && amount_ht !== 0) sources.amount_ht = "details";
  if ((amount_ht === null || amount_ht === 0) && tx) {
    const v = pickNumber(tx, WEX_HT_TX_KEYS);
    if (v !== null && v !== 0) {
      amount_ht = v;
      sources.amount_ht = "tx";
    }
  }
  if ((amount_ht === null || amount_ht === 0) && lineItems) {
    let sum = 0;
    let found = false;
    for (const li of lineItems) {
      if (!isRecord(li)) continue;
      const v = pickNumber(li, WEX_HT_LINE_KEYS);
      if (v !== null) {
        sum += v;
        found = true;
      }
    }
    if (found) {
      amount_ht = sum;
      sources.amount_ht = "lineItems";
    }
  }

  const vat_rate =
    pickNumber(tx, WEX_VAT_KEYS) ?? pickNumber(details, WEX_VAT_KEYS) ?? 20;

  if ((amount_ht === null || amount_ht === 0) && amount_ttc !== null && vat_rate !== null) {
    amount_ht = computeHtFromTtc(amount_ttc, vat_rate);
    sources.amount_ht = "computed_vat";
  }

  if ((amount_ttc === null || amount_ttc === 0) && amount_ht !== null && vat_rate !== null) {
    const vat = computeVatFromHt(amount_ht, vat_rate);
    amount_ttc = roundCurrency(amount_ht + vat);
    sources.amount_ttc = "computed";
  }

  let prix_litre_ttc: number | null = null;
  if (amount_ttc !== null && volume_litres !== null && volume_litres > 0) {
    prix_litre_ttc = roundCurrency4(amount_ttc / volume_litres);
    sources.prix_litre_ttc = "computed";
  } else {
    const fromTx = pickNumber(tx, WEX_PRICE_KEYS);
    if (fromTx !== null) {
      prix_litre_ttc = fromTx;
      sources.prix_litre_ttc = "tx";
    } else if (details) {
      const fromDetails = pickNumber(details, WEX_PRICE_KEYS);
      if (fromDetails !== null) {
        prix_litre_ttc = fromDetails;
        sources.prix_litre_ttc = "details";
      }
    }
    if (
      (prix_litre_ttc === null || prix_litre_ttc === 0) &&
      lineItems &&
      volume_litres !== null &&
      volume_litres > 0
    ) {
      let sumTtc = 0;
      let sumHt = 0;
      let anyTtc = false;
      let anyHt = false;
      for (const li of lineItems) {
        if (!isRecord(li)) continue;
        const lt = pickNumber(li, WEX_TTC_LINE_KEYS);
        const lh = pickNumber(li, WEX_HT_LINE_KEYS);
        if (lt !== null) {
          sumTtc += lt;
          anyTtc = true;
        }
        if (lh !== null) {
          sumHt += lh;
          anyHt = true;
        }
      }
      const base = anyTtc ? sumTtc : anyHt ? sumHt + computeVatFromHt(sumHt, vat_rate) : null;
      if (base !== null && base > 0) {
        prix_litre_ttc = roundCurrency4(base / volume_litres);
        sources.prix_litre_ttc = "computed";
      }
    }
  }

  const fuel_code =
    pickString(tx, WEX_FUEL_TX_KEYS) ??
    pickString(details, WEX_FUEL_TX_KEYS) ??
    (lineItems
      ? (() => {
          for (const li of lineItems) {
            if (!isRecord(li)) continue;
            const c = pickString(li, WEX_FUEL_TX_KEYS);
            if (c) return c;
          }
          return null;
        })()
      : null);

  const transaction_ref =
    pickString(tx, [
      "transaction_ref",
      "transactionRef",
      "externalReference",
      "externalRef",
      "reference",
      "transactionReference",
    ]) ??
    pickString(details, [
      "transaction_ref",
      "transactionRef",
      "externalReference",
      "externalRef",
      "reference",
    ]) ??
    null;

  const cardFromTx = tx ? pickFirstRecord(tx, ["card"]) : null;
  const cardFromDetails = details ? pickFirstRecord(details, ["card"]) : null;
  const card_number =
    pickString(tx, ["cardNumber", "card_number", "pan", "maskedPan", "masked_pan"]) ??
    pickString(details, ["cardNumber", "card_number", "pan", "maskedPan"]) ??
    pickString(cardFromTx, ["number", "pan", "maskedPan", "cardNumber", "embossing"]) ??
    pickString(cardFromDetails, ["number", "pan", "maskedPan", "cardNumber", "embossing"]) ??
    null;

  return {
    volume_litres,
    prix_litre_ttc,
    amount_ttc,
    amount_ht,
    vat_rate,
    fuel_code,
    transaction_ref,
    card_number,
    sources,
  };
}

export function normalizeRegistration(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

function pickPlateFromUnknown(value: unknown): string | null {
  if (typeof value === "string") return normalizeRegistration(value);
  if (!isRecord(value)) return null;
  const direct =
    pickString(value, [
      "licensePlate",
      "license_plate",
      "vehiclePlate",
      "plate",
      "registration",
      "immatriculation",
      "vehicleRegistration",
      "regNumber",
    ]) ??
    (typeof value.licensePlate === "string" ? value.licensePlate : null) ??
    (typeof value.registration === "string" ? value.registration : null) ??
    (typeof value.plate === "string" ? value.plate : null) ??
    (typeof value.immatriculation === "string" ? value.immatriculation : null);
  if (direct) return normalizeRegistration(direct);
  return null;
}

function pickFirstRecord(
  raw: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const v = raw[key];
    if (isRecord(v)) return v;
  }
  return null;
}

function pickLinkedVehiclePlateFromPayload(raw: Record<string, unknown>): string | null {
  const linkedRoots = [
    raw.linked_vehicle_card,
    raw.linkedVehicleCard,
    raw.linked_vehicle,
    raw.linkedVehicle,
  ];
  for (const node of linkedRoots) {
    const p = pickPlateFromUnknown(node);
    if (p) return p;
  }
  const card = isRecord(raw.card) ? raw.card : null;
  if (card) {
    const nested = [
      card.linked_vehicle_card,
      card.linkedVehicleCard,
      card.linked_vehicle,
      card.linkedVehicle,
      card.vehicle,
      card.vehicule,
    ];
    for (const node of nested) {
      const p = pickPlateFromUnknown(node);
      if (p) return p;
    }
  }
  return null;
}

function pickPlateFromDetailsLike(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const direct = pickString(details, [
    "licensePlate",
    "license_plate",
    "vehiclePlate",
    "plate",
    "registration",
    "immatriculation",
    "vehicleRegistration",
    "regNumber",
  ]);
  if (direct) {
    const n = normalizeRegistration(direct);
    if (n) return n;
  }
  const vehicle = pickFirstRecord(details, ["vehicle", "vehicule", "truck", "asset"]);
  if (vehicle) {
    const nested = pickString(vehicle, [
      "plate",
      "licensePlate",
      "license_plate",
      "registration",
      "immatriculation",
    ]);
    if (nested) {
      const n = normalizeRegistration(nested);
      if (n) return n;
    }
  }
  return null;
}

function pickPlateFromTxLike(tx: Record<string, unknown> | null): string | null {
  if (!tx) return null;
  const direct = pickString(tx, [
    "licensePlate",
    "license_plate",
    "vehiclePlate",
    "plate",
    "registration",
    "immatriculation",
    "vehicleRegistration",
  ]);
  if (direct) {
    const n = normalizeRegistration(direct);
    if (n) return n;
  }
  const vehicle = pickFirstRecord(tx, ["vehicle", "vehicule", "truck", "asset"]);
  if (vehicle) {
    const nested = pickString(vehicle, [
      "plate",
      "licensePlate",
      "registration",
      "immatriculation",
    ]);
    if (nested) {
      const n = normalizeRegistration(nested);
      if (n) return n;
    }
  }
  return null;
}

/**
 * Hiérarchie plaque WEX (payload API seul) : carte liée (JSON) → détails → transaction → embossing.
 * Pour la priorité absolue « véhicule lié en base » (carte CRM), utiliser
 * `resolveWexLicensePlateForImport` côté service après chargement Prisma.
 */
export function resolveWexLicensePlatePriority(raw: unknown): RegistrationResolutionResult {
  if (!isRecord(raw)) {
    return { registration: null, source: "none" };
  }

  const linked = pickLinkedVehiclePlateFromPayload(raw);
  if (linked) return { registration: linked, source: "linked_vehicle_card" };

  const details = pickFirstRecord(raw, ["details", "transactionDetails", "detail"]);
  const detailsPlate = pickPlateFromDetailsLike(details);
  if (detailsPlate) return { registration: detailsPlate, source: "details_licensePlate" };

  const tx = pickFirstRecord(raw, ["tx", "transaction"]);
  const txPlate = pickPlateFromTxLike(tx);
  if (txPlate) return { registration: txPlate, source: "tx_licensePlate" };

  const card = isRecord(raw.card) ? raw.card : null;
  const embossingStr =
    (card ? pickString(card, ["embossing", "embossingLine", "cardEmbossing"]) : null) ??
    pickString(raw, ["cardEmbossing", "embossing"]);
  const embossing = embossingStr ? normalizeRegistration(embossingStr) : null;
  if (embossing) return { registration: embossing, source: "card_embossing" };

  return { registration: null, source: "none" };
}

/**
 * Résolution finale import : **véhicule lié à la carte en base** > payload WEX (`resolveWexLicensePlatePriority`).
 */
export function resolveWexLicensePlateForImport(
  raw: unknown,
  linkedPlateFromDb: string | null
): RegistrationResolutionResult {
  const normalizedDb = linkedPlateFromDb ? normalizeRegistration(linkedPlateFromDb) : null;
  if (normalizedDb) {
    return { registration: normalizedDb, source: "linked_vehicle_card" };
  }
  return resolveWexLicensePlatePriority(raw);
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundCurrency4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function computeVatFromTtc(amountTtc: number, vatRate: number): number {
  if (vatRate <= 0) return 0;
  return roundCurrency((amountTtc * vatRate) / (100 + vatRate));
}

export function computeHtFromTtc(amountTtc: number, vatRate: number): number {
  const vat = computeVatFromTtc(amountTtc, vatRate);
  return roundCurrency(amountTtc - vat);
}

function computeVatFromHt(amountHt: number, vatRate: number): number {
  if (vatRate <= 0) return 0;
  return roundCurrency((amountHt * vatRate) / 100);
}

export function computeRecoverableVat(
  fuelCode: string | null | undefined,
  vatAmount: number
): number {
  if (!fuelCode) return 0;
  const normalized = fuelCode.toUpperCase();
  const ratio = GAZOLE_CODES.has(normalized) ? 0.8 : 1;
  return roundCurrency(vatAmount * ratio);
}

/**
 * Remboursement TICPE : (volume_litres * taux_cents) / 100  -> euros
 */
export function calculateTicpeRemboursement(
  volume_litres: number,
  taux_cents: number | null
): number {
  if (!volume_litres || taux_cents === null || taux_cents === undefined) return 0;
  return roundCurrency((volume_litres * taux_cents) / 100);
}

export function computeFuelFinancials(input: FinancialComputationInput) {
  const amountVat = computeVatFromTtc(input.amountTtc, input.vatRate);
  const amountHt = computeHtFromTtc(input.amountTtc, input.vatRate);
  const amountVatRecoverable = computeRecoverableVat(input.fuelCode, amountVat);
  const amountTicpe = calculateTicpeRemboursement(
    input.volumeLiters ?? 0,
    input.ticpeTauxCents ?? null
  );

  return {
    amountHt,
    amountVat,
    amountVatRecoverable,
    amountTicpe,
  };
}

export function selectTicpeRateForTransaction(
  rows: TicpeTauxRow[],
  input: {
    transaction_date: Date;
    carburant_code: string;
    region_code?: string | null;
  }
): number | null {
  const code = input.carburant_code.toUpperCase();
  const tx = input.transaction_date.getTime();

  const candidates = rows.filter((row) => {
    if (row.carburant_code.toUpperCase() !== code) return false;
    if (row.date_debut.getTime() > tx) return false;
    if (row.date_fin && row.date_fin.getTime() < tx) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  const region = input.region_code?.toUpperCase() ?? null;
  const preferred = candidates.filter(
    (row) => !region || (row.region_code && row.region_code.toUpperCase() === region)
  );

  const pool = preferred.length > 0 ? preferred : candidates;
  pool.sort((a, b) => b.date_debut.getTime() - a.date_debut.getTime());
  return pool[0]?.taux_cents ?? null;
}
