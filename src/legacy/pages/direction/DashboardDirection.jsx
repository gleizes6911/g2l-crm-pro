import { useState, useEffect } from 'react';
import { 
  Package, 
  Truck, 
  Users, 
  Calendar,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  X,
  RefreshCw,
  Building2,
  MapPin,
  Target,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Table,
  LineChart as LineChartIcon,
  Download,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import API_BASE from '../../config/api';
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const Gyro = ({ size = 'normal' }) => (
  <div
    className={`gyro gyro--blink ${size === 'big' ? 'gyro--big' : ''}`}
    aria-label="Gyrophare"
  >
    <div className="gyro__dome" />
    <div className="gyro__base" />
  </div>
);

export default function DashboardDirection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chargeurs, setChargeurs] = useState([]);
  const [activeSection, setActiveSection] = useState('chargeurs'); // 'chargeurs' | 'planningChauffeur'
  const [anomaliesByChargeur, setAnomaliesByChargeur] = useState({});
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [selectedChargeurVignettes, setSelectedChargeurVignettes] = useState([]); // multi-select (vue chargeurs)
  const [selectedChargeur, setSelectedChargeur] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' ou 'chart'
  
  // États pour le détail tournée
  const [selectedTournee, setSelectedTournee] = useState(null);
  
  // États pour le détail chauffeur
  const [selectedChauffeurDetail, setSelectedChauffeurDetail] = useState(null);
  
  // Période par défaut : mois en cours
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateDebut, setDateDebut] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0]);

  // Planning chauffeur
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState(null);
  const [planningRows, setPlanningRows] = useState([]);
  const [planningZeroPec, setPlanningZeroPec] = useState(true);
  const [planningZeroLiv, setPlanningZeroLiv] = useState(true);
  const [planningSearch, setPlanningSearch] = useState('');
  const [planningView, setPlanningView] = useState('both'); // 'accordion' | 'table' | 'both'
  const [planningAccordionMode, setPlanningAccordionMode] = useState('both'); // 'chauffeur' | 'jour' | 'both'
  const [planningExpandedChargeur, setPlanningExpandedChargeur] = useState(null);
  const [planningExpandedChauffeurKey, setPlanningExpandedChauffeurKey] = useState(null);
  const [planningExpandedDayKey, setPlanningExpandedDayKey] = useState(null);
  const [planningSelectedChargeurs, setPlanningSelectedChargeurs] = useState([]); // [] => tous
  const [planningChargeurSelectorOpen, setPlanningChargeurSelectorOpen] = useState(false);

  // Fonction d'export Excel
  const exportToExcel = () => {
    if (!detailData) return;

    const workbook = XLSX.utils.book_new();
    
    // Feuille 1: Statistiques par tournée
    if (detailData.tournees && detailData.tournees.length > 0) {
      const tourneesData = [...detailData.tournees]
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
        .map(t => {
          const nbJours = t.nbJours || 1;
          const taux = t.colisPec > 0 
            ? ((t.colisLivres / t.colisPec) * 100).toFixed(1)
            : t.pdlPec > 0 
              ? ((t.pdlLivres / t.pdlPec) * 100).toFixed(1)
              : 0;
          return {
            'Tournée': t.nom || '-',
            'Nb Jours': t.nbJours || 0,
            'Chauffeurs': t.chauffeurs || '-',
            'PDL PEC': t.pdlPec || 0,
            'PDL Livrés': t.pdlLivres || 0,
            'Colis PEC': t.colisPec || 0,
            'Colis Livrés': t.colisLivres || 0,
            'Moy. Colis PEC/j': Math.round((t.colisPec || 0) / nbJours),
            'Moy. Colis Liv/j': Math.round((t.colisLivres || 0) / nbJours),
            'Moy. PDL PEC/j': Math.round((t.pdlPec || 0) / nbJours),
            'Moy. PDL Liv/j': Math.round((t.pdlLivres || 0) / nbJours),
            'Taux (%)': parseFloat(taux)
          };
        });
      const wsTournees = XLSX.utils.json_to_sheet(tourneesData);
      XLSX.utils.book_append_sheet(workbook, wsTournees, 'Tournées');
    }

    // Feuille 2: Statistiques par chauffeur
    if (detailData.chauffeurs && detailData.chauffeurs.length > 0) {
      const chauffeursData = detailData.chauffeurs.map(c => {
        const parJour = c.parJour || [];
        const joursColisPec = parJour.filter(j => (j.colisPec || 0) > 0).length || 1;
        const joursColisLiv = parJour.filter(j => (j.colisLivres || 0) > 0).length || 1;
        const joursPdlPec = parJour.filter(j => (j.pdlPec || 0) > 0).length || 1;
        const joursPdlLiv = parJour.filter(j => (j.pdlLivres || 0) > 0).length || 1;
        const taux = c.colisPec > 0 
          ? ((c.colisLivres / c.colisPec) * 100).toFixed(1)
          : c.pdlPec > 0 
            ? ((c.pdlLivres / c.pdlPec) * 100).toFixed(1)
            : 0;
        return {
          'Chauffeur': c.nom || 'Inconnu',
          'Nb Jours': c.nbTournees || 0,
          'PDL PEC': c.pdlPec || 0,
          'PDL Livrés': c.pdlLivres || 0,
          'Colis PEC': c.colisPec || 0,
          'Colis Livrés': c.colisLivres || 0,
          'Moy. Colis PEC/j': Math.round((c.colisPec || 0) / joursColisPec),
          'Moy. Colis Liv/j': Math.round((c.colisLivres || 0) / joursColisLiv),
          'Moy. PDL PEC/j': Math.round((c.pdlPec || 0) / joursPdlPec),
          'Moy. PDL Liv/j': Math.round((c.pdlLivres || 0) / joursPdlLiv),
          'Taux (%)': parseFloat(taux)
        };
      });
      const wsChauffeurs = XLSX.utils.json_to_sheet(chauffeursData);
      XLSX.utils.book_append_sheet(workbook, wsChauffeurs, 'Chauffeurs');
    }

    // Feuille 3: Détail jour par jour (tous chauffeurs)
    if (detailData.chauffeurs && detailData.chauffeurs.length > 0) {
      const detailJourData = [];
      detailData.chauffeurs.forEach(c => {
        (c.parJour || []).forEach(jour => {
          const dateObj = new Date(jour.date);
          const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dateObj.getDay()];
          const taux = jour.colisPec > 0 
            ? ((jour.colisLivres / jour.colisPec) * 100).toFixed(1)
            : jour.pdlPec > 0 
              ? ((jour.pdlLivres / jour.pdlPec) * 100).toFixed(1)
              : 0;
          detailJourData.push({
            'Chauffeur': c.nom || 'Inconnu',
            'Date': `${jourSemaine} ${dateObj.toLocaleDateString('fr-FR')}`,
            'Tournée': jour.tournee || '-',
            'PDL PEC': jour.pdlPec || 0,
            'PDL Livrés': jour.pdlLivres || 0,
            'Colis PEC': jour.colisPec || 0,
            'Colis Livrés': jour.colisLivres || 0,
            'Taux (%)': parseFloat(taux)
          });
        });
      });
      if (detailJourData.length > 0) {
        const wsDetail = XLSX.utils.json_to_sheet(detailJourData);
        XLSX.utils.book_append_sheet(workbook, wsDetail, 'Détail Jour par Jour');
      }
    }

    // Télécharger le fichier
    const fileName = `Direction_${selectedChargeur}_${dateDebut}_${dateFin}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Fonction d'export PDF
  const exportToPDF = () => {
    if (!detailData) return;

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // En-tête
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text('Rapport Direction - Suivi des Livraisons', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 10;
    doc.setFontSize(12);
    doc.setTextColor(107, 114, 128); // Gray
    doc.text(`Chargeur: ${selectedChargeur}`, pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 6;
    doc.text(`Période: du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`, pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 10;

    // Tableau des tournées
    if (detailData.tournees && detailData.tournees.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('Statistiques par Tournée', 14, yPos);
      yPos += 5;

      const tourneesTableData = [...detailData.tournees]
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
        .map(t => {
          const nbJours = t.nbJours || 1;
          const taux = t.colisPec > 0 
            ? ((t.colisLivres / t.colisPec) * 100).toFixed(1)
            : t.pdlPec > 0 
              ? ((t.pdlLivres / t.pdlPec) * 100).toFixed(1)
              : 0;
          return [
            t.nom || '-',
            t.nbJours || 0,
            t.pdlPec || 0,
            t.pdlLivres || 0,
            t.colisPec || 0,
            t.colisLivres || 0,
            Math.round((t.colisPec || 0) / nbJours),
            Math.round((t.colisLivres || 0) / nbJours),
            Math.round((t.pdlPec || 0) / nbJours),
            Math.round((t.pdlLivres || 0) / nbJours),
            `${taux}%`
          ];
        });

      autoTable(doc, {
        startY: yPos,
        head: [['Tournée', 'Jours', 'PDL PEC', 'PDL Liv', 'Colis PEC', 'Colis Liv', 'Moy. Colis PEC/j', 'Moy. Colis Liv/j', 'Moy. PDL PEC/j', 'Moy. PDL Liv/j', 'Taux']],
        body: tourneesTableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { halign: 'center', cellWidth: 15 },
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'center', cellWidth: 22 },
          5: { halign: 'center', cellWidth: 22 },
          6: { halign: 'center', cellWidth: 25 },
          7: { halign: 'center', cellWidth: 25 },
          8: { halign: 'center', cellWidth: 25 },
          9: { halign: 'center', cellWidth: 25 },
          10: { halign: 'center', cellWidth: 18 }
        },
        margin: { left: 10, right: 10 }
      });

      yPos = doc.lastAutoTable.finalY + 15;
    }

    // Nouvelle page pour les chauffeurs si nécessaire
    if (yPos > 150) {
      doc.addPage();
      yPos = 15;
    }

    // Tableau des chauffeurs
    if (detailData.chauffeurs && detailData.chauffeurs.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('Statistiques par Chauffeur', 14, yPos);
      yPos += 5;

      const chauffeursTableData = detailData.chauffeurs.map(c => {
        const parJour = c.parJour || [];
        const joursColisPec = parJour.filter(j => (j.colisPec || 0) > 0).length || 1;
        const joursColisLiv = parJour.filter(j => (j.colisLivres || 0) > 0).length || 1;
        const joursPdlPec = parJour.filter(j => (j.pdlPec || 0) > 0).length || 1;
        const joursPdlLiv = parJour.filter(j => (j.pdlLivres || 0) > 0).length || 1;
        const taux = c.colisPec > 0 
          ? ((c.colisLivres / c.colisPec) * 100).toFixed(1)
          : c.pdlPec > 0 
            ? ((c.pdlLivres / c.pdlPec) * 100).toFixed(1)
            : 0;
        return [
          c.nom || 'Inconnu',
          c.nbTournees || 0,
          c.pdlPec || 0,
          c.pdlLivres || 0,
          c.colisPec || 0,
          c.colisLivres || 0,
          Math.round((c.colisPec || 0) / joursColisPec),
          Math.round((c.colisLivres || 0) / joursColisLiv),
          Math.round((c.pdlPec || 0) / joursPdlPec),
          Math.round((c.pdlLivres || 0) / joursPdlLiv),
          `${taux}%`
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Chauffeur', 'Jours', 'PDL PEC', 'PDL Liv', 'Colis PEC', 'Colis Liv', 'Moy. Colis PEC/j', 'Moy. Colis Liv/j', 'Moy. PDL PEC/j', 'Moy. PDL Liv/j', 'Taux']],
        body: chauffeursTableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { halign: 'center', cellWidth: 15 },
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'center', cellWidth: 22 },
          5: { halign: 'center', cellWidth: 22 },
          6: { halign: 'center', cellWidth: 25 },
          7: { halign: 'center', cellWidth: 25 },
          8: { halign: 'center', cellWidth: 25 },
          9: { halign: 'center', cellWidth: 25 },
          10: { halign: 'center', cellWidth: 18 }
        },
        margin: { left: 10, right: 10 }
      });
    }

    // Pied de page avec date de génération
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} - Page ${i}/${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    // Télécharger le fichier
    const fileName = `Direction_${selectedChargeur}_${dateDebut}_${dateFin}.pdf`;
    doc.save(fileName);
  };

  // Charger les données
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/direction/statistiques-chargeurs?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`
      );
      if (!response.ok) throw new Error('Erreur lors du chargement des données');
      const data = await response.json();
      setChargeurs(data.chargeurs || []);
    } catch (err) {
      setError(err.message);
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateDebut, dateFin]);

  const fetchAnomaliesByChargeur = async () => {
    setAnomaliesLoading(true);
    try {
      const params = new URLSearchParams({
        dateDebut,
        dateFin,
        salesforce: 'true',
        zeroPec: 'true',
        zeroLiv: 'true'
      });
      const response = await fetch(`${API_BASE}/api/direction/planning-chauffeur?${params.toString()}`);
      if (!response.ok) throw new Error('Erreur lors du chargement des anomalies');
      const data = await response.json();
      const rows = data.rows || [];
      const map = rows.reduce((acc, r) => {
        const ch = r.chargeur || 'Inconnu';
        acc[ch] = (acc[ch] || 0) + 1;
        return acc;
      }, {});
      setAnomaliesByChargeur(map);
    } catch (err) {
      console.error('Erreur anomalies par chargeur:', err);
      setAnomaliesByChargeur({});
    } finally {
      setAnomaliesLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== 'chargeurs') return;
    fetchAnomaliesByChargeur();
  }, [activeSection, dateDebut, dateFin]);

  const exportSelectedChargeursAnomaliesToPDF = async () => {
    const selected = selectedChargeurVignettes.slice();
    if (selected.length === 0) return;

    const params = new URLSearchParams({
      dateDebut,
      dateFin,
      salesforce: 'true',
      zeroPec: 'true',
      zeroLiv: 'true'
    });
    const response = await fetch(`${API_BASE}/api/direction/planning-chauffeur?${params.toString()}`);
    if (!response.ok) throw new Error('Erreur lors du chargement des anomalies');
    const data = await response.json();
    const rows = (data.rows || []).filter((r) => selected.includes(r.chargeur || 'Inconnu'));

    if (rows.length === 0) return;

    const byChargeur = rows.reduce((acc, r) => {
      const ch = r.chargeur || 'Inconnu';
      if (!acc[ch]) acc[ch] = [];
      acc[ch].push(r);
      return acc;
    }, {});

    const chargeursToExport = selected
      .filter((c) => !!byChargeur[c])
      .sort((a, b) => a.localeCompare(b));

    if (chargeursToExport.length === 0) return;

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    chargeursToExport.forEach((chargeurName, idx) => {
      if (idx > 0) doc.addPage();
      const rws = (byChargeur[chargeurName] || [])
        .slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const nbZeroPec = rws.filter((r) => (r.colisPec ?? 0) === 0).length;
      const nbZeroLiv = rws.filter((r) => (r.colisLivres ?? 0) === 0).length;

      let y = 14;
      doc.setFontSize(16);
      doc.setTextColor(79, 70, 229);
      doc.text('Direction - Suivi Global (Anomalies 0 colis)', pageWidth / 2, y, { align: 'center' });

      y += 8;
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text(`Chargeur : ${chargeurName}`, pageWidth / 2, y, { align: 'center' });

      y += 6;
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Période : du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')} • Lignes : ${rws.length} • Colis PEC=0 : ${nbZeroPec} • Colis livrés=0 : ${nbZeroLiv}`,
        pageWidth / 2,
        y,
        { align: 'center' }
      );

      y += 8;
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Chauffeur', 'Véhicule', 'Tournée', 'Colis PEC', 'Colis livrés']],
        body: rws.map((r) => [
          r.date ? formatDateWithDay(r.date) : '-',
          r.chauffeur || '-',
          r.vehicule || '-',
          r.tournee || '-',
          r.colisPec ?? 0,
          r.colisLivres ?? 0
        ]),
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 50 },
          2: { cellWidth: 22 },
          3: { cellWidth: 88 },
          4: { halign: 'center', cellWidth: 22 },
          5: { halign: 'center', cellWidth: 26 }
        },
        margin: { left: 10, right: 10 }
      });
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} - Page ${i}/${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    const fileName = `Direction_Anomalies_Chargeurs_${dateDebut}_${dateFin}.pdf`;
    doc.save(fileName);
  };

  // Charger le planning chauffeur (anomalies 0 colis)
  const fetchPlanning = async () => {
    setPlanningLoading(true);
    setPlanningError(null);
    try {
      const params = new URLSearchParams({
        dateDebut,
        dateFin,
        salesforce: 'true',
        zeroPec: planningZeroPec ? 'true' : 'false',
        zeroLiv: planningZeroLiv ? 'true' : 'false'
      });
      const response = await fetch(`${API_BASE}/api/direction/planning-chauffeur?${params.toString()}`);
      if (!response.ok) throw new Error('Erreur lors du chargement du planning chauffeur');
      const data = await response.json();
      setPlanningRows(data.rows || []);
    } catch (err) {
      console.error('Erreur planning chauffeur:', err);
      setPlanningRows([]);
      setPlanningError(err.message);
    } finally {
      setPlanningLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== 'planningChauffeur') return;
    fetchPlanning();
  }, [activeSection, dateDebut, dateFin, planningZeroPec, planningZeroLiv]);

  const getPlanningBaseRows = () => {
    const term = planningSearch.trim().toLowerCase();
    return term
      ? planningRows.filter((r) =>
          [r.date, r.chauffeur, r.tournee, r.chargeur]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term)
        )
      : planningRows;
  };

  const getPlanningAnomalyRows = () =>
    getPlanningBaseRows().filter(
      (r) => (r.colisPec ?? 0) === 0 || (r.colisLivres ?? 0) === 0
    );

  const getPlanningSelectedChargeurs = (availableChargeurs) => {
    const selected = (planningSelectedChargeurs || []).filter((c) => availableChargeurs.includes(c));
    return selected.length > 0 ? selected : availableChargeurs;
  };

  const exportPlanningAnomaliesByChargeurToExcel = () => {
    const anomalies = getPlanningAnomalyRows();

    if (anomalies.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Résumé
    const byChargeur = anomalies.reduce((acc, r) => {
      const chargeur = r.chargeur || 'Inconnu';
      if (!acc[chargeur]) acc[chargeur] = [];
      acc[chargeur].push(r);
      return acc;
    }, {});

    const allChargeurs = Object.keys(byChargeur);
    const selectedChargeurs = getPlanningSelectedChargeurs(allChargeurs);

    const resumeData = Object.entries(byChargeur)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([chargeur]) => selectedChargeurs.includes(chargeur))
      .map(([chargeur, rows]) => {
        const nbZeroPec = rows.filter((r) => (r.colisPec ?? 0) === 0).length;
        const nbZeroLiv = rows.filter((r) => (r.colisLivres ?? 0) === 0).length;
        const nbJours = new Set(rows.map((r) => r.date).filter(Boolean)).size;
        const nbChauffeurs = new Set(rows.map((r) => r.chauffeur).filter(Boolean)).size;
        return {
          Chargeur: chargeur,
          'Nb lignes': rows.length,
          'Nb jours': nbJours,
          'Nb chauffeurs': nbChauffeurs,
          'Colis PEC = 0': nbZeroPec,
          'Colis livrés = 0': nbZeroLiv
        };
      });

    const wsResume = XLSX.utils.json_to_sheet(resumeData);
    XLSX.utils.book_append_sheet(wb, wsResume, 'Résumé');

    // Onglet par chargeur
    const safeSheetName = (name) => {
      // Excel: max 31 chars, pas de : \ / ? * [ ]
      const cleaned = String(name || 'Inconnu').replace(/[:\\/?*[\]]/g, ' ').trim();
      return (cleaned || 'Inconnu').slice(0, 31);
    };

    Object.entries(byChargeur)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([chargeur]) => selectedChargeurs.includes(chargeur))
      .forEach(([chargeur, rows]) => {
        const data = rows
          .slice()
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          .map((r) => ({
            Date: r.date ? formatDateWithDay(r.date) : '-',
            Chauffeur: r.chauffeur || '-',
            'Véhicule': r.vehicule || '-',
            'Tournée': r.tournee || '-',
            'Colis PEC': r.colisPec ?? 0,
            'Colis livrés': r.colisLivres ?? 0
          }));

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(chargeur));
      });

    const fileName = `Direction_Planning_Anomalies_par_chargeur_${dateDebut}_${dateFin}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportPlanningAnomaliesByChargeurToPDF = () => {
    const anomalies = getPlanningAnomalyRows();
    if (anomalies.length === 0) return;

    const byChargeur = anomalies.reduce((acc, r) => {
      const chargeur = r.chargeur || 'Inconnu';
      if (!acc[chargeur]) acc[chargeur] = [];
      acc[chargeur].push(r);
      return acc;
    }, {});

    const allChargeurs = Object.keys(byChargeur).sort((a, b) => a.localeCompare(b));
    const selectedChargeurs = getPlanningSelectedChargeurs(allChargeurs).slice().sort((a, b) => a.localeCompare(b));
    if (selectedChargeurs.length === 0) return;

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    selectedChargeurs.forEach((chargeur, idx) => {
      if (idx > 0) doc.addPage();
      const rows = (byChargeur[chargeur] || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const nbZeroPec = rows.filter((r) => (r.colisPec ?? 0) === 0).length;
      const nbZeroLiv = rows.filter((r) => (r.colisLivres ?? 0) === 0).length;

      let y = 14;
      doc.setFontSize(16);
      doc.setTextColor(79, 70, 229);
      doc.text('Direction - Planning chauffeur (Anomalies 0 colis)', pageWidth / 2, y, { align: 'center' });

      y += 8;
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text(`Chargeur : ${chargeur}`, pageWidth / 2, y, { align: 'center' });

      y += 6;
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Période : du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')} • Lignes : ${rows.length} • Colis PEC=0 : ${nbZeroPec} • Colis livrés=0 : ${nbZeroLiv}`,
        pageWidth / 2,
        y,
        { align: 'center' }
      );

      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['Date', 'Chauffeur', 'Véhicule', 'Tournée', 'Colis PEC', 'Colis livrés']],
        body: rows.map((r) => [
          r.date ? formatDateWithDay(r.date) : '-',
          r.chauffeur || '-',
          r.vehicule || '-',
          r.tournee || '-',
          r.colisPec ?? 0,
          r.colisLivres ?? 0
        ]),
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 50 },
          2: { cellWidth: 22 },
          3: { cellWidth: 88 },
          4: { halign: 'center', cellWidth: 22 },
          5: { halign: 'center', cellWidth: 26 }
        },
        margin: { left: 10, right: 10 }
      });
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} - Page ${i}/${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    const fileName = `Direction_Planning_Anomalies_par_chargeur_${dateDebut}_${dateFin}.pdf`;
    doc.save(fileName);
  };

  // Charger le détail d'un chargeur
  const handleChargeurClick = async (chargeur, mode = 'table') => {
    setSelectedChargeur(chargeur);
    setViewMode(mode);
    setDetailLoading(true);
    
    try {
      const response = await fetch(
        `${API_BASE}/api/direction/detail-chargeur/${encodeURIComponent(chargeur.id)}?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`
      );
      if (!response.ok) throw new Error('Erreur lors du chargement du détail');
      const data = await response.json();
      setDetailData(data);
    } catch (err) {
      console.error('Erreur détail:', err);
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Fermer le modal
  const closeModal = () => {
    setSelectedChargeur(null);
    setDetailData(null);
  };

  // Périodes prédéfinies
  const setPeriode = (type) => {
    const now = new Date();
    let debut, fin;
    
    switch(type) {
      case 'today':
        debut = fin = now.toISOString().split('T')[0];
        break;
      case 'week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        debut = startOfWeek.toISOString().split('T')[0];
        fin = now.toISOString().split('T')[0];
        break;
      case 'month':
        debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        fin = now.toISOString().split('T')[0];
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        debut = new Date(now.getFullYear(), quarter * 3, 1).toISOString().split('T')[0];
        fin = now.toISOString().split('T')[0];
        break;
      case 'year':
        debut = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        fin = now.toISOString().split('T')[0];
        break;
      default:
        return;
    }
    
    setDateDebut(debut);
    setDateFin(fin);
  };

  // Fonction pour obtenir la couleur du taux
  const getTauxColor = (taux) => {
    if (taux >= 97) return 'text-green-600';
    if (taux >= 95) return 'text-orange-500';
    return 'text-red-600';
  };

  const getTauxBgColor = (taux) => {
    if (taux >= 97) return 'bg-green-100 text-green-700 border-green-300';
    if (taux >= 95) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const getVignetteBorderColor = (taux) => {
    if (taux >= 97) return 'border-green-400 hover:border-green-500';
    if (taux >= 95) return 'border-orange-400 hover:border-orange-500';
    return 'border-red-400 hover:border-red-500';
  };

  // Formater la date avec le jour de la semaine
  const formatDateWithDay = (dateStr) => {
    const d = new Date(dateStr);
    const jour = d.toLocaleDateString('fr-FR', { weekday: 'short' }); // Lun, Mar, etc.
    const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return `${jour} ${date}`;
  };

  // Formater la date complète pour le tooltip
  const formatDateFull = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  };

  // Custom tooltip pour les graphiques
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-semibold text-gray-900 mb-2 capitalize">{formatDateFull(label)}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: <span className="font-bold">{entry.value.toLocaleString()}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Direction - Suivi Global
            </h1>
            <p className="text-gray-500">Vue d'ensemble des performances par chargeur</p>
          </div>
        </div>
      </div>

      {/* Sélecteur de période */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-gray-700">Période :</span>
          </div>
          
          {/* Boutons de période rapide */}
          <div className="flex gap-2">
            {[
              { key: 'today', label: "Aujourd'hui" },
              { key: 'week', label: 'Semaine' },
              { key: 'month', label: 'Mois' },
              { key: 'quarter', label: 'Trimestre' },
              { key: 'year', label: 'Année' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriode(key)}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          
          {/* Dates personnalisées */}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <span className="text-gray-500">au</span>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              onClick={fetchData}
              className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Sélecteur de vue */}
      <div className="bg-white rounded-2xl shadow-lg p-4 mb-6 border border-gray-100">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">Vue :</span>
          <button
            type="button"
            onClick={() => setActiveSection('chargeurs')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSection === 'chargeurs'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Par chargeur
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('planningChauffeur')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              activeSection === 'planningChauffeur'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Planning chauffeur
          </button>

          {activeSection === 'planningChauffeur' && (
            <button
              type="button"
              onClick={fetchPlanning}
              className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${planningLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          )}
        </div>
      </div>

      {/* Vignettes des chargeurs */}
      {activeSection === 'chargeurs' ? (loading ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Chargement des données...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Réessayer
          </button>
        </div>
      ) : chargeurs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <Package className="w-8 h-8 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Aucune donnée pour cette période</p>
        </div>
      ) : (
        <>
          {/* Barre d'actions multi-sélection */}
          <div className="bg-white rounded-2xl shadow-lg p-4 mb-4 border border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="text-sm font-semibold text-gray-700">
              Sélection : <span className="text-indigo-700">{selectedChargeurVignettes.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedChargeurVignettes(chargeurs.map((c) => c.nom))}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              onClick={() => setSelectedChargeurVignettes([])}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              Tout désélectionner
            </button>
            <button
              type="button"
              disabled={selectedChargeurVignettes.length === 0}
              onClick={exportSelectedChargeursAnomaliesToPDF}
              className={`ml-auto px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                selectedChargeurVignettes.length === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
              title="Export PDF des anomalies pour les chargeurs sélectionnés"
            >
              <FileText className="w-4 h-4" />
              Export PDF (anomalies)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {chargeurs.map((chargeur) => {
            const tauxPDL = chargeur.pdlPec > 0 ? ((chargeur.pdlLivres / chargeur.pdlPec) * 100).toFixed(1) : 0;
            const tauxColis = chargeur.colisPec > 0 ? ((chargeur.colisLivres / chargeur.colisPec) * 100).toFixed(1) : 0;
            const tauxPrincipal = chargeur.colisPec > 0 ? tauxColis : tauxPDL;
            const anomaliesCount = anomaliesByChargeur?.[chargeur.nom] || 0;
            const hasAnomalies = anomaliesCount > 0;
            const isSelected = selectedChargeurVignettes.includes(chargeur.nom);

            const goToPlanningForChargeur = () => {
              setActiveSection('planningChauffeur');
              setPlanningSelectedChargeurs([chargeur.nom]);
              setPlanningChargeurSelectorOpen(false);
              setPlanningSearch('');
              setPlanningView('accordion');
              setPlanningExpandedChargeur(chargeur.nom);
              setPlanningExpandedChauffeurKey(null);
              setPlanningExpandedDayKey(null);
            };

            const toggleSelectedChargeur = () => {
              setSelectedChargeurVignettes((prev) => {
                if (prev.includes(chargeur.nom)) return prev.filter((x) => x !== chargeur.nom);
                return [...prev, chargeur.nom];
              });
            };
            
            return (
              <div
                key={chargeur.id}
                className={`relative overflow-hidden bg-white rounded-2xl shadow-lg p-5 ${
                  isSelected
                    ? 'border-4 border-orange-500 bg-orange-50/60'
                    : hasAnomalies
                      ? 'border-4 border-red-600'
                      : 'border-2 border-green-500'
                }`}
              >
                {/* Header avec nom du chargeur et boutons */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Truck className="w-6 h-6 text-indigo-600" />
                  </div>
                  <button
                    type="button"
                    onClick={toggleSelectedChargeur}
                    className="flex-1 min-w-0 text-left"
                    title={isSelected ? 'Cliquez pour désélectionner' : 'Cliquez pour sélectionner'}
                  >
                    <h3 className={`font-bold truncate ${isSelected ? 'text-orange-800' : 'text-gray-900'}`}>
                      {chargeur.nom}
                    </h3>
                    <p className="text-xs text-gray-500">{chargeur.nbTournees || 0} tournées</p>
                  </button>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold border ${getTauxBgColor(tauxPrincipal)}`}>
                    {tauxPrincipal}%
                  </div>
                </div>

                {hasAnomalies ? (
                  <button
                    type="button"
                    onClick={goToPlanningForChargeur}
                    className="w-full mb-3 -mt-1 flex items-center justify-between bg-red-100/70 border border-red-200 rounded-xl px-3 py-2 hover:bg-red-100 transition-colors"
                    title="Voir le détail des anomalies dans Planning chauffeur"
                  >
                    <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                      <Gyro size="big" />
                      Anomalies détectées
                    </div>
                    <div className="text-sm font-extrabold text-red-700">
                      {anomaliesCount}
                    </div>
                  </button>
                ) : (
                  <div className="w-full mb-3 -mt-1 flex items-center justify-between bg-green-100/70 border border-green-200 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                      <ThumbsUp className="w-5 h-5 animate-thumb-pop" />
                      Anomalies détectées
                    </div>
                    <div className="text-sm font-extrabold text-green-700">0</div>
                  </div>
                )}
                
                {/* Stats PDL */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">PDL</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-blue-600 font-medium">Pec</p>
                      <p className="text-sm font-bold text-blue-700">{(chargeur.pdlPec || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-green-600 font-medium">Livrés</p>
                      <p className="text-sm font-bold text-green-700">{(chargeur.pdlLivres || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-red-600 font-medium">Retour</p>
                      <p className="text-sm font-bold text-red-700">{(chargeur.pdlRetour || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                
                {/* Stats Colis */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Colis</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-indigo-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-indigo-600 font-medium">Pec</p>
                      <p className="text-sm font-bold text-indigo-700">{(chargeur.colisPec || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-teal-600 font-medium">Livrés</p>
                      <p className="text-sm font-bold text-teal-700">{(chargeur.colisLivres || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-orange-600 font-medium">Retour</p>
                      <p className="text-sm font-bold text-orange-700">{(chargeur.colisRetour || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Boutons d'action */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => handleChargeurClick(chargeur, 'table')}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium text-gray-700"
                  >
                    <Table className="w-4 h-4" />
                    Tableau
                  </button>
                  <button
                    onClick={() => handleChargeurClick(chargeur, 'chart')}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors text-sm font-medium text-indigo-700"
                  >
                    <BarChart3 className="w-4 h-4" />
                    Graphiques
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </>
      )) : null}

      {/* Planning chauffeur (anomalies) */}
      {activeSection === 'planningChauffeur' && (
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Planning chauffeur – 0 Colis PEC / 0 Colis livrés
              </h2>
              <p className="text-sm text-gray-500">
                Période du {new Date(dateDebut).toLocaleDateString('fr-FR')} au {new Date(dateFin).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportPlanningAnomaliesByChargeurToExcel}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2"
                title="Export Excel des anomalies, 1 onglet par chargeur"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export anomalies (Excel)
              </button>
              <button
                type="button"
                onClick={exportPlanningAnomaliesByChargeurToPDF}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2"
                title="Export PDF des anomalies, 1 page par chargeur sélectionné"
              >
                <FileText className="w-4 h-4" />
                Export anomalies (PDF)
              </button>
            </div>
          </div>

          {/* Filtres anomalies */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={planningZeroPec}
                  onChange={(e) => setPlanningZeroPec(e.target.checked)}
                  className="w-4 h-4"
                />
                Colis PEC = 0
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={planningZeroLiv}
                  onChange={(e) => setPlanningZeroLiv(e.target.checked)}
                  className="w-4 h-4"
                />
                Colis livrés = 0
              </label>
              <div className="h-6 w-px bg-indigo-200 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Affichage :</span>
                <button
                  type="button"
                  onClick={() => setPlanningView('both')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    planningView === 'both'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                >
                  Accordéon + tableau
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningView('accordion')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    planningView === 'accordion'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                >
                  Accordéon
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningView('table')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    planningView === 'table'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                >
                  Tableau
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Accordéon :</span>
                <button
                  type="button"
                  onClick={() => setPlanningAccordionMode('both')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    planningAccordionMode === 'both'
                      ? 'bg-white text-indigo-700 border border-indigo-200'
                      : 'bg-white/60 text-gray-700 hover:bg-white border border-indigo-100'
                  }`}
                >
                  Chauffeur + jour
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningAccordionMode('chauffeur')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    planningAccordionMode === 'chauffeur'
                      ? 'bg-white text-indigo-700 border border-indigo-200'
                      : 'bg-white/60 text-gray-700 hover:bg-white border border-indigo-100'
                  }`}
                >
                  Par chauffeur
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningAccordionMode('jour')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    planningAccordionMode === 'jour'
                      ? 'bg-white text-indigo-700 border border-indigo-200'
                      : 'bg-white/60 text-gray-700 hover:bg-white border border-indigo-100'
                  }`}
                >
                  Par jour
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlanningChargeurSelectorOpen((v) => !v)}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors border border-indigo-200"
                  title="Choisir un ou plusieurs chargeurs pour l'export"
                >
                  Chargeurs: {planningSelectedChargeurs.length > 0 ? planningSelectedChargeurs.length : 'Tous'}
                </button>
                <input
                  type="text"
                  value={planningSearch}
                  onChange={(e) => setPlanningSearch(e.target.value)}
                  placeholder="Rechercher (chauffeur, chargeur, tournée...)"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-72"
                />
              </div>
            </div>
            {planningChargeurSelectorOpen && (
              <div className="mt-3 bg-white border border-indigo-200 rounded-xl p-3">
                {(() => {
                  const anomalies = getPlanningAnomalyRows();
                  const byChargeur = anomalies.reduce((acc, r) => {
                    const ch = r.chargeur || 'Inconnu';
                    acc[ch] = (acc[ch] || 0) + 1;
                    return acc;
                  }, {});
                  const available = Object.keys(byChargeur).sort((a, b) => a.localeCompare(b));
                  const allSelected = available.length > 0 && planningSelectedChargeurs.length === available.length;

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-700">
                          Sélection chargeurs (anomalies)
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPlanningSelectedChargeurs(available)}
                            className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                            disabled={available.length === 0}
                          >
                            Tout sélectionner
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlanningSelectedChargeurs([])}
                            className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-700 hover:bg-gray-100"
                          >
                            Réinitialiser
                          </button>
                        </div>
                      </div>
                      {available.length === 0 ? (
                        <div className="text-sm text-gray-500">Aucune anomalie à exporter.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                          {available.map((c) => {
                            const checked = planningSelectedChargeurs.length === 0
                              ? true
                              : planningSelectedChargeurs.includes(c);
                            // Quand sélection vide => "Tous". On active la sélection explicite au premier clic.
                            const effectiveChecked = planningSelectedChargeurs.length === 0 ? false : checked;
                            return (
                              <label key={c} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={effectiveChecked}
                                  onChange={(e) => {
                                    const nextChecked = e.target.checked;
                                    setPlanningSelectedChargeurs((prev) => {
                                      const base = prev.length === 0 ? [] : prev.slice();
                                      if (nextChecked) {
                                        if (!base.includes(c)) base.push(c);
                                      } else {
                                        const i = base.indexOf(c);
                                        if (i >= 0) base.splice(i, 1);
                                      }
                                      return base;
                                    });
                                  }}
                                  className="w-4 h-4"
                                />
                                <span className="truncate" title={c}>{c}</span>
                                <span className="ml-auto text-xs font-semibold text-indigo-700">{byChargeur[c]}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        Astuce : laisse vide (= tous) ou sélectionne explicitement 1+ chargeur(s) pour l’export.
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Décoche les deux cases pour afficher toutes les lignes (pas uniquement les anomalies).
            </p>
          </div>

          {planningLoading ? (
            <div className="py-10 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-gray-500">Chargement du planning chauffeur...</p>
            </div>
          ) : planningError ? (
            <div className="py-10 text-center">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <p className="text-red-600">{planningError}</p>
              <button
                type="button"
                onClick={fetchPlanning}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Réessayer
              </button>
            </div>
          ) : (() => {
            const term = planningSearch.trim().toLowerCase();
            const rowsAll = term
              ? planningRows.filter((r) =>
                  [r.date, r.chauffeur, r.vehicule, r.tournee, r.chargeur]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(term)
                )
              : planningRows;

            const selectedForDisplay = planningSelectedChargeurs.length > 0 ? planningSelectedChargeurs : null;
            const rows = selectedForDisplay
              ? rowsAll.filter((r) => selectedForDisplay.includes(r.chargeur || 'Inconnu'))
              : rowsAll;

            if (rows.length === 0) {
              return (
                <div className="py-10 text-center text-gray-500">
                  Aucune ligne trouvée pour ces critères.
                </div>
              );
            }

            return (
              <div className="overflow-x-auto">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-600">
                    <span className="font-bold text-gray-900">{rows.length}</span> ligne(s)
                  </p>
                </div>

                {/* Vue accordéon (chauffeur -> jour) */}
                {(planningView === 'accordion' || planningView === 'both') && (
                  <div className="mb-6">
                    {(() => {
                      const byChargeur = rows.reduce((acc, r) => {
                        const chargeur = r.chargeur || 'Inconnu';
                        if (!acc[chargeur]) acc[chargeur] = [];
                        acc[chargeur].push(r);
                        return acc;
                      }, {});

                      const chargeurs = Object.keys(byChargeur).sort((a, b) => a.localeCompare(b));

                      return (
                        <div className="space-y-3">
                          {chargeurs.map((chargeur) => {
                            const cRows = byChargeur[chargeur] || [];
                            const totalPec = cRows.reduce((s, r) => s + (r.colisPec || 0), 0);
                            const totalLiv = cRows.reduce((s, r) => s + (r.colisLivres || 0), 0);
                            const joursUniques = new Set(cRows.map((r) => r.date).filter(Boolean)).size;
                            const chauffeursUniques = new Set(cRows.map((r) => r.chauffeur).filter(Boolean)).size;
                            const expanded = planningExpandedChargeur === chargeur;

                            return (
                              <div key={chargeur} className="border border-gray-200 rounded-xl overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPlanningExpandedChargeur(expanded ? null : chargeur);
                                    setPlanningExpandedChauffeurKey(null);
                                    setPlanningExpandedDayKey(null);
                                  }}
                                  className="w-full px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {expanded ? (
                                      <ChevronUp className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="font-bold text-gray-900 truncate">{chargeur}</div>
                                      <div className="text-xs text-gray-500">
                                        {joursUniques} jour(s) • {chauffeursUniques} chauffeur(s) • {cRows.length} ligne(s)
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm">
                                    <div className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold">
                                      PEC {totalPec.toLocaleString()}
                                    </div>
                                    <div className="px-3 py-1 rounded-lg bg-green-50 text-green-700 font-bold">
                                      LIV {totalLiv.toLocaleString()}
                                    </div>
                                  </div>
                                </button>

                                {expanded && (
                                  <div className="bg-white p-4">
                                    {(() => {
                                      const byChauffeur = cRows.reduce((acc, r) => {
                                        const ch = r.chauffeur || 'Inconnu';
                                        if (!acc[ch]) acc[ch] = [];
                                        acc[ch].push(r);
                                        return acc;
                                      }, {});
                                      const chauffeurs = Object.keys(byChauffeur).sort((a, b) => a.localeCompare(b));

                                      const byDay = cRows.reduce((acc, r) => {
                                        const d = r.date || 'Date inconnue';
                                        if (!acc[d]) acc[d] = [];
                                        acc[d].push(r);
                                        return acc;
                                      }, {});
                                      const days = Object.keys(byDay).sort((a, b) => (a || '').localeCompare(b || ''));

                                      return (
                                        <div className="space-y-3">
                                          {(planningAccordionMode === 'chauffeur' || planningAccordionMode === 'both') && (
                                            <div className="space-y-2">
                                              <p className="text-xs font-bold text-gray-500 uppercase">Par chauffeur</p>
                                              {chauffeurs.map((ch) => {
                                                const chRows = byChauffeur[ch] || [];
                                                const key = `${chargeur}__${ch}`;
                                                const expandedCh = planningExpandedChauffeurKey === key;
                                                const chPec = chRows.reduce((s, r) => s + (r.colisPec || 0), 0);
                                                const chLiv = chRows.reduce((s, r) => s + (r.colisLivres || 0), 0);
                                                const chDays = new Set(chRows.map((r) => r.date).filter(Boolean)).size;

                                                return (
                                                  <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setPlanningExpandedChauffeurKey(expandedCh ? null : key);
                                                        setPlanningExpandedDayKey(null);
                                                      }}
                                                      className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                                                    >
                                                      <div className="flex items-center gap-2 min-w-0">
                                                        {expandedCh ? (
                                                          <ChevronUp className="w-4 h-4 text-gray-600" />
                                                        ) : (
                                                          <ChevronDown className="w-4 h-4 text-gray-600" />
                                                        )}
                                                        <span className="font-semibold text-gray-900 truncate">{ch}</span>
                                                        <span className="text-xs text-gray-500">• {chDays} jour(s)</span>
                                                      </div>
                                                      <div className="flex items-center gap-2 text-xs font-bold">
                                                        <span className={`px-2 py-1 rounded bg-blue-50 ${chPec === 0 ? 'text-gray-500' : 'text-blue-700'}`}>
                                                          PEC {chPec.toLocaleString()}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded bg-green-50 ${chLiv === 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                          LIV {chLiv.toLocaleString()}
                                                        </span>
                                                      </div>
                                                    </button>

                                                    {expandedCh && (
                                                      <div className="p-3 bg-white">
                                                        <div className="overflow-x-auto">
                                                          <table className="w-full text-xs">
                                                            <thead className="bg-white">
                                                              <tr className="text-gray-500">
                                                                <th className="text-left font-semibold py-2 pr-3">Date</th>
                                                                <th className="text-left font-semibold py-2 pr-3">Véhicule</th>
                                                                <th className="text-left font-semibold py-2 pr-3">Tournée</th>
                                                                <th className="text-center font-semibold py-2 px-2">Colis PEC</th>
                                                                <th className="text-center font-semibold py-2 px-2">Colis livrés</th>
                                                              </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                              {chRows
                                                                .slice()
                                                                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                                                                .map((r, i) => (
                                                                  <tr key={`${key}-${i}`} className="hover:bg-gray-50">
                                                                    <td className="py-2 pr-3 text-gray-700">
                                                                      {r.date ? formatDateWithDay(r.date) : '-'}
                                                                    </td>
                                                                    <td className="py-2 pr-3 text-gray-700 font-mono text-[11px]">
                                                                      {r.vehicule || '-'}
                                                                    </td>
                                                                    <td className="py-2 pr-3 text-gray-900 font-medium">{r.tournee || '-'}</td>
                                                                    <td className={`py-2 px-2 text-center font-bold ${r.colisPec === 0 ? 'text-gray-500' : 'text-blue-700'}`}>
                                                                      {r.colisPec ?? 0}
                                                                    </td>
                                                                    <td className={`py-2 px-2 text-center font-bold ${r.colisLivres === 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                                      {r.colisLivres ?? 0}
                                                                    </td>
                                                                  </tr>
                                                                ))}
                                                            </tbody>
                                                          </table>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}

                                          {(planningAccordionMode === 'jour' || planningAccordionMode === 'both') && (
                                            <div className="space-y-2">
                                              <p className="text-xs font-bold text-gray-500 uppercase">Par jour</p>
                                              {days.map((d) => {
                                                const dayRows = byDay[d] || [];
                                                const dayKey = `${chargeur}__${d}`;
                                                const dayExpanded = planningExpandedDayKey === dayKey;
                                                const dayPec = dayRows.reduce((s, r) => s + (r.colisPec || 0), 0);
                                                const dayLiv = dayRows.reduce((s, r) => s + (r.colisLivres || 0), 0);
                                                const dayChauffeurs = new Set(dayRows.map((r) => r.chauffeur).filter(Boolean)).size;

                                                return (
                                                  <div key={dayKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                                    <button
                                                      type="button"
                                                      onClick={() => setPlanningExpandedDayKey(dayExpanded ? null : dayKey)}
                                                      className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        {dayExpanded ? (
                                                          <ChevronUp className="w-4 h-4 text-gray-600" />
                                                        ) : (
                                                          <ChevronDown className="w-4 h-4 text-gray-600" />
                                                        )}
                                                        <span className="font-semibold text-gray-900">
                                                          {d && d !== 'Date inconnue' ? formatDateWithDay(d) : 'Date inconnue'}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                          • {dayChauffeurs} chauffeur(s) • {dayRows.length} ligne(s)
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center gap-2 text-xs font-bold">
                                                        <span className={`px-2 py-1 rounded bg-blue-50 ${dayPec === 0 ? 'text-gray-500' : 'text-blue-700'}`}>
                                                          PEC {dayPec.toLocaleString()}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded bg-green-50 ${dayLiv === 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                          LIV {dayLiv.toLocaleString()}
                                                        </span>
                                                      </div>
                                                    </button>

                                                    {dayExpanded && (
                                                      <div className="p-3 bg-white">
                                                        <div className="overflow-x-auto">
                                                          <table className="w-full text-xs">
                                                            <thead className="bg-white">
                                                              <tr className="text-gray-500">
                                                                <th className="text-left font-semibold py-2 pr-3">Chauffeur</th>
                                                                <th className="text-left font-semibold py-2 pr-3">Véhicule</th>
                                                                <th className="text-left font-semibold py-2 pr-3">Tournée</th>
                                                                <th className="text-center font-semibold py-2 px-2">Colis PEC</th>
                                                                <th className="text-center font-semibold py-2 px-2">Colis livrés</th>
                                                              </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                              {dayRows
                                                                .slice()
                                                                .sort((a, b) => (a.chauffeur || '').localeCompare(b.chauffeur || ''))
                                                                .map((r, i) => (
                                                                  <tr key={`${dayKey}-${i}`} className="hover:bg-gray-50">
                                                                    <td className="py-2 pr-3 text-gray-900 font-medium">{r.chauffeur || '-'}</td>
                                                                    <td className="py-2 pr-3 text-gray-700 font-mono text-[11px]">
                                                                      {r.vehicule || '-'}
                                                                    </td>
                                                                    <td className="py-2 pr-3 text-gray-700">{r.tournee || '-'}</td>
                                                                    <td className={`py-2 px-2 text-center font-bold ${r.colisPec === 0 ? 'text-gray-500' : 'text-blue-700'}`}>
                                                                      {r.colisPec ?? 0}
                                                                    </td>
                                                                    <td className={`py-2 px-2 text-center font-bold ${r.colisLivres === 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                                      {r.colisLivres ?? 0}
                                                                    </td>
                                                                  </tr>
                                                                ))}
                                                            </tbody>
                                                          </table>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Tableau (vue actuelle) */}
                {(planningView === 'table' || planningView === 'both') && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Chauffeur</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Véhicule</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Tournée</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Chargeur</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Colis PEC</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Colis livrés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, idx) => (
                      <tr
                        key={`${r.date}-${r.chauffeur}-${r.tournee}-${r.chargeur}-${idx}`}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 text-gray-700">
                          {r.date ? formatDateWithDay(r.date) : '-'}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.chauffeur || '-'}</td>
                        <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.vehicule || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.tournee || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.chargeur || '-'}</td>
                        <td className={`px-3 py-2 text-center font-bold ${r.colisPec === 0 ? 'text-gray-500' : 'text-blue-700'}`}>
                          {r.colisPec ?? 0}
                        </td>
                        <td className={`px-3 py-2 text-center font-bold ${r.colisLivres === 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {r.colisLivres ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal détail chargeur */}
      {selectedChargeur && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
            {/* Header modal */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <Truck className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedChargeur.nom}</h2>
                    <p className="text-indigo-200">
                      {viewMode === 'chart' ? 'Analyse graphique' : 'Détail par tournée'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Toggle vue */}
                  <div className="flex bg-white/20 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('table')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'table' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/10'
                      }`}
                    >
                      <Table className="w-4 h-4 inline mr-1" />
                      Tableau
                    </button>
                    <button
                      onClick={() => setViewMode('chart')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'chart' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/10'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 inline mr-1" />
                      Graphiques
                    </button>
                  </div>
                  
                  {/* Boutons Export */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportToExcel}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                      title="Exporter en Excel"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Excel
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                      title="Exporter en PDF"
                    >
                      <FileText className="w-4 h-4" />
                      PDF
                    </button>
                  </div>
                  
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* Contenu modal */}
            <div className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
              {detailLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-500">Chargement du détail...</p>
                </div>
              ) : detailData ? (
                <div className="space-y-6">
                  {/* Stats résumé */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-blue-600 mb-1">PDL Pec</p>
                      <p className="text-xl font-bold text-blue-700">{(detailData.totaux?.pdlPec || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-green-600 mb-1">PDL Livrés</p>
                      <p className="text-xl font-bold text-green-700">{(detailData.totaux?.pdlLivres || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-red-600 mb-1">PDL Retour</p>
                      <p className="text-xl font-bold text-red-700">{(detailData.totaux?.pdlRetour || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-indigo-600 mb-1">Colis Pec</p>
                      <p className="text-xl font-bold text-indigo-700">{(detailData.totaux?.colisPec || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-teal-600 mb-1">Colis Livrés</p>
                      <p className="text-xl font-bold text-teal-700">{(detailData.totaux?.colisLivres || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-orange-600 mb-1">Colis Retour</p>
                      <p className="text-xl font-bold text-orange-700">{(detailData.totaux?.colisRetour || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  {viewMode === 'chart' ? (
                    /* VUE GRAPHIQUES */
                    <div className="space-y-8">
                      {/* Graphique évolution par jour - Toutes tournées */}
                      <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-indigo-600" />
                          Évolution journalière (toutes tournées)
                        </h3>
                        {detailData.parJour && detailData.parJour.length > 0 ? (
                          <ResponsiveContainer width="100%" height={400} minWidth={0} minHeight={0}>
                            <BarChart data={detailData.parJour} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis 
                                dataKey="date" 
                                tickFormatter={formatDateWithDay}
                                tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }}
                                stroke="#6b7280"
                                height={80}
                                interval={0}
                              />
                              <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                              <Tooltip content={<CustomTooltip />} />
                              <Legend />
                              <Bar dataKey="colisPec" name="Colis PEC" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="colisLivres" name="Colis Livrés" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-center text-gray-500 py-8">Aucune donnée disponible</p>
                        )}
                      </div>

                      {/* Graphique comparatif par tournée - Histogramme vertical */}
                      <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-indigo-600" />
                          Comparatif par tournée (période complète)
                        </h3>
                        {detailData.tournees && detailData.tournees.length > 0 ? (
                          <ResponsiveContainer width="100%" height={500} minWidth={0} minHeight={0}>
                            <BarChart 
                              data={detailData.tournees}
                              margin={{ top: 20, right: 30, left: 20, bottom: 120 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis 
                                dataKey="nom" 
                                tick={{ fontSize: 11, angle: -45, textAnchor: 'end' }}
                                stroke="#6b7280"
                                height={120}
                                interval={0}
                              />
                              <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                              <Tooltip 
                                content={({ active, payload, label }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200 min-w-[200px]">
                                        <p className="font-bold text-gray-900 mb-3 border-b pb-2">Tournée: {label}</p>
                                        <div className="space-y-2 text-sm">
                                          <div className="flex justify-between">
                                            <span className="text-blue-600">PDL PEC:</span>
                                            <span className="font-semibold">{(data.pdlPec || 0).toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-green-600">PDL Livrés:</span>
                                            <span className="font-semibold">{(data.pdlLivres || 0).toLocaleString()}</span>
                                          </div>
                                          <div className="border-t pt-2 mt-2">
                                            <div className="flex justify-between">
                                              <span className="text-indigo-600">Colis PEC:</span>
                                              <span className="font-semibold">{(data.colisPec || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-emerald-600">Colis Livrés:</span>
                                              <span className="font-semibold">{(data.colisLivres || 0).toLocaleString()}</span>
                                            </div>
                                          </div>
                                          <div className="border-t pt-2 mt-2">
                                            <div className="flex justify-between">
                                              <span className="text-purple-600">Livrés Domicile:</span>
                                              <span className="font-semibold">{(data.colisLivresDomicile || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-orange-600">Livrés Relais:</span>
                                              <span className="font-semibold">{(data.colisLivresRelais || 0).toLocaleString()}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Legend />
                              <Bar dataKey="colisPec" name="Colis PEC" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="colisLivres" name="Colis Livrés" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-center text-gray-500 py-8">Aucune donnée disponible</p>
                        )}
                      </div>

                      {/* Graphique évolution par tournée par jour */}
                      {detailData.parTournee && detailData.parTournee.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <LineChartIcon className="w-5 h-5 text-indigo-600" />
                            Évolution par tournée (jour par jour)
                          </h3>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {detailData.parTournee.slice(0, 6).map((tournee, idx) => (
                              <div key={tournee.nom} className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-gray-800 mb-3 text-sm truncate">
                                  {tournee.nom}
                                </h4>
                                <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                                  <LineChart data={tournee.data} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis 
                                      dataKey="date" 
                                      tickFormatter={formatDateWithDay}
                                      tick={{ fontSize: 9, angle: -30, textAnchor: 'end' }}
                                      stroke="#9ca3af"
                                      height={40}
                                    />
                                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line 
                                      type="monotone" 
                                      dataKey="colisPec" 
                                      name="PEC"
                                      stroke={COLORS[idx % COLORS.length]} 
                                      strokeWidth={2}
                                      dot={{ r: 3 }}
                                    />
                                    <Line 
                                      type="monotone" 
                                      dataKey="colisLivres" 
                                      name="Livrés"
                                      stroke="#10b981" 
                                      strokeWidth={2}
                                      dot={{ r: 3 }}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Répartition par chauffeur (Histogramme) */}
                      {detailData.chauffeurs && detailData.chauffeurs.length > 0 && (() => {
                        const totalColis = detailData.chauffeurs.reduce((sum, c) => sum + (c.colisPec || 0), 0);
                        const dataWithPercent = detailData.chauffeurs.map(c => ({
                          ...c,
                          pourcentage: totalColis > 0 ? ((c.colisPec / totalColis) * 100).toFixed(1) : 0
                        }));
                        
                        const renderCustomLabel = (props) => {
                          const { x, y, width, height, index } = props;
                          const entry = dataWithPercent[index];
                          if (!entry) return null;
                          return (
                            <text 
                              x={x + width + 8} 
                              y={y + height / 2} 
                              fill="#374151" 
                              textAnchor="start" 
                              dominantBaseline="middle"
                              fontSize={12}
                              fontWeight="bold"
                            >
                              {entry.colisPec.toLocaleString()} colis ({entry.pourcentage}%)
                            </text>
                          );
                        };
                        
                        return (
                          <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <Users className="w-5 h-5 text-indigo-600" />
                              Répartition par chauffeur ({detailData.chauffeurs.length} chauffeurs - {totalColis.toLocaleString()} colis PEC total)
                            </h3>
                            <ResponsiveContainer width="100%" height={Math.max(400, detailData.chauffeurs.length * 50)} minWidth={0} minHeight={0}>
                              <BarChart 
                                data={dataWithPercent}
                                layout="vertical"
                                margin={{ top: 20, right: 150, left: 150, bottom: 20 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" />
                                <YAxis 
                                  type="category" 
                                  dataKey="nom" 
                                  tick={{ fontSize: 11 }} 
                                  stroke="#6b7280"
                                  width={140}
                                />
                                <Tooltip 
                                  formatter={(value, name, props) => {
                                    const entry = dataWithPercent[props.payload?.index] || props.payload;
                                    return [`${value.toLocaleString()} colis (${entry?.pourcentage || 0}% du total)`, name];
                                  }}
                                  labelFormatter={(label) => `Chauffeur: ${label}`}
                                />
                                <Legend />
                                <Bar 
                                  dataKey="colisPec" 
                                  name="Colis PEC" 
                                  fill="#6366f1" 
                                  radius={[0, 4, 4, 0]}
                                  label={renderCustomLabel}
                                >
                                  {dataWithPercent.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })()}

                      {/* Moyenne colis livrés par jour par chauffeur */}
                      {detailData.chauffeurs && detailData.chauffeurs.length > 0 && (() => {
                        const dataWithMoyenne = detailData.chauffeurs
                          .map(c => ({
                            ...c,
                            moyenneLivresParJour: c.nbTournees > 0 ? Math.round(c.colisLivres / c.nbTournees) : 0,
                            joursTravailes: c.nbTournees || 0
                          }))
                          .sort((a, b) => b.moyenneLivresParJour - a.moyenneLivresParJour);
                        
                        const moyenneGlobale = dataWithMoyenne.reduce((sum, c) => sum + c.moyenneLivresParJour, 0) / dataWithMoyenne.length;
                        
                        const renderMoyenneLabel = (props) => {
                          const { x, y, width, height, index } = props;
                          const entry = dataWithMoyenne[index];
                          if (!entry) return null;
                          return (
                            <text 
                              x={x + width + 8} 
                              y={y + height / 2} 
                              fill="#374151" 
                              textAnchor="start" 
                              dominantBaseline="middle"
                              fontSize={12}
                              fontWeight="bold"
                            >
                              {entry.moyenneLivresParJour} colis/jour ({entry.joursTravailes} jours)
                            </text>
                          );
                        };
                        
                        return (
                          <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                              <Target className="w-5 h-5 text-green-600" />
                              Moyenne colis livrés par jour travaillé
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">
                              Moyenne globale : <span className="font-bold text-green-600">{Math.round(moyenneGlobale)} colis/jour</span>
                            </p>
                            <ResponsiveContainer width="100%" height={Math.max(400, dataWithMoyenne.length * 50)} minWidth={0} minHeight={0}>
                              <BarChart 
                                data={dataWithMoyenne}
                                layout="vertical"
                                margin={{ top: 20, right: 180, left: 150, bottom: 20 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" />
                                <YAxis 
                                  type="category" 
                                  dataKey="nom" 
                                  tick={{ fontSize: 11 }} 
                                  stroke="#6b7280"
                                  width={140}
                                />
                                <Tooltip 
                                  content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                      const entry = payload[0].payload;
                                      return (
                                        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
                                          <p className="font-semibold text-gray-900 mb-2">{label}</p>
                                          <p className="text-sm text-green-600">
                                            <span className="font-bold">{entry.moyenneLivresParJour}</span> colis livrés/jour
                                          </p>
                                          <p className="text-sm text-gray-600">
                                            {entry.colisLivres.toLocaleString()} colis livrés sur {entry.joursTravailes} jours
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Legend />
                                <Bar 
                                  dataKey="moyenneLivresParJour" 
                                  name="Moyenne colis livrés/jour" 
                                  fill="#10b981" 
                                  radius={[0, 4, 4, 0]}
                                  label={renderMoyenneLabel}
                                >
                                  {dataWithMoyenne.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.moyenneLivresParJour >= moyenneGlobale ? '#10b981' : '#f59e0b'} 
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="mt-4 flex gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-green-500 rounded"></div>
                                <span className="text-gray-600">Au-dessus de la moyenne</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-amber-500 rounded"></div>
                                <span className="text-gray-600">En-dessous de la moyenne</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Moyenne PDL par jour par chauffeur */}
                      {detailData.chauffeurs && detailData.chauffeurs.length > 0 && (() => {
                        const dataWithMoyennePDL = detailData.chauffeurs
                          .map(c => ({
                            ...c,
                            moyennePDLPecParJour: c.nbTournees > 0 ? Math.round(c.pdlPec / c.nbTournees) : 0,
                            moyennePDLLivresParJour: c.nbTournees > 0 ? Math.round(c.pdlLivres / c.nbTournees) : 0,
                            joursTravailes: c.nbTournees || 0
                          }))
                          .sort((a, b) => b.moyennePDLPecParJour - a.moyennePDLPecParJour);
                        
                        const moyenneGlobalePDLPec = dataWithMoyennePDL.reduce((sum, c) => sum + c.moyennePDLPecParJour, 0) / dataWithMoyennePDL.length;
                        const moyenneGlobalePDLLivres = dataWithMoyennePDL.reduce((sum, c) => sum + c.moyennePDLLivresParJour, 0) / dataWithMoyennePDL.length;
                        
                        return (
                          <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                              <MapPin className="w-5 h-5 text-purple-600" />
                              Moyenne PDL par jour travaillé
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">
                              Moyenne globale : <span className="font-bold text-blue-600">{Math.round(moyenneGlobalePDLPec)} PDL PEC/jour</span>
                              {' • '}
                              <span className="font-bold text-green-600">{Math.round(moyenneGlobalePDLLivres)} PDL Livrés/jour</span>
                            </p>
                            <ResponsiveContainer width="100%" height={Math.max(400, dataWithMoyennePDL.length * 60)} minWidth={0} minHeight={0}>
                              <BarChart 
                                data={dataWithMoyennePDL}
                                layout="vertical"
                                margin={{ top: 20, right: 30, left: 150, bottom: 20 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6b7280" />
                                <YAxis 
                                  type="category" 
                                  dataKey="nom" 
                                  tick={{ fontSize: 11 }} 
                                  stroke="#6b7280"
                                  width={140}
                                />
                                <Tooltip 
                                  content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                      const entry = payload[0].payload;
                                      return (
                                        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
                                          <p className="font-semibold text-gray-900 mb-2">{label}</p>
                                          <p className="text-sm text-blue-600">
                                            <span className="font-bold">{entry.moyennePDLPecParJour}</span> PDL PEC/jour
                                            <span className="text-gray-400 ml-2">({entry.pdlPec.toLocaleString()} total)</span>
                                          </p>
                                          <p className="text-sm text-green-600">
                                            <span className="font-bold">{entry.moyennePDLLivresParJour}</span> PDL Livrés/jour
                                            <span className="text-gray-400 ml-2">({entry.pdlLivres.toLocaleString()} total)</span>
                                          </p>
                                          <p className="text-sm text-gray-500 mt-1">
                                            {entry.joursTravailes} jours travaillés
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Legend />
                                <Bar 
                                  dataKey="moyennePDLPecParJour" 
                                  name="Moyenne PDL PEC/jour" 
                                  fill="#3b82f6" 
                                  radius={[0, 4, 4, 0]}
                                />
                                <Bar 
                                  dataKey="moyennePDLLivresParJour" 
                                  name="Moyenne PDL Livrés/jour" 
                                  fill="#10b981" 
                                  radius={[0, 4, 4, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="mt-4 flex gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                                <span className="text-gray-600">PDL PEC</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-green-500 rounded"></div>
                                <span className="text-gray-600">PDL Livrés</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* VUE TABLEAU */
                    <div className="space-y-6">
                      {/* Tableau des tournées */}
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-indigo-600" />
                          Statistiques par tournée ({detailData.tournees?.length || 0} tournées sur la période)
                        </h3>
                        <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tournée</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Jours</th>
                                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Chauffeurs</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL PEC</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-green-600 uppercase">PDL Liv</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-indigo-600 uppercase">Colis PEC</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-teal-600 uppercase">Colis Liv</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-purple-600 uppercase bg-purple-50">Moy. Colis PEC/j</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-emerald-600 uppercase bg-emerald-50">Moy. Colis Liv/j</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-600 uppercase bg-cyan-50">Moy. PDL PEC/j</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-lime-600 uppercase bg-lime-50">Moy. PDL Liv/j</th>
                                  <th className="px-3 py-3 text-center text-xs font-semibold text-orange-600 uppercase">Taux</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {(detailData.tournees || []).length === 0 ? (
                                  <tr>
                                    <td colSpan="12" className="px-4 py-8 text-center text-gray-500">
                                      Aucune tournée pour cette période
                                    </td>
                                  </tr>
                                ) : (
                                  [...(detailData.tournees || [])]
                                    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
                                    .map((t, idx) => {
                                    const taux = t.colisPec > 0 
                                      ? ((t.colisLivres / t.colisPec) * 100).toFixed(1) 
                                      : t.pdlPec > 0 
                                        ? ((t.pdlLivres / t.pdlPec) * 100).toFixed(1)
                                        : 0;
                                    const nbJours = t.nbJours || 1;
                                    const moyColisPec = Math.round((t.colisPec || 0) / nbJours);
                                    const moyColisLiv = Math.round((t.colisLivres || 0) / nbJours);
                                    const moyPdlPec = Math.round((t.pdlPec || 0) / nbJours);
                                    const moyPdlLiv = Math.round((t.pdlLivres || 0) / nbJours);
                                    return (
                                      <tr key={idx} className="hover:bg-white">
                                        <td className="px-3 py-3">
                                          <button
                                            onClick={() => setSelectedTournee(t)}
                                            className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                                          >
                                            {t.nom || '-'}
                                          </button>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                                            {t.nbJours || 0}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3">
                                          <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4 text-gray-400" />
                                            <span className="text-gray-700 text-xs">{t.chauffeurs || '-'}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-blue-600">{(t.pdlPec || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-green-600">{(t.pdlLivres || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-indigo-600">{(t.colisPec || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-teal-600">{(t.colisLivres || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-purple-600 bg-purple-50">{moyColisPec}</td>
                                        <td className="px-3 py-3 text-center font-bold text-emerald-600 bg-emerald-50">{moyColisLiv}</td>
                                        <td className="px-3 py-3 text-center font-bold text-cyan-600 bg-cyan-50">{moyPdlPec}</td>
                                        <td className="px-3 py-3 text-center font-bold text-lime-600 bg-lime-50">{moyPdlLiv}</td>
                                        <td className="px-3 py-3 text-center">
                                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTauxBgColor(taux)}`}>
                                            {taux}%
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                              {(detailData.tournees || []).length > 0 && (
                                <tfoot className="bg-gray-200">
                                  <tr className="font-bold">
                                    <td className="px-3 py-3 text-gray-900">TOTAL</td>
                                    <td className="px-3 py-3 text-center text-gray-700">
                                      {(detailData.tournees || []).reduce((sum, t) => sum + (t.nbJours || 0), 0)}
                                    </td>
                                    <td className="px-3 py-3 text-gray-700">-</td>
                                    <td className="px-3 py-3 text-center text-blue-600">
                                      {(detailData.tournees || []).reduce((sum, t) => sum + (t.pdlPec || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-green-600">
                                      {(detailData.tournees || []).reduce((sum, t) => sum + (t.pdlLivres || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-indigo-600">
                                      {(detailData.tournees || []).reduce((sum, t) => sum + (t.colisPec || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-teal-600">
                                      {(detailData.tournees || []).reduce((sum, t) => sum + (t.colisLivres || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-purple-600 bg-purple-100">
                                      {(() => {
                                        const tourneesActives = (detailData.tournees || []).filter(t => (t.colisPec || 0) > 0);
                                        const totalJours = tourneesActives.reduce((sum, t) => sum + (t.nbJours || 0), 0);
                                        const totalColisPec = tourneesActives.reduce((sum, t) => sum + (t.colisPec || 0), 0);
                                        return totalJours > 0 ? Math.round(totalColisPec / totalJours) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-emerald-600 bg-emerald-100">
                                      {(() => {
                                        const tourneesActives = (detailData.tournees || []).filter(t => (t.colisLivres || 0) > 0);
                                        const totalJours = tourneesActives.reduce((sum, t) => sum + (t.nbJours || 0), 0);
                                        const totalColisLiv = tourneesActives.reduce((sum, t) => sum + (t.colisLivres || 0), 0);
                                        return totalJours > 0 ? Math.round(totalColisLiv / totalJours) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-cyan-600 bg-cyan-100">
                                      {(() => {
                                        const tourneesActives = (detailData.tournees || []).filter(t => (t.pdlPec || 0) > 0);
                                        const totalJours = tourneesActives.reduce((sum, t) => sum + (t.nbJours || 0), 0);
                                        const totalPdlPec = tourneesActives.reduce((sum, t) => sum + (t.pdlPec || 0), 0);
                                        return totalJours > 0 ? Math.round(totalPdlPec / totalJours) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-lime-600 bg-lime-100">
                                      {(() => {
                                        const tourneesActives = (detailData.tournees || []).filter(t => (t.pdlLivres || 0) > 0);
                                        const totalJours = tourneesActives.reduce((sum, t) => sum + (t.nbJours || 0), 0);
                                        const totalPdlLiv = tourneesActives.reduce((sum, t) => sum + (t.pdlLivres || 0), 0);
                                        return totalJours > 0 ? Math.round(totalPdlLiv / totalJours) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {(() => {
                                        const totalColisPec = (detailData.tournees || []).reduce((sum, t) => sum + (t.colisPec || 0), 0);
                                        const totalColisLiv = (detailData.tournees || []).reduce((sum, t) => sum + (t.colisLivres || 0), 0);
                                        const totalPdlPec = (detailData.tournees || []).reduce((sum, t) => sum + (t.pdlPec || 0), 0);
                                        const totalPdlLiv = (detailData.tournees || []).reduce((sum, t) => sum + (t.pdlLivres || 0), 0);
                                        const taux = totalColisPec > 0 
                                          ? ((totalColisLiv / totalColisPec) * 100).toFixed(1)
                                          : totalPdlPec > 0
                                            ? ((totalPdlLiv / totalPdlPec) * 100).toFixed(1)
                                            : 0;
                                        return (
                                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTauxBgColor(taux)}`}>
                                            {taux}%
                                          </span>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Tableau des chauffeurs avec moyennes */}
                      {detailData.chauffeurs && detailData.chauffeurs.length > 0 && (
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            Statistiques par chauffeur ({detailData.chauffeurs.length} chauffeurs)
                          </h3>
                          <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Chauffeur</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Jours</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL PEC</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-green-600 uppercase">PDL Liv</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-indigo-600 uppercase">Colis PEC</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-teal-600 uppercase">Colis Liv</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-purple-600 uppercase bg-purple-50">Moy. Colis PEC/j</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-emerald-600 uppercase bg-emerald-50">Moy. Colis Liv/j</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-600 uppercase bg-cyan-50">Moy. PDL PEC/j</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-lime-600 uppercase bg-lime-50">Moy. PDL Liv/j</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-orange-600 uppercase">Taux</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {detailData.chauffeurs.map((c, idx) => {
                                    const taux = c.colisPec > 0 
                                      ? ((c.colisLivres / c.colisPec) * 100).toFixed(1) 
                                      : c.pdlPec > 0 
                                        ? ((c.pdlLivres / c.pdlPec) * 100).toFixed(1)
                                        : 0;
                                    // Calculer les moyennes en excluant les jours avec 0
                                    const parJour = c.parJour || [];
                                    const joursColisPec = parJour.filter(j => (j.colisPec || 0) > 0).length;
                                    const joursColisLiv = parJour.filter(j => (j.colisLivres || 0) > 0).length;
                                    const joursPdlPec = parJour.filter(j => (j.pdlPec || 0) > 0).length;
                                    const joursPdlLiv = parJour.filter(j => (j.pdlLivres || 0) > 0).length;
                                    const moyColisPec = joursColisPec > 0 ? Math.round(c.colisPec / joursColisPec) : 0;
                                    const moyColisLiv = joursColisLiv > 0 ? Math.round(c.colisLivres / joursColisLiv) : 0;
                                    const moyPdlPec = joursPdlPec > 0 ? Math.round(c.pdlPec / joursPdlPec) : 0;
                                    const moyPdlLiv = joursPdlLiv > 0 ? Math.round(c.pdlLivres / joursPdlLiv) : 0;
                                    return (
                                      <tr key={idx} className="hover:bg-white">
                                        <td className="px-3 py-3">
                                          <button
                                            onClick={() => setSelectedChauffeurDetail(c)}
                                            className="flex items-center gap-2 hover:bg-indigo-50 rounded-lg p-1 -m-1 transition-colors"
                                          >
                                            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                                              <Users className="w-3 h-3 text-indigo-600" />
                                            </div>
                                            <span className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">
                                              {c.nom || 'Inconnu'}
                                            </span>
                                          </button>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs font-bold">
                                            {c.nbTournees || 0}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-blue-600">{(c.pdlPec || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-green-600">{(c.pdlLivres || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-indigo-600">{(c.colisPec || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-teal-600">{(c.colisLivres || 0).toLocaleString()}</td>
                                        <td className="px-3 py-3 text-center font-bold text-purple-600 bg-purple-50">{moyColisPec}</td>
                                        <td className="px-3 py-3 text-center font-bold text-emerald-600 bg-emerald-50">{moyColisLiv}</td>
                                        <td className="px-3 py-3 text-center font-bold text-cyan-600 bg-cyan-50">{moyPdlPec}</td>
                                        <td className="px-3 py-3 text-center font-bold text-lime-600 bg-lime-50">{moyPdlLiv}</td>
                                        <td className="px-3 py-3 text-center">
                                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTauxBgColor(taux)}`}>
                                            {taux}%
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="bg-gray-200">
                                  <tr className="font-bold">
                                    <td className="px-3 py-3 text-gray-900">TOTAL</td>
                                    <td className="px-3 py-3 text-center text-gray-700">
                                      {detailData.chauffeurs.reduce((sum, c) => sum + (c.nbTournees || 0), 0)}
                                    </td>
                                    <td className="px-3 py-3 text-center text-blue-600">
                                      {detailData.chauffeurs.reduce((sum, c) => sum + (c.pdlPec || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-green-600">
                                      {detailData.chauffeurs.reduce((sum, c) => sum + (c.pdlLivres || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-indigo-600">
                                      {detailData.chauffeurs.reduce((sum, c) => sum + (c.colisPec || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-teal-600">
                                      {detailData.chauffeurs.reduce((sum, c) => sum + (c.colisLivres || 0), 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-purple-600 bg-purple-100">
                                      {(() => {
                                        let totalJoursActifs = 0;
                                        let totalColisPec = 0;
                                        detailData.chauffeurs.forEach(c => {
                                          const parJour = c.parJour || [];
                                          const joursActifs = parJour.filter(j => (j.colisPec || 0) > 0).length;
                                          totalJoursActifs += joursActifs;
                                          totalColisPec += c.colisPec || 0;
                                        });
                                        return totalJoursActifs > 0 ? Math.round(totalColisPec / totalJoursActifs) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-emerald-600 bg-emerald-100">
                                      {(() => {
                                        let totalJoursActifs = 0;
                                        let totalColisLiv = 0;
                                        detailData.chauffeurs.forEach(c => {
                                          const parJour = c.parJour || [];
                                          const joursActifs = parJour.filter(j => (j.colisLivres || 0) > 0).length;
                                          totalJoursActifs += joursActifs;
                                          totalColisLiv += c.colisLivres || 0;
                                        });
                                        return totalJoursActifs > 0 ? Math.round(totalColisLiv / totalJoursActifs) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-cyan-600 bg-cyan-100">
                                      {(() => {
                                        let totalJoursActifs = 0;
                                        let totalPdlPec = 0;
                                        detailData.chauffeurs.forEach(c => {
                                          const parJour = c.parJour || [];
                                          const joursActifs = parJour.filter(j => (j.pdlPec || 0) > 0).length;
                                          totalJoursActifs += joursActifs;
                                          totalPdlPec += c.pdlPec || 0;
                                        });
                                        return totalJoursActifs > 0 ? Math.round(totalPdlPec / totalJoursActifs) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center text-lime-600 bg-lime-100">
                                      {(() => {
                                        let totalJoursActifs = 0;
                                        let totalPdlLiv = 0;
                                        detailData.chauffeurs.forEach(c => {
                                          const parJour = c.parJour || [];
                                          const joursActifs = parJour.filter(j => (j.pdlLivres || 0) > 0).length;
                                          totalJoursActifs += joursActifs;
                                          totalPdlLiv += c.pdlLivres || 0;
                                        });
                                        return totalJoursActifs > 0 ? Math.round(totalPdlLiv / totalJoursActifs) : 0;
                                      })()}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {(() => {
                                        const totalColisPec = detailData.chauffeurs.reduce((sum, c) => sum + (c.colisPec || 0), 0);
                                        const totalColisLiv = detailData.chauffeurs.reduce((sum, c) => sum + (c.colisLivres || 0), 0);
                                        const totalPdlPec = detailData.chauffeurs.reduce((sum, c) => sum + (c.pdlPec || 0), 0);
                                        const totalPdlLiv = detailData.chauffeurs.reduce((sum, c) => sum + (c.pdlLivres || 0), 0);
                                        const taux = totalColisPec > 0 
                                          ? ((totalColisLiv / totalColisPec) * 100).toFixed(1)
                                          : totalPdlPec > 0
                                            ? ((totalPdlLiv / totalPdlPec) * 100).toFixed(1)
                                            : 0;
                                        return (
                                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTauxBgColor(taux)}`}>
                                            {taux}%
                                          </span>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto mb-4" />
                  <p className="text-gray-500">Impossible de charger le détail</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail tournée */}
      {selectedTournee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedTournee.nom}</h2>
                  <p className="text-indigo-200 text-sm">Détail de la tournée sur la période</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTournee(null)}
                className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Résumé */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-500">Jours</p>
                  <p className="text-2xl font-bold text-gray-900">{selectedTournee.nbJours || 0}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-blue-600">PDL PEC</p>
                  <p className="text-2xl font-bold text-blue-700">{(selectedTournee.pdlPec || 0).toLocaleString()}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-600">PDL Livrés</p>
                  <p className="text-2xl font-bold text-green-700">{(selectedTournee.pdlLivres || 0).toLocaleString()}</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-indigo-600">Colis PEC</p>
                  <p className="text-2xl font-bold text-indigo-700">{(selectedTournee.colisPec || 0).toLocaleString()}</p>
                </div>
              </div>

              {/* Chauffeurs de la tournée */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Chauffeurs ayant effectué cette tournée
                </h3>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-700">{selectedTournee.chauffeurs || 'Aucun chauffeur'}</p>
                </div>
              </div>

              {/* Évolution jour par jour */}
              {detailData?.parTournee && (() => {
                const tourneeData = detailData.parTournee.find(t => t.nom === selectedTournee.nom);
                if (!tourneeData || !tourneeData.data || tourneeData.data.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      Pas de données jour par jour disponibles
                    </div>
                  );
                }
                return (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                      Évolution jour par jour
                    </h3>
                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL PEC</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">PDL Liv</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-600 uppercase">Colis PEC</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-teal-600 uppercase">Colis Liv</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-orange-600 uppercase">Taux</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {tourneeData.data.map((jour, idx) => {
                            const taux = jour.colisPec > 0 
                              ? ((jour.colisLivres / jour.colisPec) * 100).toFixed(1)
                              : jour.pdlPec > 0
                                ? ((jour.pdlLivres / jour.pdlPec) * 100).toFixed(1)
                                : 0;
                            const dateObj = new Date(jour.date);
                            const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dateObj.getDay()];
                            const dateFormatted = `${jourSemaine} ${dateObj.toLocaleDateString('fr-FR')}`;
                            return (
                              <tr key={idx} className="hover:bg-white">
                                <td className="px-4 py-3 font-medium text-gray-900">{dateFormatted}</td>
                                <td className="px-4 py-3 text-center font-bold text-blue-600">{(jour.pdlPec || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center font-bold text-green-600">{(jour.pdlLivres || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center font-bold text-indigo-600">{(jour.colisPec || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center font-bold text-teal-600">{(jour.colisLivres || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTauxBgColor(taux)}`}>
                                    {taux}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
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

      {/* Modal détail chauffeur */}
      {selectedChauffeurDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-teal-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedChauffeurDetail.nom}</h2>
                  <p className="text-green-200 text-sm">Détail du chauffeur sur la période</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedChauffeurDetail(null)}
                className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Résumé */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-500">Jours travaillés</p>
                  <p className="text-2xl font-bold text-gray-900">{selectedChauffeurDetail.nbTournees || 0}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-blue-600">PDL PEC</p>
                  <p className="text-2xl font-bold text-blue-700">{(selectedChauffeurDetail.pdlPec || 0).toLocaleString()}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-600">PDL Livrés</p>
                  <p className="text-2xl font-bold text-green-700">{(selectedChauffeurDetail.pdlLivres || 0).toLocaleString()}</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-indigo-600">Colis PEC</p>
                  <p className="text-2xl font-bold text-indigo-700">{(selectedChauffeurDetail.colisPec || 0).toLocaleString()}</p>
                </div>
                <div className="bg-teal-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-teal-600">Colis Livrés</p>
                  <p className="text-2xl font-bold text-teal-700">{(selectedChauffeurDetail.colisLivres || 0).toLocaleString()}</p>
                </div>
              </div>

              {/* Moyennes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-purple-50 rounded-xl p-4 text-center border-2 border-purple-200">
                  <p className="text-sm text-purple-600">Moy. Colis PEC/jour</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {(() => {
                      const parJour = selectedChauffeurDetail.parJour || [];
                      const joursActifs = parJour.filter(j => (j.colisPec || 0) > 0).length;
                      return joursActifs > 0 ? Math.round(selectedChauffeurDetail.colisPec / joursActifs) : 0;
                    })()}
                  </p>
                  <p className="text-xs text-purple-400 mt-1">
                    ({(selectedChauffeurDetail.parJour || []).filter(j => (j.colisPec || 0) > 0).length} jours actifs)
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 text-center border-2 border-emerald-200">
                  <p className="text-sm text-emerald-600">Moy. Colis Liv/jour</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {(() => {
                      const parJour = selectedChauffeurDetail.parJour || [];
                      const joursActifs = parJour.filter(j => (j.colisLivres || 0) > 0).length;
                      return joursActifs > 0 ? Math.round(selectedChauffeurDetail.colisLivres / joursActifs) : 0;
                    })()}
                  </p>
                  <p className="text-xs text-emerald-400 mt-1">
                    ({(selectedChauffeurDetail.parJour || []).filter(j => (j.colisLivres || 0) > 0).length} jours actifs)
                  </p>
                </div>
                <div className="bg-cyan-50 rounded-xl p-4 text-center border-2 border-cyan-200">
                  <p className="text-sm text-cyan-600">Moy. PDL PEC/jour</p>
                  <p className="text-2xl font-bold text-cyan-700">
                    {(() => {
                      const parJour = selectedChauffeurDetail.parJour || [];
                      const joursActifs = parJour.filter(j => (j.pdlPec || 0) > 0).length;
                      return joursActifs > 0 ? Math.round(selectedChauffeurDetail.pdlPec / joursActifs) : 0;
                    })()}
                  </p>
                  <p className="text-xs text-cyan-400 mt-1">
                    ({(selectedChauffeurDetail.parJour || []).filter(j => (j.pdlPec || 0) > 0).length} jours actifs)
                  </p>
                </div>
                <div className="bg-lime-50 rounded-xl p-4 text-center border-2 border-lime-200">
                  <p className="text-sm text-lime-600">Moy. PDL Liv/jour</p>
                  <p className="text-2xl font-bold text-lime-700">
                    {(() => {
                      const parJour = selectedChauffeurDetail.parJour || [];
                      const joursActifs = parJour.filter(j => (j.pdlLivres || 0) > 0).length;
                      return joursActifs > 0 ? Math.round(selectedChauffeurDetail.pdlLivres / joursActifs) : 0;
                    })()}
                  </p>
                  <p className="text-xs text-lime-400 mt-1">
                    ({(selectedChauffeurDetail.parJour || []).filter(j => (j.pdlLivres || 0) > 0).length} jours actifs)
                  </p>
                </div>
              </div>

              {/* Taux de livraison */}
              <div className="mb-6">
                <div className="bg-orange-50 rounded-xl p-4 text-center border-2 border-orange-200">
                  <p className="text-sm text-orange-600">Taux de livraison</p>
                  <p className="text-3xl font-bold text-orange-700">
                    {(() => {
                      const taux = selectedChauffeurDetail.colisPec > 0 
                        ? ((selectedChauffeurDetail.colisLivres / selectedChauffeurDetail.colisPec) * 100).toFixed(1)
                        : selectedChauffeurDetail.pdlPec > 0
                          ? ((selectedChauffeurDetail.pdlLivres / selectedChauffeurDetail.pdlPec) * 100).toFixed(1)
                          : 0;
                      return `${taux}%`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Détail jour par jour */}
              {selectedChauffeurDetail.parJour && selectedChauffeurDetail.parJour.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-600" />
                    Détail jour par jour ({selectedChauffeurDetail.parJour.length} jours)
                  </h3>
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tournée</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL PEC</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">PDL Liv</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-600 uppercase">Colis PEC</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-teal-600 uppercase">Colis Liv</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-orange-600 uppercase">Taux</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedChauffeurDetail.parJour.map((jour, idx) => {
                          const taux = jour.colisPec > 0 
                            ? ((jour.colisLivres / jour.colisPec) * 100).toFixed(1)
                            : jour.pdlPec > 0
                              ? ((jour.pdlLivres / jour.pdlPec) * 100).toFixed(1)
                              : 0;
                          const dateObj = new Date(jour.date);
                          const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dateObj.getDay()];
                          const dateFormatted = `${jourSemaine} ${dateObj.toLocaleDateString('fr-FR')}`;
                          return (
                            <tr key={idx} className="hover:bg-white">
                              <td className="px-4 py-3 font-medium text-gray-900">{dateFormatted}</td>
                              <td className="px-4 py-3 text-gray-700 text-sm">{jour.tournee || '-'}</td>
                              <td className="px-4 py-3 text-center font-bold text-blue-600">{(jour.pdlPec || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center font-bold text-green-600">{(jour.pdlLivres || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center font-bold text-indigo-600">{(jour.colisPec || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center font-bold text-teal-600">{(jour.colisLivres || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${getTauxBgColor(taux)}`}>
                                  {taux}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tournées effectuées par ce chauffeur */}
              {selectedChauffeurDetail.tournees && selectedChauffeurDetail.tournees.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-green-600" />
                    Tournées effectuées ({selectedChauffeurDetail.tournees.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedChauffeurDetail.tournees.map((tournee, idx) => (
                      <span key={idx} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                        {tournee}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
