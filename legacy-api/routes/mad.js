const router = require('express').Router();
const MiseADispositionService = require('../services/miseADispositionService');
const SalesforceService = require('../services/salesforceService');
const ContratLocationService = require('../services/contratLocationService');

function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().slice(0, maxLength).replace(/[<>"'`;]/g, '');
}

router.post('/mad/analyse', async (req, res) => {
  try {
    const { dateDebut, dateFin, societePreteur, societeEmprunteur, environment = 'production' } = req.body;

    console.log('[API MAD] ═══════════════════════════════════════');
    console.log('[API MAD] Route appelée');
    console.log('[API MAD] Body:', req.body);
    console.log('[API MAD] Analyse demandée');
    console.log('[API MAD] Dates:', dateDebut, '→', dateFin);
    console.log('[API MAD] Environnement:', environment);

    if (!dateDebut || !dateFin) {
      return res.status(400).json({ error: 'Les dates début et fin sont requises' });
    }

    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    const madService = new MiseADispositionService(sfService);
    const results = await madService.analyser({
      dateDebut,
      dateFin,
      societePreteur,
      societeEmprunteur
    });

    console.log('[API MAD] Résultats du service:');
    console.log('[API MAD]   Chauffeurs:', results.chauffeurs?.length || 0);
    console.log('[API MAD]   Véhicules:', results.vehicules?.length || 0);
    console.log('[API MAD]   Stats chauffeurs:', Object.keys(results.statsChauffeurs || {}).length);
    console.log('[API MAD]   Totaux employés:', results.totaux?.employes);
    console.log('[API MAD]   Totaux véhicules:', results.totaux?.vehicules);

    if (results.chauffeurs && results.chauffeurs.length > 0) {
      console.log('[API MAD] Premier chauffeur:', JSON.stringify(results.chauffeurs[0], null, 2));
    } else {
      console.log('[API MAD] ⚠️ AUCUN CHAUFFEUR DANS LES RÉSULTATS !');
    }

    console.log('[API MAD] ═══════════════════════════════════════');

    sfService.disconnect();

    return res.json(results);
  } catch (error) {
    console.error('[API MAD] ❌ ERREUR:', error.message);
    console.error('[API MAD] Stack:', error.stack);
    return res.status(500).json({
      error: "Erreur lors de l'analyse des mises à disposition",
      message: error.message
    });
  }
});

router.get('/mad/chauffeur-detail', async (req, res) => {
  try {
    const { chauffeur, dateDebut, dateFin, environment = 'production' } = req.query;

    console.log('[API MAD Detail] ═══════════════════════════════════════');
    console.log('[API MAD Detail] Détails demandés pour:', chauffeur);
    console.log('[API MAD Detail] Période:', dateDebut, '→', dateFin);

    if (!chauffeur || !dateDebut || !dateFin) {
      return res.status(400).json({ error: 'Les paramètres chauffeur, dateDebut et dateFin sont requis' });
    }

    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    const sfDateDebut = sfService.formatDateForSalesforce(dateDebut);
    const sfDateFin = sfService.formatDateForSalesforce(dateFin);

    const queryODS = `
      SELECT 
        Id,
        Name,
        IO_Date__c,
        IO_Chauffeur__c,
        IO_Chauffeur__r.Name,
        IO_Chauffeur__r.Employeur__r.Name,
        IO_Vehicule__c,
        IO_Vehicule__r.Name,
        IO_Vehicule__r.Filiale_Porteuse_Contrat__r.Name
      FROM IO_OrdreDeService__c
      WHERE IO_Chauffeur__r.Name = '${chauffeur.replace(/'/g, "\\'")}'
        AND IO_Date__c >= ${sfDateDebut}
        AND IO_Date__c <= ${sfDateFin}
      ORDER BY IO_Date__c ASC
    `;

    console.log('[API MAD Detail] Requête ODS:', queryODS);
    const resultODS = await sfService.conn.query(queryODS);
    const odsList = resultODS.records || [];

    console.log(`[API MAD Detail] ${odsList.length} ODS trouvés`);

    if (odsList.length === 0) {
      sfService.disconnect();
      return res.json({
        chauffeur,
        employeur: null,
        ods: []
      });
    }

    const employeur = odsList[0]?.IO_Chauffeur__r?.Employeur__r?.Name || 'N/A';

    const odsIds = odsList.map((ods) => ods.Id);
    const madService = new MiseADispositionService(sfService);
    const courses = await madService.recupererCourses(odsIds);

    console.log(`[API MAD Detail] ${courses.length} courses récupérées`);

    const coursesByOds = courses.reduce((acc, course) => {
      const odsId = course.IO_OrdreDeService__c;
      if (!acc[odsId]) {
        acc[odsId] = [];
      }
      acc[odsId].push(course);
      return acc;
    }, {});

    const odsDetails = odsList.map((ods) => {
      const coursesOds = coursesByOds[ods.Id] || [];

      return {
        id: ods.Id,
        name: ods.Name,
        date: ods.IO_Date__c,
        vehicule: ods.IO_Vehicule__r?.Name || 'N/A',
        porteuse: ods.IO_Vehicule__r?.Filiale_Porteuse_Contrat__r?.Name || 'N/A',
        courses: coursesOds.map((course) => {
          const societeBeneficiaire =
            course.IO_Tournee__r?.IO_Societe__r?.Name || course.IO_Tournee__r?.IO_Societe__c || 'N/A';
          const nomTournee = course.IO_Tournee__r?.Name || 'N/A';

          return {
            id: course.Id,
            name: course.Name,
            chargeur: course.IO_Chargeur__r?.Name || 'N/A',
            tournee: nomTournee,
            societeBeneficiaire: societeBeneficiaire,
            nbColis: course.IO_NombreDeColisPrisEnCharge__c || 0
          };
        })
      };
    });

    console.log('[API MAD Detail] ═══════════════════════════════════════');

    sfService.disconnect();

    return res.json({
      chauffeur,
      employeur,
      ods: odsDetails
    });
  } catch (error) {
    console.error('[API MAD Detail] ❌ ERREUR:', error.message);
    console.error('[API MAD Detail] Stack:', error.stack);
    return res.status(500).json({ error: error.message });
  }
});

router.get('/mad/vehicule-detail', async (req, res) => {
  try {
    const { vehicule, dateDebut, dateFin, environment = 'production' } = req.query;

    console.log('[API MAD Detail Vehicule] ═══════════════════════════════════════');
    console.log('[API MAD Detail Vehicule] Détails demandés pour:', vehicule);
    console.log('[API MAD Detail Vehicule] Période:', dateDebut, '→', dateFin);

    if (!vehicule || !dateDebut || !dateFin) {
      return res.status(400).json({ error: 'Les paramètres vehicule, dateDebut et dateFin sont requis' });
    }

    if (!['sandbox', 'production'].includes(environment)) {
      return res.status(400).json({ error: 'Environnement doit être "sandbox" ou "production"' });
    }

    const sfService = new SalesforceService(environment);
    await sfService.connect();

    const sfDateDebut = sfService.formatDateForSalesforce(dateDebut);
    const sfDateFin = sfService.formatDateForSalesforce(dateFin);

    const queryODS = `
      SELECT 
        Id,
        Name,
        IO_Date__c,
        IO_Chauffeur__c,
        IO_Chauffeur__r.Name,
        IO_Chauffeur__r.Employeur__r.Name,
        IO_Vehicule__c,
        IO_Vehicule__r.Name,
        IO_Vehicule__r.Filiale_Porteuse_Contrat__r.Name
      FROM IO_OrdreDeService__c
      WHERE IO_Vehicule__r.Name = '${vehicule.replace(/'/g, "\\'")}'
        AND IO_Date__c >= ${sfDateDebut}
        AND IO_Date__c <= ${sfDateFin}
      ORDER BY IO_Date__c ASC
    `;

    console.log('[API MAD Detail Vehicule] Requête ODS:', queryODS);
    const resultODS = await sfService.conn.query(queryODS);
    const odsList = resultODS.records || [];

    console.log(`[API MAD Detail Vehicule] ${odsList.length} ODS trouvés`);

    if (odsList.length === 0) {
      sfService.disconnect();
      return res.json({
        vehicule,
        porteuse: null,
        ods: []
      });
    }

    const porteuse = odsList[0]?.IO_Vehicule__r?.Filiale_Porteuse_Contrat__r?.Name || 'N/A';

    const odsIds = odsList.map((ods) => ods.Id);
    const madService = new MiseADispositionService(sfService);
    const courses = await madService.recupererCourses(odsIds);

    console.log(`[API MAD Detail Vehicule] ${courses.length} courses récupérées`);

    const coursesByOds = courses.reduce((acc, course) => {
      const odsId = course.IO_OrdreDeService__c;
      if (!acc[odsId]) {
        acc[odsId] = [];
      }
      acc[odsId].push(course);
      return acc;
    }, {});

    const odsDetails = odsList.map((ods) => {
      const coursesOds = coursesByOds[ods.Id] || [];

      return {
        id: ods.Id,
        name: ods.Name,
        date: ods.IO_Date__c,
        chauffeur: ods.IO_Chauffeur__r?.Name || 'N/A',
        employeur: ods.IO_Chauffeur__r?.Employeur__r?.Name || 'N/A',
        courses: coursesOds.map((course) => {
          const societeBeneficiaire =
            course.IO_Tournee__r?.IO_Societe__r?.Name || course.IO_Tournee__r?.IO_Societe__c || 'N/A';
          const nomTournee = course.IO_Tournee__r?.Name || 'N/A';

          return {
            id: course.Id,
            name: course.Name,
            chargeur: course.IO_Chargeur__r?.Name || 'N/A',
            tournee: nomTournee,
            societeBeneficiaire: societeBeneficiaire,
            nbColis: course.IO_NombreDeColisPrisEnCharge__c || 0
          };
        })
      };
    });

    console.log('[API MAD Detail Vehicule] ═══════════════════════════════════════');

    sfService.disconnect();

    return res.json({
      vehicule,
      porteuse,
      ods: odsDetails
    });
  } catch (error) {
    console.error('[API MAD Detail Vehicule] ❌ ERREUR:', error.message);
    console.error('[API MAD Detail Vehicule] Stack:', error.stack);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/mad/generer-contrat', async (req, res) => {
  try {
    console.log('[API Contrat] ═══════════════════════════════════════');
    console.log('[API Contrat] Génération de contrat demandée');
    console.log('[API Contrat] Paramètres:', JSON.stringify(req.body, null, 2));

    const {
      loueur,
      locataire,
      immatriculation,
      typeVehicule,
      marque,
      modele,
      conducteurPrincipal,
      conducteurAutorise1,
      conducteurAutorise2,
      dateDebut,
      dateFin,
      prixMensuelHT,
      prixMensuelTTC,
      prixJournalierHT,
      prixJournalierTTC,
      accessoires,
      depotGarantie,
      assuranceOccupants,
      assuranceVolCollision,
      assurancePneusVitres,
      lieuSignature,
      dateSignature
    } = req.body;

    if (!loueur || !locataire || !immatriculation || !dateDebut || !dateFin) {
      return res.status(400).json({
        error: 'Paramètres obligatoires manquants: loueur, locataire, immatriculation, dateDebut, dateFin'
      });
    }

    const pdfBuffer = await ContratLocationService.genererContrat({
      loueur,
      locataire,
      immatriculation,
      typeVehicule: typeVehicule || 'VEHICULE',
      marque,
      modele,
      conducteurPrincipal,
      conducteurAutorise1,
      conducteurAutorise2,
      dateDebut,
      dateFin,
      prixMensuelHT: parseFloat(prixMensuelHT) || null,
      prixMensuelTTC: parseFloat(prixMensuelTTC) || null,
      prixJournalierHT: parseFloat(prixJournalierHT) || null,
      prixJournalierTTC: parseFloat(prixJournalierTTC) || null,
      accessoires: accessoires || 'NEANT',
      depotGarantie: depotGarantie || 'NEANT',
      assuranceOccupants: assuranceOccupants || 'A CHARGE DU LOCATAIRE',
      assuranceVolCollision: assuranceVolCollision || 'A CHARGE DU LOCATAIRE',
      assurancePneusVitres: assurancePneusVitres || 'A CHARGE DU LOCATAIRE',
      lieuSignature: lieuSignature || '',
      dateSignature: dateSignature || new Date().toISOString().split('T')[0]
    });

    const filename = ContratLocationService.genererNomFichier(immatriculation, dateDebut, dateFin);

    console.log(`[API Contrat] ✅ PDF généré: ${filename} (${pdfBuffer.length} bytes)`);
    console.log('[API Contrat] ═══════════════════════════════════════');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[API Contrat] ❌ ERREUR:', error.message);
    console.error('[API Contrat] Stack:', error.stack);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
