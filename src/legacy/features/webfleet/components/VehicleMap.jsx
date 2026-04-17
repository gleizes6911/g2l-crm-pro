/**
 * Carte Leaflet — flotte Webfleet.
 * @module features/webfleet/components/VehicleMap
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * @param {object} v
 * @returns {string}
 */
function markerColor(v) {
  const ign = Number(v.ignition);
  const st = Number(v.standstill);
  if (ign === 1 && st === 0) return '#16a34a';
  if (ign === 1 && st === 1) return '#ca8a04';
  return '#dc2626';
}

/**
 * @param {string} color
 * @returns {L.DivIcon}
 */
function divIcon(color) {
  return L.divIcon({
    className: 'wf-leaflet-div',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const MAP_MODES = {
  STANDARD: 'standard',
  ESRI: 'esri',
  GOOGLE: 'google',
};
const USE_OSRM = true;

function nextMapMode(mode) {
  if (mode === MAP_MODES.STANDARD) return MAP_MODES.ESRI;
  if (mode === MAP_MODES.ESRI) return MAP_MODES.GOOGLE;
  return MAP_MODES.STANDARD;
}

function modeIcon(mode) {
  if (mode === MAP_MODES.STANDARD) return '🗺️';
  if (mode === MAP_MODES.ESRI) return '🛰️';
  return '🌍';
}

function modeTitle(mode) {
  if (mode === MAP_MODES.STANDARD) return 'Passer en satellite Esri';
  if (mode === MAP_MODES.ESRI) return 'Passer en Google Hybride';
  return 'Revenir en vue standard';
}

/**
 * Ajuste la vue (barycentre puis sélection).
 * @param {{ vehicles: object[], selectedObjectno: string|null }} props
 * @returns {null}
 */
function MapViewController({
  vehicles,
  selectedObjectno,
  flyTrigger,
  tripSegments = [],
  tripKey = '',
  mapDisplayState = 'all_live',
}) {
  const map = useMap();
  const didInit = useRef(false);
  const lastFittedKey = useRef('');

  useEffect(() => {
    if (mapDisplayState === 'history_day' && tripSegments.length > 0) {
      const routePts = [];
      for (const s of tripSegments) {
        if (Array.isArray(s?.path) && s.path.length) {
          routePts.push(...s.path);
          continue;
        }
        if (s?.start?.length === 2) routePts.push(s.start);
        if (s?.end?.length === 2) routePts.push(s.end);
      }
      if (routePts.length && tripKey && tripKey !== lastFittedKey.current) {
        map.fitBounds(routePts, { padding: [30, 30] });
        lastFittedKey.current = tripKey;
        return;
      }
    }

    const pts = (vehicles || []).filter((v) => v.latitude != null && v.longitude != null);
    if (!pts.length) return;

    // Priorité au clic liste véhicule: recentrer la vue même en mode historique.
    if (selectedObjectno) {
      const sel = pts.find((p) => p.objectno === selectedObjectno);
      if (sel) {
        map.flyTo([Number(sel.latitude), Number(sel.longitude)], 13, { duration: 0.6 });
        return;
      }
    }

    if (mapDisplayState === 'all_live' && !didInit.current) {
      didInit.current = true;
      const lat = pts.reduce((s, p) => s + Number(p.latitude), 0) / pts.length;
      const lng = pts.reduce((s, p) => s + Number(p.longitude), 0) / pts.length;
      map.setView([lat, lng], 8);
    }
  }, [vehicles, selectedObjectno, map, flyTrigger, tripSegments, mapDisplayState, tripKey]);

  return null;
}

/**
 * Marqueur avec ouverture automatique du popup lorsque le véhicule est sélectionné.
 * @param {{ v: object, isSelected: boolean }} props
 * @returns {JSX.Element}
 */
function VehicleMarker({ v, isSelected, flyKey = 0, onVehicleSelect }) {
  const markerRef = useRef(null);

  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    if (isSelected) {
      const id = requestAnimationFrame(() => {
        try {
          m.openPopup();
        } catch {
          /* carte pas encore prête */
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isSelected, v.objectno, flyKey]);

  if (v.latitude == null || v.longitude == null) return null;
  const pt = [Number(v.latitude), Number(v.longitude)];
  const t = v.pos_time ? new Date(v.pos_time) : null;
  const timeStr =
    t && !Number.isNaN(t.getTime()) ? format(t, 'dd/MM/yyyy HH:mm', { locale: fr }) : '—';

  return (
    <Marker
      ref={markerRef}
      position={pt}
      icon={divIcon(markerColor(v))}
      eventHandlers={{
        click: () => onVehicleSelect?.(v.objectno),
      }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-bold">{v.objectname || v.objectno}</div>
          <div>{v.drivername || '—'}</div>
          <div>Vitesse : {v.speed != null ? `${v.speed} km/h` : '—'}</div>
          <div className="max-w-xs text-xs text-slate-600">{v.postext || '—'}</div>
          <div className="text-xs text-slate-500">{timeStr}</div>
        </div>
      </Popup>
    </Marker>
  );
}

/**
 * @param {{
 *   vehicles: object[],
 *   selectedObjectno?: string|null,
 *   isLoading?: boolean,
 * }} props
 * @returns {JSX.Element}
 */
export function VehicleMap({
  vehicles = [],
  selectedObjectno = null,
  isLoading = false,
  flyKey = 0,
  tripMapData = null,
  mapDisplayState = 'all_live',
  hoveredTripId = null,
  activeTripId = null,
  onTripClick,
  onVehicleSelect,
}) {
  const [mapMode, setMapMode] = useState(MAP_MODES.STANDARD);
  const tripSegments = useMemo(
    () => (Array.isArray(tripMapData?.segments) ? tripMapData.segments : []),
    [tripMapData]
  );
  const tripKey = useMemo(
    () =>
      tripSegments
        .map((t) => String(t?.tripid ?? ''))
        .filter(Boolean)
        .join(','),
    [tripSegments]
  );
  const routedTripsRef = useRef(new Map());
  const [routedTrips, setRoutedTrips] = useState([]);
  const [isRouting, setIsRouting] = useState(false);
  const displaySegments = useMemo(
    () => (USE_OSRM ? (routedTrips.length > 0 ? routedTrips : tripSegments) : tripSegments),
    [routedTrips, tripSegments]
  );

  useEffect(() => {
    const mode = mapDisplayState === 'history_day' ? 3 : mapDisplayState === 'selected_live' ? 2 : 1;
    console.log('VehicleMap mode:', mode, 'tripMapData:', tripMapData?.segments?.length ?? 0);
  }, [mapDisplayState, tripMapData]);

  useEffect(() => {
    if (!USE_OSRM) {
      setRoutedTrips([]);
      setIsRouting(false);
      return undefined;
    }
    if (!tripKey) {
      setRoutedTrips([]);
      setIsRouting(false);
      return undefined;
    }
    const cached = routedTripsRef.current.get(tripKey);
    if (cached) {
      setRoutedTrips(cached);
      setIsRouting(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    const routeTrips = async () => {
      setIsRouting(true);
      const jobs = tripSegments.map((seg, idx) => {
        return new Promise((resolve) => {
          setTimeout(async () => {
            if (cancelled || controller.signal.aborted) {
              resolve({ ...seg, path: [seg.start, seg.end], _routed: false });
              return;
            }
            const [startLat, startLng] = seg.start || [];
            const [endLat, endLng] = seg.end || [];
            const fallback = { ...seg, path: [seg.start, seg.end], _routed: false };
            if ([startLat, startLng, endLat, endLng].some((v) => v == null || Number.isNaN(Number(v)))) {
              resolve(fallback);
              return;
            }
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
              const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`,
                { signal: controller.signal }
              );
              if (!response.ok) {
                resolve(fallback);
                return;
              }
              const data = await response.json();
              const coords = data?.routes?.[0]?.geometry?.coordinates;
              if (!Array.isArray(coords) || coords.length < 2) {
                resolve(fallback);
                return;
              }
              const path = coords.map(([lng, lat]) => [Number(lat), Number(lng)]);
              resolve({ ...seg, path, _routed: true });
            } catch {
              resolve(fallback);
            } finally {
              clearTimeout(timeout);
            }
          }, idx * 200);
        });
      });

      const settled = await Promise.allSettled(jobs);
      if (cancelled || controller.signal.aborted) return;
      const done = settled.map((r, idx) =>
        r.status === 'fulfilled' && r.value
          ? r.value
          : { ...tripSegments[idx], path: [tripSegments[idx].start, tripSegments[idx].end], _routed: false }
      );
      routedTripsRef.current.set(tripKey, done);
      setRoutedTrips(done);
      setIsRouting(false);
    };

    routeTrips();
    return () => {
      cancelled = true;
      controller.abort();
      setIsRouting(false);
    };
  }, [tripKey]);

  const center = useMemo(() => {
    const pts = vehicles.filter((v) => v.latitude != null && v.longitude != null);
    if (!pts.length) return [46.5, 2.5];
    const lat = pts.reduce((s, p) => s + Number(p.latitude), 0) / pts.length;
    const lng = pts.reduce((s, p) => s + Number(p.longitude), 0) / pts.length;
    return [lat, lng];
  }, [vehicles]);

  return (
    <div className="relative h-[500px] w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      {isLoading && (
        <div className="absolute right-2 top-2 z-[500] rounded bg-white/90 px-2 py-1 text-xs text-slate-600">
          Chargement…
        </div>
      )}
      {isRouting && mapDisplayState === 'history_day' && (
        <div className="absolute left-2 top-2 z-[500] rounded bg-white/90 px-2 py-1 text-xs text-slate-600">
          Calcul des itinéraires...
        </div>
      )}
      <button
        type="button"
        className="absolute right-2 top-10 z-[500] rounded-full bg-white px-3 py-2 text-sm shadow-md transition hover:bg-slate-50"
        onClick={() => setMapMode((m) => nextMapMode(m))}
        title={modeTitle(mapMode)}
        aria-label={modeTitle(mapMode)}
      >
        {modeIcon(mapMode)}
      </button>
      <MapContainer center={center} zoom={8} className="h-full w-full" scrollWheelZoom>
        {mapMode === MAP_MODES.ESRI ? (
          <TileLayer
            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        ) : mapMode === MAP_MODES.GOOGLE ? (
          <TileLayer
            attribution="&copy; Google"
            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          />
        ) : (
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        <MapViewController
          vehicles={vehicles}
          selectedObjectno={selectedObjectno}
          flyTrigger={flyKey}
          tripSegments={displaySegments}
          tripKey={tripKey}
          mapDisplayState={mapDisplayState}
        />
        {mapDisplayState === 'history_day' && displaySegments.length > 0 ? (
          <>
            {displaySegments.map((seg, idx) => {
              const ratio = idx / Math.max(1, displaySegments.length - 1);
              const baseBlue = Math.round(180 - ratio * 110);
              const color = `rgb(${40}, ${80}, ${baseBlue})`;
              const isHovered = hoveredTripId != null && String(hoveredTripId) === String(seg.tripid);
              const isActive = activeTripId != null && String(activeTripId) === String(seg.tripid);
              return (
                <Polyline
                  key={`trip-line-${seg.tripid}-${idx}`}
                  positions={Array.isArray(seg.path) && seg.path.length ? seg.path : [seg.start, seg.end]}
                  pathOptions={{
                    color: isActive ? '#f43f5e' : isHovered ? '#7c3aed' : color,
                    weight: isActive ? 6 : isHovered ? 5 : 4,
                    opacity: isActive || isHovered ? 1 : 0.8,
                  }}
                  eventHandlers={{
                    click: () => onTripClick?.(seg.tripid),
                  }}
                />
              );
            })}
            {displaySegments.map((seg, idx) => (
              <CircleMarker
                key={`trip-start-${seg.tripid}-${idx}`}
                center={seg.start}
                radius={5}
                pathOptions={{ color: '#16a34a', weight: 2, fillOpacity: 0.8 }}
              />
            ))}
            {displaySegments.map((seg, idx) => (
              <CircleMarker
                key={`trip-end-${seg.tripid}-${idx}`}
                center={seg.end}
                radius={5}
                pathOptions={{ color: '#dc2626', weight: 2, fillOpacity: 0.8 }}
              />
            ))}
          </>
        ) : mapDisplayState === 'selected_live' ? (
          vehicles
            .filter((v) => v.objectno === selectedObjectno)
            .map((v) => (
              <VehicleMarker
                key={v.objectno}
                v={v}
                isSelected
                flyKey={flyKey}
                onVehicleSelect={onVehicleSelect}
              />
            ))
        ) : (
          vehicles.map((v) => (
            <VehicleMarker
              key={v.objectno}
              v={v}
              isSelected={selectedObjectno === v.objectno}
              flyKey={flyKey}
              onVehicleSelect={onVehicleSelect}
            />
          ))
        )}
      </MapContainer>
    </div>
  );
}
