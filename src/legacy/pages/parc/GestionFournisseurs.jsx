import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ShoppingCart, Plus, Search, Edit, Trash2, Star,
  Phone, Mail, MapPin, TrendingUp, Package, DollarSign
} from 'lucide-react';
import API_BASE from '../../config/api';

const GestionFournisseurs = () => {
  const { user } = useAuth();
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreType, setFiltreType] = useState('TOUS');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);

  useEffect(() => {
    fetchFournisseurs();
  }, []);

  const fetchFournisseurs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/parc/fournisseurs`);
      const data = await response.json();
      setFournisseurs(data);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const filteredFournisseurs = fournisseurs.filter(f => {
    const matchType = filtreType === 'TOUS' || f.type === filtreType;
    const matchSearch = !searchTerm || 
      f.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.contact.responsable.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchType && matchSearch;
  });

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
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ShoppingCart className="w-8 h-8 text-green-600" />
              Gestion des Fournisseurs
            </h1>
            <p className="text-gray-600 mt-1">Pièces, garages et prestataires</p>
          </div>
          
          <button
            onClick={() => setModalCreate(true)}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouveau fournisseur
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<ShoppingCart className="w-6 h-6 text-blue-600" />}
          label="Total fournisseurs"
          value={fournisseurs.length}
          color="blue"
        />
        <StatCard
          icon={<Package className="w-6 h-6 text-green-600" />}
          label="Fournisseurs pièces"
          value={fournisseurs.filter(f => f.type === 'PIECES').length}
          color="green"
        />
        <StatCard
          icon={<ShoppingCart className="w-6 h-6 text-purple-600" />}
          label="Garages externes"
          value={fournisseurs.filter(f => f.type === 'GARAGE').length}
          color="purple"
        />
        <StatCard
          icon={<DollarSign className="w-6 h-6 text-orange-600" />}
          label="Volume annuel"
          value={`${Math.round(fournisseurs.reduce((sum, f) => sum + (f.statistiques?.montantTotal || 0), 0)).toLocaleString()}€`}
          color="orange"
        />
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Rechercher
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom, responsable..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type
            </label>
            <select
              value={filtreType}
              onChange={(e) => setFiltreType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Tous types</option>
              <option value="PIECES">Pièces détachées</option>
              <option value="GARAGE">Garage externe</option>
              <option value="CARROSSERIE">Carrosserie</option>
              <option value="PNEUS">Pneus</option>
              <option value="LUBRIFIANT">Lubrifiants</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste fournisseurs */}
      <div className="grid gap-4">
        {filteredFournisseurs.map(fournisseur => (
          <FournisseurCard
            key={fournisseur.id}
            fournisseur={fournisseur}
            onEdit={() => setModalEdit(fournisseur)}
          />
        ))}
      </div>

      {filteredFournisseurs.length === 0 && (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Aucun fournisseur trouvé</p>
        </div>
      )}
    </div>
  );
};

// COMPOSANTS

const StatCard = ({ icon, label, value, color }) => (
  <div className={`bg-white rounded-xl shadow-lg p-4 border-l-4 border-${color}-500`}>
    <div className="flex items-center justify-between mb-2">
      {icon}
    </div>
    <p className="text-xs text-gray-600">{label}</p>
    <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{value}</p>
  </div>
);

const FournisseurCard = ({ fournisseur, onEdit }) => {
  const getTypeBadge = (type) => {
    const badges = {
      'PIECES': 'bg-blue-100 text-blue-800',
      'GARAGE': 'bg-purple-100 text-purple-800',
      'CARROSSERIE': 'bg-indigo-100 text-indigo-800',
      'PNEUS': 'bg-gray-100 text-gray-800',
      'LUBRIFIANT': 'bg-green-100 text-green-800'
    };
    return badges[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xl font-bold text-gray-900">{fournisseur.nom}</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getTypeBadge(fournisseur.type)}`}>
              {fournisseur.type}
            </span>
            {fournisseur.notation && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-current" />
                <span className="text-sm font-bold text-gray-700">{fournisseur.notation}</span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Contact</p>
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  {fournisseur.contact.telephone}
                </p>
                <p className="text-sm text-gray-700 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-green-600" />
                  {fournisseur.contact.email}
                </p>
                <p className="text-sm text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-600" />
                  {fournisseur.contact.adresse}
                </p>
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-600 mb-2">Conditions</p>
              <div className="space-y-1 text-sm">
                <p className="text-gray-700">
                  Délai livraison: <span className="font-bold">{fournisseur.conditions.delaiLivraison}h</span>
                </p>
                <p className="text-gray-700">
                  Paiement: <span className="font-bold">{fournisseur.conditions.delaiPaiement}j</span>
                </p>
                {fournisseur.conditions.remise && (
                  <p className="text-green-700 font-bold">
                    Remise: {fournisseur.conditions.remise}%
                  </p>
                )}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-600 mb-2">Statistiques</p>
              <div className="space-y-1 text-sm">
                <p className="text-gray-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  {fournisseur.statistiques?.nombreCommandes || 0} commandes
                </p>
                <p className="text-gray-700 font-bold text-lg text-blue-600">
                  {(fournisseur.statistiques?.montantTotal || 0).toLocaleString()}€
                </p>
                {fournisseur.statistiques?.dernierAchat && (
                  <p className="text-xs text-gray-500">
                    Dernier achat: {new Date(fournisseur.statistiques.dernierAchat).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {fournisseur.commentaires && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 italic">💬 {fournisseur.commentaires}</p>
            </div>
          )}
        </div>
        
        <button
          onClick={onEdit}
          className="ml-4 p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
        >
          <Edit className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default GestionFournisseurs;

