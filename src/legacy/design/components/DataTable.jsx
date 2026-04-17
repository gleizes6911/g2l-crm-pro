/**
 * DataTable — Tableau unifié G2L
 * Design sobre : fond alternant, hover, sticky header optionnel
 *
 * Props :
 * - columns : [{ key, label, render?, align?, width? }]
 * - rows    : array of objects
 * - loading : bool
 * - empty   : string — message si aucune donnée
 * - onRowClick : fn(row)
 * - stickyHeader : bool
 */
import { Loader2 } from 'lucide-react'

export default function DataTable({
  columns = [],
  rows = [],
  loading = false,
  empty = 'Aucune donnée',
  onRowClick,
  stickyHeader = false
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-[var(--text-sm)]">Chargement…</span>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-muted)]">
        <div className="text-3xl mb-3 opacity-20">◻</div>
        <p className="text-[var(--text-sm)]">{empty}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
      <table className="w-full border-collapse text-[var(--text-sm)]">
        <thead>
          <tr className={`bg-[var(--color-bg)] ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-3 py-2.5 text-[var(--text-xs)] font-medium uppercase tracking-wider text-[var(--color-muted)] border-b border-[var(--color-border)] font-mono whitespace-nowrap"
                style={{ width: col.width, textAlign: col.align || 'left' }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              className={`
                border-b border-[var(--color-border)] last:border-0
                ${i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'}
                ${onRowClick ? 'cursor-pointer hover:bg-[var(--color-surface-active)] transition-colors' : 'hover:bg-[var(--color-surface-hover)]'}
              `}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-3 py-2.5 text-[var(--color-ink-2)]"
                  style={{ textAlign: col.align || 'left' }}
                >
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
