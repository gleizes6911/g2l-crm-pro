import { useState, useEffect } from 'react'
import { Edit2, Save, X, AlertTriangle } from 'lucide-react'
import API_BASE from '../../../config/api'

const CATEGORIE_LABELS = {
  CA: { label: "Chiffre d'affaires", color: '#2563EB' },
  MASSE_SALARIALE: { label: 'Masse salariale', color: '#0d9488' },
  CARBURANT: { label: 'Carburant', color: '#d97706' },
  LOYERS_FLOTTE: { label: 'Loyers flotte', color: '#7c3aed' },
  ASSURANCES: { label: 'Assurances', color: '#dc2626' },
  SOUS_TRAITANCE: { label: 'Sous-traitance', color: '#6366f1' },
  ENTRETIEN: { label: 'Entretien véhicules', color: '#059669' },
  FRAIS_GENERAUX: { label: 'Frais généraux', color: '#6b7280' },
  AMORTISSEMENTS: { label: 'Amortissements', color: '#374151' },
}

const inputClass = `w-full px-3 py-2 text-[13px]
  bg-[var(--color-bg)] border border-[var(--color-border)]
  rounded-[var(--radius-sm)] text-[var(--color-ink)]
  placeholder:text-[var(--color-faint)]
  focus:outline-none focus:border-[var(--color-primary)]
  transition-colors`

function normalizeComptes(raw) {
  if (Array.isArray(raw)) return raw.map(String)
  if (raw && typeof raw === 'object') return Object.values(raw).map(String)
  return []
}

export default function ParametresTab() {
  const [params, setParams] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [compteInput, setCompteInput] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/referentiel/parametres-comptables`)
      .then((r) => r.json())
      .then((d) => setParams(d.parametres || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const openEdit = (p) => {
    setEditing(p.id)
    setEditForm({
      comptes_fec: normalizeComptes(p.comptes_fec),
      description: p.description || '',
      inclus_consolid: p.inclus_consolid !== false,
    })
    setCompteInput('')
    setError(null)
  }

  const handleSave = async (id) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/referentiel/parametres-comptables/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Erreur sauvegarde')
        return
      }
      const updated = d.parametre
      if (updated) {
        setParams((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...updated,
                  comptes_fec: normalizeComptes(updated.comptes_fec),
                }
              : p,
          ),
        )
      }
      setEditing(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addCompte = () => {
    const c = compteInput.trim()
    if (!c || editForm.comptes_fec.includes(c)) return
    setEditForm((f) => ({
      ...f,
      comptes_fec: [...f.comptes_fec, c],
    }))
    setCompteInput('')
  }

  const removeCompte = (c) => {
    setEditForm((f) => ({
      ...f,
      comptes_fec: f.comptes_fec.filter((x) => x !== c),
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="p-3 bg-[var(--color-info-bg)] rounded-[var(--radius-md)] border border-[var(--color-info-border)]">
        <p className="text-[11px] text-[var(--color-info)] font-mono">
          ⓘ Ces paramètres définissent le mapping entre les comptes FEC et les catégories de coûts utilisées dans le
          calcul de rentabilité. Modifier un compte ici met à jour immédiatement tous les calculs.
        </p>
      </div>

      {params.map((p) => {
        const meta = CATEGORIE_LABELS[p.categorie] || {
          label: p.categorie,
          color: '#6b7280',
        }
        const isEditing = editing === p.id
        const comptesList = normalizeComptes(p.comptes_fec)

        return (
          <div
            key={p.id}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-[13px] font-semibold text-[var(--color-ink)] truncate">{meta.label}</span>
                <span className="text-[10px] font-mono text-[var(--color-faint)] shrink-0">{p.categorie}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSave(p.id)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[11px] font-mono hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save size={11} />
                      )}
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]"
                      aria-label="Annuler"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors"
                  >
                    <Edit2 size={11} />
                    Modifier
                  </button>
                )}
              </div>
            </div>

            <div className="p-4">
              {isEditing ? (
                <div className="space-y-3">
                  {error && (
                    <div className="flex items-center gap-2 p-2 bg-[var(--color-danger-bg)] rounded border border-[var(--color-danger-border)]">
                      <AlertTriangle size={12} className="text-[var(--color-danger)] shrink-0" />
                      <p className="text-[11px] text-[var(--color-danger)]">{error}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
                      Comptes FEC inclus
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)]">
                      {editForm.comptes_fec.map((c) => (
                        <span
                          key={c}
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
                        >
                          {c}
                          <button
                            type="button"
                            onClick={() => removeCompte(c)}
                            className="hover:text-[var(--color-danger)] transition-colors"
                            aria-label={`Retirer ${c}`}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        value={compteInput}
                        onChange={(e) => setCompteInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompte())}
                        placeholder="Ex: 641100, 645300..."
                      />
                      <button
                        type="button"
                        onClick={addCompte}
                        className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[11px] font-mono hover:opacity-90 transition-opacity"
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                      Description
                    </p>
                    <input
                      className={inputClass}
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`consolid-${p.id}`}
                      checked={editForm.inclus_consolid}
                      onChange={(e) => setEditForm((f) => ({ ...f, inclus_consolid: e.target.checked }))}
                      className="w-4 h-4 accent-[var(--color-primary)]"
                    />
                    <label htmlFor={`consolid-${p.id}`} className="text-[12px] text-[var(--color-ink)] cursor-pointer">
                      Inclus dans la consolidation groupe
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-2">
                      Comptes FEC ({comptesList.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {comptesList.map((c) => (
                        <span
                          key={c}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="w-full sm:w-64 shrink-0">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-1">
                      Description
                    </p>
                    <p className="text-[12px] text-[var(--color-muted)]">{p.description || '—'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
