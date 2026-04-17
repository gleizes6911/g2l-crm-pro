/**
 * Tableau véhicules avec tri et recherche.
 * @module features/webfleet/components/VehicleList
 */

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { VehicleStatusBadge } from './VehicleStatusBadge.jsx';

function SortableTh({ colKey, sortKey, sortDir, onSort, children }) {
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600 hover:bg-slate-100"
      onClick={() => onSort(colKey)}
    >
      {children}
      {sortKey === colKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

/**
 * @param {{
 *   vehicles: object[],
 *   onVehicleSelect?: (vehicle: object|null) => void,
 *   selectedObjectno?: string|null,
 *   dataUpdatedAt?: number,
 * }} props
 * @returns {JSX.Element}
 */
export function VehicleList({ vehicles = [], onVehicleSelect, selectedObjectno = null, dataUpdatedAt }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('objectname');
  const [sortDir, setSortDir] = useState('asc');

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = vehicles.filter((v) => {
      if (!q) return true;
      const n = `${v.objectname || ''} ${v.drivername || ''}`.toLowerCase();
      return n.includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const getVal = (v, k) => {
      if (k === 'status') return `${v.ignition}-${v.standstill}`;
      if (k === 'pos_time') return v.pos_time ? new Date(v.pos_time).getTime() : 0;
      return v[k] ?? '';
    };
    rows = [...rows].sort((a, b) => {
      const va = getVal(a, sortKey);
      const vb = getVal(b, sortKey);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'fr') * dir;
    });
    return rows;
  }, [vehicles, search, sortKey, sortDir]);

  return (
    <div className="flex h-[500px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-2">
        <input
          type="search"
          placeholder="Rechercher véhicule ou conducteur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <SortableTh colKey="objectname" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                Véhicule
              </SortableTh>
              <SortableTh colKey="drivername" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                Conducteur
              </SortableTh>
              <SortableTh colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                Statut
              </SortableTh>
              <SortableTh colKey="speed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                Vitesse
              </SortableTh>
              <SortableTh colKey="postext" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                Position
              </SortableTh>
              <SortableTh colKey="pos_time" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                Dernière MAJ
              </SortableTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSorted.map((v) => (
              <tr
                key={v.objectno}
                className={`cursor-pointer hover:bg-indigo-50/50 ${
                  selectedObjectno === v.objectno ? 'bg-indigo-100/80 ring-1 ring-inset ring-indigo-300' : ''
                }`}
                onClick={() => {
                  if (selectedObjectno === v.objectno) onVehicleSelect?.(null);
                  else onVehicleSelect?.(v);
                }}
              >
                <td className="px-3 py-2 font-medium text-slate-900">
                  {v.objectname || v.objectno}
                </td>
                <td className="px-3 py-2 text-slate-700">{v.drivername || '—'}</td>
                <td className="px-3 py-2">
                  <VehicleStatusBadge ignition={v.ignition} standstill={v.standstill} />
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-800">
                  {v.speed != null ? `${v.speed} km/h` : '—'}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-600" title={v.postext}>
                  {v.postext || '—'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {v.pos_time
                    ? formatDistanceToNow(new Date(v.pos_time), { addSuffix: true, locale: fr })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        {dataUpdatedAt
          ? `Mis à jour ${formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true, locale: fr })}`
          : 'Pas encore de synchronisation.'}
      </div>
    </div>
  );
}
