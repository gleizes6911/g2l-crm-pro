import { useState, useEffect } from 'react'
import { User, MapPin, Briefcase, ExternalLink } from 'lucide-react'
import API_BASE from '../../../config/api'

const formatDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

const formatMontantDate = (a) => a?.date || a?.createdAt || a?.dateCreation

export default function DrillRhEmploye({ employe, societeLabel, color }) {
  const [absences, setAbsences] = useState([])
  const [acomptes, setAcomptes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employe?.id) {
      setLoading(false)
      return
    }
    Promise.all([
      fetch(`${API_BASE}/api/absences/employe/${employe.id}`)
        .then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE}/api/acomptes/employe/${employe.id}/historique`)
        .then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([abs, acc]) => {
        const listAbs = Array.isArray(abs) ? abs : (abs?.absences || [])
        setAbsences(listAbs)
        setAcomptes(Array.isArray(acc) ? acc : [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [employe?.id])

  const anciennete = employe.dateEntree
    ? Math.floor((Date.now() - new Date(employe.dateEntree).getTime()) / (1000 * 60 * 60 * 24 * 365))
    : null

  const sections = [
    {
      title: 'Identité',
      icon: User,
      rows: [
        { label: 'Nom complet', value: employe.nomComplet, bold: true },
        { label: 'Prénom', value: employe.prenom },
        { label: 'Nom', value: employe.nom },
      ],
    },
    {
      title: 'Contrat',
      icon: Briefcase,
      rows: [
        { label: 'Société', value: societeLabel },
        { label: 'Service', value: employe.service },
        { label: 'Fonction', value: employe.fonction },
        { label: 'Type contrat', value: employe.typeContrat, bold: true },
        { label: 'Date entrée', value: formatDate(employe.dateEntree) },
        { label: 'Ancienneté', value: anciennete !== null ? `${anciennete} an(s)` : '—' },
        { label: 'Manager', value: employe.managerName || '—' },
        { label: 'Statut', value: employe.statut },
      ],
    },
    {
      title: 'Coordonnées',
      icon: MapPin,
      rows: [
        { label: 'Adresse', value: employe.adresse?.rue },
        {
          label: 'Ville',
          value: `${employe.adresse?.codePostal || ''} ${employe.adresse?.ville || ''}`.trim() || '—',
        },
        { label: 'Téléphone', value: employe.telephone || '—' },
        { label: 'Mobile', value: employe.mobile || '—' },
        { label: 'Email', value: employe.email || '—', mono: true },
      ],
    },
  ]

  return (
    <div className="space-y-5">

      <div className="flex items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-bold text-white shrink-0"
          style={{ background: color }}
        >
          {(employe.prenom?.[0] || '') + (employe.nom?.[0] || '')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-[var(--color-ink)]">
            {employe.nomComplet}
          </p>
          <p className="text-[12px] text-[var(--color-muted)]">
            {employe.fonction || '—'} · {employe.service || '—'}
          </p>
          <p className="text-[11px] text-[var(--color-faint)] font-mono mt-0.5">
            {societeLabel}
            {anciennete !== null && ` · ${anciennete} an(s) d’ancienneté`}
          </p>
        </div>
        <div className="shrink-0">
          <span className={`text-[11px] font-mono px-2 py-1 rounded border ${
            employe.estActif
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]'
              : 'bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]'
          }`}
          >
            {employe.statut || '—'}
          </span>
        </div>
      </div>

      {sections.map(({ title, icon: Icon, rows }) => (
        <div key={title}>
          <div className="flex items-center gap-2 mb-2">
            <Icon size={12} className="text-[var(--color-muted)]" />
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
              {title}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-[12px]">
              <tbody>
                {rows.map(({ label, value, bold, mono }, i) => (
                  <tr
                    key={label}
                    className={`border-b border-[var(--color-border)] last:border-0 ${
                      i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'
                    }`}
                  >
                    <td className="px-3 py-2 text-[var(--color-muted)] font-mono w-2/5">
                      {label}
                    </td>
                    <td className={`px-3 py-2 text-right ${
                      bold ? 'font-semibold text-[var(--color-ink)]' : 'text-[var(--color-ink-2)]'
                    } ${mono ? 'font-mono text-[11px]' : ''}`}
                    >
                      {value || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!loading && absences.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
            Absences récentes (
            {absences.length}
            )
          </p>
          <div className="space-y-1">
            {absences.slice(0, 5).map((a, i) => (
              <div
                key={a.id || i}
                className="flex items-center justify-between p-2.5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[11px]"
              >
                <span className="text-[var(--color-muted)] font-mono">{a.type || a.motif || '—'}</span>
                <span className="text-[var(--color-ink)]">
                  {formatDate(a.dateDebut)}
                  {a.dateFin && a.dateFin !== a.dateDebut && ` → ${formatDate(a.dateFin)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && acomptes.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
            Acomptes (
            {acomptes.length}
            )
          </p>
          <div className="space-y-1">
            {acomptes.slice(0, 3).map((a, i) => (
              <div
                key={a.id || i}
                className="flex items-center justify-between p-2.5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[11px]"
              >
                <span className="text-[var(--color-muted)] font-mono">{formatDate(formatMontantDate(a))}</span>
                <span className="font-semibold text-[var(--color-ink)]">
                  {parseFloat(a.montant || 0).toLocaleString('fr-FR')}
                  {' '}
                  €
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {employe.id && (
        <div className="flex items-center justify-between gap-3 p-3 bg-[var(--color-info-bg)] rounded-[var(--radius-md)] border border-[var(--color-info-border)]">
          <p className="text-[10px] text-[var(--color-info)] font-mono">
            ⓘ Dernière granularité · Source Salesforce RH
          </p>
          <a
            href={`https://g2l.lightning.force.com/lightning/r/Contact/${employe.id}/view`}
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
