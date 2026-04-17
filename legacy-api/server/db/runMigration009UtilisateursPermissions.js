/**
 * Applique server/db/migrations/009_utilisateurs_permissions.sql
 * Usage (depuis la racine du projet) : node server/db/runMigration009UtilisateursPermissions.js
 */
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const sqlPath = path.join(__dirname, 'migrations', '009_utilisateurs_permissions.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL manquant (.env à la racine du projet).');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('Migration utilisateurs / permissions OK');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
