const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const exploitationService = require('../services/exploitationService');

function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().slice(0, maxLength).replace(/[<>"'`;]/g, '');
}

// ═══════════════════════════════════════════════════════
// ROUTES DIRECTION
// ═══════════════════════════════════════════════════════

const financeParamsFilePath = path.join(__dirname, '..', '..', 'data/direction/finance_params.json');
const directionDataDir = path.dirname(financeParamsFilePath);

function ensureDirectionFinanceStore() {
  if (!fs.existsSync(directionDataDir)) {
    fs.mkdirSync(directionDataDir, { recursive: true });
  }
  if (!fs.existsSync(financeParamsFilePath)) {
    fs.writeFileSync(financeParamsFilePath, JSON.stringify([], null, 2), 'utf8');
  }
}

function readDirectionFinanceParams() {
  ensureDirectionFinanceStore();
  try {
    const raw = fs.readFileSync(financeParamsFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[Direction Finance] Erreur lecture finance_params.json:', e.message);
    return [];
  }
}

function writeDirectionFinanceParams(rows) {
  ensureDirectionFinanceStore();
  fs.writeFileSync(financeParamsFilePath, JSON.stringify(rows, null, 2), 'utf8');
}

function parseMonthToRange(month) {
  const value = String(month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }
  const [y, m] = value.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const toYmd = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { start: toYmd(start), end: toYmd(end), month: value };
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeFinanceMetrics(volumes, params) {
  const p = {
    coutParTournee: numberOrZero(params?.coutParTournee),
    prixParColisLivre: numberOrZero(params?.prixParColisLivre),
    prixParPointLivre: numberOrZero(params?.prixParPointLivre),
    montantBranding: numberOrZero(params?.montantBranding),
    prixParPointCollecte: numberOrZero(params?.prixParPointCollecte),
    prixParColisCollecte: numberOrZero(params?.prixParColisCollecte),
    caVouluParTournee: numberOrZero(params?.caVouluParTournee)
  };
  const v = {
    nbTournees: numberOrZero(volumes?.nbTournees),
    colisLivres: numberOrZero(volumes?.colisLivres),
    pdlLivres: numberOrZero(volumes?.pdlLivres),
    pointsCollecte: numberOrZero(volumes?.pointsCollecte),
    colisCollectes: numberOrZero(volumes?.colisCollectes)
  };
  const coutTotal = v.nbTournees * p.coutParTournee;
  const caUnitaire =
    p.prixParColisLivre * v.colisLivres +
    p.prixParPointLivre * v.pdlLivres +
    p.montantBranding +
    p.prixParPointCollecte * v.pointsCollecte +
    p.prixParColisCollecte * v.colisCollectes;
  const caCibleTournee = v.nbTournees * p.caVouluParTournee;
  const margeUnitaire = caUnitaire - coutTotal;
  const margeCibleTournee = caCibleTournee - coutTotal;
  return {
    coutTotal,
    caUnitaire,
    caCibleTournee,
    margeUnitaire,
    margeCibleTournee,
    ecartCa: caUnitaire - caCibleTournee,
    ecartMarge: margeUnitaire - margeCibleTournee
  };
}

// Normalisation des noms chargeurs (ex: COLIS PRIVÉ 64/66)
const normalizeChargeurName = (rawName, tourneeName = '') => {
  const base = String(rawName || '').trim();
  const tournee = String(tourneeName || '').trim();

  if (!base || base === 'N/A') return 'Inconnu';

  const upper = base.toUpperCase().replace(/\s+/g, ' ').trim();
  const upperTournee = tournee.toUpperCase();

  // Harmoniser accents/variantes
  const upperNoAccent = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Cas COLIS PRIVE / COLIS PRIVÉ : si pas de 64/66 dans le nom chargeur, essayer d'inférer via la tournée
  if (upperNoAccent.includes('COLIS PRIVE') && !upperNoAccent.match(/\b(64|66)\b/)) {
    if (upperTournee.match(/\b64\b/) || upperTournee.includes(' 64')) return 'COLIS PRIVE 64';
    if (upperTournee.match(/\b66\b/) || upperTournee.includes(' 66')) return 'COLIS PRIVE 66';
    // Sinon, garder le libellé générique
    return 'COLIS PRIVE';
  }

  return upperNoAccent;
};

function directionFinanceKey(month, chargeur, societe) {
  return `${String(month || '')}__${String(chargeur || '').trim()}__${String(societe || '').trim()}`;
}

// Paramètres financiers mensuels (CRUD simple)
router.get('/direction/finance/params', (req, res) => {
  try {
    const { month } = req.query;
    const all = readDirectionFinanceParams();
    const data = month ? all.filter((r) => r.month === month) : all;
    res.json({ data });
  } catch (error) {
    console.error('[API Direction] Erreur finance params:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/direction/finance/params', (req, res) => {
  try {
    const payload = req.body || {};
    const month = String(payload.month || '').trim();
    const chargeur = String(payload.chargeur || '').trim();
    const societe = String(payload.societe || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month) || !chargeur || !societe) {
      return res.status(400).json({ error: 'month (YYYY-MM), chargeur et societe sont requis.' });
    }

    const row = {
      month,
      chargeur,
      societe,
      coutParTournee: numberOrZero(payload.coutParTournee),
      prixParColisLivre: numberOrZero(payload.prixParColisLivre),
      prixParPointLivre: numberOrZero(payload.prixParPointLivre),
      montantBranding: numberOrZero(payload.montantBranding),
      prixParPointCollecte: numberOrZero(payload.prixParPointCollecte),
      prixParColisCollecte: numberOrZero(payload.prixParColisCollecte),
      caVouluParTournee: numberOrZero(payload.caVouluParTournee),
      updatedAt: new Date().toISOString()
    };

    const all = readDirectionFinanceParams();
    const key = directionFinanceKey(month, chargeur, societe);
    const idx = all.findIndex((r) => directionFinanceKey(r.month, r.chargeur, r.societe) === key);
    if (idx >= 0) all[idx] = { ...all[idx], ...row };
    else all.push({ ...row, createdAt: row.updatedAt });
    writeDirectionFinanceParams(all);
    res.json({ ok: true, data: row });
  } catch (error) {
    console.error('[API Direction] Erreur upsert finance params:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyse financière hybride (tournée + unitaire)
router.get('/direction/finance/analyse', async (req, res) => {
  try {
    const { month, chargeur, societe } = req.query;
    const monthRange = parseMonthToRange(month);
    if (!monthRange) {
      return res.status(400).json({ error: 'month doit être au format YYYY-MM' });
    }

    const tournees = await exploitationService.getTourneesSalesforce(
      { dateDebut: monthRange.start, dateFin: monthRange.end },
      'production'
    );
    const params = readDirectionFinanceParams().filter((r) => r.month === monthRange.month);
    const paramsByKey = new Map(params.map((r) => [directionFinanceKey(r.month, r.chargeur, r.societe), r]));

    const volumesMap = new Map();
    const tournSetMap = new Map();
    const tourneesByRow = new Map(); // rowKey -> Map(tourneeKey -> aggregate row)
    const tourneeDetailsByRow = new Map(); // rowKey -> Map(tourneeKey -> courses[])
    tournees.forEach((tournee) => {
      const courses = tournee.courses || [];
      courses.forEach((course) => {
        const chargeurNom = normalizeChargeurName(course.chargeur, course.tournee || tournee.numeroTournee);
        const societeNom = String(course.societeBeneficiaire || 'N/A').trim() || 'N/A';
        const key = directionFinanceKey(monthRange.month, chargeurNom, societeNom);
        if (!volumesMap.has(key)) {
          volumesMap.set(key, {
            month: monthRange.month,
            chargeur: chargeurNom,
            societe: societeNom,
            nbTournees: 0,
            colisLivres: 0,
            pdlLivres: 0,
            pointsCollecte: 0,
            colisCollectes: 0
          });
          tournSetMap.set(key, new Set());
        }
        const row = volumesMap.get(key);
        row.colisLivres += numberOrZero(course.colisLivres);
        row.pdlLivres += numberOrZero(course.pdlLivres);
        row.pointsCollecte += numberOrZero(course.pdlCollectes);
        row.colisCollectes += numberOrZero(course.colisCollectes);
        const tourneeCode = String(course.tournee || tournee.numeroTournee || 'N/A');
        const tourneeKey = `${tournee.sfId || tournee.id || ''}::${tourneeCode}`;
        tournSetMap.get(key).add(tourneeKey);

        if (!tourneesByRow.has(key)) tourneesByRow.set(key, new Map());
        if (!tourneeDetailsByRow.has(key)) tourneeDetailsByRow.set(key, new Map());

        const rowTournees = tourneesByRow.get(key);
        if (!rowTournees.has(tourneeKey)) {
          rowTournees.set(tourneeKey, {
            id: tourneeKey,
            sfId: tournee.sfId || tournee.id || null,
            date: tournee.date || course.date || null,
            tournee: tourneeCode,
            chargeur: chargeurNom,
            societe: societeNom,
            nbCourses: 0,
            nbTournees: 1,
            colisLivres: 0,
            pdlLivres: 0,
            pointsCollecte: 0,
            colisCollectes: 0
          });
        }
        const tr = rowTournees.get(tourneeKey);
        tr.nbCourses += 1;
        tr.colisLivres += numberOrZero(course.colisLivres);
        tr.pdlLivres += numberOrZero(course.pdlLivres);
        tr.pointsCollecte += numberOrZero(course.pdlCollectes);
        tr.colisCollectes += numberOrZero(course.colisCollectes);

        const rowDetails = tourneeDetailsByRow.get(key);
        if (!rowDetails.has(tourneeKey)) rowDetails.set(tourneeKey, []);
        rowDetails.get(tourneeKey).push({
          date: course.date || tournee.date || null,
          tournee: tourneeCode,
          chargeur: chargeurNom,
          societe: societeNom,
          chauffeur: course.chauffeur || tournee.chauffeurNom || 'N/A',
          vehicule: course.immatriculation || tournee.vehiculeImmat || 'N/A',
          pdlPec: numberOrZero(course.totalPDLPec),
          pdlLivres: numberOrZero(course.pdlLivres),
          colisPec: numberOrZero(course.totalColisPec),
          colisLivres: numberOrZero(course.colisLivres),
          pointsCollecte: numberOrZero(course.pdlCollectes),
          colisCollectes: numberOrZero(course.colisCollectes)
        });
      });
    });

    Array.from(volumesMap.entries()).forEach(([k, v]) => {
      v.nbTournees = (tournSetMap.get(k) || new Set()).size;
    });

    const rows = Array.from(volumesMap.values())
      .map((v) => {
        const p = paramsByKey.get(directionFinanceKey(v.month, v.chargeur, v.societe)) || {};
        const metrics = computeFinanceMetrics(v, p);
        return {
          ...v,
          params: p,
          ...metrics
        };
      })
      .filter((r) => !chargeur || chargeur === 'all' || r.chargeur === chargeur)
      .filter((r) => !societe || societe === 'all' || r.societe === societe)
      .sort((a, b) => b.margeUnitaire - a.margeUnitaire);

    const rowsKeySet = new Set(rows.map((r) => directionFinanceKey(r.month, r.chargeur, r.societe)));
    const tourneesObj = {};
    const tourneeDetailsObj = {};
    rows.forEach((row) => {
      const key = directionFinanceKey(row.month, row.chargeur, row.societe);
      if (!rowsKeySet.has(key)) return;
      const p = row.params || {};
      const tourRows = Array.from((tourneesByRow.get(key) || new Map()).values())
        .map((tr) => {
          const metrics = computeFinanceMetrics(
            {
              nbTournees: 1,
              colisLivres: tr.colisLivres,
              pdlLivres: tr.pdlLivres,
              pointsCollecte: tr.pointsCollecte,
              colisCollectes: tr.colisCollectes
            },
            p
          );
          return { ...tr, ...metrics };
        })
        .sort((a, b) => String(a.tournee).localeCompare(String(b.tournee)));
      tourneesObj[key] = tourRows;

      const detailsMap = tourneeDetailsByRow.get(key) || new Map();
      tourneeDetailsObj[key] = {};
      tourRows.forEach((tr) => {
        const details = (detailsMap.get(tr.id) || []).slice();
        const detailMetrics = details.map((d) => {
          const metrics = computeFinanceMetrics(
            {
              nbTournees: 1,
              colisLivres: d.colisLivres,
              pdlLivres: d.pdlLivres,
              pointsCollecte: d.pointsCollecte,
              colisCollectes: d.colisCollectes
            },
            p
          );
          return { ...d, ...metrics };
        });
        tourneeDetailsObj[key][tr.id] = detailMetrics;
      });
    });

    const summary = rows.reduce(
      (acc, r) => {
        acc.nbLignes += 1;
        acc.nbTournees += r.nbTournees;
        acc.colisLivres += r.colisLivres;
        acc.pdlLivres += r.pdlLivres;
        acc.pointsCollecte += r.pointsCollecte;
        acc.colisCollectes += r.colisCollectes;
        acc.coutTotal += r.coutTotal;
        acc.caUnitaire += r.caUnitaire;
        acc.caCibleTournee += r.caCibleTournee;
        acc.margeUnitaire += r.margeUnitaire;
        acc.margeCibleTournee += r.margeCibleTournee;
        acc.ecartCa += r.ecartCa;
        acc.ecartMarge += r.ecartMarge;
        return acc;
      },
      {
        nbLignes: 0,
        nbTournees: 0,
        colisLivres: 0,
        pdlLivres: 0,
        pointsCollecte: 0,
        colisCollectes: 0,
        coutTotal: 0,
        caUnitaire: 0,
        caCibleTournee: 0,
        margeUnitaire: 0,
        margeCibleTournee: 0,
        ecartCa: 0,
        ecartMarge: 0
      }
    );

    res.json({
      month: monthRange.month,
      dateDebut: monthRange.start,
      dateFin: monthRange.end,
      data: rows,
      summary,
      tournees: tourneesObj,
      tourneeDetails: tourneeDetailsObj
    });
  } catch (error) {
    console.error('[API Direction] Erreur analyse financière:', error);
    res.status(500).json({ error: error.message });
  }
});

// Statistiques globales par chargeur pour la Direction
router.get('/direction/statistiques-chargeurs', async (req, res) => {
  try {
    const { dateDebut, dateFin, salesforce } = req.query;
    const useSalesforce = salesforce === 'true';
    
    console.log(`[API Direction] Statistiques chargeurs - ${dateDebut} à ${dateFin}`);
    
    if (!useSalesforce) {
      return res.json({ chargeurs: [] });
    }
    
    // Récupérer les tournées avec leurs courses pour la période
    const tournees = await exploitationService.getTourneesSalesforce({ dateDebut, dateFin }, 'production');
    
    // Agréger par chargeur
    const chargeursMap = {};
    
    tournees.forEach(tournee => {
      const courses = tournee.courses || [];
      courses.forEach(course => {
        // Le champ est 'chargeur' dans les courses transformées
        const chargeurNom = normalizeChargeurName(course.chargeur, course.tournee || tournee.nom || tournee.tourneeNom);
        
        if (!chargeursMap[chargeurNom]) {
          chargeursMap[chargeurNom] = {
            id: chargeurNom,
            nom: chargeurNom,
            pdlPec: 0,
            colisPec: 0,
            pdlLivres: 0,
            colisLivres: 0,
            pdlRetour: 0,
            colisRetour: 0,
            nbTournees: 0,
            tourneesIds: new Set()
          };
        }
        
        const c = chargeursMap[chargeurNom];
        c.pdlPec += course.totalPDLPec || 0;
        c.colisPec += course.totalColisPec || course.colisPrisEnCharge || 0;
        c.pdlLivres += course.pdlLivres || 0;
        c.colisLivres += course.colisLivres || 0;
        c.pdlRetour += course.pdlRetour || 0;
        c.colisRetour += course.colisRetour || course.totalColisRetourValue || 0;
        c.tourneesIds.add(tournee.id);
      });
    });
    
    // Convertir en tableau et calculer le nombre de tournées
    const chargeurs = Object.values(chargeursMap).map(c => ({
      ...c,
      nbTournees: c.tourneesIds.size,
      tourneesIds: undefined
    })).sort((a, b) => b.colisPec - a.colisPec);
    
    res.json({ chargeurs });
    
  } catch (error) {
    console.error('[API Direction] Erreur statistiques chargeurs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Planning chauffeur (par date → chauffeur → tournée → chargeur) + détection anomalies 0 colis
router.get('/direction/planning-chauffeur', async (req, res) => {
  try {
    const { dateDebut, dateFin, salesforce, zeroPec, zeroLiv } = req.query;
    const useSalesforce = salesforce === 'true';
    const onlyZeroPec = zeroPec === 'true';
    const onlyZeroLiv = zeroLiv === 'true';

    console.log(
      `[API Direction] Planning chauffeur - ${dateDebut} à ${dateFin} (zeroPec=${onlyZeroPec}, zeroLiv=${onlyZeroLiv})`
    );

    if (!useSalesforce) {
      return res.json({ rows: [] });
    }

    const tournees = await exploitationService.getTourneesSalesforce({ dateDebut, dateFin }, 'production');
    const rows = [];

    tournees.forEach((tournee) => {
      const date = tournee.date || null;
      const chauffeur = tournee.chauffeurNom || 'Inconnu';
      const vehicule = tournee.vehiculeImmat || 'N/A';
      const courses = tournee.courses || [];

      courses.forEach((course) => {
        const tourneeNom = course.tournee || tournee.nom || tournee.tourneeNom || 'Tournée inconnue';
        const chargeur = normalizeChargeurName(course.chargeur, tourneeNom);

        const colisPec = course.totalColisPec || course.colisPrisEnCharge || 0;
        const colisLivres = course.colisLivres || 0;
        const pdlPec = course.totalPDLPec || 0;
        const pdlLivres = course.pdlLivres || 0;

        const isZeroPec = colisPec === 0;
        const isZeroLiv = colisLivres === 0;

        // Si un filtre "0" est activé, on l'applique. Sinon, on remonte tout.
        if (onlyZeroPec || onlyZeroLiv) {
          const match = (onlyZeroPec && isZeroPec) || (onlyZeroLiv && isZeroLiv);
          if (!match) return;
        }

        rows.push({
          date,
          chauffeur,
          vehicule,
          tournee: tourneeNom,
          chargeur,
          colisPec,
          colisLivres,
          pdlPec,
          pdlLivres,
          courseId: course.id || null,
          anomalies: {
            zeroPec: isZeroPec,
            zeroLiv: isZeroLiv
          }
        });
      });
    });

    rows.sort((a, b) => {
      const d = (a.date || '').localeCompare(b.date || '');
      if (d !== 0) return d;
      const c = (a.chauffeur || '').localeCompare(b.chauffeur || '');
      if (c !== 0) return c;
      const t = (a.tournee || '').localeCompare(b.tournee || '');
      if (t !== 0) return t;
      return (a.chargeur || '').localeCompare(b.chargeur || '');
    });

    res.json({ rows });
  } catch (error) {
    console.error('[API Direction] Erreur planning chauffeur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Détail d'un chargeur (par tournée et par chauffeur)
router.get('/direction/detail-chargeur/:chargeurId', async (req, res) => {
  try {
    const { chargeurId } = req.params;
    const { dateDebut, dateFin, salesforce } = req.query;
    const useSalesforce = salesforce === 'true';
    
    console.log(`[API Direction] Détail chargeur ${chargeurId} - ${dateDebut} à ${dateFin}`);
    
    if (!useSalesforce) {
      return res.json({ tournees: [], chauffeurs: [], totaux: {}, parSociete: {} });
    }
    
    // Récupérer les tournées avec leurs courses pour la période
    const tournees = await exploitationService.getTourneesSalesforce({ dateDebut, dateFin }, 'production');
    
    const tourneesDetail = [];
    const chauffeursMap = {};
    const totaux = {
      pdlPec: 0,
      colisPec: 0,
      pdlLivres: 0,
      colisLivres: 0,
      colisLivresDomicile: 0,
      colisLivresRelais: 0,
      pdlRetour: 0,
      colisRetour: 0
    };
    
    // Map pour agréger par nom de tournée (toutes dates confondues)
    const tourneesMap = {};
    // Map pour agréger par jour (toutes tournées confondues)
    const parJourMap = {};
    // Map pour agréger par tournée par jour
    const parTourneeParJourMap = {};
    
    // Map pour agréger par société
    const parSocieteMap = {};
    
    // Fonction pour initialiser une structure société
    const initSocieteData = () => ({
      totaux: { pdlPec: 0, colisPec: 0, pdlLivres: 0, colisLivres: 0, colisLivresDomicile: 0, colisLivresRelais: 0, pdlRetour: 0, colisRetour: 0 },
      tourneesMap: {},
      chauffeursMap: {},
      parJourMap: {},
      nbJours: 0
    });
    
    tournees.forEach(tournee => {
      const courses = tournee.courses || [];
      // Le champ est 'chargeur' dans les courses transformées
      const coursesChargeur = courses.filter(c => 
        normalizeChargeurName(c.chargeur, c.tournee || tournee.nom || tournee.tourneeNom) === normalizeChargeurName(decodeURIComponent(chargeurId))
      );
      
      if (coursesChargeur.length === 0) return;
      
      // Agréger les stats de cette tournée pour ce chargeur
      const tourneeStats = coursesChargeur.reduce((acc, c) => ({
        pdlPec: acc.pdlPec + (c.totalPDLPec || 0),
        colisPec: acc.colisPec + (c.totalColisPec || c.colisPrisEnCharge || 0),
        pdlLivres: acc.pdlLivres + (c.pdlLivres || 0),
        colisLivres: acc.colisLivres + (c.colisLivres || 0),
        colisLivresDomicile: acc.colisLivresDomicile + (c.colisLivresDomicile || 0),
        colisLivresRelais: acc.colisLivresRelais + (c.colisLivresPR || 0),
        pdlRetour: acc.pdlRetour + (c.pdlRetour || 0),
        colisRetour: acc.colisRetour + (c.colisRetour || c.totalColisRetourValue || 0)
      }), { pdlPec: 0, colisPec: 0, pdlLivres: 0, colisLivres: 0, colisLivresDomicile: 0, colisLivresRelais: 0, pdlRetour: 0, colisRetour: 0 });
      
      // Récupérer le nom de tournée depuis les courses (plus précis)
      const tourneeNom = coursesChargeur[0]?.tournee || tournee.nom || tournee.tourneeNom || 'Tournée inconnue';
      const dateJour = tournee.date;
      // Récupérer la société bénéficiaire
      const societe = coursesChargeur[0]?.societeBeneficiaire || 'N/A';
      
      // Agréger par société
      if (!parSocieteMap[societe]) {
        parSocieteMap[societe] = initSocieteData();
      }
      const socData = parSocieteMap[societe];
      socData.totaux.pdlPec += tourneeStats.pdlPec;
      socData.totaux.colisPec += tourneeStats.colisPec;
      socData.totaux.pdlLivres += tourneeStats.pdlLivres;
      socData.totaux.colisLivres += tourneeStats.colisLivres;
      socData.totaux.colisLivresDomicile += tourneeStats.colisLivresDomicile;
      socData.totaux.colisLivresRelais += tourneeStats.colisLivresRelais;
      socData.totaux.pdlRetour += tourneeStats.pdlRetour;
      socData.totaux.colisRetour += tourneeStats.colisRetour;
      
      // Tournées par société
      if (!socData.tourneesMap[tourneeNom]) {
        socData.tourneesMap[tourneeNom] = {
          nom: tourneeNom,
          datesSet: new Set(),
          pdlPec: 0, colisPec: 0, pdlLivres: 0, colisLivres: 0, colisLivresDomicile: 0, colisLivresRelais: 0
        };
      }
      // Compter uniquement les jours uniques
      socData.tourneesMap[tourneeNom].datesSet.add(dateJour);
      socData.tourneesMap[tourneeNom].pdlPec += tourneeStats.pdlPec;
      socData.tourneesMap[tourneeNom].colisPec += tourneeStats.colisPec;
      socData.tourneesMap[tourneeNom].pdlLivres += tourneeStats.pdlLivres;
      socData.tourneesMap[tourneeNom].colisLivres += tourneeStats.colisLivres;
      socData.tourneesMap[tourneeNom].colisLivresDomicile += tourneeStats.colisLivresDomicile;
      socData.tourneesMap[tourneeNom].colisLivresRelais += tourneeStats.colisLivresRelais;
      
      // Chauffeurs par société
      const chauffeurNomSoc = tournee.chauffeurNom || 'Inconnu';
      if (!socData.chauffeursMap[chauffeurNomSoc]) {
        socData.chauffeursMap[chauffeurNomSoc] = {
          nom: chauffeurNomSoc,
          nbTournees: 0,
          pdlPec: 0, colisPec: 0, pdlLivres: 0, colisLivres: 0
        };
      }
      socData.chauffeursMap[chauffeurNomSoc].nbTournees++;
      socData.chauffeursMap[chauffeurNomSoc].pdlPec += tourneeStats.pdlPec;
      socData.chauffeursMap[chauffeurNomSoc].colisPec += tourneeStats.colisPec;
      socData.chauffeursMap[chauffeurNomSoc].pdlLivres += tourneeStats.pdlLivres;
      socData.chauffeursMap[chauffeurNomSoc].colisLivres += tourneeStats.colisLivres;
      
      // Jours par société
      if (!socData.parJourMap[dateJour]) {
        socData.parJourMap[dateJour] = { date: dateJour, pdlPec: 0, colisPec: 0, pdlLivres: 0, colisLivres: 0 };
        socData.nbJours++;
      }
      socData.parJourMap[dateJour].pdlPec += tourneeStats.pdlPec;
      socData.parJourMap[dateJour].colisPec += tourneeStats.colisPec;
      socData.parJourMap[dateJour].pdlLivres += tourneeStats.pdlLivres;
      socData.parJourMap[dateJour].colisLivres += tourneeStats.colisLivres;
      
      // Agréger par jour (toutes tournées confondues) pour le graphique
      if (!parJourMap[dateJour]) {
        parJourMap[dateJour] = {
          date: dateJour,
          colisPec: 0,
          colisLivres: 0,
          pdlPec: 0,
          pdlLivres: 0
        };
      }
      parJourMap[dateJour].colisPec += tourneeStats.colisPec;
      parJourMap[dateJour].colisLivres += tourneeStats.colisLivres;
      parJourMap[dateJour].pdlPec += tourneeStats.pdlPec;
      parJourMap[dateJour].pdlLivres += tourneeStats.pdlLivres;
      
      // Agréger par tournée par jour pour le graphique détaillé
      if (!parTourneeParJourMap[tourneeNom]) {
        parTourneeParJourMap[tourneeNom] = {};
      }
      if (!parTourneeParJourMap[tourneeNom][dateJour]) {
        parTourneeParJourMap[tourneeNom][dateJour] = {
          date: dateJour,
          colisPec: 0,
          colisLivres: 0,
          pdlPec: 0,
          pdlLivres: 0
        };
      }
      parTourneeParJourMap[tourneeNom][dateJour].colisPec += tourneeStats.colisPec;
      parTourneeParJourMap[tourneeNom][dateJour].colisLivres += tourneeStats.colisLivres;
      parTourneeParJourMap[tourneeNom][dateJour].pdlPec += tourneeStats.pdlPec;
      parTourneeParJourMap[tourneeNom][dateJour].pdlLivres += tourneeStats.pdlLivres;
      
      // Agréger par nom de tournée (toutes dates confondues)
      if (!tourneesMap[tourneeNom]) {
        tourneesMap[tourneeNom] = {
          nom: tourneeNom,
          societe: societe,
          nbJours: 0,
          chauffeurs: new Set(),
          pdlPec: 0,
          colisPec: 0,
          pdlLivres: 0,
          colisLivres: 0,
          colisLivresDomicile: 0,
          colisLivresRelais: 0,
          pdlRetour: 0,
          colisRetour: 0,
          parJour: {}
        };
      }
      
      const t = tourneesMap[tourneeNom];
      t.nbJours++;
      if (tournee.chauffeurNom) t.chauffeurs.add(tournee.chauffeurNom);
      t.pdlPec += tourneeStats.pdlPec;
      t.colisPec += tourneeStats.colisPec;
      t.pdlLivres += tourneeStats.pdlLivres;
      t.colisLivres += tourneeStats.colisLivres;
      t.colisLivresDomicile += tourneeStats.colisLivresDomicile;
      t.colisLivresRelais += tourneeStats.colisLivresRelais;
      t.pdlRetour += tourneeStats.pdlRetour;
      t.colisRetour += tourneeStats.colisRetour;
      
      // Détail par jour pour cette tournée
      // Récupérer l'ID de la première course du chargeur pour ce jour
      const courseId = coursesChargeur[0]?.id || null;
      if (!t.parJour[dateJour]) {
        t.parJour[dateJour] = {
          date: dateJour,
          chauffeur: tournee.chauffeurNom || 'Inconnu',
          courseId: courseId,
          pdlPec: 0, colisPec: 0, pdlLivres: 0, colisLivres: 0, colisLivresDomicile: 0, colisLivresRelais: 0
        };
      }
      // Garder l'ID de la course pour ce jour
      if (courseId) t.parJour[dateJour].courseId = courseId;
      t.parJour[dateJour].pdlPec += tourneeStats.pdlPec;
      t.parJour[dateJour].colisPec += tourneeStats.colisPec;
      t.parJour[dateJour].pdlLivres += tourneeStats.pdlLivres;
      t.parJour[dateJour].colisLivres += tourneeStats.colisLivres;
      t.parJour[dateJour].colisLivresDomicile += tourneeStats.colisLivresDomicile;
      t.parJour[dateJour].colisLivresRelais += tourneeStats.colisLivresRelais;
      
      // Agréger par chauffeur
      const chauffeurNom = tournee.chauffeurNom || 'Inconnu';
      if (!chauffeursMap[chauffeurNom]) {
        chauffeursMap[chauffeurNom] = {
          nom: chauffeurNom,
          nbTournees: 0,
          pdlPec: 0,
          colisPec: 0,
          pdlLivres: 0,
          colisLivres: 0,
          colisLivresDomicile: 0,
          colisLivresRelais: 0,
          pdlRetour: 0,
          colisRetour: 0,
          parJour: {},
          tournees: new Set()
        };
      }
      
      const ch = chauffeursMap[chauffeurNom];
      ch.nbTournees++;
      ch.pdlPec += tourneeStats.pdlPec;
      ch.colisPec += tourneeStats.colisPec;
      ch.pdlLivres += tourneeStats.pdlLivres;
      ch.colisLivres += tourneeStats.colisLivres;
      ch.colisLivresDomicile += tourneeStats.colisLivresDomicile;
      ch.colisLivresRelais += tourneeStats.colisLivresRelais;
      ch.pdlRetour += tourneeStats.pdlRetour;
      ch.colisRetour += tourneeStats.colisRetour;
      ch.tournees.add(tourneeNom);
      
      // Agréger par jour pour ce chauffeur
      if (!ch.parJour[dateJour]) {
        ch.parJour[dateJour] = {
          date: dateJour,
          tournee: tourneeNom,
          pdlPec: 0,
          colisPec: 0,
          pdlLivres: 0,
          colisLivres: 0
        };
      }
      ch.parJour[dateJour].pdlPec += tourneeStats.pdlPec;
      ch.parJour[dateJour].colisPec += tourneeStats.colisPec;
      ch.parJour[dateJour].pdlLivres += tourneeStats.pdlLivres;
      ch.parJour[dateJour].colisLivres += tourneeStats.colisLivres;
      ch.parJour[dateJour].tournee = tourneeNom;
      
      // Totaux
      totaux.pdlPec += tourneeStats.pdlPec;
      totaux.colisPec += tourneeStats.colisPec;
      totaux.pdlLivres += tourneeStats.pdlLivres;
      totaux.colisLivres += tourneeStats.colisLivres;
      totaux.colisLivresDomicile += tourneeStats.colisLivresDomicile;
      totaux.colisLivresRelais += tourneeStats.colisLivresRelais;
      totaux.pdlRetour += tourneeStats.pdlRetour;
      totaux.colisRetour += tourneeStats.colisRetour;
    });
    
    // Convertir parJour en tableau trié par date
    const parJour = Object.values(parJourMap).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Convertir parTourneeParJour en format pour graphique
    const parTournee = Object.entries(parTourneeParJourMap).map(([nom, jours]) => ({
      nom,
      data: Object.values(jours).sort((a, b) => new Date(a.date) - new Date(b.date))
    }));
    
    // Convertir les tournées en tableau avec liste des chauffeurs et détail par jour
    const tourneesAggregees = Object.values(tourneesMap).map(t => ({
      ...t,
      chauffeurs: Array.from(t.chauffeurs).join(', ') || 'N/A',
      parJour: Object.values(t.parJour).sort((a, b) => new Date(a.date) - new Date(b.date))
    })).sort((a, b) => b.colisPec - a.colisPec);
    
    // Convertir chauffeurs en tableau et trier par volume
    const chauffeurs = Object.values(chauffeursMap).map(c => ({
      ...c,
      parJour: Object.values(c.parJour).sort((a, b) => a.date.localeCompare(b.date)),
      tournees: Array.from(c.tournees)
    })).sort((a, b) => b.colisPec - a.colisPec);
    
    // Convertir parSociete en format lisible
    const parSociete = {};
    Object.entries(parSocieteMap).forEach(([societeNom, socData]) => {
      // Convertir les tournées et calculer nbJours à partir du Set de dates uniques
      const tourneesConvertiesSoc = Object.values(socData.tourneesMap).map(t => ({
        nom: t.nom,
        nbJours: t.datesSet ? t.datesSet.size : 0,
        pdlPec: t.pdlPec,
        colisPec: t.colisPec,
        pdlLivres: t.pdlLivres,
        colisLivres: t.colisLivres,
        colisLivresDomicile: t.colisLivresDomicile,
        colisLivresRelais: t.colisLivresRelais
      })).sort((a, b) => a.nom.localeCompare(b.nom));
      
      parSociete[societeNom] = {
        totaux: socData.totaux,
        nbJours: socData.nbJours,
        tournees: tourneesConvertiesSoc,
        chauffeurs: Object.values(socData.chauffeursMap).sort((a, b) => b.colisPec - a.colisPec),
        parJour: Object.values(socData.parJourMap).sort((a, b) => new Date(a.date) - new Date(b.date))
      };
    });
    
    res.json({
      tournees: tourneesAggregees,
      chauffeurs,
      totaux,
      parJour,
      parTournee,
      parSociete
    });
    
  } catch (error) {
    console.error('[API Direction] Erreur détail chargeur:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
