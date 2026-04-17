import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Calendar, Clock, Check } from 'lucide-react';
import API_BASE from '../config/api';
const VisiteMedicalePopup = () => {
  const { user } = useAuth();
  const [notificationsVisites, setNotificationsVisites] = useState([]);
  const [notificationActuelle, setNotificationActuelle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && (user.role === 'EMPLOYE' || user.salesforceId)) {
      fetchNotificationsVisites();
    }
  }, [user]);

  const fetchNotificationsVisites = async () => {
    try {
      const userId = user.userId || user.id;
      const response = await fetch(`${API_BASE}/api/notifications/${userId}`);
      if (response.ok) {
        const allNotifications = await response.json();
        // Filtrer les notifications de visites médicales non lues (URGENTE ou HAUTE)
        const visitesNonLues = allNotifications.filter(notif => 
          (notif.type === 'VISITE_MEDICALE_PROGRAMMEE' || notif.type === 'VISITE_MEDICALE_RAPPEL') &&
          !notif.lue &&
          (notif.priorite === 'URGENTE' || notif.priorite === 'HAUTE')
        );
        
        setNotificationsVisites(visitesNonLues);
        if (visitesNonLues.length > 0) {
          setNotificationActuelle(visitesNonLues[0]); // Afficher la première
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Erreur récupération notifications visites:', error);
      setLoading(false);
    }
  };

  const marquerCommeLue = async (notificationId) => {
    try {
      const response = await fetch(`${API_BASE}/api/notifications/${notificationId}/lire`, {
        method: 'PUT'
      });
      
      if (response.ok) {
        // Retirer la notification de la liste
        const nouvellesNotifications = notificationsVisites.filter(n => n.id !== notificationId);
        setNotificationsVisites(nouvellesNotifications);
        
        // Afficher la suivante ou fermer
        if (nouvellesNotifications.length > 0) {
          setNotificationActuelle(nouvellesNotifications[0]);
        } else {
          setNotificationActuelle(null);
        }
      }
    } catch (error) {
      console.error('Erreur marquer comme lue:', error);
    }
  };

  if (loading || !notificationActuelle) {
    return null;
  }

  const dateVisite = notificationActuelle.dateVisite 
    ? new Date(notificationActuelle.dateVisite).toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : 'Date non spécifiée';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 relative">
        {/* Indicateur de notification non lue */}
        {notificationsVisites.length > 1 && (
          <div className="absolute top-4 right-16 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
            {notificationsVisites.length}
          </div>
        )}
        
        {/* Bouton fermer (désactivé tant que non lu) */}
        <button
          onClick={() => {
            if (notificationActuelle.lue) {
              marquerCommeLue(notificationActuelle.id);
            } else {
              alert('Vous devez marquer cette notification comme lue avant de continuer.');
            }
          }}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          disabled={!notificationActuelle.lue}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header urgent */}
        <div className="bg-red-600 text-white p-4 rounded-t-lg -m-6 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏥</span>
            <div>
              <h2 className="text-2xl font-bold">{notificationActuelle.titre}</h2>
              <p className="text-red-100 text-sm mt-1">Notification URGENTE - Action requise</p>
            </div>
          </div>
        </div>

        {/* Contenu */}
        <div className="space-y-4 mt-6">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-red-900 font-semibold text-lg">{notificationActuelle.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-gray-700 mb-2">
                <Calendar className="w-5 h-5" />
                <span className="font-semibold">Date de la visite</span>
              </div>
              <p className="text-gray-900 text-lg font-bold">{dateVisite}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-gray-700 mb-2">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Heure</span>
              </div>
              <p className="text-gray-900 text-lg font-bold">
                {notificationActuelle.heureVisite || 'Non spécifiée'}
              </p>
            </div>
          </div>

          {notificationActuelle.details && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-blue-900 text-sm">{notificationActuelle.details}</p>
            </div>
          )}

          {notificationActuelle.joursRestants !== undefined && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
              <p className="text-orange-900 font-semibold">
                {notificationActuelle.joursRestants === 0 
                  ? "⚠️ Votre visite médicale est prévue AUJOURD'HUI !"
                  : notificationActuelle.joursRestants === 1
                  ? "⚠️ Votre visite médicale est prévue DEMAIN !"
                  : `⏰ Rappel : Votre visite médicale est dans ${notificationActuelle.joursRestants} jours`
                }
              </p>
            </div>
          )}
        </div>

        {/* Bouton Marquer comme lu (obligatoire) */}
        <div className="mt-6 pt-6 border-t">
          <button
            onClick={() => marquerCommeLue(notificationActuelle.id)}
            className="w-full px-6 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold text-lg flex items-center justify-center gap-3 transition-colors shadow-lg"
          >
            <Check className="w-6 h-6" />
            Marquer comme lu
          </button>
          <p className="text-center text-sm text-gray-500 mt-2">
            Vous devez marquer cette notification comme lue pour continuer
          </p>
        </div>
      </div>
    </div>
  );
};

export default VisiteMedicalePopup;

