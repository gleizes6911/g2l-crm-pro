import { useState, useEffect } from 'react'
import { useDrill } from '../DrillDownSystem'
import DrillRhSociete from './DrillRhSociete'
import { ChevronRight, AlertTriangle, Clock } from 'lucide-react'
import API_BASE from '../../../config/api'

export default function DrillRhGroupe() {
  const { push } = useDrill()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/employes/statistiques/rh`)
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) return null

  const societes = [
    { nom: 'D & J transport', label: 'D&J TRANSPORT', nb: stats.repartitionSociete?.['D & J transport'] || 0, color: '#2563EB' },
    { nom: 'TPS TSMC EXPRESS', label: 'TPS TSMC EXPRESS', nb: stats.repartitionSociete?.['TPS TSMC EXPRESS'] || 0, color: '#0d9488' },
    { nom: 'HOLDING G2L', label: 'HOLDING G2L', nb: stats.repartitionSociete?.['HOLDING G2L'] || 0, color: '#7c3aed' },
  ]

  const contrats = [
    { label: 'CDI', nb: stats.repartitionContrat?.CDI || 0, color: '#059669' },
    { label: 'CDD', nb: stats.repartitionContrat?.CDD || 0, color: '#d97706' },
    { label: 'Autre', nb: stats.repartitionContrat?.Autre || 0, color: '#6b7280' },
  ]

  const actifsDenom = stats.actifs > 0 ? stats.actifs : 1

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Effectif actif', value: stats.actifs },
          {
            label: 'En période essai',
            value: stats.enPeriodeEssai,
            color: stats.enPeriodeEssai > 0 ? 'text-[var(--color-warning)]' : undefined,
          },
          { label: 'Total historique', value: stats.effectifTotal },
        ].map(({ label, value, color = 'text-[var(--color-ink)]' }) => (
          <div
            key={label}
            className="text-center p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)]"
          >
            <p className={`text-[22px] font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-1">
              {label}
            </p>
          </div>
        ))}
      </div>

      {(stats.finsPeriodeEssai7j > 0 || stats.cddAFinir30j > 0 || stats.enPeriodeEssai > 0) && (
        <div className="space-y-2">
          {stats.enPeriodeEssai > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-[var(--color-warning-bg)] rounded-[var(--radius-sm)] border border-[var(--color-warning-border)]">
              <Clock size={13} className="text-[var(--color-warning)] shrink-0" />
              <span className="text-[11px] text-[var(--color-warning)] font-mono">
                {stats.enPeriodeEssai} salarié(s) en période d&apos;essai en cours
              </span>
            </div>
          )}
          {stats.finsPeriodeEssai7j > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-[var(--color-danger-bg)] rounded-[var(--radius-sm)] border border-[var(--color-danger-border)]">
              <AlertTriangle size={13} className="text-[var(--color-danger)] shrink-0" />
              <span className="text-[11px] text-[var(--color-danger)] font-mono">
                {stats.finsPeriodeEssai7j} fin(s) de période d&apos;essai dans les 7 jours
              </span>
            </div>
          )}
          {stats.cddAFinir30j > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-[var(--color-warning-bg)] rounded-[var(--radius-sm)] border border-[var(--color-warning-border)]">
              <AlertTriangle size={13} className="text-[var(--color-warning)] shrink-0" />
              <span className="text-[11px] text-[var(--color-warning)] font-mono">
                {stats.cddAFinir30j} CDD se terminant dans les 30 jours
              </span>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Répartition par type de contrat
        </p>
        <div className="flex items-center gap-2 mb-2">
          {contrats.map((c) => (
            <div key={c.label} className="flex items-center gap-1.5 flex-1">
              <div
                className="h-6 rounded-[var(--radius-sm)] flex items-center justify-center text-[10px] text-white font-bold font-mono"
                style={{
                  background: c.color,
                  width: `${(c.nb / actifsDenom) * 100}%`,
                  minWidth: c.nb > 0 ? '32px' : '0',
                }}
              >
                {c.nb > 0 ? c.nb : ''}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {contrats.map((c) => (
            <div key={c.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
              <span className="text-[11px] text-[var(--color-muted)] font-mono">
                {c.label}
                {' '}
                (
                {c.nb}
                )
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Effectif par entité · Cliquez pour la liste des employés
        </p>
        <div className="space-y-1.5">
          {societes.map((s) => (
            <button
              key={s.nom}
              type="button"
              onClick={() => push({
                title: s.label,
                subtitle: `${s.nb} employé(s) actif(s) · Source Salesforce`,
                component: DrillRhSociete,
                props: { societeNom: s.nom, societeLabel: s.label, color: s.color },
              })}
              className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: s.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-ink)]">{s.label}</p>
                <p className="text-[10px] text-[var(--color-muted)] font-mono">
                  {s.nb} actifs
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-32 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${stats.actifs > 0 ? (s.nb / stats.actifs) * 100 : 0}%`,
                      background: s.color,
                    }}
                  />
                </div>
                <span className="text-[11px] text-[var(--color-muted)] font-mono w-8 text-right">
                  {stats.actifs > 0
                    ? `${((s.nb / stats.actifs) * 100).toFixed(0)}%`
                    : '—'}
                </span>
                <ChevronRight
                  size={14}
                  className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)] transition-colors"
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
