import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Check, XCircle, Upload, Calendar } from 'lucide-react';
import API_BASE from '../config/api';
const VisiteMedicaleSuiviPopup = ({ notification, onClose, onRenouveler }) => {
  const { user } = useAuth();
  const [visiteEffectuee, setVisiteEffectuee] = useState(null);
  const [modalRenouvellement, setModalRenouvellement] = useState(false);
  const [dureeRenouvellement, setDureeRenouvellement] = useState(null);
  const [fichierRenouvellement, setFichierRenouvellement] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const handleReponse = async (effectuee) => {
    // Marquer la notification comme lue IMMÉDIATEMENT, que ce soit OUI ou NON
    // Cela évite que le popup revienne si l'utilisateur ferme sans compléter le renouvellement
    await marquerCommeLue();
    
    setVisiteEffectuee(effectuee);
    
    if (effectuee) {
      // Ouvrir le modal de renouvellement
      setModalRenouvellement(true);
    } else {
      // Fermer directement si NON
      onClose();
    }
  };

  const marquerCommeLue = async () => {
    try {
      console.log('[VISITE_SUIVI] Marquage notification comme lue:', notification.id);
      const response = await fetch(`${API_BASE}/api/notifications/${notification.id}/lire`, {
        method: 'PUT'
      });
      if (response.ok) {
        const notifMarquee = await response.json();
        console.log('[VISITE_SUIVI] Notification marquée comme lue avec succès:', {
          id: notifMarquee.id,
          lue: notifMarquee.lue
        });
        // Attendre un peu pour que le backend traite
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        const errorText = await response.text();
        console.error('[VISITE_SUIVI] Erreur réponse API:', response.status, errorText);
      }
    } catch (error) {
      console.error('[VISITE_SUIVI] Erreur marquer comme lue:', error);
    }
  };

  const handleRenouveler = async () => {
    if (!dureeRenouvellement) {
      alert('Veuillez sélectionner une durée de renouvellement');
      return;
    }

    try {
      setEnCours(true);
      
      // Calculer la nouvelle date (aujourd'hui + durée)
      const nouvelleDate = new Date();
      nouvelleDate.setFullYear(nouvelleDate.getFullYear() + parseInt(dureeRenouvellement));
      const dateStr = nouvelleDate.toISOString().split('T')[0];
      const heureVisite = '09:00'; // Heure par défaut pour le renouvellement
      
      // Créer le formulaire pour upload
      const formData = new FormData();
      formData.append('employeId', notification.employeId);
      formData.append('categorie', 'VISITE_MEDICALE');
      formData.append('description', `Visite médicale renouvelée - Durée: ${dureeRenouvellement} an(s)`);
      formData.append('dateExpiration', dateStr);
      formData.append('version', 'unique');
      formData.append('heureVisite', '09:00');
      
      if (fichierRenouvellement) {
        formData.append('file', fichierRenouvellement);
      }
      
      // Ajouter les infos utilisateur pour validation automatique
      if (user) {
        formData.append('userRole', user.role);
        formData.append('userNom', user.nom || user.nomComplet || '');
        formData.append('userId', user.userId || user.id || '');
      }

      const response = await fetch(`${API_BASE}/api/documents/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors du renouvellement');
      }

      // La notification est déjà marquée comme lue dans handleReponse
      // Appeler le callback de renouvellement
      if (onRenouveler) {
        onRenouveler();
      }
      
      onClose();
      alert(`Visite médicale renouvelée pour ${dureeRenouvellement} an(s). Nouvelle date: ${dateStr}`);
    } catch (error) {
      console.error('Erreur renouvellement:', error);
      alert('Erreur lors du renouvellement: ' + error.message);
    } finally {
      setEnCours(false);
    }
  };

  if (visiteEffectuee === null) {
    // Modal de question
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="bg-orange-600 text-white p-4 rounded-t-lg -m-6 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="text-2xl">🏥</span>
              Suivi visite médicale
            </h2>
          </div>

          <div className="space-y-4 mt-4">
            <p className="text-gray-900 font-semibold text-lg">
              Le salarié <span className="text-blue-600">{notification.employeNom}</span> avait une visite médicale aujourd'hui à <span className="text-blue-600">{notification.heureVisite}</span>.
            </p>
            <p className="text-gray-700 font-medium">
              Cette visite a-t-elle été effectuée ?
            </p>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => handleReponse(true)}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                OUI
              </button>
              <button
                onClick={() => handleReponse(false)}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                NON
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (modalRenouvellement) {
    // Modal de renouvellement
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="bg-green-600 text-white p-4 rounded-t-lg -m-6 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="text-2xl">🏥</span>
              Renouvellement visite médicale
            </h2>
          </div>

          <div className="space-y-4 mt-4">
            <p className="text-gray-900">
              Visite médicale effectuée pour <span className="font-semibold">{notification.employeNom}</span>
            </p>

            {/* Pièce jointe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pièce jointe (attestation de visite)
              </label>
              <input
                type="file"
                onChange={(e) => setFichierRenouvellement(e.target.files[0])}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-500 mt-1">Formats acceptés : PDF, DOC, DOCX, JPG, PNG</p>
            </div>

            {/* Durée renouvellement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Durée de renouvellement <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDureeRenouvellement('1')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    dureeRenouvellement === '1'
                      ? 'bg-green-600 text-white border-transparent'
                      : 'border-gray-300 hover:border-green-500'
                  }`}
                >
                  <div className="text-center">
                    <Calendar className="w-8 h-8 mx-auto mb-2" />
                    <div className="text-lg font-bold">1 an</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDureeRenouvellement('5')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    dureeRenouvellement === '5'
                      ? 'bg-green-600 text-white border-transparent'
                      : 'border-gray-300 hover:border-green-500'
                  }`}
                >
                  <div className="text-center">
                    <Calendar className="w-8 h-8 mx-auto mb-2" />
                    <div className="text-lg font-bold">5 ans</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={() => {
                  setModalRenouvellement(false);
                  setVisiteEffectuee(null);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleRenouveler}
                disabled={!dureeRenouvellement || enCours}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {enCours ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Renouveler
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default VisiteMedicaleSuiviPopup;

