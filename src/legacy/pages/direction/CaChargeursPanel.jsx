import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, ComposedChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea,
} from 'recharts'
import {
  Euro, TrendingUp, BarChart3,
  PieChart as PieIcon, ChevronRight,
  Building2, Layers, X,
} from 'lucide-react'
import API_BASE from '../../config/api'
import { StatusBadge } from '../../design'
import { useDrill } from './DrillDownSystem'
import { DrillFinanceChargeur } from './drilldowns'

const formatEuro = (v) => {
  if (!v && v !== 0) return '—'
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(2)}M €`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k €`
  return `${v.toLocaleString('fr-FR')} €`
}

const COULEURS = [
  '#2563EB', '#0d9488', '#7c3aed', '#d97706',
  '#dc2626', '#059669', '#6366f1', '#db2777',
]

/** Lignes CA par mois pour un chargeur (évolutionChart API ca-chargeurs). */
function buildParMoisForChargeur(nomChargeur, evolutionChart, dateDebut) {
  return (
    evolutionChart
      ?.filter((d) => (d[nomChargeur] || 0) > 0)
      .map((d) => {
        const moisISO =
          d.moisISO ||
          (dateDebut
            ? `${dateDebut.slice(0, 4)}-${String(d.mois).padStart(2, '0')}`
            : `${new Date().getFullYear()}-${String(d.mois).padStart(2, '0')}`)
        return { mois: moisISO, moisISO, ca: d[nomChargeur] || 0 }
      }) || []
  )
}

function DrillModal({ chargeur, caTotal, rentaData, onClose, onOpenFecDrill }) {
  if (!chargeur) return null

  const moisCA = (chargeur.parMois || []).slice().reverse().slice(0, 6)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-[var(--color-border)]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--color-ink)]">{chargeur.nom}</h3>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5 font-mono">
              CA & Rentabilité · Données FEC réelles ·{' '}
              {caTotal > 0 ? `${((chargeur.ca / caTotal) * 100).toFixed(1)}% du groupe` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'CA Total', value: formatEuro(chargeur.ca), color: 'text-[var(--color-primary)]' },
              {
                label: 'Coûts totaux',
                value: rentaData ? formatEuro(rentaData.coutTotal) : '—',
                color: 'text-[var(--color-ink)]',
              },
              {
                label: 'Marge',
                value: rentaData ? formatEuro(rentaData.marge) : '—',
                color: rentaData
                  ? rentaData.marge >= 0
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-danger)]'
                  : 'text-[var(--color-muted)]',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                <p className={`text-[22px] font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] inline-block" />
                Chiffre d&apos;affaires
              </p>
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                      <th className="text-left px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Mois</th>
                      <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moisCA.length > 0 ? (
                      moisCA.map(({ mois, ca }, i) => (
                        <tr
                          key={mois}
                          className={`border-b border-[var(--color-border)] last:border-0 ${
                            i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-[var(--color-muted)]">{mois}</td>
                          <td className="px-3 py-2 text-right font-semibold text-[var(--color-primary)]">{formatEuro(ca)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-[var(--color-muted)] text-[11px]">
                          Données non disponibles
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {moisCA.length > 0 && (
                    <tfoot>
                      <tr className="bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                        <td className="px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-[var(--color-primary)]">{formatEuro(chargeur.ca)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-danger)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-danger)] inline-block" />
                Charges
              </p>
              {rentaData ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                        <th className="text-left px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Nature</th>
                        <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Montant</th>
                        <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase w-12">% CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Masse salariale G2L', value: rentaData.masseSalariale, color: '#2563EB' },
                        { label: 'Sous-traitance', value: rentaData.sousTraitance, color: '#7c3aed' },
                        { label: 'Loyers flotte', value: rentaData.loyerFlotte, color: '#0d9488' },
                        { label: 'Carburant (est.)', value: rentaData.carburant, color: '#d97706' },
                      ]
                        .filter((item) => item.value > 0)
                        .map((item, i) => (
                          <tr
                            key={item.label}
                            className={`border-b border-[var(--color-border)] last:border-0 ${
                              i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'
                            }`}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                                <span className="text-[var(--color-muted)] font-mono text-[11px]">{item.label}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-[var(--color-ink)]">{formatEuro(item.value)}</td>
                            <td className="px-3 py-2 text-right text-[10px] font-mono text-[var(--color-muted)]">
                              {chargeur.ca > 0 ? `${((item.value / chargeur.ca) * 100).toFixed(0)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                        <td className="px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase font-bold">Coût total</td>
                        <td className="px-3 py-2 text-right font-bold text-[var(--color-ink)]">{formatEuro(rentaData.coutTotal)}</td>
                        <td className="px-3 py-2 text-right text-[10px] font-mono font-bold text-[var(--color-ink)]">
                          {chargeur.ca > 0 ? `${((rentaData.coutTotal / chargeur.ca) * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                      <tr
                        className={`${
                          rentaData.marge >= 0 ? 'bg-[var(--color-success-bg)]' : 'bg-[var(--color-danger-bg)]'
                        }`}
                      >
                        <td className="px-3 py-2 text-[10px] font-mono font-bold uppercase">
                          <span
                            className={
                              rentaData.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                            }
                          >
                            Marge contribution
                          </span>
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-bold ${
                            rentaData.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                          }`}
                        >
                          {formatEuro(rentaData.marge)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right text-[11px] font-mono font-bold ${
                            rentaData.tauxMarge >= 15
                              ? 'text-[var(--color-success)]'
                              : rentaData.tauxMarge >= 5
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-danger)]'
                          }`}
                        >
                          {rentaData.tauxMarge}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-[var(--color-muted)] text-[12px] bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                  Données de rentabilité non disponibles
                </div>
              )}
            </div>
          </div>

          {rentaData && (rentaData.chauffeurs?.length > 0 || rentaData.prestataires?.length > 0) && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              {rentaData.chauffeurs?.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">👤 Top chauffeurs G2L</p>
                  <div className="space-y-1">
                    {rentaData.chauffeurs.map((ch, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                      >
                        <span className="text-[var(--color-ink)]">{ch.nom}</span>
                        <span className="font-mono text-[var(--color-muted)]">{ch.nbJours} j</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rentaData.prestataires?.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-warning)] mb-2">🔄 Prestataires externes</p>
                  <div className="space-y-1">
                    {rentaData.prestataires.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-[var(--color-warning-bg)] rounded-[var(--radius-sm)] border border-[var(--color-warning-border)]"
                      >
                        <span className="text-[var(--color-warning)]">{p.nom}</span>
                        <span className="font-mono text-[var(--color-warning)]">{p.nbJours} j</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {rentaData && (
            <div className="mt-4 p-3 bg-[var(--color-info-bg)] rounded-[var(--radius-md)] border border-[var(--color-info-border)]">
              <p className="text-[9px] text-[var(--color-info)] font-mono leading-relaxed">
                ⓘ Masse sal. = FEC 421xxx × ratio jours SF · Sous-traitance = FEC 622800 GLOBAL DRIVE/STEP × ratio tournées · Loyers = FEC 612xxx × véhicules SF · Carburant = FEC 606xxx × prorata tournées (affinement WEX/UTA prévu)
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 flex gap-2 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <button
            type="button"
            onClick={() => {
              onOpenFecDrill(chargeur)
              onClose()
            }}
            className="flex-1 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-primary)] bg-[var(--color-primary)] text-white text-[12px] font-medium hover:opacity-95 transition-opacity"
          >
            Voir drill FEC & mois
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CaChargeursPanel({ dateDebut, dateFin }) {
  const { push } = useDrill()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [rentabilite, setRentabilite] = useState(null)
  const [loadingRenta, setLoadingRenta] = useState(false)
  const [rentaLoadingMsg, setRentaLoadingMsg] = useState('')
  const [selectedChargeur, setSelectedChargeur] = useState(null)
  const [vue, setVue] = useState('tableau')
  const [mode, setMode] = useState('consolide')
  const [showProjection, setShowProjection] = useState(false)
  const [activeChargeurs, setActiveChargeurs] = useState([])

  const openChargeurDrill = (c) => {
    push({
      title: c.nom,
      subtitle: 'CA & Rentabilité · Données FEC réelles',
      component: DrillFinanceChargeur,
      props: {
        chargeur: {
          ...c,
          parMois: buildParMoisForChargeur(c.nom, data?.evolutionChart, dateDebut),
        },
        societeId: null,
        societenom: 'Groupe G2L',
      },
    })
  }

  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ mode })
        if (dateDebut) params.append('dateDebut', dateDebut)
        if (dateFin) params.append('dateFin', dateFin)
        const res = await fetch(`${API_BASE}/api/dashboard-groupe/ca-chargeurs?${params}`)
        if (res.ok) {
          const d = await res.json()
          setData(d)
          setActiveChargeurs(d.top6 || [])
        }
      } catch (err) {
        console.error('CaChargeursPanel:', err)
      } finally {
        setLoading(false)
      }
    }
    fetch_()
  }, [dateDebut, dateFin, mode])

  useEffect(() => {
    if (!loading) {
      setLoadingMsg('')
      return
    }
    const msgs = [
      'Chargement des données FEC...',
      'Récupération des tournées Salesforce...',
      'Calcul des charges par chargeur...',
      'Finalisation...',
    ]
    let i = 0
    setLoadingMsg(msgs[0])
    const interval = setInterval(() => {
      i = Math.min(i + 1, msgs.length - 1)
      setLoadingMsg(msgs[i])
    }, 1500)
    return () => clearInterval(interval)
  }, [loading])

  useEffect(() => {
    if (!loadingRenta) {
      setRentaLoadingMsg('')
      return
    }
    const msgs = [
      'Récupération des tournées Salesforce...',
      'Calcul des charges par chargeur...',
      'Finalisation...',
    ]
    let i = 0
    setRentaLoadingMsg(msgs[0])
    const interval = setInterval(() => {
      i = Math.min(i + 1, msgs.length - 1)
      setRentaLoadingMsg(msgs[i])
    }, 1500)
    return () => clearInterval(interval)
  }, [loadingRenta])

  useEffect(() => {
    const fetchRenta = async () => {
      setLoadingRenta(true)
      try {
        const params = new URLSearchParams({ mode })
        if (dateDebut) params.append('dateDebut', dateDebut)
        if (dateFin) params.append('dateFin', dateFin)
        const res = await fetch(`${API_BASE}/api/dashboard-groupe/rentabilite-chargeurs?${params}`)
        if (res.ok) {
          const d = await res.json()
          const index = {}
          d.chargeurs?.forEach((c) => {
            index[c.nom] = c
          })
          setRentabilite(index)
        }
      } catch (err) {
        console.error('Rentabilité chargeurs:', err)
      } finally {
        setLoadingRenta(false)
      }
    }
    fetchRenta()
  }, [dateDebut, dateFin, mode])

  const evolutionData = useMemo(() => {
    if (!data) return []
    if (showProjection && data.projection?.length) {
      const last = data.evolutionChart[data.evolutionChart.length - 1]
      return [...data.evolutionChart, ...(last ? [{ ...last, isProjection: true }] : []), ...data.projection]
    }
    return data.evolutionChart || []
  }, [data, showProjection])

  if (loading) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-8 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mr-2" />
          <span className="text-[13px] text-[var(--color-muted)]">Chargement CA chargeurs…</span>
        </div>
        {loadingMsg && (
          <span className="text-[11px] text-[var(--color-faint)] font-mono text-center max-w-md">{loadingMsg}</span>
        )}
      </div>
    )
  }

  if (!data) return null

  const tableColCount = 13

  return (
    <>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Euro size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">CA & Rentabilité par chargeur</h3>
            <span className="text-[10px] font-mono text-[var(--color-faint)] bg-[var(--color-bg)] px-2 py-0.5 rounded border border-[var(--color-border)]">
              {formatEuro(data.caTotal)} commercial · {data.chargeurs?.filter((c) => !c.isInterne).length} chargeurs
            </span>
            {loadingRenta && (
              <span className="text-[9px] font-mono text-[var(--color-muted)] max-w-[280px] truncate" title={rentaLoadingMsg}>
                · {rentaLoadingMsg || 'Rentabilité…'}
              </span>
            )}
            {data.caInterne > 0 && mode === 'entites' && (
              <span className="text-[10px] font-mono text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-2 py-0.5 rounded border border-[var(--color-warning-border)]">
                + {formatEuro(data.caInterne)} internes
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-0.5 border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setMode('consolide')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono transition-all ${
                  mode === 'consolide'
                    ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-sm)] font-medium'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                <Layers size={10} />
                Consolidé groupe
              </button>
              <button
                type="button"
                onClick={() => setMode('entites')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono transition-all ${
                  mode === 'entites'
                    ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-sm)] font-medium'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                <Building2 size={10} />
                Par entité légale
              </button>
            </div>

            <div className="flex items-center gap-0.5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-0.5 border border-[var(--color-border)]">
              {[
                { key: 'tableau', label: 'Tableau', icon: BarChart3 },
                { key: 'evolution', label: 'Évolution', icon: TrendingUp },
                { key: 'repartition', label: 'Répartition', icon: PieIcon },
                { key: 'rentabilite', label: 'Rentabilité', icon: Euro },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVue(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-mono transition-all ${
                    vue === key
                      ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-sm)] font-medium'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  <Icon size={10} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`px-4 py-2 border-b border-[var(--color-border)] text-[10px] font-mono ${
          mode === 'consolide'
            ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
            : 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        }`}
        >
          {mode === 'consolide'
            ? '📊 Vue consolidée — Flux intra-groupe exclus (706200, 706010, 706011). CA réel avec clients externes uniquement.'
            : '🏢 Vue par entité légale — Tous les flux inclus (refacturations internes visibles). CA tel qu\'il apparaît dans les bilans sociaux.'}
        </div>

        <div className="p-4">
          {vue === 'tableau' && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[1100px]">
                <thead>
                  <tr className="bg-[var(--color-bg)] text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wider">
                    <th className="text-left p-2 border-b border-[var(--color-border)]">#</th>
                    <th className="text-left p-2 border-b border-[var(--color-border)]">Chargeur</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">CA Total</th>
                    <th className="text-left p-2 border-b border-[var(--color-border)]">Part groupe</th>
                    <th className="text-left p-2 border-b border-[var(--color-border)]">D&J / TPS / Holding</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Masse sal.</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Sous-trait.</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Loyers</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Carburant</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Coût total</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Marge réelle</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Taux réel</th>
                    <th className="p-2 border-b border-[var(--color-border)]" />
                  </tr>
                </thead>
                <tbody>
                  {data.chargeurs?.map((c, i) => {
                    const renta = rentabilite?.[c.nom]
                    const calculCharges = !c.isInterne && loadingRenta && !renta
                    return (
                      <tr
                        key={c.nom}
                        className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] cursor-pointer transition-colors ${c.isInterne ? 'opacity-60 italic' : ''}`}
                        onClick={() => setSelectedChargeur(c)}
                      >
                        <td className="p-2 font-mono text-[var(--color-faint)]">{i + 1}</td>
                        <td className="p-2 font-medium text-[var(--color-ink)]">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.isInterne ? '#9ca3af' : (COULEURS[i] || '#999') }} />
                            {c.nom}
                            {c.isInterne && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
                                INTERNE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right font-semibold text-[var(--color-ink)]">{formatEuro(c.ca)}</td>
                        <td className="p-2">
                          {!c.isInterne && (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden border border-[var(--color-border)]">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${data.caTotal > 0 ? (c.ca / data.caTotal) * 100 : 0}%`,
                                    background: COULEURS[i] || '#999',
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-[var(--color-muted)] font-mono">
                                {data.caTotal > 0 ? ((c.ca / data.caTotal) * 100).toFixed(1) : 0}
                                %
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {Object.entries(c.parSociete || {})
                              .sort(([, a], [, b]) => b - a)
                              .map(([soc, ca]) => (
                                <span
                                  key={soc}
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"
                                >
                                  {soc} {formatEuro(ca)}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td className="p-2 text-right text-[var(--color-muted)]">
                          {calculCharges ? (
                            <span className="text-[10px] italic text-[var(--color-muted)]">Calcul…</span>
                          ) : c.isInterne || !renta ? (
                            '—'
                          ) : (
                            formatEuro(renta.masseSalariale)
                          )}
                        </td>
                        <td className="p-2 text-right text-[var(--color-muted)]">
                          {calculCharges ? (
                            <span className="text-[10px] italic text-[var(--color-muted)]">Calcul…</span>
                          ) : c.isInterne || !renta ? (
                            '—'
                          ) : (
                            formatEuro(renta.sousTraitance)
                          )}
                        </td>
                        <td className="p-2 text-right text-[var(--color-muted)]">
                          {calculCharges ? (
                            <span className="text-[10px] italic text-[var(--color-muted)]">Calcul…</span>
                          ) : c.isInterne || !renta ? (
                            '—'
                          ) : (
                            formatEuro(renta.loyerFlotte)
                          )}
                        </td>
                        <td className="p-2 text-right text-[var(--color-muted)]">
                          {calculCharges ? (
                            <span className="text-[10px] italic text-[var(--color-muted)]">Calcul…</span>
                          ) : c.isInterne || !renta ? (
                            '—'
                          ) : (
                            formatEuro(renta.carburant)
                          )}
                        </td>
                        <td className="p-2 text-right font-semibold text-[var(--color-ink)]">
                          {calculCharges ? (
                            <span className="text-[10px] italic text-[var(--color-muted)] font-normal">Calcul…</span>
                          ) : c.isInterne || !renta ? (
                            '—'
                          ) : (
                            formatEuro(renta.coutTotal)
                          )}
                        </td>
                        <td className={`p-2 text-right font-semibold ${
                          calculCharges
                            ? 'text-[var(--color-muted)]'
                            : c.isInterne || !renta
                              ? 'text-[var(--color-muted)]'
                              : renta.marge >= 0
                                ? 'text-[var(--color-success)]'
                                : 'text-[var(--color-danger)]'
                        }`}
                        >
                          {calculCharges ? (
                            <span className="text-[10px] italic font-normal">Calcul…</span>
                          ) : c.isInterne || !renta ? (
                            '—'
                          ) : (
                            formatEuro(renta.marge)
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {calculCharges ? (
                            <span className="text-[10px] italic text-[var(--color-muted)]">…</span>
                          ) : !c.isInterne && renta ? (
                            <StatusBadge
                              label={`${renta.tauxMarge}%`}
                              variant={
                                renta.tauxMarge >= 15 ? 'success' : renta.tauxMarge >= 5 ? 'warning' : 'danger'
                              }
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2">
                          <ChevronRight size={13} className="text-[var(--color-faint)]" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--color-bg)]">
                    <td colSpan={2} className="p-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Total commercial externe</td>
                    <td className="p-2 text-right font-bold text-[var(--color-ink)]">{formatEuro(data.caTotal)}</td>
                    <td colSpan={tableColCount - 3} />
                  </tr>
                  {mode === 'entites' && data.caInterne > 0 && (
                    <tr className="bg-[var(--color-warning-bg)]">
                      <td colSpan={2} className="p-2 text-[10px] font-mono text-[var(--color-warning)] uppercase">Dont flux intra-groupe</td>
                      <td className="p-2 text-right font-bold text-[var(--color-warning)]">{formatEuro(data.caInterne)}</td>
                      <td colSpan={tableColCount - 3} />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}

          {vue === 'evolution' && (
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {data.top6?.map((nom, i) => (
                    <button
                      key={nom}
                      type="button"
                      onClick={() => setActiveChargeurs((prev) => (prev.includes(nom) ? prev.filter((c) => c !== nom) : [...prev, nom]))}
                      className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border transition-all ${
                        activeChargeurs.includes(nom)
                          ? 'text-white border-transparent'
                          : 'text-[var(--color-muted)] bg-[var(--color-bg)] border-[var(--color-border)]'
                      }`}
                      style={activeChargeurs.includes(nom) ? { background: COULEURS[i], borderColor: COULEURS[i] } : {}}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeChargeurs.includes(nom) ? 'white' : COULEURS[i] }} />
                      {nom}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowProjection((p) => !p)}
                  className={`text-[10px] font-mono px-2 py-1 rounded border transition-all flex items-center gap-1 ${
                    showProjection
                      ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]'
                      : 'text-[var(--color-muted)] bg-[var(--color-bg)] border-[var(--color-border)]'
                  }`}
                >
                  <span className="inline-block w-4 border-t-2 border-dashed border-current" />
                  Projection 3 mois
                </button>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={evolutionData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <defs>
                    {data.top6?.map((nom, i) => (
                      <linearGradient key={nom} id={`grad_ch_${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COULEURS[i]} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={COULEURS[i]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
                    formatter={(v, name) => [formatEuro(v), name]}
                    labelFormatter={(label, payload) => {
                      const isProj = payload?.[0]?.payload?.isProjection
                      return `Mois ${label}${isProj ? ' (projection)' : ''}`
                    }}
                  />
                  {showProjection && data.projection?.length > 0 && (
                    <ReferenceArea
                      x={data.evolutionChart[data.evolutionChart.length - 1]?.mois}
                      x2={data.projection[data.projection.length - 1]?.mois}
                      fill="var(--color-bg)"
                      fillOpacity={0.7}
                      label={{ value: 'Projection', position: 'insideTopRight', fontSize: 9, fill: 'var(--color-faint)', fontFamily: 'monospace' }}
                    />
                  )}
                  {data.top6?.filter((nom) => activeChargeurs.includes(nom)).map((nom) => (
                    <Area
                      key={nom}
                      type="monotone"
                      dataKey={nom}
                      stroke={COULEURS[data.top6.indexOf(nom)]}
                      strokeWidth={2}
                      fill={`url(#grad_ch_${data.top6.indexOf(nom)})`}
                      dot={false}
                      activeDot={{ r: 4 }}
                      onClick={(point) => {
                        const c = data.chargeurs?.find((ch) => ch.nom === nom)
                        if (c && point?.payload?.[nom] > 0) openChargeurDrill(c)
                      }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>

              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-[var(--color-ink-2)]" />
                  <span className="text-[10px] text-[var(--color-muted)] font-mono">Données FEC réelles</span>
                </div>
                {showProjection && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 border-t-2 border-dashed border-[var(--color-muted)]" />
                    <span className="text-[10px] text-[var(--color-muted)] font-mono">Projection (moy. mobile 3 mois)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {vue === 'repartition' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.repartition}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="ca"
                    onClick={(d) => {
                      const c = data.chargeurs?.find((ch) => ch.nom === d.nom)
                      if (c) setSelectedChargeur(c)
                    }}
                  >
                    {data.repartition?.map((entry, i) => (
                      <Cell key={i} fill={entry.color} className="cursor-pointer hover:opacity-80 transition-opacity" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [formatEuro(v), name]}
                    contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2">
                {data.repartition?.map((item) => (
                  <div
                    key={item.nom}
                    className="flex items-center gap-3 p-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] cursor-pointer transition-colors"
                    onClick={() => {
                      const c = data.chargeurs?.find((ch) => ch.nom === item.nom)
                      if (c) setSelectedChargeur(c)
                    }}
                    role="presentation"
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-[12.5px] font-medium text-[var(--color-ink)] flex-1">{item.nom}</span>
                    <span className="text-[12px] font-semibold text-[var(--color-ink)]">{formatEuro(item.ca)}</span>
                    <span className="text-[11px] text-[var(--color-muted)] w-12 text-right font-mono">{item.pct}%</span>
                    <ChevronRight size={12} className="text-[var(--color-faint)]" />
                  </div>
                ))}
                <div className="pt-2 border-t border-[var(--color-border)] flex justify-between">
                  <span className="text-[11px] font-mono text-[var(--color-muted)]">Total commercial</span>
                  <span className="text-[13px] font-bold text-[var(--color-ink)]">{formatEuro(data.caTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {vue === 'rentabilite' && (
            <div className="space-y-2">
              {data.chargeurs?.filter((c) => !c.isInterne).map((c, i) => {
                const renta = rentabilite?.[c.nom]
                const tauxAff = renta?.tauxMarge ?? c.tauxMarge
                const pctCout = renta && renta.ca > 0 ? (renta.coutTotal / renta.ca) * 100 : c.ca > 0 ? (c.coutEstime / c.ca) * 100 : 0
                const pctMarge = Math.max(0, 100 - pctCout)

                return (
                  <div
                    key={c.nom}
                    className="cursor-pointer hover:bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3 -mx-1 border border-transparent hover:border-[var(--color-border)] transition-all"
                    onClick={() => setSelectedChargeur(c)}
                    role="presentation"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COULEURS[i] || '#999' }} />
                        <span className="text-[12.5px] font-medium text-[var(--color-ink)]">{c.nom}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-[var(--color-muted)]">CA {formatEuro(c.ca)}</span>
                        <StatusBadge
                          label={`${tauxAff}%`}
                          variant={tauxAff >= 15 ? 'success' : tauxAff >= 5 ? 'warning' : 'danger'}
                        />
                        <ChevronRight size={13} className="text-[var(--color-faint)]" />
                      </div>
                    </div>

                    {renta && (
                      <div className="mt-2 space-y-1">
                        {[
                          {
                            label: 'Masse salariale',
                            value: renta.masseSalariale,
                            color: '#2563EB',
                            pct: renta.ca > 0 ? (renta.masseSalariale / renta.ca) * 100 : 0,
                          },
                          {
                            label: 'Sous-traitance',
                            value: renta.sousTraitance,
                            color: '#7c3aed',
                            pct: renta.ca > 0 ? (renta.sousTraitance / renta.ca) * 100 : 0,
                          },
                          {
                            label: 'Loyers flotte',
                            value: renta.loyerFlotte,
                            color: '#0d9488',
                            pct: renta.ca > 0 ? (renta.loyerFlotte / renta.ca) * 100 : 0,
                          },
                          {
                            label: 'Carburant',
                            value: renta.carburant,
                            color: '#d97706',
                            pct: renta.ca > 0 ? (renta.carburant / renta.ca) * 100 : 0,
                          },
                        ]
                          .filter((item) => item.value > 0)
                          .map((item) => (
                            <div key={item.label} className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-[var(--color-muted)] w-28 shrink-0">{item.label}</span>
                              <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${Math.min(item.pct, 100)}%`,
                                    background: item.color,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-mono text-[var(--color-ink)] w-20 text-right shrink-0">
                                {formatEuro(item.value)}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--color-muted)] w-8 text-right shrink-0">
                                {item.pct.toFixed(0)}
                                %
                              </span>
                            </div>
                          ))}

                        <div className="flex items-center gap-2 pt-1 border-t border-[var(--color-border)] mt-1">
                          <span className="text-[10px] font-mono font-semibold text-[var(--color-ink)] w-28 shrink-0">
                            Marge réelle
                          </span>
                          <div className="flex-1" />
                          <span className={`text-[11px] font-bold w-20 text-right shrink-0 ${
                            renta.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                          }`}
                          >
                            {formatEuro(renta.marge)}
                          </span>
                          <span className={`text-[10px] font-mono font-bold w-8 text-right shrink-0 ${
                            renta.tauxMarge >= 15
                              ? 'text-[var(--color-success)]'
                              : renta.tauxMarge >= 5
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-danger)]'
                          }`}
                          >
                            {renta.tauxMarge}
                            %
                          </span>
                        </div>

                        {(renta.chauffeurs?.length > 0 || renta.prestataires?.length > 0) && (
                          <div className="pt-1 mt-1 border-t border-[var(--color-border)]">
                            <div className="flex items-center gap-4 flex-wrap">
                              {renta.nbChauffeurs > 0 && (
                                <span className="text-[9px] font-mono text-[var(--color-muted)]">
                                  👤 {renta.nbChauffeurs} chauffeur(s) G2L
                                </span>
                              )}
                              {renta.nbTourneesPrestataire > 0 && (
                                <span className="text-[9px] font-mono text-[var(--color-muted)]">
                                  🔄 {renta.nbTourneesPrestataire} tournées prestataires
                                </span>
                              )}
                              {renta.nbVehicules > 0 && (
                                <span className="text-[9px] font-mono text-[var(--color-muted)]">
                                  🚚 {renta.nbVehicules} véhicule(s)
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!renta && loadingRenta && (
                      <p className="text-[10px] italic text-[var(--color-muted)] mt-2 font-mono">{rentaLoadingMsg}</p>
                    )}
                    {!renta && !loadingRenta && (
                      <>
                        <div className="h-4 rounded-full overflow-hidden flex mt-1">
                          <div className="h-full transition-all duration-700 bg-[var(--color-border)]" style={{ width: `${pctCout}%` }} />
                          <div
                            className="h-full transition-all duration-700"
                            style={{
                              width: `${pctMarge}%`,
                              background: c.tauxMarge >= 15 ? 'var(--color-success)' : c.tauxMarge >= 8 ? 'var(--color-warning)' : 'var(--color-danger)',
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-[var(--color-faint)] font-mono">Coûts {formatEuro(c.coutEstime)} (estimé)</span>
                          <span className={`text-[9px] font-mono font-semibold ${
                            c.tauxMarge >= 15 ? 'text-[var(--color-success)]' : c.tauxMarge >= 8 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'
                          }`}
                          >
                            Marge {formatEuro(c.marge)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
              <div className="mt-3 p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-faint)] font-mono leading-relaxed">
                  ⓘ Rentabilité réelle · API /rentabilite-chargeurs (FEC 421 / 622800·604001 / 612 / 606 × répartition Salesforce). Sans données API, affichage estimé prorata CA.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedChargeur && (
        <DrillModal
          chargeur={{
            ...selectedChargeur,
            parMois: buildParMoisForChargeur(selectedChargeur.nom, data?.evolutionChart, dateDebut),
          }}
          caTotal={data.caTotal}
          rentaData={rentabilite?.[selectedChargeur.nom]}
          onClose={() => setSelectedChargeur(null)}
          onOpenFecDrill={openChargeurDrill}
        />
      )}
    </>
  )
}
