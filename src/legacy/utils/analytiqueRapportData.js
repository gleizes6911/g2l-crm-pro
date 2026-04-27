/** Collecte asynchrone des données pour le rapport PDF « Analyse par métier » (tous périmètres). */

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function fetchJson(apiBase, path, params) {
  const sp = new URLSearchParams(params);
  const r = await fetch(`${apiBase}${path}?${sp.toString()}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return r.json();
}

function parseDash(j) {
  return (Array.isArray(j?.data) ? j.data : []).map((r) => ({
    ...r,
    ca: num(r.ca),
  }));
}

function parseClients(j) {
  return (Array.isArray(j?.data) ? j.data : [])
    .map((row) => ({ ...row, ca: num(row.ca) }))
    .sort((a, b) => b.ca - a.ca);
}

function parseCharges(j) {
  return (Array.isArray(j?.data) ? j.data : []).map((r) => {
    let detail = r.detail;
    if (typeof detail === 'string') {
      try {
        detail = JSON.parse(detail);
      } catch {
        detail = [];
      }
    }
    return {
      ...r,
      charge: num(r.charge),
      detail: Array.isArray(detail) ? detail : [],
    };
  });
}

function metricsForSlice(dashRows, chargesGlobal, nonAffectes) {
  const caAffecte = dashRows.reduce((s, r) => s + num(r.ca), 0);
  const produitsNA = (nonAffectes || [])
    .filter((r) => String(r.type) === 'PRODUIT')
    .reduce((s, r) => s + num(r.solde_abs), 0);
  const caGlobal = caAffecte + produitsNA;
  const charges = chargesGlobal.reduce((s, r) => s + num(r.charge), 0);
  return {
    caAffecte,
    produitsNonAffectes: produitsNA,
    caGlobal,
    chargesGlobales: charges,
    resultat: caGlobal - charges,
  };
}

function byMetierAggregated(dashRows, metiers) {
  const m = new Map();
  for (const r of dashRows) {
    const id = String(r.metier_id);
    m.set(id, (m.get(id) || 0) + num(r.ca));
  }
  return metiers
    .slice()
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map((met) => ({
      metier_id: met.id,
      libelle: met.libelle,
      code: met.code,
      couleur: met.couleur || '#2563eb',
      ca: m.get(String(met.id)) || 0,
    }))
    .filter((x) => x.ca > 0.0001);
}

function familiesTable(chargesGlobal) {
  const total = chargesGlobal.reduce((s, r) => s + num(r.charge), 0);
  return chargesGlobal
    .filter((r) => r.est_famille)
    .map((r) => ({
      label: r.compte_lib,
      charge: num(r.charge),
      couleur: r.couleur || '#dc2626',
      pct: total > 0.0001 ? ((num(r.charge) / total) * 100).toFixed(1) : null,
      detail: r.detail || [],
    }))
    .sort((a, b) => b.charge - a.charge);
}

/** Tous les mois calendaires recouverts par [debutStr, finStr] (inclus, format YYYY-MM-DD). */
function listMonthBounds(debutStr, finStr) {
  const out = [];
  let y = parseInt(String(debutStr).slice(0, 4), 10);
  let m = parseInt(String(debutStr).slice(5, 7), 10);
  const endY = parseInt(String(finStr).slice(0, 4), 10);
  const endM = parseInt(String(finStr).slice(5, 7), 10);
  const endKey = endY * 12 + (endM - 1);
  let curKey = y * 12 + (m - 1);
  while (curKey <= endKey) {
    const lastDay = new Date(y, m, 0).getDate();
    const d0 = `${y}-${String(m).padStart(2, '0')}-01`;
    const d1 = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const clipD = d0 < debutStr ? debutStr : d0;
    const clipF = d1 > finStr ? finStr : d1;
    if (clipD <= clipF) {
      const raw = new Date(y, m - 1, 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
      const label = raw.charAt(0).toUpperCase() + raw.slice(1);
      out.push({ debut: clipD, fin: clipF, label });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    curKey = y * 12 + (m - 1);
  }
  return out;
}

/** CA / charges / résultat par mois (mêmes règles que la synthèse globale). */
async function fetchRecapMensuel(apiBase, debut, fin, societeId) {
  const months = listMonthBounds(debut, fin);
  if (months.length === 0) return [];
  return Promise.all(
    months.map(async (mo) => {
      const sp = new URLSearchParams({ date_debut: mo.debut, date_fin: mo.fin });
      if (societeId != null) sp.set('societe_id', String(societeId));
      const [dJ, chJ, naJ] = await Promise.all([
        fetchJson(apiBase, '/api/analytique/dashboard', sp),
        fetchJson(apiBase, '/api/analytique/charges-global', sp),
        fetchJson(apiBase, '/api/analytique/non-affectes', sp),
      ]);
      const dashRows = parseDash(dJ);
      const chargesGlobal = parseCharges(chJ);
      const nonAffectes = Array.isArray(naJ?.data) ? naJ.data : [];
      const met = metricsForSlice(dashRows, chargesGlobal, nonAffectes);
      return { label: mo.label, debut: mo.debut, fin: mo.fin, met };
    }),
  );
}

/**
 * @param {object} p
 * @param {string} p.apiBase
 * @param {function} p.toPeriodBounds
 * @param {string|number} p.annee
 * @param {string} p.periodicite
 * @param {string|number} p.periodValue
 * @param {Array<{id:number,nom?:string}>} p.societes
 * @param {Array<{id:string,libelle:string,code:string,ordre?:number,couleur?:string}>} p.metiers
 * @param {string} p.periodeLabel
 */
export async function collectAnalytiqueRapportData(p) {
  const { debut, fin } = p.toPeriodBounds(p.periodicite, p.annee, p.periodValue);
  const base = { date_debut: debut, date_fin: fin };

  const q = (societeId) => {
    const sp = new URLSearchParams(base);
    if (societeId != null) sp.set('societe_id', String(societeId));
    return sp;
  };

  async function buildScope(societeId, label) {
    const [dJ, cJ, chJ, naJ, recapMensuel] = await Promise.all([
      fetchJson(p.apiBase, '/api/analytique/dashboard', q(societeId)),
      fetchJson(p.apiBase, '/api/analytique/clients-global', q(societeId)),
      fetchJson(p.apiBase, '/api/analytique/charges-global', q(societeId)),
      fetchJson(p.apiBase, '/api/analytique/non-affectes', q(societeId)),
      fetchRecapMensuel(p.apiBase, debut, fin, societeId),
    ]);
    const dashRows = parseDash(dJ);
    const clientsGlobal = parseClients(cJ);
    const chargesGlobal = parseCharges(chJ);
    const nonAffectes = Array.isArray(naJ?.data) ? naJ.data : [];

    const met = metricsForSlice(dashRows, chargesGlobal, nonAffectes);
    const byMetier = byMetierAggregated(dashRows, p.metiers || []);
    const familles = familiesTable(chargesGlobal);
    const horsFamilles = chargesGlobal
      .filter((r) => !r.est_famille)
      .reduce((s, r) => s + num(r.charge), 0);

    const metierIds = new Set(dashRows.map((r) => String(r.metier_id)));
    const produitsByMetier = [];
    for (const m of (p.metiers || []).filter((x) => metierIds.has(String(x.id)))) {
      const sp2 = new URLSearchParams({
        metier_id: m.id,
        date_debut: debut,
        date_fin: fin,
      });
      if (societeId != null) sp2.set('societe_id', String(societeId));
      const r2 = await fetch(
        `${p.apiBase}/api/analytique/detail-metier?${sp2.toString()}`,
        { cache: 'no-store' },
      );
      const dj = r2.ok ? await r2.json() : { data: [] };
      produitsByMetier.push({
        metier: m,
        comptes: (Array.isArray(dj.data) ? dj.data : []).map((row) => ({
          compte_num: row.compte_num,
          compte_lib: row.compte_lib,
          ca: num(row.ca),
        })),
      });
    }

    const chargesByFamilleDetail = chargesGlobal
      .filter((r) => r.est_famille)
      .map((r) => ({
        famille: r.compte_lib,
        couleur: r.couleur,
        total: num(r.charge),
        comptes: (r.detail || []).map((d) => ({
          compte_num: d.compte_num,
          compte_lib: d.compte_lib,
          charge: num(d.charge),
          societe_id: d.societe_id,
        })),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      label,
      societeId,
      met,
      recapMensuel,
      dashRows,
      clientsGlobal,
      byMetier,
      familles,
      horsFamilles,
      produitsByMetier,
      chargesByFamilleDetail,
    };
  }

  const consolidated = await buildScope(null, 'Consolidé (toutes sociétés)');
  const parSociete = [];
  for (const s of p.societes || []) {
    parSociete.push(await buildScope(s.id, s.nom || `Société #${s.id}`));
  }

  return {
    periodeLabel: p.periodeLabel || '',
    dateDebut: debut,
    dateFin: fin,
    societes: p.societes || [],
    consolidated,
    parSociete,
  };
}
