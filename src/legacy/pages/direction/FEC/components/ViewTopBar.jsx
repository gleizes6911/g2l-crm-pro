import { MN } from '../utils/constants'

function exerciceShortLabel(ex) {
  const a = ex.dateDebut?.slice(0, 10) || ''
  const b = ex.dateFin?.slice(0, 10) || ''
  if (a.length >= 7 && b.length >= 7) {
    const m1 = parseInt(a.slice(5, 7), 10)
    const m2 = parseInt(b.slice(5, 7), 10)
    const y1 = a.slice(0, 4)
    const y2 = b.slice(0, 4)
    if (y1 === y2) return `${MN[m1] || ''} → ${MN[m2] || ''} ${y2}`.trim()
    return `${MN[m1] || m1} ${y1} → ${MN[m2] || m2} ${y2}`
  }
  return String(ex.annee)
}

export default function ViewTopBar({ company, badge, onMulti, fecPeriod }) {
  const m = company.mNet
  const margeClass = m >= 10 ? 'fec-badge-marge--ok' : m >= 5 ? 'fec-badge-marge--warn' : 'fec-badge-marge--bad'
  const yearLabel = company.viewYearLabel ?? company.year
  const multiEx = fecPeriod?.exercices?.length > 1
  const selVal =
    fecPeriod?.activeExercice === 'all' ? 'all' : String(fecPeriod?.activeExercice ?? fecPeriod?.exercices?.[0]?.annee ?? '')

  return (
    <header className="fec-view-top">
      <div>
        <h1>{company.name}</h1>
        <p className="fec-view-top-sub">
          {company.activeExerciceMode === 'all' ? 'Vue consolidée' : `Exercice ${yearLabel}`} · {company.rows} écritures · FEC
        </p>
      </div>
      <div className="fec-view-badges" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {multiEx ? (
          <div className="fec-period-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <span aria-hidden="true">📅</span>
              <select
                className="fec-fi fec-period-select"
                value={selVal}
                onChange={(e) => {
                  const v = e.target.value
                  fecPeriod.onChange(v === 'all' ? 'all' : parseInt(v, 10))
                }}
                style={{ width: 'auto', minWidth: 160, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}
              >
                {[...fecPeriod.exercices]
                  .sort((a, b) => b.annee - a.annee)
                  .map((ex) => (
                    <option key={ex.annee} value={ex.annee}>
                      {ex.annee} ({exerciceShortLabel(ex)})
                    </option>
                  ))}
                <option value="all">Toutes les années</option>
              </select>
            </label>
            {selVal !== 'all' && fecPeriod.onDeleteActiveExercice ? (
              <button
                type="button"
                className="fec-btn ghost"
                style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={fecPeriod.onDeleteActiveExercice}
              >
                🗑️ Supprimer cet exercice
              </button>
            ) : null}
          </div>
        ) : (
          <span className="fec-badge fec-badge-year">{yearLabel}</span>
        )}
        <span className={`fec-badge ${margeClass}`}>{`Marge ${company.mNet.toFixed(1)}%`}</span>
        {badge ? <span className="fec-badge fec-badge-neutral">{badge}</span> : null}
        {onMulti ? (
          <button type="button" className="fec-btn ghost" onClick={onMulti}>
            Multi →
          </button>
        ) : null}
      </div>
    </header>
  )
}
