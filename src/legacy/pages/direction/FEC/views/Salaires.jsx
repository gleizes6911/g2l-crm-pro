import { useCallback, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import ViewTopBar from '../components/ViewTopBar'
import KpiCard from '../components/KpiCard'
import AlertBanner from '../components/AlertBanner'
import DataTable from '../components/DataTable'
import PresenceBar from '../components/PresenceBar'
import DrillDownModal, { DRILL_COLUMNS_PAY } from '../components/DrillDownModal'
import { barOptions } from './common'
import { fmt, pct } from '../utils/formatters'
import { MN, PAL } from '../utils/constants'
import { rawToDrillPayRow, filterSalariePayRows } from '../utils/fecDrillHelpers'

function initials(n) {
  const p = (n || '').trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase()
  return (n || '').slice(0, 2).toUpperCase()
}

function isGerant(n) {
  return /gérant|gerant|gÉrant/i.test(n || '')
}

export default function Salaires({ c, hasMulti, go, fecPeriod }) {
  const fecRows = c.fecRows || []
  const [drill, setDrill] = useState(null)

  const pers = Object.entries(c.ppai).sort(([a], [b]) => a.localeCompare(b))
  let tU = 0
  let tRe = 0
  let tPr = 0
  let tSa = 0
  let tPa = 0
  let tTa = 0
  let tFo = 0
  let tMe = 0
  let tUs = 0
  pers.forEach(([, pp]) => {
    tU += pp.ch.u; tRe += pp.ch.re; tPr += pp.ch.pr; tSa += pp.ch.sa; tPa += pp.ch.pa; tTa += pp.ch.ta; tFo += pp.ch.fo; tMe += pp.ch.me; tUs += pp.us
  })
  const tCP = tU + tRe + tPr + tSa + tPa + tTa + tFo + tMe
  const tInd = c.totInd
  const nbS = Object.keys(c.sals).length
  const rUs = c.tNets > 0 ? tUs / c.tNets : 0
  const rCP = c.tNets > 0 ? tCP / c.tNets : 0
  const ibS = {}
  pers.forEach(([, pp]) => {
    const tn = Object.values(pp.nets).reduce((s, v) => s + v, 0)
    if (tn <= 0) return
    Object.entries(pp.nets).forEach(([n, net]) => { ibS[n] = (ibS[n] || 0) + pp.b641400 * (net / tn) })
  })
  const SD = Object.entries(c.sals).sort((a, b) => b[1].net - a[1].net).map(([n, s], i) => {
    const nbM = s.mp.size || 1
    const uS = Math.round(s.net * rUs)
    const bE = s.net + uS
    const iE = Math.round(ibS[n] || 0)
    const cP = Math.round(s.net * rCP)
    return { n, s, nbM, uS, bE, iE, cP, cc: bE + iE + cP, np: s.net - s.pas, col: PAL[i % PAL.length] }
  })

  const openSalarieDrill = useCallback((row) => {
    if (!c.jPaie) {
      setDrill({ title: `Écritures paie — ${row.n}`, subtitle: 'Journal de paie non détecté (ODSA/ODS).', rows: [] })
      return
    }
    const raw = filterSalariePayRows(fecRows, c.jPaie, row.n, row.s.compteNum)
    setDrill({
      title: `Écritures paie — ${row.n}`,
      subtitle: `Net versé : ${fmt(row.s.net)} | Coût chargé : ${fmt(row.cc)} | Mois travaillés : ${row.nbM}`,
      rows: raw.map((r) => rawToDrillPayRow(r)),
    })
  }, [fecRows, c.jPaie, c.sals])

  const mM = pers.filter(([, pp]) => pp.b641 + pp.b641400 > 0).map(([p, pp]) => ({
    label: `${MN[parseInt(p.slice(4, 6), 10)]} ${p.slice(0, 4)}`,
    brut: Math.round(pp.b641 + pp.b641400),
    pat: Math.round(pp.ch.u + pp.ch.re + pp.ch.pr + pp.ch.sa + pp.ch.pa + pp.ch.ta + pp.ch.fo + pp.ch.me),
    nbS: Object.keys(pp.nets).length,
  }))

  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="👥 Masse salariale" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg fec-kg--5">
        <KpiCard label="Coût total employeur" value={fmt(c.massSal)} delta={`${pct(c.massSal, c.ca)} du CA`} deltaClass={c.massSal / c.ca > 0.6 ? 'fec-dn' : 'fec-du'} />
        <KpiCard label="Salaires bruts" value={fmt(c.tBrut - tInd)} delta="Hors indemnités" />
        <KpiCard label="Indemnités diverses" value={<span style={{ color: tInd / c.tBrut > 0.15 ? 'var(--fec-orange)' : 'inherit' }}>{fmt(tInd)}</span>} delta={`${pct(tInd, c.tBrut)} du brut`} />
        <KpiCard label="Charges patronales" value={fmt(tCP)} delta={`${pct(tCP, c.tBrut - tInd)} du brut`} />
        <KpiCard label={`Nets versés · ${nbS} sal.`} value={fmt(c.tNets)} delta={`Moy. ${fmt(c.tNets / Math.max(nbS, 1))}`} />
      </div>
      <div className="fec-card" style={{ marginBottom: 16 }}>
        <div className="fec-chart fec-chart-salaires">
          <Bar data={{ labels: mM.map((m) => m.label), datasets: [{ label: 'Bruts+Ind.', data: mM.map((m) => m.brut), backgroundColor: '#2563ebD9', stack: 's' }, { label: 'Charges pat.', data: mM.map((m) => m.pat), backgroundColor: '#ea580cD9', stack: 's' }] }} options={barOptions({ plugins: { legend: { display: true, labels: { color: '#475569' } } } })} />
        </div>
      </div>
      <DataTable
        searchable
        searchClassName="fec-si fec-si-salaires"
        tableClassName="fec-table--salary"
        rowClassName={(r) => (r.rawName && isGerant(r.rawName) ? 'fec-tr--gerant' : '')}
        headers={[
          { key: 'n', label: 'Salarié' }, { key: 'nbM', label: 'Mois', className: 'fec-num' }, { key: 'net', label: 'Net versé', className: 'fec-num' },
          { key: 'np', label: 'Net poche', className: 'fec-num' }, { key: 'uS', label: 'URSSAF sal.', className: 'fec-num' }, { key: 'bE', label: 'Brut estimé', className: 'fec-num' },
          { key: 'iE', label: 'Indemnités', className: 'fec-num' }, { key: 'cP', label: 'Ch. patronales', className: 'fec-num' }, { key: 'cc', label: 'Coût chargé', className: 'fec-num' },
          { key: 'moy', label: 'Moy/mois', className: 'fec-num' }, { key: 'pres', label: 'Présence' }, { key: 'detail', label: 'Détail' },
        ]}
        rows={SD.map((r) => ({
          rawName: r.n,
          meta: r,
          n: (
            <span className="fec-sal-name">
              <span className="fec-avatar" style={{ background: `${r.col}22`, color: r.col }}>{initials(r.n)}</span>
              {r.n}
            </span>
          ),
          nbM: r.nbM,
          net: fmt(r.s.net),
          np: fmt(r.np),
          uS: fmt(r.uS),
          bE: fmt(r.bE),
          iE: r.iE > 0 ? fmt(r.iE) : '—',
          cP: fmt(r.cP),
          cc: fmt(r.cc),
          moy: fmt(r.cc / r.nbM),
          pres: <PresenceBar months={r.s.mp} color={r.col} />,
          detail: (
            <button type="button" className="fec-drill-mini" title="Cliquer pour voir le détail" onClick={(e) => { e.stopPropagation(); openSalarieDrill(r) }}>
              → Voir<span className="fec-drill-ico"> 🔍</span>
            </button>
          ),
        }))}
        totalRow={{ n: 'TOTAL', net: fmt(c.tNets), uS: fmt(SD.reduce((s, r) => s + r.uS, 0)), bE: fmt(SD.reduce((s, r) => s + r.bE, 0)), iE: fmt(SD.reduce((s, r) => s + r.iE, 0)), cP: fmt(tCP), cc: fmt(SD.reduce((s, r) => s + r.cc, 0) + (c.gRem > 0 ? c.gRem + c.gCot : 0)), detail: '' }}
        onRowClick={(r) => r.meta && openSalarieDrill(r.meta)}
      />
      <div className="fec-ar" style={{ marginTop: 14 }}>
        <AlertBanner type="info" title="ℹ Coût chargé moyen / salarié" body={`${fmt(c.massSal / Math.max(nbS, 1))} / salarié`} />
        <AlertBanner type={tInd / c.tBrut > 0.15 ? 'warn' : 'ok'} title={`${tInd / c.tBrut > 0.15 ? '⚠' : '✓'} Indemnités = ${pct(tInd, c.tBrut)} du brut`} body={tInd / c.tBrut > 0.15 ? 'Niveau élevé — justificatifs obligatoires.' : 'Dans les normes du secteur transport.'} />
        <AlertBanner type={c.massSal / c.ca > 0.7 ? 'warn' : c.massSal / c.ca > 0.5 ? 'info' : 'ok'} title={`${c.massSal / c.ca > 0.7 ? '⚠' : c.massSal / c.ca > 0.5 ? 'ℹ' : '✓'} Masse sal. / CA = ${pct(c.massSal, c.ca)}`} body="Surveillance du ratio." />
      </div>
      <div className="fec-cr2">
        <div className="fec-card">
          <DataTable headers={[{ key: 'org', label: 'Organisme' }, { key: 'v', label: 'Montant', className: 'fec-num' }, { key: 'p', label: '% brut pur', className: 'fec-pc' }]} rows={[['URSSAF patronale', tU], ['Klésia — retraite', tRe], ['Klésia — prévoyance', tPr], ['Allianz — frais de santé', tSa], ['Klésia — paritarisme', tPa], ["Taxe d'apprentissage", tTa], ['Formation professionnelle', tFo], ['Médecine du travail', tMe]].filter(([, v]) => v > 0).map(([org, v]) => ({ org, v: fmt(v), p: pct(v, c.tBrut - tInd) }))} totalRow={{ org: 'TOTAL charges patronales', v: fmt(tCP), p: pct(tCP, c.tBrut - tInd) }} />
        </div>
        <div className="fec-card">
          <DataTable headers={[{ key: 'p', label: 'Période' }, { key: 'brut', label: 'Bruts', className: 'fec-num' }, { key: 'ind', label: 'Ind.', className: 'fec-num' }, { key: 'pat', label: 'Ch.pat.', className: 'fec-num' }, { key: 'nb', label: 'Nb sal.', className: 'fec-num' }, { key: 'cout', label: 'Coût emp.', className: 'fec-num' }]} rows={pers.filter(([, pp]) => pp.b641 + pp.b641400 > 0 || Object.keys(pp.nets).length > 0).map(([p, pp]) => { const pat = pp.ch.u + pp.ch.re + pp.ch.pr + pp.ch.sa + pp.ch.pa + pp.ch.ta + pp.ch.fo + pp.ch.me; const nb = Object.keys(pp.nets).length; return { p: `${MN[parseInt(p.slice(4, 6), 10)]} ${p.slice(0, 4)}`, brut: fmt(pp.b641), ind: pp.b641400 > 0 ? fmt(pp.b641400) : '—', pat: fmt(pat), nb, cout: fmt(pp.b641 + pp.b641400 + pat) } })} totalRow={{ p: 'TOTAL', brut: fmt(c.tBrut - tInd), ind: fmt(tInd), pat: fmt(tCP), nb: nbS, cout: fmt(c.tBrut + tCP) }} />
        </div>
      </div>

      {drill ? (
        <DrillDownModal
          title={drill.title}
          subtitle={drill.subtitle}
          rows={drill.rows}
          columns={DRILL_COLUMNS_PAY}
          exportFileBase={c.name}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  )
}
