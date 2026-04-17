import { ChevronRight } from 'lucide-react'
import { StatusBadge } from '../../../design'
import { useDrill } from '../DrillDownSystem'
import DrillFinanceEntite from './DrillFinanceEntite'

const formatEuro = (v) => {
  if (!v && v !== 0) return '—'
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(2)}M €`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k €`
  return `${v.toLocaleString('fr-FR')} €`
}

export default function DrillFinanceGroupe({ finance }) {
  const { push } = useDrill()

  if (!finance?.societes?.length) {
    return (
      <div className="text-center py-12 text-[var(--color-muted)]">
        <p className="text-[13px]">Importez un FEC pour voir le détail financier</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'CA Groupe', value: formatEuro(finance.totaux?.ca) },
          { label: 'Charges', value: formatEuro(finance.totaux?.charges) },
          {
            label: 'Résultat',
            value: formatEuro(finance.totaux?.resultat),
            color: finance.totaux?.resultat >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
          },
        ].map(({ label, value, color = 'text-[var(--color-ink)]' }) => (
          <div key={label} className="text-center p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
            <p className={`text-[22px] font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Structure des charges groupe
        </p>
        <div className="space-y-2">
          {finance.structureCharges?.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
              <span className="text-[12px] text-[var(--color-ink)] flex-1">{item.name}</span>
              <span className="text-[12px] font-semibold text-[var(--color-ink)]">{formatEuro(item.value)}</span>
              <span className="text-[10px] text-[var(--color-muted)] font-mono w-10 text-right">
                {finance.totaux?.charges > 0 ? `${((item.value / finance.totaux.charges) * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Détail par entité — cliquez pour explorer
        </p>
        <div className="space-y-1.5">
          {finance.societes?.map((s, i) => (
            <button
              key={s.nom}
              type="button"
              onClick={() => push({
                title: s.nom,
                subtitle: `Détail financier · Données FEC · SIREN ${s.siren}`,
                component: DrillFinanceEntite,
                props: { societe: s, societeId: s.societeId },
              })}
              className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ['#2563EB', '#0d9488', '#7c3aed'][i] || '#999' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-ink)] truncate">{s.nom}</p>
                <p className="text-[10px] text-[var(--color-muted)] font-mono">
                  {s.nbEcritures?.toLocaleString('fr-FR')} écritures FEC
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-[var(--color-ink)]">{formatEuro(s.ca)}</p>
                  <p className={`text-[11px] font-bold ${
                    s.marge >= 8 ? 'text-[var(--color-success)]' : s.marge >= 4 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'
                  }`}>{s.marge}% marge</p>
                </div>
                <StatusBadge
                  label={s.marge >= 8 ? 'Excellent' : s.marge >= 4 ? 'Correct' : 'Vigilance'}
                  variant={s.marge >= 8 ? 'success' : s.marge >= 4 ? 'warning' : 'danger'}
                />
                <ChevronRight size={14} className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)] transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
