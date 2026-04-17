const crypto = require('crypto');

function getPool() {
  return require('./database').pool;
}

function mapRowToPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    nom: row.nom,
    prenom: row.prenom || '',
    role: row.role,
    salesforceId: row.salesforce_id || '',
    societe: row.societe || '',
    managerId: row.manager_id || '',
    actif: row.actif !== false,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

function withNomComplet(u) {
  if (!u) return null;
  return {
    ...u,
    nomComplet: `${u.prenom || ''} ${u.nom || ''}`.trim() || u.nom || u.email,
  };
}

async function getUtilisateurByEmailDB(email) {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at
     FROM utilisateurs WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  const row = rows[0];
  if (!row) return null;
  const base = mapRowToPublicUser(row);
  return { ...base, password_hash: row.password_hash };
}

async function getUtilisateurByIdDB(id) {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, email, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at
     FROM utilisateurs WHERE id = $1`,
    [id]
  );
  return withNomComplet(mapRowToPublicUser(rows[0]));
}

async function getUtilisateursDB() {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT id, email, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at
     FROM utilisateurs ORDER BY nom, email`
  );
  return rows.map((r) => withNomComplet(mapRowToPublicUser(r)));
}

async function createUtilisateurDB(payload) {
  const pool = getPool();
  if (!pool) throw new Error('Base de données indisponible');
  const id =
    payload.id ||
    `USER_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const {
    email,
    password_hash,
    nom,
    prenom = '',
    role = 'EMPLOYE',
    salesforce_id = '',
    societe = '',
    manager_id = '',
    actif = true,
  } = payload;

  await pool.query(
    `INSERT INTO utilisateurs (id, email, password_hash, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [id, email, password_hash, nom, prenom, role, salesforce_id || null, societe || null, manager_id || null, actif]
  );
  return getUtilisateurByIdDB(id);
}

async function updateUtilisateurDB(id, fields) {
  const pool = getPool();
  if (!pool) throw new Error('Base de données indisponible');

  const sets = [];
  const vals = [];
  let i = 1;

  const add = (col, val) => {
    if (val === undefined) return;
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };

  add('email', fields.email);
  add('nom', fields.nom);
  add('prenom', fields.prenom);
  add('role', fields.role);
  if (fields.salesforceId !== undefined) add('salesforce_id', fields.salesforceId || null);
  if (fields.societe !== undefined) add('societe', fields.societe || null);
  if (fields.managerId !== undefined) add('manager_id', fields.managerId || null);
  if (fields.actif !== undefined) add('actif', fields.actif);
  if (fields.password_hash !== undefined) add('password_hash', fields.password_hash);

  if (sets.length === 0) {
    return getUtilisateurByIdDB(id);
  }

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  const { rowCount } = await pool.query(
    `UPDATE utilisateurs SET ${sets.join(', ')} WHERE id = $${i}`,
    vals
  );
  if (rowCount === 0) throw new Error('Utilisateur introuvable');
  return getUtilisateurByIdDB(id);
}

async function deleteUtilisateurDB(id) {
  const pool = getPool();
  if (!pool) throw new Error('Base de données indisponible');
  const { rowCount } = await pool.query('DELETE FROM utilisateurs WHERE id = $1', [id]);
  if (rowCount === 0) throw new Error('Utilisateur introuvable');
}

async function toggleActifDB(id) {
  const pool = getPool();
  if (!pool) throw new Error('Base de données indisponible');
  const { rows } = await pool.query(
    `UPDATE utilisateurs
     SET actif = NOT COALESCE(actif, TRUE), updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at`,
    [id]
  );
  if (!rows[0]) throw new Error('Utilisateur introuvable');
  return withNomComplet(mapRowToPublicUser(rows[0]));
}

async function getPermissionsDB(utilisateurId) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT module, action, autorise FROM permissions WHERE utilisateur_id = $1 ORDER BY module, action`,
    [utilisateurId]
  );
  return rows.map((r) => ({
    module: r.module,
    action: r.action,
    autorise: r.autorise === true,
  }));
}

async function setPermissionDB(utilisateurId, module, action, autorise) {
  const pool = getPool();
  if (!pool) throw new Error('Base de données indisponible');
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO permissions (id, utilisateur_id, module, action, autorise, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (utilisateur_id, module, action)
     DO UPDATE SET autorise = EXCLUDED.autorise, updated_at = NOW()`,
    [id, utilisateurId, module, action, !!autorise]
  );
  return getPermissionsDB(utilisateurId);
}

async function countUtilisateursDB() {
  const pool = getPool();
  if (!pool) return 0;
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM utilisateurs');
  return rows[0].c;
}

module.exports = {
  getUtilisateurByEmailDB,
  getUtilisateurByIdDB,
  getUtilisateursDB,
  createUtilisateurDB,
  updateUtilisateurDB,
  deleteUtilisateurDB,
  toggleActifDB,
  getPermissionsDB,
  setPermissionDB,
  countUtilisateursDB,
};
