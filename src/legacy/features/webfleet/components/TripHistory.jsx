/**
 * Historique trajets orienté véhicule + jour.
 * @module features/webfleet/components/TripHistory
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { useVehicles } from '../hooks/useVehicles.js';
import API_BASE from '../../../config/api';

/**
 * @param {number|string|null|undefined} sec
 * @returns {string}
 */
function fmtDuration(sec) {
  const n = Math.max(0, parseInt(String(sec), 10) || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
/**
 * @param {{ trip: object, onClose: () => void }} props
 * @returns {JSX.Element}
 */
function TripDetailModal({ trip, onClose }) {
  const [isSatellite, setIsSatellite] = useState(false);
  if (!trip) return null;
  const sLat = trip.start_lat != null ? Number(trip.start_lat) : null;
  const sLng = trip.start_lng != null ? Number(trip.start_lng) : null;
  const eLat = trip.end_lat != null ? Number(trip.end_lat) : null;
  const eLng = trip.end_lng != null ? Number(trip.end_lng) : null;
  const hasLine =
    sLat != null &&
    sLng != null &&
    eLat != null &&
    eLng != null &&
    !Number.isNaN(sLat) &&
    !Number.isNaN(eLat);
  const mid = hasLine ? [(sLat + eLat) / 2, (sLng + eLng) / 2] : [46.5, 2.5];

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-xl"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-lg font-bold text-slate-900">
            Trajet #{trip.tripid} — {trip.objectname || trip.objectno}
          </h3>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium hover:bg-slate-200"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
        <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
          <div>
            <span className="text-slate-500">Conducteur</span>
            <div className="font-medium">{trip.drivername || '—'}</div>
          </div>
          <div>
            <span className="text-slate-500">Mode trajet</span>
            <div className="font-medium">{trip.tripmode ?? '—'}</div>
          </div>
          <div>
            <span className="text-slate-500">Départ</span>
            <div className="font-medium">
              {trip.start_time
                ? format(new Date(trip.start_time), 'dd/MM/yyyy HH:mm', { locale: fr })
                : '—'}
            </div>
            <div className="text-xs text-slate-600">{trip.start_postext || ''}</div>
          </div>
          <div>
            <span className="text-slate-500">Arrivée</span>
            <div className="font-medium">
              {trip.end_time
                ? format(new Date(trip.end_time), 'dd/MM/yyyy HH:mm', { locale: fr })
                : '—'}
            </div>
            <div className="text-xs text-slate-600">{trip.end_postext || ''}</div>
          </div>
          <div>
            <span className="text-slate-500">Distance</span>
            <div className="font-medium">
              {trip.distance_km != null ? `${Number(trip.distance_km).toFixed(2)} km` : '—'}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Durée / Idle</span>
            <div className="font-medium">
              {fmtDuration(trip.duration_s)} / {fmtDuration(trip.idle_time_s)}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Vitesses moy / max</span>
            <div className="font-medium">
              {trip.avg_speed ?? '—'} / {trip.max_speed ?? '—'} km/h
            </div>
          </div>
          <div>
            <span className="text-slate-500">Carburant / CO₂</span>
            <div className="font-medium">
              {trip.fuel_usage != null ? `${trip.fuel_usage} L` : '—'} ·{' '}
              {trip.co2 != null ? `${trip.co2} g` : '—'}
            </div>
          </div>
        </div>
        <div className="h-[220px] w-full border-t border-slate-100">
          {hasLine ? (
            <div className="relative h-full w-full">
              <button
                type="button"
                className="absolute right-2 top-2 z-[500] rounded-full bg-white px-3 py-1.5 text-sm shadow-md hover:bg-slate-50"
                onClick={() => setIsSatellite((v) => !v)}
                title={isSatellite ? 'Basculer en vue standard' : 'Basculer en vue satellite'}
              >
                {isSatellite ? '🛰️' : '🗺️'}
              </button>
              <MapContainer center={mid} zoom={10} className="h-full w-full" scrollWheelZoom>
                {isSatellite ? (
                  <TileLayer
                    attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                ) : (
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}
                <Polyline positions={[[sLat, sLng], [eLat, eLng]]} pathOptions={{ color: '#2563eb', weight: 4 }} />
                <Marker position={[sLat, sLng]}>
                  <Popup>Départ</Popup>
                </Marker>
                <Marker position={[eLat, eLng]}>
                  <Popup>Arrivée</Popup>
                </Marker>
              </MapContainer>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Pas de coordonnées départ/arrivée pour la carte.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *  onTripsLoaded?: (payload: { objectno: string, date: string, trips: object[], segments: any[] } | null) => void,
 *  hoveredTripId?: string|null,
 *  activeTripId?: string|null,
 *  onTripHover?: (tripid: string|null) => void,
 *  onTripActivate?: (tripid: string|null) => void
 * }} props
 * @returns {JSX.Element}
 */
export function TripHistory({
  onTripsLoaded,
  hoveredTripId = null,
  activeTripId = null,
  onTripHover,
  onTripActivate,
}) {
  const { data: vehiclesData } = useVehicles();
  const vehicles = vehiclesData || [];

  const [objectno, setObjectno] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [selectedTrip, setSelectedTrip] = useState(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const queryClient = useQueryClient();

  const tripsQ = useQuery({
    queryKey: ['webfleet-trips-by-vehicle-day', objectno, date],
    enabled: Boolean(objectno),
    queryFn: async () => {
      const qs = new URLSearchParams({ date });
      const res = await fetch(`${API_BASE}/api/webfleet/trips/vehicle/${objectno}?${qs.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      const j = await res.json();
      const list = Array.isArray(j.data) ? j.data : [];
      return [...list].sort(
        (a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime()
      );
    },
  });

  const list = useMemo(() => tripsQ.data || [], [tripsQ.data]);
  const normalizedTrips = useMemo(
    () =>
      list.map((t) => ({
        ...t,
        start_lat: t.start_lat != null ? Number(t.start_lat) : null,
        start_lng: t.start_lng != null ? Number(t.start_lng) : null,
        end_lat: t.end_lat != null ? Number(t.end_lat) : null,
        end_lng: t.end_lng != null ? Number(t.end_lng) : null,
      })),
    [list]
  );

  const daySummary = useMemo(() => {
    const totalDistanceKm = list.reduce((s, t) => s + (Number(t.distance_m) || 0) / 1000, 0);
    const totalDurationSec = list.reduce((s, t) => s + (Number(t.duration_s) || 0), 0);
    const totalFuel = list.reduce((s, t) => s + (Number(t.fuel_usage) || 0), 0);
    const totalCo2 = list.reduce((s, t) => s + (Number(t.co2) || 0), 0);
    return {
      tripCount: list.length,
      totalDistanceKm,
      totalDurationSec,
      totalFuel,
      totalCo2,
    };
  }, [list]);

  useEffect(() => {
    if (!objectno || !date) {
      onTripsLoaded?.(null);
      return;
    }
    const baseSegments = normalizedTrips
      .map((t) => {
        const sla = t.start_lat;
        const slo = t.start_lng;
        const ela = t.end_lat;
        const elo = t.end_lng;
        if ([sla, slo, ela, elo].some((v) => v == null || Number.isNaN(v))) return null;
        return { tripid: String(t.tripid), start: [sla, slo], end: [ela, elo], path: [[sla, slo], [ela, elo]] };
      })
      .filter(Boolean);

    console.log('onTripsLoaded appelé avec', normalizedTrips.length, 'trajets');
    console.log('[TripHistory] segments valides pour la carte:', baseSegments.length);

    onTripsLoaded?.({
      objectno,
      date,
      trips: normalizedTrips,
      segments: baseSegments,
    });
  }, [objectno, date, normalizedTrips, onTripsLoaded]);

  const runTripsSync = async () => {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/webfleet/trips/sync`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setSyncMsg(
        `Sync OK : ${j.inserted ?? 0} nouveau(x) trajet(s) sur ${j.fetched ?? 0} reçu(s) (plage ${j.range_pattern || 'w-1'}).`
      );
      await queryClient.invalidateQueries({ queryKey: ['webfleet-trips'] });
      await queryClient.invalidateQueries({ queryKey: ['webfleet-trips-by-vehicle-day'] });
      await queryClient.invalidateQueries({ queryKey: ['webfleet-today-km'] });
    } catch (e) {
      setSyncMsg(e.message || 'Erreur sync');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Véhicule</label>
          <select
            value={objectno}
            onChange={(e) => {
              setObjectno(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">-- Tous les véhicules --</option>
            {vehicles.map((v) => (
              <option key={v.objectno} value={v.objectno}>
                {v.objectname || v.objectno}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={syncBusy}
          onClick={runTripsSync}
          className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
        >
          {syncBusy ? 'Synchronisation…' : 'Synchroniser trajets (w-1)'}
        </button>
      </div>
      {syncMsg && (
        <p className="mb-2 text-sm text-slate-700" role="status">
          {syncMsg}
        </p>
      )}

      {objectno && (
        <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-5">
          <SummaryCard label="Trajets" value={String(daySummary.tripCount)} />
          <SummaryCard label="Distance totale" value={`${daySummary.totalDistanceKm.toFixed(1)} km`} />
          <SummaryCard label="Durée conduite" value={fmtDuration(daySummary.totalDurationSec)} />
          <SummaryCard label="Carburant total" value={`${daySummary.totalFuel.toFixed(2)} L`} />
          <SummaryCard label="CO2 total" value={`${Math.round(daySummary.totalCo2)} g`} />
        </div>
      )}

      <div className="space-y-3">
        {tripsQ.isLoading && (
          <div className="rounded-lg border border-slate-200 px-3 py-8 text-center text-slate-500">Chargement…</div>
        )}
        {!objectno && (
          <div className="rounded-lg border border-slate-200 px-3 py-8 text-center text-slate-500">
            Sélectionner un véhicule pour afficher ses trajets.
          </div>
        )}
        {!tripsQ.isLoading && objectno && !list.length && (
          <div className="rounded-lg border border-slate-200 px-3 py-8 text-center text-slate-500">
            Aucun trajet pour ce véhicule à cette date.
          </div>
        )}
        {!tripsQ.isLoading &&
          objectno &&
          list.map((t, idx) => (
            <button
              key={t.tripid}
              type="button"
              onMouseEnter={() => onTripHover?.(String(t.tripid))}
              onMouseLeave={() => onTripHover?.(null)}
              onClick={() => {
                onTripActivate?.(String(t.tripid));
                setSelectedTrip(t);
              }}
              className={`w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/30 ${
                String(activeTripId) === String(t.tripid)
                  ? 'border-rose-300 bg-rose-50/40'
                  : String(hoveredTripId) === String(t.tripid)
                    ? 'border-violet-300 bg-violet-50/40'
                    : 'border-slate-200'
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  {format(new Date(t.start_time), 'HH:mm')} → {t.end_time ? format(new Date(t.end_time), 'HH:mm') : '—'}
                </div>
                <div className="text-xs text-slate-500">
                  {Number((Number(t.distance_m) || 0) / 1000).toFixed(2)} km · {fmtDuration(t.duration_s)} · {t.avg_speed ?? '—'}/{t.max_speed ?? '—'} km/h
                </div>
              </div>
              <div className="mb-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                <div title={t.start_postext || ''}>Départ: {shortText(t.start_postext)}</div>
                <div title={t.end_postext || ''}>Arrivée: {shortText(t.end_postext)}</div>
              </div>
              <div className="mb-2 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-indigo-500"
                  style={{ width: `${Math.max(10, Math.min(100, ((idx + 1) / Math.max(1, list.length)) * 100))}%` }}
                />
              </div>
              <div className="text-xs text-slate-500">
                Carburant: {t.fuel_usage != null ? `${Number(t.fuel_usage).toFixed(2)} L` : '—'}
              </div>
            </button>
          ))}
      </div>

      {selectedTrip && <TripDetailModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />}
    </div>
  );
}

function shortText(s) {
  const txt = String(s || '').trim();
  if (!txt) return '—';
  return txt.length > 80 ? `${txt.slice(0, 77)}...` : txt;
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
