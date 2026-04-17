import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText } from 'lucide-react'
import API_BASE from '../../config/api'
import { KpiCard, PageHeader, DataTable, StatusBadge } from '../../design'

function statutBadgeVariant(statut) {
  if (statut === 'Actif') return 'success'
  if (statut === 'En période d\'essai') return 'warning'
  return 'danger'
}

export default function Employes() {
  const [employes, setEmployes] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEmploye, setSelectedEmploye] = useState(null)
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreSociete, setFiltreSociete] = useState('toutes')
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    chargerDonnees()
  }, [])

  const chargerDonnees = async () => {
    try {
      setLoading(true)
      setError(null)

      const responseEmployes = await fetch(`${API_BASE}/api/employes`)
      if (!responseEmployes.ok) {
        throw new Error(`Erreur HTTP: ${responseEmployes.status}`)
      }
      const dataEmployes = await responseEmployes.json()
      setEmployes(dataEmployes.employes || [])

      const responseStats = await fetch(`${API_BASE}/api/employes/statistiques/rh`)
      if (!responseStats.ok) {
        throw new Error(`Erreur HTTP: ${responseStats.status}`)
      }
      const dataStats = await responseStats.json()
      setStats(dataStats)
    } catch (err) {
      console.error('Erreur chargement données:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEmployeClick = useCallback(async (employeId) => {
    try {
      const response = await fetch(`${API_BASE}/api/employes/${employeId}`)
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }
      const data = await response.json()
      setSelectedEmploye(data)
    } catch (err) {
      console.error('Erreur chargement détails employé:', err)
      alert(`Erreur lors du chargement des détails: ${err.message}`)
    }
  }, [])

  const employesFiltres = employes.filter(emp => {
    if (filtreStatut !== 'tous') {
      if (filtreStatut === 'actifs' && !emp.estActif) return false
      if (filtreStatut === 'sortis' && emp.estActif) return false
      if (filtreStatut === 'periode-essai' && emp.statut !== 'En période d\'essai') return false
    }

    if (filtreSociete !== 'toutes') {
      const societeEmp = emp.societe || 'Non renseigné'
      if (societeEmp !== filtreSociete) return false
    }

    if (recherche) {
      const rechercheLower = recherche.toLowerCase()
      const nomComplet = `${emp.prenom} ${emp.nom}`.toLowerCase()
      if (!nomComplet.includes(rechercheLower) &&
          !emp.email?.toLowerCase().includes(rechercheLower)) {
        return false
      }
    }

    return true
  })

  const societes = [...new Set(employes.map(e => e.societe || 'Non renseigné'))].sort()

  const tableColumns = useMemo(() => [
    {
      key: '_nom',
      label: 'Nom',
      render: (_, row) => (
        <span className="font-medium text-[var(--color-ink)]">
          {row.prenom} {row.nom}
        </span>
      ),
    },
    { key: 'email', label: 'Email', render: (v) => v || '—' },
    {
      key: '_tel',
      label: 'Téléphone',
      render: (_, row) => row.mobile || row.telephone || '—',
    },
    { key: 'societe', label: 'Société', render: (v) => v || '—' },
    { key: 'typeContrat', label: 'Type contrat', render: (v) => v || '—' },
    {
      key: 'dateEntree',
      label: 'Date entrée',
      render: (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—'),
    },
    {
      key: 'dateSortie',
      label: 'Date sortie',
      render: (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—'),
    },
    {
      key: 'statut',
      label: 'Statut',
      render: (v) => (
        <StatusBadge label={v || '—'} variant={statutBadgeVariant(v)} />
      ),
    },
    {
      key: '_actions',
      label: 'Actions',
      align: 'center',
      width: '9rem',
      render: (_, row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleEmployeClick(row.id)
          }}
          className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] text-[var(--text-sm)] font-medium"
        >
          <FileText className="w-4 h-4" />
          Voir détails
        </button>
      ),
    },
  ], [handleEmployeClick])

  const tableRows = useMemo(() => employesFiltres, [employesFiltres])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-8">
        <DataTable columns={[]} rows={[]} loading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div
          className="rounded-[var(--radius-md)] border p-6"
          style={{
            background: 'var(--color-danger-bg)',
            borderColor: 'var(--color-danger-border)',
          }}
        >
          <h2 className="text-[var(--text-lg)] font-semibold text-[var(--color-danger)] mb-2">Erreur</h2>
          <p className="text-[var(--text-sm)] text-[var(--color-ink-2)]">{error}</p>
          <button
            type="button"
            onClick={chargerDonnees}
            className="mt-4 px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-danger)] text-white text-[var(--text-sm)] font-medium hover:opacity-90"
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Gestion des Employés"
        subtitle="Effectifs par société et type de contrat"
        breadcrumb={['RH', 'Employés']}
      />

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <KpiCard label="Effectif total" value={String(stats.effectifTotal ?? '—')} />
          <KpiCard label="Employés actifs" value={String(stats.actifs ?? '—')} status="success" />
          <KpiCard
            label="Période d'essai"
            value={String(stats.enPeriodeEssai ?? '—')}
            status="warning"
            subtitle={
              stats.finsPeriodeEssai7j > 0
                ? `${stats.finsPeriodeEssai7j} fin(s) sous 7 jours`
                : undefined
            }
          />
          <KpiCard label="Employés sortis" value={String(stats.sortis ?? '—')} />
        </div>
      )}

      <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[var(--text-xs)] font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider font-mono">
              Recherche
            </label>
            <input
              type="text"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom, prénom ou email…"
              className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] text-[var(--text-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-[var(--text-xs)] font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider font-mono">
              Statut
            </label>
            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] text-[var(--text-sm)]"
            >
              <option value="tous">Tous</option>
              <option value="actifs">Actifs</option>
              <option value="periode-essai">En période d&apos;essai</option>
              <option value="sortis">Sortis</option>
            </select>
          </div>

          <div>
            <label className="block text-[var(--text-xs)] font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider font-mono">
              Société
            </label>
            <select
              value={filtreSociete}
              onChange={(e) => setFiltreSociete(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] text-[var(--text-sm)]"
            >
              <option value="toutes">Toutes les sociétés</option>
              {societes.map(soc => (
                <option key={soc} value={soc}>{soc}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 text-[var(--text-sm)] text-[var(--color-muted)]">
          {employesFiltres.length} employé{employesFiltres.length !== 1 ? 's' : ''} affiché{employesFiltres.length !== 1 ? 's' : ''}
        </div>
      </div>

      <DataTable
        columns={tableColumns}
        rows={tableRows}
        empty="Aucun employé trouvé"
      />

      {selectedEmploye && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--color-border)]">
            <div className="bg-[var(--color-primary)] text-white p-6 rounded-t-[var(--radius-lg)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-[var(--text-xl)] font-semibold tracking-tight">
                  {selectedEmploye.prenom} {selectedEmploye.nom}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedEmploye(null)}
                  className="text-white/90 hover:text-white text-2xl leading-none"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-[var(--text-md)] font-semibold text-[var(--color-ink)] mb-3">
                  Informations personnelles
                </h3>
                <div className="grid grid-cols-2 gap-4 text-[var(--text-sm)]">
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Email</span>
                    <span className="text-[var(--color-ink)]">{selectedEmploye.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Téléphone</span>
                    <span className="text-[var(--color-ink)]">{selectedEmploye.telephone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Mobile</span>
                    <span className="text-[var(--color-ink)]">{selectedEmploye.mobile || '—'}</span>
                  </div>
                  {selectedEmploye.dateNaissance && (
                    <div>
                      <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Date de naissance</span>
                      <span className="text-[var(--color-ink)]">
                        {new Date(selectedEmploye.dateNaissance).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedEmploye.adresse && (
                <div>
                  <h3 className="text-[var(--text-md)] font-semibold text-[var(--color-ink)] mb-3">Adresse</h3>
                  <p className="text-[var(--text-sm)] text-[var(--color-ink-2)]">
                    {selectedEmploye.adresse.rue && `${selectedEmploye.adresse.rue}, `}
                    {selectedEmploye.adresse.codePostal} {selectedEmploye.adresse.ville}
                    {selectedEmploye.adresse.pays && `, ${selectedEmploye.adresse.pays}`}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-[var(--text-md)] font-semibold text-[var(--color-ink)] mb-3">
                  Informations professionnelles
                </h3>
                <div className="grid grid-cols-2 gap-4 text-[var(--text-sm)]">
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Société</span>
                    <span className="text-[var(--color-ink)]">{selectedEmploye.societe || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Type de contrat</span>
                    <span className="text-[var(--color-ink)]">{selectedEmploye.typeContrat || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Date d&apos;entrée</span>
                    <span className="text-[var(--color-ink)]">
                      {selectedEmploye.dateEntree ? new Date(selectedEmploye.dateEntree).toLocaleDateString('fr-FR') : '—'}
                    </span>
                  </div>
                  {selectedEmploye.dateSortie && (
                    <div>
                      <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Date de sortie</span>
                      <span className="text-[var(--color-ink)]">
                        {new Date(selectedEmploye.dateSortie).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[var(--color-muted)] block text-[var(--text-xs)] uppercase tracking-wider font-mono mb-1">Statut</span>
                    <StatusBadge
                      label={selectedEmploye.statut}
                      variant={statutBadgeVariant(selectedEmploye.statut)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[var(--color-bg)] px-6 py-4 rounded-b-[var(--radius-lg)] border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setSelectedEmploye(null)}
                className="w-full px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-ink-2)] text-white text-[var(--text-sm)] font-medium hover:opacity-90"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
