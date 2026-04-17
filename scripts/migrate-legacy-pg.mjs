/**
 * Copie les données métier depuis l’ancienne base PostgreSQL (mon-premier-projet)
 * vers la base du CRM (DATABASE_URL), sans toucher aux tables Prisma `User`, `Company`, `AuditLog`.
 *
 * Prérequis : deux instances PostgreSQL accessibles (souvent la même machine, port 5432).
 *
 * Usage :
 *   LEGACY_DATABASE_URL="postgresql://user@localhost:5432/guillaumegleizes" \
 *   node scripts/migrate-legacy-pg.mjs
 *
 * LEGACY_DATABASE_URL peut être omis si vous utilisez la valeur par défaut ci-dessous.
 */
import { config } from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: true });

const DEFAULT_LEGACY =
  process.env.LEGACY_DATABASE_URL ||
  "postgresql://guillaumegleizes@127.0.0.1:5432/guillaumegleizes";

const BATCH = 800;

function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "(url invalide)";
  }
}

async function fetchAll(src, sql, params = []) {
  const { rows } = await src.query(sql, params);
  return rows;
}

async function insertBatch(dst, table, columns, rows) {
  if (!rows.length) return 0;
  const colList = columns.map((c) => `"${c}"`).join(", ");
  let paramIndex = 1;
  const placeholders = rows
    .map(() => {
      const chunk = columns.map(() => `$${paramIndex++}`);
      return `(${chunk.join(", ")})`;
    })
    .join(", ");
  const flat = rows.flatMap((r) => columns.map((c) => r[c]));
  await dst.query(`INSERT INTO "${table}" (${colList}) VALUES ${placeholders}`, flat);
  return rows.length;
}

async function copyInBatches(dst, table, columns, rows) {
  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    n += await insertBatch(dst, table, columns, chunk);
  }
  return n;
}

async function main() {
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) {
    console.error("[migrate-legacy] DATABASE_URL manquant.");
    process.exit(1);
  }

  const src = new pg.Pool({ connectionString: DEFAULT_LEGACY });
  const dst = new pg.Pool({ connectionString: targetUrl });

  console.log("[migrate-legacy] Source :", maskUrl(DEFAULT_LEGACY));
  console.log("[migrate-legacy] Cible  :", maskUrl(targetUrl));

  const client = await dst.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      TRUNCATE TABLE
        fec_ecritures,
        fec_exercices,
        g2l_contrats_emploi,
        g2l_personnes,
        g2l_societes,
        g2l_parametres_comptables,
        fec_societes,
        utilisateurs
      RESTART IDENTITY CASCADE
    `);

    const fecSoc = await fetchAll(
      src,
      `SELECT id, siren, nom, couleur, created_at, updated_at FROM fec_societes ORDER BY id`
    );
    await copyInBatches(client, "fec_societes", ["id", "siren", "nom", "couleur", "created_at", "updated_at"], fecSoc);
    if (fecSoc.length) {
      await client.query(`SELECT setval(pg_get_serial_sequence('fec_societes','id'), (SELECT MAX(id) FROM fec_societes))`);
    }
    console.log("[migrate-legacy] fec_societes :", fecSoc.length);

    const fecEx = await fetchAll(
      src,
      `SELECT id, societe_id, annee, date_debut, date_fin, nb_ecritures, nom_fichier, created_at
       FROM fec_exercices ORDER BY id`
    );
    await copyInBatches(client, "fec_exercices", ["id", "societe_id", "annee", "date_debut", "date_fin", "nb_ecritures", "nom_fichier", "created_at"], fecEx);
    if (fecEx.length) {
      await client.query(`SELECT setval(pg_get_serial_sequence('fec_exercices','id'), (SELECT MAX(id) FROM fec_exercices))`);
    }
    console.log("[migrate-legacy] fec_exercices :", fecEx.length);

    const fecEc = await fetchAll(
      src,
      `SELECT id, exercice_id, societe_id, journal_code, journal_lib, ecriture_num, ecriture_date,
              compte_num, compte_lib, comp_aux_num, comp_aux_lib, piece_ref, piece_date, ecriture_lib,
              debit, credit, ecriture_let, date_let, valid_date, montant_devise, idevise, date_rglt,
              mode_rglt, nat_op, id_client, hash_ecriture
       FROM fec_ecritures ORDER BY id`
    );
    await copyInBatches(client, "fec_ecritures", [
      "id", "exercice_id", "societe_id", "journal_code", "journal_lib", "ecriture_num", "ecriture_date",
      "compte_num", "compte_lib", "comp_aux_num", "comp_aux_lib", "piece_ref", "piece_date", "ecriture_lib",
      "debit", "credit", "ecriture_let", "date_let", "valid_date", "montant_devise", "idevise", "date_rglt",
      "mode_rglt", "nat_op", "id_client", "hash_ecriture",
    ], fecEc);
    if (fecEc.length) {
      await client.query(`SELECT setval(pg_get_serial_sequence('fec_ecritures','id'), (SELECT MAX(id) FROM fec_ecritures))`);
    }
    console.log("[migrate-legacy] fec_ecritures :", fecEc.length);

    const g2lSoc = await fetchAll(
      src,
      `SELECT id, code, nom, nom_court, siren, type, fec_societe_id, patterns_sf, compte_fec_achat,
              contact_nom, contact_email, contact_tel, id_salesforce, actif, date_debut, date_fin, notes,
              created_at, updated_at
       FROM g2l_societes ORDER BY code`
    );
    for (const r of g2lSoc) {
      if (r.patterns_sf == null) r.patterns_sf = [];
      else if (typeof r.patterns_sf === "string") {
        try {
          r.patterns_sf = JSON.parse(r.patterns_sf);
        } catch {
          r.patterns_sf = [];
        }
      }
    }
    /* jsonb + gros batch : certains drivers plantent sur « invalid input syntax for type json » — insertion unitaire. */
    for (const r of g2lSoc) {
      await client.query(
        `INSERT INTO g2l_societes (
          id, code, nom, nom_court, siren, type, fec_societe_id, patterns_sf, compte_fec_achat,
          contact_nom, contact_email, contact_tel, id_salesforce, actif, date_debut, date_fin, notes,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          r.id,
          r.code,
          r.nom,
          r.nom_court,
          r.siren,
          r.type,
          r.fec_societe_id,
          JSON.stringify(r.patterns_sf ?? []),
          r.compte_fec_achat,
          r.contact_nom,
          r.contact_email,
          r.contact_tel,
          r.id_salesforce,
          r.actif,
          r.date_debut,
          r.date_fin,
          r.notes,
          r.created_at,
          r.updated_at,
        ]
      );
    }
    console.log("[migrate-legacy] g2l_societes :", g2lSoc.length);

    const params = await fetchAll(
      src,
      `SELECT id, categorie, comptes_fec, description, inclus_consolid, actif, created_at, updated_at
       FROM g2l_parametres_comptables ORDER BY categorie`
    );
    for (const r of params) {
      if (r.comptes_fec != null && typeof r.comptes_fec === "string") {
        try {
          r.comptes_fec = JSON.parse(r.comptes_fec);
        } catch {
          r.comptes_fec = {};
        }
      }
    }
    for (const r of params) {
      await client.query(
        `INSERT INTO g2l_parametres_comptables (
          id, categorie, comptes_fec, description, inclus_consolid, actif, created_at, updated_at
        ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8)`,
        [
          r.id,
          r.categorie,
          JSON.stringify(r.comptes_fec ?? {}),
          r.description,
          r.inclus_consolid,
          r.actif,
          r.created_at,
          r.updated_at,
        ]
      );
    }
    console.log("[migrate-legacy] g2l_parametres_comptables :", params.length);

    const pers = await fetchAll(
      src,
      `SELECT id, nom, prenom, date_naissance, email, telephone, mobile,
              adresse_rue, adresse_cp, adresse_ville, type_personne, id_salesforce, id_webfleet,
              source_creation, actif, notes, created_at, updated_at,
              TRIM(prenom || ' ' || nom) AS nom_complet
       FROM g2l_personnes ORDER BY nom, prenom`
    );
    await copyInBatches(client, "g2l_personnes", [
      "id", "nom", "prenom", "nom_complet", "date_naissance", "email", "telephone", "mobile",
      "adresse_rue", "adresse_cp", "adresse_ville", "type_personne", "id_salesforce", "id_webfleet",
      "source_creation", "actif", "notes", "created_at", "updated_at",
    ], pers);
    console.log("[migrate-legacy] g2l_personnes :", pers.length);

    const contrats = await fetchAll(
      src,
      `SELECT id, personne_id, societe_id, type_contrat, poste, service, salaire_brut_mensuel,
              date_debut, date_fin, actif, notes, created_at, updated_at
       FROM g2l_contrats_emploi ORDER BY id`
    );
    await copyInBatches(client, "g2l_contrats_emploi", [
      "id", "personne_id", "societe_id", "type_contrat", "poste", "service", "salaire_brut_mensuel",
      "date_debut", "date_fin", "actif", "notes", "created_at", "updated_at",
    ], contrats);
    console.log("[migrate-legacy] g2l_contrats_emploi :", contrats.length);

    const users = await fetchAll(
      src,
      `SELECT id, email, password_hash, nom, prenom, role, salesforce_id, societe, manager_id, actif, created_at, updated_at
       FROM utilisateurs ORDER BY email`
    );
    await copyInBatches(client, "utilisateurs", [
      "id", "email", "password_hash", "nom", "prenom", "role", "salesforce_id", "societe", "manager_id", "actif", "created_at", "updated_at",
    ], users);
    console.log("[migrate-legacy] utilisateurs :", users.length);

    await client.query("COMMIT");
    console.log("[migrate-legacy] Terminé avec succès.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[migrate-legacy] Erreur :", e.message);
    process.exitCode = 1;
    throw e;
  } finally {
    client.release();
    await src.end();
    await dst.end();
  }
}

main().catch(() => process.exit(1));
