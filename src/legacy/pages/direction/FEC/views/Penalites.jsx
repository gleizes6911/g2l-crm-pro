import ViewTopBar from '../components/ViewTopBar'
import KpiCard from '../components/KpiCard'
import DataTable from '../components/DataTable'
import { fmt, fmtK, pct } from '../utils/formatters'

function penaltyTypeBadge(typ) {
  const map = {
    'Contravention': 'fec-badge-typ fec-badge-pen--cont',
    'Amende/FPS': 'fec-badge-typ fec-badge-pen--amende',
    'Impayé/Retard': 'fec-badge-typ fec-badge-pen--impaye',
    Autre: 'fec-badge-typ fec-badge-pen--autre',
  }
  const cls = map[typ] || map.Autre
  return <span className={cls}>{typ}</span>
}

export default function Penalites({ c, hasMulti, go, fecPeriod }) {
  const tp = c.pens.reduce((s, p) => s + p.montant, 0)
  const tl = Object.values(c.litC).reduce((s, v) => s + v, 0)
  const bt = {}
  c.pens.forEach((p) => { bt[p.typ] = (bt[p.typ] || 0) + p.montant })
  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="⚖️ Pénalités & litiges" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg">
        <KpiCard label="Total pénalités" value={fmtK(tp)} delta={`${c.pens.length} lignes`} />
        <KpiCard label="Litiges colis" value={fmtK(tl)} delta={`${pct(tl, c.ca)} du CA`} />
        <KpiCard label="Total pén.+litiges" value={fmtK(tp + tl)} deltaClass={(tp + tl) / c.ca > 0.03 ? 'fec-dn' : 'fec-du'} delta={pct(tp + tl, c.ca)} />
        <KpiCard label="Véhicules impliqués" value={new Set(c.pens.map((p) => p.immat)).size} delta="immatriculations uniques" />
      </div>
      <div className="fec-cr2">
        <div className="fec-card">
          <DataTable headers={[{ key: 't', label: 'Type' }, { key: 'm', label: 'Montant', className: 'fec-num' }, { key: 'p', label: '%', className: 'fec-pc' }]} rows={Object.entries(bt).sort((a, b) => b[1] - a[1]).map(([t, m]) => ({ t, m: fmt(m), p: pct(m, tp) }))} />
        </div>
        <div className="fec-card">
          <DataTable headers={[{ key: 'c', label: 'Client' }, { key: 'm', label: 'Litiges', className: 'fec-num' }, { key: 'p', label: '% CA client', className: 'fec-pc' }]} rows={Object.entries(c.litC).filter(([, v]) => v > 0).map(([cl, m]) => ({ c: cl, m: fmt(m), p: pct(m, Object.values(c.cl).find((v) => v.nom === cl)?.brut || 0) }))} />
        </div>
      </div>
      <div className="fec-card">
        <DataTable headers={[{ key: 'immat', label: 'Immat.' }, { key: 'typ', label: 'Type' }, { key: 'date', label: 'Date' }, { key: 'lib', label: 'Libellé' }, { key: 'm', label: 'Montant', className: 'fec-num' }]} rows={c.pens.slice().sort((a, b) => b.montant - a.montant).map((p) => ({ immat: <span className="fec-immat">{p.immat}</span>, typ: penaltyTypeBadge(p.typ), date: p.date || '—', lib: p.lib, m: fmt(p.montant) }))} totalRow={{ immat: 'TOTAL', m: fmt(tp) }} />
      </div>
    </div>
  )
}
