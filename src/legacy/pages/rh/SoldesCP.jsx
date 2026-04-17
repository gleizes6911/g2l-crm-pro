import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Download, AlertCircle, TrendingUp, Users } from 'lucide-react';
import API_BASE from '../../config/api';
const SoldesCP = () => {
  const { user } = useAuth();
  const [soldes, setSoldes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreSociete, setFiltreSociete] = useState('Toutes');
  const [filtreAlerte, setFiltreAlerte] = useState('Tous');
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    fetchSoldes();
  }, []);

  const fetchSoldes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/soldes-cp`);
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const data = await response.json();
      setSoldes(data || []);
      setLoading(false);
    } catch (err) {
      console.error('Erreur récupération soldes CP:', err);
      setLoading(false);
    }
  };

  // Filtrer les soldes selon le rôle
  const soldesFiltres = soldes
    .filter(s => {
      if (!user) return false;
      
      if (user.role === 'RH' || user.role === 'MANAGER') {
        // RH et MANAGER voient tout
        return true;
      } else if (user.role === 'EMPLOYE') {
        // Employé voit uniquement lui-même
        return s.employeId === user.salesforceId;
      }
      return false;
    })
    .filter(s => !recherche || s.nomComplet.toLowerCase().includes(recherche.toLowerCase()))
    .filter(s => filtreSociete === 'Toutes' || s.societe === filtreSociete)
    .filter(s => {
      if (filtreAlerte === 'Tous') return true;
      if (filtreAlerte === 'NEGATIF') return s.alerte === 'NEGATIF';
      if (filtreAlerte === 'FAIBLE') return s.alerte === 'FAIBLE';
      return !s.alerte;
    })
    .sort((a, b) => a.soldeTotal - b.soldeTotal);

  // Calculer les stats globales
  const stats = {
    total: soldes.length,
    negatifs: soldes.filter(s => s.alerte === 'NEGATIF').length,
    faibles: soldes.filter(s => s.alerte === 'FAIBLE').length,
    soldeMoyen: soldes.length > 0 
      ? Math.round(soldes.reduce((sum, s) => sum + s.soldeTotal, 0) / soldes.length)
      : 0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des soldes CP...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-600" />
          Soldes Congés Payés
        </h1>
        <p className="text-gray-600 mt-2">
          Calcul conforme à la législation française (période 01/06/N-1 au 31/05/N)
        </p>
      </div>

      {/* Stats */}
      {user && user.role === 'EMPLOYE' && soldesFiltres.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Jours acquis</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{soldesFiltres[0]?.joursAcquisTotal || 0}j</p>
              </div>
              <TrendingUp className="w-12 h-12 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Report N-1</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{soldesFiltres[0]?.reportN1 || 0}j</p>
              </div>
              <Calendar className="w-12 h-12 text-purple-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Solde disponible</p>
                <p className={`text-3xl font-bold mt-1 ${
                  soldesFiltres[0]?.alerte === 'NEGATIF' ? 'text-red-800' :
                  soldesFiltres[0]?.alerte === 'FAIBLE' ? 'text-orange-800' :
                  'text-green-800'
                }`}>
                  {soldesFiltres[0]?.soldeTotal || 0}j
                </p>
              </div>
              <TrendingDown className="w-12 h-12 text-blue-500" />
            </div>
          </div>
        </div>
      ) : user && (user.role === 'RH' || user.role === 'MANAGER') ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total employés</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <Users className="w-12 h-12 text-purple-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Soldes négatifs</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.negatifs}</p>
                </div>
                <AlertCircle className="w-12 h-12 text-red-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Soldes faibles (&lt;5j)</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.faibles}</p>
                </div>
                <TrendingUp className="w-12 h-12 text-orange-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Solde moyen</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.soldeMoyen}j</p>
                </div>
                <Calendar className="w-12 h-12 text-green-500" />
              </div>
            </div>
          </div>

          {/* Filtres */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un employé..."
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={filtreSociete}
                onChange={(e) => setFiltreSociete(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="Toutes">Toutes les sociétés</option>
                {[...new Set(soldes.map(s => s.societe).filter(Boolean))].sort().map(soc => (
                  <option key={soc} value={soc}>{soc}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : null}

      {/* Tableau */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employé</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Société</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date entrée</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acquis N-1</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Report N-1</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acquis N</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Solde N</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {soldesFiltres.map(solde => (
                <tr key={solde.employeId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {solde.nomComplet}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {solde.societe}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 text-center">
                    {new Date(solde.dateEntree).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="text-gray-500">{solde.joursAcquisN1}j</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="font-semibold text-purple-700">{solde.reportN1}j</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="font-semibold text-green-700">{solde.joursAcquisN}j</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="font-semibold text-blue-700">{solde.soldeN}j</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className={`px-3 py-1 rounded-full font-bold text-lg ${
                      solde.alerte === 'NEGATIF' ? 'bg-red-100 text-red-800' :
                      solde.alerte === 'FAIBLE' ? 'bg-orange-100 text-orange-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {solde.soldeTotal}j
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {soldesFiltres.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucun solde trouvé avec ces critères</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SoldesCP;

