import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Euro, Calendar, CheckCircle, Clock, TrendingDown, AlertCircle } from 'lucide-react';
import API_BASE from '../../config/api';

const AcomptesComptable = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const ongletActif = searchParams.get('tab') || 'nouveaux';
  
  const [acomptesNouveaux, setAcomptesNouveaux] = useState([]);
  const [acomptesEnCours, setAcomptesEnCours] = useState([]);
  const [acomptesTraites, setAcomptesTraites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalPaiement, setModalPaiement] = useState(null);
  const [mensualiteSelectionnee, setMensualiteSelectionnee] = useState(null);
  
  const [formPaiement, setFormPaiement] = useState({
    datePaiement: new Date().toISOString().split('T')[0],
    referenceVirement: ''
  });

  useEffect(() => {
    if (!searchParams.get('tab')) {
      setSearchParams({ tab: 'nouveaux' });
    }
    fetchAcomptes();
  }, []);

  const fetchAcomptes = async () => {
    try {
      setLoading(true);
      // Récupérer tous les acomptes et les filtrer côté client
      const response = await fetch(`${API_BASE}/api/acomptes`);
      const data = await response.json();
      
      // Filtrer selon les catégories
      const nouveaux = data.filter(a => {
        if (a.statut !== 'En cours de paiement') return false;
        const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
        return totalPaye === 0;
      });
      
      const enCours = data.filter(a => {
        if (a.statut !== 'En cours de paiement') return false;
        const totalPaye = (a.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
        const montantTotal = parseFloat(a.montant || 0);
        return totalPaye > 0 && totalPaye < montantTotal;
      });
      
      const traites = data.filter(a => a.statut === 'Payée');
      
      setAcomptesNouveaux(nouveaux);
      setAcomptesEnCours(enCours);
      setAcomptesTraites(traites);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const handleValiderPaiement = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/acomptes/${modalPaiement.id}/valider-paiement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numeroMensualite: mensualiteSelectionnee.numero,
            comptableId: user.userId,
            comptableNom: user.nom,
            datePaiement: formPaiement.datePaiement,
            referenceVirement: formPaiement.referenceVirement
          })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        console.error('[COMPTABLE] Erreur validation paiement:', errorData);
        throw new Error(errorData.error || 'Erreur lors de la validation du paiement');
      }
      
      const result = await response.json();
      console.log('[COMPTABLE] Paiement validé avec succès:', result);
      
      setModalPaiement(null);
      setMensualiteSelectionnee(null);
      setFormPaiement({
        datePaiement: new Date().toISOString().split('T')[0],
        referenceVirement: ''
      });
      
      fetchAcomptes();
      
      if (result.restantDu > 0) {
        alert(`Paiement validé ! Restant dû: ${result.restantDu.toFixed(2)}€`);
        // Si c'était un nouvel acompte et qu'il reste à payer, basculer vers "en cours"
        if (ongletActif === 'nouveaux') {
          setSearchParams({ tab: 'en-cours' });
        }
      } else {
        alert('Dernier paiement validé ! Acompte soldé ✓');
        // Si c'était le dernier paiement, basculer vers "traités"
        setSearchParams({ tab: 'traites' });
      }
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la validation du paiement');
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

  // Déterminer la liste d'acomptes à afficher selon l'onglet actif
  const acomptesAAfficher = ongletActif === 'nouveaux' ? acomptesNouveaux :
                            ongletActif === 'en-cours' ? acomptesEnCours :
                            acomptesTraites;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gestion des acomptes</h1>
        <p className="text-gray-600 mt-1">Paiements et suivi des acomptes</p>
      </div>

      {/* Onglets */}
      <div className="mb-6 bg-white rounded-lg shadow-md border-2 border-gray-300 p-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSearchParams({ tab: 'nouveaux' })}
            className={`px-6 py-3 font-semibold rounded-lg transition-all flex items-center gap-2 ${
              ongletActif === 'nouveaux'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span>Nouvel Accompte</span>
            {acomptesNouveaux.length > 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                ongletActif === 'nouveaux'
                  ? 'bg-white text-blue-600'
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {acomptesNouveaux.length}
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
            <span>Accomptes Traités</span>
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
            {ongletActif === 'nouveaux' && 'Aucun nouvel acompte'}
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

                {/* Tableau des mensualités - seulement pour nouveaux et en cours */}
                {(ongletActif === 'nouveaux' || ongletActif === 'en-cours') && (
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
                                {mensualite.montant.toFixed(2)}€
                              </p>
                              {estPaye ? (
                                <span className="text-xs text-green-600 font-bold">PAYÉ</span>
                              ) : enRetard ? (
                                <span className="text-xs text-red-600 font-bold">RETARD</span>
                              ) : duMois ? (
                                <span className="text-xs text-yellow-600 font-bold">À PAYER</span>
                              ) : (
                                <span className="text-xs text-gray-500">À venir</span>
                              )}
                            </div>
                          </div>

                          {!estPaye && (
                            <button
                              onClick={() => {
                                setModalPaiement(acompte);
                                setMensualiteSelectionnee(mensualite);
                              }}
                              className={`ml-4 px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                                enRetard || duMois
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-gray-300 text-gray-600 hover:bg-gray-400'
                              }`}
                            >
                              <CheckCircle className="w-4 h-4" />
                              Valider paiement
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

      {/* Modal Validation Paiement */}
      {modalPaiement && mensualiteSelectionnee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Valider le paiement
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-600">Mensualité</p>
                  <p className="font-bold text-gray-900">
                    {mensualiteSelectionnee.numero}/{modalPaiement.mensualites.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Mois</p>
                  <p className="font-bold text-gray-900">
                    {new Date(mensualiteSelectionnee.mois + '-01').toLocaleDateString('fr-FR', { 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Montant</p>
                  <p className="font-bold text-green-600 text-xl">
                    {mensualiteSelectionnee.montant.toFixed(2)}€
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Après paiement</p>
                  <p className="font-bold text-orange-600">
                    Restant: {((parseFloat(modalPaiement.montant || 0) - (modalPaiement.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0)) - parseFloat(mensualiteSelectionnee.montant || 0)).toFixed(2)}€
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date du virement *
                </label>
                <input
                  type="date"
                  value={formPaiement.datePaiement}
                  onChange={(e) => setFormPaiement({...formPaiement, datePaiement: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Référence virement *
                </label>
                <input
                  type="text"
                  value={formPaiement.referenceVirement}
                  onChange={(e) => setFormPaiement({...formPaiement, referenceVirement: e.target.value})}
                  placeholder="VIR-20250124-001"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setModalPaiement(null);
                  setMensualiteSelectionnee(null);
                  setFormPaiement({
                    datePaiement: new Date().toISOString().split('T')[0],
                    referenceVirement: ''
                  });
                }}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleValiderPaiement}
                disabled={!formPaiement.referenceVirement.trim()}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                Valider le paiement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcomptesComptable;

