export function pn(s) { return parseFloat((s || '0').replace(',', '.')) || 0; }
export function fmt(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; }
export function fmtK(n) { if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M €'; if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k €'; return Math.round(n) + ' €'; }
export function pct(n, t) { return t > 0 ? (n / t * 100).toFixed(1) + '%' : '—'; }

/** Variation N vs N-1 ; null si non calculable */
export function fmtYoyDelta(curr, prev) {
  if (prev == null || !Number.isFinite(prev) || prev === 0 || !Number.isFinite(curr)) return null
  const p = ((curr - prev) / Math.abs(prev)) * 100
  const up = p >= 0
  return { pct: p, text: `${up ? '+' : ''}${p.toFixed(1)}% ${up ? '▲' : '▼'}`, up }
}

/**
 * Affichage KPI YoY (Synthèse) : texte, couleur (good/warning), sous-ligne italique.
 * @param {'full'|'sameMonths'} compareMode - mode actif quand périodes différentes
 */
export function yoyKpiDisplay(curr, prev, {
  compareMode = 'full',
  incomparablePeriods = false,
  vsLabel = '',
  monthsN,
  monthsN1,
} = {}) {
  if (prev == null || !Number.isFinite(prev) || prev === 0 || !Number.isFinite(curr)) return null
  const p = ((curr - prev) / Math.abs(prev)) * 100
  const diff = curr - prev
  const arrow = diff >= 0 ? '▲' : '▼'
  const warn = incomparablePeriods && compareMode === 'full'
  const text = `${warn ? '⚠️ ' : ''}${p >= 0 ? '+' : ''}${p.toFixed(1)}% ${arrow} ${vsLabel}`.trim()
  const sub =
    warn && monthsN != null && monthsN1 != null
      ? `(${monthsN} mois vs ${monthsN1} mois)`
      : warn
        ? 'périodes différentes'
        : '(période comparable)'
  return {
    text,
    warning: warn,
    good: !warn && diff > 0,
    bad: !warn && diff < 0,
    sub,
  }
}

/** Texte + classe CSS pour cellule variation P&L (montants déjà dans le sens line.amount). */
export function yoyPlVariationDisplay(v, vp, { incomparable = false } = {}) {
  if (vp == null || !Number.isFinite(vp) || vp === 0 || !Number.isFinite(v)) {
    return { text: '—', cls: '' }
  }
  const p = ((v - vp) / Math.abs(vp)) * 100
  const diff = v - vp
  const arrow = diff >= 0 ? '▲' : '▼'
  const main = `${incomparable ? '⚠️ ' : ''}${p >= 0 ? '+' : ''}${p.toFixed(1)}% ${arrow}`
  if (incomparable) return { text: main, cls: 'fec-pl-yoy-warn' }
  if (diff === 0) return { text: main, cls: 'fec-pl-yoy-neutral' }
  const good = diff > 0
  return { text: main, cls: good ? 'fec-pl-yoy-good' : 'fec-pl-yoy-bad' }
}
