import { AlertCircle, CheckCircle, Inbox } from "lucide-react";

import { AuditMetadataDialog } from "@/components/audit/audit-metadata-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditPagination } from "@/components/audit/audit-pagination";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export type AuditTableSearchParams = {
  page?: string;
  provider?: string;
  search?: string;
};

function getComputed(metadata: unknown): {
  consommation_estimee_litres: number | null;
  recuperation_tva: number | null;
  remboursement_ticpe: number | null;
} {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return {
      consommation_estimee_litres: null,
      recuperation_tva: null,
      remboursement_ticpe: null,
    };
  }
  const computed = (metadata as Record<string, unknown>).computed;
  if (typeof computed !== "object" || computed === null || Array.isArray(computed)) {
    return {
      consommation_estimee_litres: null,
      recuperation_tva: null,
      remboursement_ticpe: null,
    };
  }
  const c = computed as Record<string, unknown>;
  const consommation_estimee_litres =
    typeof c.consommation_estimee_litres === "number" ? c.consommation_estimee_litres : null;
  const recuperation_tva = typeof c.recuperation_tva === "number" ? c.recuperation_tva : null;
  const remboursement_ticpe = typeof c.remboursement_ticpe === "number" ? c.remboursement_ticpe : null;
  return { consommation_estimee_litres, recuperation_tva, remboursement_ticpe };
}

function getProvider(metadata: unknown): "wex" | "webfleet" | "unknown" {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return "unknown";
  }

  const value = (metadata as Record<string, unknown>).provider;
  if (value === "wex" || value === "webfleet") {
    return value;
  }
  return "unknown";
}

function formatMetric(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function normalizePage(page?: string): number {
  const parsed = Number(page);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export async function AuditTable({ searchParams }: { searchParams: AuditTableSearchParams }) {
  const page = normalizePage(searchParams.page);
  const providerFilter =
    searchParams.provider === "wex" || searchParams.provider === "webfleet"
      ? searchParams.provider
      : undefined;
  const search = searchParams.search?.trim();

  const where = {
    ...(providerFilter
      ? {
          metadata: {
            path: ["provider"],
            equals: providerFilter,
          },
        }
      : {}),
    ...(search
      ? {
          user: {
            email: {
              contains: search,
              mode: "insensitive" as const,
            },
          },
        }
      : {}),
  };

  const [logs, totalCount] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { timestamp: "desc" },
      include: {
        user: {
          select: {
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{totalCount} imports trouves</p>
        <p className="text-sm text-muted-foreground">
          Affichage {rangeStart}-{rangeEnd}
        </p>
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Consommation estimee (L)</TableHead>
              <TableHead>Recuperation TVA</TableHead>
              <TableHead>Remboursement TICPE</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead className="text-right">JSON</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Inbox className="size-5" />
                    <p>Aucun import ne correspond a vos criteres.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const provider = getProvider(log.metadata);
                const isKnownProvider = provider !== "unknown";
                const computed = getComputed(log.metadata);

                return (
                  <TableRow key={log.id}>
                    <TableCell>{formatDate(log.timestamp)}</TableCell>
                    <TableCell className="font-medium">{log.action}</TableCell>
                    <TableCell>
                      <Badge variant={isKnownProvider ? "secondary" : "outline"}>
                        {isKnownProvider ? <CheckCircle /> : <AlertCircle />}
                        {provider}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatMetric(computed.consommation_estimee_litres)}</TableCell>
                    <TableCell>{formatMetric(computed.recuperation_tva)}</TableCell>
                    <TableCell>{formatMetric(computed.remboursement_ticpe)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{log.user.email}</span>
                        <span className="text-xs text-muted-foreground">{log.user.role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <AuditMetadataDialog action={log.action} metadata={log.metadata} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <AuditPagination page={page} totalPages={totalPages} />
    </div>
  );
}
