const express = require('express')
const router = express.Router()
const { pool } = require('../services/database')
const exploitationService = require('../services/exploitationService')

// ── Cache Salesforce rentabilité ─────────────────────────────
// Clé de cache = "dateDebut|dateFin|societeId"
const _sfCache = new Map()
const SF_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

function getSfCacheKey(dateDebut, dateFin, societeId) {
  return `${dateDebut || ''}|${dateFin || ''}|${societeId ?? ''}`
}

function getSfCache(key) {
  const entry = _sfCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > SF_CACHE_TTL) {
    _sfCache.delete(key)
    return null
  }
  return entry.data
}

function setSfCache(key, data) {
  _sfCache.set(key, { data, timestamp: Date.now() })
  console.log(`[SF Cache] Mis en cache: ${key}`)
}

function invalidateSfCache() {
  _sfCache.clear()
  console.log('[SF Cache] Cache vidé')
}

function requirePool(res) {
  if (!pool) {
    return false
  }
  return true
}

function nomCourt(nom) {
  const n = (nom || '').trim()
  if (n.includes('TPS')) return 'TPS'
  if (n.includes('D &') || n.includes('D&J') || /d\s*&\s*j/i.test(n)) return 'D&J'
  if (/holding/i.test(n)) return 'Holding'
  return n.length > 14 ? `${n.slice(0, 14)}…` : n || 'Autre'
}

const IMMAT_FICTIVES = new Set([
  'AA-111-AA',
  'AA-222-AA',
  'AA-333-AA',
  'ZZ-999-ZZ',
  'N/A',
  '',
  'INCONNU',
])

function immatValide(immat) {
  if (!immat) return false
  const u = String(immat).toUpperCase().trim()
  if (IMMAT_FICTIVES.has(u)) return false
  return /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(u)
}

const CORRECTIONS_IMMAT_FEC = {
  'HE-955-GC': 'HE-955-GQ',
}

function extraireImmatFec(lib) {
  if (!lib) return null
  const match = lib.match(/[A-Z]{2}[-\s]\d{3}[-\s][A-Z]{2}/i)
  if (!match) return null
  const immat = match[0].replace(/\s/g, '-').toUpperCase()
  return CORRECTIONS_IMMAT_FEC[immat] || immat
}

/** Mois YYYY-MM → [dateDebut, dateFin) en calendrier local (dateFin = 1er jour du mois suivant, à utiliser avec < en SQL). */
function getDateRangeMois(moisStr) {
  const [a, m] = String(moisStr).split('-').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  const finExclusive = new Date(a, m, 1)
  return {
    dateDebut: `${a}-${pad(m)}-01`,
    dateFin: `${finExclusive.getFullYear()}-${pad(finExclusive.getMonth() + 1)}-${pad(finExclusive.getDate())}`,
  }
}

/**
 * Borne supérieure exclusive pour SQL : dateFin inclusive → lendemain calendaire.
 * Ex. 2026-01-31 → 2026-02-01 pour que e.ecriture_date < $2 inclue tout le dernier jour,
 * y compris les timestamps FEC en fin de journée / décalage UTC.
 */
function getDateFinEtendue(dateFin) {
  if (!dateFin) return null
  const s = String(dateFin).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(s)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Normalise un nom « NOM PRÉNOM » ou « PRÉNOM NOM » pour matching FEC ↔ Salesforce */
function normaliserNom(n) {
  if (!n) return ''
  return n
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-']/g, ' ')
    .trim()
}

/** Matching approximatif entre libellé salarié FEC et nom chauffeur SF */
function matchNoms(nomFec, nomSf) {
  const fec = normaliserNom(nomFec)
    .split(/\s+/)
    .sort()
    .join(' ')
  const sf = normaliserNom(nomSf)
    .split(/\s+/)
    .sort()
    .join(' ')
  if (fec === sf) return true
  const tokFec = normaliserNom(nomFec).split(/\s+/)
  const tokSf = normaliserNom(nomSf).split(/\s+/)
  const [court, long] = tokFec.length <= tokSf.length ? [tokFec, tokSf] : [tokSf, tokFec]
  return court.every((t) => t.length >= 3 && long.some((l) => l.includes(t) || t.includes(l)))
}

/** Aligne le libellé chargeur (client / transporteur) Salesforce sur les clés CA FEC — indépendant des patterns prestataires chauffeurs (BDD). */
function canonChargeurDepuisSf(nomBrut) {
  const n = (nomBrut || '').trim()
  if (!n || n === 'N/A') return 'Inconnu'
  const u = n.toUpperCase()
  const rules = [
    [/DPD/, 'DPD'],
    [/\bGLS\b/, 'GLS'],
    [/COLIS\s*PRIVE|COLISPRIVE/, 'COLIS PRIVE'],
    [/CIBLEX/, 'CIBLEX'],
    [/CHRONOPOST|CHRONO/, 'CHRONOPOST'],
    [/MONDIAL\s*RELAY|MR\b/, 'MONDIAL RELAY'],
    [/VIAPOSTE/, 'VIAPOSTE'],
    [/RELAIS\s*COLIS/, 'RELAIS COLIS'],
    [/SOLIA/, 'SOLIA'],
    [/FEDEX/, 'FEDEX'],
    [/LAFAGE/, 'LAFAGE'],
    [/SI\s*BIO|SI BIO/, 'SI BIO'],
    [/CENTROCOM/, 'CENTROCOM'],
    [/ESPA\b/, 'ESPA'],
  ]
  for (const [re, key] of rules) {
    if (re.test(u)) return key
  }
  return n.split(/\s*\/\s*/)[0].trim()
}

/** Évite les doublons SF type "step64_2 step64_2" */
function nettoyerNomSf(nom) {
  if (!nom) return ''
  const t = String(nom).trim()
  if (t.toUpperCase() === 'N/A') return ''
  const parts = t.split(/\s+/)
  if (parts.length === 2 && parts[0] === parts[1]) {
    return parts[0]
  }
  return t
}

/** Cache patterns prestataires (g2l_societes), TTL 1 h — invalidable via POST …/invalidate-cache */
let _patternsCache = null
let _patternsCacheTime = 0

async function getPatterns() {
  const now = Date.now()
  if (_patternsCache && now - _patternsCacheTime < 3600000) {
    return _patternsCache
  }
  if (!pool) {
    console.warn('[Référentiel] Fallback patterns (pool indisponible)')
    return [
      'GDS64', 'GDS66', 'STEP64', 'STEP66',
      'GLOBAL DRIVE', 'NEXHAUL', 'ADELL', 'CLEMENT',
    ]
  }
  try {
    const result = await pool.query(`
      SELECT patterns_sf, code, nom, compte_fec_achat
      FROM g2l_societes
      WHERE type IN ('PRESTATAIRE_LIVRAISON', 'SOUS_TRAITANT')
        AND actif = true
    `)
    const patterns = []
    result.rows.forEach((s) => {
      const pats = Array.isArray(s.patterns_sf) ? s.patterns_sf : []
      pats.forEach((p) => {
        if (p != null && String(p).trim() !== '') patterns.push(String(p).toUpperCase())
      })
    })
    _patternsCache = patterns
    _patternsCacheTime = now
    console.log('[Référentiel] Patterns prestataires chargés:', patterns)
    return patterns
  } catch (err) {
    console.warn('[Référentiel] Fallback patterns hardcodés:', err.message)
    return [
      'GDS64', 'GDS66', 'STEP64', 'STEP66',
      'GLOBAL DRIVE', 'NEXHAUL', 'ADELL', 'CLEMENT',
    ]
  }
}

router.post('/dashboard-groupe/referentiel/invalidate-cache', (req, res) => {
  _patternsCache = null
  _patternsCacheTime = 0
  console.log('[Référentiel] Cache patterns invalidé')
  res.json({ success: true, message: 'Cache invalidé' })
})

router.post('/dashboard-groupe/cache/invalidate', (req, res) => {
  invalidateSfCache()
  _patternsCache = null
  _patternsCacheTime = 0
  res.json({
    success: true,
    message: 'Cache SF et patterns invalidés',
  })
})

// ─── ROUTE 1 : KPIs Financiers FEC ───────────────────────────
router.get('/dashboard-groupe/kpis-financiers', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({
      error: 'Base de données non configurée',
      societes: [],
      totaux: { ca: 0, charges: 0, resultat: 0, marge: 0, masse_salariale: 0, carburant: 0, sous_traitance: 0, loyers_flotte: 0 },
      structureCharges: [],
      hasFecData: false,
    })
  }
  try {
    const { dateDebut, dateFin } = req.query

    const query = `
      SELECT 
        s.id as societe_id,
        s.nom as raison_sociale,
        s.siren,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '7%' 
          THEN (e.credit - e.debit) ELSE 0 END), 0) as ca,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '6%' 
          THEN (e.debit - e.credit) ELSE 0 END), 0) as charges,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '641%' OR e.compte_num LIKE '645%'
          THEN (e.debit - e.credit) ELSE 0 END), 0) as masse_salariale,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '606%'
          THEN (e.debit - e.credit) ELSE 0 END), 0) as carburant,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '611%' OR e.compte_num LIKE '621%'
          THEN (e.debit - e.credit) ELSE 0 END), 0) as sous_traitance,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '612%'
          THEN (e.debit - e.credit) ELSE 0 END), 0) as loyers_flotte,
        MIN(e.ecriture_date) as date_debut,
        MAX(e.ecriture_date) as date_fin,
        COUNT(e.id) as nb_ecritures
      FROM fec_societes s
      LEFT JOIN fec_exercices ex ON ex.societe_id = s.id
      LEFT JOIN fec_ecritures e ON e.exercice_id = ex.id
        AND e.societe_id = s.id
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date <= $2::date)
      GROUP BY s.id, s.nom, s.siren
      ORDER BY ca DESC
    `

    const result = await pool.query(query, [dateDebut || null, dateFin || null])

    const societes = result.rows
      .map((row) => {
        const ca = parseFloat(row.ca) || 0
        const charges = parseFloat(row.charges) || 0
        const resultat = ca - charges
        const marge = ca > 0 ? (resultat / ca) * 100 : 0
        const nom = row.raison_sociale || ''
        const nc = nomCourt(nom)

        return {
          societeId: row.societe_id,
          nom: row.raison_sociale,
          nomCourt: nc,
          siren: row.siren,
          ca: Math.round(ca),
          charges: Math.round(charges),
          resultat: Math.round(resultat),
          marge: parseFloat(marge.toFixed(1)),
          masse_salariale: Math.round(parseFloat(row.masse_salariale) || 0),
          carburant: Math.round(parseFloat(row.carburant) || 0),
          sous_traitance: Math.round(parseFloat(row.sous_traitance) || 0),
          loyers_flotte: Math.round(parseFloat(row.loyers_flotte) || 0),
          nbEcritures: parseInt(row.nb_ecritures, 10) || 0,
          dateDebut: row.date_debut,
          dateFin: row.date_fin,
        }
      })
      .filter((s) => s.nbEcritures > 0)

    const totaux = societes.reduce(
      (acc, s) => ({
        ca: acc.ca + s.ca,
        charges: acc.charges + s.charges,
        resultat: acc.resultat + s.resultat,
        masse_salariale: acc.masse_salariale + s.masse_salariale,
        carburant: acc.carburant + s.carburant,
        sous_traitance: acc.sous_traitance + s.sous_traitance,
        loyers_flotte: acc.loyers_flotte + s.loyers_flotte,
      }),
      {
        ca: 0,
        charges: 0,
        resultat: 0,
        masse_salariale: 0,
        carburant: 0,
        sous_traitance: 0,
        loyers_flotte: 0,
      }
    )

    totaux.marge =
      totaux.ca > 0 ? parseFloat(((totaux.resultat / totaux.ca) * 100).toFixed(1)) : 0

    const autres = Math.max(
      0,
      totaux.charges -
        totaux.masse_salariale -
        totaux.carburant -
        totaux.sous_traitance -
        totaux.loyers_flotte
    )

    const structureCharges = [
      { name: 'Masse salariale', value: totaux.masse_salariale, color: '#2563EB' },
      { name: 'Carburant', value: totaux.carburant, color: '#60a5fa' },
      { name: 'Sous-traitance', value: totaux.sous_traitance, color: '#93c5fd' },
      { name: 'Loyers flotte', value: totaux.loyers_flotte, color: '#bfdbfe' },
      { name: 'Autres charges', value: autres, color: '#dbeafe' },
    ].filter((d) => d.value > 0)

    res.json({ societes, totaux, structureCharges, hasFecData: societes.length > 0 })
  } catch (err) {
    console.error('[Dashboard Groupe] KPIs financiers:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── ROUTE 2 : Évolution mensuelle CA (12 mois glissants) PRIVÉE
router.get('/dashboard-groupe/evolution-mensuelle', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({ mois: [], series: [], chartData: [] })
  }
  try {
    const query = `
      SELECT
        s.nom as raison_sociale,
        TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois,
        TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'Mon') as mois_court,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '7%' 
          THEN (e.credit - e.debit) ELSE 0 END), 0) as ca,
        COALESCE(SUM(CASE WHEN e.compte_num LIKE '6%' 
          THEN (e.debit - e.credit) ELSE 0 END), 0) as charges
      FROM fec_societes s
      LEFT JOIN fec_exercices ex ON ex.societe_id = s.id
      LEFT JOIN fec_ecritures e ON e.exercice_id = ex.id
        AND e.societe_id = s.id
        AND e.ecriture_date >= NOW() - INTERVAL '12 months'
      WHERE e.id IS NOT NULL
      GROUP BY s.nom, DATE_TRUNC('month', e.ecriture_date)
      ORDER BY mois ASC, s.nom
    `

    const result = await pool.query(query)
    const moisSet = [...new Set(result.rows.map((r) => r.mois))].sort()
    const societesNoms = [...new Set(result.rows.map((r) => r.raison_sociale))]

    const dataMap = {}
    result.rows.forEach((row) => {
      const key = `${row.raison_sociale}::${row.mois}`
      dataMap[key] = { ca: parseFloat(row.ca) || 0, charges: parseFloat(row.charges) || 0 }
    })

    const counts = {}
    const series = societesNoms.map((nom) => {
      const base = nomCourt(nom)
      counts[base] = (counts[base] || 0) + 1
      const nc = counts[base] === 1 ? base : `${base}_${counts[base]}`
      return {
        nom,
        nomCourt: nc,
        ca: moisSet.map((m) => Math.round(dataMap[`${nom}::${m}`]?.ca || 0)),
        charges: moisSet.map((m) => Math.round(dataMap[`${nom}::${m}`]?.charges || 0)),
        resultat: moisSet.map((m) => {
          const d = dataMap[`${nom}::${m}`]
          return d ? Math.round(d.ca - d.charges) : 0
        }),
      }
    })

    const chartData = moisSet.map((mois, i) => {
      const point = { mois: mois.slice(5) }
      series.forEach((s) => {
        point[`${s.nomCourt}_ca`] = s.ca[i]
        point[`${s.nomCourt}_charges`] = s.charges[i]
        point[`${s.nomCourt}_resultat`] = s.resultat[i]
      })
      return point
    })

    res.json({ mois: moisSet, series, chartData })
  } catch (err) {
    console.error('[Dashboard Groupe] Évolution mensuelle:', err)
    res.status(500).json({ error: err.message, mois: [], series: [], chartData: [] })
  }
})

// ─── ROUTE 3 : KPIs Opérationnels Salesforce ─────────────────
router.get('/dashboard-groupe/kpis-ops', async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query
    const tournees = await exploitationService.getTourneesSalesforce({ dateDebut, dateFin }, 'production')

    const chargeursMap = {}
    let totalPec = 0
    let totalLivres = 0
    let totalKmReel = 0
    let nbOds = 0
    const chauffeursPerf = {}
    const societesOps = {}

    tournees.forEach((od) => {
      nbOds++
      const kmReel = od.kmReel || 0
      totalKmReel += kmReel

      const societe = od.employeur || 'N/A'
      if (!societesOps[societe]) societesOps[societe] = { nbOds: 0, colisPec: 0, colisLivres: 0 }
      societesOps[societe].nbOds++

      const courses = od.courses || []
      courses.forEach((course) => {
        const chargeur = course.chargeur || od.chargeurNom || 'N/A'
        const pec =
          course.totalColisPec || course.colisPrisEnCharge || course.IO_NombreDeColisPrisEnCharge__c || 0
        const livres = course.colisLivres || course.IO_NombreColisLivres__c || 0

        totalPec += pec
        totalLivres += livres
        societesOps[societe].colisPec += pec
        societesOps[societe].colisLivres += livres

        if (!chargeursMap[chargeur]) {
          chargeursMap[chargeur] = { nom: chargeur, colisPec: 0, colisLivres: 0, colisRetour: 0, nbOds: 0 }
        }
        chargeursMap[chargeur].colisPec += pec
        chargeursMap[chargeur].colisLivres += livres
        chargeursMap[chargeur].colisRetour += course.totalColisRetourValue || 0
        chargeursMap[chargeur].nbOds++

        const chauffeur = od.chauffeurNom || course.chauffeur
        if (chauffeur && chauffeur !== 'N/A') {
          if (!chauffeursPerf[chauffeur]) {
            chauffeursPerf[chauffeur] = {
              nom: chauffeur,
              employeur: od.employeur,
              colisPec: 0,
              colisLivres: 0,
              nbOds: 0,
            }
          }
          chauffeursPerf[chauffeur].colisPec += pec
          chauffeursPerf[chauffeur].colisLivres += livres
          chauffeursPerf[chauffeur].nbOds++
        }
      })
    })

    const tauxGlobal = totalPec > 0 ? (totalLivres / totalPec) * 100 : 0

    const chargeurs = Object.values(chargeursMap)
      .map((c) => ({
        ...c,
        taux: c.colisPec > 0 ? parseFloat(((c.colisLivres / c.colisPec) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.colisPec - a.colisPec)

    const topChauffeurs = Object.values(chauffeursPerf)
      .map((c) => ({
        ...c,
        taux: c.colisPec > 0 ? parseFloat(((c.colisLivres / c.colisPec) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.colisPec - a.colisPec)
      .slice(0, 10)

    res.json({
      globaux: {
        nbOds,
        totalPec,
        totalLivres,
        tauxGlobal: parseFloat(tauxGlobal.toFixed(1)),
        totalKmReel: Math.round(totalKmReel),
        tauxRetour:
          totalPec > 0
            ? parseFloat(
                (
                  (Object.values(chargeursMap).reduce((s, c) => s + c.colisRetour, 0) / totalPec) *
                  100
                ).toFixed(1)
              )
            : 0,
      },
      chargeurs,
      topChauffeurs,
      societesOps: Object.entries(societesOps).map(([nom, d]) => ({
        nom,
        ...d,
        taux: d.colisPec > 0 ? parseFloat(((d.colisLivres / d.colisPec) * 100).toFixed(1)) : 0,
      })),
    })
  } catch (err) {
    console.error('[Dashboard Groupe] KPIs ops:', err)
    res.status(500).json({ error: err.message, chargeurs: [], globaux: {}, topChauffeurs: [], societesOps: [] })
  }
})

// ─── ROUTE 4 : Alertes consolidées ───────────────────────────
router.get('/dashboard-groupe/alertes', async (req, res) => {
  const alertes = []
  try {
    if (pool) {
      try {
        const acomptes = await pool.query(
          `SELECT COUNT(*)::int as n FROM acomptes WHERE statut = 'En attente'`
        )
        const n = parseInt(acomptes.rows[0].n, 10)
        if (n > 0) {
          alertes.push({
            niveau: 'warning',
            message: `${n} acompte(s) en attente de validation manager`,
            valeur: n,
            module: 'RH',
            lien: '/manager/acomptes',
          })
        }
      } catch (e) {
        console.warn('[Dashboard Groupe] alertes acomptes:', e.message)
      }

      try {
        const abs = await pool.query(
          `SELECT COUNT(*)::int as n FROM absences 
           WHERE date_debut::date <= CURRENT_DATE AND date_fin::date >= CURRENT_DATE AND statut = 'Validée'`
        )
        const n = parseInt(abs.rows[0].n, 10)
        if (n > 0) {
          alertes.push({
            niveau: 'info',
            message: `${n} absence(s) validée(s) aujourd'hui`,
            valeur: n,
            module: 'RH',
            lien: '/rh/absences',
          })
        }
      } catch (e) {
        console.warn('[Dashboard Groupe] alertes absences:', e.message)
      }

      try {
        const veh = await pool.query(`
          SELECT COUNT(DISTINCT v.objectno) as n
          FROM webfleet_vehicles v
          LEFT JOIN webfleet_trips t ON t.objectno = v.objectno 
            AND t.end_time >= NOW() - INTERVAL '48 hours'
          WHERE v.status = 'A' AND t.tripid IS NULL
        `)
        const n = parseInt(veh.rows[0].n, 10)
        if (n > 0) {
          alertes.push({
            niveau: 'warning',
            message: `${n} véhicule(s) sans activité GPS depuis 48h`,
            valeur: n,
            module: 'Flotte',
            lien: '/flotte/webfleet',
          })
        }
      } catch (e) {
        console.warn('[Dashboard Groupe] alertes webfleet:', e.message)
      }
    }

    res.json({ alertes, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Dashboard Groupe] Alertes:', err)
    res.json({ alertes: [], timestamp: new Date().toISOString() })
  }
})

// ─── ROUTE 5 : KPIs Flotte Webfleet ──────────────────────────
router.get('/dashboard-groupe/kpis-flotte', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({
      error: 'Base de données non configurée',
      globaux: {},
      topVehicules: [],
      vehiculesTempsReel: [],
    })
  }
  try {
    const { dateDebut, dateFin } = req.query

    const [statsGlobal, topVehicules, vehiculesActifs] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(DISTINCT objectno)::int as vehicules_actifs,
          COUNT(*)::int as nb_trajets,
          ROUND(COALESCE(SUM(distance_m), 0) / 1000.0, 0) as km_totaux,
          ROUND(AVG(NULLIF(optidrive_indicator, 0)) * 100, 1) as score_conduite,
          COUNT(DISTINCT drivername) FILTER (WHERE drivername IS NOT NULL)::int as nb_chauffeurs
        FROM webfleet_trips
        WHERE distance_m > 500
          AND ($1::timestamptz IS NULL OR start_time >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR end_time <= $2::timestamptz)
      `,
        [dateDebut ? new Date(dateDebut) : null, dateFin ? new Date(dateFin) : null]
      ),

      pool.query(
        `
        SELECT
          objectname as immatriculation,
          COUNT(*)::int as nb_trajets,
          ROUND(SUM(distance_m) / 1000.0, 1) as km,
          ROUND(AVG(NULLIF(optidrive_indicator, 0)) * 100, 1) as score_conduite
        FROM webfleet_trips
        WHERE distance_m > 500
          AND ($1::timestamptz IS NULL OR start_time >= $1::timestamptz)
          AND ($2::timestamptz IS NULL OR end_time <= $2::timestamptz)
        GROUP BY objectname
        ORDER BY km DESC NULLS LAST
        LIMIT 10
      `,
        [dateDebut ? new Date(dateDebut) : null, dateFin ? new Date(dateFin) : null]
      ),

      pool.query(`
        SELECT
          objectname as immatriculation,
          postext as position,
          drivername as chauffeur,
          CASE WHEN ignition = 1 THEN 'en_route' ELSE 'arrete' END as statut,
          fuellevel as niveau_carburant,
          updated_at,
          speed
        FROM webfleet_vehicles
        WHERE status = 'A'
        ORDER BY 
          CASE WHEN ignition = 1 THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST
        LIMIT 20
      `),
    ])

    const g = statsGlobal.rows[0] || {}
    res.json({
      globaux: {
        vehiculesActifs: parseInt(g.vehicules_actifs, 10) || 0,
        nbTrajets: parseInt(g.nb_trajets, 10) || 0,
        kmTotaux: parseInt(g.km_totaux, 10) || 0,
        scoreConduite: parseFloat(g.score_conduite) || 0,
        nbChauffeurs: parseInt(g.nb_chauffeurs, 10) || 0,
      },
      topVehicules: topVehicules.rows.map((v) => ({
        immatriculation: v.immatriculation,
        nbTrajets: parseInt(v.nb_trajets, 10),
        km: parseFloat(v.km),
        scoreConduite: parseFloat(v.score_conduite) || 0,
      })),
      vehiculesTempsReel: vehiculesActifs.rows,
    })
  } catch (err) {
    console.error('[Dashboard Groupe] KPIs flotte:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/dashboard-groupe/ca-chargeurs', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({
      error: 'Base de données non configurée',
      chargeurs: [],
      evolutionChart: [],
      projection: [],
      repartition: [],
      caTotal: 0,
      caInterne: 0,
      moisDisponibles: 0,
      top6: [],
      mode: req.query.mode || 'consolide',
    })
  }
  try {
    const { dateDebut, dateFin, mode = 'consolide' } = req.query
    // mode = 'consolide' → exclut internes (vue groupe sans double comptage)
    // mode = 'entites'   → inclut tout (vue légale par société)

    const MAPPING_CHARGEURS = {
      '706703': 'DPD',
      '706700': 'GLS',
      '706704': 'COLIS PRIVE',
      '706702': 'COLIS PRIVE',
      '706705': 'CIBLEX',
      '706711': 'CHRONOPOST',
      '706712': 'CHRONOPOST',
      '706701': 'MONDIAL RELAY',
      '706713': 'VIAPOSTE',
      '706708': 'RELAIS COLIS',
      '706706': 'SOLIA',
      '706710': 'FEDEX',
      '706707': 'LAFAGE',
      '706715': 'SI BIO',
      '706714': 'CENTROCOM',
      '706709': 'ESPA',
      // Flux internes — inclus en mode entites
      '706200': 'INTERNE GROUPE',
      '706010': 'INTERNE GROUPE',
      '706011': 'INTERNE GROUPE',
    }

    // Comptes refacturations à exclure uniquement en mode consolidé
    const COMPTES_INTERNES = ['706200', '706010', '706011']
    // Comptes de refacturation véhicules/locations toujours exclus
    const COMPTES_TOUJOURS_EXCLUS = ['708800', '708803', '708510']

    const exclusions = mode === 'consolide'
      ? [...COMPTES_INTERNES, ...COMPTES_TOUJOURS_EXCLUS]
      : COMPTES_TOUJOURS_EXCLUS

    const queryCA = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois,
        s.nom as societe,
        e.compte_num,
        e.compte_lib,
        ROUND(SUM(e.credit - e.debit)::numeric, 0) as ca
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE e.compte_num LIKE '706%'
        AND (e.credit - e.debit) > 0
        AND e.compte_num != ALL($1::text[])
        AND ($2::date IS NULL OR e.ecriture_date >= $2::date)
        AND ($3::date IS NULL OR e.ecriture_date <= $3::date)
      GROUP BY
        DATE_TRUNC('month', e.ecriture_date),
        s.nom,
        e.compte_num,
        e.compte_lib
      ORDER BY mois ASC, ca DESC
    `

    const queryCouts = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois,
        s.nom as societe,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '641%' OR e.compte_num LIKE '645%'
          THEN (e.debit - e.credit) ELSE 0 END)::numeric, 0) as masse_salariale,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '606%'
          THEN (e.debit - e.credit) ELSE 0 END)::numeric, 0) as carburant,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '612%'
          THEN (e.debit - e.credit) ELSE 0 END)::numeric, 0) as loyers_flotte,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '616%'
          THEN (e.debit - e.credit) ELSE 0 END)::numeric, 0) as assurances,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '6%'
          THEN (e.debit - e.credit) ELSE 0 END)::numeric, 0) as charges_totales
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date <= $2::date)
      GROUP BY
        DATE_TRUNC('month', e.ecriture_date),
        s.nom
      ORDER BY mois ASC
    `

    const [caResult, coutsResult] = await Promise.all([
      pool.query(queryCA, [exclusions, dateDebut || null, dateFin || null]),
      pool.query(queryCouts, [dateDebut || null, dateFin || null]),
    ])

    // Agrégation CA par chargeur
    const chargeursMap = {}
    const evolutionMap = {}
    const societesMap = {}

    caResult.rows.forEach((row) => {
      const chargeur = MAPPING_CHARGEURS[row.compte_num]
        || (row.compte_lib || '').replace('PRESTATIONS ', '').trim()

      const ca = parseFloat(row.ca) || 0

      if (!chargeursMap[chargeur]) {
        chargeursMap[chargeur] = { nom: chargeur, ca: 0, comptes: new Set(), isInterne: chargeur === 'INTERNE GROUPE' }
      }
      chargeursMap[chargeur].ca += ca
      chargeursMap[chargeur].comptes.add(row.compte_num)

      if (!evolutionMap[row.mois]) evolutionMap[row.mois] = {}
      evolutionMap[row.mois][chargeur] = (evolutionMap[row.mois][chargeur] || 0) + ca

      if (!societesMap[chargeur]) societesMap[chargeur] = {}
      const soc = row.societe?.includes('TPS')
        ? 'TPS'
        : row.societe?.includes('D & J') || row.societe?.includes('D&J')
          ? 'D&J'
          : 'Holding'
      societesMap[chargeur][soc] = (societesMap[chargeur][soc] || 0) + ca
    })

    // Coûts par société
    const coutsParSociete = {}
    coutsResult.rows.forEach((row) => {
      const soc = row.societe?.includes('TPS')
        ? 'TPS'
        : row.societe?.includes('D & J') || row.societe?.includes('D&J')
          ? 'D&J'
          : 'Holding'
      if (!coutsParSociete[soc]) {
        coutsParSociete[soc] = { masse_salariale: 0, carburant: 0, loyers_flotte: 0, assurances: 0, charges_totales: 0 }
      }
      coutsParSociete[soc].masse_salariale += parseFloat(row.masse_salariale) || 0
      coutsParSociete[soc].carburant += parseFloat(row.carburant) || 0
      coutsParSociete[soc].loyers_flotte += parseFloat(row.loyers_flotte) || 0
      coutsParSociete[soc].assurances += parseFloat(row.assurances) || 0
      coutsParSociete[soc].charges_totales += parseFloat(row.charges_totales) || 0
    })

    // CA total par société (pour prorata)
    const caTotalParSociete = {}
    Object.entries(chargeursMap).forEach(([chargeur, data]) => {
      if (data.isInterne) return // exclure internes du prorata même en mode entites
      Object.entries(societesMap[chargeur] || {}).forEach(([soc, ca]) => {
        caTotalParSociete[soc] = (caTotalParSociete[soc] || 0) + ca
      })
    })

    // Calcul rentabilité par chargeur
    const chargeurs = Object.values(chargeursMap).map((c) => {
      let coutEstime = 0

      if (!c.isInterne) {
        Object.entries(societesMap[c.nom] || {}).forEach(([soc, caChargeur]) => {
          const couts = coutsParSociete[soc]
          const caTotal = caTotalParSociete[soc]
          if (couts && caTotal > 0) {
            const ratio = caChargeur / caTotal
            coutEstime += couts.masse_salariale * ratio
            coutEstime += couts.carburant * ratio
            coutEstime += couts.loyers_flotte * ratio
            coutEstime += couts.assurances * ratio
          }
        })
      }

      const marge = c.ca - coutEstime
      const tauxMarge = c.ca > 0 ? (marge / c.ca) * 100 : 0

      return {
        nom: c.nom,
        ca: Math.round(c.ca),
        coutEstime: Math.round(coutEstime),
        marge: Math.round(marge),
        tauxMarge: parseFloat(tauxMarge.toFixed(1)),
        parSociete: societesMap[c.nom] || {},
        comptes: Array.from(c.comptes),
        isInterne: c.isInterne,
      }
    }).sort((a, b) => b.ca - a.ca)

    // Top 6 chargeurs externes pour les graphiques
    const top6 = chargeurs
      .filter((c) => !c.isInterne)
      .slice(0, 6)
      .map((c) => c.nom)

    // Évolution mensuelle formatée Recharts
    const moisListe = Object.keys(evolutionMap).sort()

    const evolutionChart = moisListe.map((mois) => {
      const point = { mois: mois.slice(5), moisISO: mois }
      top6.forEach((nom) => { point[nom] = evolutionMap[mois][nom] || 0 })
      point.TOTAL = Object.values(evolutionMap[mois]).reduce((s, v) => s + v, 0)
      return point
    })

    // Projection 3 mois (moyenne mobile)
    const projection = []
    if (moisListe.length >= 3) {
      for (let i = 1; i <= 3; i += 1) {
        const date = new Date()
        date.setMonth(date.getMonth() + i)
        const moisLabel = String(date.getMonth() + 1).padStart(2, '0')
        const point = { mois: moisLabel, isProjection: true }
        top6.forEach((nom) => {
          const vals = moisListe.slice(-3).map((m) => evolutionMap[m][nom] || 0)
          const moy = vals.reduce((a, b) => a + b, 0) / vals.length
          const tendance = vals.length >= 2 ? (vals[vals.length - 1] - vals[0]) / vals.length : 0
          point[nom] = Math.max(0, Math.round(moy + tendance * i))
        })
        projection.push(point)
      }
    }

    // Répartition donut (top 8 externes)
    const caTotal = chargeurs.filter((c) => !c.isInterne).reduce((s, c) => s + c.ca, 0)
    const caInterne = chargeurs.filter((c) => c.isInterne).reduce((s, c) => s + c.ca, 0)

    const repartition = chargeurs
      .filter((c) => !c.isInterne)
      .slice(0, 8)
      .map((c, i) => ({
        nom: c.nom,
        ca: c.ca,
        pct: caTotal > 0 ? parseFloat(((c.ca / caTotal) * 100).toFixed(1)) : 0,
        color: ['#2563EB', '#0d9488', '#7c3aed', '#d97706', '#dc2626', '#059669', '#6366f1', '#db2777'][i],
      }))

    res.json({
      chargeurs,
      evolutionChart,
      projection,
      repartition,
      caTotal: Math.round(caTotal),
      caInterne: Math.round(caInterne),
      moisDisponibles: moisListe.length,
      top6,
      mode,
    })
  } catch (err) {
    console.error('[Dashboard Groupe] CA Chargeurs:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/dashboard-groupe/fec-chargeurs/:societeId', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({ error: 'Base de données non configurée', chargeurs: [] })
  }
  try {
    const { societeId } = req.params
    const { dateDebut, dateFin } = req.query

    const MAPPING = {
      '706703': 'DPD', '706700': 'GLS',
      '706704': 'COLIS PRIVE', '706702': 'COLIS PRIVE',
      '706705': 'CIBLEX', '706711': 'CHRONOPOST',
      '706712': 'CHRONOPOST', '706701': 'MONDIAL RELAY',
      '706713': 'VIAPOSTE', '706708': 'RELAIS COLIS',
      '706706': 'SOLIA', '706710': 'FEDEX',
      '706707': 'LAFAGE', '706715': 'SI BIO',
      '706714': 'CENTROCOM', '706709': 'ESPA',
    }
    const EXCLUS = ['706200', '706010', '706011', '708800', '708803', '708510']

    const result = await pool.query(
      `
      SELECT
        e.compte_num,
        e.compte_lib,
        TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois,
        ROUND(SUM(e.credit - e.debit)::numeric, 0) as ca,
        COUNT(*) as nb_ecritures
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      WHERE ex.societe_id = $1
        AND e.compte_num LIKE '706%'
        AND (e.credit - e.debit) > 0
        AND e.compte_num != ALL($2::text[])
        AND ($3::date IS NULL OR e.ecriture_date >= $3::date)
        AND ($4::date IS NULL OR e.ecriture_date <= $4::date)
      GROUP BY e.compte_num, e.compte_lib, DATE_TRUNC('month', e.ecriture_date)
      ORDER BY ca DESC
      `,
      [societeId, EXCLUS, dateDebut || null, dateFin || null]
    )

    const chargeursMap = {}
    result.rows.forEach((row) => {
      const chargeur = MAPPING[row.compte_num] || (row.compte_lib || '').replace('PRESTATIONS ', '').trim()
      const ca = parseFloat(row.ca) || 0
      if (!chargeursMap[chargeur]) {
        chargeursMap[chargeur] = { nom: chargeur, ca: 0, comptes: [], parMois: {}, nbEcritures: 0 }
      }
      chargeursMap[chargeur].ca += ca
      chargeursMap[chargeur].nbEcritures += parseInt(row.nb_ecritures, 10)
      if (!chargeursMap[chargeur].comptes.includes(row.compte_num)) {
        chargeursMap[chargeur].comptes.push(row.compte_num)
      }
      chargeursMap[chargeur].parMois[row.mois] = (chargeursMap[chargeur].parMois[row.mois] || 0) + ca
    })

    const chargeurs = Object.values(chargeursMap).sort((a, b) => b.ca - a.ca).map((c) => ({
      ...c,
      parMois: Object.entries(c.parMois)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mois, ca]) => ({ mois, ca: Math.round(ca) })),
    }))

    res.json({ chargeurs })
  } catch (err) {
    console.error('[FEC Chargeurs]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/dashboard-groupe/fec-ecritures', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({ error: 'Base de données non configurée', ecritures: [], total: 0, nb: 0 })
  }
  try {
    const { societeId: societeIdRaw, comptes, mois } = req.query
    const societeId =
      societeIdRaw &&
      String(societeIdRaw) !== 'null' &&
      String(societeIdRaw) !== 'undefined'
        ? societeIdRaw
        : null
    const comptesArr = comptes ? String(comptes).split(',') : []
    if (!comptesArr.length) {
      return res.status(400).json({ error: 'comptes requis' })
    }
    if (!mois || !/^\d{4}-\d{2}$/.test(String(mois))) {
      return res.status(400).json({ error: 'mois requis au format YYYY-MM' })
    }

    const { dateDebut, dateFin } = getDateRangeMois(mois)

    const query = societeId
      ? `
        SELECT
          e.id,
          s.nom as societe_nom,
          e.journal_code as "JournalCode",
          e.journal_lib as "JournalLib",
          e.ecriture_num as "EcritureNum",
          e.ecriture_date as "EcritureDate",
          e.compte_num as "CompteNum",
          e.compte_lib as "CompteLib",
          e.comp_aux_num as "CompAuxNum",
          e.comp_aux_lib as "CompAuxLib",
          e.piece_ref as "PieceRef",
          e.piece_date as "PieceDate",
          e.ecriture_lib as "EcritureLib",
          ROUND(e.debit::numeric, 2) as "Debit",
          ROUND(e.credit::numeric, 2) as "Credit",
          e.ecriture_let as "EcritureLet",
          e.mode_rglt as "ModeRglt",
          ROUND((e.credit - e.debit)::numeric, 2) as "Solde"
        FROM fec_ecritures e
        JOIN fec_exercices ex ON ex.id = e.exercice_id
        JOIN fec_societes s ON s.id = ex.societe_id
        WHERE ex.societe_id = $1
          AND e.compte_num = ANY($2::text[])
          AND e.ecriture_date >= $3::date
          AND e.ecriture_date < $4::date
        ORDER BY e.ecriture_date ASC, e.ecriture_num ASC
      `
      : `
        SELECT
          e.id,
          s.nom as societe_nom,
          e.journal_code as "JournalCode",
          e.journal_lib as "JournalLib",
          e.ecriture_num as "EcritureNum",
          e.ecriture_date as "EcritureDate",
          e.compte_num as "CompteNum",
          e.compte_lib as "CompteLib",
          e.comp_aux_num as "CompAuxNum",
          e.comp_aux_lib as "CompAuxLib",
          e.piece_ref as "PieceRef",
          e.piece_date as "PieceDate",
          e.ecriture_lib as "EcritureLib",
          ROUND(e.debit::numeric, 2) as "Debit",
          ROUND(e.credit::numeric, 2) as "Credit",
          e.ecriture_let as "EcritureLet",
          e.mode_rglt as "ModeRglt",
          ROUND((e.credit - e.debit)::numeric, 2) as "Solde"
        FROM fec_ecritures e
        JOIN fec_exercices ex ON ex.id = e.exercice_id
        JOIN fec_societes s ON s.id = ex.societe_id
        WHERE e.compte_num = ANY($1::text[])
          AND e.ecriture_date >= $2::date
          AND e.ecriture_date < $3::date
        ORDER BY s.nom ASC, e.ecriture_date ASC, e.ecriture_num ASC
      `

    const params = societeId
      ? [societeId, comptesArr, dateDebut, dateFin]
      : [comptesArr, dateDebut, dateFin]

    const result = await pool.query(query, params)

    const total = result.rows.reduce((s, r) => s + (parseFloat(r.Solde) || 0), 0)

    res.json({
      ecritures: result.rows,
      total: Math.round(total),
      nb: result.rows.length,
      mois,
      societeId: societeId || 'all',
    })
  } catch (err) {
    console.error('[FEC Écritures]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/dashboard-groupe/rentabilite-chargeurs', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({
      error: 'Base de données non configurée',
      chargeurs: [],
      meta: {},
    })
  }
  try {
    const { dateDebut, dateFin, societeId: societeIdRaw, chargeur: chargeurFiltre } = req.query
    const societeId =
      societeIdRaw && String(societeIdRaw) !== 'null' && String(societeIdRaw) !== 'undefined'
        ? parseInt(String(societeIdRaw), 10)
        : null
    const societeFilter = Number.isFinite(societeId) ? societeId : null

    const dateFinSQL = getDateFinEtendue(dateFin)

    const patternsPrestataires = await getPatterns()

    const queryFecSalaires = `
      WITH nets AS (
        SELECT
          ex.societe_id,
          s.nom as societe_nom,
          e.compte_num,
          e.compte_lib as nom_salarie,
          ABS(SUM(e.debit - e.credit)) as net_verse,
          TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois
        FROM fec_ecritures e
        JOIN fec_exercices ex ON ex.id = e.exercice_id
        JOIN fec_societes s ON s.id = ex.societe_id
        WHERE e.compte_num LIKE '421%'
          AND e.compte_num NOT LIKE '4421%'
          AND (e.credit - e.debit) > 0
          AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
          AND ($2::date IS NULL OR e.ecriture_date < $2::date)
          AND ($3::int IS NULL OR ex.societe_id = $3::int)
        GROUP BY ex.societe_id, s.nom, e.compte_num,
                 e.compte_lib, DATE_TRUNC('month', e.ecriture_date)
      ),
      charges AS (
        SELECT
          ex.societe_id,
          TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois,
          SUM(CASE WHEN e.compte_num LIKE '641%'
            THEN (e.debit - e.credit) ELSE 0 END) as brut_ind,
          SUM(CASE WHEN e.compte_num LIKE '645%'
            THEN (e.debit - e.credit) ELSE 0 END) as charges_pat,
          SUM(CASE WHEN e.compte_num LIKE '431%'
               OR e.compte_num LIKE '437%'
            THEN ABS(e.debit - e.credit) ELSE 0 END) as charges_sal
        FROM fec_ecritures e
        JOIN fec_exercices ex ON ex.id = e.exercice_id
        WHERE e.journal_code IN ('ODSA','ODS')
          AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
          AND ($2::date IS NULL OR e.ecriture_date < $2::date)
          AND ($3::int IS NULL OR ex.societe_id = $3::int)
        GROUP BY ex.societe_id, DATE_TRUNC('month', e.ecriture_date)
      ),
      nets_total AS (
        SELECT societe_id, mois, SUM(net_verse) as total_nets
        FROM nets
        GROUP BY societe_id, mois
      )
      SELECT
        n.societe_nom,
        n.nom_salarie,
        n.mois,
        ROUND(n.net_verse::numeric, 2) as net_verse,
        ROUND(
          (n.net_verse *
          (COALESCE(c.brut_ind,0) + COALESCE(c.charges_pat,0) +
           COALESCE(c.charges_sal,0))
          / NULLIF(nt.total_nets, 0))::numeric,
        2) as cout_charge
      FROM nets n
      JOIN nets_total nt ON nt.societe_id = n.societe_id
                         AND nt.mois = n.mois
      LEFT JOIN charges c ON c.societe_id = n.societe_id
                          AND c.mois = n.mois
      ORDER BY n.societe_nom, n.mois, cout_charge DESC
    `

    const queryLoyers = `
      SELECT
        s.nom as societe_nom,
        ROUND(SUM(e.debit - e.credit)::numeric, 0) as loyers_total
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE e.compte_num LIKE '612%'
        AND (e.debit - e.credit) > 0
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date < $2::date)
        AND ($3::int IS NULL OR ex.societe_id = $3::int)
      GROUP BY s.nom
    `

    const queryLoyersParImmat = `
      SELECT
        e.compte_lib,
        e.ecriture_lib,
        ROUND(SUM(e.debit - e.credit)::numeric, 2) as loyer_mois
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE (e.compte_num LIKE '612%'
        OR e.compte_num LIKE '613%')
        AND e.compte_num NOT LIKE '615%'
        AND e.compte_num NOT LIKE '616%'
        AND (e.debit - e.credit) > 0
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date < $2::date)
        AND ($3::int IS NULL OR ex.societe_id = $3::int)
      GROUP BY e.compte_lib, e.ecriture_lib
      ORDER BY loyer_mois DESC
    `

    const MAPPING_CHARGEURS_RENTA = {
      706703: 'DPD',
      706700: 'GLS',
      706704: 'COLIS PRIVE',
      706702: 'COLIS PRIVE',
      706705: 'CIBLEX',
      706711: 'CHRONOPOST',
      706712: 'CHRONOPOST',
      706701: 'MONDIAL RELAY',
      706713: 'VIAPOSTE',
      706708: 'RELAIS COLIS',
      706706: 'SOLIA',
      706710: 'FEDEX',
      706707: 'LAFAGE',
      706715: 'SI BIO',
      706714: 'CENTROCOM',
      706709: 'ESPA',
    }
    const EXCLUS_RENTA = ['706200', '706010', '706011', '708800', '708803', '708510']

    const queryCA = `
      SELECT
        s.nom as societe_nom,
        e.compte_num,
        e.compte_lib,
        ROUND(SUM(e.credit - e.debit)::numeric, 0) as ca
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE e.compte_num LIKE '706%'
        AND (e.credit - e.debit) > 0
        AND e.compte_num != ALL($4::text[])
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date < $2::date)
        AND ($3::int IS NULL OR ex.societe_id = $3::int)
      GROUP BY s.nom, e.compte_num, e.compte_lib
      ORDER BY ca DESC
    `

    const querySousTraitance = `
      SELECT
        s.nom as societe_nom,
        TO_CHAR(DATE_TRUNC('month', e.ecriture_date), 'YYYY-MM') as mois,
        ROUND(SUM(e.debit - e.credit)::numeric, 0) as montant
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE e.compte_num IN ('622800', '604001')
        AND (
          UPPER(e.ecriture_lib) LIKE '%GLOBAL DRIVE%'
          OR UPPER(e.ecriture_lib) LIKE '%NEXHAUL%'
          OR UPPER(e.ecriture_lib) LIKE '%STEP%'
        )
        AND (e.debit - e.credit) > 0
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date < $2::date)
        AND ($3::int IS NULL OR ex.societe_id = $3::int)
      GROUP BY s.nom, DATE_TRUNC('month', e.ecriture_date)
      ORDER BY mois ASC
    `

    const paramsDateSoc = [dateDebut || null, dateFinSQL || null, societeFilter]

    const [salResult, loyersResult, loyersImmatResult, caResult, stResult] = await Promise.all([
      pool.query(queryFecSalaires, paramsDateSoc),
      pool.query(queryLoyers, paramsDateSoc),
      pool.query(queryLoyersParImmat, paramsDateSoc),
      pool.query(queryCA, [...paramsDateSoc, EXCLUS_RENTA]),
      pool.query(querySousTraitance, paramsDateSoc),
    ])

    const loyerParImmat = {}
    loyersImmatResult.rows.forEach((row) => {
      const lib = `${row.compte_lib || ''} ${row.ecriture_lib || ''}`
      const immat = extraireImmatFec(lib)
      if (immat) {
        loyerParImmat[immat] = (loyerParImmat[immat] || 0) + parseFloat(row.loyer_mois)
      }
    })
    console.log('[Rentabilité] Loyers par immat:', Object.keys(loyerParImmat).length, 'véhicules')

    const sousTraitanceParSociete = {}
    stResult.rows.forEach((row) => {
      const soc = row.societe_nom?.includes('TPS')
        ? 'TPS'
        : row.societe_nom?.includes('D & J') || row.societe_nom?.includes('D&J')
          ? 'D&J'
          : 'Holding'
      sousTraitanceParSociete[soc] = (sousTraitanceParSociete[soc] || 0) + parseFloat(row.montant)
    })

    const odsParChargeur = {}
    const odsParChauffeur = {}
    const odsParVehicule = {}

    const cacheKey = getSfCacheKey(dateDebut, dateFin, societeFilter)
    let sfData = getSfCache(cacheKey)

    if (sfData) {
      console.log(`[SF Cache] Hit: ${cacheKey}`)
    } else {
      console.log(`[SF Cache] Miss: ${cacheKey} — chargement SF...`)

      const [odsResult, carbRaw] = await Promise.all([
        exploitationService
          .getTourneesSalesforce({ dateDebut, dateFin }, 'production')
          .catch((e) => {
            console.warn('[Rentabilité] SF ODs non disponible:', e.message)
            return []
          }),
        exploitationService
          .getCarburantTransactions({
            dateDebut,
            dateFin,
          })
          .catch((e) => {
            console.warn('[Rentabilité] Carburant SF non disponible:', e.message)
            return { data: [] }
          }),
      ])

      const transactionsFromCarb = Array.isArray(carbRaw) ? carbRaw : carbRaw?.data || carbRaw || []

      sfData = {
        ods: odsResult,
        transactions: transactionsFromCarb,
      }

      setSfCache(cacheKey, sfData)
    }

    const ods = sfData.ods || []
    const transactionsCarburant = sfData.transactions || []
    console.log('[Rentabilité] Transactions carburant:', transactionsCarburant.length)

    ods.forEach((od) => {
        const ch = canonChargeurDepuisSf(od.chargeurNom) || 'Inconnu'
        const chauff = nettoyerNomSf(od.chauffeurNom || '')
        const vehNorm = od.vehiculeImmat
          ? String(od.vehiculeImmat).replace(/\s+/g, '-').toUpperCase().trim()
          : ''
        const veh = immatValide(vehNorm) ? vehNorm : ''
        const estPresta =
          !!chauff &&
          patternsPrestataires.some((p) => chauff.toUpperCase().includes(p))
        const dayKey =
          od.date &&
          (typeof od.date === 'string'
            ? od.date.slice(0, 10)
            : new Date(od.date).toISOString().slice(0, 10))

        if (!odsParChargeur[ch]) {
          odsParChargeur[ch] = {
            nb: 0,
            joursUniques: new Set(),
            chauffeurs: {},
            chauffeurInternes: {},
            chauffeurPrestataires: {},
            vehicules: new Set(),
            nbTourneesPrestataire: 0,
            nbTourneesInterne: 0,
          }
        }
        odsParChargeur[ch].nb += 1
        if (dayKey) odsParChargeur[ch].joursUniques.add(dayKey)

        if (estPresta) {
          odsParChargeur[ch].nbTourneesPrestataire += 1
          if (chauff) {
            odsParChargeur[ch].chauffeurPrestataires[chauff] =
              (odsParChargeur[ch].chauffeurPrestataires[chauff] || 0) + 1
          }
        } else {
          odsParChargeur[ch].nbTourneesInterne += 1
          if (chauff) {
            odsParChargeur[ch].chauffeurs[chauff] = (odsParChargeur[ch].chauffeurs[chauff] || 0) + 1
            odsParChargeur[ch].chauffeurInternes[chauff] =
              (odsParChargeur[ch].chauffeurInternes[chauff] || 0) + 1
          }
        }

        if (chauff && !estPresta) {
          if (!odsParChauffeur[chauff]) {
            odsParChauffeur[chauff] = {
              total: 0,
              joursUniques: new Set(),
              parChargeur: {},
              joursParChargeur: {},
            }
          }
          odsParChauffeur[chauff].total += 1
          if (dayKey) odsParChauffeur[chauff].joursUniques.add(dayKey)
          odsParChauffeur[chauff].parChargeur[ch] = (odsParChauffeur[chauff].parChargeur[ch] || 0) + 1
          if (dayKey) {
            if (!odsParChauffeur[chauff].joursParChargeur[ch]) {
              odsParChauffeur[chauff].joursParChargeur[ch] = new Set()
            }
            odsParChauffeur[chauff].joursParChargeur[ch].add(dayKey)
          }
        }

        if (veh && !estPresta) {
          if (!odsParVehicule[veh]) {
            odsParVehicule[veh] = {
              joursTotal: new Set(),
              joursParChargeur: {},
            }
          }
          if (dayKey) {
            odsParVehicule[veh].joursTotal.add(dayKey)
            if (!odsParVehicule[veh].joursParChargeur[ch]) {
              odsParVehicule[veh].joursParChargeur[ch] = new Set()
            }
            odsParVehicule[veh].joursParChargeur[ch].add(dayKey)
          }
        }

        if (veh) odsParChargeur[ch].vehicules.add(veh)
    })

    const carburantParVehicule = {}
    transactionsCarburant.forEach((t) => {
      const raw = t.vehicle || t.vehiculeImmat || ''
      const vNorm = String(raw).replace(/\s+/g, '-').toUpperCase().trim()
      if (!immatValide(vNorm)) return
      const vUp = vNorm
      if (!carburantParVehicule[vUp]) {
        carburantParVehicule[vUp] = { montantHT: 0, nb: 0 }
      }
      carburantParVehicule[vUp].montantHT += parseFloat(t.montantHT) || 0
      carburantParVehicule[vUp].nb += 1
    })

    const coutParSalarie = {}
    salResult.rows.forEach((row) => {
      const nom = normaliserNom(row.nom_salarie)
      if (!coutParSalarie[nom]) {
        coutParSalarie[nom] = {
          nomOriginal: row.nom_salarie,
          societe: row.societe_nom,
          netTotal: 0,
          coutChargeTotal: 0,
        }
      }
      coutParSalarie[nom].netTotal += parseFloat(row.net_verse) || 0
      coutParSalarie[nom].coutChargeTotal += parseFloat(row.cout_charge) || 0
    })

    const caParChargeur = {}
    caResult.rows.forEach((row) => {
      const code = parseInt(String(row.compte_num || '').replace(/\D/g, ''), 10)
      const mapped = Number.isFinite(code) ? MAPPING_CHARGEURS_RENTA[code] : null
      const chargeur =
        mapped ||
        (row.compte_lib || '').replace('PRESTATIONS ', '').trim()
      if (!chargeur) return
      caParChargeur[chargeur] = (caParChargeur[chargeur] || 0) + parseFloat(row.ca)
    })

    const loyersParSociete = {}
    loyersResult.rows.forEach((row) => {
      const soc = row.societe_nom?.includes('TPS')
        ? 'TPS'
        : row.societe_nom?.includes('D & J') || row.societe_nom?.includes('D&J')
          ? 'D&J'
          : 'Holding'
      loyersParSociete[soc] = (loyersParSociete[soc] || 0) + parseFloat(row.loyers_total)
    })

    const totalTourneesPrestaGlobal =
      Object.values(odsParChargeur).reduce((s, d) => s + (d.nbTourneesPrestataire || 0), 0) || 1
    const stTotal = Object.values(sousTraitanceParSociete).reduce((s, v) => s + v, 0)

    const chargeurs = Object.entries(caParChargeur)
      .map(([nom, ca]) => {
        const odsData = odsParChargeur[nom] || {
          nb: 0,
          joursUniques: new Set(),
          chauffeurs: {},
          chauffeurInternes: {},
          chauffeurPrestataires: {},
          vehicules: new Set(),
          nbTourneesPrestataire: 0,
          nbTourneesInterne: 0,
        }
        const nbTourneesChargeur = odsData.nb
        const nbVehiculesChargeur =
          odsData.vehicules instanceof Set ? odsData.vehicules.size : 0

        let masseSalInterne = 0
        const chauffeursInternes = odsData.chauffeurInternes || {}
        Object.entries(chauffeursInternes).forEach(([nomSf, nbOds]) => {
          const salFec = Object.entries(coutParSalarie).find(([nomFec]) => matchNoms(nomFec, nomSf))
          if (salFec) {
            const [, data] = salFec

            const joursChargeur =
              odsParChauffeur[nomSf]?.joursParChargeur?.[nom]?.size || nbOds
            const joursTotalChauffeur =
              odsParChauffeur[nomSf]?.joursUniques?.size ||
              odsParChauffeur[nomSf]?.total ||
              nbOds

            const ratio =
              joursTotalChauffeur > 0 ? Math.min(joursChargeur / joursTotalChauffeur, 1) : 0

            masseSalInterne += data.coutChargeTotal * ratio
          }
        })

        let sousTraitanceChargeur = 0
        const nbTourneesPresta = odsData.nbTourneesPrestataire || 0
        if (nbTourneesPresta > 0 && stTotal > 0) {
          sousTraitanceChargeur = stTotal * (nbTourneesPresta / totalTourneesPrestaGlobal)
        }

        const masseSalChargeur = masseSalInterne + sousTraitanceChargeur

        const vehiculesChargeur =
          odsData.vehicules instanceof Set ? [...odsData.vehicules] : []

        let loyerChargeur = 0
        vehiculesChargeur.forEach((immat) => {
          const loyerMensuel = loyerParImmat[immat]
          if (loyerMensuel) {
            const joursVehChargeur = odsParVehicule[immat]?.joursParChargeur?.[nom]?.size || 0
            const joursVehTotal = odsParVehicule[immat]?.joursTotal?.size || 1
            const ratio = Math.min(joursVehChargeur / joursVehTotal, 1)
            loyerChargeur += loyerMensuel * ratio
          }
        })
        loyerChargeur = Math.round(loyerChargeur)

        let carburantChargeur = 0
        vehiculesChargeur.forEach((immat) => {
          const trans = carburantParVehicule[immat]
          if (trans && trans.montantHT > 0) {
            const joursVehChargeur = odsParVehicule[immat]?.joursParChargeur?.[nom]?.size || 0
            const joursVehTotal = odsParVehicule[immat]?.joursTotal?.size || 1
            const ratio = Math.min(joursVehChargeur / joursVehTotal, 1)
            carburantChargeur += trans.montantHT * ratio
          }
        })
        carburantChargeur = Math.round(carburantChargeur)

        const coutTotal = masseSalChargeur + loyerChargeur + carburantChargeur
        const marge = ca - coutTotal
        const tauxMarge = ca > 0 ? (marge / ca) * 100 : 0

        const detailChauffeurs = Object.entries(chauffeursInternes)
          .map(([nomSf, nbOds]) => {
            const salFec = Object.entries(coutParSalarie).find(([nomFec]) => matchNoms(nomFec, nomSf))
            if (!salFec) return null
            const [, data] = salFec
            const joursChargeur = odsParChauffeur[nomSf]?.joursParChargeur?.[nom]?.size || 0
            const joursTotalChauffeur = odsParChauffeur[nomSf]?.joursUniques?.size || 1
            const ratio = Math.min(joursChargeur / joursTotalChauffeur, 1)
            const coutAffecte = Math.round(data.coutChargeTotal * ratio)
            if (coutAffecte === 0) return null
            return {
              nom: nomSf,
              nomFec: data.nomOriginal,
              joursCP: joursChargeur,
              joursTotal: joursTotalChauffeur,
              ratio: Math.round(ratio * 100),
              coutChargeTotal: Math.round(data.coutChargeTotal),
              coutAffecte,
            }
          })
          .filter(Boolean)
          .sort((a, b) => b.coutAffecte - a.coutAffecte)

        const detailPrestataires = Object.entries(odsData.chauffeurPrestataires || {})
          .map(([nomSf, nbTournees]) => {
            const pattern = patternsPrestataires.find((p) => nomSf.toUpperCase().includes(p))
            return {
              nom: nomSf,
              nbTournees,
              pattern: pattern || null,
            }
          })
          .sort((a, b) => b.nbTournees - a.nbTournees)

        const detailLoyersVehicules = vehiculesChargeur
          .map((immat) => {
            const loyerMensuel = loyerParImmat[immat]
            if (!loyerMensuel) return null
            const joursVehChargeur = odsParVehicule[immat]?.joursParChargeur?.[nom]?.size || 0
            const joursVehTotal = odsParVehicule[immat]?.joursTotal?.size || 1
            const ratio = Math.min(joursVehChargeur / joursVehTotal, 1)
            return {
              immat,
              loyerMensuel: Math.round(loyerMensuel),
              joursCP: joursVehChargeur,
              joursTotal: joursVehTotal,
              ratio: Math.round(ratio * 100),
              loyerAffecte: Math.round(loyerMensuel * ratio),
            }
          })
          .filter(Boolean)
          .sort((a, b) => b.loyerAffecte - a.loyerAffecte)

        const detailCarburantVehicules = vehiculesChargeur
          .map((immat) => {
            const trans = carburantParVehicule[immat]
            if (!trans || trans.montantHT === 0) return null
            const joursVehChargeur = odsParVehicule[immat]?.joursParChargeur?.[nom]?.size || 0
            const joursVehTotal = odsParVehicule[immat]?.joursTotal?.size || 1
            const ratio = Math.min(joursVehChargeur / joursVehTotal, 1)
            return {
              immat,
              carburantTotal: Math.round(trans.montantHT),
              nbTransactions: trans.nb,
              joursCP: joursVehChargeur,
              joursTotal: joursVehTotal,
              ratio: Math.round(ratio * 100),
              carburantAffecte: Math.round(trans.montantHT * ratio),
            }
          })
          .filter(Boolean)
          .sort((a, b) => b.carburantAffecte - a.carburantAffecte)

        const detail = {
          chauffeurs: detailChauffeurs,
          prestataires: detailPrestataires,
          sousTraitanceMontant: Math.round(sousTraitanceChargeur),
          nbTourneesPrestaTotal: totalTourneesPrestaGlobal,
          loyersVehicules: detailLoyersVehicules,
          carburantVehicules: detailCarburantVehicules,
        }

        return {
          nom,
          ca: Math.round(ca),
          masseSalariale: Math.round(masseSalInterne),
          sousTraitance: Math.round(sousTraitanceChargeur),
          loyerFlotte: Math.round(loyerChargeur),
          carburant: carburantChargeur,
          coutTotal: Math.round(coutTotal),
          marge: Math.round(marge),
          tauxMarge: parseFloat(tauxMarge.toFixed(1)),
          detail,
          nbTournees: nbTourneesChargeur,
          nbTourneesInterne: odsData.nbTourneesInterne || 0,
          nbTourneesPrestataire: odsData.nbTourneesPrestataire || 0,
          nbVehicules: nbVehiculesChargeur,
          nbChauffeurs: Object.keys(odsData.chauffeurInternes || {}).length,
          chauffeurs: Object.entries(odsData.chauffeurInternes || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([nomSf, nbOds]) => {
              const joursSet = odsParChauffeur[nomSf]?.joursParChargeur?.[nom]
              const nbJoursRaw = joursSet instanceof Set ? joursSet.size : nbOds
              const nbJours = Math.min(nbJoursRaw, 31)
              return { nom: nomSf, nbJours }
            }),
          prestataires: Object.entries(odsData.chauffeurPrestataires || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([n, nb]) => ({ nom: n, nbJours: nb })),
        }
      })
      .sort((a, b) => b.ca - a.ca)

    const totalTournees2 = Object.values(odsParChargeur).reduce((s, d) => s + d.nb, 0) || 1

    const chargeursFiltres = chargeurFiltre
      ? chargeurs.filter((c) => c.nom.toUpperCase() === String(chargeurFiltre).toUpperCase().trim())
      : chargeurs

    res.json({
      chargeurs: chargeursFiltres,
      meta: {
        methode:
          'FEC 421xxx × ratio jours SF · FEC 622800 prestataires × ratio tournées · FEC 612xxx par immat × jours véhicule · Transactions carburant SF par véhicule × jours',
        nbSalariesFec: Object.keys(coutParSalarie).length,
        nbChargeursOds: Object.keys(odsParChargeur).length,
        totalTournees: totalTournees2,
        sousTraitanceTotal: Object.values(sousTraitanceParSociete).reduce((s, v) => s + v, 0),
        sousTraitanceParSociete,
        carburantTodoNote:
          'Carburant = transactions Salesforce (Transaction_Carburant__c) par immat, réparti au prorata jours véhicule par chargeur.',
        loyersParSociete,
        patternsUtilises: patternsPrestataires,
        sourcePatterns: _patternsCacheTime > 0 ? 'BDD' : 'FALLBACK',
      },
    })
  } catch (err) {
    console.error('[Rentabilité chargeurs]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/dashboard-groupe/masse-salariale', async (req, res) => {
  if (!requirePool(res)) {
    return res.status(503).json({ error: 'Base de données non configurée' })
  }
  try {
    const { dateDebut, dateFin } = req.query
    const dateFinSQL = getDateFinEtendue(dateFin)
    const paramsDate = [dateDebut || null, dateFinSQL || null]

    const querySalaries = `
      SELECT
        e.compte_num || '_' || ex.societe_id as id,
        e.compte_num,
        e.compte_lib as nom_salarie,
        ex.societe_id,
        s.nom as societe_nom,
        ROUND(ABS(SUM(e.debit - e.credit))::numeric, 2) as net_verse
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      JOIN fec_societes s ON s.id = ex.societe_id
      WHERE e.compte_num LIKE '421%'
        AND e.compte_num NOT LIKE '4421%'
        AND (e.credit - e.debit) > 0
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date < $2::date)
      GROUP BY e.compte_num, e.compte_lib, ex.societe_id, s.nom
      ORDER BY net_verse DESC
    `

    const queryChargesRatio = `
      SELECT
        ROUND(SUM(CASE WHEN e.compte_num LIKE '641%'
          THEN (e.debit-e.credit) ELSE 0 END)::numeric,0) as brut,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '645%'
          THEN (e.debit-e.credit) ELSE 0 END)::numeric,0) as pat,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '431%'
          THEN ABS(e.debit-e.credit) ELSE 0 END)::numeric,0) as urssaf_sal,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '437%'
          THEN ABS(e.debit-e.credit) ELSE 0 END)::numeric,0) as urssaf_pat,
        ROUND(SUM(CASE WHEN e.compte_num LIKE '421%'
          AND e.compte_num NOT LIKE '4421%'
          THEN ABS(e.debit-e.credit) ELSE 0 END)::numeric,0) as nets
      FROM fec_ecritures e
      JOIN fec_exercices ex ON ex.id = e.exercice_id
      WHERE e.journal_code IN ('ODSA','ODS')
        AND ($1::date IS NULL OR e.ecriture_date >= $1::date)
        AND ($2::date IS NULL OR e.ecriture_date < $2::date)
    `

    const patternsPrestataires = await getPatterns()

    const [salResult, chargesResult] = await Promise.all([
      pool.query(querySalaries, paramsDate),
      pool.query(queryChargesRatio, paramsDate),
    ])

    const ch = chargesResult.rows[0] || {}
    const brut = parseFloat(ch.brut) || 0
    const pat = parseFloat(ch.pat) || 0
    const urssafSal = parseFloat(ch.urssaf_sal) || 0
    const urssafPat = parseFloat(ch.urssaf_pat) || 0
    const netsAgg = parseFloat(ch.nets) || 0
    const totalChargesFec = brut + pat + urssafSal + urssafPat
    const brutSurNet = netsAgg > 0 ? brut / netsAgg : 0
    const salSurNet = netsAgg > 0 ? urssafSal / netsAgg : 0
    const patSurNet = netsAgg > 0 ? (pat + urssafPat) / netsAgg : 0
    const ratioCharges = netsAgg > 0 ? totalChargesFec / netsAgg : 0

    const odsParChauffeur = {}
    const cacheKey = getSfCacheKey(dateDebut, dateFin, null)
    let sfData = getSfCache(cacheKey)

    if (!sfData) {
      console.log(`[Masse salariale] [SF Cache] Miss: ${cacheKey} — chargement SF...`)
      const [odsResult, carbRaw] = await Promise.all([
        exploitationService
          .getTourneesSalesforce({ dateDebut, dateFin }, 'production')
          .catch((e) => {
            console.warn('[Masse salariale] SF ODs non disponible:', e.message)
            return []
          }),
        exploitationService
          .getCarburantTransactions({ dateDebut, dateFin })
          .catch((e) => {
            console.warn('[Masse salariale] Carburant SF non disponible:', e.message)
            return { data: [] }
          }),
      ])
      const transactionsFromCarb = Array.isArray(carbRaw) ? carbRaw : carbRaw?.data || carbRaw || []
      sfData = { ods: odsResult, transactions: transactionsFromCarb }
      setSfCache(cacheKey, sfData)
    } else {
      console.log(`[Masse salariale] [SF Cache] Hit: ${cacheKey}`)
    }

    const ods = sfData.ods || []
    ods.forEach((od) => {
      const chSf = canonChargeurDepuisSf(od.chargeurNom) || 'Inconnu'
      const chauff = nettoyerNomSf(od.chauffeurNom || '')
      const estPresta =
        !!chauff && patternsPrestataires.some((p) => chauff.toUpperCase().includes(p))
      const dayKey =
        od.date &&
        (typeof od.date === 'string'
          ? od.date.slice(0, 10)
          : new Date(od.date).toISOString().slice(0, 10))

      if (chauff && !estPresta) {
        if (!odsParChauffeur[chauff]) {
          odsParChauffeur[chauff] = {
            total: 0,
            joursUniques: new Set(),
            parChargeur: {},
            joursParChargeur: {},
          }
        }
        odsParChauffeur[chauff].total += 1
        if (dayKey) odsParChauffeur[chauff].joursUniques.add(dayKey)
        odsParChauffeur[chauff].parChargeur[chSf] =
          (odsParChauffeur[chauff].parChargeur[chSf] || 0) + 1
        if (dayKey) {
          if (!odsParChauffeur[chauff].joursParChargeur[chSf]) {
            odsParChauffeur[chauff].joursParChargeur[chSf] = new Set()
          }
          odsParChauffeur[chauff].joursParChargeur[chSf].add(dayKey)
        }
      }
    })

    const salaries = salResult.rows.map((row) => {
      const netVerse = parseFloat(row.net_verse) || 0
      const brutEstime = Math.round(netVerse * brutSurNet)
      const chargesSalariales = Math.round(netVerse * salSurNet)
      const chargesPatronales = Math.round(netVerse * patSurNet)
      const coutTotal = Math.round(netVerse * ratioCharges)
      const coutCharge = coutTotal

      const nomSfMatch = Object.keys(odsParChauffeur).find((n) =>
        matchNoms(row.nom_salarie, n)
      )
      if (nomSfMatch) {
        console.log('[DEBUG MATCH]', row.nom_salarie, '->', nomSfMatch)
      }
      let joursTotal = 0
      let repartitionChargeurs = []
      if (nomSfMatch) {
        const odCh = odsParChauffeur[nomSfMatch]
        joursTotal = odCh.joursUniques.size
        if (joursTotal > 0) {
          repartitionChargeurs = Object.entries(odCh.joursParChargeur || {})
            .map(([chargeur, set]) => {
              const jours = set instanceof Set ? set.size : 0
              const ratioPct = Math.round((jours / joursTotal) * 100)
              const coutAffecte = Math.round(coutTotal * (jours / joursTotal) * 100) / 100
              return { chargeur, jours, ratio: ratioPct, coutAffecte }
            })
            .filter((r) => r.jours > 0)
            .sort((a, b) => b.coutAffecte - a.coutAffecte)
        }
      }

      return {
        id: row.id,
        compte_num: row.compte_num,
        nom: row.nom_salarie,
        nom_salarie: row.nom_salarie,
        societe_nom: row.societe_nom,
        net_verse: netVerse,
        brutEstime,
        chargesSalariales,
        chargesPatronales,
        coutTotal,
        coutCharge,
        joursTotal,
        repartitionChargeurs,
      }
    })

    const parSociete = {
      DJ: { nets: 0, cout: 0, nb: 0 },
      TPS: { nets: 0, cout: 0, nb: 0 },
      G2L: { nets: 0, cout: 0, nb: 0 },
    }
    salaries.forEach((s) => {
      const nom = s.societe_nom || ''
      const key = nom.includes('D&J') || nom.includes('D & J')
        ? 'DJ'
        : nom.includes('TPS')
          ? 'TPS'
          : nom.includes('G2L')
            ? 'G2L'
            : null
      if (key) {
        parSociete[key].nets += parseFloat(s.net_verse) || 0
        parSociete[key].cout += s.coutTotal
        parSociete[key].nb += 1
      }
    })

    const masseSalTotale = salaries.reduce((s, x) => s + x.net_verse, 0)
    const coutChargeTotal = salaries.reduce((s, x) => s + x.coutCharge, 0)
    const nbSalaries = salaries.length
    const coutMoyen = nbSalaries > 0 ? Math.round((coutChargeTotal / nbSalaries) * 100) / 100 : 0

    ;['DJ', 'TPS', 'G2L'].forEach((k) => {
      parSociete[k].nets = Math.round(parSociete[k].nets * 100) / 100
      parSociete[k].cout = Math.round(parSociete[k].cout * 100) / 100
    })

    res.json({
      kpis: {
        masseSalTotale: Math.round(masseSalTotale * 100) / 100,
        coutChargeTotal: Math.round(coutChargeTotal * 100) / 100,
        nbSalaries,
        coutMoyen,
        ratioCharges: Math.round(ratioCharges * 100000) / 100000,
        ratioDetail: {
          brut_sur_net: Math.round(brutSurNet * 100000) / 100000,
          sal_sur_net: Math.round(salSurNet * 100000) / 100000,
          pat_sur_net: Math.round(patSurNet * 100000) / 100000,
        },
        parSociete,
      },
      salaries,
    })
  } catch (err) {
    console.error('[Masse salariale]', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
