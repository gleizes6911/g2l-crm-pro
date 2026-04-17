/**
 * Badge synthétique statut moteur / mouvement.
 * @param {{ ignition?: number|null, standstill?: number|null }} props
 * @returns {JSX.Element}
 */
export function VehicleStatusBadge({ ignition, standstill }) {
  const ign = Number(ignition);
  const st = Number(standstill);

  if (ign === 1 && st === 0) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        En route
      </span>
    );
  }
  if (ign === 1 && st === 1) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        À l&apos;arrêt
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
      Coupé
    </span>
  );
}
