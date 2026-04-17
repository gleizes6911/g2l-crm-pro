import { useDrill } from '../DrillDownSystem'
import DrillCourseDetail from './DrillCourseDetail'
import { ChevronRight, Calendar, User } from 'lucide-react'

const COULEURS_TAUX = (taux) =>
  taux >= 97 ? 'text-[var(--color-success)]' :
  taux >= 90 ? 'text-[var(--color-warning)]' :
  'text-[var(--color-danger)]'

const BG_TAUX = (taux) =>
  taux >= 97 ? 'var(--color-success)' :
  taux >= 90 ? 'var(--color-warning)' :
  'var(--color-danger)'

export default function DrillOdsDetail({ tournee, chargeurNom }) {
  const { push } = useDrill()
  const parJour = tournee.parJour || []

  const totalPec = parJour.reduce((s, j) => s + (j.colisPec || 0), 0)
  const totalLiv = parJour.reduce((s, j) => s + (j.colisLivres || 0), 0)
  const totalRet = parJour.reduce((s, j) => s + (j.colisRetour || 0), 0)
  const tauxGlobal = totalPec > 0
    ? ((totalLiv / totalPec) * 100).toFixed(1) : 0

  return (
    <div className="space-y-4">

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Jours actifs', value: parJour.length },
          { label: 'Colis PEC', value: totalPec.toLocaleString('fr-FR') },
          { label: 'Livrés', value: totalLiv.toLocaleString('fr-FR') },
          { label: 'Retours', value: totalRet.toLocaleString('fr-FR') },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="text-center p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]"
          >
            <p className="text-[16px] font-bold text-[var(--color-ink)]">{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-0.5">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-[var(--color-muted)] font-mono">
            Taux de livraison tournée
          </span>
          <span className={`text-[14px] font-bold ${COULEURS_TAUX(parseFloat(tauxGlobal))}`}>
            {tauxGlobal}
            %
          </span>
        </div>
        <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(parseFloat(tauxGlobal), 100)}%`,
              background: BG_TAUX(parseFloat(tauxGlobal)),
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-[var(--color-faint)] font-mono">
            Seuil critique : 90%
          </span>
          <span className="text-[9px] text-[var(--color-faint)] font-mono">
            Objectif : ≥ 97%
          </span>
        </div>
      </div>

      {tournee.chauffeurs && (
        <div className="flex items-center gap-2 p-2.5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          <User size={12} className="text-[var(--color-muted)] shrink-0" />
          <span className="text-[11px] text-[var(--color-muted)] font-mono">
            {tournee.chauffeurs}
          </span>
        </div>
      )}

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Détail par jour · Cliquez pour la fiche complète
        </p>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {parJour.map((jour, i) => {
            const tauxJ = jour.colisPec > 0
              ? ((jour.colisLivres / jour.colisPec) * 100).toFixed(0)
              : null

            return (
              <button
                key={jour.date || i}
                type="button"
                onClick={() => push({
                  title: `${chargeurNom} · ${jour.date}`,
                  subtitle: `Tournée ${tournee.nom} · ${jour.chauffeur} · Course SF`,
                  component: DrillCourseDetail,
                  props: { jour, chargeurNom, tourneeNom: tournee.nom },
                })}
                className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-active)] border border-transparent hover:border-[var(--color-primary)] transition-all text-left group"
              >
                <div className="flex items-center gap-2 w-28 shrink-0">
                  <Calendar size={12} className="text-[var(--color-faint)]" />
                  <span className="text-[12px] font-mono font-medium text-[var(--color-ink)]">
                    {new Date(jour.date).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short',
                    })}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[var(--color-ink)] truncate">
                    {jour.chauffeur}
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)] font-mono">
                    {(jour.colisPec || 0)}
                    {' '}
                    PEC · {(jour.colisLivresDomicile || 0)}
                    {' '}
                    dom · {(jour.colisLivresRelais || 0)}
                    {' '}
                    relais
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[12px] font-semibold text-[var(--color-ink)]">
                      {(jour.colisLivres || 0)}
                      {' '}
                      livrés
                    </p>
                    {(jour.colisRetour || 0) > 0 && (
                      <p className="text-[10px] text-[var(--color-danger)]">
                        {jour.colisRetour}
                        {' '}
                        retours
                      </p>
                    )}
                  </div>
                  {tauxJ !== null ? (
                    <span className={`text-[13px] font-bold w-10 text-right ${COULEURS_TAUX(parseFloat(tauxJ))}`}>
                      {tauxJ}
                      %
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--color-faint)] w-10 text-right font-mono">
                      —
                    </span>
                  )}
                  <ChevronRight
                    size={13}
                    className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)] transition-colors"
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
