import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  Check, 
  X, 
  AlertCircle, 
  Calendar,
  User,
  Search,
  Filter,
  Eye,
  Trash2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import DocumentsEmploye from './DocumentsEmploye';
import API_BASE from '../../config/api';
const CATEGORIES_COLORS = {
  CNI: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  PERMIS: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  CONTRAT: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  AVENANT: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  FICHE_PAIE: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  DIPLOME: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  FORMATION: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  VISITE_MEDICALE: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  RIB: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
  AUTRE: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' }
};

export default function Documents() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [categories, setCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalUpload, setModalUpload] = useState(false);
  const [modalValidation, setModalValidation] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedEmploye, setSelectedEmploye] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('TOUTES');
  const [filterStatut, setFilterStatut] = useState('TOUS');
  
  // Formulaire upload
  const [formData, setFormData] = useState({
    employeId: '',
    categorie: 'AUTRE',
    description: '',
    version: 'unique',
    dateExpiration: null
  });
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Récupérer documents
      const resDocs = await fetch(`${API_BASE}/api/documents`);
      const docs = await resDocs.json();
      setDocuments(docs || []);
      
      // Récupérer employés
      const resEmployes = await fetch(`${API_BASE}/api/employes`);
      const dataEmployes = await resEmployes.json();
      setEmployes(dataEmployes.employes || []);
      
      // Récupérer catégories
      const resCategories = await fetch(`${API_BASE}/api/documents/categories`);
      try {
        const cats = await resCategories.json();
        setCategories(cats || {});
      } catch {
        // Si l'endpoint n'existe pas, utiliser les catégories par défaut
        setCategories({});
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Erreur récupération données:', error);
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!selectedFile || !formData.employeId) {
      alert('Veuillez sélectionner un fichier et un employé');
      return;
    }
    
    // Les managers et RH peuvent créer des visites médicales pour le planning
    
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', selectedFile);
      formDataUpload.append('employeId', formData.employeId);
      formDataUpload.append('categorie', formData.categorie);
      formDataUpload.append('description', formData.description);
      formDataUpload.append('version', formData.version);
      if (formData.dateExpiration) {
        formDataUpload.append('dateExpiration', formData.dateExpiration.toISOString().split('T')[0]);
      }
      // Ajouter les infos utilisateur pour validation automatique des visites médicales
      if (user) {
        formDataUpload.append('userRole', user.role);
        formDataUpload.append('userNom', user.nom || user.nomComplet || '');
        formDataUpload.append('userId', user.userId || user.id || '');
      }
      
      const res = await fetch(`${API_BASE}/api/documents/upload`, {
        method: 'POST',
        body: formDataUpload
      });
      
      if (!res.ok) {
        throw new Error('Erreur lors de l\'upload');
      }
      
      await fetchData();
      setModalUpload(false);
      setFormData({
        employeId: '',
        categorie: 'AUTRE',
        description: '',
        version: 'unique',
        dateExpiration: null
      });
      setSelectedFile(null);
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload du document');
    }
  };

  const handleValider = async () => {
    if (!selectedDocument) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/documents/${selectedDocument.id}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom
        })
      });
      
      if (!res.ok) throw new Error('Erreur validation');
      
      await fetchData();
      setModalValidation(false);
      setSelectedDocument(null);
    } catch (error) {
      console.error('Erreur validation:', error);
      alert('Erreur lors de la validation');
    }
  };

  const handleRefuser = async (motifRefus) => {
    if (!selectedDocument || !motifRefus) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/documents/${selectedDocument.id}/refuser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validateurId: user.userId,
          validateurNom: user.nom,
          motifRefus
        })
      });
      
      if (!res.ok) throw new Error('Erreur refus');
      
      await fetchData();
      setModalValidation(false);
      setSelectedDocument(null);
    } catch (error) {
      console.error('Erreur refus:', error);
      alert('Erreur lors du refus');
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/documents/${docId}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Erreur suppression');
      
      await fetchData();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Filtrer documents
  const documentsFiltres = documents.filter(doc => {
    const employe = employes.find(e => e.id === doc.employeId);
    const nomEmploye = employe?.nomComplet || '';
    
    const matchSearch = !searchTerm || 
      nomEmploye.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchCategorie = filterCategorie === 'TOUTES' || doc.categorie === filterCategorie;
    const matchStatut = filterStatut === 'TOUS' || doc.statut === filterStatut;
    
    return matchSearch && matchCategorie && matchStatut;
  });

  // Grouper par employé
  const documentsParEmploye = documentsFiltres.reduce((acc, doc) => {
    if (!acc[doc.employeId]) {
      acc[doc.employeId] = [];
    }
    acc[doc.employeId].push(doc);
    return acc;
  }, {});

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
              <FileText className="w-8 h-8 text-blue-600" />
              Gestion Documents Salariés
            </h1>
            <p className="text-gray-600 mt-2">Gestion complète des documents avec alertes d'expiration</p>
          </div>
          
          {(user?.role === 'RH' || user?.role === 'MANAGER') && (
            <button
              onClick={() => setModalUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-5 h-5" />
              Ajouter un document
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher par employé ou description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <select
            value={filterCategorie}
            onChange={(e) => setFilterCategorie(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="TOUTES">Toutes les catégories</option>
            <option value="CNI">CNI</option>
            <option value="PERMIS">Permis</option>
            <option value="CONTRAT">Contrat</option>
            <option value="AVENANT">Avenant</option>
            <option value="VISITE_MEDICALE">Visite Médicale</option>
            <option value="RIB">RIB</option>
            <option value="FORMATION">Formation</option>
            <option value="DIPLOME">Diplôme</option>
            <option value="AUTRE">Autre</option>
          </select>
          
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="TOUS">Tous les statuts</option>
            <option value="En attente validation">En attente</option>
            <option value="Validé">Validé</option>
            <option value="Refusé">Refusé</option>
          </select>
        </div>
      </div>

      {/* Liste documents par employé */}
      <div className="space-y-4">
        {Object.entries(documentsParEmploye).map(([employeId, docs]) => {
          const employe = employes.find(e => e.id === employeId);
          if (!employe) return null;
          
          return (
            <DocumentsEmploye
              key={employeId}
              employe={employe}
              documents={docs}
              onValider={(doc) => {
                setSelectedDocument(doc);
                setSelectedEmploye(employe);
                setModalValidation(true);
              }}
              onDelete={handleDelete}
              user={user}
            />
          );
        })}
        
        {Object.keys(documentsParEmploye).length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucun document trouvé</p>
          </div>
        )}
      </div>

      {/* Modal Upload */}
      {modalUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Ajouter un document</h2>
              <button onClick={() => setModalUpload(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employé *</label>
                <select
                  required
                  value={formData.employeId}
                  onChange={(e) => setFormData({ ...formData, employeId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner un employé</option>
                  {employes.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nomComplet} - {emp.societe}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                <select
                  required
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CNI">CNI</option>
                  <option value="PERMIS">Permis de Conduire</option>
                  <option value="CONTRAT">Contrat de Travail</option>
                  <option value="AVENANT">Avenant</option>
            <option value="VISITE_MEDICALE">Visite Médicale</option>
                  <option value="RIB">RIB</option>
                  <option value="FORMATION">Formation</option>
                  <option value="DIPLOME">Diplôme</option>
                  <option value="FICHE_PAIE">Fiche de Paie</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fichier *</label>
                <input
                  type="file"
                  required
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration (si applicable)</label>
                <DatePicker
                  selected={formData.dateExpiration}
                  onChange={(date) => setFormData({ ...formData, dateExpiration: date })}
                  dateFormat="dd/MM/yyyy"
                  locale={fr}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholderText="Sélectionner une date"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Uploader
                </button>
                <button
                  type="button"
                  onClick={() => setModalUpload(false)}
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
      {modalValidation && selectedDocument && selectedEmploye && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Valider/Refuser Document</h2>
              <button onClick={() => setModalValidation(false)} className="text-gray-600 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">Employé:</p>
              <p className="font-semibold text-gray-900">{selectedEmploye.nomComplet}</p>
              <p className="text-sm text-gray-600 mt-2">Document:</p>
              <p className="font-semibold text-gray-900">{selectedDocument.originalName}</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleValider}
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

