import { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar,
  RefreshCw,
  Building2,
  Euro,
  FileText,
  Calculator,
  Download,
  FileSpreadsheet,
  Package,
  MapPin,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  Trash2,
  Minus,
  Eye
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import API_BASE from '../../config/api';
// Configuration des prestataires et leurs chauffeurs
const PRESTATAIRES = {
  'GDS 66': {
    nom: 'GDS 66',
    chauffeurs: ['Gael MONTAG', 'Gaël MONTAG', 'MONTAG Gael', 'MONTAG Gaël', 'Adrien PELLETIER', 'PELLETIER Adrien'],
    prefixe: 'GDS66',
    prixDefautPDL: 0,
    prixDefautColis: 0
  },
  'NEXHAUL': {
    nom: 'NEXHAUL',
    chauffeurs: ['Corentin ADELL', 'ADELL Corentin'],
    prefixe: null,
    prixDefautPDL: 0,
    prixDefautColis: 0
  },
  'STEP': {
    nom: 'STEP',
    chauffeurs: [],
    prefixe: 'STEP64',
    prixDefautPDL: 0,
    prixDefautColis: 0
  }
};

export default function Prefacturation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [expandedPrestataire, setExpandedPrestataire] = useState(null);
  const [expandedChauffeur, setExpandedChauffeur] = useState(null);
  
  // Prix par prestataire
  const [prixConfig, setPrixConfig] = useState({
    'GDS 66': { prixPDL: 0, prixColis: 0, prixJour: 0 },
    'NEXHAUL': { prixPDL: 0, prixColis: 0, prixJour: 0 },
    'STEP': { prixPDL: 0, prixColis: 0, prixJour: 0 }
  });
  
  // Lignes de déduction par prestataire
  const [deductions, setDeductions] = useState({
    'GDS 66': [],
    'NEXHAUL': [],
    'STEP': []
  });
  
  // Période par défaut : mois en cours
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateDebut, setDateDebut] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0]);

  // Normaliser un nom pour la comparaison (enlever accents, espaces multiples, etc.)
  const normaliserNom = (nom) => {
    if (!nom) return '';
    return nom
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
      .replace(/\s+/g, ' ') // Normaliser les espaces
      .trim();
  };

  // Vérifier si un chauffeur appartient à un prestataire
  const getChauffeurPrestataire = (chauffeurNom) => {
    if (!chauffeurNom) return null;
    
    const nomNormalise = normaliserNom(chauffeurNom);
    
    for (const [prestataireNom, config] of Object.entries(PRESTATAIRES)) {
      // Vérifier le préfixe
      if (config.prefixe && chauffeurNom.toUpperCase().startsWith(config.prefixe.toUpperCase())) {
        return prestataireNom;
      }
      // Vérifier la liste des chauffeurs (comparaison flexible)
      for (const chauffeurConfig of config.chauffeurs) {
        const configNormalise = normaliserNom(chauffeurConfig);
        // Correspondance exacte normalisée ou contient le nom
        if (nomNormalise === configNormalise || 
            nomNormalise.includes(configNormalise) || 
            configNormalise.includes(nomNormalise)) {
          return prestataireNom;
        }
      }
    }
    return null;
  };

  // Charger les données
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Récupérer tous les chargeurs
      const chargeursRes = await fetch(
        `${API_BASE}/api/direction/statistiques-chargeurs?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`
      );
      
      if (!chargeursRes.ok) throw new Error('Erreur chargement chargeurs');
      const chargeursResponse = await chargeursRes.json();
      
      // L'API retourne { chargeurs: [...] }
      const chargeursData = chargeursResponse.chargeurs || [];
      
      console.log('Chargeurs récupérés:', chargeursData.length);
      
      // Pour chaque chargeur, récupérer le détail des chauffeurs
      const prestatairesStats = {};
      
      // Initialiser les stats des prestataires
      Object.keys(PRESTATAIRES).forEach(p => {
        prestatairesStats[p] = {
          nom: p,
          chauffeurs: {},
          totalPdlLivres: 0,
          totalColisLivres: 0,
          totalColisLivresDomicile: 0,
          totalColisLivresRelais: 0,
          totalJours: 0
        };
      });
      
      // Parcourir chaque chargeur pour récupérer les stats des chauffeurs
      for (const chargeur of chargeursData) {
        const detailRes = await fetch(
          `${API_BASE}/api/direction/detail-chargeur/${encodeURIComponent(chargeur.nom)}?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`
        );
        
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          
          // Log TOUS les chauffeurs pour trouver le nom exact
          (detailData.chauffeurs || []).forEach(ch => {
            // Chercher les chauffeurs qui contiennent "ADELL" ou "GDS" ou "MONTAG" ou "PELLETIER"
            const nomUpper = (ch.nom || '').toUpperCase();
            if (nomUpper.includes('ADELL') || nomUpper.includes('GDS') || 
                nomUpper.includes('MONTAG') || nomUpper.includes('PELLETIER')) {
              console.log(`[Prefacturation] Chauffeur potentiel: "${ch.nom}" (PDL: ${ch.pdlLivres}, Colis: ${ch.colisLivres})`);
            }
            const p = getChauffeurPrestataire(ch.nom);
            if (p) {
              console.log(`[Prefacturation] Chauffeur MATCHÉ: "${ch.nom}" -> ${p}`);
            }
          });
          
          // Analyser chaque chauffeur
          (detailData.chauffeurs || []).forEach(chauffeur => {
            const prestataire = getChauffeurPrestataire(chauffeur.nom);
            
            if (prestataire) {
              const stats = prestatairesStats[prestataire];
              
              if (!stats.chauffeurs[chauffeur.nom]) {
                stats.chauffeurs[chauffeur.nom] = {
                  nom: chauffeur.nom,
                  pdlLivres: 0,
                  colisLivres: 0,
                  colisLivresDomicile: 0,
                  colisLivresRelais: 0,
                  nbJours: 0,
                  chargeurs: new Set(),
                  detailParJour: []
                };
              }
              
              const ch = stats.chauffeurs[chauffeur.nom];
              ch.pdlLivres += chauffeur.pdlLivres || 0;
              ch.colisLivres += chauffeur.colisLivres || 0;
              ch.colisLivresDomicile += chauffeur.colisLivresDomicile || 0;
              ch.colisLivresRelais += chauffeur.colisLivresRelais || 0;
              ch.nbJours += chauffeur.nbTournees || 0;
              ch.chargeurs.add(chargeur.nom);
              
              // Ajouter le détail par jour
              (chauffeur.parJour || []).forEach(jour => {
                ch.detailParJour.push({
                  ...jour,
                  chargeur: chargeur.nom
                });
              });
              
              stats.totalPdlLivres += chauffeur.pdlLivres || 0;
              stats.totalColisLivres += chauffeur.colisLivres || 0;
              stats.totalColisLivresDomicile += chauffeur.colisLivresDomicile || 0;
              stats.totalColisLivresRelais += chauffeur.colisLivresRelais || 0;
            }
          });
        }
      }
      
      // Convertir les chauffeurs en tableau et les chargeurs en string
      Object.keys(prestatairesStats).forEach(p => {
        const chauffeursList = Object.values(prestatairesStats[p].chauffeurs);
        chauffeursList.forEach(ch => {
          ch.chargeurs = Array.from(ch.chargeurs).join(', ');
        });
        prestatairesStats[p].chauffeurs = chauffeursList;
        prestatairesStats[p].totalJours = chauffeursList.reduce((sum, c) => sum + c.nbJours, 0);
      });
      
      setData(prestatairesStats);
      
    } catch (err) {
      console.error('Erreur:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Calculer le montant pour un prestataire
  const calculerMontant = (prestataire) => {
    if (!data || !data[prestataire]) return { montantPDL: 0, montantColis: 0, montantJour: 0, totalDeductions: 0, total: 0 };
    
    const stats = data[prestataire];
    const prix = prixConfig[prestataire] || { prixPDL: 0, prixColis: 0, prixJour: 0 };
    const prestataireDeductions = deductions[prestataire] || [];
    
    const montantPDL = stats.totalPdlLivres * prix.prixPDL;
    const montantColis = stats.totalColisLivres * prix.prixColis;
    const montantJour = stats.totalJours * prix.prixJour;
    const sousTotal = montantPDL + montantColis + montantJour;
    const totalDeductions = prestataireDeductions.reduce((sum, d) => sum + (parseFloat(d.montant) || 0), 0);
    
    return {
      montantPDL,
      montantColis,
      montantJour,
      sousTotal,
      totalDeductions,
      total: sousTotal - totalDeductions
    };
  };
  
  // Ajouter une ligne de déduction
  const ajouterDeduction = (prestataire) => {
    setDeductions(prev => ({
      ...prev,
      [prestataire]: [...(prev[prestataire] || []), { id: Date.now(), libelle: '', montant: 0 }]
    }));
  };
  
  // Modifier une ligne de déduction
  const modifierDeduction = (prestataire, id, field, value) => {
    setDeductions(prev => ({
      ...prev,
      [prestataire]: (prev[prestataire] || []).map(d => 
        d.id === id ? { ...d, [field]: value } : d
      )
    }));
  };
  
  // Supprimer une ligne de déduction
  const supprimerDeduction = (prestataire, id) => {
    setDeductions(prev => ({
      ...prev,
      [prestataire]: (prev[prestataire] || []).filter(d => d.id !== id)
    }));
  };

  // Mettre à jour le prix
  const updatePrix = (prestataire, type, value) => {
    setPrixConfig(prev => ({
      ...prev,
      [prestataire]: {
        ...prev[prestataire],
        [type]: parseFloat(value) || 0
      }
    }));
  };

  // Export Excel
  const exportToExcel = (prestataire) => {
    if (!data || !data[prestataire]) return;
    
    const stats = data[prestataire];
    const prix = prixConfig[prestataire];
    const montants = calculerMontant(prestataire);
    const workbook = XLSX.utils.book_new();
    
    // Feuille résumé (utiliser aoa_to_sheet pour éviter les clés dupliquées)
    const prestataireDeductions = deductions[prestataire] || [];
    const resumeData = [
      ['Prestataire', prestataire],
      ['Période', `Du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`],
      [],
      ['Description', 'Quantité', 'Prix unitaire', 'Montant'],
      ['PDL Livrés', stats.totalPdlLivres, `${prix.prixPDL.toFixed(2)} €`, `${montants.montantPDL.toFixed(2)} €`],
      ['Colis Livrés', stats.totalColisLivres, `${prix.prixColis.toFixed(2)} €`, `${montants.montantColis.toFixed(2)} €`],
      ['Forfait Journée', stats.totalJours, `${prix.prixJour.toFixed(2)} €`, `${montants.montantJour.toFixed(2)} €`],
      [],
      ['SOUS-TOTAL', '', '', `${montants.sousTotal.toFixed(2)} €`]
    ];
    
    // Ajouter les déductions
    if (prestataireDeductions.length > 0) {
      resumeData.push([]);
      resumeData.push(['--- DÉDUCTIONS ---']);
      prestataireDeductions.forEach(d => {
        resumeData.push([d.libelle || 'Déduction', '', '', `-${parseFloat(d.montant || 0).toFixed(2)} €`]);
      });
      resumeData.push(['Total déductions', '', '', `-${montants.totalDeductions.toFixed(2)} €`]);
    }
    
    resumeData.push([]);
    resumeData.push(['TOTAL NET À PAYER', '', '', `${montants.total.toFixed(2)} €`]);
    
    const wsResume = XLSX.utils.aoa_to_sheet(resumeData);
    XLSX.utils.book_append_sheet(workbook, wsResume, 'Résumé');
    
    // Feuille détail par chauffeur
    const chauffeursData = stats.chauffeurs.map(c => ({
      'Chauffeur': c.nom,
      'Chargeurs': c.chargeurs,
      'Nb Jours': c.nbJours,
      'PDL Livrés': c.pdlLivres,
      'Colis Livrés': c.colisLivres,
      'Montant PDL': `${(c.pdlLivres * prix.prixPDL).toFixed(2)} €`,
      'Montant Colis': `${(c.colisLivres * prix.prixColis).toFixed(2)} €`,
      'Montant Forfait Jour': `${(c.nbJours * prix.prixJour).toFixed(2)} €`,
      'Total': `${((c.pdlLivres * prix.prixPDL) + (c.colisLivres * prix.prixColis) + (c.nbJours * prix.prixJour)).toFixed(2)} €`
    }));
    const wsChauffeurs = XLSX.utils.json_to_sheet(chauffeursData);
    XLSX.utils.book_append_sheet(workbook, wsChauffeurs, 'Détail Chauffeurs');
    
    // Feuille détail jour par jour
    const detailJourData = [];
    stats.chauffeurs.forEach(c => {
      c.detailParJour.forEach(jour => {
        const dateObj = new Date(jour.date);
        const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dateObj.getDay()];
        detailJourData.push({
          'Chauffeur': c.nom,
          'Date': `${jourSemaine} ${dateObj.toLocaleDateString('fr-FR')}`,
          'Chargeur': jour.chargeur || '-',
          'Tournée': jour.tournee || '-',
          'PDL Livrés': jour.pdlLivres || 0,
          'Colis Livrés': jour.colisLivres || 0
        });
      });
    });
    if (detailJourData.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(detailJourData);
      XLSX.utils.book_append_sheet(workbook, wsDetail, 'Détail Jour par Jour');
    }
    
    const fileName = `Prefacturation_${prestataire}_${dateDebut}_${dateFin}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Export PDF
  const exportToPDF = (prestataire) => {
    if (!data || !data[prestataire]) return;
    
    const stats = data[prestataire];
    const prix = prixConfig[prestataire];
    const montants = calculerMontant(prestataire);
    
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;
    
    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229);
    doc.text('PRÉFACTURATION', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 12;
    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55);
    doc.text(prestataire, pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 10;
    doc.setFontSize(11);
    doc.setTextColor(107, 114, 128);
    doc.text(`Période: du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`, pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 15;
    
    // Tableau résumé
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text('Récapitulatif', 14, yPos);
    yPos += 5;
    
    const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    const prestataireDeductions = deductions[prestataire] || [];
    const tableBody = [];
    
    // N'ajouter que les lignes avec prix unitaire > 0
    if (prix.prixPDL > 0) {
      tableBody.push(['Points de Livraison (PDL)', formatNumber(stats.totalPdlLivres), `${prix.prixPDL.toFixed(2)} €`, `${montants.montantPDL.toFixed(2)} €`]);
    }
    if (prix.prixColis > 0) {
      tableBody.push(['Colis Livrés', formatNumber(stats.totalColisLivres), `${prix.prixColis.toFixed(2)} €`, `${montants.montantColis.toFixed(2)} €`]);
      // Ajouter le détail domicile/relais
      if (stats.totalColisLivresDomicile > 0 || stats.totalColisLivresRelais > 0) {
        tableBody.push(['   - dont Domicile', formatNumber(stats.totalColisLivresDomicile || 0), '', '']);
        tableBody.push(['   - dont Point Relais', formatNumber(stats.totalColisLivresRelais || 0), '', '']);
      }
    }
    if (prix.prixJour > 0) {
      tableBody.push(['Forfait Journée', stats.totalJours.toString(), `${prix.prixJour.toFixed(2)} €`, `${montants.montantJour.toFixed(2)} €`]);
    }
    
    tableBody.push(['', '', '', '']);
    tableBody.push(['SOUS-TOTAL', '', '', `${montants.sousTotal.toFixed(2)} €`]);
    
    // Ajouter les déductions au tableau
    if (prestataireDeductions.length > 0) {
      tableBody.push(['', '', '', '']);
      prestataireDeductions.forEach(d => {
        tableBody.push([d.libelle || 'Déduction', '', '', `-${parseFloat(d.montant || 0).toFixed(2)} €`]);
      });
      tableBody.push(['Total déductions', '', '', `-${montants.totalDeductions.toFixed(2)} €`]);
    }
    
    tableBody.push(['', '', '', '']);
    tableBody.push(['TOTAL NET À PAYER', '', '', `${montants.total.toFixed(2)} €`]);
    
    const totalRowIndex = tableBody.length - 1;
    // Trouver l'index du sous-total (la ligne juste avant les déductions ou le total)
    const sousTotalRowIndex = tableBody.findIndex(row => row[0] === 'SOUS-TOTAL');
    
    autoTable(doc, {
      startY: yPos,
      head: [['Description', 'Quantité', 'Prix unitaire', 'Montant']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: 'center', cellWidth: 35 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
      },
      foot: [],
      didParseCell: function(data) {
        if (data.row.index === sousTotalRowIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 244, 246];
        }
        if (data.row.index === totalRowIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [16, 185, 129];
          data.cell.styles.textColor = 255;
        }
        // Colorer les lignes de déduction en rouge
        if (data.row.raw && data.row.raw[3] && data.row.raw[3].startsWith('-')) {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // Tableau détail par chauffeur (filtrer ceux avec 0 PDL et 0 colis)
    const chauffeursAvecActivite = stats.chauffeurs.filter(c => c.pdlLivres > 0 || c.colisLivres > 0);
    
    if (chauffeursAvecActivite.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('Détail par chauffeur', 14, yPos);
      yPos += 5;
    }
    
    const chauffeursTableData = chauffeursAvecActivite.map(c => [
      c.nom,
      c.nbJours,
      formatNumber(c.pdlLivres),
      formatNumber(c.colisLivres),
      `${((c.pdlLivres * prix.prixPDL) + (c.colisLivres * prix.prixColis) + (c.nbJours * prix.prixJour)).toFixed(2)} €`
    ]);
    
    if (chauffeursTableData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Chauffeur', 'Jours', 'PDL Livrés', 'Colis Livrés', 'Total']],
        body: chauffeursTableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { halign: 'center', cellWidth: 25 },
          2: { halign: 'center', cellWidth: 35 },
          3: { halign: 'center', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 30, fontStyle: 'bold' }
        }
      });
    }
    
    // Nouvelle page pour le détail jour par jour (seulement si chauffeurs avec activité)
    if (chauffeursAvecActivite.length > 0) {
      doc.addPage();
      yPos = 20;
      
      doc.setFontSize(16);
      doc.setTextColor(79, 70, 229);
      doc.text('DÉTAIL JOUR PAR JOUR', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;
      
      doc.setFontSize(11);
      doc.setTextColor(107, 114, 128);
      doc.text(`${prestataire} - Période: du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;
    }
    
    // Pour chaque chauffeur avec activité, afficher le détail jour par jour
    chauffeursAvecActivite.forEach((chauffeur, chauffeurIdx) => {
      const detailJours = (chauffeur.detailParJour || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      
      if (detailJours.length === 0) return;
      
      // Vérifier s'il y a assez de place sur la page
      if (yPos > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        yPos = 20;
      }
      
      // Nom du chauffeur
      doc.setFontSize(12);
      doc.setTextColor(79, 70, 229);
      doc.text(`${chauffeur.nom}`, 14, yPos);
      yPos += 5;
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(`${chauffeur.nbJours} jours - ${formatNumber(chauffeur.pdlLivres)} PDL - ${formatNumber(chauffeur.colisLivres)} colis`, 14, yPos);
      yPos += 5;
      
      // Tableau jour par jour
      const jourTableData = detailJours.map(jour => {
        const dateObj = new Date(jour.date);
        const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dateObj.getDay()];
        const montantJour = ((jour.pdlLivres || 0) * prix.prixPDL) + ((jour.colisLivres || 0) * prix.prixColis) + prix.prixJour;
        return [
          `${jourSemaine} ${dateObj.toLocaleDateString('fr-FR')}`,
          jour.chargeur || '-',
          jour.tournee || '-',
          formatNumber(jour.pdlLivres || 0),
          formatNumber(jour.colisLivres || 0),
          `${montantJour.toFixed(2)} €`
        ];
      });
      
      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Chargeur', 'Tournée', 'PDL', 'Colis', 'Montant']],
        body: jourTableData,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 40 },
          2: { cellWidth: 35 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'center', cellWidth: 20 },
          5: { halign: 'right', cellWidth: 25, fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      });
      
      yPos = doc.lastAutoTable.finalY + 10;
    });
    
    // Pied de page
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
    
    const fileName = `Prefacturation_${prestataire}_${dateDebut}_${dateFin}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      {/* En-tête */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Calculator className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Préfacturation Prestataires</h1>
            <p className="text-gray-500">Calcul des montants à facturer aux prestataires externes</p>
          </div>
        </div>

        {/* Filtres période */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Chargement */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <RefreshCw className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-4" />
            <p className="text-gray-500">Chargement des données...</p>
          </div>
        )}

        {/* Cartes prestataires */}
        {!loading && data && (
          <div className="space-y-6">
            {Object.entries(PRESTATAIRES).map(([prestataireNom, config]) => {
              const stats = data[prestataireNom];
              const prix = prixConfig[prestataireNom];
              const montants = calculerMontant(prestataireNom);
              const isExpanded = expandedPrestataire === prestataireNom;
              
              return (
                <div key={prestataireNom} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* En-tête prestataire */}
                  <div 
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedPrestataire(isExpanded ? null : prestataireNom)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">{prestataireNom}</h2>
                          <p className="text-sm text-gray-500">
                            {stats?.chauffeurs?.length || 0} chauffeur(s) • {stats?.totalJours || 0} jours
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        {/* Stats rapides */}
                        <div className="hidden md:flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-sm text-gray-500">PDL Livrés</p>
                            <p className="text-lg font-bold text-blue-600">{(stats?.totalPdlLivres || 0).toLocaleString()}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-500">Colis Livrés</p>
                            <p className="text-lg font-bold text-green-600">{(stats?.totalColisLivres || 0).toLocaleString()}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-teal-500">Domicile</p>
                            <p className="text-sm font-semibold text-teal-600">{(stats?.totalColisLivresDomicile || 0).toLocaleString()}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-orange-500">Relais</p>
                            <p className="text-sm font-semibold text-orange-600">{(stats?.totalColisLivresRelais || 0).toLocaleString()}</p>
                          </div>
                          <div className="text-center px-4 py-2 bg-amber-50 rounded-xl border border-amber-200">
                            <p className="text-sm text-amber-600">Total HT</p>
                            <p className="text-xl font-bold text-amber-700">{montants.total.toFixed(2)} €</p>
                          </div>
                        </div>
                        
                        {isExpanded ? (
                          <ChevronUp className="w-6 h-6 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Détail déplié */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-6 bg-gray-50">
                      {/* Configuration prix */}
                      <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                          <Euro className="w-4 h-4 text-amber-500" />
                          Configuration des prix
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Prix par PDL livré (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={prix.prixPDL}
                              onChange={(e) => updatePrix(prestataireNom, 'prixPDL', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Prix par colis livré (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={prix.prixColis}
                              onChange={(e) => updatePrix(prestataireNom, 'prixColis', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Forfait journée (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={prix.prixJour}
                              onChange={(e) => updatePrix(prestataireNom, 'prixJour', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Récapitulatif */}
                      <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          Récapitulatif facturation
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                          <div className="bg-blue-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-blue-600">PDL Livrés</span>
                              <MapPin className="w-3 h-3 text-blue-400" />
                            </div>
                            <p className="text-xl font-bold text-blue-700">{(stats?.totalPdlLivres || 0).toLocaleString()}</p>
                            <p className="text-xs text-blue-500 mt-1">× {prix.prixPDL.toFixed(2)} € = <span className="font-bold">{montants.montantPDL.toFixed(2)} €</span></p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-green-600">Colis Livrés</span>
                              <Package className="w-3 h-3 text-green-400" />
                            </div>
                            <p className="text-xl font-bold text-green-700">{(stats?.totalColisLivres || 0).toLocaleString()}</p>
                            <p className="text-xs text-green-500 mt-1">× {prix.prixColis.toFixed(2)} € = <span className="font-bold">{montants.montantColis.toFixed(2)} €</span></p>
                          </div>
                          <div className="bg-teal-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-teal-600">Colis Domicile</span>
                              <Package className="w-3 h-3 text-teal-400" />
                            </div>
                            <p className="text-xl font-bold text-teal-700">{(stats?.totalColisLivresDomicile || 0).toLocaleString()}</p>
                            <p className="text-xs text-teal-500 mt-1">(inclus dans colis)</p>
                          </div>
                          <div className="bg-orange-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-orange-600">Colis Relais</span>
                              <Package className="w-3 h-3 text-orange-400" />
                            </div>
                            <p className="text-xl font-bold text-orange-700">{(stats?.totalColisLivresRelais || 0).toLocaleString()}</p>
                            <p className="text-xs text-orange-500 mt-1">(inclus dans colis)</p>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-purple-600">Forfait Journées</span>
                              <Calendar className="w-3 h-3 text-purple-400" />
                            </div>
                            <p className="text-xl font-bold text-purple-700">{stats?.totalJours || 0}</p>
                            <p className="text-xs text-purple-500 mt-1">× {prix.prixJour.toFixed(2)} € = <span className="font-bold">{montants.montantJour.toFixed(2)} €</span></p>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-3 border-2 border-amber-300">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-amber-600 font-semibold">SOUS-TOTAL</span>
                              <Euro className="w-3 h-3 text-amber-500" />
                            </div>
                            <p className="text-xl font-bold text-amber-700">{montants.sousTotal.toFixed(2)} €</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Section Déductions */}
                      <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Minus className="w-4 h-4 text-red-500" />
                            Déductions / Avoirs
                          </h3>
                          <button
                            onClick={() => ajouterDeduction(prestataireNom)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Ajouter une ligne
                          </button>
                        </div>
                        
                        {(deductions[prestataireNom] || []).length === 0 ? (
                          <p className="text-sm text-gray-500 italic text-center py-4">
                            Aucune déduction. Cliquez sur "Ajouter une ligne" pour en créer.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(deductions[prestataireNom] || []).map((deduction) => (
                              <div key={deduction.id} className="flex items-center gap-3 bg-red-50 p-3 rounded-lg">
                                <input
                                  type="text"
                                  placeholder="Libellé (ex: Avance sur salaire, Carburant...)"
                                  value={deduction.libelle}
                                  onChange={(e) => modifierDeduction(prestataireNom, deduction.id, 'libelle', e.target.value)}
                                  className="flex-1 px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400"
                                />
                                <div className="flex items-center gap-2">
                                  <span className="text-red-600 font-medium">-</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={deduction.montant}
                                    onChange={(e) => modifierDeduction(prestataireNom, deduction.id, 'montant', e.target.value)}
                                    className="w-28 px-3 py-2 border border-red-200 rounded-lg text-right focus:ring-2 focus:ring-red-400 focus:border-red-400"
                                  />
                                  <span className="text-red-600">€</span>
                                </div>
                                <button
                                  onClick={() => supprimerDeduction(prestataireNom, deduction.id)}
                                  className="p-2 text-red-500 hover:bg-red-200 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            <div className="flex justify-end pt-2 border-t border-red-200 mt-3">
                              <p className="text-sm font-semibold text-red-700">
                                Total déductions : -{montants.totalDeductions.toFixed(2)} €
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Total Final */}
                      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-5 mb-6 text-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Euro className="w-8 h-8" />
                            <span className="text-lg font-semibold">TOTAL NET À PAYER</span>
                          </div>
                          <p className="text-4xl font-bold">{montants.total.toFixed(2)} €</p>
                        </div>
                        {montants.totalDeductions > 0 && (
                          <p className="text-sm text-green-100 mt-2 text-right">
                            (Sous-total {montants.sousTotal.toFixed(2)} € - Déductions {montants.totalDeductions.toFixed(2)} €)
                          </p>
                        )}
                      </div>

                      {/* Tableau chauffeurs */}
                      {stats?.chauffeurs && stats.chauffeurs.length > 0 && (
                        <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                            <Users className="w-4 h-4 text-indigo-500" />
                            Détail par chauffeur
                            <span className="text-xs text-gray-400 font-normal ml-2">(cliquez sur un chauffeur pour voir le détail jour par jour)</span>
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase"></th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Chauffeur</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Chargeurs</th>
                                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Jours</th>
                                  <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL Liv</th>
                                  <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">Colis Liv</th>
                                  <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600 uppercase">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {stats.chauffeurs.map((c, idx) => {
                                  const totalChauffeur = (c.pdlLivres * prix.prixPDL) + (c.colisLivres * prix.prixColis) + (c.nbJours * prix.prixJour);
                                  const chauffeurKey = `${prestataireNom}-${c.nom}`;
                                  const isExpanded = expandedChauffeur === chauffeurKey;
                                  const detailJours = (c.detailParJour || []).sort((a, b) => new Date(a.date) - new Date(b.date));
                                  
                                  return (
                                    <>
                                      <tr 
                                        key={idx} 
                                        className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                        onClick={() => setExpandedChauffeur(isExpanded ? null : chauffeurKey)}
                                      >
                                        <td className="px-2 py-3 w-8">
                                          {isExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-indigo-500" />
                                          ) : (
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                          )}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-indigo-600">{c.nom}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{c.chargeurs}</td>
                                        <td className="px-4 py-3 text-center">{c.nbJours}</td>
                                        <td className="px-4 py-3 text-center font-bold text-blue-600">{c.pdlLivres.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center font-bold text-green-600">{c.colisLivres.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-amber-700">{totalChauffeur.toFixed(2)} €</td>
                                      </tr>
                                      {isExpanded && detailJours.length > 0 && (
                                        <tr key={`${idx}-detail`}>
                                          <td colSpan={7} className="p-0">
                                            <div className="bg-indigo-50 p-4 border-t border-b border-indigo-200">
                                              <h4 className="text-xs font-semibold text-indigo-700 mb-3 flex items-center gap-2">
                                                <Calendar className="w-4 h-4" />
                                                Détail jour par jour - {c.nom}
                                              </h4>
                                              <div className="bg-white rounded-lg overflow-hidden border border-indigo-200">
                                                <table className="w-full text-xs">
                                                  <thead className="bg-indigo-100">
                                                    <tr>
                                                      <th className="px-3 py-2 text-left font-semibold text-indigo-700">Date</th>
                                                      <th className="px-3 py-2 text-left font-semibold text-indigo-700">Chargeur</th>
                                                      <th className="px-3 py-2 text-left font-semibold text-indigo-700">Tournée</th>
                                                      <th className="px-3 py-2 text-center font-semibold text-blue-700">PDL Liv</th>
                                                      <th className="px-3 py-2 text-center font-semibold text-green-700">Colis Liv</th>
                                                      <th className="px-3 py-2 text-right font-semibold text-amber-700">Montant</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-indigo-100">
                                                    {detailJours.map((jour, jIdx) => {
                                                      const dateObj = new Date(jour.date);
                                                      const jourSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dateObj.getDay()];
                                                      const montantJour = ((jour.pdlLivres || 0) * prix.prixPDL) + ((jour.colisLivres || 0) * prix.prixColis) + prix.prixJour;
                                                      return (
                                                        <tr key={jIdx} className="hover:bg-indigo-50">
                                                          <td className="px-3 py-2 font-medium">
                                                            <span className="text-indigo-600">{jourSemaine}</span>{' '}
                                                            {dateObj.toLocaleDateString('fr-FR')}
                                                          </td>
                                                          <td className="px-3 py-2 text-gray-600">{jour.chargeur || '-'}</td>
                                                          <td className="px-3 py-2 text-gray-600">{jour.tournee || '-'}</td>
                                                          <td className="px-3 py-2 text-center font-semibold text-blue-600">{(jour.pdlLivres || 0).toLocaleString()}</td>
                                                          <td className="px-3 py-2 text-center font-semibold text-green-600">{(jour.colisLivres || 0).toLocaleString()}</td>
                                                          <td className="px-3 py-2 text-right font-semibold text-amber-700">{montantJour.toFixed(2)} €</td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                  <tfoot className="bg-indigo-100">
                                                    <tr className="font-bold">
                                                      <td colSpan={3} className="px-3 py-2 text-indigo-700">Total {c.nom}</td>
                                                      <td className="px-3 py-2 text-center text-blue-700">{c.pdlLivres.toLocaleString()}</td>
                                                      <td className="px-3 py-2 text-center text-green-700">{c.colisLivres.toLocaleString()}</td>
                                                      <td className="px-3 py-2 text-right text-amber-700">{totalChauffeur.toFixed(2)} €</td>
                                                    </tr>
                                                  </tfoot>
                                                </table>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-gray-100">
                                <tr className="font-bold">
                                  <td className="px-4 py-3"></td>
                                  <td className="px-4 py-3 text-gray-900">TOTAL</td>
                                  <td className="px-4 py-3"></td>
                                  <td className="px-4 py-3 text-center">{stats.totalJours}</td>
                                  <td className="px-4 py-3 text-center text-blue-600">{stats.totalPdlLivres.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-center text-green-600">{stats.totalColisLivres.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right text-amber-700">{montants.total.toFixed(2)} €</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Boutons export */}
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => exportToExcel(prestataireNom)}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Export Excel
                        </button>
                        <button
                          onClick={() => exportToPDF(prestataireNom)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Export PDF
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
