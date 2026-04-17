export default function KpiCard({ label, value, delta, deltaClass = '', yoy, onClick, active, accentColor }) {
  return (
    <div
      className={`fec-kc ${onClick ? 'cl' : ''} ${active ? 'fec-kc--strip' : ''} ${accentColor ? 'fec-kc--accent' : ''}`}
      style={accentColor ? { borderColor: accentColor } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="fec-kl">{label}</div>
      <div className="fec-kv">{value}</div>
      <div className={`fec-kd ${deltaClass}`}>{delta}</div>
      {yoy ? (
        <>
          <div
            className={`fec-k-yoy ${
              yoy.warning ? 'fec-k-yoy--warn' : yoy.good ? 'fec-k-yoy--up' : yoy.bad ? 'fec-k-yoy--down' : 'fec-k-yoy--neutral'
            }`}
          >
            {yoy.text}
          </div>
          {yoy.sub ? <div className="fec-k-yoy-sub">{yoy.sub}</div> : null}
        </>
      ) : null}
    </div>
  )
}
