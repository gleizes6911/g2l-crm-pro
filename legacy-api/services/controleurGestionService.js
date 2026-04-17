/**
 * Service Contrôleur de Gestion
 */

const path = require('path');

// Import des services Salesforce
let exploitationService;
let salesforceService;

try {
  exploitationService = require('./exploitationService');
  salesforceService = require('./salesforceService');
} catch (e) {
  console.log('[CDG] Services Salesforce non disponibles, utilisation données locales');
}

// Chargeurs au point (mode facturation)
const CHARGEURS_AU_POINT = ['CIBLEX', 'CHRONOPOST', 'RELAIS COLIS'];

// Données locales
const salairesCharges = [];
const tarifications = [];
const centresCouts = [
  { id: 'CC001', categorie: 'PERSONNEL', libelle: 'Salaires', type: 'VARIABLE', periodicite: 'MENSUEL' },
  { id: 'CC002', categorie: 'VEHICULES', libelle: 'Carburant', type: 'VARIABLE', periodicite: 'MENSUEL' },
  { id: 'CC003', categorie: 'VEHICULES', libelle: 'Location/Leasing', type: 'FIXE', periodicite: 'MENSUEL' },
  { id: 'CC004', categorie: 'VEHICULES', libelle: 'Assurances', type: 'FIXE', periodicite: 'MENSUEL' },
  { id: 'CC005', categorie: 'VEHICULES', libelle: 'Entretien', type: 'VARIABLE', periodicite: 'MENSUEL' }
];
const coutsReels = [];
const facturesEmises = [];

// Mode de facturation automatique
function getModeFacturationAutomatique(chargeurNom) {
  if (!chargeurNom) return 'COLIS';
  const nomUpper = chargeurNom.toUpperCase();
  return CHARGEURS_AU_POINT.some(c => nomUpper.includes(c)) ? 'POINT' : 'COLIS';
}

// CRUD Salaires
function getSalaires() { return salairesCharges; }
function getSalaireById(id) { return salairesCharges.find(s => s.id === id); }
function createSalaire(data) {
  const salaire = { id: `SAL_${Date.now()}`, ...data };
  salairesCharges.push(salaire);
  return salaire;
}
function updateSalaire(id, data) {
  const index = salairesCharges.findIndex(s => s.id === id);
  if (index >= 0) {
    salairesCharges[index] = { ...salairesCharges[index], ...data };
    return salairesCharges[index];
  }
  return null;
}
function deleteSalaire(id) {
  const index = salairesCharges.findIndex(s => s.id === id);
  if (index >= 0) {
    salairesCharges.splice(index, 1);
    return true;
  }
  return false;
}

// CRUD Tarifications
function getTarifications() { return tarifications; }
function createTarification(data) {
  const tarif = { id: `TAR_${Date.now()}`, ...data };
  tarifications.push(tarif);
  return tarif;
}
function updateTarification(id, data) {
  const index = tarifications.findIndex(t => t.id === id);
  if (index >= 0) {
    tarifications[index] = { ...tarifications[index], ...data };
    return tarifications[index];
  }
  return null;
}

// Centres de coûts
function getCentresCouts() { return centresCouts; }

// Coûts réels
function getCoutsReels() { return coutsReels; }
function createCoutReel(data) {
  const cout = { id: `COUT_${Date.now()}`, ...data, dateCreation: new Date().toISOString() };
  coutsReels.push(cout);
  return cout;
}

// Factures
function getFactures() { return facturesEmises; }
function createFacture(data) {
  const facture = {
    id: `FACT_${Date.now()}`,
    ...data,
    dateCreation: new Date().toISOString()
  };
  // Calculer TVA et TTC si non fournis
  if (data.montantHT && !data.tva) {
    facture.tva = Math.round(data.montantHT * 0.2 * 100) / 100;
    facture.montantTTC = Math.round((data.montantHT + facture.tva) * 100) / 100;
  }
  facturesEmises.push(facture);
  return facture;
}
function updateFacture(id, data) {
  const index = facturesEmises.findIndex(f => f.id === id);
  if (index >= 0) {
    facturesEmises[index] = { ...facturesEmises[index], ...data };
    return facturesEmises[index];
  }
  return null;
}

// Calculs prévisionnels
function calculerCAPrevisionnelJournalier(date, tarifications) {
  return { date, caTotal: 0, details: [] };
}

function calculerCoutsPrevisionnelsJournaliers(date, salaires, couts) {
  return { date, coutsTotal: 0, details: [] };
}

function calculerRentabilitePrevisionnelle(periode) {
  return { periode, ca: 0, couts: 0, marge: 0, tauxMarge: 0 };
}

function calculerRentabiliteReelle(periode) {
  return { periode, ca: 0, couts: 0, marge: 0, tauxMarge: 0 };
}

// Dashboard
function getDashboardCDG(periode) {
  return {
    periode,
    kpis: {
      caPrevu: 0,
      caReel: 0,
      coutsTotal: 0,
      margePrevisionnelle: 0,
      margeReelle: 0
    },
    centresCouts: centresCouts.length
  };
}

// Coûts Salesforce - Carburant
async function getCoutsCarburantSalesforce(dateDebut, dateFin, environment = 'production') {
  try {
    if (!exploitationService) {
      console.log('[CDG] Service exploitation non disponible');
      return null;
    }
    
    console.log(`[CDG] ⛽ Récupération coûts carburant: ${dateDebut} -> ${dateFin}`);
    const stats = await exploitationService.getStatistiquesCarburantSalesforce(dateDebut, dateFin, environment);
    
    return {
      totalCarburant: stats.montantTotalTTC || stats.montantTotalHT || 0,
      volumeTotal: stats.volumeTotal || 0,
      consommationMoyenne: stats.consommationMoyenne || 0,
      parFournisseur: stats.parFournisseur || {},
      parVehicule: stats.parVehicule || {},
      nbTransactions: stats.nbTransactions || 0
    };
  } catch (error) {
    console.error('[CDG] ❌ Erreur récupération coûts carburant:', error.message);
    return null;
  }
}

// Coûts Salesforce - Véhicules
async function getCoutsVehiculesSalesforce(dateDebut, dateFin, environment = 'production') {
  try {
    if (!salesforceService) {
      console.log('[CDG] Service Salesforce non disponible');
      return null;
    }
    
    const sfService = new salesforceService(environment);
    await sfService.connect();
    const conn = sfService.conn;
    
    if (!conn) {
      console.log('[CDG] Connexion Salesforce échouée');
      return null;
    }
    
    console.log('[CDG] 🚗 Récupération des coûts véhicules depuis Salesforce...');
    
    let totalLocation = 0;
    let totalLeasing = 0;
    let totalAssurance = 0;
    let totalEntretien = 0;
    const details = [];
    
    // ÉTAPE 1 : QUERY VÉHICULES AVEC MODÈLE, ASSUREUR, AGENCE DE LOCATION
    try {
      const query = `
        SELECT Id, Name, 
               Cout_Detention_Mensuel__c,
               Cout_Assurance_Mensuel__c,
               IO_Actif__c,
               IO_MontantLocation__c,
               IO_NatureDetention__c,
               Modele_Vehicule__r.Name,
               Modele_Vehicule__c,
               IO_ContratAssurance__r.IO_Assureur__r.Name,
               Agence_de_Location__r.Name,
               Filiale_Porteuse_Contrat__r.Name,
               Filiale_Proprietaire_Vehicule__r.Name
        FROM Vehicule_Flotte__c
        LIMIT 500
      `;
      
      console.log('[CDG] 🔍 Exécution query Salesforce (véhicules)...');
      const result = await conn.query(query);
      
      console.log(`[CDG] ✅ ${result.records.length} véhicules trouvés`);
      
      // DEBUG - Afficher structure complète du contrat assurance
      result.records.slice(0, 5).forEach((r, index) => {
        if (r.Cout_Assurance_Mensuel__c > 0) {
          console.log(`\n[CDG] 🧪 Véhicule avec assurance: ${r.Name}`);
          console.log('  ├─ Assurance mensuelle:', r.Cout_Assurance_Mensuel__c, '€');
          console.log('  ├─ IO_ContratAssurance__r:', r.IO_ContratAssurance__r);
          
          if (r.IO_ContratAssurance__r) {
            console.log('  │  ├─ Name:', r.IO_ContratAssurance__r.Name);
            console.log('  │  ├─ IO_Assureur__c:', r.IO_ContratAssurance__r.IO_Assureur__c);
            console.log('  │  ├─ IO_Assureur__r.Name:', r.IO_ContratAssurance__r.IO_Assureur__r?.Name);
            console.log('  │  └─ Tous les champs du contrat:', Object.keys(r.IO_ContratAssurance__r));
          }
          console.log('  └─ Modèle:', r.Modele_Vehicule__r?.Name || 'N/A');
        }
      });
      
      console.log(`[CDG] 📊 Véhicules AVEC location: ${result.records.filter(r => (r.Cout_Detention_Mensuel__c || 0) > 0 || (r.IO_MontantLocation__c || 0) > 0).length}`);
      console.log(`[CDG] 📊 Véhicules AVEC assurance: ${result.records.filter(r => (r.Cout_Assurance_Mensuel__c || 0) > 0).length}`);
      
      // Traiter tous les véhicules
      result.records.forEach(r => {
        const coutDetention = r.Cout_Detention_Mensuel__c || 0;
        const montantLocation = r.IO_MontantLocation__c || 0;
        const location = coutDetention || montantLocation;
        const assurance = r.Cout_Assurance_Mensuel__c || 0;
        
        totalLocation += location;
        totalAssurance += assurance;
        totalEntretien += 0;
        
        details.push({
          id: r.Id,
          vehicule: r.Name,
          immatriculation: r.Name,
          actif: r.IO_Actif__c === true,
          
          // CHAMPS ENRICHIS
          modele: r.Modele_Vehicule__r?.Name || r.Modele_Vehicule__c || 'N/A',
          assureur: r.IO_ContratAssurance__r?.IO_Assureur__r?.Name || 'N/A',
          agenceLocation: r.Agence_de_Location__r?.Name || 'N/A',
          organismeFinancement: null,
          modeDetention: r.IO_NatureDetention__c || 'N/A',
          
          // FILIALES
          filialePorteuseContrat: r.Filiale_Porteuse_Contrat__r?.Name || 'N/A',
          filialeProprietaire: r.Filiale_Proprietaire_Vehicule__r?.Name || 'N/A',
          
          coutAssuranceMensuel: assurance,
          montantTTCLocation: location,
          montantTTCLeasing: 0,
          location: location,
          leasing: 0,
          assurance: assurance,
          entretien: 0,
          total: location + assurance,
          type: location > 0 ? 'LOCATION' : null,
          marque: null,
          dateMiseEnService: null,
          kilometrage: null,
          carburant: null,
          puissanceFiscale: null,
          numeroChassis: null,
          dateProchainCT: null,
          dateProchaineRevision: null
        });
      });
      
      console.log(`[CDG] 📊 Étape 1 - Location: ${totalLocation.toFixed(2)}€, Assurance: ${totalAssurance.toFixed(2)}€`);
      
    } catch (queryError) {
      console.error('[CDG] ❌ Erreur query véhicules:', queryError.message);
      return null;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ÉTAPE 2 : RÉCUPÉRATION DES CONTRATS DE FINANCEMENT (LEASING)
    // ═══════════════════════════════════════════════════════════════
    try {
      const queryLeasing = `
        SELECT Id, Name,
               IO_VehiculeFlotte__c,
               IO_VehiculeFlotte__r.Name,
               IO_VehiculeFlotte__r.Modele_Vehicule__r.Name,
               IO_VehiculeFlotte__r.IO_ContratAssurance__r.IO_Assureur__r.Name,
               IO_VehiculeFlotte__r.Filiale_Porteuse_Contrat__r.Name,
               IO_VehiculeFlotte__r.Filiale_Proprietaire_Vehicule__r.Name,
               IO_OrganismeFinancement__c,
               IO_OrganismeFinancement__r.Name,
               IO_MontantEcheance__c,
               Statut__c
        FROM IO_ContratFinancement__c
        WHERE Statut__c = 'Activé'
          AND IO_VehiculeFlotte__c != null
          AND IO_MontantEcheance__c != null
        LIMIT 500
      `;
      
      console.log('[CDG] 💳 Récupération contrats de financement (leasing)...');
      const resultLeasing = await conn.query(queryLeasing);
      
      console.log(`[CDG] ✅ ${resultLeasing.records.length} contrats de leasing trouvés`);
      
      // Traiter les contrats de leasing
      resultLeasing.records.forEach(contrat => {
        const montantLeasing = contrat.IO_MontantEcheance__c || 0;
        const vehiculeNom = contrat.IO_VehiculeFlotte__r?.Name || 'N/A';
        const modele = contrat.IO_VehiculeFlotte__r?.Modele_Vehicule__r?.Name || 'N/A';
        const assureur = contrat.IO_VehiculeFlotte__r?.IO_ContratAssurance__r?.IO_Assureur__r?.Name || 'N/A';
        const organismeFinancement = contrat.IO_OrganismeFinancement__r?.Name || 'N/A';
        
        // Filiales depuis le véhicule lié
        const filialePorteuseContrat = contrat.IO_VehiculeFlotte__r?.Filiale_Porteuse_Contrat__r?.Name || 'N/A';
        const filialeProprietaire = contrat.IO_VehiculeFlotte__r?.Filiale_Proprietaire_Vehicule__r?.Name || 'N/A';
        
        totalLeasing += montantLeasing;
        
        // Chercher si le véhicule existe déjà dans les détails (avec location)
        const existingDetail = details.find(d => d.vehicule === vehiculeNom);
        
        if (existingDetail) {
          // Véhicule existe déjà (a une location), ajouter le leasing
          existingDetail.montantTTCLeasing = montantLeasing;
          existingDetail.leasing = montantLeasing;
          existingDetail.total += montantLeasing;
          existingDetail.type = 'LOCATION + LEASING';
          existingDetail.organismeFinancement = organismeFinancement;
          
          // Mettre à jour les filiales si elles n'existent pas
          if (!existingDetail.filialePorteuseContrat || existingDetail.filialePorteuseContrat === 'N/A') {
            existingDetail.filialePorteuseContrat = filialePorteuseContrat;
          }
          if (!existingDetail.filialeProprietaire || existingDetail.filialeProprietaire === 'N/A') {
            existingDetail.filialeProprietaire = filialeProprietaire;
          }
        } else {
          // Nouveau véhicule (leasing uniquement)
          details.push({
            id: contrat.IO_VehiculeFlotte__c,
            vehicule: vehiculeNom,
            immatriculation: vehiculeNom,
            actif: true,
            type: 'LEASING',
            
            modele: modele,
            assureur: assureur,
            agenceLocation: null,
            organismeFinancement: organismeFinancement,
            modeDetention: 'LEASING',
            
            // Filiales
            filialePorteuseContrat: filialePorteuseContrat,
            filialeProprietaire: filialeProprietaire,
            
            coutAssuranceMensuel: 0,
            montantTTCLocation: 0,
            montantTTCLeasing: montantLeasing,
            location: 0,
            leasing: montantLeasing,
            assurance: 0,
            entretien: 0,
            total: montantLeasing
          });
        }
      });
      
      console.log(`[CDG] 📊 Leasings récupérés: ${totalLeasing.toFixed(2)}€`);
      
    } catch (queryError) {
      console.error('[CDG] ❌ Erreur query leasing:', queryError.message);
    }
    
    sfService.disconnect();
    
    // Calculs finaux
    const totalLocationLeasing = totalLocation + totalLeasing;
    const totalGeneral = totalLocationLeasing + totalAssurance + totalEntretien;
    
    // Logs récapitulatifs
    console.log('[CDG] 📊 ═══════════════════════════════════════');
    console.log(`[CDG] 📊 Total Location:  ${totalLocation.toFixed(2)}€`);
    console.log(`[CDG] 📊 Total Leasing:   ${totalLeasing.toFixed(2)}€`);
    console.log(`[CDG] 📊 Total Loc+Lea:   ${totalLocationLeasing.toFixed(2)}€`);
    console.log(`[CDG] 📊 Total Assurance: ${totalAssurance.toFixed(2)}€`);
    console.log(`[CDG] 📊 Total Entretien: ${totalEntretien.toFixed(2)}€`);
    console.log(`[CDG] 📊 TOTAL GÉNÉRAL:   ${totalGeneral.toFixed(2)}€`);
    console.log('[CDG] 📊 ═══════════════════════════════════════');
    
    return {
      totalLocation,
      totalLeasing,
      totalLocationLeasing,
      totalAssurance,
      totalEntretien,
      totalGeneral,
      nbVehicules: details.length,
      nbLocations: details.filter(d => d.location > 0).length,
      nbLeasings: details.filter(d => d.leasing > 0).length,
      details: details
    };
    
  } catch (error) {
    console.error('[CDG] ❌ Erreur récupération coûts véhicules:', error.message);
    return null;
  }
}

// Tous les coûts Salesforce
async function getCoutsSalesforce(dateDebut, dateFin, environment = 'production') {
  const [carburant, vehicules] = await Promise.all([
    getCoutsCarburantSalesforce(dateDebut, dateFin, environment),
    getCoutsVehiculesSalesforce(dateDebut, dateFin, environment)
  ]);
  
  return {
    carburant: carburant || { totalCarburant: 0 },
    vehicules: vehicules || { totalLocation: 0, totalAssurance: 0, totalEntretien: 0 },
    total: (carburant?.totalCarburant || 0) + (vehicules?.totalGeneral || 0)
  };
}

module.exports = {
  // Salaires
  getSalaires,
  getSalaireById,
  createSalaire,
  updateSalaire,
  deleteSalaire,
  
  // Tarifications
  getTarifications,
  createTarification,
  updateTarification,
  getModeFacturationAutomatique,
  
  // Centres de coûts
  getCentresCouts,
  getCoutsReels,
  createCoutReel,
  
  // Factures
  getFactures,
  createFacture,
  updateFacture,
  
  // Calculs
  calculerCAPrevisionnelJournalier,
  calculerCoutsPrevisionnelsJournaliers,
  calculerRentabilitePrevisionnelle,
  calculerRentabiliteReelle,
  
  // Salesforce
  getCoutsCarburantSalesforce,
  getCoutsVehiculesSalesforce,
  getCoutsSalesforce,
  
  // Dashboard
  getDashboardCDG
};







