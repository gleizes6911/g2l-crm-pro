-- Taux TICPE par année et type de carburant
CREATE TABLE IF NOT EXISTS ticpe_taux (
  id            SERIAL PRIMARY KEY,
  annee         INT NOT NULL,
  carburant     VARCHAR(50) NOT NULL,
  taux_cents    DECIMAL(8,4) NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(annee, carburant)
);

-- Véhicules éligibles TICPE (sélection manuelle)
CREATE TABLE IF NOT EXISTS ticpe_vehicules_eligibles (
  id                     SERIAL PRIMARY KEY,
  vehicule_sf_id         VARCHAR(20) NOT NULL UNIQUE,
  immatriculation        VARCHAR(20) NOT NULL,
  filiale                VARCHAR(100),
  type_vehicule          VARCHAR(50),
  eligible               BOOLEAN DEFAULT true,
  date_debut_eligibilite DATE,
  date_fin_eligibilite   DATE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Déclarations TICPE
CREATE TABLE IF NOT EXISTS ticpe_declarations (
  id                   SERIAL PRIMARY KEY,
  reference            VARCHAR(50) UNIQUE NOT NULL,
  periode_debut        DATE NOT NULL,
  periode_fin          DATE NOT NULL,
  periodicite          VARCHAR(20) NOT NULL,
  filiale              VARCHAR(100),
  statut               VARCHAR(20) DEFAULT 'brouillon',
  total_litres         DECIMAL(12,3),
  total_remboursement  DECIMAL(12,2),
  taux_applique        DECIMAL(8,4),
  nb_transactions      INT,
  nb_vehicules         INT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Données initiales taux TICPE (PL > 7,5T gazole)
INSERT INTO ticpe_taux (annee, carburant, taux_cents, description) VALUES
  (2022, 'gazole', 15.25, 'Taux remboursement TICPE PL > 7,5T 2022'),
  (2023, 'gazole', 15.25, 'Taux remboursement TICPE PL > 7,5T 2023'),
  (2024, 'gazole', 18.82, 'Taux remboursement TICPE PL > 7,5T 2024'),
  (2025, 'gazole', 18.82, 'Taux remboursement TICPE PL > 7,5T 2025 (à confirmer)')
ON CONFLICT (annee, carburant) DO UPDATE SET
  taux_cents = EXCLUDED.taux_cents,
  description = EXCLUDED.description;
