export default function AlertBanner({ type = 'info', title, body }) {
  const map = { warn: 'fec-aw', ok: 'fec-ao', danger: 'fec-ad', info: 'fec-ai' }
  return (
    <div className={`fec-al ${map[type] || map.info}`}>
      <div className="fec-at">{title}</div>
      <div className="fec-ab">{body}</div>
    </div>
  )
}
