const express = require('express');
const rentabiliteService = require('../services/rentabiliteService');
const SalesforceService = require('../services/salesforceService');

const router = express.Router();

function handleError(res, err, status = 500) {
  // eslint-disable-next-line no-console
  console.error('[RENTABILITE]', err?.message || err);
  res.status(status).json({ success: false, error: err?.message || String(err) });
}

/** GET /api/rentabilite/tournees?chargeur=&societe= — IO_Tournee__c (Salesforce production) */
router.get('/tournees', async (req, res) => {
  const chargeur = req.query.chargeur != null ? String(req.query.chargeur).trim() : '';
  const societe = req.query.societe != null ? String(req.query.societe).trim() : '';
  const sfService = new SalesforceService('production');
  try {
    await sfService.connect();
    const records = await sfService.getTourneesIORentabilite({ chargeur, societe });
    const rows = records.map((r) => ({
      code: r.Name != null ? String(r.Name) : '',
      libelle: r.IO_Libelle__c != null ? String(r.IO_Libelle__c) : '',
      chargeur: r.IO_FxChargeurName__c != null ? String(r.IO_FxChargeurName__c) : '',
    }));
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  } finally {
    sfService.disconnect();
  }
});

/** GET /api/rentabilite/grilles?chargeur=&societe= */
router.get('/grilles', async (req, res) => {
  try {
    const { chargeur, societe } = req.query;
    const list = await rentabiliteService.getGrilles({
      chargeur: chargeur != null ? String(chargeur) : undefined,
      societe: societe != null ? String(societe) : undefined,
    });
    res.json(list);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/grilles — body = payload grille (upsert par id) */
router.post('/grilles', async (req, res) => {
  try {
    const saved = await rentabiliteService.saveGrille(req.body || {});
    res.json(saved);
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/rentabilite/grilles/:id/groupes */
router.get('/grilles/:id/groupes', async (req, res) => {
  try {
    const list = await rentabiliteService.getGroupesTournees(req.params.id);
    res.json(list);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/grilles/:id/groupes — body fusionné avec grilleId depuis l’URL */
router.post('/grilles/:id/groupes', async (req, res) => {
  try {
    const payload = { ...(req.body || {}), grilleId: req.params.id };
    const saved = await rentabiliteService.saveGroupeTournees(payload);
    res.json(saved);
  } catch (err) {
    handleError(res, err);
  }
});

/** DELETE /api/rentabilite/grilles/:id */
router.delete('/grilles/:id', async (req, res) => {
  try {
    const ok = await rentabiliteService.deleteGrille(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Grille introuvable' });
    }
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/** DELETE /api/rentabilite/groupes/:id */
router.delete('/groupes/:id', async (req, res) => {
  try {
    const ok = await rentabiliteService.deleteGroupeTournees(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Groupe introuvable' });
    }
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/rentabilite/forfaits?chargeur=&societe=&dateDebut=&dateFin= */
router.get('/forfaits', async (req, res) => {
  try {
    const { chargeur, societe, dateDebut, dateFin } = req.query;
    const list = await rentabiliteService.getForfaits({
      chargeur: chargeur != null ? String(chargeur) : undefined,
      societe: societe != null ? String(societe) : undefined,
      dateDebut: dateDebut != null ? String(dateDebut) : undefined,
      dateFin: dateFin != null ? String(dateFin) : undefined,
    });
    res.json(list);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/forfaits */
router.post('/forfaits', async (req, res) => {
  try {
    const saved = await rentabiliteService.saveForfait(req.body || {});
    res.json(saved);
  } catch (err) {
    handleError(res, err);
  }
});

/** DELETE /api/rentabilite/forfaits/:id */
router.delete('/forfaits/:id', async (req, res) => {
  try {
    const ok = await rentabiliteService.deleteForfait(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Forfait introuvable' });
    }
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/rentabilite/calcul?dateDebut=&dateFin=&societe=&environment= */
router.get('/calcul', async (req, res) => {
  try {
    const { dateDebut, dateFin, societe, environment } = req.query;
    if (!dateDebut || !dateFin) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres dateDebut et dateFin requis (YYYY-MM-DD)',
      });
    }
    const result = await rentabiliteService.calculerCA(
      String(dateDebut),
      String(dateFin),
      societe != null && String(societe).trim() !== '' ? String(societe) : null,
      environment != null && String(environment).trim() !== '' ? String(environment) : 'production'
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/rentabilite/couts?mois=&societe=&chargeur= */
router.get('/couts', async (req, res) => {
  try {
    const { mois, societe, chargeur } = req.query;
    const list = await rentabiliteService.getCoutsMensuels({
      mois: mois != null ? String(mois) : undefined,
      societe: societe != null ? String(societe) : undefined,
      chargeur: chargeur != null ? String(chargeur) : undefined,
    });
    res.json(list);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/couts */
router.post('/couts', async (req, res) => {
  try {
    const saved = await rentabiliteService.saveCoutsMensuels(req.body || {});
    res.json(saved);
  } catch (err) {
    handleError(res, err);
  }
});

/** PUT /api/rentabilite/couts/:id */
router.put('/couts/:id', async (req, res) => {
  try {
    const updated = await rentabiliteService.updateCoutsMensuels(req.params.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Coût introuvable' });
    }
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
});

/** DELETE /api/rentabilite/couts/:id */
router.delete('/couts/:id', async (req, res) => {
  try {
    const ok = await rentabiliteService.deleteCoutsMensuels(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Coût introuvable' });
    }
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/couts/:id/cloner */
router.post('/couts/:id/cloner', async (req, res) => {
  try {
    const moisDestination =
      req.body?.moisDestination != null ? String(req.body.moisDestination) : '';
    const ecraser = req.body?.ecraser === true;
    const out = await rentabiliteService.clonerCoutsMensuels(
      req.params.id,
      moisDestination,
      ecraser
    );
    res.json(out);
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/rentabilite/ca-cibles */
router.get('/ca-cibles', async (req, res) => {
  try {
    const { chargeur, societe, mois, annee } = req.query;
    const list = await rentabiliteService.getCaCibles({
      chargeur: chargeur != null ? String(chargeur) : undefined,
      societe: societe != null ? String(societe) : undefined,
      mois: mois != null ? String(mois) : undefined,
      annee: annee != null ? String(annee) : undefined,
    });
    res.json(list);
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/ca-cibles */
router.post('/ca-cibles', async (req, res) => {
  try {
    const saved = await rentabiliteService.saveCaCible(req.body || {});
    res.json(saved);
  } catch (err) {
    handleError(res, err);
  }
});

/** DELETE /api/rentabilite/ca-cibles/:id */
router.delete('/ca-cibles/:id', async (req, res) => {
  try {
    const ok = await rentabiliteService.deleteCaCible(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'CA cible introuvable' });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/rentabilite/ca-cibles/:id/cloner */
router.post('/ca-cibles/:id/cloner', async (req, res) => {
  try {
    const moisDestination = req.body?.moisDestination != null ? String(req.body.moisDestination) : '';
    const ecraser = req.body?.ecraser === true;
    const out = await rentabiliteService.clonerCaCible(req.params.id, moisDestination, ecraser);
    res.json(out);
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/rentabilite/marge?dateDebut=&dateFin=&societe=&environment= */
router.get('/marge', async (req, res) => {
  try {
    const { dateDebut, dateFin, societe, environment } = req.query;
    if (!dateDebut || !dateFin) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres dateDebut et dateFin requis (YYYY-MM-DD)',
      });
    }
    const result = await rentabiliteService.calculerMarge(
      String(dateDebut),
      String(dateFin),
      societe != null && String(societe).trim() !== '' ? String(societe) : null,
      environment != null && String(environment).trim() !== '' ? String(environment) : 'production'
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

/** Purge du cache mémoire des tournées actives (exposé pour appel direct depuis server.js au démarrage). */
async function purgeCacheTournees() {
  rentabiliteService.clearTourneesActivesCache();
}

/** DELETE /api/rentabilite/cache-tournees */
router.delete('/cache-tournees', async (_req, res) => {
  try {
    await purgeCacheTournees();
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
module.exports.purgeCacheTournees = purgeCacheTournees;
