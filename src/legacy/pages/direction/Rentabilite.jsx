import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Euro,
  Pencil,
  Copy,
  FolderKanban,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import API_BASE from '../../config/api';
/** Repli si l’API chargeurs est vide ou en erreur (aligné métier historique). */
const CHARGEURS_FALLBACK = [
  'GLS',
  'DPD 66',
  'CHRONOPOST',
  'COLIS PRIVE 64',
  'COLIS PRIVE 66',
  'FEDEX66',
  'CIBLEX',
  'LA POSTE',
  'RELAIS COLIS',
];

const GRILLE_FORM_DEFAULTS = {
  id: '',
  chargeurAutre: '',
  societe: 'D&J Transport',
  dateDebut: new Date().toISOString().slice(0, 10),
  dateFin: '',
  prixPdlLivre: 0,
  prixColisLivre: 0,
  prixPdlCollecte: 0,
  prixColisCollecte: 0,
  brandingType: 'aucun',
  brandingMontant: 0,
  actif: true,
};

const FORFAIT_FORM_DEFAULTS = {
  id: '',
  societe: 'D&J Transport',
  description: '',
  montant: 0,
  dateDebut: new Date().toISOString().slice(0, 10),
  dateFin: new Date().toISOString().slice(0, 10),
};

const COUTS_FORM_DEFAULTS = {
  joursTravailles: 0,
  carburant: 0,
  salaires: 0,
  leasing: 0,
  peages: 0,
  entretien: 0,
  chargesFixes: 0,
  notes: '',
};

const CA_CIBLE_FORM_DEFAULTS = {
  chargeur: '',
  societe: 'D&J Transport',
  mois: '',
  caCibleParTournee: 0,
};

const SOCIETE_OPTIONS = [
  { value: 'D&J Transport', label: 'D&J Transport' },
  { value: 'TPS TSMC EXPRESS', label: 'TPS TSMC EXPRESS' },
];

const BRANDING_TYPES = [
  { value: 'aucun', label: 'Aucun' },
  { value: 'journalier', label: 'Journalier' },
  { value: 'mensuel', label: 'Mensuel' },
];

const money = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthToRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y, m, 0);
  const lastStr = `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { dateDebut: first, dateFin: lastStr };
};

const monthLabelFr = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return String(ym || '');
  return new Date(y, Math.max(0, m - 1), 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
};

const formatDateFr = (dateStr) => {
  const s = String(dateStr || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

function isoWeekInfo(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  const monday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const mondayDay = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (mondayDay - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const toYmd = (x) => {
    const yy = x.getUTCFullYear();
    const mm = String(x.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(x.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  return {
    week,
    start: toYmd(monday),
    end: toYmd(sunday),
  };
}

function resolveChargeurFromForm(f) {
  if (f.chargeurSelect === '__autre__') return String(f.chargeurAutre || '').trim();
  return f.chargeurSelect;
}

function normStr(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeSocieteUI(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, '&')
    .trim();
}

function normalizeChargeurUI(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Noms uniques triés (API chargeurs exploitation : `{ nom, ... }`). */
function buildChargeurNoms(rows) {
  const seen = new Set();
  const noms = [];
  for (const row of rows || []) {
    const nom = String(row?.nom ?? row?.name ?? '').trim();
    if (!nom || seen.has(nom)) continue;
    seen.add(nom);
    noms.push(nom);
  }
  noms.sort((a, b) => a.localeCompare(b, 'fr'));
  return noms;
}

function aggregateComposantesParChargeur(details) {
  const map = new Map();
  for (const d of details || []) {
    if (d.erreur) continue;
    const ch = d.chargeur || 'N/A';
    if (!map.has(ch)) {
      map.set(ch, {
        chargeur: ch,
        montant: 0,
        caPdlLivre: 0,
        caColisLivre: 0,
        caPdlCollecte: 0,
        caColisCollecte: 0,
        branding: 0,
        lignes: 0,
      });
    }
    const row = map.get(ch);
    row.montant += Number(d.montant || 0);
    row.caPdlLivre += Number(d.pdlLivres || 0) * Number(d.prixPdlLivre || 0);
    row.caColisLivre += Number(d.colisLivres || 0) * Number(d.prixColisLivre || 0);
    row.caPdlCollecte += Number(d.pdlCollectes || 0) * Number(d.prixPdlCollecte || 0);
    row.caColisCollecte += Number(d.colisCollectes || 0) * Number(d.prixColisCollecte || 0);
    row.branding += Number(d.branding || 0);
    row.lignes += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.montant - a.montant);
}

function composantesFromDetail(d) {
  return {
    montant: Number(d.montant || 0),
    pdlLivres: Number(d.pdlLivres || 0),
    colisLivres: Number(d.colisLivres || 0),
    pdlCollectes: Number(d.pdlCollectes || 0),
    colisCollectes: Number(d.colisCollectes || 0),
    caPdlLivre: Number(d.pdlLivres || 0) * Number(d.prixPdlLivre || 0),
    caColisLivre: Number(d.colisLivres || 0) * Number(d.prixColisLivre || 0),
    caPdlCollecte: Number(d.pdlCollectes || 0) * Number(d.prixPdlCollecte || 0),
    caColisCollecte: Number(d.colisCollectes || 0) * Number(d.prixColisCollecte || 0),
    branding: Number(d.branding || 0),
  };
}

function addComposantes(target, c) {
  target.montant += c.montant;
  target.pdlLivres += c.pdlLivres;
  target.colisLivres += c.colisLivres;
  target.pdlCollectes += c.pdlCollectes;
  target.colisCollectes += c.colisCollectes;
  target.caPdlLivre += c.caPdlLivre;
  target.caColisLivre += c.caColisLivre;
  target.caPdlCollecte += c.caPdlCollecte;
  target.caColisCollecte += c.caColisCollecte;
  target.branding += c.branding;
}

function initAgg() {
  return {
    montant: 0,
    pdlLivres: 0,
    colisLivres: 0,
    pdlCollectes: 0,
    colisCollectes: 0,
    caPdlLivre: 0,
    caColisLivre: 0,
    caPdlCollecte: 0,
    caColisCollecte: 0,
    branding: 0,
  };
}

export default function Rentabilite() {
  const [tab, setTab] = useState('grilles');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [chargeursApi, setChargeursApi] = useState([]);
  const [chargeursLoading, setChargeursLoading] = useState(true);

  const chargeurNoms = useMemo(() => {
    const fromApi = buildChargeurNoms(chargeursApi);
    if (fromApi.length > 0) return fromApi;
    return [...CHARGEURS_FALLBACK];
  }, [chargeursApi]);

  const chargeurOptionsForfaits = useMemo(
    () => chargeurNoms.map((c) => ({ value: c, label: c })),
    [chargeurNoms]
  );

  const chargeurOptionsGrille = useMemo(
    () => [...chargeurOptionsForfaits, { value: '__autre__', label: 'Autre' }],
    [chargeurOptionsForfaits]
  );

  const createEmptyGrilleForm = useCallback(
    () => ({
      ...GRILLE_FORM_DEFAULTS,
      chargeurSelect: chargeurNoms[0] ?? '',
    }),
    [chargeurNoms]
  );

  const createEmptyForfaitForm = useCallback(
    () => ({
      ...FORFAIT_FORM_DEFAULTS,
      chargeur: chargeurNoms[0] ?? '',
    }),
    [chargeurNoms]
  );

  const [grilles, setGrilles] = useState([]);
  const [loadingGrilles, setLoadingGrilles] = useState(false);
  const [showGrilleForm, setShowGrilleForm] = useState(false);
  const [grilleForm, setGrilleForm] = useState(() => ({
    ...GRILLE_FORM_DEFAULTS,
    chargeurSelect: CHARGEURS_FALLBACK[0] ?? '',
  }));

  const [groupesModalGrille, setGroupesModalGrille] = useState(null);

  /** Période de la grille ouverte en modal (`groupesModalGrille`), en YYYY-MM-DD. */
  const { dateDebut, dateFin } = useMemo(() => {
    const g = groupesModalGrille;
    if (!g) {
      return { dateDebut: '', dateFin: '' };
    }
    const toYmd = (v) =>
      v != null && String(v).trim() !== '' ? String(v).split('T')[0].slice(0, 10) : '';
    return {
      dateDebut: toYmd(g.dateDebut),
      dateFin: toYmd(g.dateFin),
    };
  }, [groupesModalGrille]);

  const [groupesList, setGroupesList] = useState([]);
  const [loadingGroupes, setLoadingGroupes] = useState(false);
  const [groupeForm, setGroupeForm] = useState({
    id: '',
    nomGroupe: '',
    tournees: [],
    prixPdlLivre: 0,
    prixColisLivre: 0,
    prixPdlCollecte: 0,
    prixColisCollecte: 0,
  });

  const [sfTourneesLoading, setSfTourneesLoading] = useState(false);
  const [sfTourneesError, setSfTourneesError] = useState(null);
  /** Réponse GET /api/rentabilite/tournees */
  const [sfTourneeOptions, setSfTourneeOptions] = useState([]);
  const [tourneeSearch, setTourneeSearch] = useState('');
  /** Si vrai, ajoute le filtre société (peut exclure toutes les lignes si le Name SF ≠ libellé grille) */
  const [filtrerTourneeSociete, setFiltrerTourneeSociete] = useState(false);

  const displayTourneeRows = useMemo(() => {
    const byCode = new Map();
    (sfTourneeOptions || []).forEach((row) => {
      const code = String(row.code || '').trim();
      if (code) {
        byCode.set(code, {
          code,
          libelle: row.libelle != null ? String(row.libelle) : '',
          chargeur: row.chargeur != null ? String(row.chargeur) : '',
        });
      }
    });
    (groupeForm.tournees || []).forEach((c) => {
      const code = String(c || '').trim();
      if (code && !byCode.has(code)) {
        byCode.set(code, { code, libelle: '', chargeur: '' });
      }
    });
    return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, 'fr'));
  }, [sfTourneeOptions, groupeForm.tournees]);

  const filteredTourneeRows = useMemo(() => {
    const q = normStr(tourneeSearch);
    if (!q) return displayTourneeRows;
    return displayTourneeRows.filter(
      (row) =>
        normStr(row.code).includes(q) ||
        normStr(row.libelle).includes(q) ||
        normStr(row.chargeur).includes(q)
    );
  }, [displayTourneeRows, tourneeSearch]);

  const [forfaits, setForfaits] = useState([]);
  const [loadingForfaits, setLoadingForfaits] = useState(false);
  const [showForfaitForm, setShowForfaitForm] = useState(false);
  const [forfaitForm, setForfaitForm] = useState(() => ({
    ...FORFAIT_FORM_DEFAULTS,
    chargeur: CHARGEURS_FALLBACK[0] ?? '',
  }));

  const [caPeriodMode, setCaPeriodMode] = useState('month');
  const [caMonth, setCaMonth] = useState(thisMonth());
  const [caDateDebut, setCaDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [caDateFin, setCaDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [caSociete, setCaSociete] = useState('both');
  const [caLoading, setCaLoading] = useState(false);
  const [caResult, setCaResult] = useState(null);
  const [openChargeurs, setOpenChargeurs] = useState({});
  const [openSocietes, setOpenSocietes] = useState({});
  const [openTournees, setOpenTournees] = useState({});
  const [coutsMonth, setCoutsMonth] = useState(thisMonth());
  const [coutsSociete, setCoutsSociete] = useState(SOCIETE_OPTIONS[0].value);
  const [coutsChargeur, setCoutsChargeur] = useState('');
  const [coutsForm, setCoutsForm] = useState(COUTS_FORM_DEFAULTS);
  const [coutsLoading, setCoutsLoading] = useState(false);
  const [coutsSaving, setCoutsSaving] = useState(false);
  const [coutsList, setCoutsList] = useState([]);
  const [editingCoutId, setEditingCoutId] = useState(null);
  const [coutsFilterYear, setCoutsFilterYear] = useState(String(new Date().getFullYear()));
  const [coutsFilterMonth, setCoutsFilterMonth] = useState('all');
  const [coutsFilterSociete, setCoutsFilterSociete] = useState('all');
  const [coutsFilterChargeur, setCoutsFilterChargeur] = useState('all');
  const [coutsAppliedFilters, setCoutsAppliedFilters] = useState({
    year: String(new Date().getFullYear()),
    month: 'all',
    societe: 'all',
    chargeur: 'all',
  });
  const [cloneModal, setCloneModal] = useState({
    open: false,
    source: null,
    moisDestination: thisMonth(),
    ecraser: false,
  });
  const [margeYear, setMargeYear] = useState(String(new Date().getFullYear()));
  const [margeSociete, setMargeSociete] = useState('both');
  const [margeLoading, setMargeLoading] = useState(false);
  const [margeResult, setMargeResult] = useState(null);
  const [drilldown, setDrilldown] = useState({
    niveau: 'annee',
    moisSelectionne: null,
    semaineSelectionnee: null,
  });
  const [openMargeChargeurs, setOpenMargeChargeurs] = useState({});
  const [openMargeSocietes, setOpenMargeSocietes] = useState({});
  const [openMargeTournees, setOpenMargeTournees] = useState({});
  const [openMargeJours, setOpenMargeJours] = useState({});
  const [compareYear, setCompareYear] = useState(String(new Date().getFullYear()));
  const [compareIndicator, setCompareIndicator] = useState('ca');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [drilldownComparaison, setDrilldownComparaison] = useState({
    niveau: 'annee',
    anneeSelectionnee: new Date().getFullYear(),
    moisSelectionne: null,
    semaineSelectionnee: null,
    jourSelectionne: null,
  });
  /** Expand du tableau récapitulatif « Comparaison D&J vs TPS » (par société). */
  const [openCompareSocietes, setOpenCompareSocietes] = useState({ dj: false, tps: false });
  /** Filtre d’affichage du graphique uniquement (le tableau reste bi-sociétés). */
  const [compareChartSocFilter, setCompareChartSocFilter] = useState('all'); // all | dj | tps
  const [caCibleForm, setCaCibleForm] = useState({ ...CA_CIBLE_FORM_DEFAULTS, mois: thisMonth() });
  const [caCiblesList, setCaCiblesList] = useState([]);
  const [caCiblesLoading, setCaCiblesLoading] = useState(false);
  const [editingCaCibleId, setEditingCaCibleId] = useState(null);
  const [caCibleCloneModal, setCaCibleCloneModal] = useState({
    open: false,
    source: null,
    moisDestination: thisMonth(),
    ecraser: false,
  });
  const [caCibleFilters, setCaCibleFilters] = useState({
    annee: String(new Date().getFullYear()),
    mois: 'all',
    societe: 'all',
    chargeur: 'all',
  });
  const [caCibleAppliedFilters, setCaCibleAppliedFilters] = useState({
    annee: String(new Date().getFullYear()),
    mois: 'all',
    societe: 'all',
    chargeur: 'all',
  });
  const [caCibleDashboardMonth, setCaCibleDashboardMonth] = useState(thisMonth());
  const [caCibleDashboardSociete, setCaCibleDashboardSociete] = useState('both');
  const [caCibleDashboardData, setCaCibleDashboardData] = useState([]);

  const showMsg = useCallback((text, isErr = false) => {
    if (isErr) {
      setError(text);
      setMessage(null);
    } else {
      setMessage(text);
      setError(null);
      if (text) setTimeout(() => setMessage(null), 4000);
    }
  }, []);

  const fetchGrilles = useCallback(async () => {
    setLoadingGrilles(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/grilles`);
      if (!r.ok) throw new Error('Impossible de charger les grilles');
      setGrilles(await r.json());
    } catch (e) {
      showMsg(e.message, true);
    } finally {
      setLoadingGrilles(false);
    }
  }, [showMsg]);

  const fetchForfaits = useCallback(async () => {
    setLoadingForfaits(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/forfaits`);
      if (!r.ok) throw new Error('Impossible de charger les forfaits');
      setForfaits(await r.json());
    } catch (e) {
      showMsg(e.message, true);
    } finally {
      setLoadingForfaits(false);
    }
  }, [showMsg]);

  const fetchCouts = useCallback(async () => {
    setCoutsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/couts`);
      if (!r.ok) throw new Error('Impossible de charger les coûts');
      setCoutsList(await r.json());
    } catch (e) {
      showMsg(e.message, true);
    } finally {
      setCoutsLoading(false);
    }
  }, [showMsg]);

  const fetchCaCibles = useCallback(async () => {
    setCaCiblesLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/ca-cibles`);
      if (!r.ok) throw new Error('Impossible de charger les CA cibles');
      setCaCiblesList(await r.json());
    } catch (e) {
      showMsg(e.message, true);
    } finally {
      setCaCiblesLoading(false);
    }
  }, [showMsg]);

  useEffect(() => {
    if (tab === 'grilles') fetchGrilles();
    if (tab === 'forfaits') fetchForfaits();
    if (tab === 'marge') fetchCouts();
    if (tab === 'ca-cible') fetchCaCibles();
  }, [tab, fetchGrilles, fetchForfaits, fetchCouts, fetchCaCibles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChargeursLoading(true);
      try {
        const r = await fetch(
          `${API_BASE}/api/exploitation/chargeurs?environment=production`
        );
        if (!r.ok) throw new Error('Chargeurs indisponibles');
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setChargeursApi(data);
      } catch {
        if (!cancelled) setChargeursApi([]);
      } finally {
        if (!cancelled) setChargeursLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openNewGrille = () => {
    setGrilleForm(createEmptyGrilleForm());
    setShowGrilleForm(true);
  };

  const openEditGrille = (g) => {
    const nom = String(g.chargeur ?? '').trim();
    const known = nom && chargeurNoms.includes(nom);
    setGrilleForm({
      id: g.id,
      chargeurSelect: known ? nom : '__autre__',
      chargeurAutre: known ? '' : (g.chargeur ?? ''),
      societe: SOCIETE_OPTIONS.some((s) => s.value === g.societe) ? g.societe : g.societe,
      dateDebut: g.dateDebut || '',
      dateFin: g.dateFin || '',
      prixPdlLivre: g.prixPdlLivre ?? 0,
      prixColisLivre: g.prixColisLivre ?? 0,
      prixPdlCollecte: g.prixPdlCollecte ?? 0,
      prixColisCollecte: g.prixColisCollecte ?? 0,
      brandingType: g.brandingType || 'aucun',
      brandingMontant: g.brandingMontant ?? 0,
      actif: g.actif !== false,
    });
    setShowGrilleForm(true);
  };

  const saveGrille = async (e) => {
    e?.preventDefault?.();
    const chargeur = resolveChargeurFromForm(grilleForm);
    if (!chargeur) {
      showMsg('Indiquez un chargeur.', true);
      return;
    }
    if (!grilleForm.societe) {
      showMsg('Sélectionnez une société.', true);
      return;
    }
    try {
      const payload = {
        id: grilleForm.id || undefined,
        chargeur,
        societe: grilleForm.societe,
        dateDebut: grilleForm.dateDebut,
        dateFin: grilleForm.dateFin || null,
        prixPdlLivre: Number(grilleForm.prixPdlLivre),
        prixColisLivre: Number(grilleForm.prixColisLivre),
        prixPdlCollecte: Number(grilleForm.prixPdlCollecte),
        prixColisCollecte: Number(grilleForm.prixColisCollecte),
        brandingType: grilleForm.brandingType,
        brandingMontant: Number(grilleForm.brandingMontant),
        actif: grilleForm.actif,
      };
      const r = await fetch(`${API_BASE}/api/rentabilite/grilles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur enregistrement grille');
      }
      setShowGrilleForm(false);
      showMsg('Grille enregistrée.');
      await fetchGrilles();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const deleteGrille = async (id) => {
    if (!window.confirm('Supprimer cette grille et ses groupes de tournées ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/grilles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Suppression impossible');
      }
      showMsg('Grille supprimée.');
      await fetchGrilles();
      if (groupesModalGrille?.id === id) {
        closeGroupesModal();
      }
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const closeGroupesModal = () => {
    setGroupesModalGrille(null);
    setGroupesList([]);
    setTourneeSearch('');
    setFiltrerTourneeSociete(false);
    setSfTourneeOptions([]);
    setSfTourneesError(null);
    setSfTourneesLoading(false);
  };

  const refetchTourneesSf = useCallback(async (grille, includeSociete) => {
    if (!grille) return;
    setSfTourneesLoading(true);
    setSfTourneesError(null);
    try {
      const qs = new URLSearchParams();
      if (grille.chargeur != null && String(grille.chargeur).trim() !== '') {
        qs.set('chargeur', String(grille.chargeur).trim());
      }
      if (includeSociete && grille.societe != null && String(grille.societe).trim() !== '') {
        qs.set('societe', String(grille.societe).trim());
      }
      const r = await fetch(`${API_BASE}/api/rentabilite/tournees?${qs}`);
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = data?.error || data?.message || `Erreur ${r.status}`;
        throw new Error(msg);
      }
      if (!Array.isArray(data)) {
        throw new Error('Réponse tournées invalide');
      }
      setSfTourneeOptions(
        data
          .filter((t) => t && String(t.code || '').trim())
          .map((t) => ({
            code: String(t.code).trim(),
            libelle: t.libelle != null ? String(t.libelle) : '',
            chargeur: t.chargeur != null ? String(t.chargeur) : '',
          }))
      );
    } catch (e) {
      setSfTourneesError(e.message || String(e));
      setSfTourneeOptions([]);
    } finally {
      setSfTourneesLoading(false);
    }
  }, []);

  const openGroupesModal = async (grille) => {
    setTourneeSearch('');
    setFiltrerTourneeSociete(false);
    setSfTourneesError(null);
    setSfTourneeOptions([]);
    setGroupesModalGrille(grille);
    setGroupeForm({
      id: '',
      nomGroupe: '',
      tournees: [],
      prixPdlLivre: grille.prixPdlLivre ?? 0,
      prixColisLivre: grille.prixColisLivre ?? 0,
      prixPdlCollecte: grille.prixPdlCollecte ?? 0,
      prixColisCollecte: grille.prixColisCollecte ?? 0,
    });

    setLoadingGroupes(true);
    setSfTourneesLoading(true);

    const loadGroupes = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/rentabilite/grilles/${encodeURIComponent(grille.id)}/groupes`);
        if (!r.ok) throw new Error('Chargement groupes impossible');
        setGroupesList(await r.json());
      } catch (e) {
        showMsg(e.message, true);
        setGroupesList([]);
      } finally {
        setLoadingGroupes(false);
      }
    };

    const loadSfTournees = async () => {
      await refetchTourneesSf(grille, false);
    };

    await Promise.all([loadGroupes(), loadSfTournees()]);
  };

  const toggleTourneeCode = (code, checked) => {
    setGroupeForm((f) => {
      const next = new Set(f.tournees);
      if (checked) next.add(code);
      else next.delete(code);
      return { ...f, tournees: Array.from(next) };
    });
  };

  const saveGroupe = async (e) => {
    e?.preventDefault?.();
    if (!groupesModalGrille) return;
    if (!String(groupeForm.nomGroupe || '').trim()) {
      showMsg('Nom du groupe requis.', true);
      return;
    }
    try {
      const r = await fetch(
        `${API_BASE}/api/rentabilite/grilles/${encodeURIComponent(groupesModalGrille.id)}/groupes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: groupeForm.id || undefined,
            nomGroupe: groupeForm.nomGroupe.trim(),
            tournees: groupeForm.tournees,
            prixPdlLivre: Number(groupeForm.prixPdlLivre),
            prixColisLivre: Number(groupeForm.prixColisLivre),
            prixPdlCollecte: Number(groupeForm.prixPdlCollecte),
            prixColisCollecte: Number(groupeForm.prixColisCollecte),
          }),
        }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur enregistrement groupe');
      }
      showMsg('Groupe enregistré.');
      setGroupeForm((f) => ({
        ...f,
        id: '',
        nomGroupe: '',
        tournees: [],
      }));
      const r2 = await fetch(
        `${API_BASE}/api/rentabilite/grilles/${encodeURIComponent(groupesModalGrille.id)}/groupes`
      );
      if (r2.ok) setGroupesList(await r2.json());
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const editGroupe = (g) => {
    setGroupeForm({
      id: g.id,
      nomGroupe: g.nomGroupe || '',
      tournees: [...(g.tournees || [])],
      prixPdlLivre: g.prixPdlLivre,
      prixColisLivre: g.prixColisLivre,
      prixPdlCollecte: g.prixPdlCollecte,
      prixColisCollecte: g.prixColisCollecte,
    });
  };

  const deleteGroupe = async (id) => {
    if (!window.confirm('Supprimer ce groupe ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/groupes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Suppression impossible');
      }
      showMsg('Groupe supprimé.');
      setGroupesList((list) => list.filter((g) => g.id !== id));
      if (groupeForm.id === id) {
        setGroupeForm({
          id: '',
          nomGroupe: '',
          tournees: [],
          prixPdlLivre: groupesModalGrille?.prixPdlLivre ?? 0,
          prixColisLivre: groupesModalGrille?.prixColisLivre ?? 0,
          prixPdlCollecte: groupesModalGrille?.prixPdlCollecte ?? 0,
          prixColisCollecte: groupesModalGrille?.prixColisCollecte ?? 0,
        });
      }
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const saveForfait = async (e) => {
    e?.preventDefault?.();
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/forfaits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: forfaitForm.id || undefined,
          chargeur: forfaitForm.chargeur,
          societe: forfaitForm.societe,
          description: String(forfaitForm.description || '').trim(),
          montant: Number(forfaitForm.montant),
          dateDebut: forfaitForm.dateDebut,
          dateFin: forfaitForm.dateFin,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur enregistrement');
      }
      setShowForfaitForm(false);
      setForfaitForm(createEmptyForfaitForm());
      showMsg('Forfait enregistré.');
      await fetchForfaits();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const deleteForfait = async (id) => {
    if (!window.confirm('Supprimer ce forfait ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/forfaits/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Suppression impossible');
      }
      showMsg('Forfait supprimé.');
      await fetchForfaits();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const runCalculCA = async () => {
    let dateDebut;
    let dateFin;
    if (caPeriodMode === 'month') {
      const rng = monthToRange(caMonth);
      dateDebut = rng.dateDebut;
      dateFin = rng.dateFin;
    } else {
      dateDebut = caDateDebut;
      dateFin = caDateFin;
    }
    if (!dateDebut || !dateFin || dateFin < dateDebut) {
      showMsg('Période invalide.', true);
      return;
    }
    let societeParam = null;
    if (caSociete === 'dj') societeParam = 'D&J Transport';
    if (caSociete === 'tps') societeParam = 'TPS TSMC EXPRESS';

    const qs = new URLSearchParams({
      dateDebut,
      dateFin,
      ...(societeParam ? { societe: societeParam } : {}),
    });
    setCaLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/calcul?${qs}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur calcul CA');
      }
      setCaResult(await r.json());
      showMsg('Calcul terminé.');
    } catch (err) {
      showMsg(err.message, true);
      setCaResult(null);
    } finally {
      setCaLoading(false);
    }
  };

  const saveCouts = async (e) => {
    e?.preventDefault?.();
    setCoutsSaving(true);
    try {
      const payload = {
        mois: coutsMonth,
        societe: coutsSociete,
        chargeur: coutsChargeur || null,
        joursTravailles: Number(coutsForm.joursTravailles || 0),
        carburant: Number(coutsForm.carburant || 0),
        salaires: Number(coutsForm.salaires || 0),
        leasing: Number(coutsForm.leasing || 0),
        peages: Number(coutsForm.peages || 0),
        entretien: Number(coutsForm.entretien || 0),
        chargesFixes: Number(coutsForm.chargesFixes || 0),
        notes: String(coutsForm.notes || '').trim(),
      };
      const isEdit = Boolean(editingCoutId);
      const r = await fetch(
        isEdit ? `${API_BASE}/api/rentabilite/couts/${encodeURIComponent(editingCoutId)}` : `${API_BASE}/api/rentabilite/couts`,
        {
          method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || (isEdit ? 'Erreur mise à jour coûts' : 'Erreur enregistrement coûts'));
      }
      showMsg(isEdit ? 'Coût mis à jour.' : 'Coûts enregistrés.');
      setCoutsForm(COUTS_FORM_DEFAULTS);
      setEditingCoutId(null);
      await fetchCouts();
    } catch (err) {
      showMsg(err.message, true);
    } finally {
      setCoutsSaving(false);
    }
  };

  const editCout = (c) => {
    setEditingCoutId(c.id);
    setCoutsMonth(c.mois || thisMonth());
    setCoutsSociete(c.societe || SOCIETE_OPTIONS[0].value);
    setCoutsChargeur(c.chargeur || '');
    setCoutsForm({
      joursTravailles: Number(c.joursTravailles || 0),
      carburant: Number(c.carburant || 0),
      salaires: Number(c.salaires || 0),
      leasing: Number(c.leasing || 0),
      peages: Number(c.peages || 0),
      entretien: Number(c.entretien || 0),
      chargesFixes: Number(c.chargesFixes || 0),
      notes: c.notes || '',
    });
  };

  const openCloneCout = (c) => {
    setCloneModal({
      open: true,
      source: c,
      moisDestination: c.mois || thisMonth(),
      ecraser: false,
    });
  };

  const confirmCloneCout = async () => {
    if (!cloneModal.source?.id) return;
    try {
      const r = await fetch(
        `${API_BASE}/api/rentabilite/couts/${encodeURIComponent(cloneModal.source.id)}/cloner`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moisDestination: cloneModal.moisDestination,
            ecraser: cloneModal.ecraser,
          }),
        }
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Clonage impossible');
      }
      showMsg('Coût cloné.');
      setCloneModal({ open: false, source: null, moisDestination: thisMonth(), ecraser: false });
      await fetchCouts();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const deleteCout = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce coût ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/couts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Suppression impossible');
      }
      if (editingCoutId === id) {
        setEditingCoutId(null);
        setCoutsForm(COUTS_FORM_DEFAULTS);
      }
      showMsg('Coût supprimé.');
      await fetchCouts();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const filteredCoutsList = useMemo(() => {
    return (coutsList || [])
      .filter((c) => {
        const month = String(c.mois || '');
        const y = month.slice(0, 4);
        const m = month.slice(5, 7);
        if (coutsAppliedFilters.year !== 'all' && y !== coutsAppliedFilters.year) return false;
        if (coutsAppliedFilters.month !== 'all' && m !== coutsAppliedFilters.month) return false;
        if (coutsAppliedFilters.societe !== 'all' && String(c.societe || '') !== coutsAppliedFilters.societe)
          return false;
        if (coutsAppliedFilters.chargeur !== 'all' && String(c.chargeur || '') !== coutsAppliedFilters.chargeur)
          return false;
        return true;
      })
      .sort((a, b) => {
        const m = String(a.mois || '').localeCompare(String(b.mois || ''));
        if (m !== 0) return m;
        return String(a.chargeur || '').localeCompare(String(b.chargeur || ''), 'fr');
      });
  }, [coutsList, coutsAppliedFilters]);

  const runCalculMarge = async () => {
    const y = Number(margeYear);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      showMsg('Année invalide.', true);
      return;
    }
    const qs = new URLSearchParams({
      dateDebut: `${y}-01-01`,
      dateFin: `${y}-12-31`,
      ...(margeSociete === 'dj'
        ? { societe: 'D&J Transport' }
        : margeSociete === 'tps'
          ? { societe: 'TPS TSMC EXPRESS' }
          : {}),
    });
    setMargeLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/marge?${qs}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur calcul marge');
      }
      setMargeResult(await r.json());
      setDrilldown({ niveau: 'annee', moisSelectionne: null, semaineSelectionnee: null });
      showMsg('Analyse marge calculée.');
    } catch (err) {
      showMsg(err.message, true);
      setMargeResult(null);
    } finally {
      setMargeLoading(false);
    }
  };

  const runComparaisonDjTps = async () => {
    const y = Number(compareYear);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      showMsg('Année invalide.', true);
      return;
    }
    const qs = new URLSearchParams({
      dateDebut: `${y}-01-01`,
      dateFin: `${y}-12-31`,
    });
    setCompareLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/marge?${qs}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur comparaison D&J vs TPS');
      }
      setCompareResult(await r.json());
      setCompareChartSocFilter('all');
      setDrilldownComparaison({
        niveau: 'annee',
        anneeSelectionnee: y,
        moisSelectionne: null,
        semaineSelectionnee: null,
        jourSelectionne: null,
      });
    } catch (err) {
      showMsg(err.message, true);
      setCompareResult(null);
    } finally {
      setCompareLoading(false);
    }
  };

  const saveCaCible = async (e) => {
    e?.preventDefault?.();
    try {
      const payload = {
        id: editingCaCibleId || undefined,
        chargeur: caCibleForm.chargeur,
        societe: caCibleForm.societe,
        mois: caCibleForm.mois,
        caCibleParTournee: Number(caCibleForm.caCibleParTournee || 0),
      };
      const r = await fetch(`${API_BASE}/api/rentabilite/ca-cibles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur enregistrement CA cible');
      }
      showMsg(editingCaCibleId ? 'CA cible mis à jour.' : 'CA cible enregistré.');
      setEditingCaCibleId(null);
      setCaCibleForm({ ...CA_CIBLE_FORM_DEFAULTS, mois: thisMonth(), chargeur: chargeurOptionsForfaits[0]?.value || '' });
      await fetchCaCibles();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const editCaCible = (row) => {
    setEditingCaCibleId(row.id);
    setCaCibleForm({
      chargeur: row.chargeur || '',
      societe: row.societe || SOCIETE_OPTIONS[0].value,
      mois: row.mois || thisMonth(),
      caCibleParTournee: Number(row.caCibleParTournee || 0),
    });
  };

  const deleteCaCible = async (id) => {
    if (!window.confirm('Supprimer cette cible ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/ca-cibles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Suppression impossible');
      }
      showMsg('CA cible supprimé.');
      await fetchCaCibles();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const cloneCaCible = async () => {
    const src = caCibleCloneModal.source;
    if (!src?.id) return;
    try {
      const r = await fetch(`${API_BASE}/api/rentabilite/ca-cibles/${encodeURIComponent(src.id)}/cloner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moisDestination: caCibleCloneModal.moisDestination,
          ecraser: caCibleCloneModal.ecraser,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Clonage impossible');
      }
      showMsg('CA cible cloné.');
      setCaCibleCloneModal({ open: false, source: null, moisDestination: thisMonth(), ecraser: false });
      await fetchCaCibles();
    } catch (err) {
      showMsg(err.message, true);
    }
  };

  const caTreeRows = useMemo(() => {
    const byChargeur = new Map();
    for (const d of caResult?.details || []) {
      if (d?.erreur) continue;
      const chargeur = String(d.chargeur || 'N/A');
      const societe = String(d.societe || 'N/A');
      const tournee = String(d.tournee || 'N/A');
      const date = String(d.date || '');
      const keyTournee = `${chargeur}::${societe}::${tournee}`;
      const comp = composantesFromDetail(d);

      if (!byChargeur.has(chargeur)) {
        byChargeur.set(chargeur, { chargeur, ...initAgg(), societes: new Map() });
      }
      const ch = byChargeur.get(chargeur);
      addComposantes(ch, comp);

      if (!ch.societes.has(societe)) {
        ch.societes.set(societe, { societe, ...initAgg(), tournees: new Map() });
      }
      const soc = ch.societes.get(societe);
      addComposantes(soc, comp);

      if (!soc.tournees.has(keyTournee)) {
        soc.tournees.set(keyTournee, {
          key: keyTournee,
          tournee,
          ...initAgg(),
          days: new Map(),
        });
      }
      const tr = soc.tournees.get(keyTournee);
      addComposantes(tr, comp);

      if (!tr.days.has(date)) {
        tr.days.set(date, { date, ...initAgg() });
      }
      addComposantes(tr.days.get(date), comp);
    }

    return Array.from(byChargeur.values())
      .sort((a, b) => b.montant - a.montant)
      .map((c) => ({
        ...c,
        societes: Array.from(c.societes.values())
          .sort((a, b) => b.montant - a.montant)
          .map((s) => ({
            ...s,
            tournees: Array.from(s.tournees.values())
              .sort((a, b) => b.montant - a.montant)
              .map((t) => ({
                ...t,
                nbJours: t.days.size,
                detailsByDate: Array.from(t.days.values()).sort((a, b) =>
                  String(a.date).localeCompare(String(b.date))
                ),
              })),
          })),
      }));
  }, [caResult]);

  useEffect(() => {
    setOpenChargeurs({});
    setOpenSocietes({});
    setOpenTournees({});
  }, [caResult]);

  const margeRows = useMemo(() => {
    const rows = Array.isArray(margeResult?.parMois) ? [...margeResult.parMois] : [];
    return rows.sort((a, b) => String(a.mois).localeCompare(String(b.mois)));
  }, [margeResult]);

  const margeTotals = useMemo(() => {
    return margeRows.reduce(
      (acc, r) => {
        acc.ca += Number(r.ca || 0);
        acc.carburant += Number(r.carburant || 0);
        acc.salaires += Number(r.salaires || 0);
        acc.leasing += Number(r.leasing || 0);
        acc.peages += Number(r.peages || 0);
        acc.entretien += Number(r.entretien || 0);
        acc.chargesFixes += Number(r.chargesFixes || 0);
        acc.totalCouts += Number(r.totalCouts || 0);
        acc.marge += Number(r.marge || 0);
        acc.caCible += Number(r.caCible || 0);
        acc.ecartCible += Number(r.ecartCible || 0);
        return acc;
      },
      {
        ca: 0,
        carburant: 0,
        salaires: 0,
        leasing: 0,
        peages: 0,
        entretien: 0,
        chargesFixes: 0,
        totalCouts: 0,
        marge: 0,
        caCible: 0,
        ecartCible: 0,
      }
    );
  }, [margeRows]);

  const margeChartData = useMemo(
    () =>
      margeRows.map((r) => ({
        mois: r.mois,
        moisLabel: String(r.mois || '').slice(5),
        ca: Number(r.ca || 0),
        caCible: Number((r.caCibleMensuelAffiche ?? r.caCible) || 0),
        totalCouts: Number(r.totalCouts || 0),
        marge: Number(r.marge || 0),
      })),
    [margeRows]
  );

  const chartMoisData = useMemo(() => {
    const m = drilldown.moisSelectionne;
    if (!m) return [];
    const rows = (margeResult?.parJour || []).filter((r) => String(r.date || '').slice(0, 7) === m);
    const byWeek = new Map();
    for (const r of rows) {
      const info = isoWeekInfo(String(r.date));
      const key = `${m}::${info.week}`;
      if (!byWeek.has(key)) {
        byWeek.set(key, {
          key,
          semaine: info.week,
          semaineLabel: `S${info.week}`,
          debut: info.start,
          fin: info.end,
          ca: 0,
          caCible: 0,
          totalCouts: 0,
          marge: 0,
        });
      }
      const w = byWeek.get(key);
      w.ca += Number(r.ca || 0);
      w.caCible += Number(r.caCible || 0);
      w.totalCouts += Number(r.totalCouts || r.coutVentile || 0);
      w.marge += Number(r.marge || 0);
    }
    return Array.from(byWeek.values()).sort((a, b) => a.semaine - b.semaine);
  }, [drilldown.moisSelectionne, margeResult]);

  const chartSemaineData = useMemo(() => {
    const sel = drilldown.semaineSelectionnee;
    const mois = drilldown.moisSelectionne;
    if (!sel || !mois) return [];
    return (margeResult?.parJour || [])
      .filter((r) => String(r.date || '').slice(0, 7) === mois)
      .filter((r) => {
        const info = isoWeekInfo(String(r.date));
        return info.week === sel.numero;
      })
      .filter((r) => Number(r.ca || 0) > 0 || Number(r.totalCouts || r.coutVentile || 0) > 0)
      .map((r) => ({
        ...r,
        jourLabel: String(r.date || '').slice(8, 10),
        caCible: Number(r.caCible || 0),
        totalCouts: Number(r.totalCouts || r.coutVentile || 0),
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [drilldown.moisSelectionne, drilldown.semaineSelectionnee, margeResult]);

  const margeParTourneeTree = useMemo(() => {
    const byChargeur = new Map();
    for (const row of margeResult?.parTournee || []) {
      const chargeur = String(row.chargeur || 'N/A');
      const societe = String(row.societe || 'N/A');
      const tournee = String(row.tournee || 'N/A');
      if (!byChargeur.has(chargeur)) {
        byChargeur.set(chargeur, {
          chargeur,
          ca: 0,
          caCible: 0,
          ecartCible: 0,
          colisLivres: 0,
          coutVentile: 0,
          carburant: 0,
          salaires: 0,
          leasing: 0,
          peages: 0,
          entretien: 0,
          chargesFixes: 0,
          marge: 0,
          societes: new Map(),
        });
      }
      const ch = byChargeur.get(chargeur);
      ch.ca += Number(row.ca || 0);
      ch.caCible += Number(row.caCible || 0);
      ch.ecartCible += Number(row.ecartCible || 0);
      ch.colisLivres += Number(row.colisLivres || 0);
      ch.coutVentile += Number(row.coutVentile || 0);
      ch.carburant += Number(row.couts?.carburant || 0);
      ch.salaires += Number(row.couts?.salaires || 0);
      ch.leasing += Number(row.couts?.leasing || 0);
      ch.peages += Number(row.couts?.peages || 0);
      ch.entretien += Number(row.couts?.entretien || 0);
      ch.chargesFixes += Number(row.couts?.chargesFixes || 0);
      ch.marge += Number(row.marge || 0);

      if (!ch.societes.has(societe)) {
        ch.societes.set(societe, {
          societe,
          ca: 0,
          caCible: 0,
          ecartCible: 0,
          colisLivres: 0,
          coutVentile: 0,
          carburant: 0,
          salaires: 0,
          leasing: 0,
          peages: 0,
          entretien: 0,
          chargesFixes: 0,
          marge: 0,
          tournees: new Map(),
        });
      }
      const soc = ch.societes.get(societe);
      soc.ca += Number(row.ca || 0);
      soc.caCible += Number(row.caCible || 0);
      soc.ecartCible += Number(row.ecartCible || 0);
      soc.colisLivres += Number(row.colisLivres || 0);
      soc.coutVentile += Number(row.coutVentile || 0);
      soc.carburant += Number(row.couts?.carburant || 0);
      soc.salaires += Number(row.couts?.salaires || 0);
      soc.leasing += Number(row.couts?.leasing || 0);
      soc.peages += Number(row.couts?.peages || 0);
      soc.entretien += Number(row.couts?.entretien || 0);
      soc.chargesFixes += Number(row.couts?.chargesFixes || 0);
      soc.marge += Number(row.marge || 0);

      if (!soc.tournees.has(tournee)) {
        soc.tournees.set(tournee, {
          tournee,
          ca: 0,
          caCible: 0,
          ecartCible: 0,
          colisLivres: 0,
          coutVentile: 0,
          carburant: 0,
          salaires: 0,
          leasing: 0,
          peages: 0,
          entretien: 0,
          chargesFixes: 0,
          marge: 0,
          detailsByDay: [],
          dates: new Set(),
        });
      }
      const tr = soc.tournees.get(tournee);
      tr.ca += Number(row.ca || 0);
      tr.caCible += Number(row.caCible || 0);
      tr.ecartCible += Number(row.ecartCible || 0);
      tr.colisLivres += Number(row.colisLivres || 0);
      tr.coutVentile += Number(row.coutVentile || 0);
      tr.carburant += Number(row.couts?.carburant || 0);
      tr.salaires += Number(row.couts?.salaires || 0);
      tr.leasing += Number(row.couts?.leasing || 0);
      tr.peages += Number(row.couts?.peages || 0);
      tr.entretien += Number(row.couts?.entretien || 0);
      tr.chargesFixes += Number(row.couts?.chargesFixes || 0);
      tr.marge += Number(row.marge || 0);
      tr.dates.add(String(row.date || ''));
      tr.detailsByDay.push(row);
    }

    return Array.from(byChargeur.values())
      .sort((a, b) => b.ca - a.ca)
      .map((ch) => ({
        ...ch,
        tauxMarge: ch.ca > 0 ? (ch.marge / ch.ca) * 100 : 0,
        statutCible: ch.caCible > 0 && (ch.ecartCible / ch.caCible) * 100 > 5 ? 'dessus' : ch.caCible > 0 && (ch.ecartCible / ch.caCible) * 100 < -5 ? 'dessous' : 'cible',
        societes: Array.from(ch.societes.values())
          .sort((a, b) => b.ca - a.ca)
          .map((soc) => ({
            ...soc,
            tauxMarge: soc.ca > 0 ? (soc.marge / soc.ca) * 100 : 0,
            statutCible: soc.caCible > 0 && (soc.ecartCible / soc.caCible) * 100 > 5 ? 'dessus' : soc.caCible > 0 && (soc.ecartCible / soc.caCible) * 100 < -5 ? 'dessous' : 'cible',
            tournees: Array.from(soc.tournees.values())
              .sort((a, b) => b.ca - a.ca)
              .map((tr) => ({
                ...tr,
                nbJours: tr.dates.size,
                tauxMarge: tr.ca > 0 ? (tr.marge / tr.ca) * 100 : 0,
                statutCible: tr.caCible > 0 && (tr.ecartCible / tr.caCible) * 100 > 5 ? 'dessus' : tr.caCible > 0 && (tr.ecartCible / tr.caCible) * 100 < -5 ? 'dessous' : 'cible',
                detailsByDay: tr.detailsByDay
                  .slice()
                  .sort((a, b) => String(a.date).localeCompare(String(b.date))),
              })),
          })),
      }));
  }, [margeResult]);

  const margeParJourRows = useMemo(() => {
    const rows = Array.isArray(margeResult?.parJour) ? [...margeResult.parJour] : [];
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [margeResult]);

  const margeParJourDetails = useMemo(() => {
    const byDate = new Map();
    for (const row of margeResult?.parTournee || []) {
      const d = String(row.date || '');
      if (!byDate.has(d)) byDate.set(d, []);
      const ca = Number(row.ca || 0);
      const caCible = Number(row.caCible || 0);
      const ecart = ca - caCible;
      const tauxEcart = caCible > 0 ? (ecart / caCible) * 100 : 0;
      const marge = ca - Number(row.coutVentile || 0);
      const tauxMarge = ca > 0 ? (marge / ca) * 100 : 0;
      byDate.get(d).push({
        tournee: row.tournee,
        ca,
        caCible,
        coutVentile: Number(row.coutVentile || 0),
        ecartCible: ecart,
        tauxEcart,
        margeReelle: marge,
        tauxMarge,
        statut: tauxEcart > 5 ? 'dessus' : tauxEcart < -5 ? 'dessous' : 'cible',
      });
    }
    for (const [d, list] of byDate.entries()) {
      byDate.set(
        d,
        list.sort((a, b) => String(a.tournee || '').localeCompare(String(b.tournee || ''), 'fr'))
      );
    }
    return byDate;
  }, [margeResult]);

  const compareRows = useMemo(() => {
    const src = compareResult?.parTournee || [];
    if (!src.length) return [];
    const monthShort = (ym) => {
      const [y, m] = String(ym || '').split('-').map(Number);
      if (!Number.isFinite(y) || !Number.isFinite(m)) return String(ym || '');
      return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' });
    };
    const niveau = drilldownComparaison.niveau;
    const annee = String(drilldownComparaison.anneeSelectionnee || '');
    const moisSel = String(drilldownComparaison.moisSelectionne || '');
    const semaineSel = Number(drilldownComparaison.semaineSelectionnee?.numero || 0);
    const jourSel = String(drilldownComparaison.jourSelectionne || '');

    const scoped = src.filter((r) => {
      const d = String(r.date || '');
      if (d.slice(0, 4) !== annee) return false;
      if (niveau === 'mois' || niveau === 'semaine' || niveau === 'jour') {
        if (!moisSel || d.slice(0, 7) !== moisSel) return false;
      }
      if (niveau === 'semaine' || niveau === 'jour') {
        const info = isoWeekInfo(d);
        if (!semaineSel || info.week !== semaineSel) return false;
      }
      if (niveau === 'jour') {
        if (!jourSel || d !== jourSel) return false;
      }
      return true;
    });

    const keyOf = (r) => {
      const d = String(r.date || '');
      if (niveau === 'annee') return d.slice(0, 7);
      if (niveau === 'mois') {
        const info = isoWeekInfo(d);
        return `${moisSel}-W${String(info.week).padStart(2, '0')}`;
      }
      if (niveau === 'semaine') return d;
      return String(r.tournee || 'N/A');
    };
    const labelOf = (k) => {
      if (niveau === 'annee') return monthShort(k);
      if (niveau === 'mois') return `S${(k.split('-W')[1] || '')}`;
      if (niveau === 'semaine') return new Date(`${k}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return k;
    };
    const normSoc = (s) => normalizeSocieteUI(s);
    const isDj = (s) => normSoc(s) === normalizeSocieteUI('D&J Transport');
    const isTps = (s) => normSoc(s) === normalizeSocieteUI('TPS TSMC EXPRESS');
    const map = new Map();
    for (const r of scoped) {
      const k = keyOf(r);
      if (!map.has(k)) {
        map.set(k, {
          periode: k,
          periodeLabel: labelOf(k),
          caDj: 0,
          caTps: 0,
          caCibleDj: 0,
          caCibleTps: 0,
          coutDj: 0,
          coutTps: 0,
          margeDj: 0,
          margeTps: 0,
          semaineNumero: niveau === 'mois' ? Number(String(k).split('-W')[1] || 0) : null,
          dateKey: niveau === 'semaine' ? k : null,
        });
      }
      const row = map.get(k);
      const ca = Number(r.ca || 0);
      const cible = Number(r.caCible || 0);
      const cout = Number(r.coutVentile || 0);
      const marge = ca - cout;
      if (isDj(r.societe)) {
        row.caDj += ca;
        row.caCibleDj += cible;
        row.coutDj += cout;
        row.margeDj += marge;
      } else if (isTps(r.societe)) {
        row.caTps += ca;
        row.caCibleTps += cible;
        row.coutTps += cout;
        row.margeTps += marge;
      }
    }
    const val = (r, side) => {
      const ca = side === 'dj' ? r.caDj : r.caTps;
      const cout = side === 'dj' ? r.coutDj : r.coutTps;
      const marge = side === 'dj' ? r.margeDj : r.margeTps;
      const cible = side === 'dj' ? r.caCibleDj : r.caCibleTps;
      if (compareIndicator === 'ca') return ca;
      if (compareIndicator === 'caCible') return cible;
      if (compareIndicator === 'coutVentile') return cout;
      if (compareIndicator === 'marge') return marge;
      return ca > 0 ? (marge / ca) * 100 : 0;
    };
    return Array.from(map.values())
      .sort((a, b) => String(a.periode).localeCompare(String(b.periode)))
      .map((r) => ({
        ...r,
        valueDj: val(r, 'dj'),
        valueTps: val(r, 'tps'),
        ecart: r.caDj - r.caTps,
      }));
  }, [compareResult, drilldownComparaison, compareIndicator]);

  const compareTotals = useMemo(
    () =>
      compareRows.reduce(
        (acc, r) => {
          acc.caDj += r.caDj;
          acc.caTps += r.caTps;
          acc.caCibleDj += r.caCibleDj;
          acc.caCibleTps += r.caCibleTps;
          acc.margeDj += r.margeDj;
          acc.margeTps += r.margeTps;
          return acc;
        },
        { caDj: 0, caTps: 0, caCibleDj: 0, caCibleTps: 0, margeDj: 0, margeTps: 0 }
      ),
    [compareRows]
  );

  useEffect(() => {
    setOpenCompareSocietes({ dj: false, tps: false });
  }, [
    drilldownComparaison.niveau,
    drilldownComparaison.anneeSelectionnee,
    drilldownComparaison.moisSelectionne,
    drilldownComparaison.semaineSelectionnee?.numero,
    drilldownComparaison.jourSelectionne,
  ]);

  /** Tableau groupé société → tournées, même périmètre que compareRows (tous niveaux drill-down). */
  const compareTableSocietes = useMemo(() => {
    const src = compareResult?.parTournee || [];
    if (!src.length) return [];
    const niveau = drilldownComparaison.niveau;
    const annee = String(drilldownComparaison.anneeSelectionnee || '');
    const moisSel = String(drilldownComparaison.moisSelectionne || '');
    const semaineSel = Number(drilldownComparaison.semaineSelectionnee?.numero || 0);
    const jourSel = String(drilldownComparaison.jourSelectionne || '');

    const scoped = src.filter((r) => {
      const d = String(r.date || '');
      if (d.slice(0, 4) !== annee) return false;
      if (niveau === 'mois' || niveau === 'semaine' || niveau === 'jour') {
        if (!moisSel || d.slice(0, 7) !== moisSel) return false;
      }
      if (niveau === 'semaine' || niveau === 'jour') {
        const info = isoWeekInfo(d);
        if (!semaineSel || info.week !== semaineSel) return false;
      }
      if (niveau === 'jour') {
        if (!jourSel || d !== jourSel) return false;
      }
      return true;
    });

    const normSoc = (s) => normalizeSocieteUI(s);
    const isDjSoc = (s) => normSoc(s) === normalizeSocieteUI('D&J Transport');
    const isTpsSoc = (s) => normSoc(s) === normalizeSocieteUI('TPS TSMC EXPRESS');

    const statutEcart = (tauxEcart) =>
      tauxEcart > 5 ? 'dessus' : tauxEcart < -5 ? 'dessous' : 'cible';

    const buildBloc = (pred, key, label) => {
      const rows = scoped.filter((r) => pred(r.societe));
      const byTournee = new Map();
      for (const r of rows) {
        const tn = String(r.tournee || 'N/A');
        if (!byTournee.has(tn)) {
          byTournee.set(tn, { tournee: tn, ca: 0, caCible: 0, marge: 0 });
        }
        const x = byTournee.get(tn);
        const ca = Number(r.ca || 0);
        const cible = Number(r.caCible || 0);
        const cout = Number(r.coutVentile || 0);
        x.ca += ca;
        x.caCible += cible;
        x.marge += ca - cout;
      }
      let totalCa = 0;
      let totalCible = 0;
      let totalMarge = 0;
      for (const r of rows) {
        const ca = Number(r.ca || 0);
        const cible = Number(r.caCible || 0);
        const cout = Number(r.coutVentile || 0);
        totalCa += ca;
        totalCible += cible;
        totalMarge += ca - cout;
      }
      const ecartTot = totalCa - totalCible;
      const tauxEcartTot = totalCible > 0 ? (ecartTot / totalCible) * 100 : 0;
      const tauxMargeMoy = totalCa > 0 ? (totalMarge / totalCa) * 100 : 0;

      const tournees = Array.from(byTournee.values())
        .filter((t) => t.ca > 0)
        .sort((a, b) => String(a.tournee).localeCompare(String(b.tournee), 'fr'))
        .map((t) => {
          const ecart = t.ca - t.caCible;
          const tauxEcart = t.caCible > 0 ? (ecart / t.caCible) * 100 : 0;
          const tauxMarge = t.ca > 0 ? (t.marge / t.ca) * 100 : 0;
          return {
            ...t,
            ecart,
            tauxEcart,
            tauxMarge,
            statut: statutEcart(tauxEcart),
          };
        });

      return {
        key,
        label,
        totals: {
          ca: totalCa,
          caCible: totalCible,
          ecart: ecartTot,
          tauxEcart: tauxEcartTot,
          marge: totalMarge,
          tauxMarge: tauxMargeMoy,
          statut: statutEcart(tauxEcartTot),
        },
        tournees,
      };
    };

    return [
      buildBloc(isDjSoc, 'dj', 'D&J Transport'),
      buildBloc(isTpsSoc, 'tps', 'TPS TSMC EXPRESS'),
    ];
  }, [compareResult, drilldownComparaison]);

  const filteredCaCibles = useMemo(() => {
    return (caCiblesList || [])
      .filter((r) => {
        const y = String(r.mois || '').slice(0, 4);
        const m = String(r.mois || '').slice(5, 7);
        if (caCibleAppliedFilters.annee !== 'all' && y !== caCibleAppliedFilters.annee) return false;
        if (caCibleAppliedFilters.mois !== 'all' && m !== caCibleAppliedFilters.mois) return false;
        if (caCibleAppliedFilters.societe !== 'all' && String(r.societe || '') !== caCibleAppliedFilters.societe)
          return false;
        if (caCibleAppliedFilters.chargeur !== 'all' && String(r.chargeur || '') !== caCibleAppliedFilters.chargeur)
          return false;
        return true;
      })
      .sort((a, b) => {
        const m = String(a.mois || '').localeCompare(String(b.mois || ''));
        if (m !== 0) return m;
        return String(a.chargeur || '').localeCompare(String(b.chargeur || ''), 'fr');
      });
  }, [caCiblesList, caCibleAppliedFilters]);

  useEffect(() => {
    if (!margeResult) return;
    const socFilter =
      caCibleDashboardSociete === 'dj'
        ? 'D&J Transport'
        : caCibleDashboardSociete === 'tps'
          ? 'TPS TSMC EXPRESS'
          : null;
    const byChargeurSociete = new Map();
    for (const t of margeResult.parTournee || []) {
      if (String(t.date || '').slice(0, 7) !== caCibleDashboardMonth) continue;
      if (socFilter && String(t.societe || '') !== socFilter) continue;
      const ch = String(t.chargeur || 'N/A');
      const soc = String(t.societe || 'N/A');
      const key = `${ch}::${soc}`;
      if (!byChargeurSociete.has(key)) {
        byChargeurSociete.set(key, { chargeur: ch, societe: soc, caReel: 0, tournees: new Set() });
      }
      const row = byChargeurSociete.get(key);
      row.caReel += Number(t.ca || 0);
      if (Number(t.colisLivres || 0) > 0) row.tournees.add(String(t.tournee || ''));
    }
    const byChargeur = new Map();
    for (const r of byChargeurSociete.values()) {
      const nbTourneesActives = r.tournees.size;
      const cible = (caCiblesList || []).find(
        (c) =>
          String(c.mois || '') === caCibleDashboardMonth &&
          normalizeSocieteUI(c.societe) === normalizeSocieteUI(r.societe) &&
          normalizeChargeurUI(c.chargeur) === normalizeChargeurUI(r.chargeur)
      );
      const caCibleMensuelAffiche = Number(cible?.caCibleParTournee || 0) * Number(nbTourneesActives || 0);
      const ecart = r.caReel - caCibleMensuelAffiche;
      const ch = r.chargeur;
      if (!byChargeur.has(ch)) {
        byChargeur.set(ch, { chargeur: ch, caReel: 0, caCible: 0, ecart: 0, nbTourneesActives: 0 });
      }
      const agg = byChargeur.get(ch);
      agg.caReel += r.caReel;
      agg.caCible += caCibleMensuelAffiche;
      agg.ecart += ecart;
      agg.nbTourneesActives += nbTourneesActives;
    }
    const rows = Array.from(byChargeur.values()).map((r) => {
      return {
        ...r,
        ecartPct: r.caCible > 0 ? (r.ecart / r.caCible) * 100 : 0,
        ratio: r.caCible > 0 ? (r.caReel / r.caCible) * 100 : 0,
      };
    });
    setCaCibleDashboardData(rows.sort((a, b) => b.caReel - a.caReel));
  }, [margeResult, caCibleDashboardMonth, caCibleDashboardSociete, caCiblesList]);

  useEffect(() => {
    setOpenMargeChargeurs({});
    setOpenMargeSocietes({});
    setOpenMargeTournees({});
    setOpenMargeJours({});
  }, [margeResult]);

  const tabs = [
    { id: 'grilles', label: 'Grilles tarifaires', icon: Layers },
    { id: 'forfaits', label: 'Forfaits exceptionnels', icon: FolderKanban },
    { id: 'calcul', label: 'Calcul CA prévisionnel', icon: Calculator },
    { id: 'marge', label: 'Marge & Coûts', icon: TrendingUp },
    { id: 'ca-cible', label: 'CA Cible', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Rentabilité
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Grilles tarifaires, forfaits et prévisionnel de chiffre d’affaires (Salesforce × tarifs).
            </p>
          </div>
          {(message || error) && (
            <div
              className={`rounded-lg px-4 py-2 text-sm ${
                error ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {error || message}
            </div>
          )}
        </header>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                }}
                className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'grilles' && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">Grilles enregistrées</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchGrilles()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingGrilles ? 'animate-spin' : ''}`} />
                  Actualiser
                </button>
                <button
                  type="button"
                  onClick={openNewGrille}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle grille
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Chargeur</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Société</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Période</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Statut</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingGrilles && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          Chargement…
                        </td>
                      </tr>
                    )}
                    {!loadingGrilles && grilles.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          Aucune grille. Créez-en une avec « Nouvelle grille ».
                        </td>
                      </tr>
                    )}
                    {!loadingGrilles &&
                      grilles.map((g) => (
                        <tr key={g.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-900">{g.chargeur}</td>
                          <td className="px-4 py-3 text-slate-700">{g.societe}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {g.dateDebut}
                            {g.dateFin ? ` → ${g.dateFin}` : ' → (sans fin)'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                g.actif !== false
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {g.actif !== false ? 'Actif' : 'Inactif'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditGrille(g)}
                                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                                title="Modifier"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openGroupesModal(g)}
                                className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                              >
                                Groupes tournées
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteGrille(g.id)}
                                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showGrilleForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {grilleForm.id ? 'Modifier la grille' : 'Nouvelle grille'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowGrilleForm(false)}
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={saveGrille} className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Chargeur</label>
                      <select
                        value={grilleForm.chargeurSelect}
                        onChange={(e) => setGrilleForm((f) => ({ ...f, chargeurSelect: e.target.value }))}
                        disabled={chargeursLoading}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
                      >
                        {chargeurOptionsGrille.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {chargeursLoading && (
                        <p className="mt-1 text-xs text-slate-500">Chargement des chargeurs (Salesforce)…</p>
                      )}
                      {grilleForm.chargeurSelect === '__autre__' && (
                        <input
                          type="text"
                          placeholder="Nom du chargeur"
                          value={grilleForm.chargeurAutre}
                          onChange={(e) => setGrilleForm((f) => ({ ...f, chargeurAutre: e.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Société</label>
                      <select
                        value={
                          SOCIETE_OPTIONS.some((s) => s.value === grilleForm.societe)
                            ? grilleForm.societe
                            : (grilleForm.societe || SOCIETE_OPTIONS[0].value)
                        }
                        onChange={(e) => setGrilleForm((f) => ({ ...f, societe: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        {SOCIETE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                        {grilleForm.societe &&
                          !SOCIETE_OPTIONS.some((s) => s.value === grilleForm.societe) && (
                            <option value={grilleForm.societe}>{grilleForm.societe}</option>
                          )}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Date début</label>
                        <input
                          type="date"
                          required
                          value={grilleForm.dateDebut}
                          onChange={(e) => setGrilleForm((f) => ({ ...f, dateDebut: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Date fin (optionnel)</label>
                        <input
                          type="date"
                          value={grilleForm.dateFin}
                          onChange={(e) => setGrilleForm((f) => ({ ...f, dateFin: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['prixPdlLivre', 'Prix PDL livré'],
                        ['prixColisLivre', 'Prix colis livré'],
                        ['prixPdlCollecte', 'Prix PDL collecté'],
                        ['prixColisCollecte', 'Prix colis collecté'],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={grilleForm[key]}
                            onChange={(e) => setGrilleForm((f) => ({ ...f, [key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Type branding</label>
                        <select
                          value={grilleForm.brandingType}
                          onChange={(e) => setGrilleForm((f) => ({ ...f, brandingType: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        >
                          {BRANDING_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Montant branding</label>
                        <input
                          type="number"
                          step="0.01"
                          value={grilleForm.brandingMontant}
                          onChange={(e) => setGrilleForm((f) => ({ ...f, brandingMontant: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={grilleForm.actif}
                        onChange={(e) => setGrilleForm((f) => ({ ...f, actif: e.target.checked }))}
                      />
                      Grille active
                    </label>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowGrilleForm(false)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {groupesModalGrille && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Groupes de tournées</h3>
                      <p className="text-sm text-slate-600">
                        Grille : {groupesModalGrille.chargeur} — {groupesModalGrille.societe}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Référentiel <code className="rounded bg-slate-100 px-1">IO_Tournee__c</code> (production), filtré
                        par le <strong>chargeur</strong> de la grille (
                        <code className="rounded bg-slate-100 px-1">/api/rentabilite/tournees</code>
                        ). La société Salesforce est optionnelle (case à cocher ci‑dessous).
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Période indicative (grille) :{' '}
                        <span className="font-mono text-slate-700">
                          {dateDebut || '—'} → {dateFin || '—'}
                        </span>
                      </p>
                      <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                          checked={filtrerTourneeSociete}
                          disabled={sfTourneesLoading}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setFiltrerTourneeSociete(v);
                            refetchTourneesSf(groupesModalGrille, v);
                          }}
                        />
                        <span>
                          Limiter aux tournées dont le compte société (
                          <code className="rounded bg-slate-100 px-0.5">IO_Societe__r.Name</code>) contient «{' '}
                          {groupesModalGrille.societe} » — désactivé par défaut (souvent différent du libellé dans la
                          grille).
                        </span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={closeGroupesModal}
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-slate-800">
                      {groupeForm.id ? 'Modifier le groupe' : 'Nouveau groupe'}
                    </h4>
                    <form onSubmit={saveGroupe} className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Nom du groupe</label>
                        <input
                          type="text"
                          value={groupeForm.nomGroupe}
                          onChange={(e) => setGroupeForm((f) => ({ ...f, nomGroupe: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Tournées (Salesforce)
                        </label>
                        {sfTourneesLoading && (
                          <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            <span>Récupération des tournées depuis Salesforce…</span>
                          </div>
                        )}
                        {sfTourneesError && (
                          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                            {sfTourneesError}
                          </div>
                        )}
                        {!sfTourneesLoading && !sfTourneesError && displayTourneeRows.length === 0 && (
                          <p className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Aucune tournée active pour ce filtre. Vérifiez que le nom du chargeur dans la grille
                            correspond à <code className="rounded bg-amber-100/80 px-0.5">IO_FxChargeurName__c</code> ou à{' '}
                            <code className="rounded bg-amber-100/80 px-0.5">IO_Chargeur__r.Name</code> dans Salesforce.
                            {filtrerTourneeSociete
                              ? ' Essayez de décocher « Limiter aux tournées dont le compte société… » si le nom du compte SF diffère du libellé grille.'
                              : ' Si besoin, cochez le filtre société uniquement lorsque le libellé correspond au Name Salesforce.'}
                          </p>
                        )}
                        <input
                          type="search"
                          placeholder="Rechercher une tournée…"
                          value={tourneeSearch}
                          onChange={(e) => setTourneeSearch(e.target.value)}
                          disabled={sfTourneesLoading}
                          className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
                        />
                        <div className="mb-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={sfTourneesLoading || filteredTourneeRows.length === 0}
                            onClick={() => {
                              setGroupeForm((f) => {
                                const next = new Set(f.tournees);
                                filteredTourneeRows.forEach((row) => next.add(row.code));
                                return { ...f, tournees: Array.from(next) };
                              });
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Tout sélectionner
                            {tourneeSearch.trim() ? ' (filtrées)' : ''}
                          </button>
                          <button
                            type="button"
                            disabled={sfTourneesLoading || filteredTourneeRows.length === 0}
                            onClick={() => {
                              const codes = new Set(filteredTourneeRows.map((row) => row.code));
                              setGroupeForm((f) => ({
                                ...f,
                                tournees: f.tournees.filter((t) => !codes.has(t)),
                              }));
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Tout désélectionner
                            {tourneeSearch.trim() ? ' (filtrées)' : ''}
                          </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2">
                          {filteredTourneeRows.length === 0 && !sfTourneesLoading && (
                            <p className="px-2 py-4 text-center text-xs text-slate-500">
                              {displayTourneeRows.length === 0
                                ? '—'
                                : 'Aucun résultat pour cette recherche.'}
                            </p>
                          )}
                          <ul className="space-y-1">
                            {filteredTourneeRows.map((row) => (
                              <li key={row.code}>
                                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={groupeForm.tournees.includes(row.code)}
                                    onChange={(e) => toggleTourneeCode(row.code, e.target.checked)}
                                  />
                                  <span className="min-w-0 flex-1 text-slate-800">
                                    <span className="break-all font-medium">{row.code}</span>
                                    {row.libelle ? (
                                      <span className="mt-0.5 block break-words text-xs text-slate-600">
                                        {row.libelle}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {groupeForm.tournees.length} tournée(s) sélectionnée(s)
                          {sfTourneeOptions.length > 0
                            ? ` · ${sfTourneeOptions.length} proposée(s) par Salesforce`
                            : ''}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['prixPdlLivre', 'PDL livré'],
                          ['prixColisLivre', 'Colis livré'],
                          ['prixPdlCollecte', 'PDL coll.'],
                          ['prixColisCollecte', 'Colis coll.'],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <label className="mb-0.5 block text-[10px] font-medium uppercase text-slate-500">
                              {label}
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              value={groupeForm[key]}
                              onChange={(e) => setGroupeForm((f) => ({ ...f, [key]: e.target.value }))}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groupeForm.id && (
                          <button
                            type="button"
                            onClick={() =>
                              setGroupeForm({
                                id: '',
                                nomGroupe: '',
                                tournees: [],
                                prixPdlLivre: groupesModalGrille.prixPdlLivre ?? 0,
                                prixColisLivre: groupesModalGrille.prixColisLivre ?? 0,
                                prixPdlCollecte: groupesModalGrille.prixPdlCollecte ?? 0,
                                prixColisCollecte: groupesModalGrille.prixColisCollecte ?? 0,
                              })
                            }
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Nouveau (vider le formulaire)
                          </button>
                        )}
                        <button
                          type="submit"
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                          Enregistrer le groupe
                        </button>
                      </div>
                    </form>
                  </div>

                  <h4 className="mb-2 text-sm font-semibold text-slate-800">Groupes existants</h4>
                  {loadingGroupes ? (
                    <p className="text-sm text-slate-500">Chargement…</p>
                  ) : (
                    <ul className="space-y-2">
                      {groupesList.length === 0 && (
                        <li className="text-sm text-slate-500">Aucun groupe pour cette grille.</li>
                      )}
                      {groupesList.map((g) => (
                        <li
                          key={g.id}
                          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="font-medium text-slate-900">{g.nomGroupe}</div>
                            <div className="text-xs text-slate-500">
                              Tournées : {(g.tournees || []).join(', ') || '—'}
                            </div>
                            <div className="text-xs text-slate-600">
                              PDL L {money(g.prixPdlLivre)} · Col L {money(g.prixColisLivre)} · PDL C{' '}
                              {money(g.prixPdlCollecte)} · Col C {money(g.prixColisCollecte)}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => editGroupe(g)}
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteGroupe(g.id)}
                              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'forfaits' && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">Forfaits exceptionnels</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchForfaits()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingForfaits ? 'animate-spin' : ''}`} />
                  Actualiser
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForfaitForm(createEmptyForfaitForm());
                    setShowForfaitForm(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un forfait
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Chargeur</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Société</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Description</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Montant</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Période</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingForfaits && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          Chargement…
                        </td>
                      </tr>
                    )}
                    {!loadingForfaits && forfaits.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          Aucun forfait.
                        </td>
                      </tr>
                    )}
                    {!loadingForfaits &&
                      forfaits.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-900">{f.chargeur}</td>
                          <td className="px-4 py-3 text-slate-700">{f.societe}</td>
                          <td className="px-4 py-3 text-slate-700">{f.description}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {money(f.montant)} €
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {f.dateDebut} → {f.dateFin}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => deleteForfait(f.id)}
                              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showForfaitForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Nouveau forfait</h3>
                    <button
                      type="button"
                      onClick={() => setShowForfaitForm(false)}
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={saveForfait} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Chargeur</label>
                        <select
                          value={forfaitForm.chargeur}
                          onChange={(e) => setForfaitForm((f) => ({ ...f, chargeur: e.target.value }))}
                          disabled={chargeursLoading}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
                        >
                          {chargeurOptionsForfaits.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Société</label>
                        <select
                          value={forfaitForm.societe}
                          onChange={(e) => setForfaitForm((f) => ({ ...f, societe: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        >
                          {SOCIETE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                      <input
                        type="text"
                        required
                        value={forfaitForm.description}
                        onChange={(e) => setForfaitForm((f) => ({ ...f, description: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Montant (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={forfaitForm.montant}
                        onChange={(e) => setForfaitForm((f) => ({ ...f, montant: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Date début</label>
                        <input
                          type="date"
                          required
                          value={forfaitForm.dateDebut}
                          onChange={(e) => setForfaitForm((f) => ({ ...f, dateDebut: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Date fin</label>
                        <input
                          type="date"
                          required
                          value={forfaitForm.dateFin}
                          onChange={(e) => setForfaitForm((f) => ({ ...f, dateFin: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowForfaitForm(false)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'calcul' && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-800">Paramètres de calcul</h2>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <div>
                <span className="mb-2 block text-xs font-medium text-slate-600">Période</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="caPeriod"
                      checked={caPeriodMode === 'month'}
                      onChange={() => setCaPeriodMode('month')}
                    />
                    Mois
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="caPeriod"
                      checked={caPeriodMode === 'range'}
                      onChange={() => setCaPeriodMode('range')}
                    />
                    Plage de dates
                  </label>
                </div>
              </div>
              {caPeriodMode === 'month' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Mois</label>
                  <input
                    type="month"
                    value={caMonth}
                    onChange={(e) => setCaMonth(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Date début</label>
                    <input
                      type="date"
                      value={caDateDebut}
                      onChange={(e) => setCaDateDebut(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Date fin</label>
                    <input
                      type="date"
                      value={caDateFin}
                      onChange={(e) => setCaDateFin(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Société</label>
                <select
                  value={caSociete}
                  onChange={(e) => setCaSociete(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-auto"
                >
                  <option value="both">Les deux</option>
                  <option value="dj">D&J Transport</option>
                  <option value="tps">TPS TSMC EXPRESS</option>
                </select>
              </div>
              <button
                type="button"
                onClick={runCalculCA}
                disabled={caLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-60"
              >
                <Calculator className={`h-4 w-4 ${caLoading ? 'animate-pulse' : ''}`} />
                {caLoading ? 'Calcul…' : 'Calculer'}
              </button>
            </div>

            {caResult && (
              <div className="space-y-6">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <Euro className="h-8 w-8 text-emerald-700" />
                    <div>
                      <div className="text-sm font-medium text-emerald-800">CA prévisionnel total</div>
                      <div className="text-3xl font-bold tabular-nums text-emerald-900">
                        {money(caResult.total)} €
                      </div>
                      <div className="text-xs text-emerald-800/80">
                        {caResult.periode?.dateDebut} → {caResult.periode?.dateFin}
                        {caResult.societeFiltre ? ` · ${caResult.societeFiltre}` : ' · Toutes sociétés'}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-md font-semibold text-slate-800">Par chargeur (vue hiérarchique)</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Chargeur / Société / Tournée</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Nb jours</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">CA total</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">PDL livrés (montant)</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Colis livrés (montant)</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">PDL collectés (montant)</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Colis collectés (montant)</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Branding total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {caTreeRows.map((ch) => {
                          const isOpenCh = !!openChargeurs[ch.chargeur];
                          return (
                            <Fragment key={`ch-wrap-${ch.chargeur}`}>
                              <tr
                                key={`ch-${ch.chargeur}`}
                                className="cursor-pointer bg-white hover:bg-slate-50"
                                onClick={() =>
                                  setOpenChargeurs((prev) => ({ ...prev, [ch.chargeur]: !prev[ch.chargeur] }))
                                }
                              >
                                <td className="px-3 py-2 font-medium text-slate-900">
                                  <span className="mr-2 inline-block w-4">{isOpenCh ? '▼' : '▶'}</span>
                                  {ch.chargeur}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-500">—</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{money(ch.montant)} €</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                  {ch.pdlLivres} ({money(ch.caPdlLivre)} €)
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                  {ch.colisLivres} ({money(ch.caColisLivre)} €)
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                  {ch.pdlCollectes} ({money(ch.caPdlCollecte)} €)
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                  {ch.colisCollectes} ({money(ch.caColisCollecte)} €)
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(ch.branding)} €</td>
                              </tr>
                              {isOpenCh &&
                                ch.societes.map((soc) => {
                                  const socKey = `${ch.chargeur}::${soc.societe}`;
                                  const isOpenSoc = !!openSocietes[socKey];
                                  return (
                                    <Fragment key={`soc-wrap-${socKey}`}>
                                      <tr
                                        key={`soc-${socKey}`}
                                        className="cursor-pointer bg-slate-50 hover:bg-slate-100"
                                        onClick={() =>
                                          setOpenSocietes((prev) => ({ ...prev, [socKey]: !prev[socKey] }))
                                        }
                                      >
                                        <td className="px-3 py-2 font-medium text-slate-800">
                                          <span className="inline-block w-6" />
                                          <span className="mr-2 inline-block w-4">{isOpenSoc ? '▼' : '▶'}</span>
                                          {soc.societe}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500">—</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-medium">{money(soc.montant)} €</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                          {soc.pdlLivres} ({money(soc.caPdlLivre)} €)
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                          {soc.colisLivres} ({money(soc.caColisLivre)} €)
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                          {soc.pdlCollectes} ({money(soc.caPdlCollecte)} €)
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                          {soc.colisCollectes} ({money(soc.caColisCollecte)} €)
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                          {money(soc.branding)} €
                                        </td>
                                      </tr>
                                      {isOpenSoc &&
                                        soc.tournees.map((tr) => {
                                          const trOpen = !!openTournees[tr.key];
                                          return (
                                            <Fragment key={`tr-wrap-${tr.key}`}>
                                              <tr
                                                key={`tr-${tr.key}`}
                                                className="cursor-pointer bg-slate-100 hover:bg-slate-200"
                                                onClick={() =>
                                                  setOpenTournees((prev) => ({ ...prev, [tr.key]: !prev[tr.key] }))
                                                }
                                              >
                                                <td className="px-3 py-2 text-slate-800">
                                                  <span className="inline-block w-12" />
                                                  <span className="mr-2 inline-block w-4">{trOpen ? '▼' : '▶'}</span>
                                                  <span className="font-medium">{tr.tournee}</span>
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-600">{tr.nbJours}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                  {money(tr.montant)} €
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                  {tr.pdlLivres} ({money(tr.caPdlLivre)} €)
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                  {tr.colisLivres} ({money(tr.caColisLivre)} €)
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                  {tr.pdlCollectes} ({money(tr.caPdlCollecte)} €)
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                  {tr.colisCollectes} ({money(tr.caColisCollecte)} €)
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                  {money(tr.branding)} €
                                                </td>
                                              </tr>
                                              {trOpen && (
                                                <>
                                                  {tr.detailsByDate.map((d) => (
                                                    <tr key={`day-${tr.key}-${d.date}`} className="bg-slate-100/70">
                                                      <td className="px-3 py-2 text-slate-700">
                                                        <span className="inline-block w-16" />
                                                        {d.date || '—'}
                                                      </td>
                                                      <td className="px-3 py-2 text-right text-slate-500">—</td>
                                                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                        {money(d.montant)} €
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                        {d.pdlLivres}
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                        {d.colisLivres}
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                        {d.pdlCollectes}
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                        {d.colisCollectes}
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                                        {money(d.branding)} €
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </>
                                              )}
                                            </Fragment>
                                          );
                                        })}
                                    </Fragment>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-md font-semibold text-slate-800">Détail complet</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm max-h-[400px] overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Tournée</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Chargeur</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Société</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">CA</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Courses</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(caResult.parTournee || [])
                          .slice()
                          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                          .map((r) => (
                            <tr key={r.cle}>
                              <td className="px-3 py-2 text-slate-700">{r.date}</td>
                              <td className="px-3 py-2 font-medium text-slate-900">{r.tournee}</td>
                              <td className="px-3 py-2 text-slate-700">{r.chargeur}</td>
                              <td className="px-3 py-2 text-slate-700">{r.societe}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{money(r.montant)} €</td>
                              <td className="px-3 py-2 text-right text-slate-600">{r.nbCourses}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'marge' && (
          <section className="space-y-8">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">Saisie des coûts mensuels</h2>
              <form onSubmit={saveCouts} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Mois</label>
                    <input
                      type="month"
                      value={coutsMonth}
                      onChange={(e) => setCoutsMonth(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Société</label>
                    <select
                      value={coutsSociete}
                      onChange={(e) => setCoutsSociete(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {SOCIETE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Chargeur (optionnel)</label>
                    <select
                      value={coutsChargeur}
                      onChange={(e) => setCoutsChargeur(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Global (tous chargeurs)</option>
                      {chargeurOptionsForfaits.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Jours travaillés</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={coutsForm.joursTravailles}
                      onChange={(e) =>
                        setCoutsForm((f) => ({
                          ...f,
                          joursTravailles: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[
                    ['carburant', 'Carburant'],
                    ['salaires', 'Salaires'],
                    ['leasing', 'Leasing'],
                    ['peages', 'Péages'],
                    ['entretien', 'Entretien'],
                    ['chargesFixes', 'Charges fixes'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={coutsForm[key]}
                        onChange={(e) =>
                          setCoutsForm((f) => ({
                            ...f,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    value={coutsForm.notes}
                    onChange={(e) => setCoutsForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={coutsSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {coutsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {editingCoutId ? 'Mettre à jour' : 'Enregistrer'}
                  </button>
                  {editingCoutId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCoutId(null);
                        setCoutsForm(COUTS_FORM_DEFAULTS);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchCouts}
                    disabled={coutsLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${coutsLoading ? 'animate-spin' : ''}`} />
                    Actualiser
                  </button>
                </div>
              </form>

              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Année</label>
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        value={coutsFilterYear}
                        onChange={(e) => setCoutsFilterYear(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Mois</label>
                      <select
                        value={coutsFilterMonth}
                        onChange={(e) => setCoutsFilterMonth(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="all">Tous</option>
                        <option value="01">Janvier</option>
                        <option value="02">Fevrier</option>
                        <option value="03">Mars</option>
                        <option value="04">Avril</option>
                        <option value="05">Mai</option>
                        <option value="06">Juin</option>
                        <option value="07">Juillet</option>
                        <option value="08">Aout</option>
                        <option value="09">Septembre</option>
                        <option value="10">Octobre</option>
                        <option value="11">Novembre</option>
                        <option value="12">Decembre</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Société</label>
                      <select
                        value={coutsFilterSociete}
                        onChange={(e) => setCoutsFilterSociete(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="all">Tous</option>
                        {SOCIETE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Chargeur</label>
                      <select
                        value={coutsFilterChargeur}
                        onChange={(e) => setCoutsFilterChargeur(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="all">Tous</option>
                        {chargeurOptionsForfaits.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() =>
                          setCoutsAppliedFilters({
                            year: String(coutsFilterYear || 'all'),
                            month: coutsFilterMonth,
                            societe: coutsFilterSociete,
                            chargeur: coutsFilterChargeur,
                          })
                        }
                        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Rechercher
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Mois</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Société</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Chargeur</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Jours travaillés</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Carburant</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Salaires</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Leasing</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Péages</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Entretien</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Charges fixes</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Total coûts</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCoutsList.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 text-slate-700">{c.mois}</td>
                        <td className="px-3 py-2 text-slate-700">{c.societe}</td>
                        <td className="px-3 py-2 text-slate-700">{c.chargeur || 'Global'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(c.joursTravailles || 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.carburant)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.salaires)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.leasing)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.peages)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.entretien)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.chargesFixes)} €</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{money(c.total)} €</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editCout(c)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => openCloneCout(c)}
                              className="inline-flex items-center gap-1 rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Cloner
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCout(c.id)}
                              className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!coutsLoading && filteredCoutsList.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-3 py-4 text-center text-slate-500">
                          Aucun coût saisi avec ces filtres.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">Analyse marge annuelle</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Année</label>
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    value={margeYear}
                    onChange={(e) => setMargeYear(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Société</label>
                  <select
                    value={margeSociete}
                    onChange={(e) => setMargeSociete(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="both">Les deux</option>
                    <option value="dj">D&J Transport</option>
                    <option value="tps">TPS TSMC EXPRESS</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={runCalculMarge}
                  disabled={margeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Calculator className={`h-4 w-4 ${margeLoading ? 'animate-pulse' : ''}`} />
                  {margeLoading ? 'Calcul…' : 'Calculer'}
                </button>
              </div>

              {margeResult && (
                <div className="mt-5 space-y-5">
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Mois</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">CA</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Carburant</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Salaires</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Leasing</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Péages</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Entretien</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Charges fixes</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Total coûts</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Marge</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Taux marge %</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">CA Cible</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Écart</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-700">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {margeRows.map((r) => (
                          <tr key={r.mois}>
                            <td className="px-3 py-2 text-slate-700">{r.mois}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.ca)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.carburant)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.salaires)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.leasing)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.peages)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.entretien)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.chargesFixes)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{money(r.totalCouts)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{money(r.marge)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(r.tauxMarge || 0).toFixed(2)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.caCible)} €</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.ecartCible)} €</td>
                            <td className="px-3 py-2 text-right">
                              {r.statutCible === 'dessus' ? '🟢' : r.statutCible === 'dessous' ? '🔴' : '🟡'}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold">
                          <td className="px-3 py-2">Totaux</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.ca)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.carburant)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.salaires)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.leasing)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.peages)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.entretien)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.chargesFixes)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.totalCouts)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.marge)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {margeTotals.ca > 0 ? ((margeTotals.marge / margeTotals.ca) * 100).toFixed(2) : '0.00'}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.caCible)} €</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(margeTotals.ecartCible)} €</td>
                          <td className="px-3 py-2 text-right">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    {drilldown.niveau === 'annee' && (
                      <>
                        <div className="mb-2 text-sm font-medium text-slate-700">
                          Année {margeYear} — Cliquez sur un mois pour voir le détail
                        </div>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={margeChartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="moisLabel" />
                              <YAxis yAxisId="left" />
                              <YAxis yAxisId="right" orientation="right" />
                              <Tooltip formatter={(value) => `${money(value)} €`} />
                              <Legend />
                              <Bar
                                yAxisId="left"
                                dataKey="ca"
                                name="CA"
                                fill="#3b82f6"
                                cursor="pointer"
                                onClick={(d) =>
                                  setDrilldown({
                                    niveau: 'mois',
                                    moisSelectionne: d?.payload?.mois || null,
                                    semaineSelectionnee: null,
                                  })
                                }
                              />
                              <Bar
                                yAxisId="left"
                                dataKey="totalCouts"
                                name="Total coûts"
                                fill="#ef4444"
                                cursor="pointer"
                                onClick={(d) =>
                                  setDrilldown({
                                    niveau: 'mois',
                                    moisSelectionne: d?.payload?.mois || null,
                                    semaineSelectionnee: null,
                                  })
                                }
                              />
                              <Line yAxisId="right" type="monotone" dataKey="marge" name="Marge" stroke="#16a34a" />
                              <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="caCible"
                                name="CA Cible"
                                stroke="#dc2626"
                                strokeDasharray="6 4"
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}

                    {drilldown.niveau === 'mois' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setDrilldown({ niveau: 'annee', moisSelectionne: null, semaineSelectionnee: null })
                          }
                          className="mb-2 text-sm font-medium text-indigo-700 hover:underline"
                        >
                          ← Retour à l'année
                        </button>
                        <div className="mb-2 text-sm font-medium text-slate-700">
                          {monthLabelFr(drilldown.moisSelectionne)} — par semaine
                        </div>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartMoisData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="semaineLabel" />
                              <YAxis yAxisId="left" />
                              <YAxis yAxisId="right" orientation="right" />
                              <Tooltip formatter={(value) => `${money(value)} €`} />
                              <Legend />
                              <Bar
                                yAxisId="left"
                                dataKey="ca"
                                name="CA"
                                fill="#3b82f6"
                                cursor="pointer"
                                onClick={(d) =>
                                  setDrilldown((prev) => ({
                                    ...prev,
                                    niveau: 'semaine',
                                    semaineSelectionnee: {
                                      numero: d?.payload?.semaine,
                                      debut: d?.payload?.debut,
                                      fin: d?.payload?.fin,
                                    },
                                  }))
                                }
                              />
                              <Bar
                                yAxisId="left"
                                dataKey="totalCouts"
                                name="Total coûts"
                                fill="#ef4444"
                                cursor="pointer"
                                onClick={(d) =>
                                  setDrilldown((prev) => ({
                                    ...prev,
                                    niveau: 'semaine',
                                    semaineSelectionnee: {
                                      numero: d?.payload?.semaine,
                                      debut: d?.payload?.debut,
                                      fin: d?.payload?.fin,
                                    },
                                  }))
                                }
                              />
                              <Line yAxisId="right" type="monotone" dataKey="marge" name="Marge" stroke="#16a34a" />
                              <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="caCible"
                                name="CA Cible"
                                stroke="#dc2626"
                                strokeDasharray="6 4"
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}

                    {drilldown.niveau === 'semaine' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setDrilldown((prev) => ({
                              ...prev,
                              niveau: 'mois',
                              semaineSelectionnee: null,
                            }))
                          }
                          className="mb-2 text-sm font-medium text-indigo-700 hover:underline"
                        >
                          ← Retour au mois
                        </button>
                        <div className="mb-2 text-sm font-medium text-slate-700">
                          Semaine {drilldown.semaineSelectionnee?.numero} — du{' '}
                          {String(drilldown.semaineSelectionnee?.debut || '').split('-').reverse().join('/')} au{' '}
                          {String(drilldown.semaineSelectionnee?.fin || '').split('-').reverse().join('/')}
                        </div>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartSemaineData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="jourLabel" />
                              <YAxis yAxisId="left" />
                              <YAxis yAxisId="right" orientation="right" />
                              <Tooltip formatter={(value) => `${money(value)} €`} />
                              <Legend />
                              <Bar yAxisId="left" dataKey="ca" name="CA" fill="#3b82f6" />
                              <Bar yAxisId="left" dataKey="totalCouts" name="Total coûts" fill="#ef4444" />
                              <Line yAxisId="right" type="monotone" dataKey="marge" name="Marge" stroke="#16a34a" />
                              <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="caCible"
                                name="CA Cible"
                                stroke="#dc2626"
                                strokeDasharray="6 4"
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <h3 className="mb-3 text-md font-semibold text-slate-800">Comparaison D&J vs TPS</h3>
                    <div className="mb-3 grid gap-3 md:grid-cols-5">
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        value={compareYear}
                        onChange={(e) => setCompareYear(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <select
                        value={compareIndicator}
                        onChange={(e) => setCompareIndicator(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="ca">CA</option>
                        <option value="caCible">CA Cible</option>
                        <option value="coutVentile">Coût ventilé</option>
                        <option value="marge">Marge</option>
                        <option value="tauxMarge">Taux marge %</option>
                      </select>
                      <button
                        type="button"
                        onClick={runComparaisonDjTps}
                        disabled={compareLoading}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {compareLoading ? 'Calcul...' : 'Calculer'}
                      </button>
                    </div>

                    {compareRows.length > 0 && (
                      <>
                        <div className="mb-2 flex items-center gap-3 text-sm">
                          {drilldownComparaison.niveau !== 'annee' && (
                            <button
                              type="button"
                              className="text-indigo-700 hover:underline"
                              onClick={() =>
                                setDrilldownComparaison((prev) =>
                                  prev.niveau === 'jour'
                                    ? { ...prev, niveau: 'semaine', jourSelectionne: null }
                                    : prev.niveau === 'semaine'
                                      ? { ...prev, niveau: 'mois', semaineSelectionnee: null, jourSelectionne: null }
                                      : { ...prev, niveau: 'annee', moisSelectionne: null, semaineSelectionnee: null, jourSelectionne: null }
                                )
                              }
                            >
                              ← Retour
                            </button>
                          )}
                          <div className="flex flex-wrap items-center gap-1 text-slate-600">
                            <button type="button" className="hover:underline" onClick={() => setDrilldownComparaison((p) => ({ ...p, niveau: 'annee', moisSelectionne: null, semaineSelectionnee: null, jourSelectionne: null }))}>
                              {drilldownComparaison.anneeSelectionnee}
                            </button>
                            {drilldownComparaison.moisSelectionne && (
                              <>
                                <span>&gt;</span>
                                <button type="button" className="hover:underline" onClick={() => setDrilldownComparaison((p) => ({ ...p, niveau: 'mois', semaineSelectionnee: null, jourSelectionne: null }))}>
                                  {monthLabelFr(drilldownComparaison.moisSelectionne)}
                                </button>
                              </>
                            )}
                            {drilldownComparaison.semaineSelectionnee?.numero && (
                              <>
                                <span>&gt;</span>
                                <button type="button" className="hover:underline" onClick={() => setDrilldownComparaison((p) => ({ ...p, niveau: 'semaine', jourSelectionne: null }))}>
                                  Semaine {drilldownComparaison.semaineSelectionnee.numero}
                                </button>
                              </>
                            )}
                            {drilldownComparaison.jourSelectionne && (
                              <>
                                <span>&gt;</span>
                                <button type="button" className="hover:underline" onClick={() => setDrilldownComparaison((p) => ({ ...p, niveau: 'jour' }))}>
                                  {formatDateFr(drilldownComparaison.jourSelectionne)}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-700">
                          <span>
                            {drilldownComparaison.niveau === 'annee'
                              ? `${drilldownComparaison.anneeSelectionnee} — comparaison par mois`
                              : drilldownComparaison.niveau === 'mois'
                                ? `${monthLabelFr(drilldownComparaison.moisSelectionne)} — comparaison par semaine`
                                : drilldownComparaison.niveau === 'semaine'
                                  ? `Semaine ${drilldownComparaison.semaineSelectionnee?.numero} — comparaison par jour`
                                  : `${formatDateFr(drilldownComparaison.jourSelectionne)} — comparaison par tournée`}
                          </span>
                          {compareChartSocFilter !== 'all' && (
                            <button
                              type="button"
                              className="text-xs font-normal text-indigo-600 hover:underline"
                              onClick={() => setCompareChartSocFilter('all')}
                            >
                              Réafficher D&J et TPS sur le graphique
                            </button>
                          )}
                        </div>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={compareRows}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="periodeLabel" />
                              <YAxis />
                              <Tooltip
                                formatter={(v, n, ctx) => {
                                  const value = Number(v || 0);
                                  if (n === 'D&J') return [`${money(value)}${compareIndicator === 'tauxMarge' ? '%' : ' €'}`, 'D&J'];
                                  if (n === 'TPS') return [`${money(value)}${compareIndicator === 'tauxMarge' ? '%' : ' €'}`, 'TPS'];
                                  if (n === 'CA Cible D&J') return [`${money(value)} €`, 'CA Cible D&J'];
                                  if (n === 'CA Cible TPS') return [`${money(value)} €`, 'CA Cible TPS'];
                                  return [String(v), String(n)];
                                }}
                                labelFormatter={(label) => {
                                  const row = compareRows.find((r) => r.periodeLabel === label);
                                  if (!row) return label;
                                  const ec = row.valueDj - row.valueTps;
                                  return `${label} — Écart D&J/TPS: ${money(ec)}${compareIndicator === 'tauxMarge' ? '%' : ' €'}`;
                                }}
                              />
                              <Legend verticalAlign="bottom" />
                              {(compareChartSocFilter === 'all' || compareChartSocFilter === 'dj') && (
                                <Bar
                                  dataKey="valueDj"
                                  name="D&J"
                                  fill="#2563eb"
                                  cursor="pointer"
                                  onClick={(d) => {
                                    setCompareChartSocFilter('dj');
                                    if (!d?.payload || drilldownComparaison.niveau === 'jour') return;
                                    if (drilldownComparaison.niveau === 'annee') {
                                      setDrilldownComparaison((prev) => ({
                                        ...prev,
                                        niveau: 'mois',
                                        moisSelectionne: d.payload.periode,
                                        semaineSelectionnee: null,
                                        jourSelectionne: null,
                                      }));
                                    } else if (drilldownComparaison.niveau === 'mois') {
                                      const wk = Number(d.payload.semaineNumero || 0);
                                      setDrilldownComparaison((prev) => ({
                                        ...prev,
                                        niveau: 'semaine',
                                        semaineSelectionnee: { numero: wk },
                                        jourSelectionne: null,
                                      }));
                                    } else if (drilldownComparaison.niveau === 'semaine') {
                                      setDrilldownComparaison((prev) => ({
                                        ...prev,
                                        niveau: 'jour',
                                        jourSelectionne: d.payload.dateKey || d.payload.periode,
                                      }));
                                    }
                                  }}
                                />
                              )}
                              {(compareChartSocFilter === 'all' || compareChartSocFilter === 'tps') && (
                                <Bar
                                  dataKey="valueTps"
                                  name="TPS"
                                  fill="#16a34a"
                                  cursor="pointer"
                                  onClick={(d) => {
                                    setCompareChartSocFilter('tps');
                                    if (!d?.payload || drilldownComparaison.niveau === 'jour') return;
                                    if (drilldownComparaison.niveau === 'annee') {
                                      setDrilldownComparaison((prev) => ({
                                        ...prev,
                                        niveau: 'mois',
                                        moisSelectionne: d.payload.periode,
                                        semaineSelectionnee: null,
                                        jourSelectionne: null,
                                      }));
                                    } else if (drilldownComparaison.niveau === 'mois') {
                                      const wk = Number(d.payload.semaineNumero || 0);
                                      setDrilldownComparaison((prev) => ({
                                        ...prev,
                                        niveau: 'semaine',
                                        semaineSelectionnee: { numero: wk },
                                        jourSelectionne: null,
                                      }));
                                    } else if (drilldownComparaison.niveau === 'semaine') {
                                      setDrilldownComparaison((prev) => ({
                                        ...prev,
                                        niveau: 'jour',
                                        jourSelectionne: d.payload.dateKey || d.payload.periode,
                                      }));
                                    }
                                  }}
                                />
                              )}
                              {(compareChartSocFilter === 'all' || compareChartSocFilter === 'dj') && (
                                <Line
                                  type="monotone"
                                  dataKey="caCibleDj"
                                  name="CA Cible D&J"
                                  stroke="#dc2626"
                                  strokeDasharray="6 4"
                                  dot={false}
                                />
                              )}
                              {(compareChartSocFilter === 'all' || compareChartSocFilter === 'tps') && (
                                <Line
                                  type="monotone"
                                  dataKey="caCibleTps"
                                  name="CA Cible TPS"
                                  stroke="#f97316"
                                  strokeDasharray="6 4"
                                  dot={false}
                                />
                              )}
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left">Société / Tournée</th>
                                <th className="px-3 py-2 text-right">CA</th>
                                <th className="px-3 py-2 text-right">CA Cible</th>
                                <th className="px-3 py-2 text-right">Écart (CA − CA Cible)</th>
                                <th className="px-3 py-2 text-right">Taux écart %</th>
                                <th className="px-3 py-2 text-right">Marge</th>
                                <th className="px-3 py-2 text-right">Taux marge %</th>
                                <th className="px-3 py-2 text-center">Statut</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {compareTableSocietes.map((bloc) => {
                                const open = !!openCompareSocietes[bloc.key];
                                const t = bloc.totals;
                                return (
                                  <Fragment key={`cmp-soc-${bloc.key}`}>
                                    <tr
                                      className="cursor-pointer bg-slate-100/90 font-medium hover:bg-slate-100"
                                      onClick={() =>
                                        setOpenCompareSocietes((prev) => ({ ...prev, [bloc.key]: !prev[bloc.key] }))
                                      }
                                    >
                                      <td className="px-3 py-2 text-slate-900">
                                        <span className="mr-2 inline-block w-4 text-center">{open ? '▼' : '▶'}</span>
                                        {bloc.label}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(t.ca)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(t.caCible)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(t.ecart)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {t.caCible > 0 ? `${Number(t.tauxEcart).toFixed(2)}%` : '—'}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(t.marge)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{Number(t.tauxMarge).toFixed(2)}%</td>
                                      <td className="px-3 py-2 text-center">
                                        {t.statut === 'dessus' ? '🟢' : t.statut === 'dessous' ? '🔴' : '🟡'}
                                      </td>
                                    </tr>
                                    {open &&
                                      bloc.tournees.map((tr) => (
                                        <tr key={`${bloc.key}-tr-${tr.tournee}`} className="bg-indigo-50/40">
                                          <td className="px-3 py-2 pl-10 text-slate-800">{tr.tournee}</td>
                                          <td className="px-3 py-2 text-right tabular-nums">{money(tr.ca)} €</td>
                                          <td className="px-3 py-2 text-right tabular-nums">{money(tr.caCible)} €</td>
                                          <td className="px-3 py-2 text-right tabular-nums">{money(tr.ecart)} €</td>
                                          <td className="px-3 py-2 text-right tabular-nums">
                                            {tr.caCible > 0 ? `${Number(tr.tauxEcart).toFixed(2)}%` : '—'}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums">{money(tr.marge)} €</td>
                                          <td className="px-3 py-2 text-right tabular-nums">{Number(tr.tauxMarge).toFixed(2)}%</td>
                                          <td className="px-3 py-2 text-center">
                                            {tr.statut === 'dessus' ? '🟢' : tr.statut === 'dessous' ? '🔴' : '🟡'}
                                          </td>
                                        </tr>
                                      ))}
                                  </Fragment>
                                );
                              })}
                              {(() => {
                                const caG = compareTotals.caDj + compareTotals.caTps;
                                const cibleG = compareTotals.caCibleDj + compareTotals.caCibleTps;
                                const margeG = compareTotals.margeDj + compareTotals.margeTps;
                                const ecG = caG - cibleG;
                                const teG = cibleG > 0 ? (ecG / cibleG) * 100 : 0;
                                const tmG = caG > 0 ? (margeG / caG) * 100 : 0;
                                const stG = teG > 5 ? 'dessus' : teG < -5 ? 'dessous' : 'cible';
                                return (
                                  <tr className="bg-slate-200 font-semibold text-slate-900">
                                    <td className="px-3 py-2">Total général (D&J + TPS)</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(caG)} €</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(cibleG)} €</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(ecG)} €</td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {cibleG > 0 ? `${Number(teG).toFixed(2)}%` : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(margeG)} €</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{Number(tmG).toFixed(2)}%</td>
                                    <td className="px-3 py-2 text-center">
                                      {stG === 'dessus' ? '🟢' : stG === 'dessous' ? '🔴' : '🟡'}
                                    </td>
                                  </tr>
                                );
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-md font-semibold text-slate-800">Détail par tournée et par jour</h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Date</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">CA</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">CA Cible</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Coût ventilé</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Écart CA Cible</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Taux écart %</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Marge réelle</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Taux marge %</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {margeParTourneeTree.map((ch) => {
                            const openCh = !!openMargeChargeurs[ch.chargeur];
                            return (
                              <Fragment key={`mch-${ch.chargeur}`}>
                                <tr
                                  className="cursor-pointer bg-white hover:bg-slate-50"
                                  onClick={() =>
                                    setOpenMargeChargeurs((prev) => ({ ...prev, [ch.chargeur]: !prev[ch.chargeur] }))
                                  }
                                >
                                  <td className="px-3 py-2 font-medium text-slate-900">
                                    <span className="mr-2 inline-block w-4">{openCh ? '▼' : '▶'}</span>
                                    {ch.chargeur}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(ch.ca)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(ch.caCible)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(ch.coutVentile)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(ch.ecartCible)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {Number(ch.caCible || 0) > 0 ? (((Number(ch.ecartCible || 0) / Number(ch.caCible || 0)) * 100)).toFixed(2) : '0.00'}%
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(Number(ch.ca || 0) - Number(ch.coutVentile || 0))} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{Number(ch.tauxMarge || 0).toFixed(2)}%</td>
                                  <td className="px-3 py-2 text-right">{ch.statutCible === 'dessus' ? '🟢' : ch.statutCible === 'dessous' ? '🔴' : '🟡'}</td>
                                </tr>
                                {openCh &&
                                  ch.societes.map((soc) => {
                                    const socKey = `${ch.chargeur}::${soc.societe}`;
                                    const openSoc = !!openMargeSocietes[socKey];
                                    return (
                                      <Fragment key={`msoc-${socKey}`}>
                                        <tr
                                          className="cursor-pointer bg-slate-50 hover:bg-slate-100"
                                          onClick={() =>
                                            setOpenMargeSocietes((prev) => ({ ...prev, [socKey]: !prev[socKey] }))
                                          }
                                        >
                                          <td className="px-3 py-2 font-medium text-slate-800">
                                            <span className="inline-block w-6" />
                                            <span className="mr-2 inline-block w-4">{openSoc ? '▼' : '▶'}</span>
                                            {soc.societe}
                                          </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{money(soc.ca)} €</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{money(soc.caCible)} €</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{money(soc.coutVentile)} €</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{money(soc.ecartCible)} €</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                          {Number(soc.caCible || 0) > 0 ? (((Number(soc.ecartCible || 0) / Number(soc.caCible || 0)) * 100)).toFixed(2) : '0.00'}%
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-medium">{money(Number(soc.ca || 0) - Number(soc.coutVentile || 0))} €</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{Number(soc.tauxMarge || 0).toFixed(2)}%</td>
                                        <td className="px-3 py-2 text-right">{soc.statutCible === 'dessus' ? '🟢' : soc.statutCible === 'dessous' ? '🔴' : '🟡'}</td>
                                        </tr>
                                        {openSoc &&
                                          soc.tournees.map((tr) => {
                                            const tourneeKey = `${socKey}::${tr.tournee}`;
                                            const openTr = !!openMargeTournees[tourneeKey];
                                            return (
                                              <Fragment key={`mtr-${tourneeKey}`}>
                                                <tr
                                                  className="cursor-pointer bg-slate-100 hover:bg-slate-200"
                                                  onClick={() =>
                                                    setOpenMargeTournees((prev) => ({
                                                      ...prev,
                                                      [tourneeKey]: !prev[tourneeKey],
                                                    }))
                                                  }
                                                >
                                                  <td className="px-3 py-2 text-slate-800">
                                                    <span className="inline-block w-12" />
                                                    <span className="mr-2 inline-block w-4">{openTr ? '▼' : '▶'}</span>
                                                    <span className="font-medium">{tr.tournee}</span>
                                                    <span className="ml-2 text-xs text-slate-500">({tr.nbJours} j)</span>
                                                  </td>
                                                  <td className="px-3 py-2 text-right tabular-nums">{money(tr.ca)} €</td>
                                                  <td className="px-3 py-2 text-right tabular-nums">{money(tr.caCible)} €</td>
                                                  <td className="px-3 py-2 text-right tabular-nums">{money(tr.coutVentile)} €</td>
                                                  <td className="px-3 py-2 text-right tabular-nums">{money(tr.ecartCible)} €</td>
                                                  <td className="px-3 py-2 text-right tabular-nums">
                                                    {Number(tr.caCible || 0) > 0 ? (((Number(tr.ecartCible || 0) / Number(tr.caCible || 0)) * 100)).toFixed(2) : '0.00'}%
                                                  </td>
                                                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(Number(tr.ca || 0) - Number(tr.coutVentile || 0))} €</td>
                                                  <td className="px-3 py-2 text-right tabular-nums">{Number(tr.tauxMarge || 0).toFixed(2)}%</td>
                                                  <td className="px-3 py-2 text-right">{tr.statutCible === 'dessus' ? '🟢' : tr.statutCible === 'dessous' ? '🔴' : '🟡'}</td>
                                                </tr>
                                                {openTr &&
                                                  tr.detailsByDay.map((d) => (
                                                    <tr key={`mday-${tourneeKey}-${d.date}`} className="bg-slate-100/70">
                                                      <td className="px-3 py-2 text-slate-700">
                                                        <span className="inline-block w-20" />
                                                        {formatDateFr(d.date) || '—'}
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.ca)} €</td>
                                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.caCible)} €</td>
                                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.coutVentile)} €</td>
                                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.ecartCible)} €</td>
                                                      <td className="px-3 py-2 text-right tabular-nums">
                                                        {Number(d.caCible || 0) > 0 ? (((Number(d.ecartCible || 0) / Number(d.caCible || 0)) * 100)).toFixed(2) : '0.00'}%
                                                      </td>
                                                      <td className="px-3 py-2 text-right tabular-nums font-medium">{money(Number(d.ca || 0) - Number(d.coutVentile || 0))} €</td>
                                                      <td className="px-3 py-2 text-right tabular-nums">{Number(d.tauxMarge || 0).toFixed(2)}%</td>
                                                      <td className="px-3 py-2 text-right">{d.statutCible === 'dessus' ? '🟢' : d.statutCible === 'dessous' ? '🔴' : '🟡'}</td>
                                                    </tr>
                                                  ))}
                                              </Fragment>
                                            );
                                          })}
                                      </Fragment>
                                    );
                                  })}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-md font-semibold text-slate-800">Par jour</h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Date</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">CA</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">CA Cible</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Coût ventilé</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Écart CA Cible</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Taux écart %</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Marge réelle</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Taux marge %</th>
                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {margeParJourRows.map((r) => {
                            const key = String(r.date || '');
                            const open = !!openMargeJours[key];
                            const ca = Number(r.ca || 0);
                            const caCible = Number(r.caCible || 0);
                            const ecart = ca - caCible;
                            const tauxEcart = caCible > 0 ? (ecart / caCible) * 100 : 0;
                            const margeReelle = ca - Number(r.coutVentile || 0);
                            const tauxMarge = ca > 0 ? (margeReelle / ca) * 100 : 0;
                            const statut = tauxEcart > 5 ? 'dessus' : tauxEcart < -5 ? 'dessous' : 'cible';
                            const details = margeParJourDetails.get(key) || [];
                            return (
                              <Fragment key={`jour-${key}`}>
                                <tr
                                  className="cursor-pointer hover:bg-slate-50"
                                  onClick={() => setOpenMargeJours((prev) => ({ ...prev, [key]: !prev[key] }))}
                                >
                                  <td className="px-3 py-2 text-slate-700">
                                    <span className="mr-2 inline-block w-4">{open ? '▼' : '▶'}</span>
                                    {formatDateFr(r.date)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(ca)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(caCible)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(r.coutVentile)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(ecart)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{Number(tauxEcart).toFixed(2)}%</td>
                                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(margeReelle)} €</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{Number(tauxMarge).toFixed(2)}%</td>
                                  <td className="px-3 py-2 text-right">{statut === 'dessus' ? '🟢' : statut === 'dessous' ? '🔴' : '🟡'}</td>
                                </tr>
                                {open &&
                                  details.map((d, idx) => (
                                    <tr key={`jour-${key}-tournee-${idx}`} className="bg-slate-100/70">
                                      <td className="px-3 py-2 text-slate-700">
                                        <span className="inline-block w-8" />
                                        {d.tournee || 'N/A'}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.ca)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.caCible)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.coutVentile)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{money(d.ecartCible)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{Number(d.tauxEcart || 0).toFixed(2)}%</td>
                                      <td className="px-3 py-2 text-right tabular-nums font-medium">{money(d.margeReelle)} €</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{Number(d.tauxMarge || 0).toFixed(2)}%</td>
                                      <td className="px-3 py-2 text-right">{d.statut === 'dessus' ? '🟢' : d.statut === 'dessous' ? '🔴' : '🟡'}</td>
                                    </tr>
                                  ))}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'ca-cible' && (
          <section className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-base font-semibold text-slate-900">Saisie des cibles</h3>
              <form onSubmit={saveCaCible} className="grid gap-3 md:grid-cols-5">
                <select
                  value={caCibleForm.chargeur}
                  onChange={(e) => setCaCibleForm((f) => ({ ...f, chargeur: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Choisir chargeur</option>
                  {chargeurOptionsForfaits.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={caCibleForm.societe}
                  onChange={(e) => setCaCibleForm((f) => ({ ...f, societe: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  {SOCIETE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={caCibleForm.mois}
                  onChange={(e) => setCaCibleForm((f) => ({ ...f, mois: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={caCibleForm.caCibleParTournee}
                  onChange={(e) => setCaCibleForm((f) => ({ ...f, caCibleParTournee: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="CA cible / tournée active"
                  required
                />
                <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  {editingCaCibleId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </form>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={caCibleFilters.annee}
                  onChange={(e) => setCaCibleFilters((s) => ({ ...s, annee: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Année"
                />
                <select
                  value={caCibleFilters.mois}
                  onChange={(e) => setCaCibleFilters((s) => ({ ...s, mois: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">Tous les mois</option>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                      {String(i + 1).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <select
                  value={caCibleFilters.chargeur}
                  onChange={(e) => setCaCibleFilters((s) => ({ ...s, chargeur: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">Tous les chargeurs</option>
                  {chargeurOptionsForfaits.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={caCibleFilters.societe}
                  onChange={(e) => setCaCibleFilters((s) => ({ ...s, societe: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="all">Toutes les sociétés</option>
                  {SOCIETE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCaCibleAppliedFilters(caCibleFilters)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                  Rechercher
                </button>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Mois</th>
                      <th className="px-3 py-2 text-left">Chargeur</th>
                      <th className="px-3 py-2 text-left">Société</th>
                      <th className="px-3 py-2 text-right">CA cible / tournée</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCaCibles.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">{r.mois}</td>
                        <td className="px-3 py-2">{r.chargeur}</td>
                        <td className="px-3 py-2">{r.societe}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(r.caCibleParTournee)} €</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => editCaCible(r)} className="rounded border px-2 py-1 text-xs">
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCaCibleCloneModal({
                                  open: true,
                                  source: r,
                                  moisDestination: thisMonth(),
                                  ecraser: false,
                                })
                              }
                              className="rounded border px-2 py-1 text-xs"
                            >
                              Cloner
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCaCible(r.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!caCiblesLoading && filteredCaCibles.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                          Aucune cible.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-base font-semibold text-slate-900">Tableau de bord cibles</h3>
              <div className="mb-3 grid gap-3 md:grid-cols-4">
                <input
                  type="month"
                  value={caCibleDashboardMonth}
                  onChange={(e) => setCaCibleDashboardMonth(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={caCibleDashboardSociete}
                  onChange={(e) => setCaCibleDashboardSociete(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="both">Toutes sociétés</option>
                  <option value="dj">D&J Transport</option>
                  <option value="tps">TPS TSMC EXPRESS</option>
                </select>
                <button type="button" onClick={runCalculMarge} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">
                  Calculer
                </button>
              </div>

              <div className="space-y-3">
                {caCibleDashboardData.map((r) => {
                  const color = r.ratio < 90 ? 'bg-red-500' : r.ratio <= 100 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <div key={r.chargeur} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1 text-sm font-medium text-slate-800">{r.chargeur}</div>
                      <div className="h-2 w-full rounded bg-slate-100">
                        <div className={`h-2 rounded ${color}`} style={{ width: `${Math.min(Math.max(r.ratio, 0), 140)}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-5">
                        <div>CA réel: {money(r.caReel)} €</div>
                        <div>CA cible: {money(r.caCible)} €</div>
                        <div>Écart €: {money(r.ecart)} €</div>
                        <div>Écart %: {Number(r.ecartPct || 0).toFixed(2)}%</div>
                        <div>Nb tournées actives: {r.nbTourneesActives}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {caCibleDashboardData.length > 0 && (
                <div className="mt-4 h-72 rounded-xl border border-slate-200 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={caCibleDashboardData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="chargeur" />
                      <YAxis />
                      <Tooltip formatter={(v) => `${money(v)} €`} />
                      <Legend />
                      <Bar dataKey="caReel" name="CA réel" fill="#3b82f6" />
                      <Line
                        type="monotone"
                        dataKey="caCible"
                        name="CA cible"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="6 4"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>
        )}

        {cloneModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Cloner un coût mensuel</h3>
                <button
                  type="button"
                  onClick={() => setCloneModal({ open: false, source: null, moisDestination: thisMonth(), ecraser: false })}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-sm text-slate-700">
                {monthLabelFr(cloneModal.source?.mois)} - {cloneModal.source?.chargeur || 'Global'} -{' '}
                {cloneModal.source?.societe || 'N/A'}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Copier vers le mois :</label>
                  <input
                    type="month"
                    value={cloneModal.moisDestination}
                    onChange={(e) => setCloneModal((m) => ({ ...m, moisDestination: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={cloneModal.ecraser}
                    onChange={(e) => setCloneModal((m) => ({ ...m, ecraser: e.target.checked }))}
                  />
                  Ecraser si existe deja
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCloneModal({ open: false, source: null, moisDestination: thisMonth(), ecraser: false })}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={confirmCloneCout}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {caCibleCloneModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Cloner un CA cible</h3>
                <button
                  type="button"
                  onClick={() => setCaCibleCloneModal({ open: false, source: null, moisDestination: thisMonth(), ecraser: false })}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-sm text-slate-700">
                {monthLabelFr(caCibleCloneModal.source?.mois)} - {caCibleCloneModal.source?.chargeur || 'N/A'} -{' '}
                {caCibleCloneModal.source?.societe || 'N/A'}
              </p>
              <div className="space-y-3">
                <input
                  type="month"
                  value={caCibleCloneModal.moisDestination}
                  onChange={(e) => setCaCibleCloneModal((s) => ({ ...s, moisDestination: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={caCibleCloneModal.ecraser}
                    onChange={(e) => setCaCibleCloneModal((s) => ({ ...s, ecraser: e.target.checked }))}
                  />
                  Ecraser si existe deja
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCaCibleCloneModal({ open: false, source: null, moisDestination: thisMonth(), ecraser: false })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={cloneCaCible}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
