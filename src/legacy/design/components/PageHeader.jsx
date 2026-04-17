/**
 * PageHeader — En-tête unifié pour toutes les pages G2L
 *
 * Props :
 * - title     : string  — titre de la page
 * - subtitle  : string  — description optionnelle
 * - actions   : ReactNode — boutons/filtres à droite
 * - breadcrumb : string[] — fil d'ariane optionnel
 * - icon       : LucideIcon — icône optionnelle à gauche du titre
 */
export default function PageHeader({ title, subtitle, actions, breadcrumb, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 pb-5 border-b border-[var(--color-border)]">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
            aria-hidden
          >
            <Icon size={20} strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-[var(--color-faint)] text-xs">/</span>}
                <span className="text-[var(--text-xs)] text-[var(--color-muted)] uppercase tracking-wider font-mono">
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        )}
        <h1 className="text-[var(--text-xl)] font-semibold text-[var(--color-ink)] leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[var(--text-sm)] text-[var(--color-muted)]">
            {subtitle}
          </p>
        )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
