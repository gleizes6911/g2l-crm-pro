import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import API_BASE from '../../config/api';
const FOURNISSEURS_DEFAULT = [
  'UTA',
  'WEX',
  'TotalEnergies Marketing France',
  'ES-ARMENGOL MORALES',
  'Carte Perso Chauffeur',
];

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toPeriodBounds(periodicite, annee, periodValue) {
  const y = Number(annee);
  if (periodicite === 'mensuel') {
    const m = Number(periodValue || 1);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { debut: start.toISOString().slice(0, 10), fin: end.toISOString().slice(0, 10) };
  }
  if (periodicite === 'trimestriel') {
    const t = Number(periodValue || 1);
    const sm = (t - 1) * 3;
    const start = new Date(y, sm, 1);
    const end = new Date(y, sm + 3, 0);
    return { debut: start.toISOString().slice(0, 10), fin: end.toISOString().slice(0, 10) };
  }
  if (periodicite === 'semestriel') {
    const s = Number(periodValue || 1);
    const sm = s === 1 ? 0 : 6;
    const start = new Date(y, sm, 1);
    const end = new Date(y, sm + 6, 0);
    return { debut: start.toISOString().slice(0, 10), fin: end.toISOString().slice(0, 10) };
  }
  return { debut: `${y}-01-01`, fin: `${y}-12-31` };
}

/** mois clé YYYY-MM → { debut, fin } dernier jour du mois (sans décalage fuseau) */
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

function formatKm(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

function formatKmWithUnit(n) {
  if (n == null || !Number.isFinite(Number(n))) return 'N/A';
  return `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km`;
}

function isHttpUrl(s) {
  const t = String(s || '').trim();
  return /^https?:\/\//i.test(t);
}

export default function TICPE() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('calcul');

  const [periodicite, setPeriodicite] = useState('mensuel');
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [periodValue, setPeriodValue] = useState('1');
  const [filiale, setFiliale] = useState('Toutes');
  const [fournisseurs, setFournisseurs] = useState(FOURNISSEURS_DEFAULT);
  const [calcul, setCalcul] = useState(null);
  const [calculLoading, setCalculLoading] = useState(false);
  const [lastCalculParams, setLastCalculParams] = useState(null);
  /** null = tous les éligibles ; sinon liste d’ids SF à inclure */
  const [includedSfIds, setIncludedSfIds] = useState(null);

  const [vehiculeFilterFiliale, setVehiculeFilterFiliale] = useState('Toutes');
  const [vehiculeFilterType, setVehiculeFilterType] = useState('Tous');
  const [eligibleOverrides, setEligibleOverrides] = useState({});
  const headerEligibleRef = useRef(null);

  const [detailMoisOpen, setDetailMoisOpen] = useState(false);
  const [detailMoisKey, setDetailMoisKey] = useState(null);
  const [detailMoisData, setDetailMoisData] = useState(null);
  const [detailMoisLoading, setDetailMoisLoading] = useState(false);
  const [detailMoisError, setDetailMoisError] = useState(null);
  const [noTxModalOpen, setNoTxModalOpen] = useState(false);

  const tauxQ = useQuery({
    queryKey: ['ticpe-taux'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/ticpe/taux`);
      if (!res.ok) throw new Error('taux');
      return res.json();
    },
  });
  const vehiculesQ = useQuery({
    queryKey: ['ticpe-vehicules', vehiculeFilterFiliale, vehiculeFilterType],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (vehiculeFilterFiliale !== 'Toutes') qs.set('filiale', vehiculeFilterFiliale);
      if (vehiculeFilterType !== 'Tous') qs.set('type', vehiculeFilterType);
      const res = await fetch(`${API_BASE}/api/ticpe/vehicules?${qs.toString()}`);
      if (!res.ok) throw new Error('vehicules');
      return res.json();
    },
  });
  const declarationsQ = useQuery({
    queryKey: ['ticpe-declarations'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/ticpe/declarations`);
      if (!res.ok) throw new Error('declarations');
      return res.json();
    },
  });

  const taux = Array.isArray(tauxQ.data?.data) ? tauxQ.data.data : [];
  const vehicules = Array.isArray(vehiculesQ.data?.data) ? vehiculesQ.data.data : [];
  const declarations = Array.isArray(declarationsQ.data?.data) ? declarationsQ.data.data : [];

  const getEffectiveEligible = useCallback(
    (v) => (Object.prototype.hasOwnProperty.call(eligibleOverrides, v.id) ? eligibleOverrides[v.id] : Boolean(v.eligible)),
    [eligibleOverrides]
  );

  const eligibleVisibleCount = useMemo(
    () => vehicules.filter((v) => getEffectiveEligible(v)).length,
    [vehicules, getEffectiveEligible]
  );
  const totalVisibleCount = vehicules.length;
  const allVisibleEligible = totalVisibleCount > 0 && eligibleVisibleCount === totalVisibleCount;
  const noneVisibleEligible = eligibleVisibleCount === 0;

  const eligibleForCalcul = useMemo(
    () => vehicules.filter((v) => v.eligible).map((v) => String(v.vehicule_sf_id).trim()),
    [vehicules]
  );

  useEffect(() => {
    setIncludedSfIds(null);
  }, [vehiculeFilterFiliale, vehiculeFilterType]);

  useEffect(() => {
    if (!headerEligibleRef.current) return;
    headerEligibleRef.current.indeterminate = !allVisibleEligible && !noneVisibleEligible;
  }, [allVisibleEligible, noneVisibleEligible]);

  const toggleVehiculeInclus = useCallback(
    (rawId) => {
      const idStr = String(rawId).trim();
      const all = eligibleForCalcul;
      if (!all.includes(idStr)) return;
      if (includedSfIds === null) {
        const next = all.filter((i) => i !== idStr);
        setIncludedSfIds(next);
        return;
      }
      if (includedSfIds.includes(idStr)) {
        const next = includedSfIds.filter((i) => i !== idStr);
        setIncludedSfIds(next.length === 0 ? [] : next);
      } else {
        const next = [...includedSfIds, idStr];
        if (next.length === all.length && all.every((i) => next.includes(i))) setIncludedSfIds(null);
        else setIncludedSfIds(next);
      }
    },
    [eligibleForCalcul, includedSfIds]
  );

  const vehiculeChecked = useCallback(
    (idStr) => {
      const id = String(idStr).trim();
      if (includedSfIds === null) return eligibleForCalcul.includes(id);
      return includedSfIds.includes(id);
    },
    [includedSfIds, eligibleForCalcul]
  );

  const handleCalculer = async () => {
    setCalculLoading(true);
    try {
      const { debut, fin } = toPeriodBounds(periodicite, annee, periodValue);
      const body = {
        periode_debut: debut,
        periode_fin: fin,
        periodicite,
        filiale: filiale === 'Toutes' ? null : filiale,
        fournisseurs,
        annee_taux: Number(annee),
      };
      if (Array.isArray(includedSfIds)) {
        body.vehicule_sf_ids = includedSfIds;
      }
      const res = await fetch(`${API_BASE}/api/ticpe/calculer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur calcul');
      setCalcul(data);
      setLastCalculParams(body);
    } catch (e) {
      alert(e.message || 'Erreur calcul TICPE');
    } finally {
      setCalculLoading(false);
    }
  };

  const openDetailMois = async (moisKey) => {
    if (!calcul?.vehicule_sf_ids_utilises?.length) {
      alert('Recalculez le TICPE pour obtenir la liste des véhicules (ids Salesforce).');
      return;
    }
    const { debut, fin } = monthBoundsFromKey(moisKey);
    if (!debut || !fin) return;
    setDetailMoisKey(moisKey);
    setDetailMoisOpen(true);
    setDetailMoisData(null);
    setDetailMoisError(null);
    setDetailMoisLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ticpe/detail-mois`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debut,
          fin,
          vehicules: calcul.vehicule_sf_ids_utilises,
          fournisseurs,
          annee_taux: Number(annee),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur détail mois');
      setDetailMoisData(data);
    } catch (e) {
      setDetailMoisError(e.message || 'Erreur');
    } finally {
      setDetailMoisLoading(false);
    }
  };

  const exportDetailMoisExcel = async () => {
    if (!calcul?.vehicule_sf_ids_utilises?.length || !detailMoisKey) return;
    const { debut, fin } = monthBoundsFromKey(detailMoisKey);
    const res = await fetch(`${API_BASE}/api/ticpe/detail-mois/export-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debut,
        fin,
        vehicules: calcul.vehicule_sf_ids_utilises,
        fournisseurs,
        annee_taux: Number(annee),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Export impossible');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticpe_detail_mois_${debut}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSyntheseVehiculeExcel = async () => {
    if (!calcul?.par_vehicule?.length) return;
    const res = await fetch(`${API_BASE}/api/ticpe/calculer/export-par-vehicule-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periode_debut: calcul.periode_debut,
        periode_fin: calcul.periode_fin,
        par_vehicule: calcul.par_vehicule,
        totaux_par_vehicule: calcul.totaux_par_vehicule,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Export impossible');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticpe_synthese_vehicule_${calcul.periode_debut}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportComplet = async (format) => {
    if (!lastCalculParams) return;
    const res = await fetch(`${API_BASE}/api/ticpe/export/complet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lastCalculParams, format }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Export complet impossible');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticpe_export_complet_${lastCalculParams.periode_debut}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncVehicules = async () => {
    const res = await fetch(`${API_BASE}/api/ticpe/vehicules/sync`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erreur sync véhicules');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['ticpe-vehicules'] });
  };

  const patchEligible = async (row, nextEligible) => {
    setEligibleOverrides((prev) => ({ ...prev, [row.id]: Boolean(nextEligible) }));
    const res = await fetch(`${API_BASE}/api/ticpe/vehicules/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eligible: Boolean(nextEligible),
        date_debut_eligibilite: row.date_debut_eligibilite,
        date_fin_eligibilite: row.date_fin_eligibilite,
        notes: row.notes,
      }),
    });
    if (!res.ok) {
      setEligibleOverrides((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return false;
    }
    return true;
  };

  const toggleEligible = async (row) => {
    const nextEligible = !getEffectiveEligible(row);
    await patchEligible(row, nextEligible);
    await queryClient.invalidateQueries({ queryKey: ['ticpe-vehicules'] });
  };

  const bulkSetEligible = async (targetEligible) => {
    const targets = vehicules.filter((v) => getEffectiveEligible(v) !== Boolean(targetEligible));
    if (!targets.length) return;
    await Promise.all(targets.map((v) => patchEligible(v, targetEligible)));
    await queryClient.invalidateQueries({ queryKey: ['ticpe-vehicules'] });
  };

  const applyDefaultEligibleSelection = async () => {
    const shouldBeEligible = (v) => ['Tracteur', 'Véhicule de Livraison'].includes(String(v.type_vehicule || '').trim());
    const targets = vehicules.filter((v) => getEffectiveEligible(v) !== shouldBeEligible(v));
    if (!targets.length) return;
    await Promise.all(targets.map((v) => patchEligible(v, shouldBeEligible(v))));
    await queryClient.invalidateQueries({ queryKey: ['ticpe-vehicules'] });
  };

  const saveDeclaration = async () => {
    if (!calcul) return;
    const res = await fetch(`${API_BASE}/api/ticpe/declarations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periode_debut: calcul.periode_debut,
        periode_fin: calcul.periode_fin,
        periodicite,
        filiale: calcul.filiale,
        statut: 'brouillon',
        total_litres: calcul.total_litres,
        total_remboursement: calcul.total_remboursement,
        taux_cents: calcul.taux_cents,
        nb_transactions: calcul.nb_transactions,
        nb_vehicules: calcul.nb_vehicules,
        calcul,
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Erreur sauvegarde');
    await queryClient.invalidateQueries({ queryKey: ['ticpe-declarations'] });
    alert(`Déclaration sauvegardée (${data.data.reference})`);
  };

  const updateStatut = async (id, statut) => {
    await fetch(`${API_BASE}/api/ticpe/declarations/${id}/statut`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    });
    await queryClient.invalidateQueries({ queryKey: ['ticpe-declarations'] });
  };

  const years = [2022, 2023, 2024, 2025];
  const tauxAnnee = useMemo(
    () => taux.find((t) => Number(t.annee) === Number(annee) && String(t.carburant) === 'gazole'),
    [taux, annee]
  );

  const moisLabel = (row) => row.mois_label || row.mois;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Module TICPE</h1>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'calcul', label: 'Calcul & Déclaration' },
          { key: 'vehicules', label: 'Véhicules éligibles' },
          { key: 'taux', label: 'Taux TICPE' },
          { key: 'historique', label: 'Historique déclarations' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-2 text-sm ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'calcul' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <label className="text-sm">
                <div className="mb-1 text-xs text-gray-600">Périodicité</div>
                <select className="w-full rounded border px-2 py-2" value={periodicite} onChange={(e) => setPeriodicite(e.target.value)}>
                  <option value="mensuel">Mensuel</option>
                  <option value="trimestriel">Trimestriel</option>
                  <option value="semestriel">Semestriel</option>
                  <option value="annuel">Annuel</option>
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-1 text-xs text-gray-600">Année</div>
                <select className="w-full rounded border px-2 py-2" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              {periodicite === 'mensuel' && (
                <label className="text-sm">
                  <div className="mb-1 text-xs text-gray-600">Mois</div>
                  <select className="w-full rounded border px-2 py-2" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)}>
                    {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                  </select>
                </label>
              )}
              {periodicite === 'trimestriel' && (
                <label className="text-sm">
                  <div className="mb-1 text-xs text-gray-600">Trimestre</div>
                  <select className="w-full rounded border px-2 py-2" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)}>
                    <option value="1">T1</option><option value="2">T2</option><option value="3">T3</option><option value="4">T4</option>
                  </select>
                </label>
              )}
              {periodicite === 'semestriel' && (
                <label className="text-sm">
                  <div className="mb-1 text-xs text-gray-600">Semestre</div>
                  <select className="w-full rounded border px-2 py-2" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)}>
                    <option value="1">S1</option><option value="2">S2</option>
                  </select>
                </label>
              )}
              <label className="text-sm">
                <div className="mb-1 text-xs text-gray-600">Société</div>
                <select className="w-full rounded border px-2 py-2" value={filiale} onChange={(e) => setFiliale(e.target.value)}>
                  <option>Toutes</option>
                  <option>D & J transport</option>
                  <option>TPS TSMC Express</option>
                </select>
              </label>
              <div className="md:col-span-2 lg:col-span-2">
                <div className="mb-1 text-xs text-gray-600">Fournisseurs</div>
                <div className="grid grid-cols-2 gap-1 rounded border p-2 text-sm">
                  {FOURNISSEURS_DEFAULT.map((f) => (
                    <label key={f} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={fournisseurs.includes(f)}
                        onChange={(e) =>
                          setFournisseurs((prev) =>
                            e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)
                          )
                        }
                      />
                      <span>{f}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <details className="mt-3 rounded border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">
                Véhicules inclus au calcul ({includedSfIds === null ? eligibleForCalcul.length : includedSfIds.length} / {eligibleForCalcul.length} éligibles affichés)
              </summary>
              <p className="mt-2 text-xs text-slate-600">
                Par défaut, tous les véhicules marqués éligibles sont inclus. Décochez pour exclure. Les ids sont transmis au filtre Salesforce <code className="rounded bg-white px-1">Vehicule__c IN (...)</code> par lots.
              </p>
              <div className="mt-2 max-h-48 overflow-auto">
                {vehicules
                  .filter((v) => v.eligible)
                  .map((v) => (
                    <label key={v.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 py-1">
                      <input
                        type="checkbox"
                        checked={vehiculeChecked(v.vehicule_sf_id)}
                        onChange={() => toggleVehiculeInclus(v.vehicule_sf_id)}
                      />
                      <span>{v.immatriculation}</span>
                      <span className="text-xs text-slate-500">{v.filiale || '—'}</span>
                    </label>
                  ))}
              </div>
            </details>

            <div className="mt-3">
              <button type="button" onClick={handleCalculer} className="rounded bg-blue-600 px-4 py-2 text-white">
                {calculLoading ? 'Calcul...' : 'Calculer'}
              </button>
            </div>
          </div>

          {calcul && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
                <div className="mb-2 font-medium text-slate-700">
                  Taux appliqué : {toNum(calcul.taux_cents, 0).toFixed(2)} c€/L
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                  <Kpi title="Véhicules avec transactions" value={String(calcul.nb_vehicules)} />
                  <Kpi title="Véhicules dans le filtre IN" value={String(calcul.nb_vehicules_eligibles_inclus ?? calcul.vehicule_sf_ids_utilises?.length ?? '—')} />
                  <Kpi title="Volume total gazole (litres)" value={toNum(calcul.total_litres).toFixed(3)} />
                  <Kpi title="Remboursement estimé (€)" value={toNum(calcul.total_remboursement).toFixed(2)} />
                  <Kpi title="Nombre de transactions" value={String(calcul.nb_transactions)} />
                </div>
                {calcul.debug_ticpe_vehicules?.ids_sans_transaction?.length > 0 && (
                  <button
                    type="button"
                    className="mt-2 text-left text-xs text-amber-800 underline"
                    onClick={() => setNoTxModalOpen(true)}
                  >
                    {calcul.debug_ticpe_vehicules.ids_sans_transaction.length} véhicule(s) inclus dans le filtre mais sans transaction sur la période.
                  </button>
                )}
              </div>

              <SimpleTable
                title="Par fournisseur"
                headers={['Fournisseur', 'Litres', 'Remboursement', 'Nb transactions']}
                rows={(calcul.par_fournisseur || []).map((r) => [r.fournisseur, toNum(r.litres).toFixed(3), toNum(r.remboursement).toFixed(2), String(r.nb_tx)])}
              />
              <SimpleTable
                title="Par société"
                headers={['Société', 'Litres', 'Remboursement', 'Nb transactions']}
                rows={(calcul.par_filiale || []).map((r) => [r.filiale, toNum(r.litres).toFixed(3), toNum(r.remboursement).toFixed(2), String(r.nb_tx)])}
              />

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="mb-2 font-semibold text-slate-800">Par mois</h3>
                <p className="mb-2 text-xs text-slate-600">Cliquez sur une ligne pour le détail par véhicule.</p>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Mois', 'Nb véhicules', 'Km parcourus', 'Litres', 'Remboursement'].map((h) => (
                          <th key={h} className="px-2 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(calcul.par_mois || []).map((r) => (
                        <tr
                          key={r.mois}
                          className="cursor-pointer border-t hover:bg-blue-50"
                          onClick={() => openDetailMois(r.mois)}
                          onKeyDown={(e) => e.key === 'Enter' && openDetailMois(r.mois)}
                          role="button"
                          tabIndex={0}
                        >
                          <td className="px-2 py-2">{moisLabel(r)}</td>
                          <td className="px-2 py-2">{toNum(r.nb_vehicules, 0)}</td>
                          <td className="px-2 py-2">{formatKmWithUnit(r.km_parcourus)}</td>
                          <td className="px-2 py-2">{toNum(r.litres).toFixed(3)}</td>
                          <td className="px-2 py-2">{toNum(r.remboursement).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">Synthèse par véhicule sur la période</h3>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-3 py-1 text-sm"
                    onClick={exportSyntheseVehiculeExcel}
                    disabled={!calcul.par_vehicule?.length}
                  >
                    Exporter ce tableau Excel
                  </button>
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {[
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
                        ].map((h) => (
                          <th key={h} className="px-2 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(calcul.par_vehicule || []).map((r) => (
                        <tr key={r.vehicule_sf_id} className="border-t">
                          <td className="px-2 py-2">{r.immatriculation || '—'}</td>
                          <td className="px-2 py-2">{r.type_vehicule || '—'}</td>
                          <td className="px-2 py-2">{r.filiale || '—'}</td>
                          <td className="px-2 py-2">{toNum(r.nb_mois, 0)}</td>
                          <td className="px-2 py-2">{formatKm(r.premier_km)}</td>
                          <td className="px-2 py-2">{formatKm(r.dernier_km)}</td>
                          <td className="px-2 py-2">{formatKm(r.km_parcourus)}</td>
                          <td className="px-2 py-2">{toNum(r.volume_total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2">
                            {r.conso_l100 != null && Number.isFinite(r.conso_l100)
                              ? toNum(r.conso_l100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                              : 'N/A'}
                          </td>
                          <td className="px-2 py-2">{toNum(r.remboursement).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
                        <td className="px-2 py-2" colSpan={6}>Totaux</td>
                        <td className="px-2 py-2">{formatKm(calcul.totaux_par_vehicule?.km_parcourus_total)}</td>
                        <td className="px-2 py-2">
                          {toNum(calcul.totaux_par_vehicule?.volume_total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2">
                          {calcul.totaux_par_vehicule?.conso_moyenne_l100 != null && Number.isFinite(calcul.totaux_par_vehicule?.conso_moyenne_l100)
                            ? toNum(calcul.totaux_par_vehicule.conso_moyenne_l100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                            : 'N/A'}
                        </td>
                        <td className="px-2 py-2">
                          {toNum(calcul.totaux_par_vehicule?.remboursement_total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveDeclaration} className="rounded bg-emerald-600 px-3 py-2 text-white">💾 Sauvegarder déclaration</button>
                <button
                  type="button"
                  onClick={() => exportComplet('excel')}
                  disabled={!calcul || !lastCalculParams}
                  className="rounded bg-indigo-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📥 Export complet Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportComplet('pdf')}
                  disabled={!calcul || !lastCalculParams}
                  className="rounded bg-indigo-700 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📄 Export complet PDF
                </button>
                <button type="button" onClick={() => alert('Sauvegarder une déclaration d’abord.')} className="rounded bg-slate-700 px-3 py-2 text-white">📥 Export Excel</button>
                <button type="button" onClick={() => alert('Sauvegarder une déclaration d’abord.')} className="rounded bg-slate-700 px-3 py-2 text-white">📄 Export PDF</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'vehicules' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={syncVehicules} className="rounded bg-blue-600 px-3 py-2 text-white">🔄 Synchroniser depuis Salesforce</button>
            <button type="button" onClick={() => bulkSetEligible(true)} className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700">✓ Tout activer</button>
            <button type="button" onClick={() => bulkSetEligible(false)} className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-rose-700">✗ Tout désactiver</button>
            <button type="button" onClick={applyDefaultEligibleSelection} className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700">🔄 Sélection par défaut</button>
            <span className="text-sm text-slate-600">
              {eligibleVisibleCount} véhicules éligibles sur {totalVisibleCount} total
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <select className="rounded border px-2 py-1" value={vehiculeFilterFiliale} onChange={(e) => setVehiculeFilterFiliale(e.target.value)}>
              <option>Toutes</option>
              {[...new Set(vehicules.map((v) => v.filiale).filter(Boolean))].map((f) => <option key={f}>{f}</option>)}
            </select>
            <select className="rounded border px-2 py-1" value={vehiculeFilterType} onChange={(e) => setVehiculeFilterType(e.target.value)}>
              <option>Tous</option>
              {[...new Set(vehicules.map((v) => v.type_vehicule).filter(Boolean))].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Immatriculation', 'Filiale', 'Type', 'Statut SF'].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                  <th className="px-2 py-2 text-left">
                    <label className="inline-flex items-center gap-2">
                      <input
                        ref={headerEligibleRef}
                        type="checkbox"
                        checked={allVisibleEligible}
                        onChange={(e) => bulkSetEligible(e.target.checked)}
                      />
                      <span>Éligible</span>
                    </label>
                  </th>
                  {['Date début', 'Date fin', 'Notes', 'Actions'].map((h) => (
                    <th key={h} className="px-2 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicules.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-2 py-2">{v.immatriculation}</td>
                    <td className="px-2 py-2">{v.filiale || '—'}</td>
                    <td className="px-2 py-2">{v.type_vehicule || '—'}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.actif_salesforce ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {v.actif_salesforce ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={getEffectiveEligible(v)} onChange={() => toggleEligible(v)} />
                    </td>
                    <td className="px-2 py-2">{v.date_debut_eligibilite || '—'}</td>
                    <td className="px-2 py-2">{v.date_fin_eligibilite || '—'}</td>
                    <td className="px-2 py-2">{v.notes || '—'}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">Toggle rapide</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'taux' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm">
            {tauxAnnee ? (
              <span className="text-emerald-700">Taux disponible pour {annee}: {toNum(tauxAnnee.taux_cents).toFixed(2)} c€/L</span>
            ) : (
              <span className="text-red-700">Avertissement: taux manquant pour l'année {annee}</span>
            )}
          </div>
          <TauxTable taux={taux} onSaved={() => queryClient.invalidateQueries({ queryKey: ['ticpe-taux'] })} />
        </div>
      )}

      {tab === 'historique' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <SimpleTable
            title="Historique déclarations"
            headers={['Référence', 'Période', 'Société', 'Litres', 'Remboursement', 'Statut']}
            rows={declarations.map((d) => [
              d.reference,
              `${d.periode_debut} -> ${d.periode_fin}`,
              d.filiale || 'Toutes',
              toNum(d.total_litres).toFixed(3),
              `${toNum(d.total_remboursement).toFixed(2)} €`,
              d.statut,
            ])}
            actions={declarations.map((d) => (
              <div key={d.id} className="flex flex-wrap gap-1">
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => window.open(`${API_BASE}/api/ticpe/declarations/${d.id}/export/excel`, '_blank')}>Excel</button>
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => window.open(`${API_BASE}/api/ticpe/declarations/${d.id}/export/pdf`, '_blank')}>PDF</button>
                <select className="rounded border px-2 py-1 text-xs" value={d.statut} onChange={(e) => updateStatut(d.id, e.target.value)}>
                  <option value="brouillon">Brouillon</option>
                  <option value="validee">Validée</option>
                  <option value="soumise">Soumise</option>
                </select>
              </div>
            ))}
          />
        </div>
      )}

      {detailMoisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold">
                Détail par véhicule
                {detailMoisData?.mois_label ? ` — ${detailMoisData.mois_label}` : detailMoisKey ? ` — ${detailMoisKey}` : ''}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1 text-sm"
                  onClick={exportDetailMoisExcel}
                  disabled={detailMoisLoading || !detailMoisData}
                >
                  Exporter ce détail en Excel
                </button>
                <button type="button" className="rounded bg-slate-200 px-3 py-1 text-sm" onClick={() => setDetailMoisOpen(false)}>Fermer</button>
              </div>
            </div>
            <div className="overflow-auto p-4" style={{ maxHeight: 'calc(90vh - 5rem)' }}>
              {detailMoisLoading && <p className="text-sm text-slate-600">Chargement…</p>}
              {detailMoisError && <p className="text-sm text-red-700">{detailMoisError}</p>}
              {detailMoisData && !detailMoisLoading && (
                <>
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {[
                          'Immatriculation',
                          '1er kilométrage',
                          'Dernier kilométrage',
                          'Km parcourus',
                          'Volume total (L)',
                          'L/100 km',
                          'Remboursement (€)',
                        ].map((h) => (
                          <th key={h} className="px-2 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detailMoisData.lignes.map((L, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-2">{L.immatriculation || '—'}</td>
                          <td className="px-2 py-2">{formatKm(L.premier_km)}</td>
                          <td className="px-2 py-2">{formatKm(L.dernier_km)}</td>
                          <td className="px-2 py-2">{formatKm(L.km_parcourus)}</td>
                          <td className="px-2 py-2">{toNum(L.volume_total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-2 py-2">
                            {L.consommation_l100 != null && Number.isFinite(L.consommation_l100)
                              ? L.consommation_l100.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                              : 'N/A'}
                          </td>
                          <td className="px-2 py-2">{toNum(L.remboursement).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
                        <td className="px-2 py-2" colSpan={4}>Totaux</td>
                        <td className="px-2 py-2">
                          {toNum(detailMoisData.totaux.volume_total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2">
                          {detailMoisData.totaux.conso_moyenne_ponderee != null && Number.isFinite(detailMoisData.totaux.conso_moyenne_ponderee)
                            ? detailMoisData.totaux.conso_moyenne_ponderee.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                            : 'N/A'}
                          <span className="ml-1 text-xs font-normal text-slate-500">(pondérée)</span>
                        </td>
                        <td className="px-2 py-2">
                          {toNum(detailMoisData.totaux.remboursement_total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {noTxModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setNoTxModalOpen(false)}
        >
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold">Véhicules sans transaction sur la période</h2>
              <button
                type="button"
                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                onClick={() => setNoTxModalOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto p-4">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      'Immatriculation',
                      'Filiale',
                      'Type de véhicule',
                      'Éligible depuis',
                      'Raison probable',
                    ].map((h) => (
                      <th key={h} className="px-2 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(calcul?.debug_ticpe_vehicules?.vehicules_sans_transaction || []).map((v) => (
                    <tr key={v.vehicule_sf_id} className="border-t">
                      <td className="px-2 py-2">{v.immatriculation || '—'}</td>
                      <td className="px-2 py-2">{v.filiale || '—'}</td>
                      <td className="px-2 py-2">{v.type_vehicule || '—'}</td>
                      <td className="px-2 py-2">{v.date_debut_eligibilite || '—'}</td>
                      <td className="px-2 py-2">{v.raison_probable || 'Aucune transaction gazole trouvée'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TauxTable({ taux, onSaved }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ taux_cents: '', reference_legale: '', description: '' });

  const startEdit = (row) => {
    setEditingId(row.id);
    setDraft({
      taux_cents: String(row.taux_cents ?? ''),
      reference_legale: row.reference_legale || '',
      description: row.description || '',
    });
  };

  const save = async (row) => {
    const res = await fetch(`${API_BASE}/api/ticpe/taux/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annee: row.annee,
        carburant: row.carburant,
        taux_cents: Number(draft.taux_cents),
        description: draft.description || null,
        reference_legale: draft.reference_legale,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erreur');
      return;
    }
    setEditingId(null);
    onSaved();
  };

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {['Année', 'Carburant', 'Taux (c€/L)', 'Taux (€/L)', 'Description', 'Référence légale', ''].map((h) => (
              <th key={h || 'a'} className="px-2 py-2 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {taux.map((row) => (
            <tr key={row.id} className="border-t">
              {editingId === row.id ? (
                <>
                  <td className="px-2 py-2">{row.annee}</td>
                  <td className="px-2 py-2">{row.carburant}</td>
                  <td className="px-2 py-2">
                    <input
                      className="w-28 rounded border px-1"
                      value={draft.taux_cents}
                      onChange={(e) => setDraft((d) => ({ ...d, taux_cents: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-2">{(toNum(draft.taux_cents) / 100).toFixed(4)}</td>
                  <td className="px-2 py-2">
                    <input
                      className="w-full min-w-[120px] rounded border px-1"
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className="w-full min-w-[200px] rounded border px-1 text-xs"
                      placeholder="URL ou texte"
                      value={draft.reference_legale}
                      onChange={(e) => setDraft((d) => ({ ...d, reference_legale: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button type="button" className="mr-1 rounded bg-blue-600 px-2 py-1 text-white text-xs" onClick={() => save(row)}>Enregistrer</button>
                    <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setEditingId(null)}>Annuler</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-2 py-2">
                    {isHttpUrl(row.reference_legale) ? (
                      <button
                        type="button"
                        className="text-blue-700 underline"
                        onClick={() => window.open(row.reference_legale.trim(), '_blank', 'noopener,noreferrer')}
                      >
                        {row.annee}
                      </button>
                    ) : (
                      <span>{row.annee}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">{row.carburant}</td>
                  <td className="px-2 py-2">{toNum(row.taux_cents).toFixed(4)}</td>
                  <td className="px-2 py-2">{(toNum(row.taux_cents) / 100).toFixed(4)}</td>
                  <td className="px-2 py-2 max-w-xs truncate" title={row.description || ''}>{row.description || '—'}</td>
                  <td className="px-2 py-2 max-w-xs">
                    {isHttpUrl(row.reference_legale) ? (
                      <a href={row.reference_legale.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-all">
                        Lien
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">{row.reference_legale || '— (éditer pour saisir)'}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(row)}>Éditer</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ title, value }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function SimpleTable({ title, headers, rows, actions }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-semibold text-slate-800">{title}</h3>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-2 py-2 text-left">{h}</th>
              ))}
              {actions && <th className="px-2 py-2 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t">
                {r.map((c, i) => (
                  <td key={i} className="px-2 py-2">{c}</td>
                ))}
                {actions && <td className="px-2 py-2">{actions[idx]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
