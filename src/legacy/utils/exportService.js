import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

export const exportToExcel = (analytics, employesData) => {
  // Créer un nouveau workbook
  const wb = XLSX.utils.book_new();
  
  // Feuille 1: KPIs
  const kpisData = [
    ['TABLEAU DE BORD ACOMPTES - ' + new Date().toLocaleDateString('fr-FR')],
    [],
    ['KPIs Principaux'],
    ['Indicateur', 'Valeur'],
    ['En attente de validation', analytics.kpis.enAttente],
    ['Validés', analytics.kpis.valides],
    ['Montant total validé', analytics.kpis.montantTotalValide + '€'],
    ['Refusés', analytics.kpis.refuses],
    ['Acomptes ce mois', analytics.kpis.acomptesMois],
    ['Employés demandeurs', analytics.kpis.employesUniques],
    ['Demandes urgentes', analytics.kpis.urgents],
    ['En cours de paiement', analytics.kpis.enPaiement],
    [],
    ['Métriques'],
    ['Indicateur', 'Valeur', 'Objectif'],
    ['Délai moyen traitement', analytics.metriques.delaiMoyenJours + 'j', '< 3j'],
    ['Taux d\'approbation', analytics.metriques.tauxApprobation + '%', '≥ 80%'],
    ['Montant moyen', analytics.metriques.montantMoyen + '€', '-'],
    ['Total demandes', analytics.metriques.totalDemandes, '-']
  ];
  
  const ws1 = XLSX.utils.aoa_to_sheet(kpisData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Dashboard');
  
  // Feuille 2: Évolution mensuelle
  const evolutionData = [
    ['ÉVOLUTION MENSUELLE'],
    [],
    ['Mois', 'Nombre demandes', 'Montant total', 'Validés', 'Refusés'],
    ...analytics.evolutionMensuelle.map(m => [
      m.moisLabel,
      m.nombreDemandes,
      m.montantTotal,
      m.valides,
      m.refuses
    ])
  ];
  
  const ws2 = XLSX.utils.aoa_to_sheet(evolutionData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Évolution');
  
  // Feuille 3: Top demandeurs
  const getEmployeNom = (employeId) => {
    const employe = employesData.find(e => String(e.id) === String(employeId));
    return employe?.nomComplet || 'Employé inconnu';
  };
  
  const topData = [
    ['TOP DEMANDEURS'],
    [],
    ['Employé', 'Nombre demandes', 'Montant total', 'Validés', 'Refusés'],
    ...analytics.topDemandeurs.map(d => [
      getEmployeNom(d.employeId),
      d.nombreDemandes,
      d.montantTotal + '€',
      d.nombreValides,
      d.nombreRefuses
    ])
  ];
  
  const ws3 = XLSX.utils.aoa_to_sheet(topData);
  XLSX.utils.book_append_sheet(wb, ws3, 'Top demandeurs');
  
  // Feuille 4: Alertes
  const alertesData = [
    ['ALERTES ET NOTIFICATIONS'],
    [],
    ['Niveau', 'Message', 'Action'],
    ...analytics.alertes.map(a => [
      a.niveau,
      a.message,
      a.action
    ])
  ];
  
  const ws4 = XLSX.utils.aoa_to_sheet(alertesData);
  XLSX.utils.book_append_sheet(wb, ws4, 'Alertes');
  
  // Générer le fichier
  const fileName = `Acomptes_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

export const exportToPDF = async (analytics, employesData) => {
  // Import dynamique pour éviter les problèmes avec Vite
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString('fr-FR');
  
  // Page 1: Dashboard
  doc.setFontSize(20);
  doc.setTextColor(59, 130, 246); // Bleu
  doc.text('DASHBOARD ACOMPTES', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Généré le ${today}`, 14, 27);
  
  // KPIs
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('KPIs Principaux', 14, 40);
  
  const kpisTable = [
    ['En attente', analytics.kpis.enAttente],
    ['Validés', analytics.kpis.valides],
    ['Montant validé', analytics.kpis.montantTotalValide + '€'],
    ['Refusés', analytics.kpis.refuses],
    ['Ce mois', analytics.kpis.acomptesMois],
    ['Employés', analytics.kpis.employesUniques],
    ['Urgent', analytics.kpis.urgents],
    ['En paiement', analytics.kpis.enPaiement]
  ];
  
  doc.autoTable({
    startY: 45,
    head: [['Indicateur', 'Valeur']],
    body: kpisTable,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] }
  });
  
  // Métriques
  let yPos = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(14);
  doc.text('Métriques Clés', 14, yPos);
  
  const metriquesTable = [
    ['Délai moyen traitement', analytics.metriques.delaiMoyenJours + 'j', '< 3j'],
    ['Taux d\'approbation', analytics.metriques.tauxApprobation + '%', '≥ 80%'],
    ['Montant moyen', analytics.metriques.montantMoyen + '€', '-'],
    ['Total demandes', analytics.metriques.totalDemandes, '-']
  ];
  
  doc.autoTable({
    startY: yPos + 5,
    head: [['Métrique', 'Valeur', 'Objectif']],
    body: metriquesTable,
    theme: 'grid',
    headStyles: { fillColor: [34, 197, 94] }
  });
  
  // Alertes
  if (analytics.alertes.length > 0) {
    yPos = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setTextColor(239, 68, 68); // Rouge
    doc.text('⚠️ Alertes', 14, yPos);
    
    const alertesTable = analytics.alertes.map(a => [
      a.niveau,
      a.message,
      a.action
    ]);
    
    doc.autoTable({
      startY: yPos + 5,
      head: [['Niveau', 'Message', 'Action']],
      body: alertesTable,
      theme: 'grid',
      headStyles: { fillColor: [239, 68, 68] }
    });
  }
  
  // Page 2: Évolution
  doc.addPage();
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text('Évolution Mensuelle', 14, 20);
  
  const evolutionTable = analytics.evolutionMensuelle.map(m => [
    m.moisLabel,
    m.nombreDemandes,
    m.montantTotal + '€',
    m.valides,
    m.refuses
  ]);
  
  doc.autoTable({
    startY: 30,
    head: [['Mois', 'Demandes', 'Montant', 'Validés', 'Refusés']],
    body: evolutionTable,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] }
  });
  
  // Page 3: Top demandeurs
  doc.addPage();
  doc.setFontSize(16);
  doc.text('Top Demandeurs', 14, 20);
  
  const getEmployeNom = (employeId) => {
    const employe = employesData.find(e => String(e.id) === String(employeId));
    return employe?.nomComplet || 'Employé inconnu';
  };
  
  const topTable = analytics.topDemandeurs.slice(0, 10).map((d, index) => [
    index + 1,
    getEmployeNom(d.employeId),
    d.nombreDemandes,
    d.montantTotal + '€',
    d.nombreValides,
    d.nombreRefuses
  ]);
  
  doc.autoTable({
    startY: 30,
    head: [['#', 'Employé', 'Demandes', 'Montant', 'Validés', 'Refusés']],
    body: topTable,
    theme: 'striped',
    headStyles: { fillColor: [147, 51, 234] }
  });
  
  // Prédictions
  yPos = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(14);
  doc.setTextColor(147, 51, 234);
  doc.text('📊 Prédictions Mois Prochain', 14, yPos);
  
  const predictionsTable = [
    ['Demandes estimées', '~' + analytics.predictions.demandesEstimees],
    ['Montant estimé', '~' + analytics.predictions.montantEstime + '€'],
    ['Tendance', analytics.predictions.tendance + ' (' + analytics.predictions.tendancePourcentage + '%)'],
    ['Confiance', analytics.predictions.confianceNiveau]
  ];
  
  doc.autoTable({
    startY: yPos + 5,
    head: [['Indicateur', 'Valeur']],
    body: predictionsTable,
    theme: 'grid',
    headStyles: { fillColor: [147, 51, 234] }
  });
  
  // Footer sur toutes les pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} sur ${pageCount} - TSM - Dashboard Acomptes`,
      14,
      doc.internal.pageSize.height - 10
    );
  }
  
  // Sauvegarder
  const fileName = `Acomptes_Rapport_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

export const exportDemandesEnAttente = (demandes, employesData) => {
  const wb = XLSX.utils.book_new();
  
  const getEmployeNom = (employeId) => {
    const employe = employesData.find(e => String(e.id) === String(employeId));
    return employe?.nomComplet || 'Employé inconnu';
  };
  
  const data = [
    ['DEMANDES EN ATTENTE - ' + new Date().toLocaleDateString('fr-FR')],
    [],
    ['Employé', 'Montant', 'Motif', 'Date demande', 'Jours attente', 'Priorité'],
    ...demandes.map(d => [
      getEmployeNom(d.employeId),
      d.montant + '€',
      d.motif || '-',
      new Date(d.createdAt).toLocaleDateString('fr-FR'),
      d.joursAttente,
      d.priorite
    ])
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Demandes');
  
  const fileName = `Acomptes_EnAttente_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

