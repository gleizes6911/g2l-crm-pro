import ViewTopBar from '../components/ViewTopBar'
import KpiCard from '../components/KpiCard'
import DataTable from '../components/DataTable'
import { fmt, fmtK, pct } from '../utils/formatters'

export default function TVA({ c, hasMulti, go, fecPeriod }) {
  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="🧾 TVA" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg">
        <KpiCard label="TVA collectée" value={fmtK(c.tvaC)} delta={`sur CA ${pct(c.tvaC, c.ca)}`} />
        <KpiCard label="TVA déductible" value={fmtK(c.tvaD)} delta="sur achats" />
        <KpiCard label="TVA à décaisser" value={<span style={{ color: c.tvaA > 0 ? 'var(--fec-red)' : 'var(--fec-green)' }}>{fmtK(c.tvaA)}</span>} delta={c.tvaA > 0 ? 'dette fiscale' : 'crédit TVA'} />
        <KpiCard label="Reversé / collecté" value={pct(c.tvaA, c.tvaC)} delta="efficacité fiscale" />
      </div>
      <div className="fec-card">
        <DataTable headers={[{ key: 'n', label: 'Compte' }, { key: 'lib', label: 'Libellé' }, { key: 'd', label: 'Débit', className: 'fec-num' }, { key: 'c', label: 'Crédit', className: 'fec-num' }, { key: 's', label: 'Solde', className: 'fec-num' }]} rows={c.bal.filter((b) => b.n.startsWith('445')).map((b) => ({ n: b.n, lib: b.lib, d: fmt(b.d), c: fmt(b.c), s: fmt(Math.abs(b.s)) }))} />
      </div>
    </div>
  )
}
