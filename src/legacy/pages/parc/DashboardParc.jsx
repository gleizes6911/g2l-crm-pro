import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Wrench, Package, Users, TrendingUp, AlertTriangle, 
  CheckCircle, Clock, DollarSign, Calendar, FileText,
  Settings, Car, ShoppingCart, ClipboardList, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { exportRapportMensuelParc } from '../../utils/exportServiceParc';
import API_BASE from '../../config/api';

const DashboardParc = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [ordresUrgents, setOrdresUrgents] = useState([]);
  const [alertesStock, setAlertesStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [statsRes, ordresRes, alertesRes] = await Promise.all([
        fetch(`${API_BASE}/api/parc/statistiques`),
        fetch(`${API_BASE}/api/parc/ordres-reparation?priorite=URGENTE`),
        fetch(`${API_BASE}/api/parc/stock/alertes`)
      ]);
      
      const statsData = await statsRes.json();
      const ordresData = await ordresRes.json();
      const alertesData = await alertesRes.json();
      
      setStats(statsData);
      setOrdresUrgents(ordresData.filter(o => o.statut !== 'TERMINE'));
      setAlertesStock(alertesData);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Erreur lors du chargement des données</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Réessayer
          </button>
        </div>
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
              <Car className="w-8 h-8 text-blue-600" />
              Gestion du Parc Automobile
            </h1>
            <p className="text-gray-600 mt-1">Tableau de bord et pilotage garage</p>
          </div>
          <button
            onClick={() => exportRapportMensuelParc(
              stats,
              ordresUrgents,
              format(new Date(), 'MMMM yyyy', { locale: fr })
            )}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Rapport mensuel Excel
          </button>
        </div>
      </div>

      {/* KPIs Principaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={<Wrench className="w-6 h-6 text-blue-600" />}
          label="Ordres en cours"
          value={stats.ordresReparation.enCours}
          color="blue"
          subText={`${stats.ordresReparation.enAttente} en attente`}
        />
        <KPICard
          icon={<AlertTriangle className="w-6 h-6 text-orange-600" />}
          label="Interventions urgentes"
          value={stats.ordresReparation.urgents}
          color="orange"
          urgent={stats.ordresReparation.urgents > 0}
        />
        <KPICard
          icon={<Package className="w-6 h-6 text-red-600" />}
          label="Alertes stock"
          value={stats.stock.alertes}
          color="red"
          subText={`${stats.stock.ruptures} ruptures`}
          urgent={stats.stock.ruptures > 0}
        />
        <KPICard
          icon={<DollarSign className="w-6 h-6 text-green-600" />}
          label="Coûts mois"
          value={`${Math.round(stats.coutsMois.total)}€`}
          color="green"
          subText={`${Math.round(stats.coutsAnnee.total)}€ année`}
        />
      </div>

      {/* Stats détaillées */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Ordres de réparation */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            Ordres de réparation
          </h2>
          <div className="space-y-3">
            <StatRow
              label="Total"
              value={stats.ordresReparation.total}
              icon={<FileText className="w-4 h-4 text-gray-600" />}
            />
            <StatRow
              label="En cours"
              value={stats.ordresReparation.enCours}
              icon={<Clock className="w-4 h-4 text-blue-600" />}
              color="blue"
            />
            <StatRow
              label="En attente"
              value={stats.ordresReparation.enAttente}
              icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
              color="orange"
            />
            <StatRow
              label="Terminés"
              value={stats.ordresReparation.termines}
              icon={<CheckCircle className="w-4 h-4 text-green-600" />}
              color="green"
            />
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interne</span>
              <span className="font-bold text-blue-600">{stats.repartitionType.interne}</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-gray-600">Externe</span>
              <span className="font-bold text-purple-600">{stats.repartitionType.externe}</span>
            </div>
          </div>
        </div>

        {/* Stock */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-green-600" />
            Stock
          </h2>
          <div className="space-y-3">
            <StatRow
              label="Articles"
              value={stats.stock.totalArticles}
              icon={<Package className="w-4 h-4 text-gray-600" />}
            />
            <StatRow
              label="Valeur stock"
              value={`${Math.round(stats.stock.valeurTotale)}€`}
              icon={<DollarSign className="w-4 h-4 text-green-600" />}
              color="green"
            />
            <StatRow
              label="Alertes stock"
              value={stats.stock.alertes}
              icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
              color="orange"
            />
            <StatRow
              label="Ruptures"
              value={stats.stock.ruptures}
              icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
              color="red"
            />
          </div>
        </div>

        {/* Coûts */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-600" />
            Coûts ce mois
          </h2>
          <div className="space-y-3">
            <StatRow
              label="Pièces"
              value={`${Math.round(stats.coutsMois.pieces)}€`}
              icon={<Package className="w-4 h-4 text-blue-600" />}
              color="blue"
            />
            <StatRow
              label="Main d'œuvre"
              value={`${Math.round(stats.coutsMois.mainOeuvre)}€`}
              icon={<Users className="w-4 h-4 text-indigo-600" />}
              color="indigo"
            />
            <StatRow
              label="Total HT"
              value={`${Math.round(stats.coutsMois.total)}€`}
              icon={<TrendingUp className="w-4 h-4 text-purple-600" />}
              color="purple"
            />
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Année en cours</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-purple-600">
                {Math.round(stats.coutsAnnee.total).toLocaleString()}€
              </p>
              <span className="text-sm text-gray-500">HT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alertes importantes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ordres urgents */}
        {ordresUrgents.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Interventions urgentes ({ordresUrgents.length})
            </h2>
            <div className="space-y-3">
              {ordresUrgents.slice(0, 5).map(ordre => (
                <div 
                  key={ordre.id}
                  className="p-3 bg-orange-50 border-l-4 border-orange-500 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{ordre.vehiculeImmat}</p>
                      <p className="text-sm text-gray-600 mt-1">{ordre.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(ordre.dateCreation).toLocaleDateString('fr-FR')}
                        </span>
                        {ordre.mecanicienNom && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {ordre.mecanicienNom}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      ordre.statut === 'EN_COURS' ? 'bg-blue-100 text-blue-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {ordre.statut === 'EN_COURS' ? 'En cours' : 'En attente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alertes stock */}
        {alertesStock.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-red-600" />
              Alertes stock ({alertesStock.length})
            </h2>
            <div className="space-y-3">
              {alertesStock.slice(0, 5).map(article => (
                <div 
                  key={article.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    article.niveau === 'CRITIQUE' 
                      ? 'bg-red-50 border-red-500' 
                      : article.niveau === 'URGENT'
                        ? 'bg-orange-50 border-orange-500'
                        : 'bg-yellow-50 border-yellow-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{article.designation}</p>
                      <p className="text-xs text-gray-600 mt-1">Réf: {article.reference}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className={`font-bold ${
                          article.quantiteStock === 0 ? 'text-red-600' : 'text-orange-600'
                        }`}>
                          Stock: {article.quantiteStock}
                        </span>
                        <span className="text-gray-500">
                          Min: {article.quantiteMin}
                        </span>
                        {article.fournisseurPrincipal && (
                          <span className="text-gray-500">
                            {article.fournisseurPrincipal}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      article.niveau === 'CRITIQUE' 
                        ? 'bg-red-100 text-red-800' 
                        : article.niveau === 'URGENT'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {article.niveau}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// COMPOSANTS

const KPICard = ({ icon, label, value, color, subText, urgent }) => (
  <div className={`bg-white rounded-xl shadow-lg p-4 border-l-4 border-${color}-500 ${
    urgent ? 'ring-2 ring-orange-500 animate-pulse' : ''
  }`}>
    <div className="flex items-center justify-between mb-2">
      {icon}
    </div>
    <p className="text-xs text-gray-600">{label}</p>
    <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{value}</p>
    {subText && (
      <p className="text-xs text-gray-500 mt-1">{subText}</p>
    )}
  </div>
);

const StatRow = ({ label, value, icon, color = 'gray' }) => (
  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-sm text-gray-700">{label}</span>
    </div>
    <span className={`font-bold text-${color}-600`}>{value}</span>
  </div>
);

export default DashboardParc;

