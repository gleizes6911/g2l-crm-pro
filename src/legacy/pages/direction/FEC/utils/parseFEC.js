import { PAL } from './constants'

/** Retire les mots génériques (écriture / compte) pour le libellé client court */
function stripGenericTokens(s) {
  let t = String(s || '')
  const patterns = [
    /\bDIVERS\b/gi,
    /\bPREST\.?\b/gi,
    /\bSERVICES\b/gi,
    /\bPRESTATIONS\b/gi,
    /\bREFACT\.?\b/gi,
    /\bVENTES\b/gi,
    /\bPRODUITS\b/gi,
    /\bFACTURE\b/gi,
  ]
  for (const re of patterns) t = t.replace(re, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

function normalizeClientGroupKey(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Comptes CA clients : 706–709 uniquement (hors TVA 445, financiers 771/775/777, 758, etc.) */
function isClientCaCompte(cp) {
  const c = String(cp || '')
  return c.startsWith('706') || c.startsWith('707') || c.startsWith('708') || c.startsWith('709')
}

const PARASITE_NAME_SUBSTR = [
  'TVA',
  'LETTRAGE',
  'PAS A IMPUTER',
  'REGULARISATION',
  'SOLDE',
  'REPORT',
  'AVOIR',
  'REMISE GLOBALE',
]

const MONTH_YEAR_NAME_RE = /^(JANVIER|FEVRIER|FÉVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOÛT|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE)\s+\d{4}$/i

function isParasiteClientName(display) {
  const t = String(display || '').trim()
  if (t.length < 3) return true
  const u = t.toUpperCase()
  for (const b of PARASITE_NAME_SUBSTR) {
    if (u.includes(b)) return true
  }
  if (/^(M\.|MME\.|M ET MME|MME ET M)\s/i.test(t) || /^(M\.|MME\.|M ET MME|MME ET M)$/i.test(t)) return true
  if (MONTH_YEAR_NAME_RE.test(t)) return true
  return false
}

/** Premier token « significatif » (longueur ≥ 2 pour laisser passer codes courts type DPD en G3) */
function extractFirstSignificantWord(displayNom) {
  const parts = String(displayNom || '').trim().split(/\s+/).filter(Boolean)
  for (const p of parts) {
    const w = p.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '')
    if (w.length >= 2) return w
  }
  return parts[0] || String(displayNom || '').trim()
}

/**
 * Clé de fusion : même premier mot ≥ 5 car. → un client ; 3–4 car. → fusion entre homonymes (ex. DPD) ;
 * sinon pas de fusion inter-libellés.
 */
function mergeGroupKeyForBucket(displayNom, keyNorm) {
  const fw = extractFirstSignificantWord(displayNom)
  const n = normalizeClientGroupKey(fw).replace(/\s+/g, '')
  if (fw.length >= 5) return `G5:${n}`
  if (fw.length >= 3) return `G3:${n}`
  return `SOLO:${keyNorm}`
}

function mergeClientBuckets(rawBuckets) {
  const groups = {}
  for (const kn of Object.keys(rawBuckets)) {
    const b = rawBuckets[kn]
    const mgk = mergeGroupKeyForBucket(b.displayNom, kn)
    if (!groups[mgk]) {
      groups[mgk] = {
        displayNom: b.displayNom,
        brut: 0,
        avoirs: 0,
        men: {},
        compteNums: new Set(),
        libByCp: {},
      }
    }
    const g = groups[mgk]
    g.brut += b.brut
    g.avoirs += b.avoirs
    for (const mk of Object.keys(b.men)) {
      g.men[mk] = (g.men[mk] || 0) + b.men[mk]
    }
    b.compteNums.forEach((cp) => g.compteNums.add(cp))
    Object.assign(g.libByCp, b.libByCp)
    if (String(b.displayNom).trim().length < String(g.displayNom).trim().length) g.displayNom = b.displayNom
  }
  const merged = {}
  for (const g of Object.values(groups)) {
    const fk = normalizeClientGroupKey(g.displayNom)
    if (!merged[fk]) {
      merged[fk] = { ...g, compteNums: new Set(g.compteNums) }
    } else {
      const t = merged[fk]
      t.brut += g.brut
      t.avoirs += g.avoirs
      for (const mk of Object.keys(g.men)) {
        t.men[mk] = (t.men[mk] || 0) + g.men[mk]
      }
      g.compteNums.forEach((cp) => t.compteNums.add(cp))
      Object.assign(t.libByCp, g.libByCp)
      if (String(g.displayNom).trim().length < String(t.displayNom).trim().length) t.displayNom = g.displayNom
    }
  }
  return merged
}

/**
 * Priorité : CompAuxLib → EcritureLib nettoyé → CompteLib nettoyé.
 * Clé de regroupement = nom normalisé (plusieurs comptes 7xx peuvent fusionner).
 */
function resolveClientFromRow(r) {
  const cp = String(r.CompteNum || '')
  const aux = (r.CompAuxLib || '').trim()
  if (aux) return { keyNorm: normalizeClientGroupKey(aux), display: aux, source: 'aux' }
  const el = stripGenericTokens(r.EcritureLib || '').trim()
  if (el) return { keyNorm: normalizeClientGroupKey(el), display: el, source: 'ecriture' }
  const clib = stripGenericTokens(r.CompteLib || '').trim()
  const disp = clib || cp
  if (disp) return { keyNorm: normalizeClientGroupKey(disp), display: disp, source: 'compte' }
  return { keyNorm: `__CP_${cp}`, display: cp || '?', source: 'compte' }
}

/**
 * Agrège les indicateurs FEC à partir des lignes déjà parsées (ré-import, changement d'exercice, consolidation).
 */
export function analyzeFecRows(rows, name, year, meta = {}) {
  const pn = (s) => parseFloat((s || '0').replace(',', '.')) || 0;
  const jPaie = rows.some(r => r.JournalCode === 'ODSA') ? 'ODSA' : rows.some(r => r.JournalCode === 'ODS') ? 'ODS' : null;
  const byCp = {}, byJ = {}, byM = {}, fourn = {};
  const clientBuckets = {};
  rows.forEach(r => {
    const d = pn(r.Debit), c = pn(r.Credit), cp = r.CompteNum || '', r1 = cp[0] || '?', m = (r.EcritureDate || '').slice(0, 6), j = r.JournalCode || '';
    if (!byCp[cp]) byCp[cp] = { lib: r.CompteLib || '', debit: 0, credit: 0 }; byCp[cp].debit += d; byCp[cp].credit += c;
    if (!byJ[j]) byJ[j] = { lib: r.JournalLib || '', l: 0, d: 0, c: 0 }; byJ[j].l++; byJ[j].d += d; byJ[j].c += c;
    if (!byM[m]) byM[m] = { ca: 0, ch: 0 };
    if (r1 === '7') byM[m].ca += c - d; if (r1 === '6') byM[m].ch += d - c;
    if (j === 'AC' && cp.startsWith('40')) { const f = r.CompAuxLib || 'Divers'; fourn[f] = (fourn[f] || 0) + c; }
    if (!isClientCaCompte(cp) || (c <= 0 && d <= 0)) return;
    const res = resolveClientFromRow(r);
    if (isParasiteClientName(res.display)) return;
    const kn = res.keyNorm;
    if (!clientBuckets[kn]) {
      clientBuckets[kn] = { displayNom: res.display, brut: 0, avoirs: 0, men: {}, compteNums: new Set(), libByCp: {} };
    }
    const b = clientBuckets[kn];
    if (res.source === 'aux') b.displayNom = res.display;
    /* 706–708 : crédit = CA facturé, débit = avoirs. 709 : idem (crédit au brut, débit = rabais / remises). */
    if (c > 0) {
      b.brut += c;
      b.men[m] = (b.men[m] || 0) + c;
      b.compteNums.add(cp);
      if (r.CompteLib && !b.libByCp[cp]) b.libByCp[cp] = r.CompteLib;
    }
    if (d > 0) {
      b.avoirs += d;
      b.compteNums.add(cp);
    }
  });
  const mergedBuckets = mergeClientBuckets(clientBuckets);
  const clKeysSorted = Object.keys(mergedBuckets)
    .filter((k) => !isParasiteClientName(mergedBuckets[k].displayNom) && mergedBuckets[k].brut > 0)
    .sort((a, b) => mergedBuckets[b].brut - mergedBuckets[a].brut);
  const cl = {};
  clKeysSorted.forEach((kn, idx) => {
    const b = mergedBuckets[kn];
    const compteNums = [...b.compteNums].sort();
    const libComplet = Object.entries(b.libByCp).sort(([a], [b0]) => a.localeCompare(b0)).map(([c, lib]) => `${c} — ${lib}`).join(' · ') || b.displayNom;
    cl[kn] = {
      clientKey: kn,
      cp: compteNums[0] || '',
      compteNums,
      nom: b.displayNom,
      libComplet,
      c: PAL[idx % PAL.length],
      brut: b.brut,
      avoirs: b.avoirs,
      men: b.men,
    };
  });
  const litC = {};
  const litClients = Object.values(cl).filter((x) => x.brut > 0).sort((a, b) => (b.nom || '').length - (a.nom || '').length);
  rows.forEach(r => {
    const cp = r.CompteNum || '', db = pn(r.Debit), lib = (r.EcritureLib || '').toUpperCase();
    if (!cp.startsWith('6069') || !lib.includes('LITIGE') || db <= 0) return;
    let hit = false;
    for (const ent of litClients) {
      const nomU = (ent.nom || '').toUpperCase()
      if (nomU.length >= 3 && lib.includes(nomU)) { litC[ent.nom] = (litC[ent.nom] || 0) + db; hit = true; break }
    }
    if (!hit) {
      if (lib.includes('GLS')) { litC['GLS'] = (litC['GLS'] || 0) + db; hit = true }
      else if (lib.includes('DPD')) { litC['DPD'] = (litC['DPD'] || 0) + db; hit = true }
      else if (lib.includes('COLIS')) { litC['Colis Privé'] = (litC['Colis Privé'] || 0) + db; hit = true }
      else if (lib.includes('MONDIAL')) { litC['Mondial Relay'] = (litC['Mondial Relay'] || 0) + db; hit = true }
    }
    if (!hit) litC['Autres litiges'] = (litC['Autres litiges'] || 0) + db
  });
  const vehs = [];
  const FINS = { 'LOC CENTER': 'Loc Center', 'LEASYS': 'Leasys', 'CREDIPAR': 'Credipar', 'COFICA': 'Cofica', 'LIXXBAIL': 'Lixxbail', 'FCE BANK': 'FCE Bank', 'RENAULT TRUCKS': 'Renault Trucks', 'CA AUTO': 'CA Auto Bank', 'MEIA': 'Meia', 'MUTUALEASE': 'Mutualease', 'WATEA': 'Watea', 'MOBILIZE': 'Mobilize', 'CGI FINANCE': 'CGI Finance', 'FRANFINANCE': 'Franfinance', 'CAPITOLE': 'Capitole Finance', 'TOYOTA': 'Toyota' };
  rows.forEach(r => {
    const cp = r.CompteNum || '', lib = r.CompteLib || '', d = pn(r.Debit);
    if (d > 0 && (cp.startsWith('612') || cp.startsWith('613')) && (lib.toUpperCase().includes('LLD') || lib.toUpperCase().includes('LOA') || Object.keys(FINS).some(k => lib.toUpperCase().includes(k)))) {
      const libU = lib.toUpperCase();
      const typ = libU.includes('LLD') ? 'LLD' : libU.includes('LOA') ? 'LOA' : ['CREDIPAR', 'COFICA', 'FCE BANK', 'LIXXBAIL', 'CA AUTO', 'CAPITOLE'].some(k => libU.includes(k)) ? 'CB' : 'AUTRE';
      let fin = 'Autre'; for (const [k, v] of Object.entries(FINS)) { if (libU.includes(k)) { fin = v; break; } }
      const im = lib.match(/([A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2,3})/);
      const immat = im ? im[1].replace(/\s/g, '-') : lib.replace(/^(?:LLD|LOA)\s+/i, '').slice(0, 22);
      const ex = vehs.find(v => v.cp === cp); if (ex) ex.montant += d; else vehs.push({ cp, lib, typ, fin, immat, montant: d });
    }
  });
  const pens = [];
  rows.forEach(r => {
    const cp = r.CompteNum || '', lib = r.EcritureLib || '', d = pn(r.Debit);
    if (cp.startsWith('658') && d > 0) {
      const im = lib.match(/([A-Z]{2}[-\s]?\d{3}[-\s]?[A-Z]{2})/i);
      const immat = im ? im[1].toUpperCase().replace(/\s/g, '-') : '—';
      const typ = cp === '658200' ? 'Amende/FPS' : cp === '658201' ? 'Contravention' : cp === '658100' ? 'Impayé/Retard' : 'Autre';
      pens.push({ date: r.EcritureDate, cp, typ, lib, immat, montant: d });
    }
  });
  const pRows = jPaie ? rows.filter(r => r.JournalCode === jPaie) : [];
  const ppai = {}; const sals = {};
  pRows.forEach(r => {
    const p = r.EcritureDate; if (!ppai[p]) ppai[p] = { nets: {}, b641: 0, b641400: 0, ch: { u: 0, re: 0, pr: 0, sa: 0, pa: 0, ta: 0, fo: 0, me: 0 }, us: 0 };
    const pp = ppai[p], d = pn(r.Debit), c = pn(r.Credit), cp = r.CompteNum || '';
    if (cp.startsWith('421') && !cp.startsWith('4421') && c > 0) {
      const n = r.CompAuxLib || r.CompteLib || cp;
      pp.nets[n] = (pp.nets[n] || 0) + c;
      if (!sals[n]) sals[n] = { net: 0, pas: 0, mp: new Set(), compteNum: null };
      sals[n].net += c;
      sals[n].mp.add(p.slice(4, 6));
      /* Compte 421 analytique (ex. 421BAYLACJC) : filtre principal du drill-down paie */
      if (!sals[n].compteNum || cp.length > String(sals[n].compteNum).length) sals[n].compteNum = cp;
    }
    if (cp === '641100' || cp === '641300') pp.b641 += d; if (cp === '641400' || cp === '641403') pp.b641400 += d;
    if (cp === '645100') pp.ch.u += d; if (cp === '645200' || cp === '645220' || cp === '645230') pp.ch.pr += d;
    if (cp === '645217') pp.ch.pa += d; if (cp === '645300' || cp === '645310') pp.ch.re += d;
    if (cp === '645320') pp.ch.sa += d; if (cp === '647500') pp.ch.me += d;
    if (cp === '631200') pp.ch.ta += d; if (cp === '633300') pp.ch.fo += d; if (cp === '431000') pp.us += c;
    if (cp.startsWith('4421') && c > 0) { const n = (r.CompteLib || cp).replace(/^PAS\s*/i, '').trim(); const mk = Object.keys(sals).find(k => { const ps = n.split(' '); return ps.some(p0 => p0.length > 3 && k.toUpperCase().includes(p0.toUpperCase())); }); if (mk) sals[mk].pas += c; }
  });
  const gRem = Object.entries(byCp).filter(([k]) => k === '641151').reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const gCot = Object.entries(byCp).filter(([k]) => k === '646000').reduce((s, [, v]) => s + v.debit - v.credit, 0);
  let tBrut = 0, tChPat = 0, tUs = 0;
  Object.values(ppai).forEach(pp => { tBrut += pp.b641 + pp.b641400; tChPat += pp.ch.u + pp.ch.re + pp.ch.pr + pp.ch.sa + pp.ch.pa + pp.ch.ta + pp.ch.fo + pp.ch.me; tUs += pp.us; });
  const tNets = Object.values(sals).reduce((s, v) => s + v.net, 0);
  const massSal = tBrut + tChPat + gRem + gCot;
  const ca = Object.entries(byCp).filter(([k]) => k[0] === '7').reduce((s, [, v]) => s + v.credit - v.debit, 0);
  const ch6 = Object.entries(byCp).filter(([k]) => k[0] === '6').reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const chExt = Object.entries(byCp).filter(([k]) => ['61', '62'].includes(k.slice(0, 2))).reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const amort = Object.entries(byCp).filter(([k]) => k.slice(0, 2) === '68').reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const is_ = Object.entries(byCp).filter(([k]) => k.slice(0, 2) === '69').reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const imp = Object.entries(byCp).filter(([k]) => k.slice(0, 2) === '63').reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const rBrut = ca - (ch6 - is_), rNet = ca - ch6, mNet = ca > 0 ? rNet / ca * 100 : 0;
  const mS = Object.keys(byM).sort();
  const tF = Object.entries(fourn).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const bal = Object.entries(byCp).map(([n, v]) => ({ n, lib: v.lib, d: v.debit, c: v.credit, s: v.debit - v.credit })).sort((a, b) => a.n.localeCompare(b.n));
  const tvaC = Object.entries(byCp).filter(([k]) => k.startsWith('44571')).reduce((s, [, v]) => s + v.debit - v.credit, 0) * -1;
  const tvaD = Object.entries(byCp).filter(([k]) => ['445660', '445620'].includes(k)).reduce((s, [, v]) => s + v.debit - v.credit, 0);
  const tvaA = Object.entries(byCp).filter(([k]) => k === '445510').reduce((s, [, v]) => s + v.credit - v.debit, 0);
  const flotR = { LLD: 0, CB: 0, LOA: 0, AUTRE: 0 }; vehs.forEach(v => { const k = v.typ === 'CRÉDIT-BAIL' || v.typ === 'CB' ? 'CB' : v.typ; flotR[k] = (flotR[k] || 0) + v.montant; });
  const tFlot = Object.values(flotR).reduce((s, v) => s + v, 0);
  const totInd = Object.values(ppai).reduce((s, p) => s + p.b641400, 0);
  let fecDateMin = '99999999', fecDateMax = '00000000';
  rows.forEach(r => {
    const d = String(r.EcritureDate || '').replace(/\D/g, '').slice(0, 8);
    if (/^\d{8}$/.test(d)) { if (d < fecDateMin) fecDateMin = d; if (d > fecDateMax) fecDateMax = d; }
  });
  if (fecDateMax === '00000000') fecDateMin = fecDateMax = '';
  else if (fecDateMin === '99999999') fecDateMin = fecDateMax;
  const safeName = String(name || 'Societe').replace(/\s+/g, '_');
  const id = meta.companyId || (meta.siren ? `${meta.siren}_${year}` : `${safeName}_${year}`);
  return { id, name, year, siren: meta.siren || '', rows: rows.length, fecRows: rows, fecDateMin, fecDateMax, jPaie, ca, ch6, chExt, amort, is: is_, imp, massSal, rBrut, rNet, mNet, gRem, gCot, tBrut, tChPat, tUs, tNets, totInd, byCp, byJ, byM, mS, tF, bal, ppai, sals, tvaC, tvaD, tvaA, cl, litC, vehs, flotR, tFlot, pens };
}

export function parseFEC(text, name, year, meta = {}) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows = [];
  if (lines.length < 2) {
    return analyzeFecRows([], name, year, meta);
  }
  const headers = lines[0].split('\t').map(h => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t'); if (parts.length < 12) continue;
    const row = {}; headers.forEach((h, idx) => row[h] = (parts[idx] || '').trim()); rows.push(row);
  }
  return analyzeFecRows(rows, name, year, meta);
}
