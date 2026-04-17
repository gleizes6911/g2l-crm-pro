import { useCallback, useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import KpiCard from '../components/KpiCard'
import ProgressBar from '../components/ProgressBar'
import ViewTopBar from '../components/ViewTopBar'
import DrillDownModal, { DRILL_COLUMNS_BASE } from '../components/DrillDownModal'
import { barOptions, doughnutOptions } from './common'
import { fmt, fmtK, pct, yoyKpiDisplay, yoyPlVariationDisplay } from '../utils/formatters'
import { MN } from '../utils/constants'
import { rawToDrillDisplay, filterPlLine } from '../utils/fecDrillHelpers'

function formatMonthRangeFr(monthKeys) {
  if (!monthKeys?.length) return ''
  const labs = monthKeys.map((mm) => MN[parseInt(mm, 10)] || mm).filter(Boolean)
  if (!labs.length) return ''
  if (labs.length === 1) return labs[0]
  return `${labs[0]}–${labs[labs.length - 1]}`
}

/** Montant et % CA séparés pour le tableau P&L N / N-1 */
function plYoyCells(line, co) {
  const v = line.amount(co)
  if (line.id === 'ca') return { amt: <span>{fmt(co.ca)}</span>, pct: '100%' }
  if (line.id === 'avant')
    return {
      amt: <strong className={co.rBrut >= 0 ? 'fec-dp' : 'fec-dn'}>{fmt(co.rBrut)}</strong>,
      pct: pct(co.rBrut, co.ca),
    }
  if (line.id === 'net')
    return {
      amt: <strong>{fmt(co.rNet)}</strong>,
      pct: pct(co.rNet, co.ca),
    }
  if (line.id === 'is')
    return {
      amt: <span className="fec-dn">-{fmt(co.is)}</span>,
      pct: pct(co.is, co.ca),
    }
  return {
    amt: (
      <span className={v < 0 ? 'fec-dn' : ''}>
        {v < 0 ? '-' : ''}
        {fmt(Math.abs(v))}
      </span>
    ),
    pct: pct(Math.abs(v), co.ca),
  }
}

const PL_LINES = [
  { id: 'ca', label: 'Chiffre d\'affaires', amount: (c) => c.ca, indent: false },
  { id: 'chExt', label: 'Ch.ext.', amount: (c) => -c.chExt, indent: true },
  { id: 'massSal', label: 'Masse sal.', amount: (c) => -c.massSal, indent: true },
  { id: 'imp', label: 'Impôts & taxes', amount: (c) => -c.imp, indent: true },
  { id: 'amort', label: 'Amortissements', amount: (c) => -c.amort, indent: true },
  { id: 'avant', label: 'Résultat avant IS', amount: (c) => c.rBrut, indent: false, total: true },
  { id: 'is', label: 'IS', amount: (c) => -c.is, indent: true },
  { id: 'net', label: 'Résultat net', amount: (c) => c.rNet, indent: false, net: true },
]

export default function Synthese({ c, go, hasMulti, curView, fecPeriod, yoyCompareMode, setYoyCompareMode }) {
  const fecRows = c.fecRows || []
  const [drill, setDrill] = useState(null)

  const ym = c.yoyMeta
  const p1Full = c.yoyPrev
  const p1Same = c.yoyPrevSameMonths
  const showYoy = p1Full && c.activeExerciceMode !== 'all'
  const periodsIncomparable = Boolean(ym && !ym.periodsComparable)
  const showYoyToggle = showYoy && periodsIncomparable
  const effectiveYoyMode = periodsIncomparable ? (yoyCompareMode || 'full') : 'full'

  const p1 = useMemo(() => {
    if (!p1Full) return null
    if (!periodsIncomparable) return p1Full
    if (effectiveYoyMode === 'sameMonths' && p1Same) return p1Same
    return p1Full
  }, [p1Full, p1Same, periodsIncomparable, effectiveYoyMode])

  const vsLabelKpi = useMemo(() => {
    if (!ym) return p1Full ? `vs ${p1Full.year}` : ''
    if (!periodsIncomparable) return `vs ${ym.prevYear}`
    if (effectiveYoyMode === 'full') return `vs ${ym.prevYear} complet`
    return `vs ${formatMonthRangeFr(ym.monthKeysN)} ${ym.prevYear}`
  }, [ym, p1Full, periodsIncomparable, effectiveYoyMode])

  const n1PlHeader = useMemo(() => {
    if (!p1 || !ym) return p1 ? `N-1 (${p1.year})` : 'N-1'
    if (periodsIncomparable && effectiveYoyMode === 'full') return `N-1 ${ym.prevYear} complet`
    if (periodsIncomparable && effectiveYoyMode === 'sameMonths') return `N-1 ${formatMonthRangeFr(ym.monthKeysN)} ${ym.prevYear}`
    return `N-1 (${ym.prevYear})`
  }, [p1, ym, periodsIncomparable, effectiveYoyMode])

  const plVarIncomparable = periodsIncomparable && effectiveYoyMode === 'full'

  const yoyCa = showYoy && p1 ? yoyKpiDisplay(c.ca, p1.ca, {
    compareMode: effectiveYoyMode,
    incomparablePeriods: periodsIncomparable,
    vsLabel: vsLabelKpi,
    monthsN: ym?.monthsN,
    monthsN1: ym?.monthsN1,
  }) : null
  const yoyCh = showYoy && p1 ? yoyKpiDisplay(c.ch6, p1.ch6, {
    compareMode: effectiveYoyMode,
    incomparablePeriods: periodsIncomparable,
    vsLabel: vsLabelKpi,
    monthsN: ym?.monthsN,
    monthsN1: ym?.monthsN1,
  }) : null
  const yoyNet = showYoy && p1 ? yoyKpiDisplay(c.rNet, p1.rNet, {
    compareMode: effectiveYoyMode,
    incomparablePeriods: periodsIncomparable,
    vsLabel: vsLabelKpi,
    monthsN: ym?.monthsN,
    monthsN1: ym?.monthsN1,
  }) : null
  const yoyIs = showYoy && p1 ? yoyKpiDisplay(c.is, p1.is, {
    compareMode: effectiveYoyMode,
    incomparablePeriods: periodsIncomparable,
    vsLabel: vsLabelKpi,
    monthsN: ym?.monthsN,
    monthsN1: ym?.monthsN1,
  }) : null

  const prevYearChart = ym?.prevYear ?? p1Full?.year
  const p1Chart = c.yoyPrevSameMonths || p1Full
  const anneeActive = typeof c.year === 'number' ? c.year : parseInt(String(c.year), 10) || new Date().getFullYear()
  const isAllYears = c.activeExerciceMode === 'all'

  const caN1Line =
    showYoy && p1Chart && prevYearChart
      ? c.mS.map((m) => {
          const mm = String(m).slice(4, 6)
          const key = `${prevYearChart}${mm}`
          return Math.round(p1Chart.byM[key]?.ca || 0)
        })
      : null
  const chN1Line =
    showYoy && p1Chart && prevYearChart
      ? c.mS.map((m) => {
          const mm = String(m).slice(4, 6)
          const key = `${prevYearChart}${mm}`
          return Math.round(p1Chart.byM[key]?.ch || 0)
        })
      : null

  const evolutionLabels = useMemo(() => {
    const moisTous = c.mS || []
    return moisTous.map((m) => {
      const s = String(m)
      if (s.length < 6) return s
      const mois = parseInt(s.slice(4, 6), 10)
      const annee = s.slice(0, 4)
      if (moisTous.length <= 24) {
        return `${MN[mois] || s.slice(4, 6)} ${annee.slice(2)}`
      }
      return mois === 1 ? annee : ''
    })
  }, [c.mS])

  const caD = (c.mS || []).map((m) => Math.round(c.byM[m]?.ca ?? 0))
  const chD = (c.mS || []).map((m) => Math.round(c.byM[m]?.ch ?? 0))
  const reD = caD.map((v, i) => v - chD[i])
  const autres = Math.max(0, c.ch6 - c.massSal - c.chExt - c.is - c.amort - c.imp)

  const chartDatasets = useMemo(() => {
    const ySuffix = isAllYears ? '(toutes)' : String(anneeActive)
    const ds = [
      { type: 'bar', label: `CA ${ySuffix}`, data: caD, backgroundColor: '#2563ebD9', order: 2 },
      { type: 'bar', label: `Charges ${ySuffix}`, data: chD, backgroundColor: '#dc2626D9', order: 2 },
      {
        type: 'line',
        label: `Résultat ${ySuffix}`,
        data: reD,
        borderColor: '#16a34a',
        backgroundColor: '#16a34a26',
        fill: true,
        tension: 0.35,
        order: 4,
      },
    ]
    if (caN1Line && chN1Line && prevYearChart) {
      ds.push({
        type: 'line',
        label: `CA ${prevYearChart}`,
        data: caN1Line,
        borderColor: '#93c5fd',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 5],
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        order: 3,
      })
      ds.push({
        type: 'line',
        label: `Charges ${prevYearChart}`,
        data: chN1Line,
        borderColor: '#fca5a5',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 5],
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        order: 3,
      })
    }
    return ds
  }, [caD, chD, reD, caN1Line, chN1Line, prevYearChart, anneeActive, isAllYears])

  const openPlDrill = useCallback((line) => {
    const raw = filterPlLine(fecRows, line.id, c.jPaie)
    const amt = line.amount(c)
    const absAmt = Math.abs(amt)
    setDrill({
      title: `Détail — ${line.label}`,
      subtitle: `Montant : ${fmt(absAmt)} (${pct(absAmt, c.ca)} du CA) · ${raw.length} écriture(s)`,
      rows: raw.map((r) => rawToDrillDisplay(r, { includeMois: true })),
    })
  }, [fecRows, c])

  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="📊 Synthèse" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg">
        <KpiCard
          label="Chiffre d'affaires"
          value={fmtK(c.ca)}
          delta={`${c.mS.length} mois · ${c.viewYearLabel ?? c.year}`}
          yoy={yoyCa}
          onClick={() => go('clients')}
          active={curView === 'clients'}
        />
        <KpiCard label="Charges totales" value={fmtK(c.ch6)} delta={`${pct(c.ch6, c.ca)} du CA`} yoy={yoyCh} />
        <KpiCard
          label="Résultat net"
          value={<span style={{ color: c.rNet >= 0 ? 'var(--fec-green)' : 'var(--fec-red)' }}>{fmtK(c.rNet)}</span>}
          delta={`Marge ${c.mNet.toFixed(1)}%`}
          deltaClass={c.rNet >= 0 ? 'fec-dp' : 'fec-dn'}
          yoy={yoyNet}
        />
        <KpiCard label="IS provisionné" value={fmtK(c.is)} delta={`Taux ${c.rBrut > 0 ? (c.is / c.rBrut * 100).toFixed(1) : 0}%`} yoy={yoyIs} />
      </div>
      {showYoyToggle ? (
        <div className="fec-yoy-toggle-card">
          <div className="fec-yoy-toggle-title">Comparaison vs {ym.prevYear} :</div>
          <div className="fec-yoy-toggle">
            <button
              type="button"
              className={effectiveYoyMode === 'full' ? 'fec-yoy-toggle--on' : ''}
              onClick={() => setYoyCompareMode?.('full')}
            >
              📅 Période complète N-1
            </button>
            <button
              type="button"
              className={effectiveYoyMode === 'sameMonths' ? 'fec-yoy-toggle--on' : ''}
              onClick={() => setYoyCompareMode?.('sameMonths')}
            >
              📅 Mêmes mois ({formatMonthRangeFr(ym.monthKeysN)})
            </button>
          </div>
        </div>
      ) : null}
      <div className="fec-kg">
        <KpiCard label="CA clients 🔍" value={fmtK(c.ca)} delta={`${Object.values(c.cl).filter((v) => v.brut > 0).length} clients`} onClick={() => go('clients')} active={curView === 'clients'} />
        <KpiCard label="Flotte LLD/LOA/CB 🔍" value={fmtK(c.tFlot)} delta={`${c.vehs.length} véhicules`} onClick={() => go('flotte')} active={curView === 'flotte'} />
        <KpiCard label="Masse salariale 🔍" value={fmtK(c.massSal)} delta={`${pct(c.massSal, c.ca)} du CA`} onClick={() => go('salaires')} active={curView === 'salaires'} />
        <KpiCard label="Pénalités & litiges 🔍" value={<span style={{ color: 'var(--fec-orange)' }}>{fmtK(c.pens.reduce((s, p) => s + p.montant, 0))}</span>} delta={`${c.pens.length} infractions`} onClick={() => go('penalites')} active={curView === 'penalites'} />
      </div>

      <div className="fec-cr">
        <div className="fec-card">
          <div className="fec-ct-t">Évolution mensuelle CA · Charges · Résultat</div>
          <div className="fec-ct-s">{c.viewYearLabel ?? c.year}</div>
          <div
            className="fec-chart fec-chart-syn-bar"
            style={{ height: isAllYears ? 280 : undefined }}
          >
            <Bar
              data={{ labels: evolutionLabels, datasets: chartDatasets }}
              options={barOptions({
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#475569', font: { size: 11 }, boxWidth: 12, padding: 12 },
                  },
                },
                scales: {
                  x: {
                    ticks: {
                      color: '#94a3b8',
                      font: { size: 11 },
                      autoSkip: false,
                      maxRotation: 45,
                      minRotation: 45,
                    },
                    grid: { display: false },
                    border: { display: false },
                  },
                },
              })}
            />
          </div>
        </div>
        <div className="fec-card">
          <div className="fec-ct-t">Structure des charges</div>
          <div className="fec-chart fec-chart-syn-donut">
            <Doughnut
              data={{ labels: ['Masse sal.', 'Ch.ext.', 'IS', 'Amort.', 'Autres'], datasets: [{ data: [c.massSal, c.chExt, c.is, c.amort, autres], backgroundColor: ['#2563eb', '#ea580c', '#16a34a', '#d97706', '#94a3b8'] }] }}
              options={doughnutOptions}
            />
          </div>
        </div>
      </div>

      <div className="fec-cr2">
        <div className="fec-card">
          <div className="fec-ct-t">Compte de résultat</div>
          <p className="fec-ct-s" style={{ marginTop: -8 }}>Cliquer sur une ligne pour le détail des écritures.</p>
          {showYoy && p1 ? (
            <>
              <div className="fec-pl-yoy-head">
                <span>Libellé</span>
                <span className="fec-num">N ({c.year})</span>
                <span className="fec-num">% CA</span>
                <span className="fec-num">{n1PlHeader}</span>
                <span className="fec-num">% CA</span>
                <span className="fec-num">{plVarIncomparable ? 'Var ⚠️' : 'Variation'}</span>
              </div>
              {PL_LINES.map((line) => {
                const v = line.amount(c)
                const vp = line.amount(p1)
                const yd = yoyPlVariationDisplay(v, vp, { incomparable: plVarIncomparable })
                const n = plYoyCells(line, c)
                const p = plYoyCells(line, p1)
                const rowCls = `fec-pl-yoy-row fec-pl-row--drill${line.id === 'avant' ? ' fec-pl-row--total' : ''}${line.id === 'net' ? ' fec-pl-row--net' : ''}${line.id === 'is' || (line.indent && line.id !== 'ca') ? ' fec-pl-row--ind' : ''}`
                return (
                  <div
                    key={line.id}
                    className={rowCls}
                    role="button"
                    tabIndex={0}
                    title="Cliquer pour voir le détail"
                    onClick={() => openPlDrill(line)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openPlDrill(line)
                      }
                    }}
                  >
                    <span className="fec-pl-label">
                      {line.label}
                      <span className="fec-pl-drill-hint">🔍</span>
                    </span>
                    <span className="fec-num">{n.amt}</span>
                    <span className="fec-num fec-pl-yoy-pct">{n.pct}</span>
                    <span className="fec-num">{p.amt}</span>
                    <span className="fec-num fec-pl-yoy-pct">{p.pct}</span>
                    <span className={`fec-num ${yd.cls}`}>{yd.text}</span>
                  </div>
                )
              })}
            </>
          ) : (
            PL_LINES.map((line) => {
              const v = line.amount(c)
              if (line.id === 'avant') {
                return (
                  <div key={line.id} className="fec-pl-row fec-pl-row--total fec-pl-row--drill" role="button" tabIndex={0} title="Cliquer pour voir le détail" onClick={() => openPlDrill(line)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlDrill(line) } }}>
                    <span className="fec-pl-label">{line.label}<span className="fec-pl-drill-hint">🔍</span></span>
                    <strong className={c.rBrut >= 0 ? 'fec-dp' : 'fec-dn'}>
                      {fmt(c.rBrut)} <span className="fec-pc">{pct(c.rBrut, c.ca)}</span>
                    </strong>
                  </div>
                )
              }
              if (line.id === 'net') {
                return (
                  <div key={line.id} className={`fec-pl-row fec-pl-row--net fec-pl-row--drill ${c.rNet >= 0 ? 'fec-dp' : 'fec-dn'}`} role="button" tabIndex={0} title="Cliquer pour voir le détail" onClick={() => openPlDrill(line)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlDrill(line) } }}>
                    <span className="fec-pl-label" style={{ color: c.rNet >= 0 ? 'var(--fec-green)' : 'var(--fec-red)' }}>{line.label}<span className="fec-pl-drill-hint">🔍</span></span>
                    <strong>
                      {fmt(c.rNet)} <span className="fec-pc">{pct(c.rNet, c.ca)}</span>
                    </strong>
                  </div>
                )
              }
              if (line.id === 'ca') {
                return (
                  <div key={line.id} className="fec-pl-row fec-pl-row--drill" role="button" tabIndex={0} title="Cliquer pour voir le détail" onClick={() => openPlDrill(line)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlDrill(line) } }}>
                    <span className="fec-pl-label">{line.label}<span className="fec-pl-drill-hint">🔍</span></span>
                    <span>
                      {fmt(c.ca)} <span className="fec-pc">{pct(c.ca, c.ca)}</span>
                    </span>
                  </div>
                )
              }
              if (line.id === 'is') {
                return (
                  <div key={line.id} className="fec-pl-row fec-pl-row--ind fec-pl-row--drill" role="button" tabIndex={0} title="Cliquer pour voir le détail" onClick={() => openPlDrill(line)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlDrill(line) } }}>
                    <span className="fec-pl-label">{line.label}<span className="fec-pl-drill-hint">🔍</span></span>
                    <span className="fec-dn">
                      -{fmt(c.is)} <span className="fec-pc">{pct(c.is, c.ca)}</span>
                    </span>
                  </div>
                )
              }
              return (
                <div key={line.id} className="fec-pl-row fec-pl-row--ind fec-pl-row--drill" role="button" tabIndex={0} title="Cliquer pour voir le détail" onClick={() => openPlDrill(line)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlDrill(line) } }}>
                  <span className="fec-pl-label">{line.label}<span className="fec-pl-drill-hint">🔍</span></span>
                  <span className={v < 0 ? 'fec-dn' : ''}>
                    {v < 0 ? '-' : ''}
                    {fmt(Math.abs(v))} <span className="fec-pc">{pct(Math.abs(v), c.ca)}</span>
                  </span>
                </div>
              )
            })
          )}
        </div>
        <div className="fec-card">
          <div className="fec-ct-t">Ratios financiers</div>
          <ProgressBar label="Marge brute" value={c.ca > 0 ? (c.ca - c.chExt) / c.ca * 100 : 0} color="#2563eb" />
          <ProgressBar label="Marge nette" value={c.mNet} color={c.mNet < 5 ? '#dc2626' : c.mNet < 10 ? '#d97706' : '#16a34a'} />
          <ProgressBar label="Masse sal./CA" value={c.ca > 0 ? c.massSal / c.ca * 100 : 0} color={c.massSal / c.ca > 0.6 ? '#dc2626' : '#0d9488'} />
          <ProgressBar label="Flotte/CA" value={c.ca > 0 ? c.tFlot / c.ca * 100 : 0} color="#7c3aed" />
          <ProgressBar label="IS/Rés.brut" value={c.rBrut > 0 ? c.is / c.rBrut * 100 : 0} color="#ea580c" />
        </div>
      </div>

      {drill ? (
        <DrillDownModal
          title={drill.title}
          subtitle={drill.subtitle}
          rows={drill.rows}
          columns={DRILL_COLUMNS_BASE}
          exportFileBase={c.name}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  )
}
