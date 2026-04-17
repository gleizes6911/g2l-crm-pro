import React, { useState, useEffect, useMemo } from 'react'
import {
  Users, Briefcase, Clock, AlertTriangle, UserCheck,
  UserX, TrendingUp, FileWarning,
  Activity, Building2, X, ChevronRight, ArrowUpRight,
  ArrowDownRight, Banknote
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import API_BASE from '../../config/api'
import { PageHeader, KpiCard, StatusBadge } from '../../design'
import DrillProvider, { useDrill } from '../direction/DrillDownSystem'
import { DrillRhEmploye } from '../direction/drilldowns'

const SOCIETE_DRILL_META = {
  'D & J transport': { label: 'D&J TRANSPORT', color: '#2563EB' },
  'TPS TSMC EXPRESS': { label: 'TPS TSMC EXPRESS', color: '#0d9488' },
  'HOLDING G2L': { label: 'HOLDING G2L', color: '#7c3aed' },
}

function metaSocieteDrill(nom) {
  return SOCIETE_DRILL_META[nom] || { label: nom || '—', color: '#6b7280' }
}

const TENDANCE_EFFECTIFS_MOCK = [
  { mois: 'Oct', effectif: 108 },
  { mois: 'Nov', effectif: 109 },
  { mois: 'Déc', effectif: 107 },
  { mois: 'Jan', effectif: 110 },
  { mois: 'Fév', effectif: 109 },
  { mois: 'Mar', effectif: 111 },
]

function RhDashboardContent() {
  const { push } = useDrill()
  const [employes, setEmployes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOuverte, setModalOuverte] = useState(false)
  const [societeSelectionnee, setSocieteSelectionnee] = useState(null)
  const [absencesAujourdhui, setAbsencesAujourdhui] = useState([])
  const [acomptesEnAttente, setAcomptesEnAttente] = useState(0)
  const [documentsAlertes, setDocumentsAlertes] = useState(0)
  const [loadingExtra, setLoadingExtra] = useState(true)

  const groupes = {
    'GROUPE G2L': ['HOLDING G2L', 'D & J transport', 'TPS TSMC EXPRESS'],
    'GROUPE TSM': ['TSM EXP', 'TSM LOC', 'TSM COL AMZ', 'TSM COL', 'TSM LOG', 'TSM FRET', 'HOLDING TSM']
  }

  useEffect(() => {
    fetchEmployes()
    fetchDonneesSupplementaires()
  }, [])

  const fetchEmployes = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE}/api/employes`)
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }
      const data = await response.json()
      setEmployes(data.employes || [])
      setLoading(false)
    } catch (err) {
      console.error('Erreur récupération employés:', err)
      setLoading(false)
    }
  }

  const fetchDonneesSupplementaires = async () => {
    try {
      setLoadingExtra(true)
      const today = new Date().toISOString().split('T')[0]

      const [absRes, acompteRes, docRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/absences?dateDebut=${today}&dateFin=${today}&statut=validee`),
        fetch(`${API_BASE}/api/acomptes/manager/en-attente/count`),
        fetch(`${API_BASE}/api/documents`)
      ])

      if (absRes.status === 'fulfilled' && absRes.value.ok) {
        const absData = await absRes.value.json()
        const raw = absData.absences ?? absData
        setAbsencesAujourdhui(Array.isArray(raw) ? raw : [])
      }

      if (acompteRes.status === 'fulfilled' && acompteRes.value.ok) {
        const aData = await acompteRes.value.json()
        setAcomptesEnAttente(aData.count ?? 0)
      }

      if (docRes.status === 'fulfilled' && docRes.value.ok) {
        const docs = await docRes.value.json()
        const arr = Array.isArray(docs) ? docs : []
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const expired = arr.filter((d) => d.dateExpiration && new Date(d.dateExpiration) < start).length
        setDocumentsAlertes(expired)
      }
    } catch (err) {
      console.error('Erreur données supplémentaires:', err)
    } finally {
      setLoadingExtra(false)
    }
  }

  const calculerFinPeriodeEssai = (dateEntree) => {
    if (!dateEntree) return null
    const date = new Date(dateEntree)
    date.setMonth(date.getMonth() + 2)
    return date
  }

  const finEssaiDansMoinsDe15Jours = (dateEntree) => {
    const finEssai = calculerFinPeriodeEssai(dateEntree)
    if (!finEssai) return false
    const maintenant = new Date()
    const diffJours = Math.ceil((finEssai - maintenant) / (1000 * 60 * 60 * 24))
    return diffJours > 0 && diffJours <= 15
  }

  const getStatsSociete = (nomSociete) => {
    const employesSociete = employes.filter(e => e.societe === nomSociete && e.estActif)
    const cdi = employesSociete.filter(e => e.typeContrat === 'CDI')
    const cdd = employesSociete.filter(e => e.typeContrat === 'CDD')
    const essai = employesSociete.filter(e => e.statut === "En période d'essai")
    const autre = employesSociete.filter(e =>
      e.typeContrat !== 'CDI' && e.typeContrat !== 'CDD'
    )
    const essaiMoinsDe15j = essai.filter(e => finEssaiDansMoinsDe15Jours(e.dateEntree))
    const essaiFin15j = essaiMoinsDe15j.length

    return {
      total: employesSociete.length,
      actifs: employesSociete.length,
      cdi: cdi.length,
      cdd: cdd.length,
      autre: autre.length,
      sansContrat: autre.length,
      essai: essai.length,
      essaiMoinsDe15j,
      essaiFin15j,
      employesCDI: cdi,
      employesCDD: cdd,
      employesAutre: autre,
      employesEssai: essai
    }
  }

  const statsGlobales = useMemo(() => {
    const actifs = employes.filter(e => e.estActif)
    const sortis = employes.filter(e => !e.estActif)
    const cdi = actifs.filter(e => e.typeContrat === 'CDI').length
    const cdd = actifs.filter(e => e.typeContrat === 'CDD').length
    const essai = actifs.filter(e => e.statut === "En période d'essai").length
    const essaiFin15j = actifs.filter(e =>
      e.statut === "En période d'essai" && finEssaiDansMoinsDe15Jours(e.dateEntree)
    ).length
    const sansContrat = actifs.filter(e =>
      !e.typeContrat || (e.typeContrat !== 'CDI' && e.typeContrat !== 'CDD')
    ).length

    const debutMois = new Date()
    debutMois.setDate(1)
    debutMois.setHours(0, 0, 0, 0)
    const entreesMois = actifs.filter(e => e.dateEntree && new Date(e.dateEntree) >= debutMois).length
    const sortiesMois = sortis.filter(e => e.dateSortie && new Date(e.dateSortie) >= debutMois).length

    const anciennes = actifs
      .filter(e => e.dateEntree)
      .map(e => (new Date() - new Date(e.dateEntree)) / (365.25 * 24 * 3600 * 1000))
    const ancienneteeMoy = anciennes.length > 0
      ? (anciennes.reduce((a, b) => a + b, 0) / anciennes.length).toFixed(1)
      : '0'

    const repartitionContrats = [
      { name: 'CDI', value: cdi, color: '#2563EB' },
      { name: 'CDD', value: cdd, color: '#60a5fa' },
      { name: 'Essai', value: essai, color: '#f59e0b' },
      { name: 'Autre', value: sansContrat, color: '#ef4444' },
    ].filter(d => d.value > 0)

    const repartitionSocietes = ['HOLDING G2L', 'D & J transport', 'TPS TSMC EXPRESS']
      .map(s => ({
        name: s === 'D & J transport' ? 'D&J' : s === 'TPS TSMC EXPRESS' ? 'TPS' : 'Holding',
        actifs: actifs.filter(e => e.societe === s).length,
        cdi: actifs.filter(e => e.societe === s && e.typeContrat === 'CDI').length,
        cdd: actifs.filter(e => e.societe === s && e.typeContrat === 'CDD').length,
      }))

    return {
      total: actifs.length, cdi, cdd, essai, essaiFin15j,
      sansContrat, entreesMois, sortiesMois,
      ancienneteeMoy, repartitionContrats, repartitionSocietes
    }
  }, [employes])

  const groupesFiltres = useMemo(() => {
    const result = {}
    Object.entries(groupes).forEach(([groupe, societes]) => {
      const hasActifs = societes.some(s =>
        employes.filter(e => e.societe === s && e.estActif).length > 0
      )
      if (hasActifs) result[groupe] = societes
    })
    return result
  }, [employes])

  const pct = (part, total) => (total > 0 ? ((part / total) * 100).toFixed(0) : '0')

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-20 text-[var(--color-muted)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[var(--text-sm)]">Chargement des données RH…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-full space-y-6">

      <PageHeader
        title="Dashboard RH"
        subtitle={`Groupe G2L · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        breadcrumb={['RH', 'Dashboard']}
      />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)] font-mono mb-3">
          Effectifs globaux
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <KpiCard
            label="Effectif actif"
            value={statsGlobales.total}
            icon={<Users size={14} />}
            subtitle="tous groupes"
          />
          <KpiCard
            label="CDI"
            value={statsGlobales.cdi}
            icon={<Briefcase size={14} />}
            status="success"
            subtitle={`${pct(statsGlobales.cdi, statsGlobales.total)}% des actifs`}
          />
          <KpiCard
            label="CDD"
            value={statsGlobales.cdd}
            icon={<Briefcase size={14} />}
            subtitle={`${pct(statsGlobales.cdd, statsGlobales.total)}% des actifs`}
          />
          <KpiCard
            label="Périodes d'essai"
            value={statsGlobales.essai}
            icon={<Clock size={14} />}
            status={statsGlobales.essaiFin15j > 0 ? 'warning' : 'default'}
            subtitle={statsGlobales.essaiFin15j > 0 ? `${statsGlobales.essaiFin15j} fin < 15j` : 'en cours'}
          />
          <KpiCard
            label="Entrées ce mois"
            value={statsGlobales.entreesMois}
            icon={<ArrowUpRight size={14} />}
            status={statsGlobales.entreesMois > 0 ? 'success' : 'default'}
          />
          <KpiCard
            label="Sorties ce mois"
            value={statsGlobales.sortiesMois}
            icon={<ArrowDownRight size={14} />}
            status={statsGlobales.sortiesMois > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Ancienneté moy."
            value={`${statsGlobales.ancienneteeMoy} ans`}
            icon={<Activity size={14} />}
            subtitle="collaborateurs actifs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 shadow-[var(--shadow-sm)] ${loadingExtra ? 'opacity-80' : ''}`}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={14} className="text-[var(--color-warning)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Alertes à traiter</h3>
          </div>
          <div className="space-y-2">
            <div className={`flex items-center justify-between p-3 rounded-[var(--radius-sm)] border ${
              statsGlobales.sansContrat > 0
                ? 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)]'
                : 'bg-[var(--color-success-bg)] border-[var(--color-success-border)]'
            }`}>
              <div className="flex items-center gap-2">
                <FileWarning size={13} className={statsGlobales.sansContrat > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'} />
                <span className="text-[12.5px] text-[var(--color-ink)]">Sans type de contrat</span>
              </div>
              <span className={`text-[13px] font-bold ${statsGlobales.sansContrat > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                {statsGlobales.sansContrat > 0 ? statsGlobales.sansContrat : 'OK'}
              </span>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-[var(--radius-sm)] border ${
              statsGlobales.essaiFin15j > 0
                ? 'bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]'
                : 'bg-[var(--color-success-bg)] border-[var(--color-success-border)]'
            }`}>
              <div className="flex items-center gap-2">
                <Clock size={13} className={statsGlobales.essaiFin15j > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'} />
                <span className="text-[12.5px] text-[var(--color-ink)]">Essais se terminant dans &lt; 15j</span>
              </div>
              <span className={`text-[13px] font-bold ${statsGlobales.essaiFin15j > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}>
                {statsGlobales.essaiFin15j > 0 ? statsGlobales.essaiFin15j : 'OK'}
              </span>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-[var(--radius-sm)] border ${
              acomptesEnAttente > 0
                ? 'bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]'
                : 'bg-[var(--color-success-bg)] border-[var(--color-success-border)]'
            }`}>
              <div className="flex items-center gap-2">
                <Banknote size={13} className={acomptesEnAttente > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'} />
                <span className="text-[12.5px] text-[var(--color-ink)]">Acomptes en attente de validation</span>
              </div>
              <span className={`text-[13px] font-bold ${acomptesEnAttente > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}>
                {acomptesEnAttente > 0 ? acomptesEnAttente : 'OK'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] border bg-[var(--color-bg)] border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <UserX size={13} className="text-[var(--color-muted)]" />
                <span className="text-[12.5px] text-[var(--color-ink)]">Absences validées aujourd&apos;hui</span>
              </div>
              <span className="text-[13px] font-bold text-[var(--color-ink)]">
                {absencesAujourdhui.length}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] border bg-[var(--color-bg)] border-[var(--color-border)] opacity-50">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-[var(--color-muted)]" />
                <span className="text-[12.5px] text-[var(--color-ink)]">Visites médicales à planifier</span>
              </div>
              <span className="text-[10px] font-mono text-[var(--color-faint)] uppercase tracking-wider">bientôt</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] border bg-[var(--color-bg)] border-[var(--color-border)] opacity-60">
              <div className="flex items-center gap-2">
                <FileWarning size={13} className="text-[var(--color-muted)]" />
                <span className="text-[12.5px] text-[var(--color-ink)]">Documents expirés (permis, FIMO…)</span>
              </div>
              <span className="text-[12px] font-mono text-[var(--color-muted)] tabular-nums">
                {documentsAlertes > 0 ? documentsAlertes : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Répartition des contrats</h3>
          </div>
          {statsGlobales.repartitionContrats.length === 0 ? (
            <p className="text-[var(--text-sm)] text-[var(--color-muted)] py-8 text-center">Aucune donnée à afficher</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={160} className="max-sm:!max-w-[200px] sm:w-1/2 sm:max-w-[50%]">
                <PieChart>
                  <Pie
                    data={statsGlobales.repartitionContrats}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statsGlobales.repartitionContrats.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} employés`, name]}
                    contentStyle={{
                      fontSize: '11px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'white'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 w-full min-w-0">
                {statsGlobales.repartitionContrats.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-[12px] text-[var(--color-ink-2)] truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px] font-semibold text-[var(--color-ink)]">{item.value}</span>
                      <span className="text-[10px] text-[var(--color-muted)]">
                        {pct(item.value, statsGlobales.total)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-[var(--color-primary)]" />
              <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Évolution des effectifs</h3>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-faint)] uppercase tracking-wider bg-[var(--color-bg)] px-2 py-0.5 rounded border border-[var(--color-border)]">
              6 derniers mois
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={TENDANCE_EFFECTIFS_MOCK} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="mois" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
                formatter={(v) => [`${v} employés`, 'Effectif']}
              />
              <Line
                type="monotone"
                dataKey="effectif"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ fill: '#2563EB', r: 3 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-[var(--color-faint)] font-mono mt-2">* Données illustratives — se connectera à la BDD post-migration</p>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={14} className="text-[var(--color-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Effectifs par société</h3>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={statsGlobales.repartitionSocietes} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '1px solid var(--color-border)', borderRadius: '6px' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="cdi" name="CDI" fill="#2563EB" radius={[2, 2, 0, 0]} />
              <Bar dataKey="cdd" name="CDD" fill="#93c5fd" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        {Object.entries(groupesFiltres).map(([nomGroupe, societes]) => {
          const societesAvecActifs = societes
            .map(s => ({ nom: s, stats: getStatsSociete(s) }))
            .filter(s => s.stats.actifs > 0)
          if (societesAvecActifs.length === 0) return null
          return (
            <div key={nomGroupe} className="mb-5">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider font-mono">
                  {nomGroupe}
                </h2>
                <div className="flex-1 h-px bg-[var(--color-border)]" />
                <span className="text-[10px] text-[var(--color-muted)] font-mono">
                  {societesAvecActifs.reduce((acc, s) => acc + s.stats.actifs, 0)} actifs
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {societesAvecActifs.map(({ nom, stats }) => (
                  <div
                    key={nom}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSocieteSelectionnee(nom); setModalOuverte(true) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSocieteSelectionnee(nom); setModalOuverte(true)
                      }
                    }}
                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 hover:border-[var(--color-primary)] transition-colors cursor-pointer shadow-[var(--shadow-sm)] group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--color-ink)] leading-tight">{nom}</p>
                        <p className="text-[var(--text-xs)] text-[var(--color-muted)] mt-0.5">
                          {stats.actifs} actif{stats.actifs > 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)] transition-colors mt-0.5 shrink-0" />
                    </div>
                    <div className="space-y-2 mb-3">
                      {[
                        { label: 'CDI', value: stats.cdi, color: '#2563EB' },
                        { label: 'CDD', value: stats.cdd, color: '#60a5fa' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between gap-2">
                          <span className="text-[var(--text-xs)] text-[var(--color-muted)] w-8 shrink-0 font-mono">{label}</span>
                          <div className="flex-1 h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: stats.actifs > 0 ? `${(value / stats.actifs) * 100}%` : '0%',
                                background: color
                              }}
                            />
                          </div>
                          <span className="text-[var(--text-xs)] font-semibold text-[var(--color-ink)] w-5 text-right shrink-0">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.essai > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]">
                          <Clock size={9} />
                          {stats.essai} essai{stats.essai > 1 ? 's' : ''}
                          {stats.essaiFin15j > 0 && <span className="font-semibold"> · {stats.essaiFin15j}&lt;15j</span>}
                        </span>
                      )}
                      {stats.sansContrat > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]">
                          <AlertTriangle size={9} />
                          {stats.sansContrat} sans contrat
                        </span>
                      )}
                      {stats.essai === 0 && stats.sansContrat === 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]">
                          <UserCheck size={9} />
                          Tout en ordre
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {modalOuverte && societeSelectionnee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-[var(--text-md)] font-semibold text-[var(--color-ink)]">{societeSelectionnee}</h3>
                <p className="text-[var(--text-xs)] text-[var(--color-muted)] mt-0.5">Employés actifs</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOuverte(false)}
                className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              {(() => {
                const stats = getStatsSociete(societeSelectionnee)
                const employesSociete = employes.filter(e => e.societe === societeSelectionnee && e.estActif)
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Actifs', value: stats.actifs },
                        { label: 'CDI', value: stats.cdi },
                        { label: 'CDD', value: stats.cdd },
                      ].map(({ label, value }) => (
                        <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                          <p className="text-[22px] font-bold text-[var(--color-ink)]">{value}</p>
                          <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {employesSociete.map((e) => {
                        const sm = metaSocieteDrill(societeSelectionnee)
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              push({
                                title: e.nomComplet,
                                subtitle: `${e.fonction || 'Sans fonction'} · ${sm.label}`,
                                component: DrillRhEmploye,
                                props: {
                                  employe: e,
                                  societeLabel: sm.label,
                                  color: sm.color,
                                },
                              })
                              setModalOuverte(false)
                            }}
                            className="w-full flex items-center justify-between py-2 px-3 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg)] transition-colors text-left cursor-pointer border border-transparent hover:border-[var(--color-border)]"
                          >
                            <span className="text-[var(--text-sm)] text-[var(--color-ink)]">{e.nomComplet}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {e.typeContrat && <StatusBadge label={e.typeContrat} variant="neutral" />}
                              {e.statut === "En période d'essai" && <StatusBadge label="Essai" variant="warning" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  return (
    <DrillProvider>
      <RhDashboardContent />
    </DrillProvider>
  )
}
