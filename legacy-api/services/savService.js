// ==========================================
// SERVICE SAV - GESTION DES REQUÊTES/RÉCLAMATIONS
// ==========================================

const jsforce = require('jsforce');
require('dotenv').config();

let conn = null;
let isConnecting = false;
let connectionPromise = null;

/**
 * Crée une connexion Salesforce production
 */
async function connect() {
  // Si déjà en cours de connexion, attendre
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }
  
  // Si déjà connecté et connexion valide, réutiliser
  if (conn && conn.accessToken) {
    return conn;
  }
  
  isConnecting = true;
  
  connectionPromise = new Promise(async (resolve, reject) => {
    try {
      console.log('[SAV] 🔄 Connexion à Salesforce production...');
      
      const loginUrl = process.env.SALESFORCE_PROD_LOGIN_URL || 'https://login.salesforce.com';
      const username = process.env.SALESFORCE_PROD_USERNAME;
      const password = process.env.SALESFORCE_PROD_PASSWORD;
      const securityToken = process.env.SALESFORCE_PROD_SECURITY_TOKEN || '';
      
      conn = new jsforce.Connection({ loginUrl });
      
      await conn.login(username, password + securityToken);
      
      console.log('[SAV] ✅ Connexion Salesforce établie, instanceUrl:', conn.instanceUrl);
      isConnecting = false;
      resolve(conn);
    } catch (error) {
      console.error('[SAV] ❌ Erreur connexion:', error.message);
      isConnecting = false;
      conn = null;
      reject(error);
    }
  });
  
  return connectionPromise;
}

/**
 * Récupère les valeurs des picklists pour les filtres
 */
async function getPicklistValues() {
  try {
    const connection = await connect();
    const metadata = await connection.sobject('Case').describe();
    const fields = metadata.fields;
    
    const picklistValues = {
      statuts: [],
      motifs: [],
      issues: [],
      priorites: [],
      origines: []
    };

    fields.forEach(field => {
      if (field.name === 'Status' && field.picklistValues) {
        picklistValues.statuts = field.picklistValues
          .filter(v => v.active)
          .map(v => ({ value: v.value, label: v.label }));
      }
      if (field.name === 'IO_MotifRequete__c' && field.picklistValues) {
        picklistValues.motifs = field.picklistValues
          .filter(v => v.active)
          .map(v => ({ value: v.value, label: v.label }));
      }
      if (field.name === 'IO_IssueRequete__c' && field.picklistValues) {
        picklistValues.issues = field.picklistValues
          .filter(v => v.active)
          .map(v => ({ value: v.value, label: v.label }));
      }
      if (field.name === 'Priority' && field.picklistValues) {
        picklistValues.priorites = field.picklistValues
          .filter(v => v.active)
          .map(v => ({ value: v.value, label: v.label }));
      }
      if (field.name === 'Origin' && field.picklistValues) {
        picklistValues.origines = field.picklistValues
          .filter(v => v.active)
          .map(v => ({ value: v.value, label: v.label }));
      }
    });

    return picklistValues;
  } catch (error) {
    console.error('[SAV] Erreur récupération picklists:', error.message);
    return {
      statuts: [
        { value: 'New', label: 'Nouveau' },
        { value: 'Working', label: 'En cours' },
        { value: 'Escalated', label: 'Escaladé' },
        { value: 'Closed', label: 'Fermé' }
      ],
      motifs: [],
      issues: [],
      priorites: [
        { value: 'High', label: 'Haute' },
        { value: 'Medium', label: 'Moyenne' },
        { value: 'Low', label: 'Basse' }
      ],
      origines: []
    };
  }
}

/**
 * Récupère les champs disponibles sur l'objet Case
 */
async function getAvailableFields() {
  try {
    const connection = await connect();
    const metadata = await connection.sobject('Case').describe();
    return metadata.fields.map(f => f.name);
  } catch (error) {
    console.error('[SAV] Erreur récupération métadonnées:', error.message);
    return ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'CreatedDate', 'ClosedDate', 'Description', 'AccountId'];
  }
}

/**
 * Enrichit les cases sans IO_Chauffeur__r.Account.Name
 * en résolvant l'employeur via le Contact (AccountId)
 * à partir de IO_FxChauffeur__c.
 */
async function resolveEmployeurForFxChauffeurs(connection, records) {
  try {
    // Récupérer la liste unique des noms de chauffeurs (FX) sans employeur connu
    const fxNamesSet = new Set();
    records.forEach((record) => {
      const hasEmployeur =
        record.IO_Chauffeur__r &&
        record.IO_Chauffeur__r.Account &&
        record.IO_Chauffeur__r.Account.Name;
      const fx = (record.IO_FxChauffeur__c || '').trim();
      if (!hasEmployeur && fx) {
        fxNamesSet.add(fx);
      }
    });

    const fxNames = Array.from(fxNamesSet).filter(Boolean);
    if (fxNames.length === 0) {
      return;
    }

    console.log(
      `[SAV] Résolution employeur via Contact pour ${fxNames.length} chauffeurs FX...`
    );

    const employeurParNom = {};
    const BATCH_SIZE = 100;

    for (let i = 0; i < fxNames.length; i += BATCH_SIZE) {
      const batch = fxNames.slice(i, i + BATCH_SIZE);
      const namesSoql = batch
        .map((n) => `'${n.replace(/'/g, "\\'")}'`)
        .join(', ');

      const soql = `SELECT Name, Account.Name FROM Contact WHERE Name IN (${namesSoql}) AND AccountId != null`;
      console.log('[SAV] SOQL Contacts (batch):', soql.substring(0, 200) + '...');

      const result = await connection.query(soql);
      console.log(
        `[SAV] ${result.records.length} Contacts récupérés pour résolution employeur (batch ${i /
          BATCH_SIZE + 1})`
      );

      result.records.forEach((c) => {
        const key = (c.Name || '').trim().toLowerCase();
        const emp = c.Account && c.Account.Name ? c.Account.Name : null;
        if (key && emp && !employeurParNom[key]) {
          employeurParNom[key] = emp;
        }
      });
    }

    // Appliquer l'employeur résolu sur les records
    records.forEach((record) => {
      const hasEmployeurBackend =
        record.IO_Chauffeur__r &&
        record.IO_Chauffeur__r.Account &&
        record.IO_Chauffeur__r.Account.Name;
      if (hasEmployeurBackend) {
        return;
      }
      const fx = (record.IO_FxChauffeur__c || '').trim().toLowerCase();
      if (!fx) {
        return;
      }
      const inferred = employeurParNom[fx];
      if (inferred) {
        record._employeurFromFx = inferred;
      }
    });
  } catch (error) {
    console.error(
      '[SAV] Erreur lors de la résolution employeur via Contact:',
      error.message
    );
  }
}

/**
 * Récupère les Cases avec filtres
 */
async function getCases(dateDebut, dateFin, filters = {}) {
  try {
    const connection = await connect();
    const availableFields = await getAvailableFields();
    
    let whereConditions = [];
    
    // Cas particulier: recherche par référence facture (ne doit pas être soumise aux autres filtres)
    if (filters.factureRef) {
      whereConditions.push(`IO_ReferenceFacture__c = '${filters.factureRef.replace(/'/g, "\\'")}'`);
    } else {
      // Filtre période sur la date choisie (livraison par défaut, ou intégration).
      const isIntegrationDate = filters.dateFilterType === 'integration';
      const dateField = isIntegrationDate ? 'DAY_ONLY(CreatedDate)' : 'IO_DateLivraison__c';
      if (dateDebut) {
        whereConditions.push(`${dateField} >= ${dateDebut}`);
      }
      if (dateFin) {
        whereConditions.push(`${dateField} <= ${dateFin}`);
      }
      
      // Filtre statut
      if (filters.statut && filters.statut !== 'all') {
        whereConditions.push(`Status = '${filters.statut.replace(/'/g, "\\'")}'`);
      }
      
      // Filtre type (champ standard Type)
      if (filters.type && filters.type !== 'all') {
        whereConditions.push(`Type = '${filters.type.replace(/'/g, "\\'")}'`);
      }
      
      // Filtre motif (champ standard Reason)
      if (filters.motif && filters.motif !== 'all') {
        whereConditions.push(`Reason = '${filters.motif.replace(/'/g, "\\'")}'`);
      }
      
      // Filtre issue
      if (filters.issue && filters.issue !== 'all' && availableFields.includes('IO_IssueRequete__c')) {
        whereConditions.push(`IO_IssueRequete__c = '${filters.issue.replace(/'/g, "\\'")}'`);
      }
      
      // Filtre chargeur (Account)
      if (filters.chargeur && filters.chargeur !== 'all') {
        whereConditions.push(`Account.Name = '${filters.chargeur.replace(/'/g, "\\'")}'`);
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Construire la liste des champs
    const baseFields = ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Origin', 'CreatedDate', 'ClosedDate', 'Description', 'AccountId', 'Account.Name', 'Type', 'Reason'];
    const customFields = [
      'IO_MotifRequete__c',
      'IO_IssueRequete__c',
      'IO_MontantLitige__c',
      'IO_NumeroColis__c',
      'IO_ReferenceFacture__c',
      'IO_DateLivraison__c',
      'IO_NomDestinataire__c',
      'IO_AdresseDestinataire__c',
      'IO_Chauffeur__c',
      'IO_FxChauffeur__c',
      'IO_Tournee__c',
      'IO_Course__c'
    ].filter(f => availableFields.includes(f));
    
    // Ajouter la relation pour récupérer le nom du chauffeur et son employeur si IO_Chauffeur__c existe
    if (availableFields.includes('IO_Chauffeur__c')) {
      customFields.push('IO_Chauffeur__r.Name');
      customFields.push('IO_Chauffeur__r.Account.Name');
    }
    
    // Ajouter la relation pour récupérer le nom de la tournée si IO_Tournee__c existe
    if (availableFields.includes('IO_Tournee__c')) {
      customFields.push('IO_Tournee__r.Name');
    }
    
    const allFields = [...baseFields, ...customFields];

    // Requête SOQL sur une seule ligne pour éviter les problèmes d'encodage
    const query = `SELECT ${allFields.join(', ')} FROM Case ${whereClause} ORDER BY CreatedDate DESC LIMIT 5000`;

    console.log('[SAV] Requête SOQL:', query.substring(0, 200) + '...');
    
    // Pagination Salesforce pour dépasser la limite de 1000 enregistrements
    let result = await connection.query(query);
    let allRecords = [...result.records];
    console.log(`[SAV] ${result.records.length} cases récupérés (première page)`);
    
    const MAX_RECORDS = 5000; // plafond de sécurité pour ne pas exploser la mémoire
    
    while (!result.done && result.nextRecordsUrl && allRecords.length < MAX_RECORDS) {
      result = await connection.queryMore(result.nextRecordsUrl);
      allRecords = allRecords.concat(result.records);
      console.log(`[SAV] Page suivante: ${result.records.length} cases, total cumulé: ${allRecords.length}`);
    }
    
    console.log(`[SAV] Total final cases récupérés (après pagination): ${allRecords.length}`);
    
    // Log pour debug - vérifier quelques champs clés
    if (allRecords.length > 0) {
      const sample = allRecords.slice(0, 5);
      sample.forEach((r, i) => {
        console.log(`[SAV] Case ${i}: Type="${r.Type}", Reason="${r.Reason}", IO_MotifRequete__c="${r.IO_MotifRequete__c}", IO_ReferenceFacture__c="${r.IO_ReferenceFacture__c}"`);
      });
    }
    
    // Si IO_FxChauffeur__c est vide, utiliser IO_Chauffeur__r.Name comme fallback
    const records = allRecords.map(record => {
      if (!record.IO_FxChauffeur__c && record.IO_Chauffeur__r && record.IO_Chauffeur__r.Name) {
        record.IO_FxChauffeur__c = record.IO_Chauffeur__r.Name;
      }
      return record;
    });

    // Enrichir avec l'employeur chauffeur via IO_Chauffeur__c / Contact si possible
    await resolveEmployeurForFxChauffeurs(connection, records);

    // Log de debug ciblé quand on est en recherche facture,
    // pour comprendre pourquoi certains employeurs ne remontent pas
    if (filters.factureRef) {
      console.log(
        `[SAV] Debug factureRef=${filters.factureRef} - ${records.length} cases récupérées`
      );
      records.forEach((r, idx) => {
        console.log(
          `[SAV] Case[${idx}] NumColis=${r.IO_NumeroColis__c || '-'} ` +
            `Fx="${r.IO_FxChauffeur__c || '-'}" ` +
            `ChauffeurId=${r.IO_Chauffeur__c || '-'} ` +
            `EmpDirect="${r.IO_Chauffeur__r?.Account?.Name || '-'}" ` +
            `EmpFromFx="${r._employeurFromFx || '-'}"`
        );
      });
    }

    return records;
  } catch (error) {
    console.error('[SAV] Erreur récupération Cases:', error.message);
    throw error;
  }
}

/**
 * Récupère les colis livrés par chauffeur depuis les Courses
 */
async function getColisLivresParChauffeur(dateDebut, dateFin, chargeur = null) {
  try {
    // Utiliser SalesforceService comme exploitationService
    const SalesforceService = require('./salesforceService');
    const sfService = new SalesforceService('production');
    await sfService.connect();
    
    let whereConditions = [];
    
    if (dateDebut) {
      whereConditions.push(`IO_Fx_Date__c >= ${dateDebut}`);
    }
    if (dateFin) {
      whereConditions.push(`IO_Fx_Date__c <= ${dateFin}`);
    }
    
    // Filtre par chargeur si spécifié
    if (chargeur && chargeur !== 'all') {
      whereConditions.push(`IO_Chargeur__r.Name = '${chargeur.replace(/'/g, "\\'")}'`);
      console.log(`[SAV] Filtre chargeur appliqué aux courses: ${chargeur}`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const query = `SELECT Id, IO_Fx_Date__c, IO_OrdreDeService__r.IO_Chauffeur__r.Name, IO_Tournee__r.Name, IO_Chargeur__r.Name, IO_NombreDeColisPrisEnCharge__c, IO_NombreColisLivres__c, IO_NombreDePDLPrisEnCharge__c, IO_NombrePdlLivres__c FROM IO_Course__c ${whereClause}`;
    
    console.log('[SAV] Requête Courses SOQL:', query);
    const result = await sfService.conn.query(query);
    console.log(`[SAV] ${result.records.length} courses récupérées pour colis livrés`);
    
    // Debug - trouver un enregistrement avec des données non-null
    if (result.records.length > 0) {
      const recordWithData = result.records.find(r => r.IO_NombreDeColisPrisEnCharge__c > 0) || result.records[0];
      console.log('[SAV] Debug enregistrement avec données:', {
        colisPec: recordWithData.IO_NombreDeColisPrisEnCharge__c,
        colisLivres: recordWithData.IO_NombreColisLivres__c,
        pdlPec: recordWithData.IO_NombreDePDLPrisEnCharge__c,
        pdlLivres: recordWithData.IO_NombrePdlLivres__c,
        date: recordWithData.IO_Fx_Date__c,
        chauffeur: recordWithData.IO_OrdreDeService__r?.IO_Chauffeur__r?.Name
      });
      
      // Compter les enregistrements avec colisPec > 0
      const countWithColisPec = result.records.filter(r => r.IO_NombreDeColisPrisEnCharge__c > 0).length;
      console.log(`[SAV] Enregistrements avec Colis PEC > 0: ${countWithColisPec} sur ${result.records.length}`);
    }
    
    // Agréger par chauffeur
    const colisParChauffeur = {};
    const detailParChauffeur = {};
    const colisParChargeur = {}; // Total colis par chargeur (tous chauffeurs)
    const colisParChauffeurParChargeur = {}; // Colis par chauffeur par chargeur
    let totalColis = 0;
    
    result.records.forEach(course => {
      const chauffeurNom = course.IO_OrdreDeService__r?.IO_Chauffeur__r?.Name || 'Non assigné';
      const colisPec = course.IO_NombreDeColisPrisEnCharge__c || 0;
      const colisLivres = course.IO_NombreColisLivres__c || 0;
      const pdlPec = course.IO_NombreDePDLPrisEnCharge__c || 0;
      const pdlLivres = course.IO_NombrePdlLivres__c || 0;
      const date = course.IO_Fx_Date__c || null;
      const tournee = course.IO_Tournee__r?.Name || '-';
      const chargeur = course.IO_Chargeur__r?.Name || '-';
      
      if (!colisParChauffeur[chauffeurNom]) {
        colisParChauffeur[chauffeurNom] = 0;
        detailParChauffeur[chauffeurNom] = [];
        colisParChauffeurParChargeur[chauffeurNom] = {};
      }
      colisParChauffeur[chauffeurNom] += colisLivres;
      totalColis += colisLivres;
      
      // Agréger par chargeur (total tous chauffeurs)
      if (!colisParChargeur[chargeur]) {
        colisParChargeur[chargeur] = { colisLivres: 0, pdlLivres: 0, colisPec: 0, pdlPec: 0 };
      }
      colisParChargeur[chargeur].colisLivres += colisLivres;
      colisParChargeur[chargeur].pdlLivres += pdlLivres;
      colisParChargeur[chargeur].colisPec += colisPec;
      colisParChargeur[chargeur].pdlPec += pdlPec;
      
      // Agréger par chauffeur par chargeur
      if (!colisParChauffeurParChargeur[chauffeurNom][chargeur]) {
        colisParChauffeurParChargeur[chauffeurNom][chargeur] = { colisLivres: 0, pdlLivres: 0, colisPec: 0, pdlPec: 0 };
      }
      colisParChauffeurParChargeur[chauffeurNom][chargeur].colisLivres += colisLivres;
      colisParChauffeurParChargeur[chauffeurNom][chargeur].pdlLivres += pdlLivres;
      colisParChauffeurParChargeur[chauffeurNom][chargeur].colisPec += colisPec;
      colisParChauffeurParChargeur[chauffeurNom][chargeur].pdlPec += pdlPec;
      
      // Ajouter le détail de la course
      detailParChauffeur[chauffeurNom].push({
        courseId: course.Id,
        date,
        tournee,
        chargeur,
        pdlPec,
        pdlLivres,
        colisPec,
        colisLivres
      });
    });
    
    // Trier les détails par date décroissante
    Object.keys(detailParChauffeur).forEach(chauffeur => {
      detailParChauffeur[chauffeur].sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });
    });
    
    console.log('[SAV] Total colis livrés:', totalColis);
    console.log('[SAV] Chauffeurs avec colis:', Object.keys(colisParChauffeur).length);
    console.log('[SAV] Chargeurs avec colis:', Object.keys(colisParChargeur).length);
    
    await sfService.disconnect();
    
    return { colisParChauffeur, detailParChauffeur, colisParChargeur, colisParChauffeurParChargeur, totalColis };
  } catch (error) {
    console.error('[SAV] Erreur récupération colis livrés:', error.message);
    return { colisParChauffeur: {}, detailParChauffeur: {}, totalColis: 0 };
  }
}

/**
 * Calcule les statistiques à partir des cases
 */
function calculateStats(cases, colisData = null) {
  const stats = {
    total: cases.length,
    parStatut: {},
    parType: {},
    parReason: {},
    parMotif: {},
    parIssue: {},
    parChauffeur: {},
    parChargeur: {},
    parPriorite: {},
    parOrigine: {},
    parJour: {},
    parMois: {},
    montantTotal: 0,
    montantParMotif: {},
    montantParChauffeur: {},
    montantParChargeur: {},
    tempsResolutionMoyen: 0,
    casesAvecMontant: 0
  };

  let totalTempsResolution = 0;
  let casesResolus = 0;

  cases.forEach(c => {
    const statut = c.Status || 'Non défini';
    stats.parStatut[statut] = (stats.parStatut[statut] || 0) + 1;

    // Type (champ standard)
    const type = c.Type || 'Non défini';
    stats.parType[type] = (stats.parType[type] || 0) + 1;

    // Motif - utiliser IO_MotifRequete__c en priorité, sinon Reason
    const motifValue = c.IO_MotifRequete__c || c.Reason || 'Non défini';
    stats.parReason[motifValue] = (stats.parReason[motifValue] || 0) + 1;

    const motif = c.IO_MotifRequete__c || 'Non défini';
    stats.parMotif[motif] = (stats.parMotif[motif] || 0) + 1;

    const issue = c.IO_IssueRequete__c || 'Non défini';
    stats.parIssue[issue] = (stats.parIssue[issue] || 0) + 1;

    const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
    if (!stats.parChauffeur[chauffeur]) {
      stats.parChauffeur[chauffeur] = { count: 0, montant: 0 };
    }
    stats.parChauffeur[chauffeur].count++;

    // Chargeur (Account)
    const chargeur = (c.Account && c.Account.Name) ? c.Account.Name : 'Non défini';
    if (!stats.parChargeur[chargeur]) {
      stats.parChargeur[chargeur] = { count: 0, montant: 0 };
    }
    stats.parChargeur[chargeur].count++;

    const priorite = c.Priority || 'Non défini';
    stats.parPriorite[priorite] = (stats.parPriorite[priorite] || 0) + 1;

    const origine = c.Origin || 'Non défini';
    stats.parOrigine[origine] = (stats.parOrigine[origine] || 0) + 1;

    if (c.CreatedDate) {
      const jour = c.CreatedDate.substring(0, 10);
      stats.parJour[jour] = (stats.parJour[jour] || 0) + 1;
      const mois = c.CreatedDate.substring(0, 7);
      stats.parMois[mois] = (stats.parMois[mois] || 0) + 1;
    }

    if (c.IO_MontantLitige__c && c.IO_MontantLitige__c > 0) {
      stats.montantTotal += c.IO_MontantLitige__c;
      stats.casesAvecMontant++;
      stats.montantParMotif[motif] = (stats.montantParMotif[motif] || 0) + c.IO_MontantLitige__c;
      stats.parChauffeur[chauffeur].montant += c.IO_MontantLitige__c;
      stats.parChargeur[chargeur].montant += c.IO_MontantLitige__c;
    }

    if (c.CreatedDate && c.ClosedDate) {
      const created = new Date(c.CreatedDate);
      const closed = new Date(c.ClosedDate);
      const diffHours = (closed - created) / (1000 * 60 * 60);
      totalTempsResolution += diffHours;
      casesResolus++;
    }
  });

  if (casesResolus > 0) {
    stats.tempsResolutionMoyen = totalTempsResolution / casesResolus;
  }

  stats.evolutionJournaliere = Object.entries(stats.parJour)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Utiliser les données de colis livrés depuis les Courses si disponibles
  const colisParChauffeur = colisData?.colisParChauffeur || {};
  const detailParChauffeur = colisData?.detailParChauffeur || {};
  const colisParChargeur = colisData?.colisParChargeur || {};
  const colisParChauffeurParChargeur = colisData?.colisParChauffeurParChargeur || {};
  const totalColisLivres = colisData?.totalColis || 0;
  
  stats.classementChauffeurs = Object.entries(stats.parChauffeur)
    .map(([nom, data]) => {
      const colisLivres = colisParChauffeur[nom] || 0;
      return { 
        nom, 
        count: data.count, 
        montant: data.montant,
        colisLivres: colisLivres,
        pourcentageColis: totalColisLivres > 0 ? ((colisLivres / totalColisLivres) * 100).toFixed(1) : 0
      };
    })
    .sort((a, b) => b.count - a.count);
  
  stats.totalColisLivres = totalColisLivres;
  stats.detailCoursesParChauffeur = detailParChauffeur;
  stats.colisParChargeur = colisParChargeur;
  stats.colisParChauffeurParChargeur = colisParChauffeurParChargeur;

  stats.classementChargeurs = Object.entries(stats.parChargeur)
    .map(([nom, data]) => ({ nom, count: data.count, montant: data.montant }))
    .sort((a, b) => b.count - a.count);

  return stats;
}

module.exports = {
  getPicklistValues,
  getCases,
  calculateStats,
  getAvailableFields,
  getColisLivresParChauffeur
};
