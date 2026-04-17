/** Format Cador : {SIREN}ExportStructureFEC{AAAAMMJJ}.txt */
export const CadorFilenameRe = /^(\d{9})ExportStructureFEC(\d{8})/i

export function detectFromFilename(filename) {
  const base = String(filename || '').replace(/.*[/\\]/, '').replace(/\.[^.]+$/, '')
  const m = base.match(CadorFilenameRe)
  if (!m) return null
  return {
    siren: m[1],
    closureDate: m[2],
    year: parseInt(m[2].slice(0, 4), 10),
  }
}

/** Parse les N premières lignes (hors en-tête) pour min/max EcritureDate */
export function detectPeriodFromTextSample(text, maxDataLines = 500) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const headers = lines[0].split('\t').map((h) => h.trim())
  const idx = headers.indexOf('EcritureDate')
  let dateMin = '99999999'
  let dateMax = '00000000'
  const limit = Math.min(lines.length - 1, maxDataLines)
  for (let i = 1; i <= limit; i++) {
    const parts = lines[i].split('\t')
    let d = ''
    if (idx >= 0) d = (parts[idx] || '').trim().slice(0, 8)
    else if (parts.length > 1) d = (parts[1] || '').trim().slice(0, 8)
    if (!/^\d{8}$/.test(d)) continue
    if (d < dateMin) dateMin = d
    if (d > dateMax) dateMax = d
  }
  if (dateMax === '00000000') return null
  if (dateMin === '99999999') dateMin = dateMax
  return {
    dateMin,
    dateMax,
    year: parseInt(dateMax.slice(0, 4), 10),
  }
}

export function formatFecDateFr(d8) {
  if (!d8 || String(d8).length < 8) return '—'
  const d = String(d8).slice(0, 8)
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
}

/** API publique — pas de clé */
export async function fetchDenominationBySiren(siren) {
  if (!siren || String(siren).length !== 9) return ''
  try {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siren)}&page=1&per_page=1`)
    if (!r.ok) return ''
    const j = await r.json()
    const hit = j.results?.[0]
    if (!hit) return ''
    return hit.nom_complet || hit.nom_raison_sociale || hit.siege?.libelle_commune || ''
  } catch {
    return ''
  }
}
