-- Module FEC — sociétés, exercices, écritures (Railway / PostgreSQL)

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
  -- Hash MD5 (32 hex) calculé côté Node.js (pas de colonne GENERATED : MD5 n’est pas IMMUTABLE en PG)
  hash_ecriture VARCHAR(32),
  UNIQUE(societe_id, hash_ecriture)
);

CREATE INDEX IF NOT EXISTS idx_fec_ecritures_societe ON fec_ecritures(societe_id);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_date ON fec_ecritures(ecriture_date);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_compte ON fec_ecritures(compte_num);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_journal ON fec_ecritures(journal_code);
CREATE INDEX IF NOT EXISTS idx_fec_ecritures_exercice ON fec_ecritures(exercice_id);
