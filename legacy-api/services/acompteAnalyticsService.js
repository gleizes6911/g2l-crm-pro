const acompteService = require('./acompteService');

async function getAnalyticsDashboard(options = {}) {
  const acomptes = await acompteService.getAcomptes();
  const now = new Date();
  const debutAnnee = new Date(now.getFullYear(), 0, 1);
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  
  console.log('[ANALYTICS] Total acomptes à analyser:', acomptes.length);
  if (acomptes.length > 0) {
    console.log('[ANALYTICS] Premier acompte:', {
      id: acomptes[0].id,
      createdAt: acomptes[0].createdAt,
      montant: acomptes[0].montant,
      statut: acomptes[0].statut
    });
  }
  
  // KPIs principaux
  const enAttente = acomptes.filter(a => a.statut === 'En attente').length;
  const valides = acomptes.filter(a => 
    a.statut === 'Validée par manager' || 
    a.statut === 'En cours de paiement' || 
    a.statut === 'Payée'
  ).length;
  const refuses = acomptes.filter(a => a.statut === 'Refusée').length;
  const enPaiement = acomptes.filter(a => a.statut === 'En cours de paiement').length;
  
  const montantTotalValide = acomptes
    .filter(a => a.statut === 'Validée par manager' || a.statut === 'En cours de paiement' || a.statut === 'Payée')
    .reduce((sum, a) => sum + parseFloat(a.montant || 0), 0);
  
  // Montant total payé (somme de tous les paiements effectués)
  const montantTotalPaye = acomptes.reduce((sum, a) => {
    const totalPaye = (a.paiements || []).reduce((s, p) => s + parseFloat(p.montant || 0), 0);
    return sum + totalPaye;
  }, 0);
  
  const acomptesMois = acomptes.filter(a => 
    new Date(a.createdAt) >= debutMois
  );
  
  const employesUniques = new Set(acomptes.map(a => a.employeId)).size;
  
  const urgents = acomptes.filter(a => {
    if (a.statut !== 'En attente') return false;
    const joursDiff = Math.floor((now - new Date(a.createdAt)) / (1000 * 60 * 60 * 24));
    return joursDiff > 7;
  }).length;
  
  // Évolution mensuelle (12 derniers mois)
  const evolutionMensuelle = [];
  console.log('[ANALYTICS] Calcul évolution mensuelle, maintenant:', now.toISOString());
  
  for (let i = 11; i >= 0; i--) {
    const mois = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const moisStr = `${mois.getFullYear()}-${String(mois.getMonth() + 1).padStart(2, '0')}`;
    
    // Filtrer les acomptes créés ce mois
    const acomptesDuMois = acomptes.filter(a => {
      if (!a.createdAt) {
        console.log('[ANALYTICS] Acompte sans createdAt:', a.id);
        return false;
      }
      try {
        const dateAcompte = new Date(a.createdAt);
        if (isNaN(dateAcompte.getTime())) {
          console.log('[ANALYTICS] Date invalide pour acompte:', a.id, a.createdAt);
          return false;
        }
        const anneeAcompte = dateAcompte.getFullYear();
        const moisAcompte = dateAcompte.getMonth() + 1;
        const moisStrAcompte = `${anneeAcompte}-${String(moisAcompte).padStart(2, '0')}`;
        const match = moisStrAcompte === moisStr;
        if (match) {
          console.log('[ANALYTICS] ✓ Acompte trouvé pour', moisStr, ':', a.id, a.montant, '€');
        }
        return match;
      } catch (e) {
        console.error('[ANALYTICS] Erreur parsing date:', a.createdAt, e);
        return false;
      }
    });
    
    if (moisStr === '2025-12') {
      console.log('[ANALYTICS] Décembre 2025 - Mois calculé:', moisStr, 'Acomptes trouvés:', acomptesDuMois.length);
    }
    
    evolutionMensuelle.push({
      mois: moisStr,
      moisLabel: mois.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      nombreDemandes: acomptesDuMois.length,
      montantTotal: acomptesDuMois.reduce((sum, a) => sum + parseFloat(a.montant || 0), 0),
      valides: acomptesDuMois.filter(a => 
        a.statut === 'Validée par manager' || 
        a.statut === 'En cours de paiement' || 
        a.statut === 'Payée'
      ).length,
      refuses: acomptesDuMois.filter(a => a.statut === 'Refusée').length
    });
  }
  
  // Log pour déboguer
  const moisAvecDonnees = evolutionMensuelle.filter(m => m.nombreDemandes > 0);
  console.log('[ANALYTICS] Total acomptes:', acomptes.length);
  console.log('[ANALYTICS] Mois avec données:', moisAvecDonnees.length);
  if (moisAvecDonnees.length > 0) {
    console.log('[ANALYTICS] Mois avec données:', moisAvecDonnees);
  }
  console.log('[ANALYTICS] Décembre 2025:', evolutionMensuelle.find(m => m.mois === '2025-12'));
  
  // Répartition par statut
  const repartitionStatuts = [
    { 
      statut: 'Validés', 
      count: acomptes.filter(a => a.statut === 'Payée').length,
      color: '#9333ea'
    },
    { 
      statut: 'En paiement', 
      count: enPaiement,
      color: '#3b82f6'
    },
    { 
      statut: 'En attente', 
      count: enAttente,
      color: '#f59e0b'
    },
    { 
      statut: 'Refusés', 
      count: refuses,
      color: '#ef4444'
    }
  ].filter(s => s.count > 0);
  
  // Top 10 demandeurs
  const demandesParEmploye = {};
  acomptes.forEach(a => {
    if (!demandesParEmploye[a.employeId]) {
      demandesParEmploye[a.employeId] = {
        employeId: a.employeId,
        nombreDemandes: 0,
        montantTotal: 0,
        nombreValides: 0,
        nombreRefuses: 0
      };
    }
    demandesParEmploye[a.employeId].nombreDemandes++;
    demandesParEmploye[a.employeId].montantTotal += parseFloat(a.montant || 0);
    if (a.statut !== 'Refusée' && a.statut !== 'En attente') {
      demandesParEmploye[a.employeId].nombreValides++;
    }
    if (a.statut === 'Refusée') {
      demandesParEmploye[a.employeId].nombreRefuses++;
    }
  });
  
  const topDemandeurs = Object.values(demandesParEmploye)
    .sort((a, b) => b.nombreDemandes - a.nombreDemandes)
    .slice(0, 10);
  
  // Délai moyen de traitement
  const acomptesTraites = acomptes.filter(a => 
    a.valideParManagerAt || a.refuseAt
  );
  
  let delaiMoyenJours = 0;
  if (acomptesTraites.length > 0) {
    const totalDelai = acomptesTraites.reduce((sum, a) => {
      const dateTraitement = a.valideParManagerAt || a.refuseAt;
      if (!dateTraitement || !a.createdAt) return sum;
      const delai = (new Date(dateTraitement) - new Date(a.createdAt)) / (1000 * 60 * 60 * 24);
      return sum + delai;
    }, 0);
    delaiMoyenJours = Math.round(totalDelai / acomptesTraites.length * 10) / 10;
  }
  
  // Taux d'approbation
  const totalTraites = valides + refuses;
  const tauxApprobation = totalTraites > 0 
    ? Math.round((valides / totalTraites) * 100) 
    : 0;
  
  // Montant moyen
  const montantMoyen = acomptes.length > 0
    ? Math.round(acomptes.reduce((sum, a) => sum + parseFloat(a.montant || 0), 0) / acomptes.length)
    : 0;
  
  // Alertes
  const alertes = [];
  
  if (urgents > 0) {
    alertes.push({
      niveau: 'CRITIQUE',
      icone: '🔴',
      message: `${urgents} demande${urgents > 1 ? 's' : ''} en attente depuis plus de 7 jours`,
      action: 'Traiter en priorité'
    });
  }
  
  const employesAvec2AcomptesMois = Object.values(demandesParEmploye).filter(e => {
    const acomptesMoisEmploye = acomptes.filter(a => 
      a.employeId === e.employeId &&
      a.createdAt &&
      new Date(a.createdAt) >= debutMois &&
      (a.statut === 'En attente' || a.statut === 'Validée par manager' || a.statut === 'En cours de paiement')
    );
    return acomptesMoisEmploye.length >= 2;
  }).length;
  
  if (employesAvec2AcomptesMois > 0) {
    alertes.push({
      niveau: 'AVERTISSEMENT',
      icone: '🟠',
      message: `${employesAvec2AcomptesMois} employé${employesAvec2AcomptesMois > 1 ? 's ont' : ' a'} atteint la limite de 2 acomptes ce mois`,
      action: 'Surveiller les demandes futures'
    });
  }
  
  if (tauxApprobation >= 80) {
    alertes.push({
      niveau: 'INFO',
      icone: '🟢',
      message: `Taux de validation: ${tauxApprobation}% (objectif: 80%)`,
      action: 'Performance satisfaisante'
    });
  } else {
    alertes.push({
      niveau: 'AVERTISSEMENT',
      icone: '🟠',
      message: `Taux de validation: ${tauxApprobation}% (objectif: 80%)`,
      action: 'Analyser les motifs de refus'
    });
  }
  
  if (delaiMoyenJours > 3) {
    alertes.push({
      niveau: 'AVERTISSEMENT',
      icone: '🟠',
      message: `Délai moyen de traitement: ${delaiMoyenJours}j (objectif: <3j)`,
      action: 'Accélérer les validations'
    });
  }
  
  // Prédictions mois prochain
  const moyenneDemandesMois = evolutionMensuelle.length > 0
    ? Math.round(evolutionMensuelle.reduce((sum, m) => sum + m.nombreDemandes, 0) / evolutionMensuelle.length)
    : 0;
  
  const moyenneMontantMois = evolutionMensuelle.length > 0
    ? Math.round(evolutionMensuelle.reduce((sum, m) => sum + m.montantTotal, 0) / evolutionMensuelle.length)
    : 0;
  
  // Tendance (3 derniers mois vs 3 mois précédents)
  const derniers3Mois = evolutionMensuelle.slice(-3);
  const mois3Precedents = evolutionMensuelle.slice(-6, -3);
  
  const moyenneDerniers3 = derniers3Mois.length > 0 ? derniers3Mois.reduce((sum, m) => sum + m.nombreDemandes, 0) / derniers3Mois.length : 0;
  const moyenne3Precedents = mois3Precedents.length > 0 ? mois3Precedents.reduce((sum, m) => sum + m.nombreDemandes, 0) / mois3Precedents.length : 0;
  
  const tendancePourcentage = moyenne3Precedents > 0
    ? Math.round(((moyenneDerniers3 - moyenne3Precedents) / moyenne3Precedents) * 100)
    : 0;
  
  const predictions = {
    demandesEstimees: moyenneDemandesMois,
    montantEstime: moyenneMontantMois,
    tendance: tendancePourcentage > 0 ? 'HAUSSE' : tendancePourcentage < 0 ? 'BAISSE' : 'STABLE',
    tendancePourcentage: Math.abs(tendancePourcentage),
    confianceNiveau: evolutionMensuelle.length >= 6 ? 'HAUTE' : 'MOYENNE'
  };
  
  return {
    kpis: {
      enAttente,
      valides,
      montantTotalValide,
      montantTotalPaye,
      refuses,
      acomptesMois: acomptesMois.length,
      employesUniques,
      urgents,
      enPaiement
    },
    evolutionMensuelle,
    repartitionStatuts,
    topDemandeurs,
    metriques: {
      delaiMoyenJours,
      tauxApprobation,
      montantMoyen,
      totalDemandes: acomptes.length,
      totalTraites
    },
    alertes,
    predictions
  };
}

async function getDemandesEnAttente() {
  const acomptes = await acompteService.getAcomptes();
  const now = new Date();
  
  return acomptes
    .filter(a => a.statut === 'En attente')
    .map(a => {
      const joursDiff = a.createdAt 
        ? Math.floor((now - new Date(a.createdAt)) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        ...a,
        joursAttente: joursDiff,
        priorite: joursDiff > 7 ? 'URGENT' : joursDiff > 3 ? 'HAUTE' : 'NORMALE'
      };
    })
    .sort((a, b) => b.joursAttente - a.joursAttente);
}

async function getHistoriqueRecent(limit = 10) {
  const acomptes = await acompteService.getAcomptes();
  
  return acomptes
    .filter(a => a.statut !== 'En attente')
    .sort((a, b) => {
      const dateA = new Date(a.valideParManagerAt || a.refuseAt || a.updatedAt || a.createdAt);
      const dateB = new Date(b.valideParManagerAt || b.refuseAt || b.updatedAt || b.createdAt);
      return dateB - dateA;
    })
    .slice(0, limit);
}

module.exports = {
  getAnalyticsDashboard,
  getDemandesEnAttente,
  getHistoriqueRecent
};







