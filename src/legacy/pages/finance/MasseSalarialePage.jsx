import { useState, useEffect, Fragment } from 'react'
import { Users, ChevronDown, Search } from 'lucide-react'
import { PageHeader } from '../../design'
import API_BASE from '../../config/api'

function formatEuro(v) {
  if (!v && v !== 0) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(v)
}

function getBadgeSociete(nom) {
  if (nom?.includes('D&J') || nom?.includes('D & J')) {
    return { label: 'D&J', class: 'bg-blue-50 text-blue-600 border-blue-200' }
  }
  if (nom?.includes('TPS')) {
    return { label: 'TPS', class: 'bg-green-50 text-green-600 border-green-200' }
  }
  if (nom?.includes('G2L')) {
    return { label: 'G2L', class: 'bg-purple-50 text-purple-600 border-purple-200' }
  }
  return { label: nom || '?', class: 'bg-gray-50 text-gray-600 border-gray-200' }
}

const CHARGEUR_COLORS = {
  'COLIS PRIVE': '#ef4444',
  DPD: '#f97316',
  GLS: '#22c55e',
  CHRONOPOST: '#8b5cf6',
  CIBLEX: '#f59e0b',
  'RELAIS COLIS': '#6366f1',
  FEDEX: '#0ea5e9',
}

const SORTABLE_COLS = ['nom_salarie', 'societe_nom', 'net_verse', 'coutTotal', 'joursTotal']

export default function MasseSalarialePage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Chargement des données FEC...')
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [societeFilter, setSocieteFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [dateDebut, setDateDebut] = useState('2026-01-01')
  const [dateFin, setDateFin] = useState('2026-01-31')
  const [sortBy, setSortBy] = useState('net_verse')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    let i = 0
    const msgs = [
      'Chargement des données FEC...',
      'Récupération des tournées Salesforce...',
      'Calcul des répartitions par chargeur...',
      'Finalisation...',
    ]
    const interval = setInterval(() => {
      setLoadingMsg(msgs[Math.min(++i, msgs.length - 1)])
    }, 1500)
    return () => clearInterval(interval)
  }, [loading])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateDebut, dateFin })
      const res = await fetch(`${API_BASE}/api/dashboard-groupe/masse-salariale?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur serveur')
      setData(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [dateDebut, dateFin])

  function toggleSort(col) {
    if (!SORTABLE_COLS.includes(col)) return
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const salariesFiltres = (data?.salaries || []).filter((s) => {
    const label = (s.nom || s.nom_salarie || '').toLowerCase()
    const matchSearch = !search || label.includes(search.toLowerCase())
    const n = s.societe_nom || ''
    const matchSociete =
      societeFilter === 'all' ||
      (societeFilter === 'DJ' && (n.includes('D&J') || n.includes('D & J'))) ||
      (societeFilter === 'TPS' && n.includes('TPS')) ||
      (societeFilter === 'G2L' && n.includes('G2L'))
    return matchSearch && matchSociete
  })

  const salariesTries = [...salariesFiltres].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1
    if (sortBy === 'nom_salarie') {
      return dir * (a.nom_salarie || a.nom || '').localeCompare(b.nom_salarie || b.nom || '', 'fr')
    }
    if (sortBy === 'societe_nom') {
      return dir * (a.societe_nom || '').localeCompare(b.societe_nom || '', 'fr')
    }
    return dir * ((a[sortBy] ?? 0) - (b[sortBy] ?? 0))
  })

  function SortHint({ col }) {
    if (!SORTABLE_COLS.includes(col)) return null
    if (sortBy !== col) return null
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const thSortable =
    'text-left px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] cursor-pointer hover:text-[var(--color-primary)] select-none'

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px] text-[var(--color-muted)] font-mono">{loadingMsg}</p>
      </div>
    )

  if (error)
    return (
      <div className="p-6">
        <p className="text-[var(--color-danger)]">{error}</p>
      </div>
    )

  return (
    <div className="p-6 space-y-5" style={{ background: 'var(--color-bg)' }}>
      <PageHeader
        title="Masse salariale"
        subtitle="Coûts par salarié · Répartition par chargeur"
        icon={Users}
      />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2">
          <span className="text-[11px] font-mono text-[var(--color-muted)]">Du</span>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="text-[12px] text-[var(--color-ink)] bg-transparent outline-none"
          />
          <span className="text-[11px] font-mono text-[var(--color-muted)]">au</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="text-[12px] text-[var(--color-ink)] bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Masse sal. nette',
            value: formatEuro(data?.kpis?.masseSalTotale),
            sub: `${data?.kpis?.nbSalaries} salariés`,
            color: 'text-[var(--color-primary)]',
          },
          {
            label: 'Coût chargé total',
            value: formatEuro(data?.kpis?.coutChargeTotal),
            sub: `Ratio × ${data?.kpis?.ratioCharges?.toFixed(3)}`,
            color: 'text-[var(--color-ink)]',
          },
          {
            label: 'D&J Transport',
            value: formatEuro(data?.kpis?.parSociete?.DJ?.cout),
            sub: `${data?.kpis?.parSociete?.DJ?.nb} salariés`,
            color: 'text-[var(--color-ink)]',
          },
          {
            label: 'TPS TSMC Express',
            value: formatEuro(data?.kpis?.parSociete?.TPS?.cout),
            sub: `${data?.kpis?.parSociete?.TPS?.nb} salariés`,
            color: 'text-[var(--color-ink)]',
          },
          {
            label: 'G2L Holding',
            value: formatEuro(data?.kpis?.parSociete?.G2L?.cout),
            sub: `${data?.kpis?.parSociete?.G2L?.nb} salariés`,
            color: 'text-[var(--color-ink)]',
          },
        ].map(({ label, value, sub, color }) => (
          <div
            key={label}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 shadow-[var(--shadow-sm)]"
          >
            <p className={`text-[22px] font-bold ${color}`}>{value}</p>
            <p className="text-[11px] text-[var(--color-muted)] font-mono mt-0.5 uppercase tracking-wider">
              {label}
            </p>
            <p className="text-[10px] text-[var(--color-faint)] font-mono mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2 flex-1 max-w-xs min-w-[200px]">
          <Search size={13} className="text-[var(--color-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un salarié..."
            className="text-[12px] bg-transparent outline-none text-[var(--color-ink)] flex-1 placeholder:text-[var(--color-faint)]"
          />
        </div>
        {['all', 'DJ', 'TPS', 'G2L'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setSocieteFilter(f)}
            className={`text-[11px] font-mono px-3 py-1.5 rounded-[var(--radius-sm)] border transition-colors ${
              societeFilter === f
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-ink)]'
            }`}
          >
            {f === 'all'
              ? `Tous (${data?.salaries?.length || 0})`
              : f === 'DJ'
                ? `D&J (${data?.kpis?.parSociete?.DJ?.nb || 0})`
                : f === 'TPS'
                  ? `TPS (${data?.kpis?.parSociete?.TPS?.nb || 0})`
                  : `G2L (${data?.kpis?.parSociete?.G2L?.nb || 0})`}
          </button>
        ))}
        <span className="text-[11px] text-[var(--color-muted)] font-mono ml-auto">
          {salariesTries.length} salarié(s) affiché(s)
        </span>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-x-auto shadow-[var(--shadow-sm)]">
        <table className="w-full text-[12px] min-w-[980px]">
          <thead>
            <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              <th className={thSortable} onClick={() => toggleSort('nom_salarie')}>
                Salarié
                <SortHint col="nom_salarie" />
              </th>
              <th className={thSortable} onClick={() => toggleSort('societe_nom')}>
                Société
                <SortHint col="societe_nom" />
              </th>
              <th className={thSortable} onClick={() => toggleSort('net_verse')}>
                Net versé
                <SortHint col="net_verse" />
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
                Brut estimé
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
                Ch. salariales
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
                Ch. patronales
              </th>
              <th className={thSortable} onClick={() => toggleSort('coutTotal')}>
                Coût total
                <SortHint col="coutTotal" />
              </th>
              <th className={thSortable} onClick={() => toggleSort('joursTotal')}>
                Jours
                <SortHint col="joursTotal" />
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
                Chargeurs
              </th>
              <th className="w-8 px-3 py-2.5" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {salariesTries.map((s, i) => {
              const badge = getBadgeSociete(s.societe_nom)
              return (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    className={`border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors ${
                      i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--color-ink)]">{s.nom_salarie || s.nom}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badge.class}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-muted)]">{formatEuro(s.net_verse)}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-ink)]">{formatEuro(s.brutEstime)}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-warning)]">
                      {formatEuro(s.chargesSalariales)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-danger)]">
                      {formatEuro(s.chargesPatronales)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[var(--color-ink)]">{formatEuro(s.coutTotal)}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--color-muted)]">
                      {s.joursTotal > 0 ? `${s.joursTotal}j` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap max-w-[220px]">
                        {(s.repartitionChargeurs || []).slice(0, 3).map((r) => (
                          <span
                            key={r.chargeur}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              background: `${CHARGEUR_COLORS[r.chargeur] || '#6b7280'}20`,
                              color: CHARGEUR_COLORS[r.chargeur] || '#6b7280',
                              border: `1px solid ${CHARGEUR_COLORS[r.chargeur] || '#6b7280'}40`,
                            }}
                          >
                            {r.chargeur} {r.ratio}%
                          </span>
                        ))}
                        {(s.repartitionChargeurs || []).length === 0 && (
                          <span className="text-[10px] text-[var(--color-faint)] font-mono">Non identifié SF</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-8">
                      <ChevronDown
                        size={12}
                        className={`text-[var(--color-faint)] transition-transform ${
                          expandedId === s.id ? 'rotate-180' : ''
                        }`}
                      />
                    </td>
                  </tr>

                  {expandedId === s.id && (
                    <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                      <td colSpan={10} className="px-6 py-3">
                        <div className="border-l-2 border-[var(--color-primary)] pl-4 space-y-3">
                          <div>
                            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
                              Décomposition du coût
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                              {[
                                {
                                  label: 'Net versé',
                                  value: s.net_verse,
                                  color: 'text-[var(--color-muted)]',
                                },
                                {
                                  label: 'Brut estimé',
                                  value: s.brutEstime,
                                  color: 'text-[var(--color-ink)]',
                                },
                                {
                                  label: 'Ch. salariales',
                                  value: s.chargesSalariales,
                                  color: 'text-[var(--color-warning)]',
                                },
                                {
                                  label: 'Ch. patronales',
                                  value: s.chargesPatronales,
                                  color: 'text-[var(--color-danger)]',
                                },
                              ].map(({ label, value, color }) => (
                                <div
                                  key={label}
                                  className="bg-[var(--color-surface)] rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3 text-center"
                                >
                                  <p className={`text-[16px] font-bold ${color}`}>{formatEuro(value)}</p>
                                  <p className="text-[9px] font-mono uppercase text-[var(--color-faint)] mt-0.5">
                                    {label}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {s.repartitionChargeurs?.length > 0 ? (
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
                                Répartition par chargeur
                              </p>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-[var(--color-faint)] font-mono text-[9px] uppercase">
                                    <th className="text-left py-1">Chargeur</th>
                                    <th className="text-right py-1">Jours</th>
                                    <th className="text-right py-1">Ratio</th>
                                    <th className="text-right py-1">Coût affecté</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.repartitionChargeurs.map((r) => (
                                    <tr key={r.chargeur} className="border-t border-[var(--color-border)]">
                                      <td className="py-1.5 font-medium text-[var(--color-ink)]">
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-2 h-2 rounded-full"
                                            style={{
                                              background: CHARGEUR_COLORS[r.chargeur] || '#6b7280',
                                            }}
                                          />
                                          {r.chargeur}
                                        </div>
                                      </td>
                                      <td className="py-1.5 text-right text-[var(--color-muted)] font-mono">
                                        {r.jours}j
                                      </td>
                                      <td className="py-1.5 text-right text-[var(--color-muted)] font-mono">
                                        {r.ratio}%
                                      </td>
                                      <td className="py-1.5 text-right font-semibold text-[var(--color-ink)]">
                                        {formatEuro(r.coutAffecte)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-[var(--color-border)]">
                                    <td className="py-1.5 font-bold text-[10px] font-mono uppercase text-[var(--color-muted)]">
                                      Total
                                    </td>
                                    <td className="py-1.5 text-right font-bold text-[var(--color-muted)] font-mono">
                                      {s.joursTotal}j
                                    </td>
                                    <td className="py-1.5 text-right font-bold font-mono text-[var(--color-muted)]">
                                      100%
                                    </td>
                                    <td className="py-1.5 text-right font-bold text-[var(--color-ink)]">
                                      {formatEuro(s.coutTotal)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          ) : (
                            <p className="text-[11px] text-[var(--color-faint)] font-mono">
                              Aucune tournée SF identifiée sur cette période
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--color-border)]">
                            <div>
                              <p className="text-[9px] font-mono uppercase text-[var(--color-faint)]">Compte FEC</p>
                              <p className="text-[11px] font-mono text-[var(--color-muted)]">{s.compte_num ?? s.id}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-mono uppercase text-[var(--color-faint)]">Net versé</p>
                              <p className="text-[11px] font-mono text-[var(--color-muted)]">{formatEuro(s.net_verse)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-mono uppercase text-[var(--color-faint)]">
                                Coût total (ratio {data?.kpis?.ratioCharges?.toFixed(3)})
                              </p>
                              <p className="text-[11px] font-mono font-bold text-[var(--color-ink)]">
                                {formatEuro(s.coutTotal)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
