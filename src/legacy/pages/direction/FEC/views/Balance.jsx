import { useMemo, useState } from 'react'
import ViewTopBar from '../components/ViewTopBar'
import DataTable from '../components/DataTable'
import { fmt } from '../utils/formatters'

export default function Balance({ c, hasMulti, go, fecPeriod }) {
  const [f, setF] = useState('all')
  const rows = useMemo(() => c.bal.filter((b) => {
    if (f === 'all') return true
    if (f === '6') return b.n.startsWith('6')
    if (f === '7') return b.n.startsWith('7')
    if (f === '4') return b.n.startsWith('4')
    if (f === '2') return b.n.startsWith('2')
    return true
  }), [c.bal, f])
  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="📒 Balance générale" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-filter-tabs">
        {[['all', 'Tous'], ['6', 'Charges 6xx'], ['7', 'Produits 7xx'], ['4', 'Tiers 4xx'], ['2', 'Immo. 2xx']].map(([id, l]) => (
          <button key={id} type="button" className={`fec-filter-tab ${f === id ? 'fec-filter-tab--active' : ''}`} onClick={() => setF(id)}>
            {l}
          </button>
        ))}
      </div>
      <div className="fec-card">
        <DataTable headers={[{ key: 'n', label: 'Compte' }, { key: 'lib', label: 'Libellé' }, { key: 'd', label: 'Débit', className: 'fec-num' }, { key: 'c', label: 'Crédit', className: 'fec-num' }, { key: 's', label: 'Solde', className: 'fec-num' }]} rows={rows.map((b) => ({ n: b.n, lib: b.lib, d: fmt(b.d), c: fmt(b.c), s: <span className={b.s >= 0 ? 'fec-dp' : 'fec-dn'}>{b.s >= 0 ? '+' : '-'}{fmt(Math.abs(b.s))}</span> }))} />
      </div>
    </div>
  )
}
