const { pool } = require('./database');

const TYPES = {
  DEMANDE_ABSENCE: 'DEMANDE_ABSENCE',
  ABSENCE_VALIDEE: 'ABSENCE_VALIDEE',
  ABSENCE_REFUSEE: 'ABSENCE_REFUSEE',
  MODIFICATION_ABSENCE: 'MODIFICATION_ABSENCE',
  ABSENCE_ANNULEE: 'ABSENCE_ANNULEE',
  DOCUMENT_UPLOADE: 'DOCUMENT_UPLOADE',
  DOCUMENT_VALIDE: 'DOCUMENT_VALIDE',
  DOCUMENT_REFUSE: 'DOCUMENT_REFUSE',
  DOCUMENT_EXPIRE: 'DOCUMENT_EXPIRE',
  ACOMPTE_DEMANDE: 'ACOMPTE_DEMANDE',
  ACOMPTE_VALIDE: 'ACOMPTE_VALIDE',
  ACOMPTE_VALIDE_MANAGER: 'ACOMPTE_VALIDE_MANAGER',
  ACOMPTE_REFUSE: 'ACOMPTE_REFUSE',
  ACOMPTE_PAYE: 'ACOMPTE_PAYE',
  ACOMPTE_A_PAYER: 'ACOMPTE_A_PAYER',
  ACOMPTE_EN_COURS: 'ACOMPTE_EN_COURS',
  PAIEMENT_EFFECTUE: 'PAIEMENT_EFFECTUE',
  VISITE_MEDICALE_PROGRAMMEE: 'VISITE_MEDICALE_PROGRAMMEE',
  VISITE_MEDICALE_RAPPEL: 'VISITE_MEDICALE_RAPPEL',
  VISITE_MEDICALE_SUIVI: 'VISITE_MEDICALE_SUIVI',
  INFO: 'INFO',
};

function requirePool() {
  if (!pool) {
    throw new Error('[notifications] Pool PostgreSQL indisponible — définir DATABASE_URL');
  }
}

function extractScalars(n) {
  return {
    destinataire_id: n.destinataireId != null ? String(n.destinataireId) : '',
    destinataire_nom: n.destinataireNom ?? null,
    type: n.type ?? '',
    titre: n.titre ?? '',
    message: n.message ?? '',
    lue: !!n.lue,
  };
}

function rowToNotification(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  const out = { ...base, id: row.id };
  out.destinataireId = out.destinataireId ?? row.destinataire_id;
  out.destinataireNom = out.destinataireNom ?? row.destinataire_nom;
  out.type = out.type ?? row.type;
  out.titre = out.titre ?? row.titre ?? '';
  out.message = out.message ?? row.message ?? '';
  out.lue = row.lue !== undefined && row.lue !== null ? row.lue : !!base.lue;
  const ca = row.created_at;
  out.createdAt = base.createdAt || (ca instanceof Date ? ca.toISOString() : ca);
  const ua = row.updated_at;
  if (ua) out.updatedAt = ua instanceof Date ? ua.toISOString() : ua;
  return out;
}

async function persistNotification(n) {
  requirePool();
  n.updatedAt = new Date().toISOString();
  const s = extractScalars(n);
  await pool.query(
    `UPDATE notifications SET
      destinataire_id = $2,
      destinataire_nom = $3,
      type = $4,
      titre = $5,
      message = $6,
      lue = $7,
      updated_at = NOW(),
      data = $8::jsonb
    WHERE id = $1`,
    [n.id, s.destinataire_id, s.destinataire_nom, s.type, s.titre, s.message, s.lue, n]
  );
}

async function loadRowById(id) {
  requirePool();
  const { rows } = await pool.query(
    'SELECT id, destinataire_id, destinataire_nom, type, titre, message, lue, created_at, updated_at, data FROM notifications WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function creerNotification(data) {
  requirePool();
  const notification = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    ...data,
    lue: false,
    createdAt: new Date().toISOString(),
  };

  const s = extractScalars(notification);
  await pool.query(
    `INSERT INTO notifications (id, destinataire_id, destinataire_nom, type, titre, message, lue, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [notification.id, s.destinataire_id, s.destinataire_nom, s.type, s.titre, s.message, s.lue, notification]
  );

  console.log('[NOTIFICATIONS] Notification créée et ajoutée:', {
    id: notification.id,
    type: notification.type,
    destinataireId: notification.destinataireId,
    destinataireNom: notification.destinataireNom,
    titre: notification.titre,
    lue: notification.lue,
    createdAt: notification.createdAt,
  });
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM notifications');
  console.log('[NOTIFICATIONS] Total notifications après ajout:', rows[0].c);
  return notification;
}

async function getNotificationsByUser(userId, salesforceId = null) {
  requirePool();
  console.log('[NOTIFICATIONS] ========================================');
  console.log('[NOTIFICATIONS] getNotificationsByUser appelé avec userId:', userId, '(type:', typeof userId + ')');
  if (salesforceId) {
    console.log('[NOTIFICATIONS] salesforceId également recherché:', salesforceId, '(type:', typeof salesforceId + ')');
  }

  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM notifications');
  console.log('[NOTIFICATIONS] Notifications totales:', countRows[0].c);

  let query = `
    SELECT id, destinataire_id, destinataire_nom, type, titre, message, lue, created_at, updated_at, data
    FROM notifications
    WHERE destinataire_id::text = $1::text`;
  const params = [String(userId)];
  if (salesforceId != null && salesforceId !== '') {
    query += ` OR destinataire_id::text = $2::text`;
    params.push(String(salesforceId));
  }
  query += ` ORDER BY created_at DESC`;

  const { rows } = await pool.query(query, params);
  const filtered = rows.map(rowToNotification);

  const notificationsDetails = filtered.map(n => ({
    id: n.id,
    type: n.type,
    destinataireId: n.destinataireId,
    destinataireIdType: typeof n.destinataireId,
    destinataireNom: n.destinataireNom,
    titre: n.titre,
    lue: n.lue,
  }));
  console.log('[NOTIFICATIONS] Détails des notifications concernées:', notificationsDetails);
  console.log('[NOTIFICATIONS] Notifications filtrées pour userId', userId, salesforceId ? `et salesforceId ${salesforceId}` : '', ':', filtered.length);
  console.log('[NOTIFICATIONS] Types de notifications filtrées:', filtered.map(n => n.type));
  console.log('[NOTIFICATIONS] ========================================');
  return filtered;
}

async function marquerCommeLue(notificationId) {
  const row = await loadRowById(notificationId);
  if (!row) {
    console.log('[NOTIFICATIONS] Notification non trouvée pour marquage:', notificationId);
    return null;
  }
  const notif = rowToNotification(row);
  notif.lue = true;
  await persistNotification(notif);
  console.log('[NOTIFICATIONS] Notification marquée comme lue:', {
    id: notif.id,
    type: notif.type,
    destinataireId: notif.destinataireId,
    lue: notif.lue,
  });
  return notif;
}

async function marquerToutCommeLu(userId, salesforceId = null) {
  requirePool();
  if (salesforceId != null && salesforceId !== '') {
    await pool.query(
      `UPDATE notifications SET
        lue = TRUE,
        updated_at = NOW(),
        data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lue}', 'true'::jsonb, true)
      WHERE destinataire_id::text = $1::text OR destinataire_id::text = $2::text`,
      [String(userId), String(salesforceId)]
    );
  } else {
    await pool.query(
      `UPDATE notifications SET
        lue = TRUE,
        updated_at = NOW(),
        data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lue}', 'true'::jsonb, true)
      WHERE destinataire_id::text = $1::text`,
      [String(userId)]
    );
  }
  return true;
}

async function compterNonLues(userId, salesforceId = null, userRole = null) {
  const list = await getNotificationsByUser(userId, salesforceId);
  return list.filter(n => {
    const match = !n.lue;
    if (!match) return false;

    if (userRole === 'MANAGER' && n.type === 'ACOMPTE_DEMANDE') {
      return false;
    }

    if (
      userRole === 'COMPTABLE' &&
      (n.type === 'ACOMPTE_A_PAYER' ||
        n.type === 'ACOMPTE_DEMANDE' ||
        n.type === 'ACOMPTE_VALIDE' ||
        n.type === 'ACOMPTE_VALIDE_MANAGER' ||
        n.type === 'ACOMPTE_EN_COURS')
    ) {
      return false;
    }

    if (userRole === 'RH' && (n.type === 'ACOMPTE_A_PAYER' || n.type === 'ACOMPTE_EN_COURS')) {
      return false;
    }

    return true;
  }).length;
}

async function supprimerNotification(notificationId) {
  requirePool();
  const r = await pool.query('DELETE FROM notifications WHERE id = $1', [notificationId]);
  return r.rowCount > 0;
}

async function supprimerNotificationsDemande(absenceId) {
  requirePool();
  const absenceIdStr = String(absenceId);
  console.log('[NOTIFICATIONS] Recherche notifications à supprimer pour absenceId:', absenceIdStr);

  const { rows: before } = await pool.query('SELECT COUNT(*)::int AS c FROM notifications');
  console.log('[NOTIFICATIONS] Notifications actuelles:', before[0].c);

  const { rows: aSupprimer } = await pool.query(
    `SELECT id, destinataire_id, data FROM notifications WHERE type = $1 AND COALESCE(data->>'absenceId', '') = $2`,
    [TYPES.DEMANDE_ABSENCE, absenceIdStr]
  );
  console.log(
    '[NOTIFICATIONS] Notifications DEMANDE_ABSENCE:',
    aSupprimer.map(r => ({
      id: r.id,
      absenceId: r.data?.absenceId != null ? String(r.data.absenceId) : '',
      destinataireId: r.destinataire_id,
    }))
  );

  const r = await pool.query(
    `DELETE FROM notifications WHERE type = $1 AND COALESCE(data->>'absenceId', '') = $2`,
    [TYPES.DEMANDE_ABSENCE, absenceIdStr]
  );

  console.log('[NOTIFICATIONS] Suppression de', r.rowCount, 'notification(s) de demande pour absence', absenceIdStr);
  const { rows: after } = await pool.query('SELECT COUNT(*)::int AS c FROM notifications');
  console.log('[NOTIFICATIONS] Notifications restantes:', after[0].c);
  return r.rowCount > 0;
}

async function notifierDemandeAbsence(absence, employe, manager, toutesAbsences = []) {
  const typeAbsenceLibelle =
    absence.type === 'CP'
      ? 'Congés Payés'
      : absence.type === 'RTT'
        ? 'RTT'
        : absence.type === 'MALADIE'
          ? 'Arrêt maladie'
          : absence.type === 'Sans solde'
            ? 'Sans solde'
            : absence.type || 'Absence';

  const autresAbsencesMemePeriode = toutesAbsences.filter(
    a =>
      a.id !== absence.id &&
      a.dateDebut === absence.dateDebut &&
      a.dateFin === absence.dateFin &&
      (a.statut === 'En attente' || a.statut === 'Validée')
  );

  const nombreSalariesMemePeriode = autresAbsencesMemePeriode.length;

  console.log(`[NOTIFICATIONS] Comptage absences même période pour absence ${absence.id}:`);
  console.log(`[NOTIFICATIONS]   - Période: ${absence.dateDebut} à ${absence.dateFin}`);
  console.log(`[NOTIFICATIONS]   - Total absences dans la liste: ${toutesAbsences.length}`);
  console.log(`[NOTIFICATIONS]   - Autres absences même période: ${nombreSalariesMemePeriode}`);
  if (nombreSalariesMemePeriode > 0) {
    console.log(
      `[NOTIFICATIONS]   - Détails autres absences:`,
      autresAbsencesMemePeriode.map(a => ({ id: a.id, employeId: a.employeId, statut: a.statut }))
    );
  }

  let message = `${employe.nomComplet} demande une absence de type "${typeAbsenceLibelle}" du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')}`;

  let details = '';
  if (nombreSalariesMemePeriode > 0) {
    details = `⚠️ ${nombreSalariesMemePeriode} autre${nombreSalariesMemePeriode > 1 ? 's' : ''} salarié${nombreSalariesMemePeriode > 1 ? 's' : ''} ${nombreSalariesMemePeriode > 1 ? 'ont' : 'a'} demandé${nombreSalariesMemePeriode > 1 ? '' : ''} la même période`;
    message += `. ${details}`;
  }

  return await creerNotification({
    type: TYPES.DEMANDE_ABSENCE,
    titre: `Nouvelle demande d'absence (${typeAbsenceLibelle})`,
    message,
    details,
    destinataireId: manager.id,
    destinataireNom: manager.nom,
    absenceId: absence.id,
    employeId: employe.id,
    employeNom: employe.nomComplet,
    typeAbsence: absence.type,
    typeAbsenceLibelle,
    nombreSalariesMemePeriode,
    actionRequise: true,
    priorite: nombreSalariesMemePeriode > 0 ? 'HAUTE' : 'HAUTE',
    icone: '📅',
    couleur: 'blue',
  });
}

async function notifierValidationAbsence(absence, employe, managerId, managerNom, rhId) {
  const notifs = [];

  const typeAbsenceLibelle =
    absence.type === 'CP'
      ? 'Congés Payés'
      : absence.type === 'RTT'
        ? 'RTT'
        : absence.type === 'MALADIE'
          ? 'Arrêt maladie'
          : absence.type === 'Sans solde'
            ? 'Sans solde'
            : absence.type || 'Absence';

  const couleur = absence.type === 'MALADIE' ? 'red' : 'green';

  if (!rhId) {
    notifs.push(
      await creerNotification({
        type: TYPES.ABSENCE_VALIDEE,
        titre: `✓ Absence validée (${typeAbsenceLibelle})`,
        message: `Votre demande d'absence de type "${typeAbsenceLibelle}" du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')} a été validée par ${managerNom}`,
        destinataireId: employe.id,
        destinataireNom: employe.nomComplet,
        absenceId: absence.id,
        typeAbsence: absence.type,
        typeAbsenceLibelle,
        actionRequise: false,
        priorite: 'NORMALE',
        icone: '✓',
        couleur,
      })
    );

    notifs.push(
      await creerNotification({
        type: TYPES.ABSENCE_VALIDEE,
        titre: `✓ Absence validée (${typeAbsenceLibelle})`,
        message: `Vous avez validé l'absence de type "${typeAbsenceLibelle}" de ${employe.nomComplet} du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')}`,
        destinataireId: managerId,
        destinataireNom: managerNom,
        absenceId: absence.id,
        employeId: employe.id,
        employeNom: employe.nomComplet,
        typeAbsence: absence.type,
        typeAbsenceLibelle,
        actionRequise: false,
        priorite: 'NORMALE',
        icone: '✓',
        couleur,
      })
    );
  }

  if (rhId) {
    notifs.push(
      await creerNotification({
        type: TYPES.INFO,
        titre: `Absence validée (${typeAbsenceLibelle})`,
        message: `${managerNom} a validé l'absence de type "${typeAbsenceLibelle}" de ${employe.nomComplet} du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')}`,
        destinataireId: rhId,
        destinataireNom: 'RH',
        absenceId: absence.id,
        employeId: employe.id,
        employeNom: employe.nomComplet,
        typeAbsence: absence.type,
        typeAbsenceLibelle,
        actionRequise: false,
        priorite: 'NORMALE',
        icone: 'ℹ️',
        couleur: 'blue',
      })
    );
  }

  return notifs;
}

async function notifierRefusAbsence(absence, employe, managerId, managerNom, motifRefus) {
  console.log('[NOTIFICATIONS] notifierRefusAbsence appelé avec:', { absenceId: absence.id, employeId: employe.id, managerId, managerNom });
  const notifs = [];

  const typeAbsenceLibelle =
    absence.type === 'CP'
      ? 'Congés Payés'
      : absence.type === 'RTT'
        ? 'RTT'
        : absence.type === 'MALADIE'
          ? 'Arrêt maladie'
          : absence.type === 'Sans solde'
            ? 'Sans solde'
            : absence.type || 'Absence';

  const dureeJours = absence.dureeJours || 0;

  console.log('[NOTIFICATIONS] Création notification pour employé:', employe.id);
  const notifEmploye = await creerNotification({
    type: TYPES.ABSENCE_REFUSEE,
    titre: `✗ Absence refusée (${typeAbsenceLibelle})`,
    message: `Votre demande de ${dureeJours}j de ${typeAbsenceLibelle} du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')} a été refusée par ${managerNom}. Aucun jour n'a été décompté de votre solde.`,
    details: motifRefus || 'Aucun motif précisé',
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    absenceId: absence.id,
    typeAbsence: absence.type,
    typeAbsenceLibelle,
    actionRequise: false,
    priorite: 'HAUTE',
    icone: '✗',
    couleur: 'red',
    info: {
      joursDecomptes: 0,
      soldeInchange: true,
    },
  });
  notifs.push(notifEmploye);

  console.log('[NOTIFICATIONS] Création notification pour manager:', managerId);
  const notifManager = await creerNotification({
    type: TYPES.ABSENCE_REFUSEE,
    titre: `✗ Absence refusée (${typeAbsenceLibelle})`,
    message: `Vous avez refusé l'absence de type "${typeAbsenceLibelle}" de ${employe.nomComplet} du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')}`,
    details: motifRefus || 'Aucun motif précisé',
    destinataireId: managerId,
    destinataireNom: managerNom,
    absenceId: absence.id,
    employeId: employe.id,
    employeNom: employe.nomComplet,
    typeAbsence: absence.type,
    typeAbsenceLibelle,
    actionRequise: false,
    priorite: 'NORMALE',
    icone: '✗',
    couleur: 'red',
  });
  notifs.push(notifManager);

  console.log('[NOTIFICATIONS] Total notifications créées:', notifs.length);
  return notifs;
}

async function notifierModificationAbsence(absence, employe, modificateurId, modificateurNom, changements) {
  console.log('[NOTIFICATIONS] notifierModificationAbsence appelé avec:', { absenceId: absence.id, employeId: employe.id, modificateurId, modificateurNom });

  const typeAbsenceLibelle =
    absence.type === 'CP'
      ? 'Congés Payés'
      : absence.type === 'RTT'
        ? 'RTT'
        : absence.type === 'MALADIE'
          ? 'Arrêt maladie'
          : absence.type === 'Sans solde'
            ? 'Sans solde'
            : absence.type || 'Absence';

  let messageChangements = '';
  if (changements && changements.length > 0) {
    messageChangements = `\nModifications : ${changements.join(', ')}`;
  }

  return await creerNotification({
    type: TYPES.MODIFICATION_ABSENCE,
    titre: `✏️ Absence modifiée (${typeAbsenceLibelle})`,
    message: `Votre demande d'absence de type "${typeAbsenceLibelle}" du ${new Date(absence.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absence.dateFin).toLocaleDateString('fr-FR')} a été modifiée par ${modificateurNom}${messageChangements}`,
    details: changements && changements.length > 0 ? changements.join(', ') : 'Modification effectuée',
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    absenceId: absence.id,
    modificateurId,
    modificateurNom,
    typeAbsence: absence.type,
    typeAbsenceLibelle,
    actionRequise: false,
    priorite: 'NORMALE',
    icone: '✏️',
    couleur: 'orange',
  });
}

async function notifierAnnulationAbsence(absenceInfo, employe, annulateurId, annulateurNom) {
  console.log('[NOTIFICATIONS] ========================================');
  console.log('[NOTIFICATIONS] notifierAnnulationAbsence appelé');
  console.log('[NOTIFICATIONS] absenceInfo:', {
    id: absenceInfo.id,
    employeId: absenceInfo.employeId,
    dateDebut: absenceInfo.dateDebut,
    dateFin: absenceInfo.dateFin,
    type: absenceInfo.type,
  });
  console.log('[NOTIFICATIONS] employe:', {
    id: employe.id,
    nomComplet: employe.nomComplet,
  });
  console.log('[NOTIFICATIONS] annulateur:', {
    id: annulateurId,
    nom: annulateurNom,
  });

  const typeAbsenceLibelle =
    absenceInfo.type === 'CP'
      ? 'Congés Payés'
      : absenceInfo.type === 'RTT'
        ? 'RTT'
        : absenceInfo.type === 'MALADIE'
          ? 'Arrêt maladie'
          : absenceInfo.type === 'Sans solde'
            ? 'Sans solde'
            : absenceInfo.type || 'Absence';

  const destinataireIdStr = String(employe.id);

  console.log('[NOTIFICATIONS] Création notification avec destinataireId:', destinataireIdStr, '(type:', typeof destinataireIdStr + ')');

  const notification = await creerNotification({
    type: TYPES.ABSENCE_ANNULEE,
    titre: `🚨 Demande annulée (${typeAbsenceLibelle})`,
    message: `Votre demande d'absence de type "${typeAbsenceLibelle}" du ${new Date(absenceInfo.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(absenceInfo.dateFin).toLocaleDateString('fr-FR')} a été annulée par ${annulateurNom}`,
    details: `La demande a été annulée le ${new Date().toLocaleDateString('fr-FR')}`,
    destinataireId: destinataireIdStr,
    destinataireNom: employe.nomComplet,
    absenceId: absenceInfo.id,
    annulateurId,
    annulateurNom,
    typeAbsence: absenceInfo.type,
    typeAbsenceLibelle,
    actionRequise: false,
    priorite: 'HAUTE',
    icone: '🚨',
    couleur: 'red',
  });

  console.log('[NOTIFICATIONS] Notification créée:', {
    id: notification.id,
    type: notification.type,
    destinataireId: notification.destinataireId,
    destinataireNom: notification.destinataireNom,
    titre: notification.titre,
    lue: notification.lue,
  });
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM notifications');
  console.log('[NOTIFICATIONS] Nombre total de notifications:', rows[0].c);
  console.log('[NOTIFICATIONS] ========================================');

  return notification;
}

async function notifierUploadDocument(document, employe) {
  const authService = require('./authService');
  const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');

  const createdList = [];
  for (const rh of rhUsers) {
    createdList.push(
      await creerNotification({
        type: TYPES.DOCUMENT_UPLOADE,
        titre: '📄 Nouveau document uploadé',
        message: `${employe.nomComplet} a uploadé un document: ${document.categorie}`,
        destinataireId: rh.id,
        destinataireNom: rh.nom,
        documentId: document.id,
        employeId: employe.id,
        employeNom: employe.nomComplet,
        priorite: 'NORMALE',
      })
    );
  }

  return createdList;
}

async function notifierValidationDocument(document, employe, validateurNom) {
  return await creerNotification({
    type: TYPES.DOCUMENT_VALIDE,
    titre: '✓ Document validé',
    message: `Votre document ${document.categorie} a été validé par ${validateurNom}`,
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    documentId: document.id,
    priorite: 'NORMALE',
  });
}

async function notifierRefusDocument(document, employe, validateurNom, motifRefus) {
  return await creerNotification({
    type: TYPES.DOCUMENT_REFUSE,
    titre: '✗ Document refusé',
    message: `Votre document ${document.categorie} a été refusé par ${validateurNom}. Motif: ${motifRefus}`,
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    documentId: document.id,
    priorite: 'HAUTE',
  });
}

async function notifierDemandeAcompte(acompte, employe) {
  const authService = require('./authService');
  const managers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'MANAGER');

  return Promise.all(
    managers.map(manager =>
      creerNotification({
        type: TYPES.ACOMPTE_DEMANDE,
        titre: "💰 Nouvelle demande d'acompte",
        message: `${employe.nomComplet} demande un acompte de ${acompte.montant}€`,
        destinataireId: manager.id,
        destinataireNom: manager.nom,
        acompteId: acompte.id,
        employeId: employe.id,
        employeNom: employe.nomComplet,
        priorite: 'HAUTE',
      })
    )
  );
}

async function notifierValidationAcompte(acompte, employe, validateurNom, isManager = false) {
  const authService = require('./authService');
  const notificationsOut = [];

  if (isManager) {
    const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');

    for (const rh of rhUsers) {
      notificationsOut.push(
        await creerNotification({
          type: TYPES.ACOMPTE_VALIDE,
          titre: '💰 Acompte validé par manager',
          message: `${validateurNom} a validé la demande d'acompte de ${acompte.montant}€ de ${employe.nomComplet}`,
          destinataireId: rh.id,
          destinataireNom: rh.nom,
          acompteId: acompte.id,
          employeId: employe.id,
          priorite: 'NORMALE',
        })
      );
    }

    notificationsOut.push(
      await creerNotification({
        type: TYPES.ACOMPTE_VALIDE,
        titre: '✓ Acompte validé par votre manager',
        message: `Votre demande d'acompte de ${acompte.montant}€ a été validée par ${validateurNom}. En attente de validation RH.`,
        destinataireId: employe.id,
        destinataireNom: employe.nomComplet,
        acompteId: acompte.id,
        priorite: 'NORMALE',
      })
    );

    return notificationsOut;
  }

  return await creerNotification({
    type: TYPES.ACOMPTE_VALIDE,
    titre: '✓ Acompte validé',
    message: `Votre demande d'acompte de ${acompte.montant}€ a été validée par ${validateurNom}`,
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    acompteId: acompte.id,
    priorite: 'NORMALE',
  });
}

async function notifierRefusAcompte(acompte, employe, validateurNom, motifRefus) {
  return await creerNotification({
    type: TYPES.ACOMPTE_REFUSE,
    titre: '✗ Acompte refusé',
    message: `Votre demande d'acompte de ${acompte.montant}€ a été refusée par ${validateurNom}. Motif: ${motifRefus}`,
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    acompteId: acompte.id,
    priorite: 'HAUTE',
  });
}

async function notifierAcomptePaye(acompte, employe) {
  return await creerNotification({
    type: TYPES.ACOMPTE_PAYE,
    titre: '💰 Acompte payé',
    message: `Votre acompte de ${acompte.montant}€ a été payé`,
    destinataireId: employe.id,
    destinataireNom: employe.nomComplet,
    acompteId: acompte.id,
    priorite: 'NORMALE',
  });
}

async function notifierVisiteMedicaleProgrammee(document, employe, dateVisite, heureVisite) {
  const authService = require('./authService');
  const list = [];

  list.push(
    await creerNotification({
      type: TYPES.VISITE_MEDICALE_PROGRAMMEE,
      titre: '🏥 Visite médicale programmée',
      message: `Une visite médicale a été programmée pour vous le ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
      details: `Date: ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
      destinataireId: employe.id,
      destinataireNom: employe.nomComplet,
      documentId: document.id,
      dateVisite,
      heureVisite,
      actionRequise: true,
      priorite: 'URGENTE',
      icone: '🏥',
      couleur: 'red',
      luParEmploye: false,
    })
  );

  const managers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'MANAGER');
  for (const manager of managers) {
    list.push(
      await creerNotification({
        type: TYPES.VISITE_MEDICALE_PROGRAMMEE,
        titre: '🏥 Visite médicale programmée',
        message: `Une visite médicale a été programmée pour ${employe.nomComplet} le ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
        details: `Date: ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
        destinataireId: manager.id,
        destinataireNom: manager.nom,
        documentId: document.id,
        employeId: employe.id,
        employeNom: employe.nomComplet,
        dateVisite,
        heureVisite,
        actionRequise: false,
        priorite: 'NORMALE',
        icone: '🏥',
        couleur: 'blue',
      })
    );
  }

  return list;
}

async function notifierRappelVisiteMedicale(employe, dateVisite, heureVisite, joursRestants) {
  const authService = require('./authService');
  const list = [];
  const messages = {
    7: 'dans 7 jours',
    2: 'dans 2 jours',
    1: 'demain',
    0: "aujourd'hui",
  };

  list.push(
    await creerNotification({
      type: TYPES.VISITE_MEDICALE_RAPPEL,
      titre: `🏥 Rappel visite médicale ${messages[joursRestants] || `dans ${joursRestants} jours`}`,
      message: `Rappel : Votre visite médicale est prévue ${messages[joursRestants] || `dans ${joursRestants} jours`} le ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
      details: `Date: ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
      destinataireId: employe.id,
      destinataireNom: employe.nomComplet,
      dateVisite,
      heureVisite,
      joursRestants,
      actionRequise: true,
      priorite: joursRestants <= 1 ? 'URGENTE' : 'HAUTE',
      icone: '🏥',
      couleur: joursRestants <= 1 ? 'red' : 'orange',
      luParEmploye: false,
    })
  );

  const managers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'MANAGER');
  for (const manager of managers) {
    list.push(
      await creerNotification({
        type: TYPES.VISITE_MEDICALE_RAPPEL,
        titre: `🏥 Rappel visite médicale ${messages[joursRestants] || `dans ${joursRestants} jours`}`,
        message: `Rappel : Visite médicale de ${employe.nomComplet} prévue ${messages[joursRestants] || `dans ${joursRestants} jours`} le ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
        details: `Date: ${new Date(dateVisite).toLocaleDateString('fr-FR')} à ${heureVisite}`,
        destinataireId: manager.id,
        destinataireNom: manager.nom,
        employeId: employe.id,
        employeNom: employe.nomComplet,
        dateVisite,
        heureVisite,
        joursRestants,
        actionRequise: false,
        priorite: joursRestants <= 1 ? 'HAUTE' : 'NORMALE',
        icone: '🏥',
        couleur: joursRestants <= 1 ? 'orange' : 'blue',
      })
    );
  }

  return list;
}

module.exports = {
  creerNotification,
  getNotificationsByUser,
  marquerCommeLue,
  marquerToutCommeLu,
  compterNonLues,
  supprimerNotification,
  supprimerNotificationsDemande,
  notifierDemandeAbsence,
  notifierValidationAbsence,
  notifierRefusAbsence,
  notifierModificationAbsence,
  notifierAnnulationAbsence,
  notifierUploadDocument,
  notifierValidationDocument,
  notifierRefusDocument,
  notifierDemandeAcompte,
  notifierValidationAcompte,
  notifierRefusAcompte,
  notifierAcomptePaye,
  notifierVisiteMedicaleProgrammee,
  notifierRappelVisiteMedicale,
  TYPES,
};
