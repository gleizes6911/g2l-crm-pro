const express = require('express');
const path = require('path');
const multer = require('multer');
const employeService = require('../services/employeService');
const absenceService = require('../services/absenceService');
const { STATUTS: ABSENCE_STATUTS } = require('../services/absenceService');
const soldesService = require('../services/soldesService');
const documentService = require('../services/documentService');
const acompteService = require('../services/acompteService');
const acompteAnalyticsService = require('../services/acompteAnalyticsService');
const notificationService = require('../services/notificationService');
const authService = require('../services/authService');

function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().slice(0, maxLength).replace(/[<>"'`;]/g, '');
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, documentService.UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const uploadDocument = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, DOCX, PNG, JPG'));
    }
  }
});

const router = express.Router();

// Liste de tous les employés
router.get('/employes', async (req, res) => {
  try {
    console.log('[API] GET /api/employes');
    const result = await employeService.getEmployes();
    res.json(result);
  } catch (error) {
    console.error('[API] Erreur /api/employes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Détails d'un employé spécifique
router.get('/employes/:id', async (req, res) => {
  try {
    console.log('[API] GET /api/employes/' + req.params.id);
    const employe = await employeService.getEmployeById(req.params.id);
    res.json(employe);
  } catch (error) {
    console.error('[API] Erreur /api/employes/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// Statistiques RH
router.get('/employes/statistiques/rh', async (req, res) => {
  try {
    console.log('[API] GET /api/employes/statistiques/rh');
    const stats = await employeService.getStatistiquesRH();
    res.json(stats);
  } catch (error) {
    console.error('[API] Erreur /api/employes/statistiques/rh:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES ABSENCES
// ═══════════════════════════════════════════════════════

router.get('/absences', async (req, res) => {
  try {
    console.log('[API] GET /api/absences');
    const absences = await absenceService.getAbsences();
    res.json(absences);
  } catch (error) {
    console.error('[API] Erreur /api/absences:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/absences/employe/:employeId', async (req, res) => {
  try {
    console.log('[API] GET /api/absences/employe/' + req.params.employeId);
    const absences = await absenceService.getAbsencesByEmploye(req.params.employeId);
    res.json(absences);
  } catch (error) {
    console.error('[API] Erreur /api/absences/employe/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/absences', async (req, res) => {
  try {
    console.log('[API] POST /api/absences');
    console.log('[API] Body reçu:', req.body);
    
    const absence = await absenceService.ajouterAbsence(req.body);
    console.log('[API] Absence créée avec statut:', absence.statut);
    // Pré-remplir le nom côté absence si fourni
    if (req.body.employeNom && !absence.employeNom) {
      absence.employeNom = req.body.employeNom;
    }
    
    // Récupérer infos employé
    const employesData = await employeService.getEmployes();
    console.log('[API] Nombre d\'employés trouvés:', employesData.employes?.length || 0);
    console.log('[API] Recherche employé avec ID:', req.body.employeId);
    
    const employe = employesData.employes.find(e => e.id === req.body.employeId);
    
    if (!employe) {
      console.error('[API] Employé non trouvé avec ID:', req.body.employeId);
      console.log('[API] IDs disponibles:', employesData.employes?.map(e => e.id).slice(0, 5));
      return res.json(absence);
    }
    
    console.log('[API] Employé trouvé:', employe.nomComplet);
    // Enrichir l'absence avec le nom employé pour l'affichage
    absence.employeNom = employe.nomComplet;
    
    // Récupérer toutes les absences pour compter celles avec la même période
    const toutesAbsences = await absenceService.getAbsences();
    
    // Envoyer notification à TOUS les managers
    const managers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'MANAGER');
    console.log('[API] Nombre de managers trouvés:', managers.length);
    
    for (const manager of managers) {
      await notificationService.notifierDemandeAbsence(absence, employe, manager, toutesAbsences);
      console.log('[API] Notification envoyée au manager:', manager.nom, '(ID:', manager.id + ')');
    }
    
    if (managers.length === 0) {
      console.warn('[API] Aucun manager trouvé pour recevoir la notification');
    }
    
    res.json(absence);
  } catch (error) {
    console.error('[API] Erreur POST /api/absences:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/absences/:id', async (req, res) => {
  try {
    console.log('[API] PUT /api/absences/' + req.params.id);
    console.log('[API] Body:', req.body);
    
    const { modificateurId, modificateurNom, modificateurRole } = req.body;
    
    console.log('[API] Modification absence - modificateurRole:', modificateurRole);
    console.log('[API] Modification absence - modificateurId:', modificateurId);
    console.log('[API] Body complet:', JSON.stringify(req.body, null, 2));
    
    // Si modificateurRole n'est pas fourni, essayer de le déterminer depuis authService
    let roleEffectif = modificateurRole;
    if (!roleEffectif && modificateurId) {
      const utilisateur = await authService.getUtilisateurById(modificateurId);
      if (utilisateur) {
        roleEffectif = utilisateur.role;
        console.log('[API] Rôle déterminé depuis authService:', roleEffectif);
      }
    }
    
    if (!roleEffectif) {
      console.warn('[API] ⚠️ modificateurRole non fourni et impossible à déterminer');
      return res.status(400).json({ error: 'Le rôle du modificateur (modificateurRole) est requis' });
    }
    
    // Récupérer l'absence actuelle
    const absencesListPut = await absenceService.getAbsences();
    const absence = absencesListPut.find(a => a.id === req.params.id);
    if (!absence) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }
    
    console.log('[API] Absence trouvée - type:', absence.type, 'statut:', absence.statut);
    
    // Vérifier les permissions
    // Si c'est un employé (pas manager/RH), il ne peut modifier que si l'absence est en attente
    if (roleEffectif !== 'MANAGER' && roleEffectif !== 'RH') {
      console.log('[API] Vérification permissions employé');
      if (absence.statut === ABSENCE_STATUTS.VALIDEE || absence.statut === ABSENCE_STATUTS.REFUSEE) {
        console.log('[API] ❌ Refusé: employé ne peut pas modifier une absence validée/refusée');
        return res.status(403).json({ error: 'Vous ne pouvez pas modifier une absence validée ou refusée' });
      }
      // Vérifier que l'employé modifie bien sa propre absence
      if (absence.employeId !== modificateurId) {
        console.log('[API] ❌ Refusé: employé ne peut modifier que ses propres absences');
        return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres absences' });
      }
    }
    
    // Pour les managers : ne peuvent modifier que les absences CP ou MALADIE même si validées
    // Les RH ne peuvent pas modifier les absences
    if (roleEffectif === 'RH') {
      console.log('[API] ❌ Refusé: les RH ne peuvent pas modifier les absences');
      return res.status(403).json({ error: 'Les RH ne peuvent pas modifier les absences. Seuls les managers peuvent le faire.' });
    }
    
    if (roleEffectif === 'MANAGER' && absence.statut === ABSENCE_STATUTS.VALIDEE) {
      console.log('[API] Vérification permissions manager pour absence validée');
      console.log('[API] Type absence:', absence.type, 'CP:', absence.type === 'CP', 'MALADIE:', absence.type === 'MALADIE');
      if (absence.type !== 'CP' && absence.type !== 'MALADIE') {
        console.log('[API] ❌ Refusé: manager ne peut modifier que CP ou MALADIE quand validée');
        return res.status(403).json({ error: 'Vous ne pouvez modifier que les absences de type CP ou Maladie lorsqu\'elles sont validées' });
      }
      console.log('[API] ✅ Autorisation accordée: manager peut modifier cette absence CP/MALADIE validée');
    }
    
    // Préparer les données à modifier (exclure les champs système)
    const donneesModification = { ...req.body };
    delete donneesModification.modificateurId;
    delete donneesModification.modificateurNom;
    delete donneesModification.modificateurRole;
    
    // Détecter les changements pour la notification
    const changements = [];
    if (donneesModification.dateDebut && donneesModification.dateDebut !== absence.dateDebut) {
      changements.push('dates modifiées');
    }
    if (donneesModification.dateFin && donneesModification.dateFin !== absence.dateFin) {
      changements.push('dates modifiées');
    }
    if (donneesModification.type && donneesModification.type !== absence.type) {
      changements.push('type modifié');
    }
    if (donneesModification.motif && donneesModification.motif !== absence.motif) {
      changements.push('motif modifié');
    }
    if (donneesModification.documentArretMaladie !== undefined) {
      changements.push('document arrêt maladie');
    }
    
    // Modifier l'absence
    const resultatModification = await absenceService.modifierAbsence(
      req.params.id, 
      donneesModification,
      modificateurId,
      modificateurNom
    );
    
    if (!resultatModification) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }
    
    const absenceModifiee = resultatModification.absence;
    const etaitValidee = resultatModification.etaitValidee;
    
    // Si un manager/RH a modifié une absence validée, notifier l'employé
    if ((roleEffectif === 'MANAGER' || roleEffectif === 'RH') && etaitValidee && changements.length > 0) {
      try {
        const employesData = await employeService.getEmployes();
        const employe = employesData.employes.find(e => e.id === absenceModifiee.employeId);
        
        if (employe) {
          await notificationService.notifierModificationAbsence(
            absenceModifiee,
            employe,
            modificateurId,
            modificateurNom,
            changements
          );
          console.log('[API] Notification de modification envoyée à l\'employé:', employe.nomComplet);
        }
      } catch (error) {
        console.error('[API] Erreur lors de l\'envoi de la notification de modification:', error);
        // Ne pas bloquer la modification si la notification échoue
      }
    }
    
    res.json(absenceModifiee);
  } catch (error) {
    console.error('[API] Erreur PUT /api/absences/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/absences/:id', async (req, res) => {
  try {
    console.log('[API] DELETE /api/absences/' + req.params.id);
    console.log('[API] Body:', req.body);
    
    const { annulateurId, annulateurNom, annulateurRole } = req.body;
    
    // Vérifier les permissions : seuls les MANAGER peuvent supprimer, pas les RH
    if (!annulateurRole) {
      return res.status(400).json({ error: 'Le rôle de l\'annulateur (annulateurRole) est requis' });
    }
    
    if (annulateurRole === 'RH') {
      return res.status(403).json({ error: 'Les RH ne peuvent pas supprimer les absences. Seuls les managers peuvent le faire.' });
    }
    
    if (annulateurRole !== 'MANAGER') {
      return res.status(403).json({ error: 'Seuls les managers peuvent supprimer les absences' });
    }
    
    // Récupérer l'absence avant suppression pour la notification
    const absences = await absenceService.getAbsences();
    const absence = absences.find(a => a.id === req.params.id);
    
    if (!absence) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }
    
    // Récupérer les infos de l'employé pour la notification
    console.log('[API] Recherche employé avec ID:', absence.employeId, '(type:', typeof absence.employeId + ')');
    const employesData = await employeService.getEmployes();
    console.log('[API] Nombre d\'employés trouvés:', employesData.employes?.length || 0);
    console.log('[API] IDs employés disponibles:', employesData.employes?.slice(0, 5).map(e => ({ id: e.id, nom: e.nomComplet, typeId: typeof e.id })));
    
    // Utiliser une comparaison de strings pour être sûr de trouver l'employé
    const employe = employesData.employes.find(e => String(e.id) === String(absence.employeId));
    
    if (!employe) {
      console.error('[API] ⚠️ Employé non trouvé pour absence:', {
        absenceId: absence.id,
        absenceEmployeId: absence.employeId,
        employesIds: employesData.employes?.slice(0, 5).map(e => e.id)
      });
    } else {
      console.log('[API] ✅ Employé trouvé:', employe.nomComplet, '(ID:', employe.id + ')');
    }
    
    // Supprimer l'absence (retourne les infos avant suppression)
    const absenceInfo = await absenceService.supprimerAbsence(req.params.id, annulateurId, annulateurNom);
    
    if (!absenceInfo) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }
    
    console.log('[API] Absence supprimée, infos:', {
      id: absenceInfo.id,
      employeId: absenceInfo.employeId,
      dateDebut: absenceInfo.dateDebut,
      dateFin: absenceInfo.dateFin,
      type: absenceInfo.type
    });
    
    // Envoyer notification à l'employé si trouvé
    if (employe) {
      try {
        console.log('[API] Création notification d\'annulation pour employé:', employe.id, employe.nomComplet);
        const notification = await notificationService.notifierAnnulationAbsence(
          absenceInfo,
          employe,
          annulateurId,
          annulateurNom
        );
        console.log('[API] ✅ Notification d\'annulation créée avec succès:', {
          notificationId: notification.id,
          destinataireId: notification.destinataireId,
          destinataireNom: notification.destinataireNom,
          titre: notification.titre,
          type: notification.type
        });
      } catch (error) {
        console.error('[API] ❌ Erreur lors de l\'envoi de la notification d\'annulation:', error);
        console.error('[API] Stack trace:', error.stack);
        // Ne pas bloquer la suppression si la notification échoue
      }
    } else {
      console.warn('[API] ⚠️ Aucune notification envoyée car employé non trouvé');
    }
    
    res.json({ success: true, absenceInfo });
  } catch (error) {
    console.error('[API] Erreur DELETE /api/absences/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES SOLDES CP
// ═══════════════════════════════════════════════════════

router.get('/soldes-cp', async (req, res) => {
  try {
    console.log('[API] GET /api/soldes-cp');
    
    const employesData = await employeService.getEmployes();
    const employes = employesData.employes || [];
    const absences = await absenceService.getAbsences();
    
    const soldes = soldesService.calculerSoldesCP(employes, absences);
    
    res.json(soldes);
  } catch (error) {
    console.error('[API] Erreur /api/soldes-cp:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/soldes-cp/:employeId', async (req, res) => {
  try {
    console.log('[API] GET /api/soldes-cp/' + req.params.employeId);
    
    const employesData = await employeService.getEmployes();
    const employes = employesData.employes || [];
    const absences = await absenceService.getAbsences();
    
    const solde = soldesService.getSoldeEmploye(req.params.employeId, employes, absences);
    
    if (!solde) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    res.json(solde);
  } catch (error) {
    console.error('[API] Erreur /api/soldes-cp/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/soldes-cp/:employeId/report-n1', (req, res) => {
  try {
    console.log('[API] PUT /api/soldes-cp/:employeId/report-n1');
    
    const { employeId } = req.params;
    const { reportN1 } = req.body;
    
    if (reportN1 === undefined || reportN1 < 0) {
      return res.status(400).json({ error: 'Report N-1 invalide' });
    }
    
    const modif = soldesService.setReportN1Manuel(employeId, reportN1);
    res.json({ success: true, ...modif });
    
  } catch (error) {
    console.error('[API] Erreur PUT /api/soldes-cp/:employeId/report-n1:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES DOCUMENTS
// ═══════════════════════════════════════════════════════

router.get('/documents', async (req, res) => {
  try {
    console.log('[API] GET /api/documents');
    const documents = await documentService.getDocuments();
    res.json(documents);
  } catch (error) {
    console.error('[API] Erreur /api/documents:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/employe/:employeId', async (req, res) => {
  try {
    console.log('[API] GET /api/documents/employe/' + req.params.employeId);
    const documents = await documentService.getDocumentsByEmploye(req.params.employeId);
    res.json(documents);
  } catch (error) {
    console.error('[API] Erreur /api/documents/employe/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/documents/upload', uploadDocument.single('file'), async (req, res) => {
  try {
    console.log('[API] POST /api/documents/upload');
    
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    
    const { employeId, categorie, description, version, dateExpiration, heureVisite } = req.body;
    
    if (!employeId) {
      return res.status(400).json({ error: 'employeId requis' });
    }
    
    let doc = await documentService.ajouterDocument({
      employeId,
      categorie: categorie || 'AUTRE',
      description: description || '',
      version: version || 'unique',
      dateExpiration: dateExpiration || null,
      heureVisite: heureVisite || null, // Stocker l'heure pour les visites médicales
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
    
    // Si c'est une visite médicale créée par un manager ou RH, la valider automatiquement
    const userRole = req.body.userRole;
    if (categorie === 'VISITE_MEDICALE' && (userRole === 'MANAGER' || userRole === 'RH')) {
      const validateurNom = req.body.userNom || (userRole === 'MANAGER' ? 'Manager' : 'RH');
      const validateurId = req.body.userId || 'system';
      const docValide = await documentService.validerDocument(doc.id, validateurId, validateurNom);
      if (docValide) doc = docValide;
      console.log('[API] Visite médicale automatiquement validée par', validateurNom);
    }
    
    // Envoyer notification
    try {
      const employesData = await employeService.getEmployes();
      const employe = employesData.employes.find(e => e.id === employeId);
      if (employe) {
        // Si c'est une visite médicale, notifier le salarié avec priorité URGENTE
        if (categorie === 'VISITE_MEDICALE' && dateExpiration) {
          const heureVisiteFinale = req.body.heureVisite || req.body.description?.match(/à (\d{2}:\d{2})/)?.[1] || '09:00';
          const notifications = await notificationService.notifierVisiteMedicaleProgrammee(doc, employe, dateExpiration, heureVisiteFinale);
          if (Array.isArray(notifications)) {
            console.log(`[API] ${notifications.length} notifications visite médicale envoyées (salarié + managers):`, employe.nomComplet);
          } else {
            console.log('[API] Notification visite médicale envoyée au salarié:', employe.nomComplet);
          }
        } else {
          await notificationService.notifierUploadDocument(doc, employe);
        }
      }
    } catch (error) {
      console.error('[API] Erreur notification upload document:', error);
    }
    
    res.json(doc);
  } catch (error) {
    console.error('[API] Erreur POST /api/documents/upload:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/documents/:id/valider', async (req, res) => {
  try {
    console.log('[API] POST /api/documents/:id/valider');
    const { validateurId, validateurNom } = req.body;
    const document = await documentService.validerDocument(
      req.params.id,
      validateurId,
      validateurNom
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    
    // Envoyer notification
    try {
      const employesData = await employeService.getEmployes();
      const employe = employesData.employes.find(e => e.id === document.employeId);
      if (employe) {
        await notificationService.notifierValidationDocument(document, employe, validateurNom);
      }
    } catch (error) {
      console.error('[API] Erreur notification validation document:', error);
    }
    
    res.json(document);
  } catch (error) {
    console.error('[API] Erreur validation document:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/documents/:id/refuser', async (req, res) => {
  try {
    console.log('[API] POST /api/documents/:id/refuser');
    const { validateurId, validateurNom, motifRefus } = req.body;
    const document = await documentService.refuserDocument(
      req.params.id,
      validateurId,
      validateurNom,
      motifRefus
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    
    // Envoyer notification
    try {
      const employesData = await employeService.getEmployes();
      const employe = employesData.employes.find(e => e.id === document.employeId);
      if (employe) {
        await notificationService.notifierRefusDocument(document, employe, validateurNom, motifRefus);
      }
    } catch (error) {
      console.error('[API] Erreur notification refus document:', error);
    }
    
    res.json(document);
  } catch (error) {
    console.error('[API] Erreur refus document:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/employe/:employeId/alertes', async (req, res) => {
  try {
    console.log('[API] GET /api/documents/employe/:employeId/alertes');
    const alertes = await documentService.calculerAlertesExpiration(req.params.employeId);
    res.json(alertes);
  } catch (error) {
    console.error('[API] Erreur alertes documents:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/employe/:employeId/manquants', async (req, res) => {
  try {
    console.log('[API] GET /api/documents/employe/:employeId/manquants');
    const manquants = await documentService.verifierDocumentsManquants(req.params.employeId);
    res.json(manquants);
  } catch (error) {
    console.error('[API] Erreur documents manquants:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/visites-medicales/planning', async (req, res) => {
  try {
    console.log('[API] GET /api/documents/visites-medicales/planning');
    const { mois, annee } = req.query;
    const visites = await documentService.getVisitesMedicalesPourPlanning(
      parseInt(mois),
      parseInt(annee)
    );
    res.json(visites);
  } catch (error) {
    console.error('[API] Erreur planning visites médicales:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/documents/:id', async (req, res) => {
  try {
    console.log('[API] PUT /api/documents/:id');
    const { dateExpiration, description, heureVisite } = req.body;
    
    const docModifie = await documentService.modifierDocument(req.params.id, {
      dateExpiration: dateExpiration || null,
      description: description || '',
      heureVisite: heureVisite || null
    });
    
    if (!docModifie) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    
    console.log('[API] Document modifié:', docModifie.id);
    res.json(docModifie);
  } catch (error) {
    console.error('[API] Erreur modification document:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    console.log('[API] DELETE /api/documents/' + req.params.id);
    const success = await documentService.supprimerDocument(req.params.id);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Document non trouvé' });
    }
  } catch (error) {
    console.error('[API] Erreur DELETE /api/documents/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/:id/download', async (req, res) => {
  try {
    console.log('[API] GET /api/documents/:id/download');
    const doc = await documentService.getDocumentById(req.params.id);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    
    const filepath = path.join(documentService.UPLOAD_DIR, doc.filename);
    res.download(filepath, doc.originalName);
  } catch (error) {
    console.error('[API] Erreur download:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════
// ROUTES ACOMPTES
// ═══════════════════════════════════════════════════════

router.get('/acomptes', async (req, res) => {
  try {
    console.log('[API] GET /api/acomptes');
    const acomptes = await acompteService.getAcomptes();
    
    // Enrichir avec les noms des employés
    const employesData = await employeService.getEmployes();
    const acomptesAvecEmployes = acomptes.map(acompte => {
      const employe = employesData.employes.find(e => String(e.id) === String(acompte.employeId));
      return {
        ...acompte,
        employeNom: employe?.nomComplet || 'Inconnu'
      };
    });
    
    res.json(acomptesAvecEmployes);
  } catch (error) {
    console.error('[API] Erreur /api/acomptes:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/employe/:employeId', async (req, res) => {
  try {
    console.log('[API] GET /api/acomptes/employe/' + req.params.employeId);
    const acomptes = await acompteService.getAcomptesByEmploye(req.params.employeId);
    res.json(acomptes);
  } catch (error) {
    console.error('[API] Erreur /api/acomptes/employe/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/employe/:employeId/historique', async (req, res) => {
  try {
    console.log('[API] GET /api/acomptes/employe/:employeId/historique');
    const { annee, mois, statut } = req.query;
    const options = {};
    if (annee) options.annee = parseInt(annee);
    if (mois) options.mois = parseInt(mois);
    if (statut) options.statut = statut;
    
    const historique = await acompteService.getHistoriqueAcomptes(
      req.params.employeId,
      options
    );
    res.json(historique);
  } catch (error) {
    console.error('[API] Erreur historique acomptes:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/acomptes', async (req, res) => {
  try {
    const { employeId, montant, motif, creeParManager, managerId, managerNom } = req.body;
    
    // Récupérer l'employé
    const employesData = await employeService.getEmployes();
    const employe = employesData.employes.find(e => String(e.id) === String(employeId));
    
    if (!employe) {
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    // Si créé par le manager, on saute la vérification d'éligibilité et on valide automatiquement
    if (creeParManager) {
      console.log('[API] POST /api/acomptes - Création par manager');
      
      let acompte = await acompteService.ajouterAcompte({
        employeId,
        montant: parseFloat(montant),
        motif: motif || 'Acompte créé par le manager'
      });
      
      // Valider automatiquement avec les modalités fournies
      const validateurId = managerId || 'system';
      const validateurNom = managerNom || 'Manager';
      
      // Utiliser les modalités fournies ou par défaut paiement unique
      const modalites = req.body.modalites || {
        type: 'UNIQUE',
        nbMensualites: 1,
        mensualites: [{
          numero: 1,
          mois: new Date().toISOString().substring(0, 7),
          montant: parseFloat(montant)
        }]
      };
      
      acompte = await acompteService.validerAcompteAvecModalites(
        acompte.id,
        validateurId,
        validateurNom,
        modalites
      );
      if (!acompte) {
        return res.status(500).json({ error: 'Impossible de valider l\'acompte créé' });
      }
      
      console.log('[API] Acompte validé automatiquement par le manager');
      
      // Notification au salarié
      try {
        await notificationService.creerNotification({
          type: 'ACOMPTE_VALIDE',
          titre: 'Acompte validé',
          message: `Votre acompte de ${montant}€ a été créé et validé par le manager`,
          destinataireId: employeId,
          destinataireNom: employe.nomComplet,
          acompteId: acompte.id,
          employeId,
          employeNom: employe.nomComplet,
          priorite: 'NORMALE'
        });
        console.log('[API] Notification envoyée au salarié');
      } catch (notifError) {
        console.error('[API] Erreur notification salarié:', notifError);
      }
      
      // Notification au comptable
      try {
        const comptables = (await authService.getAllUtilisateurs()).filter(u => u.role === 'COMPTABLE');
        for (const comptable of comptables) {
          await notificationService.creerNotification({
            type: 'ACOMPTE_VALIDE_MANAGER',
            titre: 'Nouvel acompte validé',
            message: `Acompte de ${montant}€ pour ${employe.nomComplet} créé par le manager`,
            destinataireId: comptable.userId || comptable.id,
            destinataireNom: comptable.nom || comptable.nomComplet,
            acompteId: acompte.id,
            employeId,
            employeNom: employe.nomComplet,
            priorite: 'NORMALE'
          });
        }
        console.log(`[API] ${comptables.length} notification(s) envoyée(s) au(x) comptable(s)`);
      } catch (notifError) {
        console.error('[API] Erreur notification comptable:', notifError);
      }
      
      return res.json({ success: true, acompte });
    }
    
    // Comportement normal : création par le salarié
    const eligibilite = await acompteService.verifierEligibilite(employeId, montant);
    if (!eligibilite.eligible) {
      return res.status(400).json({ error: eligibilite.errors.join(', ') });
    }
    
    const acompte = await acompteService.ajouterAcompte({
      employeId,
      montant: parseFloat(montant),
      motif: motif || 'Sans motif spécifié'
    });
    
    // Notification au manager
    const managers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'MANAGER');
    
    console.log('[API] POST /api/acomptes - Recherche employé:', {
      employeId,
      typeEmployeId: typeof employeId,
      employeTrouve: !!employe,
      nomEmploye: employe?.nomComplet
    });
    
    for (const manager of managers) {
      await notificationService.creerNotification({
        type: 'ACOMPTE_DEMANDE',
        titre: "💰 Nouvelle demande d'acompte",
        message: `${employe?.nomComplet} demande un acompte de ${montant}€`,
        details: motif,
        destinataireId: manager.userId || manager.id,
        destinataireNom: manager.nom || manager.nomComplet,
        acompteId: acompte.id,
        employeId,
        employeNom: employe?.nomComplet,
        actionRequise: true,
        priorite: 'NORMALE',
        icone: '💰',
        couleur: 'green'
      });
    }
    
    res.json(acompte);
  } catch (error) {
    console.error('[API] Erreur POST /api/acomptes:', error);
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLE ROUTE : Manager valide avec modalités
router.post('/acomptes/:id/valider-avec-modalites', async (req, res) => {
  try {
    console.log('[API] POST /api/acomptes/:id/valider-avec-modalites');
    console.log('[API] Paramètres:', req.params);
    console.log('[API] Body:', req.body);
    
    const { validateurId, validateurNom, modalites } = req.body;
    
    if (!validateurId || !validateurNom || !modalites) {
      console.error('[API] Paramètres manquants:', { validateurId, validateurNom, modalites });
      return res.status(400).json({ error: 'Paramètres manquants: validateurId, validateurNom et modalites requis' });
    }
    
    const acompte = await acompteService.validerAcompteAvecModalites(
      req.params.id,
      validateurId,
      validateurNom,
      modalites
    );
    
    if (!acompte) {
      console.error('[API] Acompte non trouvé:', req.params.id);
      return res.status(404).json({ error: 'Acompte non trouvé' });
    }
    
    console.log('[API] Acompte validé:', acompte.id);
    console.log('[API] Recherche employé avec ID:', acompte.employeId, '(type:', typeof acompte.employeId + ')');
    
    const employesData = await employeService.getEmployes();
    console.log('[API] Nombre d\'employés trouvés:', employesData.employes?.length || 0);
    console.log('[API] IDs employés disponibles:', employesData.employes?.slice(0, 5).map(e => ({ id: e.id, nom: e.nomComplet, typeId: typeof e.id })));
    
    // Utiliser une comparaison de strings pour être sûr de trouver l'employé
    const employe = employesData.employes.find(e => String(e.id) === String(acompte.employeId));
    
    if (!employe) {
      console.error('[API] Employé non trouvé pour acompte:', {
        acompteId: acompte.id,
        acompteEmployeId: acompte.employeId,
        typeAcompteEmployeId: typeof acompte.employeId,
        employesIds: employesData.employes?.slice(0, 5).map(e => ({ id: e.id, type: typeof e.id }))
      });
      return res.status(404).json({ error: `Employé non trouvé pour l'ID: ${acompte.employeId}` });
    }
    
    console.log('[API] ✅ Employé trouvé:', employe.nomComplet, '(ID:', employe.id + ')');
    
    // Notification à l'employé avec détails des mensualités
    const detailsMensualites = acompte.mensualites.map(m => 
      `${m.mois}: ${m.montant}€`
    ).join(' | ');
    
    await notificationService.creerNotification({
      type: 'ACOMPTE_VALIDE_MANAGER',
      titre: '✓ Acompte validé par votre manager',
      message: modalites.type === 'UNIQUE' 
        ? `Votre acompte de ${acompte.montant}€ a été validé. Paiement prévu en ${acompte.mensualites && acompte.mensualites.length > 0 ? acompte.mensualites[0].mois : (modalites.moisDebut || 'date non définie')}.`
        : `Votre acompte de ${acompte.montant}€ a été validé. Paiement en ${modalites.nbMensualites} fois: ${detailsMensualites}`,
      destinataireId: employe.id,
      destinataireNom: employe.nomComplet,
      acompteId: acompte.id,
      actionRequise: false,
      priorite: 'HAUTE',
      icone: '✓',
      couleur: 'green'
    });
    
    // Vérifier que les mensualités ont été créées
    if (!acompte.mensualites || acompte.mensualites.length === 0) {
      console.error('[API] Erreur: Aucune mensualité créée pour l\'acompte:', acompte.id);
      return res.status(500).json({ error: 'Erreur lors de la création des mensualités' });
    }
    
    console.log('[API] Mensualités créées:', acompte.mensualites.length);
    
    // Notification au comptable
    const comptables = (await authService.getAllUtilisateurs()).filter(u => u.role === 'COMPTABLE');
    for (const comptable of comptables) {
      const premiereMensualite = acompte.mensualites[0];
      await notificationService.creerNotification({
        type: 'ACOMPTE_A_PAYER',
        titre: '💰 Acompte à régler',
        message: `${employe.nomComplet} - ${acompte.montant}€ (${modalites.type === 'UNIQUE' ? '1 fois' : modalites.nbMensualites + ' mensualités'})`,
        details: `Première mensualité: ${premiereMensualite.mois} - ${premiereMensualite.montant}€`,
        destinataireId: comptable.id,
        destinataireNom: comptable.nom,
        acompteId: acompte.id,
        employeId: employe.id,
        actionRequise: true,
        priorite: 'HAUTE',
        icone: '💰',
        couleur: 'purple'
      });
    }

    // Envoi email via Microsoft Graph
    try {
      const { getApiCredentials } = require('./services/database');
      const graphMailService = require('./services/graphMailService');
      const dbCreds = (await getApiCredentials('microsoft_graph')) || {};
      const tenantId = dbCreds.tenantId || process.env.MS_GRAPH_TENANT_ID;
      const clientId = dbCreds.clientId || process.env.MS_GRAPH_CLIENT_ID;
      const clientSecret = dbCreds.clientSecret || process.env.MS_GRAPH_CLIENT_SECRET;
      const fromEmail = dbCreds.fromEmail || process.env.MS_GRAPH_FROM_EMAIL;

      if (tenantId && clientId && clientSecret && employe?.email) {
        await graphMailService.sendMail({
          tenantId,
          clientId,
          clientSecret,
          fromEmail,
          to: employe.email,
          subject: "✓ Votre demande d'acompte a été validée",
          body: `
        <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #2563EB; border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">G2L Platform</h1>
          </div>
          <div style="background: white; border: 1px solid #E4E7EE; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
            <div style="background: #ECFDF5; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
              <h2 style="color: #10B981; margin: 0; font-size: 18px;">Demande d'acompte validée</h2>
            </div>
            <p style="color: #0F1729; font-size: 14px;">Bonjour <strong>${employe.nomComplet}</strong>,</p>
            <p style="color: #6B7280; font-size: 14px;">Votre demande d'acompte de <strong style="color: #0F1729;">${acompte.montant} €</strong> a été validée par <strong>${validateurNom || 'votre responsable'}</strong>.</p>
            <div style="background: #F7F8FA; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #6B7280; font-size: 13px;">Montant validé</span>
                <strong style="color: #0F1729; font-size: 13px;">${acompte.montant} €</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #6B7280; font-size: 13px;">Date de validation</span>
                <strong style="color: #0F1729; font-size: 13px;">${new Date().toLocaleDateString('fr-FR')}</strong>
              </div>
            </div>
            <p style="color: #6B7280; font-size: 12px; margin-top: 24px; text-align: center;">
              Le virement sera effectué selon les modalités convenues.
            </p>
          </div>
          <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin-top: 16px;">
            G2L Platform · Groupe G2L — Perpignan · ${new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
      `
        });
        console.log('[Email] Notification validation acompte envoyée à:', employe.email);
      }
    } catch (emailErr) {
      console.warn('[Email] Erreur envoi email validation acompte:', emailErr.message);
    }

    // NOTE: La RH ne reçoit PAS de notification ici
    // Elle recevra une notification uniquement quand le comptable effectue un paiement

    res.json(acompte);
  } catch (error) {
    console.error('[API] Erreur lors de la validation avec modalités:', error);
    console.error('[API] Stack trace:', error.stack);
    res.status(500).json({ error: error.message || 'Erreur lors de la validation de l\'acompte' });
  }
});

// Route refus (reste identique)
router.post('/acomptes/:id/refuser', async (req, res) => {
  try {
    const { validateurId, validateurNom, motifRefus } = req.body;
    
    const acompte = await acompteService.refuserAcompte(
      req.params.id,
      validateurId,
      validateurNom,
      motifRefus
    );
    
    if (!acompte) {
      return res.status(404).json({ error: 'Acompte non trouvé' });
    }
    
    const employesData = await employeService.getEmployes();
    const employe = employesData.employes.find(e => e.id === acompte.employeId);
    
    await notificationService.creerNotification({
      type: 'ACOMPTE_REFUSE',
      titre: '✗ Acompte refusé',
      message: `Votre demande d'acompte de ${acompte.montant}€ a été refusée par ${validateurNom}`,
      details: motifRefus,
      destinataireId: employe.id,
      destinataireNom: employe.nomComplet,
      acompteId: acompte.id,
      actionRequise: false,
      priorite: 'HAUTE',
      icone: '✗',
      couleur: 'red'
    });

    // Envoi email via Microsoft Graph
    try {
      const { getApiCredentials } = require('./services/database');
      const graphMailService = require('./services/graphMailService');
      const dbCreds = (await getApiCredentials('microsoft_graph')) || {};
      const tenantId = dbCreds.tenantId || process.env.MS_GRAPH_TENANT_ID;
      const clientId = dbCreds.clientId || process.env.MS_GRAPH_CLIENT_ID;
      const clientSecret = dbCreds.clientSecret || process.env.MS_GRAPH_CLIENT_SECRET;
      const fromEmail = dbCreds.fromEmail || process.env.MS_GRAPH_FROM_EMAIL;

      if (tenantId && clientId && clientSecret && employe?.email) {
        await graphMailService.sendMail({
          tenantId,
          clientId,
          clientSecret,
          fromEmail,
          to: employe.email,
          subject: "✗ Votre demande d'acompte a été refusée",
          body: `
        <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #2563EB; border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">G2L Platform</h1>
          </div>
          <div style="background: white; border: 1px solid #E4E7EE; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
            <div style="background: #FEF2F2; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 8px;">✗</div>
              <h2 style="color: #EF4444; margin: 0; font-size: 18px;">Demande d'acompte refusée</h2>
            </div>
            <p style="color: #0F1729; font-size: 14px;">Bonjour <strong>${employe.nomComplet}</strong>,</p>
            <p style="color: #6B7280; font-size: 14px;">Votre demande d'acompte de <strong style="color: #0F1729;">${acompte.montant} €</strong> a été refusée par <strong>${validateurNom}</strong>.</p>
            ${
              motifRefus
                ? `<div style="background: #F7F8FA; border-left: 4px solid #EF4444; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #6B7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Motif</p>
              <p style="color: #0F1729; font-size: 14px; margin: 0;">${motifRefus}</p>
            </div>`
                : ''
            }
            <p style="color: #6B7280; font-size: 12px; margin-top: 24px; text-align: center;">
              Pour toute question, contactez votre responsable RH.
            </p>
          </div>
          <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin-top: 16px;">
            G2L Platform · Groupe G2L — Perpignan · ${new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
      `
        });
        console.log('[Email] Notification refus acompte envoyée à:', employe.email);
      }
    } catch (emailErr) {
      console.warn('[Email] Erreur envoi email refus acompte:', emailErr.message);
    }

    res.json(acompte);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLE ROUTE : Comptable valide un paiement
router.post('/acomptes/:id/valider-paiement', async (req, res) => {
  try {
    console.log('[API] POST /api/acomptes/:id/valider-paiement - Début');
    const { numeroMensualite, comptableId, comptableNom, datePaiement, referenceVirement } = req.body;
    
    console.log('[API] Paramètres reçus:', {
      acompteId: req.params.id,
      numeroMensualite,
      comptableId,
      datePaiement,
      referenceVirement
    });
    
    // Vérifier que tous les champs requis sont présents
    if (!numeroMensualite || !comptableId || !datePaiement || !referenceVirement) {
      console.error('[API] Champs manquants:', {
        numeroMensualite: !!numeroMensualite,
        comptableId: !!comptableId,
        datePaiement: !!datePaiement,
        referenceVirement: !!referenceVirement
      });
      return res.status(400).json({ error: 'Tous les champs sont requis (numeroMensualite, comptableId, datePaiement, referenceVirement)' });
    }
    
    const result = await acompteService.validerPaiementMensualite(
      req.params.id,
      numeroMensualite,
      comptableId,
      comptableNom,
      datePaiement,
      referenceVirement
    );
    
    if (!result) {
      console.error('[API] Acompte ou mensualité non trouvé');
      return res.status(404).json({ error: 'Acompte ou mensualité non trouvé' });
    }
    
    console.log('[API] Paiement validé avec succès:', {
      acompteId: result.acompte.id,
      restantDu: result.restantDu,
      estPremierPaiement: result.estPremierPaiement
    });
    
    const { acompte, restantDu, estPremierPaiement } = result;
    const employesData = await employeService.getEmployes();
    const employe = employesData.employes.find(e => String(e.id) === String(acompte.employeId));
    
    if (!employe) {
      console.error('[API] Employé non trouvé pour acompte:', acompte.employeId);
      return res.status(404).json({ error: 'Employé non trouvé' });
    }
    
    // Récupérer la mensualité (déjà validée par validerPaiementMensualite)
    const mensualite = acompte.mensualites.find(m => m.numero === numeroMensualite);
    
    if (!mensualite) {
      console.error('[API] Mensualité non trouvée après validation');
      return res.status(404).json({ error: 'Mensualité non trouvée' });
    }
    
    // Notification à l'employé
    await notificationService.creerNotification({
      type: 'PAIEMENT_EFFECTUE',
      titre: '💰 Paiement effectué',
      message: restantDu > 0 
        ? `Mensualité ${numeroMensualite}/${acompte.mensualites.length} payée: ${mensualite.montant}€. Restant dû: ${restantDu.toFixed(2)}€`
        : `Dernier paiement effectué: ${mensualite.montant}€. Acompte soldé ✓`,
      details: `Référence: ${referenceVirement} | Date: ${new Date(datePaiement).toLocaleDateString('fr-FR')}`,
      destinataireId: employe.id,
      destinataireNom: employe.nomComplet,
      acompteId: acompte.id,
      actionRequise: false,
      priorite: 'NORMALE',
      icone: '💰',
      couleur: 'green'
    });
    
    // Notification à la RH : "Accomptes à Traiter" UNIQUEMENT quand le comptable effectue un paiement
    // Vérifier que le paiement a bien été validé (la mensualité doit être PAYEE)
    try {
      if (mensualite && mensualite.statut === 'PAYEE') {
        console.log('[API] Paiement validé, création notification RH pour acompte:', acompte.id);
        const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');
        if (rhUsers.length > 0) {
          for (const rhUser of rhUsers) {
            await notificationService.creerNotification({
              type: 'ACOMPTE_A_PAYER',
              titre: '💰 Accompte à traiter',
              message: `${employe.nomComplet} - ${acompte.montant}€ (${acompte.mensualites.length} mensualités)`,
              details: `Mensualité ${numeroMensualite}/${acompte.mensualites.length} payée: ${mensualite.montant}€. Restant dû: ${restantDu.toFixed(2)}€`,
              destinataireId: rhUser.id,
              destinataireNom: rhUser.nom,
              acompteId: acompte.id,
              employeId: employe.id,
              actionRequise: true,
              priorite: 'HAUTE',
              icone: '💰',
              couleur: 'purple'
            });
          }
        } else {
          console.log('[API] Aucun utilisateur RH trouvé pour notification');
        }
      } else {
        console.log('[API] ERREUR: Paiement non validé, notification RH non créée. Mensualité statut:', mensualite?.statut);
      }
    } catch (notifError) {
      console.error('[API] Erreur lors de la création de notification RH:', notifError);
      // Ne pas bloquer le paiement si la notification échoue
    }

    // Envoi email via Microsoft Graph — notification paiement à l'employé
    try {
      const { getApiCredentials } = require('./services/database');
      const graphMailService = require('./services/graphMailService');
      const dbCreds = (await getApiCredentials('microsoft_graph')) || {};
      const tenantId = dbCreds.tenantId || process.env.MS_GRAPH_TENANT_ID;
      const clientId = dbCreds.clientId || process.env.MS_GRAPH_CLIENT_ID;
      const clientSecret = dbCreds.clientSecret || process.env.MS_GRAPH_CLIENT_SECRET;
      const fromEmail = dbCreds.fromEmail || process.env.MS_GRAPH_FROM_EMAIL;

      if (tenantId && clientId && clientSecret && employe?.email) {
        const estSolde = restantDu <= 0;
        const detailsMensualites = acompte.mensualites
          .map(
            (m) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #F0F2F6; font-size: 13px; color: #6B7280;">Mensualité ${m.numero}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #F0F2F6; font-size: 13px; color: #0F1729;">${m.mois}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #F0F2F6; font-size: 13px; font-weight: 600; color: #0F1729;">${m.montant} €</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #F0F2F6; font-size: 13px;">
          <span style="background: ${m.statut === 'PAYEE' ? '#ECFDF5' : '#F0F2F6'}; color: ${m.statut === 'PAYEE' ? '#10B981' : '#6B7280'}; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;">
            ${m.statut === 'PAYEE' ? '✓ Payée' : 'En attente'}
          </span>
        </td>
      </tr>
    `
          )
          .join('');

        await graphMailService.sendMail({
          tenantId,
          clientId,
          clientSecret,
          fromEmail,
          to: employe.email,
          subject: estSolde
            ? '✓ Votre acompte a été intégralement remboursé'
            : `💰 Paiement de votre acompte — Mensualité ${numeroMensualite}/${acompte.mensualites.length}`,
          body: `
        <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #2563EB; border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">G2L Platform</h1>
          </div>
          <div style="background: white; border: 1px solid #E4E7EE; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
            <div style="background: ${estSolde ? '#ECFDF5' : '#EFF6FF'}; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 8px;">${estSolde ? '🎉' : '💰'}</div>
              <h2 style="color: ${estSolde ? '#10B981' : '#2563EB'}; margin: 0; font-size: 18px;">
                ${estSolde ? 'Acompte soldé' : `Paiement mensualité ${numeroMensualite}/${acompte.mensualites.length}`}
              </h2>
            </div>
            
            <p style="color: #0F1729; font-size: 14px;">Bonjour <strong>${employe.nomComplet}</strong>,</p>
            <p style="color: #6B7280; font-size: 14px;">
              ${
                estSolde
                  ? `Votre acompte de <strong style="color: #0F1729;">${acompte.montant} €</strong> a été intégralement remboursé. ✓`
                  : `La mensualité <strong>${numeroMensualite}/${acompte.mensualites.length}</strong> de votre acompte a été prélevée.`
              }
            </p>

            <!-- Détails paiement -->
            <div style="background: #F7F8FA; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E4E7EE;">
                <span style="color: #6B7280; font-size: 13px;">Montant prélevé</span>
                <strong style="color: #0F1729; font-size: 13px;">${mensualite.montant} €</strong>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E4E7EE;">
                <span style="color: #6B7280; font-size: 13px;">Date de paiement</span>
                <strong style="color: #0F1729; font-size: 13px;">${new Date(datePaiement).toLocaleDateString('fr-FR')}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E4E7EE;">
                <span style="color: #6B7280; font-size: 13px;">Référence virement</span>
                <strong style="color: #0F1729; font-size: 13px; font-family: monospace;">${referenceVirement}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                <span style="color: #6B7280; font-size: 13px;">Restant dû</span>
                <strong style="color: ${estSolde ? '#10B981' : '#EF4444'}; font-size: 13px;">${estSolde ? '0 € ✓' : `${restantDu.toFixed(2)} €`}</strong>
              </div>
            </div>

            <!-- Échéancier -->
            ${
              acompte.mensualites.length > 1
                ? `
            <div style="margin-top: 20px;">
              <p style="color: #0F1729; font-size: 13px; font-weight: 600; margin-bottom: 8px;">Échéancier complet</p>
              <table style="width: 100%; border-collapse: collapse; border: 1px solid #E4E7EE; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background: #F7F8FA;">
                    <th style="padding: 8px 12px; text-align: left; font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">N°</th>
                    <th style="padding: 8px 12px; text-align: left; font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Mois</th>
                    <th style="padding: 8px 12px; text-align: left; font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Montant</th>
                    <th style="padding: 8px 12px; text-align: left; font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Statut</th>
                  </tr>
                </thead>
                <tbody>${detailsMensualites}</tbody>
              </table>
            </div>`
                : ''
            }

            <p style="color: #6B7280; font-size: 12px; margin-top: 24px; text-align: center;">
              Pour toute question, contactez votre service RH.
            </p>
          </div>
          <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin-top: 16px;">
            G2L Platform · Groupe G2L — Perpignan · ${new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
      `
        });
        console.log('[Email] Notification paiement acompte envoyée à:', employe.email);
      }
    } catch (emailErr) {
      console.warn('[Email] Erreur envoi email paiement acompte:', emailErr.message);
    }

    // Si c'est le premier paiement et qu'il reste à payer, notifier le comptable pour "Accompte en cours"
    if (estPremierPaiement && restantDu > 0) {
      try {
        const comptables = (await authService.getAllUtilisateurs()).filter(u => u.role === 'COMPTABLE');
        for (const comptable of comptables) {
          await notificationService.creerNotification({
            type: 'ACOMPTE_EN_COURS',
            titre: '💰 Accompte en cours de paiement',
            message: `${employe.nomComplet} - ${acompte.montant}€ (${acompte.mensualites.length} mensualités)`,
            details: `Premier paiement effectué. Restant dû: ${restantDu.toFixed(2)}€`,
            destinataireId: comptable.id,
            destinataireNom: comptable.nom,
            acompteId: acompte.id,
            employeId: employe.id,
            actionRequise: true,
            priorite: 'HAUTE',
            icone: '💰',
            couleur: 'yellow'
          });
        }
        
        // Notification à la RH pour "Accompte en cours" (si premier paiement et restant dû)
        const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');
        for (const rhUser of rhUsers) {
          await notificationService.creerNotification({
            type: 'ACOMPTE_EN_COURS',
            titre: '💰 Accompte en cours de paiement',
            message: `${employe.nomComplet} - ${acompte.montant}€ (${acompte.mensualites.length} mensualités)`,
            details: `Premier paiement effectué. Restant dû: ${restantDu.toFixed(2)}€`,
            destinataireId: rhUser.id,
            destinataireNom: rhUser.nom,
            acompteId: acompte.id,
            employeId: employe.id,
            actionRequise: true,
            priorite: 'HAUTE',
            icone: '💰',
            couleur: 'yellow'
          });
        }
      } catch (notifError) {
        console.error('[API] Erreur lors de la création de notifications "en cours":', notifError);
        // Ne pas bloquer le paiement si les notifications échouent
      }
    }
    
    res.json({ acompte, restantDu });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLE ROUTE : Nombre d'acomptes en attente de validation (pour manager)
router.get('/acomptes/manager/en-attente/count', async (req, res) => {
  try {
    const acomptesEnAttente = await acompteService.getAcomptesEnAttenteValidation();
    res.json({ count: acomptesEnAttente.length });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes en attente:', error);
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLES ROUTES : Compteur pour chaque catégorie de comptable
router.get('/acomptes/comptable/nouveaux/count', async (req, res) => {
  try {
    const acomptesNouveaux = await acompteService.getAcomptesNouveaux();
    res.json({ count: acomptesNouveaux.length });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes nouveaux:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/comptable/en-cours/count', async (req, res) => {
  try {
    const acomptesEnCours = await acompteService.getAcomptesEnCours();
    
    // Compter les notifications non lues de type ACOMPTE_EN_COURS pour tous les comptables
    const comptables = (await authService.getAllUtilisateurs()).filter(u => u.role === 'COMPTABLE');
    let totalNotifications = 0;
    
    for (const comptable of comptables) {
      const notifications = await notificationService.getNotificationsByUser(comptable.id, comptable.salesforceId);
      const notificationsEnCours = notifications.filter(n => 
        n.type === 'ACOMPTE_EN_COURS' && !n.lue
      );
      totalNotifications += notificationsEnCours.length;
    }
    
    // Le count est le maximum entre le nombre d'acomptes en cours et les notifications non lues
    res.json({ count: Math.max(acomptesEnCours.length, totalNotifications) });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes en cours:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/comptable/traites/count', async (req, res) => {
  try {
    const acomptesTraites = await acompteService.getAcomptesTraites();
    res.json({ count: acomptesTraites.length });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes traités:', error);
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLES ROUTES : Compteur pour chaque catégorie de RH
router.get('/acomptes/rh/a-traiter/count', async (req, res) => {
  try {
    // Pour la RH, "Accomptes à Traiter" = acomptes qui ont au moins une mensualité PAYEE mais pas encore traitée
    const acomptesRHATraiter = await acompteService.getAcomptesRHATraiter();
    
    // Compter les notifications non lues de type ACOMPTE_A_PAYER pour la RH
    // Mais seulement pour les acomptes qui ont encore des mensualités non traitées
    const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');
    const acomptesPourRhNotif = await acompteService.getAcomptes();
    let totalNotifications = 0;
    
    for (const rhUser of rhUsers) {
      const notifications = await notificationService.getNotificationsByUser(rhUser.id, rhUser.salesforceId);
      const notificationsATraiter = notifications.filter(n => {
        if (n.type !== 'ACOMPTE_A_PAYER' || n.lue) return false;
        
        // Vérifier que l'acompte correspondant a encore des mensualités non traitées
        const acompte = acomptesPourRhNotif.find(a => a.id === n.acompteId);
        if (!acompte) return false;
        
        const mensualitesPayees = (acompte.mensualites || []).filter(m => m.statut === 'PAYEE');
        const mensualitesTraiteesParRH = acompte.mensualitesTraiteesParRH || [];
        const mensualitesPayeesNonTraitees = mensualitesPayees.filter(m => 
          !mensualitesTraiteesParRH.includes(m.numero)
        );
        
        return mensualitesPayeesNonTraitees.length > 0;
      });
      totalNotifications += notificationsATraiter.length;
    }
    
    // Le count est le maximum entre le nombre d'acomptes avec paiement validé non traités et les notifications non lues
    res.json({ count: Math.max(acomptesRHATraiter.length, totalNotifications) });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes RH à traiter:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/rh/en-cours/count', async (req, res) => {
  try {
    const acomptesRHEnCours = await acompteService.getAcomptesRHEnCours();
    
    // Compter les notifications non lues de type ACOMPTE_EN_COURS pour la RH
    const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');
    let totalNotifications = 0;
    
    for (const rhUser of rhUsers) {
      const notifications = await notificationService.getNotificationsByUser(rhUser.id, rhUser.salesforceId);
      const notificationsEnCours = notifications.filter(n => 
        n.type === 'ACOMPTE_EN_COURS' && !n.lue
      );
      totalNotifications += notificationsEnCours.length;
    }
    
    res.json({ count: Math.max(acomptesRHEnCours.length, totalNotifications) });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes RH en cours:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/rh/traites/count', async (req, res) => {
  try {
    const acomptesRHTraites = await acompteService.getAcomptesRHTraites();
    res.json({ count: acomptesRHTraites.length });
  } catch (error) {
    console.error('[API] Erreur récupération nombre acomptes RH traités:', error);
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLE ROUTE : Liste des acomptes en attente de paiement (pour comptable)
router.get('/acomptes/attente-paiement', async (req, res) => {
  try {
    const acomptes = await acompteService.getAcomptesEnAttentePaiement();
    
    // Enrichir avec les noms des employés
    const employesData = await employeService.getEmployes();
    const acomptesAvecEmployes = acomptes.map(acompte => {
      const employe = employesData.employes.find(e => String(e.id) === String(acompte.employeId));
      return {
        ...acompte,
        employeNom: employe?.nomComplet || 'Inconnu',
        employeId: acompte.employeId
      };
    });
    
    res.json(acomptesAvecEmployes);
  } catch (error) {
    console.error('[API] Erreur récupération acomptes attente paiement:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/verifier-eligibilite/:employeId', async (req, res) => {
  try {
    console.log('[API] GET /api/acomptes/verifier-eligibilite/' + req.params.employeId);
    const { montant } = req.query;
    
    if (!montant) {
      return res.status(400).json({ error: 'montant requis' });
    }
    
    const verification = await acompteService.verifierEligibilite(
      req.params.employeId,
      parseFloat(montant)
    );
    
    res.json(verification);
  } catch (error) {
    console.error('[API] Erreur vérification éligibilité:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analytics dashboard manager
router.get('/acomptes/analytics/dashboard', async (req, res) => {
  try {
    const analytics = await acompteAnalyticsService.getAnalyticsDashboard();
    res.json(analytics);
  } catch (error) {
    console.error('[API] Erreur analytics dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// Demandes en attente avec priorités
router.get('/acomptes/analytics/en-attente', async (req, res) => {
  try {
    const demandes = await acompteAnalyticsService.getDemandesEnAttente();
    res.json(demandes);
  } catch (error) {
    console.error('[API] Erreur demandes en attente:', error);
    res.status(500).json({ error: error.message });
  }
});

// Historique récent
router.get('/acomptes/analytics/historique-recent', async (req, res) => {
  try {
    const { limit } = req.query;
    const historique = await acompteAnalyticsService.getHistoriqueRecent(
      limit ? parseInt(limit) : 10
    );
    res.json(historique);
  } catch (error) {
    console.error('[API] Erreur historique récent:', error);
    res.status(500).json({ error: error.message });
  }
});

// NOUVELLE ROUTE : RH marque une mensualité comme traitée
router.post('/acomptes/:id/marquer-traite-rh', async (req, res) => {
  try {
    console.log('[API] POST /api/acomptes/:id/marquer-traite-rh');
    const { numeroMensualite, rhId, rhNom } = req.body;
    
    if (!numeroMensualite || !rhId) {
      return res.status(400).json({ error: 'numeroMensualite et rhId requis' });
    }
    
    const result = await acompteService.marquerTraiteParRH(req.params.id, numeroMensualite, rhId, rhNom);
    
    if (!result) {
      return res.status(404).json({ error: 'Acompte ou mensualité non trouvé' });
    }
    
    const { acompte, estCompletementTraite, mensualitesTraitees, totalMensualites } = result;
    
    // Marquer les notifications ACOMPTE_A_PAYER pour cet acompte comme lues pour la RH
    const rhUsers = (await authService.getAllUtilisateurs()).filter(u => u.role === 'RH');
    for (const rhUser of rhUsers) {
      const notifications = await notificationService.getNotificationsByUser(rhUser.id, rhUser.salesforceId);
      const notificationsATraiter = notifications.filter(n => 
        n.type === 'ACOMPTE_A_PAYER' && 
        n.acompteId === acompte.id && 
        !n.lue
      );
      for (const notif of notificationsATraiter) {
        await notificationService.marquerCommeLue(notif.id);
      }
    }
    
    res.json({ 
      acompte, 
      estCompletementTraite,
      mensualitesTraitees,
      totalMensualites,
      message: estCompletementTraite 
        ? 'Toutes les mensualités ont été traitées. Acompte complètement traité.' 
        : `Mensualité traitée. ${mensualitesTraitees}/${totalMensualites} mensualités traitées.`
    });
  } catch (error) {
    console.error('[API] Erreur marquer traité par RH:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/acomptes/:id/marquer-lu', async (req, res) => {
  try {
    console.log('[API] POST /api/acomptes/:id/marquer-lu');
    const { role } = req.body;
    
    const acompte = await acompteService.marquerLu(req.params.id, role);
    
    if (!acompte) {
      return res.status(404).json({ error: 'Acompte non trouvé' });
    }
    
    res.json(acompte);
  } catch (error) {
    console.error('[API] Erreur marquer lu:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/employe/:employeId/eligibilite', async (req, res) => {
  try {
    console.log('[API] GET /api/acomptes/employe/:employeId/eligibilite');
    const { montant } = req.query;
    const eligibilite = await acompteService.verifierEligibilite(
      req.params.employeId,
      parseInt(montant)
    );
    res.json(eligibilite);
  } catch (error) {
    console.error('[API] Erreur vérification éligibilité:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/acomptes/employe/:employeId/statistiques', async (req, res) => {
  try {
    console.log('[API] GET /api/acomptes/employe/:employeId/statistiques');
    const { annee } = req.query;
    const stats = await acompteService.getStatistiquesAcomptes(
      req.params.employeId,
      parseInt(annee || new Date().getFullYear())
    );
    res.json(stats);
  } catch (error) {
    console.error('[API] Erreur statistiques acomptes:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
