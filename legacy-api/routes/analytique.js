const express = require('express');
const { randomUUID } = require('crypto');
const { pool } = require('../services/database');

const router = express.Router();

function requirePool(res) {
  if (!pool) {
    res.status(503).json({ error: 'Base de données non configurée' });
    return false;
  }
  return true;
}

/** GET /api/analytique/metiers — liste des métiers */
router.get('/metiers', async (req, res) => {
  if (!requirePool(res)) return;
  try {
    const q = await pool.query(
      'SELECT * FROM analytique_metiers WHERE actif = true ORDER BY ordre ASC, libelle ASC',
    );
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] metiers', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

/** GET /api/analytique/comptes — comptes 6x/7x avec affectations */
router.get('/comptes', async (req, res) => {
  if (!requirePool(res)) return;
  const raw = req.query.societe_id;
  const societeId =
    raw != null && raw !== '' && !Number.isNaN(parseInt(String(raw), 10))
      ? parseInt(String(raw), 10)
      : null;
  try {
    const q = await pool.query(
      `
    SELECT
      e.compte_num,
      MAX(e.compte_lib) AS compte_lib,
      CASE WHEN e.compte_num LIKE '6%' THEN 'CHARGE' ELSE 'PRODUIT' END AS type,
      COALESCE(
        json_agg(
          json_build_object(
            'id', a.id,
            'metier_id', a.metier_id,
            'metier_libelle', m.libelle,
            'categorie_id', a.categorie_id,
            'pourcentage', a.pourcentage
          )
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'::json
      ) AS affectations
    FROM fec_ecritures e
    LEFT JOIN analytique_affectations a
      ON a.compte_num = e.compte_num
      AND (a.societe_id IS NULL OR a.societe_id = $1::int)
    LEFT JOIN analytique_metiers m ON m.id = a.metier_id
    WHERE e.compte_num IS NOT NULL
      AND (e.compte_num LIKE '6%' OR e.compte_num LIKE '7%')
      AND ($1::int IS NULL OR e.societe_id = $1::int)
    GROUP BY e.compte_num
    ORDER BY e.compte_num
    `,
      [societeId],
    );
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] comptes', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

/** POST /api/analytique/affectations — remplace les affectations d’un compte pour une société (ou global si societe_id null) */
router.post('/affectations', async (req, res) => {
  if (!requirePool(res)) return;
  const { compte_num, societe_id, affectations } = req.body || {};
  if (!compte_num || typeof compte_num !== 'string') {
    return res.status(400).json({ error: 'compte_num requis' });
  }
  const societeId =
    societe_id != null && societe_id !== '' && !Number.isNaN(parseInt(String(societe_id), 10))
      ? parseInt(String(societe_id), 10)
      : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM analytique_affectations
       WHERE compte_num = $1
         AND (societe_id = $2 OR ($2::int IS NULL AND societe_id IS NULL))`,
      [compte_num.trim(), societeId],
    );
    for (const aff of affectations || []) {
      if (!aff.metier_id) continue;
      const pct = aff.pourcentage != null ? Number(aff.pourcentage) : 100;
      await client.query(
        `INSERT INTO analytique_affectations
          (id, compte_num, societe_id, metier_id, categorie_id, pourcentage, actif, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
        [
          randomUUID(),
          compte_num.trim(),
          societeId,
          String(aff.metier_id),
          aff.categorie_id != null && aff.categorie_id !== '' ? String(aff.categorie_id) : null,
          Number.isFinite(pct) ? pct : 100,
        ],
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[ANALYTIQUE] affectations', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally {
    client.release();
  }
});

/** GET /api/analytique/dashboard — agrégats par métier et type */
router.get('/dashboard', async (req, res) => {
  if (!requirePool(res)) return;
  const rawSoc = req.query.societe_id;
  const societeId =
    rawSoc != null && rawSoc !== '' && !Number.isNaN(parseInt(String(rawSoc), 10))
      ? parseInt(String(rawSoc), 10)
      : null;
  const dateDebut = req.query.date_debut != null && req.query.date_debut !== '' ? String(req.query.date_debut) : null;
  const dateFin = req.query.date_fin != null && req.query.date_fin !== '' ? String(req.query.date_fin) : null;

  try {
    const q = await pool.query(
      `
    SELECT
      m.id AS metier_id,
      m.code AS metier_code,
      m.libelle AS metier_libelle,
      m.couleur,
      e.societe_id,
      SUM((e.credit - e.debit) * a.pourcentage / 100) AS ca
    FROM fec_ecritures e
    JOIN analytique_affectations a ON a.compte_num = e.compte_num
      AND (
        a.societe_id IS NULL
        OR a.societe_id = e.societe_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM analytique_affectations a2
        WHERE a2.compte_num = e.compte_num
          AND a2.societe_id = e.societe_id
          AND a.societe_id IS NULL
      )
    JOIN analytique_metiers m ON m.id = a.metier_id
    WHERE e.compte_num LIKE '7%'
      AND ($2::date IS NULL OR e.ecriture_date >= $2::date)
      AND ($3::date IS NULL OR e.ecriture_date <= $3::date)
      AND ($1::int IS NULL OR e.societe_id = $1)
    GROUP BY m.id, m.code, m.libelle, m.couleur, m.ordre, e.societe_id
    ORDER BY m.ordre
    `,
      [societeId, dateDebut, dateFin],
    );
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] dashboard', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

router.get('/detail-metier', async (req, res) => {
  try {
    const { metier_id, societe_id, date_debut, date_fin } = req.query;
    const q = await pool.query(
      `
      SELECT
        e.compte_num,
        MAX(e.compte_lib) as compte_lib,
        SUM((e.credit - e.debit) * a.pourcentage / 100) as ca
      FROM fec_ecritures e
      JOIN analytique_affectations a ON a.compte_num = e.compte_num
      JOIN analytique_metiers m ON m.id = a.metier_id
      WHERE e.compte_num LIKE '7%'
        AND m.id = $1
        AND ($2::int IS NULL OR e.societe_id = $2)
        AND ($3::date IS NULL OR e.ecriture_date >= $3)
        AND ($4::date IS NULL OR e.ecriture_date <= $4)
      GROUP BY e.compte_num
      ORDER BY ca DESC
    `,
      [metier_id, societe_id || null, date_debut || null, date_fin || null],
    );
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] detail-metier', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/analytique/non-affectes */
router.get('/non-affectes', async (req, res) => {
  if (!requirePool(res)) return;
  const raw = req.query.societe_id;
  const societeId =
    raw != null && raw !== '' && !Number.isNaN(parseInt(String(raw), 10))
      ? parseInt(String(raw), 10)
      : null;
  try {
    const q = await pool.query(
      `
    SELECT
      e.compte_num,
      MAX(e.compte_lib) AS compte_lib,
      CASE WHEN e.compte_num LIKE '6%' THEN 'CHARGE' ELSE 'PRODUIT' END AS type,
      ABS(SUM(COALESCE(e.debit, 0) - COALESCE(e.credit, 0))) AS solde_abs
    FROM fec_ecritures e
    WHERE e.compte_num IS NOT NULL
      AND (e.compte_num LIKE '6%' OR e.compte_num LIKE '7%')
      AND ($1::int IS NULL OR e.societe_id = $1::int)
      AND NOT EXISTS (
        SELECT 1 FROM analytique_affectations a
        WHERE a.compte_num = e.compte_num
          AND (a.societe_id IS NULL OR a.societe_id = $1::int)
      )
    GROUP BY e.compte_num
    ORDER BY solde_abs DESC NULLS LAST
    `,
      [societeId],
    );
    res.json({ data: q.rows, count: q.rows.length });
  } catch (e) {
    console.error('[ANALYTIQUE] non-affectes', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

router.get('/clients-global', async (req, res) => {
  try {
    const { societe_id, date_debut, date_fin } = req.query;
    const q = await pool.query(
      `
      SELECT
        e.compte_num,
        MAX(e.compte_lib) as compte_lib,
        m.libelle as metier,
        m.couleur,
        SUM((e.credit - e.debit) * a.pourcentage / 100) as ca
      FROM fec_ecritures e
      JOIN analytique_affectations a ON a.compte_num = e.compte_num
        AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
        AND NOT EXISTS (
          SELECT 1 FROM analytique_affectations a2
          WHERE a2.compte_num = e.compte_num
            AND a2.societe_id = e.societe_id
            AND a.societe_id IS NULL
        )
      JOIN analytique_metiers m ON m.id = a.metier_id
      WHERE e.compte_num LIKE '7%'
        AND ($1::int IS NULL OR e.societe_id = $1)
        AND ($2::date IS NULL OR e.ecriture_date >= $2)
        AND ($3::date IS NULL OR e.ecriture_date <= $3)
      GROUP BY e.compte_num, m.libelle, m.couleur
      ORDER BY ca DESC
    `,
      [societe_id || null, date_debut || null, date_fin || null],
    );
    res.json({ data: q.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
