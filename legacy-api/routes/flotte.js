const router = require('express').Router();
const gestionParcService = require('../services/gestionParcService');
const SalesforceService = require('../services/salesforceService');

router.get('/flotte/assurances', async (req, res) => {
  try {
    const { q, environment = 'production' } = req.query;
    
    console.log('[API Flotte] GET /api/flotte/assurances');
    console.log('[API Flotte] Query:', q);
    console.log('[API Flotte] Environment:', environment);
    
    if (!q || q.trim().length < 2) {
      return res.json({ results: [] });
    }
    
    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }
    
    const sfService = new SalesforceService(environment);
    await sfService.connect();
    
    const results = await sfService.searchAssurancesByImmat(q.trim());
    
    sfService.disconnect();
    
    console.log('[API Flotte] Résultats trouvés:', results.length);
    
    res.json({ results });
  } catch (error) {
    console.error('[API Flotte] Erreur recherche véhicules:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la recherche de véhicules',
      message: error.message
    });
  }
});

// Route pour récupérer les détails complets d'un véhicule par son immatriculation
router.get('/flotte/vehicules/:immatriculation', async (req, res) => {
  try {
    const { immatriculation } = req.params;
    const { environment = 'production' } = req.query;
    
    console.log('[API Flotte] GET /api/flotte/vehicules/:immatriculation');
    console.log('[API Flotte] Immatriculation:', immatriculation);
    console.log('[API Flotte] Environment:', environment);
    
    if (!immatriculation) {
      return res.status(400).json({ error: 'Immatriculation requise' });
    }
    
    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }
    
    const sfService = new SalesforceService(environment);
    await sfService.connect();
    
    const details = await sfService.getVehiculeDetails(immatriculation);
    
    sfService.disconnect();
    
    if (!details) {
      return res.status(404).json({ error: 'Véhicule non trouvé' });
    }
    
    console.log('[API Flotte] Détails récupérés pour:', details.immatriculation);
    
    res.json(details);
  } catch (error) {
    console.error('[API Flotte] Erreur récupération détails véhicule:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de la récupération des détails du véhicule',
      message: error.message
    });
  }
});

router.get('/parc/ordres-reparation', (req, res) => {
  try {
    const { statut, type, priorite, vehiculeId, mecanicienId, dateDebut, dateFin } = req.query;
    const ordres = gestionParcService.getOrdresReparation({
      statut,
      type,
      priorite,
      vehiculeId,
      mecanicienId,
      dateDebut,
      dateFin
    });
    res.json(ordres);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/parc/ordres-reparation/:id', (req, res) => {
  try {
    const ordre = gestionParcService.getOrdreReparationById(req.params.id);
    if (!ordre) {
      return res.status(404).json({ error: 'Ordre de réparation non trouvé' });
    }
    res.json(ordre);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/parc/ordres-reparation', (req, res) => {
  try {
    const ordre = gestionParcService.createOrdreReparation(req.body);
    res.status(201).json(ordre);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/parc/ordres-reparation/:id', (req, res) => {
  try {
    const ordre = gestionParcService.updateOrdreReparation(req.params.id, req.body);
    if (!ordre) {
      return res.status(404).json({ error: 'Ordre de réparation non trouvé' });
    }
    res.json(ordre);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/parc/ordres-reparation/:id/statut', (req, res) => {
  try {
    const { statut, notes } = req.body;
    const ordre = gestionParcService.changerStatutOR(req.params.id, statut, notes);
    if (!ordre) {
      return res.status(404).json({ error: 'Ordre de réparation non trouvé' });
    }
    res.json(ordre);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/parc/ordres-reparation/:id/pieces', (req, res) => {
  try {
    const ordre = gestionParcService.ajouterPieceOR(req.params.id, req.body);
    if (!ordre) {
      return res.status(404).json({ error: 'Ordre de réparation non trouvé' });
    }
    res.json(ordre);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/parc/ordres-reparation/:id/main-oeuvre', (req, res) => {
  try {
    const ordre = gestionParcService.ajouterMainOeuvreOR(req.params.id, req.body);
    if (!ordre) {
      return res.status(404).json({ error: 'Ordre de réparation non trouvé' });
    }
    res.json(ordre);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROUTES STOCK
// ==========================================

router.get('/parc/stock', (req, res) => {
  try {
    const { categorie, alerteStock, recherche } = req.query;
    const stock = gestionParcService.getStock({
      categorie,
      alerteStock: alerteStock === 'true',
      recherche
    });
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/parc/stock/alertes', (req, res) => {
  try {
    const alertes = gestionParcService.getAlertesStock();
    res.json(alertes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/parc/stock/:id', (req, res) => {
  try {
    const article = gestionParcService.getArticleStock(req.params.id);
    if (!article) {
      return res.status(404).json({ error: 'Article non trouvé' });
    }
    res.json(article);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/parc/stock', (req, res) => {
  try {
    const article = gestionParcService.ajouterArticleStock(req.body);
    res.status(201).json(article);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/parc/stock/:id/mouvement', (req, res) => {
  try {
    const { type, quantite, motif, reference, utilisateurId } = req.body;
    const result = gestionParcService.mouvementStock(
      req.params.id,
      type,
      quantite,
      motif,
      reference,
      utilisateurId
    );
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROUTES FOURNISSEURS
// ==========================================

router.get('/parc/fournisseurs', (req, res) => {
  try {
    const { type } = req.query;
    const fournisseurs = gestionParcService.getFournisseurs(type);
    res.json(fournisseurs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/parc/fournisseurs', (req, res) => {
  try {
    const fournisseur = gestionParcService.ajouterFournisseur(req.body);
    res.status(201).json(fournisseur);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROUTES MÉCANICIENS ET PLANNING
// ==========================================

router.get('/parc/mecaniciens', (req, res) => {
  try {
    const { type } = req.query;
    const mecaniciens = gestionParcService.getMecaniciens(type);
    res.json(mecaniciens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/parc/planning', (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;
    const planning = gestionParcService.getPlanningGarage(dateDebut, dateFin);
    res.json(planning);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROUTES STATISTIQUES
// ==========================================

router.get('/parc/statistiques', (req, res) => {
  try {
    const stats = gestionParcService.getStatistiquesParc();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/parc/constantes', (req, res) => {
  try {
    res.json({
      categoriesStock: gestionParcService.CATEGORIES_STOCK,
      statutsOR: gestionParcService.STATUTS_OR,
      priorites: gestionParcService.PRIORITES,
      naturesIntervention: gestionParcService.NATURES_INTERVENTION
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route pour récupérer les véhicules actifs depuis Salesforce
router.get('/parc/vehicules', async (req, res) => {
  try {
    const { environment = 'production' } = req.query;
    
    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    // Requête SOQL pour récupérer les véhicules depuis Vehicule_Flotte__c
    // L'immatriculation est dans le champ Name
    const soql = `
      SELECT 
        Id, 
        Name
      FROM Vehicule_Flotte__c
      WHERE Name != null
      ORDER BY Name ASC
    `;

    console.log('[API PARC] Récupération véhicules depuis Salesforce');
    console.log('[API PARC] SOQL:', soql);
    
    const result = await sfService.conn.query(soql);
    const results = result.records || [];

    const vehicules = results.map(v => ({
      id: v.Id,
      immatriculation: v.Name,
      nom: v.Name,
      modele: '',
      marque: '',
      type: '',
      statut: ''
    }));

    console.log(`[API PARC] ${vehicules.length} véhicules trouvés`);
    
    sfService.disconnect();
    res.json(vehicules);
  } catch (error) {
    console.error('[API PARC] Erreur récupération véhicules:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
