const { pool } = require('./database');
const exploitationService = require('./exploitationService');
const SalesforceService = require('./salesforceService');

const TOURNEES_ACTIVES_TTL_MS = 10 * 60 * 1000;
const TOURNEES_ACTIVES_TTL_DEV_MS = 60 * 1000;
const tourneesActivesCache = new Map();

function getTourneesActivesTtlMs(environment) {
  return String(environment || 'production').toLowerCase() === 'production'
    ? TOURNEES_ACTIVES_TTL_MS
    : TOURNEES_ACTIVES_TTL_DEV_MS;
}

function clearTourneesActivesCache() {
  tourneesActivesCache.clear();
}

function requirePool() {
  if (!pool) {
    throw new Error('[rentabilite] Pool PostgreSQL indisponible — définir DATABASE_URL');
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toDateStr(d) {
  if (d == null || d === '') return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).split('T')[0];
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function normalizeSociete(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, '&')
    .trim();
}

function normalizeChargeur(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tournee course dans le groupe (libellés normalisés) */
function groupeContientTournee(tourneesArr, libelleCourse) {
  if (!Array.isArray(tourneesArr) || tourneesArr.length === 0) return false;
  const t = norm(libelleCourse);
  return tourneesArr.some((x) => norm(x) === t || t.includes(norm(x)) || norm(x).includes(t));
}

function rowToGrille(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  const out = {
    ...base,
    id: row.id,
    chargeur: row.chargeur ?? base.chargeur,
    societe: row.societe ?? base.societe,
    dateDebut: row.date_debut != null ? toDateStr(row.date_debut) : base.dateDebut,
    dateFin: row.date_fin != null ? toDateStr(row.date_fin) : base.dateFin ?? null,
    prixPdlLivre: num(row.prix_pdl_livre ?? base.prixPdlLivre),
    prixColisLivre: num(row.prix_colis_livre ?? base.prixColisLivre),
    prixPdlCollecte: num(row.prix_pdl_collecte ?? base.prixPdlCollecte),
    prixColisCollecte: num(row.prix_colis_collecte ?? base.prixColisCollecte),
    brandingType: row.branding_type ?? base.brandingType ?? 'aucun',
    brandingMontant: num(row.branding_montant ?? base.brandingMontant),
    actif: row.actif !== false && row.actif !== 'false',
  };
  const ca = row.created_at;
  const ua = row.updated_at;
  if (ca) out.createdAt = ca instanceof Date ? ca.toISOString() : ca;
  if (ua) out.updatedAt = ua instanceof Date ? ua.toISOString() : ua;
  return out;
}

function rowToGroupe(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  const tournees = Array.isArray(row.tournees) ? row.tournees : base.tournees || [];
  return {
    ...base,
    id: row.id,
    grilleId: row.grille_id ?? base.grilleId,
    nomGroupe: row.nom_groupe ?? base.nomGroupe,
    tournees,
    prixPdlLivre: num(row.prix_pdl_livre ?? base.prixPdlLivre),
    prixColisLivre: num(row.prix_colis_livre ?? base.prixColisLivre),
    prixPdlCollecte: num(row.prix_pdl_collecte ?? base.prixPdlCollecte),
    prixColisCollecte: num(row.prix_colis_collecte ?? base.prixColisCollecte),
  };
}

function rowToForfait(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  return {
    ...base,
    id: row.id,
    chargeur: row.chargeur ?? base.chargeur,
    societe: row.societe ?? base.societe,
    description: row.description ?? base.description,
    montant: num(row.montant ?? base.montant),
    dateDebut: row.date_debut != null ? toDateStr(row.date_debut) : base.dateDebut,
    dateFin: row.date_fin != null ? toDateStr(row.date_fin) : base.dateFin,
  };
}

function rowToCoutMensuel(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  return {
    ...base,
    id: row.id,
    mois: row.mois ?? base.mois,
    societe: row.societe ?? base.societe,
    chargeur: row.chargeur ?? base.chargeur ?? null,
    joursTravailles: Number(row.jours_travailles ?? base.joursTravailles ?? base.jours_travailles ?? 0) || 0,
    carburant: num(row.carburant ?? base.carburant),
    salaires: num(row.salaires ?? base.salaires),
    leasing: num(row.leasing ?? base.leasing),
    peages: num(row.peages ?? base.peages),
    entretien: num(row.entretien ?? base.entretien),
    chargesFixes: num(row.charges_fixes ?? base.chargesFixes ?? base.charges_fixes),
    notes: row.notes ?? base.notes ?? '',
    total:
      num(row.carburant ?? base.carburant) +
      num(row.salaires ?? base.salaires) +
      num(row.leasing ?? base.leasing) +
      num(row.peages ?? base.peages) +
      num(row.entretien ?? base.entretien) +
      num(row.charges_fixes ?? base.chargesFixes ?? base.charges_fixes),
  };
}

function rowToCaCible(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  return {
    ...base,
    id: row.id,
    chargeur: row.chargeur ?? base.chargeur ?? '',
    societe: row.societe ?? base.societe ?? '',
    mois: row.mois ?? base.mois ?? '',
    caCibleParTournee: num(row.ca_cible_par_tournee ?? base.caCibleParTournee ?? base.ca_cible_par_tournee),
  };
}

function toMonthStr(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return s.slice(0, 7);
}

async function getTourneesActives(chargeur, societe, environment = 'production') {
  const chargeurNorm = norm(chargeur || '');
  const societeRaw = String(societe ?? '').trim();
  const filtrerSociete =
    societeRaw !== '' &&
    !['all', 'both', 'les deux', ''].includes(societeRaw.toLowerCase().trim());
  const societeNorm = filtrerSociete ? normalizeSociete(societeRaw) : '';
  const cacheKey = `${environment}::${chargeurNorm}::${societeNorm}`;
  const now = Date.now();
  const ttlMs = getTourneesActivesTtlMs(environment);
  const cached = tourneesActivesCache.get(cacheKey);
  if (cached && now - cached.ts < ttlMs) {
    return cached.data;
  }

  const sf = new SalesforceService(environment);
  try {
    await sf.connect();
    const query = `
      SELECT Name, IO_FxChargeurName__c, IO_Societe__c, IO_Active__c
      FROM IO_Tournee__c
      WHERE IO_Active__c = true
        AND Name != null
      ORDER BY Name ASC
    `;
    const result = await sf.conn.queryAll(query);
    const tourneesActives = (result.records || [])
      .map((r) => ({
        name: r.Name,
        code: r.Name,
        chargeur: r.IO_FxChargeurName__c,
        societe: r.IO_Societe__c,
        active: r.IO_Active__c,
      }))
      .filter((t) => t.active === true);
    const filtered = tourneesActives.filter((t) => {
      const okChargeur = !chargeurNorm || norm(t?.chargeur || '').includes(chargeurNorm);
      const okSociete = !societeNorm || normalizeSociete(t?.societe || '') === societeNorm;
      return okChargeur && okSociete;
    });
    console.log(
      '[TOURNEES ACTIVES DEBUG] Premiers exemples:',
      filtered.slice(0, 5).map((t) => ({
        name: t?.name,
        code: t?.code,
        raw: JSON.stringify(t),
      }))
    );
    tourneesActivesCache.set(cacheKey, { ts: now, data: filtered });
    return filtered;
  } finally {
    sf.disconnect();
  }
}

function monthRange(dateDebut, dateFin) {
  const start = toMonthStr(dateDebut);
  const end = toMonthStr(dateFin);
  if (!start || !end) return [];
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function getCodesTourneesActivesOds(dateDebut, dateFin, environment = 'production') {
  void dateDebut;
  void dateFin;
  const sf = new SalesforceService(environment);
  try {
    await sf.connect();
    const queryTourneesActives = `
      SELECT Name, IO_FxChargeurName__c
      FROM IO_Tournee__c
      WHERE IO_Active__c = true
      AND Name != null
    `;
    const resultTournees = await sf.conn.queryAll(queryTourneesActives);
    const tourneesActivesSet = new Set(
      (resultTournees.records || [])
        .map((r) => String(r?.Name || '').trim())
        .filter((x) => x !== '')
    );
    console.log('[TOURNEES ACTIVES] Nb tournées actives:', tourneesActivesSet.size);
    console.log('[TOURNEES ACTIVES] Exemples:', [...tourneesActivesSet].slice(0, 10));
    return tourneesActivesSet;
  } finally {
    sf.disconnect();
  }
}

async function getGrilles({ chargeur, societe } = {}) {
  requirePool();
  const cond = [];
  const params = [];
  let i = 1;
  if (chargeur != null && String(chargeur).trim() !== '') {
    cond.push(`chargeur ILIKE $${i++}`);
    params.push(`%${String(chargeur).trim()}%`);
  }
  if (societe != null && String(societe).trim() !== '') {
    cond.push(`societe ILIKE $${i++}`);
    params.push(`%${String(societe).trim()}%`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM grilles_tarifaires ${where} ORDER BY date_debut DESC, chargeur, societe`,
    params
  );
  return rows.map(rowToGrille);
}

async function getGrilleActive(chargeur, societe, date) {
  requirePool();
  const d = toDateStr(date);
  if (!d) return null;
  const socNorm = normalizeSociete(societe);
  const { rows } = await pool.query(
    `SELECT * FROM grilles_tarifaires
     WHERE (actif IS NULL OR actif = TRUE)
       AND TRIM(LOWER(chargeur)) = TRIM(LOWER($1))
       AND date_debut::date <= $2::date
       AND (date_fin IS NULL OR date_fin::date >= $2::date)
     ORDER BY date_debut DESC
    `,
    [String(chargeur ?? ''), d]
  );
  const match = rows.find((row) => normalizeSociete(row?.societe) === socNorm);
  return match ? rowToGrille(match) : null;
}

function buildGrillePayload(data) {
  const id =
    data.id ||
    Date.now().toString() + Math.random().toString(36).slice(2, 11);
  const dateDebut = toDateStr(data.dateDebut ?? data.date_debut);
  const dateFin = data.dateFin != null && data.dateFin !== '' ? toDateStr(data.dateFin ?? data.date_fin) : null;
  const full = {
    ...data,
    id,
    chargeur: data.chargeur ?? '',
    societe: data.societe ?? '',
    dateDebut,
    dateFin,
    prixPdlLivre: num(data.prixPdlLivre ?? data.prix_pdl_livre),
    prixColisLivre: num(data.prixColisLivre ?? data.prix_colis_livre),
    prixPdlCollecte: num(data.prixPdlCollecte ?? data.prix_pdl_collecte),
    prixColisCollecte: num(data.prixColisCollecte ?? data.prix_colis_collecte),
    brandingType: data.brandingType ?? data.branding_type ?? 'aucun',
    brandingMontant: num(data.brandingMontant ?? data.branding_montant),
    actif: data.actif !== false && data.actif !== 'false',
  };
  return full;
}

async function saveGrille(data) {
  requirePool();
  const full = buildGrillePayload(data);
  const pdl = full.prixPdlLivre;
  const colL = full.prixColisLivre;
  const pdc = full.prixPdlCollecte;
  const colC = full.prixColisCollecte;
  const bt = full.brandingType;
  const bm = full.brandingMontant;
  const actif = full.actif;

  await pool.query(
    `INSERT INTO grilles_tarifaires (
      id, chargeur, societe, date_debut, date_fin,
      prix_pdl_livre, prix_colis_livre, prix_pdl_collecte, prix_colis_collecte,
      branding_type, branding_montant, actif, data
    ) VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      chargeur = EXCLUDED.chargeur,
      societe = EXCLUDED.societe,
      date_debut = EXCLUDED.date_debut,
      date_fin = EXCLUDED.date_fin,
      prix_pdl_livre = EXCLUDED.prix_pdl_livre,
      prix_colis_livre = EXCLUDED.prix_colis_livre,
      prix_pdl_collecte = EXCLUDED.prix_pdl_collecte,
      prix_colis_collecte = EXCLUDED.prix_colis_collecte,
      branding_type = EXCLUDED.branding_type,
      branding_montant = EXCLUDED.branding_montant,
      actif = EXCLUDED.actif,
      updated_at = NOW(),
      data = EXCLUDED.data`,
    [
      full.id,
      full.chargeur,
      full.societe,
      full.dateDebut,
      full.dateFin,
      pdl,
      colL,
      pdc,
      colC,
      bt,
      bm,
      actif,
      full,
    ]
  );
  const { rows } = await pool.query('SELECT * FROM grilles_tarifaires WHERE id = $1', [full.id]);
  return rowToGrille(rows[0]);
}

async function deleteGrille(id) {
  requirePool();
  await pool.query('DELETE FROM groupes_tournees_tarif WHERE grille_id = $1', [id]);
  const r = await pool.query('DELETE FROM grilles_tarifaires WHERE id = $1', [id]);
  return (r.rowCount || 0) > 0;
}

async function getGroupesTournees(grilleId) {
  requirePool();
  const { rows } = await pool.query(
    'SELECT * FROM groupes_tournees_tarif WHERE grille_id = $1 ORDER BY nom_groupe',
    [grilleId]
  );
  return rows.map(rowToGroupe);
}

async function saveGroupeTournees(data) {
  requirePool();
  const id = data.id || Date.now().toString() + Math.random().toString(36).slice(2, 11);
  const grilleId = data.grilleId ?? data.grille_id;
  if (!grilleId) throw new Error('grilleId requis');
  const tournees = Array.isArray(data.tournees) ? data.tournees : [];
  const full = {
    ...data,
    id,
    grilleId,
    nomGroupe: data.nomGroupe ?? data.nom_groupe ?? '',
    tournees,
    prixPdlLivre: num(data.prixPdlLivre ?? data.prix_pdl_livre),
    prixColisLivre: num(data.prixColisLivre ?? data.prix_colis_livre),
    prixPdlCollecte: num(data.prixPdlCollecte ?? data.prix_pdl_collecte),
    prixColisCollecte: num(data.prixColisCollecte ?? data.prix_colis_collecte),
  };

  await pool.query(
    `INSERT INTO groupes_tournees_tarif (
      id, grille_id, nom_groupe, tournees,
      prix_pdl_livre, prix_colis_livre, prix_pdl_collecte, prix_colis_collecte, data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      grille_id = EXCLUDED.grille_id,
      nom_groupe = EXCLUDED.nom_groupe,
      tournees = EXCLUDED.tournees,
      prix_pdl_livre = EXCLUDED.prix_pdl_livre,
      prix_colis_livre = EXCLUDED.prix_colis_livre,
      prix_pdl_collecte = EXCLUDED.prix_pdl_collecte,
      prix_colis_collecte = EXCLUDED.prix_colis_collecte,
      data = EXCLUDED.data`,
    [
      full.id,
      full.grilleId,
      full.nomGroupe,
      tournees,
      full.prixPdlLivre,
      full.prixColisLivre,
      full.prixPdlCollecte,
      full.prixColisCollecte,
      full,
    ]
  );
  const { rows } = await pool.query('SELECT * FROM groupes_tournees_tarif WHERE id = $1', [full.id]);
  return rowToGroupe(rows[0]);
}

async function deleteGroupeTournees(id) {
  requirePool();
  const r = await pool.query('DELETE FROM groupes_tournees_tarif WHERE id = $1', [id]);
  return (r.rowCount || 0) > 0;
}

async function getForfaits({ chargeur, societe, dateDebut, dateFin } = {}) {
  requirePool();
  const cond = [];
  const params = [];
  let i = 1;
  if (chargeur != null && String(chargeur).trim() !== '') {
    cond.push(`chargeur ILIKE $${i++}`);
    params.push(`%${String(chargeur).trim()}%`);
  }
  if (societe != null && String(societe).trim() !== '') {
    cond.push(`societe ILIKE $${i++}`);
    params.push(`%${String(societe).trim()}%`);
  }
  if (dateDebut && dateFin) {
    cond.push(`date_fin::date >= $${i}::date AND date_debut::date <= $${i + 1}::date`);
    params.push(toDateStr(dateDebut), toDateStr(dateFin));
    i += 2;
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM forfaits_exceptionnels ${where} ORDER BY date_debut`, params);
  return rows.map(rowToForfait);
}

async function saveForfait(data) {
  requirePool();
  const id = data.id || Date.now().toString() + Math.random().toString(36).slice(2, 11);
  const full = {
    ...data,
    id,
    chargeur: data.chargeur ?? '',
    societe: data.societe ?? '',
    description: data.description ?? '',
    montant: num(data.montant),
    dateDebut: toDateStr(data.dateDebut ?? data.date_debut),
    dateFin: toDateStr(data.dateFin ?? data.date_fin),
  };

  await pool.query(
    `INSERT INTO forfaits_exceptionnels (
      id, chargeur, societe, description, montant, date_debut, date_fin, data
    ) VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      chargeur = EXCLUDED.chargeur,
      societe = EXCLUDED.societe,
      description = EXCLUDED.description,
      montant = EXCLUDED.montant,
      date_debut = EXCLUDED.date_debut,
      date_fin = EXCLUDED.date_fin,
      data = EXCLUDED.data`,
    [
      full.id,
      full.chargeur,
      full.societe,
      full.description,
      full.montant,
      full.dateDebut,
      full.dateFin,
      full,
    ]
  );
  const { rows } = await pool.query('SELECT * FROM forfaits_exceptionnels WHERE id = $1', [full.id]);
  return rowToForfait(rows[0]);
}

async function deleteForfait(id) {
  requirePool();
  const r = await pool.query('DELETE FROM forfaits_exceptionnels WHERE id = $1', [id]);
  return (r.rowCount || 0) > 0;
}

async function getCoutsMensuels({ mois, societe, chargeur } = {}) {
  requirePool();
  const cond = [];
  const params = [];
  let i = 1;
  if (mois != null && String(mois).trim() !== '') {
    cond.push(`mois = $${i++}`);
    params.push(toMonthStr(mois));
  }
  if (societe != null && String(societe).trim() !== '') {
    cond.push(`societe ILIKE $${i++}`);
    params.push(`%${String(societe).trim()}%`);
  }
  if (chargeur != null) {
    const ch = String(chargeur).trim();
    if (ch === '') {
      cond.push(`(chargeur IS NULL OR TRIM(chargeur) = '')`);
    } else {
      cond.push(`TRIM(LOWER(chargeur)) = TRIM(LOWER($${i++}))`);
      params.push(ch);
    }
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM couts_mensuels ${where} ORDER BY mois DESC, societe, chargeur NULLS FIRST`,
    params
  );
  return rows.map(rowToCoutMensuel);
}

async function saveCoutsMensuels(data) {
  requirePool();
  const mois = toMonthStr(data.mois);
  if (!mois) throw new Error('mois requis (YYYY-MM)');
  const societe = String(data.societe ?? '').trim();
  if (!societe) throw new Error('societe requise');
  const chargeurRaw = data.chargeur != null ? String(data.chargeur).trim() : '';
  const chargeur = chargeurRaw || null;
  const full = {
    id: data.id || Date.now().toString() + Math.random().toString(36).slice(2, 11),
    mois,
    societe,
    chargeur,
    joursTravailles: Number(data.joursTravailles ?? data.jours_travailles ?? 0) || 0,
    carburant: num(data.carburant),
    salaires: num(data.salaires),
    leasing: num(data.leasing),
    peages: num(data.peages),
    entretien: num(data.entretien),
    chargesFixes: num(data.chargesFixes ?? data.charges_fixes),
    notes: data.notes != null ? String(data.notes) : '',
  };

  // Upsert logique: unicité fonctionnelle (mois, societe, chargeur nullable)
  const existing = await pool.query(
    `SELECT id FROM couts_mensuels
     WHERE mois = $1
       AND TRIM(LOWER(societe)) = TRIM(LOWER($2))
       AND (
         (chargeur IS NULL AND $3::text IS NULL)
         OR TRIM(LOWER(COALESCE(chargeur, ''))) = TRIM(LOWER(COALESCE($3::text, '')))
       )
     LIMIT 1`,
    [full.mois, full.societe, full.chargeur]
  );
  const id = existing.rows[0]?.id || full.id;

  await pool.query(
    `INSERT INTO couts_mensuels (
      id, mois, societe, chargeur, jours_travailles, carburant, salaires, leasing, peages, entretien, charges_fixes, notes, data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      mois = EXCLUDED.mois,
      societe = EXCLUDED.societe,
      chargeur = EXCLUDED.chargeur,
      jours_travailles = EXCLUDED.jours_travailles,
      carburant = EXCLUDED.carburant,
      salaires = EXCLUDED.salaires,
      leasing = EXCLUDED.leasing,
      peages = EXCLUDED.peages,
      entretien = EXCLUDED.entretien,
      charges_fixes = EXCLUDED.charges_fixes,
      notes = EXCLUDED.notes,
      updated_at = NOW(),
      data = EXCLUDED.data`,
    [
      id,
      full.mois,
      full.societe,
      full.chargeur,
      full.joursTravailles,
      full.carburant,
      full.salaires,
      full.leasing,
      full.peages,
      full.entretien,
      full.chargesFixes,
      full.notes,
      full,
    ]
  );
  const { rows } = await pool.query('SELECT * FROM couts_mensuels WHERE id = $1', [id]);
  return rowToCoutMensuel(rows[0]);
}

async function updateCoutsMensuels(id, data) {
  requirePool();
  const currentId = String(id || '').trim();
  if (!currentId) throw new Error('id requis');
  const full = {
    mois: toMonthStr(data.mois),
    societe: String(data.societe ?? '').trim(),
    chargeur: data.chargeur != null && String(data.chargeur).trim() !== '' ? String(data.chargeur).trim() : null,
    joursTravailles: Number(data.joursTravailles ?? data.jours_travailles ?? 0) || 0,
    carburant: num(data.carburant),
    salaires: num(data.salaires),
    leasing: num(data.leasing),
    peages: num(data.peages),
    entretien: num(data.entretien),
    chargesFixes: num(data.chargesFixes ?? data.charges_fixes),
    notes: data.notes != null ? String(data.notes) : '',
  };
  const updatedData = { id: currentId, ...full };
  const r = await pool.query(
    `UPDATE couts_mensuels
     SET mois = $2,
         societe = $3,
         chargeur = $4,
         jours_travailles = $5,
         carburant = $6,
         salaires = $7,
         leasing = $8,
         peages = $9,
         entretien = $10,
         charges_fixes = $11,
         notes = $12,
         updated_at = NOW(),
         data = $13::jsonb
     WHERE id = $1`,
    [
      currentId,
      full.mois,
      full.societe,
      full.chargeur,
      full.joursTravailles,
      full.carburant,
      full.salaires,
      full.leasing,
      full.peages,
      full.entretien,
      full.chargesFixes,
      full.notes,
      updatedData,
    ]
  );
  if (!r.rowCount) return null;
  const { rows } = await pool.query('SELECT * FROM couts_mensuels WHERE id = $1', [currentId]);
  return rowToCoutMensuel(rows[0]);
}

async function deleteCoutsMensuels(id) {
  requirePool();
  const r = await pool.query('DELETE FROM couts_mensuels WHERE id = $1', [id]);
  return (r.rowCount || 0) > 0;
}

async function clonerCoutsMensuels(id, moisDestination, ecraser = false) {
  requirePool();
  const srcId = String(id || '').trim();
  const moisDest = toMonthStr(moisDestination);
  if (!srcId) throw new Error('id requis');
  if (!moisDest) throw new Error('moisDestination requis (YYYY-MM)');

  const srcRes = await pool.query('SELECT * FROM couts_mensuels WHERE id = $1', [srcId]);
  const src = srcRes.rows[0];
  if (!src) throw new Error('Coût source introuvable');

  const existingRes = await pool.query(
    `SELECT * FROM couts_mensuels
     WHERE mois = $1
       AND TRIM(LOWER(societe)) = TRIM(LOWER($2))
       AND (
         (chargeur IS NULL AND $3::text IS NULL)
         OR TRIM(LOWER(COALESCE(chargeur, ''))) = TRIM(LOWER(COALESCE($3::text, '')))
       )
     LIMIT 1`,
    [moisDest, src.societe, src.chargeur]
  );
  const existing = existingRes.rows[0];
  if (existing && !ecraser) {
    throw new Error('Un coût existe déjà pour ce mois/société/chargeur (activer écrasement)');
  }

  const payload = {
    mois: moisDest,
    societe: src.societe,
    chargeur: src.chargeur,
    joursTravailles: Number(src.jours_travailles || 0),
    carburant: num(src.carburant),
    salaires: num(src.salaires),
    leasing: num(src.leasing),
    peages: num(src.peages),
    entretien: num(src.entretien),
    chargesFixes: num(src.charges_fixes),
    notes: src.notes || '',
  };

  if (existing && ecraser) {
    return updateCoutsMensuels(existing.id, payload);
  }
  return saveCoutsMensuels(payload);
}

async function getCaCibles({ chargeur, societe, mois, annee } = {}) {
  requirePool();
  const cond = [];
  const params = [];
  let i = 1;
  if (chargeur != null && String(chargeur).trim() !== '') {
    cond.push(`chargeur ILIKE $${i++}`);
    params.push(`%${String(chargeur).trim()}%`);
  }
  if (societe != null && String(societe).trim() !== '') {
    cond.push(`societe ILIKE $${i++}`);
    params.push(`%${String(societe).trim()}%`);
  }
  if (mois != null && String(mois).trim() !== '') {
    cond.push(`mois = $${i++}`);
    params.push(toMonthStr(mois));
  }
  if (annee != null && String(annee).trim() !== '') {
    cond.push(`mois LIKE $${i++}`);
    params.push(`${String(annee).trim()}-%`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM ca_cibles ${where} ORDER BY mois DESC, societe, chargeur`,
    params
  );
  return rows.map(rowToCaCible);
}

async function saveCaCible(data) {
  requirePool();
  const chargeur = String(data.chargeur ?? '').trim();
  const societe = String(data.societe ?? '').trim();
  const mois = toMonthStr(data.mois);
  const caCibleParTournee = num(data.caCibleParTournee ?? data.ca_cible_par_tournee);
  if (!chargeur || !societe || !mois) throw new Error('chargeur, societe et mois requis');
  if (!Number.isFinite(caCibleParTournee) || caCibleParTournee <= 0) {
    throw new Error('ca_cible_par_tournee requis');
  }
  const existing = await pool.query(
    `SELECT id FROM ca_cibles
     WHERE TRIM(LOWER(chargeur)) = TRIM(LOWER($1))
       AND TRIM(LOWER(societe)) = TRIM(LOWER($2))
       AND mois = $3
     LIMIT 1`,
    [chargeur, societe, mois]
  );
  const id = existing.rows[0]?.id || data.id || Date.now().toString() + Math.random().toString(36).slice(2, 11);
  const full = { id, chargeur, societe, mois, caCibleParTournee };
  await pool.query(
    `INSERT INTO ca_cibles (id, chargeur, societe, mois, ca_cible_par_tournee, data)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       chargeur = EXCLUDED.chargeur,
       societe = EXCLUDED.societe,
       mois = EXCLUDED.mois,
       ca_cible_par_tournee = EXCLUDED.ca_cible_par_tournee,
       updated_at = NOW(),
       data = EXCLUDED.data`,
    [id, chargeur, societe, mois, caCibleParTournee, full]
  );
  const { rows } = await pool.query('SELECT * FROM ca_cibles WHERE id = $1', [id]);
  return rowToCaCible(rows[0]);
}

async function deleteCaCible(id) {
  requirePool();
  const r = await pool.query('DELETE FROM ca_cibles WHERE id = $1', [id]);
  return (r.rowCount || 0) > 0;
}

async function clonerCaCible(id, moisDestination, ecraser = false) {
  requirePool();
  const moisDest = toMonthStr(moisDestination);
  if (!moisDest) throw new Error('moisDestination requis (YYYY-MM)');
  const src = await pool.query('SELECT * FROM ca_cibles WHERE id = $1', [id]);
  const row = src.rows[0];
  if (!row) throw new Error('CA cible source introuvable');
  const existing = await pool.query(
    `SELECT * FROM ca_cibles
     WHERE TRIM(LOWER(chargeur)) = TRIM(LOWER($1))
       AND TRIM(LOWER(societe)) = TRIM(LOWER($2))
       AND mois = $3
     LIMIT 1`,
    [row.chargeur, row.societe, moisDest]
  );
  if (existing.rows[0] && !ecraser) {
    throw new Error('Une cible existe déjà pour ce mois/société/chargeur');
  }
  const payload = {
    chargeur: row.chargeur,
    societe: row.societe,
    mois: moisDest,
    caCibleParTournee: num(row.ca_cible_par_tournee),
  };
  if (existing.rows[0] && ecraser) {
    payload.id = existing.rows[0].id;
  }
  return saveCaCible(payload);
}

/**
 * Sélectionne les prix (grille + option groupe de tournées)
 */
function selectPrix(grille, groupes, libelleTournee) {
  let prix = {
    prixPdlLivre: num(grille.prixPdlLivre),
    prixColisLivre: num(grille.prixColisLivre),
    prixPdlCollecte: num(grille.prixPdlCollecte),
    prixColisCollecte: num(grille.prixColisCollecte),
    source: 'grille',
    nomGroupe: null,
  };
  const g = (groupes || []).find((gr) => groupeContientTournee(gr.tournees, libelleTournee));
  if (g) {
    prix = {
      prixPdlLivre: num(g.prixPdlLivre),
      prixColisLivre: num(g.prixColisLivre),
      prixPdlCollecte: num(g.prixPdlCollecte),
      prixColisCollecte: num(g.prixColisCollecte),
      source: 'groupe',
      nomGroupe: g.nomGroupe,
    };
  }
  return prix;
}

function brandingPourLigne(grille) {
  if (!grille || norm(grille.brandingType) === 'aucun' || norm(grille.brandingType) === '') {
    return 0;
  }
  return num(grille.brandingMontant);
}

/**
 * CA prévisionnel : croisement tournées Salesforce × grilles tarifaires.
 * @param {string} dateDebut - YYYY-MM-DD
 * @param {string} dateFin - YYYY-MM-DD
 * @param {string|null} societe - filtre optionnel (société bénéficiaire)
 * @param {string} [environment='production'] - Salesforce
 */
async function calculerCA(dateDebut, dateFin, societe, environment = 'production') {
  const societeRaw = String(societe ?? '').trim();
  const filtrerSociete =
    societeRaw !== '' &&
    !['all', 'both', 'les deux', ''].includes(societeRaw.toLowerCase().trim());
  const societeFiltre = filtrerSociete ? societeRaw : null;
  const societeFiltreNorm = societeFiltre ? normalizeSociete(societeFiltre) : null;

  const tournees = await exploitationService.getTourneesSalesforce({ dateDebut, dateFin }, environment);
  const tourneesActives = await getTourneesActives('', societeFiltre, environment);
  const codesTourneesActives = new Set(
    (tourneesActives || [])
      .map((t) => norm(t?.code || t?.Name || t?.name || ''))
      .filter((x) => x !== '')
  );

  const details = [];
  const parChargeur = new Map();
  const parSociete = new Map();
  const parTournee = new Map();

  let total = 0;

  const memoGrille = new Map();
  async function resolveGrilleActive(chargeurStr, chargeurIdAlt, soc, dt) {
    const tryKeys = [chargeurStr, chargeurIdAlt != null ? String(chargeurIdAlt) : null].filter(
      (x) => x != null && String(x).trim() !== ''
    );
    for (const ch of tryKeys) {
      const k = `${norm(ch)}|${normalizeSociete(soc)}|${dt}`;
      if (memoGrille.has(k)) {
        const cached = memoGrille.get(k);
        if (cached !== '__NONE__') return cached;
        continue;
      }
      const g = await getGrilleActive(ch, soc, dt);
      memoGrille.set(k, g || '__NONE__');
      if (g) return g;
    }
    return null;
  }

  const memoGroupes = new Map();
  async function loadGroupes(grilleId) {
    if (!grilleId) return [];
    if (memoGroupes.has(grilleId)) return memoGroupes.get(grilleId);
    const list = await getGroupesTournees(grilleId);
    memoGroupes.set(grilleId, list);
    return list;
  }

  for (const tournee of tournees) {
    const courses = tournee.courses || [];
    const dateCourse = toDateStr(tournee.date);
    const chargeurIdTournee = tournee.chargeurId;
    const chargeurNomTournee = tournee.chargeurNom || '';

    for (const course of courses) {
      const soc = String(course.societeBeneficiaire || 'N/A').trim() || 'N/A';
      if (
        societe &&
        !['all', 'both', 'les deux', ''].includes(String(societe).toLowerCase().trim()) &&
        societeFiltreNorm &&
        normalizeSociete(soc) !== societeFiltreNorm
      ) {
        continue;
      }

      const d = toDateStr(course.date) || dateCourse;
      if (!d) continue;

      const libelleTournee = String(course.tournee || tournee.numeroTournee || 'N/A');
      if (codesTourneesActives.size > 0 && !codesTourneesActives.has(norm(libelleTournee))) {
        continue;
      }
      const chargeurCourse = course.chargeur || chargeurNomTournee;

      const grilleFinale = await resolveGrilleActive(chargeurCourse, chargeurIdTournee, soc, d);
      if (!grilleFinale) {
        details.push({
          date: d,
          tournee: libelleTournee,
          chargeur: chargeurCourse,
          societe: soc,
          pdlLivres: num(course.pdlLivres),
          colisLivres: num(course.colisLivres),
          pdlCollectes: num(course.pdlCollectes),
          colisCollectes: num(course.colisCollectes),
          montant: 0,
          erreur: 'Aucune grille tarifaire active',
        });
        continue;
      }

      const groupes = await loadGroupes(grilleFinale.id);
      const prix = selectPrix(grilleFinale, groupes, libelleTournee);
      const pdlL = num(course.pdlLivres);
      const colL = num(course.colisLivres);
      const pdlC = num(course.pdlCollectes);
      const colC = num(course.colisCollectes);

      const ligne =
        pdlL * prix.prixPdlLivre +
        colL * prix.prixColisLivre +
        pdlC * prix.prixPdlCollecte +
        colC * prix.prixColisCollecte +
        brandingPourLigne(grilleFinale);

      total += ligne;

      const detail = {
        date: d,
        tournee: libelleTournee,
        chargeur: chargeurCourse,
        societe: soc,
        grilleId: grilleFinale.id,
        prixSource: prix.source,
        nomGroupeTarif: prix.nomGroupe,
        pdlLivres: pdlL,
        colisLivres: colL,
        pdlCollectes: pdlC,
        colisCollectes: colC,
        prixPdlLivre: prix.prixPdlLivre,
        prixColisLivre: prix.prixColisLivre,
        prixPdlCollecte: prix.prixPdlCollecte,
        prixColisCollecte: prix.prixColisCollecte,
        branding: brandingPourLigne(grilleFinale),
        montant: Math.round(ligne * 10000) / 10000,
      };
      details.push(detail);

      const kCh = chargeurCourse || 'N/A';
      parChargeur.set(kCh, (parChargeur.get(kCh) || 0) + ligne);
      parSociete.set(soc, (parSociete.get(soc) || 0) + ligne);

      const kT = `${d}::${libelleTournee}::${kCh}::${soc}`;
      if (!parTournee.has(kT)) {
        parTournee.set(kT, {
          cle: kT,
          date: d,
          tournee: libelleTournee,
          chargeur: kCh,
          societe: soc,
          montant: 0,
          nbCourses: 0,
        });
      }
      const agg = parTournee.get(kT);
      agg.montant += ligne;
      agg.nbCourses += 1;
    }
  }

  return {
    periode: { dateDebut, dateFin },
    societeFiltre,
    environment,
    total: Math.round(total * 10000) / 10000,
    parChargeur: Array.from(parChargeur.entries()).map(([chargeur, montant]) => ({
      chargeur,
      montant: Math.round(montant * 10000) / 10000,
    })),
    parSociete: Array.from(parSociete.entries()).map(([societeNom, montant]) => ({
      societe: societeNom,
      montant: Math.round(montant * 10000) / 10000,
    })),
    parTournee: Array.from(parTournee.values()).map((v) => ({
      ...v,
      montant: Math.round(v.montant * 10000) / 10000,
    })),
    details,
  };
}

async function calculerMarge(dateDebut, dateFin, societe, environment = 'production') {
  const societeRaw = String(societe ?? '').trim();
  const filtrerSociete =
    societeRaw !== '' &&
    !['les deux', 'all', 'tous', 'toutes', ''].includes(societeRaw.toLowerCase().trim());
  const societeFiltre = filtrerSociete ? societeRaw : null;
  console.log('[MARGE DEBUG SOCIETE]', {
    societeReçue: societe,
    filtrerSociete: filtrerSociete,
    societeFiltre: societeFiltre,
  });

  const ca = await calculerCA(dateDebut, dateFin, societeFiltre, environment);
  const result = ca;
  console.log('[MARGE DEBUG CA]', {
    nbDetails: result?.details?.length,
    totalCA: result?.total,
    parChargeur: Object.keys(result?.parChargeur || {}),
  });
  const months = monthRange(dateDebut, dateFin);
  const couts = [];
  for (const m of months) {
    const list = await getCoutsMensuels({
      mois: m,
      ...(filtrerSociete ? { societe: societeFiltre } : {}),
    });
    couts.push(...list);
  }
  console.log('[MARGE DEBUG] Coûts récupérés depuis DB:', JSON.stringify(couts, null, 2));
  console.log('[MARGE DEBUG] Nombre de lignes details CA:', result.details?.length);
  console.log(
    '[MARGE DEBUG] Combinaisons chargeur+societe:',
    [...new Set(result.details?.map((d) => `${d.chargeur}|${d.societe}`))]
  );
  const detailsCA = filtrerSociete
    ? (result.details || []).filter(
        (d) => normalizeSociete(d?.societe) === normalizeSociete(societeFiltre)
      )
    : (result.details || []);
  const tourneesActivesSet = await getCodesTourneesActivesOds(dateDebut, dateFin, environment);
  const detailsActifs = detailsCA.filter((d) =>
    tourneesActivesSet.has(String(d?.tournee || '').trim())
  );
  // Détail par ligne tournée×jour (agrégé depuis ca.details)
  const lineMap = new Map();
  for (const d of detailsCA) {
    if (d?.erreur) continue;
    const key = `${String(d.date || '')}::${String(d.tournee || 'N/A')}::${String(d.chargeur || 'N/A')}::${String(d.societe || 'N/A')}`;
    if (!lineMap.has(key)) {
      lineMap.set(key, {
        date: String(d.date || ''),
        tournee: String(d.tournee || 'N/A'),
        chargeur: String(d.chargeur || 'N/A'),
        societe: String(d.societe || 'N/A'),
        ca: 0,
        colisLivres: 0,
        pdlLivres: 0,
      });
    }
    const row = lineMap.get(key);
    row.ca += num(d.montant);
    row.colisLivres += num(d.colisLivres);
    row.pdlLivres += num(d.pdlLivres);
  }
  const allLines = Array.from(lineMap.values());
  const activeLineKeys = new Set(
    detailsActifs
      .filter((d) => !d?.erreur)
      .map((d) =>
        `${String(d.date || '')}::${String(d.tournee || 'N/A')}::${String(d.chargeur || 'N/A')}::${String(d.societe || 'N/A')}`
      )
  );

  // Regroupement par combinaison normalisée chargeur + societe + mois
  const comboMap = new Map();
  for (const line of allLines) {
    const month = toMonthStr(line.date);
    const chargeurNorm = normalizeChargeur(line.chargeur);
    const societeNorm = normalizeSociete(line.societe);
    const comboKey = `${month}::${chargeurNorm}::${societeNorm}`;
    if (!comboMap.has(comboKey)) {
      comboMap.set(comboKey, {
        month,
        chargeur: line.chargeur,
        societe: line.societe,
        chargeurNorm,
        societeNorm,
        lines: [],
      });
    }
    comboMap.get(comboKey).lines.push(line);
  }

  const comboCostCache = new Map();
  const monthCostsCache = new Map();
  const coutsRows = [];
  const caCiblesRows = await getCaCibles({
    ...(filtrerSociete ? { societe: societeFiltre } : {}),
  });
  async function getComboCosts(month, societeNorm, chargeurNorm) {
    const key = `${month}::${chargeurNorm}::${societeNorm}`;
    if (comboCostCache.has(key)) return comboCostCache.get(key);
    if (!monthCostsCache.has(month)) {
      const monthList = await getCoutsMensuels({ mois: month });
      monthCostsCache.set(month, monthList);
      coutsRows.push(...monthList);
    }
    const list = (monthCostsCache.get(month) || []).filter(
      (cout) =>
        normalizeSociete(cout.societe) === societeNorm &&
        normalizeChargeur(cout.chargeur) === chargeurNorm
    );
    const agg = list.reduce(
      (acc, c) => {
        acc.carburant += num(c.carburant);
        acc.salaires += num(c.salaires);
        acc.leasing += num(c.leasing);
        acc.peages += num(c.peages);
        acc.entretien += num(c.entretien);
        acc.chargesFixes += num(c.chargesFixes);
        return acc;
      },
      { carburant: 0, salaires: 0, leasing: 0, peages: 0, entretien: 0, chargesFixes: 0 }
    );
    agg.total = agg.carburant + agg.salaires + agg.leasing + agg.peages + agg.entretien + agg.chargesFixes;
    agg.rows = list;
    comboCostCache.set(key, agg);
    return agg;
  }

  const parTournee = [];
  const cibleByChargeur = new Map();
  const ciblesParMois = new Map();
  for (const combo of comboMap.values()) {
    const costs = await getComboCosts(combo.month, combo.societeNorm, combo.chargeurNorm);
    const eligibleLines = combo.lines.filter((d) => {
      const key = `${String(d.date || '')}::${String(d.tournee || 'N/A')}::${String(d.chargeur || 'N/A')}::${String(d.societe || 'N/A')}`;
      return activeLineKeys.has(key) && num(d.colisLivres) > 0;
    });
    const nbTourneesEligibles = eligibleLines.length;
    const cibleMatch = (caCiblesRows || []).find(
      (c) =>
        String(c.mois || '') === combo.month &&
        normalizeSociete(c.societe) === combo.societeNorm &&
        normalizeChargeur(c.chargeur) === combo.chargeurNorm
    );
    const caCibleParTournee = num(cibleMatch?.caCibleParTournee);
    const tourneesUniquesActives = new Set(
      eligibleLines
        .map((d) => String(d.tournee || '').trim())
        .filter((x) => x !== '')
    );
    if (
      combo.chargeurNorm === normalizeChargeur('GLS') &&
      combo.societeNorm === normalizeSociete('D&J Transport')
    ) {
      const tourneesUniquesList = [...tourneesUniquesActives];
      console.log('[CA CIBLE DEBUG] Tournées uniques GLS + D&J Transport:');
      tourneesUniquesList.forEach((t, i) => console.log(`  ${i + 1}. "${t}"`));
      console.log('[CA CIBLE DEBUG] Total:', tourneesUniquesList.length);
    }
    const nbTourneesActives = tourneesUniquesActives.size;
    const coutRef = (costs.rows || []).find((c) => Number(c?.joursTravailles || 0) > 0) || costs.rows?.[0] || null;
    const joursTravailles = Number(coutRef?.joursTravailles || 0);
    const caCibleMensuelAffiche = caCibleParTournee * nbTourneesActives;
    const caCibleParTourneeParJour = joursTravailles > 0 ? caCibleParTournee / joursTravailles : 0;
    if (!ciblesParMois.has(combo.month)) {
      ciblesParMois.set(combo.month, {
        caCibleMensuelAffiche: 0,
        caCibleParTournee: 0,
        caCibleParJour: 0,
      });
    }
    const cibleMoisAgg = ciblesParMois.get(combo.month);
    cibleMoisAgg.caCibleMensuelAffiche += caCibleMensuelAffiche;
    cibleMoisAgg.caCibleParTournee += caCibleParTournee;
    cibleMoisAgg.caCibleParJour += caCibleParTourneeParJour;
    const chargeurCibleKey = `${combo.month}::${combo.chargeur}`;
    cibleByChargeur.set(
      chargeurCibleKey,
      (cibleByChargeur.get(chargeurCibleKey) || 0) + caCibleMensuelAffiche
    );
    if (
      combo.chargeurNorm === normalizeChargeur('GLS') &&
      combo.societeNorm === normalizeSociete('D&J Transport')
    ) {
      console.log('[MARGE VENTILATION DEBUG]', {
        chargeur: 'GLS',
        societe: 'D&J Transport',
        coutTotal: costs?.total,
        nbTourneesEligibles,
        coutParTournee: nbTourneesEligibles > 0 ? costs?.total / nbTourneesEligibles : 0,
      });
    }
    const perLineAlloc = new Map(
      combo.lines.map((l) => [
        `${l.date}::${l.tournee}::${l.chargeur}::${l.societe}`,
        { carburant: 0, salaires: 0, leasing: 0, peages: 0, entretien: 0, chargesFixes: 0, total: 0 },
      ])
    );
    const eligibleByDate = new Map();
    for (const l of eligibleLines) {
      const d = String(l.date || '');
      if (!eligibleByDate.has(d)) eligibleByDate.set(d, []);
      eligibleByDate.get(d).push(l);
    }
    const datesInCombo = [...new Set(combo.lines.map((l) => String(l.date || '')))];
    for (const cout of costs.rows || []) {
      const coutTotal =
        num(cout.carburant) +
        num(cout.salaires) +
        num(cout.leasing) +
        num(cout.peages) +
        num(cout.entretien) +
        num(cout.chargesFixes);
      const joursTravailles = Number(cout.joursTravailles || 0);
      if (joursTravailles > 0) {
        const perDay = {
          carburant: num(cout.carburant) / joursTravailles,
          salaires: num(cout.salaires) / joursTravailles,
          leasing: num(cout.leasing) / joursTravailles,
          peages: num(cout.peages) / joursTravailles,
          entretien: num(cout.entretien) / joursTravailles,
          chargesFixes: num(cout.chargesFixes) / joursTravailles,
          total: coutTotal / joursTravailles,
        };
        for (const day of datesInCombo) {
          const eligDay = eligibleByDate.get(day) || [];
          const nbDay = eligDay.length;
          if (nbDay <= 0) continue;
          for (const l of eligDay) {
            const k = `${l.date}::${l.tournee}::${l.chargeur}::${l.societe}`;
            const a = perLineAlloc.get(k);
            a.carburant += perDay.carburant / nbDay;
            a.salaires += perDay.salaires / nbDay;
            a.leasing += perDay.leasing / nbDay;
            a.peages += perDay.peages / nbDay;
            a.entretien += perDay.entretien / nbDay;
            a.chargesFixes += perDay.chargesFixes / nbDay;
            a.total += perDay.total / nbDay;
          }
        }
      } else if (nbTourneesEligibles > 0) {
        const perTournee = {
          carburant: num(cout.carburant) / nbTourneesEligibles,
          salaires: num(cout.salaires) / nbTourneesEligibles,
          leasing: num(cout.leasing) / nbTourneesEligibles,
          peages: num(cout.peages) / nbTourneesEligibles,
          entretien: num(cout.entretien) / nbTourneesEligibles,
          chargesFixes: num(cout.chargesFixes) / nbTourneesEligibles,
          total: coutTotal / nbTourneesEligibles,
        };
        for (const l of eligibleLines) {
          const k = `${l.date}::${l.tournee}::${l.chargeur}::${l.societe}`;
          const a = perLineAlloc.get(k);
          a.carburant += perTournee.carburant;
          a.salaires += perTournee.salaires;
          a.leasing += perTournee.leasing;
          a.peages += perTournee.peages;
          a.entretien += perTournee.entretien;
          a.chargesFixes += perTournee.chargesFixes;
          a.total += perTournee.total;
        }
      }
    }
    for (const t of combo.lines) {
      const eligible = num(t.colisLivres) > 0;
      const k = `${t.date}::${t.tournee}::${t.chargeur}::${t.societe}`;
      const alloc = perLineAlloc.get(k) || {
        carburant: 0, salaires: 0, leasing: 0, peages: 0, entretien: 0, chargesFixes: 0, total: 0,
      };
      const couts = eligible ? alloc : {
        carburant: 0, salaires: 0, leasing: 0, peages: 0, entretien: 0, chargesFixes: 0, total: 0,
      };
    const caTournee = num(t.ca);
    const marge = caTournee - num(couts.total);
      const caCible = caCibleParTourneeParJour;
      const ecartCible = caTournee - caCible;
      const ecartPct = caCible > 0 ? (ecartCible / caCible) * 100 : 0;
      const statutCible = ecartPct > 5 ? 'dessus' : ecartPct < -5 ? 'dessous' : 'cible';
      parTournee.push({
      tournee: t.tournee,
      date: t.date,
      chargeur: t.chargeur,
      societe: t.societe,
      colisLivres: Math.round(num(t.colisLivres) * 100) / 100,
      pdlLivres: Math.round(num(t.pdlLivres) * 100) / 100,
      ca: Math.round(caTournee * 100) / 100,
      caCible: Math.round(caCible * 100) / 100,
      caCibleMensuelAffiche: Math.round(caCibleMensuelAffiche * 100) / 100,
      caCibleParTournee: Math.round(caCibleParTournee * 100) / 100,
      caCibleParJour: Math.round(caCibleParTourneeParJour * 100) / 100,
      nbTourneesActives,
      joursTravailles,
      ecartCible: Math.round(ecartCible * 100) / 100,
      statutCible,
      coutVentile: Math.round(num(couts.total) * 100) / 100,
      couts: {
        carburant: Math.round(couts.carburant * 100) / 100,
        salaires: Math.round(couts.salaires * 100) / 100,
        leasing: Math.round(couts.leasing * 100) / 100,
        peages: Math.round(couts.peages * 100) / 100,
        entretien: Math.round(couts.entretien * 100) / 100,
        chargesFixes: Math.round(couts.chargesFixes * 100) / 100,
        total: Math.round(couts.total * 100) / 100,
      },
      marge: Math.round(marge * 100) / 100,
      tauxMarge: caTournee > 0 ? Math.round((marge / caTournee) * 10000) / 100 : 0,
      });
    }
  }

  const parJourMap = new Map();
  for (const t of parTournee) {
    const d = String(t.date || '');
    if (!parJourMap.has(d)) {
      parJourMap.set(d, {
        date: d,
        ca: 0,
        colisLivres: 0,
        pdlLivres: 0,
        coutVentile: 0,
        carburant: 0,
        salaires: 0,
        leasing: 0,
        peages: 0,
        entretien: 0,
        chargesFixes: 0,
        caCible: 0,
        ecartCible: 0,
        marge: 0,
      });
    }
    const row = parJourMap.get(d);
    row.ca += num(t.ca);
    row.colisLivres += num(t.colisLivres);
    row.pdlLivres += num(t.pdlLivres);
    row.coutVentile += num(t.coutVentile);
    row.carburant += num(t.couts?.carburant);
    row.salaires += num(t.couts?.salaires);
    row.leasing += num(t.couts?.leasing);
    row.peages += num(t.couts?.peages);
    row.entretien += num(t.couts?.entretien);
    row.chargesFixes += num(t.couts?.chargesFixes);
    row.caCible += num(t.caCible);
    row.ecartCible += num(t.ecartCible);
    row.marge += num(t.marge);
  }
  const parJour = Array.from(parJourMap.values())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((r) => ({
      date: r.date,
      ca: Math.round(r.ca * 100) / 100,
      colisLivres: Math.round(r.colisLivres * 100) / 100,
      pdlLivres: Math.round(r.pdlLivres * 100) / 100,
      coutVentile: Math.round(r.coutVentile * 100) / 100,
      carburant: Math.round(r.carburant * 100) / 100,
      salaires: Math.round(r.salaires * 100) / 100,
      leasing: Math.round(r.leasing * 100) / 100,
      peages: Math.round(r.peages * 100) / 100,
      entretien: Math.round(r.entretien * 100) / 100,
      chargesFixes: Math.round(r.chargesFixes * 100) / 100,
      caCible: Math.round(r.caCible * 100) / 100,
      ecartCible: Math.round(r.ecartCible * 100) / 100,
      statutCible:
        r.caCible > 0 && (r.ecartCible / r.caCible) * 100 > 5
          ? 'dessus'
          : r.caCible > 0 && (r.ecartCible / r.caCible) * 100 < -5
            ? 'dessous'
            : 'cible',
      totalCouts: Math.round(r.coutVentile * 100) / 100,
      marge: Math.round(r.marge * 100) / 100,
      tauxMarge: r.ca > 0 ? Math.round((r.marge / r.ca) * 10000) / 100 : 0,
    }));

  const byMonth = new Map();
  for (const m of months) {
    const cibleMois = ciblesParMois.get(m) || { caCibleMensuelAffiche: 0, caCibleParTournee: 0, caCibleParJour: 0 };
    byMonth.set(m, {
      mois: m,
      ca: 0,
      carburant: 0,
      salaires: 0,
      leasing: 0,
      peages: 0,
      entretien: 0,
      chargesFixes: 0,
      caCible: cibleMois.caCibleMensuelAffiche,
      caCibleMensuelAffiche: cibleMois.caCibleMensuelAffiche,
      caCibleParTournee: cibleMois.caCibleParTournee,
      caCibleParJour: cibleMois.caCibleParJour,
      ecartCible: 0,
      totalCouts: 0,
      marge: 0,
      tauxMarge: 0,
    });
  }
  for (const t of parTournee) {
    const m = toMonthStr(t.date);
    if (!byMonth.has(m)) continue;
    const row = byMonth.get(m);
    row.ca += num(t.ca);
    row.carburant += num(t.couts?.carburant);
    row.salaires += num(t.couts?.salaires);
    row.leasing += num(t.couts?.leasing);
    row.peages += num(t.couts?.peages);
    row.entretien += num(t.couts?.entretien);
    row.chargesFixes += num(t.couts?.chargesFixes);
    row.totalCouts += num(t.coutVentile);
    row.marge += num(t.marge);
  }
  const rows = Array.from(byMonth.values()).map((r) => ({
    ...r,
    ca: Math.round(r.ca * 100) / 100,
    carburant: Math.round(r.carburant * 100) / 100,
    salaires: Math.round(r.salaires * 100) / 100,
    leasing: Math.round(r.leasing * 100) / 100,
    peages: Math.round(r.peages * 100) / 100,
    entretien: Math.round(r.entretien * 100) / 100,
    chargesFixes: Math.round(r.chargesFixes * 100) / 100,
    caCible: Math.round(r.caCibleMensuelAffiche * 100) / 100,
    caCibleMensuelAffiche: Math.round(r.caCibleMensuelAffiche * 100) / 100,
    caCibleParTournee: Math.round(r.caCibleParTournee * 100) / 100,
    caCibleParJour: Math.round(r.caCibleParJour * 100) / 100,
    ecartCible: Math.round((num(r.ca) - num(r.caCibleMensuelAffiche)) * 100) / 100,
    statutCible:
      r.caCibleMensuelAffiche > 0 &&
      ((num(r.ca) - num(r.caCibleMensuelAffiche)) / num(r.caCibleMensuelAffiche)) * 100 > 5
        ? 'dessus'
        : r.caCibleMensuelAffiche > 0 &&
            ((num(r.ca) - num(r.caCibleMensuelAffiche)) / num(r.caCibleMensuelAffiche)) * 100 < -5
          ? 'dessous'
          : 'cible',
    totalCouts: Math.round(r.totalCouts * 100) / 100,
    marge: Math.round(r.marge * 100) / 100,
    tauxMarge: r.ca > 0 ? Math.round((r.marge / r.ca) * 10000) / 100 : 0,
  }));

  const chargeurMap = new Map();
  for (const t of parTournee) {
    const ch = t.chargeur || 'N/A';
    if (!chargeurMap.has(ch)) {
      chargeurMap.set(ch, {
        chargeur: ch,
        ca: 0,
        carburant: 0,
        salaires: 0,
        leasing: 0,
        peages: 0,
        entretien: 0,
        chargesFixes: 0,
        caCibleMensuelAffiche: 0,
        ecartCible: 0,
        statutCible: 'cible',
        totalCouts: 0,
        marge: 0,
      });
    }
    const row = chargeurMap.get(ch);
    row.ca += num(t.ca);
    row.carburant += num(t.couts?.carburant);
    row.salaires += num(t.couts?.salaires);
    row.leasing += num(t.couts?.leasing);
    row.peages += num(t.couts?.peages);
    row.entretien += num(t.couts?.entretien);
    row.chargesFixes += num(t.couts?.chargesFixes);
    row.totalCouts += num(t.coutVentile);
    row.marge += num(t.marge);
  }
  for (const [key, cible] of cibleByChargeur.entries()) {
    const chargeur = key.split('::')[1] || 'N/A';
    if (!chargeurMap.has(chargeur)) continue;
    const row = chargeurMap.get(chargeur);
    row.caCibleMensuelAffiche += num(cible);
  }
  const parChargeur = Array.from(chargeurMap.values()).map((r) => ({
    ...r,
    ca: Math.round(r.ca * 100) / 100,
    carburant: Math.round(r.carburant * 100) / 100,
    salaires: Math.round(r.salaires * 100) / 100,
    leasing: Math.round(r.leasing * 100) / 100,
    peages: Math.round(r.peages * 100) / 100,
    entretien: Math.round(r.entretien * 100) / 100,
    chargesFixes: Math.round(r.chargesFixes * 100) / 100,
    caCibleMensuelAffiche: Math.round(r.caCibleMensuelAffiche * 100) / 100,
    ecartCible: Math.round((num(r.ca) - num(r.caCibleMensuelAffiche)) * 100) / 100,
    statutCible:
      r.caCibleMensuelAffiche > 0 && ((num(r.ca) - num(r.caCibleMensuelAffiche)) / num(r.caCibleMensuelAffiche)) * 100 > 5
        ? 'dessus'
        : r.caCibleMensuelAffiche > 0 &&
            ((num(r.ca) - num(r.caCibleMensuelAffiche)) / num(r.caCibleMensuelAffiche)) * 100 < -5
          ? 'dessous'
          : 'cible',
    totalCouts: Math.round(r.totalCouts * 100) / 100,
    marge: Math.round(r.marge * 100) / 100,
    tauxMarge: r.ca > 0 ? Math.round((r.marge / r.ca) * 10000) / 100 : 0,
  }));

  const totalCouts = rows.reduce((s, r) => s + num(r.totalCouts), 0);
  const margeGlobale = rows.reduce((s, r) => s + num(r.marge), 0);
  const totalCa = rows.reduce((s, r) => s + num(r.ca), 0);

  return {
    periode: { dateDebut, dateFin },
    societeFiltre,
    ca,
    couts: coutsRows,
    parMois: rows,
    parChargeur,
    parTournee,
    parJour,
    totalCa: Math.round(totalCa * 100) / 100,
    totalCouts: Math.round(totalCouts * 100) / 100,
    margeGlobale: Math.round(margeGlobale * 100) / 100,
    tauxMargeGlobal: totalCa > 0 ? Math.round((margeGlobale / totalCa) * 10000) / 100 : 0,
  };
}

module.exports = {
  getGrilles,
  getGrilleActive,
  saveGrille,
  deleteGrille,
  getGroupesTournees,
  saveGroupeTournees,
  deleteGroupeTournees,
  getForfaits,
  saveForfait,
  deleteForfait,
  getCoutsMensuels,
  saveCoutsMensuels,
  updateCoutsMensuels,
  deleteCoutsMensuels,
  clonerCoutsMensuels,
  getCaCibles,
  saveCaCible,
  deleteCaCible,
  clonerCaCible,
  getTourneesActives,
  clearTourneesActivesCache,
  calculerCA,
  calculerMarge,
};
