import { useState, useEffect } from 'react'
import { useDrill } from '../DrillDownSystem'
import DrillRhEmploye from './DrillRhEmploye'
import { ChevronRight, Search } from 'lucide-react'
import API_BASE from '../../../config/api'

const BADGES_CONTRAT = {
  CDI: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  CDD: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  Autre: { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
}

export default function DrillRhSociete({ societeNom, societeLabel, color }) {
  const { push } = useDrill()
  const [employes, setEmployes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/employes`)
      .then((r) => r.json())
      .then((d) => {
        const actifs = (d.employes || []).filter((e) =>
          e.estActif &&
          (e.societe === societeNom ||
            (e.societe && e.societe.toLowerCase().includes(societeNom.toLowerCase()))),
        )
        setEmployes(actifs)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [societeNom])

  const filtered = employes.filter((e) =>
    !search ||
    e.nomComplet?.toLowerCase().includes(search.toLowerCase()) ||
    e.fonction?.toLowerCase().includes(search.toLowerCase()) ||
    e.service?.toLowerCase().includes(search.toLowerCase()),
  )

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
          { label: 'Effectif actif', value: employes.length },
          { label: 'CDI', value: employes.filter((e) => e.typeContrat === 'CDI').length },
          {
            label: 'CDD / Autre',
            value: employes.filter((e) => e.typeContrat !== 'CDI').length,
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]"
          >
            <p className="text-[18px] font-bold text-[var(--color-ink)]">{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]"
        />
        <input
          type="text"
          placeholder="Rechercher un employé, fonction, service..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-[12px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
        />
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
          {filtered.length} employé(s) · Cliquez pour la fiche
        </p>
        <div className="space-y-1 max-h-[450px] overflow-y-auto">
          {filtered.map((e) => {
            const badge = BADGES_CONTRAT[e.typeContrat] || BADGES_CONTRAT.Autre
            const anciennete = e.dateEntree
              ? Math.floor((Date.now() - new Date(e.dateEntree).getTime()) / (1000 * 60 * 60 * 24 * 365))
              : null

            return (
              <button
                key={e.id}
                type="button"
                onClick={() => push({
                  title: e.nomComplet,
                  subtitle: `${e.fonction || 'Sans fonction'} · ${societeLabel}`,
                  component: DrillRhEmploye,
                  props: { employe: e, societeLabel, color },
                })}
                className="w-full flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ background: color }}
                >
                  {(e.prenom?.[0] || '') + (e.nom?.[0] || '')}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[var(--color-ink)] truncate">
                    {e.nomComplet}
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono truncate">
                    {e.fonction || '—'} · {e.service || '—'}
                    {anciennete !== null && ` · ${anciennete}an${anciennete > 1 ? 's' : ''}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                    style={{
                      background: badge.bg,
                      color: badge.text,
                      borderColor: badge.border,
                    }}
                  >
                    {e.typeContrat || '?'}
                  </span>
                  <ChevronRight
                    size={13}
                    className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)] transition-colors"
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
