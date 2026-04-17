import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Save, X, Plus, Trash2, Search, AlertCircle,
  Car, Wrench, User, Calendar, DollarSign, Package,
  FileText, Eye, EyeOff
} from 'lucide-react';
import API_BASE from '../../config/api';

const FormulaireOR = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams(); // Pour mode édition
  const isEditMode = !!id;
  
  const [vehicules, setVehicules] = useState([]);
  const [mecaniciens, setMecaniciens] = useState([]);
  const [stock, setStock] = useState([]);
  const [constantes, setConstantes] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    vehiculeId: '',
    vehiculeImmat: '',
    vehiculeModele: '',
    type: 'INTERNE',
    priorite: 'NORMALE',
    natureIntervention: 'REPARATION',
    description: '',
    symptomes: '',
    diagnostic: '',
    kilometrage: 0,
    dateDepot: '', // Date de dépôt du véhicule au garage
    dateDebut: '', // Date de début des travaux
    heureDebut: '', // Heure de début des travaux
    dateEstimee: '',
    garageType: 'INTERNE',
    garageName: 'Garage G2L',
    garageAdresse: 'ZI Les Pins - 83000 Toulon',
    mecanicienId: '',
    mecanicienNom: ''
  });
  
  const [pieces, setPieces] = useState([]);
  const [mainOeuvre, setMainOeuvre] = useState([]);
  const [piecesEffectif, setPiecesEffectif] = useState([]); // Pièces réellement utilisées
  const [mainOeuvreEffectif, setMainOeuvreEffectif] = useState([]); // Main d'œuvre réellement effectuée
  const [errors, setErrors] = useState({});
  const [showEffectif, setShowEffectif] = useState(false); // Basculer entre prévision et effectif
  
  const [modalAddPiece, setModalAddPiece] = useState(false);
  const [modalAddMO, setModalAddMO] = useState(false);
  const [searchPiece, setSearchPiece] = useState('');
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchData();
    if (isEditMode) {
      fetchOR();
    }
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [vehiculesRes, mecaniciensRes, stockRes, constantesRes] = await Promise.all([
        fetch(`${API_BASE}/api/parc/vehicules?environment=production`),
        fetch(`${API_BASE}/api/parc/mecaniciens`),
        fetch(`${API_BASE}/api/parc/stock`),
        fetch(`${API_BASE}/api/parc/constantes`)
      ]);
      
      const vehiculesData = await vehiculesRes.json();
      const mecaniciensData = await mecaniciensRes.json();
      const stockData = await stockRes.json();
      const constantesData = await constantesRes.json();
      
      setVehicules(vehiculesData);
      setMecaniciens(mecaniciensData);
      setStock(stockData);
      setConstantes(constantesData);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const fetchVehiculeDetails = async (immatriculation) => {
    if (!immatriculation) return;
    
    try {
      setLoadingDetails(true);
      const response = await fetch(`${API_BASE}/api/flotte/vehicules/${encodeURIComponent(immatriculation)}?environment=production`);
      if (response.ok) {
        const details = await response.json();
        // Remplir automatiquement le modèle avec les informations du véhicule
        const modeleComplet = details.constructeur && details.modele 
          ? `${details.constructeur} ${details.modele}`.trim()
          : details.modele || '';
        
        setFormData(prev => ({
          ...prev,
          vehiculeModele: modeleComplet,
          kilometrage: details.dernierKm && details.dernierKm !== '—' ? parseInt(details.dernierKm) || prev.kilometrage : prev.kilometrage
        }));
      }
    } catch (err) {
      console.error('Erreur récupération détails véhicule:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchOR = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/parc/ordres-reparation/${id}`);
      const data = await response.json();
      
      setFormData({
        vehiculeId: data.vehiculeId,
        vehiculeImmat: data.vehiculeImmat,
        vehiculeModele: data.vehiculeModele,
        type: data.type,
        priorite: data.priorite,
        natureIntervention: data.natureIntervention,
        description: data.description,
        symptomes: data.symptomes || '',
        diagnostic: data.diagnostic || '',
        kilometrage: data.kilometrage,
        dateDepot: data.dateDepot ? data.dateDepot.split('T')[0] : '',
        dateDebut: data.dateDebut ? data.dateDebut.split('T')[0] : '',
        heureDebut: data.heureDebut || '',
        dateEstimee: data.dateEstimee ? data.dateEstimee.split('T')[0] : '',
        garageType: data.garageType,
        garageName: data.garageName,
        garageAdresse: data.garageAdresse || '',
        mecanicienId: data.mecanicienId || '',
        mecanicienNom: data.mecanicienNom || ''
      });
      
      setPieces(data.pieces || []);
      setMainOeuvre(data.mainOeuvre || []);
      setPiecesEffectif(data.piecesEffectif || []);
      setMainOeuvreEffectif(data.mainOeuvreEffectif || []);
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors du chargement de l\'ordre');
    }
  };

  const handleVehiculeSelect = async (vehicule) => {
    setFormData({
      ...formData,
      vehiculeId: vehicule.id,
      vehiculeImmat: vehicule.immatriculation,
      vehiculeModele: vehicule.modele || ''
    });
    
    // Récupérer les détails complets du véhicule depuis Salesforce
    if (vehicule.immatriculation) {
      await fetchVehiculeDetails(vehicule.immatriculation);
    }
  };

  const handleMecanicienSelect = (mecanicien) => {
    setFormData({
      ...formData,
      mecanicienId: mecanicien.id,
      mecanicienNom: `${mecanicien.prenom} ${mecanicien.nom}`
    });
  };

  const ajouterPiece = (article) => {
    const newPiece = {
      id: 'PIECE_' + Date.now(),
      reference: article.reference,
      designation: article.designation,
      quantite: 1,
      prixUnitaire: article.prixAchatHT,
      fournisseur: article.fournisseurPrincipal,
      statut: article.quantiteStock > 0 ? 'EN_STOCK' : 'COMMANDE'
    };
    
    if (showEffectif) {
      setPiecesEffectif([...piecesEffectif, newPiece]);
    } else {
      setPieces([...pieces, newPiece]);
    }
    setModalAddPiece(false);
    setSearchPiece('');
  };

  const ajouterPieceManuelle = () => {
    const newPiece = {
      id: 'PIECE_' + Date.now(),
      reference: '',
      designation: '',
      quantite: 1,
      prixUnitaire: 0,
      fournisseur: '',
      statut: 'COMMANDE'
    };
    
    if (showEffectif) {
      setPiecesEffectif([...piecesEffectif, newPiece]);
    } else {
      setPieces([...pieces, newPiece]);
    }
  };

  const modifierPiece = (index, field, value) => {
    const newPieces = [...pieces];
    newPieces[index][field] = value;
    setPieces(newPieces);
  };

  const supprimerPiece = (index) => {
    setPieces(pieces.filter((_, i) => i !== index));
  };

  const ajouterMainOeuvre = () => {
    if (!formData.mecanicienId) {
      alert('Veuillez d\'abord sélectionner un mécanicien');
      return;
    }
    
    const mecanicien = mecaniciens.find(m => m.id === formData.mecanicienId);
    
    const newMO = {
      id: (showEffectif ? 'MO_EFF_' : 'MO_') + Date.now(),
      mecanicienId: formData.mecanicienId,
      mecanicienNom: formData.mecanicienNom,
      description: '',
      tempsEstime: 0,
      tempsEffectif: 0,
      tauxHoraire: mecanicien?.tauxHoraire || 45.00
    };
    
    if (showEffectif) {
      setMainOeuvreEffectif([...mainOeuvreEffectif, newMO]);
    } else {
      setMainOeuvre([...mainOeuvre, newMO]);
    }
  };

  const modifierMainOeuvre = (index, field, value) => {
    const newMO = [...mainOeuvre];
    newMO[index][field] = value;
    setMainOeuvre(newMO);
  };

  const supprimerMainOeuvre = (index) => {
    setMainOeuvre(mainOeuvre.filter((_, i) => i !== index));
  };

  const calculerCouts = () => {
    // Utiliser effectif si disponible, sinon prévision
    const piecesToUse = showEffectif && piecesEffectif.length > 0 ? piecesEffectif : pieces;
    const moToUse = showEffectif && mainOeuvreEffectif.length > 0 ? mainOeuvreEffectif : mainOeuvre;
    
    const coutPieces = piecesToUse.reduce((sum, p) => sum + (p.prixUnitaire * p.quantite), 0);
    const coutMO = moToUse.reduce((sum, m) => sum + ((m.tempsEffectif || m.tempsEstime) * m.tauxHoraire), 0);
    const total = coutPieces + coutMO;
    const tva = total * 0.20;
    
    return {
      pieces: coutPieces,
      mainOeuvre: coutMO,
      total: total,
      tva: tva,
      totalTTC: total + tva
    };
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.vehiculeId) newErrors.vehiculeId = 'Véhicule requis';
    if (!formData.description) newErrors.description = 'Description requise';
    if (!formData.natureIntervention) newErrors.natureIntervention = 'Nature intervention requise';
    if (!formData.kilometrage || formData.kilometrage <= 0) newErrors.kilometrage = 'Kilométrage requis';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    const data = {
      ...formData,
      pieces,
      mainOeuvre,
      piecesEffectif,
      mainOeuvreEffectif
    };
    
    try {
      const url = isEditMode 
        ? `${API_BASE}/api/parc/ordres-reparation/${id}`
        : `${API_BASE}/api/parc/ordres-reparation`;
      
      const method = isEditMode ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error('Erreur');
      
      alert(isEditMode ? 'Ordre modifié !' : 'Ordre créé !');
      navigate('/parc/ordres-reparation');
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de l\'enregistrement');
    }
  };

  const handleExportOR = async () => {
    // Exporter l'OR en mode prévision
    const { exportBonIntervention } = await import('../../utils/exportServiceParc');
    const ordreToExport = {
      ...formData,
      pieces,
      mainOeuvre,
      id: id || 'PREVIEW',
      dateCreation: new Date().toISOString(),
      statut: 'PLANIFIE',
      couts: calculerCouts()
    };
    await exportBonIntervention(ordreToExport);
  };

  const couts = calculerCouts();
  const filteredStock = stock.filter(a => 
    a.designation.toLowerCase().includes(searchPiece.toLowerCase()) ||
    a.reference.toLowerCase().includes(searchPiece.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isEditMode ? 'Modifier l\'ordre de réparation' : 'Nouvel ordre de réparation'}
            </h1>
            <p className="text-gray-600 mt-1">Gestion des interventions garage</p>
          </div>
          
          <button
            onClick={() => navigate('/parc/ordres-reparation')}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Retour
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Véhicule */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Car className="w-6 h-6 text-blue-600" />
              Véhicule *
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sélectionner un véhicule
                </label>
                <select
                  value={formData.vehiculeImmat}
                  onChange={async (e) => {
                    const immatriculation = e.target.value;
                    const selectedVehicule = vehicules.find(v => v.immatriculation === immatriculation);
                    if (selectedVehicule) {
                      await handleVehiculeSelect(selectedVehicule);
                    }
                  }}
                  className={`w-full px-4 py-3 border rounded-lg ${
                    errors.vehiculeId ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">-- Choisir un véhicule --</option>
                  {vehicules.map(v => (
                    <option key={v.id} value={v.immatriculation}>
                      {v.immatriculation}
                    </option>
                  ))}
                </select>
                {loadingDetails && (
                  <p className="text-xs text-gray-500 mt-1">Chargement des détails du véhicule...</p>
                )}
                {errors.vehiculeId && (
                  <p className="text-red-500 text-xs mt-1">{errors.vehiculeId}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Immatriculation
                  </label>
                  <input
                    type="text"
                    value={formData.vehiculeImmat}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modèle
                  </label>
                  <input
                    type="text"
                    value={formData.vehiculeModele}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kilométrage *
                </label>
                <input
                  type="number"
                  value={formData.kilometrage}
                  onChange={(e) => setFormData({...formData, kilometrage: parseInt(e.target.value) || 0})}
                  className={`w-full px-4 py-2 border rounded-lg ${
                    errors.kilometrage ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="125000"
                />
                {errors.kilometrage && (
                  <p className="text-red-500 text-xs mt-1">{errors.kilometrage}</p>
                )}
              </div>
            </div>
          </div>

          {/* Intervention */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Wrench className="w-6 h-6 text-green-600" />
              Intervention *
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nature intervention *
                  </label>
                  <select
                    value={formData.natureIntervention}
                    onChange={(e) => setFormData({...formData, natureIntervention: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    {constantes && Object.entries(constantes.naturesIntervention).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Priorité
                  </label>
                  <select
                    value={formData.priorite}
                    onChange={(e) => setFormData({...formData, priorite: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    {constantes && Object.entries(constantes.priorites).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className={`w-full px-4 py-2 border rounded-lg ${
                    errors.description ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Décrivez le problème..."
                />
                {errors.description && (
                  <p className="text-red-500 text-xs mt-1">{errors.description}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Symptômes
                </label>
                <textarea
                  value={formData.symptomes}
                  onChange={(e) => setFormData({...formData, symptomes: e.target.value})}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Symptômes observés..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Diagnostic
                </label>
                <textarea
                  value={formData.diagnostic}
                  onChange={(e) => setFormData({...formData, diagnostic: e.target.value})}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Diagnostic technique..."
                />
              </div>
            </div>
          </div>

          {/* Garage et mécanicien */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-6 h-6 text-purple-600" />
              Garage et mécanicien
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type garage
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="INTERNE">Garage interne</option>
                    <option value="EXTERNE">Garage externe</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date estimée fin
                  </label>
                  <input
                    type="date"
                    value={formData.dateEstimee}
                    onChange={(e) => setFormData({...formData, dateEstimee: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Nouvelles dates */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date dépôt véhicule
                  </label>
                  <input
                    type="date"
                    value={formData.dateDepot}
                    onChange={(e) => setFormData({...formData, dateDepot: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date début travaux
                  </label>
                  <input
                    type="date"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData({...formData, dateDebut: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Heure début travaux
                  </label>
                  <input
                    type="time"
                    value={formData.heureDebut}
                    onChange={(e) => setFormData({...formData, heureDebut: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              
              {formData.type === 'INTERNE' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mécanicien
                  </label>
                  <select
                    value={formData.mecanicienId}
                    onChange={(e) => {
                      const mecanicien = mecaniciens.find(m => m.id === e.target.value);
                      if (mecanicien) handleMecanicienSelect(mecanicien);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Choisir un mécanicien --</option>
                    {mecaniciens.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.prenom} {m.nom} - {m.type} ({m.tauxHoraire}€/h)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom du garage
                    </label>
                    <input
                      type="text"
                      value={formData.garageName}
                      onChange={(e) => setFormData({...formData, garageName: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Garage Expert Renault"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adresse
                    </label>
                    <input
                      type="text"
                      value={formData.garageAdresse}
                      onChange={(e) => setFormData({...formData, garageAdresse: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="15 Avenue de la République..."
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Pièces */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Package className="w-6 h-6 text-orange-600" />
                  Pièces {showEffectif ? '(Effectif)' : '(Prévision)'} ({showEffectif ? piecesEffectif.length : pieces.length})
                </h2>
                {isEditMode && (
                  <button
                    onClick={() => setShowEffectif(!showEffectif)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    {showEffectif ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        Voir prévision
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Voir effectif
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setModalAddPiece(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Stock
                </button>
                <button
                  onClick={ajouterPieceManuelle}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Manuelle
                </button>
              </div>
            </div>
            
            {(showEffectif ? piecesEffectif : pieces).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Aucune pièce {showEffectif ? 'effectivement utilisée' : 'prévue'}
              </div>
            ) : (
              <div className="space-y-3">
                {(showEffectif ? piecesEffectif : pieces).map((piece, index) => {
                  const piecesList = showEffectif ? piecesEffectif : pieces;
                  return (
                  <div key={piece.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-3">
                        <label className="text-xs text-gray-600">Référence</label>
                        <input
                          type="text"
                          value={piece.reference}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newPieces = [...piecesEffectif];
                              newPieces[index].reference = e.target.value;
                              setPiecesEffectif(newPieces);
                            } else {
                              modifierPiece(index, 'reference', e.target.value);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="text-xs text-gray-600">Désignation</label>
                        <input
                          type="text"
                          value={piece.designation}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newPieces = [...piecesEffectif];
                              newPieces[index].designation = e.target.value;
                              setPiecesEffectif(newPieces);
                            } else {
                              modifierPiece(index, 'designation', e.target.value);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-xs text-gray-600">Qté</label>
                        <input
                          type="number"
                          value={piece.quantite}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newPieces = [...piecesEffectif];
                              newPieces[index].quantite = parseInt(e.target.value) || 1;
                              setPiecesEffectif(newPieces);
                            } else {
                              modifierPiece(index, 'quantite', parseInt(e.target.value) || 1);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                          min="1"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-600">Prix HT</label>
                        <input
                          type="number"
                          step="0.01"
                          value={piece.prixUnitaire}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newPieces = [...piecesEffectif];
                              newPieces[index].prixUnitaire = parseFloat(e.target.value) || 0;
                              setPiecesEffectif(newPieces);
                            } else {
                              modifierPiece(index, 'prixUnitaire', parseFloat(e.target.value) || 0);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                        />
                      </div>
                      <div className="col-span-1 flex items-end">
                        <p className="text-sm font-bold text-gray-900">
                          {(piece.prixUnitaire * piece.quantite).toFixed(2)}€
                        </p>
                      </div>
                      <div className="col-span-1 flex items-end">
                        <button
                          onClick={() => {
                            if (showEffectif) {
                              setPiecesEffectif(piecesEffectif.filter((_, i) => i !== index));
                            } else {
                              supprimerPiece(index);
                            }
                          }}
                          className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Main d'œuvre */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Wrench className="w-6 h-6 text-indigo-600" />
                  Main d'œuvre {showEffectif ? '(Effectif)' : '(Prévision)'} ({showEffectif ? mainOeuvreEffectif.length : mainOeuvre.length})
                </h2>
                {isEditMode && (
                  <button
                    onClick={() => setShowEffectif(!showEffectif)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    {showEffectif ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        Voir prévision
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Voir effectif
                      </>
                    )}
                  </button>
                )}
              </div>
              <button
                onClick={ajouterMainOeuvre}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>
            
            {(showEffectif ? mainOeuvreEffectif : mainOeuvre).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Aucune main d'œuvre {showEffectif ? 'effectivement effectuée' : 'prévue'}
              </div>
            ) : (
              <div className="space-y-3">
                {(showEffectif ? mainOeuvreEffectif : mainOeuvre).map((mo, index) => {
                  const moList = showEffectif ? mainOeuvreEffectif : mainOeuvre;
                  return (
                  <div key={mo.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-2">
                        <label className="text-xs text-gray-600">Mécanicien</label>
                        <input
                          type="text"
                          value={mo.mecanicienNom}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1 bg-gray-50"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="text-xs text-gray-600">Description</label>
                        <input
                          type="text"
                          value={mo.description}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newMO = [...mainOeuvreEffectif];
                              newMO[index].description = e.target.value;
                              setMainOeuvreEffectif(newMO);
                            } else {
                              modifierMainOeuvre(index, 'description', e.target.value);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                          placeholder="Remplacement disques et plaquettes..."
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-600">{showEffectif ? 'Temps effectif (h)' : 'Temps estimé (h)'}</label>
                        <input
                          type="number"
                          step="0.5"
                          value={showEffectif ? (mo.tempsEffectif || mo.tempsEstime) : mo.tempsEstime}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newMO = [...mainOeuvreEffectif];
                              newMO[index].tempsEffectif = parseFloat(e.target.value) || 0;
                              setMainOeuvreEffectif(newMO);
                            } else {
                              modifierMainOeuvre(index, 'tempsEstime', parseFloat(e.target.value) || 0);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-600">Taux €/h</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mo.tauxHoraire}
                          onChange={(e) => {
                            if (showEffectif) {
                              const newMO = [...mainOeuvreEffectif];
                              newMO[index].tauxHoraire = parseFloat(e.target.value) || 0;
                              setMainOeuvreEffectif(newMO);
                            } else {
                              modifierMainOeuvre(index, 'tauxHoraire', parseFloat(e.target.value) || 0);
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                        />
                      </div>
                      <div className="col-span-1 flex items-end">
                        <p className="text-sm font-bold text-gray-900">
                          {((showEffectif ? (mo.tempsEffectif || mo.tempsEstime) : mo.tempsEstime) * mo.tauxHoraire).toFixed(2)}€
                        </p>
                      </div>
                      <div className="col-span-1 flex items-end">
                        <button
                          onClick={() => {
                            if (showEffectif) {
                              setMainOeuvreEffectif(mainOeuvreEffectif.filter((_, i) => i !== index));
                            } else {
                              supprimerMainOeuvre(index);
                            }
                          }}
                          className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Résumé coûts */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-6 sticky top-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              Résumé des coûts
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-700">Pièces</span>
                <span className="font-bold text-gray-900">{couts.pieces.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-700">Main d'œuvre</span>
                <span className="font-bold text-gray-900">{couts.mainOeuvre.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-700">Total HT</span>
                <span className="font-bold text-gray-900">{couts.total.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-700">TVA (20%)</span>
                <span className="font-bold text-gray-900">{couts.tva.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between py-3 bg-green-50 rounded-lg px-3">
                <span className="text-lg font-bold text-gray-900">Total TTC</span>
                <span className="text-lg font-bold text-green-600">{couts.totalTTC.toFixed(2)}€</span>
              </div>
            </div>
            
            <div className="mt-6 space-y-3">
              <button
                onClick={handleSubmit}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {isEditMode ? 'Enregistrer modifications' : 'Créer l\'ordre'}
              </button>

              <button
                onClick={handleExportOR}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                Exporter OR (Prévision)
              </button>
              
              <button
                onClick={() => navigate('/parc/ordres-reparation')}
                className="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                Annuler
              </button>
            </div>
            
            {Object.keys(errors).length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-800">Erreurs détectées :</p>
                    <ul className="text-xs text-red-700 mt-1 list-disc list-inside">
                      {Object.values(errors).map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal recherche pièce stock */}
      {modalAddPiece && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Ajouter une pièce du stock</h2>
                <button
                  onClick={() => {
                    setModalAddPiece(false);
                    setSearchPiece('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchPiece}
                  onChange={(e) => setSearchPiece(e.target.value)}
                  placeholder="Rechercher par référence ou désignation..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-3">
                {filteredStock.map(article => (
                  <div
                    key={article.id}
                    onClick={() => ajouterPiece(article)}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{article.designation}</p>
                        <p className="text-sm text-gray-600 mt-1">Réf: {article.reference}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span className={`font-bold ${
                            article.quantiteStock > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            Stock: {article.quantiteStock}
                          </span>
                          <span>{article.fournisseurPrincipal}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600 text-lg">{article.prixAchatHT.toFixed(2)}€</p>
                        <p className="text-xs text-gray-500">HT</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {filteredStock.length === 0 && (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Aucune pièce trouvée</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormulaireOR;

