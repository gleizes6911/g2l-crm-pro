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

/**
 * Une ligne par (société, empreinte import) : journal, n°, date, compte, débit, crédit
 * (btrim sur les textes). Même règle que le hash côté import — fusionne notamment un
 * doublon l’un avec hash, l’autre en NULL, ou deux lignes en double.
 */
const SQL_FEC_ECRITURES_DEDUP = `(
  SELECT DISTINCT ON (
      fec.societe_id,
      btrim(COALESCE(fec.journal_code, '')) ,
      btrim(COALESCE(fec.ecriture_num, '')) ,
      fec.ecriture_date,
      btrim(COALESCE(fec.compte_num, '')) ,
      COALESCE(fec.debit, 0::numeric) ,
      COALESCE(fec.credit, 0::numeric)
  )
  fec.*
  FROM fec_ecritures fec
  ORDER BY
    fec.societe_id,
    btrim(COALESCE(fec.journal_code, '')) ,
    btrim(COALESCE(fec.ecriture_num, '')) ,
    fec.ecriture_date,
    btrim(COALESCE(fec.compte_num, '')) ,
    COALESCE(fec.debit, 0::numeric) ,
    COALESCE(fec.credit, 0::numeric) ,
    fec.id ASC
)`;

/**
 * Une affectation par (compte, métier, scope société) : en cas de doublons,
 * on garde la ligne la plus récente.
 */
const SQL_AFFECTATIONS_DEDUP = `(
  SELECT DISTINCT ON (a_d.compte_num, a_d.metier_id, COALESCE(a_d.societe_id, -1))
    a_d.*
  FROM analytique_affectations a_d
  WHERE a_d.actif = true
  ORDER BY
    a_d.compte_num,
    a_d.metier_id,
    COALESCE(a_d.societe_id, -1),
    a_d.updated_at DESC NULLS LAST,
    a_d.id DESC
)`;

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
    WITH comptes_fec AS (
      SELECT
        e.compte_num,
        MAX(e.compte_lib) AS compte_lib
      FROM ${SQL_FEC_ECRITURES_DEDUP} e
      WHERE e.compte_num IS NOT NULL
        AND (e.compte_num LIKE '6%' OR e.compte_num LIKE '7%')
        AND ($1::int IS NULL OR e.societe_id = $1::int)
      GROUP BY e.compte_num
    )
    SELECT
      c.compte_num,
      c.compte_lib,
      CASE WHEN c.compte_num LIKE '6%' THEN 'CHARGE' ELSE 'PRODUIT' END AS type,
      COALESCE(
        json_agg(
          json_build_object(
            'id', a.id,
            'metier_id', a.metier_id,
            'metier_libelle', m.libelle,
            'categorie_id', a.categorie_id,
            'pourcentage', a.pourcentage
          ) ORDER BY a.metier_id
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'::json
      ) AS affectations
    FROM comptes_fec c
    LEFT JOIN ${SQL_AFFECTATIONS_DEDUP} a
      ON a.compte_num = c.compte_num
      AND (a.societe_id IS NULL OR a.societe_id = $1::int)
    LEFT JOIN analytique_metiers m ON m.id = a.metier_id
    GROUP BY c.compte_num, c.compte_lib
    ORDER BY c.compte_num
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
      SUM((e.credit::numeric - e.debit::numeric) * a.pourcentage::numeric / 100) AS ca
    FROM ${SQL_FEC_ECRITURES_DEDUP} e
    JOIN ${SQL_AFFECTATIONS_DEDUP} a ON a.compte_num = e.compte_num
      AND (
        a.societe_id IS NULL
        OR a.societe_id = e.societe_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM analytique_affectations a2
        WHERE a2.compte_num = e.compte_num
          AND a2.societe_id = e.societe_id
          AND a.societe_id IS NULL
          AND a2.actif = true
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
        SUM((e.credit::numeric - e.debit::numeric) * a.pourcentage::numeric / 100) as ca
      FROM ${SQL_FEC_ECRITURES_DEDUP} e
      JOIN ${SQL_AFFECTATIONS_DEDUP} a ON a.compte_num = e.compte_num
      JOIN analytique_metiers m ON m.id = a.metier_id
      WHERE e.compte_num LIKE '7%'
        AND m.id = $1
        AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
        AND NOT EXISTS (
          SELECT 1 FROM analytique_affectations a2
          WHERE a2.compte_num = e.compte_num
            AND a2.societe_id = e.societe_id
            AND a.societe_id IS NULL
            AND a2.actif = true
        )
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
  const dateDebut = req.query.date_debut != null && req.query.date_debut !== '' ? String(req.query.date_debut) : null;
  const dateFin = req.query.date_fin != null && req.query.date_fin !== '' ? String(req.query.date_fin) : null;
  try {
    const q = await pool.query(
      `
    SELECT
      e.compte_num,
      MAX(e.compte_lib) AS compte_lib,
      CASE WHEN e.compte_num LIKE '6%' THEN 'CHARGE' ELSE 'PRODUIT' END AS type,
      ABS(SUM(COALESCE(e.debit, 0) - COALESCE(e.credit, 0))) AS solde_abs
    FROM ${SQL_FEC_ECRITURES_DEDUP} e
    WHERE e.compte_num IS NOT NULL
      AND (e.compte_num LIKE '6%' OR e.compte_num LIKE '7%')
      AND ($1::int IS NULL OR e.societe_id = $1::int)
      AND ($2::date IS NULL OR e.ecriture_date >= $2::date)
      AND ($3::date IS NULL OR e.ecriture_date <= $3::date)
      AND NOT EXISTS (
        SELECT 1 FROM analytique_affectations a
        WHERE a.compte_num = e.compte_num
          AND a.actif = true
          AND (a.societe_id IS NULL OR a.societe_id = $1::int)
      )
    GROUP BY e.compte_num
    ORDER BY solde_abs DESC NULLS LAST
    `,
      [societeId, dateDebut, dateFin],
    );
    res.json({ data: q.rows, count: q.rows.length });
  } catch (e) {
    console.error('[ANALYTIQUE] non-affectes', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

/** GET /api/analytique/non-affectes-ecritures — détail des écritures non affectées */
router.get('/non-affectes-ecritures', async (req, res) => {
  if (!requirePool(res)) return;
  const raw = req.query.societe_id;
  const societeId =
    raw != null && raw !== '' && !Number.isNaN(parseInt(String(raw), 10))
      ? parseInt(String(raw), 10)
      : null;
  const dateDebut = req.query.date_debut != null && req.query.date_debut !== '' ? String(req.query.date_debut) : null;
  const dateFin = req.query.date_fin != null && req.query.date_fin !== '' ? String(req.query.date_fin) : null;
  const scope = String(req.query.scope || 'produit_metier');
  try {
    let sql = '';
    if (scope === 'charge_famille') {
      sql = `
        SELECT
          e.journal_code,
          e.ecriture_date,
          COALESCE(NULLIF(e.ecriture_lib, ''), e.compte_lib, '—') AS libelle,
          (COALESCE(e.debit, 0) - COALESCE(e.credit, 0)) AS montant,
          e.compte_num
        FROM ${SQL_FEC_ECRITURES_DEDUP} e
        LEFT JOIN analytique_famille_charge_comptes fc ON fc.compte_num = e.compte_num
        WHERE e.compte_num LIKE '6%'
          AND fc.compte_num IS NULL
          AND ($1::int IS NULL OR e.societe_id = $1::int)
          AND ($2::date IS NULL OR e.ecriture_date >= $2::date)
          AND ($3::date IS NULL OR e.ecriture_date <= $3::date)
        ORDER BY e.ecriture_date DESC NULLS LAST, e.id DESC
      `;
    } else if (scope === 'produit_affecte') {
      sql = `
        SELECT
          e.journal_code,
          e.ecriture_date,
          COALESCE(NULLIF(e.ecriture_lib, ''), e.compte_lib, '—') AS libelle,
          (COALESCE(e.credit, 0) - COALESCE(e.debit, 0)) AS montant,
          e.compte_num
        FROM ${SQL_FEC_ECRITURES_DEDUP} e
        WHERE e.compte_num LIKE '7%'
          AND ($1::int IS NULL OR e.societe_id = $1::int)
          AND ($2::date IS NULL OR e.ecriture_date >= $2::date)
          AND ($3::date IS NULL OR e.ecriture_date <= $3::date)
          AND EXISTS (
            SELECT 1 FROM analytique_affectations a
            WHERE a.compte_num = e.compte_num
              AND a.actif = true
              AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
          )
        ORDER BY e.ecriture_date DESC NULLS LAST, e.id DESC
      `;
    } else {
      sql = `
        SELECT
          e.journal_code,
          e.ecriture_date,
          COALESCE(NULLIF(e.ecriture_lib, ''), e.compte_lib, '—') AS libelle,
          (COALESCE(e.credit, 0) - COALESCE(e.debit, 0)) AS montant,
          e.compte_num
        FROM ${SQL_FEC_ECRITURES_DEDUP} e
        WHERE e.compte_num LIKE '7%'
          AND ($1::int IS NULL OR e.societe_id = $1::int)
          AND ($2::date IS NULL OR e.ecriture_date >= $2::date)
          AND ($3::date IS NULL OR e.ecriture_date <= $3::date)
          AND NOT EXISTS (
            SELECT 1 FROM analytique_affectations a
            WHERE a.compte_num = e.compte_num
              AND a.actif = true
              AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
          )
        ORDER BY e.ecriture_date DESC NULLS LAST, e.id DESC
      `;
    }
    const q = await pool.query(sql, [societeId, dateDebut, dateFin]);
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] non-affectes-ecritures', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

router.get('/clients-global', async (req, res) => {
  if (!requirePool(res)) return;
  try {
    const { societe_id, date_debut, date_fin } = req.query;
    const q = await pool.query(
      `
      WITH groupe_map AS (
        SELECT gcc.compte_num, g.id AS groupe_id, g.nom AS groupe_nom, g.couleur AS groupe_couleur
        FROM analytique_groupe_client_comptes gcc
        JOIN analytique_groupes_clients g ON g.id = gcc.groupe_id AND g.actif = true
      ),
      raw AS (
        SELECT
          e.compte_num,
          MAX(e.compte_lib)                              AS compte_lib,
          e.societe_id,
          m.libelle                                      AS metier,
          m.couleur                                      AS metier_couleur,
          SUM((e.credit::numeric - e.debit::numeric) * a.pourcentage::numeric / 100) AS ca
        FROM ${SQL_FEC_ECRITURES_DEDUP} e
        JOIN ${SQL_AFFECTATIONS_DEDUP} a ON a.compte_num = e.compte_num
          AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
          AND NOT EXISTS (
            SELECT 1 FROM analytique_affectations a2
            WHERE a2.compte_num = e.compte_num
              AND a2.societe_id = e.societe_id
              AND a.societe_id IS NULL
              AND a2.actif = true
          )
        JOIN analytique_metiers m ON m.id = a.metier_id
        WHERE e.compte_num LIKE '7%'
          AND ($1::int IS NULL OR e.societe_id = $1)
          AND ($2::date IS NULL OR e.ecriture_date >= $2)
          AND ($3::date IS NULL OR e.ecriture_date <= $3)
        GROUP BY e.compte_num, e.societe_id, m.libelle, m.couleur
      ),
      joined AS (
        SELECT
          r.*,
          gm.groupe_id,
          gm.groupe_nom,
          gm.groupe_couleur,
          COALESCE(
            CASE WHEN gm.groupe_id IS NOT NULL THEN 'g' || gm.groupe_id::text END,
            r.societe_id::text || '/' || r.compte_num
          ) AS agg_key,
          COALESCE(gm.groupe_nom, r.compte_lib)         AS agg_nom,
          COALESCE(gm.groupe_couleur, r.metier_couleur) AS agg_couleur
        FROM raw r
        LEFT JOIN groupe_map gm ON gm.compte_num = r.compte_num
      ),
      by_compte AS (
        SELECT
          j.agg_key,
          j.compte_num,
          MAX(j.compte_lib) AS compte_lib,
          j.societe_id,
          SUM(j.ca)         AS ca
        FROM joined j
        GROUP BY j.agg_key, j.compte_num, j.societe_id
      ),
      totals AS (
        SELECT
          j.agg_key AS id,
          MAX(j.agg_nom)  AS compte_lib,
          MAX(j.agg_couleur) AS couleur,
          BOOL_OR(j.groupe_id IS NOT NULL) AS est_groupe,
          SUM(j.ca) AS ca
        FROM joined j
        GROUP BY j.agg_key
      )
      SELECT
        t.id,
        t.compte_lib,
        t.couleur,
        t.est_groupe,
        t.ca,
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'compte_num', b.compte_num,
              'compte_lib', b.compte_lib,
              'societe_id', b.societe_id,
              'ca', b.ca
            ) ORDER BY b.ca DESC
          )
          FROM by_compte b
          WHERE b.agg_key = t.id
        ), '[]'::json) AS detail
      FROM totals t
      ORDER BY t.ca DESC
    `,
      [societe_id || null, date_debut || null, date_fin || null],
    );
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] clients-global', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/analytique/produit-compte-lignes
 * Lignes FEC 7% pour un compte + société + période, avec part affectée (métier) par ligne.
 */
router.get('/produit-compte-lignes', async (req, res) => {
  if (!requirePool(res)) return;
  const { compte_num, societe_id, date_debut, date_fin } = req.query;
  if (!compte_num || compte_num === '') {
    return res.status(400).json({ error: 'compte_num requis' });
  }
  const rawSoc = societe_id;
  const sid =
    rawSoc != null && rawSoc !== '' && !Number.isNaN(parseInt(String(rawSoc), 10))
      ? parseInt(String(rawSoc), 10)
      : null;
  if (sid == null) {
    return res.status(400).json({ error: 'societe_id requis' });
  }
  const dDebut = date_debut != null && String(date_debut) !== '' ? String(date_debut) : null;
  const dFin = date_fin != null && String(date_fin) !== '' ? String(date_fin) : null;
  try {
    const q = await pool.query(
      `
      SELECT DISTINCT ON (e.id, m.id)
        e.id,
        (e.ecriture_date::text) AS ecriture_date,
        e.journal_code,
        e.piece_ref,
        COALESCE(NULLIF(e.ecriture_lib, ''), e.compte_lib, '—') AS ecriture_lib,
        e.debit,
        e.credit,
        (e.credit::numeric - e.debit::numeric) AS produit_brut,
        m.id AS metier_id,
        m.libelle AS metier_libelle,
        a.pourcentage,
        ((e.credit::numeric - e.debit::numeric) * a.pourcentage::numeric / 100) AS produit_affecte
      FROM ${SQL_FEC_ECRITURES_DEDUP} e
      JOIN ${SQL_AFFECTATIONS_DEDUP} a ON a.compte_num = e.compte_num
        AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
        AND NOT EXISTS (
          SELECT 1 FROM analytique_affectations a2
          WHERE a2.compte_num = e.compte_num
            AND a2.societe_id = e.societe_id
            AND a.societe_id IS NULL
            AND a2.actif = true
        )
      JOIN analytique_metiers m ON m.id = a.metier_id
      WHERE e.compte_num = $1
        AND e.societe_id = $2
        AND e.compte_num LIKE '7%'
        AND ($3::date IS NULL OR e.ecriture_date >= $3::date)
        AND ($4::date IS NULL OR e.ecriture_date <= $4::date)
      ORDER BY e.id, m.id, e.ecriture_date, m.ordre
    `,
      [String(compte_num).trim(), sid, dDebut, dFin],
    );
    const rows = q.rows;
    const brutParEcriture = new Map();
    for (const r of rows) {
      if (!brutParEcriture.has(r.id)) {
        brutParEcriture.set(r.id, Number(r.produit_brut) || 0);
      }
    }
    const produitBrutCum = [...brutParEcriture.values()].reduce((a, b) => a + b, 0);
    const produitAffecteCum = rows.reduce((s, r) => s + (Number(r.produit_affecte) || 0), 0);
    res.json({
      data: rows,
      totaux: { produit_brut: produitBrutCum, produit_affecte: produitAffecteCum },
    });
  } catch (e) {
    console.error('[ANALYTIQUE] produit-compte-lignes', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

/**
 * GET /api/analytique/charge-compte-lignes
 * Lignes FEC 6% pour un compte + société + période (même logique d’affectation métier que les produits).
 */
router.get('/charge-compte-lignes', async (req, res) => {
  if (!requirePool(res)) return;
  const { compte_num, societe_id, date_debut, date_fin } = req.query;
  if (!compte_num || compte_num === '') {
    return res.status(400).json({ error: 'compte_num requis' });
  }
  const rawSoc = societe_id;
  const sid =
    rawSoc != null && rawSoc !== '' && !Number.isNaN(parseInt(String(rawSoc), 10))
      ? parseInt(String(rawSoc), 10)
      : null;
  if (sid == null) {
    return res.status(400).json({ error: 'societe_id requis' });
  }
  const dDebut = date_debut != null && String(date_debut) !== '' ? String(date_debut) : null;
  const dFin = date_fin != null && String(date_fin) !== '' ? String(date_fin) : null;
  const pCompte = String(compte_num).trim();
  const paramsAffecte = [pCompte, sid, dDebut, dFin];
  try {
    const qAffecte = await pool.query(
      `
      SELECT DISTINCT ON (e.id, m.id)
        e.id,
        (e.ecriture_date::text) AS ecriture_date,
        e.journal_code,
        e.piece_ref,
        COALESCE(NULLIF(e.ecriture_lib, ''), e.compte_lib, '—') AS ecriture_lib,
        e.debit,
        e.credit,
        (e.debit::numeric - e.credit::numeric) AS charge_brut,
        m.id AS metier_id,
        m.libelle AS metier_libelle,
        a.pourcentage,
        ((e.debit::numeric - e.credit::numeric) * a.pourcentage::numeric / 100) AS charge_affectee
      FROM ${SQL_FEC_ECRITURES_DEDUP} e
      JOIN ${SQL_AFFECTATIONS_DEDUP} a ON a.compte_num = e.compte_num
        AND (a.societe_id IS NULL OR a.societe_id = e.societe_id)
        AND NOT EXISTS (
          SELECT 1 FROM analytique_affectations a2
          WHERE a2.compte_num = e.compte_num
            AND a2.societe_id = e.societe_id
            AND a.societe_id IS NULL
            AND a2.actif = true
        )
      JOIN analytique_metiers m ON m.id = a.metier_id
      WHERE e.compte_num = $1
        AND e.societe_id = $2
        AND e.compte_num LIKE '6%'
        AND ($3::date IS NULL OR e.ecriture_date >= $3::date)
        AND ($4::date IS NULL OR e.ecriture_date <= $4::date)
      ORDER BY e.id, m.id, e.ecriture_date, m.ordre
    `,
      paramsAffecte,
    );
    let rows = qAffecte.rows;
    /** Comptes 6 sans affectation métier (ex. 641) : l’INNER JOIN ne retourne rien — on affiche quand même les écritures FEC. */
    if (rows.length === 0) {
      const qBrut = await pool.query(
        `
        SELECT DISTINCT ON (e.id)
          e.id,
          (e.ecriture_date::text) AS ecriture_date,
          e.journal_code,
          e.piece_ref,
          COALESCE(NULLIF(e.ecriture_lib, ''), e.compte_lib, '—') AS ecriture_lib,
          e.debit,
          e.credit,
          (e.debit::numeric - e.credit::numeric) AS charge_brut,
          NULL::text AS metier_id,
          'Non affecté (compte 6 sans affectation analytique)'::text AS metier_libelle,
          NULL::numeric AS pourcentage,
          (e.debit::numeric - e.credit::numeric) AS charge_affectee
        FROM ${SQL_FEC_ECRITURES_DEDUP} e
        WHERE e.compte_num = $1
          AND e.societe_id = $2
          AND e.compte_num LIKE '6%'
          AND ($3::date IS NULL OR e.ecriture_date >= $3::date)
          AND ($4::date IS NULL OR e.ecriture_date <= $4::date)
        ORDER BY e.id, e.ecriture_date
        `,
        paramsAffecte,
      );
      rows = qBrut.rows;
    }
    const brutParEcriture = new Map();
    for (const r of rows) {
      if (!brutParEcriture.has(r.id)) {
        brutParEcriture.set(r.id, Number(r.charge_brut) || 0);
      }
    }
    const chargeBrutCum = [...brutParEcriture.values()].reduce((a, b) => a + b, 0);
    const chargeAffecteeCum = rows.reduce((s, r) => s + (Number(r.charge_affectee) || 0), 0);
    res.json({
      data: rows,
      totaux: { charge_brut: chargeBrutCum, charge_affectee: chargeAffecteeCum },
    });
  } catch (e) {
    console.error('[ANALYTIQUE] charge-compte-lignes', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// ── CRUD Groupes clients ────────────────────────────────────────────

/** GET /api/analytique/groupes-clients */
router.get('/groupes-clients', async (req, res) => {
  if (!requirePool(res)) return;
  try {
    const q = await pool.query(`
      SELECT g.id, g.nom, g.couleur, g.actif, g.created_at,
        COALESCE(
          json_agg(gc.compte_num ORDER BY gc.compte_num) FILTER (WHERE gc.compte_num IS NOT NULL),
          '[]'::json
        ) AS comptes
      FROM analytique_groupes_clients g
      LEFT JOIN analytique_groupe_client_comptes gc ON gc.groupe_id = g.id
      WHERE g.actif = true
      GROUP BY g.id, g.nom, g.couleur, g.actif, g.created_at
      ORDER BY g.nom
    `);
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] groupes-clients GET', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/analytique/groupes-clients — créer un groupe */
router.post('/groupes-clients', async (req, res) => {
  if (!requirePool(res)) return;
  const { nom, couleur, comptes } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    await client.query(
      `INSERT INTO analytique_groupes_clients (id, nom, couleur, actif, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())`,
      [id, nom.trim(), couleur || '#2563eb'],
    );
    for (const num of comptes || []) {
      if (!num) continue;
      await client.query(
        `INSERT INTO analytique_groupe_client_comptes (groupe_id, compte_num) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, String(num).trim()],
      );
    }
    await client.query('COMMIT');
    const row = await pool.query(
      `SELECT g.id, g.nom, g.couleur, g.actif,
        COALESCE(json_agg(gc.compte_num ORDER BY gc.compte_num) FILTER (WHERE gc.compte_num IS NOT NULL), '[]'::json) AS comptes
       FROM analytique_groupes_clients g
       LEFT JOIN analytique_groupe_client_comptes gc ON gc.groupe_id = g.id
       WHERE g.id = $1 GROUP BY g.id, g.nom, g.couleur, g.actif`,
      [id],
    );
    res.status(201).json(row.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[ANALYTIQUE] groupes-clients POST', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** PATCH /api/analytique/groupes-clients/:id — modifier nom/couleur */
router.patch('/groupes-clients/:id', async (req, res) => {
  if (!requirePool(res)) return;
  const { id } = req.params;
  const { nom, couleur } = req.body || {};
  try {
    const sets = [];
    const vals = [];
    if (nom !== undefined)    { sets.push(`nom = $${vals.push(nom.trim())}`); }
    if (couleur !== undefined) { sets.push(`couleur = $${vals.push(couleur)}`); }
    if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier.' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE analytique_groupes_clients SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const row = await pool.query(
      `SELECT g.id, g.nom, g.couleur, g.actif,
        COALESCE(json_agg(gc.compte_num ORDER BY gc.compte_num) FILTER (WHERE gc.compte_num IS NOT NULL), '[]'::json) AS comptes
       FROM analytique_groupes_clients g
       LEFT JOIN analytique_groupe_client_comptes gc ON gc.groupe_id = g.id
       WHERE g.id = $1 GROUP BY g.id, g.nom, g.couleur, g.actif`,
      [id],
    );
    res.json(row.rows[0]);
  } catch (e) {
    console.error('[ANALYTIQUE] groupes-clients PATCH', e);
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/analytique/groupes-clients/:id/comptes — remplace la liste de comptes */
router.put('/groupes-clients/:id/comptes', async (req, res) => {
  if (!requirePool(res)) return;
  const { id } = req.params;
  const { comptes } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM analytique_groupe_client_comptes WHERE groupe_id = $1`, [id]);
    for (const num of comptes || []) {
      if (!num) continue;
      await client.query(
        `INSERT INTO analytique_groupe_client_comptes (groupe_id, compte_num) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, String(num).trim()],
      );
    }
    await client.query('COMMIT');
    const row = await pool.query(
      `SELECT g.id, g.nom, g.couleur, g.actif,
        COALESCE(json_agg(gc.compte_num ORDER BY gc.compte_num) FILTER (WHERE gc.compte_num IS NOT NULL), '[]'::json) AS comptes
       FROM analytique_groupes_clients g
       LEFT JOIN analytique_groupe_client_comptes gc ON gc.groupe_id = g.id
       WHERE g.id = $1 GROUP BY g.id, g.nom, g.couleur, g.actif`,
      [id],
    );
    res.json(row.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[ANALYTIQUE] groupes-clients PUT comptes', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** DELETE /api/analytique/groupes-clients/:id */
router.delete('/groupes-clients/:id', async (req, res) => {
  if (!requirePool(res)) return;
  const { id } = req.params;
  try {
    await pool.query(`UPDATE analytique_groupes_clients SET actif = false, updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ANALYTIQUE] groupes-clients DELETE', e);
    res.status(500).json({ error: e.message });
  }
});

// ── CRUD Familles de charges ─────────────────────────────────────────

const FC_SELECT = `
  SELECT f.id, f.nom, f.couleur, f.actif, f.created_at,
    COALESCE(
      json_agg(fc.compte_num ORDER BY fc.compte_num) FILTER (WHERE fc.compte_num IS NOT NULL),
      '[]'::json
    ) AS comptes
  FROM analytique_familles_charges f
  LEFT JOIN analytique_famille_charge_comptes fc ON fc.famille_id = f.id
  WHERE f.id = $1
  GROUP BY f.id, f.nom, f.couleur, f.actif, f.created_at
`;

/** GET /api/analytique/familles-charges */
router.get('/familles-charges', async (req, res) => {
  if (!requirePool(res)) return;
  try {
    const q = await pool.query(`
      SELECT f.id, f.nom, f.couleur, f.actif, f.created_at,
        COALESCE(
          json_agg(fc.compte_num ORDER BY fc.compte_num) FILTER (WHERE fc.compte_num IS NOT NULL),
          '[]'::json
        ) AS comptes
      FROM analytique_familles_charges f
      LEFT JOIN analytique_famille_charge_comptes fc ON fc.famille_id = f.id
      WHERE f.actif = true
      GROUP BY f.id, f.nom, f.couleur, f.actif, f.created_at
      ORDER BY f.nom
    `);
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] familles-charges GET', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/analytique/familles-charges — créer une famille */
router.post('/familles-charges', async (req, res) => {
  if (!requirePool(res)) return;
  const { nom, couleur, comptes } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    await client.query(
      `INSERT INTO analytique_familles_charges (id, nom, couleur, actif, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())`,
      [id, nom.trim(), couleur || '#dc2626'],
    );
    for (const num of comptes || []) {
      if (!num) continue;
      await client.query(
        `INSERT INTO analytique_famille_charge_comptes (famille_id, compte_num) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, String(num).trim()],
      );
    }
    await client.query('COMMIT');
    const row = await pool.query(FC_SELECT, [id]);
    res.status(201).json(row.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[ANALYTIQUE] familles-charges POST', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** PATCH /api/analytique/familles-charges/:id — modifier nom/couleur */
router.patch('/familles-charges/:id', async (req, res) => {
  if (!requirePool(res)) return;
  const { id } = req.params;
  const { nom, couleur } = req.body || {};
  try {
    const sets = [];
    const vals = [];
    if (nom !== undefined)    { sets.push(`nom = $${vals.push(nom.trim())}`); }
    if (couleur !== undefined) { sets.push(`couleur = $${vals.push(couleur)}`); }
    if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier.' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE analytique_familles_charges SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const row = await pool.query(FC_SELECT, [id]);
    res.json(row.rows[0]);
  } catch (e) {
    console.error('[ANALYTIQUE] familles-charges PATCH', e);
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/analytique/familles-charges/:id/comptes — remplace la liste de comptes */
router.put('/familles-charges/:id/comptes', async (req, res) => {
  if (!requirePool(res)) return;
  const { id } = req.params;
  const { comptes } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM analytique_famille_charge_comptes WHERE famille_id = $1`, [id]);
    for (const num of comptes || []) {
      if (!num) continue;
      await client.query(
        `INSERT INTO analytique_famille_charge_comptes (famille_id, compte_num) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, String(num).trim()],
      );
    }
    await client.query('COMMIT');
    const row = await pool.query(FC_SELECT, [id]);
    res.json(row.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[ANALYTIQUE] familles-charges PUT comptes', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** DELETE /api/analytique/familles-charges/:id */
router.delete('/familles-charges/:id', async (req, res) => {
  if (!requirePool(res)) return;
  const { id } = req.params;
  try {
    await pool.query(`UPDATE analytique_familles_charges SET actif = false, updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ANALYTIQUE] familles-charges DELETE', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/analytique/charges-global — agrège les comptes 6x par famille de charges */
router.get('/charges-global', async (req, res) => {
  if (!requirePool(res)) return;
  const { societe_id, date_debut, date_fin } = req.query;
  try {
    const q = await pool.query(`
      WITH famille_map AS (
        SELECT fc.compte_num, f.id AS famille_id, f.nom AS famille_nom, f.couleur AS famille_couleur
        FROM analytique_famille_charge_comptes fc
        JOIN analytique_familles_charges f ON f.id = fc.famille_id AND f.actif = true
      ),
      raw AS (
        SELECT
          e.compte_num,
          MAX(e.compte_lib)                              AS compte_lib,
          e.societe_id,
          SUM(COALESCE(e.debit, 0) - COALESCE(e.credit, 0)) AS charge
        FROM ${SQL_FEC_ECRITURES_DEDUP} e
        WHERE e.compte_num LIKE '6%'
          AND ($1::int IS NULL OR e.societe_id = $1)
          AND ($2::date IS NULL OR e.ecriture_date >= $2)
          AND ($3::date IS NULL OR e.ecriture_date <= $3)
        GROUP BY e.compte_num, e.societe_id
      ),
      joined AS (
        SELECT
          r.*,
          fm.famille_id,
          fm.famille_nom,
          fm.famille_couleur,
          COALESCE(fm.famille_id, r.compte_num)           AS agg_key,
          COALESCE(fm.famille_nom, r.compte_lib)           AS agg_nom,
          COALESCE(fm.famille_couleur, '#94a3b8')          AS agg_couleur
        FROM raw r
        LEFT JOIN famille_map fm ON fm.compte_num = r.compte_num
      )
      SELECT
        agg_key                                            AS id,
        agg_nom                                            AS compte_lib,
        agg_couleur                                        AS couleur,
        SUM(charge)                                        AS charge,
        BOOL_OR(famille_id IS NOT NULL)                    AS est_famille,
        json_agg(
          json_build_object(
            'compte_num', compte_num,
            'compte_lib', compte_lib,
            'societe_id', societe_id,
            'charge',     charge
          ) ORDER BY charge DESC
        ) AS detail
      FROM joined
      GROUP BY agg_key, agg_nom, agg_couleur
      ORDER BY SUM(charge) DESC
    `, [societe_id || null, date_debut || null, date_fin || null]);
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] charges-global', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/analytique/comptes6 — comptes 6x distincts avec solde débiteur (pour picker) */
router.get('/comptes6', async (req, res) => {
  if (!requirePool(res)) return;
  const { societe_id } = req.query;
  try {
    const q = await pool.query(`
      SELECT
        e.compte_num,
        MAX(e.compte_lib) AS compte_lib,
        SUM(COALESCE(e.debit, 0) - COALESCE(e.credit, 0)) AS solde
      FROM ${SQL_FEC_ECRITURES_DEDUP} e
      WHERE e.compte_num LIKE '6%'
        AND ($1::int IS NULL OR e.societe_id = $1)
      GROUP BY e.compte_num
      ORDER BY solde DESC
    `, [societe_id || null]);
    res.json({ data: q.rows });
  } catch (e) {
    console.error('[ANALYTIQUE] comptes6', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
