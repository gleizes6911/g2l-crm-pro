import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Calendar, ChevronLeft, ChevronRight, User, Wrench,
  Clock, AlertTriangle, Plus
} from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import API_BASE from '../../config/api';

const PlanningGarage = () => {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [planning, setPlanning] = useState([]);
  const [mecaniciens, setMecaniciens] = useState([]);
  const [ordres, setOrdres] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [ponts] = useState([
    { id: 'PONT-1', nom: 'Pont élévateur 1', type: 'ELEVATEUR' },
    { id: 'PONT-2', nom: 'Pont élévateur 2', type: 'ELEVATEUR' },
    { id: 'PONT-3', nom: 'Zone carrosserie', type: 'CARROSSERIE' },
    { id: 'ZONE-1', nom: 'Zone diagnostic', type: 'DIAGNOSTIC' }
  ]);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
      const endDate = addDays(startDate, 6);
      
      const [planningRes, mecaniciensRes, ordresRes] = await Promise.all([
        fetch(`${API_BASE}/api/parc/planning?dateDebut=${startDate.toISOString()}&dateFin=${endDate.toISOString()}`),
        fetch(`${API_BASE}/api/parc/mecaniciens`),
        fetch(`${API_BASE}/api/parc/ordres-reparation`) // Récupérer tous les OR pour le planning
      ]);
      
      const planningData = await planningRes.json();
      const mecaniciensData = await mecaniciensRes.json();
      const ordresData = await ordresRes.json();
      
      setPlanning(planningData);
      setMecaniciens(mecaniciensData);
      setOrdres(ordresData);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const getWeekDays = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const getPlanningForDay = (date, mecanicienId) => {
    // D'abord les entrées du planning
    const planningEntries = planning.filter(p => 
      p.dateDebut && isSameDay(new Date(p.dateDebut), date) && 
      p.mecanicienId === mecanicienId
    );
    
    // Ensuite les OR qui ont une date de début mais pas d'entrée planning
    const ordresWithDate = ordres.filter(or => 
      or.dateDebut && 
      isSameDay(new Date(or.dateDebut), date) && 
      or.mecanicienId === mecanicienId &&
      !planningEntries.some(p => p.ordreReparationId === or.id)
    ).map(or => ({
      id: 'OR-PLAN-' + or.id,
      ordreReparationId: or.id,
      vehiculeImmat: or.vehiculeImmat,
      mecanicienId: or.mecanicienId,
      mecanicienNom: or.mecanicienNom,
      dateDebut: or.dateDebut,
      dateFin: or.dateEstimee,
      dureeEstimee: or.mainOeuvre?.reduce((sum, mo) => sum + (mo.tempsEstime || 0), 0) || 0,
      statut: or.statut,
      type: or.natureIntervention,
      priorite: or.priorite
    }));
    
    return [...planningEntries, ...ordresWithDate];
  };

  const getPriorityColor = (priorite) => {
    const colors = {
      'URGENTE': 'bg-red-100 border-red-500 text-red-800',
      'HAUTE': 'bg-orange-100 border-orange-500 text-orange-800',
      'NORMALE': 'bg-blue-100 border-blue-500 text-blue-800',
      'BASSE': 'bg-gray-100 border-gray-500 text-gray-800'
    };
    return colors[priorite] || colors['NORMALE'];
  };

  const weekDays = getWeekDays();

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
              <Calendar className="w-8 h-8 text-purple-600" />
              Planning Garage
            </h1>
            <p className="text-gray-600 mt-1">Vue hebdomadaire des interventions</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentDate(addDays(currentDate, -7))}
              className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="text-center min-w-[200px]">
              <p className="text-lg font-bold text-gray-900">
                {format(weekDays[0], 'd MMM', { locale: fr })} - {format(weekDays[6], 'd MMM yyyy', { locale: fr })}
              </p>
              <p className="text-sm text-gray-600">
                Semaine {format(currentDate, 'w', { locale: fr })}
              </p>
            </div>
            
            <button
              onClick={() => setCurrentDate(addDays(currentDate, 7))}
              className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Aujourd'hui
            </button>
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
        <div className="flex items-center gap-6">
          <p className="text-sm font-medium text-gray-700">Légende :</p>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-sm text-gray-600">Urgente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-sm text-gray-600">Haute</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-sm text-gray-600">Normale</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-500 rounded"></div>
            <span className="text-sm text-gray-600">Basse</span>
          </div>
        </div>
      </div>

      {/* Planning */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-3 text-left sticky left-0 bg-gray-50 z-10 min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">Mécanicien</span>
                  </div>
                </th>
                {weekDays.map(day => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <th 
                      key={day.toISOString()} 
                      className={`border border-gray-200 px-4 py-3 min-w-[180px] ${
                        isToday ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="text-center">
                        <p className={`text-sm font-medium ${
                          isToday ? 'text-blue-600' : 'text-gray-700'
                        }`}>
                          {format(day, 'EEEE', { locale: fr })}
                        </p>
                        <p className={`text-xs ${
                          isToday ? 'text-blue-600 font-bold' : 'text-gray-500'
                        }`}>
                          {format(day, 'd MMM', { locale: fr })}
                        </p>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {mecaniciens.map(mecanicien => (
                <tr key={mecanicien.id} className="hover:bg-gray-50">
                  <td className="border border-gray-200 px-4 py-3 sticky left-0 bg-white z-10">
                    <div>
                      <p className="font-medium text-gray-900">
                        {mecanicien.prenom} {mecanicien.nom}
                      </p>
                      <p className="text-xs text-gray-500">{mecanicien.type}</p>
                    </div>
                  </td>
                  {weekDays.map(day => {
                    const interventions = getPlanningForDay(day, mecanicien.id);
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <td 
                        key={day.toISOString()} 
                        className={`border border-gray-200 p-2 align-top ${
                          isToday ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="space-y-2">
                          {interventions.map(intervention => (
                              <div
                                key={intervention.id}
                                className={`p-2 rounded-lg border-l-4 ${getPriorityColor(intervention.priorite)} cursor-pointer hover:shadow-md transition-shadow`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">
                                      {intervention.vehiculeImmat}
                                    </p>
                                    <p className="text-xs text-gray-600 truncate mt-0.5">
                                      {intervention.type}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                      <Clock className="w-3 h-3" />
                                      <span>{intervention.dureeEstimee || 0}h</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {intervention.statut}
                                    </p>
                                  </div>
                                  {intervention.priorite === 'URGENTE' && (
                                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                  )}
                                </div>
                              </div>
                            ))}
                          
                          {interventions.length === 0 && (
                            <div className="text-center py-4 text-gray-400">
                              <p className="text-xs">Libre</p>
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <QuickStat
          label="Interventions semaine"
          value={planning.length}
          color="blue"
        />
        <QuickStat
          label="En cours"
          value={planning.filter(p => p.statut === 'EN_COURS').length}
          color="green"
        />
        <QuickStat
          label="Urgentes"
          value={planning.filter(p => p.priorite === 'URGENTE').length}
          color="red"
        />
        <QuickStat
          label="Heures prévues"
          value={planning.reduce((sum, p) => sum + (p.dureeEstimee || 0), 0)}
          color="purple"
        />
      </div>
    </div>
  );
};

const QuickStat = ({ label, value, color }) => (
  <div className={`bg-white rounded-lg shadow p-4 border-l-4 border-${color}-500`}>
    <p className="text-xs text-gray-600">{label}</p>
    <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{value}</p>
  </div>
);

export default PlanningGarage;

