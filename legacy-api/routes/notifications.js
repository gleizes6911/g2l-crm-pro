const router = require('express').Router();
const notificationService = require('../services/notificationService');
const authServiceDB = require('../services/authServiceDB');

router.get('/notifications/:userId/count', async (req, res) => {
  try {
    console.log('[API] GET /api/notifications/:userId/count');

    const user = await authServiceDB.getUserById(req.params.userId);
    const salesforceId = user?.salesforceId;
    const userRole = user?.role;

    const count = await notificationService.compterNonLues(req.params.userId, salesforceId, userRole);
    res.json({ count });
  } catch (error) {
    console.error('[API] Erreur count:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/notifications/:userId', async (req, res) => {
  try {
    console.log('[API] GET /api/notifications/:userId');
    console.log('[API] userId demandé:', req.params.userId);

    const user = await authServiceDB.getUserById(req.params.userId);
    const salesforceId = user?.salesforceId;

    const notifications = await notificationService.getNotificationsByUser(req.params.userId, salesforceId);

    console.log('[API] Notifications trouvées:', notifications.length);
    console.log(
      '[API] Types de notifications:',
      notifications.map((n) => ({ type: n.type, destinataireId: n.destinataireId, titre: n.titre }))
    );
    res.json(notifications);
  } catch (error) {
    console.error('[API] Erreur notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/notifications/:id/lire', async (req, res) => {
  try {
    console.log('[API] PUT /api/notifications/:id/lire');
    const notification = await notificationService.marquerCommeLue(req.params.id);
    if (notification) {
      res.json(notification);
    } else {
      res.status(404).json({ error: 'Notification non trouvée' });
    }
  } catch (error) {
    console.error('[API] Erreur marquer lue:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/notifications/:userId/lire-tout', async (req, res) => {
  try {
    console.log('[API] PUT /api/notifications/:userId/lire-tout');

    const user = await authServiceDB.getUserById(req.params.userId);
    const salesforceId = user?.salesforceId;

    await notificationService.marquerToutCommeLu(req.params.userId, salesforceId);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Erreur marquer tout lu:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    console.log('[API] DELETE /api/notifications/:id');
    const success = await notificationService.supprimerNotification(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Notification non trouvée' });
    }
  } catch (error) {
    console.error('[API] Erreur suppression notification:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
