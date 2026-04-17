const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { pool } = require('../../services/database');
const SalesforceService = require('../../services/salesforceService');

const router = express.Router();
const declarationDetailsCache = new Map();

function requirePool(res) {
  if (!pool) {
    res.status(503).json({ error: 'Base de données non configurée' });
    return false;
  }
  return true;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function withSalesforce(environment = 'production') {
  const sf = new SalesforceService(environment);
  await sf.connect();
  return sf;
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Clé YYYY-MM → libellé "Janvier 2025" (fr-FR, première lettre majuscule) */
function monthLabelFromKey(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(ym || '');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return String(ym);
  const raw = new Date(y, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function sfQuoteId(id) {
  return `'${String(id).replace(/'/g, "\\'")}'`;
}

function buildFournisseursInClause(fournisseurs) {
  const list =
    Array.isArray(fournisseurs) && fournisseurs.length
      ? fournisseurs
      : ['UTA', 'WEX', 'TotalEnergies Marketing France', 'ES-ARMENGOL MORALES', 'Carte Perso Chauffeur'];
  return list.map((f) => sfQuoteId(String(f))).join(',');
}

async function querySoqlAllPages(sf, soql) {
  let result = await sf.conn.query(soql);
  let all = result.records || [];
  while (!result.done && result.nextRecordsUrl) {
    // eslint-disable-next-line no-await-in-loop
    result = await sf.conn.queryMore(result.nextRecordsUrl);
    all = all.concat(result.records || []);
  }
  return all;
}

/** Requêtes par lots Vehicule__c IN (...) pour respecter les limites SOQL */
const VEHICLE_IN_BATCH_SIZE = 80;

async function queryTransactionsCarburantBatched(sf, { periode_debut, periode_fin, vehiculeSfIds, fournisseurs }) {
  if (!vehiculeSfIds.length) return [];
  const sfFournisseurs = buildFournisseursInClause(fournisseurs);
  const baseWhere = `
      WHERE Date_Transaction__c >= ${periode_debut}
        AND Date_Transaction__c <= ${periode_fin}
        AND Produit__c = 'Gasoil'
        AND IO_Fournisseur__c IN (${sfFournisseurs})
        AND IO_Supprime__c = false
  `;
  const selectFields = `
      SELECT Id, Name, Date_Transaction__c, Volume_Transaction__c,
             IO_MontantHTHorsFrais__c, IO_Fournisseur__c, Produit__c,
             Kilometrage_Justificatif__c,
             Vehicule__c, Vehicule__r.Name, Vehicule__r.Filiale_Porteuse_Vehicule__c
      FROM Transaction_Carburant__c
  `;
  let allTx = [];
  for (let i = 0; i < vehiculeSfIds.length; i += VEHICLE_IN_BATCH_SIZE) {
    const batch = vehiculeSfIds.slice(i, i + VEHICLE_IN_BATCH_SIZE);
    const inList = batch.map(sfQuoteId).join(',');
    const soql = `${selectFields}
      ${baseWhere}
        AND Vehicule__c IN (${inList})
    `;
    // eslint-disable-next-line no-await-in-loop
    const chunk = await querySoqlAllPages(sf, soql);
    allTx = allTx.concat(chunk);
  }
  return allTx;
}

function parseVehiculesQueryParam(vehicules) {
  if (vehicules == null || vehicules === '') return [];
  if (Array.isArray(vehicules)) {
    return vehicules.map((v) => String(v).trim()).filter(Boolean);
  }
  const s = String(vehicules).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map((v) => String(v).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function parseFournisseursQueryParam(fournisseurs) {
  if (fournisseurs == null || fournisseurs === '') return null;
  if (Array.isArray(fournisseurs)) return fournisseurs.map(String);
  return String(fournisseurs)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function monthBoundsFromKey(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return { debut: '', fin: '' };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const debut = `${y}-${String(mo).padStart(2, '0')}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const fin = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { debut, fin };
}

const PDF_COLORS = {
  primary: '#1e3a5f',
  secondary: '#2d6a9f',
  accent: '#e8f0f7',
  text: '#1a1a2e',
  white: '#ffffff',
  green: '#16a34a',
  grayLight: '#f8fafc',
  grayBorder: '#e2e8f0',
};

function sanitize(str) {
  return String(str || '')
    .replace(/[éèêë]/g, 'e')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[àâä]/g, 'a')
    .replace(/[ÀÂÄ]/g, 'A')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ÙÛÜ]/g, 'U')
    .replace(/[ôö]/g, 'o')
    .replace(/[ÔÖ]/g, 'O')
    .replace(/[îï]/g, 'i')
    .replace(/[ÎÏ]/g, 'I')
    .replace(/[ç]/g, 'c')
    .replace(/[Ç]/g, 'C');
}

function safeText(str) {
  if (str == null) return '';
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatNumber(n, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'N/A';
  const fixed = Number(n).toFixed(decimals);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decimals > 0 ? parts.join(',') : parts[0];
}

function formatKm(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'N/A';
  return `${formatNumber(n, 0)} km`;
}

function formatLitres(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'N/A';
  return `${formatNumber(n, decimals)} L`;
}

function formatEuros(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'N/A';
  return `${formatNumber(n, decimals)} €`;
}

function formatPeriodeLabel(debut, fin) {
  const mois = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  const d = new Date(debut);
  const f = new Date(fin);
  const labelDebut = `${mois[d.getMonth()] || ''} ${d.getFullYear()}`;
  const labelFin = `${mois[f.getMonth()] || ''} ${f.getFullYear()}`;
  return labelDebut === labelFin ? labelDebut : `${labelDebut} a ${labelFin}`;
}

function drawPageHeader(doc, titre, pageNum) {
  const h = 34;
  doc.save();
  doc.rect(0, 0, doc.page.width, h).fill(PDF_COLORS.primary);
  doc
    .fillColor(PDF_COLORS.white)
    .font('Helvetica')
    .fontSize(10)
    .text(sanitize(titre || ''), 40, 12, { align: 'left', width: doc.page.width - 160 });
  doc
    .fillColor(PDF_COLORS.white)
    .font('Helvetica')
    .fontSize(10)
    .text(sanitize(pageNum || ''), 0, 12, { align: 'right', width: doc.page.width - 40 });
  doc.restore();
}

function drawSectionTitle(doc, titre) {
  const y = doc.y;
  doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(16).text(sanitize(titre), 40, y);
  const lineY = doc.y + 4;
  doc
    .moveTo(40, lineY)
    .lineTo(doc.page.width - 40, lineY)
    .lineWidth(2)
    .strokeColor(PDF_COLORS.secondary)
    .stroke();
  doc.moveDown(0.8);
}

function drawTableHeader(doc, colonnes, largeurs, y) {
  let x = 40;
  const h = 20;
  doc.save();
  doc.rect(40, y, doc.page.width - 80, h).fill(PDF_COLORS.primary);
  doc.restore();
  for (let i = 0; i < colonnes.length; i += 1) {
    const w = largeurs[i];
    doc
      .fillColor(PDF_COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(sanitize(String(colonnes[i])), x + 4, y + 6, { width: w - 8, align: i === 0 ? 'left' : 'right' });
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(PDF_COLORS.grayBorder).stroke();
    x += w;
  }
  return y + h;
}

function drawTableRow(doc, valeurs, largeurs, y, isEven = false, isTotal = false) {
  let x = 40;
  const h = 18;
  const bg = isTotal ? PDF_COLORS.accent : isEven ? PDF_COLORS.grayLight : PDF_COLORS.white;
  doc.save();
  doc.rect(40, y, doc.page.width - 80, h).fill(bg);
  doc.restore();
  for (let i = 0; i < valeurs.length; i += 1) {
    const w = largeurs[i];
    doc
      .fillColor(PDF_COLORS.text)
      .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.5)
      .text(safeText(String(valeurs[i] ?? '')), x + 4, y + 5, { width: w - 8, align: i === 0 ? 'left' : 'right' });
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(PDF_COLORS.grayBorder).stroke();
    x += w;
  }
  return y + h;
}

async function buildCalculPayload({
  periode_debut,
  periode_fin,
  periodicite,
  filiale,
  fournisseurs = [],
  annee_taux,
  vehicule_sf_ids,
}) {
  const eligQ = await pool.query(
    `SELECT * FROM ticpe_vehicules_eligibles WHERE eligible = true`
  );
  const eligibles = eligQ.rows || [];
  const eligibleBySfId = new Map(eligibles.map((v) => [String(v.vehicule_sf_id).trim(), v]));

  let vehiculeSfIdsFilter;
  if (Array.isArray(vehicule_sf_ids)) {
    vehiculeSfIdsFilter = vehicule_sf_ids
      .map((id) => String(id).trim())
      .filter((id) => id && eligibleBySfId.has(id));
  } else {
    vehiculeSfIdsFilter = eligibles.map((v) => String(v.vehicule_sf_id).trim()).filter(Boolean);
  }

  const tq = await pool.query(
    `SELECT * FROM ticpe_taux WHERE annee = $1 AND carburant = 'gazole' LIMIT 1`,
    [Number(annee_taux)]
  );
  if (!tq.rows.length) {
    const err = new Error(`Taux TICPE introuvable pour ${annee_taux} / gazole`);
    err.statusCode = 400;
    throw err;
  }
  const taux_cents = toNum(tq.rows[0].taux_cents, 0);

  const sf = await withSalesforce('production');
  try {
    const allTx = await queryTransactionsCarburantBatched(sf, {
      periode_debut,
      periode_fin,
      vehiculeSfIds: vehiculeSfIdsFilter,
      fournisseurs,
    });

    const idsInTransactionsBrut = new Set();
    for (const t of allTx) {
      const vid = String(t.Vehicule__c || '').trim();
      if (vid) idsInTransactionsBrut.add(vid);
    }
    const eligibleIdsSent = [...new Set(vehiculeSfIdsFilter)];
    const missingInTxBrut = eligibleIdsSent.filter((id) => !idsInTransactionsBrut.has(id));
    console.log(
      '[TICPE calculer] vehicule_sf_ids envoyés au filtre IN (count=%d):',
      eligibleIdsSent.length,
      eligibleIdsSent
    );
    console.log(
      '[TICPE calculer] ids distincts présents dans les transactions (count=%d):',
      idsInTransactionsBrut.size,
      [...idsInTransactionsBrut]
    );
    if (missingInTxBrut.length) {
      console.log(
        '[TICPE calculer] éligibles sans transaction sur la période / filtres (count=%d):',
        missingInTxBrut.length,
        missingInTxBrut
      );
    }

    let transactions = allTx;
    if (filiale && filiale !== 'Toutes') {
      transactions = transactions.filter(
        (t) => String(t?.Vehicule__r?.Filiale_Porteuse_Vehicule__c || '') === String(filiale)
      );
    }

    const total_litres = transactions.reduce((s, t) => s + toNum(t.Volume_Transaction__c, 0), 0);
    const total_remboursement = (total_litres * taux_cents) / 100;
    const uniqueVehicules = new Set(transactions.map((t) => String(t.Vehicule__c || '').trim()).filter(Boolean));

    const par_fournisseur = {};
    const par_filiale = {};
    const par_mois = {};
    const par_vehicule = {};
    for (const t of transactions) {
      const vid = String(t.Vehicule__c || '').trim();
      const litres = toNum(t.Volume_Transaction__c, 0);
      const remb = (litres * taux_cents) / 100;
      const f = String(t.IO_Fournisseur__c || 'Inconnu');
      const fi = String(t?.Vehicule__r?.Filiale_Porteuse_Vehicule__c || 'Non renseignée');
      const m = monthKey(t.Date_Transaction__c);
      const kmRaw = t.Kilometrage_Justificatif__c;
      const km = kmRaw != null && kmRaw !== '' ? Number(kmRaw) : NaN;
      par_fournisseur[f] = par_fournisseur[f] || { fournisseur: f, litres: 0, remboursement: 0, nb_tx: 0 };
      par_fournisseur[f].litres += litres;
      par_fournisseur[f].remboursement += remb;
      par_fournisseur[f].nb_tx += 1;
      par_filiale[fi] = par_filiale[fi] || { filiale: fi, litres: 0, remboursement: 0, nb_tx: 0 };
      par_filiale[fi].litres += litres;
      par_filiale[fi].remboursement += remb;
      par_filiale[fi].nb_tx += 1;
      par_mois[m] = par_mois[m] || { mois: m, mois_label: monthLabelFromKey(m), litres: 0, remboursement: 0 };
      par_mois[m].litres += litres;
      par_mois[m].remboursement += remb;

      if (vid) {
        par_vehicule[vid] = par_vehicule[vid] || {
          vehicule_sf_id: vid,
          immatriculation: t?.Vehicule__r?.Name || null,
          filiale: fi,
          type_vehicule: eligibleBySfId.get(vid)?.type_vehicule || null,
          mois: new Set(),
          kms: [],
          volume_total: 0,
        };
        par_vehicule[vid].mois.add(m);
        if (Number.isFinite(km)) par_vehicule[vid].kms.push(km);
        par_vehicule[vid].volume_total += litres;
      }
    }

    const monthVehicleGroups = {};
    for (const t of transactions) {
      const m = monthKey(t.Date_Transaction__c);
      const vid = String(t.Vehicule__c || '').trim();
      if (!m || !vid) continue;
      monthVehicleGroups[m] = monthVehicleGroups[m] || {};
      monthVehicleGroups[m][vid] = monthVehicleGroups[m][vid] || [];
      const kmRaw = t.Kilometrage_Justificatif__c;
      const km = kmRaw != null && kmRaw !== '' ? Number(kmRaw) : NaN;
      if (Number.isFinite(km)) monthVehicleGroups[m][vid].push(km);
    }

    const par_mois_final = Object.values(par_mois)
      .map((r) => {
        const vMap = monthVehicleGroups[r.mois] || {};
        const vehiculeIds = Object.keys(vMap);
        let km_parcourus_sum = 0;
        let hasValidKm = false;
        for (const vid of vehiculeIds) {
          const kms = vMap[vid];
          if (!Array.isArray(kms) || !kms.length) continue;
          const min_km = Math.min(...kms);
          const max_km = Math.max(...kms);
          const km_vehicule = Number.isFinite(min_km) && Number.isFinite(max_km) ? max_km - min_km : 0;
          km_parcourus_sum += km_vehicule;
          hasValidKm = true;
        }
        return {
          mois: r.mois,
          mois_label: r.mois_label,
          litres: r.litres,
          remboursement: r.remboursement,
          nb_vehicules: vehiculeIds.length,
          km_parcourus: hasValidKm ? km_parcourus_sum : null,
        };
      })
      .sort((a, b) => String(a.mois).localeCompare(String(b.mois)));

    const par_vehicule_final = Object.values(par_vehicule)
      .map((v) => {
        const premier_km = v.kms.length ? Math.min(...v.kms) : null;
        const dernier_km = v.kms.length ? Math.max(...v.kms) : null;
        const km_parcourus = premier_km != null && dernier_km != null ? dernier_km - premier_km : null;
        const conso_l100 =
          km_parcourus != null && km_parcourus > 0
            ? Number(((v.volume_total / km_parcourus) * 100).toFixed(1))
            : null;
        const remboursement = (v.volume_total * taux_cents) / 100;
        return {
          vehicule_sf_id: v.vehicule_sf_id,
          immatriculation: v.immatriculation,
          type_vehicule: v.type_vehicule,
          filiale: v.filiale,
          nb_mois: v.mois.size,
          premier_km,
          dernier_km,
          km_parcourus,
          volume_total: v.volume_total,
          conso_l100,
          remboursement,
        };
      })
      .sort((a, b) => toNum(b.remboursement) - toNum(a.remboursement));

    const totaux_par_vehicule = par_vehicule_final.reduce(
      (acc, r) => {
        acc.volume_total += toNum(r.volume_total, 0);
        acc.remboursement_total += toNum(r.remboursement, 0);
        if (r.km_parcourus != null && r.km_parcourus > 0) acc.km_parcourus_total += r.km_parcourus;
        return acc;
      },
      { volume_total: 0, remboursement_total: 0, km_parcourus_total: 0 }
    );
    totaux_par_vehicule.conso_moyenne_l100 =
      totaux_par_vehicule.km_parcourus_total > 0
        ? Number(((totaux_par_vehicule.volume_total / totaux_par_vehicule.km_parcourus_total) * 100).toFixed(1))
        : null;

    const idsAvecTransactions = [...new Set(transactions.map((t) => String(t.Vehicule__c || '').trim()).filter(Boolean))];
    const missingIdsQ = await pool.query(
      `
      WITH ids_filtre AS (
        SELECT unnest($1::text[]) AS vehicule_sf_id
      ),
      transactions_trouvees AS (
        SELECT unnest($2::text[]) AS vehicule_id
      )
      SELECT tve.vehicule_sf_id, tve.immatriculation, tve.filiale,
             tve.type_vehicule, tve.date_debut_eligibilite
      FROM ticpe_vehicules_eligibles tve
      WHERE tve.vehicule_sf_id IN (SELECT vehicule_sf_id FROM ids_filtre)
      AND tve.vehicule_sf_id NOT IN (
        SELECT DISTINCT vehicule_id FROM transactions_trouvees
      )
      ORDER BY tve.immatriculation ASC
      `,
      [eligibleIdsSent, idsAvecTransactions]
    );
    const idsSansTransactionDetails = (missingIdsQ.rows || []).map((row) => ({
      vehicule_sf_id: row.vehicule_sf_id,
      immatriculation: row.immatriculation,
      filiale: row.filiale,
      type_vehicule: row.type_vehicule,
      date_debut_eligibilite: row.date_debut_eligibilite,
      raison_probable: 'Aucune transaction gazole trouvée',
    }));

    return {
      periode_debut,
      periode_fin,
      filiale: filiale || null,
      periodicite: periodicite || null,
      taux_cents,
      taux_euros: taux_cents / 100,
      total_litres,
      total_remboursement,
      nb_transactions: transactions.length,
      nb_vehicules: uniqueVehicules.size,
      nb_vehicules_eligibles_inclus: eligibleIdsSent.length,
      vehicule_sf_ids_utilises: eligibleIdsSent,
      par_fournisseur: Object.values(par_fournisseur),
      par_filiale: Object.values(par_filiale),
      par_mois: par_mois_final,
      par_vehicule: par_vehicule_final,
      totaux_par_vehicule,
      transactions: transactions.map((t) => ({
        id: t.Id,
        code: t.Name,
        date: t.Date_Transaction__c,
        fournisseur: t.IO_Fournisseur__c,
        produit: t.Produit__c,
        litres: toNum(t.Volume_Transaction__c, 0),
        montant_ht: toNum(t.IO_MontantHTHorsFrais__c, 0),
        vehicule_sf_id: t.Vehicule__c,
        immatriculation: t?.Vehicule__r?.Name || null,
        filiale: t?.Vehicule__r?.Filiale_Porteuse_Vehicule__c || null,
        remboursement_unitaire: taux_cents / 100,
        remboursement: (toNum(t.Volume_Transaction__c, 0) * taux_cents) / 100,
      })),
      debug_ticpe_vehicules: {
        eligibles_en_base: eligibles.length,
        ids_filtre_salesforce: eligibleIdsSent.length,
        ids_avec_transactions_brut: idsInTransactionsBrut.size,
        ids_sans_transaction: idsSansTransactionDetails.map((v) => v.vehicule_sf_id),
        vehicules_sans_transaction: idsSansTransactionDetails,
      },
    };
  } finally {
    sf.disconnect();
  }
}

async function calculerDetailMois(debut, fin, vehiculeSfIds, fournisseurs, annee_taux, sfConn) {
  const year =
    annee_taux != null && String(annee_taux).trim() !== ''
      ? Number(annee_taux)
      : Number(String(debut).slice(0, 4));
  const tq = await pool.query(
    `SELECT * FROM ticpe_taux WHERE annee = $1 AND carburant = 'gazole' LIMIT 1`,
    [year]
  );
  if (!tq.rows.length) {
    const err = new Error(`Taux TICPE introuvable pour ${year} / gazole`);
    err.statusCode = 400;
    throw err;
  }
  const taux_cents = toNum(tq.rows[0].taux_cents, 0);
  const sfLike = { conn: sfConn };
  const allTx = await queryTransactionsCarburantBatched(sfLike, {
    periode_debut: debut,
    periode_fin: fin,
    vehiculeSfIds,
    fournisseurs: fournisseurs || undefined,
  });

  const byVid = {};
  for (const t of allTx) {
    const vid = String(t.Vehicule__c || '');
    if (!vid) continue;
    const kmRaw = t.Kilometrage_Justificatif__c;
    const km = kmRaw != null && kmRaw !== '' ? Number(kmRaw) : NaN;
    const litres = toNum(t.Volume_Transaction__c, 0);
    if (!byVid[vid]) {
      byVid[vid] = {
        vehicule_sf_id: vid,
        immatriculation: t.Vehicule__r?.Name || null,
        filiale: t.Vehicule__r?.Filiale_Porteuse_Vehicule__c || null,
        kms: [],
        volume_total: 0,
      };
    }
    if (Number.isFinite(km)) byVid[vid].kms.push(km);
    byVid[vid].volume_total += litres;
  }

  const lignes = [];
  let sumVol = 0;
  let sumRemb = 0;
  let sumKmParcourus = 0;

  for (const row of Object.values(byVid)) {
    const kms = row.kms;
    const premier_km = kms.length ? Math.min(...kms) : null;
    const dernier_km = kms.length ? Math.max(...kms) : null;
    let km_parcourus = null;
    if (premier_km != null && dernier_km != null) km_parcourus = dernier_km - premier_km;
    const volume_total = row.volume_total;
    let consommation_l100 = null;
    if (km_parcourus != null && km_parcourus > 0 && volume_total > 0) {
      consommation_l100 = (volume_total / km_parcourus) * 100;
    }
    const remboursement = (volume_total * taux_cents) / 100;

    sumVol += volume_total;
    sumRemb += remboursement;
    if (km_parcourus != null && km_parcourus > 0) sumKmParcourus += km_parcourus;

    lignes.push({
      immatriculation: row.immatriculation,
      premier_km,
      dernier_km,
      km_parcourus,
      volume_total,
      consommation_l100,
      remboursement,
    });
  }

  lignes.sort((a, b) => String(a.immatriculation || '').localeCompare(String(b.immatriculation || ''), 'fr'));

  let conso_moyenne_ponderee = null;
  if (sumKmParcourus > 0 && sumVol > 0) conso_moyenne_ponderee = (sumVol / sumKmParcourus) * 100;

  const mois_key = monthKey(debut);
  const mois_label = monthLabelFromKey(mois_key);

  return {
    debut,
    fin,
    taux_cents,
    mois_key,
    mois_label,
    lignes,
    totaux: {
      volume_total: sumVol,
      remboursement_total: sumRemb,
      conso_moyenne_ponderee,
    },
  };
}

async function aggregateDetailMois(poolRef, sf, { debut, fin, vehiculeSfIds, fournisseurs, annee_taux }) {
  return calculerDetailMois(
    debut,
    fin,
    vehiculeSfIds,
    fournisseurs,
    annee_taux,
    sf.conn
  );
}

function makeReference(periodicite, periodeDebut, filiale) {
  const p = String(periodicite || 'mensuel').toUpperCase();
  const fd = String(periodeDebut || '').replaceAll('-', '');
  const f = filiale ? String(filiale).replace(/\s+/g, '').slice(0, 10).toUpperCase() : 'ALL';
  return `TICPE-${p}-${fd}-${f}-${Date.now().toString().slice(-6)}`;
}

// ── Taux ────────────────────────────────────────────────────────────────────────
router.get('/taux', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const q = await pool.query(`SELECT * FROM ticpe_taux ORDER BY annee DESC, carburant ASC`);
    res.json({ data: q.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/taux', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const { annee, carburant, taux_cents, description, reference_legale } = req.body || {};
    if (!annee || !carburant || taux_cents == null) {
      return res.status(400).json({ error: 'annee, carburant, taux_cents requis' });
    }
    const q = await pool.query(
      `
      INSERT INTO ticpe_taux (annee, carburant, taux_cents, description, reference_legale)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (annee, carburant)
      DO UPDATE SET
        taux_cents = EXCLUDED.taux_cents,
        description = EXCLUDED.description,
        reference_legale = COALESCE(EXCLUDED.reference_legale, ticpe_taux.reference_legale)
      RETURNING *
      `,
      [Number(annee), String(carburant), Number(taux_cents), description || null, reference_legale || null]
    );
    res.json({ ok: true, data: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/taux/:id', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const body = req.body || {};
    const { annee, carburant, taux_cents, description, reference_legale } = body;
    const q = await pool.query(
      `
      UPDATE ticpe_taux
      SET annee = $2, carburant = $3, taux_cents = $4, description = $5,
          reference_legale = CASE WHEN $6 THEN $7::text ELSE ticpe_taux.reference_legale END
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        Number(annee),
        String(carburant),
        Number(taux_cents),
        description || null,
        Object.prototype.hasOwnProperty.call(body, 'reference_legale'),
        reference_legale == null ? null : String(reference_legale),
      ]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Taux introuvable' });
    res.json({ ok: true, data: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/taux/:id', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const q = await pool.query(`DELETE FROM ticpe_taux WHERE id = $1`, [id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Taux introuvable' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Véhicules éligibles ────────────────────────────────────────────────────────
router.get('/vehicules', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const filiale = req.query.filiale ? String(req.query.filiale) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const conds = [];
    const vals = [];
    let i = 1;
    if (filiale && filiale !== 'Toutes') {
      conds.push(`filiale = $${i++}`);
      vals.push(filiale);
    }
    if (type && type !== 'Tous') {
      conds.push(`type_vehicule = $${i++}`);
      vals.push(type);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const q = await pool.query(
      `SELECT * FROM ticpe_vehicules_eligibles ${where} ORDER BY immatriculation ASC`,
      vals
    );
    const stats = {
      total: q.rows.length,
      eligibles: q.rows.filter((r) => r.eligible).length,
    };
    res.json({ data: q.rows, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/vehicules/sync', async (req, res) => {
  let sf = null;
  try {
    if (!requirePool(res)) return;
    sf = await withSalesforce('production');
    const query = `
      SELECT Id, Name, IO_Actif__c, Type__c, Filiale_Porteuse_Vehicule__c
      FROM Vehicule_Flotte__c
    `;
    const result = await sf.conn.query(query);
    const rows = result.records || [];
    let upserted = 0;
    for (const r of rows) {
      const t = String(r.Type__c || '').trim();
      const eligibleDefault = ['Tracteur', 'Véhicule de Livraison'].includes(t);
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `
        INSERT INTO ticpe_vehicules_eligibles (
          vehicule_sf_id, immatriculation, filiale, type_vehicule, eligible, actif_salesforce, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT (vehicule_sf_id)
        DO UPDATE SET
          immatriculation = EXCLUDED.immatriculation,
          filiale = EXCLUDED.filiale,
          type_vehicule = EXCLUDED.type_vehicule,
          actif_salesforce = EXCLUDED.actif_salesforce,
          eligible = COALESCE(ticpe_vehicules_eligibles.eligible, EXCLUDED.eligible),
          updated_at = NOW()
        `,
        [
          String(r.Id),
          String(r.Name || ''),
          r.Filiale_Porteuse_Vehicule__c || null,
          t || null,
          eligibleDefault,
          Boolean(r.IO_Actif__c),
        ]
      );
      upserted += 1;
    }
    res.json({ ok: true, upserted, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (sf) sf.disconnect();
  }
});

router.patch('/vehicules/:id', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const { eligible, date_debut_eligibilite, date_fin_eligibilite, notes } = req.body || {};
    const q = await pool.query(
      `
      UPDATE ticpe_vehicules_eligibles
      SET eligible = COALESCE($2, eligible),
          date_debut_eligibilite = $3,
          date_fin_eligibilite = $4,
          notes = $5,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, eligible, date_debut_eligibilite || null, date_fin_eligibilite || null, notes || null]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Véhicule introuvable' });
    res.json({ ok: true, data: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Calcul TICPE ────────────────────────────────────────────────────────────────
router.post('/calculer', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const {
      periode_debut,
      periode_fin,
      periodicite,
      filiale,
      fournisseurs = [],
      annee_taux,
      vehicule_sf_ids,
    } = req.body || {};
    if (!periode_debut || !periode_fin || !annee_taux) {
      return res.status(400).json({ error: 'periode_debut, periode_fin, annee_taux requis' });
    }
    const payload = await buildCalculPayload({
      periode_debut,
      periode_fin,
      periodicite,
      filiale,
      fournisseurs,
      annee_taux,
      vehicule_sf_ids,
    });
    res.json(payload);
  } catch (e) {
    const code = e.statusCode === 400 ? 400 : 500;
    res.status(code).json({ error: e.message });
  }
});

// ── Détail par mois (par véhicule) ─────────────────────────────────────────────
async function runDetailMois(req, res) {
  let sf = null;
  try {
    if (!requirePool(res)) return;
    const src = req.method === 'POST' ? req.body || {} : req.query;
    const debut = src.debut ? String(src.debut) : '';
    const fin = src.fin ? String(src.fin) : '';
    const vehiculeSfIds =
      req.method === 'POST' && Array.isArray(src.vehicules)
        ? src.vehicules.map((v) => String(v).trim()).filter(Boolean)
        : parseVehiculesQueryParam(src.vehicules);
    const fournisseurs =
      req.method === 'POST' && Array.isArray(src.fournisseurs)
        ? src.fournisseurs.map(String)
        : parseFournisseursQueryParam(src.fournisseurs);
    const annee_taux =
      src.annee_taux != null && String(src.annee_taux) !== '' ? src.annee_taux : null;

    if (!debut || !fin || !vehiculeSfIds.length) {
      return res.status(400).json({ error: 'debut, fin et vehicules (liste d’ids SF) requis' });
    }

    sf = await withSalesforce('production');
    const payload = await calculerDetailMois(
      debut,
      fin,
      vehiculeSfIds,
      fournisseurs,
      annee_taux,
      sf.conn
    );
    res.json(payload);
  } catch (e) {
    const code = e.statusCode === 400 ? 400 : 500;
    res.status(code).json({ error: e.message });
  } finally {
    if (sf) sf.disconnect();
  }
}

router.get('/detail-mois', runDetailMois);
router.post('/detail-mois', runDetailMois);

router.post('/detail-mois/export-excel', async (req, res) => {
  let sf = null;
  try {
    if (!requirePool(res)) return;
    const body = req.body || {};
    const debut = String(body.debut || '');
    const fin = String(body.fin || '');
    const vehiculeSfIds = Array.isArray(body.vehicules)
      ? body.vehicules.map((v) => String(v).trim()).filter(Boolean)
      : parseVehiculesQueryParam(body.vehicules);
    const fournisseurs = Array.isArray(body.fournisseurs) ? body.fournisseurs : null;
    const annee_taux = body.annee_taux != null ? body.annee_taux : null;

    if (!debut || !fin || !vehiculeSfIds.length) {
      return res.status(400).json({ error: 'debut, fin et vehicules requis' });
    }

    sf = await withSalesforce('production');
    const payload = await calculerDetailMois(
      debut,
      fin,
      vehiculeSfIds,
      fournisseurs,
      annee_taux,
      sf.conn
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Détail mois');
    ws.addRow([
      'Mois',
      'Immatriculation',
      '1er kilométrage',
      'Dernier kilométrage',
      'Km parcourus',
      'Volume total (L)',
      'L/100 km',
      'Remboursement (€)',
    ]);
    for (const L of payload.lignes) {
      ws.addRow([
        payload.mois_label,
        L.immatriculation,
        L.premier_km != null ? L.premier_km : '',
        L.dernier_km != null ? L.dernier_km : '',
        L.km_parcourus != null ? L.km_parcourus : '',
        Number(L.volume_total.toFixed(2)),
        L.consommation_l100 != null ? Number(L.consommation_l100.toFixed(1)) : 'N/A',
        Number(L.remboursement.toFixed(2)),
      ]);
    }
    ws.addRow([]);
    ws.addRow([
      'Totaux',
      '',
      '',
      '',
      '',
      Number(payload.totaux.volume_total.toFixed(2)),
      payload.totaux.conso_moyenne_ponderee != null
        ? Number(payload.totaux.conso_moyenne_ponderee.toFixed(1))
        : 'N/A',
      Number(payload.totaux.remboursement_total.toFixed(2)),
    ]);

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticpe_detail_mois_${debut}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (e) {
    const code = e.statusCode === 400 ? 400 : 500;
    res.status(code).json({ error: e.message });
  } finally {
    if (sf) sf.disconnect();
  }
});

router.post('/export/complet', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const body = req.body || {};
    const {
      periode_debut,
      periode_fin,
      periodicite,
      filiale,
      fournisseurs = [],
      annee_taux,
      vehicule_sf_ids,
      format = 'excel',
    } = body;
    if (!periode_debut || !periode_fin || !annee_taux) {
      return res.status(400).json({ error: 'periode_debut, periode_fin, annee_taux requis' });
    }

    const calcul = await buildCalculPayload({
      periode_debut,
      periode_fin,
      periodicite,
      filiale,
      fournisseurs,
      annee_taux,
      vehicule_sf_ids,
    });

    let sf = null;
    try {
      sf = await withSalesforce('production');
      const detailsParMois = [];
      for (const m of calcul.par_mois || []) {
        const { debut, fin } = monthBoundsFromKey(m.mois);
        // eslint-disable-next-line no-await-in-loop
        const detail = await calculerDetailMois(
          debut,
          fin,
          calcul.vehicule_sf_ids_utilises || [],
          fournisseurs,
          annee_taux,
          sf.conn
        );
        detailsParMois.push({
          mois: m.mois,
          mois_label: m.mois_label,
          resume: m,
          detail,
        });
      }

      if (String(format).toLowerCase() === 'pdf') {
        const societeLabel = body.societe_label ? String(body.societe_label) : 'Toutes societes';
        const periodeLabel = formatPeriodeLabel(periode_debut, periode_fin);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="TICPE_complet_${periode_debut}.pdf"`);
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true });
        doc.pipe(res);

        // Page 1 - Garde
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_COLORS.primary);
        doc.roundedRect(40, 30, 227, 85, 8).fill(PDF_COLORS.white);
        doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(18).text('HOLDING G2L', 62, 62);
        doc.moveTo(90, 180).lineTo(doc.page.width - 90, 180).lineWidth(2).strokeColor(PDF_COLORS.white).stroke();
        doc.fillColor(PDF_COLORS.white).font('Helvetica-Bold').fontSize(32).text('DECLARATION TICPE', 40, 194, { align: 'center', width: doc.page.width - 80 });
        doc.fillColor(PDF_COLORS.white).font('Helvetica').fontSize(12).text(
          sanitize('Remboursement Partiel de Taxe Interieure de Consommation sur les Produits Energetiques'),
          130,
          248,
          { align: 'center', width: doc.page.width - 260 }
        );
        doc.moveTo(90, 290).lineTo(doc.page.width - 90, 290).lineWidth(2).strokeColor(PDF_COLORS.white).stroke();
        doc.save();
        doc.fillOpacity(0.93).roundedRect(165, 312, doc.page.width - 330, 165, 10).fill(PDF_COLORS.white);
        doc.restore();
        const infos = [
          [sanitize('Periode'), safeText(periodeLabel)],
          [sanitize('Societe'), safeText(societeLabel || 'Toutes societes')],
          [sanitize('Taux applique'), `${formatNumber(calcul.taux_cents, 2)} c€/L`],
          [sanitize('Genere le'), safeText(new Date().toISOString().slice(0, 10).split('-').reverse().join('/'))],
        ];
        let infoY = 340;
        for (const [k, v] of infos) {
          doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(11).text(k, 190, infoY, { width: 160 });
          doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(11).text(v, 360, infoY, { width: 300 });
          infoY += 34;
        }
        doc.fillColor(PDF_COLORS.white).font('Helvetica').fontSize(10).text('PL > 7,5T - Transport routier de marchandises', 40, doc.page.height - 62, { align: 'center', width: doc.page.width - 80 });
        doc.fillColor(PDF_COLORS.white).font('Helvetica').fontSize(9).text('Document confidentiel - Usage interne', 40, doc.page.height - 44, { align: 'center', width: doc.page.width - 80 });

        // Page 2 - Resume executif
        const headerTitle = `TICPE ${periodeLabel}`;
        doc.addPage();
        drawPageHeader(doc, headerTitle, '');
        doc.y = 54;
        drawSectionTitle(doc, 'RESUME EXECUTIF');
        const cardY = doc.y;
        const cardW = 180;
        const cardH = 82;
        const gap = 14;
        const cards = [
          { label: 'Volume total', value: formatLitres(calcul.total_litres, 0) },
          { label: 'Remboursement estime', value: formatEuros(calcul.total_remboursement, 0) },
          { label: 'Vehicules inclus', value: formatNumber(calcul.nb_vehicules, 0) },
          { label: 'Transactions', value: formatNumber(calcul.nb_transactions, 0) },
        ];
        for (let i = 0; i < cards.length; i += 1) {
          const x = 40 + i * (cardW + gap);
          doc.roundedRect(x, cardY, cardW, cardH, 6).fillAndStroke(PDF_COLORS.accent, PDF_COLORS.secondary);
          doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(sanitize(cards[i].label), x + 8, cardY + 10, { width: cardW - 16, align: 'center' });
          doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(18).text(cards[i].value, x + 8, cardY + 38, { width: cardW - 16, align: 'center' });
        }
        let y = cardY + cardH + 22;
        const colsResume = ['Mois', 'Nb vehicules', 'Km parcourus', 'Volume (L)', 'Remboursement (€)'];
        const wResume = [140, 70, 100, 100, 100];
        y = drawTableHeader(doc, colsResume, wResume, y);
        let sumKm = 0;
        let hasKm = false;
        let sumNbVeh = 0;
        for (let i = 0; i < (calcul.par_mois || []).length; i += 1) {
          const r = calcul.par_mois[i];
          sumNbVeh += toNum(r.nb_vehicules, 0);
          if (r.km_parcourus != null) {
            sumKm += toNum(r.km_parcourus, 0);
            hasKm = true;
          }
          y = drawTableRow(doc, [
            safeText(r.mois_label || r.mois),
            formatNumber(r.nb_vehicules, 0),
            r.km_parcourus != null ? formatKm(r.km_parcourus) : 'N/A',
            formatLitres(r.litres, 0),
            formatEuros(r.remboursement, 0),
          ], wResume, y, i % 2 === 1, false);
        }
        drawTableRow(doc, [
          'TOTAL',
          formatNumber(sumNbVeh, 0),
          hasKm ? formatKm(sumKm) : 'N/A',
          formatLitres(calcul.total_litres, 0),
          formatEuros(calcul.total_remboursement, 0),
        ], wResume, y, false, true);

        // Page 3 - Synthese
        doc.addPage();
        drawPageHeader(doc, headerTitle, '');
        doc.y = 54;
        drawSectionTitle(doc, 'SYNTHESE PAR VEHICULE — PERIODE COMPLETE');
        doc.fillColor('#475569').font('Helvetica').fontSize(10).text(`Periode: ${safeText(periodeLabel)} | Taux: ${formatNumber(calcul.taux_cents, 2)} c€/L`);
        let ySynth = doc.y + 8;
        const colsS = ['Immatriculation', 'Type', 'Filiale', 'Nb mois', 'Km parcourus', 'Litres', 'L/100', 'Remboursement'];
        const wS = [80, 70, 110, 55, 85, 85, 65, 85];
        ySynth = drawTableHeader(doc, colsS, wS, ySynth);
        for (let i = 0; i < (calcul.par_vehicule || []).length; i += 1) {
          const r = calcul.par_vehicule[i];
          if (ySynth > doc.page.height - 78) break;
          ySynth = drawTableRow(doc, [
            safeText(r.immatriculation || '—'),
            safeText(r.type_vehicule || '—'),
            safeText(r.filiale || '—'),
            formatNumber(r.nb_mois, 0),
            r.km_parcourus != null ? formatKm(r.km_parcourus) : 'N/A',
            formatLitres(r.volume_total, 0),
            r.conso_l100 != null ? formatNumber(r.conso_l100, 1) : 'N/A',
            formatEuros(r.remboursement, 0),
          ], wS, ySynth, i % 2 === 1, false);
        }
        drawTableRow(doc, [
          'TOTAL', '', '', '',
          formatKm(calcul.totaux_par_vehicule.km_parcourus_total),
          formatLitres(calcul.totaux_par_vehicule.volume_total, 0),
          calcul.totaux_par_vehicule.conso_moyenne_l100 != null ? formatNumber(calcul.totaux_par_vehicule.conso_moyenne_l100, 1) : 'N/A',
          formatEuros(calcul.totaux_par_vehicule.remboursement_total, 0),
        ], wS, ySynth, false, true);

        // Pages suivantes - Detail par mois
        for (const bloc of detailsParMois) {
          doc.addPage();
          drawPageHeader(doc, headerTitle, '');
          doc.y = 54;
          doc.fillColor(PDF_COLORS.primary).font('Helvetica-Bold').fontSize(14).text(safeText((bloc.mois_label || '').toUpperCase()));
          doc.fillColor('#475569').font('Helvetica').fontSize(10).text(
            `${formatNumber(bloc.resume.nb_vehicules, 0)} vehicules | ${formatLitres(bloc.resume.litres, 0)} | ${formatEuros(bloc.resume.remboursement, 0)} de remboursement estime`
          );
          let yMonth = doc.y + 8;
          const cols = ['Immatriculation', 'Type', '1er km', 'Der km', 'Km', 'Litres', 'L/100', 'Rembours.'];
          const widths = [80, 70, 80, 80, 80, 80, 65, 80];
          yMonth = drawTableHeader(doc, cols, widths, yMonth);
          let kmTotalMois = 0;
          let hasKmMois = false;
          for (let i = 0; i < (bloc.detail.lignes || []).length; i += 1) {
            const r = bloc.detail.lignes[i];
            const typeVeh = calcul.par_vehicule.find((pv) => pv.immatriculation === r.immatriculation)?.type_vehicule || '—';
            if (r.km_parcourus != null) {
              kmTotalMois += toNum(r.km_parcourus, 0);
              hasKmMois = true;
            }
            if (yMonth > doc.page.height - 72) {
              doc.addPage();
              drawPageHeader(doc, headerTitle, '');
              yMonth = 54;
              yMonth = drawTableHeader(doc, cols, widths, yMonth);
            }
            yMonth = drawTableRow(doc, [
              safeText(r.immatriculation || '—'),
              safeText(typeVeh),
              r.premier_km != null ? formatNumber(r.premier_km, 0) : 'N/A',
              r.dernier_km != null ? formatNumber(r.dernier_km, 0) : 'N/A',
              r.km_parcourus != null ? formatKm(r.km_parcourus) : 'N/A',
              formatLitres(r.volume_total, 2),
              r.consommation_l100 != null ? formatNumber(r.consommation_l100, 1) : 'N/A',
              formatEuros(r.remboursement, 2),
            ], widths, yMonth, i % 2 === 1, false);
          }
          drawTableRow(doc, [
            'TOTAL', '', '', '',
            hasKmMois ? formatKm(kmTotalMois) : 'N/A',
            formatLitres(bloc.detail.totaux.volume_total, 2),
            bloc.detail.totaux.conso_moyenne_ponderee != null ? formatNumber(bloc.detail.totaux.conso_moyenne_ponderee, 1) : 'N/A',
            formatEuros(bloc.detail.totaux.remboursement_total, 2),
          ], widths, yMonth, false, true);
        }

        // Derniere page - Mention legale
        doc.addPage();
        drawPageHeader(doc, headerTitle, '');
        doc.y = 80;
        drawSectionTitle(doc, 'MENTION LEGALE');
        const legalY = doc.y + 12;
        doc.roundedRect(60, legalY, doc.page.width - 120, 110, 6).fill(PDF_COLORS.grayLight);
        doc.rect(60, legalY, 3, 110).fill(PDF_COLORS.secondary);
        doc.fillColor(PDF_COLORS.text).font('Helvetica').fontSize(10).text(
          safeText(`Ce document est etabli sur la base des transactions de carburant enregistrees dans le systeme d'information. Le remboursement TICPE est calcule conformement aux dispositions de l'article 265 septies du Code des douanes. Taux applique : ${formatNumber(calcul.taux_cents, 2)} c€/L pour les vehicules de transport routier de marchandises de plus de 7,5 tonnes.`),
          74,
          legalY + 18,
          { width: doc.page.width - 150, align: 'left' }
        );

        // Page X / Y sur pages hors couverture
        const range = doc.bufferedPageRange();
        const totalPages = range.count;
        for (let i = range.start; i < range.start + totalPages; i += 1) {
          if (i === 0) continue;
          doc.switchToPage(i);
          drawPageHeader(doc, headerTitle, `Page ${i + 1} / ${totalPages}`);
        }
        doc.end();
        return;
      }

      const wb = new ExcelJS.Workbook();
      const ws1 = wb.addWorksheet('Résumé');
      ws1.addRow(['Société', filiale || 'Toutes']);
      ws1.addRow(['Période', `${periode_debut} -> ${periode_fin}`]);
      ws1.addRow(['Taux appliqué', `${toNum(calcul.taux_cents).toFixed(2)} c€/L`]);
      ws1.addRow(['Date de calcul', new Date().toLocaleString('fr-FR')]);
      ws1.addRow([]);
      ws1.addRow(['Total litres', toNum(calcul.total_litres)]);
      ws1.addRow(['Remboursement total', toNum(calcul.total_remboursement)]);
      ws1.addRow(['Nb transactions', toNum(calcul.nb_transactions)]);
      ws1.addRow(['Nb véhicules', toNum(calcul.nb_vehicules)]);
      ws1.addRow([]);
      ws1.addRow(['Mois', 'Nb véhicules', 'Km parcourus', 'Litres', 'Remboursement']);
      for (const m of calcul.par_mois || []) {
        ws1.addRow([m.mois_label || m.mois, toNum(m.nb_vehicules), m.km_parcourus ?? 'N/A', toNum(m.litres), toNum(m.remboursement)]);
      }

      const ws2 = wb.addWorksheet('Détail complet');
      for (const bloc of detailsParMois) {
        const titleRow = ws2.addRow([`=== ${bloc.mois_label} ===`]);
        titleRow.font = { bold: true };
        titleRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDDEBFF' },
        };
        ws2.addRow([
          `${toNum(bloc.resume.nb_vehicules, 0)} véhicules | ${toNum(bloc.resume.litres).toFixed(3)} litres | ${toNum(
            bloc.resume.remboursement
          ).toFixed(2)}€ de remboursement`,
        ]);
        ws2.addRow(['Immatriculation', 'Type', '1er km', 'Dernier km', 'Km parcourus', 'Litres', 'L/100km', 'Remboursement']);
        for (const r of bloc.detail.lignes || []) {
          const typeVeh = calcul.par_vehicule.find((pv) => pv.immatriculation === r.immatriculation)?.type_vehicule || '—';
          ws2.addRow([
            r.immatriculation || '',
            typeVeh,
            r.premier_km ?? '',
            r.dernier_km ?? '',
            r.km_parcourus ?? '',
            Number(toNum(r.volume_total).toFixed(2)),
            r.consommation_l100 != null ? Number(toNum(r.consommation_l100).toFixed(1)) : 'N/A',
            Number(toNum(r.remboursement).toFixed(2)),
          ]);
        }
        const totalRow = ws2.addRow([
          'Total',
          '',
          '',
          '',
          '',
          Number(toNum(bloc.detail.totaux.volume_total).toFixed(2)),
          bloc.detail.totaux.conso_moyenne_ponderee != null
            ? Number(toNum(bloc.detail.totaux.conso_moyenne_ponderee).toFixed(1))
            : 'N/A',
          Number(toNum(bloc.detail.totaux.remboursement_total).toFixed(2)),
        ]);
        totalRow.font = { bold: true };
        ws2.addRow([]);
      }

      const ws3 = wb.addWorksheet('Synthèse véhicules');
      ws3.addRow(['Immatriculation', 'Type', 'Filiale', 'Nb mois', '1er km', 'Dernier km', 'Km parcourus', 'Litres', 'L/100km', 'Remboursement']);
      for (const r of calcul.par_vehicule || []) {
        ws3.addRow([
          r.immatriculation || '',
          r.type_vehicule || '',
          r.filiale || '',
          toNum(r.nb_mois),
          r.premier_km ?? '',
          r.dernier_km ?? '',
          r.km_parcourus ?? '',
          Number(toNum(r.volume_total).toFixed(2)),
          r.conso_l100 != null ? Number(toNum(r.conso_l100).toFixed(1)) : 'N/A',
          Number(toNum(r.remboursement).toFixed(2)),
        ]);
      }
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="TICPE_complet_${periode_debut}.xlsx"`
      );
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('[TICPE Export complet] Erreur:', err.message, err.stack);
      return res.status(500).json({ error: err.message, stack: err.stack });
    } finally {
      if (sf) sf.disconnect();
    }
  } catch (e) {
    const code = e.statusCode === 400 ? 400 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.post('/calculer/export-par-vehicule-excel', async (req, res) => {
  try {
    const { periode_debut, periode_fin, par_vehicule, totaux_par_vehicule } = req.body || {};
    const rows = Array.isArray(par_vehicule) ? par_vehicule : [];
    const totals = totaux_par_vehicule || {};
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Synthèse véhicule');
    ws.addRow(['Période', `${periode_debut || ''} -> ${periode_fin || ''}`]);
    ws.addRow([]);
    ws.addRow([
      'Immatriculation',
      'Type',
      'Filiale',
      'Nb mois actifs',
      '1er kilométrage',
      'Dernier kilométrage',
      'Km parcourus total',
      'Volume total (L)',
      'Consommation moy. (L/100km)',
      'Remboursement (€)',
    ]);
    for (const r of rows) {
      ws.addRow([
        r.immatriculation || '',
        r.type_vehicule || '',
        r.filiale || '',
        toNum(r.nb_mois, 0),
        r.premier_km != null ? r.premier_km : '',
        r.dernier_km != null ? r.dernier_km : '',
        r.km_parcourus != null ? r.km_parcourus : '',
        Number(toNum(r.volume_total, 0).toFixed(2)),
        r.conso_l100 != null ? Number(toNum(r.conso_l100, 0).toFixed(1)) : 'N/A',
        Number(toNum(r.remboursement, 0).toFixed(2)),
      ]);
    }
    ws.addRow([]);
    ws.addRow([
      'Totaux',
      '',
      '',
      '',
      '',
      Number(toNum(totals.km_parcourus_total, 0).toFixed(0)),
      Number(toNum(totals.volume_total, 0).toFixed(2)),
      totals.conso_moyenne_l100 != null ? Number(toNum(totals.conso_moyenne_l100, 0).toFixed(1)) : 'N/A',
      Number(toNum(totals.remboursement_total, 0).toFixed(2)),
    ]);
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticpe_synthese_vehicule_${periode_debut || 'periode'}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Déclarations ────────────────────────────────────────────────────────────────
router.get('/declarations', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const q = await pool.query(`SELECT * FROM ticpe_declarations ORDER BY created_at DESC, id DESC`);
    res.json({ data: q.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/declarations', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const body = req.body || {};
    const reference = body.reference || makeReference(body.periodicite, body.periode_debut, body.filiale);
    const q = await pool.query(
      `
      INSERT INTO ticpe_declarations (
        reference, periode_debut, periode_fin, periodicite, filiale, statut,
        total_litres, total_remboursement, taux_applique, nb_transactions, nb_vehicules, updated_at
      ) VALUES ($1,$2::date,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      RETURNING *
      `,
      [
        reference,
        body.periode_debut,
        body.periode_fin,
        body.periodicite,
        body.filiale || null,
        body.statut || 'brouillon',
        toNum(body.total_litres, 0),
        toNum(body.total_remboursement, 0),
        toNum(body.taux_cents, 0),
        toNum(body.nb_transactions, 0),
        toNum(body.nb_vehicules, 0),
      ]
    );
    if (body.calcul) {
      declarationDetailsCache.set(String(q.rows[0].id), body.calcul);
    }
    res.status(201).json({ ok: true, data: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/declarations/:id', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const q = await pool.query(`SELECT * FROM ticpe_declarations WHERE id = $1`, [id]);
    if (!q.rows.length) return res.status(404).json({ error: 'Déclaration introuvable' });
    res.json({ data: q.rows[0], calcul: declarationDetailsCache.get(String(id)) || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/declarations/:id/statut', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const statut = String(req.body?.statut || '').trim();
    if (!['brouillon', 'validee', 'soumise'].includes(statut)) {
      return res.status(400).json({ error: 'statut invalide' });
    }
    const q = await pool.query(
      `UPDATE ticpe_declarations SET statut = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, statut]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Déclaration introuvable' });
    res.json({ ok: true, data: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Export ──────────────────────────────────────────────────────────────────────
router.get('/declarations/:id/export/excel', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const q = await pool.query(`SELECT * FROM ticpe_declarations WHERE id = $1`, [id]);
    if (!q.rows.length) return res.status(404).json({ error: 'Déclaration introuvable' });
    const d = q.rows[0];
    const calc = declarationDetailsCache.get(String(id)) || {};

    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('Résumé');
    ws1.addRow(['Société', d.filiale || 'Toutes']);
    ws1.addRow(['Période', `${d.periode_debut} -> ${d.periode_fin}`]);
    ws1.addRow(['Taux appliqué', `${toNum(d.taux_applique, 0).toFixed(2)} c€/L`]);
    ws1.addRow(['Date de calcul', new Date().toLocaleString('fr-FR')]);
    ws1.addRow([]);
    ws1.addRow(['Total litres', toNum(d.total_litres, 0)]);
    ws1.addRow(['Remboursement estimé', toNum(d.total_remboursement, 0)]);
    ws1.addRow(['Nb transactions', toNum(d.nb_transactions, 0)]);
    ws1.addRow(['Nb véhicules', toNum(d.nb_vehicules, 0)]);
    ws1.addRow([]);
    ws1.addRow(['Par fournisseur']);
    ws1.addRow(['Fournisseur', 'Litres', 'Remboursement', 'Nb transactions']);
    for (const r of calc.par_fournisseur || []) {
      ws1.addRow([r.fournisseur, toNum(r.litres, 0), toNum(r.remboursement, 0), toNum(r.nb_tx, 0)]);
    }
    ws1.addRow([]);
    ws1.addRow(['Par société']);
    ws1.addRow(['Société', 'Litres', 'Remboursement', 'Nb transactions']);
    for (const r of calc.par_filiale || []) {
      ws1.addRow([r.filiale, toNum(r.litres, 0), toNum(r.remboursement, 0), toNum(r.nb_tx, 0)]);
    }

    const ws2 = wb.addWorksheet('Détail transactions');
    ws2.addRow([
      'Code transaction',
      'Date',
      'Immatriculation',
      'Filiale',
      'Fournisseur',
      'Litres',
      'Montant HT',
      'Remboursement unitaire',
    ]);
    for (const t of calc.transactions || []) {
      ws2.addRow([
        t.code,
        t.date,
        t.immatriculation,
        t.filiale,
        t.fournisseur,
        toNum(t.litres, 0),
        toNum(t.montant_ht, 0),
        toNum(t.remboursement_unitaire, 0),
      ]);
    }

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticpe_declaration_${id}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/declarations/:id/export/pdf', async (req, res) => {
  try {
    if (!requirePool(res)) return;
    const id = Number(req.params.id);
    const q = await pool.query(`SELECT * FROM ticpe_declarations WHERE id = $1`, [id]);
    if (!q.rows.length) return res.status(404).json({ error: 'Déclaration introuvable' });
    const d = q.rows[0];
    const calc = declarationDetailsCache.get(String(id)) || {};

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticpe_declaration_${id}.pdf"`);
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(20).text('G2L - Declaration TICPE');
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Periode: ${d.periode_debut} -> ${d.periode_fin}`);
    doc.text(`Societe: ${d.filiale || 'Toutes'}`);
    doc.text(`Statut: ${d.statut}`);
    doc.moveDown();
    doc.text(`Total litres: ${toNum(d.total_litres, 0).toFixed(3)}`);
    doc.text(`Remboursement estime: ${toNum(d.total_remboursement, 0).toFixed(2)} EUR`);
    doc.text(`Transactions: ${toNum(d.nb_transactions, 0)} | Vehicules: ${toNum(d.nb_vehicules, 0)}`);
    doc.moveDown();
    doc.text('Tableau recapitulatif par fournisseur', { underline: true });
    for (const r of calc.par_fournisseur || []) {
      doc.text(
        `- ${r.fournisseur}: ${toNum(r.litres, 0).toFixed(3)} L | ${toNum(
          r.remboursement,
          0
        ).toFixed(2)} EUR | ${toNum(r.nb_tx, 0)} tx`
      );
    }
    doc.moveDown();
    doc.text('Tableau recapitulatif par mois', { underline: true });
    for (const r of calc.par_mois || []) {
      doc.text(`- ${r.mois}: ${toNum(r.litres, 0).toFixed(3)} L | ${toNum(r.remboursement, 0).toFixed(2)} EUR`);
    }
    doc.moveDown();
    doc.fontSize(10).text('Remboursement partiel TICPE - PL > 7,5T');
    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
