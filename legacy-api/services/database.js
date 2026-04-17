const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

const ENCRYPTION_KEY =
  process.env.CREDENTIALS_ENCRYPTION_KEY || 'g2l-default-key-32-chars-minimum!';
const ALGORITHM = 'aes-256-cbc';

function encryptCredential(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptCredential(text) {
  if (!text || !String(text).includes(':')) return text;
  try {
    const [ivHex, encrypted] = String(text).split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return text;
  }
}

/** Champs sensibles à chiffrer par API */
const SENSITIVE_FIELDS = {
  salesforce_sandbox: ['password', 'securityToken'],
  salesforce_prod: ['password', 'securityToken'],
  wex: ['clientSecret', 'password'],
  webfleet: ['password', 'apiKey'],
  smtp: ['password'],
  microsoft_graph: ['clientSecret'],
  postgresql: ['password'],
};

async function getApiCredentials(apiName) {
  if (!pool) return null;
  const result = await pool.query('SELECT * FROM api_credentials WHERE api_name = $1', [apiName]);
  if (!result.rows[0]) return null;
  const creds = result.rows[0].credentials;
  const sensitive = SENSITIVE_FIELDS[apiName] || [];
  const decrypted = { ...creds };
  for (const field of sensitive) {
    if (decrypted[field]) decrypted[field] = decryptCredential(decrypted[field]);
  }
  return decrypted;
}

async function getAllApiCredentials() {
  if (!pool) return {};
  const result = await pool.query('SELECT api_name, credentials, updated_at FROM api_credentials');
  const out = {};
  for (const row of result.rows) {
    const sensitive = SENSITIVE_FIELDS[row.api_name] || [];
    const decrypted = { ...row.credentials };
    for (const field of sensitive) {
      if (decrypted[field]) decrypted[field] = decryptCredential(decrypted[field]);
    }
    out[row.api_name] = { ...decrypted, updatedAt: row.updated_at };
  }
  return out;
}

async function saveApiCredentials(apiName, credentials) {
  if (!pool) throw new Error('DB non disponible');
  const sensitive = SENSITIVE_FIELDS[apiName] || [];
  const toSave = { ...credentials };
  for (const field of sensitive) {
    if (toSave[field]) toSave[field] = encryptCredential(toSave[field]);
  }
  const id = 'CRED_' + apiName.toUpperCase();
  await pool.query(
    `INSERT INTO api_credentials (id, api_name, credentials, encrypted)
     VALUES ($1, $2, $3::jsonb, TRUE)
     ON CONFLICT (api_name) DO UPDATE SET
       credentials = EXCLUDED.credentials,
       encrypted = TRUE,
       updated_at = NOW()`,
    [id, apiName, toSave]
  );
  return { success: true };
}

async function initDatabase() {
  if (!pool) {
    console.warn('[DB] DATABASE_URL absent — initialisation PostgreSQL ignorée');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS absences (
        id TEXT PRIMARY KEY,
        employe_id TEXT NOT NULL,
        employe_nom TEXT,
        type TEXT NOT NULL,
        date_debut DATE NOT NULL,
        date_fin DATE NOT NULL,
        motif TEXT,
        statut TEXT DEFAULT 'EN_ATTENTE',
        validateur_id TEXT,
        validateur_nom TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS acomptes (
        id TEXT PRIMARY KEY,
        employe_id TEXT NOT NULL,
        employe_nom TEXT,
        statut TEXT DEFAULT 'En attente',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        destinataire_id TEXT NOT NULL,
        destinataire_nom TEXT,
        type TEXT NOT NULL,
        titre TEXT,
        message TEXT,
        lue BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        employe_id TEXT NOT NULL,
        categorie TEXT,
        statut TEXT,
        original_name TEXT,
        filename TEXT,
        mime_type TEXT,
        date_expiration DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS grilles_tarifaires (
        id TEXT PRIMARY KEY,
        chargeur TEXT NOT NULL,
        societe TEXT NOT NULL,
        date_debut DATE NOT NULL,
        date_fin DATE,
        prix_pdl_livre NUMERIC(10,4) DEFAULT 0,
        prix_colis_livre NUMERIC(10,4) DEFAULT 0,
        prix_pdl_collecte NUMERIC(10,4) DEFAULT 0,
        prix_colis_collecte NUMERIC(10,4) DEFAULT 0,
        branding_type TEXT DEFAULT 'aucun',
        branding_montant NUMERIC(10,4) DEFAULT 0,
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS groupes_tournees_tarif (
        id TEXT PRIMARY KEY,
        grille_id TEXT REFERENCES grilles_tarifaires(id),
        nom_groupe TEXT NOT NULL,
        tournees TEXT[],
        prix_pdl_livre NUMERIC(10,4) DEFAULT 0,
        prix_colis_livre NUMERIC(10,4) DEFAULT 0,
        prix_pdl_collecte NUMERIC(10,4) DEFAULT 0,
        prix_colis_collecte NUMERIC(10,4) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS forfaits_exceptionnels (
        id TEXT PRIMARY KEY,
        chargeur TEXT NOT NULL,
        societe TEXT NOT NULL,
        description TEXT NOT NULL,
        montant NUMERIC(10,4) NOT NULL,
        date_debut DATE NOT NULL,
        date_fin DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS couts_mensuels (
        id TEXT PRIMARY KEY,
        mois TEXT NOT NULL,
        societe TEXT NOT NULL,
        chargeur TEXT,
        jours_travailles INTEGER DEFAULT 0,
        carburant NUMERIC(10,2) DEFAULT 0,
        salaires NUMERIC(10,2) DEFAULT 0,
        leasing NUMERIC(10,2) DEFAULT 0,
        peages NUMERIC(10,2) DEFAULT 0,
        entretien NUMERIC(10,2) DEFAULT 0,
        charges_fixes NUMERIC(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      ALTER TABLE couts_mensuels
      ADD COLUMN IF NOT EXISTS jours_travailles INTEGER DEFAULT 0;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ca_cibles (
        id TEXT PRIMARY KEY,
        chargeur TEXT NOT NULL,
        societe TEXT NOT NULL,
        mois TEXT NOT NULL,
        ca_cible_par_tournee NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        data JSONB
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nom TEXT NOT NULL,
        prenom TEXT,
        role TEXT NOT NULL DEFAULT 'EMPLOYE',
        salesforce_id TEXT,
        societe TEXT,
        manager_id TEXT,
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        autorise BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(utilisateur_id, module, action)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS rapprochements_manuels (
        id TEXT PRIMARY KEY,
        wex_transaction_id TEXT NOT NULL,
        sf_transaction_id TEXT,
        statut TEXT NOT NULL DEFAULT 'non_integre',
        decision TEXT NOT NULL,
        decide_par TEXT,
        decide_le TIMESTAMP DEFAULT NOW(),
        wex_data JSONB,
        sf_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rapprochements_wex_id
      ON rapprochements_manuels(wex_transaction_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_credentials (
        id TEXT PRIMARY KEY,
        api_name TEXT UNIQUE NOT NULL,
        credentials JSONB NOT NULL DEFAULT '{}',
        encrypted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log(
      '[DB] Base de données initialisée (absences, acomptes, notifications, documents, grilles_tarifaires, groupes_tournees_tarif, forfaits_exceptionnels, couts_mensuels, ca_cibles, utilisateurs, permissions, rapprochements_manuels, api_credentials, webfleet_*)'
    );
  } finally {
    client.release();
  }
}

const utilisateurDb = require('./utilisateurDb');

async function saveRapprochementManuel({
  wexTransactionId,
  sfTransactionId,
  statut,
  decision,
  decidePar,
  wexData,
  sfData,
}) {
  if (!pool) throw new Error('DB non disponible');
  const id = 'RAPR_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  await pool.query(
    `INSERT INTO rapprochements_manuels
     (id, wex_transaction_id, sf_transaction_id, statut, decision, decide_par, wex_data, sf_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     ON CONFLICT (wex_transaction_id) DO UPDATE SET
       sf_transaction_id = EXCLUDED.sf_transaction_id,
       statut = EXCLUDED.statut,
       decision = EXCLUDED.decision,
       decide_par = EXCLUDED.decide_par,
       wex_data = EXCLUDED.wex_data,
       sf_data = EXCLUDED.sf_data,
       decide_le = NOW()`,
    [
      id,
      wexTransactionId,
      sfTransactionId || null,
      statut,
      decision,
      decidePar || null,
      JSON.stringify(wexData || {}),
      JSON.stringify(sfData || {}),
    ]
  );
  return { success: true };
}

async function getRapprochementManuel(wexTransactionId) {
  if (!pool) return null;
  const result = await pool.query(
    'SELECT * FROM rapprochements_manuels WHERE wex_transaction_id = $1',
    [wexTransactionId]
  );
  return result.rows[0] || null;
}

async function getRapprochementsStats() {
  if (!pool) return {};
  const result = await pool.query(
    `SELECT decision, COUNT(*) as count
     FROM rapprochements_manuels
     GROUP BY decision`
  );
  return result.rows.reduce(
    (acc, r) => ({ ...acc, [r.decision]: parseInt(r.count, 10) }),
    {}
  );
}

module.exports = {
  pool,
  initDatabase,
  saveRapprochementManuel,
  getRapprochementManuel,
  getRapprochementsStats,
  getApiCredentials,
  getAllApiCredentials,
  saveApiCredentials,
  ...utilisateurDb,
};
