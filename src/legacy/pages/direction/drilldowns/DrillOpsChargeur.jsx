import { useState, useEffect } from 'react'
import { useDrill } from '../DrillDownSystem'
import DrillOdsDetail from './DrillOdsDetail'
import { ChevronRight } from 'lucide-react'
import API_BASE from '../../../config/api'

const COULEURS_TAUX = (taux) =>
  taux >= 97 ? 'text-[var(--color-success)]' :
  taux >= 90 ? 'text-[var(--color-warning)]' :
  'text-[var(--color-danger)]'

export default function DrillOpsChargeur({
  chargeurNom, dateDebut, dateFin, chargeurs,
}) {
  const { push } = useDrill()
  const [tournees, setTournees] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(
    chargeurNom === 'tous' ? null : chargeurNom,
  )

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    const encoded = encodeURIComponent(selected)
    fetch(`${API_BASE}/api/direction/detail-chargeur/${encoded}?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`)
      .then((r) => r.json())
      .then((d) => setTournees(d.tournees || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selected, dateDebut, dateFin])

  // ── VUE LISTE CHARGEURS (si mode 'tous') ──────────────────
  if (!selected) {
    const liste = chargeurs || []
    const totalPec = liste.reduce((s, c) => s + (c.colisPec || 0), 0)
    const totalLiv = liste.reduce((s, c) => s + (c.colisLivres || 0), 0)
    const tauxGlobal = totalPec > 0
      ? ((totalLiv / totalPec) * 100).toFixed(1) : 0

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Chargeurs actifs', value: liste.length },
            { label: 'Colis traités', value: totalPec.toLocaleString('fr-FR') },
            { label: 'Taux livraison', value: `${tauxGlobal}%` },
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

        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
            Performance par chargeur · Cliquez pour le détail tournées
          </p>
          <div className="space-y-1.5">
            {liste.map((c) => {
              const taux = c.colisPec > 0
                ? ((c.colisLivres / c.colisPec) * 100).toFixed(1)
                : 0
              return (
                <button
                  key={c.nom}
                  type="button"
                  onClick={() => setSelected(c.nom)}
                  className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--color-ink)]">
                      {c.nom}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted)] font-mono">
                      {(c.colisPec || 0).toLocaleString()} PEC ·{' '}
                      {(c.colisLivres || 0).toLocaleString()} livrés ·{' '}
                      {(c.nbTournees || c.nbOds || 0)} tournées
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(parseFloat(taux), 100)}%`,
                          background: parseFloat(taux) >= 97 ? 'var(--color-success)' :
                            parseFloat(taux) >= 90 ? 'var(--color-warning)' :
                              'var(--color-danger)',
                        }}
                      />
                    </div>
                    <span className={`text-[13px] font-bold w-12 text-right ${COULEURS_TAUX(parseFloat(taux))}`}>
                      {taux}
                      %
                    </span>
                    <ChevronRight
                      size={14}
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totalPec = tournees.reduce((s, t) => s + (t.colisPec || 0), 0)
  const totalLiv = tournees.reduce((s, t) => s + (t.colisLivres || 0), 0)
  const tauxGlobal = totalPec > 0
    ? ((totalLiv / totalPec) * 100).toFixed(1) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Tournées', value: tournees.length },
          { label: 'Colis PEC', value: totalPec.toLocaleString('fr-FR') },
          { label: 'Livrés', value: totalLiv.toLocaleString('fr-FR') },
          { label: 'Taux global', value: `${tauxGlobal}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]"
          >
            <p className="text-[16px] font-bold text-[var(--color-ink)]">{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Tournées {selected} · {dateDebut} → {dateFin}
          · Cliquez pour le détail par jour
        </p>
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {tournees.map((t, i) => {
            const taux = t.colisPec > 0
              ? ((t.colisLivres / t.colisPec) * 100).toFixed(1) : 0
            return (
              <button
                key={t.nom || i}
                type="button"
                onClick={() => push({
                  title: `Tournée ${t.nom}`,
                  subtitle: `${selected} · ${t.societe} · ${t.nbJours} jour(s)`,
                  component: DrillOdsDetail,
                  props: { tournee: t, chargeurNom: selected },
                })}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-[var(--color-ink)]">
                      Tournée {t.nom}
                    </p>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
                      {t.societe?.includes('TPS') ? 'TPS' : 'D&J'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono mt-0.5">
                    {t.nbJours}
                    j · {t.chauffeurs} · {(t.colisPec || 0).toLocaleString()} colis
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[11px] text-[var(--color-ink)]">
                      {(t.colisLivres || 0).toLocaleString()} livrés
                    </p>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {(t.colisRetour || 0)}
                      {' '}
                      retours
                    </p>
                  </div>
                  <span className={`text-[13px] font-bold w-12 text-right ${COULEURS_TAUX(parseFloat(taux))}`}>
                    {taux}
                    %
                  </span>
                  <ChevronRight
                    size={14}
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
