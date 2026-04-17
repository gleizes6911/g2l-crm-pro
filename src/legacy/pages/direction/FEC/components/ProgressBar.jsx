export default function ProgressBar({ label, value, color }) {
  return (
    <div className="fec-pw">
      <div className="fec-ph"><span className="fec-pl">{label}</span><span className="fec-pv" style={{ color }}>{value.toFixed(1)}%</span></div>
      <div className="fec-pb"><div className="fec-pf" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} /></div>
    </div>
  )
}
