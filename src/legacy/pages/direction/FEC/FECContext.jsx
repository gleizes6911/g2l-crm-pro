import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fecApi } from './utils/fecApi'

const FECContext = createContext(null)

function sliceDate(d) {
  if (d == null) return ''
  return String(d).slice(0, 10)
}

export function FECProvider({ children }) {
  const [companies, setCompanies] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState(null)
  const [yoyCompareModeByCompany, setYoyCompareModeByCompany] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadCompanies = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent)
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const { societes } = await fecApi.getSocietes()
      const list = Array.isArray(societes) ? societes : []
      const built = []

      for (const s of list) {
        const sortedEx = [...(s.exercices || [])].sort((a, b) => b.annee - a.annee)
        const exRows = await Promise.all(
          sortedEx.map(async (ex) => {
            const data = await fecApi.getEcritures(s.id, { annee: ex.annee })
            return { ex, rows: data.rows || [] }
          }),
        )

        const exercices = exRows.map(({ ex, rows }) => ({
          dbExerciceId: ex.id,
          annee: ex.annee,
          dateDebut: sliceDate(ex.date_debut) || `${ex.annee}-01-01`,
          dateFin: sliceDate(ex.date_fin) || `${ex.annee}-12-31`,
          rows,
        }))

        built.push({
          id: `fec_${s.id}`,
          dbId: s.id,
          siren: s.siren || '',
          name: s.nom,
          couleur: s.couleur || '#2563eb',
          exercices,
          activeExercice: exercices[0]?.annee ?? new Date().getFullYear(),
        })
      }

      setCompanies(built)
    } catch (e) {
      console.error('[FEC] Chargement', e)
      setError(e.message || 'Impossible de charger les données FEC (vérifiez le serveur et PostgreSQL).')
      setCompanies([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    if (companies.length && !activeCompanyId) {
      setActiveCompanyId(companies[0].id)
    }
    if (companies.length && activeCompanyId && !companies.some((c) => c.id === activeCompanyId)) {
      setActiveCompanyId(companies[0].id)
    }
    if (!companies.length) {
      setActiveCompanyId(null)
    }
  }, [companies, activeCompanyId])

  const setActiveExercice = useCallback((companyId, exercice) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, activeExercice: exercice } : c)),
    )
  }, [])

  const removeCompany = useCallback(
    async (id) => {
      const c = companies.find((x) => x.id === id)
      if (c?.dbId != null) {
        try {
          await fecApi.deleteSociete(c.dbId)
        } catch (e) {
          console.error(e)
          setError(e.message || 'Suppression société impossible')
          return
        }
      }
      setYoyCompareModeByCompany((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      await loadCompanies({ silent: true })
    },
    [companies, loadCompanies],
  )

  const removeExercice = useCallback(
    async (companyId, exerciceDbId) => {
      try {
        await fecApi.deleteExercice(exerciceDbId)
      } catch (e) {
        console.error(e)
        setError(e.message || 'Suppression exercice impossible')
        return
      }
      await loadCompanies({ silent: true })
    },
    [loadCompanies],
  )

  const setYoyCompareMode = useCallback((companyId, mode) => {
    if (!companyId) return
    setYoyCompareModeByCompany((prev) => ({ ...prev, [companyId]: mode }))
  }, [])

  const value = useMemo(
    () => ({
      companies,
      activeCompanyId,
      setActiveCompanyId,
      setActiveExercice,
      removeCompany,
      removeExercice,
      refreshCompanies: () => loadCompanies({ silent: true }),
      yoyCompareModeByCompany,
      setYoyCompareMode,
      loading,
      error,
      clearError: () => setError(null),
    }),
    [
      companies,
      activeCompanyId,
      removeCompany,
      removeExercice,
      loadCompanies,
      setActiveExercice,
      yoyCompareModeByCompany,
      setYoyCompareMode,
      loading,
      error,
    ],
  )

  return <FECContext.Provider value={value}>{children}</FECContext.Provider>
}

export function useFEC() {
  return useContext(FECContext)
}
