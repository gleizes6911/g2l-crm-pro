import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Plus, Filter, Users, Activity, TrendingDown, AlertCircle, Download, CheckCircle, XCircle, AlertTriangle, Trash2, Check, X } from 'lucide-react';
import API_BASE from '../../config/api';
const Absences = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employes, setEmployes] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moisSelectionne, setMoisSelectionne] = useState(new Date());
  const [modalOuverte, setModalOuverte] = useState(false);
  const [filtreEmploye, setFiltreEmploye] = useState('');
  const [filtreType, setFiltreType] = useState('Tous');

  // États pour le formulaire
  const [nouvelleAbsence, setNouvelleAbsence] = useState({
    employeId: '',
    type: 'CP',
    dateDebut: '',
    dateFin: '',
    motif: ''
  });
  const [erreurFormulaire, setErreurFormulaire] = useState('');
  const [soumissionEnCours, setSoumissionEnCours] = useState(false);
  const [absenceSelectionnee, setAbsenceSelectionnee] = useState(null);
  const [modalDetailsOuverte, setModalDetailsOuverte] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [absenceEnEdition, setAbsenceEnEdition] = useState(null);
  const [modalListeOuverte, setModalListeOuverte] = useState(false);
  const [listeTypeSelectionne, setListeTypeSelectionne] = useState(null);
  const [jourSelectionne, setJourSelectionne] = useState(null);
  const [modalJourOuverte, setModalJourOuverte] = useState(false);
  const [societeSelectionnee, setSocieteSelectionnee] = useState(null);
  const [modalSocieteOuverte, setModalSocieteOuverte] = useState(false);
  const [soldesCP, setSoldesCP] = useState([]);
  const [modalRefusOuverte, setModalRefusOuverte] = useState(false);
  const [motifRefus, setMotifRefus] = useState('');
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [visitesMedicales, setVisitesMedicales] = useState([]);
  const [modalVisiteMedicale, setModalVisiteMedicale] = useState(false);
  const [formVisiteMedicale, setFormVisiteMedicale] = useState({
    employeId: '',
    dateVisite: '',
    heureVisite: '',
    fichier: null
  });
  const [modalModifierVisite, setModalModifierVisite] = useState(false);
  const [visiteAModifier, setVisiteAModifier] = useState(null);

  // Types d'absences
  const typesAbsence = [
    { value: 'CP', label: 'Congés Payés', couleur: 'bg-blue-500', textCouleur: 'text-blue-800', bgClair: 'bg-blue-50' },
    { value: 'MALADIE', label: 'Arrêt Maladie', couleur: 'bg-red-500', textCouleur: 'text-red-800', bgClair: 'bg-red-50' },
    { value: 'VISITE_MEDICALE', label: 'Visite Médicale', couleur: 'bg-purple-500', textCouleur: 'text-purple-800', bgClair: 'bg-purple-50' }
  ];

  // Fonctions de récupération des données (DOIVENT être définies AVANT le useEffect)
  const fetchEmployes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/employes`);
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const data = await response.json();
      const employesList = data.employes || [];
      console.log('[FRONTEND] Employés récupérés:', employesList.length, 'employés');
      console.log('[FRONTEND] IDs employés (5 premiers):', employesList.slice(0, 5).map(e => ({ id: e.id, nom: e.nomComplet })));
      // Garder TOUS les employés (actifs + sortis) pour l'affichage des noms dans les absences historiques
      setEmployes(employesList);
      setLoading(false);
    } catch (err) {
      console.error('Erreur récupération employés:', err);
      setLoading(false);
    }
  };

  const fetchAbsences = async () => {
    try {
      console.log('[FRONTEND] Récupération des absences...');
      const response = await fetch(`${API_BASE}/api/absences`);
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const data = await response.json();

      // Normalisation IDs (correction Adrien FORMISANO)
      const OLD_ADRIEN_ID = '0034z00000A1B2C';
      const NEW_ADRIEN_ID = '003Sm00000OwslNIAR';
      const absencesNormalisees = (data || []).map(a => {
        if (a.employeId === OLD_ADRIEN_ID) {
          return { ...a, employeId: NEW_ADRIEN_ID };
        }
        return a;
      });

      console.log('[FRONTEND] Absences reçues:', absencesNormalisees.length, 'absences');
      console.log('[FRONTEND] Statuts:', absencesNormalisees.map(a => ({ id: a.id, statut: a.statut, employeId: a.employeId })));
      setAbsences(absencesNormalisees);
    } catch (err) {
      console.error('[FRONTEND] Erreur récupération absences:', err);
      setAbsences([]);
    }
  };

  // Charger les données au montage du composant
  useEffect(() => {
    fetchEmployes();
    fetchAbsences();
    fetchSoldes();
    fetchVisitesMedicales();
  }, [moisSelectionne]);

  const fetchSoldes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/soldes-cp`);
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const data = await response.json();
      setSoldesCP(data || []);
    } catch (err) {
      console.error('Erreur récupération soldes CP:', err);
      setSoldesCP([]);
    }
  };

  const fetchVisitesMedicales = async () => {
    try {
      const annee = moisSelectionne.getFullYear();
      const mois = moisSelectionne.getMonth() + 1;
      
      const response = await fetch(
        `${API_BASE}/api/documents/visites-medicales/planning?mois=${mois}&annee=${annee}`
      );
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const data = await response.json();
      setVisitesMedicales(data || []);
    } catch (err) {
      console.error('Erreur visites médicales:', err);
      setVisitesMedicales([]);
    }
  };

  // Navigation mois
  const moisPrecedent = () => {
    const nouvellDate = new Date(moisSelectionne);
    nouvellDate.setMonth(nouvellDate.getMonth() - 1);
    setMoisSelectionne(nouvellDate);
  };

  const moisSuivant = () => {
    const nouvellDate = new Date(moisSelectionne);
    nouvellDate.setMonth(nouvellDate.getMonth() + 1);
    setMoisSelectionne(nouvellDate);
  };

  // Obtenir les jours du mois
  const getJoursDuMois = () => {
    const annee = moisSelectionne.getFullYear();
    const mois = moisSelectionne.getMonth();
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    
    return Array.from({ length: nbJours }, (_, i) => {
      const date = new Date(annee, mois, i + 1);
      return {
        jour: i + 1,
        date: date,
        estWeekend: date.getDay() === 0 || date.getDay() === 6
      };
    });
  };

  // Calculer nombre de jours ouvrables (lundi-samedi, dimanche exclu)
  // DOIT être définie AVANT statsAbsences qui l'utilise
  const calculerNombreJours = (dateDebut, dateFin) => {
    const debut = new Date(dateDebut + 'T00:00:00'); // Forcer timezone local
    const fin = new Date(dateFin + 'T00:00:00');
    let joursOuvrables = 0;
    
    for (let date = new Date(debut); date <= fin; date.setDate(date.getDate() + 1)) {
      const jour = date.getDay();
      // Compter tous les jours SAUF dimanche (0)
      // Samedi (6) est un jour ouvrable
      if (jour !== 0) {
        joursOuvrables++;
      }
    }
    
    return joursOuvrables;
  };

  // Filtrer absences par mois (exclure les employés supprimés)
  const absencesDuMois = absences.filter(absence => {
    // Vérifier que l'employé existe encore
    const employeExiste = employes.some(e => e.id === absence.employeId);
    if (!employeExiste) {
      // Si l'absence est "En attente" ou "Validée", on l'inclut quand même
      // (pour les sections dédiées et le planning)
      if (absence.statut === 'En attente' || absence.statut === 'Validée') {
        // Vérifier quand même que c'est dans le mois pour le planning
        const dateDebut = new Date(absence.dateDebut);
        const dateFin = new Date(absence.dateFin);
        const debutMois = new Date(moisSelectionne.getFullYear(), moisSelectionne.getMonth(), 1);
        const finMois = new Date(moisSelectionne.getFullYear(), moisSelectionne.getMonth() + 1, 0);
        return (dateDebut <= finMois && dateFin >= debutMois);
      }
      return false;
    }
    
    const dateDebut = new Date(absence.dateDebut);
    const dateFin = new Date(absence.dateFin);
    const debutMois = new Date(moisSelectionne.getFullYear(), moisSelectionne.getMonth(), 1);
    const finMois = new Date(moisSelectionne.getFullYear(), moisSelectionne.getMonth() + 1, 0);
    
    return (dateDebut <= finMois && dateFin >= debutMois);
  });

  // Filtrer absences selon le rôle
  const absencesFiltrees = absencesDuMois.filter(absence => {
    if (!user) return false;
    
    if (user.role === 'RH' || user.role === 'MANAGER') {
      // RH et MANAGER voient toutes les absences (validées, en attente, mais pas refusées dans le planning)
      return absence.statut !== 'Refusée';
    } else if (user.role === 'EMPLOYE') {
      // Employé voit uniquement ses absences
      return absence.employeId === user.salesforceId;
    }
    return false;
  });
  
  console.log('[FRONTEND] absencesFiltrees:', absencesFiltrees.length, 'absences pour', user?.role);
  console.log('[FRONTEND] Détail absencesFiltrees:', absencesFiltrees.slice(0, 5).map(a => ({ 
    id: a.id, 
    employeId: a.employeId, 
    statut: a.statut, 
    dateDebut: a.dateDebut, 
    dateFin: a.dateFin 
  })));
  console.log('[FRONTEND] Mois sélectionné:', moisSelectionne.getFullYear(), moisSelectionne.getMonth() + 1);
  console.log('[FRONTEND] absencesDuMois:', absencesDuMois.length, 'absences du mois');
  
  // Pour les employés : inclure TOUTES leurs absences (pas seulement celles du mois) dans "Mes demandes"
  const absencesToutesPourEmploye = user && user.role === 'EMPLOYE' 
    ? absences.filter(a => {
        const match = a.employeId === user.salesforceId;
        console.log('[FRONTEND] Filtre employé - absence:', { id: a.id, employeId: a.employeId, statut: a.statut, salesforceId: user.salesforceId, match });
        return match;
      })
    : absencesFiltrees;
  
  console.log('[FRONTEND] absencesToutesPourEmploye:', absencesToutesPourEmploye.length, 'absences pour employé');

  // Calculer stats (utilise absencesFiltrees)
  const statsAbsences = {
    total: absencesFiltrees.length,
    cp: absencesFiltrees.filter(a => a.type === 'CP').length,
    maladie: absencesFiltrees.filter(a => a.type === 'MALADIE').length,
    visitesMedicales: visitesMedicales.length,
    joursTotal: absencesFiltrees.reduce((sum, a) => {
      return sum + calculerNombreJours(a.dateDebut, a.dateFin);
    }, 0)
  };

  // Vérifier si un employé est absent un jour donné (utilise absencesFiltrees)
  // MAIS inclut aussi les absences validées/en attente même si l'employé n'est pas dans la liste
  const estAbsent = (employeId, jour) => {
    // Construire la date du jour au format YYYY-MM-DD
    const annee = moisSelectionne.getFullYear();
    const mois = String(moisSelectionne.getMonth() + 1).padStart(2, '0');
    const jourStr = String(jour).padStart(2, '0');
    const dateStr = `${annee}-${mois}-${jourStr}`;
    
    // Chercher d'abord dans toutes les absences (pas seulement absencesFiltrees)
    // car absencesFiltrees peut exclure des absences si elles ne sont pas dans le mois
    let absence = absences.find(a => {
      if (a.employeId !== employeId) return false;
      // Inclure les validées ET les en attente (pas les refusées)
      if (a.statut === 'Refusée') return false;
      if (a.statut !== 'Validée' && a.statut !== 'En attente') return false;
      // Vérifier que la date est dans la période de l'absence
      const dansPeriode = dateStr >= a.dateDebut && dateStr <= a.dateFin;
      return dansPeriode;
    });
    
    // Si pas trouvé, chercher dans absencesFiltrees (pour les cas spéciaux)
    if (!absence) {
      absence = absencesFiltrees.find(absence => {
        if (absence.employeId !== employeId) return false;
        const dansPeriode = dateStr >= absence.dateDebut && dateStr <= absence.dateFin;
        return dansPeriode;
      });
    }
    
    return absence;
  };

  // Soumettre le formulaire
  const handleSubmitAbsence = async (e) => {
    e.preventDefault();
    setErreurFormulaire('');
    
    // Validation
    if (!nouvelleAbsence.type || !nouvelleAbsence.dateDebut || !nouvelleAbsence.dateFin) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    // Pour EMPLOYE : forcer employeId à son salesforceId
    const employeId = user?.role === 'EMPLOYE' 
      ? user.salesforceId 
      : nouvelleAbsence.employeId;
    
    if (!employeId) {
      alert('Erreur : Impossible de déterminer l\'employé');
      console.error('[FRONTEND] EmployeId manquant. User:', user, 'NouvelleAbsence:', nouvelleAbsence);
      return;
    }
    
    if (new Date(nouvelleAbsence.dateFin) < new Date(nouvelleAbsence.dateDebut)) {
      alert('La date de fin doit être après la date de début');
      return;
    }
    
    try {
      setSoumissionEnCours(true);
      
      const absence = {
        employeId: employeId,
        employeNom: user?.nom || nouvelleAbsence.employeNom || '',
        type: nouvelleAbsence.type,
        dateDebut: nouvelleAbsence.dateDebut,
        dateFin: nouvelleAbsence.dateFin,
        motif: nouvelleAbsence.motif || '',
        dureeJours: calculerNombreJours(nouvelleAbsence.dateDebut, nouvelleAbsence.dateFin)
      };
      
      console.log('[FRONTEND] Envoi demande absence:', absence);
      
      const response = await fetch(`${API_BASE}/api/absences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(absence)
      });
      
      console.log('[FRONTEND] Réponse:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de l\'ajout');
      }
      
      const data = await response.json();
      console.log('[FRONTEND] Absence créée:', data);
      
      // Recharger les absences
      await fetchAbsences();
      
      // Réinitialiser et fermer
      setModalOuverte(false);
      setNouvelleAbsence({
        employeId: '',
        type: 'CP',
        dateDebut: '',
        dateFin: '',
        motif: ''
      });
      setErreurFormulaire('');
      setSoumissionEnCours(false);
      
      alert('Demande d\'absence créée avec succès ! En attente de validation.');
      
    } catch (error) {
      console.error('[FRONTEND] Erreur:', error);
      setErreurFormulaire(error.message || 'Erreur lors de la création');
      setSoumissionEnCours(false);
    }
  };

  // Supprimer une absence
  const handleSupprimerAbsence = async (absenceId) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette absence ? L\'employé recevra une notification.')) {
      return;
    }
    
    if (!user) {
      alert('Vous devez être connecté pour supprimer une absence');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/absences/${absenceId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annulateurId: user.userId,
          annulateurNom: user.nom,
          annulateurRole: user.role
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la suppression');
      }
      
      // Recharger les absences
      await fetchAbsences();
      
      // Fermer la modal
      setModalDetailsOuverte(false);
      setAbsenceSelectionnee(null);
      
      alert('Absence annulée avec succès ! L\'employé a été notifié.');
      
    } catch (error) {
      console.error('Erreur suppression absence:', error);
      alert(error.message || 'Erreur lors de la suppression. Veuillez réessayer.');
    }
  };

  // Fonction pour vérifier si l'utilisateur peut valider une absence
  const peutValiderAbsence = (absence) => {
    if (!user) return false;
    // Seuls les managers peuvent valider, pas les RH
    return user.role === 'MANAGER';
  };

  // Modifier une absence
  const handleModifierAbsence = async (e) => {
    e.preventDefault();
    
    if (!absenceEnEdition || !user) return;
    
    // Validation
    if (new Date(absenceEnEdition.dateFin) < new Date(absenceEnEdition.dateDebut)) {
      alert('La date de fin doit être postérieure ou égale à la date de début');
      return;
    }
    
    try {
      // Inclure les informations du modificateur pour les permissions backend
      const donneesModification = {
        ...absenceEnEdition,
        modificateurId: user.userId,
        modificateurNom: user.nom,
        modificateurRole: user.role
      };
      
      console.log('[FRONTEND] Modification absence:', donneesModification);
      
      const response = await fetch(`${API_BASE}/api/absences/${absenceEnEdition.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(donneesModification)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la modification');
      }
      
      // Recharger les absences
      await fetchAbsences();
      
      // Fermer la modal
      setModalDetailsOuverte(false);
      setAbsenceSelectionnee(null);
      setModeEdition(false);
      setAbsenceEnEdition(null);
      
      alert('Absence modifiée avec succès !');
      
    } catch (error) {
      console.error('Erreur modification absence:', error);
      alert(error.message || 'Erreur lors de la modification. Veuillez réessayer.');
    }
  };

  const handleValiderAbsence = async (absenceId) => {
    if (!user) return;
    
    setValidationEnCours(true);
    try {
      console.log('[FRONTEND] Validation absence:', absenceId);
      const response = await fetch(`${API_BASE}/api/absences/${absenceId}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          validateurRole: user.role
        })
      });

      console.log('[FRONTEND] Réponse validation:', response.status);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la validation');
      }

      await fetchAbsences();
      setModalDetailsOuverte(false);
      setAbsenceSelectionnee(null);
      alert('Absence validée avec succès');
    } catch (error) {
      console.error('[FRONTEND] Erreur validation absence:', error);
      alert(error.message || 'Erreur lors de la validation. Veuillez réessayer.');
    } finally {
      setValidationEnCours(false);
    }
  };

  const handleRefuserAbsence = async (absenceId) => {
    if (!user || !motifRefus.trim()) {
      alert('Veuillez saisir un motif de refus');
      return;
    }

    setValidationEnCours(true);
    try {
      console.log('[FRONTEND] Refus absence:', absenceId);
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

      console.log('[FRONTEND] Réponse refus:', response.status);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors du refus');
      }

      await fetchAbsences();
      setModalRefusOuverte(false);
      setModalDetailsOuverte(false);
      setAbsenceSelectionnee(null);
      setMotifRefus('');
      alert('Absence refusée');
    } catch (error) {
      console.error('[FRONTEND] Erreur refus absence:', error);
      alert(error.message || 'Erreur lors du refus. Veuillez réessayer.');
    } finally {
      setValidationEnCours(false);
    }
  };

  // Filtrer employés selon le rôle et le mois sélectionné
  const employesFiltres = employes
    .filter(e => {
      // Filtre selon rôle
      if (!user) return false;
      
      if (user.role === 'RH' || user.role === 'MANAGER') {
        // RH et MANAGER : uniquement les employés actifs durant le mois sélectionné
        if (!e.estActif) return false;
        
        // Vérifier si l'employé est actif durant le mois sélectionné
        const debutMois = new Date(moisSelectionne.getFullYear(), moisSelectionne.getMonth(), 1);
        const finMois = new Date(moisSelectionne.getFullYear(), moisSelectionne.getMonth() + 1, 0);
        
        // Si l'employé a une date de sortie, vérifier qu'elle est après le début du mois
        if (e.dateSortie) {
          const dateSortie = new Date(e.dateSortie);
          if (dateSortie < debutMois) return false;
        }
        
        // Si l'employé a une date d'entrée, vérifier qu'elle est avant la fin du mois
        if (e.dateEntree) {
          const dateEntree = new Date(e.dateEntree);
          if (dateEntree > finMois) return false;
        }
        
        return true;
      } else if (user.role === 'EMPLOYE') {
        // Employé voit uniquement lui-même
        return e.id === user.salesforceId && e.estActif;
      }
      return false;
    })
    .filter(e => !filtreEmploye || e.nomComplet.toLowerCase().includes(filtreEmploye.toLowerCase()))
    .filter(e => {
      if (filtreType === 'Tous') return true;
      if (filtreType === 'VISITE_MEDICALE') {
        // Pour les visites médicales, vérifier dans visitesMedicales
        return visitesMedicales.some(v => v.employeId === e.id);
      }
      return absencesFiltrees.some(a => a.employeId === e.id && a.type === filtreType);
    })
    .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));

  // Ajouter les employés manquants issus des absences (si non trouvés dans la liste)
  const employesManquants = absencesFiltrees
    .filter(a => !employes.some(e => e.id === a.employeId))
    .reduce((acc, a) => {
      if (acc.some(e => e.id === a.employeId)) return acc;
      acc.push({
        id: a.employeId,
        nomComplet: a.employeNom || 'Employé inconnu',
        estActif: true,
        societe: a.societe || 'N/A'
      });
      return acc;
    }, []);

  // Prioriser les employés manquants pour qu'ils ne soient pas coupés par la limite d'affichage
  const employesAffiches = [...employesManquants, ...employesFiltres];


  const jours = getJoursDuMois();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des absences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 w-full">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
          <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
          Gestion des Absences
        </h1>
        <p className="text-gray-600 mt-2 text-sm sm:text-base">
          Planning et suivi des congés payés et arrêts maladie
        </p>
      </div>

      {/* Vignettes par société - Cachées pour les employés */}
      {user && (user.role === 'RH' || user.role === 'MANAGER') && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Par société</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {(() => {
            // Liste des sociétés avec employés actifs
            const societes = [...new Set(employes.filter(e => e.estActif).map(e => e.societe))].filter(Boolean).sort();
            
            return societes.map(societe => {
              const employesSociete = employes.filter(e => e.estActif && e.societe === societe);
              const totalEmployes = employesSociete.length;
              
              const absencesSociete = absencesDuMois.filter(a => {
                const emp = employes.find(e => e.id === a.employeId);
                return emp && emp.societe === societe;
              });
              
              // Compter les employés uniques absents (pas les absences)
              const employesAbsentsIds = [...new Set(absencesSociete.map(a => a.employeId))];
              const nbAbsents = employesAbsentsIds.length;
              
              const nbCP = absencesSociete.filter(a => a.type === 'CP').length;
              const nbMaladie = absencesSociete.filter(a => a.type === 'MALADIE').length;
              const joursTotal = absencesSociete.reduce((sum, a) => sum + calculerNombreJours(a.dateDebut, a.dateFin), 0);
              
              const pourcentage = totalEmployes > 0 ? Math.round((nbAbsents / totalEmployes) * 100) : 0;
              
              return (
                <button
                  key={societe}
                  onClick={() => {
                    setSocieteSelectionnee(societe);
                    setModalSocieteOuverte(true);
                  }}
                  className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500 hover:shadow-xl transition-all cursor-pointer text-left w-full"
                >
                  <h4 className="font-bold text-gray-900 text-sm mb-3 truncate" title={societe}>{societe}</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Absents/Total</span>
                      <span className="font-bold text-gray-900">{nbAbsents}/{totalEmployes}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Taux absence</span>
                      <span className="font-bold text-blue-600">{pourcentage}%</span>
                    </div>
                    <div className="border-t pt-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">CP</span>
                        <span className="text-xs font-semibold text-blue-700">{nbCP}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">Maladie</span>
                        <span className="text-xs font-semibold text-red-700">{nbMaladie}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">Jours</span>
                        <span className="text-xs font-semibold text-gray-700">{joursTotal}j</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            });
          })()}
          </div>
        </div>
      )}

      {/* Vignettes TOTALES */}
      <div className="mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
          {user?.role === 'EMPLOYE' ? 'Mes statistiques' : 'Total toutes sociétés'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {(() => {
            let totalEmployesActifs, nbAbsents, pourcentage;
            
            if (user?.role === 'EMPLOYE') {
              // Pour l'employé : juste ses propres stats
              totalEmployesActifs = 1;
              nbAbsents = absencesFiltrees.length > 0 ? 1 : 0;
              pourcentage = absencesFiltrees.length > 0 ? 100 : 0;
            } else {
              // Pour RH/Manager : stats globales
              totalEmployesActifs = employes.filter(e => e.estActif).length;
              const employesAbsentsIds = [...new Set(absencesFiltrees.map(a => a.employeId))];
              nbAbsents = employesAbsentsIds.length;
              pourcentage = totalEmployesActifs > 0 ? Math.round((nbAbsents / totalEmployesActifs) * 100) : 0;
            }
            
            return (
              <>
                {/* Total absents */}
                <button
                  onClick={() => {
                    if (user?.role !== 'EMPLOYE') {
                      setListeTypeSelectionne('TOUS');
                      setModalListeOuverte(true);
                    }
                  }}
                  className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500 hover:shadow-xl transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-gray-600 text-sm">{user?.role === 'EMPLOYE' ? 'Mon statut' : 'Salariés absents'}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{nbAbsents}/{totalEmployesActifs}</p>
                    </div>
                    <Activity className="w-12 h-12 text-purple-500" />
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold text-purple-600">{pourcentage}%</span>
                    <span className="text-gray-600 ml-1">d'absence</span>
                  </div>
                </button>

                {/* CP */}
                <button
                  onClick={() => {
                    if (user?.role !== 'EMPLOYE') {
                      setListeTypeSelectionne('CP');
                      setModalListeOuverte(true);
                    }
                  }}
                  className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500 hover:shadow-xl transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-gray-600 text-sm">{user?.role === 'EMPLOYE' ? 'Mes Congés Payés' : 'En Congés Payés'}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{statsAbsences.cp}</p>
                    </div>
                    <Calendar className="w-12 h-12 text-blue-500" />
                  </div>
                  <div className="text-sm text-gray-600">absences CP</div>
                </button>

                {/* Maladie */}
                <button
                  onClick={() => {
                    if (user?.role !== 'EMPLOYE') {
                      setListeTypeSelectionne('MALADIE');
                      setModalListeOuverte(true);
                    }
                  }}
                  className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500 hover:shadow-xl transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-gray-600 text-sm">{user?.role === 'EMPLOYE' ? 'Mes Arrêts Maladie' : 'En Arrêt Maladie'}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{statsAbsences.maladie}</p>
                    </div>
                    <Activity className="w-12 h-12 text-red-500" />
                  </div>
                  <div className="text-sm text-gray-600">arrêts maladie</div>
                </button>

                {/* Jours */}
                <button
                  onClick={() => {
                    if (user?.role !== 'EMPLOYE') {
                      setListeTypeSelectionne('TOUS');
                      setModalListeOuverte(true);
                    }
                  }}
                  className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500 hover:shadow-xl transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-gray-600 text-sm">Jours totaux</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{statsAbsences.joursTotal}</p>
                    </div>
                    <TrendingDown className="w-12 h-12 text-green-500" />
                  </div>
                  <div className="text-sm text-gray-600">jours d'absence</div>
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* Contrôles */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Navigation mois */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={moisPrecedent}
              className="px-3 py-2 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
              aria-label="Mois précédent"
            >
              <span className="hidden sm:inline">← Mois précédent</span>
              <span className="sm:hidden">←</span>
            </button>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 min-w-[150px] sm:min-w-[200px] text-center capitalize">
              {moisSelectionne.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              onClick={moisSuivant}
              className="px-3 py-2 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
              aria-label="Mois suivant"
            >
              <span className="hidden sm:inline">Mois suivant →</span>
              <span className="sm:hidden">→</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {user && (user.role === 'EMPLOYE' || user.role === 'MANAGER' || user.role === 'RH') && (
              <button
                onClick={() => setModalOuverte(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nouvelle absence
              </button>
            )}
          </div>
        </div>

        {/* Filtres - Cachés pour les employés */}
        {user && (user.role === 'RH' || user.role === 'MANAGER') && (
          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <input
              type="text"
              value={filtreEmploye}
              onChange={(e) => setFiltreEmploye(e.target.value)}
              placeholder="Rechercher un employé..."
              className="flex-1 px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtreType}
              onChange={(e) => setFiltreType(e.target.value)}
              className="px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="Tous">Tous les types</option>
              <option value="CP">Congés Payés</option>
              <option value="MALADIE">Arrêt Maladie</option>
              <option value="VISITE_MEDICALE">Visite Médicale</option>
            </select>
          </div>
        )}
      </div>

      {/* Section demandes en attente pour Managers/RH */}
      {user && (user.role === 'MANAGER' || user.role === 'RH') && (
        <div className="mb-6">
          {(() => {
            // Pour les managers/RH : inclure TOUTES les absences "En attente" (pas seulement celles du mois)
            const demandesEnAttente = absences.filter(a => {
              if (a.statut !== 'En attente') return false;
              // Filtrer selon le rôle
              if (user.role === 'RH' || user.role === 'MANAGER') {
                return true; // Voir toutes les demandes
              }
              return false;
            });
            console.log('[FRONTEND] Demandes en attente:', demandesEnAttente.length, 'pour', user.role);
            console.log('[FRONTEND] Détail demandes en attente:', demandesEnAttente.map(a => ({
              id: a.id,
              employeId: a.employeId,
              dateDebut: a.dateDebut,
              dateFin: a.dateFin
            })));
            
            if (demandesEnAttente.length === 0) return null;
            
            return (
              <div className="bg-orange-50 border-l-4 border-orange-500 rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                  <h3 className="text-xl font-bold text-orange-900">
                    {demandesEnAttente.length} demande(s) en attente de validation
                  </h3>
                </div>
                
                <div className="space-y-3">
                  {demandesEnAttente.map(absence => {
                    const employe = employes.find(e => e.id === absence.employeId);
                    if (!employe) {
                      console.log('[FRONTEND] Employé non trouvé pour absence:', {
                        absenceId: absence.id,
                        absenceEmployeId: absence.employeId,
                        employesIds: employes.slice(0, 5).map(e => e.id),
                        employesNoms: employes.slice(0, 5).map(e => e.nomComplet)
                      });
                    }
                    const nomAffiche = employe?.nomComplet || absence.employeNom || 'Employé inconnu';
                    const typeAbsence = typesAbsence.find(t => t.value === absence.type);
                    
                    return (
                      <div 
                        key={absence.id}
                        className="bg-white p-4 rounded-lg flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          setAbsenceSelectionnee(absence);
                          setModalDetailsOuverte(true);
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{nomAffiche}</p>
                            <p className="text-sm text-gray-600">{employe?.societe || absence.societe || '-'}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="flex items-center gap-2 justify-end mb-1">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeAbsence?.bgClair} ${typeAbsence?.textCouleur}`}>
                                {typeAbsence?.label}
                              </span>
                              {absence.modifiee && absence.modifieeParNom && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold" title={`Modifiée le ${absence.modifieeAt ? new Date(absence.modifieeAt).toLocaleDateString('fr-FR') : ''}`}>
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Modifiée par {absence.modifieeParNom}</span>
                                </div>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              {new Date(absence.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')} → 
                              {' '}{new Date(absence.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {calculerNombreJours(absence.dateDebut, absence.dateFin)} jour(s) - Demandé le {absence.createdAt ? new Date(absence.createdAt).toLocaleDateString('fr-FR') : '-'}
                            </p>
                          </div>
                          
                          {/* Seuls les MANAGER peuvent valider/refuser, pas les RH */}
                          {user?.role === 'MANAGER' && (
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleValiderAbsence(absence.id);
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                              >
                                Valider
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAbsenceSelectionnee(absence);
                                  setModalRefusOuverte(true);
                                }}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                              >
                                Refuser
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Section "Mes demandes" pour les employés */}
      {user && user.role === 'EMPLOYE' && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Mes demandes d'absence</h3>
          
          {absencesToutesPourEmploye.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-8 text-center">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Aucune demande d'absence</p>
            </div>
          ) : (
            <div className="space-y-3">
              {absencesToutesPourEmploye
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .map(absence => {
                  const typeAbsence = typesAbsence.find(t => t.value === absence.type);
                  
                  return (
                    <div 
                      key={absence.id}
                      className="bg-white p-4 rounded-lg shadow-md flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <Calendar className="w-10 h-10 text-blue-600" />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeAbsence?.bgClair} ${typeAbsence?.textCouleur}`}>
                              {typeAbsence?.label}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              absence.statut === 'Validée' ? 'bg-green-100 text-green-800' :
                              absence.statut === 'Refusée' ? 'bg-red-100 text-red-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {absence.statut || 'En attente'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-900 font-medium">
                              Du {new Date(absence.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')} 
                              {' '}au {new Date(absence.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}
                            </p>
                            {absence.modifiee && absence.modifieeParNom && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold" title={`Modifiée le ${absence.modifieeAt ? new Date(absence.modifieeAt).toLocaleDateString('fr-FR') : ''}`}>
                                <AlertTriangle className="w-3 h-3" />
                                <span>Date modifiée par {absence.modifieeParNom}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-600">
                            {calculerNombreJours(absence.dateDebut, absence.dateFin)} jour(s) - Demandé le {absence.createdAt ? new Date(absence.createdAt).toLocaleDateString('fr-FR') : '-'}
                          </p>
                          {absence.motif && (
                            <p className="text-xs text-gray-500 italic mt-1">Motif : {absence.motif}</p>
                          )}
                          {absence.motifRefus && (
                            <p className="text-xs text-red-600 mt-1">
                              <strong>Raison du refus :</strong> {absence.motifRefus}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => {
                          setAbsenceSelectionnee(absence);
                          setModalDetailsOuverte(true);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Détails
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Planning */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <table className="w-full table-auto" style={{ minWidth: '800px' }}>
            <colgroup>
              <col style={{ width: '180px' }} />
              <col style={{ width: '80px' }} />
              {jours.map(j => (
                <col key={j.jour} style={{ width: `${100 / jours.length}%` }} />
              ))}
            </colgroup>
            
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-20 border-r border-gray-200">
                  Employé
                </th>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase bg-gray-50 z-10">
                  Solde CP
                </th>
                {jours.map(j => {
                  // Compter les absents ce jour
                  const annee = moisSelectionne.getFullYear();
                  const mois = String(moisSelectionne.getMonth() + 1).padStart(2, '0');
                  const jourStr = String(j.jour).padStart(2, '0');
                  const dateStr = `${annee}-${mois}-${jourStr}`;
                  
                  // Compter les absents ce jour dans TOUTES les absences (pas seulement absencesFiltrees)
                  // car absencesFiltrees peut exclure des absences si elles ne sont pas dans le mois
                  const absentsCeJour = absences.filter(a => {
                    if (a.statut === 'Refusée') return false; // Ne pas compter les refusées
                    // Filtrer selon le rôle pour le compteur
                    if (user?.role === 'EMPLOYE') {
                      if (a.employeId !== user.salesforceId) return false;
                    }
                    return dateStr >= a.dateDebut && dateStr <= a.dateFin;
                  }).length;
                  
                  return (
                    <th
                      key={j.jour}
                      onClick={() => {
                        setJourSelectionne(j);
                        setModalJourOuverte(true);
                      }}
                      className={`px-1 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-medium uppercase cursor-pointer hover:bg-blue-50 transition-colors ${
                        j.estWeekend ? 'bg-gray-200 text-gray-400' : 'text-gray-500 hover:text-blue-600'
                      }`}
                      title="Cliquer pour voir les absents ce jour"
                    >
                      <div className="font-bold text-xs sm:text-sm">{j.jour}</div>
                      <div className="text-[8px] sm:text-[10px] mt-0.5">
                        {j.date.toLocaleDateString('fr-FR', { weekday: 'short' }).substring(0, 2)}
                      </div>
                      {absentsCeJour > 0 && (
                        <div className="mt-1">
                          <span className="inline-block px-1 sm:px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[9px] sm:text-[10px] font-bold">
                            {absentsCeJour}
                          </span>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-200">
              {employesAffiches.slice(0, 30).map(employe => (
                <tr key={employe.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-xs sm:text-sm font-medium sticky left-0 bg-white z-10 whitespace-nowrap border-r border-gray-200">
                    <button
                      onClick={() => navigate(`/rh/employes/${employe.id}`)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left w-full text-xs sm:text-sm"
                    >
                      {employe.nomComplet}
                    </button>
                  </td>
                  
                  <td className="px-1 py-2 text-center text-[10px] sm:text-xs bg-white z-10">
                    {(() => {
                      const solde = soldesCP.find(s => s.employeId === employe.id);
                      if (!solde) return '-';
                      
                      return (
                        <div className="flex flex-col gap-0.5">
                          {solde.reportN1 > 0 && (
                            <div className="px-1 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-semibold">
                              N-1:{solde.reportN1}
                            </div>
                          )}
                          <div className={`px-1 py-0.5 rounded font-bold text-[10px] ${
                            solde.alerte === 'NEGATIF' ? 'bg-red-100 text-red-800' :
                            solde.alerte === 'FAIBLE' ? 'bg-orange-100 text-orange-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {solde.soldeTotal}j
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  
                  {jours.map(j => {
                    const absence = estAbsent(employe.id, j.jour);
                    const typeAbsence = absence ? typesAbsence.find(t => t.value === absence.type) : null;
                    
                    // Vérifier si visite médicale ce jour
                    const annee = moisSelectionne.getFullYear();
                    const mois = String(moisSelectionne.getMonth() + 1).padStart(2, '0');
                    const jourStr = String(j.jour).padStart(2, '0');
                    const dateStr = `${annee}-${mois}-${jourStr}`;
                    
                    const visiteMedicale = visitesMedicales.find(v => 
                      v.employeId === employe.id &&
                      v.dateVisite === dateStr
                    );
                    
                    // Déterminer la couleur selon le statut et le type
                    let couleurClasse = '';
                    if (absence) {
                      if (absence.statut === 'En attente') {
                        couleurClasse = 'bg-orange-400'; // Orange clair pour en attente
                      } else if (absence.statut === 'Validée') {
                        // Si c'est une MALADIE validée, utiliser rouge (afficherEnRouge ou type MALADIE)
                        if (absence.type === 'MALADIE' || absence.afficherEnRouge) {
                          couleurClasse = 'bg-red-500'; // Rouge pour MALADIE validée
                        } else {
                          couleurClasse = 'bg-green-500'; // Vert pour autres types validés
                        }
                      }
                      // Refusée : ne s'affiche pas (pas de couleur)
                    }
                    
                    return (
                      <td
                        key={j.jour}
                        className={`px-0.5 py-2 text-center relative ${
                          j.estWeekend ? 'bg-gray-100' : ''
                        }`}
                      >
                        {absence && absence.statut !== 'Refusée' && typeAbsence && (
                          <button
                            onClick={() => {
                              setAbsenceSelectionnee(absence);
                              setModalDetailsOuverte(true);
                            }}
                            className={`${couleurClasse || typeAbsence.couleur} rounded text-white text-[9px] py-1 px-0.5 font-semibold w-full hover:opacity-80 transition-opacity cursor-pointer relative`}
                            title={`${typeAbsence.label} - ${employe.nomComplet} (${absence.statut})${absence.modifiee && absence.modifieeParNom ? ` - Modifiée par ${absence.modifieeParNom}` : ''}`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              {typeAbsence.value === 'CP' ? 'CP' : typeAbsence.value === 'VISITE_MEDICALE' ? 'VM' : 'M'}
                              {absence.modifiee && absence.modifieeParNom && (
                                <AlertTriangle className="w-2.5 h-2.5 text-orange-200" />
                              )}
                            </div>
                          </button>
                        )}
                        
                        {/* Visite médicale */}
                        {visiteMedicale && !absence && (
                          <div 
                            className="absolute inset-0 bg-red-100 border-2 border-red-500 flex items-center justify-center rounded cursor-pointer hover:bg-red-200 transition-colors"
                            title={`Visite médicale - ${employe.nomComplet} - Cliquer pour modifier/annuler`}
                            onClick={async () => {
                              // Ouvrir modal de modification/annulation pour managers/RH
                              if (user?.role === 'MANAGER' || user?.role === 'RH') {
                                const visite = visitesMedicales.find(v => 
                                  v.employeId === employe.id &&
                                  v.dateVisite === dateStr
                                );
                                if (visite) {
                                  // Récupérer les détails complets du document
                                  try {
                                    const resDocs = await fetch(`${API_BASE}/api/documents`);
                                    const allDocs = await resDocs.json();
                                    const docComplet = allDocs.find(d => d.id === visite.id);
                                    if (docComplet) {
                                      setVisiteAModifier({
                                        ...docComplet,
                                        employeNom: employe.nomComplet,
                                        employeId: employe.id
                                      });
                                      setModalModifierVisite(true);
                                    }
                                  } catch (error) {
                                    console.error('Erreur récupération document:', error);
                                    alert('Erreur lors de la récupération des détails');
                                  }
                                }
                              }
                            }}
                          >
                            <span className="text-red-800 font-bold text-xs">
                              🏥
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {employesAffiches.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">
              {user?.role === 'EMPLOYE' 
                ? "Vous n'avez aucune absence enregistrée" 
                : "Aucun employé trouvé avec ces critères"}
            </p>
          </div>
        )}

        {employesAffiches.length > 30 && (
          <div className="bg-gray-50 p-3 sm:p-4 text-center text-xs sm:text-sm text-gray-600">
            Affichage limité aux 30 premiers employés. Utilisez la recherche pour affiner.
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="mt-4 sm:mt-6 bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Légende</h3>
        <div className="flex flex-wrap gap-3 sm:gap-6">
          {typesAbsence.map(type => (
            <div key={type.value} className="flex items-center gap-3">
              <div className={`w-10 h-10 ${type.couleur} rounded flex items-center justify-center text-white font-bold`}>
                {type.value === 'CP' ? 'CP' : type.value === 'VISITE_MEDICALE' ? 'VM' : 'M'}
              </div>
              <span className="text-sm text-gray-700 font-medium">{type.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 border-2 border-red-500 rounded flex items-center justify-center">
              <span className="text-red-800 font-bold text-lg">🏥</span>
            </div>
            <span className="text-sm text-gray-700 font-medium">Visite médicale</span>
          </div>
        </div>
      </div>

      {/* Modal Nouvelle Absence - FORMULAIRE COMPLET */}
      {modalOuverte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sm:p-6 rounded-t-xl">
              <h2 className="text-xl sm:text-2xl font-bold">Nouvelle absence</h2>
              <p className="text-blue-100 mt-1 text-sm sm:text-base">Congés Payés ou Arrêt Maladie</p>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSubmitAbsence} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Sélection employé */}
              {user && (user.role === 'RH' || user.role === 'MANAGER') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employé *
                  </label>
                  <select
                    value={nouvelleAbsence.employeId}
                    onChange={(e) => setNouvelleAbsence({ ...nouvelleAbsence, employeId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Sélectionner un employé</option>
                    {employes
                      .filter(e => e.estActif)
                      .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet))
                      .map(employe => (
                        <option key={employe.id} value={employe.id}>
                          {employe.nomComplet} - {employe.societe}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {user && user.role === 'EMPLOYE' && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Demandeur :</strong> {user.nom}
                  </p>
                </div>
              )}

              {/* Type d'absence */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type d'absence <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {typesAbsence.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => {
                        if (type.value === 'VISITE_MEDICALE') {
                          // Ouvrir le modal spécifique pour les visites médicales
                          setModalOuverte(false);
                          setModalVisiteMedicale(true);
                        } else {
                          setNouvelleAbsence({...nouvelleAbsence, type: type.value});
                        }
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        nouvelleAbsence.type === type.value
                          ? `${type.couleur} text-white border-transparent`
                          : 'border-gray-300 hover:border-blue-500'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-lg font-bold">{type.label}</div>
                        <div className="text-sm mt-1">{type.value === 'VISITE_MEDICALE' ? 'VM' : type.value}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de début <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={nouvelleAbsence.dateDebut}
                    onChange={(e) => setNouvelleAbsence({...nouvelleAbsence, dateDebut: e.target.value})}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de fin <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={nouvelleAbsence.dateFin}
                    onChange={(e) => setNouvelleAbsence({...nouvelleAbsence, dateFin: e.target.value})}
                    required
                    min={nouvelleAbsence.dateDebut}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Calcul nombre de jours */}
              {nouvelleAbsence.dateDebut && nouvelleAbsence.dateFin && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <span className="text-sm text-blue-900 font-medium">
                      Durée : {calculerNombreJours(nouvelleAbsence.dateDebut, nouvelleAbsence.dateFin)} jour(s) ouvrables (lun-sam)
                    </span>
                  </div>
                </div>
              )}

              {/* Motif */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motif / Commentaire
                </label>
                <textarea
                  value={nouvelleAbsence.motif}
                  onChange={(e) => setNouvelleAbsence({...nouvelleAbsence, motif: e.target.value})}
                  rows={3}
                  placeholder="Précisez le motif de l'absence (optionnel)..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Message d'erreur */}
              {erreurFormulaire && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{erreurFormulaire}</p>
                  </div>
                </div>
              )}

              {/* Boutons */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setModalOuverte(false);
                    setErreurFormulaire('');
                    setNouvelleAbsence({
                      employeId: '',
                      type: 'CP',
                      dateDebut: '',
                      dateFin: '',
                      motif: ''
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={soumissionEnCours}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {soumissionEnCours ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Enregistrer l'absence
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Détails Absence */}
      {modalDetailsOuverte && absenceSelectionnee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className={`${typesAbsence.find(t => t.value === absenceSelectionnee.type)?.couleur} text-white p-6 rounded-t-xl`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">
                    {typesAbsence.find(t => t.value === absenceSelectionnee.type)?.label}
                  </h2>
                  <p className="text-white opacity-90 mt-1">Détails de l'absence</p>
                </div>
                <div className="text-4xl font-bold">
                  {absenceSelectionnee.type === 'CP' ? 'CP' : 'M'}
                </div>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6 space-y-6">
              {!modeEdition ? (
                <>
                  {/* MODE LECTURE */}
                  {/* Employé */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <label className="text-sm font-medium text-gray-600 block mb-2">Employé</label>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-gray-900">
                            {employes.find(e => e.id === absenceSelectionnee.employeId)?.nomComplet || 'Employé supprimé'}
                          </p>
                          {employes.find(e => e.id === absenceSelectionnee.employeId) && !employes.find(e => e.id === absenceSelectionnee.employeId)?.estActif && (
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                              Sorti
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {employes.find(e => e.id === absenceSelectionnee.employeId)?.societe || '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <label className="text-sm font-medium text-gray-600 block mb-2">Date de début</label>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        <p className="text-lg font-semibold text-gray-900">
                          {new Date(absenceSelectionnee.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <label className="text-sm font-medium text-gray-600 block mb-2">Date de fin</label>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        <p className="text-lg font-semibold text-gray-900">
                          {new Date(absenceSelectionnee.dateFin + 'T00:00:00').toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Indicateur de modification */}
                  {absenceSelectionnee.modifiee && absenceSelectionnee.modifieeParNom && (
                    <div className="bg-orange-50 border-l-4 border-orange-500 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-orange-900">
                            Dates modifiées
                          </p>
                          <p className="text-xs text-orange-800 mt-1">
                            Modifiée par <strong>{absenceSelectionnee.modifieeParNom}</strong>
                            {absenceSelectionnee.modifieeAt && (
                              <span> le {new Date(absenceSelectionnee.modifieeAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Durée */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">Durée totale</span>
                      </div>
                      <span className="text-xl sm:text-2xl font-bold text-blue-900">
                        {calculerNombreJours(absenceSelectionnee.dateDebut, absenceSelectionnee.dateFin)} jour(s)
                      </span>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">Jours ouvrables (lundi-samedi, dimanche exclu)</p>
                  </div>

                  {/* Motif */}
                  {absenceSelectionnee.motif && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <label className="text-sm font-medium text-gray-600 block mb-2">Motif / Commentaire</label>
                      <p className="text-gray-900">{absenceSelectionnee.motif}</p>
                    </div>
                  )}

                  {/* Info création et modification */}
                  <div className="text-xs text-gray-500 border-t pt-4 space-y-1">
                    {absenceSelectionnee.createdAt && (
                      <div>
                        Créée le {new Date(absenceSelectionnee.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                    {absenceSelectionnee.modifiee && absenceSelectionnee.modifieeParNom && (
                      <div className="flex items-center gap-1 text-orange-700 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        <span>
                          Modifiée par <strong>{absenceSelectionnee.modifieeParNom}</strong>
                          {absenceSelectionnee.modifieeAt && (
                            <span> le {new Date(absenceSelectionnee.modifieeAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* MODE ÉDITION */}
                  <form onSubmit={handleModifierAbsence} className="space-y-6">
                    {/* Employé (lecture seule) */}
                    <div className="bg-gray-100 rounded-lg p-4 border-2 border-gray-300">
                      <label className="text-sm font-medium text-gray-600 block mb-2">Employé (non modifiable)</label>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold text-gray-700">
                          {employes.find(e => e.id === absenceEnEdition.employeId)?.nomComplet || 'Employé supprimé'}
                        </p>
                        {employes.find(e => e.id === absenceEnEdition.employeId) && !employes.find(e => e.id === absenceEnEdition.employeId)?.estActif && (
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                            Sorti
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type d'absence
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        {typesAbsence.map(type => (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => setAbsenceEnEdition({...absenceEnEdition, type: type.value})}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              absenceEnEdition.type === type.value
                                ? `${type.couleur} text-white border-transparent`
                                : 'border-gray-300 hover:border-blue-500'
                            }`}
                          >
                            <div className="text-center font-bold">{type.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Date de début
                        </label>
                        <input
                          type="date"
                          value={absenceEnEdition.dateDebut}
                          onChange={(e) => setAbsenceEnEdition({...absenceEnEdition, dateDebut: e.target.value})}
                          required
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Date de fin
                        </label>
                        <input
                          type="date"
                          value={absenceEnEdition.dateFin}
                          onChange={(e) => setAbsenceEnEdition({...absenceEnEdition, dateFin: e.target.value})}
                          required
                          min={absenceEnEdition.dateDebut}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Durée calculée */}
                    {absenceEnEdition.dateDebut && absenceEnEdition.dateFin && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <span className="text-sm text-blue-900 font-medium">
                            Durée : {calculerNombreJours(absenceEnEdition.dateDebut, absenceEnEdition.dateFin)} jour(s) ouvrables (lun-sam)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Motif */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Motif / Commentaire
                      </label>
                      <textarea
                        value={absenceEnEdition.motif || ''}
                        onChange={(e) => setAbsenceEnEdition({...absenceEnEdition, motif: e.target.value})}
                        rows={3}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Boutons édition */}
                    <div className="flex gap-3 pt-4 border-t">
                      <button
                        type="button"
                        onClick={() => {
                          setModeEdition(false);
                          setAbsenceEnEdition(null);
                        }}
                        className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            {/* Boutons */}
            {!modeEdition && (
              <div className="bg-gray-50 p-6 rounded-b-xl">
                {/* Statut */}
                {absenceSelectionnee.statut && (
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Statut :</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      absenceSelectionnee.statut === 'Validée' ? 'bg-green-100 text-green-800' :
                      absenceSelectionnee.statut === 'Refusée' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {absenceSelectionnee.statut}
                    </span>
                    {absenceSelectionnee.valideParNom && (
                      <span className="text-xs text-gray-500">
                        par {absenceSelectionnee.valideParNom}
                      </span>
                    )}
                    {absenceSelectionnee.refuseParNom && (
                      <span className="text-xs text-gray-500">
                        par {absenceSelectionnee.refuseParNom}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setModalDetailsOuverte(false);
                      setAbsenceSelectionnee(null);
                    }}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Fermer
                  </button>
                  
                  {/* Boutons Valider/Refuser (seulement si en attente et permission MANAGER) */}
                  {absenceSelectionnee.statut === 'En attente' && peutValiderAbsence(absenceSelectionnee) && (
                    <>
                      <button
                        onClick={() => handleValiderAbsence(absenceSelectionnee.id)}
                        disabled={validationEnCours}
                        className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="w-5 h-5" />
                        {validationEnCours ? 'Validation...' : 'Valider'}
                      </button>
                      <button
                        onClick={() => setModalRefusOuverte(true)}
                        disabled={validationEnCours}
                        className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XCircle className="w-5 h-5" />
                        Refuser
                      </button>
                    </>
                  )}
                  
                  {/* Boutons Modifier/Supprimer */}
                  {/* Employés : seulement si en attente */}
                  {/* Managers : peuvent modifier/supprimer CP/MALADIE même si validées */}
                  {/* RH : ne peuvent rien faire (lecture seule) */}
                  {(() => {
                    // RH ne peut rien modifier ni supprimer
                    if (user?.role === 'RH') {
                      return null;
                    }
                    
                    const peutModifier = 
                      // Si pas validée/refusée, employés et managers peuvent modifier
                      (absenceSelectionnee.statut !== 'Validée' && absenceSelectionnee.statut !== 'Refusée') ||
                      // Si validée, seuls les managers peuvent modifier CP ou MALADIE
                      (absenceSelectionnee.statut === 'Validée' && 
                       user?.role === 'MANAGER' &&
                       (absenceSelectionnee.type === 'CP' || absenceSelectionnee.type === 'MALADIE'));
                    
                    // Managers peuvent supprimer toutes les absences (même validées)
                    // Employés peuvent seulement supprimer si en attente
                    const peutSupprimer = 
                      (user?.role === 'MANAGER') ||
                      (user?.role === 'EMPLOYE' && absenceSelectionnee.statut !== 'Validée' && absenceSelectionnee.statut !== 'Refusée');
                    
                    return (
                      <>
                        {peutModifier && (
                          <button
                            onClick={() => {
                              setModeEdition(true);
                              setAbsenceEnEdition({...absenceSelectionnee});
                            }}
                            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
                          >
                            <Calendar className="w-5 h-5" />
                            Modifier
                          </button>
                        )}
                        {peutSupprimer && (
                          <button
                            onClick={() => handleSupprimerAbsence(absenceSelectionnee.id)}
                            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2"
                          >
                            <AlertCircle className="w-5 h-5" />
                            {user?.role === 'MANAGER' ? 'Annuler' : 'Supprimer'}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Liste Absences */}
      {modalListeOuverte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sm:p-6">
              <h2 className="text-2xl font-bold">
                {listeTypeSelectionne === 'TOUS' ? 'Toutes les absences' :
                 listeTypeSelectionne === 'CP' ? 'Congés Payés' : 'Arrêts Maladie'}
              </h2>
              <p className="text-purple-100 mt-1 capitalize">
                {moisSelectionne.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-180px)] sm:max-h-[calc(90vh-180px)]">
              {absencesDuMois.filter(a => listeTypeSelectionne === 'TOUS' || a.type === listeTypeSelectionne).length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Aucune absence pour cette période</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employé</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Société</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date début</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date fin</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durée</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motif</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {absencesDuMois
                        .filter(a => listeTypeSelectionne === 'TOUS' || a.type === listeTypeSelectionne)
                        .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
                        .map(absence => {
                          const employe = employes.find(e => e.id === absence.employeId);
                          const typeAbsence = typesAbsence.find(t => t.value === absence.type);
                          
                          return (
                            <tr key={absence.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {employe?.nomComplet || 'Employé supprimé'}
                                {employe && !employe.estActif && (
                                  <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                                    Sorti
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {employe?.societe || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex flex-col gap-1">
                                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeAbsence?.bgClair} ${typeAbsence?.textCouleur}`}>
                                    {typeAbsence?.label}
                                  </span>
                                  {absence.modifiee && absence.modifieeParNom && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold w-fit">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>Modifiée par {absence.modifieeParNom}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {new Date(absence.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {new Date(absence.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                {calculerNombreJours(absence.dateDebut, absence.dateFin)} j
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                                {absence.motif || '-'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 sm:p-6 border-t">
              <button
                onClick={() => setModalListeOuverte(false)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détail Jour */}
      {modalJourOuverte && jourSelectionne && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
              <h2 className="text-2xl font-bold">
                {jourSelectionne.date.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </h2>
              <p className="text-blue-100 mt-1">Employés absents ce jour</p>
            </div>

            <div className="p-6">
              {(() => {
                // Calculer les absents du jour
                const annee = moisSelectionne.getFullYear();
                const mois = String(moisSelectionne.getMonth() + 1).padStart(2, '0');
                const jourStr = String(jourSelectionne.jour).padStart(2, '0');
                const dateStr = `${annee}-${mois}-${jourStr}`;
                
                const absentsJour = absencesDuMois.filter(absence => {
                  return dateStr >= absence.dateDebut && dateStr <= absence.dateFin;
                });
                
                const nbCP = absentsJour.filter(a => a.type === 'CP').length;
                const nbMaladie = absentsJour.filter(a => a.type === 'MALADIE').length;
                
                return (
                  <>
                    {/* Stats du jour */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
                      <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-purple-600 font-medium">Total absents</p>
                        <p className="text-3xl font-bold text-purple-900 mt-1">{absentsJour.length}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-blue-600 font-medium">Congés Payés</p>
                        <p className="text-3xl font-bold text-blue-900 mt-1">{nbCP}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-red-600 font-medium">Arrêts Maladie</p>
                        <p className="text-3xl font-bold text-red-900 mt-1">{nbMaladie}</p>
                      </div>
                    </div>

                    {/* Liste des absents */}
                    {absentsJour.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="font-semibold text-gray-900 mb-3">Liste des employés absents :</h3>
                        {absentsJour.map(absence => {
                          const employe = employes.find(e => e.id === absence.employeId);
                          const typeAbsence = typesAbsence.find(t => t.value === absence.type);
                          
                          return (
                            <div key={absence.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                  <Users className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{employe?.nomComplet || 'Employé supprimé'}</p>
                                  <p className="text-sm text-gray-600">{employe?.societe || '-'}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeAbsence?.bgClair} ${typeAbsence?.textCouleur}`}>
                                    {typeAbsence?.label}
                                  </span>
                                  {absence.modifiee && absence.modifieeParNom && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span>Modifiée par {absence.modifieeParNom}</span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(absence.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')} → {new Date(absence.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Aucun employé absent ce jour</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="bg-gray-50 p-4 sm:p-6 border-t">
              <button
                onClick={() => setModalJourOuverte(false)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détail Société */}
      {modalSocieteOuverte && societeSelectionnee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
              <h2 className="text-2xl font-bold">{societeSelectionnee}</h2>
              <p className="text-blue-100 mt-1 capitalize">
                Absences - {moisSelectionne.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Contenu */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {(() => {
                const employesSociete = employes.filter(e => e.estActif && e.societe === societeSelectionnee);
                const totalEmployes = employesSociete.length;
                
                const absencesSociete = absencesDuMois.filter(a => {
                  const emp = employes.find(e => e.id === a.employeId);
                  return emp && emp.societe === societeSelectionnee;
                });
                
                const employesAbsentsIds = [...new Set(absencesSociete.map(a => a.employeId))];
                const nbAbsents = employesAbsentsIds.length;
                
                const nbCP = absencesSociete.filter(a => a.type === 'CP').length;
                const nbMaladie = absencesSociete.filter(a => a.type === 'MALADIE').length;
                const joursTotal = absencesSociete.reduce((sum, a) => sum + calculerNombreJours(a.dateDebut, a.dateFin), 0);
                
                const pourcentage = totalEmployes > 0 ? Math.round((nbAbsents / totalEmployes) * 100) : 0;
                
                return (
                  <>
                    {/* Stats société */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4 mb-6">
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 font-medium">Effectif total</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{totalEmployes}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-purple-600 font-medium">Absents</p>
                        <p className="text-3xl font-bold text-purple-900 mt-1">{nbAbsents}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-blue-600 font-medium">Taux</p>
                        <p className="text-3xl font-bold text-blue-900 mt-1">{pourcentage}%</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-blue-600 font-medium">CP</p>
                        <p className="text-3xl font-bold text-blue-900 mt-1">{nbCP}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-red-600 font-medium">Maladie</p>
                        <p className="text-3xl font-bold text-red-900 mt-1">{nbMaladie}</p>
                      </div>
                    </div>

                    {/* Liste des absences */}
                    <div className="overflow-y-auto max-h-[calc(95vh-350px)] sm:max-h-[calc(90vh-350px)]">
                      {absencesSociete.length > 0 ? (
                        <div className="overflow-x-auto -mx-6 px-6">
                          <table className="min-w-full">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employé</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date début</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date fin</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durée</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motif</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {absencesSociete
                              .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
                              .map(absence => {
                                const employe = employes.find(e => e.id === absence.employeId);
                                const typeAbsence = typesAbsence.find(t => t.value === absence.type);
                                
                                return (
                                  <tr key={absence.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                      {employe?.nomComplet || 'Employé supprimé'}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      <div className="flex flex-col gap-1">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeAbsence?.bgClair} ${typeAbsence?.textCouleur}`}>
                                          {typeAbsence?.label}
                                        </span>
                                        {absence.modifiee && absence.modifieeParNom && (
                                          <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold w-fit">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>Modifiée par {absence.modifieeParNom}</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      {new Date(absence.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      {new Date(absence.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                      {calculerNombreJours(absence.dateDebut, absence.dateFin)} j
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                                      {absence.motif || '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">Aucune absence pour cette société ce mois-ci</p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Bouton fermer */}
            <div className="bg-gray-50 p-4 sm:p-6 border-t">
              <button
                onClick={() => setModalSocieteOuverte(false)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Refus Absence */}
      {modalRefusOuverte && absenceSelectionnee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="bg-red-600 text-white p-4 sm:p-6 rounded-t-xl">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <XCircle className="w-6 h-6" />
                Refuser l'absence
              </h2>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  Vous êtes sur le point de refuser l'absence de{' '}
                  <strong>{employes.find(e => e.id === absenceSelectionnee.employeId)?.nomComplet || 'cet employé'}</strong>
                  {' '}du {new Date(absenceSelectionnee.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')} au {new Date(absenceSelectionnee.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motif du refus <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  rows={4}
                  placeholder="Expliquez pourquoi cette absence est refusée..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Ce motif sera communiqué à l'employé.</p>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setModalRefusOuverte(false);
                    setMotifRefus('');
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleRefuserAbsence(absenceSelectionnee.id)}
                  disabled={validationEnCours || !motifRefus.trim()}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {validationEnCours ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Refus en cours...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Confirmer le refus
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Refus Absence */}
      {modalRefusOuverte && absenceSelectionnee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="bg-red-600 text-white p-4 sm:p-6 rounded-t-xl">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <XCircle className="w-6 h-6" />
                Refuser l'absence
              </h2>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  Vous êtes sur le point de refuser l'absence de{' '}
                  <strong>{employes.find(e => e.id === absenceSelectionnee.employeId)?.nomComplet || 'cet employé'}</strong>
                  {' '}du {new Date(absenceSelectionnee.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR')} au {new Date(absenceSelectionnee.dateFin + 'T00:00:00').toLocaleDateString('fr-FR')}.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motif du refus <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  rows={4}
                  placeholder="Expliquez pourquoi cette absence est refusée..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Ce motif sera communiqué à l'employé.</p>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setModalRefusOuverte(false);
                    setMotifRefus('');
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleRefuserAbsence(absenceSelectionnee.id)}
                  disabled={validationEnCours || !motifRefus.trim()}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {validationEnCours ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Refus en cours...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Confirmer le refus
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visite Médicale */}
      {modalVisiteMedicale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sm:p-6 rounded-t-xl">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <span className="text-2xl">🏥</span>
                Programmer une Visite Médicale
              </h2>
              <p className="text-purple-100 mt-1 text-sm sm:text-base">Planification d'une visite médicale pour un salarié</p>
            </div>

            {/* Formulaire */}
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!formVisiteMedicale.employeId || !formVisiteMedicale.dateVisite || !formVisiteMedicale.heureVisite) {
                  alert('Veuillez remplir tous les champs obligatoires');
                  return;
                }

                try {
                  const formData = new FormData();
                  formData.append('employeId', formVisiteMedicale.employeId);
                  formData.append('categorie', 'VISITE_MEDICALE');
                  formData.append('description', `Visite médicale programmée le ${formVisiteMedicale.dateVisite} à ${formVisiteMedicale.heureVisite}`);
                  formData.append('dateExpiration', formVisiteMedicale.dateVisite);
                  formData.append('version', 'unique');
                  formData.append('heureVisite', formVisiteMedicale.heureVisite);
                  
                  if (formVisiteMedicale.fichier) {
                    formData.append('file', formVisiteMedicale.fichier);
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
                    throw new Error(error.error || 'Erreur lors de l\'enregistrement');
                  }

                  // Recharger les données
                  await fetchVisitesMedicales();
                  await fetchAbsences();
                  
                  // Réinitialiser le formulaire
                  setFormVisiteMedicale({
                    employeId: '',
                    dateVisite: '',
                    heureVisite: '',
                    fichier: null
                  });
                  
                  setModalVisiteMedicale(false);
                  alert('Visite médicale programmée avec succès !');
                } catch (error) {
                  console.error('Erreur programmation visite médicale:', error);
                  alert('Erreur lors de la programmation de la visite médicale: ' + error.message);
                }
              }}
              className="p-4 sm:p-6 space-y-4 sm:space-y-6"
            >
              {/* Salarié */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Salarié <span className="text-red-500">*</span>
                </label>
                <select
                  value={formVisiteMedicale.employeId}
                  onChange={(e) => setFormVisiteMedicale({...formVisiteMedicale, employeId: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                >
                  <option value="">Sélectionner un salarié</option>
                  {employes
                    .filter(e => e.estActif)
                    .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet))
                    .map(employe => (
                      <option key={employe.id} value={employe.id}>
                        {employe.nomComplet} - {employe.societe}
                      </option>
                    ))}
                </select>
              </div>

              {/* Date de la visite */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de la visite <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formVisiteMedicale.dateVisite}
                  onChange={(e) => setFormVisiteMedicale({...formVisiteMedicale, dateVisite: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Heure de la visite */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Heure de la visite <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={formVisiteMedicale.heureVisite}
                  onChange={(e) => setFormVisiteMedicale({...formVisiteMedicale, heureVisite: e.target.value})}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Pièce jointe */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pièce jointe (optionnel)
                </label>
                <input
                  type="file"
                  onChange={(e) => setFormVisiteMedicale({...formVisiteMedicale, fichier: e.target.files[0]})}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">Formats acceptés : PDF, DOC, DOCX, JPG, PNG</p>
              </div>

              {/* Boutons */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setModalVisiteMedicale(false);
                    setFormVisiteMedicale({
                      employeId: '',
                      dateVisite: '',
                      heureVisite: '',
                      fichier: null
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Programmer la visite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modifier/Supprimer Visite Médicale */}
      {modalModifierVisite && visiteAModifier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-2xl">🏥</span>
                Modifier/Supprimer Visite Médicale
              </h2>
              <button
                onClick={() => {
                  setModalModifierVisite(false);
                  setVisiteAModifier(null);
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Salarié</p>
                <p className="text-lg font-semibold text-gray-900">{visiteAModifier.employeNom}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de la visite
                  </label>
                  <input
                    type="date"
                    value={visiteAModifier.dateExpiration ? visiteAModifier.dateExpiration.split('T')[0] : ''}
                    onChange={(e) => setVisiteAModifier({...visiteAModifier, dateExpiration: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Heure de la visite
                  </label>
                  <input
                    type="time"
                    value={visiteAModifier.heureVisite || '09:00'}
                    onChange={(e) => setVisiteAModifier({...visiteAModifier, heureVisite: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={visiteAModifier.description || ''}
                  onChange={(e) => setVisiteAModifier({...visiteAModifier, description: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={async () => {
                  if (!confirm('Êtes-vous sûr de vouloir supprimer cette visite médicale ?')) return;
                  
                  try {
                    const res = await fetch(`${API_BASE}/api/documents/${visiteAModifier.id}`, {
                      method: 'DELETE'
                    });
                    
                    if (!res.ok) throw new Error('Erreur suppression');
                    
                    await fetchVisitesMedicales();
                    await fetchAbsences();
                    setModalModifierVisite(false);
                    setVisiteAModifier(null);
                    alert('Visite médicale supprimée avec succès');
                  } catch (error) {
                    console.error('Erreur suppression:', error);
                    alert('Erreur lors de la suppression');
                  }
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                Supprimer
              </button>
              
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/api/documents/${visiteAModifier.id}`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        dateExpiration: visiteAModifier.dateExpiration,
                        description: visiteAModifier.description || '',
                        heureVisite: visiteAModifier.heureVisite || '09:00'
                      })
                    });
                    
                    if (!res.ok) {
                      const error = await res.json();
                      throw new Error(error.error || 'Erreur modification');
                    }
                    
                    await fetchVisitesMedicales();
                    await fetchAbsences();
                    setModalModifierVisite(false);
                    setVisiteAModifier(null);
                    alert('Visite médicale modifiée avec succès');
                  } catch (error) {
                    console.error('Erreur modification:', error);
                    alert('Erreur lors de la modification: ' + error.message);
                  }
                }}
                className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Absences;

