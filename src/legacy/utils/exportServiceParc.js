import * as XLSX from 'xlsx';

// ==========================================
// EXPORTS ORDRES DE RÉPARATION
// ==========================================

export const exportBonIntervention = async (ordre) => {
  try {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = autoTableModule.default;
    
    const doc = new jsPDF();
    
    // Fonction helper pour utiliser autoTable
    const addTable = (options) => {
      autoTable(doc, options);
    };
    
    // Helper pour formater les dates
    const formatDate = (date) => {
      if (!date) return '-';
      return new Date(date).toLocaleDateString('fr-FR');
    };
    
    const formatDateTime = (date, heure) => {
      if (!date) return '-';
      const dateStr = new Date(date).toLocaleDateString('fr-FR');
      return heure ? `${dateStr} à ${heure}` : dateStr;
    };
    
    // ==========================================
    // HEADER
    // ==========================================
    doc.setFontSize(22);
    doc.setTextColor(59, 130, 246);
    doc.text('ORDRE DE RÉPARATION', 14, 20);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`N° OR: ${ordre.id || 'NOUVEAU'}`, 14, 28);
    doc.text(`Date création: ${formatDate(ordre.dateCreation || new Date())}`, 14, 34);
    
    // ==========================================
    // 1. VÉHICULE
    // ==========================================
    let yPos = 45;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(59, 130, 246);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('VÉHICULE', 16, yPos);
    
    // Formater le kilométrage avec espace (pas de /)
    const formatKm = (km) => {
      if (!km) return '-';
      return km.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km';
    };
    
    const vehiculeData = [
      ['Immatriculation', ordre.vehiculeImmat || '-'],
      ['Modèle', ordre.vehiculeModele || '-'],
      ['Kilométrage', formatKm(ordre.kilometrage)],
      ['Date et heure de dépôt', formatDateTime(ordre.dateDepot, ordre.heureDepot) || '______/______/______ à ______h______'],
      ['Kilométrage réel au compteur', '__________________ km']
    ];
    
    addTable({
      startY: yPos + 5,
      body: vehiculeData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55 },
        1: { cellWidth: 125 }
      }
    });
    
    // ==========================================
    // 2. DESCRIPTION DE L'INTERVENTION
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(34, 197, 94);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('DESCRIPTION DE L\'INTERVENTION', 16, yPos);
    
    const descriptionData = [
      ['Nature', ordre.natureIntervention || '-'],
      ['Priorité', ordre.priorite || 'NORMALE'],
      ['Description', ordre.description || '-'],
      ['Symptômes', ordre.symptomes || '-'],
      ['Diagnostic', ordre.diagnostic || '-']
    ];
    
    addTable({
      startY: yPos + 5,
      body: descriptionData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { cellWidth: 130 }
      }
    });
    
    // ==========================================
    // 3. GARAGE / MÉCANICIEN
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(168, 85, 247);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('GARAGE / MÉCANICIEN', 16, yPos);
    
    // Si garage interne, ne pas afficher de nom de garage
    const garageData = ordre.type === 'INTERNE' || !ordre.type
      ? [
          ['Type', 'Garage interne'],
          ['Mécanicien assigné', ordre.mecanicienNom || '-']
        ]
      : [
          ['Type', 'Garage externe'],
          ['Garage', ordre.garageName || '-'],
          ['Mécanicien assigné', ordre.mecanicienNom || '-']
        ];
    
    addTable({
      startY: yPos + 5,
      body: garageData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { cellWidth: 130 }
      }
    });
    
    // ==========================================
    // 4. INTERVENANT (SALARIÉ)
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(99, 102, 241);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('INTERVENANT', 16, yPos);
    
    // Récupérer les infos des intervenants depuis mainOeuvre
    const intervenants = ordre.mainOeuvre && ordre.mainOeuvre.length > 0 
      ? ordre.mainOeuvre.map(m => m.mecanicienNom || '-').join(', ')
      : ordre.mecanicienNom || '-';
    
    const intervenantData = [
      ['Intervenant(s)', intervenants]
    ];
    
    addTable({
      startY: yPos + 5,
      body: intervenantData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { cellWidth: 130 }
      }
    });
    
    // ==========================================
    // 5. PLANIFICATION (PRÉVISION)
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(245, 158, 11);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('PLANIFICATION', 16, yPos);
    
    // Calculer temps prévu total
    const tempsPrevuTotal = ordre.mainOeuvre 
      ? ordre.mainOeuvre.reduce((sum, m) => sum + (m.tempsEstime || 0), 0)
      : 0;
    
    const planificationData = [
      ['Date prévue de début', formatDateTime(ordre.dateDebut, ordre.heureDebut)],
      ['Temps prévu', tempsPrevuTotal > 0 ? `${tempsPrevuTotal} heure(s)` : '-']
    ];
    
    addTable({
      startY: yPos + 5,
      body: planificationData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 120 }
      }
    });
    
    // ==========================================
    // 6. INTERVENTION (À REMPLIR PAR L'INTERVENANT)
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(220, 38, 38);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('INTERVENTION (à remplir par l\'intervenant)', 16, yPos);
    
    const interventionEffectiveData = [
      ['Date et heure de début des travaux', '______/______/______ à ______h______'],
      ['Date et heure de fin des travaux', '______/______/______ à ______h______'],
      ['Temps passé', '______ heure(s) ______ minute(s)']
    ];
    
    addTable({
      startY: yPos + 5,
      body: interventionEffectiveData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 70 },
        1: { cellWidth: 110 }
      }
    });
    
    // ==========================================
    // 7. SIGNATURES (FIN DU RECTO)
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(10);
    doc.setTextColor(0);
    
    doc.text('Signature intervenant:', 14, yPos);
    doc.rect(14, yPos + 3, 70, 20);
    
    doc.text('Signature responsable:', 110, yPos);
    doc.rect(110, yPos + 3, 70, 20);
    
    doc.text('Date: ___/___/______', 14, yPos + 28);
    doc.text('Date: ___/___/______', 110, yPos + 28);
    
    // ==========================================
    // PAGE 2 - VERSO : PIÈCES UTILISÉES
    // ==========================================
    doc.addPage();
    
    // Header du verso
    doc.setFontSize(16);
    doc.setTextColor(59, 130, 246);
    doc.text('ORDRE DE RÉPARATION - VERSO', 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`N° OR: ${ordre.id || 'NOUVEAU'} | Véhicule: ${ordre.vehiculeImmat || '-'}`, 14, 22);
    
    // ==========================================
    // PIÈCES UTILISÉES (VERSO)
    // ==========================================
    yPos = 35;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(147, 51, 234);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('PIÈCES UTILISÉES (à remplir par l\'intervenant)', 16, yPos);
    
    // 15 lignes vierges à remplir manuellement
    const piecesVierges = Array(15).fill(['', '', '']);
    
    addTable({
      startY: yPos + 5,
      head: [['Référence', 'Désignation', 'Quantité']],
      body: piecesVierges,
      theme: 'grid',
      styles: { fontSize: 10, minCellHeight: 10 },
      headStyles: { fillColor: [147, 51, 234], fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 100 },
        2: { cellWidth: 30 }
      }
    });
    
    // ==========================================
    // COMMENTAIRES (VERSO - après les pièces)
    // ==========================================
    yPos = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(107, 114, 128);
    doc.rect(14, yPos - 5, 182, 8, 'F');
    doc.text('COMMENTAIRES (à remplir par l\'intervenant)', 16, yPos);
    
    // Grande zone commentaires
    yPos += 5;
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.rect(14, yPos, 182, 60);
    
    // Lignes horizontales pour guider l'écriture
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    for (let i = 1; i <= 6; i++) {
      doc.line(16, yPos + (i * 9), 194, yPos + (i * 9));
    }
    
    // ==========================================
    // FOOTER
    // ==========================================
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i}/${pageCount} - OR ${ordre.id || 'NOUVEAU'} - Imprimé le ${new Date().toLocaleDateString('fr-FR')}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }
    
    // Sauvegarder
    const fileName = `OR_${ordre.id || 'NOUVEAU'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    return { success: true, fileName };
  } catch (error) {
    console.error('Erreur export PDF:', error);
    alert('Erreur lors de la génération du PDF : ' + error.message);
    return { success: false, error: error.message };
  }
};

export const exportFacture = async (ordre) => {
  try {
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = autoTableModule.default;
    
    const doc = new jsPDF();
    
    // Fonction helper pour utiliser autoTable
    const addTable = (options) => {
      autoTable(doc, options);
    };
    
    // Header facture
    doc.setFontSize(24);
    doc.setTextColor(59, 130, 246);
    doc.text('FACTURE', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`N° Facture: FACT-${ordre.id || 'PREVIEW'}`, 14, 30);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 35);
    
    // Infos entreprise
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('GARAGE G2L', 140, 20);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('ZI Les Pins', 140, 26);
    doc.text('83000 Toulon', 140, 31);
    doc.text('Tél: 04 94 XX XX XX', 140, 36);
    doc.text('SIRET: XXX XXX XXX XXXXX', 140, 41);
    
    // Client (véhicule)
    let yPos = 55;
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('FACTURÉ À:', 14, yPos);
    
    doc.setFontSize(10);
    yPos += 7;
    doc.text(`Véhicule: ${ordre.vehiculeImmat || '-'}`, 14, yPos);
    yPos += 5;
    doc.text(`Modèle: ${ordre.vehiculeModele || '-'}`, 14, yPos);
    
    // Tableau détaillé
    yPos += 15;
    
    const detailsData = [];
    
    // Pièces
    if (ordre.pieces && ordre.pieces.length > 0) {
      ordre.pieces.forEach(p => {
        detailsData.push([
          p.designation || '-',
          p.reference || '-',
          p.quantite || 0,
          ((p.prixUnitaire || 0)).toFixed(2) + '€',
          ((p.prixUnitaire || 0) * (p.quantite || 0)).toFixed(2) + '€'
        ]);
      });
    }
    
    // Main d'oeuvre
    if (ordre.mainOeuvre && ordre.mainOeuvre.length > 0) {
      ordre.mainOeuvre.forEach(m => {
        const temps = m.tempsEstime || 0;
        const taux = m.tauxHoraire || 0;
        detailsData.push([
          m.description || 'Main d\'œuvre',
          `${m.mecanicienNom || '-'} (${temps}h)`,
          1,
          (temps * taux).toFixed(2) + '€',
          (temps * taux).toFixed(2) + '€'
        ]);
      });
    }
    
    const couts = ordre.couts || { pieces: 0, mainOeuvre: 0, total: 0, tva: 0, totalTTC: 0 };
    
    addTable({
      startY: yPos,
      head: [['Désignation', 'Référence', 'Qté', 'Prix HT', 'Total HT']],
      body: detailsData.length > 0 ? detailsData : [['Aucun élément', '-', '-', '-', '-']],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      foot: [
        ['', '', '', 'Total HT', (couts.total || 0).toFixed(2) + '€'],
        ['', '', '', 'TVA 20%', (couts.tva || 0).toFixed(2) + '€'],
        ['', '', '', 'TOTAL TTC', (couts.totalTTC || 0).toFixed(2) + '€']
      ],
      footStyles: { 
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      }
    });
    
    // Conditions de paiement
    yPos = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(10);
    doc.text('Conditions de paiement: 30 jours net', 14, yPos);
    doc.text('En cas de retard de paiement, une pénalité de 3% sera appliquée.', 14, yPos + 5);
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} sur ${pageCount} - FACT-${ordre.id || 'PREVIEW'}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }
    
    const fileName = `Facture_${ordre.id || 'PREVIEW'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    return { success: true, fileName };
  } catch (error) {
    console.error('Erreur export facture PDF:', error);
    alert('Erreur lors de la génération de la facture : ' + error.message);
    return { success: false, error: error.message };
  }
};

export const exportRapportMensuelParc = (stats, ordres, mois) => {
  try {
    const wb = XLSX.utils.book_new();
    
    // Valeurs par défaut pour éviter les erreurs
    const ordresReparation = stats?.ordresReparation || { total: 0, enCours: 0, termines: 0, urgents: 0 };
    const coutsMois = stats?.coutsMois || { pieces: 0, mainOeuvre: 0, total: 0 };
    const stock = stats?.stock || { totalArticles: 0, valeurTotale: 0, alertes: 0, ruptures: 0 };
    
    // Feuille 1: Résumé
    const resumeData = [
      ['RAPPORT MENSUEL GESTION PARC'],
      ['Mois:', mois || new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })],
      ['Généré le:', new Date().toLocaleDateString('fr-FR')],
      [],
      ['STATISTIQUES GÉNÉRALES'],
      ['Indicateur', 'Valeur'],
      ['Ordres de réparation', ordresReparation.total || 0],
      ['En cours', ordresReparation.enCours || 0],
      ['Terminés', ordresReparation.termines || 0],
      ['Urgents', ordresReparation.urgents || 0],
      [],
      ['COÛTS'],
      ['Type', 'Montant'],
      ['Pièces', (coutsMois.pieces || 0).toFixed(2) + '€'],
      ['Main d\'œuvre', (coutsMois.mainOeuvre || 0).toFixed(2) + '€'],
      ['Total HT', (coutsMois.total || 0).toFixed(2) + '€'],
      [],
      ['STOCK'],
      ['Articles en stock', stock.totalArticles || 0],
      ['Valeur totale', (stock.valeurTotale || 0).toFixed(2) + '€'],
      ['Alertes stock', stock.alertes || 0],
      ['Ruptures', stock.ruptures || 0]
    ];
    
    const ws1 = XLSX.utils.aoa_to_sheet(resumeData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé');
    
    // Feuille 2: Détail ordres
    const ordresArray = Array.isArray(ordres) ? ordres : [];
    const ordresData = [
      ['DÉTAIL DES ORDRES DE RÉPARATION'],
      [],
      ['N° Ordre', 'Date', 'Véhicule', 'Nature', 'Statut', 'Priorité', 'Coût TTC'],
      ...ordresArray.map(o => [
        o.id || '-',
        o.dateCreation ? new Date(o.dateCreation).toLocaleDateString('fr-FR') : '-',
        o.vehiculeImmat || '-',
        o.natureIntervention || '-',
        o.statut || '-',
        o.priorite || '-',
        ((o.couts?.totalTTC) || 0).toFixed(2) + '€'
      ])
    ];
  
    const ws2 = XLSX.utils.aoa_to_sheet(ordresData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Ordres');
    
    // Sauvegarder
    const fileName = `Rapport_Parc_${(mois || 'export').replace(/\s/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    return { success: true, fileName };
  } catch (error) {
    console.error('Erreur export rapport Excel:', error);
    alert('Erreur lors de la génération du rapport : ' + error.message);
    return { success: false, error: error.message };
  }
};

