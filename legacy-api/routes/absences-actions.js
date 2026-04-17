const router = require('express').Router();
const absenceService = require('../services/absenceService');
const employeService = require('../services/employeService');
const notificationService = require('../services/notificationService');
const authServiceDB = require('../services/authServiceDB');

router.post('/absences/:id/valider', async (req, res) => {
  try {
    console.log('[API] POST /api/absences/:id/valider');

    const { validateurId, validateurNom, validateurRole } = req.body;

    if (validateurRole === 'RH') {
      return res.status(403).json({
        error: 'Les RH ne peuvent pas valider les absences. Seuls les managers peuvent le faire.'
      });
    }

    const absencesValider = await absenceService.getAbsences();
    const absence = absencesValider.find((a) => a.id === req.params.id);
    if (!absence) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }

    if (!(await authServiceDB.peutValiderAbsence(validateurId, absence.employeId))) {
      return res.status(403).json({ error: 'Permission refusée. Seuls les managers peuvent valider les absences.' });
    }

    const absenceValidee = await absenceService.validerAbsence(req.params.id, validateurId, validateurNom);

    const supprimees = await notificationService.supprimerNotificationsDemande(req.params.id);
    console.log('[API] Notifications de demande supprimées:', supprimees ? 'Oui' : 'Non');

    const employesData = await employeService.getEmployes();
    const employe = employesData.employes.find((e) => e.id === absenceValidee.employeId);

    if (employe) {
      const notificationsValidation = await notificationService.notifierValidationAbsence(
        absenceValidee,
        employe,
        validateurId,
        validateurNom,
        null
      );
      console.log('[API] Notifications de validation créées:', notificationsValidation.length);

      const notificationManager = notificationsValidation.find(
        (n) => String(n.destinataireId) === String(validateurId)
      );
      if (notificationManager) {
        await notificationService.marquerCommeLue(notificationManager.id);
        console.log('[API] Notification du manager automatiquement marquée comme lue:', notificationManager.id);
      }

      const rhUsers = (await authServiceDB.getAllUtilisateurs()).filter((u) => u.role === 'RH');

      for (const rhUser of rhUsers) {
        await notificationService.notifierValidationAbsence(
          absenceValidee,
          employe,
          validateurId,
          validateurNom,
          rhUser.id
        );
      }

      console.log('[API] Notifications envoyées à', rhUsers.length, 'utilisateurs RH');
    }

    res.json(absenceValidee);
  } catch (error) {
    console.error('[API] Erreur validation:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/absences/:id/refuser', async (req, res) => {
  try {
    console.log('[API] POST /api/absences/:id/refuser');
    console.log('[API] Absence ID à refuser:', req.params.id);
    console.log('[API] Body:', req.body);

    const { validateurId, validateurNom, validateurRole, motifRefus } = req.body;

    if (validateurRole === 'RH') {
      return res.status(403).json({
        error: 'Les RH ne peuvent pas refuser les absences. Seuls les managers peuvent le faire.'
      });
    }

    const absence = await absenceService.refuserAbsence(req.params.id, validateurId, validateurNom, motifRefus);

    if (!absence) {
      console.error('[API] Absence non trouvée avec ID:', req.params.id);
      return res.status(404).json({ error: 'Absence non trouvée' });
    }

    console.log('[API] Absence refusée:', absence.id, 'statut:', absence.statut);
    console.log('[API] validateurId:', validateurId, 'validateurNom:', validateurNom);

    console.log('══════════════════════════════════════════════════════');
    console.log('[API] ⚠️ ÉTAPE 1: Suppression notifications DEMANDE_ABSENCE');
    console.log('[API] Appel supprimerNotificationsDemande avec absenceId:', req.params.id);
    const supprimees = await notificationService.supprimerNotificationsDemande(req.params.id);
    console.log('[API] Notifications de demande supprimées:', supprimees ? 'Oui' : 'Non');
    console.log('══════════════════════════════════════════════════════');

    console.log('[API] ⚠️ ÉTAPE 2: Recherche employé avec ID:', absence.employeId);
    const employesData = await employeService.getEmployes();
    const employe = employesData.employes.find((e) => e.id === absence.employeId);

    if (employe) {
      console.log('[API] Employé trouvé:', employe.nomComplet);
      console.log('══════════════════════════════════════════════════════');
      console.log('[API] ⚠️ ÉTAPE 3: Création notifications de refus');
      console.log('[API] Appel notifierRefusAbsence avec managerId:', validateurId);
      const notificationsRefus = await notificationService.notifierRefusAbsence(
        absence,
        employe,
        validateurId,
        validateurNom,
        motifRefus
      );
      console.log('[API] Notifications de refus créées:', notificationsRefus.length);
      console.log(
        '[API] Détail notifications créées:',
        notificationsRefus.map((n) => ({ type: n.type, destinataireId: n.destinataireId, titre: n.titre }))
      );

      const notificationManager = notificationsRefus.find((n) => String(n.destinataireId) === String(validateurId));
      if (notificationManager) {
        await notificationService.marquerCommeLue(notificationManager.id);
        console.log('[API] Notification du manager automatiquement marquée comme lue:', notificationManager.id);
      }

      console.log('══════════════════════════════════════════════════════');
    } else {
      console.error('[API] ❌ ERREUR: Employé non trouvé pour absence:', absence.employeId);
      console.error('[API] IDs disponibles:', employesData.employes?.slice(0, 5).map((e) => e.id));
    }

    res.json(absence);
  } catch (error) {
    console.error('[API] Erreur refus:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
