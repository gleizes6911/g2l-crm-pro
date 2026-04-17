const router = require('express').Router();
const { getApiCredentials } = require('../services/database');
const graphMailService = require('../services/graphMailService');
const savService = require('../services/savService');

function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().slice(0, maxLength).replace(/[<>"'`;]/g, '');
}

router.post('/sav/report-email', async (req, res) => {
  try {
    const { to, subject, message, fileName, pdfBase64 } = req.body || {};
    if (!to || !pdfBase64) {
      return res.status(400).json({ error: "Champs requis: 'to' et 'pdfBase64'." });
    }

    const dbCreds = (await getApiCredentials('microsoft_graph')) || {};
    const tenantId = dbCreds.tenantId || process.env.MS_GRAPH_TENANT_ID;
    const clientId = dbCreds.clientId || process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = dbCreds.clientSecret || process.env.MS_GRAPH_CLIENT_SECRET;
    const fromEmail = dbCreds.fromEmail || process.env.MS_GRAPH_FROM_EMAIL;

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Microsoft Graph non configuré. Renseignez les credentials dans Admin → Connexions API.'
      });
    }

    const safeFileName = fileName || `SAV_SuiviStatistiques_${new Date().toISOString().slice(0, 10)}.pdf`;

    await graphMailService.sendMail({
      tenantId,
      clientId,
      clientSecret,
      fromEmail,
      to,
      subject: subject || 'Rapport SAV - Suivi statistiques',
      body: `
        <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #2563EB; border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">G2L Platform</h1>
          </div>
          <div style="background: white; border: 1px solid #E4E7EE; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
            <h2 style="color: #0F1729; font-size: 16px; margin-bottom: 12px;">📊 Rapport SAV — Suivi Statistiques</h2>
            <p style="color: #6B7280; font-size: 14px;">${message || 'Veuillez trouver ci-joint le rapport SAV.'}</p>
            <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">
              Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
            </p>
          </div>
          <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin-top: 16px;">
            G2L Platform · Groupe G2L — Perpignan
          </p>
        </div>
      `,
      attachments: [
        {
          filename: safeFileName,
          content: pdfBase64,
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('[API SAV] Erreur envoi email rapport:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/sav/picklist', async (req, res) => {
  try {
    const picklists = await savService.getPicklistValues();
    res.json(picklists);
  } catch (error) {
    console.error('[API SAV] Erreur picklist:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/sav/chauffeurs', async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('[API SAV] Erreur chauffeurs:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/sav/cases', async (req, res) => {
  try {
    const dateDebut = sanitizeString(req.query.dateDebut, 10);
    const dateFin = sanitizeString(req.query.dateFin, 10);
    const statut = sanitizeString(req.query.statut);
    const type = sanitizeString(req.query.type);
    const motif = sanitizeString(req.query.motif);
    const chauffeur = sanitizeString(req.query.chauffeur);
    const chargeur = sanitizeString(req.query.chargeur);
    const issue = sanitizeString(req.query.issue);
    const montantMin = sanitizeString(req.query.montantMin, 20);
    const montantMax = sanitizeString(req.query.montantMax, 20);
    const factureRef = sanitizeString(req.query.factureRef);
    const dateFilterType = sanitizeString(req.query.dateFilterType);

    if (factureRef) {
      const filters = { factureRef };
      const cases = await savService.getCases(null, null, filters);
      const stats = savService.calculateStats(cases);
      return res.json({ cases, stats });
    }

    const filters = {
      statut: statut || 'all',
      type: type || 'all',
      motif: motif || 'all',
      chauffeur: chauffeur || 'all',
      chargeur: chargeur || 'all',
      issue: issue || 'all',
      dateFilterType: dateFilterType === 'integration' ? 'integration' : 'livraison'
    };

    const cases = await savService.getCases(dateDebut, dateFin, filters);

    let filteredCases = cases;

    if (montantMin) {
      filteredCases = filteredCases.filter((c) => (c.IO_MontantLitige__c || 0) >= parseFloat(montantMin));
    }
    if (montantMax) {
      filteredCases = filteredCases.filter((c) => (c.IO_MontantLitige__c || 0) <= parseFloat(montantMax));
    }

    const colisData = await savService.getColisLivresParChauffeur(dateDebut, dateFin, chargeur);

    const stats = savService.calculateStats(filteredCases, colisData);

    res.json({
      cases: filteredCases,
      stats: stats
    });
  } catch (error) {
    console.error('[API SAV] Erreur récupération cases:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
