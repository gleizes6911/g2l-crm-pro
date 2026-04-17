const crypto = require('crypto');
const express = require('express');
const { pool } = require('../../services/database');

const router = express.Router();
const ECritures_LIMIT = 50000;
const INSERT_BATCH = 1000;

function requirePool(res) {
  if (!pool) {
    res.status(503).json({ error: 'Base de données non configurée' });
    return false;
  }
  return true;
}

function pn(s) {
  const n = parseFloat(String(s || '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** YYYYMMDD ou ISO → Date ou null */
function parseFecDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v).replace(/\D/g, '').slice(0, 8);
  if (s.length === 8) return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Clé de déduplication alignée sur l’ancienne logique SQL (MD5 sur champs séparés par |). */
function hashEcritureFec(row) {
  const hash = crypto
    .createHash('md5')
    .update(
      [
        row.JournalCode ?? row.journal_code ?? '',
        row.EcritureNum ?? row.ecriture_num ?? '',
        row.EcritureDate ?? row.ecriture_date ?? '',
        row.CompteNum ?? row.compte_num ?? '',
        String(row.Debit ?? row.debit ?? '0'),
        String(row.Credit ?? row.credit ?? '0'),
      ].join('|'),
    )
    .digest('hex');
  return hash;
}

function mapEcritureToDb(row) {
  return {
    journal_code: row.JournalCode ?? row.journal_code ?? null,
    journal_lib: row.JournalLib ?? row.journal_lib ?? null,
    ecriture_num: row.EcritureNum ?? row.ecriture_num ?? null,
    ecriture_date: parseFecDate(row.EcritureDate ?? row.ecriture_date),
    compte_num: row.CompteNum ?? row.compte_num ?? null,
    compte_lib: row.CompteLib ?? row.compte_lib ?? null,
    comp_aux_num: row.CompAuxNum ?? row.comp_aux_num ?? null,
    comp_aux_lib: row.CompAuxLib ?? row.comp_aux_lib ?? null,
    piece_ref: row.PieceRef ?? row.piece_ref ?? null,
    piece_date: parseFecDate(row.PieceDate ?? row.piece_date),
    ecriture_lib: row.EcritureLib ?? row.ecriture_lib ?? null,
    debit: pn(row.Debit ?? row.debit),
    credit: pn(row.Credit ?? row.credit),
    ecriture_let: row.EcritureLet ?? row.ecriture_let ?? null,
    date_let: parseFecDate(row.DateLet ?? row.date_let),
    valid_date: parseFecDate(row.ValidDate ?? row.valid_date),
    montant_devise: row.Montantdevise != null ? pn(row.Montantdevise) : row.montant_devise != null ? pn(row.montant_devise) : null,
    idevise: row.Idevise ?? row.idevise ?? null,
    date_rglt: parseFecDate(row.DateRglt ?? row.date_rglt),
    mode_rglt: row.ModeRglt ?? row.mode_rglt ?? null,
    nat_op: row.NatOp ?? row.nat_op ?? null,
    id_client: row.IdClient ?? row.id_client ?? null,
  };
}

async function upsertSociete(client, { siren, nom, couleur }) {
  const nomTrim = String(nom || '').trim();
  if (!nomTrim) throw new Error('nom requis');

  const s = String(siren || '').replace(/\D/g, '').slice(0, 9);
  const col = couleur && String(couleur).trim() ? String(couleur).trim() : '#2563eb';

  if (s.length === 9) {
    const r = await client.query(
      `INSERT INTO fec_societes (siren, nom, couleur)
       VALUES ($1, $2, $3)
       ON CONFLICT (siren) DO UPDATE SET
         nom = EXCLUDED.nom,
         couleur = COALESCE(NULLIF(EXCLUDED.couleur, ''), fec_societes.couleur),
         updated_at = NOW()
       RETURNING id`,
      [s, nomTrim, col],
    );
    return r.rows[0].id;
  }

  const find = await client.query(
    `SELECT id FROM fec_societes
     WHERE (siren IS NULL OR btrim(siren) = '')
       AND lower(btrim(nom)) = lower(btrim($1))
     LIMIT 1`,
    [nomTrim],
  );
  if (find.rows[0]) {
    await client.query(
      `UPDATE fec_societes SET nom = $2, couleur = COALESCE(NULLIF($3, ''), couleur), updated_at = NOW() WHERE id = $1`,
      [find.rows[0].id, nomTrim, col],
    );
    return find.rows[0].id;
  }

  const ins = await client.query(
    `INSERT INTO fec_societes (siren, nom, couleur) VALUES (NULL, $1, $2) RETURNING id`,
    [nomTrim, col],
  );
  return ins.rows[0].id;
}

async function upsertExercice(client, { societeId, annee, dateDebut, dateFin, nomFichier }) {
  const d0 = parseFecDate(dateDebut) || new Date(Number(annee), 0, 1);
  const d1 = parseFecDate(dateFin) || new Date(Number(annee), 11, 31);
  const y = Number(annee) || d0.getFullYear();

  const r = await client.query(
    `INSERT INTO fec_exercices (societe_id, annee, date_debut, date_fin, nb_ecritures, nom_fichier)
     VALUES ($1, $2, $3::date, $4::date, 0, $5)
     ON CONFLICT (societe_id, annee, date_debut, date_fin) DO UPDATE SET
       nom_fichier = COALESCE(EXCLUDED.nom_fichier, fec_exercices.nom_fichier)
     RETURNING id`,
    [societeId, y, d0, d1, nomFichier || null],
  );
  return r.rows[0].id;
}

async function refreshExerciceNbEcritures(client, exerciceId) {
  await client.query(
    `UPDATE fec_exercices SET nb_ecritures = (SELECT COUNT(*)::int FROM fec_ecritures WHERE exercice_id = $1) WHERE id = $1`,
    [exerciceId],
  );
}

const INSERT_SQL = `
INSERT INTO fec_ecritures (
  exercice_id, societe_id, journal_code, journal_lib, ecriture_num, ecriture_date,
  compte_num, compte_lib, comp_aux_num, comp_aux_lib, piece_ref, piece_date, ecriture_lib,
  debit, credit, ecriture_let, date_let, valid_date, montant_devise, idevise,
  date_rglt, mode_rglt, nat_op, id_client, hash_ecriture
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
)
ON CONFLICT (societe_id, hash_ecriture) DO NOTHING
`;

async function insertEcrituresBatched(client, societeId, exerciceId, ecritures) {
  let importees = 0;
  let doublons = 0;

  for (let i = 0; i < ecritures.length; i += INSERT_BATCH) {
    const chunk = ecritures.slice(i, i + INSERT_BATCH);
    await client.query('BEGIN');
    try {
      for (const raw of chunk) {
        const m = mapEcritureToDb(raw);
        const hashEcriture = hashEcritureFec(raw);
        const vals = [
          exerciceId,
          societeId,
          m.journal_code,
          m.journal_lib,
          m.ecriture_num,
          m.ecriture_date,
          m.compte_num,
          m.compte_lib,
          m.comp_aux_num,
          m.comp_aux_lib,
          m.piece_ref,
          m.piece_date,
          m.ecriture_lib,
          m.debit,
          m.credit,
          m.ecriture_let,
          m.date_let,
          m.valid_date,
          m.montant_devise,
          m.idevise,
          m.date_rglt,
          m.mode_rglt,
          m.nat_op,
          m.id_client,
          hashEcriture,
        ];
        const r = await client.query(INSERT_SQL, vals);
        if (r.rowCount === 1) importees += 1;
        else doublons += 1;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }

  return { importees, doublons, total: ecritures.length };
}

/** GET /api/fec/societes */
router.get('/societes', async (req, res) => {
  if (!requirePool(res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.siren, s.nom, s.couleur, s.created_at, s.updated_at,
              e.id AS exercice_id, e.annee, e.date_debut, e.date_fin, e.nb_ecritures, e.nom_fichier, e.created_at AS exercice_created_at
       FROM fec_societes s
       LEFT JOIN fec_exercices e ON e.societe_id = s.id
       ORDER BY s.id ASC, e.annee DESC NULLS LAST`,
    );

    const bySoc = new Map();
    for (const r of rows) {
      if (!bySoc.has(r.id)) {
        bySoc.set(r.id, {
          id: r.id,
          siren: r.siren,
          nom: r.nom,
          couleur: r.couleur,
          created_at: r.created_at,
          updated_at: r.updated_at,
          exercices: [],
        });
      }
      if (r.exercice_id != null) {
        bySoc.get(r.id).exercices.push({
          id: r.exercice_id,
          annee: r.annee,
          date_debut: r.date_debut,
          date_fin: r.date_fin,
          nb_ecritures: r.nb_ecritures,
          nom_fichier: r.nom_fichier,
          created_at: r.exercice_created_at,
        });
      }
    }

    res.json({ societes: Array.from(bySoc.values()) });
  } catch (err) {
    console.error('[FEC] GET societes', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

/** GET /api/fec/societes/:societeId/ecritures */
router.get('/societes/:societeId/ecritures', async (req, res) => {
  if (!requirePool(res)) return;
  const societeId = parseInt(req.params.societeId, 10);
  if (!Number.isFinite(societeId)) return res.status(400).json({ error: 'societeId invalide' });

  const { annee, dateDebut, dateFin } = req.query;
  const params = [societeId];
  let p = 2;
  const cond = ['e.societe_id = $1'];

  if (annee != null && String(annee).trim() !== '') {
    cond.push(`EXTRACT(YEAR FROM e.ecriture_date) = $${p}::int`);
    params.push(parseInt(annee, 10));
    p += 1;
  }
  if (dateDebut) {
    cond.push(`e.ecriture_date >= $${p}::date`);
    params.push(dateDebut);
    p += 1;
  }
  if (dateFin) {
    cond.push(`e.ecriture_date <= $${p}::date`);
    params.push(dateFin);
    p += 1;
  }

  const where = cond.join(' AND ');

  try {
    const countQ = await pool.query(`SELECT COUNT(*)::int AS n FROM fec_ecritures e WHERE ${where}`, params);
    const total = countQ.rows[0]?.n ?? 0;

    const dataQ = await pool.query(
      `SELECT e.journal_code, e.journal_lib, e.ecriture_num, e.ecriture_date, e.compte_num, e.compte_lib,
              e.comp_aux_num, e.comp_aux_lib, e.piece_ref, e.piece_date, e.ecriture_lib, e.debit, e.credit,
              e.ecriture_let, e.date_let, e.valid_date, e.montant_devise, e.idevise, e.date_rglt, e.mode_rglt,
              e.nat_op, e.id_client
       FROM fec_ecritures e
       WHERE ${where}
       ORDER BY e.ecriture_date NULLS LAST, e.id
       LIMIT ${ECritures_LIMIT}`,
      params,
    );

    function yyyymmdd(d) {
      if (!d) return '';
      if (typeof d === 'string') return String(d).replace(/\D/g, '').slice(0, 8);
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      }
      return '';
    }

    const rows = dataQ.rows.map((r) => ({
      JournalCode: r.journal_code ?? '',
      JournalLib: r.journal_lib ?? '',
      EcritureNum: r.ecriture_num ?? '',
      EcritureDate: yyyymmdd(r.ecriture_date),
      CompteNum: r.compte_num ?? '',
      CompteLib: r.compte_lib ?? '',
      CompAuxNum: r.comp_aux_num ?? '',
      CompAuxLib: r.comp_aux_lib ?? '',
      PieceRef: r.piece_ref ?? '',
      PieceDate: yyyymmdd(r.piece_date),
      EcritureLib: r.ecriture_lib ?? '',
      Debit: r.debit != null ? String(r.debit) : '0',
      Credit: r.credit != null ? String(r.credit) : '0',
      EcritureLet: r.ecriture_let ?? '',
      DateLet: yyyymmdd(r.date_let),
      ValidDate: yyyymmdd(r.valid_date),
      Montantdevise: r.montant_devise != null ? String(r.montant_devise) : '',
      Idevise: r.idevise ?? '',
      DateRglt: yyyymmdd(r.date_rglt),
      ModeRglt: r.mode_rglt ?? '',
      NatOp: r.nat_op ?? '',
      IdClient: r.id_client ?? '',
    }));

    res.json({ rows, total, limited: total > ECritures_LIMIT });
  } catch (err) {
    console.error('[FEC] GET ecritures', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

/** POST /api/fec/import */
router.post('/import', async (req, res) => {
  if (!requirePool(res)) return;
  const body = req.body || {};
  const {
    siren,
    nom,
    couleur,
    annee,
    dateDebut,
    dateFin,
    nomFichier,
    ecritures,
  } = body;

  if (!Array.isArray(ecritures)) {
    return res.status(400).json({ error: 'ecritures doit être un tableau' });
  }
  if (!String(nom || '').trim()) {
    return res.status(400).json({ error: 'nom requis' });
  }

  const client = await pool.connect();
  try {
    const societeId = await upsertSociete(client, { siren, nom, couleur });
    const exerciceId = await upsertExercice(client, {
      societeId,
      annee,
      dateDebut,
      dateFin,
      nomFichier,
    });

    const { importees, doublons, total } = await insertEcrituresBatched(client, societeId, exerciceId, ecritures);
    await refreshExerciceNbEcritures(client, exerciceId);

    res.json({
      societeId,
      exerciceId,
      ecrituresImportees: importees,
      ecrituresDoublons: doublons,
      ecrituresTotal: total,
    });
  } catch (err) {
    console.error('[FEC] POST import', err);
    res.status(500).json({ error: err.message || 'Erreur import' });
  } finally {
    client.release();
  }
});

/** DELETE /api/fec/societes/:societeId */
router.delete('/societes/:societeId', async (req, res) => {
  if (!requirePool(res)) return;
  const societeId = parseInt(req.params.societeId, 10);
  if (!Number.isFinite(societeId)) return res.status(400).json({ error: 'societeId invalide' });
  try {
    const r = await pool.query('DELETE FROM fec_societes WHERE id = $1 RETURNING id', [societeId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Société introuvable' });
    res.json({ ok: true, id: societeId });
  } catch (err) {
    console.error('[FEC] DELETE societe', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

/** DELETE /api/fec/exercices/:exerciceId */
router.delete('/exercices/:exerciceId', async (req, res) => {
  if (!requirePool(res)) return;
  const exerciceId = parseInt(req.params.exerciceId, 10);
  if (!Number.isFinite(exerciceId)) return res.status(400).json({ error: 'exerciceId invalide' });
  try {
    const r = await pool.query('DELETE FROM fec_exercices WHERE id = $1 RETURNING id, societe_id', [exerciceId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Exercice introuvable' });
    res.json({ ok: true, id: exerciceId, societeId: r.rows[0].societe_id });
  } catch (err) {
    console.error('[FEC] DELETE exercice', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

module.exports = router;
