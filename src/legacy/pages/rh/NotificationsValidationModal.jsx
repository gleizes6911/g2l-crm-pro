import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Euro, X, CheckCircle2 } from 'lucide-react';
import API_BASE from '../../config/api';
const NotificationsValidationModal = ({ acompte, notifId, user, onClose, onSuccess }) => {
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

  // Initialiser les mensualités quand le modal s'ouvre
  useEffect(() => {
    if (acompte && modalites.mensualitesPersonnalisees.length === 0) {
      const mensualitesInitiales = [];
      const montantParMois = Math.round(acompte.montant / modalites.nbMensualites * 100) / 100;
      let restant = acompte.montant;
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
  }, [acompte]);

  const calculerMensualites = useMemo(() => {
    if (!acompte) return [];
    
    // Toujours utiliser les mensualités personnalisées (elles sont initialisées au chargement)
    if (modalites.mensualitesPersonnalisees && modalites.mensualitesPersonnalisees.length > 0) {
      return modalites.mensualitesPersonnalisees;
    }
    
    // Fallback : calculer automatiquement avec le mois actuel
    const mensualites = [];
    const montantParMois = Math.round(acompte.montant / modalites.nbMensualites * 100) / 100;
    let restant = acompte.montant;
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
  }, [acompte, modalites.nbMensualites, modalites.mensualitesPersonnalisees]);

  const mettreAJourMensualite = (index, nouveauMois) => {
    const mensualites = calculerMensualites;
    const nouvellesMensualites = [...mensualites];
    
    // Si c'est la première mensualité (index 0), recalculer toutes les mensualités suivantes
    if (index === 0) {
      nouvellesMensualites[0].mois = nouveauMois;
      
      // Recalculer les mensualités suivantes à partir du nouveau premier mois
      const [annee, mois] = nouveauMois.split('-');
      const montantParMois = Math.round(acompte.montant / modalites.nbMensualites * 100) / 100;
      let restant = acompte.montant;
      
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

  const handleValider = async () => {
    try {
      if (!modalites.type) {
        alert('Veuillez sélectionner le type de paiement');
        return;
      }
      
      if (calculerMensualites.length === 0) {
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
      
      const mensualitesFinales = modalites.mensualitesPersonnalisees && modalites.mensualitesPersonnalisees.length > 0
        ? modalites.mensualitesPersonnalisees
        : calculerMensualites;

      const payload = {
        validateurId: user.userId || user.id,
        validateurNom: user.nom || user.nomComplet || 'Manager',
        modalites: {
          type: modalites.type,
          nbMensualites: modalites.type === 'UNIQUE' ? 1 : modalites.nbMensualites,
          mensualites: mensualitesFinales
        }
      };
      
      const url = `${API_BASE}/api/acomptes/${acompte.id}/valider-avec-modalites`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(errorData.error || 'Erreur validation');
      }
      
      const result = await response.json();
      
      // Marquer notification comme lue
      await fetch(`${API_BASE}/api/notifications/${notifId}/lire`, {
        method: 'PUT'
      });
      
      onSuccess();
      onClose();
      alert('Acompte validé avec succès !');
    } catch (err) {
      console.error('Erreur:', err);
      alert(`Erreur lors de la validation: ${err.message || 'Erreur inconnue'}`);
    }
  };

  if (!acompte) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-blue-600 text-white p-6 rounded-t-xl sticky top-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Euro className="w-6 h-6" />
                Validation avec modalités de paiement
              </h2>
              <p className="text-blue-100 text-sm mt-1">Montant: {acompte.montant}€</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Type de paiement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type de paiement *
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setModalites({
                  ...modalites, 
                  type: 'UNIQUE', 
                  nbMensualites: 1,
                  mensualitesPersonnalisees: []
                })}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${
                  modalites.type === 'UNIQUE'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Paiement unique
              </button>
              <button
                type="button"
                onClick={() => setModalites({
                  ...modalites, 
                  type: 'ECHELONNE', 
                  nbMensualites: 2,
                  mensualitesPersonnalisees: []
                })}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${
                  modalites.type === 'ECHELONNE'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Paiement échelonné
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
                  const montantParMois = Math.round(acompte.montant / nouveauNb * 100) / 100;
                  let restant = acompte.montant;
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

          {/* Aperçu des mensualités avec modification */}
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

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Annuler
            </button>
            <button
              onClick={handleValider}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Valider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsValidationModal;

