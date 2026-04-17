import { useMemo, useState } from 'react'

function formatNumEuro(n) {
  if (n == null || n === '' || Number(n) === 0) return '—'
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return `${Math.round(x).toLocaleString('fr-FR')} €`
}

function formatNumPlain(n) {
  if (n == null || n === '' || Number(n) === 0) return '—'
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return Math.round(x).toLocaleString('fr-FR')
}

function formatDateCell(d) {
  const s = String(d || '').replace(/\D/g, '').slice(0, 8)
  if (s.length < 8) return '—'
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
}

function slug(s) {
  return String(s || 'export')
    .replace(/[^\w\- àâäéèêëïîôùûüç.]+/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60)
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.subtitle
 * @param {object[]} props.rows — objets avec clés = columns[].key
 * @param {{ key: string, label: string, type?: 'text'|'num'|'date'|'badge'|'debit'|'credit' }[]} props.columns
 * @param {() => void} props.onClose
 * @param {string} [props.exportFileBase] — préfixe fichier CSV (ex. nom société)
 * @param {import('react').ReactNode} [props.footer]
 */
export default function DrillDownModal({
  title,
  subtitle,
  rows = [],
  columns,
  onClose,
  exportFileBase = 'FEC',
  footer,
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 1 })

  const filtered = useMemo(() => {
    if (!q.trim()) return rows
    const ql = q.toLowerCase()
    return rows.filter((r) =>
      columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(ql)))
  }, [rows, q, columns])

  const sorted = useMemo(() => {
    if (!sort.key) return filtered
    const col = columns.find((c) => c.key === sort.key)
    const k = sort.key
    const copy = [...filtered]
    copy.sort((a, b) => {
      let va = a[k]
      let vb = b[k]
      if (col?.type === 'num' || col?.type === 'debit' || col?.type === 'credit') {
        va = Number(va) || 0
        vb = Number(vb) || 0
      } else if (col?.type === 'date') {
        va = String(va || '').replace(/\D/g, '')
        vb = String(vb || '').replace(/\D/g, '')
      } else {
        va = String(va ?? '').toLowerCase()
        vb = String(vb ?? '').toLowerCase()
      }
      if (va < vb) return -1 * sort.dir
      if (va > vb) return 1 * sort.dir
      return 0
    })
    return copy
  }, [filtered, sort, columns])

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))
  }

  const exportCsv = () => {
    const sep = ';'
    const esc = (v) => {
      const str = String(v ?? '')
      if (str.includes(sep) || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`
      return str
    }
    const header = columns.map((c) => c.label).join(sep)
    const lines = [header]
    sorted.forEach((r) => {
      lines.push(
        columns.map((c) => {
          const v = r[c.key]
          if (c.type === 'date') return esc(formatDateCell(v))
          if (c.type === 'debit' || c.type === 'credit' || c.type === 'num')
            return esc(String(Number(v) || 0).replace('.', ','))
          return esc(v)
        }).join(sep)
      )
    })
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slug(exportFileBase)}_${slug(title)}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const renderCell = (c, r) => {
    const v = r[c.key]
    switch (c.type) {
      case 'date':
        return formatDateCell(v)
      case 'debit':
        return <span className={Number(v) > 0 ? 'fec-drill-debit' : ''}>{formatNumEuro(v)}</span>
      case 'credit':
        return <span className={Number(v) > 0 ? 'fec-drill-credit' : ''}>{formatNumEuro(v)}</span>
      case 'num':
        return formatNumPlain(v)
      case 'badge':
        return <span className="fec-badge fec-badge-neutral">{v}</span>
      default:
        return v ?? '—'
    }
  }

  return (
    <div className="fec-dd-ov" role="dialog" aria-modal="true" aria-labelledby="fec-dd-title" onClick={onClose}>
      <div className="fec-dd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fec-dd-head">
          <div>
            <h2 id="fec-dd-title" className="fec-dd-title">{title}</h2>
            {subtitle ? <p className="fec-dd-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="fec-dd-close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fec-dd-toolbar">
          <input
            className="fec-dd-search"
            placeholder="Rechercher dans les écritures…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="fec-btn" onClick={exportCsv}>
            📥 Exporter CSV
          </button>
        </div>
        <div className="fec-dd-scroll">
          <table className="fec-table fec-dd-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`fec-th ${c.type === 'debit' || c.type === 'credit' || c.type === 'num' ? 'fec-num' : ''}`.trim()}>
                    <button type="button" className="fec-dd-sort" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td className="fec-td" colSpan={columns.length}>
                    Aucune écriture.
                  </td>
                </tr>
              ) : (
                sorted.map((r, idx) => (
                  <tr key={idx} className="fec-tr">
                    {columns.map((c) => (
                      <td key={c.key} className={`fec-td ${c.type === 'debit' || c.type === 'credit' || c.type === 'num' ? 'fec-num' : ''}`.trim()}>
                        {renderCell(c, r)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {footer ? <div className="fec-dd-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export const DRILL_COLUMNS_BASE = [
  { key: 'mois', label: 'Mois', type: 'text' },
  { key: 'journal', label: 'Journal', type: 'text' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'ecritureNum', label: 'N° écriture', type: 'text' },
  { key: 'compte', label: 'Compte', type: 'text' },
  { key: 'aux', label: 'Compte aux.', type: 'text' },
  { key: 'libelle', label: 'Libellé', type: 'text' },
  { key: 'debit', label: 'Débit', type: 'debit' },
  { key: 'credit', label: 'Crédit', type: 'credit' },
  { key: 'lettrage', label: 'Lettrage', type: 'text' },
]

/** Colonnes modal paie — les lignes doivent être pré-filtrées (un salarié / journal) via `filterSalariePayRows` côté vue. */
export const DRILL_COLUMNS_PAY = [
  { key: 'mois', label: 'Mois', type: 'text' },
  { key: 'journal', label: 'Journal', type: 'text' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'ecritureNum', label: 'N° écriture', type: 'text' },
  { key: 'compte', label: 'Compte', type: 'text' },
  { key: 'aux', label: 'Compte aux.', type: 'text' },
  { key: 'libelle', label: 'Libellé', type: 'text' },
  { key: 'typeCompte', label: 'Type compte', type: 'badge' },
  { key: 'debit', label: 'Débit', type: 'debit' },
  { key: 'credit', label: 'Crédit', type: 'credit' },
  { key: 'lettrage', label: 'Lettrage', type: 'text' },
]
