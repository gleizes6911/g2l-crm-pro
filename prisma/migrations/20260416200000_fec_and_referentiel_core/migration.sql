-- Source : mon-premier-projet/server/db/migrations/008_fec.sql + extrait migrations/001_referentiel_base.sql
-- (sans g2l_vehicules / g2l_transactions_carburant : schéma déjà géré par Prisma flotte)

-- Module FEC
CREATE TABLE IF NOT EXISTS fec_societes (
  id SERIAL PRIMARY KEY,
  siren VARCHAR(9),
  nom VARCHAR(255) NOT NULL,
  couleur VARCHAR(7) DEFAULT '#2563eb',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(siren)
);

CREATE TABLE IF NOT EXISTS fec_exercices (
  id SERIAL PRIMARY KEY,
  societe_id INTEGER NOT NULL REFERENCES fec_societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nb_ecritures INTEGER DEFAULT 0,
  nom_fichier VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(societe_id, annee, date_debut, date_fin)
);

CREATE TABLE IF NOT EXISTS fec_ecritures (
  id SERIAL PRIMARY KEY,
  exercice_id INTEGER NOT NULL REFERENCES fec_exercices(id) ON DELETE CASCADE,
  societe_id INTEGER NOT NULL REFERENCES fec_societes(id) ON DELETE CASCADE,
  journal_code VARCHAR(10),
  journal_lib VARCHAR(100),
  ecriture_num VARCHAR(50),
  ecriture_date DATE,
  compte_num VARCHAR(20),
  compte_lib VARCHAR(255),
  comp_aux_num VARCHAR(50),
  comp_aux_lib VARCHAR(255),
  piece_ref VARCHAR(100),
  piece_date DATE,
  ecriture_lib VARCHAR(500),
  debit DECIMAL(15,2) DEFAULT 0,
  credit DECIMAL(15,2) DEFAULT 0,
  ecriture_let VARCHAR(10),
  date_let DATE,
  valid_date DATE,
  montant_devise DECIMAL(15,2),
  idevise VARCHAR(10),
  date_rglt DATE,
  mode_rglt VARCHAR(20),
  nat_op VARCHAR(50),
  id_client VARCHAR(50),
  hash_ecriture VARCHAR(32),
  UNIQUE(societe_id, hash_ecriture)
);

CREATE INDEX IF NOT EXISTS idx_fec_ecritures_societe ON fec_ecritures(societe_id);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_date ON fec_ecritures(ecriture_date);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_compte ON fec_ecritures(compte_num);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_journal ON fec_ecritures(journal_code);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_exercice ON fec_ecritures(exercice_id);

-- Référentiel (personnes / sociétés métier)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS g2l_societes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(20) UNIQUE NOT NULL,
  nom             VARCHAR(200) NOT NULL,
  nom_court       VARCHAR(50),
  siren           VARCHAR(14),
  type            VARCHAR(30) NOT NULL
                  CHECK (type IN (
                    'HOLDING', 'FILIALE', 'STANDALONE',
                    'PRESTATAIRE_LIVRAISON', 'SOUS_TRAITANT', 'AUTRE'
                  )),
  fec_societe_id  INTEGER REFERENCES fec_societes(id),
  patterns_sf     JSONB DEFAULT '[]',
  compte_fec_achat VARCHAR(20),
  contact_nom     VARCHAR(200),
  contact_email   VARCHAR(200),
  contact_tel     VARCHAR(20),
  id_salesforce   VARCHAR(50),
  actif           BOOLEAN DEFAULT true,
  date_debut      DATE,
  date_fin        DATE,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_g2l_societes_type ON g2l_societes(type);
CREATE INDEX IF NOT EXISTS idx_g2l_societes_actif ON g2l_societes(actif);
CREATE INDEX IF NOT EXISTS idx_g2l_societes_sf ON g2l_societes(id_salesforce);

CREATE TABLE IF NOT EXISTS g2l_personnes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom             VARCHAR(100) NOT NULL,
  prenom          VARCHAR(100) NOT NULL,
  nom_complet     VARCHAR(200) GENERATED ALWAYS AS
                  (prenom || ' ' || nom) STORED,
  date_naissance  DATE,
  email           VARCHAR(200),
  telephone       VARCHAR(20),
  mobile          VARCHAR(20),
  adresse_rue     VARCHAR(200),
  adresse_cp      VARCHAR(10),
  adresse_ville   VARCHAR(100),
  type_personne   VARCHAR(30) NOT NULL
                  CHECK (type_personne IN (
                    'SALARIE', 'CHAUFFEUR_PRESTATAIRE',
                    'GERANT', 'DIRIGEANT_PARTENAIRE'
                  )),
  id_salesforce   VARCHAR(50),
  id_webfleet     VARCHAR(100),
  source_creation VARCHAR(20) DEFAULT 'MANUEL'
                  CHECK (source_creation IN (
                    'SALESFORCE', 'MANUEL', 'IMPORT'
                  )),
  actif           BOOLEAN DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_g2l_personnes_sf ON g2l_personnes(id_salesforce);
CREATE INDEX IF NOT EXISTS idx_g2l_personnes_nom ON g2l_personnes(nom, prenom);
CREATE INDEX IF NOT EXISTS idx_g2l_personnes_type ON g2l_personnes(type_personne);

CREATE TABLE IF NOT EXISTS g2l_contrats_emploi (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  personne_id           UUID NOT NULL REFERENCES g2l_personnes(id),
  societe_id            UUID NOT NULL REFERENCES g2l_societes(id),
  type_contrat          VARCHAR(20) NOT NULL
                        CHECK (type_contrat IN (
                          'CDI', 'CDD', 'INTERIM',
                          'APPRENTISSAGE', 'PRESTATAIRE'
                        )),
  poste                 VARCHAR(100),
  service               VARCHAR(100),
  salaire_brut_mensuel  DECIMAL(10,2),
  date_debut            DATE NOT NULL,
  date_fin              DATE,
  actif                 BOOLEAN DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_g2l_contrat_actif_par_societe
  ON g2l_contrats_emploi (personne_id, societe_id)
  WHERE date_fin IS NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_emploi_personne ON g2l_contrats_emploi(personne_id);
CREATE INDEX IF NOT EXISTS idx_contrats_emploi_societe ON g2l_contrats_emploi(societe_id);
CREATE INDEX IF NOT EXISTS idx_contrats_emploi_actif ON g2l_contrats_emploi(actif);

CREATE TABLE IF NOT EXISTS g2l_parametres_comptables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  categorie       VARCHAR(50) NOT NULL UNIQUE
                  CHECK (categorie IN (
                    'CA', 'MASSE_SALARIALE', 'CARBURANT',
                    'LOYERS_FLOTTE', 'ASSURANCES',
                    'SOUS_TRAITANCE', 'ENTRETIEN',
                    'FRAIS_GENERAUX', 'AMORTISSEMENTS'
                  )),
  comptes_fec     JSONB NOT NULL,
  description     VARCHAR(200),
  inclus_consolid BOOLEAN DEFAULT true,
  actif           BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Données initiales FEC (liens DJ/TPS)
INSERT INTO fec_societes (siren, nom, couleur) VALUES
('749909685', 'TPS TSMC EXPRESS', '#2563eb'),
('794531137', 'D&J TRANSPORT', '#2563eb')
ON CONFLICT (siren) DO NOTHING;

INSERT INTO g2l_societes (code, nom, nom_court, siren, type, fec_societe_id)
VALUES
('G2L', 'HOLDING G2L', 'G2L', NULL, 'HOLDING', NULL),
(
  'DJ',
  'D&J TRANSPORT',
  'D&J',
  '794531137',
  'FILIALE',
  (SELECT id FROM fec_societes WHERE siren = '794531137' LIMIT 1)
),
(
  'TPS',
  'TPS TSMC EXPRESS',
  'TPS',
  '749909685',
  'FILIALE',
  (SELECT id FROM fec_societes WHERE siren = '749909685' LIMIT 1)
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO g2l_societes (code, nom, nom_court, type, patterns_sf, compte_fec_achat)
VALUES
('GLOBAL_DRIVE', 'GLOBAL DRIVE E-SERVICES', 'GLOBAL DRIVE',
 'PRESTATAIRE_LIVRAISON',
 '["GDS64", "GDS66", "GLOBAL DRIVE"]'::jsonb,
 '622800'),
('STEP', 'STEP LIVRAISON', 'STEP',
 'PRESTATAIRE_LIVRAISON',
 '["step64", "step66", "STEP64", "STEP66"]'::jsonb,
 '622800'),
('NEXHAUL', 'NEXHAUL', 'NEXHAUL',
 'PRESTATAIRE_LIVRAISON',
 '["NEXHAUL", "ADELL", "CORENTIN ADELL", "BAPTISTE CLEMENT"]'::jsonb,
 '604001')
ON CONFLICT (code) DO NOTHING;

INSERT INTO g2l_parametres_comptables (categorie, comptes_fec, description)
VALUES
('CA',
 '["706700","706701","706702","706703","706704","706705","706706","706707","706708","706709","706710","706711","706712","706713","706714","706715"]'::jsonb,
 'Chiffre d affaires prestations transport'),
('MASSE_SALARIALE',
 '["641100","641400","645100","645217","645220","645230","645300","645310","645320","631200","633300"]'::jsonb,
 'Masse salariale charges comprises'),
('CARBURANT',
 '["606100","606200","606900"]'::jsonb,
 'Carburant et lubrifiants'),
('LOYERS_FLOTTE',
 '["612100","612200","612800"]'::jsonb,
 'Loyers et crédits-bails véhicules'),
('ASSURANCES',
 '["616100","616200","616800"]'::jsonb,
 'Primes d assurance'),
('SOUS_TRAITANCE',
 '["604001","622800"]'::jsonb,
 'Sous-traitance et prestations externes'),
('ENTRETIEN',
 '["615100","615200","615800"]'::jsonb,
 'Entretien et réparations véhicules')
ON CONFLICT (categorie) DO NOTHING;
