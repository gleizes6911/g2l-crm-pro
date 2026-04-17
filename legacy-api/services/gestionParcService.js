// ==========================================
// DONNÉES INITIALES
// ==========================================

let ordresReparation = [
  {
    id: 'OR-2024-001',
    vehiculeId: 'VEH-001',
    vehiculeImmat: 'AB-123-CD',
    vehiculeModele: 'Renault Master',
    type: 'INTERNE', // INTERNE ou EXTERNE
    statut: 'EN_COURS', // PLANIFIE, EN_COURS, EN_ATTENTE_PIECE, TERMINE, ANNULE
    priorite: 'HAUTE', // BASSE, NORMALE, HAUTE, URGENTE
    dateCreation: '2024-12-20T10:00:00Z',
    dateDebut: '2024-12-21T08:00:00Z',
    dateFin: null,
    dateEstimee: '2024-12-23T17:00:00Z',
    
    // Détails réparation
    natureIntervention: 'REPARATION', // ENTRETIEN, REPARATION, SINISTRE, CONTROLE_TECHNIQUE
    description: 'Problème de freinage - Disques et plaquettes à remplacer',
    symptomes: 'Bruit métallique au freinage, vibrations',
    diagnostic: 'Disques avant usés (2mm), plaquettes avant à 10%',
    kilometrage: 125000,
    
    // Garage
    garageType: 'INTERNE', // INTERNE ou nom du garage externe
    garageName: 'Garage G2L',
    garageAdresse: 'ZI Les Pins - 83000 Toulon',
    mecanicienId: 'MECA_001',
    mecanicienNom: 'Pierre MARTIN',
    
    // Pièces et fournitures
    pieces: [
      {
        id: 'PIECE_001',
        reference: 'DISC-REN-MASTER-AV',
        designation: 'Disques de frein avant (x2)',
        quantite: 1,
        prixUnitaire: 85.50,
        fournisseur: 'AUTO PARTS PRO',
        statut: 'EN_STOCK', // EN_STOCK, COMMANDE, RECU, INSTALLE
        dateCommande: null,
        dateReception: null
      },
      {
        id: 'PIECE_002',
        reference: 'PAD-REN-MASTER-AV',
        designation: 'Plaquettes de frein avant',
        quantite: 1,
        prixUnitaire: 42.00,
        fournisseur: 'AUTO PARTS PRO',
        statut: 'EN_STOCK',
        dateCommande: null,
        dateReception: null
      },
      {
        id: 'PIECE_003',
        reference: 'FLUID-DOT4-1L',
        designation: 'Liquide de frein DOT4 (1L)',
        quantite: 1,
        prixUnitaire: 12.50,
        fournisseur: 'AUTO PARTS PRO',
        statut: 'EN_STOCK',
        dateCommande: null,
        dateReception: null
      }
    ],
    
    // Main d'oeuvre
    mainOeuvre: [
      {
        id: 'MO_001',
        mecanicienId: 'MECA_001',
        mecanicienNom: 'Pierre MARTIN',
        description: 'Remplacement disques et plaquettes avant',
        dateDebut: '2024-12-21T08:00:00Z',
        dateFin: null,
        tempsEstime: 3.5, // heures
        tempsReel: null,
        tauxHoraire: 45.00
      }
    ],
    
    // Coûts
    couts: {
      pieces: 140.00,
      mainOeuvre: 157.50,
      autresFrais: 0,
      total: 297.50,
      tva: 59.50,
      totalTTC: 357.00
    },
    
    // Documents
    photos: [],
    factures: [],
    bonCommande: null,
    
    // Validation et clôture
    valideParId: null,
    valideParNom: null,
    valideLe: null,
    notesFinales: null,
    satisfactionClient: null,
    
    createdAt: '2024-12-20T10:00:00Z',
    updatedAt: '2024-12-21T08:30:00Z'
  }
];

let stock = [
  {
    id: 'STOCK-001',
    reference: 'DISC-REN-MASTER-AV',
    designation: 'Disques de frein avant Renault Master',
    categorie: 'FREINAGE',
    marque: 'BOSCH',
    quantiteStock: 4,
    quantiteMin: 2,
    quantiteMax: 10,
    prixAchatHT: 85.50,
    prixVenteHT: 120.00,
    emplacement: 'Rayon A - Etagère 3',
    fournisseurPrincipal: 'AUTO PARTS PRO',
    delaiLivraison: 24, // heures
    numeroSerie: null,
    datePeremption: null,
    mouvements: [
      {
        id: 'MVT-001',
        type: 'ENTREE', // ENTREE, SORTIE, AJUSTEMENT
        quantite: 10,
        motif: 'Réception commande',
        reference: 'BC-2024-089',
        date: '2024-12-01T10:00:00Z',
        utilisateurId: 'USER_PARC_001'
      },
      {
        id: 'MVT-002',
        type: 'SORTIE',
        quantite: 2,
        motif: 'OR-2024-001 - Renault Master AB-123-CD',
        reference: 'OR-2024-001',
        date: '2024-12-21T08:15:00Z',
        utilisateurId: 'MECA_001'
      }
    ],
    createdAt: '2024-11-15T00:00:00Z',
    updatedAt: '2024-12-21T08:15:00Z'
  },
  {
    id: 'STOCK-002',
    reference: 'OIL-5W30-5L',
    designation: 'Huile moteur 5W30 (5L)',
    categorie: 'LUBRIFIANTS',
    marque: 'TOTAL',
    quantiteStock: 45,
    quantiteMin: 20,
    quantiteMax: 100,
    prixAchatHT: 28.50,
    prixVenteHT: 42.00,
    emplacement: 'Zone Stockage - Bidons',
    fournisseurPrincipal: 'LUBRI TECH',
    delaiLivraison: 48,
    numeroSerie: null,
    datePeremption: null,
    mouvements: [],
    createdAt: '2024-11-01T00:00:00Z',
    updatedAt: '2024-12-15T00:00:00Z'
  }
];

let fournisseurs = [
  {
    id: 'FOURN-001',
    nom: 'AUTO PARTS PRO',
    type: 'PIECES', // PIECES, GARAGE, CARROSSERIE, PNEUS, LUBRIFIANT
    contact: {
      responsable: 'Marc DUBOIS',
      telephone: '04 94 12 34 56',
      email: 'commandes@autopartspro.fr',
      adresse: '15 Avenue de la République, 83000 Toulon'
    },
    catalogue: ['Freinage', 'Suspension', 'Eclairage', 'Filtration'],
    conditions: {
      delaiPaiement: 30, // jours
      delaiLivraison: 24, // heures
      montantMinCommande: 50,
      fraisPort: 15,
      remise: 12 // %
    },
    actif: true,
    notation: 4.5,
    commentaires: 'Fournisseur fiable, bons délais',
    statistiques: {
      nombreCommandes: 45,
      montantTotal: 15230.50,
      dernierAchat: '2024-12-20T00:00:00Z'
    },
    createdAt: '2023-06-01T00:00:00Z',
    updatedAt: '2024-12-20T00:00:00Z'
  },
  {
    id: 'FOURN-002',
    nom: 'GARAGE EXPERT RENAULT',
    type: 'GARAGE',
    contact: {
      responsable: 'Sophie BERNARD',
      telephone: '04 94 98 76 54',
      email: 'atelier@expertrenault.fr',
      adresse: 'ZI La Seyne, 83500 La Seyne-sur-Mer'
    },
    catalogue: ['Entretien Renault', 'Réparation Renault', 'Diagnostics'],
    conditions: {
      delaiPaiement: 45,
      tauxHoraire: 65.00,
      montantMinFacture: 80
    },
    actif: true,
    notation: 4.8,
    commentaires: 'Spécialiste Renault, très compétent',
    statistiques: {
      nombreInterventions: 23,
      montantTotal: 8950.00,
      dernierIntervention: '2024-12-15T00:00:00Z'
    },
    createdAt: '2023-08-15T00:00:00Z',
    updatedAt: '2024-12-15T00:00:00Z'
  }
];

let mecaniciens = [
  {
    id: 'MECA_001',
    nom: 'MARTIN',
    prenom: 'Pierre',
    type: 'MECANICIEN', // MECANICIEN, CARROSSIER
    specialites: ['Moteur', 'Freinage', 'Suspension', 'Climatisation'],
    certifications: ['Renault Master', 'Iveco Daily', 'Diagnostic électronique'],
    tauxHoraire: 45.00,
    planning: [],
    actif: true,
    statistiques: {
      nombreInterventions: 156,
      tempsTotal: 523.5, // heures
      noteMoyenne: 4.7,
      vehiculesTraites: 89
    },
    createdAt: '2023-01-15T00:00:00Z',
    updatedAt: '2024-12-21T00:00:00Z'
  },
  {
    id: 'MECA_002',
    nom: 'DURAND',
    prenom: 'Thomas',
    type: 'CARROSSIER',
    specialites: ['Carrosserie', 'Peinture', 'Débosselage'],
    certifications: ['Peinture au pistolet', 'Soudure aluminium'],
    tauxHoraire: 50.00,
    planning: [],
    actif: true,
    statistiques: {
      nombreInterventions: 78,
      tempsTotal: 312.0,
      noteMoyenne: 4.9,
      vehiculesTraites: 62
    },
    createdAt: '2023-03-01T00:00:00Z',
    updatedAt: '2024-12-20T00:00:00Z'
  }
];

let planningGarage = [
  {
    id: 'PLAN-001',
    ordreReparationId: 'OR-2024-001',
    vehiculeImmat: 'AB-123-CD',
    mecanicienId: 'MECA_001',
    mecanicienNom: 'Pierre MARTIN',
    dateDebut: '2024-12-21T08:00:00Z',
    dateFin: '2024-12-23T17:00:00Z',
    dureeEstimee: 3.5,
    statut: 'EN_COURS',
    type: 'REPARATION',
    priorite: 'HAUTE',
    pontId: 'PONT-1',
    pontNom: 'Pont élévateur 1'
  }
];

let historiqueMaintenance = [];

const CATEGORIES_STOCK = {
  FREINAGE: 'Freinage',
  MOTEUR: 'Moteur',
  TRANSMISSION: 'Transmission',
  SUSPENSION: 'Suspension',
  ECLAIRAGE: 'Éclairage',
  ELECTRICITE: 'Électricité',
  CARROSSERIE: 'Carrosserie',
  LUBRIFIANTS: 'Lubrifiants',
  FILTRATION: 'Filtration',
  PNEUMATIQUES: 'Pneumatiques',
  CLIMATISATION: 'Climatisation',
  AUTRE: 'Autre'
};

const STATUTS_OR = {
  PLANIFIE: 'Planifié',
  EN_COURS: 'En cours',
  EN_ATTENTE_PIECE: 'En attente pièce',
  EN_ATTENTE_VALIDATION: 'En attente validation',
  TERMINE: 'Terminé',
  ANNULE: 'Annulé'
};

const PRIORITES = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENTE: 'Urgente'
};

const NATURES_INTERVENTION = {
  ENTRETIEN: 'Entretien',
  REPARATION: 'Réparation',
  SINISTRE: 'Sinistre',
  CONTROLE_TECHNIQUE: 'Contrôle technique',
  DIAGNOSTIC: 'Diagnostic',
  REVISION: 'Révision'
};

// ==========================================
// FONCTIONS ORDRES DE RÉPARATION
// ==========================================

function getOrdresReparation(filters = {}) {
  let results = [...ordresReparation];
  
  if (filters.statut) {
    results = results.filter(or => or.statut === filters.statut);
  }
  
  if (filters.type) {
    results = results.filter(or => or.type === filters.type);
  }
  
  if (filters.priorite) {
    results = results.filter(or => or.priorite === filters.priorite);
  }
  
  if (filters.vehiculeId) {
    results = results.filter(or => or.vehiculeId === filters.vehiculeId);
  }
  
  if (filters.mecanicienId) {
    results = results.filter(or => or.mecanicienId === filters.mecanicienId);
  }
  
  if (filters.dateDebut) {
    results = results.filter(or => new Date(or.dateCreation) >= new Date(filters.dateDebut));
  }
  
  if (filters.dateFin) {
    results = results.filter(or => new Date(or.dateCreation) <= new Date(filters.dateFin));
  }
  
  results.sort((a, b) => {
    // Tri par priorité puis par date
    const priorityOrder = { URGENTE: 0, HAUTE: 1, NORMALE: 2, BASSE: 3 };
    if (priorityOrder[a.priorite] !== priorityOrder[b.priorite]) {
      return priorityOrder[a.priorite] - priorityOrder[b.priorite];
    }
    return new Date(b.dateCreation) - new Date(a.dateCreation);
  });
  
  return results;
}

function getOrdreReparationById(id) {
  return ordresReparation.find(or => or.id === id);
}

function createOrdreReparation(data) {
  const newOR = {
    id: 'OR-' + new Date().getFullYear() + '-' + String(ordresReparation.length + 1).padStart(3, '0'),
    ...data,
    statut: 'PLANIFIE',
    dateCreation: new Date().toISOString(),
    dateDepot: data.dateDepot ? new Date(data.dateDepot).toISOString() : null,
    dateDebut: data.dateDebut ? new Date(data.dateDebut + (data.heureDebut ? 'T' + data.heureDebut : 'T08:00')).toISOString() : null,
    heureDebut: data.heureDebut || null,
    dateFin: null,
    dateEstimee: data.dateEstimee ? new Date(data.dateEstimee).toISOString() : null,
    pieces: data.pieces || [],
    mainOeuvre: data.mainOeuvre || [],
    piecesEffectif: data.piecesEffectif || [],
    mainOeuvreEffectif: data.mainOeuvreEffectif || [],
    couts: calculerCouts(data.pieces || [], data.mainOeuvre || []),
    photos: [],
    factures: [],
    valideParId: null,
    valideParNom: null,
    valideLe: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  ordresReparation.push(newOR);
  
  // Créer une entrée planning si mécanicien et date de début sont fournis
  if (data.mecanicienId && data.dateDebut) {
    const planningEntry = {
      id: 'PLAN-' + Date.now(),
      ordreReparationId: newOR.id,
      vehiculeImmat: data.vehiculeImmat,
      mecanicienId: data.mecanicienId,
      mecanicienNom: data.mecanicienNom,
      dateDebut: newOR.dateDebut,
      dateFin: newOR.dateEstimee,
      dureeEstimee: data.mainOeuvre?.reduce((sum, mo) => sum + (mo.tempsEstime || 0), 0) || 0,
      statut: 'PLANIFIE',
      type: data.natureIntervention || 'REPARATION',
      priorite: data.priorite || 'NORMALE',
      pontId: null,
      pontNom: null
    };
    planningGarage.push(planningEntry);
    console.log('[PARC] Entrée planning créée:', planningEntry.id);
  }
  
  console.log('[PARC] Ordre de réparation créé:', newOR.id);
  return newOR;
}

function updateOrdreReparation(id, data) {
  const index = ordresReparation.findIndex(or => or.id === id);
  if (index === -1) return null;
  
  // Gérer les dates
  const dateDebut = data.dateDebut 
    ? new Date(data.dateDebut + (data.heureDebut ? 'T' + data.heureDebut : 'T08:00')).toISOString() 
    : ordresReparation[index].dateDebut;
  
  ordresReparation[index] = {
    ...ordresReparation[index],
    ...data,
    dateDepot: data.dateDepot ? new Date(data.dateDepot).toISOString() : ordresReparation[index].dateDepot,
    dateDebut: dateDebut,
    heureDebut: data.heureDebut !== undefined ? data.heureDebut : ordresReparation[index].heureDebut,
    dateEstimee: data.dateEstimee ? new Date(data.dateEstimee).toISOString() : ordresReparation[index].dateEstimee,
    piecesEffectif: data.piecesEffectif || ordresReparation[index].piecesEffectif || [],
    mainOeuvreEffectif: data.mainOeuvreEffectif || ordresReparation[index].mainOeuvreEffectif || [],
    updatedAt: new Date().toISOString()
  };
  
  // Recalculer les coûts (utiliser effectif si disponible)
  const piecesToUse = ordresReparation[index].piecesEffectif?.length > 0 
    ? ordresReparation[index].piecesEffectif 
    : ordresReparation[index].pieces;
  const moToUse = ordresReparation[index].mainOeuvreEffectif?.length > 0 
    ? ordresReparation[index].mainOeuvreEffectif 
    : ordresReparation[index].mainOeuvre;
  
  ordresReparation[index].couts = calculerCouts(piecesToUse, moToUse);
  
  // Mettre à jour ou créer l'entrée planning
  if (data.mecanicienId && dateDebut) {
    const planningIndex = planningGarage.findIndex(p => p.ordreReparationId === id);
    if (planningIndex !== -1) {
      // Mettre à jour
      planningGarage[planningIndex] = {
        ...planningGarage[planningIndex],
        mecanicienId: data.mecanicienId,
        mecanicienNom: data.mecanicienNom,
        dateDebut: dateDebut,
        dateFin: ordresReparation[index].dateEstimee,
        dureeEstimee: moToUse?.reduce((sum, mo) => sum + ((mo.tempsEffectif || mo.tempsEstime) || 0), 0) || 0,
        statut: ordresReparation[index].statut,
        priorite: ordresReparation[index].priorite
      };
    } else {
      // Créer
      const planningEntry = {
        id: 'PLAN-' + Date.now(),
        ordreReparationId: id,
        vehiculeImmat: ordresReparation[index].vehiculeImmat,
        mecanicienId: data.mecanicienId,
        mecanicienNom: data.mecanicienNom,
        dateDebut: dateDebut,
        dateFin: ordresReparation[index].dateEstimee,
        dureeEstimee: moToUse?.reduce((sum, mo) => sum + ((mo.tempsEffectif || mo.tempsEstime) || 0), 0) || 0,
        statut: ordresReparation[index].statut,
        type: ordresReparation[index].natureIntervention || 'REPARATION',
        priorite: ordresReparation[index].priorite || 'NORMALE',
        pontId: null,
        pontNom: null
      };
      planningGarage.push(planningEntry);
    }
  }
  
  console.log('[PARC] Ordre de réparation mis à jour:', id);
  return ordresReparation[index];
}

function changerStatutOR(id, nouveauStatut, notes = null) {
  const or = getOrdreReparationById(id);
  if (!or) return null;
  
  or.statut = nouveauStatut;
  or.updatedAt = new Date().toISOString();
  
  if (nouveauStatut === 'EN_COURS' && !or.dateDebut) {
    or.dateDebut = new Date().toISOString();
  }
  
  if (nouveauStatut === 'TERMINE') {
    or.dateFin = new Date().toISOString();
    if (notes) or.notesFinales = notes;
    
    // Archiver dans l'historique
    historiqueMaintenance.push({
      ...or,
      archiveLe: new Date().toISOString()
    });
  }
  
  console.log('[PARC] Statut OR changé:', id, '→', nouveauStatut);
  return or;
}

function ajouterPieceOR(orId, piece) {
  const or = getOrdreReparationById(orId);
  if (!or) return null;
  
  const newPiece = {
    id: 'PIECE_' + Date.now(),
    ...piece,
    statut: piece.statut || 'COMMANDE',
    dateCommande: new Date().toISOString()
  };
  
  or.pieces.push(newPiece);
  or.couts = calculerCouts(or.pieces, or.mainOeuvre);
  or.updatedAt = new Date().toISOString();
  
  console.log('[PARC] Pièce ajoutée à OR:', orId);
  return or;
}

function ajouterMainOeuvreOR(orId, mo) {
  const or = getOrdreReparationById(orId);
  if (!or) return null;
  
  const newMO = {
    id: 'MO_' + Date.now(),
    ...mo,
    dateDebut: new Date().toISOString(),
    dateFin: null,
    tempsReel: null
  };
  
  or.mainOeuvre.push(newMO);
  or.couts = calculerCouts(or.pieces, or.mainOeuvre);
  or.updatedAt = new Date().toISOString();
  
  console.log('[PARC] Main d\'oeuvre ajoutée à OR:', orId);
  return or;
}

function calculerCouts(pieces, mainOeuvre) {
  const coutPieces = (pieces || []).reduce((sum, p) => sum + ((p.prixUnitaire || 0) * (p.quantite || 0)), 0);
  const coutMO = (mainOeuvre || []).reduce((sum, m) => {
    const temps = m.tempsEffectif || m.tempsReel || m.tempsEstime || 0;
    return sum + (temps * (m.tauxHoraire || 0));
  }, 0);
  
  const total = coutPieces + coutMO;
  const tva = total * 0.20;
  
  return {
    pieces: Math.round(coutPieces * 100) / 100,
    mainOeuvre: Math.round(coutMO * 100) / 100,
    autresFrais: 0,
    total: Math.round(total * 100) / 100,
    tva: Math.round(tva * 100) / 100,
    totalTTC: Math.round((total + tva) * 100) / 100
  };
}

// ==========================================
// FONCTIONS STOCK
// ==========================================

function getStock(filters = {}) {
  let results = [...stock];
  
  if (filters.categorie) {
    results = results.filter(s => s.categorie === filters.categorie);
  }
  
  if (filters.alerteStock) {
    results = results.filter(s => s.quantiteStock <= s.quantiteMin);
  }
  
  if (filters.recherche) {
    const term = filters.recherche.toLowerCase();
    results = results.filter(s => 
      s.reference.toLowerCase().includes(term) ||
      s.designation.toLowerCase().includes(term)
    );
  }
  
  return results.sort((a, b) => a.designation.localeCompare(b.designation));
}

function getArticleStock(id) {
  return stock.find(s => s.id === id);
}

function ajouterArticleStock(data) {
  const newArticle = {
    id: 'STOCK-' + String(stock.length + 1).padStart(3, '0'),
    ...data,
    quantiteStock: data.quantiteStock || 0,
    mouvements: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  stock.push(newArticle);
  console.log('[PARC] Article stock ajouté:', newArticle.reference);
  return newArticle;
}

function mouvementStock(articleId, type, quantite, motif, reference, utilisateurId) {
  const article = stock.find(s => s.id === articleId);
  if (!article) return null;
  
  const mouvement = {
    id: 'MVT-' + Date.now(),
    type,
    quantite,
    motif,
    reference,
    date: new Date().toISOString(),
    utilisateurId
  };
  
  if (type === 'ENTREE') {
    article.quantiteStock += quantite;
  } else if (type === 'SORTIE') {
    if (article.quantiteStock < quantite) {
      return { error: 'Stock insuffisant' };
    }
    article.quantiteStock -= quantite;
  } else if (type === 'AJUSTEMENT') {
    article.quantiteStock = quantite;
  }
  
  article.mouvements.push(mouvement);
  article.updatedAt = new Date().toISOString();
  
  console.log('[PARC] Mouvement stock:', type, quantite, article.reference);
  return article;
}

function getAlertesStock() {
  return stock.filter(s => s.quantiteStock <= s.quantiteMin).map(s => ({
    ...s,
    manquant: s.quantiteMin - s.quantiteStock,
    niveau: s.quantiteStock === 0 ? 'CRITIQUE' : 
            s.quantiteStock < s.quantiteMin / 2 ? 'URGENT' : 'ATTENTION'
  }));
}

// ==========================================
// FONCTIONS FOURNISSEURS
// ==========================================

function getFournisseurs(type = null) {
  if (type) {
    return fournisseurs.filter(f => f.type === type && f.actif);
  }
  return fournisseurs.filter(f => f.actif);
}

function ajouterFournisseur(data) {
  const newFournisseur = {
    id: 'FOURN-' + String(fournisseurs.length + 1).padStart(3, '0'),
    ...data,
    actif: true,
    notation: 0,
    statistiques: {
      nombreCommandes: 0,
      montantTotal: 0,
      dernierAchat: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  fournisseurs.push(newFournisseur);
  console.log('[PARC] Fournisseur ajouté:', newFournisseur.nom);
  return newFournisseur;
}

// ==========================================
// FONCTIONS MÉCANICIENS
// ==========================================

function getMecaniciens(type = null) {
  if (type) {
    return mecaniciens.filter(m => m.type === type && m.actif);
  }
  return mecaniciens.filter(m => m.actif);
}

function getPlanningGarage(dateDebut, dateFin) {
  return planningGarage.filter(p => {
    const pDate = new Date(p.dateDebut);
    return pDate >= new Date(dateDebut) && pDate <= new Date(dateFin);
  });
}

// ==========================================
// STATISTIQUES
// ==========================================

function getStatistiquesParc() {
  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  const debutAnnee = new Date(now.getFullYear(), 0, 1);
  
  const orMois = ordresReparation.filter(or => new Date(or.dateCreation) >= debutMois);
  const orAnnee = ordresReparation.filter(or => new Date(or.dateCreation) >= debutAnnee);
  
  return {
    ordresReparation: {
      total: ordresReparation.length,
      enCours: ordresReparation.filter(or => or.statut === 'EN_COURS').length,
      enAttente: ordresReparation.filter(or => or.statut === 'PLANIFIE').length,
      termines: ordresReparation.filter(or => or.statut === 'TERMINE').length,
      urgents: ordresReparation.filter(or => or.priorite === 'URGENTE' && or.statut !== 'TERMINE').length
    },
    stock: {
      totalArticles: stock.length,
      valeurTotale: stock.reduce((sum, s) => sum + (s.quantiteStock * s.prixAchatHT), 0),
      alertes: getAlertesStock().length,
      ruptures: stock.filter(s => s.quantiteStock === 0).length
    },
    coutsMois: {
      pieces: orMois.reduce((sum, or) => sum + or.couts.pieces, 0),
      mainOeuvre: orMois.reduce((sum, or) => sum + or.couts.mainOeuvre, 0),
      total: orMois.reduce((sum, or) => sum + or.couts.total, 0)
    },
    coutsAnnee: {
      pieces: orAnnee.reduce((sum, or) => sum + or.couts.pieces, 0),
      mainOeuvre: orAnnee.reduce((sum, or) => sum + or.couts.mainOeuvre, 0),
      total: orAnnee.reduce((sum, or) => sum + or.couts.total, 0)
    },
    repartitionType: {
      interne: ordresReparation.filter(or => or.type === 'INTERNE').length,
      externe: ordresReparation.filter(or => or.type === 'EXTERNE').length
    }
  };
}

module.exports = {
  // Ordres de réparation
  getOrdresReparation,
  getOrdreReparationById,
  createOrdreReparation,
  updateOrdreReparation,
  changerStatutOR,
  ajouterPieceOR,
  ajouterMainOeuvreOR,
  
  // Stock
  getStock,
  getArticleStock,
  ajouterArticleStock,
  mouvementStock,
  getAlertesStock,
  
  // Fournisseurs
  getFournisseurs,
  ajouterFournisseur,
  
  // Mécaniciens et planning
  getMecaniciens,
  getPlanningGarage,
  
  // Statistiques
  getStatistiquesParc,
  
  // Constantes
  CATEGORIES_STOCK,
  STATUTS_OR,
  PRIORITES,
  NATURES_INTERVENTION
};







