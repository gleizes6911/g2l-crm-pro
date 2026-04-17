// Stockage des modifications manuelles N-1
let modificationsN1 = {};

// Importer les statuts d'absences pour garantir la cohérence
const { STATUTS: ABSENCE_STATUTS } = require('./absenceService');

// Calcul des soldes CP conformes à la législation française
function calculerSoldesCP(employes, absences) {
  const maintenant = new Date();
  
  return employes.filter(e => e.estActif).map(employe => {
    const dateEntree = new Date(employe.dateEntree);
    
    // === PÉRIODE N-1 (année précédente) ===
    const periodeN1 = getPeriodeReference(maintenant.getFullYear() - 1);
    const joursAcquisN1 = calculerJoursAcquisPeriode(dateEntree, periodeN1.debut, periodeN1.fin);
    
    // CP consommés pendant période N-1
    const cpConsommesN1 = calculerCPConsommes(employe.id, absences, periodeN1.debut, periodeN1.fin);
    
    // Report N-1 = Acquis N-1 - Consommés N-1
    const reportN1 = Math.max(0, joursAcquisN1 - cpConsommesN1);
    
    // Vérifier s'il y a une modification manuelle
    const reportN1Manuel = getReportN1Manuel(employe.id);
    const reportN1Final = reportN1Manuel !== undefined ? reportN1Manuel : reportN1;
    
    // === PÉRIODE N (année en cours) ===
    const periodeN = getPeriodeReference(maintenant.getFullYear());
    
    // Jours acquis depuis le début de la période N jusqu'à maintenant
    const debutAcquisition = periodeN.debut > dateEntree ? periodeN.debut : dateEntree;
    const finAcquisition = maintenant < periodeN.fin ? maintenant : periodeN.fin;
    const joursAcquisN = calculerJoursAcquisPeriode(debutAcquisition, debutAcquisition, finAcquisition);
    
    // CP consommés pendant période N (depuis le 01/06/N jusqu'à la fin de la période)
    // On compte toutes les absences validées dans la période N, même futures
    const cpConsommesN = calculerCPConsommes(employe.id, absences, periodeN.debut, periodeN.fin);
    
    // === DÉCOMPTE AVEC PRIORITÉ N-1 ===
    let soldeN1 = reportN1Final;
    let soldeN = joursAcquisN;
    let totalConsomme = cpConsommesN;
    
    // Décompter d'abord sur N-1
    if (totalConsomme > 0) {
      const decompteN1 = Math.min(totalConsomme, soldeN1);
      soldeN1 -= decompteN1;
      totalConsomme -= decompteN1;
      
      // Puis décompter sur N
      if (totalConsomme > 0) {
        soldeN -= totalConsomme;
      }
    }
    
    // Solde total
    const soldeTotal = soldeN1 + soldeN;
    
    return {
      employeId: employe.id,
      nomComplet: employe.nomComplet,
      societe: employe.societe,
      dateEntree: employe.dateEntree,
      
      // Période N-1
      joursAcquisN1,
      reportN1: soldeN1,
      
      // Période N
      joursAcquisN,
      soldeN,
      
      // Totaux
      joursAcquisTotal: joursAcquisN1 + joursAcquisN,
      joursConsommes: cpConsommesN1 + cpConsommesN,
      soldeTotal,
      
      // Alertes
      alerte: soldeTotal < 0 ? 'NEGATIF' : soldeTotal < 5 ? 'FAIBLE' : null,
      
      // Détails pour affichage
      periodeActuelle: `${formatDate(periodeN.debut)} - ${formatDate(periodeN.fin)}`,
      prochainRenouvellement: periodeN.fin
    };
  });
}

// Obtenir les dates de début/fin de la période de référence pour une année donnée
function getPeriodeReference(annee) {
  return {
    debut: new Date(annee, 5, 1), // 1er juin
    fin: new Date(annee + 1, 4, 31, 23, 59, 59) // 31 mai année suivante
  };
}

// Calculer les jours acquis entre deux dates (2,5j par mois)
function calculerJoursAcquisPeriode(dateEntree, debut, fin) {
  // Si l'employé n'était pas encore là au début de la période
  const debutEffectif = dateEntree > debut ? dateEntree : debut;
  
  // Si la période est dans le futur, pas de jours acquis
  if (debutEffectif > fin) return 0;
  
  // Calculer le nombre de mois entre debut et fin
  const finEffective = fin > new Date() ? new Date() : fin;
  
  const mois = Math.floor((finEffective - debutEffectif) / (1000 * 60 * 60 * 24 * 30.44)); // 30.44 = moyenne jours/mois
  
  // 2,5 jours par mois, max 30 jours
  return Math.min(Math.floor(mois * 2.5), 30);
}

// Calculer les CP consommés entre deux dates
// CRITIQUE : Ne compter QUE les absences avec statut "Validée"
function calculerCPConsommes(employeId, absences, debut, fin) {
  console.log(`[SOLDES] Calcul CP consommés pour employé ${employeId}, période ${debut.toISOString().split('T')[0]} à ${fin.toISOString().split('T')[0]}`);
  console.log(`[SOLDES] Total absences disponibles: ${absences.length}`);
  
  // Filtrer strictement : uniquement CP avec statut "Validée"
  const absencesEmploye = absences.filter(a => a.employeId === employeId && a.type === 'CP');
  console.log(`[SOLDES] Absences CP pour cet employé (tous statuts):`, absencesEmploye.map(a => ({ id: a.id, type: a.type, statut: a.statut, dateDebut: a.dateDebut, dateFin: a.dateFin })));
  
  // FILTRE CRITIQUE : Uniquement absences VALIDÉES
  const cpEmploye = absencesEmploye.filter(a => {
    const estValidee = a.statut === ABSENCE_STATUTS.VALIDEE || a.statut === 'Validée';
    if (!estValidee) {
      console.log(`[SOLDES] ⚠️ Absence ${a.id} IGNORÉE (statut: "${a.statut}", attendu: "${ABSENCE_STATUTS.VALIDEE}")`);
    }
    return estValidee;
  });
  
  console.log(`[SOLDES] ✅ Absences CP validées trouvées: ${cpEmploye.length} (sur ${absencesEmploye.length} total)`);
  console.log(`[SOLDES] Statut attendu: "${ABSENCE_STATUTS.VALIDEE}"`);
  
  let totalJours = 0;
  
  cpEmploye.forEach(absence => {
    // Normaliser les dates en créant des objets Date à minuit UTC pour éviter les problèmes de fuseau horaire
    const absenceDebut = new Date(absence.dateDebut + 'T00:00:00');
    const absenceFin = new Date(absence.dateFin + 'T23:59:59');
    
    // Normaliser aussi les dates de période pour comparaison cohérente
    const debutNormalise = new Date(debut);
    debutNormalise.setHours(0, 0, 0, 0);
    const finNormalise = new Date(fin);
    finNormalise.setHours(23, 59, 59, 999);
    
    console.log(`[SOLDES] Traitement absence ${absence.id}: ${absence.dateDebut} à ${absence.dateFin}`);
    console.log(`[SOLDES]   - Début absence: ${absenceDebut.toISOString()}, Fin période: ${finNormalise.toISOString()}`);
    console.log(`[SOLDES]   - Fin absence: ${absenceFin.toISOString()}, Début période: ${debutNormalise.toISOString()}`);
    
    // Vérifier si l'absence chevauche la période
    if (absenceDebut <= finNormalise && absenceFin >= debutNormalise) {
      // Calculer la partie de l'absence qui est dans la période
      const debutDansP = absenceDebut > debutNormalise ? absenceDebut : debutNormalise;
      const finDansP = absenceFin < finNormalise ? absenceFin : finNormalise;
      
      const joursOuvrables = calculerJoursOuvrables(
        debutDansP.toISOString().split('T')[0],
        finDansP.toISOString().split('T')[0]
      );
      
      console.log(`[SOLDES]   - Absence dans la période: ${joursOuvrables} jours ouvrables`);
      totalJours += joursOuvrables;
    } else {
      console.log(`[SOLDES]   - Absence hors période (non comptée)`);
    }
  });
  
  console.log(`[SOLDES] Total jours CP consommés: ${totalJours}`);
  return totalJours;
}

// Calculer jours ouvrables (lun-sam)
function calculerJoursOuvrables(dateDebut, dateFin) {
  const debut = new Date(dateDebut + 'T00:00:00');
  const fin = new Date(dateFin + 'T00:00:00');
  let joursOuvrables = 0;
  
  for (let date = new Date(debut); date <= fin; date.setDate(date.getDate() + 1)) {
    const jour = date.getDay();
    if (jour !== 0) { // Exclure dimanche
      joursOuvrables++;
    }
  }
  
  return joursOuvrables;
}

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getSoldeEmploye(employeId, employes, absences) {
  const soldes = calculerSoldesCP(employes, absences);
  return soldes.find(s => s.employeId === employeId);
}

function setReportN1Manuel(employeId, reportN1) {
  modificationsN1[employeId] = {
    reportN1: parseInt(reportN1),
    dateModification: new Date().toISOString()
  };
  return modificationsN1[employeId];
}

function getReportN1Manuel(employeId) {
  return modificationsN1[employeId]?.reportN1;
}

module.exports = {
  calculerSoldesCP,
  getSoldeEmploye,
  setReportN1Manuel,
  getReportN1Manuel
};







