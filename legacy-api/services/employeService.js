const path = require('path');
const SalesforceService = require('./salesforceService');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local'), override: true });

// Instance du service Salesforce (réutiliser celle existante)
let sfService = null;

/**
 * Nettoie une requête SOQL en supprimant les retours à la ligne et les espaces multiples
 * pour éviter les erreurs d'URI invalide lors de l'encodage URL
 */
function cleanSOQLQuery(query) {
  return query.replace(/\s+/g, ' ').trim();
}

/**
 * Échappe les caractères spéciaux dans les valeurs SOQL (apostrophe = \' en littéral SOQL).
 * Toujours passer par String : évite TypeError si Id ou filtre est undefined.
 */
function escapeSOQLValue(value) {
  const s = value == null ? '' : String(value);
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isTransientSalesforceAuthError(err) {
  const msg = String(err?.message || err || '');
  // Ne pas inclure INVALID_LOGIN : mauvais mot de passe, un second essai ne sert à rien.
  return /INVALID_SESSION_ID|Session expired|Unable to refresh token|401|INVALID_GRANT|ECONNRESET/i.test(msg);
}

async function resetSalesforceClient() {
  if (sfService) {
    try {
      sfService.disconnect();
    } catch (e) {
      /* ignorer */
    }
    sfService = null;
  }
}

/**
 * Initialise le service Salesforce si nécessaire
 */
async function initSalesforce() {
  if (!sfService) {
    sfService = new SalesforceService('production');
    await sfService.connect();
  }
  return sfService;
}

/** Exécute query + queryMore pour ne pas tronquer au-delà du premier lot Salesforce (~2000). */
async function queryAll(conn, query) {
  let allRecords = [];
  let result = await conn.query(query);
  allRecords = allRecords.concat(result.records || []);
  while (result.done === false && result.nextRecordsUrl) {
    result = await conn.queryMore(result.nextRecordsUrl);
    allRecords = allRecords.concat(result.records || []);
  }
  return allRecords;
}

/**
 * Récupère tous les employés actifs depuis Salesforce Contacts
 */
async function getEmployes() {
  const fetchOnce = async () => {
    const sf = await initSalesforce();

    if (!sf.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    // Liste des sociétés avec échappement SOQL approprié
    const societes = [
      'HOLDING G2L',
      'D & J transport',
      'TPS TSMC EXPRESS',
      'TSM EXP',
      'TSM LOC',
      'TSM COL AMZ',
      'TSM COL',
      'TSM LOG',
      'TSM FRET',
      'HOLDING TSM'
    ];

    // Construire la clause IN avec échappement approprié
    const societesEscaped = societes.map((s) => `'${escapeSOQLValue(s)}'`).join(', ');

    const query = cleanSOQLQuery(`SELECT Id, FirstName, LastName, Name, MailingStreet, MailingCity, MailingPostalCode, MailingCountry, Phone, MobilePhone, Email, Date_Entree__c, Date_Sortie__c, Type_Contrat__c, Service__c, Fonction__c, ReportsToId, ReportsTo.Name, Account.Name, AccountId FROM Contact WHERE AccountId != null AND Account.Name IN (${societesEscaped}) ORDER BY LastName, FirstName`);

    console.log('[EMPLOYES] Récupération des contacts employés (filtre groupes G2L + TSM)...');

    let records;
    try {
      records = await queryAll(sf.conn, query);
    } catch (queryError) {
      if (queryError.message && queryError.message.includes('Invalid URI')) {
        console.log('[EMPLOYES] Query() échoué avec Invalid URI, utilisation de l\'API REST alternative...');
        const apiVersion = sf.conn.version || '42.0';
        const encodedQuery = encodeURIComponent(query);
        const url = `/services/data/v${apiVersion}/query?q=${encodedQuery}`;
        let page = await sf.conn.request({
          method: 'GET',
          url: url
        });
        records = page.records || [];
        while (page.done === false && page.nextRecordsUrl) {
          page = await sf.conn.request({ method: 'GET', url: page.nextRecordsUrl });
          records = records.concat(page.records || []);
        }
      } else {
        throw queryError;
      }
    }
    console.log('[EMPLOYES] Filtre: Groupe G2L (3 sociétés) + Groupe TSM (7 sociétés)');
    console.log('[EMPLOYES] Exclusion: Sous-traitants (STEP 64, GLOBAL DRIVE, COLIS PRIVE)');
    console.log('[EMPLOYES] Nombre de contacts récupérés:', records.length);

    const employes = records.map((contact) => ({
      id: contact.Id,
      nom: contact.LastName,
      prenom: contact.FirstName,
      nomComplet: contact.Name,
      adresse: {
        rue: contact.MailingStreet,
        ville: contact.MailingCity,
        codePostal: contact.MailingPostalCode,
        pays: contact.MailingCountry
      },
      telephone: contact.Phone,
      mobile: contact.MobilePhone,
      email: contact.Email,
      dateEntree: contact.Date_Entree__c,
      dateSortie: contact.Date_Sortie__c,
      typeContrat: contact.Type_Contrat__c,
      societe: contact.Account?.Name,
      accountId: contact.AccountId,
      service: contact.Service__c,
      fonction: contact.Fonction__c,
      managerId: contact.ReportsToId,
      managerName: contact.ReportsTo ? contact.ReportsTo.Name : null,
      statut: determinerStatut(contact),
      estActif: !contact.Date_Sortie__c || new Date(contact.Date_Sortie__c) > new Date()
    }));
    
    console.log(`[EMPLOYES] Nombre de salariés récupérés: ${employes.length}`);
    console.log(`[EMPLOYES] 📊 Statistiques finales (Groupes G2L + TSM):`);
    console.log(`[EMPLOYES]   - Total: ${employes.length}`);
    console.log(`[EMPLOYES]   - Actifs: ${employes.filter(e => e.estActif).length}`);
    console.log(`[EMPLOYES]   - Sortis: ${employes.filter(e => !e.estActif).length}`);
    console.log(`[EMPLOYES]   - En période d'essai: ${employes.filter(e => e.statut === 'En période d\'essai').length}`);
    // Debug organigramme HOLDING G2L
    employes
      .filter(e => e.societe === 'HOLDING G2L')
      .forEach(e => {
        console.log('[EMPLOYES][DEBUG ORG]', {
          id: e.id,
          nom: e.nomComplet,
          service: e.service,
          fonction: e.fonction,
          managerId: e.managerId,
          managerName: e.managerName
        });
      });
    
    return {
      employes,
      total: employes.length,
      actifs: employes.filter((e) => e.estActif).length,
      sortis: employes.filter((e) => !e.estActif).length
    };
  };

  try {
    return await fetchOnce();
  } catch (error) {
    if (isTransientSalesforceAuthError(error)) {
      console.warn('[EMPLOYES] Réinitialisation client Salesforce (session / auth) puis nouvel essai...');
      await resetSalesforceClient();
      return await fetchOnce();
    }
    console.error('[EMPLOYES] Erreur lors de la récupération:', error);
    throw error;
  }
}

/**
 * Récupère un employé spécifique par son ID Salesforce
 */
async function getEmployeById(employeId) {
  const fetchOnce = async () => {
    const sf = await initSalesforce();

    if (!sf.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    const societes = [
      'HOLDING G2L',
      'D & J transport',
      'TPS TSMC EXPRESS',
      'TSM EXP',
      'TSM LOC',
      'TSM COL AMZ',
      'TSM COL',
      'TSM LOG',
      'TSM FRET',
      'HOLDING TSM'
    ];

    const societesEscaped = societes.map((s) => `'${escapeSOQLValue(s)}'`).join(', ');

    const query = cleanSOQLQuery(`SELECT Id, FirstName, LastName, Name, MailingStreet, MailingCity, MailingPostalCode, MailingCountry, Phone, MobilePhone, Email, Birthdate, Date_Entree__c, Date_Sortie__c, Type_Contrat__c, Service__c, Fonction__c, ReportsToId, ReportsTo.Name, Account.Name, AccountId FROM Contact WHERE Id = '${escapeSOQLValue(employeId)}' AND AccountId != null AND Account.Name IN (${societesEscaped})`);

    console.log(`[EMPLOYES] Récupération de l'employé ${employeId} (filtre groupes G2L + TSM)...`);

    let records;
    try {
      records = await queryAll(sf.conn, query);
    } catch (queryError) {
      if (queryError.message && queryError.message.includes('Invalid URI')) {
        const apiVersion = sf.conn.version || '42.0';
        const encodedQuery = encodeURIComponent(query);
        const url = `/services/data/v${apiVersion}/query?q=${encodedQuery}`;
        let page = await sf.conn.request({ method: 'GET', url: url });
        records = page.records || [];
        while (page.done === false && page.nextRecordsUrl) {
          page = await sf.conn.request({ method: 'GET', url: page.nextRecordsUrl });
          records = records.concat(page.records || []);
        }
      } else {
        throw queryError;
      }
    }

    if (!records || records.length === 0) {
      throw new Error('Employé non trouvé');
    }

    const contact = records[0];
    
    const employe = {
      id: contact.Id,
      nom: contact.LastName,
      prenom: contact.FirstName,
      nomComplet: contact.Name,
      dateNaissance: contact.Birthdate,
      adresse: {
        rue: contact.MailingStreet,
        ville: contact.MailingCity,
        codePostal: contact.MailingPostalCode,
        pays: contact.MailingCountry
      },
      telephone: contact.Phone,
      mobile: contact.MobilePhone,
      email: contact.Email,
      dateEntree: contact.Date_Entree__c,
      dateSortie: contact.Date_Sortie__c,
      typeContrat: contact.Type_Contrat__c,
      societe: contact.Account?.Name,
      service: contact.Service__c,
      fonction: contact.Fonction__c,
      managerId: contact.ReportsToId,
      managerName: contact.ReportsTo ? contact.ReportsTo.Name : null,
      statut: determinerStatut(contact),
      estActif: !contact.Date_Sortie__c || new Date(contact.Date_Sortie__c) > new Date()
    };
    
    console.log(`[EMPLOYES] Employé récupéré: ${employe.nomComplet}`);

    return employe;
  };

  try {
    return await fetchOnce();
  } catch (error) {
    if (isTransientSalesforceAuthError(error)) {
      console.warn('[EMPLOYES] Réinitialisation client Salesforce (session / auth) puis nouvel essai (getEmployeById)...');
      await resetSalesforceClient();
      return await fetchOnce();
    }
    console.error('[EMPLOYES] Erreur récupération employé:', error);
    throw error;
  }
}

/**
 * Détermine le statut d'un employé
 */
function determinerStatut(contact) {
  const maintenant = new Date();
  
  // Sorti
  if (contact.Date_Sortie__c && new Date(contact.Date_Sortie__c) <= maintenant) {
    return 'Sorti';
  }
  
  // En période d'essai (2 mois pour CDI et CDD)
  if (contact.Date_Entree__c) {
    const dateEntree = new Date(contact.Date_Entree__c);
    const diffMois = (maintenant - dateEntree) / (1000 * 60 * 60 * 24 * 30);
    
    // Période d'essai de 2 mois pour tous les contrats
    if (diffMois < 2) {
      return 'En période d\'essai';
    }
  }
  
  return 'Actif';
}

/**
 * Récupère les statistiques RH
 */
async function getStatistiquesRH() {
  try {
    console.log('[EMPLOYES] Calcul des statistiques RH...');
    const { employes } = await getEmployes();
    
    const maintenant = new Date();
    const dans30Jours = new Date(maintenant);
    dans30Jours.setDate(dans30Jours.getDate() + 30);
    
    const dans7Jours = new Date(maintenant);
    dans7Jours.setDate(dans7Jours.getDate() + 7);
    
    const stats = {
      effectifTotal: employes.length,
      actifs: employes.filter(e => e.estActif).length,
      enPeriodeEssai: employes.filter(e => e.statut === 'En période d\'essai').length,
      sortis: employes.filter(e => !e.estActif).length,
      
      // Fins de période d'essai à venir (2 mois après l'entrée)
      finsPeriodeEssai7j: employes.filter(e => {
        if (e.statut !== 'En période d\'essai' || !e.dateEntree) return false;
        const dateEntree = new Date(e.dateEntree);
        const finEssai = new Date(dateEntree);
        finEssai.setMonth(finEssai.getMonth() + 2); // 2 mois pour tous
        return finEssai <= dans7Jours && finEssai >= maintenant;
      }).length,
      
      // CDD se terminant dans 30 jours
      cddAFinir30j: employes.filter(e => {
        if (e.typeContrat !== 'CDD' || !e.dateSortie) return false;
        const dateSortie = new Date(e.dateSortie);
        return dateSortie <= dans30Jours && dateSortie >= maintenant;
      }).length,
      
      // Répartition par type de contrat
      repartitionContrat: {
        CDI: employes.filter(e => e.typeContrat === 'CDI' && e.estActif).length,
        CDD: employes.filter(e => e.typeContrat === 'CDD' && e.estActif).length,
        Autre: employes.filter(e => !['CDI', 'CDD'].includes(e.typeContrat) && e.estActif).length
      },
      
      // Répartition par société
      repartitionSociete: employes.reduce((acc, e) => {
        if (e.estActif) {
          const societe = e.societe || 'Non renseigné';
          acc[societe] = (acc[societe] || 0) + 1;
        }
        return acc;
      }, {})
    };
    
    console.log('[EMPLOYES] Statistiques calculées:', {
      effectifTotal: stats.effectifTotal,
      actifs: stats.actifs,
      enPeriodeEssai: stats.enPeriodeEssai
    });
    
    return stats;
    
  } catch (error) {
    console.error('[EMPLOYES] Erreur calcul statistiques:', error);
    throw error;
  }
}

console.log('[EMPLOYES] Service employé initialisé');

module.exports = {
  getEmployes,
  getEmployeById,
  getStatistiquesRH
};







