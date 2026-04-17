import { useEffect, useMemo, useState } from 'react';
import { Calculator, RefreshCw, Save, TrendingUp } from 'lucide-react';
import API_BASE from '../../config/api';
const money = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const defaultForm = {
  month: thisMonth(),
  chargeur: '',
  societe: '',
  coutParTournee: 0,
  prixParColisLivre: 0,
  prixParPointLivre: 0,
  montantBranding: 0,
  prixParPointCollecte: 0,
  prixParColisCollecte: 0,
  caVouluParTournee: 0
};

export default function AnalyseFinanciereDirection() {
  const [month, setMonth] = useState(thisMonth());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState({ data: [], summary: {}, tournees: {}, tourneeDetails: {} });
  const [form, setForm] = useState(defaultForm);
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [selectedTourneeId, setSelectedTourneeId] = useState(null);

  const chargeurOptions = useMemo(
    () => [...new Set((analysis.data || []).map((r) => r.chargeur))].sort(),
    [analysis.data]
  );
  const societeOptions = useMemo(
    () => [...new Set((analysis.data || []).map((r) => r.societe))].sort(),
    [analysis.data]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/direction/finance/analyse?month=${encodeURIComponent(month)}`);
      if (!resp.ok) throw new Error('Erreur chargement analyse financière');
      const data = await resp.json();
      setAnalysis(data || { data: [], summary: {}, tournees: {}, tourneeDetails: {} });
      setSelectedRowKey(null);
      setSelectedTourneeId(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const saveParams = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        month,
        chargeur: String(form.chargeur || '').trim(),
        societe: String(form.societe || '').trim()
      };
      if (!payload.chargeur || !payload.societe) {
        throw new Error('Chargeur et société sont requis.');
      }
      const resp = await fetch(`${API_BASE}/api/direction/finance/params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur sauvegarde paramètres');
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const editRow = (r) => {
    setForm({
      month,
      chargeur: r.chargeur,
      societe: r.societe,
      coutParTournee: r.params?.coutParTournee || 0,
      prixParColisLivre: r.params?.prixParColisLivre || 0,
      prixParPointLivre: r.params?.prixParPointLivre || 0,
      montantBranding: r.params?.montantBranding || 0,
      prixParPointCollecte: r.params?.prixParPointCollecte || 0,
      prixParColisCollecte: r.params?.prixParColisCollecte || 0,
      caVouluParTournee: r.params?.caVouluParTournee || 0
    });
  };

  const makeRowKey = (r) => `${r.month}__${r.chargeur}__${r.societe}`;
  const selectedRow = (analysis.data || []).find((r) => makeRowKey(r) === selectedRowKey) || null;
  const selectedTournees = selectedRowKey ? analysis.tournees?.[selectedRowKey] || [] : [];
  const selectedTourneeDetails = selectedRowKey
    ? analysis.tourneeDetails?.[selectedRowKey]?.[selectedTourneeId || ''] || []
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Direction - Analyse financière</h1>
          <p className="text-gray-500">Rentabilité par chargeur et société (saisie mensuelle)</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setForm((f) => ({ ...f, month: e.target.value }));
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card label="Tournées" value={analysis.summary?.nbTournees || 0} />
        <Card label="Colis livrés" value={analysis.summary?.colisLivres || 0} />
        <Card label="PDL livrés" value={analysis.summary?.pdlLivres || 0} />
        <Card label="Coûts totaux" value={`${money(analysis.summary?.coutTotal || 0)} €`} />
        <Card label="Marge unitaire" value={`${money(analysis.summary?.margeUnitaire || 0)} €`} tone="green" />
        <Card label="Marge cible tournée" value={`${money(analysis.summary?.margeCibleTournee || 0)} €`} tone="blue" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-600" />
          Paramètres financiers mensuels
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <InputSelect
            label="Chargeur"
            value={form.chargeur}
            onChange={(v) => setForm((f) => ({ ...f, chargeur: v }))}
            options={chargeurOptions}
          />
          <InputSelect
            label="Société"
            value={form.societe}
            onChange={(v) => setForm((f) => ({ ...f, societe: v }))}
            options={societeOptions}
          />
          <InputNumber label="Coût / tournée" value={form.coutParTournee} onChange={(v) => setForm((f) => ({ ...f, coutParTournee: v }))} />
          <InputNumber label="Prix / colis livré" value={form.prixParColisLivre} onChange={(v) => setForm((f) => ({ ...f, prixParColisLivre: v }))} />
          <InputNumber label="Prix / point livré" value={form.prixParPointLivre} onChange={(v) => setForm((f) => ({ ...f, prixParPointLivre: v }))} />
          <InputNumber label="Branding (mensuel)" value={form.montantBranding} onChange={(v) => setForm((f) => ({ ...f, montantBranding: v }))} />
          <InputNumber label="Prix / point collecte" value={form.prixParPointCollecte} onChange={(v) => setForm((f) => ({ ...f, prixParPointCollecte: v }))} />
          <InputNumber label="Prix / colis collecté" value={form.prixParColisCollecte} onChange={(v) => setForm((f) => ({ ...f, prixParColisCollecte: v }))} />
          <InputNumber label="CA voulu / tournée" value={form.caVouluParTournee} onChange={(v) => setForm((f) => ({ ...f, caVouluParTournee: v }))} />
        </div>
        <div className="mt-4">
          <button
            type="button"
            disabled={saving}
            onClick={saveParams}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            Sauvegarder paramètres
          </button>
        </div>
      </div>

      {!selectedRowKey && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Résultats rentabilité (hybride) - Niveau chargeur/société
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Chargeur</Th>
                  <Th>Société</Th>
                  <ThRight>Tournées</ThRight>
                  <ThRight>Colis livrés</ThRight>
                  <ThRight>PDL livrés</ThRight>
                  <ThRight>Coût total</ThRight>
                  <ThRight>CA unitaire</ThRight>
                  <ThRight>CA cible tournée</ThRight>
                  <ThRight>Marge unitaire</ThRight>
                  <ThRight>Marge cible</ThRight>
                  <ThRight>Écart marge</ThRight>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(analysis.data || []).map((r) => (
                  <tr key={makeRowKey(r)} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-indigo-600 hover:underline font-medium"
                        onClick={() => {
                          setSelectedRowKey(makeRowKey(r));
                          setSelectedTourneeId(null);
                        }}
                      >
                        {r.chargeur}
                      </button>
                    </td>
                    <td className="px-3 py-2">{r.societe}</td>
                    <td className="px-3 py-2 text-right">{r.nbTournees}</td>
                    <td className="px-3 py-2 text-right">{r.colisLivres}</td>
                    <td className="px-3 py-2 text-right">{r.pdlLivres}</td>
                    <td className="px-3 py-2 text-right">{money(r.coutTotal)} €</td>
                    <td className="px-3 py-2 text-right">{money(r.caUnitaire)} €</td>
                    <td className="px-3 py-2 text-right">{money(r.caCibleTournee)} €</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.margeUnitaire >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {money(r.margeUnitaire)} €
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${r.margeCibleTournee >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {money(r.margeCibleTournee)} €
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${r.ecartMarge >= 0 ? 'text-indigo-700' : 'text-orange-700'}`}>
                      {money(r.ecartMarge)} €
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-indigo-600 hover:underline mr-3" onClick={() => editRow(r)}>
                        Éditer paramètres
                      </button>
                      <button
                        type="button"
                        className="text-emerald-600 hover:underline"
                        onClick={() => {
                          setSelectedRowKey(makeRowKey(r));
                          setSelectedTourneeId(null);
                        }}
                      >
                        Voir tournées
                      </button>
                    </td>
                  </tr>
                ))}
                {(analysis.data || []).length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                      Aucune donnée pour ce mois.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRowKey && !selectedTourneeId && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              Nouvelle feuille - Synthèse par tournée ({selectedRow?.chargeur} / {selectedRow?.societe})
            </h2>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setSelectedRowKey(null)}
            >
              Retour aux chargeurs
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Tournée</Th>
                  <ThRight>Courses</ThRight>
                  <ThRight>Colis livrés</ThRight>
                  <ThRight>PDL livrés</ThRight>
                  <ThRight>Coût</ThRight>
                  <ThRight>CA unitaire</ThRight>
                  <ThRight>Marge</ThRight>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedTournees.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{t.date || '-'}</td>
                    <td className="px-3 py-2 font-medium">{t.tournee}</td>
                    <td className="px-3 py-2 text-right">{t.nbCourses}</td>
                    <td className="px-3 py-2 text-right">{t.colisLivres}</td>
                    <td className="px-3 py-2 text-right">{t.pdlLivres}</td>
                    <td className="px-3 py-2 text-right">{money(t.coutTotal)} €</td>
                    <td className="px-3 py-2 text-right">{money(t.caUnitaire)} €</td>
                    <td className={`px-3 py-2 text-right font-semibold ${t.margeUnitaire >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {money(t.margeUnitaire)} €
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-indigo-600 hover:underline" onClick={() => setSelectedTourneeId(t.id)}>
                        Voir détail
                      </button>
                    </td>
                  </tr>
                ))}
                {selectedTournees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      Aucune tournée disponible pour ce scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRowKey && selectedTourneeId && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              Détail tournée ({selectedTournees.find((t) => t.id === selectedTourneeId)?.tournee || selectedTourneeId})
            </h2>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setSelectedTourneeId(null)}
            >
              Retour aux tournées
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Chauffeur</Th>
                  <Th>Véhicule</Th>
                  <ThRight>PDL PEC</ThRight>
                  <ThRight>PDL livrés</ThRight>
                  <ThRight>Colis PEC</ThRight>
                  <ThRight>Colis livrés</ThRight>
                  <ThRight>Coût</ThRight>
                  <ThRight>CA unitaire</ThRight>
                  <ThRight>Marge</ThRight>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedTourneeDetails.map((d, idx) => (
                  <tr key={`${d.date}-${d.chauffeur}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{d.date || '-'}</td>
                    <td className="px-3 py-2">{d.chauffeur}</td>
                    <td className="px-3 py-2">{d.vehicule}</td>
                    <td className="px-3 py-2 text-right">{d.pdlPec}</td>
                    <td className="px-3 py-2 text-right">{d.pdlLivres}</td>
                    <td className="px-3 py-2 text-right">{d.colisPec}</td>
                    <td className="px-3 py-2 text-right">{d.colisLivres}</td>
                    <td className="px-3 py-2 text-right">{money(d.coutTotal)} €</td>
                    <td className="px-3 py-2 text-right">{money(d.caUnitaire)} €</td>
                    <td className={`px-3 py-2 text-right font-semibold ${d.margeUnitaire >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {money(d.margeUnitaire)} €
                    </td>
                  </tr>
                ))}
                {selectedTourneeDetails.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      Aucun détail pour cette tournée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, tone = 'indigo' }) {
  const toneClass = tone === 'green' ? 'text-emerald-600' : tone === 'blue' ? 'text-blue-600' : 'text-indigo-600';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function InputNumber({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
      />
    </div>
  );
}

function InputSelect({ label, value, onChange, options }) {
  const [freeText, setFreeText] = useState(value || '');
  useEffect(() => setFreeText(value || ''), [value]);
  const listId = `list-${String(label).toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        list={listId}
        value={freeText}
        onChange={(e) => {
          setFreeText(e.target.value);
          onChange(e.target.value);
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 text-left font-semibold text-gray-600">{children}</th>;
}

function ThRight({ children }) {
  return <th className="px-3 py-2 text-right font-semibold text-gray-600">{children}</th>;
}
