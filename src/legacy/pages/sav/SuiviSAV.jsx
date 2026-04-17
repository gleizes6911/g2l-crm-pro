import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { 
  AlertCircle, 
  Calendar, 
  Filter, 
  Download, 
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Clock,
  Euro,
  FileText,
  FileSpreadsheet,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  PieChart,
  Send,
  ExternalLink,
  X,
  Eye,
  Package
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LabelList,
  LineChart,
  Line,
  ComposedChart
} from 'recharts';
import API_BASE from '../../config/api';
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

// Valeurs fixes pour les filtres Type et Motif (doivent correspondre aux valeurs Salesforce)
const TYPES_LIST = [
  { value: 'Contestation', label: 'Contestation' },
  { value: 'Demande information', label: 'Demande information' },
  { value: 'Autre', label: 'Autre' }
];

const MOTIFS_LIST = [
  { value: 'Problème Livraison', label: 'Problème Livraison' },
  { value: 'Colis introuvable', label: 'Colis introuvable' },
  { value: 'Colis cassé', label: 'Colis cassé' },
  { value: 'Débord relais', label: 'Débord relais' },
  { value: 'Ramasse', label: 'Ramasse' },
  { value: 'Erreur livraison', label: 'Erreur livraison' },
  { value: 'BL/POD', label: 'BL/POD' },
  { value: 'Autre', label: 'Autre' }
];

const formatAdresseDestinataire = (adresse, nomFallback) => {
  if (!adresse) return nomFallback || '-';
  if (typeof adresse !== 'object') return adresse || nomFallback || '-';

  const parts = [];
  if (adresse.street) parts.push(adresse.street);

  const cpVille = [adresse.postalCode, adresse.city].filter(Boolean).join(' ');
  if (cpVille) parts.push(cpVille);

  if (adresse.countryCode || adresse.country) {
    parts.push(adresse.countryCode || adresse.country);
  }

  const full = parts.filter(Boolean).join(', ');
  return full || nomFallback || '-';
};

const PdfChartContainer = ({ title, children, options }) => {
  const { widthPx, heightPx, fontSize } = options;
  return (
    <div
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        padding: 16,
        boxSizing: 'border-box',
        fontSize: `${fontSize}px`,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"'
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
        {title}
      </div>
      {/* zone chart: hauteur fixe, indépendante du PDF */}
      <div style={{ width: '100%', height: heightPx - 16 - 8 - 22 }}>{children}</div>
    </div>
  );
};

const PdfChartChargeursComparison = ({ report, options }) => {
  const data = (report?.chargeurs || [])
    .slice()
    .sort((a, b) => (b.contestations || 0) - (a.contestations || 0))
    .slice(0, 10)
    .map((c) => ({
      name: c.chargeur,
      colisLivres: c.colisLivres || 0,
      contestations: c.contestations || 0
    }));

  return (
    <PdfChartContainer
      title={`Comparaison Colis livrés vs Contestations par chargeur (${report?.filters?.dateFilterLabel || 'requêtes en date de livraison'})`}
      options={options}
    >
      <ComposedChart
        width={options.widthPx - 32}
        height={options.heightPx - 90}
        data={data}
        margin={options.margin}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="name" interval={0} tick={options.xTick} height={120} />
        <YAxis yAxisId="left" orientation="left" tick={options.yTick} />
        <YAxis yAxisId="right" orientation="right" tick={options.yTick} />
        <Tooltip formatter={(v, n) => [v, n === 'colisLivres' ? 'Colis livrés' : 'Contestations']} />
        <Legend />
        <Bar yAxisId="left" dataKey="colisLivres" name="Colis livrés" fill="#10B981" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="colisLivres" position="top" fill="#059669" fontSize={options.fontSize} />
        </Bar>
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="contestations"
          name="Contestations"
          stroke="#EF4444"
          strokeWidth={2}
          dot={{ r: 3, fill: '#EF4444' }}
        >
          <LabelList dataKey="contestations" position="top" fill="#B91C1C" fontSize={options.fontSize} />
        </Line>
      </ComposedChart>
    </PdfChartContainer>
  );
};

const PdfChartTop15Chauffeurs = ({ report, options }) => {
  // Aligner visuellement sur le Dashboard: BarChart vertical, labels -45, valeur au-dessus
  const agg = {};
  (report?.exportCases || []).forEach((c) => {
    const ch = c.IO_FxChauffeur__c || 'Non assigné';
    agg[ch] = (agg[ch] || 0) + 1;
  });
  const data = Object.entries(agg)
    .map(([nom, count]) => ({ nom, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return (
    <PdfChartContainer title={`Top 15 chauffeurs par nombre de requêtes (${report?.filters?.dateFilterLabel || 'requêtes en date de livraison'})`} options={options}>
      <BarChart
        width={options.widthPx - 32}
        height={options.heightPx - 90}
        data={data}
        margin={options.margin}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="nom" interval={0} tick={options.xTick} height={120} />
        <YAxis tick={options.yTick} />
        <Tooltip formatter={(value) => [value, 'Requêtes']} />
        <Legend />
        <Bar dataKey="count" name="Requêtes" fill="#4F46E5" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="count" position="top" fill="#4F46E5" fontSize={options.fontSize} />
        </Bar>
      </BarChart>
    </PdfChartContainer>
  );
};

const PdfChartChargeurChauffeurs = ({ report, chargeur, options }) => {
  const ch = (report?.chargeurs || []).find((x) => x.chargeur === chargeur);
  const data = (ch?.chauffeursList || [])
    .slice()
    .sort((a, b) => (b.contestations || 0) - (a.contestations || 0))
    .slice(0, 15)
    .map((r) => ({
      name: r.chauffeur,
      colisLivres: r.colisLivres || 0,
      contestations: r.contestations || 0
    }));

  return (
    <PdfChartContainer title={`Détail chauffeurs – ${chargeur} (${report?.filters?.dateFilterLabel || 'requêtes en date de livraison'})`} options={options}>
      <ComposedChart
        width={options.widthPx - 32}
        height={options.heightPx - 90}
        data={data}
        margin={options.margin}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="name" interval={0} tick={options.xTick} height={120} />
        <YAxis yAxisId="left" orientation="left" tick={options.yTick} />
        <YAxis yAxisId="right" orientation="right" tick={options.yTick} />
        <Tooltip formatter={(v, n) => [v, n === 'colisLivres' ? 'Colis livrés' : 'Contestations']} />
        <Legend />
        <Bar yAxisId="left" dataKey="colisLivres" name="Colis livrés" fill="#10B981" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="colisLivres" position="top" fill="#059669" fontSize={options.fontSize} />
        </Bar>
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="contestations"
          name="Contestations"
          stroke="#EF4444"
          strokeWidth={2}
          dot={{ r: 3, fill: '#EF4444' }}
        >
          <LabelList dataKey="contestations" position="top" fill="#B91C1C" fontSize={options.fontSize} />
        </Line>
      </ComposedChart>
    </PdfChartContainer>
  );
};

const SuiviSAV = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Données
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [picklists, setPicklists] = useState({
    statuts: [],
    motifs: [],
    issues: [],
    priorites: [],
    origines: []
  });
  const [chauffeursList, setChauffeursList] = useState([]); // [{ value, label }]
  const [chargeursList, setChargeursList] = useState([]);
  
  // Filtres
  const [dateDebut, setDateDebut] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateFin, setDateFin] = useState(() => new Date().toISOString().split('T')[0]);
  const [dateFilterType, setDateFilterType] = useState('livraison'); // livraison | integration
  const [filtreStatut, setFiltreStatut] = useState('all');
  const [filtreType, setFiltreType] = useState('Contestation');
  const [filtreMotif, setFiltreMotif] = useState('all');
  const [filtreChauffeur, setFiltreChauffeur] = useState('all');
  const [filtreChargeur, setFiltreChargeur] = useState('all');
  const [filtreIssue, setFiltreIssue] = useState('all');
  const [filtreMontantMin, setFiltreMontantMin] = useState('');
  const [filtreMontantMax, setFiltreMontantMax] = useState('');
  
  // UI
  const [showFilters, setShowFilters] = useState(true);
  const [activeTab, setActiveTab] = useState('stats');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('CreatedDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedChauffeur, setSelectedChauffeur] = useState(null);
  const [chartSortBy, setChartSortBy] = useState('colisLivres'); // 'colisLivres' ou 'contestations'
  const [comparisonSelectedChargeur, setComparisonSelectedChargeur] = useState(null); // drill-down chargeur → chauffeurs (onglet stats)
  const [selectedMotif, setSelectedMotif] = useState(null);
  const [selectedChargeur, setSelectedChargeur] = useState(null);
  const [selectedStatut, setSelectedStatut] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedFacture, setSelectedFacture] = useState(null);
  const [selectedFactureEmployeur, setSelectedFactureEmployeur] = useState(null);
  const [factureSearch, setFactureSearch] = useState('');
  const [factureCasesData, setFactureCasesData] = useState([]);
  const [factureLoading, setFactureLoading] = useState(false);
  const [factureError, setFactureError] = useState(null);
  const [selectedEvolution, setSelectedEvolution] = useState(null); // { date, type, cases }
  const [selectedCaseDetail, setSelectedCaseDetail] = useState(null);
  const [selectedChauffeurDaily, setSelectedChauffeurDaily] = useState(null); // { date, cases, courses }
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const dateFilterLabel =
    dateFilterType === 'integration'
      ? "requêtes en date d'intégration"
      : 'requêtes en date de livraison';

  // Export PDF - rendu & capture des graphiques (pixel-perfect)
  const pdfChartRef = useRef(null);
  const [pdfChartJob, setPdfChartJob] = useState(null); // { kind, payload }

  const getPdfChartOptions = () => ({
    widthPx: 1200,
    // 1200x400 est trop "aplati" sur A4 portrait. On reste >= 1200x400 mais on augmente la hauteur.
    heightPx: 600,
    scale: 2,
    fontSize: 11,
    margin: { top: 20, right: 30, bottom: 120, left: 60 },
    xTick: { angle: -45, textAnchor: 'end', fontSize: 11, fill: '#374151' },
    yTick: { fontSize: 11, fill: '#374151' }
  });

  const waitForPdfChartsFullyRendered = async () => {
    // Attendre rendu + délai sécurité 500ms
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 500));
  };

  const capturePdfChartPng = async () => {
    const el = pdfChartRef.current;
    if (!el) return null;
    const opts = getPdfChartOptions();
    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: opts.scale,
      width: opts.widthPx,
      height: opts.heightPx,
      windowWidth: opts.widthPx,
      windowHeight: opts.heightPx
    });
    // JPEG compressé pour limiter drastiquement la taille du PDF
    return canvas.toDataURL('image/jpeg', 0.6);
  };

  const addChartImageToPdf = (doc, imgDataUrl, startY, pageWidthMm, marginXmm) => {
    if (!imgDataUrl) return startY;
    const imgProps = doc.getImageProperties(imgDataUrl);
    const maxW = pageWidthMm - marginXmm * 2;
    const imgW = maxW;
    const imgH = (imgProps.height * imgW) / imgProps.width;
    doc.addImage(imgDataUrl, 'JPEG', marginXmm, startY, imgW, imgH);
    return startY + imgH;
  };

  // Refs pour capture des graphiques dans l'export PDF
  const comparisonChartRef = useRef(null);

  // Charger les picklists au démarrage
  useEffect(() => {
    const loadPicklists = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sav/picklist`);
        if (response.ok) {
          const data = await response.json();
          setPicklists(data);
        } else {
          console.warn('Picklists non disponibles, utilisation des valeurs par défaut');
        }
      } catch (err) {
        console.error('Erreur chargement picklists:', err);
      }
    };
    loadPicklists();
  }, []);

  // Charger les cases pour une facture spécifique (recherche facture indépendante des filtres)
  useEffect(() => {
    const ref = factureSearch.trim();
    if (!ref) {
      setFactureCasesData([]);
      setFactureError(null);
      setFactureLoading(false);
      return;
    }

    const controller = new AbortController();
    const fetchFactureCases = async () => {
      try {
        setFactureLoading(true);
        setFactureError(null);
        const params = new URLSearchParams({ factureRef: ref });
        const response = await fetch(`${API_BASE}/api/sav/cases?${params.toString()}`, {
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error('Erreur lors de la recherche facture');
        }
        const data = await response.json();
        setFactureCasesData(data.cases || []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Erreur recherche facture:', err);
          setFactureError(err.message);
        }
      } finally {
        setFactureLoading(false);
      }
    };

    fetchFactureCases();

    return () => controller.abort();
  }, [factureSearch]);

  // Charger les données
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        dateDebut,
        dateFin,
        dateFilterType,
        statut: filtreStatut,
        type: filtreType || 'Contestation',
        motif: filtreMotif,
        chauffeur: filtreChauffeur,
        chargeur: filtreChargeur,
        issue: filtreIssue
      });
      
      if (filtreMontantMin) params.append('montantMin', filtreMontantMin);
      if (filtreMontantMax) params.append('montantMax', filtreMontantMax);
      
      const response = await fetch(`${API_BASE}/api/sav/cases?${params}`);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des données');
      }
      
      const data = await response.json();
      setCases(data.cases || []);
      setStats(data.stats || null);
      
      // Extraire les chauffeurs uniques pour le filtre
      const normalizeName = (s) =>
        String(s || '')
          .trim()
          .replace(/\s+/g, ' ');

      const stripAccentsLower = (s) =>
        normalizeName(s)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

      const splitNameParts = (raw) => {
        const v = normalizeName(raw);
        if (!v) return { last: '', first: '', label: '' };
        if (v.includes(',')) {
          const [last, first] = v.split(',').map((x) => normalizeName(x));
          return { last: last || '', first: first || '', label: `${last} ${first}`.trim() };
        }
        const parts = v.split(' ').filter(Boolean);
        if (parts.length === 1) return { last: parts[0], first: '', label: parts[0] };

        // Cas fréquent : Prénom NOM (NOM en majuscules)
        const upperParts = parts.filter((p) => p === p.toUpperCase() && /[A-Z]/.test(p));
        if (upperParts.length > 0) {
          const last = upperParts.join(' ');
          const first = parts.filter((p) => !(p === p.toUpperCase() && /[A-Z]/.test(p))).join(' ');
          return { last, first, label: `${last} ${first}`.trim() };
        }

        // Fallback : dernier mot = nom
        const last = parts[parts.length - 1];
        const first = parts.slice(0, -1).join(' ');
        return { last, first, label: `${last} ${first}`.trim() };
      };

      const chauffeursUniques = [...new Set(data.cases
        .map(c => c.IO_FxChauffeur__c)
        .filter(Boolean)
      )];

      const chauffeursOptions = chauffeursUniques
        .map((raw) => {
          const { last, first, label } = splitNameParts(raw);
          const sortKey = `${stripAccentsLower(last)}|${stripAccentsLower(first)}|${stripAccentsLower(raw)}`;
          return { value: raw, label: label || raw, sortKey };
        })
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      setChauffeursList(chauffeursOptions.map(({ value, label }) => ({ value, label })));
      
      // Extraire les chargeurs uniques pour le filtre
      const chargeursUniques = [...new Set(data.cases
        .map(c => c.Account?.Name)
        .filter(Boolean)
      )].sort();
      setChargeursList(chargeursUniques);
      
      // Extraire les motifs et issues uniques pour les filtres (fallback si picklists vides)
      if (picklists.motifs.length === 0) {
        const motifsUniques = [...new Set(data.cases
          .map(c => c.IO_MotifRequete__c)
          .filter(Boolean)
        )].sort();
        setPicklists(prev => ({
          ...prev,
          motifs: motifsUniques.map(m => ({ value: m, label: m }))
        }));
      }
      
      if (picklists.issues.length === 0) {
        const issuesUniques = [...new Set(data.cases
          .map(c => c.IO_IssueRequete__c)
          .filter(Boolean)
        )].sort();
        setPicklists(prev => ({
          ...prev,
          issues: issuesUniques.map(i => ({ value: i, label: i }))
        }));
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateDebut, dateFin, dateFilterType, filtreStatut, filtreType, filtreMotif, filtreChauffeur, filtreChargeur, filtreIssue, filtreMontantMin, filtreMontantMax]);

  // Réinitialiser le drill-down chargeur quand on change le filtre chargeur
  useEffect(() => {
    if (filtreChargeur !== 'all') setComparisonSelectedChargeur(null);
  }, [filtreChargeur]);

  // Contestations par (chargeur, chauffeur) pour le graphique par chauffeur d'un chargeur
  const contestationsParChargeurChauffeur = useMemo(() => {
    const m = {};
    cases.forEach((c) => {
      const ch = c.IO_FxChauffeur__c || 'Non assigné';
      const chargeur = c.Account?.Name || 'Non défini';
      if (!m[chargeur]) m[chargeur] = {};
      m[chargeur][ch] = (m[chargeur][ch] || 0) + 1;
    });
    return m;
  }, [cases]);

  const recapChauffeurChargeur = useMemo(() => {
    const byChauffeur = {};
    cases.forEach((c) => {
      const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
      const chargeur = c.Account?.Name || 'Non défini';
      if (!byChauffeur[chauffeur]) {
        byChauffeur[chauffeur] = { total: 0, byChargeur: {} };
      }
      byChauffeur[chauffeur].total += 1;
      byChauffeur[chauffeur].byChargeur[chargeur] =
        (byChauffeur[chauffeur].byChargeur[chargeur] || 0) + 1;
    });
    return Object.entries(byChauffeur)
      .map(([chauffeur, v]) => ({
        chauffeur,
        total: v.total,
        chargeurs: Object.entries(v.byChargeur)
          .map(([chargeur, count]) => ({ chargeur, count }))
          .sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.total - a.total);
  }, [cases]);

  // Filtrer et trier les cases pour le tableau
  const filteredCases = cases
    .filter(c => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (c.CaseNumber && c.CaseNumber.toLowerCase().includes(term)) ||
        (c.Subject && c.Subject.toLowerCase().includes(term)) ||
        (c.IO_NumeroColis__c && c.IO_NumeroColis__c.toLowerCase().includes(term)) ||
        (c.IO_FxChauffeur__c && c.IO_FxChauffeur__c.toLowerCase().includes(term)) ||
        (c.IO_NomDestinataire__c && c.IO_NomDestinataire__c.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Agrégation pour l'évolution journalière (date intégration / date livraison)
  const evolutionJournaliere = useMemo(() => {
    if (!cases || cases.length === 0) return [];
    const map = new Map();

    const addCount = (dateStr, key) => {
      if (!dateStr) return;
      const d = dateStr.substring(0, 10); // yyyy-mm-dd
      if (!d) return;
      if (!map.has(d)) {
        map.set(d, { date: d, integration: 0, livraison: 0 });
      }
      map.get(d)[key] += 1;
    };

    cases.forEach((c) => {
      addCount(c.CreatedDate, 'integration');
      addCount(c.IO_DateLivraison__c, 'livraison');
    });

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [cases]);

  const chauffeurKeyForCourses = useMemo(() => {
    if (filtreChauffeur === 'all') return null;
    const map = stats?.detailCoursesParChauffeur || {};
    const keys = Object.keys(map);
    if (keys.length === 0) return null;
    if (keys.length === 1) return keys[0];
    if (keys.includes(filtreChauffeur)) return filtreChauffeur;
    const q = String(filtreChauffeur || '').toLowerCase();
    return keys.find((k) => String(k).toLowerCase().includes(q)) || null;
  }, [filtreChauffeur, stats]);

  const evolutionChauffeurParJour = useMemo(() => {
    if (filtreChauffeur === 'all') return [];

    const map = new Map();
    const add = (dateStr, key, inc) => {
      if (!dateStr) return;
      const d = String(dateStr).substring(0, 10);
      if (!d) return;
      if (!map.has(d)) map.set(d, { date: d, colis: 0, contestations: 0 });
      map.get(d)[key] += inc;
    };

    // Contestations : 1 case = 1 contestation (par date de livraison)
    cases.forEach((c) => {
      add(c.IO_DateLivraison__c, 'contestations', 1);
    });

    // Colis : via courses (si disponibles) pour le chauffeur filtré
    const courses =
      (chauffeurKeyForCourses && stats?.detailCoursesParChauffeur?.[chauffeurKeyForCourses]) ||
      [];
    courses.forEach((course) => {
      add(course.date, 'colis', course.colisLivres || 0);
    });

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [cases, filtreChauffeur, chauffeurKeyForCourses, stats]);

  // Préparer les données pour les graphiques
  const prepareChartData = () => {
    if (!stats) return { parStatut: [], parMotif: [], parIssue: [], evolution: [], parChauffeur: [], parChargeur: [] };
    
    const parStatut = Object.entries(stats.parStatut).map(([name, value]) => ({ name, value }));
    const parMotif = Object.entries(stats.parMotif)
      .map(([name, value]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, fullName: name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const parIssue = Object.entries(stats.parIssue).map(([name, value]) => ({ name, value }));
    const evolution = evolutionJournaliere;
    const parChauffeur = stats.classementChauffeurs?.slice(0, 15) || [];
    const parChargeur = stats.classementChargeurs?.slice(0, 10) || [];
    
    return { parStatut, parMotif, parIssue, evolution, parChauffeur, parChargeur };
  };

  const chartData = prepareChartData();

  // Formatter les dates
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Couleurs des statuts
  const getStatutColor = (statut) => {
    const colors = {
      'New': 'bg-blue-100 text-blue-800',
      'Nouveau': 'bg-blue-100 text-blue-800',
      'En cours': 'bg-yellow-100 text-yellow-800',
      'Working': 'bg-yellow-100 text-yellow-800',
      'Escalated': 'bg-orange-100 text-orange-800',
      'Closed': 'bg-green-100 text-green-800',
      'Fermé': 'bg-green-100 text-green-800',
      'Clôturé': 'bg-green-100 text-green-800'
    };
    return colors[statut] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'High':
      case 'Haute':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'Medium':
      case 'Moyenne':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };

  const getReportFileSuffix = () => {
    const today = new Date().toISOString().slice(0, 10);
    return `${dateDebut}_${dateFin}_${today}`;
  };

  const buildReportData = () => {
    const exportCases = filteredCases || [];
    const byChargeur = {};

    const totalContestationsGlobal = exportCases.length;
    const totalColisGlobal = stats?.totalColisLivres || 0;

    exportCases.forEach((c) => {
      const chargeur = c.Account?.Name || 'Non défini';
      const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';

      if (!byChargeur[chargeur]) {
        byChargeur[chargeur] = {
          chargeur,
          contestations: 0,
          chauffeurs: {}
        };
      }
      byChargeur[chargeur].contestations += 1;

      if (!byChargeur[chargeur].chauffeurs[chauffeur]) {
        byChargeur[chargeur].chauffeurs[chauffeur] = { chauffeur, contestations: 0 };
      }
      byChargeur[chargeur].chauffeurs[chauffeur].contestations += 1;
    });

    const chargeurs = Object.values(byChargeur)
      .sort((a, b) => (b.contestations || 0) - (a.contestations || 0));

    // Ajouter les colis livrés depuis les Courses (si disponibles)
    const colisParChargeur = stats?.colisParChargeur || {};
    const colisParChauffeurParChargeur = stats?.colisParChauffeurParChargeur || {};

    chargeurs.forEach((ch) => {
      const colisChargeur = colisParChargeur?.[ch.chargeur]?.colisLivres || 0;
      ch.colisLivres = colisChargeur;
      ch.pctContestationsGlobal = totalContestationsGlobal > 0 ? (ch.contestations / totalContestationsGlobal) * 100 : 0;
      ch.pctColisGlobal = totalColisGlobal > 0 ? (ch.colisLivres / totalColisGlobal) * 100 : 0;

      const chauffeurs = Object.values(ch.chauffeurs).map((row) => {
        const colis =
          colisParChauffeurParChargeur?.[row.chauffeur]?.[ch.chargeur]?.colisLivres || 0;
        const pctColisChargeur = colisChargeur > 0 ? (colis / colisChargeur) * 100 : 0;
        const pctContestationsChargeur = ch.contestations > 0 ? (row.contestations / ch.contestations) * 100 : 0;
        const pctColisGlobal = totalColisGlobal > 0 ? (colis / totalColisGlobal) * 100 : 0;
        const pctContestationsGlobal = totalContestationsGlobal > 0 ? (row.contestations / totalContestationsGlobal) * 100 : 0;
        return {
          ...row,
          colisLivres: colis,
          pctColisChargeur,
          pctContestationsChargeur,
          pctColisGlobal,
          pctContestationsGlobal
        };
      });

      ch.chauffeursList = chauffeurs
        .sort((a, b) => (b.contestations || 0) - (a.contestations || 0));
    });

    return {
      filters: {
        dateDebut,
        dateFin,
        dateFilterType,
        dateFilterLabel,
        statut: filtreStatut,
        type: filtreType,
        motif: filtreMotif,
        chauffeur: filtreChauffeur,
        chargeur: filtreChargeur,
        issue: filtreIssue,
        montantMin: filtreMontantMin,
        montantMax: filtreMontantMax,
        search: searchTerm
      },
      kpis: {
        totalContestations: totalContestationsGlobal,
        totalColisLivres: totalColisGlobal
      },
      chargeurs,
      exportCases
    };
  };

  const handleExportExcelSuiviStat = () => {
    const report = buildReportData();
    const wb = XLSX.utils.book_new();

    // Feuille 1: Synthèse
    const synthese = [
      ['RAPPORT SAV - SUIVI STATISTIQUES'],
      [`Généré le ${new Date().toLocaleDateString('fr-FR')}`],
      [],
      ['Filtres'],
      ['Type de date requêtes', report.filters.dateFilterLabel],
      [`${report.filters.dateFilterType === 'integration' ? 'Date intégration' : 'Date livraison'} début`, report.filters.dateDebut],
      [`${report.filters.dateFilterType === 'integration' ? 'Date intégration' : 'Date livraison'} fin`, report.filters.dateFin],
      ['Statut', report.filters.statut],
      ['Type', report.filters.type],
      ['Motif', report.filters.motif],
      ['Chauffeur', report.filters.chauffeur],
      ['Chargeur', report.filters.chargeur],
      ['Issue', report.filters.issue],
      ['Montant min', report.filters.montantMin || '-'],
      ['Montant max', report.filters.montantMax || '-'],
      ['Recherche', report.filters.search || '-'],
      [],
      ['Totaux (tous chargeurs confondus)'],
      ['Total contestations', report.kpis.totalContestations],
      ['Total colis livrés (Courses)', report.kpis.totalColisLivres]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synthese), 'Synthèse');

    // Feuille 2: Chargeurs (synthèse)
    const chargeursRows = report.chargeurs.map((ch) => ({
      Chargeur: ch.chargeur,
      'Contestations': ch.contestations,
      '% Contestations (global)': Number((ch.pctContestationsGlobal || 0).toFixed(2)),
      'Colis livrés': ch.colisLivres || 0,
      '% Colis (global)': Number((ch.pctColisGlobal || 0).toFixed(2))
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chargeursRows), 'Chargeurs');

    // Feuille 3: Chargeur - Chauffeurs (détail)
    const chargeurChauffeurs = [];
    report.chargeurs.forEach((ch) => {
      (ch.chauffeursList || []).forEach((row) => {
        chargeurChauffeurs.push({
          Chargeur: ch.chargeur,
          Chauffeur: row.chauffeur,
          'Colis livrés': row.colisLivres || 0,
          '% Colis (chargeur)': Number((row.pctColisChargeur || 0).toFixed(2)),
          'Contestations': row.contestations,
          '% Contestations (chargeur)': Number((row.pctContestationsChargeur || 0).toFixed(2))
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chargeurChauffeurs), 'Chargeur - Chauffeurs');

    // Feuille 4: Détail requêtes (cases)
    const casesRows = report.exportCases.map((c) => ({
      'N° requête': c.CaseNumber || '',
      'Date intégration': c.CreatedDate ? formatDate(c.CreatedDate) : '',
      'Date livraison': c.IO_DateLivraison__c ? formatDate(c.IO_DateLivraison__c) : '',
      Chargeur: c.Account?.Name || 'Non défini',
      Chauffeur: c.IO_FxChauffeur__c || 'Non assigné',
      Statut: c.Status || '',
      Type: c.Type || '',
      Motif: c.IO_MotifRequete__c || c.Reason || '',
      Issue: c.IO_IssueRequete__c || '',
      'N° colis': c.IO_NumeroColis__c || '',
      'Réf. facture': c.IO_ReferenceFacture__c || ''
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(casesRows), 'Détail requêtes');

    XLSX.writeFile(wb, `SAV_SuiviStatistiques_${getReportFileSuffix()}.xlsx`);
  };

  const generatePdfReportDoc = async (report) => {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 12;
    let y = 16;

    doc.setFontSize(16);
    doc.setTextColor(30, 64, 175);
    doc.text('Rapport SAV - Suivi Statistiques', pageWidth / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `${report.filters.dateFilterLabel} • période: du ${formatDate(report.filters.dateDebut)} au ${formatDate(report.filters.dateFin)}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 10;

    const totalContestations = report.kpis.totalContestations || 0;
    const totalColis = report.kpis.totalColisLivres || 0;

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Synthèse par chargeur', marginX, y);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(
      `Total contestations: ${totalContestations} | Total colis livrés: ${totalColis}`,
      marginX + 68,
      y
    );
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [['Chargeur', 'Contestations', '% contestations (global)', 'Colis livrés', '% colis (global)']],
      body: report.chargeurs.map((ch) => [
        ch.chargeur,
        String(ch.contestations || 0),
        `${(ch.pctContestationsGlobal || 0).toFixed(2)}%`,
        String(ch.colisLivres || 0),
        `${(ch.pctColisGlobal || 0).toFixed(2)}%`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [6, 182, 212] },
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 55 } }
    });
    y = doc.lastAutoTable.finalY + 10;

    // Graphique chargeurs
    setPdfChartJob({ kind: 'chargeursComparison', payload: { report } });
    await waitForPdfChartsFullyRendered();
    const img1 = await capturePdfChartPng();
    y = addChartImageToPdf(doc, img1, y, pageWidth, marginX) + 10;

    // Graphique Top 15 chauffeurs
    setPdfChartJob({ kind: 'top15Chauffeurs', payload: { report } });
    await waitForPdfChartsFullyRendered();
    const img2 = await capturePdfChartPng();
    y = addChartImageToPdf(doc, img2, y, pageWidth, marginX) + 10;

    // Pages détail par chargeur
    for (const ch of report.chargeurs) {
      doc.addPage();
      let y2 = 16;
      doc.setFontSize(13);
      doc.setTextColor(0);
      doc.text(`Détails Chauffeur - Chargeur : ${ch.chargeur}`, marginX, y2);
      y2 += 5;
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(
        `Contestations (chargeur): ${ch.contestations || 0} | % global: ${(ch.pctContestationsGlobal || 0).toFixed(2)}% | Colis (chargeur): ${ch.colisLivres || 0} | % global: ${(ch.pctColisGlobal || 0).toFixed(2)}%`,
        marginX,
        y2
      );

      setPdfChartJob({ kind: 'chargeurChauffeurs', payload: { report, chargeur: ch.chargeur } });
      await waitForPdfChartsFullyRendered();
      const imgCh = await capturePdfChartPng();
      y2 = addChartImageToPdf(doc, imgCh, y2 + 8, pageWidth, marginX) + 8;

      autoTable(doc, {
        startY: y2,
        head: [[
          'Chauffeur (NOM Prénom)',
          'Colis livrés',
          '% colis (chargeur)',
          'Contestations',
          '% contestations (chargeur)'
        ]],
        body: [...(ch.chauffeursList || [])]
          .sort((a, b) => (b.contestations || 0) - (a.contestations || 0))
          .map((r) => [
            r.chauffeur,
            String(r.colisLivres || 0),
            `${(r.pctColisChargeur || 0).toFixed(2)}%`,
            String(r.contestations || 0),
            `${(r.pctContestationsChargeur || 0).toFixed(2)}%`
          ]),
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 70 } }
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} / ${pageCount} - SAV Suivi Statistiques`, marginX, pageHeight - 8);
    }

    setPdfChartJob(null);
    return doc;
  };

  const handleExportPdfSuiviStat = async () => {
    const report = buildReportData();
    const doc = await generatePdfReportDoc(report);
    doc.save(`SAV_SuiviStatistiques_${getReportFileSuffix()}.pdf`);
  };

  const handleSendEmailReport = async () => {
    try {
      setEmailSending(true);
      setEmailError(null);
      const report = buildReportData();

      // Générer le PDF (même contenu que l'export PDF)
      if (activeTab !== 'stats') {
        setActiveTab('stats');
        await new Promise((r) => setTimeout(r, 350));
      }

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      // On réutilise la fonction existante en "copiant" sa logique: le plus simple est de rappeler handleExportPdfSuiviStat ?
      // Ici, on génère un PDF minimal identique à l'export courant: on repasse par handleExportPdfSuiviStat qui fait tout.
      // Pour éviter un double téléchargement, on reconstruit le PDF en appelant handleExportPdfSuiviStat puis on récupère l'output.
      // -> On duplique volontairement l'output à partir du dernier doc généré dans handleExportPdfSuiviStat n'étant pas accessible.
      // Donc: on regénère le doc en appelant handleExportPdfSuiviStat et on reprend la même implémentation ci-dessous.

      // NOTE: Pour rester DRY, on recrée le PDF via la même logique que handleExportPdfSuiviStat
      // en appelant une petite fonction interne.
      const finalDoc = await generatePdfReportDoc(report);
      const dataUri = finalDoc.output('datauristring'); // data:application/pdf;base64,...
      const base64 = String(dataUri).split('base64,')[1] || '';

      const resp = await fetch(`${API_BASE}/api/sav/report-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo,
          subject: `Rapport SAV - Suivi statistiques (${dateDebut} → ${dateFin})`,
          message: emailMessage || 'Bonjour,\n\nVeuillez trouver ci-joint le rapport SAV.\n\nCordialement,',
          fileName: `SAV_SuiviStatistiques_${getReportFileSuffix()}.pdf`,
          pdfBase64: base64
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        const debug = data?.debug ? `\n\nDEBUG:\n${JSON.stringify(data.debug, null, 2)}` : '';
        throw new Error((data?.error || 'Erreur envoi email') + debug);
      }

      setEmailModalOpen(false);
      setEmailTo('');
      setEmailMessage('');
    } catch (e) {
      setEmailError(e?.message || 'Erreur envoi email');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SAV - Suivi Statistiques</h1>
          <p className="text-gray-500">Analyse des requêtes et réclamations</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleExportExcelSuiviStat}
            disabled={loading || !stats}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            title="Exporter le rapport Suivi Statistiques (Excel)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdfSuiviStat}
            disabled={loading || !stats}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
            title="Exporter le rapport Suivi Statistiques (PDF)"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => setEmailModalOpen(true)}
            disabled={loading || !stats}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
            title="Envoyer le rapport par email"
          >
            <Send className="w-4 h-4" />
            Envoyer email
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Modal envoi email */}
      {emailModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white p-5 flex items-center justify-between">
              <div className="font-semibold">Envoyer le rapport SAV par email</div>
              <button onClick={() => setEmailModalOpen(false)} className="p-2 hover:bg-white/20 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {emailError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  {emailError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destinataire</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="exploitation@..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  disabled={emailSending}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSendEmailReport}
                  className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
                  disabled={emailSending || !emailTo}
                >
                  {emailSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Envoyer
                    </>
                  )}
                </button>
              </div>
              <div className="text-xs text-gray-500">
                Le PDF sera envoyé en pièce jointe. (Nécessite une configuration SMTP côté serveur.)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zone cachée: rendu des graphiques pour export PDF (dimensions fixes, options PDF centralisées) */}
      <div
        style={{
          position: 'fixed',
          left: -100000,
          top: 0,
          width: `${getPdfChartOptions().widthPx}px`,
          height: `${getPdfChartOptions().heightPx}px`,
          background: '#ffffff',
          pointerEvents: 'none',
          opacity: 0
        }}
      >
        <div
          ref={pdfChartRef}
          style={{
            width: `${getPdfChartOptions().widthPx}px`,
            height: `${getPdfChartOptions().heightPx}px`,
            fontSize: `${getPdfChartOptions().fontSize}px`
          }}
        >
          {pdfChartJob?.kind === 'chargeursComparison' && (
            <PdfChartChargeursComparison
              report={pdfChartJob.payload.report}
              options={getPdfChartOptions()}
            />
          )}
          {pdfChartJob?.kind === 'top15Chauffeurs' && (
            <PdfChartTop15Chauffeurs
              report={pdfChartJob.payload.report}
              options={getPdfChartOptions()}
            />
          )}
          {pdfChartJob?.kind === 'chargeurChauffeurs' && (
            <PdfChartChargeurChauffeurs
              report={pdfChartJob.payload.report}
              chargeur={pdfChartJob.payload.chargeur}
              options={getPdfChartOptions()}
            />
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div 
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold">Filtres</span>
          </div>
          {showFilters ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
        
        {showFilters && (
          <div className="p-4 pt-0 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Période */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dateFilterType === 'integration' ? "Date intégration début" : "Date livraison début"}
                </label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dateFilterType === 'integration' ? "Date intégration fin" : "Date livraison fin"}
                </label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de date</label>
                <select
                  value={dateFilterType}
                  onChange={(e) => setDateFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="livraison">Date de livraison</option>
                  <option value="integration">Date d'intégration</option>
                </select>
              </div>
              
              {/* Statut */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                <select
                  value={filtreStatut}
                  onChange={(e) => setFiltreStatut(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Tous les statuts</option>
                  {picklists.statuts.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={filtreType}
                  onChange={(e) => setFiltreType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Tous les types</option>
                  {TYPES_LIST.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Motif */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif</label>
                <select
                  value={filtreMotif}
                  onChange={(e) => setFiltreMotif(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Tous les motifs</option>
                  {MOTIFS_LIST.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Chauffeur */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chauffeur</label>
                <select
                  value={filtreChauffeur}
                  onChange={(e) => setFiltreChauffeur(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Tous les chauffeurs</option>
                  {chauffeursList.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Chargeur */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chargeur</label>
                <select
                  value={filtreChargeur}
                  onChange={(e) => setFiltreChargeur(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Tous les chargeurs</option>
                  {chargeursList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              {/* Issue */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue de la requête</label>
                <select
                  value={filtreIssue}
                  onChange={(e) => setFiltreIssue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Toutes les issues</option>
                  {picklists.issues.map(i => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Montant du litige */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant min (€)</label>
                <input
                  type="number"
                  value={filtreMontantMin}
                  onChange={(e) => setFiltreMontantMin(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant max (€)</label>
                <input
                  type="number"
                  value={filtreMontantMax}
                  onChange={(e) => setFiltreMontantMax(e.target.value)}
                  placeholder="∞"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'stats' 
              ? 'text-indigo-600 border-b-2 border-indigo-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Statistiques
          </div>
        </button>
        <button
          onClick={() => setActiveTab('graphiques')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'graphiques' 
              ? 'text-indigo-600 border-b-2 border-indigo-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            Graphiques
          </div>
        </button>
        <button
          onClick={() => setActiveTab('tableau')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'tableau' 
              ? 'text-indigo-600 border-b-2 border-indigo-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Tableau ({filteredCases.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('factures')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'factures' 
              ? 'text-indigo-600 border-b-2 border-indigo-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Factures
          </div>
        </button>
      </div>

      {/* Contenu selon l'onglet */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Onglet Statistiques */}
          {activeTab === 'stats' && stats && (
            <div className="space-y-6">
              {/* Cartes KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <FileText className="w-4 h-4" />
                    Total requêtes
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Euro className="w-4 h-4" />
                    Montant total litiges
                  </div>
                  <div className="text-2xl font-bold text-red-600">{stats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <AlertTriangle className="w-4 h-4" />
                    Avec litige
                  </div>
                  <div className="text-2xl font-bold text-orange-600">{stats.casesAvecMontant}</div>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Clock className="w-4 h-4" />
                    Temps résolution moy.
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.tempsResolutionMoyen > 24 
                      ? `${(stats.tempsResolutionMoyen / 24).toFixed(1)} j`
                      : `${stats.tempsResolutionMoyen.toFixed(1)} h`
                    }
                  </div>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <User className="w-4 h-4" />
                    Chauffeurs concernés
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    {Object.keys(stats.parChauffeur).length}
                  </div>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <TrendingUp className="w-4 h-4" />
                    Moy. / jour
                  </div>
                  <div className="text-2xl font-bold text-indigo-600">
                    {stats.evolutionJournaliere?.length > 0 
                      ? (stats.total / stats.evolutionJournaliere.length).toFixed(1)
                      : 0
                    }
                  </div>
                </div>
              </div>

              {/* Répartition par statut et type */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Par statut */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par statut</h3>
                  <div className="space-y-3">
                    {Object.entries(stats.parStatut).map(([statut, count]) => (
                      <div 
                        key={statut} 
                        className="flex items-center justify-between cursor-pointer hover:bg-indigo-50 p-2 -mx-2 rounded-lg transition-colors"
                        onClick={() => setSelectedStatut(statut)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatutColor(statut)}`}>
                            {statut}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${(count / stats.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">{count}</span>
                          <span className="text-xs text-gray-500 w-12 text-right">
                            {((count / stats.total) * 100).toFixed(1)}%
                          </span>
                          <Eye className="w-4 h-4 text-indigo-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Par Type */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par type</h3>
                  <div className="space-y-3">
                    {Object.entries(stats.parType || {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                      <div 
                        key={type} 
                        className="flex items-center justify-between cursor-pointer hover:bg-purple-50 p-2 -mx-2 rounded-lg transition-colors"
                        onClick={() => setSelectedType(type)}
                      >
                        <span className="text-sm text-gray-700 font-medium hover:text-purple-600">{type}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-purple-600 rounded-full"
                              style={{ width: `${(count / stats.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">{count}</span>
                          <span className="text-xs text-gray-500 w-12 text-right">
                            {((count / stats.total) * 100).toFixed(1)}%
                          </span>
                          <Eye className="w-4 h-4 text-purple-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Répartition par motif et issue */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Par Motif (IO_MotifRequete__c) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par motif</h3>
                  <div className="space-y-3">
                    {Object.entries(stats.parMotif || {})
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([motif, count]) => (
                      <div 
                        key={motif} 
                        className="flex items-center justify-between cursor-pointer hover:bg-orange-50 p-2 -mx-2 rounded-lg transition-colors"
                        onClick={() => setSelectedMotif(motif)}
                      >
                        <span className="text-sm text-gray-700 truncate max-w-[200px] hover:text-orange-600" title={motif}>
                          {motif}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-orange-500 rounded-full"
                              style={{ width: `${(count / stats.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">{count}</span>
                          <span className="text-xs text-gray-500 w-12 text-right">
                            {((count / stats.total) * 100).toFixed(1)}%
                          </span>
                          <Eye className="w-4 h-4 text-orange-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Par issue */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par issue</h3>
                  <div className="space-y-3">
                    {Object.entries(stats.parIssue)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([issue, count]) => (
                      <div 
                        key={issue} 
                        className="flex items-center justify-between cursor-pointer hover:bg-green-50 p-2 -mx-2 rounded-lg transition-colors"
                        onClick={() => setSelectedIssue(issue)}
                      >
                        <span className="text-sm text-gray-700 truncate max-w-[200px] hover:text-green-600" title={issue}>
                          {issue}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-600 rounded-full"
                              style={{ width: `${(count / stats.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">{count}</span>
                          <span className="text-xs text-gray-500 w-12 text-right">
                            {((count / stats.total) * 100).toFixed(1)}%
                          </span>
                          <Eye className="w-4 h-4 text-green-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Comparaison visuelle Colis Livrés vs Contestations (par Chargeur ou par Chauffeur) */}
              {(() => {
                const showChargeurChart = filtreChargeur === 'all' && comparisonSelectedChargeur === null;
                const totalColisGlobal = stats.totalColisLivres || 0;
                const totalContestationsGlobal = stats.total || 0;

                const chargeurChartData = showChargeurChart && stats.colisParChargeur && stats.parChargeur
                  ? Object.entries(stats.colisParChargeur)
                      .map(([nom, data]) => ({
                        nom,
                        fullName: nom,
                        colisLivres: data.colisLivres || 0,
                        contestations: stats.parChargeur[nom]?.count || 0,
                        taux: (data.colisLivres || 0) > 0
                          ? (((stats.parChargeur[nom]?.count || 0) / (data.colisLivres || 1)) * 1000).toFixed(2)
                          : 0
                      }))
                      .filter((ch) => ch.colisLivres > 0 || ch.contestations > 0)
                      .sort((a, b) =>
                        chartSortBy === 'colisLivres'
                          ? (b.colisLivres || 0) - (a.colisLivres || 0)
                          : b.contestations - a.contestations
                      )
                  : [];

                const chauffeurChartData =
                  !showChargeurChart && stats.classementChauffeurs
                    ? (comparisonSelectedChargeur
                        ? (() => {
                            const byChauffeur = stats.colisParChauffeurParChargeur || {};
                            const contByCh = contestationsParChargeurChauffeur[comparisonSelectedChargeur] || {};
                            const chargeursSet = new Set([
                              ...Object.keys(byChauffeur).filter(
                                (ch) =>
                                  (byChauffeur[ch][comparisonSelectedChargeur]?.colisLivres || 0) > 0 ||
                                  (contByCh[ch] || 0) > 0
                              ),
                              ...Object.keys(contByCh)
                            ]);
                            return Array.from(chargeursSet).map((ch) => {
                              const colisLivres =
                                byChauffeur[ch]?.[comparisonSelectedChargeur]?.colisLivres || 0;
                              const contestations = contByCh[ch] || 0;
                              return {
                                nom: ch,
                                fullName: ch,
                                colisLivres,
                                contestations,
                                taux: colisLivres > 0 ? ((contestations / colisLivres) * 1000).toFixed(2) : 0
                              };
                            });
                          })()
                        : stats.classementChauffeurs
                    )
                    : [];
                const displayChauffeurData = (comparisonSelectedChargeur ? chauffeurChartData : stats.classementChauffeurs || [])
                  .filter((ch) => (ch.colisLivres || 0) > 0 || (ch.count ?? ch.contestations) > 0)
                  .sort((a, b) => {
                    if (chartSortBy === 'colisLivres') {
                      return (b.colisLivres || 0) - (a.colisLivres || 0);
                    }
                    return (b.count ?? b.contestations ?? 0) - (a.count ?? a.contestations ?? 0);
                  })
                  .map((ch) => ({
                    nom: ch.nom,
                    fullName: ch.nom,
                    colisLivres: ch.colisLivres || 0,
                    contestations: ch.count ?? ch.contestations ?? 0,
                    taux: (ch.colisLivres || 0) > 0 ? (((ch.count ?? ch.contestations ?? 0) / (ch.colisLivres || 1)) * 1000).toFixed(2) : 0
                  }));

                const chartData = showChargeurChart ? chargeurChartData : displayChauffeurData;
                const totalColisRef = showChargeurChart ? totalColisGlobal : (comparisonSelectedChargeur ? (stats.colisParChargeur?.[comparisonSelectedChargeur]?.colisLivres || 0) : totalColisGlobal);
                const totalContestationsRef = showChargeurChart ? totalContestationsGlobal : (comparisonSelectedChargeur ? (stats.parChargeur?.[comparisonSelectedChargeur]?.count || 0) : totalContestationsGlobal);
                const countLabel = showChargeurChart ? 'chargeurs' : 'chauffeurs';

                return (
                  <div ref={comparisonChartRef} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                        {showChargeurChart
                          ? 'Comparaison Colis Livrés vs Contestations par Chargeur'
                          : `Comparaison Colis Livrés vs Contestations par Chauffeur${comparisonSelectedChargeur ? ` – ${comparisonSelectedChargeur}` : ''}`}
                      </h3>
                      <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                        {dateFilterLabel}
                      </span>
                      {comparisonSelectedChargeur && (
                        <button
                          type="button"
                          onClick={() => setComparisonSelectedChargeur(null)}
                          className="text-sm px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg transition-colors"
                        >
                          ← Retour aux chargeurs
                        </button>
                      )}
                    </div>

                    {/* Boutons de tri */}
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-sm text-gray-600">Trier par :</span>
                      <button
                        onClick={() => setChartSortBy('colisLivres')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                          chartSortBy === 'colisLivres'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span className="w-3 h-3 bg-green-400 rounded"></span>
                        Colis livrés
                        {chartSortBy === 'colisLivres' && <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setChartSortBy('contestations')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                          chartSortBy === 'contestations'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span className="w-3 h-3 bg-red-400 rounded-full"></span>
                        Contestations
                        {chartSortBy === 'contestations' && <ChevronDown className="w-4 h-4" />}
                      </button>
                      <span className="text-xs text-gray-400 ml-auto">
                        {chartData.length} {countLabel} au total
                      </span>
                    </div>

                    {/* Graphique combiné Histogramme + Courbe */}
                    <div className="mb-6 overflow-x-auto">
                      <div style={{ minWidth: Math.max(800, chartData.length * 60) }}>
                        <ResponsiveContainer width="100%" height={650} minWidth={0} minHeight={0}>
                          <ComposedChart
                            data={chartData}
                            margin={{ top: 20, right: 60, left: 20, bottom: 140 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis
                              dataKey="nom"
                              angle={-65}
                              textAnchor="end"
                              height={140}
                              fontSize={10}
                              interval={0}
                              tick={{ fill: '#374151' }}
                            />
                            <YAxis
                              yAxisId="left"
                              orientation="left"
                              stroke="#10B981"
                              label={{ value: 'Colis livrés', angle: -90, position: 'insideLeft', fill: '#10B981', fontSize: 12 }}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              stroke="#EF4444"
                              label={{ value: 'Contestations', angle: 90, position: 'insideRight', fill: '#EF4444', fontSize: 12 }}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  const pourcentageColis = totalColisRef > 0 ? ((data.colisLivres / totalColisRef) * 100).toFixed(2) : 0;
                                  const pourcentageContestations = totalContestationsRef > 0 ? ((data.contestations / totalContestationsRef) * 100).toFixed(1) : 0;
                                  return (
                                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[280px]">
                                      <p className="font-semibold text-gray-800">{data.fullName}</p>
                                      <p className="text-sm text-gray-500 mb-2 pb-2 border-b">
                                        {data.colisLivres.toLocaleString('fr-FR')} / {totalColisRef.toLocaleString('fr-FR')} colis livrés sur la période
                                      </p>
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-green-600 flex items-center gap-2">
                                            <span className="w-3 h-3 bg-green-500 rounded"></span>
                                            Colis livrés:
                                          </span>
                                          <span className="font-bold text-green-700">{data.colisLivres.toLocaleString('fr-FR')}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-green-600 pl-5">
                                          <span>% du total période:</span>
                                          <span className="font-semibold bg-green-100 px-2 py-0.5 rounded">{pourcentageColis}%</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                          <span className="text-red-600 flex items-center gap-2">
                                            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                            Contestations:
                                          </span>
                                          <span className="font-bold text-red-700">{data.contestations}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-red-600 pl-5">
                                          <span>% des contestations:</span>
                                          <span className="font-semibold bg-red-100 px-2 py-0.5 rounded">{pourcentageContestations}%</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                          <span className="text-yellow-600">Taux contestation:</span>
                                          <span className="font-bold text-yellow-700">{data.taux} /1000 colis</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Legend
                              verticalAlign="top"
                              height={36}
                              formatter={(value) => <span className="text-sm">{value}</span>}
                              onClick={(e) => {
                                if (e.dataKey === 'colisLivres') setChartSortBy('colisLivres');
                                if (e.dataKey === 'contestations') setChartSortBy('contestations');
                              }}
                              wrapperStyle={{ cursor: 'pointer' }}
                            />
                            <Bar
                              yAxisId="left"
                              dataKey="colisLivres"
                              name="Colis livrés"
                              fill="#10B981"
                              radius={[4, 4, 0, 0]}
                              opacity={chartSortBy === 'colisLivres' ? 1 : 0.5}
                              cursor="pointer"
                              onClick={(e) => {
                                const payload = e?.payload ?? e;
                                const name = payload?.fullName ?? payload?.nom;
                                if (name) {
                                  if (showChargeurChart) setComparisonSelectedChargeur(name);
                                  else setSelectedChauffeur(name);
                                }
                              }}
                            >
                              <LabelList dataKey="colisLivres" position="top" fill="#059669" fontSize={10} />
                            </Bar>
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="contestations"
                              name="Contestations"
                              stroke="#EF4444"
                              strokeWidth={chartSortBy === 'contestations' ? 4 : 2}
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                if (cx == null || cy == null) return null;
                                const v = payload?.contestations ?? 0;
                                return (
                                  <g>
                                    <circle cx={cx} cy={cy} r={chartSortBy === 'contestations' ? 6 : 4} fill="#EF4444" stroke="#fff" strokeWidth={1} />
                                    <text x={cx} y={cy - 10} textAnchor="middle" fill="#B91C1C" fontSize="10">
                                      {v}
                                    </text>
                                  </g>
                                );
                              }}
                              activeDot={{
                                r: 8,
                                fill: '#EF4444',
                                cursor: 'pointer',
                                onClick: (e, payload) => {
                                  if (showChargeurChart) setComparisonSelectedChargeur(payload.payload.fullName);
                                  else setSelectedChauffeur(payload.payload.fullName);
                                }
                              }}
                              opacity={chartSortBy === 'contestations' ? 1 : 0.7}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {showChargeurChart ? (
                          <>Trié par {chartSortBy === 'colisLivres' ? 'colis livrés' : 'contestations'} (décroissant) – <span className="text-indigo-600 font-medium">Cliquez sur une barre pour afficher les chauffeurs de ce chargeur</span></>
                        ) : (
                          <>Trié par {chartSortBy === 'colisLivres' ? 'colis livrés' : 'contestations'} (décroissant){comparisonSelectedChargeur ? '' : ' – '}<span className="text-indigo-600 font-medium">{comparisonSelectedChargeur ? 'Cliquez sur une barre pour le détail chauffeur' : 'Cliquez sur une barre pour voir le détail du chauffeur'}</span></>
                        )}
                      </p>
                    </div>

                    {/* Indicateurs clés */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-gray-200">
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {(showChargeurChart || !comparisonSelectedChargeur ? stats.totalColisLivres : stats.colisParChargeur?.[comparisonSelectedChargeur]?.colisLivres)?.toLocaleString('fr-FR') || 0}
                        </div>
                        <div className="text-sm text-gray-600">Colis livrés {comparisonSelectedChargeur ? `(${comparisonSelectedChargeur})` : '(période)'}</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {showChargeurChart || !comparisonSelectedChargeur ? stats.total : (stats.parChargeur?.[comparisonSelectedChargeur]?.count ?? 0)}
                        </div>
                        <div className="text-sm text-gray-600">Contestations</div>
                      </div>
                      <div className="bg-yellow-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                          {totalColisRef > 0 ? ((totalContestationsRef / totalColisRef) * 1000).toFixed(2) : 0}
                        </div>
                        <div className="text-sm text-gray-600">Taux /1000</div>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-indigo-600">{chartData.length}</div>
                        <div className="text-sm text-gray-600">{showChargeurChart ? 'Chargeurs' : 'Chauffeurs actifs'}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Top chauffeurs et chargeurs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top chauffeurs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Top 10 Chauffeurs</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600">Req.</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600">Colis</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600">% Colis</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.classementChauffeurs?.slice(0, 10).map((ch, idx) => (
                          <tr 
                            key={ch.nom} 
                            className="hover:bg-indigo-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedChauffeur(ch.nom)}
                          >
                            <td className="px-3 py-2 font-medium text-gray-500">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-indigo-600 hover:text-indigo-800 truncate max-w-[150px]" title={ch.nom}>{ch.nom}</td>
                            <td className="px-3 py-2 text-center font-semibold text-indigo-600">{ch.count}</td>
                            <td className="px-3 py-2 text-center font-semibold text-green-600">{ch.colisLivres?.toLocaleString('fr-FR') || 0}</td>
                            <td className="px-3 py-2 text-center text-green-600 text-xs font-medium">
                              {ch.pourcentageColis || 0}%
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-red-600 text-xs">
                              {ch.montant.toLocaleString('fr-FR')} €
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600 text-xs">
                              {((ch.count / stats.total) * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top chargeurs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par Chargeur</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Chargeur</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600">Req.</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.classementChargeurs?.slice(0, 10).map((ch, idx) => (
                          <tr 
                            key={ch.nom} 
                            className="hover:bg-cyan-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedChargeur(ch.nom)}
                          >
                            <td className="px-3 py-2 font-medium text-gray-500">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-cyan-600 hover:text-cyan-800 truncate max-w-[150px]" title={ch.nom}>{ch.nom}</td>
                            <td className="px-3 py-2 text-center font-semibold text-cyan-600">{ch.count}</td>
                            <td className="px-3 py-2 text-right font-semibold text-red-600 text-xs">
                              {ch.montant.toLocaleString('fr-FR')} €
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600 text-xs">
                              {((ch.count / stats.total) * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Tableau récapitulatif chauffeur -> chargeur */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Récapitulatif contestations par chauffeur puis chargeur</h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    {dateFilterLabel}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur / Chargeur</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Contestations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recapChauffeurChargeur.map((row) => (
                        <Fragment key={row.chauffeur}>
                          <tr className="bg-indigo-50/60">
                            <td className="px-3 py-2 font-semibold text-indigo-700">{row.chauffeur}</td>
                            <td className="px-3 py-2 text-right font-bold text-indigo-700">{row.total}</td>
                          </tr>
                          {row.chargeurs.map((sub) => (
                            <tr key={`${row.chauffeur}-${sub.chargeur}`} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-700 pl-8">- {sub.chargeur}</td>
                              <td className="px-3 py-2 text-right text-gray-800">{sub.count}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Onglet Graphiques */}
          {activeTab === 'graphiques' && stats && (
            <div className="space-y-6">
              {filtreChauffeur !== 'all' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-1">
                    Chauffeur – Colis livrés vs contestations (jour par jour)
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    {dateFilterType === 'integration'
                      ? "Requêtes en date d'intégration (CreatedDate), colis livrés par date de livraison."
                      : 'Requêtes en date de livraison (IO_DateLivraison__c), période filtrée.'} Cliquez sur une barre ou un point pour voir le détail.
                  </p>
                  <ResponsiveContainer width="100%" height={340} minWidth={0} minHeight={0}>
                    <ComposedChart data={evolutionChauffeurParJour}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) =>
                          new Date(d).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                          })
                        }
                        fontSize={11}
                      />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip
                        labelFormatter={(d) => new Date(d).toLocaleDateString('fr-FR')}
                        formatter={(value, name, props) => {
                          const key = props?.dataKey || name;
                          if (key === 'colis') return [value, 'Colis livrés'];
                          if (key === 'contestations') return [value, 'Contestations'];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="colis"
                        name="Colis livrés"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                        onClick={(data) => {
                          const date = data.payload.date;
                          const dayCases = cases.filter(
                            (c) => (c.IO_DateLivraison__c || '').substring(0, 10) === date
                          );
                          const courses =
                            (chauffeurKeyForCourses &&
                              stats?.detailCoursesParChauffeur?.[chauffeurKeyForCourses]) ||
                            [];
                          const dayCourses = courses.filter(
                            (co) => (co.date || '').substring(0, 10) === date
                          );
                          setSelectedChauffeurDaily({ date, cases: dayCases, courses: dayCourses });
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="contestations"
                        name="Contestations"
                        stroke="#4F46E5"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{
                          r: 5,
                          onClick: (e) => {
                            const date = e.payload.date;
                            const dayCases = cases.filter(
                              (c) => (c.IO_DateLivraison__c || '').substring(0, 10) === date
                            );
                            const courses =
                              (chauffeurKeyForCourses &&
                                stats?.detailCoursesParChauffeur?.[chauffeurKeyForCourses]) ||
                              [];
                            const dayCourses = courses.filter(
                              (co) => (co.date || '').substring(0, 10) === date
                            );
                            setSelectedChauffeurDaily({ date, cases: dayCases, courses: dayCourses });
                          },
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Évolution journalière */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-1">Évolution journalière des requêtes</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Courbe : date d'intégration • Histogramme : date de livraison (période filtrée).
                  Cliquez sur un point ou une barre pour voir le détail.
                </p>
                <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
                  <ComposedChart data={chartData.evolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) =>
                        new Date(d).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                        })
                      }
                      fontSize={11}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(d) =>
                        new Date(d).toLocaleDateString('fr-FR')
                      }
                      formatter={(value, name) => [
                        value,
                        name === 'integration'
                          ? "Requêtes (date d'intégration)"
                          : "Requêtes (date de livraison)",
                      ]}
                    />
                    <Legend />
                    <Bar
                      dataKey="livraison"
                      name="Requêtes (date de livraison)"
                      fill="#FDBA74"
                      radius={[4, 4, 0, 0]}
                      onClick={(data) =>
                        setSelectedEvolution({
                          date: data.payload.date,
                          type: 'livraison',
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="integration"
                      name="Requêtes (date d'intégration)"
                      stroke="#4F46E5"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{
                        r: 5,
                        onClick: (e) =>
                          setSelectedEvolution({
                            date: e.payload.date,
                            type: 'integration',
                          }),
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Graphiques en grille */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Par statut - Pie */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par statut <span className="text-xs text-gray-400 font-normal">(cliquez pour détails)</span></h3>
                  <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                    <RechartsPieChart>
                      <Pie
                        data={chartData.parStatut}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={true}
                        onClick={(data) => setSelectedStatut(data.name)}
                        style={{ cursor: 'pointer' }}
                      >
                        {chartData.parStatut.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Par issue - Pie */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Répartition par issue <span className="text-xs text-gray-400 font-normal">(cliquez pour détails)</span></h3>
                  <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
                    <RechartsPieChart>
                      <Pie
                        data={chartData.parIssue}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={true}
                        onClick={(data) => setSelectedIssue(data.name)}
                        style={{ cursor: 'pointer' }}
                      >
                        {chartData.parIssue.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Par motif - Bar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
                  <h3 className="text-lg font-semibold mb-4">Top 10 Motifs de requêtes <span className="text-xs text-gray-400 font-normal">(cliquez sur une barre pour détails)</span></h3>
                  <ResponsiveContainer width="100%" height={350} minWidth={0} minHeight={0}>
                    <BarChart data={chartData.parMotif} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={180} fontSize={11} />
                      <Tooltip 
                        formatter={(value, name, props) => [value, props.payload.fullName || name]}
                      />
                      <Bar 
                        dataKey="value" 
                        fill="#4F46E5" 
                        radius={[0, 4, 4, 0]} 
                        onClick={(data) => setSelectedMotif(data.fullName || data.name)}
                        style={{ cursor: 'pointer' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Par chauffeur - Bar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
                  <h3 className="text-lg font-semibold mb-4">Top 15 Chauffeurs par nombre de requêtes <span className="text-xs text-gray-400 font-normal">(cliquez sur une barre pour détails)</span></h3>
                  <ResponsiveContainer width="100%" height={400} minWidth={0} minHeight={0}>
                    <BarChart data={chartData.parChauffeur} margin={{ top: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="nom" 
                        angle={-45} 
                        textAnchor="end" 
                        height={100}
                        fontSize={10}
                        interval={0}
                      />
                      <YAxis />
                      <Tooltip formatter={(value) => [value, 'Requêtes']} />
                      <Bar 
                        dataKey="count" 
                        name="Requêtes" 
                        fill="#4F46E5" 
                        radius={[4, 4, 0, 0]}
                        label={{ position: 'top', fontSize: 11, fill: '#4F46E5', fontWeight: 'bold' }}
                        onClick={(data) => setSelectedChauffeur(data.nom)}
                        style={{ cursor: 'pointer' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Par chargeur - Bar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
                  <h3 className="text-lg font-semibold mb-4">Répartition par Chargeur</h3>
                  <ResponsiveContainer width="100%" height={350} minWidth={0} minHeight={0}>
                    <BarChart data={chartData.parChargeur} margin={{ top: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="nom" 
                        angle={-45} 
                        textAnchor="end" 
                        height={100}
                        fontSize={10}
                        interval={0}
                      />
                      <YAxis />
                      <Tooltip formatter={(value) => [value, 'Requêtes']} />
                      <Bar 
                        dataKey="count" 
                        name="Requêtes" 
                        fill="#06B6D4" 
                        radius={[4, 4, 0, 0]}
                        label={{ position: 'top', fontSize: 11, fill: '#06B6D4', fontWeight: 'bold' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Onglet Tableau */}
          {activeTab === 'tableau' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Recherche */}
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Rechercher par numéro, objet, colis, chauffeur, destinataire..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Tableau */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th 
                        className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('CaseNumber')}
                      >
                        N° Requête
                        {sortField === 'CaseNumber' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th 
                        className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('CreatedDate')}
                      >
                        Date création
                        {sortField === 'CreatedDate' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Motif</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Issue</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Chauffeur</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">N° Colis</th>
                      <th 
                        className="px-4 py-3 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('IO_MontantLitige__c')}
                      >
                        Montant
                        {sortField === 'IO_MontantLitige__c' && (sortDirection === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600">SF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCases.map(c => (
                      <tr key={c.Id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-indigo-600">{c.CaseNumber}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateTime(c.CreatedDate)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatutColor(c.Status)}`}>
                            {c.Status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={c.IO_MotifRequete__c}>
                          {c.IO_MotifRequete__c || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate" title={c.IO_IssueRequete__c}>
                          {c.IO_IssueRequete__c || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[150px] truncate" title={c.IO_FxChauffeur__c}>
                          {c.IO_FxChauffeur__c || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {c.IO_NumeroColis__c || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                          {c.IO_MontantLitige__c 
                            ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
                            : '-'
                          }
                        </td>
                        <td className="px-4 py-3 text-center">
                          <a
                            href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Onglet Factures */}
          {activeTab === 'factures' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
              {/* Barre de recherche */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Recherche facture</h3>
                  <p className="text-sm text-gray-500">
                    Saisissez une référence facture pour retrouver toutes les réclamations associées.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-80">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Réf. facture (ex: FAC-2026-...)"
                    value={factureSearch}
                    onChange={(e) => setFactureSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Liste des factures */}
              {(() => {
                const facturesMap = {};
                factureCasesData.forEach(c => {
                  const ref = c.IO_ReferenceFacture__c;
                  if (!ref) return;
                  if (!facturesMap[ref]) {
                    facturesMap[ref] = {
                      ref,
                      nbRequetes: 0,
                      montantTotal: 0,
                      chargeurs: new Set(),
                      chauffeurs: new Set()
                    };
                  }
                  facturesMap[ref].nbRequetes += 1;
                  facturesMap[ref].montantTotal += c.IO_MontantLitige__c || 0;
                  if (c.Account?.Name) facturesMap[ref].chargeurs.add(c.Account.Name);
                  if (c.IO_FxChauffeur__c) facturesMap[ref].chauffeurs.add(c.IO_FxChauffeur__c);
                });

                let facturesList = Object.values(facturesMap);
                facturesList.sort((a, b) => b.nbRequetes - a.nbRequetes);

                return (
                  <div className="mt-4">
                    {factureLoading ? (
                      <div className="py-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                        Recherche en cours...
                      </div>
                    ) : factureError ? (
                      <div className="py-4 text-center text-sm text-red-600">
                        {factureError}
                      </div>
                    ) : facturesList.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        Aucune facture trouvée avec cette référence.
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[60vh]">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Réf. facture</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-600">Requêtes</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant litiges</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-600">Chargeurs</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-600">Chauffeurs</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {facturesList.map(f => (
                              <tr
                                key={f.ref}
                                className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                onClick={() => setSelectedFacture(f.ref)}
                              >
                                <td className="px-3 py-2 font-medium text-indigo-600">{f.ref}</td>
                                <td className="px-3 py-2 text-center text-gray-700">{f.nbRequetes}</td>
                                <td className="px-3 py-2 text-right font-semibold text-red-600">
                                  {f.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-2 text-center text-gray-600">
                                  {f.chargeurs.size}
                                </td>
                                <td className="px-3 py-2 text-center text-gray-600">
                                  {f.chauffeurs.size}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* Modal détail chauffeur */}
      {selectedChauffeur && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedChauffeur}</h2>
                    <p className="text-indigo-200">Détail des requêtes SAV</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedChauffeur(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                // Gérer le cas "Non assigné" qui correspond aux cases sans chauffeur
                const chauffeurCases = selectedChauffeur === 'Non assigné'
                  ? cases.filter(c => !c.IO_FxChauffeur__c)
                  : cases.filter(c => c.IO_FxChauffeur__c === selectedChauffeur);
                
                const casesAvecMontant = chauffeurCases.filter(c => c.IO_MontantLitige__c && c.IO_MontantLitige__c > 0);
                const cloturees = chauffeurCases.filter(c => c.Status === 'Closed' || c.Status === 'Fermé').length;
                const casesAvecDelai = chauffeurCases.filter(c => c.CreatedDate && c.ClosedDate);
                const delaiMoyenHeures = casesAvecDelai.length > 0
                  ? (casesAvecDelai.reduce((sum, c) => {
                      const created = new Date(c.CreatedDate);
                      const closed = new Date(c.ClosedDate);
                      const diffHours = (closed - created) / (1000 * 60 * 60);
                      return sum + (Number.isFinite(diffHours) ? diffHours : 0);
                    }, 0) / casesAvecDelai.length)
                  : 0;
                
                const chauffeurStats = {
                  total: chauffeurCases.length,
                  montantTotal: chauffeurCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0),
                  montantMoyen: casesAvecMontant.length > 0 
                    ? casesAvecMontant.reduce((sum, c) => sum + c.IO_MontantLitige__c, 0) / casesAvecMontant.length 
                    : 0,
                  casesAvecMontant: casesAvecMontant.length,
                  tauxResolution: chauffeurCases.length > 0 ? ((cloturees / chauffeurCases.length) * 100).toFixed(1) : 0,
                  pourcentageTotal: cases.length > 0 ? ((chauffeurCases.length / cases.length) * 100).toFixed(1) : 0,
                  delaiMoyenHeures: delaiMoyenHeures,
                  nbCasesAvecDelai: casesAvecDelai.length,
                  parStatut: {},
                  parType: {},
                  parMotif: {},
                  parIssue: {}
                };
                
                chauffeurCases.forEach(c => {
                  const statut = c.Status || 'Non défini';
                  chauffeurStats.parStatut[statut] = (chauffeurStats.parStatut[statut] || 0) + 1;
                  
                  const type = c.Type || 'Non défini';
                  chauffeurStats.parType[type] = (chauffeurStats.parType[type] || 0) + 1;
                  
                  const motif = c.IO_MotifRequete__c || 'Non défini';
                  chauffeurStats.parMotif[motif] = (chauffeurStats.parMotif[motif] || 0) + 1;
                  
                  const issue = c.IO_IssueRequete__c || 'Non défini';
                  chauffeurStats.parIssue[issue] = (chauffeurStats.parIssue[issue] || 0) + 1;
                });

                return (
                  <div className="space-y-6">
                    {/* KPIs principaux */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-indigo-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-indigo-600">{chauffeurStats.total}</div>
                        <div className="text-sm text-gray-600">Requêtes totales</div>
                        <div className="text-xs text-indigo-400 mt-1">{chauffeurStats.pourcentageTotal}% du total</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {chauffeurStats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                        <div className="text-xs text-red-400 mt-1">{chauffeurStats.casesAvecMontant} avec montant</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">{chauffeurStats.tauxResolution}%</div>
                        <div className="text-sm text-gray-600">Taux résolution</div>
                        <div className="text-xs text-green-400 mt-1">{cloturees} clôturées</div>
                      </div>
                      <div className="bg-yellow-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                          {chauffeurStats.montantMoyen.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        <div className="text-sm text-gray-600">Montant moyen</div>
                        <div className="text-xs text-yellow-500 mt-1">par litige</div>
                      </div>
                      <div className="bg-purple-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {chauffeurStats.nbCasesAvecDelai > 0
                            ? (chauffeurStats.delaiMoyenHeures > 24
                              ? `${(chauffeurStats.delaiMoyenHeures / 24).toFixed(1)} j`
                              : `${chauffeurStats.delaiMoyenHeures.toFixed(1)} h`)
                            : '-'
                          }
                        </div>
                        <div className="text-sm text-gray-600">Délai moyen</div>
                        <div className="text-xs text-purple-400 mt-1">
                          {chauffeurStats.nbCasesAvecDelai} clôturées (avec dates)
                        </div>
                      </div>
                    </div>

                    {/* Graphiques par type et motif */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Graphique par type */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Répartition par type</h4>
                        <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                          <RechartsPieChart>
                            <Pie
                              data={Object.entries(chauffeurStats.parType).map(([name, value]) => ({ name, value }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={70}
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={true}
                            >
                              {Object.entries(chauffeurStats.parType).map((entry, index) => (
                                <Cell key={`cell-type-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [value, 'Requêtes']} />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Graphique par motif */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Répartition par motif</h4>
                        <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                          <BarChart 
                            data={Object.entries(chauffeurStats.parMotif)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 6)
                              .map(([name, value]) => ({ 
                                name: name.length > 15 ? name.substring(0, 15) + '...' : name, 
                                fullName: name,
                                value 
                              }))}
                            layout="vertical"
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} fontSize={10} />
                            <Tooltip formatter={(value, name, props) => [value, props.payload.fullName || 'Requêtes']} />
                            <Bar dataKey="value" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Répartitions détaillées */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Par statut */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par statut</h4>
                        <div className="space-y-2">
                          {Object.entries(chauffeurStats.parStatut)
                            .sort((a, b) => b[1] - a[1])
                            .map(([statut, count]) => (
                            <div key={statut} className="flex items-center justify-between text-sm">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${getStatutColor(statut)}`}>
                                {statut}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chauffeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par type */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par type</h4>
                        <div className="space-y-2">
                          {Object.entries(chauffeurStats.parType)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]" title={type}>{type}</span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-purple-600">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chauffeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par motif */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par motif</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {Object.entries(chauffeurStats.parMotif)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([motif, count]) => (
                            <div key={motif} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]" title={motif}>{motif}</span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-orange-600">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chauffeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par issue */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par issue</h4>
                        <div className="space-y-2">
                          {Object.entries(chauffeurStats.parIssue)
                            .sort((a, b) => b[1] - a[1])
                            .map(([issue, count]) => (
                            <div key={issue} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]" title={issue}>{issue}</span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-green-600">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chauffeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Répartition par chargeur */}
                    {stats.colisParChauffeurParChargeur && stats.colisParChauffeurParChargeur[selectedChauffeur] && Object.keys(stats.colisParChauffeurParChargeur[selectedChauffeur]).length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-cyan-600" />
                          Répartition par Chargeur (colis livrés)
                        </h4>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto max-h-64">
                            <table className="w-full text-sm">
                              <thead className="bg-cyan-50 sticky top-0">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Chargeur</th>
                                  <th className="px-3 py-2 text-center font-semibold text-cyan-600">Colis Chauffeur</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-600">Colis Total Chargeur</th>
                                  <th className="px-3 py-2 text-center font-semibold text-indigo-600">% du Chargeur</th>
                                  <th className="px-3 py-2 text-center font-semibold text-green-600">PDL Chauffeur</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-600">PDL Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {Object.entries(stats.colisParChauffeurParChargeur[selectedChauffeur])
                                  .sort((a, b) => b[1].colisLivres - a[1].colisLivres)
                                  .map(([chargeur, data]) => {
                                    const totalChargeur = stats.colisParChargeur?.[chargeur]?.colisLivres || 0;
                                    const totalPdlChargeur = stats.colisParChargeur?.[chargeur]?.pdlLivres || 0;
                                    const pourcentage = totalChargeur > 0 ? ((data.colisLivres / totalChargeur) * 100).toFixed(1) : 0;
                                    return (
                                      <tr key={chargeur} className="hover:bg-cyan-50">
                                        <td className="px-3 py-2 font-medium text-gray-700 max-w-[200px] truncate" title={chargeur}>
                                          {chargeur}
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold text-cyan-600">
                                          {data.colisLivres.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="px-3 py-2 text-center text-gray-600">
                                          {totalChargeur.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                            pourcentage >= 50 ? 'bg-indigo-100 text-indigo-700' :
                                            pourcentage >= 25 ? 'bg-blue-100 text-blue-700' :
                                            pourcentage >= 10 ? 'bg-gray-100 text-gray-700' :
                                            'bg-gray-50 text-gray-500'
                                          }`}>
                                            {pourcentage}%
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-center font-semibold text-green-600">
                                          {data.pdlLivres.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="px-3 py-2 text-center text-gray-600">
                                          {totalPdlChargeur.toLocaleString('fr-FR')}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                              <tfoot className="bg-cyan-100 font-semibold">
                                <tr>
                                  <td className="px-3 py-2 text-right">Total tout Chargeur :</td>
                                  <td className="px-3 py-2 text-center text-cyan-700">
                                    {Object.values(stats.colisParChauffeurParChargeur[selectedChauffeur])
                                      .reduce((sum, d) => sum + d.colisLivres, 0).toLocaleString('fr-FR')}
                                  </td>
                                  <td className="px-3 py-2 text-center text-gray-700">
                                    {stats.totalColisLivres?.toLocaleString('fr-FR') || 0}
                                  </td>
                                  <td className="px-3 py-2 text-center text-indigo-700">
                                    {stats.totalColisLivres > 0 
                                      ? ((Object.values(stats.colisParChauffeurParChargeur[selectedChauffeur])
                                          .reduce((sum, d) => sum + d.colisLivres, 0) / stats.totalColisLivres) * 100).toFixed(1)
                                      : 0}%
                                  </td>
                                  <td className="px-3 py-2 text-center text-green-700">
                                    {Object.values(stats.colisParChauffeurParChargeur[selectedChauffeur])
                                      .reduce((sum, d) => sum + d.pdlLivres, 0).toLocaleString('fr-FR')}
                                  </td>
                                  <td className="px-3 py-2"></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Détail des courses par jour */}
                    {stats.detailCoursesParChauffeur && stats.detailCoursesParChauffeur[selectedChauffeur] && stats.detailCoursesParChauffeur[selectedChauffeur].length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <Package className="w-5 h-5 text-green-600" />
                          Détail des courses ({stats.detailCoursesParChauffeur[selectedChauffeur].length} courses)
                        </h4>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto max-h-64">
                            <table className="w-full text-sm">
                              <thead className="bg-green-50 sticky top-0">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Tournée</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Chargeur</th>
                                  <th className="px-3 py-2 text-center font-semibold text-orange-600">PDL PEC</th>
                                  <th className="px-3 py-2 text-center font-semibold text-blue-600">PDL Livré</th>
                                  <th className="px-3 py-2 text-center font-semibold text-orange-600">Colis PEC</th>
                                  <th className="px-3 py-2 text-center font-semibold text-green-600">Colis Livré</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {stats.detailCoursesParChauffeur[selectedChauffeur].slice(0, 100).map((course, idx) => (
                                  <tr key={idx} className="hover:bg-green-50">
                                    <td className="px-3 py-2 font-medium">
                                      {course.courseId ? (
                                        <a
                                          href={`https://groupetsm.lightning.force.com/lightning/r/IO_Course__c/${course.courseId}/view`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {course.date ? new Date(course.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '-'}
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      ) : (
                                        <span className="text-gray-700">
                                          {course.date ? new Date(course.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '-'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{course.tournee}</td>
                                    <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={course.chargeur}>{course.chargeur}</td>
                                    <td className="px-3 py-2 text-center font-semibold text-orange-600">{course.pdlPec || 0}</td>
                                    <td className="px-3 py-2 text-center font-semibold text-blue-600">{course.pdlLivres || 0}</td>
                                    <td className="px-3 py-2 text-center font-semibold text-orange-600">{course.colisPec || 0}</td>
                                    <td className="px-3 py-2 text-center font-semibold text-green-600">{course.colisLivres || 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-green-100 font-semibold">
                                <tr>
                                  <td colSpan="3" className="px-3 py-2 text-right">Total :</td>
                                  <td className="px-3 py-2 text-center text-orange-700">
                                    {stats.detailCoursesParChauffeur[selectedChauffeur].reduce((sum, c) => sum + (c.pdlPec || 0), 0).toLocaleString('fr-FR')}
                                  </td>
                                  <td className="px-3 py-2 text-center text-blue-700">
                                    {stats.detailCoursesParChauffeur[selectedChauffeur].reduce((sum, c) => sum + (c.pdlLivres || 0), 0).toLocaleString('fr-FR')}
                                  </td>
                                  <td className="px-3 py-2 text-center text-orange-700">
                                    {stats.detailCoursesParChauffeur[selectedChauffeur].reduce((sum, c) => sum + (c.colisPec || 0), 0).toLocaleString('fr-FR')}
                                  </td>
                                  <td className="px-3 py-2 text-center text-green-700">
                                    {stats.detailCoursesParChauffeur[selectedChauffeur].reduce((sum, c) => sum + (c.colisLivres || 0), 0).toLocaleString('fr-FR')}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          {stats.detailCoursesParChauffeur[selectedChauffeur].length > 100 && (
                            <div className="p-2 text-center text-xs text-gray-500 border-t">
                              Affichage des 100 premières courses sur {stats.detailCoursesParChauffeur[selectedChauffeur].length}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Liste des cases */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Liste des requêtes ({chauffeurCases.length})</h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date livraison</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chargeur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Réf. facture</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Motif</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {chauffeurCases.map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      className="font-medium text-indigo-600 hover:underline"
                                      onClick={() => {
                                        // Ouvre le détail dossier au premier plan et ferme le détail chauffeur
                                        setSelectedChauffeur(null);
                                        setSelectedCaseDetail(c);
                                      }}
                                    >
                                      {c.CaseNumber}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {formatDate(c.IO_DateLivraison__c)}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={c.Account?.Name}>
                                    {c.Account?.Name || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={c.IO_ReferenceFacture__c}>
                                    {c.IO_ReferenceFacture__c || '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatutColor(c.Status)}`}>
                                      {c.Status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={c.IO_MotifRequete__c}>
                                    {c.IO_MotifRequete__c || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">
                                    {c.IO_MontantLitige__c 
                                      ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR')} €`
                                      : '-'
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail facture */}
      {selectedFacture && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Facture {selectedFacture}</h2>
                    <p className="text-indigo-200">Détail des réclamations associées</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFacture(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const factureCasesRaw = factureCasesData?.length
                  ? factureCasesData.filter(c => c.IO_ReferenceFacture__c === selectedFacture)
                  : cases.filter(c => c.IO_ReferenceFacture__c === selectedFacture);
                const factureCasesSorted = [...factureCasesRaw].sort((a, b) => {
                  const employeurA = (a.IO_Chauffeur__r?.Account?.Name || '').toLowerCase();
                  const employeurB = (b.IO_Chauffeur__r?.Account?.Name || '').toLowerCase();
                  if (employeurA !== employeurB) {
                    return employeurA.localeCompare(employeurB);
                  }
                  const chauffeurA = (a.IO_FxChauffeur__c || '').toLowerCase();
                  const chauffeurB = (b.IO_FxChauffeur__c || '').toLowerCase();
                  if (chauffeurA !== chauffeurB) {
                    return chauffeurA.localeCompare(chauffeurB);
                  }
                  const chargeurA = (a.Account?.Name || '').toLowerCase();
                  const chargeurB = (b.Account?.Name || '').toLowerCase();
                  return chargeurA.localeCompare(chargeurB);
                });

                // Fallback: essayer de déduire l'employeur à partir de IO_FxChauffeur__c (avec normalisation du nom)
                const employeurParFx = {};
                factureCasesSorted.forEach((c) => {
                  const fx = (c.IO_FxChauffeur__c || '').trim();
                  const employeur = c.IO_Chauffeur__r?.Account?.Name || null;
                  if (fx && employeur) {
                    const key = fx.toLowerCase();
                    if (!employeurParFx[key]) {
                      employeurParFx[key] = employeur;
                    }
                  }
                });

                const factureCases = factureCasesSorted.map((c) => {
                  if (!c.IO_Chauffeur__r?.Account?.Name && c.IO_FxChauffeur__c) {
                    const key = c.IO_FxChauffeur__c.trim().toLowerCase();
                    const inferred = employeurParFx[key];
                    if (inferred) {
                    return {
                      ...c,
                        _employeurFromFx: inferred
                    };
                  }
                  }
                  return c;
                });

                const montantTotal = factureCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0);
                const chargeurs = new Set(factureCases.map(c => c.Account?.Name).filter(Boolean));
                const chauffeurs = new Set(factureCases.map(c => c.IO_FxChauffeur__c).filter(Boolean));

                return (
                  <div className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-indigo-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-indigo-600">{factureCases.length}</div>
                        <div className="text-sm text-gray-600">Requêtes</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-blue-600">{chargeurs.size}</div>
                        <div className="text-sm text-gray-600">Chargeurs</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">{chauffeurs.size}</div>
                        <div className="text-sm text-gray-600">Chauffeurs</div>
                      </div>
                    </div>

                        {/* Liste des requêtes pour la facture */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">
                        Liste des requêtes liées à la facture ({factureCases.length})
                      </h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-72">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chargeur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Employeur chauffeur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Motif</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600">SF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {factureCases.map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-medium text-indigo-600">{c.CaseNumber}</td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {formatDate(c.CreatedDate)}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate" title={c.Account?.Name}>
                                    {c.Account?.Name || '-'}
                                  </td>
                                  <td
                                    className="px-3 py-2 text-gray-600 max-w-[160px] truncate cursor-pointer hover:text-indigo-600"
                                    title={c.IO_Chauffeur__r?.Account?.Name || c._employeurFromFx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedFactureEmployeur({
                                        ref: selectedFacture,
                                        employeur: c.IO_Chauffeur__r?.Account?.Name || c._employeurFromFx || 'Non défini',
                                      });
                                    }}
                                  >
                                    {c.IO_Chauffeur__r?.Account?.Name || c._employeurFromFx || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate" title={c.IO_FxChauffeur__c}>
                                    {c.IO_FxChauffeur__c || '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatutColor(c.Status)}`}>
                                      {c.Status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={c.IO_MotifRequete__c}>
                                    {c.IO_MotifRequete__c || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">
                                    {c.IO_MontantLitige__c 
                                      ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
                                      : '-'
                                    }
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <a
                                      href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-600 hover:text-indigo-800"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail facture par employeur chauffeur */}
      {selectedFactureEmployeur && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {(() => {
              const allFactureCases = factureCasesData?.length ? factureCasesData : cases;
              const rows = allFactureCases.filter((c) => {
                if (c.IO_ReferenceFacture__c !== selectedFactureEmployeur.ref) {
                  return false;
                }
                const employeurEffectif =
                  c.IO_Chauffeur__r?.Account?.Name || c._employeurFromFx || 'Non défini';
                return employeurEffectif === selectedFactureEmployeur.employeur;
              });

              const totalMontant = rows.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0);

              const handleExportFactureEmployeurPDF = () => {
                if (!rows.length) return;

                const doc = new jsPDF('portrait', 'mm', 'a4');
                const pageWidth = doc.internal.pageSize.getWidth();
                let yPos = 20;

                doc.setFontSize(16);
                doc.setTextColor(88, 28, 135);
                doc.text(
                  `Facture ${selectedFactureEmployeur.ref}`,
                  pageWidth / 2,
                  yPos,
                  { align: 'center' }
                );

                yPos += 8;
                doc.setFontSize(13);
                doc.setTextColor(55, 65, 81);
                doc.text(
                  `Employeur chauffeur : ${selectedFactureEmployeur.employeur}`,
                  pageWidth / 2,
                  yPos,
                  { align: 'center' }
                );

                yPos += 8;
                doc.setFontSize(10);
                doc.setTextColor(107, 114, 128);
                doc.text(
                  `Nombre de requêtes : ${rows.length}    |    Montant litiges : ${totalMontant.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2
                  })} €`,
                  pageWidth / 2,
                  yPos,
                  { align: 'center' }
                );

                yPos += 10;

                const body = rows
                  .sort((a, b) => {
                    const dA = a.IO_DateLivraison__c || '';
                    const dB = b.IO_DateLivraison__c || '';
                    return dA.localeCompare(dB);
                  })
                  .map((c) => [
                    c.IO_DateLivraison__c
                      ? new Date(c.IO_DateLivraison__c).toLocaleDateString('fr-FR')
                      : '-',
                    c.IO_NumeroColis__c || '-',
                    c.IO_Tournee__r?.Name || c.IO_Tournee__c || '-',
                    formatAdresseDestinataire(c.IO_AdresseDestinataire__c, c.IO_NomDestinataire__c),
                    c.IO_MontantLitige__c
                      ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR', {
                          minimumFractionDigits: 2
                        })} €`
                      : '-'
                  ]);

                autoTable(doc, {
                  startY: yPos,
                  head: [['Date livraison', 'N° colis', 'Tournée', 'Adresse destinataire', 'Montant litige']],
                  body,
                  theme: 'grid',
                  headStyles: { fillColor: [88, 28, 135], textColor: 255, fontStyle: 'bold' },
                  bodyStyles: { fontSize: 9 },
                  columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 35 },
                    2: { cellWidth: 25 },
                    3: { cellWidth: 70 },
                    4: { cellWidth: 25, halign: 'right' }
                  }
                });

                const fileName = `SAV_Facture_${selectedFactureEmployeur.ref}_${selectedFactureEmployeur.employeur}.pdf`;
                doc.save(fileName);
              };

              return (
                <>
                  {/* Header */}
                  <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-purple-200">Facture</p>
                        <h2 className="text-lg font-bold">
                          {selectedFactureEmployeur.ref} – {selectedFactureEmployeur.employeur}
                        </h2>
                        <p className="text-xs text-indigo-200">
                          Détail par employeur chauffeur (date livraison, colis, tournée, adresse)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExportFactureEmployeurPDF}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg:white/20 rounded-full text-xs font-medium transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Export PDF
                        </button>
                        <button
                          onClick={() => setSelectedFactureEmployeur(null)}
                          className="p-2 hover:bg-white/20 rounded-full transition-colors"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Contenu */}
                  <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <div className="space-y-4">
                      {/* KPIs */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-purple-50 rounded-xl p-4 text-center">
                          <div className="text-2xl font-bold text-purple-600">{rows.length}</div>
                          <div className="text-sm text-gray-600">Requêtes</div>
                        </div>
                        <div className="bg-indigo-50 rounded-xl p-4 text-center">
                          <div className="text-xl font-bold text-indigo-600">
                            {totalMontant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </div>
                          <div className="text-sm text-gray-600">Montant litiges</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <div className="text-xl font-bold text-gray-700">
                            {rows.length > 0
                              ? new Set(rows.map((c) => c.IO_NumeroColis__c).filter(Boolean)).size
                              : 0}
                          </div>
                          <div className="text-sm text-gray-600">Colis uniques</div>
                        </div>
                      </div>

                      {/* Tableau détail */}
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-[60vh]">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date livraison</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N° colis</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Tournée</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Adresse destinataire</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {rows
                                .sort((a, b) => {
                                  const dA = a.IO_DateLivraison__c || '';
                                  const dB = b.IO_DateLivraison__c || '';
                                  return dA.localeCompare(dB);
                                })
                                .map((c, idx) => (
                                  <tr key={`${c.Id}-${idx}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-700">
                                      {c.IO_DateLivraison__c
                                        ? new Date(c.IO_DateLivraison__c).toLocaleDateString('fr-FR')
                                        : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">
                                      {c.IO_NumeroColis__c || '-'}
                                    </td>
                                    <td
                                      className="px-3 py-2 text-gray-700 max-w-[120px] truncate"
                                      title={c.IO_Tournee__r?.Name || c.IO_Tournee__c}
                                    >
                                      {c.IO_Tournee__r?.Name || c.IO_Tournee__c || '-'}
                                    </td>
                                    <td
                                      className="px-3 py-2 text-gray-700 max-w-[240px] truncate"
                                      title={formatAdresseDestinataire(
                                        c.IO_AdresseDestinataire__c,
                                        c.IO_NomDestinataire__c
                                      )}
                                    >
                                      {formatAdresseDestinataire(
                                        c.IO_AdresseDestinataire__c,
                                        c.IO_NomDestinataire__c
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-red-600">
                                      {c.IO_MontantLitige__c
                                        ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR', {
                                            minimumFractionDigits: 2
                                          })} €`
                                        : '-'}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal détail motif */}
      {selectedMotif && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedMotif}</h2>
                    <p className="text-orange-100">Détail des requêtes par motif</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMotif(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const motifCases = selectedMotif === 'Non défini'
                  ? cases.filter(c => !c.IO_MotifRequete__c)
                  : cases.filter(c => c.IO_MotifRequete__c === selectedMotif);
                const motifStats = {
                  total: motifCases.length,
                  montantTotal: motifCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0),
                  parStatut: {},
                  parChauffeur: {},
                  parIssue: {}
                };
                
                motifCases.forEach(c => {
                  const statut = c.Status || 'Non défini';
                  motifStats.parStatut[statut] = (motifStats.parStatut[statut] || 0) + 1;
                  
                  const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
                  motifStats.parChauffeur[chauffeur] = (motifStats.parChauffeur[chauffeur] || 0) + 1;
                  
                  const issue = c.IO_IssueRequete__c || 'Non défini';
                  motifStats.parIssue[issue] = (motifStats.parIssue[issue] || 0) + 1;
                });

                return (
                  <div className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-orange-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-orange-600">{motifStats.total}</div>
                        <div className="text-sm text-gray-600">Requêtes totales</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {motifStats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">
                          {motifStats.parStatut['Closed'] || motifStats.parStatut['Fermé'] || 0}
                        </div>
                        <div className="text-sm text-gray-600">Clôturées</div>
                      </div>
                      <div className="bg-yellow-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-yellow-600">
                          {motifStats.total - (motifStats.parStatut['Closed'] || motifStats.parStatut['Fermé'] || 0)}
                        </div>
                        <div className="text-sm text-gray-600">En cours</div>
                      </div>
                    </div>

                    {/* Répartitions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Par statut */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par statut</h4>
                        <div className="space-y-2">
                          {Object.entries(motifStats.parStatut)
                            .sort((a, b) => b[1] - a[1])
                            .map(([statut, count]) => (
                            <div key={statut} className="flex items-center justify-between text-sm">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${getStatutColor(statut)}`}>
                                {statut}
                              </span>
                              <span className="font-semibold">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par chauffeur */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par chauffeur</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(motifStats.parChauffeur)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 8)
                            .map(([chauffeur, count]) => (
                            <div key={chauffeur} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[150px]" title={chauffeur}>{chauffeur}</span>
                              <span className="font-semibold text-indigo-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par issue */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par issue</h4>
                        <div className="space-y-2">
                          {Object.entries(motifStats.parIssue)
                            .sort((a, b) => b[1] - a[1])
                            .map(([issue, count]) => (
                            <div key={issue} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[150px]" title={issue}>{issue}</span>
                              <span className="font-semibold text-green-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Liste des cases */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Liste des requêtes ({motifCases.length})</h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600">SF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {motifCases.slice(0, 50).map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-medium text-orange-600">{c.CaseNumber}</td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {formatDate(c.CreatedDate)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatutColor(c.Status)}`}>
                                      {c.Status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate" title={c.IO_FxChauffeur__c}>
                                    {c.IO_FxChauffeur__c || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">
                                    {c.IO_MontantLitige__c 
                                      ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR')} €`
                                      : '-'
                                    }
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <a
                                      href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-orange-600 hover:text-orange-800"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {motifCases.length > 50 && (
                          <div className="p-2 text-center text-xs text-gray-500 border-t">
                            Affichage des 50 premiers sur {motifCases.length}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail évolution journalière (intégration / livraison) */}
      {selectedEvolution && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-sky-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      Détail des requêtes du{' '}
                      {new Date(selectedEvolution.date).toLocaleDateString('fr-FR')}
                    </h2>
                    <p className="text-indigo-100 text-sm">
                      {selectedEvolution.type === 'integration'
                        ? "Filtré par date d'intégration (CreatedDate)"
                        : 'Filtré par date de livraison (IO_DateLivraison__c)'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEvolution(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const targetDate = selectedEvolution.date;
                const dayCases =
                  selectedEvolution.type === 'integration'
                    ? cases.filter(
                        (c) =>
                          c.CreatedDate &&
                          c.CreatedDate.substring(0, 10) === targetDate
                      )
                    : cases.filter(
                        (c) =>
                          c.IO_DateLivraison__c &&
                          c.IO_DateLivraison__c.substring(0, 10) === targetDate
                      );

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">
                          {dayCases.length}
                        </span>{' '}
                        requête(s) sur cette journée.
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">
                              N° dossier
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">
                              Date intégration
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">
                              Date livraison
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">
                              Motif
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">
                              Chauffeur
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">
                              Chargeur
                            </th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-700">
                              Montant
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dayCases.map((c) => (
                            <tr key={c.Id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  className="text-blue-700 font-medium hover:underline"
                                  onClick={() => setSelectedCaseDetail(c)}
                                >
                                  {c.CaseNumber}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-gray-700">
                                {c.CreatedDate
                                  ? new Date(c.CreatedDate).toLocaleDateString(
                                      'fr-FR'
                                    )
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">
                                {c.IO_DateLivraison__c
                                  ? new Date(
                                      c.IO_DateLivraison__c
                                    ).toLocaleDateString('fr-FR')
                                  : '-'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">
                                {c.IO_MotifRequete__c || '-'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">
                                {c.IO_FxChauffeur__c || 'Non assigné'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">
                                {c.Account?.Name || '-'}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700">
                                {(c.IO_MontantLitige__c || 0).toLocaleString(
                                  'fr-FR',
                                  { minimumFractionDigits: 2 }
                                )}{' '}
                                €
                              </td>
                            </tr>
                          ))}
                          {dayCases.length === 0 && (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-3 py-4 text-center text-gray-500"
                              >
                                Aucune requête pour cette journée.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail d'une requête (Case) */}
      {selectedCaseDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        if (!selectedCaseDetail?.Id) return;
                        window.open(
                          `https://groupetsm.lightning.force.com/lightning/r/Case/${selectedCaseDetail.Id}/view`,
                          '_blank'
                        );
                      }}
                      title="Ouvrir la requête dans Salesforce"
                    >
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        Dossier {selectedCaseDetail.CaseNumber || selectedCaseDetail.Id}
                        <ExternalLink className="w-5 h-5 opacity-90" />
                      </h2>
                    </button>
                    <p className="text-sky-100 text-sm">
                      Détail colis / livraison / client
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCaseDetail(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)] text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-2">
                    Informations colis
                  </h3>
                  <div className="space-y-1 text-gray-700">
                    <div>
                      <span className="font-medium">N° colis : </span>
                      <span>{selectedCaseDetail.IO_NumeroColis__c || '-'}</span>
                    </div>
                    <div>
                      <span className="font-medium">Date de livraison : </span>
                      <span>
                        {selectedCaseDetail.IO_DateLivraison__c
                          ? new Date(
                              selectedCaseDetail.IO_DateLivraison__c
                            ).toLocaleDateString('fr-FR')
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Chargeur : </span>
                      <span>{selectedCaseDetail.Account?.Name || '-'}</span>
                    </div>
                    <div>
                      <span className="font-medium">Code tournée : </span>
                      <span>
                        {selectedCaseDetail.IO_Tournee__r?.Name ||
                          selectedCaseDetail.IO_Tournee__c ||
                          '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-2">
                    Chauffeur
                  </h3>
                  <div className="space-y-1 text-gray-700">
                    <div>
                      <span className="font-medium">Fx Chauffeur : </span>
                      <span>{selectedCaseDetail.IO_FxChauffeur__c || '-'}</span>
                    </div>
                    <div>
                      <span className="font-medium">Chauffeur (lien) : </span>
                      <span>
                        {selectedCaseDetail.IO_Chauffeur__r?.Name ||
                          selectedCaseDetail.IO_Chauffeur__c ||
                          '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-2">
                  Client / Destinataire
                </h3>
                <div className="space-y-1 text-gray-700">
                  <div>
                    <span className="font-medium">Nom : </span>
                    <span>
                      {selectedCaseDetail.IO_NomDestinataire__c ||
                        selectedCaseDetail.ContactName ||
                        '-'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Adresse complète : </span>
                    <span>
                      {formatAdresseDestinataire(
                        selectedCaseDetail.IO_AdresseDestinataire__c,
                        selectedCaseDetail.IO_NomDestinataire__c
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-2">
                  Requête
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-700">
                  <div>
                    <span className="font-medium">Statut : </span>
                    <span>{selectedCaseDetail.Status || '-'}</span>
                  </div>
                  <div>
                    <span className="font-medium">Type : </span>
                    <span>{selectedCaseDetail.Type || '-'}</span>
                  </div>
                  <div>
                    <span className="font-medium">Motif : </span>
                    <span>{selectedCaseDetail.IO_MotifRequete__c || '-'}</span>
                  </div>
                  <div>
                    <span className="font-medium">Issue : </span>
                    <span>{selectedCaseDetail.IO_IssueRequete__c || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail chauffeur jour par jour (colis + contestations) */}
      {selectedChauffeurDaily && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-indigo-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Détail chauffeur – {new Date(selectedChauffeurDaily.date).toLocaleDateString('fr-FR')}
                  </h2>
                  <p className="text-emerald-100 text-sm">
                    Colis livrés (courses) et contestations (cases) sur la date de livraison
                  </p>
                </div>
                <button
                  onClick={() => setSelectedChauffeurDaily(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-700">
                    {selectedChauffeurDaily.courses.reduce((s, c) => s + (c.colisLivres || 0), 0)}
                  </div>
                  <div className="text-sm text-gray-600">Colis livrés</div>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-700">
                    {selectedChauffeurDaily.cases.length}
                  </div>
                  <div className="text-sm text-gray-600">Contestations</div>
                </div>
              </div>

              {/* Courses */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Courses (colis livrés)</h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Tournée</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Chargeur</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Colis livrés</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Colis PEC</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">PDL livrés</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">PDL PEC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedChauffeurDaily.courses.map((c, idx) => (
                        <tr key={`${c.courseId || 'course'}-${idx}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{c.tournee || '-'}</td>
                          <td className="px-3 py-2">{c.chargeur || '-'}</td>
                          <td className="px-3 py-2 text-right">{(c.colisLivres || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-3 py-2 text-right">{(c.colisPec || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-3 py-2 text-right">{(c.pdlLivres || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-3 py-2 text-right">{(c.pdlPec || 0).toLocaleString('fr-FR')}</td>
                        </tr>
                      ))}
                      {selectedChauffeurDaily.courses.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                            Aucune course sur cette date.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cases */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Contestations (requêtes)</h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">N° dossier</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Chargeur</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Motif</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Statut</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedChauffeurDaily.cases.map((c) => (
                        <tr key={c.Id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-blue-700 font-medium hover:underline"
                              onClick={() => {
                                // Fermer le détail chauffeur, puis ouvrir le dossier au premier plan
                                setSelectedChauffeurDaily(null);
                                setSelectedCaseDetail(c);
                              }}
                            >
                              {c.CaseNumber}
                            </button>
                          </td>
                          <td className="px-3 py-2">{c.Account?.Name || '-'}</td>
                          <td className="px-3 py-2">{c.IO_MotifRequete__c || '-'}</td>
                          <td className="px-3 py-2">{c.Status || '-'}</td>
                          <td className="px-3 py-2 text-right">
                            {(c.IO_MontantLitige__c || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                        </tr>
                      ))}
                      {selectedChauffeurDaily.cases.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                            Aucune contestation sur cette date.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail chargeur */}
      {selectedChargeur && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedChargeur}</h2>
                    <p className="text-cyan-100">Détail des requêtes par chargeur</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedChargeur(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const chargeurCases = selectedChargeur === 'Non défini'
                  ? cases.filter(c => !c.Account?.Name)
                  : cases.filter(c => c.Account?.Name === selectedChargeur);
                
                const casesAvecMontant = chargeurCases.filter(c => c.IO_MontantLitige__c && c.IO_MontantLitige__c > 0);
                const cloturees = chargeurCases.filter(c => c.Status === 'Closed' || c.Status === 'Fermé').length;
                const casesAvecDelai = chargeurCases.filter(c => c.CreatedDate && c.ClosedDate);
                const delaiMoyenHeures = casesAvecDelai.length > 0
                  ? (casesAvecDelai.reduce((sum, c) => {
                      const created = new Date(c.CreatedDate);
                      const closed = new Date(c.ClosedDate);
                      const diffHours = (closed - created) / (1000 * 60 * 60);
                      return sum + (Number.isFinite(diffHours) ? diffHours : 0);
                    }, 0) / casesAvecDelai.length)
                  : 0;
                
                const chargeurStats = {
                  total: chargeurCases.length,
                  montantTotal: chargeurCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0),
                  montantMoyen: casesAvecMontant.length > 0 
                    ? casesAvecMontant.reduce((sum, c) => sum + c.IO_MontantLitige__c, 0) / casesAvecMontant.length 
                    : 0,
                  casesAvecMontant: casesAvecMontant.length,
                  tauxResolution: chargeurCases.length > 0 ? ((cloturees / chargeurCases.length) * 100).toFixed(1) : 0,
                  pourcentageTotal: cases.length > 0 ? ((chargeurCases.length / cases.length) * 100).toFixed(1) : 0,
                  delaiMoyenHeures: delaiMoyenHeures,
                  nbCasesAvecDelai: casesAvecDelai.length,
                  parStatut: {},
                  parType: {},
                  parMotif: {},
                  parChauffeur: {}
                };
                
                chargeurCases.forEach(c => {
                  const statut = c.Status || 'Non défini';
                  chargeurStats.parStatut[statut] = (chargeurStats.parStatut[statut] || 0) + 1;
                  
                  const type = c.Type || 'Non défini';
                  chargeurStats.parType[type] = (chargeurStats.parType[type] || 0) + 1;
                  
                  const motif = c.IO_MotifRequete__c || 'Non défini';
                  chargeurStats.parMotif[motif] = (chargeurStats.parMotif[motif] || 0) + 1;
                  
                  const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
                  chargeurStats.parChauffeur[chauffeur] = (chargeurStats.parChauffeur[chauffeur] || 0) + 1;
                });

                return (
                  <div className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-cyan-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-cyan-600">{chargeurStats.total}</div>
                        <div className="text-sm text-gray-600">Requêtes totales</div>
                        <div className="text-xs text-cyan-400 mt-1">{chargeurStats.pourcentageTotal}% du total</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {chargeurStats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                        <div className="text-xs text-red-400 mt-1">{chargeurStats.casesAvecMontant} avec montant</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">{chargeurStats.tauxResolution}%</div>
                        <div className="text-sm text-gray-600">Taux résolution</div>
                        <div className="text-xs text-green-400 mt-1">{cloturees} clôturées</div>
                      </div>
                      <div className="bg-yellow-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                          {chargeurStats.montantMoyen.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                        <div className="text-sm text-gray-600">Montant moyen</div>
                        <div className="text-xs text-yellow-500 mt-1">par litige</div>
                      </div>
                      <div className="bg-purple-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {chargeurStats.nbCasesAvecDelai > 0
                            ? (chargeurStats.delaiMoyenHeures > 24
                              ? `${(chargeurStats.delaiMoyenHeures / 24).toFixed(1)} j`
                              : `${chargeurStats.delaiMoyenHeures.toFixed(1)} h`)
                            : '-'
                          }
                        </div>
                        <div className="text-sm text-gray-600">Délai moyen</div>
                        <div className="text-xs text-purple-400 mt-1">
                          {chargeurStats.nbCasesAvecDelai} clôturées (avec dates)
                        </div>
                      </div>
                    </div>

                    {/* Graphiques */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Graphique par type */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Répartition par type</h4>
                        <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                          <RechartsPieChart>
                            <Pie
                              data={Object.entries(chargeurStats.parType).map(([name, value]) => ({ name, value }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={70}
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={true}
                            >
                              {Object.entries(chargeurStats.parType).map((entry, index) => (
                                <Cell key={`cell-type-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [value, 'Requêtes']} />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Graphique par motif */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Répartition par motif</h4>
                        <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                          <BarChart 
                            data={Object.entries(chargeurStats.parMotif)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 6)
                              .map(([name, value]) => ({ 
                                name: name.length > 15 ? name.substring(0, 15) + '...' : name, 
                                fullName: name,
                                value 
                              }))}
                            layout="vertical"
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} fontSize={10} />
                            <Tooltip formatter={(value, name, props) => [value, props.payload.fullName || 'Requêtes']} />
                            <Bar dataKey="value" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Répartitions détaillées */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Par statut */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par statut</h4>
                        <div className="space-y-2">
                          {Object.entries(chargeurStats.parStatut)
                            .sort((a, b) => b[1] - a[1])
                            .map(([statut, count]) => (
                            <div key={statut} className="flex items-center justify-between text-sm">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${getStatutColor(statut)}`}>
                                {statut}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chargeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par type */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par type</h4>
                        <div className="space-y-2">
                          {Object.entries(chargeurStats.parType)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]" title={type}>{type}</span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-purple-600">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chargeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par motif */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par motif</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {Object.entries(chargeurStats.parMotif)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([motif, count]) => (
                            <div key={motif} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]" title={motif}>{motif}</span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-orange-600">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chargeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Par chauffeur */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par chauffeur</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {Object.entries(chargeurStats.parChauffeur)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([chauffeur, count]) => (
                            <div key={chauffeur} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]" title={chauffeur}>{chauffeur}</span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-indigo-600">{count}</span>
                                <span className="text-xs text-gray-400">({((count / chargeurStats.total) * 100).toFixed(0)}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Liste des cases */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Liste des requêtes ({chargeurCases.length})</h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Réf. facture</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Motif</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600">SF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {chargeurCases.map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-medium text-cyan-600">{c.CaseNumber}</td>
                                  <td className="px-3 py-2 text-gray-600">
                                    {formatDate(c.CreatedDate)}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={c.IO_ReferenceFacture__c}>
                                    {c.IO_ReferenceFacture__c || '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatutColor(c.Status)}`}>
                                      {c.Status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={c.IO_FxChauffeur__c}>
                                    {c.IO_FxChauffeur__c || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate" title={c.IO_MotifRequete__c}>
                                    {c.IO_MotifRequete__c || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">
                                    {c.IO_MontantLitige__c 
                                      ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR')} €`
                                      : '-'
                                    }
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <a
                                      href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-cyan-600 hover:text-cyan-800"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail statut */}
      {selectedStatut && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Statut: {selectedStatut}</h2>
                    <p className="text-indigo-200">Détail des requêtes par statut</p>
                  </div>
                </div>
                <button onClick={() => setSelectedStatut(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const statutCases = cases.filter(c => c.Status === selectedStatut);
                const statutStats = {
                  total: statutCases.length,
                  montantTotal: statutCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0),
                  parType: {}, parMotif: {}, parChauffeur: {}
                };
                statutCases.forEach(c => {
                  const type = c.Type || 'Non défini';
                  statutStats.parType[type] = (statutStats.parType[type] || 0) + 1;
                  const motif = c.IO_MotifRequete__c || 'Non défini';
                  statutStats.parMotif[motif] = (statutStats.parMotif[motif] || 0) + 1;
                  const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
                  statutStats.parChauffeur[chauffeur] = (statutStats.parChauffeur[chauffeur] || 0) + 1;
                });
                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-indigo-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-indigo-600">{statutStats.total}</div>
                        <div className="text-sm text-gray-600">Requêtes</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{statutStats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-gray-600">{cases.length > 0 ? ((statutStats.total / cases.length) * 100).toFixed(1) : 0}%</div>
                        <div className="text-sm text-gray-600">du total</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par type</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(statutStats.parType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{type}</span>
                              <span className="font-semibold text-purple-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par motif</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(statutStats.parMotif).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([motif, count]) => (
                            <div key={motif} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{motif}</span>
                              <span className="font-semibold text-orange-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par chauffeur</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(statutStats.parChauffeur).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([chauffeur, count]) => (
                            <div key={chauffeur} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{chauffeur}</span>
                              <span className="font-semibold text-indigo-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Liste des requêtes ({statutCases.length})</h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Motif</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600">SF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {statutCases.slice(0, 50).map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-medium text-indigo-600">{c.CaseNumber}</td>
                                  <td className="px-3 py-2 text-gray-600">{formatDate(c.CreatedDate)}</td>
                                  <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{c.IO_FxChauffeur__c || '-'}</td>
                                  <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{c.IO_MotifRequete__c || '-'}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">{c.IO_MontantLitige__c ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR')} €` : '-'}</td>
                                  <td className="px-3 py-2 text-center">
                                    <a href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800">
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail type */}
      {selectedType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Type: {selectedType}</h2>
                    <p className="text-purple-200">Détail des requêtes par type</p>
                  </div>
                </div>
                <button onClick={() => setSelectedType(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const typeCases = selectedType === 'Non défini' ? cases.filter(c => !c.Type) : cases.filter(c => c.Type === selectedType);
                const typeStats = {
                  total: typeCases.length,
                  montantTotal: typeCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0),
                  parStatut: {}, parMotif: {}, parChauffeur: {}
                };
                typeCases.forEach(c => {
                  const statut = c.Status || 'Non défini';
                  typeStats.parStatut[statut] = (typeStats.parStatut[statut] || 0) + 1;
                  const motif = c.IO_MotifRequete__c || 'Non défini';
                  typeStats.parMotif[motif] = (typeStats.parMotif[motif] || 0) + 1;
                  const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
                  typeStats.parChauffeur[chauffeur] = (typeStats.parChauffeur[chauffeur] || 0) + 1;
                });
                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-purple-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-purple-600">{typeStats.total}</div>
                        <div className="text-sm text-gray-600">Requêtes</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{typeStats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-gray-600">{cases.length > 0 ? ((typeStats.total / cases.length) * 100).toFixed(1) : 0}%</div>
                        <div className="text-sm text-gray-600">du total</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par statut</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(typeStats.parStatut).sort((a, b) => b[1] - a[1]).map(([statut, count]) => (
                            <div key={statut} className="flex items-center justify-between text-sm">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${getStatutColor(statut)}`}>{statut}</span>
                              <span className="font-semibold">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par motif</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(typeStats.parMotif).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([motif, count]) => (
                            <div key={motif} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{motif}</span>
                              <span className="font-semibold text-orange-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par chauffeur</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(typeStats.parChauffeur).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([chauffeur, count]) => (
                            <div key={chauffeur} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{chauffeur}</span>
                              <span className="font-semibold text-indigo-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Liste des requêtes ({typeCases.length})</h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600">SF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {typeCases.slice(0, 50).map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-medium text-purple-600">{c.CaseNumber}</td>
                                  <td className="px-3 py-2 text-gray-600">{formatDate(c.CreatedDate)}</td>
                                  <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${getStatutColor(c.Status)}`}>{c.Status}</span></td>
                                  <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{c.IO_FxChauffeur__c || '-'}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">{c.IO_MontantLitige__c ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR')} €` : '-'}</td>
                                  <td className="px-3 py-2 text-center">
                                    <a href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-800">
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail issue */}
      {selectedIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Issue: {selectedIssue}</h2>
                    <p className="text-green-200">Détail des requêtes par issue</p>
                  </div>
                </div>
                <button onClick={() => setSelectedIssue(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {(() => {
                const issueCases = selectedIssue === 'Non défini' ? cases.filter(c => !c.IO_IssueRequete__c) : cases.filter(c => c.IO_IssueRequete__c === selectedIssue);
                const issueStats = {
                  total: issueCases.length,
                  montantTotal: issueCases.reduce((sum, c) => sum + (c.IO_MontantLitige__c || 0), 0),
                  parStatut: {}, parType: {}, parChauffeur: {}
                };
                issueCases.forEach(c => {
                  const statut = c.Status || 'Non défini';
                  issueStats.parStatut[statut] = (issueStats.parStatut[statut] || 0) + 1;
                  const type = c.Type || 'Non défini';
                  issueStats.parType[type] = (issueStats.parType[type] || 0) + 1;
                  const chauffeur = c.IO_FxChauffeur__c || 'Non assigné';
                  issueStats.parChauffeur[chauffeur] = (issueStats.parChauffeur[chauffeur] || 0) + 1;
                });
                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">{issueStats.total}</div>
                        <div className="text-sm text-gray-600">Requêtes</div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{issueStats.montantTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
                        <div className="text-sm text-gray-600">Montant litiges</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-gray-600">{cases.length > 0 ? ((issueStats.total / cases.length) * 100).toFixed(1) : 0}%</div>
                        <div className="text-sm text-gray-600">du total</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par statut</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(issueStats.parStatut).sort((a, b) => b[1] - a[1]).map(([statut, count]) => (
                            <div key={statut} className="flex items-center justify-between text-sm">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${getStatutColor(statut)}`}>{statut}</span>
                              <span className="font-semibold">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par type</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(issueStats.parType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{type}</span>
                              <span className="font-semibold text-purple-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-700 mb-3">Par chauffeur</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {Object.entries(issueStats.parChauffeur).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([chauffeur, count]) => (
                            <div key={chauffeur} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 truncate max-w-[120px]">{chauffeur}</span>
                              <span className="font-semibold text-indigo-600">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Liste des requêtes ({issueCases.length})</h4>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Montant</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600">SF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {issueCases.slice(0, 50).map(c => (
                                <tr key={c.Id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-medium text-green-600">{c.CaseNumber}</td>
                                  <td className="px-3 py-2 text-gray-600">{formatDate(c.CreatedDate)}</td>
                                  <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${getStatutColor(c.Status)}`}>{c.Status}</span></td>
                                  <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{c.IO_FxChauffeur__c || '-'}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-red-600">{c.IO_MontantLitige__c ? `${c.IO_MontantLitige__c.toLocaleString('fr-FR')} €` : '-'}</td>
                                  <td className="px-3 py-2 text-center">
                                    <a href={`https://groupetsm.lightning.force.com/lightning/r/Case/${c.Id}/view`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-800">
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuiviSAV;
