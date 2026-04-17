import { ExternalLink } from 'lucide-react'

const COULEURS_TAUX = (taux) =>
  taux >= 97 ? 'text-[var(--color-success)]' :
  taux >= 90 ? 'text-[var(--color-warning)]' :
  'text-[var(--color-danger)]'

export default function DrillCourseDetail({
  jour, chargeurNom, tourneeNom,
}) {
  const taux = jour.colisPec > 0
    ? ((jour.colisLivres / jour.colisPec) * 100)
    : null

  const sections = [
    {
      title: 'Identification',
      rows: [
        {
          label: 'Date',
          value: new Date(jour.date).toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          }),
        },
        { label: 'Chauffeur', value: jour.chauffeur },
        { label: 'Tournée', value: tourneeNom },
        { label: 'Chargeur', value: chargeurNom },
        { label: 'Course SF ID', value: jour.courseId, mono: true },
      ],
    },
    {
      title: 'Colis',
      rows: [
        { label: 'Colis pris en charge', value: (jour.colisPec || 0).toLocaleString('fr-FR') },
        { label: 'Colis livrés total', value: (jour.colisLivres || 0).toLocaleString('fr-FR'), bold: true },
        { label: '└ Dont domicile', value: (jour.colisLivresDomicile || 0).toLocaleString('fr-FR') },
        { label: '└ Dont relais/PR', value: (jour.colisLivresRelais || 0).toLocaleString('fr-FR') },
        {
          label: 'Colis retour',
          value: (jour.colisRetour || 0).toLocaleString('fr-FR'),
          color: (jour.colisRetour || 0) > 0 ? 'text-[var(--color-danger)]' : undefined,
        },
        {
          label: 'Taux de livraison',
          value: taux !== null ? `${taux.toFixed(1)}%` : '—',
          color: taux !== null ? COULEURS_TAUX(taux) : undefined,
          bold: true,
        },
      ],
    },
    {
      title: 'PDL (Points de Livraison)',
      rows: [
        { label: 'PDL pris en charge', value: (jour.pdlPec || 0).toLocaleString('fr-FR') },
        { label: 'PDL livrés', value: (jour.pdlLivres || 0).toLocaleString('fr-FR') },
        { label: 'PDL retour', value: (jour.pdlRetour || 0).toLocaleString('fr-FR') },
      ],
    },
  ]

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Colis PEC', value: (jour.colisPec || 0).toLocaleString() },
          { label: 'Livrés', value: (jour.colisLivres || 0).toLocaleString() },
          {
            label: 'Taux',
            value: taux !== null ? `${taux.toFixed(1)}%` : '—',
            color: taux !== null ? COULEURS_TAUX(taux) : 'text-[var(--color-muted)]',
          },
        ].map(({ label, value, color = 'text-[var(--color-ink)]' }) => (
          <div
            key={label}
            className="text-center p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)]"
          >
            <p className={`text-[22px] font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-[var(--color-muted)] font-mono uppercase tracking-wider mt-1">
              {label}
            </p>
          </div>
        ))}
      </div>

      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
            {section.title}
          </p>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-[12px]">
              <tbody>
                {section.rows.map((rowDef, i) => {
                  const {
                    label, value, bold, mono, color,
                  } = rowDef
                  return (
                    <tr
                      key={label}
                      className={`border-b border-[var(--color-border)] last:border-0 ${
                        i % 2 === 0
                          ? 'bg-[var(--color-surface)]'
                          : 'bg-[#fafbfd]'
                      }`}
                    >
                      <td className="px-3 py-2 text-[var(--color-muted)] font-mono w-1/2">
                        {label}
                      </td>
                      <td className={`px-3 py-2 text-right ${
                        color || (bold
                          ? 'font-semibold text-[var(--color-ink)]'
                          : 'text-[var(--color-ink)]')
                      } ${mono ? 'font-mono text-[11px]' : ''}`}
                      >
                        {value || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {jour.courseId && (
        <div className="flex items-center justify-between gap-3 p-3 bg-[var(--color-info-bg)] rounded-[var(--radius-md)] border border-[var(--color-info-border)]">
          <p className="text-[10px] text-[var(--color-info)] font-mono">
            ⓘ Dernière granularité · Source Salesforce Courses
          </p>
          <a
            href={`https://g2l.lightning.force.com/lightning/r/IO_Course__c/${jour.courseId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-primary)] hover:underline shrink-0"
          >
            <ExternalLink size={11} />
            Ouvrir dans SF
          </a>
        </div>
      )}
    </div>
  )
}
