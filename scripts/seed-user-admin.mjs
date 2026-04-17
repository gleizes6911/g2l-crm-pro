/**
 * Crée ou met à jour un compte dans la table legacy `utilisateurs` (auth Express / Login.jsx).
 *
 * Le mot de passe n’est jamais stocké dans le dépôt : passez votre ancien mot de passe via l’environnement.
 *
 * Usage :
 *   SEED_ADMIN_PASSWORD='votreMotDePasse' npm run seed:user
 *
 * Optionnel :
 *   SEED_USER_EMAIL=ggleizes@groupeg2l.fr (défaut ci-dessous)
 */
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: true });

const EMAIL = process.env.SEED_USER_EMAIL || "ggleizes@groupeg2l.fr";
const ROLE = process.env.SEED_USER_ROLE || "ADMIN";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const USER_ID = process.env.SEED_USER_ID || "USER_GGLEIZES_G2L";

async function main() {
  if (!PASSWORD) {
    console.error(
      "[seed:user] Définissez SEED_ADMIN_PASSWORD avec le même mot de passe que sur l’ancienne plateforme."
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[seed:user] DATABASE_URL manquant.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const password_hash = await bcrypt.hash(PASSWORD, 10);

  const nom = process.env.SEED_USER_NOM || "Gleizes";
  const prenom = process.env.SEED_USER_PRENOM || "Guillaume";

  const sql = `
    INSERT INTO utilisateurs (id, email, password_hash, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, TRUE, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      nom = EXCLUDED.nom,
      prenom = EXCLUDED.prenom,
      actif = TRUE,
      updated_at = NOW();
  `;

  try {
    await pool.query(sql, [USER_ID, EMAIL, password_hash, nom, prenom, ROLE]);
    console.log(`[seed:user] OK — compte « ${EMAIL} » (rôle ${ROLE}) créé ou mis à jour.`);
  } catch (e) {
    console.error("[seed:user] Erreur SQL :", e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
