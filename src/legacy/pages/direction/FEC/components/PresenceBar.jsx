export default function PresenceBar({ months, color }) {
  const AM = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {AM.map((m) => (
        <div key={m} style={{ width: 7, height: 13, borderRadius: 2, background: months?.has(m) ? `${color}66` : 'var(--fec-bg4)' }} />
      ))}
    </div>
  )
}
