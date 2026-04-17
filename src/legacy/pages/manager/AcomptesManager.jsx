import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Euro, Clock, CheckCircle, XCircle, Calendar, TrendingUp, TrendingDown,
  AlertTriangle, Users, DollarSign, Activity, Download, Filter,
  BarChart3, PieChart, Award, Zap
} from 'lucide-react';
import {
  BarChart, Bar, PieChart as RechartsPie, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { exportToExcel, exportToPDF, exportDemandesEnAttente } from '../../utils/exportService';
import API_BASE from '../../config/api';

const AcomptesManager = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [acomptesEnAttente, setAcomptesEnAttente] = useState([]);
  const [acomptesValides, setAcomptesValides] = useState([]);
  const ongletActif = searchParams.get('tab') || 'dashboard'; // 'dashboard', 'en-attente' ou 'valides'
  const [loading, setLoading] = useState(true);
  const [modalValidation, setModalValidation] = useState(null);
  const [modalRefus, setModalRefus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [demandesEnAttente, setDemandesEnAttente] = useState([]);
  const [historiqueRecent, setHistoriqueRecent] = useState([]);
  const [employesData, setEmployesData] = useState([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [kpiModal, setKpiModal] = useState(null);
  const [allAcomptes, setAllAcomptes] = useState([]);
  const [modalCreerAcompte, setModalCreerAcompte] = useState(false);
  const [nouvelAcompte, setNouvelAcompte] = useState({
    employeId: '',
    montant: '',
    motif: '',
    typePaiement: 'UNIQUE',
    nbMensualites: 1,
    mensualitesPersonnalisees: []
  });
  
  // Filtres
  const [filtres, setFiltres] = useState({
    periode: 'mois',
    statut: 'TOUS',
    recherche: ''
  });
  
  const changerOnglet = (nouvelOnglet) => {
    if (nouvelOnglet === 'dashboard') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: nouvelOnglet });
    }
  };
  
  // Formulaire validation
  const getMoisParDefaut = () => {
    const maintenant = new Date();
    // Toujours proposer le mois actuel ou suivant (jamais avant)
    // Si on est après le 20 du mois, proposer le mois suivant
    if (maintenant.getDate() > 20) {
      const moisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
      return moisSuivant.toISOString().substring(0, 7);
    }
    // Sinon, proposer le mois actuel
    return maintenant.toISOString().substring(0, 7);
  };

  const [modalites, setModalites] = useState({
    type: 'UNIQUE',
    nbMensualites: 1,
    mensualitesPersonnalisees: [] // Sera initialisé avec le mois actuel
  });
  
  const [motifRefus, setMotifRefus] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showExportMenu && !e.target.closest('.relative')) {
        setShowExportMenu(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showExportMenu]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Analytics dashboard
      const analyticsRes = await fetch(`${API_BASE}/api/acomptes/analytics/dashboard`);
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        console.log('[DASHBOARD] Analytics reçues:', analyticsData);
        console.log('[DASHBOARD] Evolution mensuelle:', analyticsData.evolutionMensuelle);
        console.log('[DASHBOARD] Montant payé:', analyticsData.kpis?.montantTotalPaye);
        setAnalytics(analyticsData);
      } else {
        console.error('[DASHBOARD] Erreur récupération analytics:', analyticsRes.status);
      }
      
      // Demandes en attente avec priorités (uniquement celles vraiment en attente, pas en paiement)
      const attenteRes = await fetch(`${API_BASE}/api/acomptes/analytics/en-attente`);
      if (attenteRes.ok) {
        const attenteData = await attenteRes.json();
        // Filtrer pour ne garder que celles vraiment en attente (statut === 'En attente')
        const vraimentEnAttente = attenteData.filter(a => a.statut === 'En attente');
        setDemandesEnAttente(vraimentEnAttente);
        setAcomptesEnAttente(vraimentEnAttente);
      }
      
      // Historique récent
      const historiqueRes = await fetch(`${API_BASE}/api/acomptes/analytics/historique-recent?limit=10`);
      if (historiqueRes.ok) {
        const historiqueData = await historiqueRes.json();
        setHistoriqueRecent(historiqueData);
      }
      
      // Employés (pour afficher noms)
      const employesRes = await fetch(`${API_BASE}/api/employes`);
      if (employesRes.ok) {
        const employesDataRes = await employesRes.json();
        setEmployesData(employesDataRes.employes || []);
      }
      
      // Récupérer tous les acomptes pour les détails
      const allAcomptesRes = await fetch(`${API_BASE}/api/acomptes`);
      if (allAcomptesRes.ok) {
        const allAcomptesData = await allAcomptesRes.json();
        setAllAcomptes(allAcomptesData);
        const valides = allAcomptesData.filter(a => 
          a.statut === 'Validée par manager' || 
          a.statut === 'En cours de paiement' || 
          a.statut === 'Payée'
        );
        setAcomptesValides(valides);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const getEmployeNom = (employeId) => {
    const employe = employesData.find(e => String(e.id) === String(employeId));
    return employe?.nomComplet || 'Employé inconnu';
  };

  const exporterDonnees = async (type) => {
    try {
      if (!analytics) {
        alert('Veuillez attendre le chargement des données');
        return;
      }
      
      switch(type) {
        case 'excel':
          exportToExcel(analytics, employesData);
          break;
        case 'pdf':
          await exportToPDF(analytics, employesData);
          break;
        case 'attente-excel':
          exportDemandesEnAttente(demandesEnAttente, employesData);
          break;
        default:
          break;
      }
      setShowExportMenu(false);
      alert('Export généré avec succès !');
    } catch (err) {
      console.error('Erreur export:', err);
      alert('Erreur lors de l\'export');
    }
  };

  // Initialiser les mensualités quand le modal s'ouvre
  useEffect(() => {
    if (modalValidation && modalites.mensualitesPersonnalisees.length === 0) {
      const mensualitesInitiales = [];
      const montantParMois = Math.round(modalValidation.montant / modalites.nbMensualites * 100) / 100;
      let restant = modalValidation.montant;
      const moisDebut = getMoisParDefaut();
      const [annee, mois] = moisDebut.split('-');
      
      for (let i = 0; i < modalites.nbMensualites; i++) {
        // mois est déjà au format "01"-"12", donc on soustrait 1 pour l'index JavaScript (0-11)
        // puis on ajoute i pour les mois suivants
        const date = new Date(parseInt(annee), parseInt(mois) - 1 + i, 1);
        const moisPaiement = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const montant = i === modalites.nbMensualites - 1 
          ? restant 
          : montantParMois;
        
        mensualitesInitiales.push({
          numero: i + 1,
          mois: moisPaiement,
          montant: montant
        });
        
        restant -= montant;
      }
      
      setModalites({
        ...modalites,
        mensualitesPersonnalisees: mensualitesInitiales
      });
    }
  }, [modalValidation]);


  const handleValider = async () => {
    console.log('[ACOMPTE_MANAGER] ========== DÉBUT VALIDATION ==========');
    console.log('[ACOMPTE_MANAGER] Modal validation:', modalValidation);
    console.log('[ACOMPTE_MANAGER] Modalités:', modalites);
    console.log('[ACOMPTE_MANAGER] User:', user);
    
    try {
      // Validation des modalités avant envoi
      if (!modalites.type) {
        console.error('[ACOMPTE_MANAGER] Validation échouée: type de paiement manquant');
        alert('Veuillez sélectionner le type de paiement');
        return;
      }
      
      if (calculerMensualites.length === 0) {
        console.error('[ACOMPTE_MANAGER] Validation échouée: aucune mensualité définie');
        alert('Veuillez définir les mensualités');
        return;
      }
      
      if (modalites.type === 'ECHELONNE' && (!modalites.nbMensualites || modalites.nbMensualites < 2)) {
        alert('Le nombre de mensualités doit être au moins 2 pour un paiement échelonné');
        return;
      }
      
      if (!user || (!user.userId && !user.id)) {
        alert('Erreur: Utilisateur non identifié');
        return;
      }
      
      // Utiliser les mensualités personnalisées si disponibles, sinon calculer automatiquement
      const mensualitesFinales = modalites.mensualitesPersonnalisees && modalites.mensualitesPersonnalisees.length > 0
        ? modalites.mensualitesPersonnalisees
        : calculerMensualites;

      const payload = {
        validateurId: user.userId || user.id,
        validateurNom: user.nom || user.nomComplet || 'Manager',
        modalites: {
          type: modalites.type,
          nbMensualites: modalites.type === 'UNIQUE' ? 1 : modalites.nbMensualites,
          mensualites: mensualitesFinales // Envoyer les mensualités (personnalisées ou calculées)
        }
      };
      
      console.log('[ACOMPTE_MANAGER] Validation avec payload:', payload);
      console.log('[ACOMPTE_MANAGER] Acompte ID:', modalValidation.id);
      console.log('[ACOMPTE_MANAGER] URL:', `${API_BASE}/api/acomptes/${modalValidation.id}/valider-avec-modalites`);
      
      const url = `${API_BASE}/api/acomptes/${modalValidation.id}/valider-avec-modalites`;
      console.log('[ACOMPTE_MANAGER] Envoi requête POST vers:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      console.log('[ACOMPTE_MANAGER] Réponse reçue, status:', response.status);
      console.log('[ACOMPTE_MANAGER] Réponse OK?', response.ok);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        console.error('[ACOMPTE_MANAGER] Erreur réponse:', errorData);
        throw new Error(errorData.error || 'Erreur validation');
      }
      
      const result = await response.json();
      console.log('[ACOMPTE_MANAGER] Validation réussie:', result);
      
      // Marquer l'acompte comme lu
      try {
        await fetch(`${API_BASE}/api/acomptes/${modalValidation.id}/marquer-lu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'MANAGER' })
        });
      } catch (err) {
        console.error('Erreur marquer comme lu:', err);
      }
      
      setModalValidation(null);
      setModalites({
        type: 'UNIQUE',
        nbMensualites: 1,
        mensualitesPersonnalisees: []
      });
      fetchData();
      setSearchParams({ tab: 'valides' }); // Basculer vers l'onglet "Validés"
      alert('Acompte validé avec succès !');
    } catch (err) {
      console.error('Erreur:', err);
      alert(`Erreur lors de la validation: ${err.message || 'Erreur inconnue'}`);
    }
  };

  const handleRefuser = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/acomptes/${modalRefus.id}/refuser`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            validateurId: user.userId || user.id,
            validateurNom: user.nom || user.nomComplet,
            motifRefus
          })
        }
      );
      
      if (!response.ok) throw new Error('Erreur refus');
      
      // Marquer l'acompte comme lu
      try {
        await fetch(`${API_BASE}/api/acomptes/${modalRefus.id}/marquer-lu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'MANAGER' })
        });
      } catch (err) {
        console.error('Erreur marquer comme lu:', err);
      }
      
      setModalRefus(null);
      setMotifRefus('');
      fetchData();
      alert('Acompte refusé');
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors du refus');
    }
  };

  const calculerMensualites = useMemo(() => {
    if (!modalValidation) return [];
    
    // Toujours utiliser les mensualités personnalisées (elles sont initialisées au chargement)
    if (modalites.mensualitesPersonnalisees && modalites.mensualitesPersonnalisees.length > 0) {
      return modalites.mensualitesPersonnalisees;
    }
    
    // Fallback : calculer automatiquement avec le mois actuel
    const mensualites = [];
    const montantParMois = Math.round(modalValidation.montant / modalites.nbMensualites * 100) / 100;
    let restant = modalValidation.montant;
    const moisDebut = getMoisParDefaut();
    const [annee, mois] = moisDebut.split('-');
    
    for (let i = 0; i < modalites.nbMensualites; i++) {
      // mois est déjà au format "01"-"12", donc on soustrait 1 pour l'index JavaScript (0-11)
      // puis on ajoute i pour les mois suivants
      const date = new Date(parseInt(annee), parseInt(mois) - 1 + i, 1);
      const moisPaiement = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const montant = i === modalites.nbMensualites - 1 
        ? restant 
        : montantParMois;
      
      mensualites.push({
        numero: i + 1,
        mois: moisPaiement,
        montant: montant
      });
      
      restant -= montant;
    }
    
    return mensualites;
  }, [modalValidation, modalites.nbMensualites, modalites.mensualitesPersonnalisees]);

  const mettreAJourMensualite = (index, nouveauMois) => {
    const mensualites = calculerMensualites;
    const nouvellesMensualites = [...mensualites];
    
    // Si c'est la première mensualité (index 0), recalculer toutes les mensualités suivantes
    if (index === 0) {
      nouvellesMensualites[0].mois = nouveauMois;
      
      // Recalculer les mensualités suivantes à partir du nouveau premier mois
      const [annee, mois] = nouveauMois.split('-');
      const montantParMois = Math.round(modalValidation.montant / modalites.nbMensualites * 100) / 100;
      let restant = modalValidation.montant;
      
      for (let i = 0; i < nouvellesMensualites.length; i++) {
        // mois est déjà au format "01"-"12", donc on soustrait 1 pour l'index JavaScript (0-11)
        // puis on ajoute i pour les mois suivants
        const date = new Date(parseInt(annee), parseInt(mois) - 1 + i, 1);
        const moisPaiement = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const montant = i === nouvellesMensualites.length - 1 
          ? restant 
          : montantParMois;
        
        nouvellesMensualites[i] = {
          numero: i + 1,
          mois: moisPaiement,
          montant: montant
        };
        
        restant -= montant;
      }
    } else {
      // Pour les autres mensualités, mettre à jour seulement celle-ci (sans affecter les autres)
      nouvellesMensualites[index].mois = nouveauMois;
    }
    
    setModalites({
      ...modalites,
      mensualitesPersonnalisees: nouvellesMensualites
    });
  };

  const getMoisOptions = () => {
    const mois = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return mois.map((nom, index) => ({
      valeur: String(index + 1).padStart(2, '0'),
      nom
    }));
  };

  const getAnneeOptions = () => {
    const anneeActuelle = new Date().getFullYear();
    const annees = [];
    for (let i = 0; i < 3; i++) {
      annees.push(anneeActuelle + i);
    }
    return annees;
  };

  const convertirMoisAnneeEnString = (mois, annee) => {
    return `${annee}-${mois}`;
  };

  const convertirStringEnMoisAnnee = (moisString) => {
    const [annee, mois] = moisString.split('-');
    return { mois, annee };
  };

  console.log('[ACOMPTES_MANAGER] Rendu - ongletActif:', ongletActif, 'en attente:', acomptesEnAttente.length, 'valides:', acomptesValides.length);
  console.log('[ACOMPTES_MANAGER] Les onglets doivent être visibles maintenant');

  // Mémoïser les calculs lourds
  const evolutionMemoized = useMemo(() => 
    analytics?.evolutionMensuelle || [], 
    [analytics]
  );

  const topDemandeursMemoized = useMemo(() => 
    analytics?.topDemandeurs.slice(0, 5) || [], 
    [analytics]
  );

  // Filtrer l'historique selon les filtres
  const historiqueFiltre = useMemo(() => {
    if (!historiqueRecent) return [];
    let filtered = [...historiqueRecent];
    
    // Filtre période
    if (filtres.periode !== 'tout') {
      const now = new Date();
      let dateLimite;
      switch(filtres.periode) {
        case 'semaine':
          dateLimite = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'mois':
          dateLimite = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'trimestre':
          dateLimite = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'annee':
          dateLimite = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          dateLimite = null;
      }
      if (dateLimite) {
        filtered = filtered.filter(a => new Date(a.createdAt || a.updatedAt) >= dateLimite);
      }
    }
    
    // Filtre statut
    if (filtres.statut !== 'TOUS') {
      filtered = filtered.filter(a => a.statut === filtres.statut);
    }
    
    // Filtre recherche
    if (filtres.recherche) {
      const rechercheLower = filtres.recherche.toLowerCase();
      filtered = filtered.filter(a => {
        const nomEmploye = getEmployeNom(a.employeId).toLowerCase();
        return nomEmploye.includes(rechercheLower);
      });
    }
    
    return filtered;
  }, [historiqueRecent, filtres, employesData]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des acomptes</h1>
            <p className="text-gray-600 mt-1">Validation et suivi des demandes d'acomptes</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setModalCreerAcompte(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Euro className="w-5 h-5" />
              <span className="hidden md:inline">Créer un acompte</span>
              <span className="md:hidden">Créer</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                <span className="hidden md:inline">Exporter</span>
              </button>
              
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                  <div className="py-1">
                    <button
                      onClick={() => exporterDonnees('excel')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      <Download className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Excel complet</p>
                        <p className="text-xs text-gray-500">Toutes les données</p>
                      </div>
                    </button>
                    <button
                      onClick={() => exporterDonnees('pdf')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      <Download className="w-5 h-5 text-red-600" />
                      <div>
                        <p className="font-medium text-gray-900">Rapport PDF</p>
                        <p className="text-xs text-gray-500">Dashboard + stats</p>
                      </div>
                    </button>
                    <button
                      onClick={() => exporterDonnees('attente-excel')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      <Download className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="font-medium text-gray-900">Demandes en attente</p>
                        <p className="text-xs text-gray-500">Excel des demandes</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Activity className="w-5 h-5" />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 bg-white rounded-xl shadow-sm p-1 flex gap-1 overflow-x-auto">
        <button
          onClick={() => changerOnglet('dashboard')}
          className={`flex-1 min-w-[120px] px-4 py-3 rounded-lg font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
            ongletActif === 'dashboard'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          Dashboard
        </button>
        <button
          onClick={() => changerOnglet('en-attente')}
          className={`flex-1 min-w-[120px] px-4 py-3 rounded-lg font-medium transition-all duration-300 flex items-center justify-center gap-2 relative ${
            ongletActif === 'en-attente'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Clock className="w-5 h-5" />
          À valider
          {analytics?.kpis.enAttente > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {analytics.kpis.enAttente}
            </span>
          )}
        </button>
        <button
          onClick={() => changerOnglet('valides')}
          className={`flex-1 min-w-[120px] px-4 py-3 rounded-lg font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
            ongletActif === 'valides'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          Acomptes Validés
          {analytics?.kpis.valides > 0 && (
            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
              {analytics.kpis.valides}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : ongletActif === 'dashboard' && analytics ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Actions rapides */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-6 text-white">
            <h2 className="text-xl font-bold mb-4">Actions rapides</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <button
                onClick={() => setModalCreerAcompte(true)}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all hover:scale-[1.02] border-2 border-white/30"
              >
                <Euro className="w-8 h-8 mb-2" />
                <p className="font-bold">Créer un acompte</p>
                <p className="text-sm opacity-90">Pour un salarié</p>
              </button>
              
              <button
                onClick={() => changerOnglet('en-attente')}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all hover:scale-[1.02]"
              >
                <Clock className="w-8 h-8 mb-2" />
                <p className="font-bold">Traiter demandes</p>
                <p className="text-sm opacity-90">{analytics.kpis.enAttente} en attente</p>
              </button>
              
              <button
                onClick={() => exporterDonnees('excel')}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all hover:scale-[1.02]"
              >
                <Download className="w-8 h-8 mb-2" />
                <p className="font-bold">Exporter données</p>
                <p className="text-sm opacity-90">Excel ou PDF</p>
              </button>
              
              <button
                onClick={() => changerOnglet('valides')}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg p-4 text-left transition-all hover:scale-[1.02]"
              >
                <BarChart3 className="w-8 h-8 mb-2" />
                <p className="font-bold">Voir historique</p>
                <p className="text-sm opacity-90">{analytics.kpis.valides} validés</p>
              </button>
            </div>
          </div>

          <DashboardPremium 
            analytics={analytics}
            demandesEnAttente={demandesEnAttente}
            getEmployeNom={getEmployeNom}
            onTraiter={(acompte) => {
              setModalValidation(acompte);
              changerOnglet('en-attente');
            }}
            changerOnglet={changerOnglet}
            isMobile={isMobile}
            evolutionMemoized={evolutionMemoized}
            topDemandeursMemoized={topDemandeursMemoized}
            setKpiModal={setKpiModal}
          />
        </div>
      ) : ongletActif === 'en-attente' ? (
        demandesEnAttente.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Aucune demande en attente</p>
          </div>
        ) : (
          <div className="grid gap-4 animate-fadeIn">
            {demandesEnAttente.map(acompte => (
              <div 
                key={acompte.id}
                className={`bg-white rounded-xl shadow-lg p-6 border-l-4 hover:shadow-2xl hover:scale-[1.01] transition-all duration-200 ${
                  acompte.priorite === 'URGENT' ? 'border-red-500 ring-2 ring-red-200 animate-pulse' :
                  acompte.priorite === 'HAUTE' ? 'border-orange-500' :
                  'border-blue-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                      <Euro className="w-8 h-8 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-gray-900 text-xl">{acompte.montant}€</p>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300 flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          En attente
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        👤 <span className="font-semibold text-gray-900">{getEmployeNom(acompte.employeId)}</span>
                        {acompte.priorite === 'URGENT' && (
                          <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold animate-pulse">
                            ⚠ URGENT ({acompte.joursAttente}j)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        📅 Demandé le {new Date(acompte.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                      {acompte.motif && (
                        <p className="text-sm text-gray-700 italic mt-2 bg-gray-50 px-3 py-2 rounded">
                          💬 {acompte.motif}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => setModalValidation(acompte)}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 transition-all hover:scale-105"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Valider
                    </button>
                    <button
                      onClick={() => setModalRefus(acompte)}
                      className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 transition-all hover:scale-105"
                    >
                      <XCircle className="w-5 h-5" />
                      Refuser
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Filtres
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Période */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Période
                </label>
                <select
                  value={filtres.periode}
                  onChange={(e) => setFiltres({...filtres, periode: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="semaine">Cette semaine</option>
                  <option value="mois">Ce mois</option>
                  <option value="trimestre">Ce trimestre</option>
                  <option value="annee">Cette année</option>
                  <option value="tout">Tout l'historique</option>
                </select>
              </div>
              
              {/* Statut */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Statut
                </label>
                <select
                  value={filtres.statut}
                  onChange={(e) => setFiltres({...filtres, statut: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="TOUS">Tous les statuts</option>
                  <option value="Payée">Payés</option>
                  <option value="En cours de paiement">En paiement</option>
                  <option value="Validée par manager">Validés manager</option>
                  <option value="Refusée">Refusés</option>
                </select>
              </div>
              
              {/* Recherche employé */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rechercher un employé
                </label>
                <input
                  type="text"
                  value={filtres.recherche}
                  onChange={(e) => setFiltres({...filtres, recherche: e.target.value})}
                  placeholder="Nom de l'employé..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            
            <button
              onClick={() => setFiltres({ periode: 'mois', statut: 'TOUS', recherche: '' })}
              className="mt-4 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              Réinitialiser les filtres
            </button>
          </div>

          {/* Liste filtrée */}
          {historiqueFiltre.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">Aucun acompte trouvé avec ces filtres</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-lg">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Historique récent</h2>
                <p className="text-sm text-gray-600 mt-1">{historiqueFiltre.length} acompte(s) trouvé(s)</p>
              </div>
              <div className="divide-y divide-gray-200">
                {historiqueFiltre.map(acompte => (
                  <div key={acompte.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-3 h-3 rounded-full ${
                          acompte.statut === 'Payée' ? 'bg-purple-500' :
                          acompte.statut === 'En cours de paiement' ? 'bg-blue-500' :
                          acompte.statut === 'Refusée' ? 'bg-red-500' :
                          'bg-green-500'
                        }`}></div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-gray-900">{getEmployeNom(acompte.employeId)}</p>
                            <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">
                              {parseFloat(acompte.montant || 0).toFixed(2)}€
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {acompte.statut} • {formatDistanceToNow(new Date(acompte.updatedAt || acompte.createdAt), { addSuffix: true, locale: fr })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Validation */}
      {modalValidation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Valider l'acompte de {modalValidation.montant}€
            </h2>

            <div className="space-y-6">
              {/* Type de paiement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Mode de paiement *
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setModalites({...modalites, type: 'UNIQUE', nbMensualites: 1})}
                    className={`p-4 border-2 rounded-lg text-left ${
                      modalites.type === 'UNIQUE' 
                        ? 'border-blue-600 bg-blue-50' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <p className="font-bold">Paiement unique</p>
                    <p className="text-sm text-gray-600 mt-1">En une seule fois</p>
                  </button>
                  <button
                    onClick={() => setModalites({
                      ...modalites, 
                      type: 'ECHELONNE', 
                      nbMensualites: 2,
                      mensualitesPersonnalisees: []
                    })}
                    className={`p-4 border-2 rounded-lg text-left ${
                      modalites.type === 'ECHELONNE' 
                        ? 'border-blue-600 bg-blue-50' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <p className="font-bold">Paiement échelonné</p>
                    <p className="text-sm text-gray-600 mt-1">En plusieurs mensualités</p>
                  </button>
                </div>
              </div>

              {/* Nombre de mensualités */}
              {modalites.type === 'ECHELONNE' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de mensualités (2-12) *
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={modalites.nbMensualites}
                    onChange={(e) => {
                      const nouveauNb = parseInt(e.target.value);
                      // Recalculer toutes les mensualités avec le nouveau nombre
                      const mensualitesRecalculees = [];
                      const montantParMois = Math.round(modalValidation.montant / nouveauNb * 100) / 100;
                      let restant = modalValidation.montant;
                      // Utiliser le mois de la première mensualité actuelle comme référence
                      const premierMois = calculerMensualites.length > 0 ? calculerMensualites[0].mois : getMoisParDefaut();
                      const [annee, mois] = premierMois.split('-');
                      
                  for (let i = 0; i < nouveauNb; i++) {
                    // mois est déjà au format "01"-"12", donc on soustrait 1 pour l'index JavaScript (0-11)
                    // puis on ajoute i pour les mois suivants
                    const date = new Date(parseInt(annee), parseInt(mois) - 1 + i, 1);
                    const moisPaiement = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        
                        const montant = i === nouveauNb - 1 
                          ? restant 
                          : montantParMois;
                        
                        mensualitesRecalculees.push({
                          numero: i + 1,
                          mois: moisPaiement,
                          montant: montant
                        });
                        
                        restant -= montant;
                      }
                      
                      setModalites({
                        ...modalites, 
                        nbMensualites: nouveauNb,
                        mensualitesPersonnalisees: mensualitesRecalculees
                      });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  />
                </div>
              )}

              {/* Aperçu des mensualités avec possibilité de modification */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Plan de paiement (vous pouvez modifier les mois)
                </h3>
                <div className="space-y-2">
                  {calculerMensualites.map((m, index) => {
                    const { mois, annee } = convertirStringEnMoisAnnee(m.mois);
                    return (
                      <div key={m.numero} className="flex items-center gap-3 bg-white px-3 py-2 rounded">
                        <span className="text-sm font-medium w-24">
                          Mensualité {m.numero}/{modalites.type === 'UNIQUE' ? 1 : modalites.nbMensualites}
                        </span>
                        <select
                          value={mois}
                          onChange={(e) => {
                            const nouveauMois = convertirMoisAnneeEnString(e.target.value, annee);
                            mettreAJourMensualite(index, nouveauMois);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {getMoisOptions().map(mo => (
                            <option key={mo.valeur} value={mo.valeur}>{mo.nom}</option>
                          ))}
                        </select>
                        <select
                          value={annee}
                          onChange={(e) => {
                            const nouveauMois = convertirMoisAnneeEnString(mois, e.target.value);
                            mettreAJourMensualite(index, nouveauMois);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {getAnneeOptions().map(a => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                        <span className="font-bold text-blue-600 w-24 text-right">{m.montant.toFixed(2)}€</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-600 mt-2 italic">
                  💡 Vous pouvez modifier le mois de chaque mensualité en utilisant les menus déroulants
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setModalValidation(null);
                  setModalites({
                    type: 'UNIQUE',
                    nbMensualites: 1,
                    mensualitesPersonnalisees: []
                  });
                }}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleValider}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Valider l'acompte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Refus */}
      {modalRefus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Refuser l'acompte de {modalRefus.montant}€
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motif du refus *
                </label>
                <textarea
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Expliquez la raison du refus..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setModalRefus(null);
                  setMotifRefus('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleRefuser}
                disabled={!motifRefus.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                Refuser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal KPI */}
      {kpiModal && (
        <KPIModal
          modal={kpiModal}
          onClose={() => setKpiModal(null)}
          getEmployeNom={getEmployeNom}
          acomptesData={allAcomptes}
        />
      )}

      {/* Modal Créer Acompte */}
      {modalCreerAcompte && (
        <ModalCreerAcompte
          employesData={employesData}
          nouvelAcompte={nouvelAcompte}
          setNouvelAcompte={setNouvelAcompte}
          onClose={() => {
            setModalCreerAcompte(false);
            setNouvelAcompte({ 
              employeId: '', 
              montant: '', 
              motif: '',
              typePaiement: 'UNIQUE',
              nbMensualites: 1,
              mensualitesPersonnalisees: []
            });
          }}
          onCreate={async () => {
            try {
              if (!nouvelAcompte.employeId || !nouvelAcompte.montant) {
                alert('Veuillez remplir tous les champs requis');
                return;
              }

              const montant = parseFloat(nouvelAcompte.montant);
              if (isNaN(montant) || montant <= 0) {
                alert('Le montant doit être un nombre positif');
                return;
              }

              // Calculer les mensualités si échelonné
              let mensualites = [];
              if (nouvelAcompte.typePaiement === 'ECHELONNE') {
                if (nouvelAcompte.mensualitesPersonnalisees && nouvelAcompte.mensualitesPersonnalisees.length > 0) {
                  mensualites = nouvelAcompte.mensualitesPersonnalisees;
                } else {
                  // Calculer automatiquement
                  const montantParMois = Math.round(montant / nouvelAcompte.nbMensualites * 100) / 100;
                  let restant = montant;
                  const moisDebut = getMoisParDefaut();
                  const [annee, mois] = moisDebut.split('-');
                  
                  for (let i = 0; i < nouvelAcompte.nbMensualites; i++) {
                    const date = new Date(parseInt(annee), parseInt(mois) - 1 + i, 1);
                    const moisPaiement = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const montantMensualite = i === nouvelAcompte.nbMensualites - 1 ? restant : montantParMois;
                    mensualites.push({
                      numero: i + 1,
                      mois: moisPaiement,
                      montant: montantMensualite
                    });
                    restant -= montantMensualite;
                  }
                }
              } else {
                // Paiement unique
                mensualites = [{
                  numero: 1,
                  mois: getMoisParDefaut(),
                  montant: montant
                }];
              }

              const response = await fetch(`${API_BASE}/api/acomptes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  employeId: nouvelAcompte.employeId,
                  montant: montant,
                  motif: nouvelAcompte.motif || 'Acompte créé par le manager',
                  creeParManager: true,
                  managerId: user.userId || user.id,
                  managerNom: user.nom || user.nomComplet || 'Manager',
                  modalites: {
                    type: nouvelAcompte.typePaiement,
                    nbMensualites: nouvelAcompte.typePaiement === 'UNIQUE' ? 1 : nouvelAcompte.nbMensualites,
                    mensualites: mensualites
                  }
                })
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Erreur lors de la création');
              }

              const result = await response.json();
              alert('Acompte créé avec succès !');
              setModalCreerAcompte(false);
              setNouvelAcompte({ 
                employeId: '', 
                montant: '', 
                motif: '',
                typePaiement: 'UNIQUE',
                nbMensualites: 1,
                mensualitesPersonnalisees: []
              });
              fetchData(); // Rafraîchir les données
            } catch (err) {
              console.error('Erreur création acompte:', err);
              alert(`Erreur lors de la création: ${err.message}`);
            }
          }}
          getMoisParDefaut={getMoisParDefaut}
          getMoisOptions={getMoisOptions}
          getAnneeOptions={getAnneeOptions}
          convertirMoisAnneeEnString={convertirMoisAnneeEnString}
          convertirStringEnMoisAnnee={convertirStringEnMoisAnnee}
          mettreAJourMensualite={(index, nouveauMois) => {
            const nouvellesMensualites = [...nouvelAcompte.mensualitesPersonnalisees];
            nouvellesMensualites[index].mois = nouveauMois;
            setNouvelAcompte({
              ...nouvelAcompte,
              mensualitesPersonnalisees: nouvellesMensualites
            });
          }}
        />
      )}
    </div>
  );
};

// Composant Dashboard Premium
const DashboardPremium = ({ analytics, demandesEnAttente, getEmployeNom, onTraiter, changerOnglet, isMobile, evolutionMemoized, topDemandeursMemoized, setKpiModal }) => {
  const COLORS = ['#9333ea', '#3b82f6', '#f59e0b', '#ef4444', '#22c55e'];

  // Vérification de sécurité
  if (!analytics || !analytics.kpis) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Chargement des données...</p>
      </div>
    );
  }
  
  console.log('[DASHBOARD_PREMIUM] Analytics:', analytics);
  console.log('[DASHBOARD_PREMIUM] Evolution mensuelle:', analytics.evolutionMensuelle);
  console.log('[DASHBOARD_PREMIUM] Montant payé:', analytics.kpis?.montantTotalPaye);

  return (
    <div className="space-y-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3 md:gap-4">
        <KPICard
          icon={<Clock className="w-6 h-6 text-orange-600" />}
          label="En attente"
          value={analytics.kpis.enAttente}
          color="orange"
          urgent={analytics.kpis.urgents > 0}
          onClick={() => setKpiModal({ type: 'enAttente', data: analytics })}
        />
        <KPICard
          icon={<CheckCircle className="w-6 h-6 text-green-600" />}
          label="Validés"
          value={analytics.kpis.valides}
          color="green"
          onClick={() => setKpiModal({ type: 'valides', data: analytics })}
        />
        <KPICard
          icon={<Euro className="w-6 h-6 text-purple-600" />}
          label="Montant validé"
          value={`${analytics.kpis.montantTotalValide.toLocaleString()}€`}
          color="purple"
          onClick={() => setKpiModal({ type: 'montantValide', data: analytics })}
        />
        <KPICard
          icon={<DollarSign className="w-6 h-6 text-green-600" />}
          label="Montant payé"
          value={`${(analytics.kpis.montantTotalPaye || 0).toLocaleString()}€`}
          color="green"
          onClick={() => setKpiModal({ type: 'montantPaye', data: analytics })}
        />
        <KPICard
          icon={<XCircle className="w-6 h-6 text-red-600" />}
          label="Refusés"
          value={analytics.kpis.refuses}
          color="red"
          onClick={() => setKpiModal({ type: 'refuses', data: analytics })}
        />
        <KPICard
          icon={<Calendar className="w-6 h-6 text-blue-600" />}
          label="Ce mois"
          value={analytics.kpis.acomptesMois}
          color="blue"
          onClick={() => setKpiModal({ type: 'ceMois', data: analytics })}
        />
        <KPICard
          icon={<Users className="w-6 h-6 text-indigo-600" />}
          label="Employés"
          value={analytics.kpis.employesUniques}
          color="indigo"
          onClick={() => setKpiModal({ type: 'employes', data: analytics })}
        />
        <KPICard
          icon={<Zap className="w-6 h-6 text-yellow-600" />}
          label="Urgent"
          value={analytics.kpis.urgents}
          color="yellow"
          urgent={analytics.kpis.urgents > 0}
          onClick={() => setKpiModal({ type: 'urgents', data: analytics })}
        />
        <KPICard
          icon={<Activity className="w-6 h-6 text-cyan-600" />}
          label="En paiement"
          value={analytics.kpis.enPaiement}
          color="cyan"
          onClick={() => setKpiModal({ type: 'enPaiement', data: analytics })}
        />
      </div>

          {/* Alertes */}
          {analytics.alertes.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-orange-500" />
                Alertes et notifications
              </h2>
              <div className="space-y-3">
                {analytics.alertes.map((alerte, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-l-4 hover:scale-[1.01] transition-all duration-200 ${
                      alerte.niveau === 'CRITIQUE' ? 'bg-red-50 border-red-500' :
                      alerte.niveau === 'AVERTISSEMENT' ? 'bg-orange-50 border-orange-500' :
                      'bg-green-50 border-green-500'
                    }`}
                  >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{alerte.icone}</span>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{alerte.message}</p>
                    <p className="text-sm text-gray-600 mt-1">{alerte.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

          {/* Graphiques principaux */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Évolution mensuelle */}
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl hover:scale-[1.01] transition-all duration-200 animate-fadeIn">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Évolution mensuelle</h2>
              {(!analytics.evolutionMensuelle || analytics.evolutionMensuelle.length === 0) ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Aucune donnée disponible</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                <BarChart data={analytics.evolutionMensuelle}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="moisLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="nombreDemandes" fill="#3b82f6" name="Demandes" />
              <Bar dataKey="valides" fill="#22c55e" name="Validés" />
              <Bar dataKey="refuses" fill="#ef4444" name="Refusés" />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>

            {/* Répartition par statut */}
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl hover:scale-[1.01] transition-all duration-200 animate-fadeIn">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Répartition par statut</h2>
              {(!analytics.repartitionStatuts || analytics.repartitionStatuts.length === 0) ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Aucune donnée disponible</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                <RechartsPie>
                  <Pie
                    data={analytics.repartitionStatuts}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ statut, count }) => `${statut}: ${count}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {analytics.repartitionStatuts.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </RechartsPie>
          </ResponsiveContainer>
          )}
        </div>
      </div>

          {/* Graphique tendance montants */}
          <div className="bg-white rounded-xl shadow-lg p-6 lg:col-span-2 hover:shadow-2xl hover:scale-[1.01] transition-all duration-200 animate-fadeIn">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              Tendance des montants
            </h2>
            {(!analytics.evolutionMensuelle || analytics.evolutionMensuelle.length === 0) ? (
              <div className="text-center py-8 text-gray-500">
                <p>Aucune donnée disponible</p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
              <LineChart data={analytics.evolutionMensuelle}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="moisLabel" />
                <YAxis />
                <Tooltip 
                  formatter={(value) => value.toLocaleString() + '€'}
                  labelFormatter={(label) => 'Mois: ' + label}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="montantTotal" 
                  stroke="#9333ea" 
                  strokeWidth={3}
                  name="Montant total"
                  dot={{ fill: '#9333ea', r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
            )}
            
            {analytics.evolutionMensuelle && analytics.evolutionMensuelle.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-200 pt-4">
                <div className="text-center">
                  <p className="text-xs text-gray-600">Plus haut</p>
                  <p className="text-lg font-bold text-green-600">
                    {Math.max(...analytics.evolutionMensuelle.map(m => m.montantTotal || 0)).toLocaleString()}€
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Moyenne</p>
                  <p className="text-lg font-bold text-blue-600">
                    {Math.round(
                      analytics.evolutionMensuelle.reduce((sum, m) => sum + (m.montantTotal || 0), 0) / 
                      analytics.evolutionMensuelle.length
                    ).toLocaleString()}€
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Plus bas</p>
                  <p className="text-lg font-bold text-orange-600">
                    {Math.min(...analytics.evolutionMensuelle.map(m => m.montantTotal || 0)).toLocaleString()}€
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Métriques et Top demandeurs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Métriques clés */}
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-200 animate-fadeIn">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Award className="w-6 h-6 text-blue-600" />
                Métriques clés
              </h2>
              <div className="space-y-4">
                <MetriqueItem
                  label="Délai moyen traitement"
                  value={`${analytics.metriques.delaiMoyenJours}j`}
                  objectif="< 3j"
                  isGood={analytics.metriques.delaiMoyenJours <= 3}
                />
                <MetriqueItem
                  label="Taux d'approbation"
                  value={`${analytics.metriques.tauxApprobation}%`}
                  objectif="≥ 80%"
                  isGood={analytics.metriques.tauxApprobation >= 80}
                />
                <MetriqueItem
                  label="Montant moyen"
                  value={`${analytics.metriques.montantMoyen}€`}
                  objectif="-"
                  isGood={true}
                />
                <MetriqueItem
                  label="Total demandes"
                  value={analytics.metriques.totalDemandes}
                  objectif="-"
                  isGood={true}
                />
              </div>
            </div>

            {/* Prédictions */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-lg p-6 border-2 border-blue-200 hover:shadow-2xl transition-all duration-200 animate-fadeIn">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-purple-600" />
            Prédictions mois prochain
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Demandes estimées</p>
              <p className="text-3xl font-bold text-blue-600">
                ~{analytics.predictions.demandesEstimees}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Montant estimé</p>
              <p className="text-2xl font-bold text-purple-600">
                ~{analytics.predictions.montantEstime.toLocaleString()}€
              </p>
            </div>
            <div className="pt-4 border-t border-blue-200">
              <div className="flex items-center gap-2">
                {analytics.predictions.tendance === 'HAUSSE' ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : analytics.predictions.tendance === 'BAISSE' ? (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                ) : (
                  <Activity className="w-5 h-5 text-blue-600" />
                )}
                <span className="font-bold text-gray-900">
                  {analytics.predictions.tendance}
                </span>
                <span className="text-sm text-gray-600">
                  ({analytics.predictions.tendancePourcentage > 0 ? '+' : ''}
                  {analytics.predictions.tendancePourcentage}%)
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Confiance: {analytics.predictions.confianceNiveau}
              </p>
            </div>
          </div>
        </div>

            {/* Top 5 demandeurs */}
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-200 animate-fadeIn">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Top 5 demandeurs</h2>
              <div className="space-y-3">
                {(analytics.topDemandeurs || []).slice(0, 5).map((demandeur, index) => (
                  <div key={demandeur.employeId} className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-orange-600' :
                      'bg-blue-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {getEmployeNom(demandeur.employeId)}
                      </p>
                      <div className="flex gap-3 text-xs text-gray-600">
                        <span>{demandeur.nombreDemandes} demandes</span>
                        <span>{demandeur.montantTotal.toFixed(2)}€</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ 
                            width: analytics.topDemandeurs && analytics.topDemandeurs[0] ? `${(demandeur.nombreDemandes / analytics.topDemandeurs[0].nombreDemandes) * 100}%` : '0%'
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
      </div>

          {/* Liste rapide des acomptes en attente */}
          {demandesEnAttente.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Accomptes nécessitant une action</h3>
              <div className="space-y-3">
                {demandesEnAttente.slice(0, 5).map(acompte => (
                  <div key={acompte.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div>
                      <p className="font-semibold text-gray-900">{getEmployeNom(acompte.employeId)}</p>
                      <p className="text-sm text-gray-600">{acompte.motif || 'Sans motif'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{parseFloat(acompte.montant || 0).toFixed(2)}€</p>
                      <button
                        onClick={() => onTraiter(acompte)}
                        className="mt-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-all hover:scale-105"
                      >
                        Traiter
                      </button>
                    </div>
                  </div>
                ))}
                {demandesEnAttente.length > 5 && (
                  <button
                    onClick={() => changerOnglet('en-attente')}
                    className="w-full mt-3 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    Voir tous les acomptes en attente ({demandesEnAttente.length})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

// Modal pour afficher les détails d'un KPI
const KPIModal = ({ modal, onClose, getEmployeNom, acomptesData }) => {
  if (!modal) return null;
  
  const { type, data } = modal;
  const allAcomptes = acomptesData || [];
  
  let title = '';
  let items = [];
  
  switch(type) {
    case 'enAttente':
      title = 'Acomptes en attente';
      items = allAcomptes.filter(a => a.statut === 'En attente').map(a => ({
        employe: getEmployeNom(a.employeId),
        montant: `${parseFloat(a.montant || 0).toFixed(2)}€`,
        date: new Date(a.createdAt).toLocaleDateString('fr-FR'),
        motif: a.motif || 'Sans motif'
      }));
      break;
    case 'valides':
      title = 'Acomptes validés';
      items = allAcomptes.filter(a => 
        a.statut === 'Validée par manager' || 
        a.statut === 'En cours de paiement' || 
        a.statut === 'Payée'
      ).map(a => ({
        employe: getEmployeNom(a.employeId),
        montant: `${parseFloat(a.montant || 0).toFixed(2)}€`,
        statut: a.statut,
        date: new Date(a.valideParManagerAt || a.createdAt).toLocaleDateString('fr-FR')
      }));
      break;
    case 'montantValide':
      title = 'Détail des montants validés';
      items = allAcomptes.filter(a => 
        a.statut === 'Validée par manager' || 
        a.statut === 'En cours de paiement' || 
        a.statut === 'Payée'
      ).map(a => ({
        employe: getEmployeNom(a.employeId),
        montant: `${parseFloat(a.montant || 0).toFixed(2)}€`,
        statut: a.statut
      }));
      break;
    case 'montantPaye':
      title = 'Détail des montants payés';
      items = allAcomptes.filter(a => (a.paiements || []).length > 0).map(a => {
        const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
        return {
          employe: getEmployeNom(a.employeId),
          montantTotal: `${parseFloat(a.montant || 0).toFixed(2)}€`,
          montantPaye: `${totalPaye.toFixed(2)}€`,
          restant: `${(parseFloat(a.montant || 0) - totalPaye).toFixed(2)}€`
        };
      });
      break;
    case 'refuses':
      title = 'Acomptes refusés';
      items = allAcomptes.filter(a => a.statut === 'Refusée').map(a => ({
        employe: getEmployeNom(a.employeId),
        montant: `${parseFloat(a.montant || 0).toFixed(2)}€`,
        motif: a.motifRefus || 'Sans motif',
        date: new Date(a.refuseAt || a.createdAt).toLocaleDateString('fr-FR')
      }));
      break;
    case 'enPaiement':
      title = 'Acomptes en cours de paiement';
      items = allAcomptes.filter(a => a.statut === 'En cours de paiement').map(a => {
        const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
        return {
          employe: getEmployeNom(a.employeId),
          montantTotal: `${parseFloat(a.montant || 0).toFixed(2)}€`,
          montantPaye: `${totalPaye.toFixed(2)}€`,
          restant: `${(parseFloat(a.montant || 0) - totalPaye).toFixed(2)}€`
        };
      });
      break;
    case 'urgents':
      title = 'Acomptes urgents';
      items = allAcomptes.filter(a => {
        if (a.statut !== 'En attente') return false;
        const joursDiff = Math.floor((new Date() - new Date(a.createdAt)) / (1000 * 60 * 60 * 24));
        return joursDiff > 7;
      }).map(a => ({
        employe: getEmployeNom(a.employeId),
        montant: `${parseFloat(a.montant || 0).toFixed(2)}€`,
        joursAttente: Math.floor((new Date() - new Date(a.createdAt)) / (1000 * 60 * 60 * 24))
      }));
      break;
    default:
      return null;
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">
          {items.length === 0 ? (
            <p className="text-gray-600 text-center py-8">Aucun élément à afficher</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(item).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-gray-600 uppercase">{key}</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Composants utilitaires
const KPICard = ({ icon, label, value, color, urgent, onClick }) => {
  const colorClasses = {
    orange: { border: 'border-orange-500', text: 'text-orange-600' },
    green: { border: 'border-green-500', text: 'text-green-600' },
    purple: { border: 'border-purple-500', text: 'text-purple-600' },
    red: { border: 'border-red-500', text: 'text-red-600' },
    blue: { border: 'border-blue-500', text: 'text-blue-600' },
    indigo: { border: 'border-indigo-500', text: 'text-indigo-600' },
    yellow: { border: 'border-yellow-500', text: 'text-yellow-600' },
    cyan: { border: 'border-cyan-500', text: 'text-cyan-600' }
  };
  
  const colors = colorClasses[color] || { border: 'border-gray-500', text: 'text-gray-600' };
  
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl shadow-lg p-4 border-l-4 ${colors.border} hover:shadow-2xl hover:scale-[1.02] transition-all duration-200 ${urgent ? 'ring-2 ring-red-500 animate-pulse' : ''} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        {icon}
        {urgent && <Zap className="w-5 h-5 text-red-500" />}
      </div>
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`text-2xl font-bold ${colors.text} mt-1`}>{value}</p>
    </div>
  );
};

const MetriqueItem = ({ label, value, objectif, isGood }) => (
  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-xs text-gray-500 mt-1">Objectif: {objectif}</p>
    </div>
    <div className="text-right">
      <p className={`text-xl font-bold ${isGood ? 'text-green-600' : 'text-orange-600'}`}>
        {value}
      </p>
      {isGood ? (
        <CheckCircle className="w-5 h-5 text-green-600 ml-auto" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-orange-600 ml-auto" />
      )}
    </div>
  </div>
);

// Modal pour créer un acompte
const ModalCreerAcompte = ({ 
  employesData, 
  nouvelAcompte, 
  setNouvelAcompte, 
  onClose, 
  onCreate,
  getMoisParDefaut,
  getMoisOptions,
  getAnneeOptions,
  convertirMoisAnneeEnString,
  convertirStringEnMoisAnnee,
  mettreAJourMensualite
}) => {
  // Calculer les mensualités
  const calculerMensualites = () => {
    if (!nouvelAcompte.montant || parseFloat(nouvelAcompte.montant) <= 0) return [];
    
    if (nouvelAcompte.mensualitesPersonnalisees && nouvelAcompte.mensualitesPersonnalisees.length > 0) {
      return nouvelAcompte.mensualitesPersonnalisees;
    }
    
    const montant = parseFloat(nouvelAcompte.montant);
    const nbMensualites = nouvelAcompte.typePaiement === 'UNIQUE' ? 1 : nouvelAcompte.nbMensualites;
    const montantParMois = Math.round(montant / nbMensualites * 100) / 100;
    let restant = montant;
    const moisDebut = getMoisParDefaut();
    const [annee, mois] = moisDebut.split('-');
    const mensualites = [];
    
    for (let i = 0; i < nbMensualites; i++) {
      const date = new Date(parseInt(annee), parseInt(mois) - 1 + i, 1);
      const moisPaiement = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const montantMensualite = i === nbMensualites - 1 ? restant : montantParMois;
      mensualites.push({
        numero: i + 1,
        mois: moisPaiement,
        montant: montantMensualite
      });
      restant -= montantMensualite;
    }
    
    return mensualites;
  };

  // Initialiser les mensualités quand le type change
  React.useEffect(() => {
    if (nouvelAcompte.montant && parseFloat(nouvelAcompte.montant) > 0) {
      const mensualitesCalculees = calculerMensualites();
      if (mensualitesCalculees.length > 0) {
        // Vérifier si les mensualités ont changé pour éviter les boucles infinies
        const currentLength = nouvelAcompte.mensualitesPersonnalisees?.length || 0;
        const expectedLength = nouvelAcompte.typePaiement === 'UNIQUE' ? 1 : nouvelAcompte.nbMensualites;
        
        if (currentLength !== expectedLength || 
            (nouvelAcompte.typePaiement === 'ECHELONNE' && nouvelAcompte.nbMensualites !== currentLength)) {
          setNouvelAcompte(prev => ({
            ...prev,
            mensualitesPersonnalisees: mensualitesCalculees
          }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nouvelAcompte.typePaiement, nouvelAcompte.nbMensualites, nouvelAcompte.montant]);

  const mensualites = calculerMensualites();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Créer un acompte</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Sélection du salarié */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Salarié *
            </label>
            <select
              value={nouvelAcompte.employeId}
              onChange={(e) => setNouvelAcompte({ ...nouvelAcompte, employeId: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Sélectionner un salarié</option>
              {employesData.map(employe => (
                <option key={employe.id} value={employe.id}>
                  {employe.nomComplet || `${employe.prenom} ${employe.nom}`}
                </option>
              ))}
            </select>
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Montant (€) *
            </label>
            <input
              type="number"
              min="50"
              max="1000"
              step="0.01"
              value={nouvelAcompte.montant}
              onChange={(e) => setNouvelAcompte({ ...nouvelAcompte, montant: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: 500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Montant entre 50€ et 1000€</p>
          </div>

          {/* Type de paiement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Mode de paiement *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setNouvelAcompte({
                  ...nouvelAcompte,
                  typePaiement: 'UNIQUE',
                  nbMensualites: 1,
                  mensualitesPersonnalisees: []
                })}
                className={`p-4 border-2 rounded-lg text-left ${
                  nouvelAcompte.typePaiement === 'UNIQUE'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <p className="font-bold">Paiement unique</p>
                <p className="text-sm text-gray-600 mt-1">En une seule fois</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nbMensualites = nouvelAcompte.nbMensualites || 2;
                  setNouvelAcompte({
                    ...nouvelAcompte,
                    typePaiement: 'ECHELONNE',
                    nbMensualites: nbMensualites,
                    mensualitesPersonnalisees: []
                  });
                }}
                className={`p-4 border-2 rounded-lg text-left ${
                  nouvelAcompte.typePaiement === 'ECHELONNE'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <p className="font-bold">Paiement échelonné</p>
                <p className="text-sm text-gray-600 mt-1">En plusieurs mensualités</p>
              </button>
            </div>
          </div>

          {/* Nombre de mensualités */}
          {nouvelAcompte.typePaiement === 'ECHELONNE' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de mensualités (2-12) *
              </label>
              <input
                type="number"
                min="2"
                max="12"
                value={nouvelAcompte.nbMensualites}
                onChange={(e) => {
                  const nouveauNb = parseInt(e.target.value) || 2;
                  setNouvelAcompte({
                    ...nouvelAcompte,
                    nbMensualites: nouveauNb,
                    mensualitesPersonnalisees: [] // Réinitialiser pour recalculer
                  });
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              />
            </div>
          )}

          {/* Aperçu des mensualités avec possibilité de modification */}
          {nouvelAcompte.typePaiement === 'ECHELONNE' && mensualites.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Plan de paiement (vous pouvez modifier les mois)
              </h3>
              <div className="space-y-2">
                {mensualites.map((m, index) => {
                  const { mois, annee } = convertirStringEnMoisAnnee(m.mois);
                  return (
                    <div key={m.numero} className="flex items-center gap-3 bg-white px-3 py-2 rounded">
                      <span className="text-sm font-medium w-24">
                        Mensualité {m.numero}/{nouvelAcompte.nbMensualites}
                      </span>
                      <select
                        value={mois}
                        onChange={(e) => {
                          const nouveauMois = convertirMoisAnneeEnString(e.target.value, annee);
                          mettreAJourMensualite(index, nouveauMois);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        {getMoisOptions().map(mo => (
                          <option key={mo.valeur} value={mo.valeur}>{mo.nom}</option>
                        ))}
                      </select>
                      <select
                        value={annee}
                        onChange={(e) => {
                          const nouveauMois = convertirMoisAnneeEnString(mois, e.target.value);
                          mettreAJourMensualite(index, nouveauMois);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        {getAnneeOptions().map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <span className="font-bold text-blue-600 w-24 text-right">{m.montant.toFixed(2)}€</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aperçu pour paiement unique */}
          {nouvelAcompte.typePaiement === 'UNIQUE' && mensualites.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Plan de paiement
              </h3>
              <div className="bg-white px-3 py-2 rounded">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Paiement unique</span>
                  <span className="font-bold text-blue-600">{mensualites[0]?.montant.toFixed(2)}€</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Mois: {mensualites[0]?.mois ? new Date(mensualites[0].mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''}
                </p>
              </div>
            </div>
          )}

          {/* Motif */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motif (optionnel)
            </label>
            <textarea
              value={nouvelAcompte.motif}
              onChange={(e) => setNouvelAcompte({ ...nouvelAcompte, motif: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Raison de l'acompte..."
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={onCreate}
            disabled={!nouvelAcompte.employeId || !nouvelAcompte.montant}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Créer l'acompte
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcomptesManager;

