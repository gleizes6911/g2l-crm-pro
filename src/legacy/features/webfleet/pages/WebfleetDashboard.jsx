/**
 * Page principale WEBFLEET — session RH / Flotte.
 * @module features/webfleet/pages/WebfleetDashboard
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Truck, Radio, PauseCircle, Activity, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useVehicles } from '../hooks/useVehicles.js';
import { VehicleMap } from '../components/VehicleMap.jsx';
import { VehicleList } from '../components/VehicleList.jsx';
import { VehicleDetailPanel } from '../components/VehicleDetailPanel.jsx';
import { TripHistory } from '../components/TripHistory.jsx';
import { WebfleetAlerts } from '../components/WebfleetAlerts.jsx';
import API_BASE from '../../../config/api';
/**
 * @returns {JSX.Element}
 */
export default function WebfleetDashboard() {
  const { data: vehicles = [], isLoading, isFetching, dataUpdatedAt, movingCount, stoppedCount } = useVehicles();
  const total = vehicles.length;
  const [selectedObjectno, setSelectedObjectno] = useState(null);
  const [mapFlyKey, setMapFlyKey] = useState(0);
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [tripMapData, setTripMapData] = useState(null);
  const [hoveredTripId, setHoveredTripId] = useState(null);
  const [activeTripId, setActiveTripId] = useState(null);

  const selectedVehicle =
    selectedObjectno != null ? vehicles.find((v) => v.objectno === selectedObjectno) ?? null : null;

  /**
   * 3 états mutuellement exclusifs de la carte:
   * - all_live      : aucun véhicule sélectionné + pas de trajets chargés
   * - selected_live : véhicule sélectionné en liste, position temps réel uniquement
   * - history_day   : trajets du jour chargés depuis TripHistory
   */
  const mapDisplayState = useMemo(() => {
    if (Array.isArray(tripMapData?.segments) && tripMapData.segments.length > 0) return 'history_day';
    return 'all_live';
  }, [tripMapData]);

  useEffect(() => {
    console.log('tripMapData mis à jour:', tripMapData?.segments?.length ?? 0);
  }, [tripMapData]);

  const handleVehicleSelect = (vehicleOrObjectno) => {
    const objectno =
      typeof vehicleOrObjectno === 'string'
        ? vehicleOrObjectno
        : vehicleOrObjectno?.objectno || null;
    if (!objectno) {
      setSelectedObjectno(null);
      setHoveredTripId(null);
      setActiveTripId(null);
      return;
    }
    setSelectedObjectno(objectno);
    setMapFlyKey((k) => k + 1);
    setHoveredTripId(null);
    setActiveTripId(null);
  };

  const statusQ = useQuery({
    queryKey: ['webfleet-status'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/webfleet/status`);
      if (!res.ok) throw new Error('status');
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const kmTodayQ = useQuery({
    queryKey: ['webfleet-today-km'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/webfleet/stats/today-km`);
      if (!res.ok) return { km: 0 };
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const connected = Boolean(statusQ.data?.connected && statusQ.data?.apiConfigured);

  const selectedTripsQ = useQuery({
    queryKey: ['webfleet-selected-vehicle-trips', selectedVehicle?.objectno || null],
    enabled: Boolean(selectedVehicle?.objectno),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/webfleet/trips/vehicle/${selectedVehicle.objectno}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      const j = await res.json();
      return Array.isArray(j.data) ? j.data : [];
    },
    refetchInterval: 60_000,
  });

  const selectedTodayTripStats = useMemo(() => {
    const list = selectedTripsQ.data || [];
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();
    const todayTrips = list.filter((t) => {
      if (!t?.start_time) return false;
      const d = new Date(t.start_time);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === todayY && d.getMonth() === todayM && d.getDate() === todayD;
    });
    const distanceKm = todayTrips.reduce((s, t) => s + (Number(t.distance_m) || 0) / 1000, 0);
    const durationSec = todayTrips.reduce((s, t) => s + (Number(t.duration_s) || 0), 0);
    return { count: todayTrips.length, distanceKm, durationSec };
  }, [selectedTripsQ.data]);

  const selectedStatus = selectedVehicle ? vehicleStatusLabel(selectedVehicle) : '';
  const selectedSpeed = selectedVehicle?.speed != null ? `${selectedVehicle.speed} km/h` : '—';

  const kpiCards = selectedVehicle
    ? [
        {
          key: 'name',
          icon: <Truck className="h-6 w-6 text-indigo-600" />,
          label: 'Total véhicules',
          value: selectedVehicle.objectname || selectedVehicle.objectno || '—',
        },
        {
          key: 'status',
          icon: <Activity className="h-6 w-6 text-emerald-600" />,
          label: 'En route',
          value: selectedStatus,
        },
        {
          key: 'speed',
          icon: <PauseCircle className="h-6 w-6 text-amber-600" />,
          label: "À l'arrêt (moteur ON)",
          value: selectedSpeed,
        },
        {
          key: 'today-km',
          icon: <Radio className="h-6 w-6 text-blue-600" />,
          label: "Km aujourd'hui",
          value: `${selectedTodayTripStats.distanceKm.toFixed(1)} km`,
        },
      ]
    : [
        {
          key: 'total',
          icon: <Truck className="h-6 w-6 text-indigo-600" />,
          label: 'Total véhicules',
          value: String(total),
        },
        {
          key: 'moving',
          icon: <Activity className="h-6 w-6 text-emerald-600" />,
          label: 'En route',
          value: String(movingCount),
        },
        {
          key: 'stopped',
          icon: <PauseCircle className="h-6 w-6 text-amber-600" />,
          label: "À l'arrêt (moteur ON)",
          value: String(stoppedCount),
        },
        {
          key: 'global-km',
          icon: <Radio className="h-6 w-6 text-blue-600" />,
          label: "Km aujourd'hui",
          value: kmTodayQ.data?.km != null ? `${Number(kmTodayQ.data.km).toFixed(1)} km` : '—',
        },
      ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Webfleet.connect</h1>
            <p className="text-sm text-slate-600">Flotte en temps quasi réel (module v1.74.0)</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
            <span
              className={`h-3 w-3 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
              aria-hidden
            />
            <span className="font-medium text-slate-800">
              API Webfleet : {connected ? 'Connecté' : 'Déconnecté'}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((card) => (
            <KpiCard
              key={card.key}
              icon={card.icon}
              label={card.label}
              value={card.value}
              clickable={Boolean(selectedVehicle)}
              onClick={selectedVehicle ? () => setKpiModalOpen(true) : undefined}
            />
          ))}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-3 lg:w-[60%]">
            {selectedVehicle && (
              <VehicleDetailPanel
                vehicle={selectedVehicle}
                onClose={() => setSelectedObjectno(null)}
              />
            )}
            <VehicleMap
              vehicles={vehicles}
              selectedObjectno={selectedObjectno}
              isLoading={isLoading || isFetching}
              flyKey={mapFlyKey}
              tripMapData={tripMapData}
              mapDisplayState={mapDisplayState}
              hoveredTripId={hoveredTripId}
              activeTripId={activeTripId}
              onTripClick={(tripid) => setActiveTripId(String(tripid))}
              onVehicleSelect={handleVehicleSelect}
            />
          </div>
          <div className="lg:w-[40%] lg:min-w-0">
            {selectedVehicle && (
              <button
                type="button"
                onClick={() => handleVehicleSelect(null)}
                className="mb-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                ✕ Désélectionner
              </button>
            )}
            <VehicleList
              vehicles={vehicles}
              onVehicleSelect={handleVehicleSelect}
              selectedObjectno={selectedObjectno}
              dataUpdatedAt={dataUpdatedAt}
            />
          </div>
        </div>

        <WebfleetAlerts />

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">Historique des trajets</h2>
          <TripHistory
            onTripsLoaded={(payload) => {
              // ÉTAT 3: TripHistory charge des trajets du jour -> bascule immédiate en mode historique.
              if (!payload || !Array.isArray(payload.trips) || payload.trips.length === 0) {
                setTripMapData(null);
                setHoveredTripId(null);
                setActiveTripId(null);
                return;
              }
              console.log('[WebfleetDashboard] onTripsLoaded payload:', {
                trips: payload.trips.length,
                segments: Array.isArray(payload.segments) ? payload.segments.length : 0,
              });
              setTripMapData(payload);
              setHoveredTripId(null);
              setActiveTripId((prev) => {
                if (!prev) return null;
                return payload?.segments?.some((s) => String(s.tripid) === String(prev)) ? prev : null;
              });
            }}
            hoveredTripId={hoveredTripId}
            activeTripId={activeTripId}
            onTripHover={setHoveredTripId}
            onTripActivate={setActiveTripId}
          />
        </section>
      </div>
      <VehicleKpiModal
        open={kpiModalOpen && Boolean(selectedVehicle)}
        vehicle={selectedVehicle}
        todayStats={selectedTodayTripStats}
        tripsLoading={selectedTripsQ.isFetching}
        onClose={() => setKpiModalOpen(false)}
      />
    </div>
  );
}

/**
 * @param {{ icon: React.ReactNode, label: string, value: string, clickable?: boolean, onClick?: () => void }} props
 * @returns {JSX.Element}
 */
function KpiCard({ icon, label, value, clickable = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm ${
        clickable ? 'transition hover:border-indigo-300 hover:shadow-md' : 'cursor-default'
      }`}
      disabled={!clickable}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-50 p-2">{icon}</div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
        </div>
      </div>
    </button>
  );
}

function vehicleStatusLabel(v) {
  const ign = Number(v?.ignition);
  const st = Number(v?.standstill);
  if (ign === 1 && st === 0) return 'En route';
  if (ign === 1 && st === 1) return "À l'arrêt";
  return 'Moteur coupé';
}

function formatDurationSec(total) {
  const n = Math.max(0, Number(total) || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function VehicleKpiModal({ open, vehicle, todayStats, tripsLoading, onClose }) {
  if (!open || !vehicle) return null;
  const pos = vehicle.pos_time ? new Date(vehicle.pos_time) : null;
  const posOk = pos && !Number.isNaN(pos.getTime());
  const lat = vehicle.latitude != null ? Number(vehicle.latitude) : null;
  const lng = vehicle.longitude != null ? Number(vehicle.longitude) : null;
  const coords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : '—';
  const phone = vehicle.driverphone || vehicle.driver_phone || vehicle.phone || null;

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-lg font-bold text-slate-900">Détail véhicule</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Fermer">
            <X className="h-5 w-5 text-slate-700" />
          </button>
        </div>
        <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
          <Info label="Immatriculation / nom">{vehicle.objectname || '—'}</Info>
          <Info label="Numéro objet">{vehicle.objectno || '—'}</Info>
          <Info label="Conducteur">
            {vehicle.drivername || vehicle.driver || '—'}
            {phone ? ` (${phone})` : ''}
          </Info>
          <Info label="Statut détaillé">{vehicleStatusLabel(vehicle)}</Info>
          <Info label="Vitesse / cap">
            {vehicle.speed != null ? `${vehicle.speed} km/h` : '—'} / {vehicle.course ?? vehicle.direction ?? '—'}
          </Info>
          <Info label="Dernière position">
            {posOk ? format(pos, 'dd/MM/yyyy HH:mm:ss', { locale: fr }) : '—'}
          </Info>
          <Info label="Position complète" wide>
            {vehicle.postext || '—'}
            <div className="font-mono text-xs text-slate-600">{coords}</div>
          </Info>
          <Info label="Kilométrage total">
            {vehicle.odometer_km != null
              ? `${Number(vehicle.odometer_km).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
              : '—'}
          </Info>
          <Info label="Niveau carburant">
            {vehicle.fuellevel_pct != null
              ? `${Number(vehicle.fuellevel_pct).toFixed(1)} %`
              : vehicle.fuellevel != null
                ? String(vehicle.fuellevel)
                : '—'}
          </Info>
          <Info label="Trajets du jour">
            {tripsLoading
              ? 'Chargement...'
              : `${todayStats.count} trajet(s), ${todayStats.distanceKm.toFixed(1)} km, ${formatDurationSec(todayStats.durationSec)}`}
          </Info>
        </div>
      </div>
    </div>
  );
}

function Info({ label, children, wide = false }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{children}</div>
    </div>
  );
}
