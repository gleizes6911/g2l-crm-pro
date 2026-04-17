import { RefreshCcw } from "lucide-react";

import { AuditFilters } from "@/components/audit/audit-filters";
import { AuditTable } from "@/components/audit/audit-table";
import { ExportButton } from "@/components/audit/export-button";
import { Button } from "@/components/ui/button";

type ImportsPageProps = {
  searchParams: Promise<{
    page?: string;
    provider?: string;
    search?: string;
  }>;
};

export default async function AdminImportsPage({ searchParams }: ImportsPageProps) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historique des Imports</h1>
          <p className="text-sm text-muted-foreground">
            Suivi des 20 derniers imports WEX/Webfleet et de leurs metadonnees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton />
          <Button
            variant="outline"
            render={
              <a href="/admin/imports">
                <RefreshCcw />
                Rafraichir
              </a>
            }
          />
        </div>
      </header>

      <AuditFilters provider={params.provider} search={params.search} />
      <AuditTable searchParams={params} />
    </main>
  );
}
