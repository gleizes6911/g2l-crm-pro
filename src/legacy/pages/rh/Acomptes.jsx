import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Plus, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  User,
  Search,
  Filter,
  Calendar,
  FileText,
  Euro,
  TrendingUp,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import API_BASE from '../../config/api';
const STATUT_COLORS = {
  'En attente': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'Validée par manager': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'Validée': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  'Refusée': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  'Payée': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' }
};

export default function Acomptes() {
  const { user } = useAuth();
  const [acomptes, setAcomptes] = useState([]);
  const [historique, setHistorique] = useState({ historique: [], totaux: {} });
  const [employes, setEmployes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalNouveau, setModalNouveau] = useState(false);
  const [modalValidation, setModalValidation] = useState(false);
  const [selectedAcompte, setSelectedAcompte] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState('TOUS');
  const [filtreAnnee, setFiltreAnnee] = useState(new Date().getFullYear());
  const [regles, setRegles] = useState(null);
  
  // Formulaire nouveau acompte
  const [formData, setFormData] = useState({
    employeId: '',
    montant: '',
    motif: ''
  });
  const [eligibilite, setEligibilite] = useState(null);
  // Identifiant employé fiable : prioriser l'Id Salesforce (contact) si présent
  const currentEmployeId = user?.employeId || user?.salesforceId || user?.userId || user?.id;

  useEffect(() => {
    if (user) {
      fetchHistorique();
      fetchEmployes();
    }
  }, [user, filterStatut, filtreAnnee]);

  const fetchHistorique = async () => {
    try {
      setLoading(true);
      
      // Pour les employés : leur propre historique
      // Pour les managers : tous les acomptes en attente de leurs employés
      // Pour les RH : tous les acomptes
      if (user.role === 'EMPLOYE') {
        const employeId = currentEmployeId;
        let url = `${API_BASE}/api/acomptes/employe/${employeId}/historique?annee=${filtreAnnee}`;
        if (filterStatut !== 'TOUS') {
          url += `&statut=${filterStatut}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        
        // Recalculer les totaux pour s'assurer qu'ils sont corrects
        const historiqueComplet = data.historique || [];
        const totauxRecalcules = {
          totalDemandes: historiqueComplet.length,
          totalValidees: historiqueComplet.filter(a => 
            a.statut === 'Validée par manager' || a.statut === 'En cours de paiement' || a.statut === 'Payée'
          ).length,
          totalRefusees: historiqueComplet.filter(a => a.statut === 'Refusée').length,
          totalEnAttente: historiqueComplet.filter(a => 
            a.statut === 'En attente'
          ).length,
          montantTotal: historiqueComplet
            .filter(a => a.statut === 'Payée')
            .reduce((sum, a) => sum + (parseFloat(a.montant) || 0), 0),
          montantEnCours: historiqueComplet
            .filter(a => a.statut === 'En cours de paiement' || a.statut === 'Validée par manager')
            .reduce((sum, a) => {
              const totalPaye = (a.paiements || []).reduce((s, p) => s + parseFloat(p.montant || 0), 0);
              return sum + (parseFloat(a.montant || 0) - totalPaye);
            }, 0)
        };
        
        setHistorique({
          historique: historiqueComplet,
          totaux: totauxRecalcules
        });
        setAcomptes(historiqueComplet);
      } else if (user.role === 'MANAGER') {
        // Managers voient les acomptes de leurs employés (tous statuts pour voir l'historique)
        const response = await fetch(`${API_BASE}/api/acomptes`);
        const allAcomptes = await response.json();
        
        // Récupérer les employés pour trouver ceux gérés par ce manager
        const resEmployes = await fetch(`${API_BASE}/api/employes`);
        const dataEmployes = await resEmployes.json();
        const employesDuManager = dataEmployes.employes.filter(e => 
          e.managerId === user.userId || e.managerId === user.id
        );
        const idsEmployesDuManager = employesDuManager.map(e => e.id);
        
        // Filtrer les acomptes : ceux des employés du manager
        let acomptesDuManager = allAcomptes.filter(a => 
          idsEmployesDuManager.includes(a.employeId)
        );
        
        // Filtrer par année si nécessaire
        if (filtreAnnee) {
          acomptesDuManager = acomptesDuManager.filter(a => {
            const anneeAcompte = new Date(a.createdAt).getFullYear();
            return anneeAcompte === filtreAnnee;
          });
        }
        
        // Calculer les totaux correctement
        const acomptesValides = acomptesDuManager.filter(a => 
          a.statut === 'Validée' || a.statut === 'Payée' || a.statut === 'Validée par manager'
        );
        const montantTotalCalcule = acomptesValides.reduce((sum, a) => {
          const montant = parseFloat(a.montant) || 0;
          return sum + montant;
        }, 0);
        
        const totaux = {
          totalDemandes: acomptesDuManager.length,
          totalValidees: acomptesValides.length,
          totalRefusees: acomptesDuManager.filter(a => a.statut === 'Refusée').length,
          totalEnAttente: acomptesDuManager.filter(a => 
            a.statut === 'En attente'
          ).length,
          montantTotal: montantTotalCalcule,
          montantEnCours: acomptesDuManager
            .filter(a => a.statut === 'Validée' || a.statut === 'Validée par manager')
            .reduce((sum, a) => sum + (parseFloat(a.montant) || 0), 0)
        };
        
        console.log('[ACOMPTES] Totaux calculés pour manager:', totaux);
        console.log('[ACOMPTES] Acomptes validés:', acomptesValides.map(a => ({ id: a.id, statut: a.statut, montant: a.montant })));
        
        setAcomptes(acomptesDuManager);
        setHistorique({
          historique: acomptesDuManager,
          totaux
        });
      } else if (user.role === 'RH') {
        // RH voient tous les acomptes, surtout ceux validés par manager
        const response = await fetch(`${API_BASE}/api/acomptes`);
        const allAcomptes = await response.json();
        
        // Filtrer par année si nécessaire
        let acomptesFiltres = allAcomptes;
        if (filtreAnnee) {
          acomptesFiltres = allAcomptes.filter(a => {
            const anneeAcompte = new Date(a.createdAt).getFullYear();
            return anneeAcompte === filtreAnnee;
          });
        }
        
        setAcomptes(acomptesFiltres);
        // Calculer les totaux correctement
        const acomptesValidesRH = acomptesFiltres.filter(a => 
          a.statut === 'Validée' || a.statut === 'Payée' || a.statut === 'Validée par manager'
        );
        const montantTotalCalculeRH = acomptesValidesRH.reduce((sum, a) => {
          const montant = parseFloat(a.montant) || 0;
          return sum + montant;
        }, 0);
        
        const totaux = {
          totalDemandes: acomptesFiltres.length,
          totalValidees: acomptesValidesRH.length,
          totalRefusees: acomptesFiltres.filter(a => a.statut === 'Refusée').length,
          totalEnAttente: acomptesFiltres.filter(a => 
            a.statut === 'En attente'
          ).length,
          montantTotal: montantTotalCalculeRH,
          montantEnCours: acomptesFiltres
            .filter(a => a.statut === 'Validée' || a.statut === 'Validée par manager')
            .reduce((sum, a) => sum + (parseFloat(a.montant) || 0), 0)
        };
        
        console.log('[ACOMPTES] Totaux calculés pour RH:', totaux);
        console.log('[ACOMPTES] Acomptes validés RH:', acomptesValidesRH.map(a => ({ id: a.id, statut: a.statut, montant: a.montant })));
        setHistorique({
          historique: acomptesFiltres,
          totaux
        });
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Erreur historique:', err);
      setLoading(false);
    }
  };

  const fetchEmployes = async () => {
    try {
      const resEmployes = await fetch(`${API_BASE}/api/employes`);
      const dataEmployes = await resEmployes.json();
      setEmployes(dataEmployes.employes || []);
    } catch (error) {
      console.error('Erreur récupération employés:', error);
    }
  };

  const verifierEligibilite = async (employeId, montant) => {
    if (!employeId || !montant) {
      setEligibilite(null);
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/acomptes/verifier-eligibilite/${employeId}?montant=${montant}`);
      const data = await res.json();
      setEligibilite(data);
    } catch (error) {
      console.error('Erreur vérification éligibilité:', error);
    }
  };

  const handleMontantChange = (e) => {
    const montant = e.target.value;
    setFormData({ ...formData, montant });
    
    const targetEmployeId = formData.employeId || currentEmployeId;
    if (targetEmployeId && montant) {
      verifierEligibilite(targetEmployeId, montant);
    }
  };

  const handleEmployeChange = (e) => {
    const employeId = e.target.value;
    setFormData({ ...formData, employeId });
    
    if (employeId && formData.montant) {
      verifierEligibilite(employeId, formData.montant);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Pour un salarié connecté, on force son propre ID
    const employeIdEffectif = formData.employeId || currentEmployeId;
    if (!employeIdEffectif) {
      alert("Impossible de déterminer l'identité de l'employé.");
      return;
    }
    const payload = {
      employeId: employeIdEffectif,
      montant: parseFloat(formData.montant),
      motif: formData.motif
    };

    if (!eligibilite || !eligibilite.eligible) {
      alert('La demande n\'est pas éligible. Vérifiez les erreurs.');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/acomptes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }
      
      await fetchHistorique();
      setModalNouveau(false);
      setFormData({ employeId: '', montant: '', motif: '' });
      setEligibilite(null);
    } catch (error) {
      console.error('Erreur création acompte:', error);
      alert(error.message || 'Erreur lors de la création de la demande');
    }
  };

  const handleValider = async () => {
    if (!selectedAcompte) return;
    const roleUpper = (user?.role || '').toUpperCase();
    const isManager = roleUpper === 'MANAGER';
    try {
      const res = await fetch(`${API_BASE}/api/acomptes/${selectedAcompte.id}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          validateurRole: roleUpper
        })
      });
      
      if (!res.ok) throw new Error('Erreur validation');
      
      // Marquer comme lu automatiquement
      if (isManager) {
        await fetch(`${API_BASE}/api/acomptes/${selectedAcompte.id}/marquer-lu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'MANAGER' })
        });
      }
      
      // Attendre un peu pour que le backend traite
      await new Promise(resolve => setTimeout(resolve, 800));
      await fetchHistorique();
      setModalValidation(false);
      setSelectedAcompte(null);
    } catch (error) {
      console.error('Erreur validation:', error);
      alert('Erreur lors de la validation');
    }
  };

  const handleRefuser = async (motifRefus) => {
    if (!selectedAcompte || !motifRefus) return;
    const roleUpper = (user?.role || '').toUpperCase();
    const isManager = roleUpper === 'MANAGER';
    
    try {
      const res = await fetch(`${API_BASE}/api/acomptes/${selectedAcompte.id}/refuser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          motifRefus,
          validateurRole: roleUpper
        })
      });
      
      if (!res.ok) throw new Error('Erreur refus');
      
      // Marquer comme lu automatiquement
      if (isManager) {
        await fetch(`${API_BASE}/api/acomptes/${selectedAcompte.id}/marquer-lu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'MANAGER' })
        });
      }
      
      // Attendre un peu pour que le backend traite
      await new Promise(resolve => setTimeout(resolve, 800));
      await fetchHistorique();
      setModalValidation(false);
      setSelectedAcompte(null);
    } catch (error) {
      console.error('Erreur refus:', error);
      alert('Erreur lors du refus');
    }
  };

  const handleMarquerPaye = async (acompteId) => {
    try {
      const res = await fetch(`${API_BASE}/api/acomptes/${acompteId}/marquer-paye`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeParId: user.userId,
          payeParNom: user.nom,
          referenceVirement: prompt('Référence virement (optionnel):') || ''
        })
      });
      
      if (!res.ok) throw new Error('Erreur');
      
      // Attendre un peu pour que le backend traite
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchHistorique();
    } catch (error) {
      console.error('Erreur marquer payé:', error);
      alert('Erreur');
    }
  };

  // Filtrer acomptes
  const acomptesFiltres = acomptes.filter(acompte => {
    const employe = employes.find(e => e.id === acompte.employeId);
    const nomEmploye = employe?.nomComplet || '';
    
    const matchSearch = !searchTerm || 
      nomEmploye.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acompte.motif?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Normaliser le statut : "Validée par manager" devient "Validée" pour le filtrage
    const statutNormalise = acompte.statut === 'Validée par manager' ? 'Validée' : acompte.statut;
    const matchStatut = filterStatut === 'TOUS' || statutNormalise === filterStatut;
    
    // Pour les managers : tous les acomptes de leurs employés (pas seulement en attente)
    // Pour les RH : tous les acomptes
    // Pour les employés : leurs propres acomptes
    return matchSearch && matchStatut;
  });

  const findEmploye = (id) =>
    employes.find(e =>
      `${e.id}` === `${id}` ||
      `${e.salesforceId || ''}` === `${id}` ||
      `${e.userId || ''}` === `${id}` ||
      `${e.employeId || ''}` === `${id}`
    );

  // Grouper par statut et trier par date (plus récent en premier)
  // "Validée par manager" est regroupée sous "Validée"
  const acomptesParStatut = {
    'En attente': acomptesFiltres
      .filter(a => a.statut === 'En attente')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    'Validée': acomptesFiltres
      .filter(a => a.statut === 'Validée' || a.statut === 'Validée par manager')
      .sort((a, b) => {
        // Pour RH : trier les "Validée par manager" non lus d'abord
        if (user?.role === 'RH' && a.statut === 'Validée par manager' && b.statut === 'Validée par manager') {
          if (a.luParRH !== b.luParRH) {
            return a.luParRH ? 1 : -1;
          }
        }
        const dateA = a.valideParRHAt || a.valideParManagerAt || a.createdAt;
        const dateB = b.valideParRHAt || b.valideParManagerAt || b.createdAt;
        return new Date(dateB) - new Date(dateA);
      }),
    'Refusée': acomptesFiltres
      .filter(a => a.statut === 'Refusée')
      .sort((a, b) => new Date(b.refuseAt || b.createdAt) - new Date(a.refuseAt || a.createdAt)),
    'Payée': acomptesFiltres
      .filter(a => a.statut === 'Payée')
      .sort((a, b) => new Date(b.payeAt || b.createdAt) - new Date(a.payeAt || a.createdAt))
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-600" />
              Demandes d'Acomptes
            </h1>
            <p className="text-gray-600 mt-2">Gestion des demandes avec workflow de validation</p>
          </div>
          
          {user?.role === 'EMPLOYE' && (
            <button
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  employeId: currentEmployeId || prev.employeId
                }));
                setModalNouveau(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nouvelle demande
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total demandes</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {historique.totaux.totalDemandes || 0}
              </p>
            </div>
            <Calendar className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Validées</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {historique.totaux.totalValidees || 0}
              </p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">En attente</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">
                {historique.totaux.totalEnAttente || 0}
              </p>
            </div>
            <Clock className="w-12 h-12 text-orange-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Montant total</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">
                {historique.totaux.montantTotal || 0}€
              </p>
            </div>
            <Euro className="w-12 h-12 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher par employé ou motif..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="En attente">En attente</option>
              <option value="Validée">Validée</option>
              <option value="Refusée">Refusée</option>
              <option value="Payée">Payée</option>
            </select>

          <select
            value={filtreAnnee}
            onChange={(e) => setFiltreAnnee(parseInt(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {[2025, 2024, 2023, 2022].map(annee => (
              <option key={annee} value={annee}>{annee}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste par statut */}
      <div className="space-y-6">
        {Object.entries(acomptesParStatut)
          .filter(([statut, acomptesStatut]) => {
            // Afficher toutes les sections qui ont des acomptes
            return acomptesStatut.length > 0;
          })
          .map(([statut, acomptesStatut]) => {
          
          const statutColor = STATUT_COLORS[statut] || STATUT_COLORS['En attente'];
          
          return (
            <div key={statut} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4 pb-4 border-b">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statutColor.bg} ${statutColor.text}`}>
                    {statut}
                  </span>
                  <span className="text-gray-500">({acomptesStatut.length})</span>
                </h2>
              </div>
              
              <div className="space-y-3">
                {acomptesStatut.map(acompte => {
                  const employe = findEmploye(acompte.employeId);
                  const totalPaye = (acompte.paiements || []).reduce((sum, p) => sum + p.montant, 0);
                  const restantDu = acompte.montant - totalPaye;
                  
                  return (
                    <div 
                      key={acompte.id} 
                      className={`p-4 rounded-lg border-2 ${statutColor.border} ${
                        user?.role === 'RH' && acompte.statut === 'Validée par manager' && !acompte.luParRH
                          ? 'bg-blue-50 border-blue-400' 
                          : 'bg-gray-50'
                      } hover:shadow-md transition-all`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{employe?.nomComplet || 'Inconnu'}</p>
                              <p className="text-sm text-gray-600">{employe?.societe || '—'}</p>
                            </div>
                          </div>
                          
                          <div className="ml-13 mt-2 space-y-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <p className="text-lg font-bold text-green-600">{acompte.montant}€</p>
                              {acompte.statut === 'En cours de paiement' && restantDu > 0 && (
                                <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">
                                  Restant: {restantDu.toFixed(2)}€
                                </span>
                              )}
                            </div>
                            {acompte.motif && (
                              <p className="text-sm text-gray-700">Motif: {acompte.motif}</p>
                            )}
                            <p className="text-xs text-gray-500">
                              📅 Demandé le {format(new Date(acompte.createdAt), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                            </p>
                            
                            {acompte.valideParManagerNom && (
                              <p className="text-xs text-blue-600">
                                ✓ Manager: {acompte.valideParManagerNom}
                              </p>
                            )}
                            
                            {acompte.refuseParNom && (
                              <p className="text-xs text-red-600">
                                ✗ Refusé par: {acompte.refuseParNom}
                              </p>
                            )}
                            
                            {acompte.motifRefus && (
                              <p className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded mt-1">
                                Motif: {acompte.motifRefus}
                              </p>
                            )}
                          </div>

                          {/* Affichage des mensualités */}
                          {acompte.mensualites && acompte.mensualites.length > 0 && (
                            <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
                              <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Plan de paiement ({acompte.mensualites.length} {acompte.mensualites.length > 1 ? 'mensualités' : 'mensualité'})
                              </p>
                              <div className="space-y-1">
                                {acompte.mensualites.map(m => (
                                  <div key={m.numero} className="flex justify-between items-center text-xs">
                                    <span className="text-gray-600">
                                      {m.statut === 'PAYEE' ? '✓' : '⏳'} Mois {m.numero}: {new Date(m.mois + '-01').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                                    </span>
                                    <span className={`font-bold ${m.statut === 'PAYEE' ? 'text-green-600' : 'text-orange-600'}`}>
                                      {m.montant.toFixed(2)}€
                                    </span>
                                  </div>
                                ))}
                              </div>
                              
                              {acompte.paiements && acompte.paiements.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <p className="text-xs font-bold text-green-700 mb-1">Paiements effectués:</p>
                                  {acompte.paiements.map((p, i) => (
                                    <div key={i} className="text-xs text-green-600 flex justify-between">
                                      <span>✓ {format(new Date(p.date), 'dd/MM/yyyy', { locale: fr })} - Mensualité {p.mensualiteNumero}</span>
                                      <span className="font-bold">{p.montant.toFixed(2)}€</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          {/* Indicateur non lu pour RH */}
                          {user?.role === 'RH' && acompte.statut === 'Validée par manager' && !acompte.luParRH && (
                            <span className="px-2 py-1 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse">
                              Nouveau
                            </span>
                          )}
                          
                          {/* Afficher le statut normalisé */}
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            acompte.statut === 'Validée par manager' 
                              ? STATUT_COLORS['Validée'].bg + ' ' + STATUT_COLORS['Validée'].text
                              : STATUT_COLORS[acompte.statut]?.bg + ' ' + STATUT_COLORS[acompte.statut]?.text || 'bg-gray-100 text-gray-800'
                          }`}>
                            {acompte.statut === 'Validée par manager' ? 'Validée' : acompte.statut}
                          </span>
                          
                          {/* Actions selon statut et rôle */}
                          {user?.role === 'MANAGER' && acompte.statut === 'En attente' && (
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => {
                                  setSelectedAcompte(acompte);
                                  setModalValidation(true);
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                              >
                                Valider/Refuser
                              </button>
                              {!acompte.luParManager && (
                                <span className="text-xs text-orange-600 font-semibold">Non lu</span>
                              )}
                            </div>
                          )}
                          
                          {user?.role === 'RH' && acompte.statut === 'Validée par manager' && (
                            <div className="flex flex-col gap-2">
                              {!acompte.luParRH && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await fetch(`${API_BASE}/api/acomptes/${acompte.id}/marquer-lu`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ role: 'RH' })
                                      });
                                      // Attendre un peu pour que le backend traite
                                      await new Promise(resolve => setTimeout(resolve, 300));
                                      // Recharger pour que l'acompte se classe automatiquement (reste dans "Validée par manager" mais marqué lu)
                                      await fetchHistorique();
                                    } catch (error) {
                                      console.error('Erreur marquer lu:', error);
                                    }
                                  }}
                                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm font-medium"
                                >
                                  Marquer lu
                                </button>
                              )}
                              {acompte.luParRH && (
                                <span className="text-xs text-gray-500 italic">✓ Lu</span>
                              )}
                            </div>
                          )}
                          
                          {user?.role === 'RH' && acompte.statut === 'Validée' && !acompte.payeAt && (
                            <button
                              onClick={() => handleMarquerPaye(acompte.id)}
                              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                            >
                              Marquer payé
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        
        {acomptesFiltres.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {user?.role === 'MANAGER' 
                ? 'Aucune demande d\'acompte en attente de vos employés'
                : 'Aucune demande d\'acompte trouvée'}
            </p>
            {user?.role === 'MANAGER' && (
              <p className="text-sm text-gray-500 mt-2">
                Les demandes d'acomptes de vos employés apparaîtront ici lorsqu'elles seront créées.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Modal Nouveau Acompte */}
      {modalNouveau && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Nouvelle demande d'acompte</h2>
              <button onClick={() => setModalNouveau(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant (€) *</label>
                <input
                  type="number"
                  required
                  min="50"
                  max="1000"
                  step="0.01"
                  value={formData.montant}
                  onChange={handleMontantChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="50 - 1000€"
                />
                <p className="text-xs text-gray-500 mt-1">Montant entre 50€ et 1000€</p>
              </div>
              {/* Pour les managers/RH, choix de l'employé ; pour les employés, l'ID est pré-rempli et caché */}
              {user?.role !== 'EMPLOYE' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
                  <select
                    required
                    value={formData.employeId}
                    onChange={handleEmployeChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Sélectionner un employé</option>
                    {employes.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nomComplet} - {emp.societe}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif</label>
                <textarea
                  value={formData.motif}
                  onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows="3"
                  placeholder="Raison de la demande d'acompte..."
                />
              </div>
              
              {eligibilite && (
                <div className={`p-3 rounded-lg ${
                  eligibilite.eligible ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {eligibilite.eligible ? (
                    <p className="text-sm text-green-800 font-semibold">✓ Demande éligible</p>
                  ) : (
                    <div>
                      <p className="text-sm text-red-800 font-semibold mb-2">✗ Demande non éligible:</p>
                      <ul className="text-xs text-red-700 list-disc list-inside">
                        {eligibilite.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={!eligibilite || !eligibilite.eligible}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Envoyer la demande
                </button>
                <button
                  type="button"
                  onClick={() => setModalNouveau(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Validation */}
      {modalValidation && selectedAcompte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Valider/Refuser Acompte</h2>
              <button onClick={() => setModalValidation(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4 space-y-2">
              <p className="text-sm text-gray-600">Employé:</p>
              <p className="font-semibold text-gray-900">
                {employes.find(e => e.id === selectedAcompte.employeId)?.nomComplet || 'Inconnu'}
              </p>
              <p className="text-sm text-gray-600 mt-3">Montant:</p>
              <p className="text-2xl font-bold text-green-600">{selectedAcompte.montant}€</p>
              {selectedAcompte.motif && (
                <>
                  <p className="text-sm text-gray-600 mt-3">Motif:</p>
                  <p className="text-sm text-gray-900">{selectedAcompte.motif}</p>
                </>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => handleValider(user?.role === 'MANAGER')}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                <Check className="w-5 h-5 inline mr-2" />
                Valider
              </button>
              <button
                onClick={() => {
                  const motif = prompt('Motif du refus:');
                  if (motif) handleRefuser(motif);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                <X className="w-5 h-5 inline mr-2" />
                Refuser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

