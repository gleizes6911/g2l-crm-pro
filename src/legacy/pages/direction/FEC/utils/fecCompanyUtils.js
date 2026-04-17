import { analyzeFecRows } from './parseFEC'

export const FEC_STORAGE_KEY = 'fec_companies'

/** Mois uniques MM ('01'…'12') présents dans les écritures. */
export function distinctMonthKeysFromRows(rows) {
  const s = new Set()
  for (const r of rows || []) {
    const d = String(r.EcritureDate || '').replace(/\D/g, '').slice(0, 8)
    if (d.length >= 6) s.add(d.slice(4, 6))
  }
  return Array.from(s).sort()
}

/** Filtre les lignes FEC dont le mois (MM) est dans monthKeysMM. */
export function filterRowsByMonthMM(rows, monthKeysMM) {
  const set = new Set(monthKeysMM || [])
  if (!set.size) return []
  return (rows || []).filter((r) => {
    const d = String(r.EcritureDate || '').replace(/\D/g, '').slice(0, 8)
    return d.length >= 6 && set.has(d.slice(4, 6))
  })
}

export function nameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Identifiant stable : SIREN si présent, sinon slug du nom. */
export function companyStableId(siren, name) {
  const s = String(siren || '').replace(/\D/g, '')
  if (s.length === 9) return `siren_${s}`
  const nk = nameKey(name).replace(/[^a-z0-9\u00C0-\u024f]+/gi, '_').replace(/^_|_$/g, '') || 'unknown'
  return `name_${nk.slice(0, 64)}`
}

export function date8ToIso(d) {
  const x = String(d || '').replace(/\D/g, '').slice(0, 8)
  if (x.length < 8) return ''
  return `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`
}

/** Fusionne un résultat parseFEC dans la liste des sociétés (même id = même onglet). */
export function mergeParsedIntoCompanies(prevCompanies, parsedList) {
  const list = prevCompanies.map((c) => ({
    ...c,
    exercices: (c.exercices || []).map((e) => ({ ...e, rows: e.rows || [] })),
  }))
  for (const p of parsedList) {
    const id = companyStableId(p.siren, p.name)
    const y = Number(p.year)
    const rows = p.fecRows || []
    const ex = {
      annee: y,
      dateDebut: date8ToIso(p.fecDateMin) || `${y}-01-01`,
      dateFin: date8ToIso(p.fecDateMax) || `${y}-12-31`,
      rows,
    }
    const idx = list.findIndex((c) => c.id === id)
    if (idx < 0) {
      list.push({
        id,
        siren: p.siren || '',
        name: p.name,
        exercices: [ex],
        activeExercice: y,
      })
    } else {
      const c = list[idx]
      c.name = p.name || c.name
      if (p.siren) c.siren = p.siren
      const ei = c.exercices.findIndex((e) => e.annee === y)
      if (ei >= 0) c.exercices[ei] = ex
      else c.exercices.push(ex)
      c.exercices.sort((a, b) => b.annee - a.annee)
      c.activeExercice = y
    }
  }
  return list
}

/** Vue « à plat » pour les écrans (équivalent ancien objet `c` parseFEC). */
export function buildFlatCompanyView(company) {
  if (!company?.exercices?.length) return null
  const name = company.name
  const siren = company.siren || ''
  const meta = { siren, companyId: company.id }
  const sorted = [...company.exercices].sort((a, b) => b.annee - a.annee)
  let rows
  let yearForAnalyze
  let viewYearLabel
  const mode = company.activeExercice

  if (mode === 'all') {
    rows = sorted.flatMap((e) => e.rows || [])
    yearForAnalyze = sorted[0]?.annee ?? new Date().getFullYear()
    const ys = sorted.map((e) => e.annee).sort((a, b) => a - b)
    viewYearLabel = ys.length > 1 ? `${ys[0]} → ${ys[ys.length - 1]} (toutes)` : String(ys[0])
  } else {
    const y = typeof mode === 'number' ? mode : sorted[0]?.annee
    const ex = sorted.find((e) => e.annee === y) || sorted[0]
    rows = ex?.rows || []
    yearForAnalyze = ex?.annee ?? y
    viewYearLabel = String(yearForAnalyze)
  }

  const parsed = analyzeFecRows(rows, name, yearForAnalyze, meta)
  parsed.companyId = company.id
  parsed.viewYearLabel = viewYearLabel
  parsed.activeExerciceMode = mode
  parsed.exercicesMeta = sorted.map((e) => ({
    annee: e.annee,
    dateDebut: e.dateDebut,
    dateFin: e.dateFin,
    rowCount: (e.rows || []).length,
  }))

  if (mode !== 'all' && typeof mode === 'number') {
    const prevEx = sorted.find((e) => e.annee === mode - 1)
    if (prevEx && (prevEx.rows || []).length) {
      const monthKeysN = distinctMonthKeysFromRows(rows)
      const monthKeysN1 = distinctMonthKeysFromRows(prevEx.rows)
      const monthsN = monthKeysN.length
      const monthsN1 = monthKeysN1.length
      parsed.yoyPrev = analyzeFecRows(prevEx.rows, name, prevEx.annee, meta)
      const rowsN1Same = filterRowsByMonthMM(prevEx.rows, monthKeysN)
      parsed.yoyPrevSameMonths = analyzeFecRows(rowsN1Same, name, prevEx.annee, meta)
      parsed.yoyMeta = {
        monthsN,
        monthsN1,
        monthKeysN,
        periodsComparable: monthsN === monthsN1,
        prevYear: prevEx.annee,
      }
    }
  }

  return parsed
}

/** Données legacy : un seul bloc parseFEC à plat → modèle multi-exercices. */
export function migrateStoredCompany(c) {
  if (!c || typeof c !== 'object') return null
  if (Array.isArray(c.exercices) && c.exercices.length) {
    return {
      id: c.id,
      siren: c.siren || '',
      name: c.name || 'Société',
      exercices: c.exercices.map((e) => ({
        annee: e.annee,
        dateDebut: e.dateDebut || '',
        dateFin: e.dateFin || '',
        rows: e.rows || [],
      })),
      activeExercice: c.activeExercice ?? c.exercices[0]?.annee ?? new Date().getFullYear(),
    }
  }
  if (c.fecRows && Array.isArray(c.fecRows)) {
    const y = Number(c.year) || new Date().getFullYear()
    return {
      id: companyStableId(c.siren, c.name),
      siren: c.siren || '',
      name: c.name || 'Société',
      exercices: [
        {
          annee: y,
          dateDebut: date8ToIso(c.fecDateMin) || `${y}-01-01`,
          dateFin: date8ToIso(c.fecDateMax) || `${y}-12-31`,
          rows: c.fecRows,
        },
      ],
      activeExercice: y,
    }
  }
  return null
}

export function loadCompaniesFromStorage() {
  try {
    const raw = localStorage.getItem(FEC_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.map(migrateStoredCompany).filter(Boolean)
  } catch {
    return []
  }
}

export function saveCompaniesToStorage(companies) {
  try {
    localStorage.setItem(FEC_STORAGE_KEY, JSON.stringify(companies))
  } catch (e) {
    console.warn('FEC localStorage:', e)
  }
}

/** Aperçu modal : fichier → action Nouveau / Ajout à société existante ou au même lot d'import. */
export function previewImportActions(rows, existingCompanies) {
  const batchFirstNom = new Map()
  return rows.map((r) => {
    if (r.analyzing) {
      return { ...r, action: 'pending', targetId: null, targetName: null }
    }
    const nom = String(r.nom || '').trim()
    const id = companyStableId(r.siren, nom)
    const existing = existingCompanies.find((c) => c.id === id)
    if (existing) {
      const hasYear = existing.exercices?.some((e) => e.annee === r.year)
      return {
        ...r,
        action: hasYear ? 'replace' : 'add',
        targetId: id,
        targetName: existing.name,
      }
    }
    if (batchFirstNom.has(id)) {
      return {
        ...r,
        action: 'add_batch',
        targetId: id,
        targetName: batchFirstNom.get(id),
      }
    }
    batchFirstNom.set(id, nom)
    return { ...r, action: 'new', targetId: id, targetName: nom }
  })
}

/** Regroupe les lignes du modal par targetId pour affichage. */
export function groupImportRowsByCompany(rowsWithPreview) {
  const m = new Map()
  for (const r of rowsWithPreview) {
    const key = r.analyzing ? `__loading_${r.key}` : companyStableId(r.siren, r.nom)
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(r)
  }
  return Array.from(m.entries()).map(([key, items]) => ({
    groupKey: key,
    items,
    label: items[0]?.nom || items[0]?.targetName || key,
    siren: items[0]?.siren || '',
  }))
}
