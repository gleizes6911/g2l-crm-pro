import { Fragment, useMemo, useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import API_BASE from '../../../config/api'
import { useDrill } from '../DrillDownSystem'
import DrillFecEcritures from './DrillFecEcritures'

const formatEuro = (v) => {
  if (!v && v !== 0) return '—'
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k €`
  return `${v.toLocaleString('fr-FR')} €`
}

function formatMois(mois) {
  // mois = '2026-01' ou '01' (juste MM depuis chartData)
  if (!mois) return mois

  // Si format YYYY-MM
  if (mois.includes('-') && mois.length === 7) {
    const [annee, m] = mois.split('-')
    const date = new Date(parseInt(annee, 10), parseInt(m, 10) - 1, 1)
    return date.toLocaleDateString('fr-FR', {
      month: 'short',
      year: 'numeric',
    })
  }

  // Si format MM seulement (depuis evolutionChart)
  const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  const idx = parseInt(mois, 10) - 1
  return moisNoms[idx] !== undefined ? moisNoms[idx] : mois
}

function moisKey(row) {
  return String(row.moisISO ?? row.mois ?? '').trim()
}

export default function DrillFinanceChargeur({ chargeur, societeId, societenom }) {
  const { push } = useDrill()
  const [renta, setRenta] = useState(null)
  const [loadingRenta, setLoadingRenta] = useState(true)
  const [expanded, setExpanded] = useState(null)

  /** Ligne série : moisISO = toujours YYYY-MM (API / drill). Affichage = formatMois(moisISO) uniquement. */
  const series = useMemo(
    () =>
      (chargeur.parMois || [])
        .map((row) => ({
          moisISO: String(row.moisISO ?? row.mois ?? '').trim(),
          ca: row.ca,
        }))
        .filter((r) => /^\d{4}-\d{2}$/.test(r.moisISO)),
    [chargeur.parMois],
  )

  const parMoisPeriodeSig = useMemo(() => {
    const rows = chargeur.parMois || []
    return rows
      .map((r) => moisKey(r))
      .filter((k) => /^\d{4}-\d{2}$/.test(k))
      .sort()
      .join('|')
  }, [chargeur.parMois])

  useEffect(() => {
    if (!chargeur?.nom) {
      setLoadingRenta(false)
      return
    }

    const moisDispo = chargeur.parMois || []
    const moisTries = [...moisDispo]
      .filter((r) => /^\d{4}-\d{2}$/.test(moisKey(r)))
      .sort((a, b) => moisKey(a).localeCompare(moisKey(b)))

    if (!moisTries.length) {
      setLoadingRenta(false)
      return
    }

    const dateDebut = `${moisKey(moisTries[0])}-01`
    const dernierMois = moisKey(moisTries[moisTries.length - 1])
    const [a, m] = dernierMois.split('-').map(Number)
    const dernierJour = new Date(a, m, 0).getDate()
    const dateFin = `${dernierMois}-${String(dernierJour).padStart(2, '0')}`

    const params = new URLSearchParams({
      dateDebut,
      dateFin,
      chargeur: chargeur.nom,
    })
    if (societeId) params.append('societeId', societeId)

    setLoadingRenta(true)
    fetch(`${API_BASE}/api/dashboard-groupe/rentabilite-chargeurs?${params}`)
      .then((r) => r.json())
      .then((d) => setRenta(d.chargeurs?.[0] || null))
      .catch(console.error)
      .finally(() => setLoadingRenta(false))
  }, [chargeur?.nom, societeId, parMoisPeriodeSig])

  const openFecDrill = (moisISO, ca) => {
    push({
      title: `${chargeur.nom} · ${formatMois(moisISO)}`,
      subtitle: `${societenom} · Écritures FEC · ${formatEuro(ca)}`,
      component: DrillFecEcritures,
      props: {
        societeId,
        comptes: chargeur.comptes,
        mois: moisISO,
        chargeurNom: chargeur.nom,
        societenom,
      },
    })
  }

  return (
    <div className="space-y-4">
      {/* KPIs 4 colonnes */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          {
            label: 'CA Total',
            value: formatEuro(chargeur.ca),
            color: 'text-[var(--color-primary)]',
          },
          {
            label: 'Coûts affectés',
            value: renta ? formatEuro(renta.coutTotal) : '—',
            color: 'text-[var(--color-ink)]',
            loading: loadingRenta,
          },
          {
            label: 'Marge',
            value: renta ? formatEuro(renta.marge) : '—',
            color: renta
              ? renta.marge >= 0
                ? 'text-[var(--color-success)]'
                : 'text-[var(--color-danger)]'
              : 'text-[var(--color-muted)]',
            loading: loadingRenta,
          },
          {
            label: 'Taux marge',
            value: renta ? `${renta.tauxMarge}%` : '—',
            color: renta
              ? renta.tauxMarge >= 15
                ? 'text-[var(--color-success)]'
                : renta.tauxMarge >= 5
                  ? 'text-[var(--color-warning)]'
                  : 'text-[var(--color-danger)]'
              : 'text-[var(--color-muted)]',
            loading: loadingRenta,
          },
        ].map(({ label, value, color, loading }) => (
          <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
            {loading ? (
              <div className="flex items-center justify-center h-7">
                <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <p className={`text-[18px] font-bold ${color}`}>{value}</p>
            )}
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {series.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">Évolution mensuelle CA</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="moisISO"
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatMois(v)}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }} formatter={(v) => [formatEuro(v), 'CA']} />
              <Bar
                dataKey="ca"
                fill="var(--color-primary)"
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(entry, index) => {
                  const iso = entry?.moisISO ?? entry?.payload?.moisISO ?? series[index]?.moisISO
                  const ca = entry?.ca ?? entry?.payload?.ca ?? series[index]?.ca
                  if (iso) openFecDrill(iso, ca)
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[var(--color-faint)] font-mono mt-2 text-center">
            Cliquez sur une barre pour voir les écritures FEC du mois
          </p>
        </div>
      )}

      {renta && !loadingRenta && (() => {
        const chargesAvecDetail = [
          {
            key: 'masseSalariale',
            label: 'Masse salariale G2L',
            value: renta.masseSalariale,
            color: '#2563EB',
            detail: renta.detail?.chauffeurs || [],
          },
          {
            key: 'sousTraitance',
            label: 'Sous-traitance externe',
            value: renta.sousTraitance,
            color: '#7c3aed',
            detail: renta.detail?.prestataires || [],
          },
          {
            key: 'loyerFlotte',
            label: 'Loyers flotte',
            value: renta.loyerFlotte,
            color: '#0d9488',
            detail: renta.detail?.loyersVehicules || [],
          },
          {
            key: 'carburant',
            label: 'Carburant',
            value: renta.carburant,
            color: '#d97706',
            detail: renta.detail?.carburantVehicules || [],
          },
        ].filter((item) => item.value > 0)

        return (
          <div className="mt-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">Décomposition des charges affectées</p>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                    <th className="text-left px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Nature charge</th>
                    <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Montant</th>
                    <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase w-14">% CA</th>
                    <th className="w-8 px-1 py-2" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {chargesAvecDetail.map((item, i) => (
                    <Fragment key={item.key}>
                      <tr
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpanded(expanded === item.key ? null : item.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpanded(expanded === item.key ? null : item.key)
                          }
                        }}
                        className={`border-b border-[var(--color-border)] cursor-pointer select-none transition-colors hover:bg-[var(--color-surface-hover)] ${
                          i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-[var(--color-muted)] font-mono text-[11px]">{item.label}</span>
                            {item.detail.length > 0 && (
                              <span className="text-[9px] font-mono text-[var(--color-faint)] ml-1">
                                {item.detail.length} ligne(s)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--color-ink)] text-[11px]">{formatEuro(item.value)}</td>
                        <td className="px-3 py-2.5 text-right text-[10px] font-mono text-[var(--color-muted)] w-14">
                          {chargeur.ca > 0 ? `${((item.value / chargeur.ca) * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 w-8 text-center">
                          <ChevronDown
                            size={12}
                            className={`text-[var(--color-faint)] transition-transform inline-block ${
                              expanded === item.key ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                      </tr>
                      {expanded === item.key && item.detail.length > 0 && (
                        <tr className="bg-[var(--color-bg)]">
                          <td colSpan={4} className="px-3 py-0">
                            <div className="border-l-2 ml-4 pl-3 py-2" style={{ borderColor: item.color }}>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-[var(--color-faint)] font-mono uppercase">
                                    {item.key === 'masseSalariale' && (
                                      <>
                                        <th className="text-left py-1">Chauffeur</th>
                                        <th className="text-right py-1">Jours CP</th>
                                        <th className="text-right py-1">Jours tot.</th>
                                        <th className="text-right py-1">Ratio</th>
                                        <th className="text-right py-1">Coût chargé</th>
                                        <th className="text-right py-1">Affecté</th>
                                      </>
                                    )}
                                    {item.key === 'sousTraitance' && (
                                      <>
                                        <th className="text-left py-1">Prestataire</th>
                                        <th className="text-right py-1">Tournées</th>
                                      </>
                                    )}
                                    {(item.key === 'loyerFlotte' || item.key === 'carburant') && (
                                      <>
                                        <th className="text-left py-1">Véhicule</th>
                                        <th className="text-right py-1">Jours CP</th>
                                        <th className="text-right py-1">Jours tot.</th>
                                        <th className="text-right py-1">Ratio</th>
                                        <th className="text-right py-1">Total mois</th>
                                        <th className="text-right py-1">Affecté</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.key === 'masseSalariale' &&
                                    item.detail.map((d) => (
                                      <tr key={d.nom} className="border-t border-[var(--color-border)]">
                                        <td className="py-1 text-[var(--color-ink)] font-medium">{d.nom}</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursCP}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursTotal}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.ratio}%</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{formatEuro(d.coutChargeTotal)}</td>
                                        <td className="py-1 text-right font-semibold text-[var(--color-ink)]">{formatEuro(d.coutAffecte)}</td>
                                      </tr>
                                    ))}
                                  {item.key === 'sousTraitance' &&
                                    item.detail.map((d) => (
                                      <tr key={d.nom} className="border-t border-[var(--color-border)]">
                                        <td className="py-1 text-[var(--color-ink)] font-medium">{d.nom}</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.nbTournees}</td>
                                      </tr>
                                    ))}
                                  {(item.key === 'loyerFlotte' || item.key === 'carburant') &&
                                    item.detail.map((d) => (
                                      <tr key={d.immat} className="border-t border-[var(--color-border)]">
                                        <td className="py-1 font-mono font-medium text-[var(--color-primary)]">{d.immat}</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursCP}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursTotal}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.ratio}%</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">
                                          {formatEuro(item.key === 'loyerFlotte' ? d.loyerMensuel : d.carburantTotal)}
                                        </td>
                                        <td className="py-1 text-right font-semibold text-[var(--color-ink)]">
                                          {formatEuro(item.key === 'loyerFlotte' ? d.loyerAffecte : d.carburantAffecte)}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase font-bold">Coût total affecté</td>
                    <td className="px-3 py-2 text-right font-bold text-[var(--color-ink)]">{formatEuro(renta.coutTotal)}</td>
                    <td className="px-3 py-2 text-right text-[10px] font-mono font-bold text-[var(--color-ink)]">
                      {chargeur.ca > 0 ? `${((renta.coutTotal / chargeur.ca) * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="w-8" />
                  </tr>
                  <tr className={`${renta.marge >= 0 ? 'bg-[var(--color-success-bg)]' : 'bg-[var(--color-danger-bg)]'}`}>
                    <td
                      className={`px-3 py-2 text-[10px] font-mono font-bold uppercase ${
                        renta.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                      }`}
                    >
                      Marge contribution
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${renta.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {formatEuro(renta.marge)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-[11px] font-mono font-bold ${
                        renta.tauxMarge >= 15
                          ? 'text-[var(--color-success)]'
                          : renta.tauxMarge >= 5
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-danger)]'
                      }`}
                    >
                      {renta.tauxMarge}%
                    </td>
                    <td className="w-8" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Détail par mois · Cliquez pour les écritures comptables
        </p>
        <div className="space-y-1">
          {[...series].reverse().map(({ moisISO, ca }) => (
            <button
              key={moisISO}
              type="button"
              onClick={() => openFecDrill(moisISO, ca)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-active)] hover:border-[var(--color-primary)] border border-transparent transition-all text-left group"
            >
              <span className="text-[12px] font-mono text-[var(--color-ink)]">{formatMois(moisISO)}</span>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--color-ink)]">{formatEuro(ca)}</span>
                <ChevronRight size={13} className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)]" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
