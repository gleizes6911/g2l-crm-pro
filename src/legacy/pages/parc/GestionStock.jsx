import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Package, Plus, Search, TrendingDown, TrendingUp, 
  AlertTriangle, ArrowUpCircle, ArrowDownCircle,
  Settings, BarChart3
} from 'lucide-react';
import API_BASE from '../../config/api';

const GestionStock = () => {
  const { user } = useAuth();
  const [stock, setStock] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [categories, setCategories] = useState({});
  const [loading, setLoading] = useState(true);
  
  const [filtres, setFiltres] = useState({
    categorie: 'TOUS',
    recherche: '',
    alerteStock: false
  });
  
  const [modalMouvement, setModalMouvement] = useState(null);
  const [modalCreate, setModalCreate] = useState(false);
  
  const [formMouvement, setFormMouvement] = useState({
    type: 'ENTREE',
    quantite: 0,
    motif: '',
    reference: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [stockRes, alertesRes, constantesRes] = await Promise.all([
        fetch(`${API_BASE}/api/parc/stock`),
        fetch(`${API_BASE}/api/parc/stock/alertes`),
        fetch(`${API_BASE}/api/parc/constantes`)
      ]);
      
      const stockData = await stockRes.json();
      const alertesData = await alertesRes.json();
      const constantesData = await constantesRes.json();
      
      setStock(stockData);
      setAlertes(alertesData);
      setCategories(constantesData.categoriesStock);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const handleMouvement = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/parc/stock/${modalMouvement.id}/mouvement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formMouvement,
          quantite: parseInt(formMouvement.quantite),
          utilisateurId: user.userId
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.error || 'Erreur');
        return;
      }
      
      setModalMouvement(null);
      setFormMouvement({
        type: 'ENTREE',
        quantite: 0,
        motif: '',
        reference: ''
      });
      fetchData();
      alert('Mouvement enregistré !');
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors du mouvement');
    }
  };

  const filteredStock = stock.filter(article => {
    const matchCategorie = filtres.categorie === 'TOUS' || article.categorie === filtres.categorie;
    const matchAlerteStock = !filtres.alerteStock || article.quantiteStock <= article.quantiteMin;
    const matchRecherche = !filtres.recherche || 
      article.designation.toLowerCase().includes(filtres.recherche.toLowerCase()) ||
      article.reference.toLowerCase().includes(filtres.recherche.toLowerCase());
    
    return matchCategorie && matchAlerteStock && matchRecherche;
  });

  const valeurTotale = stock.reduce((sum, a) => sum + (a.quantiteStock * a.prixAchatHT), 0);

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
              <Package className="w-8 h-8 text-green-600" />
              Gestion du Stock
            </h1>
            <p className="text-gray-600 mt-1">Pièces détachées et fournitures</p>
          </div>
          
          <button
            onClick={() => setModalCreate(true)}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouvel article
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Package className="w-6 h-6 text-blue-600" />}
          label="Articles"
          value={stock.length}
          color="blue"
        />
        <StatCard
          icon={<BarChart3 className="w-6 h-6 text-green-600" />}
          label="Valeur stock"
          value={`${Math.round(valeurTotale).toLocaleString()}€`}
          color="green"
        />
        <StatCard
          icon={<AlertTriangle className="w-6 h-6 text-orange-600" />}
          label="Alertes stock"
          value={alertes.length}
          color="orange"
          urgent={alertes.length > 0}
        />
        <StatCard
          icon={<TrendingDown className="w-6 h-6 text-red-600" />}
          label="Ruptures"
          value={stock.filter(a => a.quantiteStock === 0).length}
          color="red"
          urgent={stock.filter(a => a.quantiteStock === 0).length > 0}
        />
      </div>

      {/* Alertes stock */}
      {alertes.length > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-500 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-bold text-orange-900 mb-2">
                {alertes.length} article{alertes.length > 1 ? 's' : ''} en alerte stock
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {alertes.slice(0, 6).map(article => (
                  <div key={article.id} className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-bold text-sm text-gray-900">{article.designation}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs font-bold ${
                        article.quantiteStock === 0 ? 'text-red-600' : 'text-orange-600'
                      }`}>
                        Stock: {article.quantiteStock}
                      </span>
                      <span className="text-xs text-gray-500">
                        Min: {article.quantiteMin}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        article.niveau === 'CRITIQUE' ? 'bg-red-100 text-red-800' :
                        article.niveau === 'URGENT' ? 'bg-orange-100 text-orange-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {article.niveau}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {alertes.length > 6 && (
                <p className="text-sm text-orange-800 mt-3">
                  ... et {alertes.length - 6} autre{alertes.length - 6 > 1 ? 's' : ''} article{alertes.length - 6 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Rechercher
            </label>
            <input
              type="text"
              value={filtres.recherche}
              onChange={(e) => setFiltres({...filtres, recherche: e.target.value})}
              placeholder="Référence, désignation..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Catégorie
            </label>
            <select
              value={filtres.categorie}
              onChange={(e) => setFiltres({...filtres, categorie: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Toutes catégories</option>
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filtres.alerteStock}
                onChange={(e) => setFiltres({...filtres, alerteStock: e.target.checked})}
                className="w-4 h-4 text-orange-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                Alertes stock uniquement
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Tableau stock */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Catégorie</th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Emplacement</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Prix achat</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Valeur</th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredStock.map(article => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  onMouvement={() => setModalMouvement(article)}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredStock.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucun article trouvé</p>
          </div>
        )}
      </div>

      {/* Modal Mouvement */}
      {modalMouvement && (
        <ModalMouvement
          article={modalMouvement}
          formMouvement={formMouvement}
          setFormMouvement={setFormMouvement}
          onSave={handleMouvement}
          onClose={() => {
            setModalMouvement(null);
            setFormMouvement({
              type: 'ENTREE',
              quantite: 0,
              motif: '',
              reference: ''
            });
          }}
        />
      )}
    </div>
  );
};

// COMPOSANTS

const StatCard = ({ icon, label, value, color, urgent }) => (
  <div className={`bg-white rounded-xl shadow-lg p-4 border-l-4 border-${color}-500 ${
    urgent ? 'ring-2 ring-orange-500 animate-pulse' : ''
  }`}>
    <div className="flex items-center justify-between mb-2">
      {icon}
    </div>
    <p className="text-xs text-gray-600">{label}</p>
    <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{value}</p>
  </div>
);

const ArticleRow = ({ article, onMouvement }) => {
  const niveauStock = article.quantiteStock === 0 ? 'CRITIQUE' :
                      article.quantiteStock <= article.quantiteMin / 2 ? 'URGENT' :
                      article.quantiteStock <= article.quantiteMin ? 'ATTENTION' :
                      'OK';
  
  const couleurStock = niveauStock === 'CRITIQUE' ? 'text-red-600 font-bold' :
                       niveauStock === 'URGENT' ? 'text-orange-600 font-bold' :
                       niveauStock === 'ATTENTION' ? 'text-yellow-600 font-bold' :
                       'text-green-600';
  
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4">
        <div>
          <p className="font-medium text-gray-900">{article.designation}</p>
          <p className="text-xs text-gray-500">Réf: {article.reference}</p>
          {article.marque && (
            <p className="text-xs text-gray-500">{article.marque}</p>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
          {article.categorie}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="text-center">
          <p className={`text-lg font-bold ${couleurStock}`}>
            {article.quantiteStock}
          </p>
          <p className="text-xs text-gray-500">
            Min: {article.quantiteMin} | Max: {article.quantiteMax}
          </p>
          {niveauStock !== 'OK' && (
            <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-bold ${
              niveauStock === 'CRITIQUE' ? 'bg-red-100 text-red-800' :
              niveauStock === 'URGENT' ? 'bg-orange-100 text-orange-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {niveauStock}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm text-gray-700">{article.emplacement}</p>
      </td>
      <td className="px-6 py-4 text-right">
        <p className="font-medium text-gray-900">{article.prixAchatHT.toFixed(2)}€</p>
      </td>
      <td className="px-6 py-4 text-right">
        <p className="font-bold text-green-600">
          {(article.quantiteStock * article.prixAchatHT).toFixed(2)}€
        </p>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onMouvement}
            className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
            title="Mouvement stock"
          >
            <TrendingUp className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const ModalMouvement = ({ article, formMouvement, setFormMouvement, onSave, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Mouvement de stock</h2>
      
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <p className="font-bold text-gray-900">{article.designation}</p>
        <p className="text-sm text-gray-600 mt-1">Réf: {article.reference}</p>
        <p className="text-sm text-gray-600">Stock actuel: <span className="font-bold text-blue-600">{article.quantiteStock}</span></p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type de mouvement *
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setFormMouvement({...formMouvement, type: 'ENTREE'})}
              className={`p-3 border-2 rounded-lg text-left ${
                formMouvement.type === 'ENTREE' 
                  ? 'border-green-600 bg-green-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <ArrowUpCircle className={`w-5 h-5 mb-1 ${
                formMouvement.type === 'ENTREE' ? 'text-green-600' : 'text-gray-600'
              }`} />
              <p className="font-bold text-sm">Entrée</p>
            </button>
            <button
              onClick={() => setFormMouvement({...formMouvement, type: 'SORTIE'})}
              className={`p-3 border-2 rounded-lg text-left ${
                formMouvement.type === 'SORTIE' 
                  ? 'border-red-600 bg-red-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <ArrowDownCircle className={`w-5 h-5 mb-1 ${
                formMouvement.type === 'SORTIE' ? 'text-red-600' : 'text-gray-600'
              }`} />
              <p className="font-bold text-sm">Sortie</p>
            </button>
            <button
              onClick={() => setFormMouvement({...formMouvement, type: 'AJUSTEMENT'})}
              className={`p-3 border-2 rounded-lg text-left ${
                formMouvement.type === 'AJUSTEMENT' 
                  ? 'border-blue-600 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Settings className={`w-5 h-5 mb-1 ${
                formMouvement.type === 'AJUSTEMENT' ? 'text-blue-600' : 'text-gray-600'
              }`} />
              <p className="font-bold text-sm">Ajustement</p>
            </button>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quantité *
          </label>
          <input
            type="number"
            min="0"
            value={formMouvement.quantite}
            onChange={(e) => setFormMouvement({...formMouvement, quantite: e.target.value})}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg font-bold"
            placeholder={formMouvement.type === 'AJUSTEMENT' ? 'Nouvelle quantité' : 'Quantité'}
          />
          {formMouvement.type !== 'AJUSTEMENT' && formMouvement.quantite > 0 && (
            <p className="text-sm text-gray-600 mt-2">
              Nouveau stock: {
                formMouvement.type === 'ENTREE' 
                  ? article.quantiteStock + parseInt(formMouvement.quantite)
                  : article.quantiteStock - parseInt(formMouvement.quantite)
              }
            </p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Motif *
          </label>
          <input
            type="text"
            value={formMouvement.motif}
            onChange={(e) => setFormMouvement({...formMouvement, motif: e.target.value})}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="Ex: Réception commande, OR-2024-001, Inventaire..."
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Référence (optionnel)
          </label>
          <input
            type="text"
            value={formMouvement.reference}
            onChange={(e) => setFormMouvement({...formMouvement, reference: e.target.value})}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="Ex: BC-2024-089, OR-2024-001..."
          />
        </div>
      </div>
      
      <div className="flex gap-3 mt-6">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Annuler
        </button>
        <button
          onClick={onSave}
          disabled={!formMouvement.quantite || !formMouvement.motif}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          Enregistrer
        </button>
      </div>
    </div>
  </div>
);

export default GestionStock;

