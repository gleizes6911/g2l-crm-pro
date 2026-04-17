const jsforce = require('jsforce');
require('dotenv').config();

class SalesforceService {
  constructor(environment = 'sandbox') {
    this.environment = environment;
    this.conn = null;
  }

  /**
   * Se connecte à Salesforce (sandbox ou production)
   */
  async connect() {
    try {
      const config = this.getConfig();
      
      this.conn = new jsforce.Connection({
        loginUrl: config.loginUrl
      });

      await this.conn.login(config.username, config.password + config.securityToken);
      
      console.log(`Connecté à Salesforce ${this.environment}`);
      return true;
    } catch (error) {
      console.error(`Erreur de connexion à Salesforce ${this.environment}:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère la configuration selon l'environnement
   */
  getConfig() {
    if (this.environment === 'sandbox') {
      // Si l'URL contient un domaine personnalisé, utiliser l'URL de login spécifique
      let loginUrl = process.env.SALESFORCE_SANDBOX_LOGIN_URL || 'https://test.salesforce.com';
      const username = process.env.SALESFORCE_SANDBOX_USERNAME;
      
      // Détecter si c'est une sandbox avec domaine personnalisé (format: user@domain.instance)
      if (username && username.includes('--')) {
        // Extraire le nom de l'instance depuis l'URL Lightning si fournie
        const customUrl = process.env.SALESFORCE_SANDBOX_CUSTOM_URL;
        if (customUrl) {
          // Convertir l'URL Lightning en URL de login
          loginUrl = customUrl.replace('/lightning/', '').replace('/lightning', '') + '/services/Soap/u/58.0';
        }
      }
      
      return {
        username: username,
        password: process.env.SALESFORCE_SANDBOX_PASSWORD,
        securityToken: process.env.SALESFORCE_SANDBOX_SECURITY_TOKEN,
        loginUrl: loginUrl
      };
    } else {
      return {
        username: process.env.SALESFORCE_PROD_USERNAME,
        password: process.env.SALESFORCE_PROD_PASSWORD,
        securityToken: process.env.SALESFORCE_PROD_SECURITY_TOKEN,
        loginUrl: process.env.SALESFORCE_PROD_LOGIN_URL || 'https://login.salesforce.com'
      };
    }
  }

  /**
   * Récupère les données d'utilisation des véhicules depuis Salesforce
   */
  async getUtilisations() {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    // Ajustez ces requêtes selon votre structure Salesforce
    // Exemple avec des objets personnalisés
    try {
      const query = `
        SELECT Id, Vehicule__c, Chargeur__c, Code_Tournee__c, Date_Utilisation__c, Utilisateur__c
        FROM Utilisation_Vehicule__c
        ORDER BY Date_Utilisation__c
      `;
      
      const result = await this.conn.query(query);
      return result.records;
    } catch (error) {
      // Si l'objet n'existe pas, retourner un message d'erreur explicite
      console.error('Erreur lors de la récupération des utilisations:', error.message);
      throw new Error(`Impossible de récupérer les utilisations. Vérifiez que l'objet Utilisation_Vehicule__c existe dans votre org.`);
    }
  }

  /**
   * Récupère les données de tournées depuis Salesforce
   */
  async getTournees() {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    try {
      const query = `
        SELECT Id, Code_Tournee__c, Chargeur__c, Societe_Signataire__c
        FROM Tournee__c
      `;
      
      const result = await this.conn.query(query);
      return result.records;
    } catch (error) {
      console.error('Erreur lors de la récupération des tournées:', error.message);
      throw new Error(`Impossible de récupérer les tournées. Vérifiez que l'objet Tournee__c existe dans votre org.`);
    }
  }

  /**
   * Récupère les données de tournées (objet IO_Tournee__c)
   */
  async getTourneesIO() {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    try {
      const query = `
        SELECT Id, Name, IO_Active__c
        FROM IO_Tournee__c
        WHERE IO_Active__c = true
      `;
      
      const result = await this.conn.query(query);
      return result.records;
    } catch (error) {
      console.error('Erreur lors de la récupération des tournées IO:', error.message);
      return [];
    }
  }

  /**
   * Formate une date pour SOQL (format YYYY-MM-DD)
   */
  formatDateForSalesforce(date) {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Récupère les ordres de service (ODS) avec pagination et filtres de dates
   */
  async getOrdresDeService(dateDebut = null, dateFin = null) {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    try {
      let whereClause = '';
      if (dateDebut && dateFin) {
        const sfDateDebut = this.formatDateForSalesforce(dateDebut);
        const sfDateFin = this.formatDateForSalesforce(dateFin);
        whereClause = `WHERE IO_Date__c >= ${sfDateDebut} AND IO_Date__c <= ${sfDateFin}`;
      }

      const query = `
        SELECT Id, Name, IO_Date__c, IO_Chauffeur__c, IO_Chauffeur__r.Name, 
               IO_Chauffeur__r.Employeur__c, IO_Chauffeur__r.Employeur__r.Name,
               IO_Vehicule__c, IO_Vehicule__r.Name, IO_Vehicule__r.Filiale_Porteuse_Contrat__c,
               IO_Vehicule__r.Filiale_Porteuse_Contrat__r.Name
        FROM IO_OrdreDeService__c
        ${whereClause}
        ORDER BY IO_Date__c
      `;
      
      let allRecords = [];
      let result = await this.conn.query(query);
      allRecords = allRecords.concat(result.records);

      // Pagination manuelle si nécessaire
      while (!result.done && result.nextRecordsUrl) {
        result = await this.conn.queryMore(result.nextRecordsUrl);
        allRecords = allRecords.concat(result.records);
      }

      console.log(`[ODS] ${allRecords.length} ordres de service récupérés`);
      return allRecords;
    } catch (error) {
      console.error('Erreur lors de la récupération des ODS:', error.message);
      return [];
    }
  }

  /**
   * Récupère les courses liées aux ODS et tournées avec nombre de colis
   * Utilise une approche par batch pour éviter l'erreur "URI Too Long"
   */
  /**
   * @param {string[]} odsIds - Ids ODS Salesforce
   * @param {{ chargeurId?: string }} [options] - Si renseigné : ne ramener que les courses de ce chargeur (SOQL)
   */
  async getCourses(odsIds = [], options = {}) {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    try {
      let chargeurSoql = '';
      const rawCh = options.chargeurId;
      if (rawCh && String(rawCh).trim() !== '' && String(rawCh) !== 'TOUS') {
        const id = String(rawCh).trim();
        if (/^[a-zA-Z0-9]{15,18}$/.test(id)) {
          chargeurSoql = ` AND IO_Chargeur__c = '${id}'`;
        } else {
          console.warn('[Courses] chargeurId ignoré pour SOQL (format invalide):', rawCh);
        }
      }

      // Si pas d'IDs ou trop d'IDs, récupérer toutes les courses et filtrer en mémoire
      // Limite : 200 IDs par requête pour éviter "URI Too Long"
      const BATCH_SIZE = 200;
      let allRecords = [];

      // Champs corrects selon la logique métier :
      // - IO_Tournee__r.Name = Code/Nom de la tournée
      // - IO_Tournee__r.IO_Societe__r.Name = Société bénéficiaire (société de la tournée)
      // - IO_Tournee__c = ID de la tournée
      // - Champs colis détaillés (noms réels Salesforce)
      const selectFields = `
        Id, Name, IO_OrdreDeService__c, 
        IO_Chargeur__c, IO_Chargeur__r.Name,
        IO_Tournee__c,
        IO_Tournee__r.Name,
        IO_Tournee__r.IO_Societe__c,
        IO_Tournee__r.IO_Societe__r.Name,
        IO_LibelleCourse__c,
        IO_Statut__c,
        IO_Periode__c,
        IO_TypeTournee__c,
        IO_Fx_Date__c,
        IO_FxNomChauffeur__c,
        IO_FxImmatriculation__c,
        IO_FxTournee__c,
        IO_KilometresCalcules__c,
        IO_NombreDePDLPrisEnCharge__c,
        IO_NombreDeColisPrisEnCharge__c,
        IO_NombreColisRelaisPec__c,
        IO_NombrePdlRelaisPec__c,
        IO_NombreColisPredictPeC__c,
        IO_PickupPec__c,
        IO_NombreEnlevementOccasionnelPec__c,
        IO_NombreColisLivres__c,
        IO_NombreColisLivresDomicile__c,
        IO_NombreColisLivresPointRelais__c,
        IO_NombrePdlLivres__c,
        IO_NombreDeColisRetour__c,
        IO_NombreDeColisRefuses__c,
        IO_NombreDeColisDeposesEnPointRelais__c,
        IO_NombreColisRelaisRetour__c,
        IO_NombreDePDLRetour__c,
        IO_NombrePdlRefuses__c,
        IO_NombreColisPayes__c,
        IO_NombreDePDLCollectes__c,
        IO_NombreDeColisCollectes__c,
        IO_PickupRealises__c,
        IO_NombreEoRealises__c,
        IO_ColisDebords__c,
        IO_ColisPredictHorsDelai__c,
        IO_PredictHorsDelai__c
      `;

      if (odsIds.length === 0) {
        // Récupérer toutes les courses (optionnellement filtrées par chargeur)
        const whereParts = ['IO_Tournee__r.IO_Active__c = true'];
        if (chargeurSoql) {
          whereParts.push(chargeurSoql.trim().replace(/^\s*AND\s+/i, ''));
        }
        const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
        const query = `
          SELECT ${selectFields}
          FROM IO_Course__c
          ${whereClause}
          LIMIT 10000
        `;
        
        let result = await this.conn.query(query);
        allRecords = allRecords.concat(result.records);

        while (!result.done && result.nextRecordsUrl) {
          result = await this.conn.queryMore(result.nextRecordsUrl);
          allRecords = allRecords.concat(result.records);
        }
      } else if (odsIds.length <= BATCH_SIZE) {
        // Petite liste : requête directe
        const idsStr = odsIds.map(id => `'${id}'`).join(',');
        const query = `
          SELECT ${selectFields}
          FROM IO_Course__c
          WHERE IO_OrdreDeService__c IN (${idsStr})${chargeurSoql}
            AND IO_Tournee__r.IO_Active__c = true
        `;
        
        let result = await this.conn.query(query);
        allRecords = allRecords.concat(result.records);

        while (!result.done && result.nextRecordsUrl) {
          result = await this.conn.queryMore(result.nextRecordsUrl);
          allRecords = allRecords.concat(result.records);
        }
      } else {
        // Grande liste : traiter par batch
        console.log(`[Courses] Traitement par batch de ${odsIds.length} ODS (${Math.ceil(odsIds.length / BATCH_SIZE)} batches)`);
        
        for (let i = 0; i < odsIds.length; i += BATCH_SIZE) {
          const batch = odsIds.slice(i, i + BATCH_SIZE);
          const idsStr = batch.map(id => `'${id}'`).join(',');
          
          const query = `
            SELECT ${selectFields}
            FROM IO_Course__c
            WHERE IO_OrdreDeService__c IN (${idsStr})${chargeurSoql}
              AND IO_Tournee__r.IO_Active__c = true
          `;
          
          let result = await this.conn.query(query);
          allRecords = allRecords.concat(result.records);

          while (!result.done && result.nextRecordsUrl) {
            result = await this.conn.queryMore(result.nextRecordsUrl);
            allRecords = allRecords.concat(result.records);
          }
        }
      }

      console.log(`[Courses] ${allRecords.length} courses récupérées`);
      return allRecords;
    } catch (error) {
      console.error('Erreur lors de la récupération des courses:', error.message);
      return [];
    }
  }

  /**
   * Récupère les chauffeurs depuis Salesforce
   * Les chauffeurs sont extraits des ordres de service (IO_OrdreDeService__c)
   */
  async getChauffeurs() {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    try {
      console.log('[Chauffeurs] Récupération des chauffeurs depuis Salesforce...');
      
      // Récupérer les chauffeurs distincts depuis les ODS des 90 derniers jours
      const today = new Date();
      const dateDebut = new Date(today);
      dateDebut.setDate(dateDebut.getDate() - 90);
      
      const query = `
        SELECT IO_Chauffeur__c, IO_Chauffeur__r.Name, 
               IO_Chauffeur__r.Employeur__c, IO_Chauffeur__r.Employeur__r.Name
        FROM IO_OrdreDeService__c
        WHERE IO_Chauffeur__c != null
        AND IO_Date__c >= ${dateDebut.toISOString().split('T')[0]}
        AND IO_Date__c <= ${today.toISOString().split('T')[0]}
        ORDER BY IO_Chauffeur__r.Name
      `;
      
      let result = await this.conn.query(query);
      let allRecords = result.records;

      while (!result.done && result.nextRecordsUrl) {
        result = await this.conn.queryMore(result.nextRecordsUrl);
        allRecords = allRecords.concat(result.records);
      }

      // Extraire les chauffeurs uniques
      const chauffeursMap = new Map();
      allRecords.forEach(ods => {
        if (ods.IO_Chauffeur__c && !chauffeursMap.has(ods.IO_Chauffeur__c)) {
          chauffeursMap.set(ods.IO_Chauffeur__c, {
            id: ods.IO_Chauffeur__c,
            nom: ods.IO_Chauffeur__r?.Name || 'Inconnu',
            prenom: '', // Sera extrait du nom si format "PRENOM NOM"
            employeurId: ods.IO_Chauffeur__r?.Employeur__c || null,
            employeur: ods.IO_Chauffeur__r?.Employeur__r?.Name || null
          });
        }
      });

      // Garder le nom complet original et créer un affichage "NOM Prénom"
      const chauffeurs = Array.from(chauffeursMap.values()).map(c => {
        const nomOriginal = c.nom; // Nom tel que dans Salesforce
        const parts = c.nom.trim().split(/\s+/);
        
        let nom = '';
        let prenom = '';
        let nomComplet = nomOriginal;
        
        if (parts.length >= 2) {
          // Détecter le format
          const firstPart = parts[0];
          const restParts = parts.slice(1).join(' ');
          
          // Si la première partie est en majuscules, c'est le NOM
          if (firstPart === firstPart.toUpperCase() && firstPart.length > 2) {
            nom = firstPart;
            prenom = restParts;
          } else {
            // Sinon c'est Prénom NOM - on inverse
            prenom = firstPart;
            nom = restParts.toUpperCase();
          }
          // Format d'affichage: NOM Prénom
          nomComplet = `${nom} ${prenom}`;
        } else {
          nom = nomOriginal;
          nomComplet = nomOriginal;
        }
        
        return { ...c, nom, prenom, nomComplet, nomOriginal };
      });

      // Trier par nom de famille puis prénom
      chauffeurs.sort((a, b) => {
        const compareNom = a.nom.localeCompare(b.nom);
        if (compareNom !== 0) return compareNom;
        return a.prenom.localeCompare(b.prenom);
      });

      console.log(`[Chauffeurs] ${chauffeurs.length} chauffeurs uniques trouvés`);
      return chauffeurs;
    } catch (error) {
      console.error('Erreur lors de la récupération des chauffeurs:', error.message);
      return [];
    }
  }

  /**
   * Compte les employés par employeur pour une période donnée
   */
  async countEmployesByEmployeur(employeurs, dateDebut, dateFin) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('[COUNT EMPLOYÉS] Fonction appelée');
    console.log('[COUNT EMPLOYÉS] Employeurs:', employeurs);
    console.log('[COUNT EMPLOYÉS] Période:', dateDebut, '→', dateFin);
    
    if (!employeurs || employeurs.length === 0) {
      console.log('[COUNT EMPLOYÉS] ⚠️ Aucun employeur fourni');
      return {};
    }

    if (!this.conn) {
      console.error('[COUNT EMPLOYÉS] ❌ Connexion Salesforce non initialisée');
      return {};
    }
    
    console.log('[COUNT EMPLOYÉS] ✅ Connexion Salesforce OK');
    
    try {
      const sfDateDebut = this.formatDateForSalesforce(dateDebut);
      const sfDateFin = this.formatDateForSalesforce(dateFin);

      // IMPORTANT : Utiliser Employeur__c dans GROUP BY, puis récupérer les noms
      const query = `SELECT Employeur__c, Employeur__r.Name, COUNT(Id) total FROM Contact WHERE Employeur__r.Name IN ('${employeurs.join("','")}') AND (Date_Entree__c = null OR Date_Entree__c <= ${sfDateFin}) AND (Date_Sortie__c = null OR Date_Sortie__c >= ${sfDateDebut}) GROUP BY Employeur__c, Employeur__r.Name`;
      
      console.log('[COUNT EMPLOYÉS] Query SOQL:');
      console.log(query);
      
      const result = await this.conn.query(query);
      
      console.log('[COUNT EMPLOYÉS] ✅ Requête exécutée');
      console.log('[COUNT EMPLOYÉS] Records:', result.records?.length || 0);
      console.log('[COUNT EMPLOYÉS] Total size:', result.totalSize);
      
      const totaux = {};
      
      if (result.records && result.records.length > 0) {
        console.log('[COUNT EMPLOYÉS] Détail des résultats:');
        console.log('[COUNT EMPLOYÉS] Structure premier record:', JSON.stringify(result.records[0], null, 2));
        
        result.records.forEach((record, index) => {
          // Essayer plusieurs façons d'accéder au nom
          let employeur = null;
          if (record.Employeur__r && record.Employeur__r.Name) {
            employeur = record.Employeur__r.Name;
          } else if (record.Name) {
            // Parfois le nom est directement dans Name
            employeur = record.Name;
          } else if (record.Employeur__c) {
            // Si on n'a que l'ID, on garde l'ID (sera mappé plus tard)
            employeur = record.Employeur__c;
          }
          
          const total = record.total || record.expr0 || record.Count || 0;
          
          console.log(`[COUNT EMPLOYÉS]   ${index + 1}. Record:`, {
            employeur,
            total,
            keys: Object.keys(record),
            Employeur__r: record.Employeur__r,
            Employeur__c: record.Employeur__c
          });
          
          if (employeur) {
            totaux[employeur] = total;
          }
        });
      } else {
        console.log('[COUNT EMPLOYÉS] ⚠️ Aucun résultat, initialisation à 0');
        employeurs.forEach(emp => {
          totaux[emp] = 0;
        });
      }
      
      console.log('[COUNT EMPLOYÉS] Totaux finaux:', totaux);
      console.log('═══════════════════════════════════════════════════════');
      
      return totaux;
      
    } catch (error) {
      console.error('═══════════════════════════════════════════════════════');
      console.error('[COUNT EMPLOYÉS] ❌ ERREUR:', error.message);
      console.error('[COUNT EMPLOYÉS] Code:', error.errorCode);
      if (error.errorCode === 'INVALID_FIELD') {
        console.error('[COUNT EMPLOYÉS] 🚨 CHAMP INVALIDE !');
        console.error('[COUNT EMPLOYÉS] Vérifier les noms de champs Salesforce');
      }
      console.error('═══════════════════════════════════════════════════════');
      return {};
    }
  }

  /**
   * Compte les véhicules par société porteuse
   */
  async countVehiculesByPorteuse(porteuses, dateDebut, dateFin) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('[COUNT VÉHICULES] Fonction appelée');
    console.log('[COUNT VÉHICULES] Sociétés porteuses:', porteuses);
    
    if (!this.conn || !porteuses || porteuses.length === 0) {
      return {};
    }
    
    try {
      // Requête SANS filtre de dates (champs inexistants)
      // Utiliser l'ID dans GROUP BY pour éviter les problèmes de relation
      const query = `
        SELECT Filiale_Porteuse_Contrat__c, Filiale_Porteuse_Contrat__r.Name, COUNT(Id) total
        FROM Vehicule_Flotte__c
        WHERE Filiale_Porteuse_Contrat__r.Name IN ('${porteuses.join("','")}')
        GROUP BY Filiale_Porteuse_Contrat__c, Filiale_Porteuse_Contrat__r.Name
      `;
      
      console.log('[COUNT VÉHICULES] Query SOQL:');
      console.log(query);
      
      const result = await this.conn.query(query);
      
      console.log('[COUNT VÉHICULES] ✅ Requête exécutée');
      console.log('[COUNT VÉHICULES] Records:', result.records?.length || 0);
      console.log('[COUNT VÉHICULES] Total size:', result.totalSize);
      
      const totaux = {};
      
      if (result.records && result.records.length > 0) {
        console.log('[COUNT VÉHICULES] Détail des résultats:');
        console.log('[COUNT VÉHICULES] Structure premier record:', JSON.stringify(result.records[0], null, 2));
        
        result.records.forEach((record, index) => {
          // Essayer plusieurs façons d'accéder au nom
          let porteuse = null;
          if (record.Filiale_Porteuse_Contrat__r && record.Filiale_Porteuse_Contrat__r.Name) {
            porteuse = record.Filiale_Porteuse_Contrat__r.Name;
          } else if (record.Name) {
            porteuse = record.Name;
          } else if (record.Filiale_Porteuse_Contrat__c) {
            porteuse = record.Filiale_Porteuse_Contrat__c;
          }
          
          const total = record.total || record.expr0 || record.Count || 0;
          
          console.log(`[COUNT VÉHICULES]   ${index + 1}. Record:`, {
            porteuse,
            total,
            keys: Object.keys(record),
            Filiale_Porteuse_Contrat__r: record.Filiale_Porteuse_Contrat__r,
            Filiale_Porteuse_Contrat__c: record.Filiale_Porteuse_Contrat__c
          });
          
          if (porteuse) {
            totaux[porteuse] = total;
          }
        });
      }
      
      console.log('[COUNT VÉHICULES] Totaux finaux:', totaux);
      console.log('═══════════════════════════════════════════════════════');
      
      return totaux;
      
    } catch (error) {
      console.error('[COUNT VÉHICULES] ❌ ERREUR:', error.message);
      return {};
    }
  }

  /**
   * Récupère la liste des véhicules depuis Salesforce
   */
  async getVehicules() {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    try {
      const query = `
        SELECT Id, Name, Immatriculation__c, Proprietaire__c, Loueur__c
        FROM Vehicule__c
      `;
      
      const result = await this.conn.query(query);
      return result.records;
    } catch (error) {
      console.error('Erreur lors de la récupération des véhicules:', error.message);
      throw new Error(`Impossible de récupérer les véhicules. Vérifiez que l'objet Vehicule__c existe dans votre org.`);
    }
  }

  /**
   * Récupère les données d'assurances depuis Salesforce
   */
  async getAssurances() {
    // Ancienne méthode (objet non présent). On retourne vide pour ne pas bloquer.
    return [];
  }

  /**
   * Récupère les assurances via IO_ElementContratAssurance__c (véhicule, assureur, police)
   */
  async getAssurancesFromElements() {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    const query = `
      SELECT Id, Name, IO_Assureur__c, IO_Police__c,
             IO_ContratAssurance__c, IO_ContratAssurance__r.Name, IO_ContratAssurance__r.IO_Assureur__c,
             IO_VehiculeAssure__c, IO_VehiculeAssure__r.Name
      FROM IO_ElementContratAssurance__c
      WHERE (Element_Actif__c = true OR IO_ContratActif__c = true OR IO_ContratAssurance__r.IO_Actif__c = true)
      LIMIT 1000
    `;

    try {
      const result = await this.conn.query(query);
      return result.records;
    } catch (error) {
      console.error('Erreur lors de la récupération des assurances (Elements):', error.message);
      return [];
    }
  }

  /**
   * Récupère les assurances par immatriculation (Vehicule_Flotte__c.Name)
   */
  async getAssurancesByImmat(immat) {
    if (!this.conn || !immat) return [];
    try {
      const veh = await this.conn.query(
        `SELECT Id, Name FROM Vehicule_Flotte__c WHERE Name = '${immat}' LIMIT 1`
      );
      if (!veh.totalSize) return [];
      const vid = veh.records[0].Id;
      const res = await this.conn.query(`
        SELECT Id, Name, IO_Assureur__c, IO_Police__c,
               IO_ContratAssurance__r.Name, IO_ContratAssurance__r.IO_Assureur__c,
               IO_VehiculeAssure__r.Name
        FROM IO_ElementContratAssurance__c
        WHERE IO_VehiculeAssure__c = '${vid}'
          AND (Element_Actif__c = true OR IO_ContratActif__c = true OR IO_ContratAssurance__r.IO_Actif__c = true)
        LIMIT 5
      `);
      return res.records.map(a => ({
        vehicule: a.IO_VehiculeAssure__r ? a.IO_VehiculeAssure__r.Name : immat,
        numeroContrat: a.IO_Police__c || (a.IO_ContratAssurance__r && a.IO_ContratAssurance__r.Name),
        assureur: a.IO_Assureur__c || (a.IO_ContratAssurance__r && a.IO_ContratAssurance__r.IO_Assureur__c) || 'N/A'
      }));
    } catch (error) {
      console.error('Erreur getAssurancesByImmat:', error.message);
      return [];
    }
  }

  /**
   * Échappe les caractères spéciaux pour SOQL
   */
  escapeSOQLValue(value) {
    if (!value || typeof value !== 'string') return '';
    // Échapper les apostrophes et backslashes pour SOQL
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Recherche d'assurances par immatriculation ou société (recherche LIKE)
   * Retourne les informations complètes du véhicule et de ses contrats
   */
  async searchAssurancesByImmat(query) {
    if (!this.conn || !query || query.length < 2) return [];
    
    try {
      // Échapper les caractères spéciaux pour SOQL de manière sécurisée
      const safeQuery = this.escapeSOQLValue(query.trim());
      
      if (!safeQuery) return [];
      
      console.log('[SF Assurances] Recherche:', safeQuery);
      
      // Requête SOQL pour rechercher par immatriculation OU société
      // LIKE est généralement insensible à la casse dans Salesforce
      // Retirer le filtre sur les contrats actifs pour trouver tous les véhicules
      const soqlQuery = `
        SELECT 
          Id,
          Name,
          IO_Police__c,
          IO_Assureur__c,
          IO_VehiculeAssure__r.Name,
          IO_VehiculeAssure__r.Filiale_Porteuse_Contrat__r.Name,
          IO_VehiculeAssure__r.Filiale_Proprietaire_Vehicule__r.Name,
          IO_VehiculeAssure__r.Agence_de_Location__r.Name,
          IO_VehiculeAssure__r.Constructeur__c,
          IO_VehiculeAssure__r.IO_DateMEC__c,
          IO_VehiculeAssure__r.IO_DernierKmTransactions__c,
          IO_VehiculeAssure__r.Modele_Vehicule__c,
          IO_VehiculeAssure__r.Tiers_Proprietaire_Vehicule__c,
          IO_VehiculeAssure__r.Tiers_Proprietaire_Vehicule__r.Name,
          IO_VehiculeAssure__r.Fournisseur_Vehicule__r.Name
        FROM IO_ElementContratAssurance__c
        WHERE 
          (IO_VehiculeAssure__r.Name LIKE '%${safeQuery}%'
           OR IO_VehiculeAssure__r.Filiale_Porteuse_Contrat__r.Name LIKE '%${safeQuery}%'
           OR IO_VehiculeAssure__r.Filiale_Proprietaire_Vehicule__r.Name LIKE '%${safeQuery}%')
        ORDER BY IO_VehiculeAssure__r.Name
        LIMIT 100
      `.replace(/\s+/g, ' ').trim();
      
      console.log('[SF Assurances] Query:', soqlQuery);
      
      // Essayer avec query() d'abord, puis fallback sur request() si erreur URI
      let result;
      try {
        result = await this.conn.query(soqlQuery);
        } catch (queryError) {
          if (queryError.message && queryError.message.includes('Invalid URI')) {
            console.log('[SF Assurances] Erreur URI avec query(), tentative avec request()');
            // Fallback avec request() pour éviter les problèmes d'URI
            const apiVersion = this.conn.version || '58.0';
            const encodedQuery = encodeURIComponent(soqlQuery);
            result = await this.conn.request({
              method: 'GET',
              url: `/services/data/v${apiVersion}/query/?q=${encodedQuery}`
            });
          } else {
            throw queryError;
          }
        }
      
      console.log('[SF Assurances] Résultats trouvés:', result.totalSize);
      
      // Mapper les résultats vers le format attendu
      const rows = result.records.map(r => {
        const vehicule = r.IO_VehiculeAssure__r;
        
        return {
          immatriculation: vehicule?.Name || 'N/C',
          societePorteuse: vehicule?.Filiale_Porteuse_Contrat__r?.Name || '—',
          societeProprietaire: vehicule?.Filiale_Proprietaire_Vehicule__r?.Name || '—',
          agenceLocation: vehicule?.Agence_de_Location__r?.Name || '—',
          organismeFinancement: '—', // À récupérer depuis l'objet Contrats de Financement
          contratFinancement: '—', // À récupérer depuis l'objet Contrat de location (nécessite le nom exact de la relation)
          fournisseurEntretien: vehicule?.Fournisseur_Vehicule__r?.Name || '—',
          assureur: r.IO_Assureur__c || '—',
          numeroContrat: r.IO_Police__c || '—'
        };
      });
      
      return rows;
    } catch (error) {
      console.error('[SF Assurances] Erreur recherche assurances:', error.message);
      throw error;
    }
  }

  /**
   * Récupère les détails complets d'un véhicule par son immatriculation
   */
  async getVehiculeDetails(immatriculation) {
    if (!this.conn || !immatriculation) return null;
    
    try {
      const safeImmat = this.escapeSOQLValue(immatriculation.trim());
      
      if (!safeImmat) return null;
      
      console.log('[SF Vehicule] Récupération détails pour:', safeImmat);
      
      // Requête SOQL pour récupérer tous les détails du véhicule et ses contrats
      // Utiliser LIKE au lieu de = pour être insensible à la casse
      const soqlQuery = `
        SELECT 
          Id,
          Name,
          IO_Police__c,
          IO_Assureur__c,
          IO_VehiculeAssure__r.Id,
          IO_VehiculeAssure__r.Name,
          IO_VehiculeAssure__r.Filiale_Porteuse_Contrat__r.Name,
          IO_VehiculeAssure__r.Filiale_Proprietaire_Vehicule__r.Name,
          IO_VehiculeAssure__r.Agence_de_Location__r.Name,
          IO_VehiculeAssure__r.Constructeur__c,
          IO_VehiculeAssure__r.IO_DateMEC__c,
          IO_VehiculeAssure__r.IO_DernierKmTransactions__c,
          IO_VehiculeAssure__r.Modele_Vehicule__c,
          IO_VehiculeAssure__r.Modele_Vehicule__r.Name,
          IO_VehiculeAssure__r.Tiers_Proprietaire_Vehicule__c,
          IO_VehiculeAssure__r.Tiers_Proprietaire_Vehicule__r.Name,
          IO_VehiculeAssure__r.Fournisseur_Vehicule__r.Name,
          IO_ContratAssurance__r.Id,
          IO_ContratAssurance__r.Name,
          IO_ContratAssurance__r.IO_Actif__c,
          Element_Actif__c,
          IO_ContratActif__c
        FROM IO_ElementContratAssurance__c
        WHERE IO_VehiculeAssure__r.Name LIKE '${safeImmat}'
        ORDER BY IO_ContratAssurance__r.Name DESC NULLS LAST
        LIMIT 50
      `.replace(/\s+/g, ' ').trim();
      
      console.log('[SF Vehicule] Query:', soqlQuery);
      
      let result;
      try {
        result = await this.conn.query(soqlQuery);
      } catch (queryError) {
        console.error('[SF Vehicule] Erreur query:', queryError.message);
        console.error('[SF Vehicule] Stack:', queryError.stack);
        
        if (queryError.message && queryError.message.includes('Invalid URI')) {
          console.log('[SF Vehicule] Erreur URI avec query(), tentative avec request()');
          const apiVersion = this.conn.version || '58.0';
          const encodedQuery = encodeURIComponent(soqlQuery);
          result = await this.conn.request({
            method: 'GET',
            url: `/services/data/v${apiVersion}/query/?q=${encodedQuery}`
          });
        } else {
          // Re-lancer l'erreur avec plus de détails
          throw new Error(`Erreur SOQL: ${queryError.message || 'Erreur inconnue'}`);
        }
      }
      
      if (!result.records || result.records.length === 0) {
        return null;
      }
      
      // Prendre le premier véhicule (tous les enregistrements sont pour le même véhicule)
      const firstRecord = result.records[0];
      const vehicule = firstRecord.IO_VehiculeAssure__r;
      
      // Récupérer tous les contrats d'assurance
      const contratsAssurance = result.records.map(r => ({
        id: r.Id,
        police: r.IO_Police__c || '—',
        assureur: r.IO_Assureur__c || '—',
        dateDebut: null, // Champ IO_DateDebut__c n'existe pas sur IO_ContratAssurance__c
        dateFin: null, // Champ IO_DateFin__c n'existe pas sur IO_ContratAssurance__c
        actif: r.IO_ContratAssurance__r?.IO_Actif__c || r.Element_Actif__c || r.IO_ContratActif__c || false,
        contratId: r.IO_ContratAssurance__r?.Id || null,
        contratName: r.IO_ContratAssurance__r?.Name || null
      }));
      
      // Construire l'objet de détails complets
      // Utiliser seulement les champs récupérés (pas de champs supplémentaires qui pourraient ne pas exister)
      const instanceUrl = this.conn.instanceUrl || '';
      const salesforceUrl = vehicule?.Id 
        ? `${instanceUrl}/lightning/r/IO_VehiculeAssure__c/${vehicule.Id}/view`
        : null;
      
      const details = {
        id: vehicule?.Id,
        immatriculation: vehicule?.Name || 'N/C',
        societePorteuse: vehicule?.Filiale_Porteuse_Contrat__r?.Name || '—',
        societeProprietaire: vehicule?.Filiale_Proprietaire_Vehicule__r?.Name || '—',
        agenceLocation: vehicule?.Agence_de_Location__r?.Name || '—',
        fournisseurEntretien: vehicule?.Fournisseur_Vehicule__r?.Name || '—',
        constructeur: vehicule?.Constructeur__c || '—',
        modele: vehicule?.Modele_Vehicule__r?.Name || vehicule?.Modele_Vehicule__c || '—',
        dateMEC: vehicule?.IO_DateMEC__c || null,
        dernierKm: vehicule?.IO_DernierKmTransactions__c || '—',
        tiersProprietaire: vehicule?.Tiers_Proprietaire_Vehicule__r?.Name || vehicule?.Tiers_Proprietaire_Vehicule__c || '—',
        contratsAssurance: contratsAssurance,
        salesforceUrl: salesforceUrl
      };
      
      console.log('[SF Vehicule] Détails récupérés pour:', details.immatriculation);
      
      return details;
    } catch (error) {
      console.error('[SF Vehicule] Erreur récupération détails:', error.message);
      console.error('[SF Vehicule] Stack:', error.stack);
      // Re-lancer avec un message plus clair
      throw new Error(`Erreur lors de la récupération des détails du véhicule: ${error.message || 'Erreur inconnue'}`);
    }
  }

  /**
   * Récupère toutes les données nécessaires depuis Salesforce
   */
  async getAllData() {
    try {
      const [utilisations, tournees, vehicules, assurancesElements, ods, courses, tourneesIO] = await Promise.all([
        this.getUtilisations().catch(() => []),
        this.getTournees().catch(() => []),
        this.getVehicules().catch(() => []),
        this.getAssurancesFromElements().catch(() => []),
        this.getOrdresDeService().catch(() => []),
        this.getCourses().catch(() => []),
        this.getTourneesIO().catch(() => [])
      ]);

      // Convertir les objets Salesforce en format compatible
      return {
        utilisations: utilisations.map(u => ({
          vehicule: u.Vehicule__c,
          chargeur: u.Chargeur__c,
          'code tournee': u.Code_Tournee__c,
          date: u.Date_Utilisation__c,
          utilisateur: u.Utilisateur__c
        })),
        tournees: tournees.map(t => ({
          'code tournee': t.Code_Tournee__c,
          chargeur: t.Chargeur__c,
          societe: t.Societe_Signataire__c
        })),
        vehicules: vehicules.map(v => ({
          vehicule: v.Name || v.Immatriculation__c,
          immatriculation: v.Immatriculation__c,
          proprietaire: v.Proprietaire__c || v.Loueur__c
        })),
        vehiculesAssurances: assurancesElements.map(a => ({
          vehicule: a.IO_VehiculeAssure__r ? a.IO_VehiculeAssure__r.Name : a.IO_VehiculeAssure__c,
          'numero contrat': a.IO_Police__c || (a.IO_ContratAssurance__r && a.IO_ContratAssurance__r.Name),
          assureur: a.IO_Assureur__c || (a.IO_ContratAssurance__r && a.IO_ContratAssurance__r.IO_Assureur__c) || 'N/A'
        })),
        contratsAssurances: assurancesElements.map(a => ({
          'numero contrat': a.IO_Police__c || (a.IO_ContratAssurance__r && a.IO_ContratAssurance__r.Name),
          assureur: a.IO_Assureur__c || (a.IO_ContratAssurance__r && a.IO_ContratAssurance__r.IO_Assureur__c) || 'N/A'
        })),
        ods: ods.map(o => ({
          id: o.Id,
          name: o.Name,
          date: o.IO_Date__c,
          chauffeurId: o.IO_Chauffeur__c,
          chauffeurName: o.IO_Chauffeur__r ? o.IO_Chauffeur__r.Name : null,
          vehiculeId: o.IO_Vehicule__c,
          vehiculeName: o.IO_Vehicule__r ? o.IO_Vehicule__r.Name : null
        })),
        courses: courses.map(c => ({
          id: c.Id,
          name: c.Name,
          odsId: c.IO_OrdreDeService__c,
          tourneeId: c.IO_Tournee__c,
          tourneeName: c.IO_Tournee__r ? c.IO_Tournee__r.Name : null
        })),
        tourneesIO: tourneesIO.map(t => ({
          id: t.Id,
          name: t.Name
        }))
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des données:', error.message);
      throw error;
    }
  }

  /**
   * Récupère uniquement les affectations (ODS + Course + Tournée) avec filtres optionnels
   * @param {string|null} dateIso format YYYY-MM-DD
   * @param {string|null} tourneeCode code tournée (Name)
   */
  async getAffectationsFiltered(dateIso = null, tourneeCode = null) {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    // Construire le WHERE dynamique
    const where = [];
    if (dateIso) {
      where.push(`IO_OrdreDeService__r.IO_Date__c = ${dateIso}`);
    }
    if (tourneeCode) {
      const safe = tourneeCode.replace(/'/g, "\\'");
      where.push(`IO_Tournee__r.Name = '${safe}'`);
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT Id, Name, IO_OrdreDeService__c, IO_OrdreDeService__r.IO_Date__c,
             IO_OrdreDeService__r.IO_Chauffeur__c, IO_OrdreDeService__r.IO_Chauffeur__r.Name,
             IO_OrdreDeService__r.IO_Vehicule__c, IO_OrdreDeService__r.IO_Vehicule__r.Name,
             IO_Tournee__c, IO_Tournee__r.Name
      FROM IO_Course__c
      ${whereClause}
      LIMIT 500
    `;

    try {
      const res = await this.conn.query(query);
      return res.records.map(r => ({
        date: r.IO_OrdreDeService__r ? r.IO_OrdreDeService__r.IO_Date__c : null,
        tournee: r.IO_Tournee__r ? r.IO_Tournee__r.Name : r.IO_Tournee__c,
        chauffeur: r.IO_OrdreDeService__r && r.IO_OrdreDeService__r.IO_Chauffeur__r
          ? r.IO_OrdreDeService__r.IO_Chauffeur__r.Name
          : r.IO_OrdreDeService__r ? r.IO_OrdreDeService__r.IO_Chauffeur__c : null,
        vehicule: r.IO_OrdreDeService__r && r.IO_OrdreDeService__r.IO_Vehicule__r
          ? r.IO_OrdreDeService__r.IO_Vehicule__r.Name
          : r.IO_OrdreDeService__r ? r.IO_OrdreDeService__r.IO_Vehicule__c : null,
        course: r.Name,
        ods: r.IO_OrdreDeService__c
      }));
    } catch (error) {
      console.error('Erreur lors de la récupération filtrée des affectations:', error.message);
      return [];
    }
  }

  /**
   * Tournées actives (IO_Tournee__c) pour rentabilité / grilles tarifaires.
   * @param {{ chargeur?: string, societe?: string }} filters - LIKE sur chargeur (Fx + relation) et IO_Societe__r.Name
   */
  async getTourneesIORentabilite(filters = {}) {
    if (!this.conn) {
      throw new Error('Non connecté à Salesforce');
    }
    function normalizeSociete(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\s*&\s*/g, '&')
        .trim();
    }

    const chargeur = filters.chargeur != null ? String(filters.chargeur).trim() : '';
    const societe = filters.societe != null ? String(filters.societe).trim() : '';
    const esc = (s) => String(s).replace(/'/g, "''");

    let where = 'WHERE IO_Active__c = true';
    // Fx souvent vide côté org : matcher aussi le nom du chargeur (relation)
    if (chargeur) {
      const e = esc(chargeur);
      where += ` AND (IO_FxChargeurName__c LIKE '%${e}%' OR IO_Chargeur__r.Name LIKE '%${e}%')`;
    }
    // Filtrage société fait côté JS pour absorber les variantes d'écriture
    // (ex: "D & J transport" vs "D&J Transport").

    const query = `
      SELECT Name, IO_Libelle__c, IO_FxChargeurName__c, IO_Chargeur__c, IO_Chargeur__r.Name,
             IO_Societe__c, IO_Active__c
      FROM IO_Tournee__c
      ${where}
      ORDER BY Name ASC
    `;

    let allRecords = [];
    let result = await this.conn.query(query);
    allRecords = allRecords.concat(result.records);
    while (!result.done && result.nextRecordsUrl) {
      result = await this.conn.queryMore(result.nextRecordsUrl);
      allRecords = allRecords.concat(result.records);
    }
    if (!societe) {
      return allRecords;
    }

    const societeNorm = normalizeSociete(societe);
    return allRecords.filter((r) => normalizeSociete(r?.IO_Societe__r?.Name) === societeNorm);
  }

  /**
   * Déconnecte de Salesforce
   */
  disconnect() {
    if (this.conn) {
      this.conn.logout().catch(() => {});
      this.conn = null;
    }
  }
}

module.exports = SalesforceService;

