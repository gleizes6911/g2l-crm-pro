import { Fragment, useState, useEffect } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import API_BASE from '../../../config/api'

const formatEuro = (v) => {
  if (!v && v !== 0) return '—'
  return `${parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

const formatDate = (d) => {
  if (!d) return '—'
  const s = String(d)
  if (s.length === 8) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  return new Date(d).toLocaleDateString('fr-FR')
}

function formatMoisLabel(mois) {
  if (!mois) return mois
  if (mois.includes('-') && mois.length === 7) {
    const [annee, m] = mois.split('-')
    const date = new Date(parseInt(annee, 10), parseInt(m, 10) - 1, 1)
    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
  }
  return mois
}

function societeCourt(nom) {
  if (!nom) return '—'
  if (nom.includes('TPS')) return 'TPS'
  if (nom.includes('D & J') || nom.includes('D&J')) return 'D&J'
  return 'Holding'
}

export default function DrillFecEcritures({ societeId, comptes, mois, chargeurNom, societenom }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [renta, setRenta] = useState(null)
  const [loadingRenta, setLoadingRenta] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const vueGroupe = societeId == null || societeId === ''

  useEffect(() => {
    console.log('[DrillFecEcritures] params:', { societeId, comptes, mois })

    const params = new URLSearchParams({
      comptes: Array.isArray(comptes) ? comptes.join(',') : comptes,
      mois,
    })
    if (societeId) params.set('societeId', societeId)

    fetch(`${API_BASE}/api/dashboard-groupe/fec-ecritures?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [societeId, comptes, mois])

  useEffect(() => {
    if (!chargeurNom || !mois) {
      setLoadingRenta(false)
      return
    }

    const [annee, moisNum] = mois.split('-').map(Number)
    const dateDebut = `${annee}-${String(moisNum).padStart(2, '0')}-01`
    const dernierJour = new Date(annee, moisNum, 0).getDate()
    const dateFin = `${annee}-${String(moisNum).padStart(2, '0')}-${String(dernierJour).padStart(2, '0')}`

    const params = new URLSearchParams({
      dateDebut,
      dateFin,
      chargeur: chargeurNom,
    })
    if (societeId) params.set('societeId', societeId)

    setLoadingRenta(true)
    fetch(`${API_BASE}/api/dashboard-groupe/rentabilite-chargeurs?${params}`)
      .then((r) => r.json())
      .then((d) => setRenta(d.chargeurs?.[0] || null))
      .catch(console.error)
      .finally(() => setLoadingRenta(false))
  }, [chargeurNom, mois, societeId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data?.ecritures?.length) {
    return (
      <div className="text-center py-12 text-[var(--color-muted)]">
        <p>Aucune écriture pour cette période</p>
      </div>
    )
  }

  const heads = vueGroupe
    ? ['Date', 'Société', 'Journal', 'N° Écriture', 'Compte', 'Libellé', 'Pièce', 'Débit', 'Crédit', 'Solde', 'Let.']
    : ['Date', 'Journal', 'N° Écriture', 'Compte', 'Libellé', 'Pièce', 'Débit', 'Crédit', 'Solde', 'Let.']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <div>
          <p className="text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-wider mb-1">
            {societenom} · {chargeurNom} · {formatMoisLabel(mois)}
          </p>
          <p className="text-[22px] font-bold text-[var(--color-ink)]">{formatEuro(data.total)}</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {data.nb} écriture{data.nb > 1 ? 's' : ''} comptable{data.nb > 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const row0 = vueGroupe
              ? ['Date', 'Société', 'Journal', 'Écriture', 'Compte', 'Libellé', 'Pièce', 'Débit', 'Crédit', 'Solde']
              : ['Date', 'Journal', 'Écriture', 'Compte', 'Libellé', 'Pièce', 'Débit', 'Crédit', 'Solde']
            const csv = [
              row0.join(';'),
              ...data.ecritures.map((e) => {
                const base = [
                  formatDate(e.EcritureDate),
                  ...(vueGroupe ? [societeCourt(e.societe_nom)] : []),
                  e.JournalCode,
                  e.EcritureNum,
                  `${e.CompteNum} ${e.CompteLib}`,
                  e.EcritureLib,
                  e.PieceRef,
                  e.Debit,
                  e.Credit,
                  e.Solde,
                ]
                return base.join(';')
              }),
            ].join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `FEC_${societenom}_${chargeurNom}_${mois}.csv`
            a.click()
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-mono text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Synthèse CA vs Charges affectées */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
            Produits (CA)
          </p>
          <p className="text-[22px] font-bold text-[var(--color-primary)]">{formatEuro(data.total)}</p>
          <p className="text-[10px] text-[var(--color-muted)] font-mono mt-0.5">
            {data.nb} écriture(s) FEC
          </p>
        </div>

        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-danger)] mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
            Charges affectées
          </p>
          {loadingRenta ? (
            <div className="flex items-center gap-2 h-8">
              <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-[var(--color-muted)] font-mono">Calcul...</span>
            </div>
          ) : renta ? (
            <>
              <p className="text-[22px] font-bold text-[var(--color-danger)]">{formatEuro(renta.coutTotal)}</p>
              <p
                className={`text-[11px] font-mono font-bold mt-0.5 ${
                  renta.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                }`}
              >
                Marge {formatEuro(renta.marge)} · {renta.tauxMarge}%
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">Non disponible</p>
          )}
        </div>
      </div>

      {renta && !loadingRenta && (() => {
        const chargesAvecDetail = [
          {
            key: 'masseSalariale',
            label: 'Masse salariale G2L',
            value: renta.masseSalariale,
            color: '#2563EB',
            detail: renta.detail?.chauffeurs || [],
          },
          {
            key: 'sousTraitance',
            label: 'Sous-traitance externe',
            value: renta.sousTraitance,
            color: '#7c3aed',
            detail: renta.detail?.prestataires || [],
          },
          {
            key: 'loyerFlotte',
            label: 'Loyers flotte',
            value: renta.loyerFlotte,
            color: '#0d9488',
            detail: renta.detail?.loyersVehicules || [],
          },
          {
            key: 'carburant',
            label: 'Carburant',
            value: renta.carburant,
            color: '#d97706',
            detail: renta.detail?.carburantVehicules || [],
          },
        ].filter((item) => item.value > 0)

        return (
          <div className="mb-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                    <th className="text-left px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Nature charge</th>
                    <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">Montant</th>
                    <th className="text-right px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase w-14">% CA</th>
                    <th className="w-8 px-1 py-2" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {chargesAvecDetail.map((item, i) => (
                    <Fragment key={item.key}>
                      <tr
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpanded(expanded === item.key ? null : item.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpanded(expanded === item.key ? null : item.key)
                          }
                        }}
                        className={`border-b border-[var(--color-border)] cursor-pointer select-none transition-colors hover:bg-[var(--color-surface-hover)] ${
                          i % 2 === 0 ? 'bg-[var(--color-surface)]' : 'bg-[#fafbfd]'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-[var(--color-muted)] font-mono text-[11px]">{item.label}</span>
                            {item.detail.length > 0 && (
                              <span className="text-[9px] font-mono text-[var(--color-faint)] ml-1">
                                {item.detail.length} ligne(s)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--color-ink)] text-[11px]">{formatEuro(item.value)}</td>
                        <td className="px-3 py-2.5 text-right text-[10px] font-mono text-[var(--color-muted)] w-14">
                          {data.total > 0 ? `${((item.value / data.total) * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 w-8 text-center">
                          <ChevronDown
                            size={12}
                            className={`text-[var(--color-faint)] transition-transform inline-block ${
                              expanded === item.key ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                      </tr>
                      {expanded === item.key && item.detail.length > 0 && (
                        <tr className="bg-[var(--color-bg)]">
                          <td colSpan={4} className="px-3 py-0">
                            <div className="border-l-2 ml-4 pl-3 py-2" style={{ borderColor: item.color }}>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-[var(--color-faint)] font-mono uppercase">
                                    {item.key === 'masseSalariale' && (
                                      <>
                                        <th className="text-left py-1">Chauffeur</th>
                                        <th className="text-right py-1">Jours CP</th>
                                        <th className="text-right py-1">Jours tot.</th>
                                        <th className="text-right py-1">Ratio</th>
                                        <th className="text-right py-1">Coût chargé</th>
                                        <th className="text-right py-1">Affecté</th>
                                      </>
                                    )}
                                    {item.key === 'sousTraitance' && (
                                      <>
                                        <th className="text-left py-1">Prestataire</th>
                                        <th className="text-right py-1">Tournées</th>
                                      </>
                                    )}
                                    {(item.key === 'loyerFlotte' || item.key === 'carburant') && (
                                      <>
                                        <th className="text-left py-1">Véhicule</th>
                                        <th className="text-right py-1">Jours CP</th>
                                        <th className="text-right py-1">Jours tot.</th>
                                        <th className="text-right py-1">Ratio</th>
                                        <th className="text-right py-1">Total mois</th>
                                        <th className="text-right py-1">Affecté</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.key === 'masseSalariale' &&
                                    item.detail.map((d) => (
                                      <tr key={d.nom} className="border-t border-[var(--color-border)]">
                                        <td className="py-1 text-[var(--color-ink)] font-medium">{d.nom}</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursCP}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursTotal}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.ratio}%</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{formatEuro(d.coutChargeTotal)}</td>
                                        <td className="py-1 text-right font-semibold text-[var(--color-ink)]">{formatEuro(d.coutAffecte)}</td>
                                      </tr>
                                    ))}
                                  {item.key === 'sousTraitance' &&
                                    item.detail.map((d) => (
                                      <tr key={d.nom} className="border-t border-[var(--color-border)]">
                                        <td className="py-1 text-[var(--color-ink)] font-medium">{d.nom}</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.nbTournees}</td>
                                      </tr>
                                    ))}
                                  {(item.key === 'loyerFlotte' || item.key === 'carburant') &&
                                    item.detail.map((d) => (
                                      <tr key={d.immat} className="border-t border-[var(--color-border)]">
                                        <td className="py-1 font-mono font-medium text-[var(--color-primary)]">{d.immat}</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursCP}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.joursTotal}j</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">{d.ratio}%</td>
                                        <td className="py-1 text-right text-[var(--color-muted)]">
                                          {formatEuro(item.key === 'loyerFlotte' ? d.loyerMensuel : d.carburantTotal)}
                                        </td>
                                        <td className="py-1 text-right font-semibold text-[var(--color-ink)]">
                                          {formatEuro(item.key === 'loyerFlotte' ? d.loyerAffecte : d.carburantAffecte)}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase font-bold">Total charges</td>
                    <td className="px-3 py-2 text-right font-bold text-[var(--color-ink)]">{formatEuro(renta.coutTotal)}</td>
                    <td className="px-3 py-2 text-right text-[10px] font-mono font-bold text-[var(--color-ink)]">
                      {data.total > 0 ? `${((renta.coutTotal / data.total) * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="w-8" />
                  </tr>
                  <tr className={`${renta.marge >= 0 ? 'bg-[var(--color-success-bg)]' : 'bg-[var(--color-danger-bg)]'}`}>
                    <td
                      className={`px-3 py-2 text-[10px] font-mono font-bold uppercase ${
                        renta.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                      }`}
                    >
                      Marge contribution
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${renta.marge >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {formatEuro(renta.marge)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-[11px] font-mono font-bold ${
                        renta.tauxMarge >= 15
                          ? 'text-[var(--color-success)]'
                          : renta.tauxMarge >= 5
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-danger)]'
                      }`}
                    >
                      {renta.tauxMarge}%
                    </td>
                    <td className="w-8" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <table className="w-full text-[11.5px] border-collapse">
          <thead>
            <tr className="bg-[var(--color-bg)]">
              {heads.map((h) => (
                <th key={h} className="text-left px-2.5 py-2 text-[9px] font-mono uppercase tracking-wider text-[var(--color-muted)] border-b border-[var(--color-border)] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.ecritures.map((e, i) => (
              <tr
                key={e.id || i}
                className={`border-b border-[var(--color-border)] last:border-0 ${
                  e.CompteNum?.startsWith('7')
                    ? 'bg-[#f0f7ff]'
                    : e.CompteNum?.startsWith('6')
                      ? 'bg-[#fff5f5]'
                      : i % 2 === 0
                        ? 'bg-[var(--color-surface)]'
                        : 'bg-[#fafbfd]'
                } hover:bg-[var(--color-surface-active)] transition-colors`}
              >
                <td className="px-2.5 py-2 font-mono whitespace-nowrap text-[var(--color-muted)]">{formatDate(e.EcritureDate)}</td>
                {vueGroupe && (
                  <td className="px-2.5 py-2 text-[var(--color-muted)] whitespace-nowrap text-[10px] font-mono">
                    {societeCourt(e.societe_nom)}
                  </td>
                )}
                <td className="px-2.5 py-2 font-mono text-[var(--color-muted)]">{e.JournalCode}</td>
                <td className="px-2.5 py-2 font-mono text-[var(--color-ink-2)]">{e.EcritureNum}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <span
                    className={`font-mono ${
                      e.CompteNum?.startsWith('7')
                        ? 'text-[var(--color-primary)]'
                        : e.CompteNum?.startsWith('6')
                          ? 'text-[var(--color-danger)]'
                          : 'text-[var(--color-primary)]'
                    }`}
                  >
                    {e.CompteNum}
                  </span>
                  <span className="text-[var(--color-muted)] ml-1">{e.CompteLib}</span>
                </td>
                <td className="px-2.5 py-2 max-w-[200px] truncate text-[var(--color-ink-2)]" title={e.EcritureLib}>{e.EcritureLib}</td>
                <td className="px-2.5 py-2 font-mono text-[var(--color-muted)] whitespace-nowrap">{e.PieceRef}</td>
                <td className="px-2.5 py-2 text-right font-mono text-[var(--color-ink-2)] whitespace-nowrap">
                  {parseFloat(e.Debit) > 0 ? formatEuro(e.Debit) : '—'}
                </td>
                <td className="px-2.5 py-2 text-right font-mono text-[var(--color-success)] whitespace-nowrap">
                  {parseFloat(e.Credit) > 0 ? formatEuro(e.Credit) : '—'}
                </td>
                <td className={`px-2.5 py-2 text-right font-semibold font-mono whitespace-nowrap ${
                  parseFloat(e.Solde) > 0 ? 'text-[var(--color-success)]' : parseFloat(e.Solde) < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'
                }`}
                >
                  {formatEuro(e.Solde)}
                </td>
                <td className="px-2.5 py-2 font-mono text-[var(--color-faint)]">{e.EcritureLet || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--color-bg)] font-semibold border-t border-[var(--color-border)]">
              <td colSpan={vueGroupe ? 7 : 6} className="px-2.5 py-2 text-[10px] font-mono text-[var(--color-muted)] uppercase">
                Total · {data.nb} écritures
              </td>
              <td colSpan={2} />
              <td className="px-2.5 py-2 text-right font-bold text-[var(--color-primary)]">{formatEuro(data.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
