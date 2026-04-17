import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import API_BASE from '../../config/api';

function toPeriodBounds(periodicite, annee, periodValue) {
  const y = Number(annee);
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (year, month) => new Date(year, month, 0).getDate();
  if (periodicite === 'mensuel') {
    const m = Number(periodValue || 1);
    return {
      debut: `${y}-${pad(m)}-01`,
      fin: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
    };
  }
  if (periodicite === 'trimestriel') {
    const t = Number(periodValue || 1);
    const mDebut = (t - 1) * 3 + 1;
    const mFin = t * 3;
    return {
      debut: `${y}-${pad(mDebut)}-01`,
      fin: `${y}-${pad(mFin)}-${pad(lastDay(y, mFin))}`,
    };
  }
  return { debut: `${y}-01-01`, fin: `${y}-12-31` };
}

const money = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Couleur métier (hex) → fond léger pour badge (rgba) */
function hexToRgba(hex, alpha) {
  let h = String(hex || '#64748b').replace('#', '');
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (h.length !== 6) return `rgba(100,116,139,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function metierCodeNorm(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/\s/g, '_');
}

function firstAff(affectations) {
  if (!Array.isArray(affectations) || affectations.length === 0) return null;
  return affectations[0];
}

function hasAffectation(row) {
  const a = row.affectations;
  return Array.isArray(a) && a.length > 0;
}

export default function Analytique() {
  const [tab, setTab] = useState('affectation');

  const [societes, setSocietes] = useState([]);
  const [societeScope, setSocieteScope] = useState('consolide');

  const [metiers, setMetiers] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);

  const [filterType, setFilterType] = useState('tous');
  const [filterStatut, setFilterStatut] = useState('tous');

  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [periodicite, setPeriodicite] = useState('mensuel');
  const [periodValue, setPeriodValue] = useState('1');
  const [dashRows, setDashRows] = useState([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [clientsGlobal, setClientsGlobal] = useState([]);

  const [nonAffectes, setNonAffectes] = useState([]);
  const [nonLoading, setNonLoading] = useState(true);
  const [modal, setModal] = useState(null);

  /** Détail clients par métier (onglet Dashboard) */
  const [metierDetailOpen, setMetierDetailOpen] = useState({});
  const [metierDetailRows, setMetierDetailRows] = useState({});
  const [metierDetailLoading, setMetierDetailLoading] = useState({});

  const societeIdParam = societeScope === 'consolide' ? null : parseInt(societeScope, 10);

  const loadSocietes = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/fec/societes`);
      if (!r.ok) return;
      const j = await r.json();
      setSocietes(Array.isArray(j.societes) ? j.societes : []);
    } catch {
      setSocietes([]);
    }
  }, []);

  const loadMetiers = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/analytique/metiers`);
      if (!r.ok) return;
      const j = await r.json();
      setMetiers(Array.isArray(j.data) ? j.data : []);
    } catch {
      setMetiers([]);
    }
  }, []);

  const loadComptes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = societeIdParam != null ? `?societe_id=${societeIdParam}` : '';
      const r = await fetch(`${API_BASE}/api/analytique/comptes${q}`);
      if (!r.ok) throw new Error('Erreur chargement comptes');
      const j = await r.json();
      const rows = Array.isArray(j.data) ? j.data : [];
      setComptes(rows);
      const next = {};
      for (const row of rows) {
        const fa = firstAff(row.affectations);
        next[row.compte_num] = {
          metier_id: fa?.metier_id || '',
          pourcentage: fa?.pourcentage != null ? parseNum(fa.pourcentage) : 100,
        };
      }
      setDraft(next);
    } catch (e) {
      setError(e.message || 'Erreur');
      setComptes([]);
    } finally {
      setLoading(false);
    }
  }, [societeIdParam]);

  const loadDashboard = useCallback(async () => {
    const { debut, fin } = toPeriodBounds(periodicite, annee, periodValue);
    const spDash = new URLSearchParams();
    spDash.set('date_debut', debut);
    spDash.set('date_fin', fin);
    const spClients = new URLSearchParams();
    spClients.set('date_debut', debut);
    spClients.set('date_fin', fin);
    if (societeIdParam != null) spClients.set('societe_id', String(societeIdParam));
    setDashLoading(true);
    try {
      const [rDash, rCli] = await Promise.all([
        fetch(`${API_BASE}/api/analytique/dashboard?${spDash.toString()}`),
        fetch(`${API_BASE}/api/analytique/clients-global?${spClients.toString()}`),
      ]);
      if (rDash.ok) {
        const j = await rDash.json();
        setDashRows(Array.isArray(j.data) ? j.data : []);
      } else {
        setDashRows([]);
      }
      if (rCli.ok) {
        const jc = await rCli.json();
        const rows = Array.isArray(jc.data) ? jc.data : [];
        setClientsGlobal(rows.map((row) => ({ ...row, ca: parseNum(row.ca) })));
      } else {
        setClientsGlobal([]);
      }
    } catch {
      setDashRows([]);
      setClientsGlobal([]);
    } finally {
      setDashLoading(false);
    }
  }, [annee, periodicite, periodValue, societeIdParam]);

  const loadNonAffectes = useCallback(async () => {
    setNonLoading(true);
    try {
      const q = societeIdParam != null ? `?societe_id=${societeIdParam}` : '';
      const r = await fetch(`${API_BASE}/api/analytique/non-affectes${q}`);
      if (!r.ok) throw new Error('Erreur');
      const j = await r.json();
      setNonAffectes(Array.isArray(j.data) ? j.data : []);
    } catch {
      setNonAffectes([]);
    } finally {
      setNonLoading(false);
    }
  }, [societeIdParam]);

  const fetchMetierDetail = useCallback(
    async (metierId) => {
      setMetierDetailLoading((prev) => ({ ...prev, [metierId]: true }));
      try {
        const { debut, fin } = toPeriodBounds(periodicite, annee, periodValue);
        const sp = new URLSearchParams({
          metier_id: metierId,
          date_debut: debut,
          date_fin: fin,
        });
        if (societeIdParam != null) sp.set('societe_id', String(societeIdParam));
        const r = await fetch(`${API_BASE}/api/analytique/detail-metier?${sp.toString()}`);
        if (!r.ok) throw new Error('Erreur détail métier');
        const j = await r.json();
        setMetierDetailRows((prev) => ({
          ...prev,
          [metierId]: Array.isArray(j.data) ? j.data : [],
        }));
      } catch {
        setMetierDetailRows((prev) => ({ ...prev, [metierId]: [] }));
      } finally {
        setMetierDetailLoading((prev) => ({ ...prev, [metierId]: false }));
      }
    },
    [annee, periodicite, periodValue, societeIdParam],
  );

  useEffect(() => {
    if (tab !== 'dashboard') return;
    setMetierDetailOpen({});
    setMetierDetailRows({});
    setMetierDetailLoading({});
  }, [tab, annee, periodicite, periodValue, societeScope]);

  useEffect(() => {
    loadSocietes();
    loadMetiers();
  }, [loadSocietes, loadMetiers]);

  useEffect(() => {
    if (tab === 'affectation') loadComptes();
  }, [tab, loadComptes]);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
  }, [tab, loadDashboard]);

  useEffect(() => {
    loadNonAffectes();
  }, [loadNonAffectes]);

  const nonAffectesCountTab1 = useMemo(
    () => comptes.filter((c) => !hasAffectation(c)).length,
    [comptes],
  );

  const filteredComptes = useMemo(() => {
    return comptes.filter((c) => {
      if (filterType === 'CHARGE' && c.type !== 'CHARGE') return false;
      if (filterType === 'PRODUIT' && c.type !== 'PRODUIT') return false;
      const aff = hasAffectation(c);
      if (filterStatut === 'affecte' && !aff) return false;
      if (filterStatut === 'non' && aff) return false;
      return true;
    });
  }, [comptes, filterType, filterStatut]);

  const saveAffectation = async (compte_num) => {
    const d = draft[compte_num] || {};
    const metier_id = String(d.metier_id || '').trim();
    const pourcentage = d.pourcentage != null ? parseNum(d.pourcentage) : 100;
    setSavingKey(compte_num);
    setError(null);
    try {
      const body = {
        compte_num,
        societe_id: societeIdParam,
        affectations: metier_id
          ? [{ metier_id, categorie_id: null, pourcentage: Math.min(100, Math.max(0, pourcentage)) }]
          : [],
      };
      const r = await fetch(`${API_BASE}/api/analytique/affectations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur sauvegarde');
      }
      await loadComptes();
      if (tab === 'non') await loadNonAffectes();
    } catch (e) {
      setError(e.message || 'Erreur');
    } finally {
      setSavingKey(null);
    }
  };

  const dashboardMetrics = useMemo(() => {
    const n = (r) => parseNum(r.ca);
    const rows = dashRows;
    const ca_total_groupe = rows.reduce((s, r) => s + n(r), 0);
    const isConsolide = societeScope === 'consolide';
    const sid = societeIdParam;
    const ca_total_societe =
      !isConsolide && sid != null
        ? rows
            .filter((r) => Number(r.societe_id) === Number(sid))
            .reduce((s, r) => s + n(r), 0)
        : null;

    const caByMetierId = new Map();
    for (const r of rows) {
      if (!isConsolide && sid != null && Number(r.societe_id) !== Number(sid)) continue;
      const id = r.metier_id;
      caByMetierId.set(id, (caByMetierId.get(id) || 0) + n(r));
    }

    const bySoc = new Map();
    for (const r of rows) {
      const k = Number(r.societe_id);
      bySoc.set(k, (bySoc.get(k) || 0) + n(r));
    }
    const holdingSocietes = [...bySoc.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, caSoc]) => ({
        societe_id: id,
        nom: societes.find((s) => Number(s.id) === Number(id))?.nom || `Société #${id}`,
        ca: caSoc,
      }));

    return {
      ca_total_groupe,
      ca_total_societe,
      caByMetierId,
      isConsolide,
      holdingSocietes,
    };
  }, [dashRows, societeScope, societeIdParam, societes]);

  const caVignette = useMemo(() => {
    if (dashboardMetrics.isConsolide) return dashboardMetrics.ca_total_groupe;
    return dashboardMetrics.ca_total_societe ?? 0;
  }, [dashboardMetrics]);

  const pctFmt = (p) =>
    p == null || !Number.isFinite(p)
      ? '—'
      : `${p.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

  const societePills = useMemo(() => {
    const n = (s) => String(s?.nom || '').toLowerCase();
    const dj =
      societes.find((s) => /\bd\s*&\s*j\b/.test(n(s)) || n(s).includes('dj transport')) ||
      societes.find((s) => n(s).includes('d&j') || /\bdj\b/.test(n(s)));
    const tps =
      societes.find((s) => n(s).includes('tps') || n(s).includes('tsmc')) ||
      societes.find((s) => n(s).includes('tsmc express'));
    return { dj, tps };
  }, [societes]);

  const societeLabel = useMemo(() => {
    if (societeScope === 'consolide') return 'Consolidé';
    const s = societes.find((x) => String(x.id) === String(societeScope));
    return s?.nom || 'Société';
  }, [societeScope, societes]);

  const nonAffectesMontantTotal = useMemo(
    () => nonAffectes.reduce((s, r) => s + parseNum(r.solde_abs), 0),
    [nonAffectes],
  );

  const toggleMetierDetail = (metierId) => {
    setMetierDetailOpen((prev) => {
      const nextOpen = !prev[metierId];
      if (nextOpen) {
        void fetchMetierDetail(metierId);
      }
      return { ...prev, [metierId]: nextOpen };
    });
  };

  const badgeClass =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset';

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyse financière par métier</h1>
          <p className="text-sm text-gray-600 mt-1">
            Affectation des comptes 6 / 7 (hors produits financiers à traiter à part) et pilotage par
            métier.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600 whitespace-nowrap">
            Société FEC
            <select
              className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm"
              value={societeScope}
              onChange={(e) => setSocieteScope(e.target.value)}
            >
              <option value="consolide">Consolidé</option>
              {societes.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.nom || `Société #${s.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex flex-wrap gap-4">
          {[
            { id: 'affectation', label: 'Affectation comptes' },
            { id: 'dashboard', label: 'Dashboard métiers' },
            {
              id: 'non',
              label: (
                <span className="inline-flex items-center gap-2">
                  Comptes non affectés
                  {nonAffectes.length > 0 && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {nonAffectes.length}
                    </span>
                  )}
                </span>
              ),
            },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'affectation' && (
        <div className="space-y-4">
          {nonAffectesCountTab1 > 0 && (
            <div className="text-sm font-semibold text-red-600">
              {nonAffectesCountTab1} compte{nonAffectesCountTab1 > 1 ? 's' : ''} non affecté
              {nonAffectesCountTab1 > 1 ? 's' : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-gray-600">
              Type
              <select
                className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="tous">Tous</option>
                <option value="CHARGE">Charges</option>
                <option value="PRODUIT">Produits</option>
              </select>
            </label>
            <label className="text-sm text-gray-600">
              Statut
              <select
                className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
              >
                <option value="tous">Tous</option>
                <option value="affecte">Affecté</option>
                <option value="non">Non affecté</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Numéro</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Libellé</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Métier</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 w-24">%</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                      Chargement…
                    </td>
                  </tr>
                ) : (
                  filteredComptes.map((row) => {
                    const na = !hasAffectation(row);
                    const d = draft[row.compte_num] || { metier_id: '', pourcentage: 100 };
                    return (
                      <tr
                        key={row.compte_num}
                        className={na ? 'bg-orange-50/90 hover:bg-orange-50' : 'hover:bg-gray-50'}
                      >
                        <td className="px-3 py-2 font-mono text-gray-900">{row.compte_num}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={row.compte_lib}>
                          {row.compte_lib || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              row.type === 'CHARGE'
                                ? `${badgeClass} bg-amber-50 text-amber-800 ring-amber-600/20`
                                : `${badgeClass} bg-emerald-50 text-emerald-800 ring-emerald-600/20`
                            }
                          >
                            {row.type}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="w-full max-w-[220px] rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                            value={d.metier_id}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [row.compte_num]: {
                                  ...d,
                                  metier_id: e.target.value,
                                },
                              }))
                            }
                          >
                            <option value="">—</option>
                            {metiers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.libelle}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            value={d.pourcentage}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [row.compte_num]: {
                                  ...d,
                                  pourcentage: e.target.value === '' ? '' : parseFloat(e.target.value),
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={savingKey === row.compte_num}
                            onClick={() => saveAffectation(row.compte_num)}
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingKey === row.compte_num ? '…' : 'Sauvegarder'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 items-end">
            <label className="text-sm text-gray-600">
              Année
              <input
                type="number"
                className="ml-2 w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={annee}
                onChange={(e) => setAnnee(Number(e.target.value))}
              />
            </label>
            <label className="text-sm text-gray-600">
              Périodicité
              <select
                className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                value={periodicite}
                onChange={(e) => {
                  setPeriodicite(e.target.value);
                  setPeriodValue('1');
                }}
              >
                <option value="mensuel">Mensuel</option>
                <option value="trimestriel">Trimestriel</option>
                <option value="annuel">Annuel</option>
              </select>
            </label>
            {periodicite === 'mensuel' && (
              <label className="text-sm text-gray-600">
                Mois
                <select
                  className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                  value={periodValue}
                  onChange={(e) => setPeriodValue(e.target.value)}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {periodicite === 'trimestriel' && (
              <label className="text-sm text-gray-600">
                Trimestre
                <select
                  className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                  value={periodValue}
                  onChange={(e) => setPeriodValue(e.target.value)}
                >
                  {[1, 2, 3, 4].map((t) => (
                    <option key={t} value={String(t)}>
                      T{t}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Actualiser
            </button>
          </div>

          {dashLoading ? (
            <p className="text-sm text-gray-500">Chargement du dashboard…</p>
          ) : (
            <>
              {/* Zone 1 — Vignette Groupe */}
              <div className="rounded-2xl bg-blue-950 p-8 text-white shadow-xl md:p-10">
                <div className="text-center">
                  <p className="text-2xl font-bold uppercase tracking-widest text-white">GROUPE</p>
                  <p className="mt-1 text-sm font-medium text-blue-100/90">{annee}</p>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSocieteScope('consolide')}
                    className={`rounded-full px-4 py-2.5 text-sm transition ${
                      societeScope === 'consolide'
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 font-medium text-white/70 hover:bg-white/20'
                    }`}
                  >
                    Consolidé
                  </button>
                  <button
                    type="button"
                    disabled={!societePills.dj}
                    onClick={() => societePills.dj && setSocieteScope(String(societePills.dj.id))}
                    className={`rounded-full px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      societePills.dj && societeScope === String(societePills.dj.id)
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 font-medium text-white/70 hover:bg-white/20'
                    }`}
                  >
                    D&J TRANSPORT
                  </button>
                  <button
                    type="button"
                    disabled={!societePills.tps}
                    onClick={() => societePills.tps && setSocieteScope(String(societePills.tps.id))}
                    className={`rounded-full px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      societePills.tps && societeScope === String(societePills.tps.id)
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 font-medium text-white/70 hover:bg-white/20'
                    }`}
                  >
                    TPS TSMC EXPRESS
                  </button>
                </div>
                <p className="my-6 text-center text-6xl font-black tabular-nums text-white">
                  {money(caVignette)} €
                </p>
                {nonAffectes.length > 0 && (
                  <div className="mt-2 flex justify-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/25 px-4 py-2 text-sm font-semibold text-orange-100 ring-1 ring-orange-400/40">
                      <span className="text-base leading-none" aria-hidden>
                        {'\u26A0\uFE0F'}
                      </span>
                      <span className="tabular-nums">{money(nonAffectesMontantTotal)} € non affectés</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Répartition CA par client — {societeLabel}
                </h3>
                {clientsGlobal.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">Aucune donnée sur la période.</p>
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(300, clientsGlobal.length * 32)}
                  >
                    <BarChart
                      data={clientsGlobal}
                      layout="vertical"
                      margin={{ left: 220, right: 80, top: 0, bottom: 0 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
                      />
                      <YAxis
                        type="category"
                        dataKey="compte_lib"
                        tick={{ fontSize: 11 }}
                        width={210}
                      />
                      <Tooltip
                        formatter={(v) =>
                          `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
                        }
                      />
                      <Bar dataKey="ca" radius={[0, 4, 4, 0]}>
                        {clientsGlobal.map((entry, i) => (
                          <Cell key={`${entry.compte_num}-${entry.metier}-${i}`} fill={entry.couleur || '#2563eb'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Zone 2 — Vignettes métiers */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {metiers
                  .filter((m) => {
                    if (m.actif === false) return false;
                    const caM = dashboardMetrics.caByMetierId.get(m.id) ?? 0;
                    if (metierCodeNorm(m.code) === 'NON_AFFECTE') return caM > 0;
                    return true;
                  })
                  .map((m) => {
                    const caM = dashboardMetrics.caByMetierId.get(m.id) ?? 0;
                    const pctGroupe =
                      dashboardMetrics.ca_total_groupe > 0.0001
                        ? (caM / dashboardMetrics.ca_total_groupe) * 100
                        : null;
                    const pctSociete =
                      !dashboardMetrics.isConsolide &&
                      dashboardMetrics.ca_total_societe != null &&
                      dashboardMetrics.ca_total_societe > 0.0001
                        ? (caM / dashboardMetrics.ca_total_societe) * 100
                        : null;
                    const isNonAffecte = metierCodeNorm(m.code) === 'NON_AFFECTE';
                    const barPct = Math.min(100, Math.max(0, pctGroupe ?? 0));
                    const accent = m.couleur || '#64748b';

                    return (
                      <div
                        key={m.id}
                        className={`rounded-xl border border-slate-200 p-4 shadow-sm ${
                          isNonAffecte
                            ? 'border-l-4 border-orange-400 bg-orange-50'
                            : 'border-l-4 bg-white'
                        }`}
                        style={isNonAffecte ? undefined : { borderLeftColor: accent }}
                      >
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                          {m.libelle}
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                          {money(caM)} €
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: hexToRgba(accent, 0.18),
                              color: accent,
                            }}
                          >
                            {pctFmt(pctGroupe)}
                          </span>
                        </div>
                        {!dashboardMetrics.isConsolide && pctSociete != null && (
                          <p className="mt-2 text-xs text-slate-500">
                            % CA société : <span className="tabular-nums">{pctFmt(pctSociete)}</span>
                          </p>
                        )}
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${barPct}%`,
                              backgroundColor: isNonAffecte ? '#fb923c' : accent,
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleMetierDetail(m.id)}
                          className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          <span>
                            {metierDetailOpen[m.id] ? '\u25B2' : '\u25BC'} Détail clients
                          </span>
                        </button>
                        {metierDetailOpen[m.id] && (
                          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white">
                            {metierDetailLoading[m.id] ? (
                              <p className="p-2 text-center text-xs text-slate-500">Chargement…</p>
                            ) : (
                              <table className="w-full min-w-0 text-xs">
                                <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                                  <tr>
                                    <th className="px-2 py-1 font-medium">Libellé (client)</th>
                                    <th className="px-2 py-1 font-medium">N° compte</th>
                                    <th className="px-2 py-1 text-right font-medium">CA</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(metierDetailRows[m.id] || []).length === 0 ? (
                                    <tr>
                                      <td colSpan={3} className="px-2 py-2 text-center text-slate-500">
                                        Aucune ligne
                                      </td>
                                    </tr>
                                  ) : (
                                    (metierDetailRows[m.id] || []).map((row) => (
                                      <tr key={row.compte_num} className="hover:bg-slate-50">
                                        <td className="max-w-[140px] truncate px-2 py-1 text-slate-800" title={row.compte_lib}>
                                          {row.compte_lib || '—'}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-1 font-mono text-slate-600">
                                          {row.compte_num}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums font-medium text-slate-900">
                                          {money(row.ca)} €
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Métier</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Code</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Société</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">CA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dashRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                          Aucune donnée sur la période (affectations ou écritures FEC 7x).
                        </td>
                      </tr>
                    ) : (
                      dashRows.map((r, i) => (
                        <tr key={`${r.metier_id}-${r.societe_id}-${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900">{r.metier_libelle}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{r.metier_code}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {societes.find((s) => Number(s.id) === Number(r.societe_id))?.nom ||
                              `Société #${r.societe_id}`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {money(r.ca)} €
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'non' && (
        <div className="space-y-4">
          {nonAffectes.length > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-200">
              {nonAffectes.length} compte{nonAffectes.length > 1 ? 's' : ''} en attente d’affectation
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Compte</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Libellé</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">|Solde|</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {nonLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      Chargement…
                    </td>
                  </tr>
                ) : nonAffectes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      Tous les comptes sont affectés pour ce périmètre.
                    </td>
                  </tr>
                ) : (
                  nonAffectes.map((row) => (
                    <tr key={row.compte_num} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono">{row.compte_num}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-md truncate" title={row.compte_lib}>
                        {row.compte_lib || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            row.type === 'CHARGE'
                              ? `${badgeClass} bg-amber-50 text-amber-800 ring-amber-600/20`
                              : `${badgeClass} bg-emerald-50 text-emerald-800 ring-emerald-600/20`
                          }
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(row.solde_abs)} €</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              compte_num: row.compte_num,
                              compte_lib: row.compte_lib,
                              metier_id: metiers[0]?.id || '',
                              pourcentage: 100,
                            })
                          }
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Affecter
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Affecter {modal.compte_num}</h3>
            <p className="mt-1 text-sm text-gray-600 truncate" title={modal.compte_lib}>
              {modal.compte_lib || '—'}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-gray-700">
                Métier
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                  value={modal.metier_id}
                  onChange={(e) => setModal((m) => ({ ...m, metier_id: e.target.value }))}
                >
                  {metiers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-700">
                Pourcentage
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                  value={modal.pourcentage}
                  onChange={(e) =>
                    setModal((m) => ({
                      ...m,
                      pourcentage: e.target.value === '' ? '' : parseFloat(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setModal(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={async () => {
                  if (!modal.metier_id) return;
                  setSavingKey('modal');
                  try {
                    const r = await fetch(`${API_BASE}/api/analytique/affectations`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        compte_num: modal.compte_num,
                        societe_id: societeIdParam,
                        affectations: [
                          {
                            metier_id: modal.metier_id,
                            categorie_id: null,
                            pourcentage: Math.min(100, Math.max(0, parseNum(modal.pourcentage))),
                          },
                        ],
                      }),
                    });
                    if (!r.ok) {
                      const err = await r.json().catch(() => ({}));
                      throw new Error(err.error || 'Erreur');
                    }
                    setModal(null);
                    await loadNonAffectes();
                  } catch (e) {
                    setError(e.message || 'Erreur');
                  } finally {
                    setSavingKey(null);
                  }
                }}
                disabled={savingKey === 'modal' || !modal.metier_id}
              >
                {savingKey === 'modal' ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
