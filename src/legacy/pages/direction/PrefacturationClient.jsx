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
  Plus,
  Trash2,
  Minus,
  X,
  ExternalLink,
  Eye
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import API_BASE from '../../config/api';
// Configuration des clients (chargeurs)
const CLIENTS = [
  'GLS',
  'DPD',
  'COLIS PRIVE 66',
  'COLIS PRIVE 64',
  'RELAIS COLIS',
  'CHRONOPOST',
  'CIBLEX'
];

export default function PrefacturationClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [expandedSociete, setExpandedSociete] = useState(null);
  const [selectedTournee, setSelectedTournee] = useState(null);
  
  // Prix par client
  const [prixConfig, setPrixConfig] = useState(
    CLIENTS.reduce((acc, client) => {
      acc[client] = { prixPDL: 0, prixColis: 0, prixJour: 0 };
      return acc;
    }, {})
  );
  
  // Lignes supplémentaires par client (ajouts)
  const [lignesSupp, setLignesSupp] = useState(
    CLIENTS.reduce((acc, client) => {
      acc[client] = [];
      return acc;
    }, {})
  );
  
  // Période par défaut : mois en cours
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateDebut, setDateDebut] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(today.toISOString().split('T')[0]);

  // Charger les données
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_BASE}/api/direction/statistiques-chargeurs?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`
      );
      
      if (!response.ok) throw new Error('Erreur lors du chargement des données');
      
      const result = await response.json();
      const chargeurs = result.chargeurs || [];
      
      console.log('[PrefacturationClient] Chargeurs disponibles:', chargeurs.map(c => c.nom));
      
      // Fonction de normalisation pour la comparaison
      const normaliser = (str) => str.toUpperCase().replace(/\s+/g, ' ').trim();
      
      // Fonction de matching intelligente qui priorise les correspondances exactes
      const trouverChargeur = (clientNom, listeChargeurs) => {
        const clientNormalise = normaliser(clientNom);
        
        // 1. Correspondance exacte (priorité maximale)
        let match = listeChargeurs.find(c => normaliser(c.nom) === clientNormalise);
        if (match) return match;
        
        // 2. Le chargeur contient exactement le nom du client
        match = listeChargeurs.find(c => normaliser(c.nom).includes(clientNormalise));
        if (match) return match;
        
        // 3. Le client contient exactement le nom du chargeur
        match = listeChargeurs.find(c => clientNormalise.includes(normaliser(c.nom)));
        if (match) return match;
        
        // 4. Pour les clients SANS numéro, chercher un chargeur avec base commune
        // Mais NE PAS faire ça pour les clients AVEC numéro (comme COLIS PRIVE 64/66)
        const clientSansNumero = clientNormalise.replace(/\d+/g, '').trim();
        const clientANumero = clientSansNumero !== clientNormalise;
        
        if (!clientANumero) {
          // Client sans numéro : peut matcher avec un chargeur qui a la même base
          match = listeChargeurs.find(c => {
            const chargeurNormalise = normaliser(c.nom);
            const chargeurSansNumero = chargeurNormalise.replace(/\d+/g, '').trim();
            return chargeurSansNumero === clientSansNumero;
          });
        }
        
        return match || null;
      };
      
      // Filtrer et organiser les données par client configuré
      const clientsData = {};
      
      for (const clientNom of CLIENTS) {
        const chargeurMatch = trouverChargeur(clientNom, chargeurs);
        
        console.log(`[PrefacturationClient] Client "${clientNom}" -> Match: ${chargeurMatch?.nom || 'Aucun'}`);
        
        if (chargeurMatch) {
          // Récupérer les détails du chargeur
          const detailResponse = await fetch(
            `${API_BASE}/api/direction/detail-chargeur/${encodeURIComponent(chargeurMatch.nom)}?dateDebut=${dateDebut}&dateFin=${dateFin}&salesforce=true`
          );
          
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            
            // Construire les données par société
            const societes = {};
            if (detailData.parSociete) {
              Object.entries(detailData.parSociete).forEach(([societeNom, socData]) => {
                societes[societeNom] = {
                  totalPdlPec: socData.totaux?.pdlPec || 0,
                  totalPdlLivres: socData.totaux?.pdlLivres || 0,
                  totalColisPec: socData.totaux?.colisPec || 0,
                  totalColisLivres: socData.totaux?.colisLivres || 0,
                  totalColisLivresDomicile: socData.totaux?.colisLivresDomicile || 0,
                  totalColisLivresRelais: socData.totaux?.colisLivresRelais || 0,
                  totalJours: socData.nbJours || 0,
                  tournees: socData.tournees || [],
                  chauffeurs: socData.chauffeurs || []
                };
              });
            }
            
            clientsData[clientNom] = {
              totalPdlPec: detailData.totaux?.pdlPec || 0,
              totalPdlLivres: detailData.totaux?.pdlLivres || 0,
              totalColisPec: detailData.totaux?.colisPec || 0,
              totalColisLivres: detailData.totaux?.colisLivres || 0,
              totalColisLivresDomicile: detailData.totaux?.colisLivresDomicile || 0,
              totalColisLivresRelais: detailData.totaux?.colisLivresRelais || 0,
              totalJours: detailData.parJour?.length || 0,
              tournees: detailData.tournees || [],
              chauffeurs: detailData.chauffeurs || [],
              parJour: detailData.parJour || [],
              societes: societes
            };
          }
        } else {
          clientsData[clientNom] = {
            totalPdlPec: 0,
            totalPdlLivres: 0,
            totalColisPec: 0,
            totalColisLivres: 0,
            totalColisLivresDomicile: 0,
            totalColisLivresRelais: 0,
            totalJours: 0,
            tournees: [],
            chauffeurs: [],
            parJour: [],
            societes: {}
          };
        }
      }
      
      setData(clientsData);
    } catch (err) {
      console.error('Erreur:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateDebut, dateFin]);

  // Calculer le montant pour un client
  const calculerMontant = (client) => {
    if (!data || !data[client]) return { montantPDL: 0, montantColis: 0, montantJour: 0, totalLignesSupp: 0, sousTotal: 0, total: 0 };
    
    const stats = data[client];
    const prix = prixConfig[client] || { prixPDL: 0, prixColis: 0, prixJour: 0 };
    const clientLignesSupp = lignesSupp[client] || [];
    
    const montantPDL = stats.totalPdlLivres * prix.prixPDL;
    const montantColis = stats.totalColisLivres * prix.prixColis;
    const montantJour = stats.totalJours * prix.prixJour;
    const sousTotal = montantPDL + montantColis + montantJour;
    const totalLignesSupp = clientLignesSupp.reduce((sum, l) => sum + (parseFloat(l.montant) || 0), 0);
    
    return {
      montantPDL,
      montantColis,
      montantJour,
      sousTotal,
      totalLignesSupp,
      total: sousTotal + totalLignesSupp
    };
  };
  
  // Ajouter une ligne supplémentaire
  const ajouterLigne = (client) => {
    setLignesSupp(prev => ({
      ...prev,
      [client]: [...(prev[client] || []), { id: Date.now(), libelle: '', montant: 0 }]
    }));
  };
  
  // Modifier une ligne supplémentaire
  const modifierLigne = (client, id, field, value) => {
    setLignesSupp(prev => ({
      ...prev,
      [client]: (prev[client] || []).map(l => 
        l.id === id ? { ...l, [field]: value } : l
      )
    }));
  };
  
  // Supprimer une ligne supplémentaire
  const supprimerLigne = (client, id) => {
    setLignesSupp(prev => ({
      ...prev,
      [client]: (prev[client] || []).filter(l => l.id !== id)
    }));
  };

  // Calculer les totaux par société (TPS, D&J) avec détail par chargeur
  const calculerTotauxParSociete = () => {
    if (!data) return {};
    
    const societesMap = {};
    
    CLIENTS.forEach(clientNom => {
      const stats = data[clientNom];
      if (!stats || !stats.societes) return;
      
      const prix = prixConfig[clientNom] || { prixPDL: 0, prixColis: 0, prixJour: 0 };
      const montants = calculerMontant(clientNom);
      
      Object.entries(stats.societes).forEach(([societeNom, socData]) => {
        if (!societesMap[societeNom]) {
          societesMap[societeNom] = {
            nom: societeNom,
            totalPdlLivres: 0,
            totalColisLivres: 0,
            totalColisLivresDomicile: 0,
            totalColisLivresRelais: 0,
            totalJours: 0,
            totalMontant: 0,
            chargeurs: []
          };
        }
        
        // Calculer le montant pour cette société sur ce chargeur
        const montantPDLSoc = (socData.totalPdlLivres || 0) * prix.prixPDL;
        const montantColisSoc = (socData.totalColisLivres || 0) * prix.prixColis;
        const montantJourSoc = (socData.totalJours || 0) * prix.prixJour;
        const montantSociete = montantPDLSoc + montantColisSoc + montantJourSoc;
        
        societesMap[societeNom].totalPdlLivres += socData.totalPdlLivres || 0;
        societesMap[societeNom].totalColisLivres += socData.totalColisLivres || 0;
        societesMap[societeNom].totalColisLivresDomicile += socData.totalColisLivresDomicile || 0;
        societesMap[societeNom].totalColisLivresRelais += socData.totalColisLivresRelais || 0;
        societesMap[societeNom].totalJours += socData.totalJours || 0;
        societesMap[societeNom].totalMontant += montantSociete;
        
        // Ajouter le détail par chargeur
        societesMap[societeNom].chargeurs.push({
          nom: clientNom,
          pdlLivres: socData.totalPdlLivres || 0,
          colisLivres: socData.totalColisLivres || 0,
          colisLivresDomicile: socData.totalColisLivresDomicile || 0,
          colisLivresRelais: socData.totalColisLivresRelais || 0,
          jours: socData.totalJours || 0,
          montant: montantSociete
        });
      });
    });
    
    return societesMap;
  };

  // Mettre à jour le prix
  const updatePrix = (client, type, value) => {
    setPrixConfig(prev => ({
      ...prev,
      [client]: {
        ...prev[client],
        [type]: parseFloat(value) || 0
      }
    }));
  };

  // Export Excel
  const exportToExcel = (client) => {
    if (!data || !data[client]) return;
    
    const stats = data[client];
    const prix = prixConfig[client];
    const montants = calculerMontant(client);
    const workbook = XLSX.utils.book_new();
    const clientLignesSupp = lignesSupp[client] || [];
    
    // Feuille résumé (utiliser aoa_to_sheet pour éviter les clés dupliquées)
    const resumeData = [
      ['Client', client],
      ['Période', `Du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`],
      [],
      ['Description', 'Quantité', 'Prix unitaire', 'Montant'],
      ['PDL Livrés', stats.totalPdlLivres, `${prix.prixPDL.toFixed(2)} €`, `${montants.montantPDL.toFixed(2)} €`],
      ['Colis Livrés', stats.totalColisLivres, `${prix.prixColis.toFixed(2)} €`, `${montants.montantColis.toFixed(2)} €`],
      ['Forfait Journée', stats.totalJours, `${prix.prixJour.toFixed(2)} €`, `${montants.montantJour.toFixed(2)} €`],
      [],
      ['SOUS-TOTAL', '', '', `${montants.sousTotal.toFixed(2)} €`]
    ];
    
    // Ajouter les lignes supplémentaires
    if (clientLignesSupp.length > 0) {
      resumeData.push([]);
      resumeData.push(['--- LIGNES SUPPLÉMENTAIRES ---']);
      clientLignesSupp.forEach(l => {
        resumeData.push([l.libelle || 'Ligne supplémentaire', '', '', `${parseFloat(l.montant || 0).toFixed(2)} €`]);
      });
      resumeData.push(['Total lignes supp.', '', '', `${montants.totalLignesSupp.toFixed(2)} €`]);
    }
    
    resumeData.push([]);
    resumeData.push(['TOTAL À FACTURER', '', '', `${montants.total.toFixed(2)} €`]);
    
    const wsResume = XLSX.utils.aoa_to_sheet(resumeData);
    XLSX.utils.book_append_sheet(workbook, wsResume, 'Résumé');
    
    // Feuille détail par tournée
    const tourneesData = stats.tournees.map(t => ({
      'Tournée': t.nom,
      'Nb Jours': t.nbJours,
      'PDL PEC': t.pdlPec,
      'PDL Livrés': t.pdlLivres,
      'Colis PEC': t.colisPec,
      'Colis Livrés': t.colisLivres,
      'Taux': `${t.colisPec > 0 ? ((t.colisLivres / t.colisPec) * 100).toFixed(1) : 0}%`
    }));
    const wsTournees = XLSX.utils.json_to_sheet(tourneesData);
    XLSX.utils.book_append_sheet(workbook, wsTournees, 'Détail Tournées');
    
    // Feuille détail jour par jour
    const joursData = stats.parJour.map(j => ({
      'Date': new Date(j.date).toLocaleDateString('fr-FR'),
      'PDL PEC': j.pdlPec,
      'PDL Livrés': j.pdlLivres,
      'Colis PEC': j.colisPec,
      'Colis Livrés': j.colisLivres,
      'Taux': `${j.colisPec > 0 ? ((j.colisLivres / j.colisPec) * 100).toFixed(1) : 0}%`
    }));
    const wsJours = XLSX.utils.json_to_sheet(joursData);
    XLSX.utils.book_append_sheet(workbook, wsJours, 'Détail Jour par Jour');
    
    const fileName = `Prefacturation_Client_${client}_${dateDebut}_${dateFin}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Export PDF
  const exportToPDF = (client) => {
    if (!data || !data[client]) return;
    
    const stats = data[client];
    const prix = prixConfig[client];
    const montants = calculerMontant(client);
    const clientLignesSupp = lignesSupp[client] || [];
    
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;
    
    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229);
    doc.text('PRÉFACTURATION CLIENT', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 12;
    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55);
    doc.text(client, pageWidth / 2, yPos, { align: 'center' });
    
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
    
    const tableBody = [
      ['Points de Livraison (PDL)', formatNumber(stats.totalPdlLivres), `${prix.prixPDL.toFixed(2)} €`, `${montants.montantPDL.toFixed(2)} €`],
      ['Colis Livrés', formatNumber(stats.totalColisLivres), `${prix.prixColis.toFixed(2)} €`, `${montants.montantColis.toFixed(2)} €`],
      ['   dont Domicile', formatNumber(stats.totalColisLivresDomicile || 0), '', ''],
      ['   dont Relais', formatNumber(stats.totalColisLivresRelais || 0), '', ''],
      ['Forfait Journée', stats.totalJours.toString(), `${prix.prixJour.toFixed(2)} €`, `${montants.montantJour.toFixed(2)} €`],
      ['', '', '', ''],
      ['SOUS-TOTAL', '', '', `${montants.sousTotal.toFixed(2)} €`]
    ];
    
    // Ajouter les lignes supplémentaires au tableau
    if (clientLignesSupp.length > 0) {
      tableBody.push(['', '', '', '']);
      clientLignesSupp.forEach(l => {
        tableBody.push([l.libelle || 'Ligne supplémentaire', '', '', `${parseFloat(l.montant || 0).toFixed(2)} €`]);
      });
      tableBody.push(['Total lignes supp.', '', '', `${montants.totalLignesSupp.toFixed(2)} €`]);
    }
    
    tableBody.push(['', '', '', '']);
    tableBody.push(['TOTAL À FACTURER', '', '', `${montants.total.toFixed(2)} €`]);
    
    const totalRowIndex = tableBody.length - 1;
    const sousTotalRowIndex = 6;
    
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
        // Lignes "dont Domicile" et "dont Relais" en italique
        if (data.row.index === 2 || data.row.index === 3) {
          data.cell.styles.fontStyle = 'italic';
          data.cell.styles.textColor = [107, 114, 128];
        }
      }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // Vérifier si c'est COLIS PRIVE pour le groupement
    const isColisPrive = client.toUpperCase().includes('COLIS PRIVE');
    const prefixes = ['662', '664', '666'];
    
    // Tableau détail par tournée
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text('Détail par tournée', 14, yPos);
    yPos += 5;
    
    if (isColisPrive) {
      // Groupement par préfixe pour COLIS PRIVE
      prefixes.forEach(prefix => {
        const tourneesGroupe = stats.tournees.filter(t => t.nom.startsWith(prefix));
        if (tourneesGroupe.length === 0) return;
        
        // Calculer les totaux du groupe
        const totalGroupe = {
          nbJours: tourneesGroupe.reduce((sum, t) => sum + (t.nbJours || 0), 0),
          pdlLivres: tourneesGroupe.reduce((sum, t) => sum + (t.pdlLivres || 0), 0),
          colisLivres: tourneesGroupe.reduce((sum, t) => sum + (t.colisLivres || 0), 0),
          colisLivresDomicile: tourneesGroupe.reduce((sum, t) => sum + (t.colisLivresDomicile || 0), 0),
          colisLivresRelais: tourneesGroupe.reduce((sum, t) => sum + (t.colisLivresRelais || 0), 0)
        };
        
        // Vérifier si on a besoin d'une nouvelle page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        // Titre du groupe
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text(`Groupe ${prefix} - ${tourneesGroupe.length} tournées`, 14, yPos);
        yPos += 5;
        
        const tourneesTableData = tourneesGroupe.map(t => [
          t.nom,
          t.nbJours,
          formatNumber(t.pdlLivres || 0),
          formatNumber(t.colisLivres || 0),
          formatNumber(t.colisLivresDomicile || 0),
          formatNumber(t.colisLivresRelais || 0)
        ]);
        
        // Ajouter ligne total du groupe
        tourneesTableData.push([
          `TOTAL ${prefix}`,
          totalGroupe.nbJours,
          formatNumber(totalGroupe.pdlLivres),
          formatNumber(totalGroupe.colisLivres),
          formatNumber(totalGroupe.colisLivresDomicile),
          formatNumber(totalGroupe.colisLivresRelais)
        ]);
        
        autoTable(doc, {
          startY: yPos,
          head: [['Tournée', 'Jours', 'PDL Liv', 'Colis Liv', 'Domicile', 'Relais']],
          body: tourneesTableData,
          theme: 'grid',
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { halign: 'center', cellWidth: 20 },
            2: { halign: 'center', cellWidth: 28 },
            3: { halign: 'center', cellWidth: 28 },
            4: { halign: 'center', cellWidth: 28 },
            5: { halign: 'center', cellWidth: 28 }
          },
          didParseCell: function(data) {
            // Ligne total en gras
            if (data.row.index === tourneesTableData.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [243, 244, 246];
            }
          }
        });
        
        yPos = doc.lastAutoTable.finalY + 10;
      });
    } else {
      // Affichage normal pour les autres clients
      const tourneesTableData = stats.tournees.map(t => [
        t.nom,
        t.nbJours,
        formatNumber(t.pdlLivres || 0),
        formatNumber(t.colisLivres || 0),
        formatNumber(t.colisLivresDomicile || 0),
        formatNumber(t.colisLivresRelais || 0)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Tournée', 'Jours', 'PDL Liv', 'Colis Liv', 'Domicile', 'Relais']],
        body: tourneesTableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { halign: 'center', cellWidth: 20 },
          2: { halign: 'center', cellWidth: 28 },
          3: { halign: 'center', cellWidth: 28 },
          4: { halign: 'center', cellWidth: 28 },
          5: { halign: 'center', cellWidth: 28 }
        }
      });
    }
    
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
    
    const fileName = `Prefacturation_Client_${client}_${dateDebut}_${dateFin}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 mb-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-10 h-10" />
              <div>
                <h1 className="text-2xl font-bold">Préfacturation Clients</h1>
                <p className="text-indigo-100 text-sm">Facturation aux donneurs d'ordre</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4" />
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="bg-transparent border-none text-white text-sm focus:outline-none"
                />
                <span className="text-indigo-200">→</span>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="bg-transparent border-none text-white text-sm focus:outline-none"
                />
              </div>
              
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
            </div>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        )}

        {/* Vignettes récapitulatives par société */}
        {!loading && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {Object.entries(calculerTotauxParSociete()).map(([societeNom, socData]) => (
              <div key={societeNom} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                {/* Header société */}
                <div className={`p-4 ${societeNom.toLowerCase().includes('d') && societeNom.toLowerCase().includes('j') ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'} text-white`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg">
                      {societeNom.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{societeNom}</h3>
                      <p className="text-sm text-white/80">{socData.chargeurs.length} chargeur(s)</p>
                    </div>
                  </div>
                </div>
                
                {/* Stats globales société */}
                <div className="p-4 bg-gray-50 border-b">
                  <div className="grid grid-cols-6 gap-2 text-center">
                    <div>
                      <p className="text-xs text-blue-500 font-medium">PDL Liv</p>
                      <p className="text-lg font-bold text-blue-600">{socData.totalPdlLivres.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-500 font-medium">Colis Liv</p>
                      <p className="text-lg font-bold text-green-600">{socData.totalColisLivres.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-teal-500 font-medium">Domicile</p>
                      <p className="text-lg font-bold text-teal-600">{socData.totalColisLivresDomicile.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-orange-500 font-medium">Relais</p>
                      <p className="text-lg font-bold text-orange-600">{socData.totalColisLivresRelais.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Jours</p>
                      <p className="text-lg font-bold text-gray-700">{socData.totalJours}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg px-2 py-1">
                      <p className="text-xs text-amber-600 font-medium">Montant</p>
                      <p className="text-lg font-bold text-amber-700">{socData.totalMontant.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>
                
                {/* Détail par chargeur */}
                <div className="p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Détail par chargeur (cliquez pour voir le détail)</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {socData.chargeurs.map((chargeur, idx) => (
                      <div 
                        key={idx} 
                        className="py-2 px-3 bg-gray-50 rounded-lg text-sm hover:bg-indigo-50 cursor-pointer transition-colors border border-transparent hover:border-indigo-200"
                        onClick={() => {
                          setExpandedClient(chargeur.nom);
                          setTimeout(() => {
                            document.getElementById(`client-${chargeur.nom}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs">
                              {chargeur.nom.charAt(0)}
                            </div>
                            <span className="font-medium text-gray-700">{chargeur.nom}</span>
                          </div>
                          <span className="font-bold text-amber-700">{chargeur.montant.toFixed(2)} €</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs pl-8">
                          <span className="text-blue-600">{chargeur.pdlLivres.toLocaleString()} PDL</span>
                          <span className="text-green-600">{chargeur.colisLivres.toLocaleString()} colis</span>
                          <span className="text-teal-600">{chargeur.colisLivresDomicile.toLocaleString()} dom.</span>
                          <span className="text-orange-600">{chargeur.colisLivresRelais.toLocaleString()} relais</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Liste des clients */}
        {!loading && data && (
          <div className="space-y-4">
            {CLIENTS.map((clientNom) => {
              const stats = data[clientNom];
              const prix = prixConfig[clientNom] || { prixPDL: 0, prixColis: 0, prixJour: 0 };
              const montants = calculerMontant(clientNom);
              const isExpanded = expandedClient === clientNom;
              const clientLignesSupp = lignesSupp[clientNom] || [];
              
              return (
                <div key={clientNom} id={`client-${clientNom}`} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  {/* Header client */}
                  <div 
                    className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedClient(isExpanded ? null : clientNom)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                          {clientNom.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-gray-800">{clientNom}</h2>
                          <p className="text-sm text-gray-500">
                            {stats?.tournees?.length || 0} tournées • {stats?.totalJours || 0} jours
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
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
                          <p className="text-sm text-amber-600">Total</p>
                          <p className="text-xl font-bold text-amber-700">{montants.total.toFixed(2)} €</p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                  </div>
                  
                  {/* Contenu développé */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-5 bg-gray-50">
                      {/* Configuration prix */}
                      <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-indigo-500" />
                          Configuration des prix
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Prix par PDL livré (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={prix.prixPDL}
                              onChange={(e) => updatePrix(clientNom, 'prixPDL', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Prix par colis livré (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={prix.prixColis}
                              onChange={(e) => updatePrix(clientNom, 'prixColis', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Forfait journée (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={prix.prixJour}
                              onChange={(e) => updatePrix(clientNom, 'prixJour', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                      
                      {/* Section Lignes supplémentaires */}
                      <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Plus className="w-4 h-4 text-green-500" />
                            Lignes supplémentaires
                          </h3>
                          <button
                            onClick={() => ajouterLigne(clientNom)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Ajouter une ligne
                          </button>
                        </div>
                        
                        {clientLignesSupp.length === 0 ? (
                          <p className="text-sm text-gray-500 italic text-center py-4">
                            Aucune ligne supplémentaire. Cliquez sur "Ajouter une ligne" pour en créer.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {clientLignesSupp.map((ligne) => (
                              <div key={ligne.id} className="flex items-center gap-3 bg-green-50 p-3 rounded-lg">
                                <input
                                  type="text"
                                  placeholder="Libellé (ex: Prime qualité, Frais supplémentaires...)"
                                  value={ligne.libelle}
                                  onChange={(e) => modifierLigne(clientNom, ligne.id, 'libelle', e.target.value)}
                                  className="flex-1 px-3 py-2 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-400 focus:border-green-400"
                                />
                                <div className="flex items-center gap-2">
                                  <span className="text-green-600 font-medium">+</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={ligne.montant}
                                    onChange={(e) => modifierLigne(clientNom, ligne.id, 'montant', e.target.value)}
                                    className="w-28 px-3 py-2 border border-green-200 rounded-lg text-right focus:ring-2 focus:ring-green-400 focus:border-green-400"
                                  />
                                  <span className="text-green-600">€</span>
                                </div>
                                <button
                                  onClick={() => supprimerLigne(clientNom, ligne.id)}
                                  className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            <div className="flex justify-end pt-2 border-t border-green-200 mt-3">
                              <p className="text-sm font-semibold text-green-700">
                                Total lignes supp. : +{montants.totalLignesSupp.toFixed(2)} €
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Total Final */}
                      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-5 mb-6 text-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Euro className="w-8 h-8" />
                            <span className="text-lg font-semibold">TOTAL À FACTURER</span>
                          </div>
                          <p className="text-4xl font-bold">{montants.total.toFixed(2)} €</p>
                        </div>
                        {montants.totalLignesSupp > 0 && (
                          <p className="text-sm text-indigo-100 mt-2 text-right">
                            (Sous-total {montants.sousTotal.toFixed(2)} € + Lignes supp. {montants.totalLignesSupp.toFixed(2)} €)
                          </p>
                        )}
                      </div>
                      
                      {/* Tableau par Société (accordéon) */}
                      {stats?.societes && Object.keys(stats.societes).length > 0 && (
                        <div className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-indigo-500" />
                            Détail par société et tournée
                            <span className="text-xs text-gray-400 ml-2">(cliquez sur une société pour voir ses tournées)</span>
                          </h3>
                          
                          <div className="space-y-2">
                            {Object.entries(stats.societes).map(([societeNom, socData]) => {
                              const isExpanded = expandedSociete === societeNom;
                              const tauxSociete = socData.totalColisPec > 0 
                                ? ((socData.totalColisLivres / socData.totalColisPec) * 100).toFixed(1) 
                                : 0;
                              // Calculer le montant pour cette société
                              const montantPDLSoc = (socData.totalPdlLivres || 0) * prix.prixPDL;
                              const montantColisSoc = (socData.totalColisLivres || 0) * prix.prixColis;
                              const montantJourSoc = (socData.totalJours || 0) * prix.prixJour;
                              const montantSociete = montantPDLSoc + montantColisSoc + montantJourSoc;
                              
                              return (
                                <div key={societeNom} className="border border-gray-200 rounded-xl overflow-hidden">
                                  {/* Ligne société (header accordéon) */}
                                  <div 
                                    className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 cursor-pointer hover:from-purple-100 hover:to-indigo-100 transition-colors"
                                    onClick={() => setExpandedSociete(isExpanded ? null : societeNom)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        {isExpanded ? (
                                          <ChevronUp className="w-5 h-5 text-purple-500" />
                                        ) : (
                                          <ChevronDown className="w-5 h-5 text-purple-500" />
                                        )}
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                                          {societeNom.charAt(0)}
                                        </div>
                                        <div>
                                          <p className="font-bold text-gray-800">{societeNom}</p>
                                          <p className="text-xs text-gray-500">{socData.tournees?.length || 0} tournées • {socData.totalJours} jours</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 text-sm">
                                        <div className="text-center">
                                          <p className="text-xs text-blue-500">PDL Liv</p>
                                          <p className="font-bold text-blue-600">{(socData.totalPdlLivres || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="text-center">
                                          <p className="text-xs text-green-500">Colis Liv</p>
                                          <p className="font-bold text-green-600">{(socData.totalColisLivres || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="text-center">
                                          <p className="text-xs text-teal-500">Domicile</p>
                                          <p className="font-semibold text-teal-600">{(socData.totalColisLivresDomicile || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="text-center">
                                          <p className="text-xs text-orange-500">Relais</p>
                                          <p className="font-semibold text-orange-600">{(socData.totalColisLivresRelais || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="text-center px-2 py-1 bg-amber-100 rounded-lg">
                                          <p className="text-xs text-amber-600">Taux</p>
                                          <p className="font-bold text-amber-700">{tauxSociete}%</p>
                                        </div>
                                        <div className="text-center px-3 py-1 bg-green-100 rounded-lg border border-green-300">
                                          <p className="text-xs text-green-600">Montant</p>
                                          <p className="font-bold text-green-700">{montantSociete.toFixed(2)} €</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Tournées de la société (contenu accordéon) */}
                                  {isExpanded && socData.tournees && socData.tournees.length > 0 && (() => {
                                    // Grouper les tournées par préfixe pour COLIS PRIVE
                                    const isColisPrive = clientNom.toUpperCase().includes('COLIS PRIVE');
                                    const prefixes = ['662', '664', '666'];
                                    
                                    const groupedTournees = isColisPrive 
                                      ? prefixes.reduce((acc, prefix) => {
                                          acc[prefix] = socData.tournees.filter(t => t.nom.startsWith(prefix));
                                          return acc;
                                        }, {})
                                      : { 'all': socData.tournees };
                                    
                                    // Calculer les totaux par groupe
                                    const groupTotals = {};
                                    Object.entries(groupedTournees).forEach(([prefix, tournees]) => {
                                      groupTotals[prefix] = {
                                        nbJours: tournees.reduce((sum, t) => sum + (t.nbJours || 0), 0),
                                        pdlLivres: tournees.reduce((sum, t) => sum + (t.pdlLivres || 0), 0),
                                        colisLivres: tournees.reduce((sum, t) => sum + (t.colisLivres || 0), 0),
                                        colisLivresDomicile: tournees.reduce((sum, t) => sum + (t.colisLivresDomicile || 0), 0),
                                        colisLivresRelais: tournees.reduce((sum, t) => sum + (t.colisLivresRelais || 0), 0)
                                      };
                                    });
                                    
                                    const renderTourneeRow = (t, idx) => {
                                      const tauxSoc = socData.totalColisLivres > 0 
                                        ? ((t.colisLivres / socData.totalColisLivres) * 100).toFixed(1) 
                                        : 0;
                                      const tourneeComplete = stats.tournees?.find(tc => tc.nom === t.nom) || t;
                                      return (
                                        <tr 
                                          key={idx} 
                                          className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                          onClick={() => setSelectedTournee({ ...tourneeComplete, societe: societeNom, clientNom })}
                                        >
                                          <td className="px-3 py-2 pl-8 font-medium text-gray-700">{t.nom}</td>
                                          <td className="px-2 py-2 text-center text-gray-600">{t.nbJours}</td>
                                          <td className="px-2 py-2 text-center font-semibold text-blue-600">{(t.pdlLivres || 0).toLocaleString()}</td>
                                          <td className="px-2 py-2 text-center font-semibold text-green-600">{(t.colisLivres || 0).toLocaleString()}</td>
                                          <td className="px-2 py-2 text-center font-semibold text-teal-600">{(t.colisLivresDomicile || 0).toLocaleString()}</td>
                                          <td className="px-2 py-2 text-center font-semibold text-orange-600">{(t.colisLivresRelais || 0).toLocaleString()}</td>
                                          <td className="px-2 py-2 text-center font-semibold text-amber-600">{tauxSoc}%</td>
                                          <td className="px-2 py-2 text-center">
                                            <Eye className="w-4 h-4 text-indigo-400 mx-auto" />
                                          </td>
                                        </tr>
                                      );
                                    };
                                    
                                    return (
                                      <div className="bg-white overflow-x-auto">
                                        {isColisPrive ? (
                                          // Affichage groupé par préfixe pour COLIS PRIVE
                                          <div className="divide-y divide-gray-200">
                                            {prefixes.map(prefix => {
                                              const tournees = groupedTournees[prefix];
                                              const totals = groupTotals[prefix];
                                              if (!tournees || tournees.length === 0) return null;
                                              
                                              return (
                                                <div key={prefix} className="pb-2">
                                                  <div className="bg-indigo-50 px-4 py-2 flex items-center justify-between">
                                                    <span className="font-bold text-indigo-700">Groupe {prefix}</span>
                                                    <div className="flex items-center gap-4 text-xs">
                                                      <span className="text-gray-600">{totals.nbJours} jours</span>
                                                      <span className="text-blue-600">{totals.pdlLivres.toLocaleString()} PDL</span>
                                                      <span className="text-green-600">{totals.colisLivres.toLocaleString()} colis</span>
                                                      <span className="text-teal-600">{totals.colisLivresDomicile.toLocaleString()} dom.</span>
                                                      <span className="text-orange-600">{totals.colisLivresRelais.toLocaleString()} relais</span>
                                                    </div>
                                                  </div>
                                                  <table className="w-full text-sm">
                                                    <thead className="bg-gray-50">
                                                      <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Tournée</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Jours</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-blue-500 uppercase">PDL Liv</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-green-500 uppercase">Colis Liv</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-teal-500 uppercase">Domicile</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-orange-500 uppercase">Relais</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-amber-500 uppercase">% Société</th>
                                                        <th className="px-2 py-2 text-center text-xs font-semibold text-gray-400 uppercase">Détail</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                      {tournees.map(renderTourneeRow)}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          // Affichage normal pour les autres clients
                                          <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                              <tr>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Tournée</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Jours</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-blue-500 uppercase">PDL Liv</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-green-500 uppercase">Colis Liv</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-teal-500 uppercase">Domicile</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-orange-500 uppercase">Relais</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-amber-500 uppercase">% Société</th>
                                                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-400 uppercase">Détail</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                              {socData.tournees.map(renderTourneeRow)}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Total global */}
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 rounded-lg font-bold">
                              <span className="text-gray-700">TOTAL GLOBAL</span>
                              <div className="flex items-center gap-6 text-sm">
                                <div className="text-center">
                                  <p className="text-xs text-gray-500">Jours</p>
                                  <p className="text-gray-700">{stats.totalJours}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-blue-500">PDL Liv</p>
                                  <p className="text-blue-600">{stats.totalPdlLivres.toLocaleString()}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-green-500">Colis Liv</p>
                                  <p className="text-green-600">{stats.totalColisLivres.toLocaleString()}</p>
                                </div>
                                <div className="text-center px-3 py-1 bg-amber-200 rounded-lg">
                                  <p className="text-xs text-amber-700">Taux</p>
                                  <p className="text-amber-800">
                                    {stats.totalColisPec > 0 ? ((stats.totalColisLivres / stats.totalColisPec) * 100).toFixed(1) : 0}%
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Boutons export */}
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => exportToExcel(clientNom)}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Export Excel
                        </button>
                        <button
                          onClick={() => exportToPDF(clientNom)}
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
        
        {/* Modal Détail Tournée */}
        {selectedTournee && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Header modal */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{selectedTournee.nom}</h2>
                    <p className="text-indigo-100 text-sm">
                      Client: {selectedTournee.clientNom} • Société: {selectedTournee.societe || 'N/A'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTournee(null)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              {/* Contenu modal */}
              <div className="p-5 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Résumé */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-500">Jours travaillés</p>
                    <p className="text-2xl font-bold text-gray-700">{selectedTournee.nbJours}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-blue-500">PDL Livrés</p>
                    <p className="text-2xl font-bold text-blue-600">{(selectedTournee.pdlLivres || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-green-500">Colis Livrés</p>
                    <p className="text-2xl font-bold text-green-600">{(selectedTournee.colisLivres || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-amber-500">Taux livraison</p>
                    <p className="text-2xl font-bold text-amber-600">
                      {selectedTournee.colisPec > 0 ? ((selectedTournee.colisLivres / selectedTournee.colisPec) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>
                
                {/* Chauffeurs */}
                {selectedTournee.chauffeurs && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Chauffeurs</h3>
                    <div className="flex flex-wrap gap-2">
                      {(typeof selectedTournee.chauffeurs === 'string' 
                        ? selectedTournee.chauffeurs.split(', ')
                        : [selectedTournee.chauffeurs]
                      ).filter(c => c && c !== 'N/A').map((chauffeur, idx) => (
                        <span key={idx} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
                          {chauffeur}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Détail jour par jour */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Détail jour par jour</h3>
                  {selectedTournee.parJour && selectedTournee.parJour.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Chauffeur</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL PEC</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 uppercase">PDL Liv</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">Colis PEC</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase">Colis Liv</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600 uppercase">Taux</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedTournee.parJour.map((jour, idx) => {
                            const tauxJour = jour.colisPec > 0 ? ((jour.colisLivres / jour.colisPec) * 100).toFixed(1) : 0;
                            const sfUrl = jour.courseId 
                              ? `https://groupetsm.lightning.force.com/lightning/r/IO_Course__c/${jour.courseId}/view`
                              : null;
                            return (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {sfUrl ? (
                                    <button
                                      onClick={() => window.open(sfUrl, '_blank')}
                                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                      title="Ouvrir dans Salesforce"
                                    >
                                      {new Date(jour.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    new Date(jour.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-600">{jour.chauffeur || '-'}</td>
                                <td className="px-4 py-3 text-center text-blue-600">{(jour.pdlPec || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center font-bold text-blue-600">{(jour.pdlLivres || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center text-green-600">{(jour.colisPec || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-center font-bold text-green-600">{(jour.colisLivres || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right font-bold text-amber-700">{tauxJour}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">Aucun détail disponible</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
