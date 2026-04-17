const { pool } = require('./database');

// Statuts des absences
const STATUTS = {
  EN_ATTENTE: 'En attente',
  VALIDEE: 'Validée',
  REFUSEE: 'Refusée',
};

function requirePool() {
  if (!pool) {
    throw new Error('[absences] Pool PostgreSQL indisponible — définir DATABASE_URL');
  }
}

function toDateOnly(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.split('T')[0];
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value);
}

function extractScalars(absence) {
  const statut = absence.statut ?? STATUTS.EN_ATTENTE;
  let validateurId = null;
  let validateurNom = null;
  if (statut === STATUTS.VALIDEE) {
    validateurId = absence.valideParId != null ? String(absence.valideParId) : null;
    validateurNom = absence.valideParNom ?? null;
  } else if (statut === STATUTS.REFUSEE) {
    validateurId = absence.refuseParId != null ? String(absence.refuseParId) : null;
    validateurNom = absence.refuseParNom ?? null;
  }

  return {
    employe_id: absence.employeId != null ? String(absence.employeId) : '',
    employe_nom: absence.employeNom ?? null,
    type: absence.type ?? '',
    date_debut: toDateOnly(absence.dateDebut) || '1970-01-01',
    date_fin: toDateOnly(absence.dateFin) || '1970-01-01',
    motif: absence.motif ?? null,
    statut,
    validateur_id: validateurId,
    validateur_nom: validateurNom,
  };
}

function coerceDateField(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'string') return v.split('T')[0];
  return String(v);
}

function hydrateFromRow(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  if (!base || Object.keys(base).length === 0) {
    base = {
      id: row.id,
      employeId: row.employe_id,
      employeNom: row.employe_nom,
      type: row.type,
      dateDebut: coerceDateField(row.date_debut),
      dateFin: coerceDateField(row.date_fin),
      motif: row.motif,
      statut: row.statut,
    };
  }
  base.id = row.id;
  if (base.dateDebut != null) base.dateDebut = coerceDateField(base.dateDebut);
  if (base.dateFin != null) base.dateFin = coerceDateField(base.dateFin);
  return base;
}

function ensureMaladieAffichage(absence) {
  const out = { ...absence };
  if (out.type === 'MALADIE' && out.statut === STATUTS.VALIDEE && !out.afficherEnRouge) {
    out.afficherEnRouge = true;
  }
  return out;
}

function rowToAbsence(row) {
  return ensureMaladieAffichage(hydrateFromRow(row));
}

async function getAbsences() {
  requirePool();
  const { rows } = await pool.query(
    'SELECT id, data, employe_id, employe_nom, type, date_debut, date_fin, motif, statut FROM absences ORDER BY created_at ASC'
  );
  return rows.map(rowToAbsence);
}

async function getAbsencesByEmploye(employeId) {
  requirePool();
  const id = String(employeId);
  const { rows } = await pool.query(
    `SELECT id, data, employe_id, employe_nom, type, date_debut, date_fin, motif, statut
     FROM absences WHERE employe_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  return rows.map(rowToAbsence);
}

async function ajouterAbsence(absence) {
  requirePool();
  const nouvelleAbsence = {
    id: Date.now().toString(),
    ...absence,
    statut: STATUTS.EN_ATTENTE,
    createdAt: new Date().toISOString(),
  };
  const s = extractScalars(nouvelleAbsence);
  await pool.query(
    `INSERT INTO absences (
      id, employe_id, employe_nom, type, date_debut, date_fin, motif, statut,
      validateur_id, validateur_nom, data
    ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11::jsonb)`,
    [
      nouvelleAbsence.id,
      s.employe_id,
      s.employe_nom,
      s.type,
      s.date_debut,
      s.date_fin,
      s.motif,
      s.statut,
      s.validateur_id,
      s.validateur_nom,
      nouvelleAbsence,
    ]
  );
  console.log('[ABSENCES] Absence ajoutée:', nouvelleAbsence.id);
  return ensureMaladieAffichage(nouvelleAbsence);
}

async function supprimerAbsence(id, annuleParId = null, annuleParNom = null) {
  requirePool();
  const { rows } = await pool.query('DELETE FROM absences WHERE id = $1 RETURNING id, data, employe_id', [id]);
  if (!rows.length) return null;

  const absence = rowToAbsence(rows[0]);
  const absenceInfo = {
    ...absence,
    annuleParId,
    annuleParNom,
    annuleAt: new Date().toISOString(),
  };
  console.log('[ABSENCES] Absence supprimée:', id);
  console.log('[ABSENCES]   - Annulée par:', annuleParNom || 'Inconnu');
  return absenceInfo;
}

async function modifierAbsence(id, donnees, modificateurId = null, modificateurNom = null) {
  requirePool();
  const sel = await pool.query(
    'SELECT id, data, employe_id, employe_nom, type, date_debut, date_fin, motif, statut FROM absences WHERE id = $1',
    [id]
  );
  if (!sel.rows.length) return null;

  const absenceAvant = JSON.parse(JSON.stringify(rowToAbsence(sel.rows[0])));
  const etaitValidee = absenceAvant.statut === STATUTS.VALIDEE;

  const merged = {
    ...absenceAvant,
    ...donnees,
    modifiee: true,
    modifieeParId: modificateurId,
    modifieeParNom: modificateurNom,
    modifieeAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (merged.type === 'MALADIE' && merged.statut === STATUTS.VALIDEE) {
    merged.afficherEnRouge = true;
  }

  const s = extractScalars(merged);
  await pool.query(
    `UPDATE absences SET
      employe_id = $2,
      employe_nom = $3,
      type = $4,
      date_debut = $5::date,
      date_fin = $6::date,
      motif = $7,
      statut = $8,
      validateur_id = $9,
      validateur_nom = $10,
      updated_at = NOW(),
      data = $11::jsonb
    WHERE id = $1`,
    [
      id,
      s.employe_id,
      s.employe_nom,
      s.type,
      s.date_debut,
      s.date_fin,
      s.motif,
      s.statut,
      s.validateur_id,
      s.validateur_nom,
      merged,
    ]
  );

  console.log('[ABSENCES] Absence modifiée:', id);
  console.log('[ABSENCES]   - Était validée:', etaitValidee);
  console.log('[ABSENCES]   - Modifiée par:', modificateurNom || 'Inconnu');

  return {
    absence: ensureMaladieAffichage(merged),
    etaitValidee,
    absenceAvant,
  };
}

async function validerAbsence(absenceId, validateurId, validateurNom) {
  requirePool();
  const sel = await pool.query(
    'SELECT id, data, employe_id, employe_nom, type, date_debut, date_fin, motif, statut FROM absences WHERE id = $1',
    [absenceId]
  );
  if (!sel.rows.length) return null;

  const cur = rowToAbsence(sel.rows[0]);
  const updated = {
    ...cur,
    statut: STATUTS.VALIDEE,
    valideParId: validateurId,
    valideParNom: validateurNom,
    valideAt: new Date().toISOString(),
  };
  if (updated.type === 'MALADIE') {
    updated.afficherEnRouge = true;
  }

  const s = extractScalars(updated);
  await pool.query(
    `UPDATE absences SET
      employe_id = $2,
      employe_nom = $3,
      type = $4,
      date_debut = $5::date,
      date_fin = $6::date,
      motif = $7,
      statut = $8,
      validateur_id = $9,
      validateur_nom = $10,
      updated_at = NOW(),
      data = $11::jsonb
    WHERE id = $1`,
    [
      absenceId,
      s.employe_id,
      s.employe_nom,
      s.type,
      s.date_debut,
      s.date_fin,
      s.motif,
      s.statut,
      s.validateur_id,
      s.validateur_nom,
      updated,
    ]
  );

  console.log('[ABSENCES] Absence validée:', updated.id);
  return ensureMaladieAffichage(updated);
}

async function refuserAbsence(absenceId, validateurId, validateurNom, motifRefus) {
  requirePool();
  const sel = await pool.query(
    'SELECT id, data, employe_id, employe_nom, type, date_debut, date_fin, motif, statut FROM absences WHERE id = $1',
    [absenceId]
  );
  if (!sel.rows.length) return null;

  const cur = rowToAbsence(sel.rows[0]);
  const updated = {
    ...cur,
    statut: STATUTS.REFUSEE,
    refuseParId: validateurId,
    refuseParNom: validateurNom,
    motifRefus,
    refuseAt: new Date().toISOString(),
  };

  const s = extractScalars(updated);
  await pool.query(
    `UPDATE absences SET
      employe_id = $2,
      employe_nom = $3,
      type = $4,
      date_debut = $5::date,
      date_fin = $6::date,
      motif = $7,
      statut = $8,
      validateur_id = $9,
      validateur_nom = $10,
      updated_at = NOW(),
      data = $11::jsonb
    WHERE id = $1`,
    [
      absenceId,
      s.employe_id,
      s.employe_nom,
      s.type,
      s.date_debut,
      s.date_fin,
      s.motif,
      s.statut,
      s.validateur_id,
      s.validateur_nom,
      updated,
    ]
  );

  console.log('[ABSENCES] Absence refusée:', updated.id);
  return ensureMaladieAffichage(updated);
}

module.exports = {
  getAbsences,
  getAbsencesByEmploye,
  ajouterAbsence,
  validerAbsence,
  refuserAbsence,
  supprimerAbsence,
  modifierAbsence,
  STATUTS,
};
