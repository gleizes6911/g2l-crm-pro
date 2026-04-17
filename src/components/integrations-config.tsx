import type { ReactNode } from "react";
import Link from "next/link";

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        connected
          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400 dark:ring-emerald-500/40"
          : "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/40"
      }`}
    >
      {connected ? "Connecté" : "Non configuré"}
    </span>
  );
}

function ConfigSection({
  title,
  description,
  connected,
  children,
}: {
  title: string;
  description: string;
  connected: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <ConnectionBadge connected={connected} />
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function DetailLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <span
        className={`inline-block size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{ok ? "défini" : "manquant"}</span>
    </p>
  );
}

/**
 * Écran de configuration des intégrations (WEX Fleet, Webfleet, Salesforce).
 */
export function IntegrationsConfig() {
  const wexBase = Boolean(process.env.WEX_API_BASE_URL?.trim());
  const wexId = Boolean(process.env.WEX_CLIENT_ID?.trim());
  const wexSecret = Boolean(process.env.WEX_CLIENT_SECRET?.trim());
  const wexConnected = wexBase && wexId && wexSecret;

  const webfleetKey = Boolean(
    process.env.WEBFLEET_API_KEY?.trim() ?? process.env.WEBFLEET_API_URL?.trim()
  );

  const salesforceUrl = Boolean(
    process.env.SALESFORCE_INSTANCE_URL ?? process.env.SALESFORCE_LOGIN_URL
  );
  const salesforceClient = Boolean(
    process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET
  );
  const salesforceConnected = salesforceUrl && salesforceClient;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration des intégrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Variables chargées depuis <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>{" "}
          ou <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> (priorité) au
          démarrage du serveur. L&apos;API métier héritée est proxifiée via{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">API_UPSTREAM</code> (défaut{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">127.0.0.1:3001</code>).
        </p>
        <p className="mt-3">
          <Link
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Retour au tableau de bord (app legacy)
          </Link>
        </p>
      </header>

      <ConfigSection
        title="WEX Fleet"
        description="API carburant et transactions — FleetService (import, login, recherche)."
        connected={wexConnected}
      >
        <DetailLine ok={wexBase} label="WEX_API_BASE_URL" />
        <DetailLine ok={wexId} label="WEX_CLIENT_ID" />
        <DetailLine ok={wexSecret} label="WEX_CLIENT_SECRET" />
      </ConfigSection>

      <ConfigSection
        title="Webfleet"
        description="Télématique / trajets — clé API pour les appels Webfleet."
        connected={webfleetKey}
      >
        <DetailLine ok={webfleetKey} label="WEBFLEET_API_KEY (ou WEBFLEET_API_URL)" />
      </ConfigSection>

      <ConfigSection
        title="Salesforce"
        description="Synchronisation des identifiants métier (champs salesforce_id en base)."
        connected={salesforceConnected}
      >
        <DetailLine ok={salesforceUrl} label="SALESFORCE_INSTANCE_URL ou SALESFORCE_LOGIN_URL" />
        <DetailLine
          ok={Boolean(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET)}
          label="SALESFORCE_CLIENT_ID + SALESFORCE_CLIENT_SECRET"
        />
      </ConfigSection>

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Historique des imports WEX / Webfleet</p>
        <Link
          href="/admin/imports"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ouvrir la page Historique des imports →
        </Link>
      </div>
    </main>
  );
}
