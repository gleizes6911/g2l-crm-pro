import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Euro, Calendar, CheckCircle, Clock, TrendingDown, AlertCircle } from 'lucide-react';
import API_BASE from '../../config/api';

const AcomptesRH = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const ongletActif = searchParams.get('tab') || 'a-traiter';
  
  const [acomptesATraiter, setAcomptesATraiter] = useState([]);
  const [acomptesEnCours, setAcomptesEnCours] = useState([]);
  const [acomptesTraites, setAcomptesTraites] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!searchParams.get('tab')) {
      setSearchParams({ tab: 'a-traiter' });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchAcomptes();
  }, []);

  const fetchAcomptes = async () => {
    try {
      setLoading(true);
      // Récupérer tous les acomptes et les filtrer côté client
      const response = await fetch(`${API_BASE}/api/acomptes`);
      const data = await response.json();
      
      // Filtrer selon les catégories pour la RH
      // Pour "Accomptes à TRAITER" : acomptes avec mensualités payées mais pas encore traitées par la RH
      const aTraiter = data.filter(a => {
        if (a.statut !== 'En cours de paiement' && a.statut !== 'Payée') return false;
        // Vérifier qu'il y a au moins une mensualité PAYEE par le comptable
        const mensualitesPayees = (a.mensualites || []).filter(m => m.statut === 'PAYEE');
        if (mensualitesPayees.length === 0) return false;
        
        // Vérifier qu'il y a au moins une mensualité payée qui n'a pas encore été traitée par la RH
        const mensualitesTraiteesParRH = a.mensualitesTraiteesParRH || [];
        const mensualitesPayeesNonTraitees = mensualitesPayees.filter(m => 
          !mensualitesTraiteesParRH.includes(m.numero)
        );
        
        return mensualitesPayeesNonTraitees.length > 0;
      });
      
      // Pour "Accomptes EN COURS" : acomptes avec au moins une mensualité traitée mais pas toutes
      const enCours = data.filter(a => {
        if (a.statut !== 'En cours de paiement' && a.statut !== 'Payée') return false;
        const mensualitesTraiteesParRH = a.mensualitesTraiteesParRH || [];
        const totalMensualites = (a.mensualites || []).length;
        return mensualitesTraiteesParRH.length > 0 && mensualitesTraiteesParRH.length < totalMensualites;
      });
      
      // Pour "Accomptes TRAITES" : acomptes complètement traités par la RH
      const traites = data.filter(a => {
        if (a.statut !== 'En cours de paiement' && a.statut !== 'Payée') return false;
        const mensualitesTraiteesParRH = a.mensualitesTraiteesParRH || [];
        const totalMensualites = (a.mensualites || []).length;
        return mensualitesTraiteesParRH.length === totalMensualites && totalMensualites > 0;
      });
      
      setAcomptesATraiter(aTraiter);
      setAcomptesEnCours(enCours);
      setAcomptesTraites(traites);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const getMoisCourant = () => {
    return new Date().toISOString().substring(0, 7);
  };

  const estMensualiteDuMois = (mois) => {
    return mois === getMoisCourant();
  };

  const estMensualiteEnRetard = (mois) => {
    return mois < getMoisCourant();
  };

  const handleMarquerTraite = async (acompte, numeroMensualite) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/acomptes/${acompte.id}/marquer-traite-rh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numeroMensualite,
            rhId: user.userId || user.id,
            rhNom: user.nom || user.nomComplet
          })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors du traitement');
      }
      
      const result = await response.json();
      
      // Rafraîchir les acomptes
      await fetchAcomptes();
      
      // Forcer le rafraîchissement du comptage des badges dans la sidebar
      // (la sidebar se rafraîchit automatiquement toutes les 30s, mais on peut forcer)
      window.dispatchEvent(new Event('acomptes-updated'));
      
      // Basculer vers l'onglet approprié selon le résultat
      if (result.estCompletementTraite) {
        setSearchParams({ tab: 'traites' });
        alert('Toutes les mensualités ont été traitées. Acompte complètement traité ✓');
      } else {
        setSearchParams({ tab: 'en-cours' });
        alert(`Mensualité traitée. ${result.mensualitesTraitees}/${result.totalMensualites} mensualités traitées.`);
      }
    } catch (err) {
      console.error('Erreur:', err);
      alert(`Erreur lors du traitement: ${err.message}`);
    }
  };

  // Déterminer la liste d'acomptes à afficher selon l'onglet actif
  const acomptesAAfficher = ongletActif === 'a-traiter' ? acomptesATraiter :
                            ongletActif === 'en-cours' ? acomptesEnCours :
                            acomptesTraites;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gestion des acomptes</h1>
        <p className="text-gray-600 mt-1">Suivi des acomptes pour déduction de la paye</p>
      </div>

      {/* Onglets */}
      <div className="mb-6 bg-white rounded-lg shadow-md border-2 border-gray-300 p-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'a-traiter' })}
            className={`px-6 py-3 font-semibold rounded-lg transition-all flex items-center gap-2 ${
              ongletActif === 'a-traiter'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span>Accompte à Traiter</span>
            {acomptesATraiter.length > 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                ongletActif === 'a-traiter'
                  ? 'bg-white text-blue-600'
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {acomptesATraiter.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'en-cours' })}
            className={`px-6 py-3 font-semibold rounded-lg transition-all flex items-center gap-2 ${
              ongletActif === 'en-cours'
                ? 'bg-yellow-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <TrendingDown className="w-5 h-5" />
            <span>Accompte en cours</span>
            {acomptesEnCours.length > 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                ongletActif === 'en-cours'
                  ? 'bg-white text-yellow-600'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {acomptesEnCours.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'traites' })}
            className={`px-6 py-3 font-semibold rounded-lg transition-all flex items-center gap-2 ${
              ongletActif === 'traites'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckCircle className="w-5 h-5" />
            <span>Accomptes traités</span>
            {acomptesTraites.length > 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                ongletActif === 'traites'
                  ? 'bg-white text-green-600'
                  : 'bg-green-100 text-green-800'
              }`}>
                {acomptesTraites.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
        </div>
      ) : acomptesAAfficher.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">
            {ongletActif === 'a-traiter' && 'Aucun acompte à traiter'}
            {ongletActif === 'en-cours' && 'Aucun acompte en cours'}
            {ongletActif === 'traites' && 'Aucun acompte traité'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {acomptesAAfficher.map(acompte => {
            // Calculer les totaux pour chaque acompte
            const totalPaye = (acompte.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
            const restantDu = parseFloat(acompte.montant || 0) - totalPaye;
            const mensualitesEnAttente = (acompte.mensualites || []).filter(m => m.statut === 'EN_ATTENTE');
            const prochaineMensualite = mensualitesEnAttente[0] || null;
            const estDuMois = prochaineMensualite && estMensualiteDuMois(prochaineMensualite.mois);
            const estEnRetard = prochaineMensualite && estMensualiteEnRetard(prochaineMensualite.mois);
            
            return (
              <div 
                key={acompte.id}
                className={`bg-white rounded-xl shadow-lg p-6 border-l-4 ${
                  estEnRetard ? 'border-red-500' : estDuMois ? 'border-green-500' : 'border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      estEnRetard ? 'bg-red-100' : estDuMois ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <Euro className={`w-8 h-8 ${
                        estEnRetard ? 'text-red-600' : estDuMois ? 'text-green-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-xl mb-1">
                        👤 <span className="font-semibold">{acompte.employeNom || 'Inconnu'}</span>
                      </p>
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-bold text-gray-900 text-lg">
                          Accompte de {parseFloat(acompte.montant || 0).toFixed(2)}€
                        </p>
                        {estEnRetard && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            EN RETARD
                          </span>
                        )}
                        {estDuMois && !estEnRetard && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300 flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            CE MOIS
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        📅 Demandé le {new Date(acompte.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                      <p className="text-sm text-gray-600">
                        ✓ Validé par {acompte.valideParManagerNom || 'Manager'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-600">Total payé</p>
                    <p className="text-xl font-bold text-green-600">{totalPaye.toFixed(2)}€</p>
                    <p className="text-sm text-gray-600 mt-1">Restant dû</p>
                    <p className="text-2xl font-bold text-red-600">{restantDu.toFixed(2)}€</p>
                  </div>
                </div>

                {/* Tableau des mensualités */}
                {(ongletActif === 'a-traiter' || ongletActif === 'en-cours') && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Plan de paiement ({(acompte.mensualites || []).length} mensualités)
                    </h3>
                    
                    <div className="space-y-2">
                      {(acompte.mensualites || []).map(mensualite => {
                        const duMois = estMensualiteDuMois(mensualite.mois);
                        const enRetard = estMensualiteEnRetard(mensualite.mois);
                        const estPaye = mensualite.statut === 'PAYEE';
                        const mensualitesTraiteesParRH = acompte.mensualitesTraiteesParRH || [];
                        const estTraiteeParRH = mensualitesTraiteesParRH.includes(mensualite.numero);
                        
                        return (
                          <div 
                            key={mensualite.numero}
                            className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                              estPaye 
                                ? 'bg-green-50 border-green-300' 
                                : enRetard 
                                  ? 'bg-red-50 border-red-300' 
                                  : duMois 
                                    ? 'bg-yellow-50 border-yellow-300' 
                                    : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                estPaye ? 'bg-green-200' : enRetard ? 'bg-red-200' : duMois ? 'bg-yellow-200' : 'bg-gray-200'
                              }`}>
                                <span className="font-bold text-sm">
                                  {mensualite.numero}
                                </span>
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900">
                                    {new Date(mensualite.mois + '-01').toLocaleDateString('fr-FR', { 
                                      month: 'long', 
                                      year: 'numeric' 
                                    })}
                                  </p>
                                  {estPaye && (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  )}
                                  {enRetard && !estPaye && (
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                  )}
                                  {duMois && !estPaye && (
                                    <Clock className="w-4 h-4 text-yellow-600" />
                                  )}
                                  {estTraiteeParRH && (
                                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
                                      Traité par RH
                                    </span>
                                  )}
                                </div>
                                
                                {estPaye && mensualite.payeLe && (
                                  <p className="text-xs text-green-700 mt-1">
                                    ✓ Payé le {new Date(mensualite.payeLe).toLocaleDateString('fr-FR')}
                                    {mensualite.referenceVirement && ` - Réf: ${mensualite.referenceVirement}`}
                                  </p>
                                )}
                              </div>
                              
                              <div className="text-right">
                                <p className="font-bold text-lg text-gray-900">
                                  {parseFloat(mensualite.montant || 0).toFixed(2)}€
                                </p>
                                {estPaye ? (
                                  <span className="text-xs text-green-600 font-bold">PAYÉ</span>
                                ) : enRetard ? (
                                  <span className="text-xs text-red-600 font-bold">RETARD</span>
                                ) : duMois ? (
                                  <span className="text-xs text-yellow-600 font-bold">À DÉDUIRE</span>
                                ) : (
                                  <span className="text-xs text-gray-500">À venir</span>
                                )}
                              </div>
                            </div>
                            
                            {/* Bouton "Traité" pour la RH si la mensualité est payée et pas encore traitée */}
                            {estPaye && ongletActif !== 'traites' && !estTraiteeParRH && (
                              <button
                                onClick={() => handleMarquerTraite(acompte, mensualite.numero)}
                                className="ml-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Traité
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Historique des paiements */}
                {acompte.paiements && acompte.paiements.length > 0 && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-bold text-blue-900 mb-2 text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Historique des paiements
                    </h4>
                    <div className="space-y-1">
                      {acompte.paiements.map((paiement, index) => (
                        <div key={index} className="text-xs text-blue-800 flex justify-between">
                          <span>
                            ✓ {new Date(paiement.date).toLocaleDateString('fr-FR')} - 
                            Mensualité {paiement.mensualiteNumero} - {parseFloat(paiement.montant || 0).toFixed(2)}€
                          </span>
                          {paiement.reference && (
                            <span className="text-blue-600">Réf: {paiement.reference}</span>
                          )}
                        </div>
                      ))}
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
};

export default AcomptesRH;

