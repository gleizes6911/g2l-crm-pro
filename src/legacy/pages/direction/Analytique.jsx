import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import API_BASE from '../../config/api';
import { collectAnalytiqueRapportData } from '../../utils/analytiqueRapportData';
import { exportAnalytiqueMetierRapportPdfFromPayload } from '../../utils/analytiqueMetierRapportPdf';

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

/** Nettoie les libellés FEC bruités pour l'affichage (comptes individuels uniquement) */
function nettoyerLib(lib) {
  if (!lib) return '—';
  return lib
    .replace(/^PRESTATIONS?\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Palette de couleurs prédéfinies pour les groupes clients */
const PALETTE_COULEURS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706',
  '#7c3aed', '#db2777', '#0891b2', '#64748b',
  '#065f46', '#92400e', '#1e3a8a', '#701a75',
];

// ── Composant : carte d'un groupe client (vue liste onglet Groupes) ──
function GroupeClientCard({ groupe, comptes7, onEdit, onDelete, onComptesChange }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const membres   = groupe.comptes || [];
  const accent    = groupe.couleur || '#2563eb';

  const filteredC7 = comptes7.filter(c => {
    const q = search.toLowerCase();
    return !q
      || c.compte_num.toLowerCase().includes(q)
      || (c.compte_lib || '').toLowerCase().includes(q);
  });

  const toggle = async (num) => {
    setSaving(true);
    const next = membres.includes(num)
      ? membres.filter(m => m !== num)
      : [...membres, num];
    await onComptesChange(next);
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex-1 text-left text-sm font-semibold text-slate-800 hover:text-blue-700">
          {groupe.nom}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {membres.length} compte{membres.length !== 1 ? 's' : ''}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit}
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 text-xs">
            ✏ Modifier
          </button>
          <button type="button" onClick={onDelete}
            className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 text-xs">
            Supprimer
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un compte FEC…"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {filteredC7.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-400">Aucun compte trouvé.</p>
            )}
            {filteredC7.map(c => {
              const checked = membres.includes(c.compte_num);
              return (
                <label key={c.compte_num}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-xs
                    ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => toggle(c.compte_num)}
                    className="accent-blue-600 shrink-0"
                  />
                  <span className="font-mono text-slate-500 shrink-0">{c.compte_num}</span>
                  <span className="text-slate-700 truncate">{c.compte_lib || '—'}</span>
                </label>
              );
            })}
          </div>
          {saving && <p className="text-xs text-blue-500">Enregistrement…</p>}
        </div>
      )}
    </div>
  );
}

// ── Composant : modal création / édition d'un groupe ─────────────────
function GroupeClientModal({ mode, groupe, comptes7, onClose, onSaved }) {
  const [nom, setNom]       = useState(groupe?.nom || '');
  const [couleur, setCouleur] = useState(
    PALETTE_COULEURS.includes(groupe?.couleur) ? groupe.couleur : PALETTE_COULEURS[0]
  );
  const [membres, setMembres] = useState(groupe?.comptes || []);
  const [search, setSearch]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const filteredC7 = comptes7.filter(c => {
    const q = search.toLowerCase();
    return !q
      || c.compte_num.toLowerCase().includes(q)
      || (c.compte_lib || '').toLowerCase().includes(q);
  });

  const toggleMembre = (num) => {
    setMembres(prev =>
      prev.includes(num) ? prev.filter(m => m !== num) : [...prev, num]
    );
  };

  const save = async () => {
    if (!nom.trim()) return setErr('Le nom du groupe est obligatoire.');
    setSaving(true); setErr('');
    try {
      if (mode === 'new') {
        const r = await fetch(`${API_BASE}/api/analytique/groupes-clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: nom.trim(), couleur, comptes: membres }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur création');
      } else {
        const [r1, r2] = await Promise.all([
          fetch(`${API_BASE}/api/analytique/groupes-clients/${groupe.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: nom.trim(), couleur }),
          }),
          fetch(`${API_BASE}/api/analytique/groupes-clients/${groupe.id}/comptes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comptes: membres }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('Erreur mise à jour');
      }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === 'new' ? 'Nouveau groupe client' : `Modifier le groupe`}
          </h2>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none font-bold">&times;</button>
        </div>

        {/* Corps scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Nom */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nom du groupe <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="ex : Colis Privé, La Poste, Groupe XYZ…"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Couleur — palette de pastilles, pas d'input[type=color] */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Couleur de la barre</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE_COULEURS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCouleur(c)}
                  title={c}
                  className={`w-7 h-7 rounded-full border-2 transition-transform
                    ${couleur === c ? 'border-slate-700 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Liste à cocher avec recherche */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Comptes FEC à regrouper
              <span className="ml-2 text-slate-400 font-normal">
                {membres.length} sélectionné{membres.length > 1 ? 's' : ''}
              </span>
            </label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par numéro ou libellé…"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {comptes7.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-400">
                  Chargement des comptes…
                </p>
              )}
              {filteredC7.length === 0 && comptes7.length > 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-400">Aucun compte correspondant.</p>
              )}
              {filteredC7.map(c => {
                const checked = membres.includes(c.compte_num);
                return (
                  <label key={c.compte_num}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-xs
                      ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMembre(c.compte_num)}
                      className="accent-blue-600 shrink-0"
                    />
                    <span className="font-mono text-slate-500 shrink-0 w-20">{c.compte_num}</span>
                    <span className="text-slate-700 truncate">{c.compte_lib || '—'}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {comptes7.length - filteredC7.length > 0
                ? `${comptes7.length - filteredC7.length} compte(s) masqué(s) par la recherche`
                : `${comptes7.length} compte(s) au total`}
            </p>
          </div>

          {err && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">{err}</p>
          )}
        </div>

        {/* Pied de page — toujours visible */}
        <div className="flex gap-3 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={save} disabled={saving || !nom.trim()}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? 'Enregistrement…' : mode === 'new' ? 'Créer le groupe' : 'Enregistrer les modifications'}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant : carte d'une famille de charges ───────────────────────
function FamilleChargeCard({ famille, comptes6, onEdit, onDelete, onComptesChange }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const membres = famille.comptes || [];
  const accent  = famille.couleur || '#dc2626';

  const filteredC6 = comptes6.filter(c => {
    const q = search.toLowerCase();
    return !q
      || c.compte_num.toLowerCase().includes(q)
      || (c.compte_lib || '').toLowerCase().includes(q);
  });

  const toggle = async (num) => {
    setSaving(true);
    const next = membres.includes(num)
      ? membres.filter(m => m !== num)
      : [...membres, num];
    await onComptesChange(next);
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex-1 text-left text-sm font-semibold text-slate-800 hover:text-red-700">
          {famille.nom}
          <span className="ml-2 text-xs font-normal text-slate-400">
            {membres.length} compte{membres.length !== 1 ? 's' : ''}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit}
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 text-xs">
            ✏ Modifier
          </button>
          <button type="button" onClick={onDelete}
            className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 text-xs">
            Supprimer
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un compte FEC 6x…"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {filteredC6.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-400">Aucun compte trouvé.</p>
            )}
            {filteredC6.map(c => {
              const checked = membres.includes(c.compte_num);
              return (
                <label key={c.compte_num}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-xs
                    ${checked ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => toggle(c.compte_num)}
                    className="accent-red-600 shrink-0"
                  />
                  <span className="font-mono text-slate-500 shrink-0">{c.compte_num}</span>
                  <span className="text-slate-700 truncate">{nettoyerLib(c.compte_lib)}</span>
                </label>
              );
            })}
          </div>
          {saving && <p className="text-xs text-red-500">Enregistrement…</p>}
        </div>
      )}
    </div>
  );
}

// ── Composant : modal création / édition d'une famille de charges ─────
function FamilleChargeModal({ mode, famille, comptes6, prefill, onClose, onSaved }) {
  const defaultCouleur = '#dc2626';
  const [nom, setNom]       = useState(famille?.nom || '');
  const [couleur, setCouleur] = useState(
    PALETTE_COULEURS.includes(famille?.couleur) ? famille.couleur : defaultCouleur
  );
  const [membres, setMembres] = useState(() => {
    const base = Array.isArray(famille?.comptes) ? famille.comptes : [];
    if (mode === 'new' && prefill && !base.includes(prefill)) return [...base, prefill];
    return base;
  });
  const [search, setSearch]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const filteredC6 = comptes6.filter(c => {
    const q = search.toLowerCase();
    return !q
      || c.compte_num.toLowerCase().includes(q)
      || (c.compte_lib || '').toLowerCase().includes(q);
  });

  const toggleMembre = (num) => {
    setMembres(prev =>
      prev.includes(num) ? prev.filter(m => m !== num) : [...prev, num]
    );
  };

  const save = async () => {
    if (!nom.trim()) return setErr('Le nom de la famille est obligatoire.');
    setSaving(true); setErr('');
    try {
      if (mode === 'new') {
        const r = await fetch(`${API_BASE}/api/analytique/familles-charges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: nom.trim(), couleur, comptes: membres }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur création');
      } else {
        const [r1, r2] = await Promise.all([
          fetch(`${API_BASE}/api/analytique/familles-charges/${famille.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: nom.trim(), couleur }),
          }),
          fetch(`${API_BASE}/api/analytique/familles-charges/${famille.id}/comptes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comptes: membres }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('Erreur mise à jour');
      }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === 'new' ? 'Nouvelle famille de charges' : `Modifier la famille`}
          </h2>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none font-bold">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nom de la famille <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="ex : Carburant, Social, Flotte, Sous-traitance…"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Couleur de la barre</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE_COULEURS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCouleur(c)}
                  title={c}
                  className={`w-7 h-7 rounded-full border-2 transition-transform
                    ${couleur === c ? 'border-slate-700 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Comptes FEC 6x à regrouper
              <span className="ml-2 text-slate-400 font-normal">
                {membres.length} sélectionné{membres.length > 1 ? 's' : ''}
              </span>
            </label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par numéro ou libellé…"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {comptes6.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-400">Chargement des comptes…</p>
              )}
              {filteredC6.length === 0 && comptes6.length > 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-400">Aucun compte correspondant.</p>
              )}
              {filteredC6.map(c => {
                const checked = membres.includes(c.compte_num);
                return (
                  <label key={c.compte_num}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-xs
                      ${checked ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMembre(c.compte_num)}
                      className="accent-red-600 shrink-0"
                    />
                    <span className="font-mono text-slate-500 shrink-0 w-20">{c.compte_num}</span>
                    <span className="text-slate-700 truncate">{nettoyerLib(c.compte_lib)}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {comptes6.length - filteredC6.length > 0
                ? `${comptes6.length - filteredC6.length} compte(s) masqué(s) par la recherche`
                : `${comptes6.length} compte(s) au total`}
            </p>
          </div>

          {err && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">{err}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={save} disabled={saving || !nom.trim()}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
            {saving ? 'Enregistrement…' : mode === 'new' ? 'Créer la famille' : 'Enregistrer les modifications'}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
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
  const [exportingPdf, setExportingPdf] = useState(false);

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

  /** Onglet Groupes clients */
  const [groupes, setGroupes] = useState([]);
  const [groupesLoading, setGroupesLoading] = useState(false);
  const [comptes7, setComptes7] = useState([]);
  const [groupeModal, setGroupeModal] = useState(null); // null | { mode:'new'|'edit', groupe? }

  /** Drill-down graphique (barre groupe cliquée) */
  const [selectedGroupe, setSelectedGroupe] = useState(null);
  /** Ligne ou regroupement « charges par famille » sélectionné sur le graphique (comme `selectedGroupe` pour le CA). */
  const [selectedChargeFamille, setSelectedChargeFamille] = useState(null);
  /** Lignes FEC pour un compte 7% (2e niveau de drill) */
  const [lignesDrill, setLignesDrill] = useState(null);
  const [lignesRows, setLignesRows] = useState([]);
  const [lignesTotaux, setLignesTotaux] = useState(null);
  const [lignesLoading, setLignesLoading] = useState(false);

  /** Onglet Familles de charges */
  const [familles, setFamilles] = useState([]);
  const [famillesLoading, setFamillesLoading] = useState(false);
  const [comptes6, setComptes6] = useState([]);
  const [familleModal, setFamilleModal] = useState(null);
  const [chargesGlobal, setChargesGlobal] = useState([]);
  const [selectedMetierId, setSelectedMetierId] = useState(null);
  const [nonAffModal, setNonAffModal] = useState(null);

  /** null = consolidé toutes sociétés ; jamais NaN. */
  const societeIdParam = useMemo(() => {
    if (societeScope == null || societeScope === '' || societeScope === 'consolide') {
      return null;
    }
    const n = parseInt(String(societeScope), 10);
    return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
  }, [societeScope]);

  const dashboardFilterKey = useMemo(
    () => `${annee}|${periodicite}|${periodValue}|${societeIdParam ?? 'all'}`,
    [annee, periodicite, periodValue, societeIdParam],
  );

  const periodeLabelDashboard = useMemo(() => {
    if (periodicite === 'mensuel') {
      const m = Math.min(12, Math.max(1, Number(periodValue) || 1));
      return new Date(annee, m - 1, 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    }
    if (periodicite === 'trimestriel') {
      return `T${Number(periodValue) || 1} · ${annee}`;
    }
    return `Exercice ${annee} (complet)`;
  }, [annee, periodicite, periodValue]);

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
    if (societeIdParam != null) spDash.set('societe_id', String(societeIdParam));
    const spClients = new URLSearchParams();
    spClients.set('date_debut', debut);
    spClients.set('date_fin', fin);
    if (societeIdParam != null) spClients.set('societe_id', String(societeIdParam));
    setDashLoading(true);
    try {
      const noStore = { cache: 'no-store' };
      const [rDash, rCli, rChg] = await Promise.all([
        fetch(`${API_BASE}/api/analytique/dashboard?${spDash.toString()}`, noStore),
        fetch(`${API_BASE}/api/analytique/clients-global?${spClients.toString()}`, noStore),
        fetch(`${API_BASE}/api/analytique/charges-global?${spClients.toString()}`, noStore),
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
        setClientsGlobal(
          rows
            .map((row) => ({ ...row, ca: parseNum(row.ca) }))
            .sort((a, b) => b.ca - a.ca)
        );
      } else {
        setClientsGlobal([]);
      }
      if (rChg.ok) {
        const jch = await rChg.json();
        setChargesGlobal(
          (Array.isArray(jch.data) ? jch.data : [])
            .map((r) => {
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
                charge: parseNum(r.charge),
                detail: Array.isArray(detail) ? detail : [],
              };
            })
            .sort((a, b) => b.charge - a.charge),
        );
      } else {
        setChargesGlobal([]);
      }
    } catch {
      setDashRows([]);
      setClientsGlobal([]);
      setChargesGlobal([]);
    } finally {
      setDashLoading(false);
    }
  }, [annee, periodicite, periodValue, societeIdParam]);

  const loadNonAffectes = useCallback(async () => {
    setNonLoading(true);
    try {
      const { debut, fin } = toPeriodBounds(periodicite, annee, periodValue);
      const sp = new URLSearchParams();
      sp.set('date_debut', debut);
      sp.set('date_fin', fin);
      if (societeIdParam != null) sp.set('societe_id', String(societeIdParam));
      const r = await fetch(`${API_BASE}/api/analytique/non-affectes?${sp.toString()}`, {
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('Erreur');
      const j = await r.json();
      setNonAffectes(Array.isArray(j.data) ? j.data : []);
    } catch {
      setNonAffectes([]);
    } finally {
      setNonLoading(false);
    }
  }, [societeIdParam, annee, periodicite, periodValue]);

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
        const r = await fetch(`${API_BASE}/api/analytique/detail-metier?${sp.toString()}`, {
          cache: 'no-store',
        });
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
    setSelectedGroupe(null);
    setSelectedChargeFamille(null);
    setLignesDrill(null);
    setLignesRows([]);
    setLignesTotaux(null);
  }, [tab, annee, periodicite, periodValue, societeScope]);

  useEffect(() => {
    if (!lignesDrill || tab !== 'dashboard') {
      if (!lignesDrill) {
        setLignesRows([]);
        setLignesTotaux(null);
      }
      return;
    }
    const kind = lignesDrill.kind === 'charge' ? 'charge' : 'produit';
    if (lignesDrill.societe_id == null || lignesDrill.societe_id === '') {
      setLignesRows([]);
      setLignesTotaux(null);
      return;
    }
    const { debut, fin } = toPeriodBounds(periodicite, annee, periodValue);
    const sp = new URLSearchParams({
      compte_num: String(lignesDrill.compte_num),
      societe_id: String(lignesDrill.societe_id),
      date_debut: debut,
      date_fin: fin,
    });
    const path =
      kind === 'charge'
        ? '/api/analytique/charge-compte-lignes'
        : '/api/analytique/produit-compte-lignes';
    let cancel = false;
    setLignesLoading(true);
    fetch(`${API_BASE}${path}?${sp.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('lignes'))))
      .then((j) => {
        if (cancel) return;
        setLignesRows(Array.isArray(j.data) ? j.data : []);
        setLignesTotaux(j.totaux && typeof j.totaux === 'object' ? j.totaux : null);
      })
      .catch(() => {
        if (!cancel) {
          setLignesRows([]);
          setLignesTotaux(null);
        }
      })
      .finally(() => {
        if (!cancel) setLignesLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [lignesDrill, tab, annee, periodicite, periodValue]);

  const loadGroupes = useCallback(async () => {
    setGroupesLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/analytique/groupes-clients`);
      if (r.ok) { const j = await r.json(); setGroupes(Array.isArray(j.data) ? j.data : []); }
    } catch { setGroupes([]); }
    finally { setGroupesLoading(false); }
  }, []);

  const loadComptes7 = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/analytique/comptes`);
      if (r.ok) {
        const j = await r.json();
        setComptes7((Array.isArray(j.data) ? j.data : []).filter(c => c.type === 'PRODUIT'));
      }
    } catch { /* silencieux */ }
  }, []);

  const loadFamilles = useCallback(async () => {
    setFamillesLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/analytique/familles-charges`);
      if (r.ok) { const j = await r.json(); setFamilles(Array.isArray(j.data) ? j.data : []); }
    } catch { setFamilles([]); }
    finally { setFamillesLoading(false); }
  }, []);

  const loadComptes6 = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/analytique/comptes6`);
      if (r.ok) { const j = await r.json(); setComptes6(Array.isArray(j.data) ? j.data : []); }
    } catch { setComptes6([]); }
  }, []);

  useEffect(() => {
    loadSocietes();
    loadMetiers();
  }, [loadSocietes, loadMetiers]);

  useEffect(() => {
    if (tab === 'affectation' || tab === 'dashboard' || tab === 'non') {
      void loadComptes();
    }
  }, [tab, loadComptes]);

  useEffect(() => {
    if (tab !== 'dashboard') return;
    void loadDashboard();
  }, [tab, annee, periodicite, periodValue, societeIdParam, loadDashboard]);

  useEffect(() => {
    loadNonAffectes();
  }, [loadNonAffectes]);

  useEffect(() => {
    if (tab === 'groupes') { loadGroupes(); loadComptes7(); }
  }, [tab, loadGroupes, loadComptes7]);

  useEffect(() => {
    if (tab === 'familles') { loadFamilles(); loadComptes6(); }
  }, [tab, loadFamilles, loadComptes6]);

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

  // CA total réel = somme de tous les clients/groupes affichés dans le graphique.
  // Sert de dénominateur pour les % de part de marché par client.
  const totalCaClients = useMemo(
    () => clientsGlobal.reduce((s, e) => s + parseNum(e.ca), 0),
    [clientsGlobal]
  );

  /** Lignes du tableau « détail client » (JSON côté API ou string). */
  const clientDrillComptes = useMemo(() => {
    if (!selectedGroupe) return [];
    const d = selectedGroupe.detail;
    if (Array.isArray(d) && d.length) return d;
    if (typeof d === 'string') {
      try {
        const p = JSON.parse(d);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [selectedGroupe]);

  /** Comptes d’une famille (ou regroupement « hors familles ») pour le panneau sous le graphique charges. */
  const chargeDrillComptes = useMemo(() => {
    if (!selectedChargeFamille) return [];
    if (selectedChargeFamille.synthetic === 'hors') {
      const out = [];
      for (const r of chargesGlobal.filter((x) => !x.est_famille)) {
        const det = r.detail;
        if (Array.isArray(det) && det.length) {
          for (const d of det) {
            out.push({
              compte_num: String(d.compte_num || ''),
              compte_lib: d.compte_lib || r.compte_lib,
              societe_id: d.societe_id,
              charge: parseNum(d.charge),
            });
          }
        } else {
          out.push({
            compte_num: String(r.id),
            compte_lib: r.compte_lib,
            societe_id: societeIdParam,
            charge: parseNum(r.charge),
          });
        }
      }
      return out.sort((a, b) => b.charge - a.charge);
    }
    const d = selectedChargeFamille.detail;
    if (!Array.isArray(d) || !d.length) return [];
    return d
      .map((row) => ({
        compte_num: String(row.compte_num || ''),
        compte_lib: row.compte_lib || '—',
        societe_id: row.societe_id,
        charge: parseNum(row.charge),
      }))
      .sort((a, b) => b.charge - a.charge);
  }, [selectedChargeFamille, chargesGlobal, societeIdParam]);

  const chargeCards = useMemo(() => {
    return chargesGlobal
      .filter((r) => r.est_famille)
      .map((r) => ({
        id: String(r.id),
        label: String(r.compte_lib || 'Famille'),
        charge: parseNum(r.charge),
        couleur: r.couleur || '#dc2626',
      }))
      .filter((r) => r.charge > 0)
      .sort((a, b) => b.charge - a.charge);
  }, [chargesGlobal]);

  /** Toutes les charges classe 6 (familles + comptes hors famille), période / société actives. */
  const chargesGlobalesTotal = useMemo(
    () => chargesGlobal.reduce((s, r) => s + parseNum(r.charge), 0),
    [chargesGlobal],
  );

  const produitsNonAffectes = useMemo(
    () =>
      nonAffectes
        .filter((r) => String(r.type) === 'PRODUIT')
        .reduce((s, r) => s + parseNum(r.solde_abs), 0),
    [nonAffectes],
  );

  /** CA 7x affecté aux métiers (dashboard) + comptes 7x sans aucune affectation. */
  const caGlobal = useMemo(
    () => caVignette + produitsNonAffectes,
    [caVignette, produitsNonAffectes],
  );

  const chargesNonAffectees = useMemo(() => {
    const comptesSansFamille = new Set(
      chargesGlobal
        .filter((r) => !r.est_famille)
        .map((r) => String(r.id || ''))
        .filter(Boolean),
    );
    let total = 0;
    for (const row of comptes) {
      const cp = String(row.compte_num || '');
      if (!cp.startsWith('6')) continue;
      if (!comptesSansFamille.has(cp)) continue;
      const hasMetier = Array.isArray(row.affectations) && row.affectations.length > 0;
      if (hasMetier) continue;
      const chargeRow = chargesGlobal.find((c) => String(c.id || '') === cp);
      total += parseNum(chargeRow?.charge);
    }
    return total;
  }, [chargesGlobal, comptes]);

  const chargesNonAffecteesFamille = useMemo(
    () =>
      chargesGlobal
        .filter((r) => !r.est_famille)
        .reduce((s, r) => s + parseNum(r.charge), 0),
    [chargesGlobal],
  );

  /** Montant de la barre « charges » sélectionnée (dépend de `chargesNonAffecteesFamille`, déclaré au-dessus). */
  const totalChargeBarSelection = useMemo(() => {
    if (!selectedChargeFamille) return 0;
    if (selectedChargeFamille.synthetic === 'hors') return parseNum(chargesNonAffecteesFamille);
    return parseNum(selectedChargeFamille.charge);
  }, [selectedChargeFamille, chargesNonAffecteesFamille]);

  const chargeFamilleChartData = useMemo(() => {
    const rows = chargeCards.map((c) => ({
      name: c.label.length > 48 ? `${c.label.slice(0, 46)}…` : c.label,
      charge: c.charge,
      fill: c.couleur || '#dc2626',
      sourceId: c.id,
      isHors: false,
    }));
    if (parseNum(chargesNonAffecteesFamille) > 0.01) {
      rows.push({
        name: 'Comptes hors familles (hors regroupement)',
        charge: parseNum(chargesNonAffecteesFamille),
        fill: '#f97316',
        sourceId: '__hors__',
        isHors: true,
      });
    }
    return rows;
  }, [chargeCards, chargesNonAffecteesFamille]);

  const nonAffectesProduitsComptes = useMemo(
    () =>
      nonAffectes
        .filter((r) => String(r.type) === 'PRODUIT')
        .map((r) => ({
          compte_num: String(r.compte_num || ''),
          compte_lib: r.compte_lib || '—',
          type: 'PRODUIT',
          montant: parseNum(r.solde_abs),
        }))
        .sort((a, b) => b.montant - a.montant),
    [nonAffectes],
  );
  const nonAffectesChargesComptes = useMemo(() => {
    const chargesSansFamille = new Set(
      chargesGlobal
        .filter((r) => !r.est_famille)
        .map((r) => String(r.id || ''))
        .filter(Boolean),
    );
    const byCompte = new Map(
      chargesGlobal
        .filter((r) => !r.est_famille)
        .map((r) => [String(r.id || ''), parseNum(r.charge)]),
    );
    return comptes
      .filter((row) => {
        const cp = String(row.compte_num || '');
        if (!cp.startsWith('6')) return false;
        if (!chargesSansFamille.has(cp)) return false;
        return !(Array.isArray(row.affectations) && row.affectations.length > 0);
      })
      .map((row) => ({
        compte_num: String(row.compte_num || ''),
        compte_lib: row.compte_lib || '—',
        type: 'CHARGE',
        montant: byCompte.get(String(row.compte_num || '')) || 0,
      }))
      .sort((a, b) => b.montant - a.montant);
  }, [chargesGlobal, comptes]);

  const openNonAffectesComptes = useCallback(
    (scope, title) => {
      const rows =
        scope === 'produit'
          ? nonAffectesProduitsComptes
          : scope === 'charge'
            ? nonAffectesChargesComptes
            : [...nonAffectesProduitsComptes, ...nonAffectesChargesComptes];
      setNonAffModal({ title, rows });
    },
    [nonAffectesProduitsComptes, nonAffectesChargesComptes],
  );

  const selectedMetier = useMemo(
    () => metiers.find((m) => String(m.id) === String(selectedMetierId)) || null,
    [metiers, selectedMetierId],
  );

  const pctFmt = (p) =>
    p == null || !Number.isFinite(p)
      ? '—'
      : `${p.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

  const societePills = useMemo(() => {
    const n = (s) => String(s?.nom || '').toLowerCase();
    const g2l =
      societes.find((s) => n(s).includes('holding g2l')) ||
      societes.find((s) => n(s).includes('g2l'));
    const dj =
      societes.find((s) => /\bd\s*&\s*j\b/.test(n(s)) || n(s).includes('dj transport')) ||
      societes.find((s) => n(s).includes('d&j') || /\bdj\b/.test(n(s)));
    const tps =
      societes.find((s) => n(s).includes('tps') || n(s).includes('tsmc')) ||
      societes.find((s) => n(s).includes('tsmc express'));
    return { g2l, dj, tps };
  }, [societes]);

  const societeLabel = useMemo(() => {
    if (societeScope === 'consolide') return 'Consolidé';
    const s = societes.find((x) => String(x.id) === String(societeScope));
    return s?.nom || 'Société';
  }, [societeScope, societes]);

  const handleExportRapportPdf = useCallback(async () => {
    setExportingPdf(true);
    setError(null);
    try {
      const data = await collectAnalytiqueRapportData({
        apiBase: API_BASE,
        toPeriodBounds,
        annee,
        periodicite,
        periodValue,
        societes,
        metiers,
        periodeLabel: periodeLabelDashboard,
      });
      if (!data?.consolidated) {
        setError("Impossible de générer le rapport (données consolidées vides).");
        return;
      }
      exportAnalytiqueMetierRapportPdfFromPayload(data);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? `Export PDF : ${e.message}`
          : "Export PDF : une erreur est survenue pendant la génération.",
      );
    } finally {
      setExportingPdf(false);
    }
  }, [annee, periodicite, periodValue, societes, metiers, periodeLabelDashboard]);

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
          {tab === 'dashboard' && (
            <button
              type="button"
              onClick={handleExportRapportPdf}
              disabled={exportingPdf}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {exportingPdf ? 'Génération du PDF…' : 'Exporter le rapport (PDF)'}
            </button>
          )}
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
            { id: 'groupes', label: 'Groupes clients' },
            { id: 'familles', label: 'Familles de charges' },
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
              {/* Zone 1 — Bandeau synthèse métier */}
              <div className="rounded-2xl bg-blue-950 p-8 text-white shadow-xl md:p-10">
                <div className="text-center">
                  <p className="text-2xl font-bold uppercase tracking-widest text-white">
                    {selectedMetier ? `MÉTIER · ${selectedMetier.libelle}` : 'GROUPE'}
                  </p>
                  <p className="mt-1 text-sm font-medium text-blue-100/90 capitalize">
                    {periodeLabelDashboard}
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSocieteScope('consolide');
                      setSelectedMetierId(null);
                    }}
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
                    disabled={!societePills.g2l}
                    onClick={() => {
                      if (!societePills.g2l) return;
                      setSocieteScope(String(societePills.g2l.id));
                      setSelectedMetierId(null);
                    }}
                    className={`rounded-full px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      societePills.g2l && societeScope === String(societePills.g2l.id)
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 font-medium text-white/70 hover:bg-white/20'
                    }`}
                  >
                    G2L
                  </button>
                  <button
                    type="button"
                    disabled={!societePills.dj}
                    onClick={() => {
                      if (!societePills.dj) return;
                      setSocieteScope(String(societePills.dj.id));
                      setSelectedMetierId(null);
                    }}
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
                    onClick={() => {
                      if (!societePills.tps) return;
                      setSocieteScope(String(societePills.tps.id));
                      setSelectedMetierId(null);
                    }}
                    className={`rounded-full px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      societePills.tps && societeScope === String(societePills.tps.id)
                        ? 'bg-white font-semibold text-slate-900'
                        : 'bg-white/10 font-medium text-white/70 hover:bg-white/20'
                    }`}
                  >
                    TPS TSMC EXPRESS
                  </button>
                </div>
                <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-blue-100">CA</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-white">{money(caGlobal)} €</p>
                  </div>
                  <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-blue-100">Charges globales (classe 6)</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-white">{money(chargesGlobalesTotal)} €</p>
                  </div>
                  <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-blue-100">Résultat</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${caGlobal - chargesGlobalesTotal >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {money(caGlobal - chargesGlobalesTotal)} €
                    </p>
                  </div>
                  <div className="rounded-xl border border-orange-300/40 bg-orange-500/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-orange-100">
                      Non affectés {produitsNonAffectes + chargesNonAffectees > 0 ? '⚠️' : ''}
                    </p>
                    <button
                      type="button"
                      className="mt-2 block w-full text-left text-xs text-orange-100 hover:underline"
                      onClick={() => openNonAffectesComptes('produit', 'Produits non affectés — comptes')}
                    >
                      Produits non affectés : <span className="tabular-nums font-semibold">{money(produitsNonAffectes)} €</span>
                    </button>
                    <button
                      type="button"
                      className="mt-1 block w-full text-left text-xs text-orange-100 hover:underline"
                      onClick={() => openNonAffectesComptes('charge', 'Charges non affectées — comptes')}
                    >
                      Charges non affectées : <span className="tabular-nums font-semibold">{money(chargesNonAffectees)} €</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Répartition CA par client — {societeLabel}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Les groupes <span className="font-semibold text-blue-600">★</span> regroupent plusieurs comptes. CA =
                    somme (produit × part métier) sur la période. Cliquez une barre pour le détail par compte, puis un
                    compte pour les écritures FEC.
                  </p>
                </div>
                {clientsGlobal.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">Aucune donnée sur la période.</p>
                ) : (
                  <>
                    <ResponsiveContainer
                      key={dashboardFilterKey}
                      width="100%"
                      height={Math.max(300, clientsGlobal.length * 34)}
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
                          dataKey="id"
                          tick={({ x, y, payload, index: tickI }) => {
                            const byId = clientsGlobal.find(
                              (c) => String(c.id) === String(payload?.value)
                            );
                            const entry = byId ?? (typeof tickI === 'number' ? clientsGlobal[tickI] : null);
                            if (!entry) {
                              return (
                                <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="#94a3b8">
                                  —
                                </text>
                              );
                            }
                            const label = entry.est_groupe ? entry.compte_lib : nettoyerLib(entry.compte_lib);
                            return (
                              <text
                                x={x}
                                y={y}
                                dy={4}
                                textAnchor="end"
                                fontSize={11}
                                fill={entry.est_groupe ? '#2563eb' : '#475569'}
                              >
                                {entry.est_groupe ? '★ ' : ''}
                                {label}
                              </text>
                            );
                          }}
                          width={210}
                        />
                        <Tooltip
                          content={({ active, payload: tipPayload }) => {
                            if (!active || !tipPayload?.length) return null;
                            const d = tipPayload[0].payload;
                            const tooltipLabel = d.est_groupe ? d.compte_lib : nettoyerLib(d.compte_lib);
                            const dtl = Array.isArray(d.detail) ? d.detail : [];
                            return (
                              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg text-xs max-w-xs">
                                <p className="font-semibold text-slate-800 mb-1.5">{tooltipLabel}</p>
                                <p className="tabular-nums text-slate-700 font-medium">
                                  {Number(d.ca).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </p>
                                {dtl.length > 0 && (
                                  <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
                                    {dtl.map((sub, i) => (
                                      <div key={i} className="flex justify-between gap-3 text-slate-500">
                                        <span className="truncate max-w-[160px]">{nettoyerLib(sub.compte_lib)}</span>
                                        <span className="tabular-nums shrink-0">
                                          {Number(sub.ca).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="mt-1.5 text-blue-500 italic">Clic = détail comptes</p>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="ca"
                          radius={[0, 4, 4, 0]}
                          cursor="pointer"
                          onClick={(barData, index) => {
                            const fromPayload = barData && barData.payload && typeof barData.payload === 'object'
                              ? barData.payload
                              : null;
                            const fromBar =
                              barData && (barData.ca != null || barData.id != null) && !fromPayload
                                ? barData
                                : null;
                            const entry = fromPayload || fromBar || (typeof index === 'number' ? clientsGlobal[index] : null);
                            if (!entry) return;
                            setLignesDrill(null);
                            setSelectedChargeFamille(null);
                            setSelectedGroupe((g) => (g && String(g.id) === String(entry.id) ? null : entry));
                          }}
                        >
                          <LabelList
                            dataKey="ca"
                            position="right"
                            style={{ fontSize: 10, fill: '#64748b' }}
                            formatter={(v) =>
                              totalCaClients > 0
                                ? `${((parseNum(v) / totalCaClients) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                                : ''
                            }
                          />
                          {clientsGlobal.map((entry, i) => (
                            <Cell
                              key={`${String(entry.id)}-${i}`}
                              fill={
                                selectedGroupe && String(selectedGroupe.id) === String(entry.id)
                                  ? '#1d4ed8'
                                  : entry.est_groupe
                                    ? (entry.couleur || '#2563eb')
                                    : '#94a3b8'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {selectedGroupe && (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-blue-900">
                            {selectedGroupe.est_groupe ? '★ ' : ''}
                            {selectedGroupe.compte_lib}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGroupe(null);
                              setLignesDrill(null);
                            }}
                            className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                          >
                            Fermer ×
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          Cliquez sur un compte pour afficher toutes les lignes FEC (classe 7) de la période, par métier
                          affecté.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead>
                              <tr className="text-left text-slate-500">
                                <th className="pb-1.5 font-medium w-8" />
                                <th className="pb-1.5 font-medium">Compte FEC</th>
                                <th className="pb-1.5 font-medium">Libellé</th>
                                <th className="pb-1.5 font-medium">Société</th>
                                <th className="pb-1.5 text-right font-medium">CA (période)</th>
                                <th className="pb-1.5 text-right font-medium">% CA total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-100">
                              {clientDrillComptes.map((d, i) => {
                                const pct =
                                  totalCaClients > 0 ? (parseNum(d.ca) / totalCaClients) * 100 : 0;
                                const sid =
                                  d.societe_id != null && d.societe_id !== ''
                                    ? d.societe_id
                                    : societeIdParam;
                                const open =
                                  lignesDrill &&
                                  (lignesDrill.kind === 'produit' || lignesDrill.kind == null) &&
                                  String(lignesDrill.compte_num) === String(d.compte_num) &&
                                  String(lignesDrill.societe_id) === String(sid);
                                const toggleLigne = () => {
                                  if (open) {
                                    setLignesDrill(null);
                                    return;
                                  }
                                  setLignesDrill({
                                    kind: 'produit',
                                    compte_num: d.compte_num,
                                    societe_id: sid,
                                    compte_lib: d.compte_lib,
                                  });
                                };
                                return (
                                  <tr
                                    key={`${d.compte_num}-${d.societe_id}-${i}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={toggleLigne}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleLigne();
                                      }
                                    }}
                                    className={`cursor-pointer ${open ? 'bg-blue-100' : 'hover:bg-blue-100/50'}`}
                                  >
                                    <td className="py-1.5 text-slate-400">{open ? '▾' : '▸'}</td>
                                    <td className="py-1.5 font-mono text-slate-600">{d.compte_num}</td>
                                    <td className="py-1.5 text-slate-800">{nettoyerLib(d.compte_lib)}</td>
                                    <td className="py-1.5 text-slate-600">
                                      {societes.find((s) => Number(s.id) === Number(d.societe_id))?.nom ||
                                        (d.societe_id != null ? `Soc. #${d.societe_id}` : '—')}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums font-medium text-slate-900">
                                      {money(d.ca)} €
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                                      {pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-blue-200">
                                <td colSpan={4} className="pt-2 text-xs font-semibold text-slate-600">
                                  Total (barre)
                                </td>
                                <td className="pt-2 text-right tabular-nums font-bold text-slate-900">
                                  {money(selectedGroupe.ca)} €
                                </td>
                                <td className="pt-2 text-right tabular-nums font-semibold text-slate-500">
                                  {totalCaClients > 0
                                    ? `${((parseNum(selectedGroupe.ca) / totalCaClients) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                                    : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {lignesDrill && (lignesDrill.kind === 'produit' || lignesDrill.kind == null) && (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-xs font-semibold text-slate-700 mb-2">
                              Écritures FEC (classe 7) — {lignesDrill.compte_num}{' '}
                              <span className="font-normal text-slate-500">({lignesDrill.compte_lib})</span>
                            </p>
                            {lignesLoading ? (
                              <p className="text-xs text-slate-500">Chargement des écritures…</p>
                            ) : lignesRows.length === 0 ? (
                              <p className="text-xs text-slate-500">Aucune ligne sur cette période.</p>
                            ) : (
                              <>
                                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                  <table className="w-full min-w-[720px] text-[11px]">
                                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                                      <tr>
                                        <th className="py-1 pr-2">Date</th>
                                        <th className="py-1 pr-2">Jnl</th>
                                        <th className="py-1 pr-2">Pièce</th>
                                        <th className="py-1 pr-2 min-w-[140px]">Libellé</th>
                                        <th className="py-1 text-right">Débit</th>
                                        <th className="py-1 text-right">Crédit</th>
                                        <th className="py-1 text-right">Produit</th>
                                        <th className="py-1 pr-1">Métier</th>
                                        <th className="py-1 text-right">%</th>
                                        <th className="py-1 text-right">Affecté</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {lignesRows.map((row, li) => (
                                        <tr key={`${row.id}-${row.metier_id ?? 'm'}-${li}`} className="text-slate-800">
                                          <td className="py-0.5 pr-2 whitespace-nowrap text-slate-600">
                                            {row.ecriture_date || '—'}
                                          </td>
                                          <td className="py-0.5 pr-2 font-mono text-slate-500">{row.journal_code || '—'}</td>
                                          <td className="py-0.5 pr-2 text-slate-500">{row.piece_ref || '—'}</td>
                                          <td
                                            className="py-0.5 pr-2 max-w-[200px] truncate"
                                            title={row.ecriture_lib || ''}
                                          >
                                            {row.ecriture_lib || '—'}
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums text-slate-500">
                                            {money(row.debit)} €
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums text-slate-500">
                                            {money(row.credit)} €
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums">
                                            {money(row.produit_brut)} €
                                          </td>
                                          <td className="py-0.5 pr-1 text-slate-600">{row.metier_libelle || '—'}</td>
                                          <td className="py-0.5 text-right tabular-nums text-slate-500">
                                            {row.pourcentage != null
                                              ? `${Number(row.pourcentage).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
                                              : '—'}
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums font-medium">
                                            {money(row.produit_affecte)} €
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    {lignesTotaux && (
                                      <tfoot>
                                        <tr className="border-t border-slate-200 text-slate-700 font-medium">
                                          <td colSpan={6} className="pt-1 text-right pr-2">
                                            Totaux (produit = crédit − débit ; affecté = somme des parts)
                                          </td>
                                          <td className="pt-1 text-right tabular-nums">
                                            {money(lignesTotaux.produit_brut)} €
                                          </td>
                                          <td colSpan={2} />
                                          <td className="pt-1 text-right tabular-nums">
                                            {money(lignesTotaux.produit_affecte)} €
                                          </td>
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>
                                </div>
                                <p className="mt-2 text-[10px] text-slate-400">
                                  Une même écriture peut apparaître sur plusieurs lignes si le compte est affecté à
                                  plusieurs métiers (parts).
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setSelectedMetierId((prev) => (String(prev) === String(m.id) ? null : m.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedMetierId((prev) => (String(prev) === String(m.id) ? null : m.id));
                          }
                        }}
                        className={`rounded-xl border border-slate-200 p-4 shadow-sm ${
                          isNonAffecte
                            ? 'border-l-4 border-orange-400 bg-orange-50'
                            : 'border-l-4 bg-white'
                        } ${String(selectedMetierId) === String(m.id) ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMetierDetail(m.id);
                          }}
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
                <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 shadow-sm border-l-4 border-l-orange-400">
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Produits non affectés</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{money(produitsNonAffectes)} €</p>
                  <button
                    type="button"
                    onClick={() => openNonAffectesComptes('produit', 'Produits non affectés — comptes')}
                    className="mt-3 w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50"
                  >
                    Voir les comptes
                  </button>
                </div>
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

              {/* Zone 3 — Charges en vignettes (filtrables par métier) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  Charges par famille (Classe 6) — totaux globaux
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Affichage indépendant du métier sélectionné. Cliquez une barre pour le détail par compte (comme le CA
                  client), puis un compte pour les écritures FEC classe 6.
                </p>
                {chargeFamilleChartData.length > 0 && (
                  <>
                    <div
                      className="mb-4 w-full"
                      style={{ height: Math.min(480, Math.max(220, chargeFamilleChartData.length * 32)) }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chargeFamilleChartData}
                          layout="vertical"
                          margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
                        >
                          <XAxis
                            type="number"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v}€`)}
                          />
                          <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10 }} />
                          <Tooltip
                            content={({ active, payload: tipP }) => {
                              if (!active || !tipP?.length) return null;
                              const p = tipP[0].payload;
                              return (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs max-w-sm">
                                  <p className="font-semibold text-slate-800 mb-0.5">{p.name}</p>
                                  <p className="tabular-nums text-slate-700">
                                    {Number(p.charge).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </p>
                                  {chargesGlobalesTotal > 0.01 && (
                                    <p className="text-slate-500 text-[10px] mt-0.5">
                                      {((Number(p.charge) / chargesGlobalesTotal) * 100).toLocaleString('fr-FR', {
                                        maximumFractionDigits: 1,
                                      })}{' '}
                                      % des charges
                                    </p>
                                  )}
                                  <p className="mt-1 text-rose-600 italic">Clic = détail comptes</p>
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="charge"
                            radius={[0, 3, 3, 0]}
                            cursor="pointer"
                            onClick={(barData) => {
                              const p = barData?.payload;
                              if (!p?.sourceId) return;
                              setSelectedGroupe(null);
                              setLignesDrill(null);
                              if (p.isHors) {
                                setSelectedChargeFamille((cur) =>
                                  cur && cur.synthetic === 'hors' ? null : { synthetic: 'hors', label: p.name, charge: p.charge }
                                );
                                return;
                              }
                              const row = chargesGlobal.find((r) => String(r.id) === String(p.sourceId));
                              if (!row) return;
                              setSelectedChargeFamille((cur) =>
                                cur && !cur.synthetic && String(cur.id) === String(row.id) ? null : row
                              );
                            }}
                          >
                            {chargeFamilleChartData.map((e, i) => {
                              const selected =
                                e.isHors
                                  ? selectedChargeFamille?.synthetic === 'hors'
                                  : selectedChargeFamille &&
                                    !selectedChargeFamille.synthetic &&
                                    String(selectedChargeFamille.id) === String(e.sourceId);
                              return <Cell key={`${e.name}-${i}`} fill={selected ? '#b91c1c' : e.fill} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {selectedChargeFamille && (
                      <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-rose-900">
                            {selectedChargeFamille.synthetic === 'hors' ? (
                              <span>{selectedChargeFamille.label}</span>
                            ) : (
                              <span>{selectedChargeFamille.compte_lib}</span>
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedChargeFamille(null);
                              setLignesDrill(null);
                            }}
                            className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                          >
                            Fermer ×
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mb-2">
                          Détail des comptes 6x regroupés dans cette barre. Cliquez un compte pour les écritures FEC
                          (classe 6), avec parts par métier si le compte est affecté.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead>
                              <tr className="text-left text-rose-800/80">
                                <th className="pb-1.5 font-medium w-8" />
                                <th className="pb-1.5 font-medium">Compte FEC</th>
                                <th className="pb-1.5 font-medium">Libellé</th>
                                <th className="pb-1.5 font-medium">Société</th>
                                <th className="pb-1.5 text-right font-medium">Charge (période)</th>
                                <th className="pb-1.5 text-right font-medium">% poste</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-100">
                              {chargeDrillComptes.map((d, i) => {
                                const sid =
                                  d.societe_id != null && d.societe_id !== '' ? d.societe_id : societeIdParam;
                                const openCh =
                                  lignesDrill &&
                                  lignesDrill.kind === 'charge' &&
                                  String(lignesDrill.compte_num) === String(d.compte_num) &&
                                  String(lignesDrill.societe_id) === String(sid);
                                const toggleCh = () => {
                                  if (openCh) {
                                    setLignesDrill(null);
                                    return;
                                  }
                                  if (sid == null || sid === '') {
                                    return;
                                  }
                                  setLignesDrill({
                                    kind: 'charge',
                                    compte_num: d.compte_num,
                                    societe_id: sid,
                                    compte_lib: d.compte_lib,
                                  });
                                };
                                const pctPoste =
                                  totalChargeBarSelection > 0.0001
                                    ? (parseNum(d.charge) / totalChargeBarSelection) * 100
                                    : 0;
                                return (
                                  <tr
                                    key={`ch-${d.compte_num}-${d.societe_id}-${i}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={toggleCh}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleCh();
                                      }
                                    }}
                                    className={`cursor-pointer ${openCh ? 'bg-rose-200/80' : 'hover:bg-rose-100/60'}`}
                                  >
                                    <td className="py-1.5 text-slate-500">{openCh ? '▾' : '▸'}</td>
                                    <td className="py-1.5 font-mono text-slate-700">{d.compte_num}</td>
                                    <td className="py-1.5 text-slate-800">{d.compte_lib}</td>
                                    <td className="py-1.5 text-slate-600">
                                      {societes.find((s) => Number(s.id) === Number(sid))?.nom ||
                                        (sid != null ? `Soc. #${sid}` : '—')}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums font-medium text-slate-900">
                                      {money(d.charge)} €
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                                      {pctPoste.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-rose-200">
                                <td colSpan={4} className="pt-2 text-xs font-semibold text-slate-600">
                                  Total (barre)
                                </td>
                                <td className="pt-2 text-right tabular-nums font-bold text-slate-900">
                                  {money(totalChargeBarSelection)} €
                                </td>
                                <td className="pt-2 text-right tabular-nums font-semibold text-slate-500">
                                  {chargesGlobalesTotal > 0.0001
                                    ? `${((totalChargeBarSelection / chargesGlobalesTotal) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                                    : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        {lignesDrill && lignesDrill.kind === 'charge' && (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-xs font-semibold text-slate-700 mb-2">
                              Écritures FEC (classe 6) — {lignesDrill.compte_num}{' '}
                              <span className="font-normal text-slate-500">({lignesDrill.compte_lib})</span>
                            </p>
                            {lignesLoading ? (
                              <p className="text-xs text-slate-500">Chargement des écritures…</p>
                            ) : lignesRows.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                Aucune écriture FEC sur cette période pour ce compte et cette société.
                              </p>
                            ) : (
                              <>
                                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                  <table className="w-full min-w-[720px] text-[11px]">
                                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                                      <tr>
                                        <th className="py-1 pr-2">Date</th>
                                        <th className="py-1 pr-2">Jnl</th>
                                        <th className="py-1 pr-2">Pièce</th>
                                        <th className="py-1 pr-2 min-w-[140px]">Libellé</th>
                                        <th className="py-1 text-right">Débit</th>
                                        <th className="py-1 text-right">Crédit</th>
                                        <th className="py-1 text-right">Charge</th>
                                        <th className="py-1 pr-1">Métier</th>
                                        <th className="py-1 text-right">%</th>
                                        <th className="py-1 text-right">Affecté</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {lignesRows.map((row, li) => (
                                        <tr key={`c6-${row.id}-${row.metier_id ?? 'm'}-${li}`} className="text-slate-800">
                                          <td className="py-0.5 pr-2 whitespace-nowrap text-slate-600">
                                            {row.ecriture_date || '—'}
                                          </td>
                                          <td className="py-0.5 pr-2 font-mono text-slate-500">{row.journal_code || '—'}</td>
                                          <td className="py-0.5 pr-2 text-slate-500">{row.piece_ref || '—'}</td>
                                          <td
                                            className="py-0.5 pr-2 max-w-[200px] truncate"
                                            title={row.ecriture_lib || ''}
                                          >
                                            {row.ecriture_lib || '—'}
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums text-slate-500">
                                            {money(row.debit)} €
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums text-slate-500">
                                            {money(row.credit)} €
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums">
                                            {money(row.charge_brut)} €
                                          </td>
                                          <td className="py-0.5 pr-1 text-slate-600">{row.metier_libelle || '—'}</td>
                                          <td className="py-0.5 text-right tabular-nums text-slate-500">
                                            {row.pourcentage != null
                                              ? `${Number(row.pourcentage).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
                                              : '—'}
                                          </td>
                                          <td className="py-0.5 text-right tabular-nums font-medium">
                                            {money(row.charge_affectee)} €
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    {lignesTotaux && (
                                      <tfoot>
                                        <tr className="border-t border-slate-200 text-slate-700 font-medium">
                                          <td colSpan={6} className="pt-1 text-right pr-2">
                                            Totaux (charge = débit − crédit ; affecté = somme des parts)
                                          </td>
                                          <td className="pt-1 text-right tabular-nums">
                                            {money(lignesTotaux.charge_brut)} €
                                          </td>
                                          <td colSpan={2} />
                                          <td className="pt-1 text-right tabular-nums">
                                            {money(lignesTotaux.charge_affectee)} €
                                          </td>
                                        </tr>
                                      </tfoot>
                                    )}
                                  </table>
                                </div>
                                <p className="mt-2 text-[10px] text-slate-400">
                                  Une écriture peut apparaître sur plusieurs lignes si le compte est affecté à plusieurs
                                  métiers.
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {chargeCards.length === 0 && chargesNonAffecteesFamille <= 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">Aucune donnée charges sur la période.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {chargeCards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm"
                        style={{ borderLeftColor: card.couleur }}
                      >
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{money(card.charge)} €</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            {chargesGlobalesTotal > 0
                              ? `${((parseNum(card.charge) / chargesGlobalesTotal) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {chargesNonAffecteesFamille > 0 && (
                      <div className="rounded-xl border border-orange-300 border-l-4 border-l-orange-400 bg-orange-50 p-4 shadow-sm">
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Charges non affectées</p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{money(chargesNonAffecteesFamille)} €</p>
                        <button
                          type="button"
                          onClick={() => openNonAffectesComptes('charge', 'Charges non affectées — comptes')}
                          className="mt-3 w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50"
                        >
                          Voir les comptes
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

      {tab === 'groupes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Regroupez plusieurs comptes FEC 7x sous un nom de client unique pour consolider les parts de marché.
            </p>
            <button type="button"
              onClick={() => setGroupeModal({ mode: 'new' })}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shrink-0 ml-4">
              + Nouveau groupe
            </button>
          </div>

          {groupesLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-4 border-blue-600" />
            </div>
          ) : groupes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
              <p className="text-sm">Aucun groupe défini. Créez votre premier groupe pour consolider vos clients multi-filiales.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupes.map(g => (
                <GroupeClientCard
                  key={g.id}
                  groupe={g}
                  comptes7={comptes7}
                  onEdit={() => setGroupeModal({ mode: 'edit', groupe: g })}
                  onDelete={async () => {
                    if (!window.confirm(`Supprimer le groupe "${g.nom}" ?`)) return;
                    await fetch(`${API_BASE}/api/analytique/groupes-clients/${g.id}`, { method: 'DELETE' });
                    await loadGroupes();
                  }}
                  onComptesChange={async (comptes) => {
                    await fetch(`${API_BASE}/api/analytique/groupes-clients/${g.id}/comptes`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ comptes }),
                    });
                    await loadGroupes();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {groupeModal && (
        <GroupeClientModal
          mode={groupeModal.mode}
          groupe={groupeModal.groupe}
          comptes7={comptes7}
          onClose={() => setGroupeModal(null)}
          onSaved={async () => { setGroupeModal(null); await loadGroupes(); }}
        />
      )}

      {tab === 'familles' && (
        <div className="space-y-6">
          {/* ── Configuration des Charges ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Configuration des Charges</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Regroupez les comptes FEC 6x sous des familles nommées (Carburant, Social, Flotte…) pour piloter vos charges.
                </p>
              </div>
              <button type="button"
                onClick={() => setFamilleModal({ mode: 'new' })}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shrink-0 ml-4">
                + Nouvelle famille
              </button>
            </div>

            {famillesLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-b-4 border-red-600" />
              </div>
            ) : familles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                <p className="text-sm">Aucune famille définie. Créez votre première famille pour regrouper vos charges par nature.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {familles.map(f => (
                  <FamilleChargeCard
                    key={f.id}
                    famille={f}
                    comptes6={comptes6}
                    onEdit={() => setFamilleModal({ mode: 'edit', famille: f })}
                    onDelete={async () => {
                      if (!window.confirm(`Supprimer la famille "${f.nom}" ?`)) return;
                      await fetch(`${API_BASE}/api/analytique/familles-charges/${f.id}`, { method: 'DELETE' });
                      await loadFamilles();
                    }}
                    onComptesChange={async (comptes) => {
                      await fetch(`${API_BASE}/api/analytique/familles-charges/${f.id}/comptes`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ comptes }),
                      });
                      await loadFamilles();
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Comptes orphelins (non affectés à une famille) ── */}
          {comptes6.length > 0 && (() => {
            const affectes = new Set(familles.flatMap(f => f.comptes || []));
            const orphelins = comptes6.filter(c => !affectes.has(c.compte_num));
            if (orphelins.length === 0) return null;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                    {orphelins.length} compte{orphelins.length > 1 ? 's' : ''} orphelin{orphelins.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-slate-500">— non encore rangés dans une famille</span>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto divide-y divide-amber-100">
                    {orphelins.map(c => (
                      <div key={c.compte_num} className="flex items-center gap-3 px-4 py-2 text-xs">
                        <span className="font-mono text-slate-500 shrink-0 w-20">{c.compte_num}</span>
                        <span className="text-slate-700 flex-1 truncate">{nettoyerLib(c.compte_lib)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (familles.length === 0) {
                              setFamilleModal({ mode: 'new' });
                            } else {
                              setFamilleModal({ mode: 'new', prefill: c.compte_num });
                            }
                          }}
                          className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700 text-xs"
                        >
                          Ranger
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {familleModal && (
        <FamilleChargeModal
          mode={familleModal.mode}
          famille={familleModal.famille}
          prefill={familleModal.prefill}
          comptes6={comptes6}
          onClose={() => setFamilleModal(null)}
          onSaved={async () => { setFamilleModal(null); await loadFamilles(); }}
        />
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

      {nonAffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-5xl rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{nonAffModal.title}</h3>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setNonAffModal(null)}
              >
                Fermer
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Compte</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Libellé</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Montant</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!nonAffModal.rows || nonAffModal.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-500">Aucun compte non affecté.</td>
                    </tr>
                  ) : (
                    nonAffModal.rows.map((r, i) => (
                      <tr key={`${r.compte_num}-${i}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">{r.compte_num || '—'}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[420px] truncate" title={r.compte_lib || ''}>{r.compte_lib || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={r.type === 'CHARGE' ? `${badgeClass} bg-amber-50 text-amber-800 ring-amber-600/20` : `${badgeClass} bg-emerald-50 text-emerald-800 ring-emerald-600/20`}>
                            {r.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{money(r.montant)} €</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              onClick={() => {
                                setNonAffModal(null);
                                setModal({
                                  compte_num: r.compte_num,
                                  compte_lib: r.compte_lib,
                                  metier_id: metiers[0]?.id || '',
                                  pourcentage: 100,
                                });
                              }}
                            >
                              Affecter
                            </button>
                            {r.type === 'CHARGE' && (
                              <button
                                type="button"
                                className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                onClick={() => {
                                  setNonAffModal(null);
                                  setTab('familles');
                                  setFamilleModal({ mode: 'new', prefill: r.compte_num });
                                }}
                              >
                                Catégoriser
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
