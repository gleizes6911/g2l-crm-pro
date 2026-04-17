import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, differenceInMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Info, X, Truck, Calendar, Gauge, Fuel, RefreshCw, DollarSign, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import API_BASE from '../../config/api';

export default function ControleurGestion() {
  const [activeTab, setActiveTab] = useState('COUTS');
  const [periode, setPeriode] = useState(format(new Date(), 'yyyy-MM'));
  const [statsCarburant, setStatsCarburant] = useState(null);
  const [coutsVehicules, setCoutsVehicules] = useState(null);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [societesEmettrices, setSocietesEmettrices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    carburant: false,
    location: false,
    assurance: false,
    entretien: false
  });
  const [filtreStatut, setFiltreStatut] = useState('TOUS'); // TOUS, ACTIFS, INACTIFS
  const [showModalDetail, setShowModalDetail] = useState(false);
  const [vehiculeDetail, setVehiculeDetail] = useState(null);
  const [moisFiltre, setMoisFiltre] = useState(new Date().getMonth() + 1);
  const [anneeFiltre, setAnneeFiltre] = useState(new Date().getFullYear());
  const [isLoadingRefresh, setIsLoadingRefresh] = useState(false);
  
  // États pour le tri dynamique
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc'
  });

  const [sortConfigOrganisme, setSortConfigOrganisme] = useState({
    key: 'total',
    direction: 'desc'
  });

  const [sortConfigAgence, setSortConfigAgence] = useState({
    key: 'total',
    direction: 'desc'
  });

  const [sortConfigAssureur, setSortConfigAssureur] = useState({
    key: 'total',
    direction: 'desc'
  });

  // Frais globaux sur période
  const [showFraisGlobaux, setShowFraisGlobaux] = useState(false);
  const [dateDebutPeriode, setDateDebutPeriode] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [dateFinPeriode, setDateFinPeriode] = useState(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [donneesCarburant, setDonneesCarburant] = useState([]);
  const [loadingCarburant, setLoadingCarburant] = useState(false);
  const [sortConfigGlobaux, setSortConfigGlobaux] = useState({ key: null, direction: 'asc' });

  const [formFacture, setFormFacture] = useState({
    societeEmettrice: '',
    societeFacturee: '',
    numero: '',
    dateFacture: format(new Date(), 'yyyy-MM-dd'),
    periodeFacturation: periode,
    chargeurNom: '',
    modeFacturation: 'COLIS',
    montantHT: '',
    tva: '',
    montantTTC: '',
    statut: 'EN_ATTENTE'
  });

  // Fonction générique de tri
  const handleSort = (key, currentConfig, setConfig) => {
    let direction = 'asc';
    if (currentConfig.key === key && currentConfig.direction === 'asc') {
      direction = 'desc';
    }
    setConfig({ key, direction });
  };

  // Fonction pour obtenir l'icône de tri
  const getSortIcon = (columnKey, currentConfig) => {
    if (currentConfig.key !== columnKey) {
      return <span className="text-gray-400 ml-1">⇅</span>;
    }
    return currentConfig.direction === 'asc' 
      ? <span className="text-blue-600 ml-1">↑</span>
      : <span className="text-blue-600 ml-1">↓</span>;
  };

  // Fonction de tri des données
  const sortData = (data, config, getValueFn) => {
    if (!config.key || !data) return data;
    
    return [...data].sort((a, b) => {
      const aValue = getValueFn ? getValueFn(a, config.key) : a[config.key];
      const bValue = getValueFn ? getValueFn(b, config.key) : b[config.key];
      
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      if (typeof aValue === 'string') {
        return config.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return config.direction === 'asc'
        ? aValue - bValue
        : bValue - aValue;
    });
  };

  // Charger les données quand les filtres changent
  useEffect(() => {
    fetchData();
  }, [moisFiltre, anneeFiltre]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Calculer dateDebut et dateFin selon moisFiltre et anneeFiltre
      const dateDebut = `${anneeFiltre}-${String(moisFiltre).padStart(2, '0')}-01`;
      const dernierJour = new Date(anneeFiltre, moisFiltre, 0).getDate();
      const dateFin = `${anneeFiltre}-${String(moisFiltre).padStart(2, '0')}-${dernierJour}`;
      
      console.log('[CDG] Chargement données pour:', dateDebut, '→', dateFin);

      // Charger en parallèle
      const [carburantRes, vehiculesRes, facturesRes, societesRes] = await Promise.all([
        fetch(`${API_BASE}/api/exploitation/carburant/statistiques?dateDebut=${dateDebut}&dateFin=${dateFin}`),
        fetch(`${API_BASE}/api/cdg/couts-vehicules?dateDebut=${dateDebut}&dateFin=${dateFin}`),
        fetch(`${API_BASE}/api/cdg/factures`),
        fetch(`${API_BASE}/api/cdg/societes-emettrices`)
      ]);

      if (carburantRes.ok) {
        const data = await carburantRes.json();
        setStatsCarburant(data);
      }

      if (vehiculesRes.ok) {
        const data = await vehiculesRes.json();
        setCoutsVehicules(data);
      }

      if (facturesRes.ok) {
        const data = await facturesRes.json();
        setFactures(data);
      }

      if (societesRes.ok) {
        const data = await societesRes.json();
        setSocietesEmettrices(data);
      }
    } catch (error) {
      console.error('[CDG] Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle section dépliable
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Charger les données carburant pour la période (frais globaux)
  const fetchCarburantPeriode = async () => {
    setLoadingCarburant(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/exploitation/carburant/par-vehicule?dateDebut=${dateDebutPeriode}&dateFin=${dateFinPeriode}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setDonneesCarburant(data);
        console.log('[FRAIS GLOBAUX] Données carburant chargées:', data.length, 'véhicules');
      } else {
        console.error('[FRAIS GLOBAUX] Erreur réponse:', response.status);
        setDonneesCarburant([]);
      }
    } catch (error) {
      console.error('[FRAIS GLOBAUX] Erreur carburant:', error);
      setDonneesCarburant([]);
    } finally {
      setLoadingCarburant(false);
    }
  };

  // Charger carburant quand on ouvre l'onglet ou change les dates
  useEffect(() => {
    if (showFraisGlobaux) {
      fetchCarburantPeriode();
    }
  }, [showFraisGlobaux, dateDebutPeriode, dateFinPeriode]);

  // Calculer le nombre de mois dans la période
  const nbMoisPeriode = useMemo(() => {
    const debut = new Date(dateDebutPeriode);
    const fin = new Date(dateFinPeriode);
    const diffMois = differenceInMonths(fin, debut);
    return Math.max(1, diffMois + 1);
  }, [dateDebutPeriode, dateFinPeriode]);

  // Récupérer les détails véhicules depuis coutsVehicules
  const vehiculeDetails = coutsVehicules?.details || [];

  // Fusionner données CDG + Carburant avec filtres appliqués
  const donneesGlobales = useMemo(() => {
    if (!vehiculeDetails || vehiculeDetails.length === 0) return [];
    
    // APPLIQUER LE FILTRE ACTIF/INACTIF D'ABORD
    let vehiculesFiltres = vehiculeDetails.filter(v => {
      if (filtreStatut === 'ACTIFS') return v.actif;
      if (filtreStatut === 'INACTIFS') return !v.actif;
      return true;
    });
    
    // PUIS ENRICHIR AVEC LES DONNÉES CARBURANT
    return vehiculesFiltres.map(v => {
      // Trouver les données carburant pour ce véhicule
      const carburant = donneesCarburant.find(c => c.immatriculation === v.immatriculation);
      
      // Frais fixes mensuels
      const locationMensuel = v.location || 0;
      const leasingMensuel = v.leasing || 0;
      const assuranceMensuel = v.assurance || 0;
      const totalFixeMensuel = locationMensuel + leasingMensuel + assuranceMensuel;
      
      // Frais fixes sur la période
      const locationPeriode = locationMensuel * nbMoisPeriode;
      const leasingPeriode = leasingMensuel * nbMoisPeriode;
      const assurancePeriode = assuranceMensuel * nbMoisPeriode;
      const totalFixePeriode = totalFixeMensuel * nbMoisPeriode;
      
      // Carburant sur la période
      const carburantPeriode = carburant?.montantTotal || 0;
      const volumeCarburant = carburant?.volumeTotal || 0;
      const nbTransactions = carburant?.nbTransactions || 0;
      
      // Total global période
      const totalGlobalPeriode = totalFixePeriode + carburantPeriode;
      
      return {
        ...v,
        locationMensuel,
        leasingMensuel,
        assuranceMensuel,
        totalFixeMensuel,
        locationPeriode,
        leasingPeriode,
        assurancePeriode,
        totalFixePeriode,
        carburantPeriode,
        volumeCarburant,
        nbTransactions,
        totalGlobalPeriode
      };
    });
  }, [vehiculeDetails, donneesCarburant, nbMoisPeriode, filtreStatut]);

  // Fonction de tri pour frais globaux
  const handleSortGlobaux = (key) => {
    let direction = 'asc';
    if (sortConfigGlobaux.key === key && sortConfigGlobaux.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfigGlobaux({ key, direction });
  };

  const getSortIconGlobaux = (columnKey) => {
    if (sortConfigGlobaux.key !== columnKey) return '⇅';
    return sortConfigGlobaux.direction === 'asc' ? '↑' : '↓';
  };

  // Données triées pour frais globaux
  const donneesGlobalesTries = useMemo(() => {
    if (!sortConfigGlobaux.key) return donneesGlobales;
    
    return [...donneesGlobales].sort((a, b) => {
      const aVal = a[sortConfigGlobaux.key];
      const bVal = b[sortConfigGlobaux.key];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'string') {
        return sortConfigGlobaux.direction === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      return sortConfigGlobaux.direction === 'asc' 
        ? aVal - bVal 
        : bVal - aVal;
    });
  }, [donneesGlobales, sortConfigGlobaux]);

  // Totaux pour le footer frais globaux
  const totauxGlobaux = useMemo(() => {
    return donneesGlobales.reduce((acc, v) => ({
      locationPeriode: acc.locationPeriode + (v.locationPeriode || 0),
      leasingPeriode: acc.leasingPeriode + (v.leasingPeriode || 0),
      assurancePeriode: acc.assurancePeriode + (v.assurancePeriode || 0),
      totalFixePeriode: acc.totalFixePeriode + (v.totalFixePeriode || 0),
      carburantPeriode: acc.carburantPeriode + (v.carburantPeriode || 0),
      volumeCarburant: acc.volumeCarburant + (v.volumeCarburant || 0),
      totalGlobalPeriode: acc.totalGlobalPeriode + (v.totalGlobalPeriode || 0)
    }), {
      locationPeriode: 0,
      leasingPeriode: 0,
      assurancePeriode: 0,
      totalFixePeriode: 0,
      carburantPeriode: 0,
      volumeCarburant: 0,
      totalGlobalPeriode: 0
    });
  }, [donneesGlobales]);

  // Export Excel des Frais Globaux
  const exporterFraisGlobaux = () => {
    // Préparer les données pour Excel
    const dataExcel = [];
    
    // LIGNE 1 : Titre
    dataExcel.push(['FRAIS GLOBAUX SUR PÉRIODE']);
    dataExcel.push([]); // Ligne vide
    
    // LIGNE 3 : Informations période
    dataExcel.push([
      'Période :',
      `Du ${format(new Date(dateDebutPeriode), 'dd/MM/yyyy')} au ${format(new Date(dateFinPeriode), 'dd/MM/yyyy')}`,
      '',
      `${nbMoisPeriode} mois`
    ]);
    
    // LIGNE 4 : Filtres appliqués
    const filtresTexte = [];
    if (filtreStatut === 'ACTIFS') filtresTexte.push('Véhicules actifs uniquement');
    else if (filtreStatut === 'INACTIFS') filtresTexte.push('Véhicules inactifs uniquement');
    else filtresTexte.push('Tous les véhicules');
    
    dataExcel.push(['Filtres :', filtresTexte.join(' | ')]);
    dataExcel.push([]); // Ligne vide
    
    // LIGNE 6 : En-têtes de colonnes
    dataExcel.push([
      'IMMATRICULATION',
      'ACTIF',
      'FILIALE CONTRAT',
      'FILIALE PROPRIÉTAIRE',
      'MODÈLE',
      'TYPE',
      'ASSUREUR',
      'LOCATION (période)',
      'LEASING (période)',
      'ASSURANCE (période)',
      'TOTAL FIXE (période)',
      'CARBURANT (période)',
      'VOLUME (L)',
      'NB TRANSACTIONS',
      'TOTAL GLOBAL (période)'
    ]);
    
    // LIGNES 7+ : Données des véhicules
    donneesGlobalesTries.forEach(v => {
      dataExcel.push([
        v.immatriculation || '',
        v.actif ? 'OUI' : 'NON',
        v.filialePorteuseContrat || '',
        v.filialeProprietaire || '',
        v.modele || '',
        v.typeVehicule || '',
        v.assureur || '',
        Number(v.locationPeriode.toFixed(2)),
        Number(v.leasingPeriode.toFixed(2)),
        Number(v.assurancePeriode.toFixed(2)),
        Number(v.totalFixePeriode.toFixed(2)),
        Number(v.carburantPeriode.toFixed(2)),
        Number(v.volumeCarburant.toFixed(0)),
        v.nbTransactions || 0,
        Number(v.totalGlobalPeriode.toFixed(2))
      ]);
    });
    
    // LIGNE FINALE : Totaux
    dataExcel.push([
      'TOTAUX',
      `${donneesGlobales.length} véhicules`,
      '',
      '',
      '',
      '',
      '',
      Number(totauxGlobaux.locationPeriode.toFixed(2)),
      Number(totauxGlobaux.leasingPeriode.toFixed(2)),
      Number(totauxGlobaux.assurancePeriode.toFixed(2)),
      Number(totauxGlobaux.totalFixePeriode.toFixed(2)),
      Number(totauxGlobaux.carburantPeriode.toFixed(2)),
      Number(totauxGlobaux.volumeCarburant.toFixed(0)),
      '',
      Number(totauxGlobaux.totalGlobalPeriode.toFixed(2))
    ]);
    
    // Créer la feuille Excel
    const ws = XLSX.utils.aoa_to_sheet(dataExcel);
    
    // Définir les largeurs de colonnes
    ws['!cols'] = [
      { wch: 15 },  // Immatriculation
      { wch: 8 },   // Actif
      { wch: 18 },  // Filiale Contrat
      { wch: 18 },  // Filiale Propriétaire
      { wch: 20 },  // Modèle
      { wch: 12 },  // Type
      { wch: 20 },  // Assureur
      { wch: 15 },  // Location
      { wch: 15 },  // Leasing
      { wch: 15 },  // Assurance
      { wch: 15 },  // Total Fixe
      { wch: 15 },  // Carburant
      { wch: 12 },  // Volume
      { wch: 12 },  // Nb Trans
      { wch: 18 }   // Total Global
    ];
    
    // Créer le classeur
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Frais Globaux');
    
    // Générer le nom du fichier avec la date
    const dateExport = format(new Date(), 'yyyy-MM-dd_HHmm');
    const periodeTexte = `${format(new Date(dateDebutPeriode), 'yyyy-MM-dd')}_au_${format(new Date(dateFinPeriode), 'yyyy-MM-dd')}`;
    const nomFichier = `Frais_Globaux_${periodeTexte}_export_${dateExport}.xlsx`;
    
    // Télécharger le fichier
    XLSX.writeFile(wb, nomFichier);
    
    console.log(`[EXPORT EXCEL] Fichier généré: ${nomFichier}`);
  };

  // Calculer les totaux
  const totaux = {
    carburant: statsCarburant?.montantTotalTTC || statsCarburant?.montantTotalHT || 0,
    volumeCarburant: statsCarburant?.volumeTotal || 0,
    location: coutsVehicules?.totalLocationLeasing || coutsVehicules?.totalLocation || 0,
    assurance: coutsVehicules?.totalAssurance || 0,
    entretien: coutsVehicules?.totalEntretien || 0,
    get vehiculesTotal() { return this.location + this.assurance + this.entretien; },
    get total() { return this.carburant + this.vehiculesTotal; }
  };

  // Gérer le formulaire de facture
  const handleFormChange = (field, value) => {
    setFormFacture(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculer TVA et TTC
      if (field === 'montantHT' && value) {
        const ht = parseFloat(value) || 0;
        updated.tva = (ht * 0.2).toFixed(2);
        updated.montantTTC = (ht * 1.2).toFixed(2);
      }
      
      // Auto-déterminer le mode de facturation
      if (field === 'chargeurNom') {
        const chargeursAuPoint = ['CIBLEX', 'CHRONOPOST', 'RELAIS COLIS'];
        updated.modeFacturation = chargeursAuPoint.some(c => value.toUpperCase().includes(c)) ? 'POINT' : 'COLIS';
      }
      
      return updated;
    });
  };

  const handleSubmitFacture = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/api/cdg/factures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formFacture,
          montantHT: parseFloat(formFacture.montantHT),
          tva: parseFloat(formFacture.tva),
          montantTTC: parseFloat(formFacture.montantTTC)
        })
      });

      if (response.ok) {
        const newFacture = await response.json();
        setFactures(prev => [newFacture, ...prev]);
        setShowForm(false);
        setFormFacture({
          societeEmettrice: '',
          societeFacturee: '',
          numero: '',
          dateFacture: format(new Date(), 'yyyy-MM-dd'),
          periodeFacturation: periode,
          chargeurNom: '',
          modeFacturation: 'COLIS',
          montantHT: '',
          tva: '',
          montantTTC: '',
          statut: 'EN_ATTENTE'
        });
      }
    } catch (error) {
      console.error('Erreur création facture:', error);
    }
  };

  const tabs = [
    { id: 'COUTS', label: 'Centres de coûts', icon: '📊' },
    { id: 'FACTURATION', label: 'Facturation', icon: '📄' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Contrôle de Gestion</h1>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600">Période :</label>
          <input
            type="month"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : (
        <>
          {/* Onglet Coûts */}
          {activeTab === 'COUTS' && (
            <div className="space-y-6">
              {/* BARRE DE FILTRES */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold text-gray-800">Période d'analyse</h3>
                  </div>
                  
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Sélecteur Mois */}
                    <div className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">Mois</label>
                      <select
                        value={moisFiltre}
                        onChange={(e) => setMoisFiltre(parseInt(e.target.value))}
                        className="px-4 py-2 border-2 border-gray-300 rounded-lg font-bold text-gray-800 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value={1}>Janvier</option>
                        <option value={2}>Février</option>
                        <option value={3}>Mars</option>
                        <option value={4}>Avril</option>
                        <option value={5}>Mai</option>
                        <option value={6}>Juin</option>
                        <option value={7}>Juillet</option>
                        <option value={8}>Août</option>
                        <option value={9}>Septembre</option>
                        <option value={10}>Octobre</option>
                        <option value={11}>Novembre</option>
                        <option value={12}>Décembre</option>
                      </select>
                    </div>
                    
                    {/* Sélecteur Année */}
                    <div className="flex flex-col">
                      <label className="text-xs text-gray-600 mb-1">Année</label>
                      <select
                        value={anneeFiltre}
                        onChange={(e) => setAnneeFiltre(parseInt(e.target.value))}
                        className="px-4 py-2 border-2 border-gray-300 rounded-lg font-bold text-gray-800 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value={2023}>2023</option>
                        <option value={2024}>2024</option>
                        <option value={2025}>2025</option>
                        <option value={2026}>2026</option>
                      </select>
                    </div>
                    
                    {/* Bouton Refresh */}
                    <button
                      onClick={() => {
                        setIsLoadingRefresh(true);
                        fetchData().finally(() => setIsLoadingRefresh(false));
                      }}
                      disabled={isLoadingRefresh}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 mt-5"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingRefresh ? 'animate-spin' : ''}`} />
                      Actualiser
                    </button>
                    
                    {/* Raccourcis période */}
                    <div className="flex flex-col gap-2 ml-4 mt-5">
                      <button
                        onClick={() => {
                          const now = new Date();
                          setMoisFiltre(now.getMonth() + 1);
                          setAnneeFiltre(now.getFullYear());
                        }}
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs font-bold"
                      >
                        Mois en cours
                      </button>
                      <button
                        onClick={() => {
                          const lastMonth = new Date();
                          lastMonth.setMonth(lastMonth.getMonth() - 1);
                          setMoisFiltre(lastMonth.getMonth() + 1);
                          setAnneeFiltre(lastMonth.getFullYear());
                        }}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-bold"
                      >
                        Mois dernier
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Indicateur période sélectionnée */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Données affichées pour : 
                    <span className="ml-2 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                      {new Date(anneeFiltre, moisFiltre - 1).toLocaleDateString('fr-FR', { 
                        month: 'long', 
                        year: 'numeric' 
                      })}
                    </span>
                  </p>
                </div>
              </div>

              {/* Total général */}
              <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-6 text-white">
                <p className="text-orange-100">Total des coûts de la période</p>
                <p className="text-4xl font-bold">{totaux.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</p>
              </div>

              {/* Carburant */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  ⛽ CARBURANT
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Salesforce</span>
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-yellow-50 rounded-xl p-4">
                    <p className="text-xs text-yellow-600 font-medium">Total Carburant</p>
                    <p className="text-2xl font-bold text-yellow-700">
                      {totaux.carburant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-600">Volume total</p>
                    <p className="text-xl font-bold text-gray-700">
                      {totaux.volumeCarburant.toLocaleString('fr-FR')} L
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-600">Conso. moyenne</p>
                    <p className="text-xl font-bold text-gray-700">
                      {(statsCarburant?.consommationMoyenne || 0).toFixed(1)} L/100km
                    </p>
                  </div>
                </div>
              </div>

              {/* Véhicules */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🚗 VÉHICULES
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Salesforce</span>
                  <span className="ml-auto text-sm text-gray-500">{coutsVehicules?.nbVehicules || 0} véhicules</span>
                </h3>
                
                <div className="grid grid-cols-4 gap-4">
                  {/* Vignette Location/Leasing - CLIQUABLE */}
                  <button
                    onClick={() => toggleSection('location')}
                    className={`bg-blue-50 rounded-xl p-4 text-left transition-all hover:shadow-lg ${
                      expandedSections.location ? 'ring-2 ring-blue-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs text-blue-600 font-medium">Location / Leasing</p>
                      {expandedSections.location ? (
                        <ChevronUp className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-2xl font-bold text-blue-700">
                      {coutsVehicules?.details
                        ? coutsVehicules.details
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.location || 0) + (v.leasing || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })
                        : '0,00'
                      } €
                    </p>
                    {coutsVehicules?.details && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-bold">
                          {coutsVehicules.details.filter(v => v.actif && ((v.location || 0) > 0 || (v.leasing || 0) > 0)).length} actifs
                        </span>
                        <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full font-bold">
                          {coutsVehicules.details.filter(v => !v.actif && ((v.location || 0) > 0 || (v.leasing || 0) > 0)).length} inactifs
                        </span>
                      </div>
                    )}
                  </button>
                  
                  {/* Vignette Assurances - CLIQUABLE */}
                  <button
                    onClick={() => toggleSection('assurance')}
                    className={`bg-purple-50 rounded-xl p-4 text-left transition-all hover:shadow-lg ${
                      expandedSections.assurance ? 'ring-2 ring-purple-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs text-purple-600 font-medium">Assurances</p>
                      {expandedSections.assurance ? (
                        <ChevronUp className="w-4 h-4 text-purple-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-purple-600" />
                      )}
                    </div>
                    <p className="text-2xl font-bold text-purple-700">
                      {coutsVehicules?.details
                        ? coutsVehicules.details
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.assurance || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })
                        : '0,00'
                      } €
                    </p>
                    {coutsVehicules?.details && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-bold">
                          {coutsVehicules.details.filter(v => v.actif && v.assurance > 0).length} actifs
                        </span>
                        <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full font-bold">
                          {coutsVehicules.details.filter(v => !v.actif && v.assurance > 0).length} inactifs
                        </span>
                      </div>
                    )}
                  </button>
                  
                  {/* Vignette Entretien - CLIQUABLE */}
                  <button
                    onClick={() => toggleSection('entretien')}
                    className={`bg-orange-50 rounded-xl p-4 text-left transition-all hover:shadow-lg ${
                      expandedSections.entretien ? 'ring-2 ring-orange-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs text-orange-600 font-medium">Entretien</p>
                      {expandedSections.entretien ? (
                        <ChevronUp className="w-4 h-4 text-orange-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-orange-600" />
                      )}
                    </div>
                    <p className="text-2xl font-bold text-orange-700">
                      {coutsVehicules?.details
                        ? coutsVehicules.details
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.entretien || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })
                        : '0,00'
                      } €
                    </p>
                    {coutsVehicules?.details && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-bold">
                          {coutsVehicules.details.filter(v => v.actif && v.entretien > 0).length} actifs
                        </span>
                        <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full font-bold">
                          {coutsVehicules.details.filter(v => !v.actif && v.entretien > 0).length} inactifs
                        </span>
                      </div>
                    )}
                  </button>
                  
                  {/* Vignette Total - NON CLIQUABLE */}
                  <div className="bg-gray-100 rounded-xl p-4">
                    <p className="text-xs text-gray-600 font-medium mb-2">Total Véhicules</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {coutsVehicules?.details
                        ? coutsVehicules.details
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.location || 0) + (v.assurance || 0) + (v.entretien || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })
                        : '0,00'
                      } €
                    </p>
                    {coutsVehicules?.details && (
                      <p className="text-xs text-gray-500 mt-2">
                        {coutsVehicules.details.filter(v => {
                          if (filtreStatut === 'ACTIFS') return v.actif;
                          if (filtreStatut === 'INACTIFS') return !v.actif;
                          return true;
                        }).length} véhicules
                      </p>
                    )}
                  </div>
                </div>

                {/* TABLEAU DÉTAIL LOCATION */}
                {expandedSections.location && coutsVehicules?.details && (
                  <div className="mt-6 pt-6 border-t-2 border-blue-200">
                    <div className="bg-blue-50 rounded-lg p-4 mb-4 flex items-center justify-between">
                      <h4 className="font-bold text-blue-900 flex items-center gap-2">
                        📋 Détail Location / Leasing
                        <span className="text-sm text-blue-600 font-normal">
                          ({coutsVehicules.details.filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0).length} véhicules)
                        </span>
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Filtrer :</span>
                        <select
                          value={filtreStatut}
                          onChange={(e) => setFiltreStatut(e.target.value)}
                          className="px-3 py-1 text-sm border border-blue-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-400"
                        >
                          <option value="TOUS">Tous</option>
                          <option value="ACTIFS">Actifs uniquement</option>
                          <option value="INACTIFS">Inactifs uniquement</option>
                        </select>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto bg-white rounded-lg border-2 border-blue-200">
                      <table className="w-full text-sm">
                        <thead className="bg-blue-100 sticky top-0">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-bold text-blue-900">Immatriculation</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-blue-900">Actif</th>
                            <th className="px-3 py-3 text-left text-xs font-bold text-blue-900">Modèle</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-blue-900">Type</th>
                            <th className="px-3 py-3 text-left text-xs font-bold text-blue-900">Agence / Organisme</th>
                            <th className="px-3 py-3 text-right text-xs font-bold text-blue-900">Location</th>
                            <th className="px-3 py-3 text-right text-xs font-bold text-blue-900">Leasing</th>
                            <th className="px-3 py-3 text-right text-xs font-bold text-blue-900">Assurance</th>
                            <th className="px-3 py-3 text-right text-xs font-bold text-blue-900">Total</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-blue-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                          {coutsVehicules.details
                            .filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0)
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .sort((a, b) => (
                              ((b.montantTTCLocation || b.location || 0) + (b.montantTTCLeasing || b.leasing || 0) + (b.coutAssuranceMensuel || b.assurance || 0)) - 
                              ((a.montantTTCLocation || a.location || 0) + (a.montantTTCLeasing || a.leasing || 0) + (a.coutAssuranceMensuel || a.assurance || 0))
                            ))
                            .map((v, i) => (
                              <tr 
                                key={i} 
                                onClick={() => {
                                  setVehiculeDetail(v);
                                  setShowModalDetail(true);
                                }}
                                className="hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                {/* Immatriculation */}
                                <td className="px-3 py-3">
                                  <span className="font-bold text-blue-700 hover:text-blue-900">
                                    {v.immatriculation || v.vehicule}
                                  </span>
                                </td>
                                
                                {/* Actif */}
                                <td className="px-3 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    v.actif 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-200 text-gray-700'
                                  }`}>
                                    {v.actif ? 'Oui' : 'Non'}
                                  </span>
                                </td>
                                
                                {/* Modèle */}
                                <td className="px-3 py-3 text-gray-900">{v.modele || 'N/A'}</td>
                                
                                {/* Type */}
                                <td className="px-3 py-3 text-center">
                                  {v.type === 'LOCATION' && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                      LOC
                                    </span>
                                  )}
                                  {v.type === 'LEASING' && (
                                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                                      LEA
                                    </span>
                                  )}
                                  {v.type === 'LOCATION + LEASING' && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                                      LOC+LEA
                                    </span>
                                  )}
                                  {!v.type && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
                                      -
                                    </span>
                                  )}
                                </td>
                                
                                {/* Agence / Organisme */}
                                <td className="px-3 py-3">
                                  <div className="flex flex-col gap-1">
                                    {v.agenceLocation && v.agenceLocation !== 'N/A' && (
                                      <div className="text-xs">
                                        <span className="text-blue-600 font-semibold">📍</span> {v.agenceLocation}
                                      </div>
                                    )}
                                    {v.organismeFinancement && v.organismeFinancement !== 'N/A' && (
                                      <div className="text-xs">
                                        <span className="text-orange-600 font-semibold">💳</span> {v.organismeFinancement}
                                      </div>
                                    )}
                                    {(!v.agenceLocation || v.agenceLocation === 'N/A') && 
                                     (!v.organismeFinancement || v.organismeFinancement === 'N/A') && (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </div>
                                </td>
                                
                                {/* Montant Location */}
                                <td className="px-3 py-3 text-right">
                                  {(v.montantTTCLocation || v.location || 0) > 0 ? (
                                    <span className="font-bold text-blue-700">
                                      {(v.montantTTCLocation || v.location || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                
                                {/* Montant Leasing */}
                                <td className="px-3 py-3 text-right">
                                  {(v.montantTTCLeasing || v.leasing || 0) > 0 ? (
                                    <span className="font-bold text-orange-600">
                                      {(v.montantTTCLeasing || v.leasing || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                
                                {/* Assurance */}
                                <td className="px-3 py-3 text-right">
                                  <span className="font-medium text-purple-600">
                                    {(v.coutAssuranceMensuel || v.assurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </span>
                                </td>
                                
                                {/* Total */}
                                <td className="px-3 py-3 text-right">
                                  <span className="font-bold text-gray-900 text-base">
                                    {((v.montantTTCLocation || v.location || 0) + 
                                      (v.montantTTCLeasing || v.leasing || 0) + 
                                      (v.coutAssuranceMensuel || v.assurance || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </span>
                                </td>
                                
                                {/* Actions */}
                                <td className="px-3 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVehiculeDetail(v);
                                      setShowModalDetail(true);
                                    }}
                                    className="p-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-all"
                                    title="Voir détails"
                                  >
                                    <Info className="w-4 h-4 text-blue-700" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          {coutsVehicules.details
                            .filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0)
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            }).length === 0 && (
                            <tr>
                              <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                                Aucun véhicule {filtreStatut === 'TOUS' ? '' : filtreStatut.toLowerCase()} avec location ou leasing
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-blue-100 sticky bottom-0">
                          <tr className="border-t-2 border-blue-300">
                            <td colSpan="5" className="px-4 py-3 font-bold text-blue-900">TOTAUX</td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700 text-base">
                              {coutsVehicules.details
                                .filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0)
                                .filter(v => {
                                  if (filtreStatut === 'ACTIFS') return v.actif;
                                  if (filtreStatut === 'INACTIFS') return !v.actif;
                                  return true;
                                })
                                .reduce((sum, v) => sum + (v.montantTTCLocation || v.location || 0), 0)
                                .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-orange-600 text-base">
                              {coutsVehicules.details
                                .filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0)
                                .filter(v => {
                                  if (filtreStatut === 'ACTIFS') return v.actif;
                                  if (filtreStatut === 'INACTIFS') return !v.actif;
                                  return true;
                                })
                                .reduce((sum, v) => sum + (v.montantTTCLeasing || v.leasing || 0), 0)
                                .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-purple-600 text-base">
                              {coutsVehicules.details
                                .filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0)
                                .filter(v => {
                                  if (filtreStatut === 'ACTIFS') return v.actif;
                                  if (filtreStatut === 'INACTIFS') return !v.actif;
                                  return true;
                                })
                                .reduce((sum, v) => sum + (v.coutAssuranceMensuel || v.assurance || 0), 0)
                                .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-blue-900 text-lg">
                              {coutsVehicules.details
                                .filter(v => (v.location || 0) > 0 || (v.leasing || 0) > 0 || (v.montantTTCLocation || 0) > 0 || (v.montantTTCLeasing || 0) > 0)
                                .filter(v => {
                                  if (filtreStatut === 'ACTIFS') return v.actif;
                                  if (filtreStatut === 'INACTIFS') return !v.actif;
                                  return true;
                                })
                                .reduce((sum, v) => sum + (v.montantTTCLocation || v.location || 0) + (v.montantTTCLeasing || v.leasing || 0) + (v.coutAssuranceMensuel || v.assurance || 0), 0)
                                .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* TABLEAU DÉTAIL ASSURANCES */}
                {expandedSections.assurance && coutsVehicules?.details && (
                  <div className="mt-6 pt-6 border-t-2 border-purple-200">
                    <div className="bg-purple-50 rounded-lg p-4 mb-4 flex items-center justify-between">
                      <h4 className="font-bold text-purple-900 flex items-center gap-2">
                        🛡️ Détail Assurances
                        <span className="text-sm text-purple-600 font-normal">
                          ({coutsVehicules.details.filter(v => v.assurance > 0 || v.coutAssuranceMensuel > 0).length} véhicules)
                        </span>
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Filtrer :</span>
                        <select
                          value={filtreStatut}
                          onChange={(e) => setFiltreStatut(e.target.value)}
                          className="px-3 py-1 text-sm border border-purple-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-400"
                        >
                          <option value="TOUS">Tous</option>
                          <option value="ACTIFS">Actifs uniquement</option>
                          <option value="INACTIFS">Inactifs uniquement</option>
                        </select>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto bg-white rounded-lg border-2 border-purple-200">
                      <table className="w-full text-sm">
                        <thead className="bg-purple-100 sticky top-0">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-bold text-purple-900">Immatriculation</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-purple-900">Actif</th>
                            <th className="px-3 py-3 text-left text-xs font-bold text-purple-900">Modèle</th>
                            <th className="px-3 py-3 text-left text-xs font-bold text-purple-900">Assureur</th>
                            <th className="px-3 py-3 text-right text-xs font-bold text-purple-900">Coût TTC mensuel</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-purple-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-100">
                          {coutsVehicules.details
                            .filter(v => v.assurance > 0 || v.coutAssuranceMensuel > 0)
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .sort((a, b) => (b.coutAssuranceMensuel || b.assurance) - (a.coutAssuranceMensuel || a.assurance))
                            .map((v, i) => (
                              <tr 
                                key={i}
                                onClick={() => {
                                  setVehiculeDetail(v);
                                  setShowModalDetail(true);
                                }}
                                className="hover:bg-purple-50 transition-colors cursor-pointer"
                              >
                                <td className="px-3 py-3">
                                  <span className="font-bold text-purple-700 hover:text-purple-900">
                                    {v.immatriculation || v.vehicule}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    v.actif 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-200 text-gray-700'
                                  }`}>
                                    {v.actif ? 'Oui' : 'Non'}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-gray-900">{v.modele || 'N/A'}</td>
                                <td className="px-3 py-3 text-gray-900">{v.assureur || 'N/A'}</td>
                                <td className="px-3 py-3 text-right font-bold text-purple-700">
                                  {(v.coutAssuranceMensuel || v.assurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVehiculeDetail(v);
                                      setShowModalDetail(true);
                                    }}
                                    className="p-2 bg-purple-100 rounded-lg hover:bg-purple-200 transition-all"
                                    title="Voir détails"
                                  >
                                    <Info className="w-4 h-4 text-purple-700" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          {coutsVehicules.details
                            .filter(v => v.assurance > 0 || v.coutAssuranceMensuel > 0)
                            .filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            }).length === 0 && (
                            <tr>
                              <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                                Aucun véhicule {filtreStatut === 'TOUS' ? '' : filtreStatut.toLowerCase()} avec assurance
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-purple-100 sticky bottom-0">
                          <tr>
                            <td colSpan="4" className="px-4 py-3 font-bold text-purple-900">TOTAL ASSURANCES</td>
                            <td className="px-4 py-3 text-right font-bold text-purple-900 text-lg">
                              {coutsVehicules.details
                                .filter(v => v.assurance > 0 || v.coutAssuranceMensuel > 0)
                                .filter(v => {
                                  if (filtreStatut === 'ACTIFS') return v.actif;
                                  if (filtreStatut === 'INACTIFS') return !v.actif;
                                  return true;
                                })
                                .reduce((sum, v) => sum + (v.coutAssuranceMensuel || v.assurance || 0), 0)
                                .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* TABLEAU DÉTAIL ENTRETIEN */}
                {expandedSections.entretien && coutsVehicules?.details && (
                  <div className="mt-6 pt-6 border-t-2 border-orange-200">
                    <div className="bg-orange-50 rounded-lg p-4 mb-4">
                      <h4 className="font-bold text-orange-900 mb-2 flex items-center gap-2">
                        🔧 Détail Entretien
                        <span className="ml-auto text-sm text-orange-600">
                          {coutsVehicules.details.filter(v => v.entretien > 0).length} véhicules avec entretien
                        </span>
                      </h4>
                    </div>
                    <div className="max-h-96 overflow-y-auto bg-white rounded-lg border-2 border-orange-200">
                      <table className="w-full text-sm">
                        <thead className="bg-orange-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-orange-900">Véhicule</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-orange-900">Coût mensuel</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-orange-900">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-100">
                          {coutsVehicules.details.filter(v => v.entretien > 0).length > 0 ? (
                            coutsVehicules.details
                              .filter(v => v.entretien > 0)
                              .sort((a, b) => b.entretien - a.entretien)
                              .map((v, i) => (
                                <tr key={i} className="hover:bg-orange-50 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900">{v.vehicule}</td>
                                  <td className="px-4 py-3 text-right font-bold text-orange-700">
                                    {v.entretien.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="px-3 py-1 bg-orange-200 text-orange-800 rounded-full text-xs font-bold">
                                      Entretien
                                    </span>
                                  </td>
                                </tr>
                              ))
                          ) : (
                            <tr>
                              <td colSpan="3" className="px-4 py-8 text-center">
                                <div className="flex flex-col items-center gap-3">
                                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                                    <span className="text-3xl">⚠️</span>
                                  </div>
                                  <div>
                                    <p className="text-gray-900 font-bold mb-1">Module Entretien non intégré</p>
                                    <p className="text-gray-500 text-sm">
                                      Les coûts d'entretien ne sont pas encore synchronisés depuis Salesforce
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {coutsVehicules.details.filter(v => v.entretien > 0).length > 0 && (
                          <tfoot className="bg-orange-100 sticky bottom-0">
                            <tr>
                              <td className="px-4 py-3 font-bold text-orange-900">TOTAL ENTRETIEN</td>
                              <td className="px-4 py-3 text-right font-bold text-orange-900 text-lg">
                                {totaux.entretien.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {/* Message si aucune section ouverte */}
                {!expandedSections.location && !expandedSections.assurance && !expandedSections.entretien && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">
                        👆 Cliquez sur une vignette ci-dessus pour voir le détail par véhicule
                      </p>
                    </div>
                  </div>
                )}

                {/* TABLEAU GLOBAL - TOUS VÉHICULES */}
                <div className="mt-8 bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-6 border-2 border-gray-300">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bold text-gray-900 text-xl flex items-center gap-2">
                      📊 Vue Globale - Tous les véhicules
                      <span className="text-sm text-gray-600 font-normal">
                        ({coutsVehicules?.details?.filter(v => {
                          if (filtreStatut === 'ACTIFS') return v.actif;
                          if (filtreStatut === 'INACTIFS') return !v.actif;
                          return true;
                        }).length} véhicules)
                      </span>
                    </h4>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Filtrer :</span>
                        <select
                          value={filtreStatut}
                          onChange={(e) => setFiltreStatut(e.target.value)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-400"
                        >
                          <option value="TOUS">Tous</option>
                          <option value="ACTIFS">Actifs uniquement</option>
                          <option value="INACTIFS">Inactifs uniquement</option>
                        </select>
                      </div>
                      
                      {/* Bouton Frais Globaux */}
                      <button
                        onClick={() => setShowFraisGlobaux(!showFraisGlobaux)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
                          showFraisGlobaux
                            ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                            : 'bg-white text-purple-700 hover:bg-purple-50 border-2 border-purple-300'
                        }`}
                      >
                        <DollarSign className="w-4 h-4" />
                        Frais Globaux
                        {showFraisGlobaux ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* FRAIS GLOBAUX SUR PÉRIODE */}
                  {showFraisGlobaux && (
                    <div className="mb-6 bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-purple-300">
                      {/* Header avec sélection période */}
                      <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <DollarSign className="w-6 h-6 text-white" />
                            <div>
                              <h2 className="text-xl font-bold text-white">Frais Globaux sur Période</h2>
                              <p className="text-purple-200 text-xs">Frais fixes (×{nbMoisPeriode} mois) + Carburant</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            {/* Bouton Export Excel */}
                            <button
                              onClick={exporterFraisGlobaux}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg transition-all hover:scale-105"
                            >
                              <Download className="w-4 h-4" />
                              <span className="font-bold text-sm">Export Excel</span>
                            </button>

                            {/* Sélecteur de période */}
                            <div className="flex items-center gap-3 bg-white bg-opacity-20 rounded-lg p-3">
                            <div>
                              <label className="text-xs text-purple-200 font-bold block mb-1">Début</label>
                              <input
                                type="date"
                                value={dateDebutPeriode}
                                onChange={(e) => setDateDebutPeriode(e.target.value)}
                                className="px-2 py-1 rounded border-2 border-purple-300 text-gray-900 text-sm font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-purple-200 font-bold block mb-1">Fin</label>
                              <input
                                type="date"
                                value={dateFinPeriode}
                                onChange={(e) => setDateFinPeriode(e.target.value)}
                                className="px-2 py-1 rounded border-2 border-purple-300 text-gray-900 text-sm font-bold"
                              />
                            </div>
                            <div className="text-center px-3">
                              <div className="text-xs text-purple-200 font-bold">Période</div>
                              <div className="text-xl font-bold text-white">{nbMoisPeriode} mois</div>
                            </div>
                          </div>
                          </div>
                        </div>
                      </div>

                      {/* Indicateurs */}
                      <div className="bg-purple-50 p-3 border-b-2 border-purple-200">
                        <div className="grid grid-cols-5 gap-3">
                          <div className="bg-white rounded-lg p-2 text-center shadow">
                            <div className="text-xs text-gray-600">Véhicules</div>
                            <div className="text-xl font-bold text-purple-600">{donneesGlobales.length}</div>
                          </div>
                          <div className="bg-white rounded-lg p-2 text-center shadow">
                            <div className="text-xs text-gray-600">Frais Fixes</div>
                            <div className="text-lg font-bold text-blue-600">
                              {totauxGlobaux.totalFixePeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 text-center shadow">
                            <div className="text-xs text-gray-600">Carburant</div>
                            <div className="text-lg font-bold text-orange-600">
                              {totauxGlobaux.carburantPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 text-center shadow">
                            <div className="text-xs text-gray-600">Volume</div>
                            <div className="text-lg font-bold text-yellow-600">
                              {totauxGlobaux.volumeCarburant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 text-center shadow border-2 border-purple-400">
                            <div className="text-xs text-purple-600 font-bold">TOTAL PÉRIODE</div>
                            <div className="text-xl font-bold text-purple-700">
                              {totauxGlobaux.totalGlobalPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tableau */}
                      {loadingCarburant ? (
                        <div className="p-8 text-center">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3"></div>
                          <p className="text-gray-600 text-sm">Chargement des données carburant...</p>
                        </div>
                      ) : (
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gradient-to-r from-purple-600 to-purple-700 text-white sticky top-0 z-10">
                              <tr>
                                <th onClick={() => handleSortGlobaux('immatriculation')} className="px-3 py-2 text-left text-xs font-bold cursor-pointer hover:bg-purple-800">
                                  Immat {getSortIconGlobaux('immatriculation')}
                                </th>
                                <th onClick={() => handleSortGlobaux('actif')} className="px-2 py-2 text-center text-xs font-bold cursor-pointer hover:bg-purple-800">
                                  ✓
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-bold">Filiale</th>
                                <th onClick={() => handleSortGlobaux('modele')} className="px-3 py-2 text-left text-xs font-bold cursor-pointer hover:bg-purple-800">
                                  Modèle {getSortIconGlobaux('modele')}
                                </th>
                                <th onClick={() => handleSortGlobaux('locationPeriode')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800">
                                  Location {getSortIconGlobaux('locationPeriode')}
                                </th>
                                <th onClick={() => handleSortGlobaux('leasingPeriode')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800">
                                  Leasing {getSortIconGlobaux('leasingPeriode')}
                                </th>
                                <th onClick={() => handleSortGlobaux('assurancePeriode')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800">
                                  Assur. {getSortIconGlobaux('assurancePeriode')}
                                </th>
                                <th onClick={() => handleSortGlobaux('totalFixePeriode')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800 bg-blue-700">
                                  Fixe {getSortIconGlobaux('totalFixePeriode')}
                                </th>
                                <th onClick={() => handleSortGlobaux('carburantPeriode')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800 bg-orange-600">
                                  Carbu. {getSortIconGlobaux('carburantPeriode')}
                                </th>
                                <th onClick={() => handleSortGlobaux('volumeCarburant')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800 bg-yellow-600">
                                  Vol. {getSortIconGlobaux('volumeCarburant')}
                                </th>
                                <th onClick={() => handleSortGlobaux('totalGlobalPeriode')} className="px-3 py-2 text-right text-xs font-bold cursor-pointer hover:bg-purple-800 bg-purple-800">
                                  TOTAL {getSortIconGlobaux('totalGlobalPeriode')}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {donneesGlobalesTries.map((v, index) => (
                                <tr key={index} className="hover:bg-purple-50 transition-colors">
                                  <td className="px-3 py-2 font-bold text-gray-900">{v.immatriculation}</td>
                                  <td className="px-2 py-2 text-center">
                                    <span className={`inline-block w-2 h-2 rounded-full ${v.actif ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {v.filialePorteuseContrat && (
                                      <span className={`px-1 py-0.5 rounded text-xs ${
                                        v.filialePorteuseContrat.includes('D&J') ? 'bg-blue-100 text-blue-700' :
                                        v.filialePorteuseContrat.includes('TPS') ? 'bg-orange-100 text-orange-700' :
                                        'bg-purple-100 text-purple-700'
                                      }`}>
                                        {v.filialePorteuseContrat}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-700">{v.modele || '-'}</td>
                                  <td className="px-3 py-2 text-right font-bold text-blue-600">
                                    {v.locationPeriode > 0 ? `${v.locationPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-green-600">
                                    {v.leasingPeriode > 0 ? `${v.leasingPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-purple-600">
                                    {v.assurancePeriode > 0 ? `${v.assurancePeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50">
                                    {v.totalFixePeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-orange-700 bg-orange-50">
                                    {v.carburantPeriode > 0 ? `${v.carburantPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` : '-'}
                                    {v.nbTransactions > 0 && <div className="text-xs text-gray-500">{v.nbTransactions} tr.</div>}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-yellow-700 bg-yellow-50">
                                    {v.volumeCarburant > 0 ? `${v.volumeCarburant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L` : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold text-purple-900 bg-purple-100">
                                    {v.totalGlobalPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gradient-to-r from-purple-700 to-purple-800 text-white font-bold sticky bottom-0">
                              <tr>
                                <td className="px-3 py-2 text-left text-xs" colSpan="4">
                                  TOTAUX ({donneesGlobales.length} véh. × {nbMoisPeriode} mois)
                                </td>
                                <td className="px-3 py-2 text-right text-xs">
                                  {totauxGlobaux.locationPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-2 text-right text-xs">
                                  {totauxGlobaux.leasingPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-2 text-right text-xs">
                                  {totauxGlobaux.assurancePeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-2 text-right text-xs bg-blue-800">
                                  {totauxGlobaux.totalFixePeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-2 text-right text-xs bg-orange-700">
                                  {totauxGlobaux.carburantPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="px-3 py-2 text-right text-xs bg-yellow-700">
                                  {totauxGlobaux.volumeCarburant.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L
                                </td>
                                <td className="px-3 py-2 text-right bg-purple-900 text-base">
                                  {totauxGlobaux.totalGlobalPeriode.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="max-h-[600px] overflow-y-auto bg-white rounded-lg border-2 border-gray-300 shadow-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-gray-200 to-blue-200 sticky top-0 z-10">
                        <tr>
                          <th 
                            onClick={() => handleSort('immatriculation', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-left text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Immatriculation {getSortIcon('immatriculation', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('actif', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-center text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Actif {getSortIcon('actif', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('filialePorteuseContrat', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-left text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Fil. Contrat {getSortIcon('filialePorteuseContrat', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('filialeProprietaire', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-left text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Fil. Propriétaire {getSortIcon('filialeProprietaire', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('modele', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-left text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Modèle {getSortIcon('modele', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('type', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-center text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Type {getSortIcon('type', sortConfig)}
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-gray-900">
                            Agence / Organisme
                          </th>
                          <th 
                            onClick={() => handleSort('assureur', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-left text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Assureur {getSortIcon('assureur', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('location', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-right text-xs font-bold text-blue-700 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Location {getSortIcon('location', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('leasing', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-right text-xs font-bold text-orange-700 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Financement {getSortIcon('leasing', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('assurance', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-right text-xs font-bold text-purple-700 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            Assurance {getSortIcon('assurance', sortConfig)}
                          </th>
                          <th 
                            onClick={() => handleSort('total', sortConfig, setSortConfig)}
                            className="px-3 py-3 text-right text-xs font-bold text-gray-900 cursor-pointer hover:bg-blue-300 transition-colors"
                          >
                            TOTAL/mois {getSortIcon('total', sortConfig)}
                          </th>
                          <th className="px-3 py-3 text-center text-xs font-bold text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {sortData(
                          coutsVehicules?.details
                            ?.filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            }) || [],
                          sortConfig,
                          (item, key) => {
                            switch(key) {
                              case 'immatriculation': return item.immatriculation || item.vehicule;
                              case 'actif': return item.actif ? 1 : 0;
                              case 'filialePorteuseContrat': return item.filialePorteuseContrat || '';
                              case 'filialeProprietaire': return item.filialeProprietaire || '';
                              case 'modele': return item.modele || '';
                              case 'type': return item.type || '';
                              case 'assureur': return item.assureur || '';
                              case 'location': return item.montantTTCLocation || item.location || 0;
                              case 'leasing': return item.montantTTCLeasing || item.leasing || 0;
                              case 'assurance': return item.coutAssuranceMensuel || item.assurance || 0;
                              case 'total': return (item.montantTTCLocation || item.location || 0) + 
                                                   (item.montantTTCLeasing || item.leasing || 0) + 
                                                   (item.coutAssuranceMensuel || item.assurance || 0);
                              default: return item[key];
                            }
                          }
                        ).map((v, i) => {
                            const totalMensuel = (v.montantTTCLocation || v.location || 0) + 
                                                 (v.montantTTCLeasing || v.leasing || 0) + 
                                                 (v.coutAssuranceMensuel || v.assurance || 0);
                            
                            return (
                              <tr 
                                key={i}
                                onClick={() => {
                                  setVehiculeDetail(v);
                                  setShowModalDetail(true);
                                }}
                                className="hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                {/* Immatriculation */}
                                <td className="px-3 py-3">
                                  <span className="font-bold text-gray-800 hover:text-blue-700">
                                    {v.immatriculation || v.vehicule}
                                  </span>
                                </td>

                                {/* Actif */}
                                <td className="px-3 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    v.actif ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                                  }`}>
                                    {v.actif ? '✓' : '✗'}
                                  </span>
                                </td>

                                {/* Filiale Porteuse Contrat */}
                                <td className="px-3 py-3">
                                  <span className={`text-xs ${
                                    v.filialePorteuseContrat === 'D&J TRANSPORT' ? 'text-blue-700 font-bold' :
                                    v.filialePorteuseContrat === 'TPS TSMC EXPRESS' ? 'text-orange-700 font-bold' :
                                    v.filialePorteuseContrat === 'G2L' ? 'text-purple-700 font-bold' :
                                    'text-gray-600'
                                  }`}>
                                    {v.filialePorteuseContrat || 'N/A'}
                                  </span>
                                </td>

                                {/* Filiale Propriétaire */}
                                <td className="px-3 py-3">
                                  <span className={`text-xs ${
                                    v.filialeProprietaire === 'D&J TRANSPORT' ? 'text-blue-700 font-bold' :
                                    v.filialeProprietaire === 'TPS TSMC EXPRESS' ? 'text-orange-700 font-bold' :
                                    v.filialeProprietaire === 'G2L' ? 'text-purple-700 font-bold' :
                                    'text-gray-600'
                                  }`}>
                                    {v.filialeProprietaire || 'N/A'}
                                  </span>
                                </td>

                                {/* Modèle */}
                                <td className="px-3 py-3 text-gray-700">{v.modele || 'N/A'}</td>

                                {/* Type */}
                                <td className="px-3 py-3 text-center">
                                  {(v.location || 0) > 0 && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold mr-1">
                                      📍 LOC
                                    </span>
                                  )}
                                  {(v.leasing || 0) > 0 && (
                                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                                      💳 FIN
                                    </span>
                                  )}
                                  {(v.location || 0) === 0 && (v.leasing || 0) === 0 && (v.assurance || 0) > 0 && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                                      🛡️ ASS
                                    </span>
                                  )}
                                </td>

                                {/* Agence / Organisme */}
                                <td className="px-3 py-3">
                                  <div className="flex flex-col gap-1 text-xs">
                                    {v.agenceLocation && v.agenceLocation !== 'N/A' && (
                                      <div>
                                        <span className="text-blue-600">📍</span> {v.agenceLocation}
                                      </div>
                                    )}
                                    {v.organismeFinancement && v.organismeFinancement !== 'N/A' && (
                                      <div>
                                        <span className="text-orange-600">💳</span> {v.organismeFinancement}
                                      </div>
                                    )}
                                    {(!v.agenceLocation || v.agenceLocation === 'N/A') && 
                                     (!v.organismeFinancement || v.organismeFinancement === 'N/A') && (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </div>
                                </td>

                                {/* Assureur */}
                                <td className="px-3 py-3 text-gray-700">
                                  {v.assureur || 'N/A'}
                                </td>

                                {/* Location */}
                                <td className="px-3 py-3 text-right">
                                  {(v.montantTTCLocation || v.location || 0) > 0 ? (
                                    <span className="font-bold text-blue-700">
                                      {(v.montantTTCLocation || v.location || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>

                                {/* Financement */}
                                <td className="px-3 py-3 text-right">
                                  {(v.montantTTCLeasing || v.leasing || 0) > 0 ? (
                                    <span className="font-bold text-orange-600">
                                      {(v.montantTTCLeasing || v.leasing || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>

                                {/* Assurance */}
                                <td className="px-3 py-3 text-right">
                                  {(v.coutAssuranceMensuel || v.assurance || 0) > 0 ? (
                                    <span className="font-bold text-purple-600">
                                      {(v.coutAssuranceMensuel || v.assurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>

                                {/* Total mensuel */}
                                <td className="px-3 py-3 text-right">
                                  <span className="font-bold text-gray-900 text-base px-3 py-1 bg-yellow-100 rounded-lg">
                                    {totalMensuel.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                  </span>
                                </td>

                                {/* Actions */}
                                <td className="px-3 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVehiculeDetail(v);
                                      setShowModalDetail(true);
                                    }}
                                    className="p-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-all"
                                    title="Voir détails"
                                  >
                                    <Info className="w-4 h-4 text-gray-700" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>

                      {/* Footer avec totaux */}
                      <tfoot className="bg-gradient-to-r from-gray-200 to-blue-200 sticky bottom-0">
                        <tr className="border-t-4 border-gray-400">
                          <td colSpan="8" className="px-4 py-4 font-bold text-gray-900 text-base">
                            📊 TOTAUX MENSUELS
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-blue-700 text-base">
                            {coutsVehicules?.details
                              ?.filter(v => {
                                if (filtreStatut === 'ACTIFS') return v.actif;
                                if (filtreStatut === 'INACTIFS') return !v.actif;
                                return true;
                              })
                              .reduce((sum, v) => sum + (v.montantTTCLocation || v.location || 0), 0)
                              .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-orange-700 text-base">
                            {coutsVehicules?.details
                              ?.filter(v => {
                                if (filtreStatut === 'ACTIFS') return v.actif;
                                if (filtreStatut === 'INACTIFS') return !v.actif;
                                return true;
                              })
                              .reduce((sum, v) => sum + (v.montantTTCLeasing || v.leasing || 0), 0)
                              .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-purple-700 text-base">
                            {coutsVehicules?.details
                              ?.filter(v => {
                                if (filtreStatut === 'ACTIFS') return v.actif;
                                if (filtreStatut === 'INACTIFS') return !v.actif;
                                return true;
                              })
                              .reduce((sum, v) => sum + (v.coutAssuranceMensuel || v.assurance || 0), 0)
                              .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-gray-900 text-xl bg-yellow-200">
                            {coutsVehicules?.details
                              ?.filter(v => {
                                if (filtreStatut === 'ACTIFS') return v.actif;
                                if (filtreStatut === 'INACTIFS') return !v.actif;
                                return true;
                              })
                              .reduce((sum, v) => sum + (v.montantTTCLocation || v.location || 0) + (v.montantTTCLeasing || v.leasing || 0) + (v.coutAssuranceMensuel || v.assurance || 0), 0)
                              .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Légende */}
                  <div className="mt-4 flex gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-bold">📍 LOC</span>
                      <span>Location</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full font-bold">💳 FIN</span>
                      <span>Financement</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-bold">🛡️ ASS</span>
                      <span>Assurance uniquement</span>
                    </div>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ANALYSE PAR ORGANISME DE FINANCEMENT */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="mt-8 bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border-2 border-orange-300">
                  <h4 className="font-bold text-orange-900 text-xl mb-6 flex items-center gap-2">
                    💳 Analyse par Organisme de Financement
                  </h4>
                  
                  <div className="space-y-4">
                    {(() => {
                      // Grouper par organisme de financement
                      const parOrganisme = {};
                      
                      coutsVehicules?.details
                        ?.filter(v => {
                          if (filtreStatut === 'ACTIFS') return v.actif;
                          if (filtreStatut === 'INACTIFS') return !v.actif;
                          return true;
                        })
                        .filter(v => (v.leasing || 0) > 0)
                        .forEach(v => {
                          const org = v.organismeFinancement || 'Non renseigné';
                          if (!parOrganisme[org]) {
                            parOrganisme[org] = {
                              vehicules: [],
                              total: 0
                            };
                          }
                          parOrganisme[org].vehicules.push(v);
                          parOrganisme[org].total += (v.montantTTCLeasing || v.leasing || 0);
                        });
                      
                      // Trier par total décroissant
                      const organismesTries = Object.entries(parOrganisme)
                        .sort((a, b) => b[1].total - a[1].total);
                      
                      return organismesTries.map(([organisme, data]) => (
                        <div key={organisme} className="bg-white rounded-xl p-4 border-2 border-orange-200">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h5 className="font-bold text-orange-800 text-lg">💳 {organisme}</h5>
                              <p className="text-xs text-gray-500">{data.vehicules.length} véhicules en financement</p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-orange-700">
                                {data.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                              </p>
                              <p className="text-xs text-gray-500">/ mois</p>
                            </div>
                          </div>
                          
                          {/* Liste des véhicules */}
                          <div className="mt-3 pt-3 border-t border-orange-100">
                            <table className="w-full text-xs">
                              <thead className="bg-orange-50">
                                <tr>
                                  <th 
                                    onClick={() => handleSort('immatriculation', sortConfigOrganisme, setSortConfigOrganisme)}
                                    className="px-2 py-2 text-left text-orange-900 cursor-pointer hover:bg-orange-100"
                                  >
                                    Immatriculation {getSortIcon('immatriculation', sortConfigOrganisme)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('modele', sortConfigOrganisme, setSortConfigOrganisme)}
                                    className="px-2 py-2 text-left text-orange-900 cursor-pointer hover:bg-orange-100"
                                  >
                                    Modèle {getSortIcon('modele', sortConfigOrganisme)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('actif', sortConfigOrganisme, setSortConfigOrganisme)}
                                    className="px-2 py-2 text-center text-orange-900 cursor-pointer hover:bg-orange-100"
                                  >
                                    Actif {getSortIcon('actif', sortConfigOrganisme)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('montant', sortConfigOrganisme, setSortConfigOrganisme)}
                                    className="px-2 py-2 text-right text-orange-900 cursor-pointer hover:bg-orange-100"
                                  >
                                    Montant mensuel {getSortIcon('montant', sortConfigOrganisme)}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-orange-50">
                                {sortData(
                                  data.vehicules,
                                  sortConfigOrganisme,
                                  (item, key) => {
                                    switch(key) {
                                      case 'immatriculation': return item.immatriculation || item.vehicule;
                                      case 'modele': return item.modele || '';
                                      case 'actif': return item.actif ? 1 : 0;
                                      case 'montant': return item.montantTTCLeasing || item.leasing || 0;
                                      default: return item[key];
                                    }
                                  }
                                ).map((v, i) => (
                                  <tr key={i} className="hover:bg-orange-50">
                                    <td className="px-2 py-2 font-bold text-gray-700">{v.immatriculation || v.vehicule}</td>
                                    <td className="px-2 py-2 text-gray-600">{v.modele || 'N/A'}</td>
                                    <td className="px-2 py-2 text-center">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        v.actif ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                                      }`}>
                                        {v.actif ? '✓' : '✗'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2 text-right font-bold text-orange-700">
                                      {(v.montantTTCLeasing || v.leasing || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ));
                    })()}
                    
                    {/* Total général financement */}
                    <div className="bg-gradient-to-r from-orange-200 to-red-200 rounded-xl p-4 border-2 border-orange-400">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-orange-900 text-lg">💳 TOTAL FINANCEMENT</span>
                        <span className="text-3xl font-bold text-orange-900">
                          {coutsVehicules?.details
                            ?.filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.montantTTCLeasing || v.leasing || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € / mois
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ANALYSE PAR AGENCE DE LOCATION */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="mt-8 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border-2 border-blue-300">
                  <h4 className="font-bold text-blue-900 text-xl mb-6 flex items-center gap-2">
                    📍 Analyse par Agence de Location
                  </h4>
                  
                  <div className="space-y-4">
                    {(() => {
                      // Grouper par agence
                      const parAgence = {};
                      
                      coutsVehicules?.details
                        ?.filter(v => {
                          if (filtreStatut === 'ACTIFS') return v.actif;
                          if (filtreStatut === 'INACTIFS') return !v.actif;
                          return true;
                        })
                        .filter(v => (v.location || 0) > 0)
                        .forEach(v => {
                          const agence = v.agenceLocation || 'Non renseigné';
                          if (!parAgence[agence]) {
                            parAgence[agence] = {
                              vehicules: [],
                              total: 0
                            };
                          }
                          parAgence[agence].vehicules.push(v);
                          parAgence[agence].total += (v.montantTTCLocation || v.location || 0);
                        });
                      
                      // Trier par total décroissant
                      const agencesTriees = Object.entries(parAgence)
                        .sort((a, b) => b[1].total - a[1].total);
                      
                      return agencesTriees.map(([agence, data]) => (
                        <div key={agence} className="bg-white rounded-xl p-4 border-2 border-blue-200">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h5 className="font-bold text-blue-800 text-lg">📍 {agence}</h5>
                              <p className="text-xs text-gray-500">{data.vehicules.length} véhicules en location</p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-blue-700">
                                {data.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                              </p>
                              <p className="text-xs text-gray-500">/ mois</p>
                            </div>
                          </div>
                          
                          {/* Liste des véhicules */}
                          <div className="mt-3 pt-3 border-t border-blue-100">
                            <table className="w-full text-xs">
                              <thead className="bg-blue-50">
                                <tr>
                                  <th 
                                    onClick={() => handleSort('immatriculation', sortConfigAgence, setSortConfigAgence)}
                                    className="px-2 py-2 text-left text-blue-900 cursor-pointer hover:bg-blue-100"
                                  >
                                    Immatriculation {getSortIcon('immatriculation', sortConfigAgence)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('modele', sortConfigAgence, setSortConfigAgence)}
                                    className="px-2 py-2 text-left text-blue-900 cursor-pointer hover:bg-blue-100"
                                  >
                                    Modèle {getSortIcon('modele', sortConfigAgence)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('actif', sortConfigAgence, setSortConfigAgence)}
                                    className="px-2 py-2 text-center text-blue-900 cursor-pointer hover:bg-blue-100"
                                  >
                                    Actif {getSortIcon('actif', sortConfigAgence)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('montant', sortConfigAgence, setSortConfigAgence)}
                                    className="px-2 py-2 text-right text-blue-900 cursor-pointer hover:bg-blue-100"
                                  >
                                    Montant mensuel {getSortIcon('montant', sortConfigAgence)}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-blue-50">
                                {sortData(
                                  data.vehicules,
                                  sortConfigAgence,
                                  (item, key) => {
                                    switch(key) {
                                      case 'immatriculation': return item.immatriculation || item.vehicule;
                                      case 'modele': return item.modele || '';
                                      case 'actif': return item.actif ? 1 : 0;
                                      case 'montant': return item.montantTTCLocation || item.location || 0;
                                      default: return item[key];
                                    }
                                  }
                                ).map((v, i) => (
                                  <tr key={i} className="hover:bg-blue-50">
                                    <td className="px-2 py-2 font-bold text-gray-700">{v.immatriculation || v.vehicule}</td>
                                    <td className="px-2 py-2 text-gray-600">{v.modele || 'N/A'}</td>
                                    <td className="px-2 py-2 text-center">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        v.actif ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                                      }`}>
                                        {v.actif ? '✓' : '✗'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2 text-right font-bold text-blue-700">
                                      {(v.montantTTCLocation || v.location || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ));
                    })()}
                    
                    {/* Total général location */}
                    <div className="bg-gradient-to-r from-blue-200 to-cyan-200 rounded-xl p-4 border-2 border-blue-400">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-900 text-lg">📍 TOTAL LOCATION</span>
                        <span className="text-3xl font-bold text-blue-900">
                          {coutsVehicules?.details
                            ?.filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.montantTTCLocation || v.location || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € / mois
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* ANALYSE PAR ASSUREUR */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="mt-8 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-300">
                  <h4 className="font-bold text-purple-900 text-xl mb-6 flex items-center gap-2">
                    🛡️ Analyse par Assureur
                  </h4>
                  
                  <div className="space-y-4">
                    {(() => {
                      // Grouper par assureur
                      const parAssureur = {};
                      
                      coutsVehicules?.details
                        ?.filter(v => {
                          if (filtreStatut === 'ACTIFS') return v.actif;
                          if (filtreStatut === 'INACTIFS') return !v.actif;
                          return true;
                        })
                        .filter(v => (v.assurance || 0) > 0)
                        .forEach(v => {
                          const assureur = v.assureur || 'Non renseigné';
                          if (!parAssureur[assureur]) {
                            parAssureur[assureur] = {
                              vehicules: [],
                              total: 0
                            };
                          }
                          parAssureur[assureur].vehicules.push(v);
                          parAssureur[assureur].total += (v.coutAssuranceMensuel || v.assurance || 0);
                        });
                      
                      // Trier par total décroissant
                      const assureursTries = Object.entries(parAssureur)
                        .sort((a, b) => b[1].total - a[1].total);
                      
                      return assureursTries.map(([assureur, data]) => (
                        <div key={assureur} className="bg-white rounded-xl p-4 border-2 border-purple-200">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h5 className="font-bold text-purple-800 text-lg">🛡️ {assureur}</h5>
                              <p className="text-xs text-gray-500">{data.vehicules.length} véhicules assurés</p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-purple-700">
                                {data.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                              </p>
                              <p className="text-xs text-gray-500">/ mois</p>
                            </div>
                          </div>
                          
                          {/* Liste des véhicules */}
                          <div className="mt-3 pt-3 border-t border-purple-100">
                            <table className="w-full text-xs">
                              <thead className="bg-purple-50">
                                <tr>
                                  <th 
                                    onClick={() => handleSort('immatriculation', sortConfigAssureur, setSortConfigAssureur)}
                                    className="px-2 py-2 text-left text-purple-900 cursor-pointer hover:bg-purple-100"
                                  >
                                    Immatriculation {getSortIcon('immatriculation', sortConfigAssureur)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('modele', sortConfigAssureur, setSortConfigAssureur)}
                                    className="px-2 py-2 text-left text-purple-900 cursor-pointer hover:bg-purple-100"
                                  >
                                    Modèle {getSortIcon('modele', sortConfigAssureur)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('actif', sortConfigAssureur, setSortConfigAssureur)}
                                    className="px-2 py-2 text-center text-purple-900 cursor-pointer hover:bg-purple-100"
                                  >
                                    Actif {getSortIcon('actif', sortConfigAssureur)}
                                  </th>
                                  <th 
                                    onClick={() => handleSort('montant', sortConfigAssureur, setSortConfigAssureur)}
                                    className="px-2 py-2 text-right text-purple-900 cursor-pointer hover:bg-purple-100"
                                  >
                                    Montant mensuel {getSortIcon('montant', sortConfigAssureur)}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-purple-50">
                                {sortData(
                                  data.vehicules,
                                  sortConfigAssureur,
                                  (item, key) => {
                                    switch(key) {
                                      case 'immatriculation': return item.immatriculation || item.vehicule;
                                      case 'modele': return item.modele || '';
                                      case 'actif': return item.actif ? 1 : 0;
                                      case 'montant': return item.coutAssuranceMensuel || item.assurance || 0;
                                      default: return item[key];
                                    }
                                  }
                                ).map((v, i) => (
                                  <tr key={i} className="hover:bg-purple-50">
                                    <td className="px-2 py-2 font-bold text-gray-700">{v.immatriculation || v.vehicule}</td>
                                    <td className="px-2 py-2 text-gray-600">{v.modele || 'N/A'}</td>
                                    <td className="px-2 py-2 text-center">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        v.actif ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                                      }`}>
                                        {v.actif ? '✓' : '✗'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2 text-right font-bold text-purple-700">
                                      {(v.coutAssuranceMensuel || v.assurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ));
                    })()}
                    
                    {/* Total général assurance */}
                    <div className="bg-gradient-to-r from-purple-200 to-pink-200 rounded-xl p-4 border-2 border-purple-400">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-purple-900 text-lg">🛡️ TOTAL ASSURANCE</span>
                        <span className="text-3xl font-bold text-purple-900">
                          {coutsVehicules?.details
                            ?.filter(v => {
                              if (filtreStatut === 'ACTIFS') return v.actif;
                              if (filtreStatut === 'INACTIFS') return !v.actif;
                              return true;
                            })
                            .reduce((sum, v) => sum + (v.coutAssuranceMensuel || v.assurance || 0), 0)
                            .toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € / mois
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Onglet Facturation */}
          {activeTab === 'FACTURATION' && (
            <div className="space-y-6">
              {/* Bouton nouvelle facture */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-800">📄 Facturation</h3>
                  <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {showForm ? 'Annuler' : '+ Nouvelle facture'}
                  </button>
                </div>

                {/* Formulaire */}
                {showForm && (
                  <form onSubmit={handleSubmitFacture} className="bg-gray-50 rounded-lg p-6 mb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Société émettrice *
                        </label>
                        <select
                          value={formFacture.societeEmettrice}
                          onChange={(e) => handleFormChange('societeEmettrice', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          required
                        >
                          <option value="">-- Sélectionner --</option>
                          {societesEmettrices.map(s => (
                            <option key={s.id} value={s.nom}>{s.nom}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client facturé *
                        </label>
                        <input
                          type="text"
                          value={formFacture.societeFacturee}
                          onChange={(e) => handleFormChange('societeFacturee', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          N° Facture *
                        </label>
                        <input
                          type="text"
                          value={formFacture.numero}
                          onChange={(e) => handleFormChange('numero', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Date facture *
                        </label>
                        <input
                          type="date"
                          value={formFacture.dateFacture}
                          onChange={(e) => handleFormChange('dateFacture', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Chargeur *
                        </label>
                        <select
                          value={formFacture.chargeurNom}
                          onChange={(e) => handleFormChange('chargeurNom', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          required
                        >
                          <option value="">-- Sélectionner --</option>
                          <option value="DPD">DPD</option>
                          <option value="CIBLEX">CIBLEX</option>
                          <option value="CHRONOPOST">CHRONOPOST</option>
                          <option value="GLS">GLS</option>
                          <option value="RELAIS COLIS">RELAIS COLIS</option>
                          <option value="COLISSIMO">COLISSIMO</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mode facturation
                        </label>
                        <input
                          type="text"
                          value={formFacture.modeFacturation}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Montant HT *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formFacture.montantHT}
                          onChange={(e) => handleFormChange('montantHT', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          TVA
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formFacture.tva}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Montant TTC
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formFacture.montantTTC}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                          readOnly
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        ✓ Enregistrer la facture
                      </button>
                    </div>
                  </form>
                )}

                {/* Liste des factures */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">N°</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Émetteur</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Client</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Chargeur</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-600">HT</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-600">TTC</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {factures.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                            Aucune facture enregistrée
                          </td>
                        </tr>
                      ) : (
                        factures.map((f, i) => (
                          <tr key={f.id || i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{f.numero}</td>
                            <td className="px-4 py-3">{f.societeEmettrice || '-'}</td>
                            <td className="px-4 py-3">{f.societeFacturee || '-'}</td>
                            <td className="px-4 py-3">
                              {f.chargeurNom && (
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  f.modeFacturation === 'POINT' 
                                    ? 'bg-purple-100 text-purple-700' 
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {f.chargeurNom}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{f.dateFacture}</td>
                            <td className="px-4 py-3 text-right">{(f.montantHT || 0).toLocaleString('fr-FR')} €</td>
                            <td className="px-4 py-3 text-right font-bold">{(f.montantTTC || 0).toLocaleString('fr-FR')} €</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs ${
                                f.statut === 'VALIDEE' ? 'bg-green-100 text-green-700' :
                                f.statut === 'REFUSEE' ? 'bg-red-100 text-red-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {f.statut || 'EN_ATTENTE'}
                              </span>
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
        </>
      )}

      {/* MODAL DÉTAIL VÉHICULE */}
      {showModalDetail && vehiculeDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                    <Truck className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{vehiculeDetail.immatriculation || vehiculeDetail.vehicule}</h2>
                    <p className="text-white/80">{vehiculeDetail.modele || 'Modèle non renseigné'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModalDetail(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                  vehiculeDetail.actif 
                    ? 'bg-green-400 text-green-900' 
                    : 'bg-gray-400 text-gray-900'
                }`}>
                  {vehiculeDetail.actif ? '✓ Actif' : '✗ Inactif'}
                </span>
                {vehiculeDetail.marque && (
                  <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                    {vehiculeDetail.marque}
                  </span>
                )}
                {vehiculeDetail.type && (
                  <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                    {vehiculeDetail.type}
                  </span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Coûts mensuels */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  💰 Coûts mensuels
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  {/* Location */}
                  <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                    <p className="text-xs text-blue-600 font-medium mb-1">Location TTC</p>
                    <p className="text-xs text-gray-500 mb-2">
                      📍 {vehiculeDetail.agenceLocation || 'N/A'}
                    </p>
                    <p className="text-2xl font-bold text-blue-700">
                      {(vehiculeDetail.montantTTCLocation || vehiculeDetail.location || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </p>
                  </div>

                  {/* Leasing */}
                  <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <p className="text-xs text-orange-600 font-medium mb-1">Leasing TTC</p>
                    <p className="text-xs text-gray-500 mb-2">
                      💳 {vehiculeDetail.organismeFinancement || 'N/A'}
                    </p>
                    <p className="text-2xl font-bold text-orange-700">
                      {(vehiculeDetail.montantTTCLeasing || vehiculeDetail.leasing || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </p>
                  </div>

                  {/* Assurance */}
                  <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
                    <p className="text-xs text-purple-600 font-medium mb-1">Assurance TTC</p>
                    <p className="text-xs text-gray-500 mb-2">
                      🛡️ {vehiculeDetail.assureur || 'N/A'}
                    </p>
                    {vehiculeDetail.numeroContratAssurance && (
                      <p className="text-xs text-gray-400 mb-1">
                        N° {vehiculeDetail.numeroContratAssurance}
                      </p>
                    )}
                    <p className="text-2xl font-bold text-purple-700">
                      {(vehiculeDetail.coutAssuranceMensuel || vehiculeDetail.assurance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </p>
                  </div>
                </div>

                {/* Total mensuel */}
                <div className="mt-4 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl p-4 border-2 border-blue-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-800 text-lg">💎 TOTAL MENSUEL</span>
                    <span className="text-3xl font-bold text-blue-900">
                      {((vehiculeDetail.montantTTCLocation || vehiculeDetail.location || 0) + 
                        (vehiculeDetail.montantTTCLeasing || vehiculeDetail.leasing || 0) +
                        (vehiculeDetail.coutAssuranceMensuel || vehiculeDetail.assurance || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-600">
                    <span>Location: {(vehiculeDetail.montantTTCLocation || vehiculeDetail.location || 0).toFixed(2)} €</span>
                    <span>Leasing: {(vehiculeDetail.montantTTCLeasing || vehiculeDetail.leasing || 0).toFixed(2)} €</span>
                    <span>Assurance: {(vehiculeDetail.coutAssuranceMensuel || vehiculeDetail.assurance || 0).toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* Informations techniques */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🔧 Informations techniques
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {vehiculeDetail.kilometrage && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Gauge className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Kilométrage</p>
                        <p className="font-bold">{vehiculeDetail.kilometrage.toLocaleString()} km</p>
                      </div>
                    </div>
                  )}
                  {vehiculeDetail.carburant && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Fuel className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Carburant</p>
                        <p className="font-bold">{vehiculeDetail.carburant}</p>
                      </div>
                    </div>
                  )}
                  {vehiculeDetail.puissanceFiscale && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-5 h-5 flex items-center justify-center text-gray-500 font-bold">CV</div>
                      <div>
                        <p className="text-xs text-gray-500">Puissance fiscale</p>
                        <p className="font-bold">{vehiculeDetail.puissanceFiscale} CV</p>
                      </div>
                    </div>
                  )}
                  {vehiculeDetail.dateMiseEnService && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <Calendar className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Mise en service</p>
                        <p className="font-bold">{vehiculeDetail.dateMiseEnService}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Échéances */}
              {(vehiculeDetail.dateProchainCT || vehiculeDetail.dateProchaineRevision) && (
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    📅 Prochaines échéances
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {vehiculeDetail.dateProchainCT && (
                      <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                        <p className="text-xs text-orange-600 font-medium">Contrôle technique</p>
                        <p className="text-lg font-bold text-orange-700">{vehiculeDetail.dateProchainCT}</p>
                      </div>
                    )}
                    {vehiculeDetail.dateProchaineRevision && (
                      <div className="p-4 bg-green-50 rounded-xl border-2 border-green-200">
                        <p className="text-xs text-green-600 font-medium">Révision</p>
                        <p className="text-lg font-bold text-green-700">{vehiculeDetail.dateProchaineRevision}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Numéro de châssis */}
              {vehiculeDetail.numeroChassis && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">Numéro de châssis</p>
                  <p className="font-mono text-sm">{vehiculeDetail.numeroChassis}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowModalDetail(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
