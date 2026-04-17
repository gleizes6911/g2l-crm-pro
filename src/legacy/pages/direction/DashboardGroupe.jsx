import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TrendingUp, Users, Truck, AlertTriangle,
  Building2, Package, Target, Activity, Euro,
  ArrowUpRight, ArrowDownRight, Zap,
  FileWarning, CheckCircle, XCircle, BarChart3,
  RefreshCw, ChevronRight, MapPin,
  Car, Navigation, PieChart as PieIcon, X,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, ComposedChart, ReferenceArea,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import API_BASE from '../../config/api'
import { StatusBadge } from '../../design'
import CaChargeursPanel from './CaChargeursPanel'
import DrillProvider, { useDrill } from './DrillDownSystem'
import {
  DrillFinanceGroupe, DrillFinanceEntite, DrillOpsChargeur, DrillFlotteVehicule,
  DrillRhGroupe,
} from './drilldowns'

const formatEuro = (v) => {
  if (v === null || v === undefined) return '—'
  const n = parseFloat(v)
  if (Number.isNaN(n)) return '—'
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)}M €`
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k €`
  return `${n.toLocaleString('fr-FR')} €`
}

const fmt = (n, suffix = '') => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return `${parseFloat(n).toLocaleString('fr-FR')}${suffix}`
}

const ALERT_STYLES = {
  danger: {
    bg: 'bg-[var(--color-danger-bg)]',
    border: 'border-[var(--color-danger-border)]',
    text: 'text-[var(--color-danger)]',
    Icon: XCircle,
  },
  warning: {
    bg: 'bg-[var(--color-warning-bg)]',
    border: 'border-[var(--color-warning-border)]',
    text: 'text-[var(--color-warning)]',
    Icon: AlertTriangle,
  },
  info: {
    bg: 'bg-[var(--color-info-bg)]',
    border: 'border-[var(--color-info-border)]',
    text: 'text-[var(--color-info)]',
    Icon: Activity,
  },
  success: {
    bg: 'bg-[var(--color-success-bg)]',
    border: 'border-[var(--color-success-border)]',
    text: 'text-[var(--color-success)]',
    Icon: CheckCircle,
  },
}

const CHART_COLORS = ['#2563EB', '#60a5fa', '#93c5fd', '#1d4ed8', '#0ea5e9', '#64748b']

function DrillDownModal({ title, subtitle, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--color-ink)]">{title}</h3>
            {subtitle && <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, action, actionLabel }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] font-mono">{title}</h2>
      </div>
      {action && (
        <button
          type="button"
          onClick={action}
          className="text-[11px] text-[var(--color-primary)] hover:underline flex items-center gap-1"
        >
          {actionLabel} <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

function Panel({ children, className = '', onClick }) {
  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] ${onClick ? 'cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:-translate-y-px transition-all duration-200 group' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}

function TauxBar({ value, max = 100 }) {
  const v = Number(value)
  const safe = Number.isFinite(v) ? v : 0
  const pct = Math.min((safe / max) * 100, 100)
  const color =
    safe >= 97 ? 'var(--color-success)' : safe >= 90 ? 'var(--color-warning)' : 'var(--color-danger)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold w-10 text-right shrink-0" style={{ color }}>
        {safe.toFixed(1)}%
      </span>
    </div>
  )
}

function Sparkline({ data, color, width = 80, height = 28 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {(() => {
        const last = data[data.length - 1]
        const x = width
        const y = height - ((last - min) / range) * (height - 4) - 2
        return <circle cx={x} cy={y} r="2.5" fill={color} />
      })()}
    </svg>
  )
}

function DashKpiCard({
  label, value, subtitle, status = 'default',
  icon: Icon, sparkData, sparkColor,
  variation, variationLabel, onClick, badge,
}) {
  const borderColor = {
    default: 'border-[var(--color-border)]',
    success: 'border-l-[3px] border-l-[var(--color-success)] border-[var(--color-border)]',
    warning: 'border-l-[3px] border-l-[var(--color-warning)] border-[var(--color-border)]',
    danger: 'border-l-[3px] border-l-[var(--color-danger)] border-[var(--color-border)]',
  }[status]

  const variationColor = variation > 0
    ? 'text-[var(--color-success)]'
    : variation < 0
      ? 'text-[var(--color-danger)]'
      : 'text-[var(--color-muted)]'

  return (
    <div
      className={`bg-[var(--color-surface)] border rounded-[var(--radius-md)] px-4 py-3 shadow-[var(--shadow-sm)] flex flex-col gap-1.5 ${borderColor} ${onClick ? 'cursor-pointer hover:shadow-[var(--shadow-md)] hover:-translate-y-px transition-all duration-150 group' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-muted)] leading-none">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]">
              {badge}
            </span>
          )}
          {Icon && <Icon size={13} className="text-[var(--color-faint)] shrink-0" />}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="text-[24px] font-bold text-[var(--color-ink)] leading-none tracking-tight">
          {value}
        </div>
        {sparkData && sparkData.length >= 2 && (
          <Sparkline data={sparkData} color={sparkColor || 'var(--color-primary)'} />
        )}
      </div>

      <div className="flex items-center gap-2 mt-0.5">
        {variation !== undefined && variation !== null && (
          <span className={`text-[11px] font-medium flex items-center gap-0.5 ${variationColor}`}>
            {variation > 0 ? '↑' : variation < 0 ? '↓' : '→'}
            {Math.abs(variation).toFixed(1)}%
          </span>
        )}
        {variationLabel && (
          <span className="text-[10px] text-[var(--color-faint)]">{variationLabel}</span>
        )}
        {variation === undefined && subtitle && (
          <span className="text-[11px] text-[var(--color-muted)]">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

const defaultTotaux = {
  ca: 0,
  charges: 0,
  resultat: 0,
  marge: 0,
  masse_salariale: 0,
  carburant: 0,
  sous_traitance: 0,
  loyers_flotte: 0,
}

function DashboardGroupeInner() {
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), 0, 1) // 1er janvier de l'année en cours

  const [dateDebut, setDateDebut] = useState(firstDay.toISOString().split('T')[0])
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const [finance, setFinance] = useState({
    societes: [],
    totaux: { ...defaultTotaux },
    structureCharges: [],
    hasFecData: false,
  })
  const [evolution, setEvolution] = useState({ chartData: [], series: [] })
  const [ops, setOps] = useState({
    globaux: {},
    chargeurs: [],
    topChauffeurs: [],
    societesOps: [],
  })
  const [flotte, setFlotte] = useState({ globaux: {}, topVehicules: [], vehiculesTempsReel: [] })
  const [alertes, setAlertes] = useState([])
  const [employes, setEmployes] = useState([])

  const [modal, setModal] = useState(null)
  const [modalData, setModalData] = useState(null)
  const [activeEntites, setActiveEntites] = useState(['D&J', 'TPS'])
  const [showProjection, setShowProjection] = useState(true)
  const { push } = useDrill()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = `dateDebut=${encodeURIComponent(dateDebut)}&dateFin=${encodeURIComponent(dateFin)}`

      const [finRes, evoRes, opsRes, flotteRes, alertesRes, empRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/dashboard-groupe/kpis-financiers?${params}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/dashboard-groupe/evolution-mensuelle`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/dashboard-groupe/kpis-ops?${params}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/dashboard-groupe/kpis-flotte?${params}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/dashboard-groupe/alertes`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/employes`).then((r) => (r.ok ? r.json() : null)),
      ])

      if (finRes.status === 'fulfilled' && finRes.value) setFinance(finRes.value)
      if (evoRes.status === 'fulfilled' && evoRes.value) setEvolution(evoRes.value)
      if (opsRes.status === 'fulfilled' && opsRes.value) setOps(opsRes.value)
      if (flotteRes.status === 'fulfilled' && flotteRes.value) setFlotte(flotteRes.value)
      if (alertesRes.status === 'fulfilled' && alertesRes.value) setAlertes(alertesRes.value.alertes || [])
      if (empRes.status === 'fulfilled' && empRes.value) setEmployes(empRes.value.employes || [])
    } catch (err) {
      console.error('Dashboard Groupe:', err)
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
      setLastRefresh(new Date())
    }
  }, [dateDebut, dateFin])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const kpisRH = useMemo(() => {
    const actifs = employes.filter((e) => e.estActif)
    const sansContrat = actifs.filter(
      (e) => !e.typeContrat || (e.typeContrat !== 'CDI' && e.typeContrat !== 'CDD')
    ).length
    const essaiFin15j = actifs.filter((e) => {
      if (e.statut !== "En période d'essai" || !e.dateEntree) return false
      const fin = new Date(e.dateEntree)
      fin.setMonth(fin.getMonth() + 2)
      const diff = Math.ceil((fin - new Date()) / (1000 * 60 * 60 * 24))
      return diff > 0 && diff <= 15
    }).length
    return { total: actifs.length, sansContrat, essaiFin15j }
  }, [employes])

  const totaux = finance.totaux || defaultTotaux

  const sparklines = useMemo(() => {
    if (!evolution.chartData?.length) return {}

    const djCA = evolution.chartData.map((d) => d['D&J_ca'] || d.DJ_ca || 0)
    const tpsCA = evolution.chartData.map((d) => d.TPS_ca || 0)
    const groupeCA = evolution.chartData.map((d) => (
      (d['D&J_ca'] || d.DJ_ca || 0) + (d.TPS_ca || 0) + (d.Holding_ca || 0)
    ))

    const varGroupe = groupeCA.length >= 2
      ? ((groupeCA[groupeCA.length - 1] - groupeCA[groupeCA.length - 2]) / (groupeCA[groupeCA.length - 2] || 1)) * 100
      : null

    return { djCA, tpsCA, groupeCA, varGroupe }
  }, [evolution.chartData])

  const donneesGraphique = useMemo(() => {
    if (!evolution.chartData?.length) return { reel: [], projection: [], complet: [] }

    const reel = evolution.chartData.map((d) => ({ mois: d.mois, ...d }))
    const derniersMois = reel.slice(-3)
    const projection = []

    if (derniersMois.length >= 2) {
      const entites = evolution.series || []
      for (let i = 1; i <= 3; i += 1) {
        const moisProj = new Date()
        moisProj.setMonth(moisProj.getMonth() + i)
        const moisLabel = moisProj.toLocaleString('fr-FR', { month: 'short' }).slice(0, 3)
        const point = { mois: moisLabel, isProjection: true }
        entites.forEach((s) => {
          const vals = (s.ca || []).slice(-3).filter((v) => v > 0)
          if (vals.length >= 2) {
            const moy = vals.reduce((a, b) => a + b, 0) / vals.length
            const tendance = (vals[vals.length - 1] - vals[0]) / vals.length
            point[`${s.nomCourt}_ca`] = Math.max(0, Math.round(moy + (tendance * i)))
          }
        })
        projection.push(point)
      }
    }

    const connexion = reel.length > 0 ? [{ ...reel[reel.length - 1], isProjection: true }] : []
    return { reel, projection, complet: [...reel, ...connexion, ...projection] }
  }, [evolution])

  const toutesAlertes = useMemo(() => {
    const list = [...alertes]
    if (kpisRH.sansContrat > 0) {
      list.unshift({
        niveau: 'danger',
        message: `${kpisRH.sansContrat} employé(s) sans type de contrat — à régulariser`,
        valeur: kpisRH.sansContrat,
        module: 'RH',
        lien: '/rh/employes',
      })
    }
    if (kpisRH.essaiFin15j > 0) {
      list.push({
        niveau: 'warning',
        message: `${kpisRH.essaiFin15j} période(s) d'essai se terminant dans moins de 15 jours`,
        valeur: kpisRH.essaiFin15j,
        module: 'RH',
        lien: '/rh/dashboard',
      })
    }
    if (finance.hasFecData && totaux.marge < 5 && totaux.marge > 0) {
      list.unshift({
        niveau: 'danger',
        message: `Marge nette groupe critique : ${totaux.marge}% (objectif ≥ 8%)`,
        valeur: totaux.marge,
        module: 'Finance',
        lien: '/direction/fec',
      })
    }
    return list
  }, [alertes, kpisRH, finance.hasFecData, totaux.marge])

  if (loading && !hasLoadedOnce) {
    return (
      <div className="p-6 flex items-center justify-center py-24 text-[var(--color-muted)]">
        <div className="text-center">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3 opacity-50" />
          <p className="text-[var(--text-sm)]">Chargement du tableau de bord groupe…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-full space-y-5" style={{ background: 'var(--color-bg)' }}>
      <div className="flex items-start justify-between gap-4 pb-5 border-b border-[var(--color-border)] flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--color-faint)]">
              DIRECTION · GROUPE G2L · PERPIGNAN
            </span>
          </div>
          <h1 className="text-[22px] font-semibold text-[var(--color-ink)] tracking-tight">Tableau de bord Groupe</h1>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
            {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}MàJ {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center gap-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-1.5 text-[12px]">
            <span className="text-[10px] text-[var(--color-muted)] font-mono">Du</span>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="text-[12px] text-[var(--color-ink)] bg-transparent outline-none"
            />
            <span className="text-[10px] text-[var(--color-muted)] font-mono">Au</span>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="text-[12px] text-[var(--color-ink)] bg-transparent outline-none"
            />
          </div>
          <button
            type="button"
            onClick={fetchAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[12px] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      <div>
        <SectionTitle
          icon={Euro}
          title="Performance financière groupe"
          action={() => {
            setModal('finance')
            setModalData(finance)
          }}
          actionLabel="Détail par entité"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashKpiCard
            label="Chiffre d'affaires"
            value={finance.hasFecData ? formatEuro(totaux.ca) : '—'}
            icon={TrendingUp}
            sparkData={sparklines.groupeCA}
            sparkColor="#2563EB"
            variation={sparklines.varGroupe}
            variationLabel="vs mois préc."
            status={finance.hasFecData ? 'default' : 'warning'}
            subtitle={!finance.hasFecData ? 'Importer un FEC' : undefined}
            onClick={() => {
              push({
                title: 'Performance financière groupe',
                subtitle: 'CA · Charges · Résultat par entité · Données FEC réelles',
                component: DrillFinanceGroupe,
                props: { finance },
              })
            }}
          />
          <DashKpiCard
            label="Charges totales"
            value={finance.hasFecData ? formatEuro(totaux.charges) : '—'}
            icon={BarChart3}
            subtitle={
              finance.hasFecData && totaux.ca > 0 ? `${((totaux.charges / totaux.ca) * 100).toFixed(0)}% du CA` : '—'
            }
            onClick={() => {
              setModal('structure')
              setModalData(finance)
            }}
          />
          <DashKpiCard
            label="Résultat net"
            value={finance.hasFecData ? formatEuro(totaux.resultat) : '—'}
            icon={totaux.resultat >= 0 ? ArrowUpRight : ArrowDownRight}
            status={!finance.hasFecData ? 'default' : totaux.resultat > 0 ? 'success' : 'danger'}
            subtitle={finance.hasFecData ? `Marge ${totaux.marge}%` : '—'}
            onClick={() => {
              setModal('finance')
              setModalData(finance)
            }}
          />
          <DashKpiCard
            label="Marge nette"
            value={finance.hasFecData ? `${totaux.marge}%` : '—'}
            icon={Target}
            status={
              !finance.hasFecData ? 'default' : totaux.marge >= 8 ? 'success' : totaux.marge >= 4 ? 'warning' : 'danger'
            }
            subtitle="Objectif : ≥ 8%"
            badge={finance.hasFecData && totaux.marge < 8 ? '⚠ Sous objectif' : undefined}
            onClick={() => {
              setModal('finance')
              setModalData(finance)
            }}
          />
        </div>
      </div>

      <div>
        <SectionTitle
          icon={Truck}
          title="Performance opérationnelle"
          action={() => {
            setModal('chargeurs')
            setModalData(ops)
          }}
          actionLabel="Détail chargeurs"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashKpiCard
            label="ODs réalisées"
            value={fmt(ops.globaux?.nbOds)}
            icon={Truck}
            subtitle="ordres de dispatch"
            onClick={() => {
              push({
                title: 'Ordres de service',
                subtitle: `${dateDebut} → ${dateFin} · ${ops.globaux?.nbOds || 0} ODS`,
                component: DrillOpsChargeur,
                props: {
                  chargeurNom: 'tous',
                  chargeurs: ops.chargeurs || [],
                  dateDebut,
                  dateFin,
                },
              })
            }}
          />
          <DashKpiCard
            label="Colis traités"
            value={fmt(ops.globaux?.totalPec)}
            icon={Package}
            subtitle={`${fmt(ops.globaux?.totalLivres)} livrés`}
            onClick={() => {
              push({
                title: 'Colis traités',
                subtitle: `${dateDebut} → ${dateFin} · ${(ops.globaux?.totalPec || 0).toLocaleString('fr-FR')} colis`,
                component: DrillOpsChargeur,
                props: {
                  chargeurNom: 'tous',
                  chargeurs: ops.chargeurs || [],
                  dateDebut,
                  dateFin,
                },
              })
            }}
          />
          <DashKpiCard
            label="Taux de livraison"
            value={ops.globaux?.tauxGlobal != null ? `${ops.globaux.tauxGlobal}%` : '—'}
            icon={Target}
            status={
              ops.globaux?.tauxGlobal == null
                ? 'default'
                : ops.globaux.tauxGlobal >= 97
                  ? 'success'
                  : ops.globaux.tauxGlobal >= 90
                    ? 'warning'
                    : 'danger'
            }
            subtitle="Objectif : ≥ 97%"
            onClick={() => {
              push({
                title: 'Performance opérationnelle',
                subtitle: `${dateDebut} → ${dateFin} · Source Salesforce`,
                component: DrillOpsChargeur,
                props: {
                  chargeurNom: 'tous',
                  chargeurs: ops.chargeurs || [],
                  dateDebut,
                  dateFin,
                },
              })
            }}
          />
          <DashKpiCard
            label="Km parcourus"
            value={ops.globaux?.totalKmReel != null ? `${fmt(ops.globaux.totalKmReel)} km` : '—'}
            icon={Navigation}
            subtitle="km réels Salesforce"
            onClick={() => {
              setModal('chargeurs')
              setModalData(ops)
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashKpiCard
          label="Effectif actif"
          value={kpisRH.total}
          icon={Users}
          subtitle="tous groupes"
          onClick={() => {
            push({
              title: 'Ressources Humaines',
              subtitle: `${kpisRH.total || 0} actifs · Données Salesforce`,
              component: DrillRhGroupe,
              props: {},
            })
          }}
        />
        <DashKpiCard
          label="Sans contrat"
          value={kpisRH.sansContrat}
          icon={FileWarning}
          status={kpisRH.sansContrat > 0 ? 'danger' : 'success'}
          subtitle={kpisRH.sansContrat > 0 ? 'à régulariser' : 'tout est en ordre'}
          onClick={() => {
            push({
              title: 'Employés sans contrat',
              subtitle: 'À régulariser · Données Salesforce',
              component: DrillRhGroupe,
              props: {},
            })
          }}
        />
        <DashKpiCard
          label="Véhicules actifs"
          value={flotte.globaux?.vehiculesActifs != null ? flotte.globaux.vehiculesActifs : '—'}
          icon={Car}
          subtitle={`${fmt(flotte.globaux?.kmTotaux)} km sur la période`}
          onClick={() => {
            push({
              title: 'Flotte Webfleet',
              subtitle: `${flotte.globaux?.vehiculesActifs} véhicules · GPS temps réel`,
              component: DrillFlotteVehicule,
              props: { flotte },
            })
          }}
        />
        <DashKpiCard
          label="Score conduite"
          value={flotte.globaux?.scoreConduite != null ? `${flotte.globaux.scoreConduite}%` : '—'}
          icon={Activity}
          status={
            flotte.globaux?.scoreConduite == null
              ? 'default'
              : flotte.globaux.scoreConduite >= 80
                ? 'success'
                : flotte.globaux.scoreConduite >= 60
                  ? 'warning'
                  : 'danger'
          }
          subtitle="Webfleet OptiDrive"
          onClick={() => {
            setModal('flotte')
            setModalData(flotte)
          }}
        />
      </div>

      {toutesAlertes.length > 0 && (
        <Panel>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-[var(--color-warning)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Alertes groupe</h3>
            <span className="ml-auto text-[10px] font-mono text-[var(--color-muted)]">
              {toutesAlertes.length} alerte{toutesAlertes.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1.5">
            {toutesAlertes.map((a, i) => {
              const s = ALERT_STYLES[a.niveau] || ALERT_STYLES.info
              const IconA = s.Icon
              return (
                <div
                  key={`${a.message}-${i}`}
                  className={`flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] border cursor-pointer hover:opacity-80 transition-opacity ${s.bg} ${s.border}`}
                  onClick={() => a.lien && (window.location.href = a.lien)}
                  role="presentation"
                >
                  <IconA size={13} className={`shrink-0 ${s.text}`} />
                  <span className="flex-1 text-[12.5px] text-[var(--color-ink)]">{a.message}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${s.text} ${s.bg} ${s.border}`}>
                    {a.module}
                  </span>
                  <ChevronRight size={12} className="text-[var(--color-faint)] shrink-0" />
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-[var(--color-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Évolution CA mensuel</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: 'D&J', color: '#2563EB', label: 'D&J Transport' },
                { key: 'TPS', color: '#0d9488', label: 'TPS Express' },
                { key: 'Holding', color: '#7c3aed', label: 'Holding G2L' },
              ].map(({ key, color, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveEntites((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]))}
                  className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border transition-all ${
                    activeEntites.includes(key)
                      ? 'text-white border-transparent'
                      : 'text-[var(--color-muted)] bg-[var(--color-bg)] border-[var(--color-border)]'
                  }`}
                  style={activeEntites.includes(key) ? { background: color, borderColor: color } : {}}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeEntites.includes(key) ? 'white' : color }} />
                  {label}
                </button>
              ))}
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
                Projection
              </button>
            </div>
          </div>

          {donneesGraphique.reel.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={showProjection ? donneesGraphique.complet : donneesGraphique.reel}
                  margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
                >
                  <defs>
                    {[
                      { key: 'D&J', color: '#2563EB' },
                      { key: 'TPS', color: '#0d9488' },
                      { key: 'Holding', color: '#7c3aed' },
                    ].map(({ key, color }) => (
                      <linearGradient key={key} id={`grad${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'white' }}
                    formatter={(v, name) => [formatEuro(v), String(name).replace('_ca', ' CA')]}
                    labelFormatter={(label, payload) => `${label}${payload?.[0]?.payload?.isProjection ? ' (projection)' : ''}`}
                  />
                  {showProjection && donneesGraphique.projection.length > 0 && (
                    <ReferenceArea
                      x={donneesGraphique.reel[donneesGraphique.reel.length - 1]?.mois}
                      x2={donneesGraphique.projection[donneesGraphique.projection.length - 1]?.mois}
                      fill="var(--color-bg)"
                      fillOpacity={0.6}
                      label={{
                        value: 'Projection',
                        position: 'insideTopRight',
                        fontSize: 9,
                        fill: 'var(--color-faint)',
                        fontFamily: 'monospace',
                      }}
                    />
                  )}
                  {[
                    { key: 'D&J', color: '#2563EB' },
                    { key: 'TPS', color: '#0d9488' },
                    { key: 'Holding', color: '#7c3aed' },
                  ].filter((e) => activeEntites.includes(e.key)).map(({ key, color }) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={`${key}_ca`}
                      name={`${key} CA`}
                      stroke={color}
                      strokeWidth={2}
                      fill={`url(#grad${key})`}
                      dot={false}
                      activeDot={{ r: 4, fill: color }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>

              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-[var(--color-ink)]" />
                  <span className="text-[10px] text-[var(--color-muted)] font-mono">Données FEC réelles</span>
                </div>
                {showProjection && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 border-t-2 border-dashed border-[var(--color-muted)]" />
                    <span className="text-[10px] text-[var(--color-muted)] font-mono">Projection (moy. mobile 3 mois)</span>
                  </div>
                )}
                <div className="ml-auto text-[9px] text-[var(--color-faint)] font-mono">
                  {donneesGraphique.reel.length} mois · Budget prévu Q3 2026
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--color-muted)]">
              <BarChart3 size={28} className="mb-2 opacity-20" />
              <p className="text-[12px]">Importez un FEC pour afficher l&apos;évolution</p>
              <a href="/direction/fec" className="mt-2 text-[11px] text-[var(--color-primary)] hover:underline">
                Aller au Dashboard FEC →
              </a>
            </div>
          )}
        </Panel>

        <Panel
          onClick={() => {
            setModal('structure')
            setModalData(finance)
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <PieIcon size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Structure charges</h3>
          </div>
          {finance.structureCharges?.length > 0 && totaux.charges > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={finance.structureCharges}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={58}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {finance.structureCharges.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatEuro(v)]}
                    contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {finance.structureCharges.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-[11px] text-[var(--color-ink-2)]">{item.name}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--color-ink)]">
                      {totaux.charges > 0 ? `${((item.value / totaux.charges) * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-[var(--color-muted)]">
              <PieIcon size={24} className="mb-2 opacity-20" />
              <p className="text-[11px] text-center">Disponible après import FEC</p>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-[var(--color-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Performance chargeurs</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setModal('chargeurs')
                setModalData(ops)
              }}
              className="text-[11px] text-[var(--color-primary)] hover:underline flex items-center gap-1"
            >
              Détail <ChevronRight size={11} />
            </button>
          </div>
          {ops.chargeurs?.length > 0 ? (
            <div className="space-y-2.5">
              {ops.chargeurs.slice(0, 6).map((c, i) => (
                <div
                  key={c.nom}
                  className="cursor-pointer hover:bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-1.5 -mx-1.5 transition-colors"
                  onClick={() => {
                    push({
                      title: c.nom,
                      subtitle: `Performance · ${dateDebut} → ${dateFin}`,
                      component: DrillOpsChargeur,
                      props: { chargeurNom: c.nom, dateDebut, dateFin },
                    })
                  }}
                  role="presentation"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[var(--color-faint)] w-4 shrink-0">{i + 1}</span>
                    <span className="text-[12.5px] font-medium text-[var(--color-ink)] flex-1 truncate">{c.nom}</span>
                    <span className="text-[10px] text-[var(--color-muted)] shrink-0">
                      {(c.colisPec || 0).toLocaleString('fr-FR')} colis
                    </span>
                  </div>
                  <div className="pl-6">
                    <TauxBar value={c.taux || 0} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-[var(--color-muted)]">
              <Package size={24} className="mb-2 opacity-20" />
              <p className="text-[12px]">Sélectionnez une période avec des données</p>
            </div>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Scorecard entités</h3>
          </div>
          {finance.societes?.length > 0 ? (
            <div className="divide-y divide-[var(--color-border)]">
              {finance.societes.map((s) => (
                <div
                  key={s.nom}
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-[var(--color-bg)] rounded-[var(--radius-sm)] px-2 -mx-2 transition-colors"
                  onClick={() => {
                    push({
                      title: s.nom,
                      subtitle: `Détail financier · Données FEC · SIREN ${s.siren}`,
                      component: DrillFinanceEntite,
                      props: { societe: s, societeId: s.societeId },
                    })
                  }}
                  role="presentation"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-[var(--color-ink)] truncate">{s.nom}</p>
                    <p className="text-[10px] text-[var(--color-muted)] font-mono">
                      CA : {formatEuro(s.ca)} · Charges : {formatEuro(s.charges)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p
                        className={`text-[14px] font-bold ${s.resultat >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
                      >
                        {s.marge}%
                      </p>
                      <p className="text-[9px] text-[var(--color-faint)] font-mono">marge</p>
                    </div>
                    <StatusBadge
                      label={s.marge >= 8 ? 'Excellent' : s.marge >= 4 ? 'Correct' : s.marge >= 0 ? 'Vigilance' : 'Déficitaire'}
                      variant={s.marge >= 8 ? 'success' : s.marge >= 4 ? 'info' : s.marge >= 0 ? 'warning' : 'danger'}
                    />
                    <ChevronRight size={13} className="text-[var(--color-faint)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-[var(--color-muted)]">
              <Building2 size={24} className="mb-2 opacity-20" />
              <p className="text-[12px]">Importez un FEC pour voir le scorecard</p>
            </div>
          )}
        </Panel>
      </div>

      <div>
        <SectionTitle icon={Euro} title="CA & Rentabilité par chargeur" />
        <CaChargeursPanel dateDebut={dateDebut} dateFin={dateFin} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-[var(--color-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Flotte temps réel</h3>
              <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                LIVE
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setModal('vehicules')
                setModalData(flotte)
              }}
              className="text-[11px] text-[var(--color-primary)] hover:underline flex items-center gap-1"
            >
              Tous les véhicules <ChevronRight size={11} />
            </button>
          </div>
          <div className="space-y-1.5">
            {flotte.vehiculesTempsReel?.slice(0, 8).map((v, i) => (
              <div
                key={v.immatriculation || i}
                className="flex items-center gap-3 p-2 rounded-[var(--radius-sm)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${v.statut === 'en_route' ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-faint)]'}`}
                />
                <span className="text-[11px] font-mono font-medium text-[var(--color-ink)] w-20 shrink-0">
                  {v.immatriculation}
                </span>
                <span className="text-[11px] text-[var(--color-muted)] flex-1 truncate">
                  {typeof v.position === 'string' ? v.position.split(',')[0] : '—'}
                </span>
                <span
                  className={`text-[10px] font-mono shrink-0 ${v.statut === 'en_route' ? 'text-[var(--color-success)]' : 'text-[var(--color-faint)]'}`}
                >
                  {v.statut === 'en_route' ? '● EN ROUTE' : '○ ARRÊTÉ'}
                </span>
              </div>
            ))}
            {!flotte.vehiculesTempsReel?.length && (
              <div className="flex flex-col items-center justify-center h-24 text-[var(--color-muted)]">
                <Car size={20} className="mb-2 opacity-20" />
                <p className="text-[11px]">Données Webfleet non disponibles</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-[var(--color-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Top chauffeurs</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setModal('chauffeurs')
                setModalData(ops)
              }}
              className="text-[11px] text-[var(--color-primary)] hover:underline flex items-center gap-1"
            >
              Classement complet <ChevronRight size={11} />
            </button>
          </div>
          {ops.topChauffeurs?.length > 0 ? (
            <div className="space-y-2">
              {ops.topChauffeurs.slice(0, 8).map((c, i) => (
                <div
                  key={c.nom}
                  className="cursor-pointer hover:bg-[var(--color-bg)] rounded-[var(--radius-sm)] p-1.5 -mx-1.5 transition-colors"
                  onClick={() => {
                    setModal('chauffeur-detail')
                    setModalData(c)
                  }}
                  role="presentation"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[var(--color-faint)] w-4 shrink-0">{i + 1}</span>
                    <span className="text-[12px] font-medium text-[var(--color-ink)] flex-1 truncate">{c.nom}</span>
                    <span className="text-[10px] text-[var(--color-muted)] shrink-0">{c.colisPec} colis</span>
                  </div>
                  <div className="pl-6">
                    <TauxBar value={c.taux || 0} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 text-[var(--color-muted)]">
              <Users size={20} className="mb-2 opacity-20" />
              <p className="text-[11px]">Sélectionnez une période avec des données SF</p>
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-[var(--color-faint)]" />
          <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Modules en préparation</h3>
          <span className="text-[10px] font-mono text-[var(--color-faint)] bg-[var(--color-bg)] px-2 py-0.5 rounded border border-[var(--color-border)]">
            Post-migration Salesforce
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Euro, label: 'Trésorerie prévisionnelle', detail: 'J+30 / J+60 / J+90 · EBICS', color: 'var(--color-primary)' },
            { icon: Target, label: 'Budget vs Réalisé', detail: 'CA · Charges · Marge · KPIs', color: 'var(--color-success)' },
            { icon: Activity, label: 'TICPE', detail: 'Remboursements gazole · Déclarations', color: 'var(--color-warning)' },
            { icon: BarChart3, label: 'Coût par tournée', detail: 'Carburant réel · Masse salariale · Marge', color: 'var(--color-info)' },
          ].map(({ icon: Icon, label, detail, color }) => (
            <div
              key={label}
              className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] border border-dashed border-[var(--color-border)] opacity-60"
            >
              <Icon size={16} className="mb-2" style={{ color }} />
              <p className="text-[12px] font-medium text-[var(--color-ink)] mb-1">{label}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">CA par entité (k€) · FEC</h3>
          </div>
          {finance.societes?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={finance.societes.map((s) => ({
                  name: s.nomCourt || s.nom?.slice(0, 12) || '—',
                  caK: Math.max(0, Math.round(s.ca / 1000)),
                }))}
                margin={{ top: 4, right: 4, bottom: 0, left: -15 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
                  formatter={(v) => [`${v} k€`, 'CA']}
                />
                <Bar dataKey="caK" name="CA (k€)" fill="#2563EB" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[12px] text-[var(--color-muted)] py-8 text-center">Import FEC requis</p>
          )}
        </Panel>
        <Panel>
          <div className="flex items-center gap-2 mb-3">
            <Truck size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Ops par employeur (colis)</h3>
          </div>
          {ops.societesOps?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ops.societesOps} margin={{ top: 4, right: 4, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="nom" tick={{ fontSize: 9, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="colisPec" name="PEC" fill="#2563EB" radius={[2, 2, 0, 0]} />
                <Bar dataKey="colisLivres" name="Livrés" fill="#93c5fd" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[12px] text-[var(--color-muted)] py-8 text-center">Aucune donnée opérationnelle sur la période</p>
          )}
        </Panel>
      </div>

      {modal === 'finance' && modalData && (
        <DrillDownModal title="Détail financier par entité" subtitle="Données FEC réelles" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'CA Groupe', value: formatEuro(modalData.totaux?.ca) },
                { label: 'Résultat', value: formatEuro(modalData.totaux?.resultat) },
                { label: 'Marge', value: `${modalData.totaux?.marge ?? '—'}%` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                  <p className="text-[20px] font-bold text-[var(--color-ink)]">{value}</p>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead>
                  <tr className="bg-[var(--color-bg)] text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wider">
                    <th className="text-left p-2 border-b border-[var(--color-border)]">Entité</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">CA</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Charges</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Résultat</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Marge</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Masse sal.</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Carburant</th>
                  </tr>
                </thead>
                <tbody>
                  {modalData.societes?.map((s) => (
                    <tr key={s.nom} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="p-2 font-medium">{s.nom}</td>
                      <td className="p-2 text-right">{formatEuro(s.ca)}</td>
                      <td className="p-2 text-right">{formatEuro(s.charges)}</td>
                      <td
                        className={`p-2 text-right font-semibold ${s.resultat >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
                      >
                        {formatEuro(s.resultat)}
                      </td>
                      <td
                        className={`p-2 text-right font-bold ${s.marge >= 8 ? 'text-[var(--color-success)]' : s.marge >= 4 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'}`}
                      >
                        {s.marge}%
                      </td>
                      <td className="p-2 text-right text-[var(--color-muted)]">{formatEuro(s.masse_salariale)}</td>
                      <td className="p-2 text-right text-[var(--color-muted)]">{formatEuro(s.carburant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DrillDownModal>
      )}

      {modal === 'structure' && modalData && (
        <DrillDownModal
          title="Structure des charges groupe"
          subtitle="Ventilation par nature comptable · Données FEC réelles"
          onClose={() => setModal(null)}
        >
          <div className="space-y-3">
            {modalData.structureCharges?.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
                <span className="text-[13px] text-[var(--color-ink)] flex-1">{item.name}</span>
                <span className="text-[13px] font-semibold text-[var(--color-ink)]">{formatEuro(item.value)}</span>
                <span className="text-[11px] text-[var(--color-muted)] w-12 text-right">
                  {modalData.totaux?.charges > 0 ? `${((item.value / modalData.totaux.charges) * 100).toFixed(1)}%` : '—'}
                </span>
                <div className="w-32 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: item.color,
                      width: `${modalData.totaux?.charges > 0 ? (item.value / modalData.totaux.charges) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="pt-3 border-t border-[var(--color-border)] flex justify-between">
              <span className="text-[13px] font-semibold">Total charges</span>
              <span className="text-[13px] font-bold text-[var(--color-ink)]">{formatEuro(modalData.totaux?.charges)}</span>
            </div>
          </div>
        </DrillDownModal>
      )}

      {modal === 'chargeurs' && modalData && (
        <DrillDownModal title="Performance détaillée par chargeur" subtitle="Source : Salesforce ODs & Courses" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'ODs totales', value: fmt(modalData.globaux?.nbOds) },
                { label: 'Taux livraison', value: `${modalData.globaux?.tauxGlobal ?? 0}%` },
                { label: 'Colis traités', value: fmt(modalData.globaux?.totalPec) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                  <p className="text-[18px] font-bold text-[var(--color-ink)]">{value}</p>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase">{label}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[var(--color-bg)] text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wider">
                    <th className="text-left p-2 border-b border-[var(--color-border)]">Chargeur</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Colis PEC</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Livrés</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Retours</th>
                    <th className="text-left p-2 border-b border-[var(--color-border)]">Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {modalData.chargeurs?.map((c) => (
                    <tr key={c.nom} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="p-2 font-medium">{c.nom}</td>
                      <td className="p-2 text-right">{(c.colisPec || 0).toLocaleString('fr-FR')}</td>
                      <td className="p-2 text-right text-[var(--color-success)]">{(c.colisLivres || 0).toLocaleString('fr-FR')}</td>
                      <td className="p-2 text-right text-[var(--color-warning)]">{(c.colisRetour || 0).toLocaleString('fr-FR')}</td>
                      <td className="p-2">
                        <TauxBar value={c.taux || 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DrillDownModal>
      )}

      {modal === 'chauffeurs' && modalData && (
        <DrillDownModal title="Classement chauffeurs" subtitle="Par volume de colis traités · Source Salesforce" onClose={() => setModal(null)}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[var(--color-bg)] text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wider">
                  <th className="text-left p-2 border-b border-[var(--color-border)]">#</th>
                  <th className="text-left p-2 border-b border-[var(--color-border)]">Chauffeur</th>
                  <th className="text-left p-2 border-b border-[var(--color-border)]">Employeur</th>
                  <th className="text-right p-2 border-b border-[var(--color-border)]">ODs</th>
                  <th className="text-right p-2 border-b border-[var(--color-border)]">Colis PEC</th>
                  <th className="text-left p-2 border-b border-[var(--color-border)]">Taux</th>
                </tr>
              </thead>
              <tbody>
                {modalData.topChauffeurs?.map((c, i) => (
                  <tr key={c.nom} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="p-2 font-mono text-[var(--color-faint)]">{i + 1}</td>
                    <td className="p-2 font-medium">{c.nom}</td>
                    <td className="p-2 text-[var(--color-muted)]">{c.employeur || '—'}</td>
                    <td className="p-2 text-right">{c.nbOds}</td>
                    <td className="p-2 text-right font-semibold">{c.colisPec.toLocaleString('fr-FR')}</td>
                    <td className="p-2 w-36">
                      <TauxBar value={c.taux || 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DrillDownModal>
      )}

      {modal === 'flotte' && modalData && (
        <DrillDownModal title="KPIs Flotte Webfleet" subtitle="Données GPS" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Véhicules actifs', value: fmt(modalData.globaux?.vehiculesActifs) },
                { label: 'Km totaux', value: `${fmt(modalData.globaux?.kmTotaux)} km` },
                { label: 'Score conduite', value: `${modalData.globaux?.scoreConduite ?? 0}%` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                  <p className="text-[18px] font-bold text-[var(--color-ink)]">{value}</p>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase">{label}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[var(--color-bg)] text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wider">
                    <th className="text-left p-2 border-b border-[var(--color-border)]">Immat.</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Trajets</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Km</th>
                    <th className="text-right p-2 border-b border-[var(--color-border)]">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {modalData.topVehicules?.map((v) => (
                    <tr key={v.immatriculation} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="p-2 font-mono font-medium">{v.immatriculation}</td>
                      <td className="p-2 text-right">{v.nbTrajets}</td>
                      <td className="p-2 text-right">{v.km} km</td>
                      <td className="p-2 text-right">
                        <span
                          className={
                            v.scoreConduite >= 80
                              ? 'text-[var(--color-success)]'
                              : v.scoreConduite >= 60
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-danger)]'
                          }
                        >
                          {v.scoreConduite || '—'}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DrillDownModal>
      )}

      {modal === 'vehicules' && modalData && (
        <DrillDownModal
          title="Flotte temps réel"
          subtitle={`${modalData.vehiculesTempsReel?.length || 0} véhicules actifs · Webfleet`}
          onClose={() => setModal(null)}
        >
          <div className="space-y-1.5">
            {modalData.vehiculesTempsReel?.map((v, i) => (
              <div key={v.immatriculation || i} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${v.statut === 'en_route' ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-faint)]'}`}
                />
                <span className="font-mono text-[12px] font-medium w-20 shrink-0">{v.immatriculation}</span>
                <span className="text-[11px] text-[var(--color-muted)] flex-1 truncate">{v.position || '—'}</span>
                <span
                  className={`text-[10px] font-mono shrink-0 ${v.statut === 'en_route' ? 'text-[var(--color-success)]' : 'text-[var(--color-faint)]'}`}
                >
                  {v.statut === 'en_route' ? '● EN ROUTE' : '○ ARRÊTÉ'}
                </span>
              </div>
            ))}
          </div>
        </DrillDownModal>
      )}

      {modal === 'societe' && modalData && (
        <DrillDownModal title={modalData.nom} subtitle="Détail financier complet · Données FEC" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Chiffre d'affaires", value: formatEuro(modalData.ca) },
                { label: 'Charges totales', value: formatEuro(modalData.charges) },
                { label: 'Résultat net', value: formatEuro(modalData.resultat), highlight: modalData.resultat >= 0 },
                { label: 'Marge nette', value: `${modalData.marge}%`, highlight: modalData.marge >= 4 },
                { label: 'Masse salariale', value: formatEuro(modalData.masse_salariale) },
                { label: 'Carburant (FEC)', value: formatEuro(modalData.carburant) },
                { label: 'Sous-traitance', value: formatEuro(modalData.sous_traitance) },
                { label: 'Loyers flotte', value: formatEuro(modalData.loyers_flotte) },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                  <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mb-1">{label}</p>
                  <p
                    className={`text-[16px] font-bold ${highlight === true ? 'text-[var(--color-success)]' : highlight === false ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-[var(--color-border)]">
              <p className="text-[10px] text-[var(--color-faint)] font-mono">
                {modalData.nbEcritures?.toLocaleString('fr-FR')} écritures FEC analysées
              </p>
            </div>
          </div>
        </DrillDownModal>
      )}

      {modal === 'evolution' && modalData && (
        <DrillDownModal title="Évolution CA mensuelle" subtitle="Série par entité · FEC" onClose={() => setModal(null)}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[var(--color-bg)]">
                  <th className="text-left p-2 border-b border-[var(--color-border)]">Mois</th>
                  {(modalData.series || []).map((s) => (
                    <th key={s.nom} className="text-right p-2 border-b border-[var(--color-border)] whitespace-nowrap">
                      {s.nomCourt} CA
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(modalData.chartData || []).map((row, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)]">
                    <td className="p-2 font-mono">{row.mois}</td>
                    {(modalData.series || []).map((s) => (
                      <td key={s.nom} className="p-2 text-right">
                        {formatEuro(row[`${s.nomCourt}_ca`] || 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DrillDownModal>
      )}

      {modal === 'chargeur-detail' && modalData && (
        <DrillDownModal title={modalData.nom} subtitle="Détail chargeur" onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
              <p className="text-[10px] text-[var(--color-muted)] font-mono">Colis PEC</p>
              <p className="text-[18px] font-bold">{(modalData.colisPec || 0).toLocaleString('fr-FR')}</p>
            </div>
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
              <p className="text-[10px] text-[var(--color-muted)] font-mono">Livrés</p>
              <p className="text-[18px] font-bold text-[var(--color-success)]">{(modalData.colisLivres || 0).toLocaleString('fr-FR')}</p>
            </div>
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)] col-span-2">
              <p className="text-[10px] text-[var(--color-muted)] font-mono mb-2">Taux livraison</p>
              <TauxBar value={modalData.taux || 0} />
            </div>
          </div>
        </DrillDownModal>
      )}

      {modal === 'chauffeur-detail' && modalData && (
        <DrillDownModal title={modalData.nom} subtitle={modalData.employeur || ''} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
              <p className="text-[10px] text-[var(--color-muted)] font-mono">ODs</p>
              <p className="text-[18px] font-bold">{modalData.nbOds ?? '—'}</p>
            </div>
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
              <p className="text-[10px] text-[var(--color-muted)] font-mono">Colis PEC</p>
              <p className="text-[18px] font-bold">{(modalData.colisPec || 0).toLocaleString('fr-FR')}</p>
            </div>
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)] col-span-2">
              <p className="text-[10px] text-[var(--color-muted)] font-mono mb-2">Taux</p>
              <TauxBar value={modalData.taux || 0} />
            </div>
          </div>
        </DrillDownModal>
      )}
    </div>
  )
}

export default function DashboardGroupe() {
  return (
    <DrillProvider>
      <DashboardGroupeInner />
    </DrillProvider>
  )
}
