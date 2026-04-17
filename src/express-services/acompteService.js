const { pool } = require('./database');

const STATUTS = {
  EN_ATTENTE: 'En attente',
  VALIDEE_MANAGER: 'Validée par manager',
  EN_PAIEMENT: 'En cours de paiement',
  PAYEE: 'Payée',
  REFUSEE: 'Refusée',
};

const REGLES = {
  MONTANT_MIN: 50,
  MONTANT_MAX: 1000,
  NB_MAX_PAR_MOIS: 2,
  POURCENTAGE_MAX_SALAIRE: 0.5,
  DELAI_TRAITEMENT_JOURS: 3,
};

function requirePool() {
  if (!pool) {
    throw new Error('[acomptes] Pool PostgreSQL indisponible — définir DATABASE_URL');
  }
}

function extractScalars(a) {
  return {
    employe_id: a.employeId != null ? String(a.employeId) : '',
    employe_nom: a.employeNom ?? null,
    statut: a.statut ?? STATUTS.EN_ATTENTE,
  };
}

function rowToAcompte(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  if (!row.data || Object.keys(base).length === 0) {
    base = {
      id: row.id,
      employeId: row.employe_id,
      employeNom: row.employe_nom,
      statut: row.statut,
    };
  }
  base.id = row.id;
  return base;
}

async function fetchAllAcomptes() {
  requirePool();
  const { rows } = await pool.query(
    'SELECT id, employe_id, employe_nom, statut, data, created_at FROM acomptes ORDER BY created_at ASC'
  );
  return rows.map(rowToAcompte);
}

async function persistAcompte(acompte) {
  requirePool();
  const s = extractScalars(acompte);
  await pool.query(
    `UPDATE acomptes SET
      employe_id = $2,
      employe_nom = $3,
      statut = $4,
      updated_at = NOW(),
      data = $5::jsonb
    WHERE id = $1`,
    [acompte.id, s.employe_id, s.employe_nom, s.statut, acompte]
  );
}

async function loadAcompteById(id) {
  requirePool();
  const { rows } = await pool.query('SELECT id, employe_id, employe_nom, statut, data, created_at FROM acomptes WHERE id = $1', [
    id,
  ]);
  return rows[0] ? rowToAcompte(rows[0]) : null;
}

async function getAcomptes() {
  return fetchAllAcomptes();
}

async function getAcomptesByEmploye(employeId) {
  const acomptes = await fetchAllAcomptes();
  return acomptes.filter(a => a.employeId === employeId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getHistoriqueAcomptes(employeId, options = {}) {
  const acomptes = await fetchAllAcomptes();

  let historique = acomptes.filter(a => String(a.employeId) === String(employeId));

  console.log('[ACOMPTES] getHistoriqueAcomptes:', {
    employeId,
    typeEmployeId: typeof employeId,
    nombreAcomptesTotal: acomptes.length,
    nombreAcomptesFiltres: historique.length,
    idsAcomptes: acomptes.map(a => ({ id: a.id, employeId: a.employeId, type: typeof a.employeId })),
  });

  if (options.statut) {
    historique = historique.filter(a => a.statut === options.statut);
  }

  if (options.annee) {
    historique = historique.filter(a => new Date(a.createdAt).getFullYear() === options.annee);
  }

  if (options.mois) {
    historique = historique.filter(a => new Date(a.createdAt).getMonth() + 1 === options.mois);
  }

  historique.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totaux = {
    totalDemandes: historique.length,
    totalValidees: historique.filter(
      a =>
        a.statut === STATUTS.VALIDEE_MANAGER || a.statut === STATUTS.EN_PAIEMENT || a.statut === STATUTS.PAYEE
    ).length,
    totalRefusees: historique.filter(a => a.statut === STATUTS.REFUSEE).length,
    totalEnAttente: historique.filter(a => a.statut === STATUTS.EN_ATTENTE).length,
    montantTotal: historique.filter(a => a.statut === STATUTS.PAYEE).reduce((sum, a) => sum + parseFloat(a.montant || 0), 0),
    montantEnCours: historique
      .filter(a => a.statut === STATUTS.EN_PAIEMENT || a.statut === STATUTS.VALIDEE_MANAGER)
      .reduce((sum, a) => {
        const totalPaye = (a.paiements || []).reduce((s, p) => s + parseFloat(p.montant || 0), 0);
        return sum + (parseFloat(a.montant || 0) - totalPaye);
      }, 0),
  };

  return { historique, totaux };
}

async function ajouterAcompte(acompteData) {
  requirePool();
  const acompte = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    ...acompteData,
    montant: parseFloat(acompteData.montant) || 0,
    statut: STATUTS.EN_ATTENTE,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    luParManager: false,
    luParComptable: false,
    mensualitesTraiteesParRH: [],
    paiements: [],
    modalitePaiement: null,
    mensualites: [],
  };

  const s = extractScalars(acompte);
  await pool.query(
    `INSERT INTO acomptes (id, employe_id, employe_nom, statut, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [acompte.id, s.employe_id, s.employe_nom, s.statut, acompte]
  );

  console.log('[ACOMPTES] Acompte ajouté:', acompte.id);
  return acompte;
}

async function validerAcompteAvecModalites(acompteId, validateurId, validateurNom, modalites) {
  requirePool();
  console.log('[ACOMPTES] validerAcompteAvecModalites appelée avec:', { acompteId, validateurId, validateurNom, modalites });

  const acompte = await loadAcompteById(acompteId);
  if (!acompte) {
    console.error('[ACOMPTES] Acompte non trouvé:', acompteId);
    return null;
  }

  console.log('[ACOMPTES] Acompte trouvé:', acompte.id, 'employeId:', acompte.employeId);

  if (!modalites || !modalites.type) {
    console.error('[ACOMPTES] Modalités invalides:', modalites);
    throw new Error('Modalités de paiement invalides');
  }

  if (!modalites.moisDebut && (!modalites.mensualites || !Array.isArray(modalites.mensualites) || modalites.mensualites.length === 0)) {
    console.error('[ACOMPTES] Modalités invalides: ni moisDebut ni mensualites fournis:', modalites);
    throw new Error('Modalités de paiement invalides: mois de début ou mensualités requis');
  }

  if (modalites.type === 'ECHELONNE' && (!modalites.nbMensualites || modalites.nbMensualites < 2)) {
    console.error('[ACOMPTES] Nombre de mensualités invalide:', modalites.nbMensualites);
    throw new Error('Le nombre de mensualités doit être au moins 2 pour un paiement échelonné');
  }

  if (modalites.mensualites && Array.isArray(modalites.mensualites) && modalites.mensualites.length > 0) {
    if (modalites.type === 'ECHELONNE' && modalites.mensualites.length !== modalites.nbMensualites) {
      console.error('[ACOMPTES] Nombre de mensualités ne correspond pas:', {
        attendu: modalites.nbMensualites,
        fourni: modalites.mensualites.length,
      });
      throw new Error(
        `Le nombre de mensualités fourni (${modalites.mensualites.length}) ne correspond pas au nombre attendu (${modalites.nbMensualites})`
      );
    }
    if (modalites.type === 'UNIQUE' && modalites.mensualites.length !== 1) {
      console.error('[ACOMPTES] Paiement unique mais plusieurs mensualités fournies:', modalites.mensualites.length);
      throw new Error('Paiement unique: une seule mensualité attendue');
    }
  }

  acompte.statut = STATUTS.VALIDEE_MANAGER;
  acompte.valideParManagerId = validateurId;
  acompte.valideParManagerNom = validateurNom;
  acompte.valideParManagerAt = new Date().toISOString();
  acompte.luParManager = true;

  const moisDebut =
    modalites.mensualites && modalites.mensualites.length > 0
      ? modalites.mensualites[0].mois
      : modalites.moisDebut || new Date().toISOString().substring(0, 7);

  acompte.modalitePaiement = {
    type: modalites.type,
    nbMensualites: modalites.nbMensualites || 1,
    montantMensualite:
      modalites.type === 'UNIQUE' ? acompte.montant : Math.round((acompte.montant / modalites.nbMensualites) * 100) / 100,
    moisDebut,
  };

  if (modalites.mensualites && Array.isArray(modalites.mensualites) && modalites.mensualites.length > 0) {
    acompte.mensualites = modalites.mensualites.map((m, index) => ({
      numero: index + 1,
      mois: m.mois,
      montant: parseFloat(m.montant),
      statut: 'EN_ATTENTE',
      payeLe: null,
      referenceVirement: null,
    }));
  } else if (modalites.type === 'ECHELONNE') {
    const mensualites = [];
    const montantParMois = Math.round((acompte.montant / modalites.nbMensualites) * 100) / 100;
    let restant = acompte.montant;

    for (let i = 0; i < modalites.nbMensualites; i++) {
      const [annee, mois] = modalites.moisDebut.split('-');
      const date = new Date(annee, parseInt(mois, 10) - 1 + i, 1);
      const moisPaiement = date.toISOString().substring(0, 7);

      const montant = i === modalites.nbMensualites - 1 ? restant : montantParMois;

      mensualites.push({
        numero: i + 1,
        mois: moisPaiement,
        montant,
        statut: 'EN_ATTENTE',
        payeLe: null,
        referenceVirement: null,
      });

      restant -= montant;
    }

    acompte.mensualites = mensualites;
  } else {
    acompte.mensualites = [
      {
        numero: 1,
        mois: modalites.moisDebut,
        montant: acompte.montant,
        statut: 'EN_ATTENTE',
        payeLe: null,
        referenceVirement: null,
      },
    ];
  }

  acompte.statut = STATUTS.EN_PAIEMENT;
  acompte.updatedAt = new Date().toISOString();

  await persistAcompte(acompte);
  console.log('[ACOMPTES] Acompte validé avec modalités:', acompte.id);
  return acompte;
}

async function refuserAcompte(acompteId, validateurId, validateurNom, motifRefus) {
  const acompte = await loadAcompteById(acompteId);
  if (!acompte) return null;

  acompte.statut = STATUTS.REFUSEE;
  acompte.refuseParId = validateurId;
  acompte.refuseParNom = validateurNom;
  acompte.motifRefus = motifRefus;
  acompte.refuseAt = new Date().toISOString();
  acompte.updatedAt = new Date().toISOString();
  acompte.luParManager = true;

  await persistAcompte(acompte);
  console.log('[ACOMPTES] Acompte refusé:', acompte.id);
  return acompte;
}

async function validerPaiementMensualite(acompteId, numeroMensualite, comptableId, comptableNom, datePaiement, referenceVirement) {
  console.log('[ACOMPTES] validerPaiementMensualite appelé:', {
    acompteId,
    numeroMensualite,
    comptableId,
    datePaiement,
    referenceVirement,
  });

  const acompte = await loadAcompteById(acompteId);
  if (!acompte) {
    console.error('[ACOMPTES] Acompte non trouvé:', acompteId);
    return null;
  }

  console.log('[ACOMPTES] Acompte trouvé:', {
    id: acompte.id,
    statut: acompte.statut,
    nombreMensualites: (acompte.mensualites || []).length,
  });

  const mensualite = acompte.mensualites.find(m => Number(m.numero) === Number(numeroMensualite));
  if (!mensualite) {
    console.error('[ACOMPTES] Mensualité non trouvée:', numeroMensualite, '(type:', typeof numeroMensualite, ')', 'dans acompte:', acompte.id);
    console.log(
      '[ACOMPTES] Mensualités disponibles:',
      (acompte.mensualites || []).map(m => ({
        numero: m.numero,
        numeroType: typeof m.numero,
        statut: m.statut,
      }))
    );
    return null;
  }

  console.log('[ACOMPTES] Mensualité trouvée:', {
    numero: mensualite.numero,
    statut: mensualite.statut,
    montant: mensualite.montant,
  });

  if (mensualite.statut === 'PAYEE') {
    console.warn('[ACOMPTES] Mensualité déjà payée:', numeroMensualite);
  }

  const totalPayeAvant = (acompte.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
  const estPremierPaiement = totalPayeAvant === 0;

  mensualite.statut = 'PAYEE';
  mensualite.payeLe = datePaiement;
  mensualite.referenceVirement = referenceVirement;
  mensualite.payeParId = comptableId;
  mensualite.payeParNom = comptableNom;

  if (!acompte.paiements) {
    acompte.paiements = [];
  }
  acompte.paiements.push({
    date: datePaiement,
    montant: parseFloat(mensualite.montant || 0),
    mensualiteNumero: numeroMensualite,
    reference: referenceVirement,
    comptableId,
    comptableNom,
    createdAt: new Date().toISOString(),
  });

  const totalPaye = acompte.paiements.reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
  const restantDu = parseFloat(acompte.montant || 0) - totalPaye;

  if (restantDu <= 0) {
    acompte.statut = STATUTS.PAYEE;
    acompte.payeAt = new Date().toISOString();
  }

  acompte.updatedAt = new Date().toISOString();
  acompte.luParComptable = true;

  await persistAcompte(acompte);

  console.log('[ACOMPTES] Paiement mensualité validé:', {
    acompteId,
    mensualiteNumero: numeroMensualite,
    totalPaye,
    restantDu,
    estPremierPaiement,
  });

  return { acompte, restantDu, estPremierPaiement };
}

async function marquerLu(acompteId, role) {
  const acompte = await loadAcompteById(acompteId);
  if (!acompte) return null;

  if (role === 'MANAGER') {
    acompte.luParManager = true;
  } else if (role === 'COMPTABLE') {
    acompte.luParComptable = true;
  }

  acompte.updatedAt = new Date().toISOString();
  await persistAcompte(acompte);
  return acompte;
}

async function marquerTraiteParRH(acompteId, numeroMensualite, rhId, rhNom) {
  const acompte = await loadAcompteById(acompteId);
  if (!acompte) return null;

  const mensualite = acompte.mensualites.find(m => m.numero === numeroMensualite);
  if (!mensualite) return null;

  if (mensualite.statut !== 'PAYEE') {
    throw new Error("La mensualité doit être payée par le comptable avant d'être traitée par la RH");
  }

  if (!acompte.mensualitesTraiteesParRH) {
    acompte.mensualitesTraiteesParRH = [];
  }

  if (!acompte.mensualitesTraiteesParRH.includes(numeroMensualite)) {
    acompte.mensualitesTraiteesParRH.push(numeroMensualite);
  }

  acompte.updatedAt = new Date().toISOString();

  const totalMensualites = acompte.mensualites.length;
  const mensualitesTraitees = acompte.mensualitesTraiteesParRH.length;
  const estCompletementTraite = mensualitesTraitees === totalMensualites;

  await persistAcompte(acompte);

  console.log('[ACOMPTES] Mensualité traitée par RH:', {
    acompteId,
    numeroMensualite,
    mensualitesTraitees,
    totalMensualites,
    estCompletementTraite,
  });

  return { acompte, estCompletementTraite, mensualitesTraitees, totalMensualites };
}

async function verifierEligibilite(employeId, montant) {
  const acomptes = await fetchAllAcomptes();
  const moisActuel = new Date().toISOString().substring(0, 7);
  const acomptesDuMois = acomptes.filter(
    a =>
      a.employeId === employeId &&
      a.createdAt.startsWith(moisActuel) &&
      (a.statut === STATUTS.EN_ATTENTE ||
        a.statut === STATUTS.VALIDEE_MANAGER ||
        a.statut === STATUTS.EN_PAIEMENT ||
        a.statut === STATUTS.PAYEE)
  );

  const errors = [];

  if (acomptesDuMois.length >= REGLES.NB_MAX_PAR_MOIS) {
    errors.push(`Maximum ${REGLES.NB_MAX_PAR_MOIS} acomptes par mois`);
  }

  if (montant < REGLES.MONTANT_MIN) {
    errors.push(`Montant minimum: ${REGLES.MONTANT_MIN}€`);
  }
  if (montant > REGLES.MONTANT_MAX) {
    errors.push(`Montant maximum: ${REGLES.MONTANT_MAX}€`);
  }

  return {
    eligible: errors.length === 0,
    errors,
    acomptesDuMois: acomptesDuMois.length,
    limiteAtteinte: acomptesDuMois.length >= REGLES.NB_MAX_PAR_MOIS,
  };
}

async function getStatistiquesAcomptes(employeId, annee) {
  const acomptes = await fetchAllAcomptes();
  const acomptesAnnee = acomptes.filter(a => a.employeId === employeId && new Date(a.createdAt).getFullYear() === annee);

  return {
    annee,
    totalDemandes: acomptesAnnee.length,
    totalValidees: acomptesAnnee.filter(a => a.statut === STATUTS.PAYEE).length,
    totalRefusees: acomptesAnnee.filter(a => a.statut === STATUTS.REFUSEE).length,
    montantTotal: acomptesAnnee.filter(a => a.statut === STATUTS.PAYEE).reduce((sum, a) => sum + a.montant, 0),
    montantMoyen:
      acomptesAnnee.filter(a => a.statut === STATUTS.PAYEE).length > 0
        ? Math.round(
            acomptesAnnee.filter(a => a.statut === STATUTS.PAYEE).reduce((sum, a) => sum + a.montant, 0) /
              acomptesAnnee.filter(a => a.statut === STATUTS.PAYEE).length
          )
        : 0,
  };
}

async function getAcomptesEnAttenteValidation() {
  const acomptes = await fetchAllAcomptes();
  return acomptes.filter(a => a.statut === STATUTS.EN_ATTENTE);
}

async function getAcomptesValidesManager() {
  const acomptes = await fetchAllAcomptes();
  return acomptes.filter(a => a.statut === STATUTS.VALIDEE_MANAGER || a.statut === STATUTS.EN_PAIEMENT || a.statut === STATUTS.PAYEE);
}

async function getAcomptesEnAttentePaiement() {
  const acomptes = await fetchAllAcomptes();
  return acomptes
    .filter(a => a.statut === STATUTS.EN_PAIEMENT)
    .map(a => {
      const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
      const restantDu = parseFloat(a.montant || 0) - totalPaye;
      const mensualitesEnAttente = (a.mensualites || []).filter(m => m.statut === 'EN_ATTENTE');

      return {
        ...a,
        totalPaye,
        restantDu,
        prochaineMensualite: mensualitesEnAttente[0] || null,
      };
    })
    .sort((a, b) => {
      const dateA = a.prochaineMensualite ? new Date(a.prochaineMensualite.mois) : new Date(9999, 0);
      const dateB = b.prochaineMensualite ? new Date(b.prochaineMensualite.mois) : new Date(9999, 0);
      return dateA - dateB;
    });
}

async function getAcomptesNouveaux() {
  const acomptes = await fetchAllAcomptes();
  return acomptes
    .filter(a => a.statut === STATUTS.EN_PAIEMENT)
    .filter(a => {
      const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
      return totalPaye === 0;
    });
}

async function getAcomptesEnCours() {
  const acomptes = await fetchAllAcomptes();
  return acomptes
    .filter(a => a.statut === STATUTS.EN_PAIEMENT)
    .filter(a => {
      const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
      const montantTotal = parseFloat(a.montant || 0);
      return totalPaye > 0 && totalPaye < montantTotal;
    });
}

async function getAcomptesTraites() {
  const acomptes = await fetchAllAcomptes();
  return acomptes.filter(a => a.statut === STATUTS.PAYEE);
}

async function getAcomptesRHATraiter() {
  const acomptes = await fetchAllAcomptes();
  return acomptes
    .filter(a => a.statut === STATUTS.EN_PAIEMENT || a.statut === STATUTS.PAYEE)
    .filter(a => {
      const mensualitesPayees = (a.mensualites || []).filter(m => m.statut === 'PAYEE');
      if (mensualitesPayees.length === 0) return false;

      const mensualitesTraiteesParRH = a.mensualitesTraiteesParRH || [];
      const mensualitesPayeesNonTraitees = mensualitesPayees.filter(m => !mensualitesTraiteesParRH.includes(m.numero));

      return mensualitesPayeesNonTraitees.length > 0;
    });
}

async function getAcomptesRHEnCours() {
  const acomptes = await fetchAllAcomptes();
  return acomptes
    .filter(a => a.statut === STATUTS.EN_PAIEMENT || a.statut === STATUTS.PAYEE)
    .filter(a => {
      const mensualitesTraiteesParRH = a.mensualitesTraiteesParRH || [];
      const totalMensualites = (a.mensualites || []).length;

      return mensualitesTraiteesParRH.length > 0 && mensualitesTraiteesParRH.length < totalMensualites;
    });
}

async function getAcomptesRHTraites() {
  const acomptes = await fetchAllAcomptes();
  return acomptes
    .filter(a => a.statut === STATUTS.EN_PAIEMENT || a.statut === STATUTS.PAYEE)
    .filter(a => {
      const mensualitesTraiteesParRH = a.mensualitesTraiteesParRH || [];
      const totalMensualites = (a.mensualites || []).length;

      return mensualitesTraiteesParRH.length === totalMensualites && totalMensualites > 0;
    });
}

module.exports = {
  getAcomptes,
  getAcomptesByEmploye,
  getHistoriqueAcomptes,
  ajouterAcompte,
  validerAcompteAvecModalites,
  refuserAcompte,
  validerPaiementMensualite,
  marquerLu,
  verifierEligibilite,
  getStatistiquesAcomptes,
  getAcomptesEnAttenteValidation,
  getAcomptesValidesManager,
  getAcomptesEnAttentePaiement,
  getAcomptesNouveaux,
  getAcomptesEnCours,
  getAcomptesTraites,
  getAcomptesRHATraiter,
  getAcomptesRHEnCours,
  getAcomptesRHTraites,
  marquerTraiteParRH,
  STATUTS,
  REGLES,
};
