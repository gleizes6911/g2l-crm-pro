import { useState, useEffect } from 'react'
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import API_BASE from '../../../config/api'
import { useDrill } from '../DrillDownSystem'
import DrillFinanceChargeur from './DrillFinanceChargeur'

const formatEuro = (v) => {
  if (!v && v !== 0) return '—'
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(2)}M €`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k €`
  return `${v.toLocaleString('fr-FR')} €`
}

export default function DrillFinanceEntite({ societe, societeId }) {
  const { push } = useDrill()
  const [chargeurs, setChargeurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [rentaMap, setRentaMap] = useState({})

  useEffect(() => {
    fetch(`${API_BASE}/api/dashboard-groupe/fec-chargeurs/${societeId}`)
      .then((r) => r.json())
      .then((d) => setChargeurs(d.chargeurs || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [societeId])

  useEffect(() => {
    if (!societeId) return
    fetch(`${API_BASE}/api/dashboard-groupe/rentabilite-chargeurs?societeId=${societeId}`)
      .then((r) => r.json())
      .then((d) => {
        const map = {}
        d.chargeurs?.forEach((c) => {
          map[c.nom] = c
        })
        setRentaMap(map)
      })
      .catch(console.error)
  }, [societeId])

  const caTotal = chargeurs.reduce((s, c) => s + c.ca, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'CA Total', value: formatEuro(societe?.ca) },
          { label: 'Marge', value: `${societe?.marge || 0}%` },
          { label: 'Nb chargeurs', value: chargeurs.length },
        ].map(({ label, value }) => (
          <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
            <p className="text-[18px] font-bold text-[var(--color-ink)]">{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          CA par chargeur · Cliquez pour voir les écritures FEC
        </p>
        <div className="space-y-1.5">
          {chargeurs.map((c, i) => {
            const mois = c.parMois || []
            const tendance = mois.length >= 2 ? mois[mois.length - 1].ca - mois[mois.length - 2].ca : 0
            const renta = rentaMap[c.nom]
            return (
              <button
                key={c.nom}
                type="button"
                onClick={() => push({
                  title: c.nom,
                  subtitle: `${societe?.nom} · Comptes ${c.comptes?.join(', ')} · ${c.nbEcritures} écritures`,
                  component: DrillFinanceChargeur,
                  props: { chargeur: c, societeId, societenom: societe?.nom },
                })}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: `hsl(${i * 47}, 65%, 50%)` }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)]">{c.nom}</p>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono">
                    {c.nbEcritures} écritures · {c.parMois?.length || 0} mois
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!renta && tendance !== 0 && (
                    <div className={`flex items-center gap-1 text-[11px] ${tendance > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {tendance > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {formatEuro(Math.abs(tendance))}
                    </div>
                  )}
                  <span className="text-[13px] font-semibold text-[var(--color-ink)]">{formatEuro(c.ca)}</span>
                  <div className="flex flex-col items-end min-w-[4.5rem]">
                    {renta ? (
                      <>
                        <span
                          className={`text-[11px] font-bold ${
                            renta.tauxMarge >= 15
                              ? 'text-[var(--color-success)]'
                              : renta.tauxMarge >= 5
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-danger)]'
                          }`}
                        >
                          {renta.tauxMarge}%
                        </span>
                        <span className="text-[8px] text-[var(--color-muted)] font-mono uppercase tracking-wide leading-tight">
                          marge réelle
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-[var(--color-muted)] font-mono">
                        {caTotal > 0 ? `${((c.ca / caTotal) * 100).toFixed(1)}%` : '—'}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)] transition-colors" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
