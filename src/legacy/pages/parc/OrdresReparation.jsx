import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Wrench, Clock, CheckCircle, 
  AlertTriangle, Calendar, DollarSign, User, Package,
  Eye, X, Edit, FileText
} from 'lucide-react';
import { exportBonIntervention, exportFacture } from '../../utils/exportServiceParc';
import API_BASE from '../../config/api';

const OrdresReparation = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ordres, setOrdres] = useState([]);
  const [filteredOrdres, setFilteredOrdres] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filtres, setFiltres] = useState({
    statut: 'TOUS',
    priorite: 'TOUS',
    type: 'TOUS',
    recherche: ''
  });
  
  const [modalDetail, setModalDetail] = useState(null);

  useEffect(() => {
    fetchOrdres();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [ordres, filtres]);

  const fetchOrdres = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/parc/ordres-reparation`);
      const data = await response.json();
      setOrdres(data);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...ordres];
    
    if (filtres.statut !== 'TOUS') {
      filtered = filtered.filter(o => o.statut === filtres.statut);
    }
    
    if (filtres.priorite !== 'TOUS') {
      filtered = filtered.filter(o => o.priorite === filtres.priorite);
    }
    
    if (filtres.type !== 'TOUS') {
      filtered = filtered.filter(o => o.type === filtres.type);
    }
    
    if (filtres.recherche) {
      const term = filtres.recherche.toLowerCase();
      filtered = filtered.filter(o => 
        o.vehiculeImmat.toLowerCase().includes(term) ||
        o.description.toLowerCase().includes(term) ||
        o.id.toLowerCase().includes(term)
      );
    }
    
    setFilteredOrdres(filtered);
  };

  const getStatutBadge = (statut) => {
    const badges = {
      'PLANIFIE': 'bg-gray-100 text-gray-800',
      'EN_COURS': 'bg-blue-100 text-blue-800',
      'EN_ATTENTE_PIECE': 'bg-yellow-100 text-yellow-800',
      'EN_ATTENTE_VALIDATION': 'bg-orange-100 text-orange-800',
      'TERMINE': 'bg-green-100 text-green-800',
      'ANNULE': 'bg-red-100 text-red-800'
    };
    return badges[statut] || 'bg-gray-100 text-gray-800';
  };

  const getPrioriteBadge = (priorite) => {
    const badges = {
      'URGENTE': 'bg-red-100 text-red-800 ring-2 ring-red-500',
      'HAUTE': 'bg-orange-100 text-orange-800',
      'NORMALE': 'bg-blue-100 text-blue-800',
      'BASSE': 'bg-gray-100 text-gray-800'
    };
    return badges[priorite] || 'bg-gray-100 text-gray-800';
  };

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
              <Wrench className="w-8 h-8 text-blue-600" />
              Ordres de réparation
            </h1>
            <p className="text-gray-600 mt-1">Gestion des interventions garage</p>
          </div>
          
          <button
            onClick={() => navigate('/parc/ordres-reparation/nouveau')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouvel ordre
          </button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <QuickStat
          label="Total"
          value={ordres.length}
          color="gray"
        />
        <QuickStat
          label="En cours"
          value={ordres.filter(o => o.statut === 'EN_COURS').length}
          color="blue"
        />
        <QuickStat
          label="En attente"
          value={ordres.filter(o => o.statut === 'PLANIFIE').length}
          color="orange"
        />
        <QuickStat
          label="Urgents"
          value={ordres.filter(o => o.priorite === 'URGENTE' && o.statut !== 'TERMINE').length}
          color="red"
        />
        <QuickStat
          label="Terminés"
          value={ordres.filter(o => o.statut === 'TERMINE').length}
          color="green"
        />
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Rechercher
            </label>
            <input
              type="text"
              value={filtres.recherche}
              onChange={(e) => setFiltres({...filtres, recherche: e.target.value})}
              placeholder="Immat, OR, description..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Statut
            </label>
            <select
              value={filtres.statut}
              onChange={(e) => setFiltres({...filtres, statut: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="PLANIFIE">Planifié</option>
              <option value="EN_COURS">En cours</option>
              <option value="EN_ATTENTE_PIECE">En attente pièce</option>
              <option value="TERMINE">Terminé</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Priorité
            </label>
            <select
              value={filtres.priorite}
              onChange={(e) => setFiltres({...filtres, priorite: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Toutes priorités</option>
              <option value="URGENTE">Urgente</option>
              <option value="HAUTE">Haute</option>
              <option value="NORMALE">Normale</option>
              <option value="BASSE">Basse</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type
            </label>
            <select
              value={filtres.type}
              onChange={(e) => setFiltres({...filtres, type: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Tous types</option>
              <option value="INTERNE">Garage interne</option>
              <option value="EXTERNE">Garage externe</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des ordres */}
      <div className="grid gap-4">
        {filteredOrdres.map(ordre => (
          <OrdreCard
            key={ordre.id}
            ordre={ordre}
            onView={() => setModalDetail(ordre)}
            onEdit={() => navigate(`/parc/ordres-reparation/${ordre.id}/edit`)}
            getStatutBadge={getStatutBadge}
            getPrioriteBadge={getPrioriteBadge}
          />
        ))}
      </div>

      {filteredOrdres.length === 0 && (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <Wrench className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Aucun ordre de réparation trouvé</p>
        </div>
      )}

      {/* Modal détail */}
      {modalDetail && (
        <ModalDetailOR
          ordre={modalDetail}
          onClose={() => setModalDetail(null)}
          onUpdate={fetchOrdres}
          onEdit={() => {
            setModalDetail(null);
            navigate(`/parc/ordres-reparation/modifier/${modalDetail.id}`);
          }}
          getStatutBadge={getStatutBadge}
          getPrioriteBadge={getPrioriteBadge}
        />
      )}

    </div>
  );
};

// COMPOSANTS

const QuickStat = ({ label, value, color }) => (
  <div className={`bg-white rounded-lg shadow p-4 border-l-4 border-${color}-500`}>
    <p className="text-xs text-gray-600">{label}</p>
    <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{value}</p>
  </div>
);

const OrdreCard = ({ ordre, onView, onEdit, getStatutBadge, getPrioriteBadge }) => (
  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-xl font-bold text-gray-900">{ordre.id}</h3>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPrioriteBadge(ordre.priorite)}`}>
            {ordre.priorite}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatutBadge(ordre.statut)}`}>
            {ordre.statut.replace(/_/g, ' ')}
          </span>
          {ordre.type === 'EXTERNE' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              EXTERNE
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Véhicule</p>
            <p className="font-bold text-gray-900">{ordre.vehiculeImmat}</p>
            <p className="text-sm text-gray-600">{ordre.vehiculeModele}</p>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Description</p>
            <p className="text-sm text-gray-900">{ordre.description}</p>
            {ordre.kilometrage && (
              <p className="text-xs text-gray-500 mt-1">{ordre.kilometrage.toLocaleString()} km</p>
            )}
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Garage</p>
            <p className="text-sm text-gray-900">{ordre.garageName}</p>
            {ordre.mecanicienNom && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                <User className="w-3 h-3" />
                {ordre.mecanicienNom}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-6 mt-4 text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {new Date(ordre.dateCreation).toLocaleDateString('fr-FR')}
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            {ordre.couts.totalTTC.toFixed(2)}€ TTC
          </span>
          <span className="flex items-center gap-1">
            <Package className="w-4 h-4" />
            {ordre.pieces.length} pièces
          </span>
        </div>
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={onView}
          className="px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          Détails
        </button>
        <button
          onClick={() => navigate(`/parc/ordres-reparation/${ordre.id}/edit`)}
          className="px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 flex items-center gap-2"
        >
          <Edit className="w-4 h-4" />
          Modifier
        </button>
      </div>
    </div>
  </div>
);

const ModalDetailOR = ({ ordre, onClose, onUpdate, onEdit, getStatutBadge, getPrioriteBadge }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{ordre.id}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPrioriteBadge(ordre.priorite)}`}>
              {ordre.priorite}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatutBadge(ordre.statut)}`}>
              {ordre.statut.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Contenu */}
      <div className="p-6 space-y-6">
        {/* Informations véhicule */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-bold text-gray-900 mb-3">Véhicule</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Immatriculation</p>
              <p className="font-bold">{ordre.vehiculeImmat}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Modèle</p>
              <p className="font-bold">{ordre.vehiculeModele}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Kilométrage</p>
              <p className="font-bold">{ordre.kilometrage?.toLocaleString()} km</p>
            </div>
          </div>
        </div>

        {/* Intervention */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-bold text-gray-900 mb-3">Intervention</h3>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-600">Nature</p>
              <p className="font-bold">{ordre.natureIntervention}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Description</p>
              <p>{ordre.description}</p>
            </div>
            {ordre.diagnostic && (
              <div>
                <p className="text-sm text-gray-600">Diagnostic</p>
                <p>{ordre.diagnostic}</p>
              </div>
            )}
          </div>
        </div>

        {/* Pièces */}
        {ordre.pieces.length > 0 && (
          <div>
            <h3 className="font-bold text-gray-900 mb-3">Pièces ({ordre.pieces.length})</h3>
            <div className="space-y-2">
              {ordre.pieces.map(piece => (
                <div key={piece.id} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{piece.designation}</p>
                      <p className="text-xs text-gray-500">Réf: {piece.reference}</p>
                      <p className="text-xs text-gray-500 mt-1">{piece.fournisseur}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">
                        {(piece.prixUnitaire * piece.quantite).toFixed(2)}€
                      </p>
                      <p className="text-xs text-gray-500">Qté: {piece.quantite}</p>
                      <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-bold ${
                        piece.statut === 'EN_STOCK' ? 'bg-green-100 text-green-800' :
                        piece.statut === 'COMMANDE' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {piece.statut.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coûts */}
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="font-bold text-gray-900 mb-3">Coûts</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-700">Pièces</span>
              <span className="font-bold">{ordre.couts.pieces.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Main d'œuvre</span>
              <span className="font-bold">{ordre.couts.mainOeuvre.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-green-200">
              <span className="text-gray-700">Total HT</span>
              <span className="font-bold">{ordre.couts.total.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">TVA (20%)</span>
              <span className="font-bold">{ordre.couts.tva.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between pt-2 border-t-2 border-green-300">
              <span className="text-lg font-bold text-gray-900">Total TTC</span>
              <span className="text-lg font-bold text-green-600">{ordre.couts.totalTTC.toFixed(2)}€</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex justify-between gap-3">
        <div className="flex gap-3">
          <button
            onClick={() => exportBonIntervention(ordre)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Bon intervention PDF
          </button>
          <button
            onClick={() => exportFacture(ordre)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Facture PDF
          </button>
        </div>
        <div className="flex gap-3">
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Modifier
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default OrdresReparation;

