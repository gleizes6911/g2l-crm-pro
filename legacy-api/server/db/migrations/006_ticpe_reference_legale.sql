ALTER TABLE ticpe_taux ADD COLUMN IF NOT EXISTS reference_legale TEXT;

UPDATE ticpe_taux SET reference_legale = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045179898'
WHERE annee = 2022 AND carburant = 'gazole' AND reference_legale IS NULL;

UPDATE ticpe_taux SET reference_legale = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046859269'
WHERE annee = 2023 AND carburant = 'gazole' AND reference_legale IS NULL;

UPDATE ticpe_taux SET reference_legale = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048950626'
WHERE annee = 2024 AND carburant = 'gazole' AND reference_legale IS NULL;
