import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, User, Mail, Phone, MapPin, Building2, Calendar, 
  FileText, Clock, Briefcase, AlertCircle, Edit, Upload, DollarSign
} from 'lucide-react';
import API_BASE from '../../config/api';
const EmployeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employe, setEmploye] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ongletActif, setOngletActif] = useState('infos');
  const [soldeCP, setSoldeCP] = useState(null);
  const [loadingSolde, setLoadingSolde] = useState(true);
  const [absences, setAbsences] = useState([]);
  const [modalModifN1Ouverte, setModalModifN1Ouverte] = useState(false);
  const [nouveauReportN1, setNouveauReportN1] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [modalUploadOuverte, setModalUploadOuverte] = useState(false);
  const [fichierSelectionne, setFichierSelectionne] = useState(null);
  const [categorieDoc, setCategorieDoc] = useState('CONTRAT');
  const [descriptionDoc, setDescriptionDoc] = useState('');
  const [uploadEnCours, setUploadEnCours] = useState(false);
  const [acomptes, setAcomptes] = useState([]);
  const [loadingAcomptes, setLoadingAcomptes] = useState(true);

  useEffect(() => {
    if (id) {
      fetchEmploye();
      fetchSoldeCP();
      fetchAbsences();
      fetchDocuments();
      fetchAcomptes();
    }
  }, [id]);

  const fetchEmploye = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/employes/${id}`);
      
      if (!response.ok) {
        throw new Error('Employé non trouvé');
      }
      
      const data = await response.json();
      setEmploye(data);
      setLoading(false);
    } catch (err) {
      console.error('Erreur récupération employé:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchSoldeCP = async () => {
    try {
      setLoadingSolde(true);
      const response = await fetch(`${API_BASE}/api/soldes-cp/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSoldeCP(data);
      } else {
        // Si l'employé n'a pas de solde (404), on met null
        setSoldeCP(null);
      }
      setLoadingSolde(false);
    } catch (err) {
      console.error('Erreur récupération solde:', err);
      setSoldeCP(null);
      setLoadingSolde(false);
    }
  };

  const fetchAbsences = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/absences`);
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des absences');
      }
      const data = await response.json();
      const absencesEmploye = (data || []).filter(a => a && a.employeId === id);
      setAbsences(absencesEmploye.sort((a, b) => {
        if (!a.dateDebut || !b.dateDebut) return 0;
        return b.dateDebut.localeCompare(a.dateDebut);
      }));
    } catch (err) {
      console.error('Erreur récupération absences:', err);
      setAbsences([]);
    }
  };

  const calculerJoursOuvrables = (dateDebut, dateFin) => {
    const debut = new Date(dateDebut + 'T00:00:00');
    const fin = new Date(dateFin + 'T00:00:00');
    let joursOuvrables = 0;
    
    for (let date = new Date(debut); date <= fin; date.setDate(date.getDate() + 1)) {
      const jour = date.getDay();
      if (jour !== 0) joursOuvrables++;
    }
    
    return joursOuvrables;
  };

  const handleModifierN1 = async () => {
    if (!nouveauReportN1 || nouveauReportN1 < 0) {
      alert('Veuillez entrer un nombre valide');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/soldes-cp/${id}/report-n1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportN1: parseInt(nouveauReportN1) })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la modification');
      }

      await fetchSoldeCP();
      setModalModifN1Ouverte(false);
      setNouveauReportN1('');
      alert('Report N-1 modifié avec succès !');

    } catch (error) {
      console.error('Erreur modification N-1:', error);
      alert('Erreur lors de la modification');
    }
  };

  const fetchDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const response = await fetch(`${API_BASE}/api/documents/employe/${id}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data || []);
      }
      setLoadingDocuments(false);
    } catch (err) {
      console.error('Erreur récupération documents:', err);
      setLoadingDocuments(false);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    
    if (!fichierSelectionne) {
      alert('Veuillez sélectionner un fichier');
      return;
    }
    
    try {
      setUploadEnCours(true);
      
      const formData = new FormData();
      formData.append('file', fichierSelectionne);
      formData.append('employeId', id);
      formData.append('categorie', categorieDoc);
      formData.append('description', descriptionDoc);
      
      const response = await fetch(`${API_BASE}/api/documents/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de l\'upload');
      }
      
      await fetchDocuments();
      
      setModalUploadOuverte(false);
      setFichierSelectionne(null);
      setCategorieDoc('CONTRAT');
      setDescriptionDoc('');
      setUploadEnCours(false);
      
      alert('Document uploadé avec succès !');
      
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload');
      setUploadEnCours(false);
    }
  };

  const handleSupprimerDocument = async (docId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/documents/${docId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }
      
      await fetchDocuments();
      alert('Document supprimé avec succès !');
      
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const fetchAcomptes = async () => {
    try {
      setLoadingAcomptes(true);
      const response = await fetch(`${API_BASE}/api/acomptes/employe/${id}/historique`);
      if (response.ok) {
        const data = await response.json();
        setAcomptes(data.historique || []);
      }
      setLoadingAcomptes(false);
    } catch (err) {
      console.error('Erreur récupération acomptes:', err);
      setAcomptes([]);
      setLoadingAcomptes(false);
    }
  };

  // Calcul date fin période d'essai
  const calculerFinPeriodeEssai = (dateEntree) => {
    if (!dateEntree) return null;
    const date = new Date(dateEntree);
    date.setMonth(date.getMonth() + 2);
    return date;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des détails...</p>
        </div>
      </div>
    );
  }

  if (error || !employe) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-bold text-red-900">Employé non trouvé</h2>
          </div>
          <p className="text-red-700 mb-4">{error || "Cet employé n'existe pas ou a été supprimé."}</p>
          <button
            onClick={() => navigate('/rh/employes')}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à la liste des employés
          </button>
        </div>
      </div>
    );
  }

  const finPeriodeEssai = calculerFinPeriodeEssai(employe.dateEntree);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header avec retour */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/rh/employes')}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour à la liste
        </button>

        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{employe.nomComplet}</h1>
                <div className="flex items-center gap-4 mt-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    employe.statut === 'Actif' ? 'bg-green-100 text-green-800' : 
                    employe.statut === 'En période d\'essai' ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {employe.statut}
                  </span>
                  {employe.typeContrat && (
                    <span className="text-gray-600 flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      {employe.typeContrat}
                    </span>
                  )}
                  <span className="text-gray-600 flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {employe.societe}
                  </span>
                </div>
              </div>
            </div>

            {/* Alerte période d'essai */}
            {employe.statut === "En période d'essai" && finPeriodeEssai && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-yellow-800">
                  <Clock className="w-5 h-5" />
                  <div>
                    <p className="text-sm font-semibold">Fin période d'essai</p>
                    <p className="text-lg font-bold">{finPeriodeEssai.toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setOngletActif('infos')}
              className={`px-6 py-4 font-medium transition-colors ${
                ongletActif === 'infos'
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Informations
              </div>
            </button>
            <button
              onClick={() => setOngletActif('absences')}
              className={`px-6 py-4 font-medium transition-colors ${
                ongletActif === 'absences'
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Absences
              </div>
            </button>
            <button
              onClick={() => setOngletActif('documents')}
              className={`px-6 py-4 font-medium transition-colors ${
                ongletActif === 'documents'
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Documents
              </div>
            </button>
            <button
              onClick={() => setOngletActif('acomptes')}
              className={`px-6 py-4 font-medium transition-colors ${
                ongletActif === 'acomptes'
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Accomptes
              </div>
            </button>
          </nav>
        </div>

        {/* Contenu des onglets */}
        <div className="p-6">
          {/* Onglet Informations */}
          {ongletActif === 'infos' && (
            <div className="space-y-6">
              {/* Informations personnelles */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-6 h-6 text-blue-600" />
                  Informations personnelles
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Prénom</label>
                    <p className="text-lg text-gray-900">{employe.prenom || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Nom</label>
                    <p className="text-lg text-gray-900">{employe.nom || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      Email
                    </label>
                    <p className="text-lg text-gray-900">
                      {employe.email ? (
                        <a href={`mailto:${employe.email}`} className="text-blue-600 hover:underline">
                          {employe.email}
                        </a>
                      ) : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      Téléphone
                    </label>
                    <p className="text-lg text-gray-900">
                      {employe.mobile || employe.telephone || '-'}
                    </p>
                  </div>
                  {employe.dateNaissance && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Date de naissance</label>
                      <p className="text-lg text-gray-900">
                        {new Date(employe.dateNaissance).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Adresse */}
              {(employe.adresse?.rue || employe.adresse?.ville) && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPin className="w-6 h-6 text-blue-600" />
                    Adresse
                  </h2>
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <p className="text-lg text-gray-900">{employe.adresse.rue || ''}</p>
                    <p className="text-lg text-gray-900">
                      {employe.adresse.codePostal || ''} {employe.adresse.ville || ''}
                    </p>
                    {employe.adresse.pays && (
                      <p className="text-lg text-gray-900">{employe.adresse.pays}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Informations contractuelles */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                  Informations contractuelles
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Société</label>
                    <p className="text-lg text-gray-900">{employe.societe || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Type de contrat</label>
                    <p className="text-lg text-gray-900">{employe.typeContrat || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Date d'entrée</label>
                    <p className="text-lg text-gray-900">
                      {employe.dateEntree ? new Date(employe.dateEntree).toLocaleDateString('fr-FR') : '-'}
                    </p>
                  </div>
                  {employe.dateSortie && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Date de sortie</label>
                      <p className="text-lg text-red-600 font-semibold">
                        {new Date(employe.dateSortie).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-600">Statut</label>
                    <p className="text-lg">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        employe.statut === 'Actif' ? 'bg-green-100 text-green-800' : 
                        employe.statut === 'En période d\'essai' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {employe.statut}
                      </span>
                    </p>
                  </div>
                  {employe.statut === "En période d'essai" && finPeriodeEssai && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Fin période d'essai</label>
                      <p className="text-lg text-gray-900 font-semibold">
                        {finPeriodeEssai.toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Soldes Congés Payés */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="w-6 h-6 text-blue-600" />
                  <h2 className="text-xl font-bold text-gray-900">Soldes Congés Payés</h2>
                </div>

                {/* Note explicative */}
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                  <p className="text-sm text-blue-900">
                    <strong>ℹ️ Note :</strong> Seules les absences <strong>validées</strong> sont décomptées. 
                    Les demandes refusées ou en attente n'impactent pas le solde.
                  </p>
                </div>

                {loadingSolde ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : soldeCP ? (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-green-600 font-medium mb-1">Jours acquis total</p>
                        <p className="text-3xl font-bold text-green-900">{soldeCP.joursAcquisTotal}j</p>
                        <p className="text-xs text-green-700 mt-1">
                          N-1: {soldeCP.joursAcquisN1}j + N: {soldeCP.joursAcquisN}j
                        </p>
                      </div>

                      <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-purple-600 font-medium mb-1">Solde N-1</p>
                        <p className="text-3xl font-bold text-purple-900">{soldeCP.reportN1}j</p>
                        <p className="text-xs text-purple-700 mt-1">Report année précédente</p>
                      </div>

                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-blue-600 font-medium mb-1">Solde N (en cours)</p>
                        <p className="text-3xl font-bold text-blue-900">{soldeCP.soldeN}j</p>
                        <p className="text-xs text-blue-700 mt-1">Année en cours</p>
                      </div>
                    </div>

                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Solde total disponible</p>
                          <p className="text-xs text-gray-500 mt-1">Période : {soldeCP.periodeActuelle}</p>
                        </div>
                        <div className={`px-6 py-3 rounded-lg font-bold text-2xl ${
                          soldeCP.alerte === 'NEGATIF' ? 'bg-red-100 text-red-800' :
                          soldeCP.alerte === 'FAIBLE' ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {soldeCP.soldeTotal}j
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucune donnée disponible</p>
                )}
              </div>

              {/* Lien Salesforce */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <a
                  href={`https://groupetsm.lightning.force.com/lightning/r/Contact/${employe.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Building2 className="w-5 h-5" />
                  Voir la fiche complète dans Salesforce
                </a>
              </div>
            </div>
          )}

          {/* Onglet Absences */}
          {ongletActif === 'absences' && (
            <div className="space-y-6">
              {/* Soldes CP détaillés avec modification N-1 */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-bold text-gray-900">Soldes Congés Payés</h2>
                  </div>
                  {soldeCP && (
                    <button
                      onClick={() => setModalModifN1Ouverte(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Modifier N-1
                    </button>
                  )}
                </div>

                {/* Note explicative */}
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                  <p className="text-sm text-blue-900">
                    <strong>ℹ️ Note :</strong> Seules les absences <strong>validées</strong> sont décomptées. 
                    Les demandes refusées ou en attente n'impactent pas le solde.
                  </p>
                </div>

                {loadingSolde ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : soldeCP ? (
                  <>
                    {/* Tableau détaillé */}
                    <div className="overflow-x-auto mb-6">
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Période</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acquis</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Consommés</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Solde</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          <tr className="bg-purple-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">N-1 (Report)</td>
                            <td className="px-4 py-3 text-sm text-center font-semibold text-green-700">{soldeCP.joursAcquisN1 || 0}j</td>
                            <td className="px-4 py-3 text-sm text-center font-semibold text-red-700">
                              {((soldeCP.joursAcquisN1 || 0) - (soldeCP.reportN1 || 0))}j
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="px-3 py-1 rounded-full font-bold bg-purple-100 text-purple-800">
                                {soldeCP.reportN1 || 0}j
                              </span>
                            </td>
                          </tr>
                          <tr className="bg-blue-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">N (Année en cours)</td>
                            <td className="px-4 py-3 text-sm text-center font-semibold text-green-700">{soldeCP.joursAcquisN || 0}j</td>
                            <td className="px-4 py-3 text-sm text-center font-semibold text-red-700">
                              {((soldeCP.joursAcquisN || 0) - (soldeCP.soldeN || 0))}j
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="px-3 py-1 rounded-full font-bold bg-blue-100 text-blue-800">
                                {soldeCP.soldeN || 0}j
                              </span>
                            </td>
                          </tr>
                          <tr className="bg-gray-100 font-bold">
                            <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                            <td className="px-4 py-3 text-sm text-center text-green-800">{soldeCP.joursAcquisTotal || 0}j</td>
                            <td className="px-4 py-3 text-sm text-center text-red-800">{soldeCP.joursConsommes || 0}j</td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`px-4 py-2 rounded-lg text-lg font-bold ${
                                soldeCP.alerte === 'NEGATIF' ? 'bg-red-100 text-red-800' :
                                soldeCP.alerte === 'FAIBLE' ? 'bg-orange-100 text-orange-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {soldeCP.soldeTotal || 0}j
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Informations période */}
                    {soldeCP.periodeActuelle && soldeCP.prochainRenouvellement && (
                      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm text-gray-600">Période de référence</p>
                          <p className="font-semibold text-gray-900">{soldeCP.periodeActuelle}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Prochain renouvellement</p>
                          <p className="font-semibold text-gray-900">
                            {new Date(soldeCP.prochainRenouvellement).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 text-center py-8">Aucune donnée disponible</p>
                )}
              </div>

              {/* Liste des absences */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Historique des absences</h3>
                
                {absences && absences.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date début</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date fin</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Durée demandée</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Jours décomptés</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motif</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {absences
                          .sort((a, b) => {
                            if (!a.dateDebut || !b.dateDebut) return 0;
                            return new Date(b.dateDebut) - new Date(a.dateDebut);
                          })
                          .map(absence => {
                            if (!absence || !absence.id) return null;
                            
                            // Calculer jours décomptés (0 si refusée ou en attente)
                            const joursDemandes = absence.dateDebut && absence.dateFin 
                              ? calculerJoursOuvrables(absence.dateDebut, absence.dateFin) 
                              : 0;
                            const joursDecomptes = absence.statut === 'Validée' ? joursDemandes : 0;
                            const estRefusee = absence.statut === 'Refusée';
                            
                            return (
                              <tr 
                                key={absence.id} 
                                className={`hover:bg-gray-50 ${estRefusee ? 'bg-red-50' : ''}`}
                              >
                                <td className="px-4 py-3 text-sm">
                                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                    absence.type === 'CP' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {absence.type === 'CP' ? 'Congés Payés' : 'Arrêt Maladie'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {absence.dateDebut ? new Date(absence.dateDebut + 'T00:00:00').toLocaleDateString('fr-FR') : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {absence.dateFin ? new Date(absence.dateFin + 'T00:00:00').toLocaleDateString('fr-FR') : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-center font-semibold text-gray-900">
                                  {joursDemandes}j
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-sm font-bold ${
                                    joursDecomptes === 0 ? 'text-red-600' : 'text-green-600'
                                  }`}>
                                    {joursDecomptes}j
                                  </span>
                                  {estRefusee && (
                                    <p className="text-xs text-red-600 mt-1">Non décompté</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    absence.statut === 'Validée' ? 'bg-green-100 text-green-800' :
                                    absence.statut === 'Refusée' ? 'bg-red-100 text-red-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    {absence.statut || 'En attente'}
                                  </span>
                                  {absence.valideParNom && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      par {absence.valideParNom}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {estRefusee && absence.motifRefus ? (
                                    <span className="text-red-600 italic">
                                      ✗ {absence.motifRefus}
                                    </span>
                                  ) : absence.motif ? (
                                    absence.motif
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Aucune absence enregistrée</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Onglet Documents */}
          {ongletActif === 'documents' && (
            <div className="space-y-6">
              {/* Header avec bouton upload */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-bold text-gray-900">Documents</h2>
                  </div>
                  <button
                    onClick={() => setModalUploadOuverte(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Upload className="w-5 h-5" />
                    Ajouter un document
                  </button>
                </div>

                {/* Catégories */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">Contrat</span>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">Avenant</span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">Fiche de paie</span>
                  <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">Diplôme</span>
                  <span className="px-3 py-1 bg-pink-100 text-pink-800 rounded-full text-sm">Formation</span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">Autre</span>
                </div>
              </div>

              {/* Liste documents */}
              <div className="bg-white rounded-xl shadow-md p-6">
                {loadingDocuments ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : documents.length > 0 ? (
                  <div className="space-y-3">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{doc.originalName}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                doc.categorie === 'CONTRAT' ? 'bg-blue-100 text-blue-800' :
                                doc.categorie === 'AVENANT' ? 'bg-green-100 text-green-800' :
                                doc.categorie === 'FICHE_PAIE' ? 'bg-purple-100 text-purple-800' :
                                doc.categorie === 'DIPLOME' ? 'bg-orange-100 text-orange-800' :
                                doc.categorie === 'FORMATION' ? 'bg-pink-100 text-pink-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {doc.categorie}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                              </span>
                              <span className="text-xs text-gray-500">
                                {(doc.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                            {doc.description && (
                              <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <a
                            href={`${API_BASE}/api/documents/${doc.id}/download`}
                            download
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                          >
                            Télécharger
                          </a>
                          <button
                            onClick={() => handleSupprimerDocument(doc.id)}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Aucun document pour cet employé</p>
                    <button
                      onClick={() => setModalUploadOuverte(true)}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Ajouter le premier document
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Onglet Accomptes */}
          {ongletActif === 'acomptes' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center gap-3 mb-6">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                  <h2 className="text-xl font-bold text-gray-900">Historique des accomptes</h2>
                </div>

                {loadingAcomptes ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : acomptes.length > 0 ? (
                  <div className="space-y-4">
                    {acomptes
                      .sort((a, b) => {
                        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                        return dateB - dateA;
                      })
                      .map(acompte => {
                        const totalPaye = (acompte.paiements || []).reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
                        const restantDu = parseFloat(acompte.montant || 0) - totalPaye;
                        const statutColor = 
                          acompte.statut === 'Payée' ? 'bg-purple-100 text-purple-800' :
                          acompte.statut === 'En cours de paiement' || acompte.statut === 'Validée par manager' ? 'bg-blue-100 text-blue-800' :
                          acompte.statut === 'Refusée' ? 'bg-red-100 text-red-800' :
                          acompte.statut === 'En attente' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800';

                        return (
                          <div key={acompte.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-bold text-gray-900">
                                    Accompte du {acompte.createdAt ? new Date(acompte.createdAt).toLocaleDateString('fr-FR') : 'N/A'}
                                  </h3>
                                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statutColor}`}>
                                    {acompte.statut || 'En attente'}
                                  </span>
                                </div>
                                {acompte.motif && (
                                  <p className="text-sm text-gray-600 mb-2">
                                    <strong>Motif :</strong> {acompte.motif}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-gray-900">
                                  {parseFloat(acompte.montant || 0).toFixed(2)}€
                                </p>
                                {restantDu > 0 && (
                                  <p className="text-sm text-orange-600 mt-1">
                                    Restant dû: {restantDu.toFixed(2)}€
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Modalités de paiement */}
                            {acompte.mensualites && acompte.mensualites.length > 0 && (
                              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                  Échéancier ({acompte.mensualites.length} mensualité{acompte.mensualites.length > 1 ? 's' : ''})
                                </h4>
                                <div className="space-y-2">
                                  {acompte.mensualites.map((mensualite, idx) => {
                                    const estPayee = mensualite.statut === 'PAYEE';
                                    return (
                                      <div key={idx} className={`flex items-center justify-between p-2 rounded ${
                                        estPayee ? 'bg-green-50' : 'bg-white'
                                      }`}>
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm font-medium text-gray-700">
                                            {mensualite.numero}/{acompte.mensualites.length} - {mensualite.mois}
                                          </span>
                                          {estPayee && (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                              ✓ Payée
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm font-semibold text-gray-900">
                                            {parseFloat(mensualite.montant || 0).toFixed(2)}€
                                          </p>
                                          {estPayee && mensualite.payeLe && (
                                            <p className="text-xs text-gray-500">
                                              Le {new Date(mensualite.payeLe).toLocaleDateString('fr-FR')}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Historique des paiements */}
                            {acompte.paiements && acompte.paiements.length > 0 && (
                              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                  Historique des paiements
                                </h4>
                                <div className="space-y-2">
                                  {acompte.paiements
                                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                                    .map((paiement, idx) => (
                                      <div key={idx} className="flex items-center justify-between p-2 bg-white rounded">
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">
                                            {new Date(paiement.date).toLocaleDateString('fr-FR')}
                                          </p>
                                          {paiement.reference && (
                                            <p className="text-xs text-gray-500">
                                              Réf: {paiement.reference}
                                            </p>
                                          )}
                                        </div>
                                        <p className="text-sm font-semibold text-green-700">
                                          {parseFloat(paiement.montant || 0).toFixed(2)}€
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Commentaire de refus */}
                            {acompte.statut === 'Refusée' && acompte.motifRefus && (
                              <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-500 rounded">
                                <p className="text-sm text-red-800">
                                  <strong>Motif de refus :</strong> {acompte.motifRefus}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Aucun accompte enregistré pour cet employé</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Modification N-1 */}
      {modalModifN1Ouverte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Modifier le report N-1</h2>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                Modifiez manuellement le nombre de jours de congés reportés de l'année précédente.
              </p>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <p className="text-sm text-blue-900">
                  <strong>Report N-1 actuel :</strong> {soldeCP?.reportN1}j
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nouveau report N-1 (en jours)
              </label>
              <input
                type="number"
                min="0"
                value={nouveauReportN1}
                onChange={(e) => setNouveauReportN1(e.target.value)}
                placeholder={soldeCP?.reportN1?.toString()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setModalModifN1Ouverte(false);
                  setNouveauReportN1('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleModifierN1}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload Document */}
      {modalUploadOuverte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Ajouter un document</h2>
            
            <form onSubmit={handleUploadDocument} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Catégorie
                </label>
                <select
                  value={categorieDoc}
                  onChange={(e) => setCategorieDoc(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CONTRAT">Contrat de travail</option>
                  <option value="AVENANT">Avenant</option>
                  <option value="FICHE_PAIE">Fiche de paie</option>
                  <option value="DIPLOME">Diplôme</option>
                  <option value="FORMATION">Formation</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optionnel)
                </label>
                <input
                  type="text"
                  value={descriptionDoc}
                  onChange={(e) => setDescriptionDoc(e.target.value)}
                  placeholder="Ex: Contrat CDI signé le 15/03/2024"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fichier (PDF, DOCX, PNG, JPG - Max 10MB)
                </label>
                <input
                  type="file"
                  onChange={(e) => setFichierSelectionne(e.target.files[0])}
                  accept=".pdf,.docx,.png,.jpg,.jpeg"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {fichierSelectionne && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Fichier sélectionné :</strong> {fichierSelectionne.name} 
                    ({(fichierSelectionne.size / 1024).toFixed(0)} KB)
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModalUploadOuverte(false);
                    setFichierSelectionne(null);
                    setCategorieDoc('CONTRAT');
                    setDescriptionDoc('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploadEnCours}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadEnCours ? 'Upload...' : 'Uploader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeDetail;

