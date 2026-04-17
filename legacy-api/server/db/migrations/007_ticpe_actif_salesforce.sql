ALTER TABLE ticpe_vehicules_eligibles
ADD COLUMN IF NOT EXISTS actif_salesforce BOOLEAN DEFAULT true;
