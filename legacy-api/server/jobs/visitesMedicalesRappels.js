const authService = require('../../services/authService');
const documentService = require('../../services/documentService');
const employeService = require('../../services/employeService');
const notificationService = require('../../services/notificationService');

async function verifierRappelsVisitesMedicales() {
  try {
    const allUsers = await authService.getAllUtilisateurs();
    const documents = await documentService.getDocuments();
    const visitesMedicales = documents.filter(
      (d) => d.categorie === 'VISITE_MEDICALE' && d.statut === 'Validé' && d.dateExpiration
    );

    const maintenant = new Date();
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);

    for (const visite of visitesMedicales) {
      const dateVisite = new Date(visite.dateExpiration);
      dateVisite.setHours(0, 0, 0, 0);

      const joursRestants = Math.ceil((dateVisite - aujourdhui) / (1000 * 60 * 60 * 24));

      if ([7, 2, 1, 0].includes(joursRestants)) {
        const employesData = await employeService.getEmployes();
        const employe = employesData.employes.find((e) => e.id === visite.employeId);

        if (employe) {
          const heureVisite = visite.heureVisite || visite.description?.match(/à (\d{2}:\d{2})/)?.[1] || '09:00';
          const [heures, minutes] = heureVisite.split(':');
          const dateHeureVisite = new Date(visite.dateExpiration);
          dateHeureVisite.setHours(parseInt(heures, 10), parseInt(minutes, 10), 0, 0);

          const dateSuivi = new Date(dateHeureVisite);
          dateSuivi.setHours(dateSuivi.getHours() + 2);

          console.log(`[SUIVI] Vérification visite ${visite.id} pour ${employe.nomComplet}:`);
          console.log(`[SUIVI] - Date/heure visite: ${dateHeureVisite.toISOString()}`);
          console.log(`[SUIVI] - Date/heure suivi (J+2H): ${dateSuivi.toISOString()}`);
          console.log(`[SUIVI] - Maintenant: ${maintenant.toISOString()}`);
          console.log(`[SUIVI] - Jours restants: ${joursRestants}`);
          console.log(`[SUIVI] - Condition (maintenant >= dateSuivi): ${maintenant >= dateSuivi}`);

          if (maintenant >= dateSuivi) {
            const managers = allUsers.filter((u) => u.role === 'MANAGER');

            if (managers.length > 0) {
              for (const manager of managers) {
                const notificationsManager = await notificationService.getNotificationsByUser(manager.id);
                const suiviExiste = notificationsManager.some(
                  (n) => n.type === 'VISITE_MEDICALE_SUIVI' && n.documentId === visite.id
                );

                if (!suiviExiste) {
                  const notif = await notificationService.creerNotification({
                    type: notificationService.TYPES.VISITE_MEDICALE_SUIVI,
                    titre: '🏥 Suivi visite médicale',
                    message: `Le salarié ${employe.nomComplet} avait une visite médicale aujourd'hui à ${heureVisite}. Cette visite a-t-elle été effectuée ?`,
                    destinataireId: String(manager.id),
                    destinataireNom: manager.nom,
                    documentId: visite.id,
                    employeId: employe.id,
                    employeNom: employe.nomComplet,
                    dateVisite: visite.dateExpiration,
                    heureVisite: heureVisite,
                    actionRequise: true,
                    priorite: 'HAUTE',
                    icone: '🏥',
                    couleur: 'orange'
                  });
                  console.log(`[SUIVI] Notification de suivi créée pour manager ${manager.nom} (ID: ${manager.id})`);
                  console.log(`[SUIVI] Notification créée:`, {
                    id: notif.id,
                    type: notif.type,
                    destinataireId: notif.destinataireId,
                    destinataireNom: notif.destinataireNom,
                    lue: notif.lue
                  });
                } else {
                  console.log(
                    `[SUIVI] Notification de suivi existe déjà pour manager ${manager.nom} et visite ${visite.id}`
                  );
                }
              }
            }
          }

          const notificationsEmploye = await notificationService.getNotificationsByUser(employe.id);
          const rappelExiste = notificationsEmploye.some(
            (n) =>
              (n.type === 'VISITE_MEDICALE_RAPPEL' || n.type === 'VISITE_MEDICALE_PROGRAMMEE') &&
              n.dateVisite === visite.dateExpiration &&
              n.joursRestants === joursRestants &&
              !n.lue
          );

          if (!rappelExiste) {
            const notificationsRappel = await notificationService.notifierRappelVisiteMedicale(
              employe,
              visite.dateExpiration,
              heureVisite,
              joursRestants
            );
            if (Array.isArray(notificationsRappel)) {
              console.log(
                `[RAPPELS] ${notificationsRappel.length} rappels J-${joursRestants} envoyés pour visite médicale de ${employe.nomComplet}`
              );
            } else {
              console.log(`[RAPPELS] Rappel J-${joursRestants} envoyé pour visite médicale de ${employe.nomComplet}`);
            }
          }

          const managersRappel = allUsers.filter((u) => u.role === 'MANAGER');
          for (const manager of managersRappel) {
            const notificationsManager = await notificationService.getNotificationsByUser(manager.id);
            const rappelManagerExiste = notificationsManager.some(
              (n) =>
                n.type === 'VISITE_MEDICALE_RAPPEL' &&
                n.employeId === employe.id &&
                n.dateVisite === visite.dateExpiration &&
                n.joursRestants === joursRestants &&
                !n.lue
            );

            if (!rappelManagerExiste && joursRestants <= 1) {
              await notificationService.creerNotification({
                type: notificationService.TYPES.VISITE_MEDICALE_RAPPEL,
                titre: `🏥 Rappel visite médicale ${joursRestants === 0 ? "aujourd'hui" : 'demain'}`,
                message: `Rappel : Visite médicale de ${employe.nomComplet} prévue ${joursRestants === 0 ? "aujourd'hui" : 'demain'} le ${new Date(visite.dateExpiration).toLocaleDateString('fr-FR')} à ${heureVisite}`,
                destinataireId: manager.id,
                destinataireNom: manager.nom,
                employeId: employe.id,
                employeNom: employe.nomComplet,
                dateVisite: visite.dateExpiration,
                heureVisite: heureVisite,
                joursRestants: joursRestants,
                actionRequise: false,
                priorite: 'HAUTE',
                icone: '🏥',
                couleur: 'orange'
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[RAPPELS] Erreur vérification rappels visites médicales:', error);
  }
}

module.exports = { verifierRappelsVisitesMedicales };
