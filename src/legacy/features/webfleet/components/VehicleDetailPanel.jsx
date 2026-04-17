/**
 * Panneau détail véhicule (sélection liste / carte).
 * @module features/webfleet/components/VehicleDetailPanel
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X } from 'lucide-react';
import { VehicleStatusBadge } from './VehicleStatusBadge.jsx';

/**
 * @param {{ vehicle: object|null, onClose: () => void }} props
 * @returns {JSX.Element|null}
 */
export function VehicleDetailPanel({ vehicle, onClose }) {
  if (!vehicle) return null;

  const pos = vehicle.pos_time ? new Date(vehicle.pos_time) : null;
  const posOk = pos && !Number.isNaN(pos.getTime());
  const lat = vehicle.latitude != null ? Number(vehicle.latitude) : null;
  const lng = vehicle.longitude != null ? Number(vehicle.longitude) : null;
  const coords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : '—';

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {vehicle.objectname || vehicle.objectno || 'Véhicule'}
          </h3>
          <p className="text-xs text-slate-500">
            N° objet Webfleet : <span className="font-mono">{vehicle.objectno || '—'}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-600 hover:bg-white/80"
          aria-label="Fermer le panneau"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Conducteur</dt>
          <dd className="font-medium text-slate-800">{vehicle.drivername || vehicle.driver || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Statut</dt>
          <dd>
            <VehicleStatusBadge ignition={vehicle.ignition} standstill={vehicle.standstill} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Vitesse</dt>
          <dd className="tabular-nums font-medium text-slate-800">
            {vehicle.speed != null ? `${vehicle.speed} km/h` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Kilométrage total</dt>
          <dd className="tabular-nums font-medium text-slate-800">
            {vehicle.odometer_km != null
              ? `${Number(vehicle.odometer_km).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
              : '—'}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-xs font-medium uppercase text-slate-500">Position (texte + coord.)</dt>
          <dd className="text-slate-800">
            <span className="block whitespace-pre-wrap break-words">{vehicle.postext || '—'}</span>
            <span className="mt-1 block font-mono text-xs text-slate-600">{coords}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Dernière position</dt>
          <dd className="text-slate-800">
            {posOk ? format(pos, 'dd/MM/yyyy HH:mm:ss', { locale: fr }) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Carburant</dt>
          <dd className="tabular-nums font-medium text-slate-800">
            {vehicle.fuellevel_pct != null
              ? `${Number(vehicle.fuellevel_pct).toFixed(1)} %`
              : vehicle.fuellevel != null
                ? `niveau brut ${vehicle.fuellevel}`
                : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
