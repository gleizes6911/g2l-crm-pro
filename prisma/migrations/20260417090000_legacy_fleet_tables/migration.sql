-- Tables legacy flotte / carburant / Webfleet (alignement snake_case)

CREATE TABLE "g2l_vehicules" (
    "id" TEXT NOT NULL,
    "salesforce_id" TEXT,
    "immatriculation" TEXT,
    "nom" TEXT,
    "energie" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "g2l_vehicules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "g2l_vehicules_salesforce_id_key" ON "g2l_vehicules"("salesforce_id");
CREATE UNIQUE INDEX "g2l_vehicules_immatriculation_key" ON "g2l_vehicules"("immatriculation");

CREATE TABLE "g2l_cartes_carburant" (
    "id" TEXT NOT NULL,
    "salesforce_id" TEXT,
    "numero_carte" TEXT NOT NULL,
    "fournisseur" TEXT,
    "vehicule_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "g2l_cartes_carburant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "g2l_cartes_carburant_salesforce_id_key" ON "g2l_cartes_carburant"("salesforce_id");
CREATE UNIQUE INDEX "g2l_cartes_carburant_numero_carte_key" ON "g2l_cartes_carburant"("numero_carte");
CREATE INDEX "g2l_cartes_carburant_vehicule_id_idx" ON "g2l_cartes_carburant"("vehicule_id");

ALTER TABLE "g2l_cartes_carburant" ADD CONSTRAINT "g2l_cartes_carburant_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "g2l_vehicules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ticpe_taux" (
    "id" TEXT NOT NULL,
    "carburant_code" TEXT NOT NULL,
    "region_code" TEXT,
    "taux_par_litre" DECIMAL(10,4) NOT NULL,
    "date_debut" TIMESTAMP(3) NOT NULL,
    "date_fin" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticpe_taux_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticpe_taux_carburant_code_date_debut_date_fin_idx" ON "ticpe_taux"("carburant_code", "date_debut", "date_fin");

CREATE TABLE "g2l_transactions_carburant" (
    "id" TEXT NOT NULL,
    "salesforce_id" TEXT,
    "external_transaction_id" TEXT,
    "fournisseur" TEXT NOT NULL DEFAULT 'WEX',
    "date_transaction" TIMESTAMP(3) NOT NULL,
    "type_carburant" TEXT,
    "volume_litres" DECIMAL(12,3),
    "montant_ttc" DECIMAL(12,2) NOT NULL,
    "montant_ht" DECIMAL(12,2),
    "montant_tva" DECIMAL(12,2),
    "montant_tva_recuperable" DECIMAL(12,2),
    "montant_ticpe" DECIMAL(12,2),
    "consommation_estimee_litres" DECIMAL(12,3),
    "immatriculation" TEXT,
    "vehicule_id" TEXT,
    "carte_carburant_id" TEXT,
    "ticpe_taux_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "g2l_transactions_carburant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "g2l_transactions_carburant_salesforce_id_key" ON "g2l_transactions_carburant"("salesforce_id");
CREATE UNIQUE INDEX "g2l_transactions_carburant_external_transaction_id_key" ON "g2l_transactions_carburant"("external_transaction_id");
CREATE INDEX "g2l_transactions_carburant_vehicule_id_idx" ON "g2l_transactions_carburant"("vehicule_id");
CREATE INDEX "g2l_transactions_carburant_carte_carburant_id_idx" ON "g2l_transactions_carburant"("carte_carburant_id");
CREATE INDEX "g2l_transactions_carburant_ticpe_taux_id_idx" ON "g2l_transactions_carburant"("ticpe_taux_id");
CREATE INDEX "g2l_transactions_carburant_date_transaction_idx" ON "g2l_transactions_carburant"("date_transaction");
CREATE INDEX "g2l_transactions_carburant_immatriculation_idx" ON "g2l_transactions_carburant"("immatriculation");

ALTER TABLE "g2l_transactions_carburant" ADD CONSTRAINT "g2l_transactions_carburant_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "g2l_vehicules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "g2l_transactions_carburant" ADD CONSTRAINT "g2l_transactions_carburant_carte_carburant_id_fkey" FOREIGN KEY ("carte_carburant_id") REFERENCES "g2l_cartes_carburant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "g2l_transactions_carburant" ADD CONSTRAINT "g2l_transactions_carburant_ticpe_taux_id_fkey" FOREIGN KEY ("ticpe_taux_id") REFERENCES "ticpe_taux"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "webfleet_trips" (
    "id" TEXT NOT NULL,
    "external_trip_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webfleet_trips_pkey" PRIMARY KEY ("id")
);
