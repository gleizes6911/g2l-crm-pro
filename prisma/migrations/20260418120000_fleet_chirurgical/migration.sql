-- Alignement chirurgical : colonnes, ENUM, index nommés, TICPE en centimes

DO $$ BEGIN
  CREATE TYPE "StatutRapprochement" AS ENUM (
    'NON_RAPPROCHE',
    'RAPPROCHE_EN_COURS',
    'RAPPROCHE',
    'ECART'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ticpe_taux" RENAME COLUMN "taux_par_litre" TO "taux_cents";

ALTER TABLE "g2l_transactions_carburant"
  ADD COLUMN "prix_litre_ttc" DECIMAL(6,4),
  ADD COLUMN "statut_rapprochement" "StatutRapprochement" NOT NULL DEFAULT 'NON_RAPPROCHE';

ALTER TABLE "g2l_transactions_carburant"
  ALTER COLUMN "volume_litres" TYPE DECIMAL(8,3),
  ALTER COLUMN "consommation_estimee_litres" TYPE DECIMAL(8,3);

DROP INDEX IF EXISTS "g2l_transactions_carburant_date_transaction_idx";
DROP INDEX IF EXISTS "g2l_transactions_carburant_immatriculation_idx";

CREATE INDEX "idx_carburant_date" ON "g2l_transactions_carburant" ("date_transaction", "type_carburant");
CREATE INDEX "idx_transactions_immat" ON "g2l_transactions_carburant" ("immatriculation");

CREATE INDEX "idx_g2l_vehicules_immat" ON "g2l_vehicules" ("immatriculation");
