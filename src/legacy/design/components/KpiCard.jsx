import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

/**
 * KpiCard — Composant unifié pour tous les KPIs du dashboard G2L
 * Inspiré Finary : sobre, dense, lisible
 *
 * Props :
 * - label      : string  — libellé du KPI (ex: "Chiffre d'affaires")
 * - value      : string  — valeur formatée (ex: "571k €")
 * - variation  : number  — % de variation (ex: -12.5 ou +8.3)
 * - variationLabel : string — contexte variation (ex: "vs 2025")
 * - status     : 'default' | 'success' | 'warning' | 'danger'
 * - icon       : ReactNode — icône Lucide optionnelle
 * - subtitle   : string  — ligne secondaire optionnelle
 * - onClick    : fn      — rend la card cliquable
 */
export default function KpiCard({
  label,
  value,
  variation,
  variationLabel,
  status = 'default',
  icon,
  subtitle,
  onClick
}) {
  const hasVariation = variation !== undefined && variation !== null

  const variationColor = !hasVariation ? '' :
    variation > 0 ? 'text-[var(--color-success)]' :
    variation < 0 ? 'text-[var(--color-danger)]' :
    'text-[var(--color-muted)]'

  const VariationIcon = !hasVariation ? null :
    variation > 0 ? TrendingUp :
    variation < 0 ? TrendingDown :
    Minus

  const statusBorder = {
    default: 'border-[var(--color-border)]',
    success: 'border-l-4 border-l-[var(--color-success)] border-[var(--color-border)]',
    warning: 'border-l-4 border-l-[var(--color-warning)] border-[var(--color-border)]',
    danger:  'border-l-4 border-l-[var(--color-danger)]  border-[var(--color-border)]',
  }[status]

  return (
    <div
      className={`
        bg-[var(--color-surface)] border rounded-[var(--radius-md)]
        p-4 flex flex-col gap-2
        shadow-[var(--shadow-sm)]
        ${statusBorder}
        ${onClick ? 'cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors duration-[var(--transition)]' : ''}
      `}
      onClick={onClick}
    >
      {/* Label + icône */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--text-xs)] font-medium tracking-wider uppercase text-[var(--color-muted)] font-mono">
          {label}
        </span>
        {icon && (
          <span className="text-[var(--color-faint)]">
            {icon}
          </span>
        )}
      </div>

      {/* Valeur principale */}
      <div className="text-[var(--text-xl)] font-bold leading-none text-[var(--color-ink)] tracking-tight">
        {value}
      </div>

      {/* Ligne inférieure : variation + subtitle */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        {hasVariation && (
          <div className={`flex items-center gap-1 text-[var(--text-xs)] font-medium ${variationColor}`}>
            {VariationIcon && <VariationIcon size={12} />}
            <span>{variation > 0 ? '+' : ''}{variation.toFixed(1)}%</span>
            {variationLabel && (
              <span className="text-[var(--color-faint)] font-normal ml-1">{variationLabel}</span>
            )}
          </div>
        )}
        {subtitle && !hasVariation && (
          <span className="text-[var(--text-xs)] text-[var(--color-muted)]">{subtitle}</span>
        )}
      </div>
    </div>
  )
}
