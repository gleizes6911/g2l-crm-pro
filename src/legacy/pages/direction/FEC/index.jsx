import { useCallback, useMemo, useRef, useState } from 'react'
import { fecApi } from './utils/fecApi'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { FECProvider, useFEC } from './FECContext'
import { parseFEC } from './utils/parseFEC'
import { companyAccent } from './utils/fecColors'
import {
  buildFlatCompanyView,
  companyStableId,
  groupImportRowsByCompany,
  previewImportActions,
} from './utils/fecCompanyUtils'
import { detectFromFilename } from './utils/fecImportDetect'
import Synthese from './views/Synthese'
import Clients from './views/Clients'
import Flotte from './views/Flotte'
import Salaires from './views/Salaires'
import Fournisseurs from './views/Fournisseurs'
import Penalites from './views/Penalites'
import Balance from './views/Balance'
import TVA from './views/TVA'
import Comparaison from './views/Comparaison'
import './fec.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

const SIREN_FETCH_MS = 5000

/** SIREN normalisé sur 9 chiffres, ou chaîne vide. */
function normalizeSiren9(s) {
  const d = String(s || '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(0, 9) : ''
}

/** Min / max EcritureDate (colonne index 3, YYYYMMDD) sur tout le fichier. */
function detectDates(text) {
  const lines = String(text || '').split(/\r?\n/)
  let dateMin = '99999999'
  let dateMax = '00000000'
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const d = cols[3]?.trim()
    if (d && /^\d{8}$/.test(d)) {
      if (d < dateMin) dateMin = d
      if (d > dateMax) dateMax = d
    }
  }
  return { dateMin, dateMax }
}

const fmtFecDateJjMmAaaa = (d8) =>
  d8 && d8.length >= 8 ? `${d8.slice(6, 8)}/${d8.slice(4, 6)}/${d8.slice(0, 4)}` : '—'

function periodRangeFromDetect(dd) {
  if (!dd || dd.dateMax === '00000000') return '—'
  let { dateMin, dateMax } = dd
  if (dateMin === '99999999') dateMin = dateMax
  return `du ${fmtFecDateJjMmAaaa(dateMin)} au ${fmtFecDateJjMmAaaa(dateMax)}`
}

/** Propage le nom des lignes qui en ont déjà vers les vides de même SIREN. */
function propagateNomsBySiren(rows) {
  const next = rows.map((r) => ({ ...r }))
  next.forEach((file) => {
    const s9 = normalizeSiren9(file.siren)
    if (!s9 || String(file.nom || '').trim()) return
    const same = next.find(
      (f) => normalizeSiren9(f.siren) === s9 && String(f.nom || '').trim() !== '',
    )
    if (same) file.nom = same.nom
  })
  return next
}

/** Une instance FileReader par appel (pas de partage entre fichiers). */
function readBlobAsText(blob, encoding = 'latin1', debugFileName = '') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      console.log('FileReader onload pour:', debugFileName || '(blob)', 'taille:', result.length)
      resolve(result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob, encoding)
  })
}

function countFecRows(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return 0
  let c = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].split('\t').length >= 12) c += 1
  }
  return c
}

/** API recherche-entreprises — timeout 5 s, champs demandés */
async function fetchSirenNom(siren) {
  if (!siren || String(siren).length !== 9) return ''
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), SIREN_FETCH_MS)
  try {
    const r = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siren)}&page=1&per_page=1`,
      { signal: ctrl.signal },
    )
    clearTimeout(t)
    if (!r.ok) return ''
    const data = await r.json()
    const hit = data.results?.[0]
    return hit?.nom_complet || hit?.siege?.denomination || ''
  } catch {
    clearTimeout(t)
    return ''
  }
}

const dropBaseStyle = {
  border: '2px dashed var(--fec-border2)',
  borderRadius: 12,
  background: 'var(--fec-bg3)',
  padding: '40px 28px',
  maxWidth: 480,
  margin: '0 auto',
  cursor: 'pointer',
  transition: 'border-color 0.2s ease, background 0.2s ease',
  color: 'var(--fec-text2)',
  fontSize: 14,
  textAlign: 'center',
}

function FECInner() {
  const {
    companies,
    activeCompanyId,
    removeCompany,
    removeExercice,
    setActiveCompanyId,
    setActiveExercice,
    yoyCompareModeByCompany,
    setYoyCompareMode,
    refreshCompanies,
    loading,
    error,
    clearError,
  } = useFEC()
  const [curView, setCurView] = useState('syn')
  const [importModal, setImportModal] = useState(null)
  const [importResultModal, setImportResultModal] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [dropOver, setDropOver] = useState(false)
  const inputRef = useRef(null)
  const importSessionRef = useRef(0)

  const activeModel = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || companies[0] || null,
    [companies, activeCompanyId],
  )
  const active = useMemo(() => (activeModel ? buildFlatCompanyView(activeModel) : null), [activeModel])

  const importPreviewRows = useMemo(
    () => (importModal?.rows ? previewImportActions(importModal.rows, companies) : []),
    [importModal?.rows, importModal, companies],
  )
  /** Groupes visuels du modal : un bloc par SIREN (fichiers sans SIREN regroupés). */
  const importGroupsBySiren = useMemo(() => {
    const rows = importPreviewRows
    if (!rows.length) return []
    const order = []
    const byGk = new Map()
    for (const r of rows) {
      const s9 = normalizeSiren9(r.siren)
      const gk = s9 || 'no_siren'
      if (!byGk.has(gk)) {
        byGk.set(gk, [])
        order.push(gk)
      }
      byGk.get(gk).push(r)
    }
    return order.map((gk) => ({
      groupKey: gk,
      siren9: gk === 'no_siren' ? '' : gk,
      items: byGk.get(gk),
    }))
  }, [importPreviewRows])

  const activeExerciceDbId = useMemo(() => {
    if (!activeModel?.exercices?.length) return null
    const ae = activeModel.activeExercice
    if (ae === 'all') return null
    return activeModel.exercices.find((e) => e.annee === ae)?.dbExerciceId ?? null
  }, [activeModel])

  const handleDeleteActiveExercice = useCallback(async () => {
    if (!activeModel || activeExerciceDbId == null) return
    if (!window.confirm('Supprimer cet exercice et toutes ses écritures ?')) return
    await removeExercice(activeModel.id, activeExerciceDbId)
  }, [activeModel, activeExerciceDbId, removeExercice])

  const fecPeriod = useMemo(() => {
    if (!activeModel || !(activeModel.exercices?.length > 0)) return null
    const multi = activeModel.exercices.length > 1
    return {
      exercices: activeModel.exercices,
      activeExercice: activeModel.activeExercice,
      onChange: (ex) => setActiveExercice(activeModel.id, ex),
      activeExerciceDbId,
      onDeleteActiveExercice:
        multi && activeModel.activeExercice !== 'all' && activeExerciceDbId != null
          ? handleDeleteActiveExercice
          : null,
    }
  }, [activeModel, activeExerciceDbId, handleDeleteActiveExercice, setActiveExercice])

  const showInitialLoad = loading && companies.length === 0 && !importModal

  const openImport = () => inputRef.current?.click()

  const closeImportModal = () => {
    importSessionRef.current += 1
    setImportModal(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  /** Saisie société : ligne éditée + propagation aux champs vides du même SIREN. */
  const handleImportSirenGroupNameChange = useCallback((groupItems, rowKey, newName) => {
    const s9 = normalizeSiren9(groupItems.find((i) => i.key === rowKey)?.siren || groupItems[0]?.siren)
    setImportModal((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.key === rowKey) return { ...row, nom: newName }
          const sameSiren = s9 && normalizeSiren9(row.siren) === s9
          if (sameSiren && !String(row.nom || '').trim()) return { ...row, nom: newName }
          return row
        }),
      }
    })
  }, [])

  const startImport = (fileList) => {
    const raw = Array.from(fileList || [])
    console.log('startImport: liste brute, nb =', raw.length, raw.map((f) => f.name))
    const filtered = raw.filter((f) => {
      const n = (f?.name || '').toLowerCase()
      return n.endsWith('.txt') || n.endsWith('.csv') || n.endsWith('.fec')
    })
    const files = filtered.length ? filtered : raw
    if (!filtered.length && raw.length) {
      console.warn('startImport: aucune extension .txt/.csv/.fec — utilisation de tous les fichiers sélectionnés')
    }
    if (!files.length) {
      console.warn('startImport: aucun fichier, abandon')
      return
    }

    const sessionId = Date.now()
    importSessionRef.current = sessionId
    console.log('startImport: session', sessionId, '→', files.length, 'fichier(s)')

    const rows = files.map((file, i) => ({
      key: `${sessionId}-${i}-${file.name}-${file.size}-${file.lastModified}`,
      file,
      fileName: file.name,
      analyzing: true,
      siren: '',
      year: new Date().getFullYear(),
      periodRange: '',
      nom: '',
      apiStatus: 'pending',
      rowCount: null,
    }))

    setImportModal({ sessionId, rows })
    console.log('setImportModal: modal ouvert,', rows.length, 'ligne(s)')

    files.forEach((file, i) => {
      const rowKey = rows[i].key
      ;(async () => {
        console.log('traitement fichier:', file.name)
        try {
          const fromFn = detectFromFilename(file.name)
          const siren = fromFn?.siren ?? ''
          console.log('SIREN détecté:', siren || '(vide)', 'pour', file.name)

          const settled = await Promise.allSettled([
            siren ? fetchSirenNom(siren) : Promise.resolve(''),
            readBlobAsText(file, 'latin1', file.name),
          ])
          if (importSessionRef.current !== sessionId) return

          const nomFromApi = settled[0].status === 'fulfilled' ? settled[0].value : ''
          const fullText = settled[1].status === 'fulfilled' ? settled[1].value : ''
          if (settled[0].status === 'rejected') {
            console.warn('API SIREN rejetée pour', file.name, settled[0].reason)
          }
          if (settled[1].status === 'rejected') {
            console.warn('Lecture fichier rejetée pour', file.name, settled[1].reason)
          }

          const dd = fullText ? detectDates(fullText) : null
          const yearNum =
            dd && dd.dateMax !== '00000000'
              ? parseInt(dd.dateMax.slice(0, 4), 10)
              : fromFn?.year ?? new Date().getFullYear()
          const periodRange = dd ? periodRangeFromDetect(dd) : '—'

          const rowCount = countFecRows(fullText)
          let apiStatus = 'no_siren'
          if (siren) apiStatus = nomFromApi ? 'detected' : 'manual'

          setImportModal((prev) => {
            if (!prev || prev.sessionId !== sessionId) return prev
            const rows = prev.rows.map((r) =>
              r.key === rowKey
                ? {
                    ...r,
                    analyzing: false,
                    siren,
                    year: yearNum,
                    periodRange,
                    nom: nomFromApi,
                    apiStatus,
                    rowCount,
                  }
                : r,
            )
            return { ...prev, rows: propagateNomsBySiren(rows) }
          })
        } catch (err) {
          console.error('traitement fichier erreur:', file.name, err)
          if (importSessionRef.current !== sessionId) return
          setImportModal((prev) => {
            if (!prev || prev.sessionId !== sessionId) return prev
            const rows = prev.rows.map((r) =>
              r.key === rowKey
                ? {
                    ...r,
                    analyzing: false,
                    apiStatus: 'no_siren',
                    periodRange: '—',
                    rowCount: null,
                  }
                : r,
            )
            return { ...prev, rows: propagateNomsBySiren(rows) }
          })
        }
      })()
    })
  }

  const onFileInput = (e) => {
    console.log('onChange déclenché, nb fichiers:', e.target.files?.length)
    console.log('fichiers:', Array.from(e.target.files || []).map((f) => f.name))
    const fl = e.target.files
    if (!fl?.length) return
    startImport(fl)
    e.target.value = ''
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDropOver(true)
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDropOver(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDropOver(false)
    console.log('onDrop déclenché, nb fichiers:', e.dataTransfer?.files?.length)
    console.log('fichiers (drop):', Array.from(e.dataTransfer?.files || []).map((f) => f.name))
    const fl = e.dataTransfer?.files
    if (fl?.length) startImport(fl)
  }

  /** Drop sur la page FEC quand une société est déjà chargée (la zone vide n’est pas affichée). */
  const onRootDragOver = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
  }
  const onRootDrop = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    console.log('onDrop (root) déclenché, nb fichiers:', e.dataTransfer.files?.length)
    const fl = e.dataTransfer?.files
    if (fl?.length) startImport(fl)
  }

  const confirmImportAll = async () => {
    if (!importModal?.rows?.length || confirmLoading) return
    const allReady = importModal.rows.every((r) => !r.analyzing)
    if (!allReady) return

    const previewForNom = previewImportActions(importModal.rows, companies)
    const groupsForNom = groupImportRowsByCompany(previewForNom)
    const groupNomByRowKey = new Map()
    for (const g of groupsForNom) {
      const groupNom = g.items.map((x) => String(x.nom || '').trim()).find(Boolean) || ''
      for (const it of g.items) groupNomByRowKey.set(it.key, groupNom)
    }

    setConfirmLoading(true)
    const sessionId = importModal.sessionId
    try {
      const settled = await Promise.allSettled(
        importModal.rows.map(async (row) => {
          if (importSessionRef.current !== sessionId) throw new Error('cancelled')
          const text = await readBlobAsText(row.file, 'latin1', row.fileName)
          if (importSessionRef.current !== sessionId) throw new Error('cancelled')
          const name = String(row.nom || '').trim() || groupNomByRowKey.get(row.key) || ''
          const year = row.year
          console.log('parseFEC appelé pour:', name, year)
          const cid = companyStableId(row.siren, name)
          return parseFEC(text, name, year, { siren: row.siren || undefined, companyId: cid })
        }),
      )
      if (importSessionRef.current !== sessionId) return

      const items = []
      settled.forEach((s, i) => {
        const row = importModal.rows[i]
        if (s.status === 'fulfilled') {
          items.push({ row, parsed: s.value })
        } else {
          console.error('Import confirmé échoué pour ligne', row?.fileName, s.reason)
        }
      })
      if (!items.length) return

      const results = []
      let totalNouvelles = 0
      let totalDoublons = 0

      for (const { row, parsed } of items) {
        const nom =
          String(row?.nom || '').trim() ||
          groupNomByRowKey.get(row?.key) ||
          String(parsed.name || '').trim()
        const sirenRaw = String(row?.siren || parsed.siren || '').replace(/\D/g, '').slice(0, 9)
        const siren = sirenRaw.length === 9 ? sirenRaw : undefined
        const annee = Number(parsed.year ?? row?.year) || new Date().getFullYear()
        const dateDebut = fecApi.toIsoDateFromFec8(parsed.fecDateMin) || `${annee}-01-01`
        const dateFin = fecApi.toIsoDateFromFec8(parsed.fecDateMax) || `${annee}-12-31`
        const nomTrim = nom.trim()
        const matchCo = companies.find((c) => {
          if (siren && c.siren && String(c.siren).replace(/\D/g, '').slice(0, 9) === siren) return true
          return c.name && nomTrim && c.name.toLowerCase() === nomTrim.toLowerCase()
        })
        const couleur = matchCo?.couleur || '#2563eb'
        const ecritures = Array.isArray(parsed.fecRows) ? parsed.fecRows : []

        try {
          const r = await fecApi.importFEC({
            siren,
            nom: nomTrim || parsed.name || 'Société',
            couleur,
            annee,
            dateDebut,
            dateFin,
            nomFichier: row?.fileName || null,
            ecritures,
          })
          totalNouvelles += r.ecrituresImportees ?? 0
          totalDoublons += r.ecrituresDoublons ?? 0
          results.push({
            nom: nomTrim || '—',
            ecrituresImportees: r.ecrituresImportees ?? 0,
            ecrituresDoublons: r.ecrituresDoublons ?? 0,
            ecrituresTotal: r.ecrituresTotal ?? ecritures.length,
          })
        } catch (e) {
          console.error('importFEC', row?.fileName, e)
          results.push({
            nom: nomTrim || row?.fileName || '—',
            ecrituresImportees: 0,
            ecrituresDoublons: 0,
            ecrituresTotal: ecritures.length,
            error: e.message || 'Erreur',
          })
        }
      }

      setImportResultModal({
        lignes: results,
        totalNouvelles,
        totalDoublons,
      })
      setCurView('syn')
      closeImportModal()
      await refreshCompanies()
    } catch (err) {
      console.error('confirmImportAll:', err)
    } finally {
      setConfirmLoading(false)
    }
  }

  const tabs = [
    ['syn', '📊 Synthèse'],
    ['clients', '🏢 CA Clients'],
    ['flotte', '🚗 Flotte'],
    ['salaires', '👥 Salaires'],
    ['fourn', '🛒 Fournisseurs'],
    ['penalites', '⚖️ Pénalités'],
    ['balance', '📒 Balance'],
    ['tva', '🧾 TVA'],
    ['comp', '🔀 Comparaison'],
  ]
  const hasMulti = companies.length > 1
  const yoyCompareMode = useMemo(
    () => (activeModel ? (yoyCompareModeByCompany[activeModel.id] ?? 'full') : 'full'),
    [activeModel, yoyCompareModeByCompany],
  )
  const viewProps = useMemo(
    () => ({
      go: setCurView,
      hasMulti,
      curView,
      fecPeriod,
      yoyCompareMode,
      setYoyCompareMode: (mode) => activeModel && setYoyCompareMode(activeModel.id, mode),
    }),
    [hasMulti, curView, fecPeriod, yoyCompareMode, activeModel, setYoyCompareMode],
  )

  const anyRowLoading = importModal?.rows?.some((r) => r.analyzing)
  /** Désactiver seulement si un groupe entièrement prêt n’a aucun nom saisi (les vides héritent à l’import). */
  const importBlockedByGroupName = importGroupsBySiren.some((g) => {
    const allDone = g.items.every((r) => !r.analyzing)
    if (!allDone) return false
    return !g.items.some((r) => String(r.nom || '').trim())
  })
  const importAllDisabled = !importModal || anyRowLoading || importBlockedByGroupName || confirmLoading

  const dropDynamic = dropOver
    ? { borderColor: 'var(--fec-accent)', background: 'rgba(37,99,235,0.04)' }
    : {}

  return (
    <div className="fec-root" onDragOver={onRootDragOver} onDrop={onRootDrop}>
      <div className="fec-main-header">
        <div className="fec-main-title">Dashboard FEC — Holding G2L</div>
        <button type="button" className="fec-btn" onClick={openImport}>
          Importer FEC
        </button>
      </div>
      {error ? (
        <div
          role="alert"
          style={{
            margin: '0 0 12px',
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(220, 38, 38, 0.12)',
            color: 'var(--fec-text)',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>{error}</span>
          <button type="button" className="fec-btn ghost" onClick={clearError}>
            Fermer
          </button>
        </div>
      ) : null}
      <div className="fec-co-bar">
        {companies.map((co, i) => {
          const col = co.couleur || companyAccent(co.id, i)
          const isAct = active?.id === co.id
          return (
            <div
              key={co.id}
              role="button"
              tabIndex={0}
              className={`fec-pill ${isAct ? 'fec-pill--active' : ''}`}
              style={{ '--fec-pill-color': col }}
              onClick={() => setActiveCompanyId(co.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveCompanyId(co.id)
                }
              }}
            >
              <span>{co.name}</span>
              <button
                type="button"
                className="fec-pill-rm"
                aria-label={`Retirer ${co.name}`}
                onClick={async (ev) => {
                  ev.stopPropagation()
                  if (!window.confirm(`Supprimer la société « ${co.name} » et toutes ses écritures ?`)) return
                  await removeCompany(co.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
        <button type="button" className="fec-btn ghost" onClick={openImport}>
          + Importer
        </button>
      </div>
      <div className="fec-nav-tabs">
        {tabs.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={`fec-nav-tab ${curView === id ? 'fec-nav-tab--active' : ''}`}
            onClick={() => setCurView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {showInitialLoad && (
        <div
          className="fec-empty"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid var(--fec-border2)',
              borderTopColor: 'var(--fec-accent)',
              borderRadius: '50%',
              animation: 'fec-spin 0.8s linear infinite',
            }}
          />
          <p style={{ marginTop: 16, color: 'var(--fec-text2)', fontSize: 14 }}>Chargement des données FEC…</p>
          <style>{`@keyframes fec-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!active && !showInitialLoad && (
        <div className="fec-empty">
          <div
            role="button"
            tabIndex={0}
            style={{ ...dropBaseStyle, ...dropDynamic }}
            onClick={openImport}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openImport()
              }
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }} aria-hidden>
              📂
            </div>
            <div style={{ fontWeight: 600, color: 'var(--fec-text)', marginBottom: 8 }}>
              Déposez vos fichiers FEC ici
            </div>
            <div style={{ marginBottom: 6 }}>ou cliquez pour sélectionner</div>
            <div style={{ fontSize: 12, color: 'var(--fec-text3)' }}>
              Formats acceptés : .txt .csv · Plusieurs fichiers supportés
            </div>
          </div>
        </div>
      )}

      {active && curView === 'syn' && <Synthese c={active} {...viewProps} />}
      {active && curView === 'clients' && <Clients c={active} {...viewProps} />}
      {active && curView === 'flotte' && <Flotte c={active} {...viewProps} />}
      {active && curView === 'salaires' && <Salaires c={active} {...viewProps} />}
      {active && curView === 'fourn' && <Fournisseurs c={active} {...viewProps} />}
      {active && curView === 'penalites' && <Penalites c={active} {...viewProps} />}
      {active && curView === 'balance' && <Balance c={active} {...viewProps} />}
      {active && curView === 'tva' && <TVA c={active} {...viewProps} />}
      {curView === 'comp' && (
        <Comparaison
          companies={companies}
          activeCompanyId={activeCompanyId}
          setActiveCompanyId={setActiveCompanyId}
          buildFlatCompanyView={buildFlatCompanyView}
          onImport={openImport}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".txt,.csv,.fec,text/plain,text/csv"
        style={{ display: 'none' }}
        onChange={onFileInput}
      />

      {importModal && (
        <div
          className="fec-modal-ov"
          style={{ zIndex: 10000 }}
          onDragOver={(ev) => ev.stopPropagation()}
          onDrop={(ev) => ev.stopPropagation()}
        >
          <div
            className="fec-modal fec-modal--wide"
            style={{ width: 'min(96vw, 1100px)', maxWidth: '96vw', position: 'relative', zIndex: 1 }}
          >
            <h3 style={{ margin: '0 0 8px' }}>
              Importer {importModal.rows.length} fichier{importModal.rows.length > 1 ? 's' : ''} FEC
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--fec-text2)' }}>
              Les fichiers avec le même SIREN (ou le même nom) sont regroupés dans un seul onglet société.
            </p>
            <div style={{ overflowX: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {importGroupsBySiren.map((g) => {
                const displayNom = g.items.map((r) => String(r.nom || '').trim()).find(Boolean) || '—'
                const nFiles = g.items.length
                const groupHeaderTitle = g.siren9
                  ? `── SIREN ${g.siren9} · ${displayNom} (${nFiles} fichier${nFiles > 1 ? 's' : ''}) ──`
                  : `── Sans SIREN · ${displayNom} (${nFiles} fichier${nFiles > 1 ? 's' : ''}) ──`
                return (
                <div
                  key={g.groupKey}
                  style={{
                    border: '1px solid var(--fec-border2)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    background: 'var(--fec-bg3)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fec-text2)', marginBottom: 8 }}>
                    {groupHeaderTitle}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--fec-text3)', borderBottom: '1px solid var(--fec-border2)' }}>
                        <th style={{ padding: '6px 8px 8px 0' }}>Fichier</th>
                        <th style={{ padding: '6px 8px 8px 0', minWidth: 180 }}>Société</th>
                        <th style={{ padding: '6px 8px 8px 0' }}>Année</th>
                        <th style={{ padding: '6px 8px 8px 0' }}>Période</th>
                        <th style={{ padding: '6px 8px 8px 0' }}>Action</th>
                        <th style={{ padding: '6px 0 8px 0', textAlign: 'right' }}>Écritures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((r) => {
                        let actionLabel = '…'
                        if (!r.analyzing) {
                          if (r.action === 'new') actionLabel = '✨ Nouveau'
                          else if (r.action === 'add_batch') actionLabel = `➕ Ajout à ${r.targetName}`
                          else if (r.action === 'add') actionLabel = `➕ Ajout à ${r.targetName}`
                          else if (r.action === 'replace') actionLabel = `🔄 Remplacer ${r.year}`
                        }
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid var(--fec-border)' }}>
                            <td
                              style={{
                                padding: '8px 8px 8px 0',
                                maxWidth: 180,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: 'ui-monospace, monospace',
                                fontSize: 11,
                              }}
                              title={r.fileName}
                            >
                              {r.analyzing ? <span style={{ color: 'var(--fec-text3)' }}>⏳ …</span> : r.fileName}
                            </td>
                            <td style={{ padding: '8px 8px 8px 0', verticalAlign: 'middle' }}>
                              <input
                                className="fec-fi"
                                style={{ margin: 0, fontSize: 12 }}
                                value={r.nom}
                                onChange={(e) => handleImportSirenGroupNameChange(g.items, r.key, e.target.value)}
                                placeholder="Saisir le nom..."
                              />
                            </td>
                            <td style={{ padding: '8px 8px 8px 0' }}>{r.analyzing ? '—' : r.year}</td>
                            <td style={{ padding: '8px 8px 8px 0', fontSize: 11, color: 'var(--fec-text2)' }}>
                              {r.analyzing ? '—' : r.periodRange}
                            </td>
                            <td style={{ padding: '8px 8px 8px 0', fontSize: 12, whiteSpace: 'nowrap' }}>{actionLabel}</td>
                            <td style={{ padding: '8px 0 8px 0', textAlign: 'right' }}>
                              {r.analyzing ? '…' : r.rowCount != null ? r.rowCount.toLocaleString('fr-FR') : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="fec-btn ghost" disabled={confirmLoading} onClick={closeImportModal}>
                Annuler
              </button>
              <button type="button" className="fec-btn" disabled={importAllDisabled} onClick={confirmImportAll}>
                {confirmLoading ? 'Import…' : 'Importer tout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importResultModal && (
        <div className="fec-modal-ov" style={{ zIndex: 10001 }} role="dialog" aria-labelledby="fec-import-result-title">
          <div className="fec-modal" style={{ width: 'min(96vw, 520px)', maxWidth: '96vw' }}>
            <h3 id="fec-import-result-title" style={{ margin: '0 0 16px' }}>
              ✅ Import terminé
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--fec-border2)', color: 'var(--fec-text3)' }}>
                  <th style={{ padding: '8px 8px 8px 0' }}>Société</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right' }}>Nouvelles</th>
                  <th style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>Doublons</th>
                </tr>
              </thead>
              <tbody>
                {importResultModal.lignes.map((line, idx) => (
                  <tr key={`${line.nom}-${idx}`} style={{ borderBottom: '1px solid var(--fec-border)' }}>
                    <td style={{ padding: '8px 8px 8px 0', verticalAlign: 'top' }}>
                      {line.nom}
                      {line.error ? (
                        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>{line.error}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(line.ecrituresImportees).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(line.ecrituresDoublons).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--fec-text2)' }}>
              Total :{' '}
              <strong>{Number(importResultModal.totalNouvelles).toLocaleString('fr-FR')}</strong> écritures importées
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--fec-text2)' }}>
              <strong>{Number(importResultModal.totalDoublons).toLocaleString('fr-FR')}</strong> écritures déjà présentes
              (ignorées)
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="fec-btn" onClick={() => setImportResultModal(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FECPage() {
  return (
    <FECProvider>
      <FECInner />
    </FECProvider>
  )
}
