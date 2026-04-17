import { useMemo, useState } from 'react'

export default function DataTable({
  headers,
  rows,
  totalRow,
  searchable = false,
  searchClassName = 'fec-si',
  tableClassName = '',
  rowClassName,
  onRowClick,
  drillRowTitle = 'Cliquer pour voir le détail',
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    if (!searchable || !q) return rows
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  }, [rows, searchable, q])
  return (
    <div>
      {searchable && (
        <input
          className={searchClassName}
          placeholder="Rechercher..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 10 }}
        />
      )}
      <div className="fec-tw">
        <table className={`fec-table ${tableClassName}`.trim()}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h.key} className={`fec-th ${h.className || ''}`.trim()}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => (
              <tr
                key={idx}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                title={onRowClick ? drillRowTitle : undefined}
                className={`fec-tr ${onRowClick ? 'fec-drill-row fec-drill-hit' : ''} ${rowClassName ? rowClassName(r, idx) : ''}`.trim()}
                onClick={onRowClick ? () => onRowClick(r, idx) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r, idx) } } : undefined}
              >
                {headers.map((h) => (
                  <td key={h.key} className={`fec-td ${h.className || ''}`.trim()}>{r[h.key]}</td>
                ))}
              </tr>
            ))}
            {totalRow ? (
              <tr className="fec-rt">
                {headers.map((h) => (
                  <td key={h.key} className={`fec-td ${h.className || ''}`.trim()}>{totalRow[h.key] ?? ''}</td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
