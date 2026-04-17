import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import VisiteMedicaleSuiviPopup from './VisiteMedicaleSuiviPopup';
import API_BASE from '../config/api';
const VisiteMedicaleManagerPopup = () => {
  const { user } = useAuth();
  const [notificationSuivi, setNotificationSuivi] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && (user.role === 'MANAGER' || user.role === 'RH')) {
      fetchNotificationsSuivi();
      // Vérifier toutes les 10 secondes pour les notifications de suivi (popup urgent)
      const interval = setInterval(fetchNotificationsSuivi, 10 * 1000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchNotificationsSuivi = async () => {
    try {
      // Essayer plusieurs IDs possibles pour le manager
      const userId = user.userId || user.id || user.salesforceId;
      const salesforceId = user.salesforceId;

      // Construire l'URL avec salesforceId si disponible
      let url = `${API_BASE}/api/notifications/${userId}`;
      if (salesforceId) {
        url += `?salesforceId=${salesforceId}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const allNotifications = await response.json();

        // Filtrer les notifications de suivi non lues
        const suiviNonLues = allNotifications.filter(notif =>
          notif.type === 'VISITE_MEDICALE_SUIVI' &&
          !notif.lue
        );

        if (suiviNonLues.length > 0) {
          setNotificationSuivi(suiviNonLues[0]); // Afficher la première
        } else {
          setNotificationSuivi(null);
        }
        setLoading(false);
      } else {
        const errorText = await response.text();
        console.error('[VISITE_MEDICALE_MANAGER] Erreur réponse API:', response.status, errorText);
        setLoading(false);
      }
    } catch (error) {
      console.error('[VISITE_MEDICALE_MANAGER] Erreur récupération notifications suivi:', error);
      setLoading(false);
    }
  };

  const handleClose = async () => {
    // Attendre un peu pour que le backend traite le marquage comme lu
    await new Promise(resolve => setTimeout(resolve, 800));
    setNotificationSuivi(null);
    // Recharger immédiatement pour vérifier qu'il n'y a plus de notifications non lues
    await fetchNotificationsSuivi();
  };

  const handleRenouveler = () => {
    // Recharger les notifications après renouvellement
    fetchNotificationsSuivi();
  };

  if (loading || !notificationSuivi) {
    return null;
  }

  return (
    <VisiteMedicaleSuiviPopup
      notification={notificationSuivi}
      onClose={handleClose}
      onRenouveler={handleRenouveler}
    />
  );
};

export default VisiteMedicaleManagerPopup;

