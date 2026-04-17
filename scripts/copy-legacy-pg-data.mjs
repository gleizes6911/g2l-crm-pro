/**
 * L’ancien projet (mon-premier-projet) n’utilise pas SQLite : les données sont dans PostgreSQL
 * (`DATABASE_URL` dans l’ancien `.env`, souvent une base du type `guillaumegleizes`).
 *
 * Pour copier FEC, sociétés référentiel, paramètres comptables et comptes `utilisateurs` vers le CRM :
 *
 *   npm run db:migrate-legacy
 *
 * Variables :
 *   - `DATABASE_URL` : base cible (ex. `g2l_crm` du CRM).
 *   - `LEGACY_DATABASE_URL` (optionnel) : base source ; défaut :
 *     `postgresql://guillaumegleizes@127.0.0.1:5432/guillaumegleizes`
 *
 * Collaborateurs (liste RH / dashboard ~111) : l’API `/api/employes` interroge Salesforce
 * (`legacy-api/services/employeService.js`), pas la table `g2l_personnes`. Les deux bases
 * avaient `g2l_personnes` vide : il n’y avait rien à « transférer » côté employés en SQL.
 * Pour revoir les ~111 collaborateurs sur le dashboard, copiez les variables
 * `SALESFORCE_PROD_USERNAME`, `SALESFORCE_PROD_PASSWORD`, `SALESFORCE_PROD_SECURITY_TOKEN`,
 * `SALESFORCE_PROD_LOGIN_URL` depuis l’ancien `.env` vers `.env.local` du CRM, puis relancez l’API (3001).
 */
console.log(`[copy-legacy-pg-data] Utilisez : npm run db:migrate-legacy (voir commentaires dans ce fichier).`);
