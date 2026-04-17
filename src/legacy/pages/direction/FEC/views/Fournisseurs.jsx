import { Doughnut } from 'react-chartjs-2'
import ViewTopBar from '../components/ViewTopBar'
import KpiCard from '../components/KpiCard'
import DataTable from '../components/DataTable'
import { doughnutOptionsRight } from './common'
import { fmt, fmtK, pct } from '../utils/formatters'
import { PAL } from '../utils/constants'

export default function Fournisseurs({ c, hasMulti, go, fecPeriod }) {
  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="🛒 Achats & fournisseurs" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg">
        <KpiCard label="Total achats" value={fmtK(c.chExt)} delta={`${pct(c.chExt, c.ca)} du CA`} />
        <KpiCard label="Fournisseurs actifs" value={c.tF.length} delta="Journal AC" />
        <KpiCard label="Top 3 concentration" value={pct(c.tF.slice(0, 3).reduce((s, [, v]) => s + v, 0), c.chExt)} delta="des achats" deltaClass="fec-dn" />
        <KpiCard label="Achat moyen" value={fmtK(c.chExt / (c.tF.length || 1))} delta="/ fournisseur" />
      </div>
      <div className="fec-cr2">
        <div className="fec-card">
          <DataTable headers={[{ key: 'rk', label: '#' }, { key: 'n', label: 'Fournisseur' }, { key: 'v', label: 'Montant', className: 'fec-num' }, { key: 'p', label: '%', className: 'fec-pc' }]} rows={c.tF.map(([n, v], i) => ({ rk: i + 1, n, v: fmt(v), p: pct(v, c.chExt) }))} />
        </div>
        <div className="fec-card">
          <div className="fec-chart fec-chart-fourn">
            <Doughnut data={{ labels: c.tF.slice(0, 8).map(([n]) => n), datasets: [{ data: c.tF.slice(0, 8).map(([, v]) => Math.round(v)), backgroundColor: PAL }] }} options={doughnutOptionsRight} />
          </div>
        </div>
      </div>
      <div className="fec-card">
        <DataTable headers={[{ key: 'n', label: 'Compte' }, { key: 'lib', label: 'Libellé' }, { key: 'd', label: 'Débit', className: 'fec-num' }, { key: 'c', label: 'Crédit', className: 'fec-num' }, { key: 's', label: 'Net', className: 'fec-num' }, { key: 'p', label: '%', className: 'fec-pc' }]} rows={c.bal.filter((b) => (b.n.startsWith('61') || b.n.startsWith('62')) && Math.abs(b.s) > 0).map((b) => ({ n: b.n, lib: b.lib, d: fmt(b.d), c: fmt(b.c), s: fmt(Math.abs(b.s)), p: pct(Math.abs(b.s), c.chExt) }))} />
      </div>
    </div>
  )
}
