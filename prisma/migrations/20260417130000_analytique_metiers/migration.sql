-- Module analyse financière par métier (référentiel + affectations FEC)

CREATE TABLE "analytique_metiers" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "couleur" VARCHAR(7) DEFAULT '#2563eb',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytique_metiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytique_categories" (
    "id" TEXT NOT NULL,
    "metier_id" TEXT NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytique_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytique_affectations" (
    "id" TEXT NOT NULL,
    "societe_id" INTEGER,
    "compte_num" VARCHAR(20) NOT NULL,
    "metier_id" TEXT NOT NULL,
    "categorie_id" TEXT,
    "pourcentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytique_affectations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytique_metiers_code_key" ON "analytique_metiers"("code");

CREATE INDEX "analytique_categories_metier_id_idx" ON "analytique_categories"("metier_id");

CREATE INDEX "analytique_affectations_compte_num_idx" ON "analytique_affectations"("compte_num");

CREATE INDEX "analytique_affectations_metier_id_idx" ON "analytique_affectations"("metier_id");

CREATE INDEX "analytique_affectations_societe_id_compte_num_idx" ON "analytique_affectations"("societe_id", "compte_num");

ALTER TABLE "analytique_categories" ADD CONSTRAINT "analytique_categories_metier_id_fkey" FOREIGN KEY ("metier_id") REFERENCES "analytique_metiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytique_affectations" ADD CONSTRAINT "analytique_affectations_metier_id_fkey" FOREIGN KEY ("metier_id") REFERENCES "analytique_metiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analytique_affectations" ADD CONSTRAINT "analytique_affectations_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "analytique_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
