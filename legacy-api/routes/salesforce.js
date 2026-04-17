const router = require('express').Router();
const DataProcessor = require('../services/dataProcessor');
const SalesforceService = require('../services/salesforceService');
const NlpService = require('../services/nlpService');

router.post('/salesforce/connect', async (req, res) => {
  try {
    const { environment } = req.body;

    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    req.sfService = sfService;

    res.json({
      success: true,
      message: `Connecté à Salesforce ${environment}`
    });
  } catch (error) {
    console.error('Erreur de connexion Salesforce:', error);
    res.status(500).json({
      error: 'Erreur de connexion à Salesforce',
      message: error.message
    });
  }
});

router.post('/salesforce/analyze', async (req, res) => {
  try {
    const { environment } = req.body;

    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    const data = await sfService.getAllData();

    const results = DataProcessor.process(data);

    sfService.disconnect();

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error("Erreur lors de l'analyse Salesforce:", error);
    res.status(500).json({
      error: "Erreur lors de l'analyse des données Salesforce",
      message: error.message
    });
  }
});

router.post('/salesforce/ask', async (req, res) => {
  try {
    const { environment = 'sandbox', question } = req.body;

    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Merci de fournir une question en texte' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    const data = await sfService.getAllData();
    const results = DataProcessor.process(data);

    const dateIso = NlpService.extractDateIso(question);
    const tourneeCode = NlpService.extractTourneeCode(question);
    const immat = NlpService.extractImmat(question);
    if (dateIso || tourneeCode) {
      const filtered = await sfService.getAffectationsFiltered(dateIso, tourneeCode);
      if (filtered && filtered.length) {
        results.affectations = filtered;
      }
    }
    if (immat) {
      const assureFromImmat = await sfService.getAssurancesByImmat(immat);
      if (assureFromImmat.length) {
        results.assurances = assureFromImmat;
      } else if (results.assurances) {
        results.assurances = results.assurances.filter((a) =>
          (a.vehicule || '').toLowerCase().includes(immat.toLowerCase())
        );
      }
    }
    sfService.disconnect();

    const answer = NlpService.answer(question, results);

    res.json({
      success: true,
      answer
    });
  } catch (error) {
    console.error('Erreur /api/salesforce/ask:', error);
    res.status(500).json({
      error: 'Erreur lors de la réponse à la question',
      message: error.message
    });
  }
});

router.get('/stats/utilisation', (req, res) => {
  res.json({
    message: 'Utilisez /api/salesforce/analyze pour obtenir les statistiques'
  });
});

module.exports = router;
