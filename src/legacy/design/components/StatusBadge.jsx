/**
 * StatusBadge — Badge de statut unifié
 * Props : label, variant ('success'|'warning'|'danger'|'info'|'neutral')
 */
export default function StatusBadge({ label, variant = 'neutral' }) {
  const styles = {
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]',
    danger:  'bg-[var(--color-danger-bg)]  text-[var(--color-danger)]  border-[var(--color-danger-border)]',
    info:    'bg-[var(--color-info-bg)]    text-[var(--color-info)]    border-[var(--color-info-border)]',
    neutral: 'bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]',
  }[variant]

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[var(--text-xs)] font-medium border font-mono ${styles}`}>
      {label}
    </span>
  )
}
