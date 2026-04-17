export default function DrillFlotteVehicule({ flotte }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Véhicules actifs', value: flotte.globaux?.vehiculesActifs || 0 },
          { label: 'Km totaux', value: `${(flotte.globaux?.kmTotaux || 0).toLocaleString()} km` },
          { label: 'Score conduite', value: `${flotte.globaux?.scoreConduite || 0}%` },
        ].map(({ label, value }) => (
          <div key={label} className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
            <p className="text-[18px] font-bold text-[var(--color-ink)]">{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Positions temps réel · Webfleet GPS
        </p>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {flotte.vehiculesTempsReel?.map((v, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-border)]">
              <div className={`w-2 h-2 rounded-full shrink-0 ${v.statut === 'en_route' ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-faint)]'}`} />
              <span className="font-mono text-[12px] font-medium w-20 shrink-0">{v.immatriculation}</span>
              <span className="text-[11px] text-[var(--color-muted)] flex-1 truncate">{v.position || '—'}</span>
              <span className={`text-[10px] font-mono shrink-0 ${v.statut === 'en_route' ? 'text-[var(--color-success)]' : 'text-[var(--color-faint)]'}`}>
                {v.statut === 'en_route' ? '● EN ROUTE' : '○ ARRÊTÉ'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">Top véhicules par km</p>
        <div className="space-y-1.5">
          {flotte.topVehicules?.map((v, i) => (
            <div key={v.immatriculation} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-border)]">
              <span className="text-[10px] font-mono text-[var(--color-faint)] w-4 shrink-0">{i + 1}</span>
              <span className="font-mono text-[12px] font-medium flex-1">{v.immatriculation}</span>
              <span className="text-[12px] font-semibold text-[var(--color-ink)]">{v.km?.toLocaleString()} km</span>
              <span className={`text-[11px] font-mono ${
                (v.scoreConduite || 0) >= 80 ? 'text-[var(--color-success)]' : (v.scoreConduite || 0) >= 60 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'
              }`}
              >
                {v.scoreConduite || '—'}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
