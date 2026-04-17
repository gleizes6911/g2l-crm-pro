import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, Check, X, Trash2, CheckCircle2, XCircle, Info, Calendar, DollarSign, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationsValidationModal from './NotificationsValidationModal';
import API_BASE from '../../config/api';
const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('TOUTES'); // TOUTES, NON_LUES, DEMANDE_ABSENCE, ABSENCE_VALIDEE, ABSENCE_REFUSEE
  const [validationEnCours, setValidationEnCours] = useState({});
  const [refusEnCours, setRefusEnCours] = useState({});
  const [motifRefus, setMotifRefus] = useState('');
  const [modalRefusOuverte, setModalRefusOuverte] = useState(false);
  const [absenceARefuser, setAbsenceARefuser] = useState(null);
  const [modalAcompteOuverte, setModalAcompteOuverte] = useState(false);
  const [acompteATraiter, setAcompteATraiter] = useState(null);
  const [employes, setEmployes] = useState([]);
  const [modalValidationOuverte, setModalValidationOuverte] = useState(false);
  
  const getMoisParDefaut = () => {
    const maintenant = new Date();
    if (maintenant.getDate() > 20) {
      const moisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
      return moisSuivant.toISOString().substring(0, 7);
    }
    return maintenant.toISOString().substring(0, 7);
  };
  
  const [modalites, setModalites] = useState({
    type: 'UNIQUE',
    nbMensualites: 1,
    moisDebut: getMoisParDefaut(),
    mensualitesPersonnalisees: []
  });

  useEffect(() => {
    if (user && user.userId) {
      fetchNotifications();
      fetchEmployes();
    }
  }, [user]);

  const fetchEmployes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/employes`);
      if (response.ok) {
        const data = await response.json();
        setEmployes(data.employes || []);
      }
    } catch (error) {
      console.error('Erreur récupération employés:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/notifications/${user.userId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[FRONTEND] Notifications récupérées:', data.length, 'notifications');
        console.log('[FRONTEND] Types de notifications:', data.map(n => ({ type: n.type, titre: n.titre, lue: n.lue, actionRequise: n.actionRequise })));
        setNotifications(data || []);
      }
    } catch (error) {
      console.error('Erreur récupération notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const marquerCommeLue = async (notificationId) => {
    try {
      const response = await fetch(`${API_BASE}/api/notifications/${notificationId}/lire`, {
        method: 'PUT'
      });
      if (response.ok) {
        fetchNotifications();
      }
    } catch (error) {
      console.error('Erreur marquer comme lue:', error);
    }
  };

  const marquerToutCommeLu = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/notifications/${user.userId}/lire-tout`, {
        method: 'PUT'
      });
      if (response.ok) {
        fetchNotifications();
      }
    } catch (error) {
      console.error('Erreur marquer tout lu:', error);
    }
  };

  const supprimerNotification = async (notificationId) => {
    try {
      const response = await fetch(`${API_BASE}/api/notifications/${notificationId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchNotifications();
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  };

  const handleRefuserAcompte = async (acompteId, notifId, motifRefus) => {
    try {
      const res = await fetch(`${API_BASE}/api/acomptes/${acompteId}/refuser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          motifRefus,
          validateurRole: 'MANAGER'
        })
      });
      
      if (!res.ok) throw new Error('Erreur refus');
      
      // Marquer comme lu
      await fetch(`${API_BASE}/api/acomptes/${acompteId}/marquer-lu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'MANAGER' })
      });
      
      // Marquer notification comme lue
      await marquerCommeLue(notifId);
      
      setModalAcompteOuverte(false);
      setAcompteATraiter(null);
      fetchNotifications();
      alert('Acompte refusé');
    } catch (error) {
      console.error('Erreur refus:', error);
      alert('Erreur lors du refus');
    }
  };

  const handleValiderAbsence = async (notifId, absenceId) => {
    if (!user) return;
    if (!absenceId) {
      alert('Absence introuvable pour cette notification');
      return;
    }
    
    setValidationEnCours(prev => ({ ...prev, [absenceId]: true }));
    try {
      // Marquer la notification comme lue dans l'état local immédiatement (retour visuel instantané)
      setNotifications(prev => prev.map(n => 
        n.id === notifId ? { ...n, lue: true } : n
      ));

      // Marquer la notification comme lue côté backend AVANT la validation (car elle sera supprimée après)
      try {
        await fetch(`${API_BASE}/api/notifications/${notifId}/lire`, {
          method: 'PUT'
        });
      } catch (err) {
        console.error('[FRONTEND] Erreur marquer notification lue:', err);
      }

      const response = await fetch(`${API_BASE}/api/absences/${absenceId}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          validateurRole: user.role
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la validation');
      }

      // La notification de demande sera supprimée côté backend
      // Une nouvelle notification de confirmation sera créée
      // Attendre un peu pour laisser le backend traiter
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchNotifications();
      alert('Absence validée avec succès');
    } catch (error) {
      console.error('Erreur validation absence:', error);
      alert(error.message || 'Erreur lors de la validation. Veuillez réessayer.');
    } finally {
      setValidationEnCours(prev => ({ ...prev, [absenceId]: false }));
    }
  };

  const handleRefuserAbsence = async (notifId, absenceId) => {
    if (!user || !motifRefus.trim()) {
      alert('Veuillez saisir un motif de refus');
      return;
    }

    console.log('[FRONTEND] Refus absence - notifId:', notifId, 'absenceId:', absenceId);
    setRefusEnCours(prev => ({ ...prev, [absenceId]: true }));
    try {
      // Marquer la notification comme lue dans l'état local immédiatement (retour visuel instantané)
      setNotifications(prev => prev.map(n => 
        n.id === notifId ? { ...n, lue: true } : n
      ));

      // Marquer la notification comme lue côté backend AVANT le refus (car elle sera supprimée après)
      try {
        await fetch(`${API_BASE}/api/notifications/${notifId}/lire`, {
          method: 'PUT'
        });
      } catch (err) {
        console.error('[FRONTEND] Erreur marquer notification lue:', err);
      }

      const response = await fetch(`${API_BASE}/api/absences/${absenceId}/refuser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          validateurRole: user.role,
          motifRefus: motifRefus.trim()
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors du refus');
      }

      const data = await response.json();
      console.log('[FRONTEND] Absence refusée avec succès:', data);

      // Fermer la modal immédiatement
      setModalRefusOuverte(false);
      setAbsenceARefuser(null);
      setMotifRefus('');
      
      // La notification de demande sera supprimée côté backend
      // Une nouvelle notification de confirmation sera créée
      // Attendre un peu pour laisser le backend traiter
      await new Promise(resolve => setTimeout(resolve, 1500));
      await fetchNotifications();
      
      alert('Absence refusée');
    } catch (error) {
      console.error('[FRONTEND] Erreur refus absence:', error);
      alert(error.message || 'Erreur lors du refus. Veuillez réessayer.');
    } finally {
      setRefusEnCours(prev => ({ ...prev, [absenceId]: false }));
    }
  };

  const getIcone = (type, icone) => {
    // Si une icône personnalisée est fournie (emoji), l'utiliser
    if (icone && typeof icone === 'string' && icone.trim().length > 0) {
      return <span className="text-2xl">{icone}</span>;
    }
    
    switch (type) {
      case 'DEMANDE_ABSENCE':
        return <Calendar className="w-5 h-5" />;
      case 'ABSENCE_VALIDEE':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'ABSENCE_REFUSEE':
        return <XCircle className="w-5 h-5" />;
      case 'ABSENCE_ANNULEE':
        return <span className="text-2xl">🚨</span>; // Girophare pour annulation
      case 'MODIFICATION_ABSENCE':
        return <Info className="w-5 h-5" />;
      case 'ACOMPTE_DEMANDE':
      case 'ACOMPTE_VALIDE':
      case 'ACOMPTE_VALIDEE': // Ancien format pour compatibilité
      case 'ACOMPTE_REFUSEE':
      case 'ACOMPTE_PAYE':
        return <DollarSign className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getCouleur = (notification) => {
    if (notification.couleur === 'blue') return 'bg-blue-50 border-blue-200';
    if (notification.couleur === 'green') return 'bg-green-50 border-green-200';
    if (notification.couleur === 'red') return 'bg-red-50 border-red-200';
    return 'bg-gray-50 border-gray-200';
  };

  const getCouleurTexte = (notification) => {
    if (notification.couleur === 'blue') return 'text-blue-800';
    if (notification.couleur === 'green') return 'text-green-800';
    if (notification.couleur === 'red') return 'text-red-800';
    return 'text-gray-800';
  };

  const notificationsFiltrees = notifications
    .filter(notif => {
      if (filter === 'NON_LUES') return !notif.lue;
      if (filter === 'TOUTES') return true;
      if (filter === 'DEMANDE_ABSENCE') return notif.type === 'DEMANDE_ABSENCE';
      if (filter === 'ABSENCE_VALIDEE') return notif.type === 'ABSENCE_VALIDEE';
      if (filter === 'ABSENCE_REFUSEE') return notif.type === 'ABSENCE_REFUSEE';
      if (filter === 'ABSENCE_ANNULEE') return notif.type === 'ABSENCE_ANNULEE';
      return notif.type === filter;
    })
    .sort((a, b) => {
      // Trier : d'abord les non lues, puis par date (plus récentes en premier)
      if (a.lue !== b.lue) return a.lue ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  
  console.log('[FRONTEND] Notifications filtrées:', {
    total: notifications.length,
    filtrees: notificationsFiltrees.length,
    filter,
    types: notificationsFiltrees.map(n => ({ type: n.type, titre: n.titre, lue: n.lue }))
  });

  const nonLuesCount = notifications.filter(n => !n.lue).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Bell className="w-8 h-8 text-blue-600" />
            Notifications
          </h1>
          <p className="text-gray-600 mt-2">
            {nonLuesCount > 0 ? `${nonLuesCount} notification(s) non lue(s)` : 'Toutes les notifications sont lues'}
          </p>
        </div>
        {nonLuesCount > 0 && (
          <button
            onClick={marquerToutCommeLu}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <Check className="w-5 h-5" />
            Tout marquer comme lu
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'TOUTES', label: 'Toutes' },
          { value: 'NON_LUES', label: 'Non lues', count: nonLuesCount },
          { value: 'DEMANDE_ABSENCE', label: 'Demandes absences' },
          { value: 'ACOMPTE_DEMANDE', label: 'Demandes acomptes' },
          { value: 'WEBFLEET_ALERT', label: 'Alertes flotte' },
          { value: 'ABSENCE_VALIDEE', label: 'Absences validées' },
          { value: 'ABSENCE_REFUSEE', label: 'Absences refusées' },
          { value: 'ABSENCE_ANNULEE', label: 'Absences annulées' }
        ].map(filtre => (
          <button
            key={filtre.value}
            onClick={() => setFilter(filtre.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === filtre.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filtre.label}
            {filtre.count !== undefined && filtre.count > 0 && (
              <span className="ml-2 bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs">
                {filtre.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Liste notifications */}
      {notificationsFiltrees.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-xl font-medium text-gray-600">Aucune notification</p>
          <p className="text-gray-500 mt-2">
            {filter === 'NON_LUES' ? 'Toutes les notifications sont lues' : 'Aucune notification dans cette catégorie'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notificationsFiltrees.map(notif => (
            <div
              key={notif.id}
              className={`bg-white rounded-xl shadow-lg border-2 p-6 transition-all ${
                !notif.lue ? 'border-blue-500' : getCouleur(notif)
              } ${
                notif.type === 'ACOMPTE_DEMANDE' && notif.acompteId && user?.role === 'MANAGER'
                  ? 'cursor-pointer hover:shadow-xl'
                  : ''
              }`}
              onClick={async () => {
                // Si c'est une notification d'acompte pour un manager, ouvrir la popup
                if (notif.type === 'ACOMPTE_DEMANDE' && notif.acompteId && user?.role === 'MANAGER') {
                  try {
                    const res = await fetch(`${API_BASE}/api/acomptes`);
                    const acomptes = await res.json();
                    const acompte = acomptes.find(a => a.id === notif.acompteId);
                    if (acompte) {
                      setAcompteATraiter({ notifId: notif.id, acompte });
                      setModalAcompteOuverte(true);
                    }
                  } catch (error) {
                    console.error('Erreur récupération acompte:', error);
                  }
                }
              }}
            >
              <div className="flex items-start gap-4">
                {/* Icône */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                  notif.couleur === 'blue' ? 'bg-blue-100 text-blue-600' :
                  notif.couleur === 'green' ? 'bg-green-100 text-green-600' :
                  notif.couleur === 'red' ? 'bg-red-100 text-red-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {getIcone(notif.type, notif.icone)}
                </div>

                {/* Contenu */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`text-lg font-bold ${getCouleurTexte(notif)}`}>
                          {notif.titre}
                        </h3>
                        {!notif.lue && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                            Nouveau
                          </span>
                        )}
                        {notif.actionRequise && notif.type === 'DEMANDE_ABSENCE' && (
                          <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">
                            Action requise
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 mb-2">{notif.message}</p>
                      {notif.details && (
                        <div className="bg-gray-100 rounded-lg p-3 mt-2">
                          <p className="text-sm text-gray-700">
                            <strong>Détails :</strong> {notif.details}
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(notif.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {notif.type === 'DEMANDE_ABSENCE' && notif.absenceId && notif.actionRequise && !validationEnCours[notif.absenceId] && !refusEnCours[notif.absenceId] && (
                        <>
                          <button
                            onClick={() => handleValiderAbsence(notif.id, notif.absenceId)}
                            disabled={validationEnCours[notif.absenceId] || refusEnCours[notif.absenceId]}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            title="Valider l'absence"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {validationEnCours[notif.absenceId] ? 'Validation...' : 'Valider'}
                          </button>
                          <button
                            onClick={() => {
                              setAbsenceARefuser({ notifId: notif.id, absenceId: notif.absenceId });
                              setModalRefusOuverte(true);
                            }}
                            disabled={refusEnCours[notif.absenceId] || validationEnCours[notif.absenceId]}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            title="Refuser l'absence"
                          >
                            <XCircle className="w-4 h-4" />
                            {refusEnCours[notif.absenceId] ? 'Refus...' : 'Refuser'}
                          </button>
                        </>
                      )}
                      {notif.type === 'ACOMPTE_DEMANDE' && notif.acompteId && notif.actionRequise && user?.role === 'MANAGER' && (
                        <button
                          onClick={async () => {
                            // Récupérer les détails de l'acompte
                            try {
                              const res = await fetch(`${API_BASE}/api/acomptes`);
                              const acomptes = await res.json();
                              const acompte = acomptes.find(a => a.id === notif.acompteId);
                              if (acompte) {
                                setAcompteATraiter({ notifId: notif.id, acompte });
                                setModalAcompteOuverte(true);
                              }
                            } catch (error) {
                              console.error('Erreur récupération acompte:', error);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
                          title="Traiter la demande d'acompte"
                        >
                          <DollarSign className="w-4 h-4" />
                          Traiter
                        </button>
                      )}
                      {(notif.type === 'ACOMPTE_VALIDE' || notif.type === 'ACOMPTE_VALIDEE') && notif.acompteId && user?.role === 'RH' && (
                        <button
                          onClick={async () => {
                            // Marquer comme lu et classer
                            try {
                              await fetch(`${API_BASE}/api/acomptes/${notif.acompteId}/marquer-lu`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ role: 'RH' })
                              });
                              // Attendre un peu pour que le backend traite
                              await new Promise(resolve => setTimeout(resolve, 300));
                              await marquerCommeLue(notif.id);
                              fetchNotifications();
                            } catch (error) {
                              console.error('Erreur marquer lu:', error);
                            }
                          }}
                          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm font-medium"
                          title="Marquer comme lu"
                        >
                          Marquer lu
                        </button>
                      )}
                      {!notif.lue && (
                        <button
                          onClick={() => marquerCommeLue(notif.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Marquer comme lue"
                        >
                          <Check className="w-5 h-5 text-gray-600" />
                        </button>
                      )}
                      <button
                        onClick={() => supprimerNotification(notif.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal traitement acompte */}
      {modalAcompteOuverte && acompteATraiter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="bg-green-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <DollarSign className="w-6 h-6" />
                    Demande d'acompte
                  </h2>
                  <p className="text-green-100 text-sm mt-1">Traitement de la demande</p>
                </div>
                <button
                  onClick={() => {
                    setModalAcompteOuverte(false);
                    setAcompteATraiter(null);
                  }}
                  className="text-white hover:text-gray-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Informations employé */}
              {(() => {
                const employe = employes.find(e => e.id === acompteATraiter.acompte.employeId);
                return (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-lg">{employe?.nomComplet || 'Inconnu'}</p>
                        <p className="text-sm text-gray-600">{employe?.societe || '—'}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              {/* Montant */}
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Montant demandé</p>
                <p className="text-3xl font-bold text-blue-600">{acompteATraiter.acompte.montant}€</p>
              </div>
              
              {/* Motif/Commentaire */}
              {acompteATraiter.acompte.motif && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Commentaire du salarié :</p>
                  <p className="text-gray-900 whitespace-pre-wrap">{acompteATraiter.acompte.motif}</p>
                </div>
              )}
              
              {/* Date de demande */}
              <div className="text-sm text-gray-500">
                Demandé le {new Date(acompteATraiter.acompte.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => {
                    // Ouvrir la popup de validation avec modalités
                    setModalAcompteOuverte(false);
                    setModalValidationOuverte(true);
                    // Réinitialiser les modalités
                    setModalites({
                      type: 'UNIQUE',
                      nbMensualites: 1,
                      moisDebut: getMoisParDefaut(),
                      mensualitesPersonnalisees: []
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  VALIDER (avec modalités)
                </button>
                <button
                  onClick={() => {
                    const motif = prompt('Motif du refus :');
                    if (motif) {
                      handleRefuserAcompte(acompteATraiter.acompte.id, acompteATraiter.notifId, motif);
                    }
                  }}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  REFUSER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal validation avec modalités */}
      {modalValidationOuverte && acompteATraiter && (
        <NotificationsValidationModal
          acompte={acompteATraiter.acompte}
          notifId={acompteATraiter.notifId}
          user={user}
          onClose={() => {
            setModalValidationOuverte(false);
            setAcompteATraiter(null);
          }}
          onSuccess={() => {
            fetchNotifications();
          }}
        />
      )}

      {/* Modal refus absence */}
      {modalRefusOuverte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="bg-red-600 text-white p-6 rounded-t-xl">
              <h2 className="text-xl font-bold">Refuser l'absence</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Veuillez indiquer le motif du refus :
              </p>
              <textarea
                value={motifRefus}
                onChange={(e) => setMotifRefus(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows="4"
                placeholder="Motif du refus..."
                required
              />
            </div>
            <div className="flex gap-3 p-6 border-t">
              <button
                onClick={() => {
                  setModalRefusOuverte(false);
                  setAbsenceARefuser(null);
                  setMotifRefus('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                Annuler
              </button>
              <button
                onClick={() => handleRefuserAbsence(absenceARefuser?.notifId, absenceARefuser?.absenceId)}
                disabled={!motifRefus.trim() || refusEnCours[absenceARefuser?.absenceId]}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refusEnCours[absenceARefuser?.absenceId] ? 'Refus en cours...' : 'Confirmer le refus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;

