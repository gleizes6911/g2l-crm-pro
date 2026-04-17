import { pn } from './formatters'

export function yyyymmToLabel(yyyymm) {
  if (!yyyymm || String(yyyymm).length < 6) return ''
  const s = String(yyyymm)
  const mo = parseInt(s.slice(4, 6), 10)
  const mois = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  return `${mois[mo] || s.slice(4, 6)} ${s.slice(0, 4)}`
}

export function payrollAccountType(cp) {
  const c = String(cp || '')
  if (c.startsWith('421')) return 'Net'
  if (c.startsWith('641')) return 'Brut'
  if (c.startsWith('645') || c.startsWith('631') || c.startsWith('633') || c.startsWith('647') || c.startsWith('431')) return 'Charges'
  if (c.startsWith('4421')) return 'PAS'
  if (c.startsWith('646')) return 'Autres charges'
  return c.slice(0, 3) ? `compte ${c.slice(0, 3)}xx` : '—'
}

export function rawToDrillDisplay(r, { includeMois = true } = {}) {
  const d = (r.EcritureDate || '').replace(/\D/g, '').slice(0, 8)
  const journal = [r.JournalCode, r.JournalLib].filter(Boolean).join(' — ')
  const compte = [r.CompteNum, r.CompteLib].filter(Boolean).join(' ')
  return {
    mois: includeMois && d.length >= 6 ? `${d.slice(4, 6)}/${d.slice(0, 4)}` : '',
    journal,
    date: d,
    ecritureNum: r.EcritureNum || '',
    compte,
    aux: r.CompAuxLib || '',
    libelle: r.EcritureLib || '',
    debit: pn(r.Debit),
    credit: pn(r.Credit),
    lettrage: r.EcritureLet || '',
  }
}

export function rawToDrillPayRow(r) {
  return { ...rawToDrillDisplay(r), typeCompte: payrollAccountType(r.CompteNum) }
}

export function filterClientEntries(fecRows, compteNum, clientNom) {
  const nomU = String(clientNom || '').toUpperCase()
  return fecRows.filter((r) => {
    if (String(r.CompteNum) !== String(compteNum)) return false
    const aux = String(r.CompAuxLib || '').toUpperCase()
    const lib = String(r.EcritureLib || '').toUpperCase()
    return aux.includes(nomU) || lib.includes(nomU)
  })
}

export function filterClientMonth(fecRows, compteNum, clientNom, yyyymm) {
  return filterClientEntries(fecRows, compteNum, clientNom).filter((r) => String(r.EcritureDate || '').startsWith(String(yyyymm)))
}

export function filterCaMonthClass7(fecRows, yyyymm) {
  return fecRows.filter((r) => String(r.CompteNum || '').startsWith('7') && String(r.EcritureDate || '').startsWith(String(yyyymm)))
}

export function filterPlLine(fecRows, lineId, jPaie) {
  const rows = fecRows || []
  switch (lineId) {
    case 'ca':
      return rows.filter((r) => String(r.CompteNum || '')[0] === '7')
    case 'chExt':
      return rows.filter((r) => {
        const cp = r.CompteNum || ''
        return cp.startsWith('61') || cp.startsWith('62')
      })
    case 'massSal':
      if (!jPaie) return rows.filter((r) => String(r.CompteNum || '').startsWith('64'))
      return rows.filter((r) => r.JournalCode === jPaie && String(r.CompteNum || '').startsWith('64'))
    case 'imp':
      return rows.filter((r) => String(r.CompteNum || '').startsWith('63'))
    case 'amort':
      return rows.filter((r) => String(r.CompteNum || '').startsWith('68'))
    case 'is':
      return rows.filter((r) => String(r.CompteNum || '').startsWith('69'))
    case 'avant':
      return rows.filter((r) => {
        const x = String(r.CompteNum || '')[0]
        return x === '6' || x === '7'
      })
    case 'net':
      return rows.filter((r) => {
        const x = String(r.CompteNum || '')[0]
        return x === '6' || x === '7'
      })
    default:
      return []
  }
}

export function filterFlotteImmat(fecRows, immat) {
  const im = String(immat || '').toUpperCase().replace(/\s/g, '-')
  if (!im) return []
  return fecRows.filter((r) => {
    const l1 = String(r.EcritureLib || '').toUpperCase()
    const l2 = String(r.CompteLib || '').toUpperCase()
    return l1.includes(im) || l2.includes(im)
  })
}

/**
 * Écritures paie pour un seul salarié (journal ODSA/ODS).
 * @param {string|null|undefined} compteNum — Compte 421 analytique issu de parseFEC (ex. 421BAYLACJC), filtre prioritaire
 */
export function filterSalariePayRows(fecRows, jPaie, salarieNom, compteNum) {
  if (!jPaie || !salarieNom) return []
  const nomUpper = String(salarieNom).toUpperCase().trim()
  const words = nomUpper.split(/\s+/).filter(Boolean)
  const initials = words.map((w) => w[0]).join('').toUpperCase()
  const cn = compteNum ? String(compteNum).trim() : ''

  return (fecRows || []).filter((r) => {
    if (r.JournalCode !== jPaie) return false

    const cp = String(r.CompteNum || '')
    if (cn && (cp === cn || cp.startsWith(cn))) return true

    const fields = [
      String(r.CompteLib || '').toUpperCase(),
      String(r.CompAuxLib || '').toUpperCase(),
      String(r.EcritureLib || '').toUpperCase(),
      String(r.CompAuxNum || '').toUpperCase(),
      cp.toUpperCase(),
    ]

    if (nomUpper.length >= 3 && fields.some((f) => f.includes(nomUpper))) return true

    if (initials.length >= 2 && fields.some((f) => f.includes(initials))) return true

    /* Un seul token (nom rare) : évite le faux positif « même nom de famille » quand plusieurs prénoms */
    if (words.length === 1 && words[0].length >= 4 && fields.some((f) => f.includes(words[0]))) return true

    return false
  })
}

export function monthDebitTotals(rows) {
  const m = {}
  rows.forEach((r) => {
    const key = String(r.EcritureDate || '').slice(0, 6)
    if (key.length < 6) return
    m[key] = (m[key] || 0) + pn(r.Debit)
  })
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
}
