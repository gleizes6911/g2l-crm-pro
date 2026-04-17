/**
 * Crée / met à jour l’admin :
 * - table Prisma `User` (champs passwordHash, metadata — pas de `name` dans le schéma)
 * - table legacy `utilisateurs` (utilisée par le login /api/auth/login)
 *
 * Mot de passe : variable SEED_ADMIN_PASSWORD (recommandé) ou valeur par défaut provisoire.
 */
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local", override: true });

const { PrismaClient } = require("./src/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const EMAIL = "ggleizes@groupeg2l.fr";
const ROLE = "ADMIN";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "G2L-Temp-ChangeMe-2026!";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      passwordHash,
      role: ROLE,
      metadata: { name: "Guillaume Gleizes" },
    },
    create: {
      email: EMAIL,
      passwordHash,
      role: ROLE,
      metadata: { name: "Guillaume Gleizes" },
    },
  });
  console.log('Utilisateur Admin créé avec succès ! (table Prisma "User")');

  await pool.query(
    `
    INSERT INTO utilisateurs (id, email, password_hash, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, TRUE, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      nom = EXCLUDED.nom,
      prenom = EXCLUDED.prenom,
      actif = TRUE,
      updated_at = NOW();
    `,
    [USER_LEGACY_ID, EMAIL, passwordHash, "Gleizes", "Guillaume", ROLE]
  );
  console.log("Compte legacy « utilisateurs » mis à jour (login web).");

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      "[!] SEED_ADMIN_PASSWORD non défini — mot de passe temporaire utilisé. Changez-le après connexion."
    );
  }
}

const USER_LEGACY_ID = "USER_GGLEIZES_G2L";

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
