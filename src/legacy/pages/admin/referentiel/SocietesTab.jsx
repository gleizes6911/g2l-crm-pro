import { useState, useEffect } from 'react'
import { Plus, Edit2, Power, PowerOff, X, Save, AlertTriangle } from 'lucide-react'
import { StatusBadge } from '../../../design'
import API_BASE from '../../../config/api'

const TYPES_SOCIETE = [
  { value: 'HOLDING', label: 'Holding', group: 'Groupe G2L' },
  { value: 'FILIALE', label: 'Filiale', group: 'Groupe G2L' },
  { value: 'STANDALONE', label: 'Entité autonome', group: 'Groupe G2L' },
  { value: 'PRESTATAIRE_LIVRAISON', label: 'Prestataire livraison', group: 'Partenaires' },
  { value: 'SOUS_TRAITANT', label: 'Sous-traitant', group: 'Partenaires' },
  { value: 'AUTRE', label: 'Autre', group: 'Partenaires' },
]

const TYPE_COLORS = {
  HOLDING: 'success',
  FILIALE: 'success',
  STANDALONE: 'warning',
  PRESTATAIRE_LIVRAISON: 'info',
  SOUS_TRAITANT: 'info',
  AUTRE: 'neutral',
}

const TYPE_LABELS = {
  HOLDING: 'Holding',
  FILIALE: 'Filiale',
  STANDALONE: 'Autonome',
  PRESTATAIRE_LIVRAISON: 'Prestataire',
  SOUS_TRAITANT: 'Sous-traitant',
  AUTRE: 'Autre',
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-[var(--color-border)]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--color-ink)]">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5 font-mono">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, required, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)] flex items-center gap-1">
        {label}
        {required && <span className="text-[var(--color-danger)]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-[var(--color-faint)] font-mono">{hint}</p>}
    </div>
  )
}

const inputClass = `w-full px-3 py-2 text-[13px]
  bg-[var(--color-bg)] border border-[var(--color-border)]
  rounded-[var(--radius-sm)] text-[var(--color-ink)]
  placeholder:text-[var(--color-faint)]
  focus:outline-none focus:border-[var(--color-primary)]
  transition-colors`

export default function SocietesTab() {
  const [societes, setSocietes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [filterType, setFilterType] = useState('all')

  const emptyForm = {
    code: '',
    nom: '',
    nom_court: '',
    siren: '',
    type: 'PRESTATAIRE_LIVRAISON',
    patterns_sf: [],
    compte_fec_achat: '',
    contact_nom: '',
    contact_email: '',
    contact_tel: '',
    date_debut: '',
    date_fin: '',
    notes: '',
    actif: true,
  }
  const [form, setForm] = useState(emptyForm)
  const [patternInput, setPatternInput] = useState('')

  const fetchSocietes = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/referentiel/societes?actif=all`)
      const d = await res.json()
      setSocietes(d.societes || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSocietes()
  }, [])

  const openAdd = () => {
    setForm(emptyForm)
    setPatternInput('')
    setError(null)
    setModal('add')
  }

  const openEdit = (s) => {
    setSelected(s)
    setForm({
      code: s.code,
      nom: s.nom,
      nom_court: s.nom_court || '',
      siren: s.siren || '',
      type: s.type,
      patterns_sf: Array.isArray(s.patterns_sf) ? [...s.patterns_sf] : [],
      compte_fec_achat: s.compte_fec_achat || '',
      contact_nom: s.contact_nom || '',
      contact_email: s.contact_email || '',
      contact_tel: s.contact_tel || '',
      date_debut: s.date_debut ? String(s.date_debut).split('T')[0] : '',
      date_fin: s.date_fin ? String(s.date_fin).split('T')[0] : '',
      notes: s.notes || '',
      actif: s.actif,
    })
    setPatternInput('')
    setError(null)
    setModal('edit')
  }

  const handleSave = async () => {
    if (!form.code || !form.nom || !form.type) {
      setError('Code, nom et type sont requis')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url =
        modal === 'add'
          ? `${API_BASE}/api/referentiel/societes`
          : `${API_BASE}/api/referentiel/societes/${selected.id}`
      const method = modal === 'add' ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          patterns_sf: form.patterns_sf,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Erreur lors de la sauvegarde')
        return
      }
      await fetch(`${API_BASE}/api/dashboard-groupe/referentiel/invalidate-cache`, { method: 'POST' })
      setModal(null)
      fetchSocietes()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActif = async (s) => {
    try {
      await fetch(`${API_BASE}/api/referentiel/societes/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !s.actif }),
      })
      await fetch(`${API_BASE}/api/dashboard-groupe/referentiel/invalidate-cache`, { method: 'POST' })
      fetchSocietes()
    } catch (err) {
      console.error(err)
    }
  }

  const addPattern = () => {
    const p = patternInput.trim()
    if (!p || form.patterns_sf.includes(p)) return
    setForm((f) => ({ ...f, patterns_sf: [...f.patterns_sf, p] }))
    setPatternInput('')
  }

  const removePattern = (p) => {
    setForm((f) => ({
      ...f,
      patterns_sf: f.patterns_sf.filter((x) => x !== p),
    }))
  }

  const groupe = societes.filter((s) => ['HOLDING', 'FILIALE', 'STANDALONE'].includes(s.type))
  const partenaires = societes.filter((s) =>
    ['PRESTATAIRE_LIVRAISON', 'SOUS_TRAITANT', 'AUTRE'].includes(s.type),
  )

  const filtered =
    filterType === 'all' ? societes : filterType === 'groupe' ? groupe : partenaires

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all', label: `Tout (${societes.length})` },
            { key: 'groupe', label: `Groupe G2L (${groupe.length})` },
            { key: 'partenaires', label: `Partenaires (${partenaires.length})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterType(key)}
              className={`text-[11px] font-mono px-3 py-1.5 rounded-[var(--radius-sm)] border transition-colors ${
                filterType === key
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity shadow-[var(--shadow-sm)]"
        >
          <Plus size={14} />
          Ajouter
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-[12px] min-w-[720px]">
          <thead>
            <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              {['Code', 'Nom', 'Type', 'SIREN', 'Patterns SF', 'Compte FEC', 'Statut', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className={`border-b border-[var(--color-border)] last:border-0 transition-colors hover:bg-[var(--color-bg)] ${
                  !s.actif ? 'opacity-50' : ''
                }`}
              >
                <td className="px-3 py-2.5 font-mono font-medium text-[var(--color-primary)]">{s.code}</td>
                <td className="px-3 py-2.5">
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">{s.nom}</p>
                    {s.nom_court && s.nom_court !== s.nom && (
                      <p className="text-[10px] text-[var(--color-muted)] font-mono">{s.nom_court}</p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge
                    label={TYPE_LABELS[s.type] || s.type}
                    variant={TYPE_COLORS[s.type] || 'neutral'}
                  />
                </td>
                <td className="px-3 py-2.5 font-mono text-[var(--color-muted)] text-[11px]">{s.siren || '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {(Array.isArray(s.patterns_sf) ? s.patterns_sf : []).slice(0, 3).map((p) => (
                      <span
                        key={p}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-info-bg)] text-[var(--color-info)] border border-[var(--color-info-border)]"
                      >
                        {p}
                      </span>
                    ))}
                    {(Array.isArray(s.patterns_sf) ? s.patterns_sf : []).length > 3 && (
                      <span className="text-[9px] font-mono text-[var(--color-faint)]">
                        +{(Array.isArray(s.patterns_sf) ? s.patterns_sf : []).length - 3}
                      </span>
                    )}
                    {(Array.isArray(s.patterns_sf) ? s.patterns_sf : []).length === 0 && (
                      <span className="text-[var(--color-faint)]">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-[var(--color-muted)] text-[11px]">
                  {s.compte_fec_achat || '—'}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={s.actif ? 'Actif' : 'Inactif'} variant={s.actif ? 'success' : 'neutral'} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] transition-colors"
                      title="Modifier"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActif(s)}
                      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                        s.actif
                          ? 'text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-success)] hover:bg-[var(--color-success-bg)]'
                      }`}
                      title={s.actif ? 'Désactiver' : 'Activer'}
                    >
                      {s.actif ? <PowerOff size={13} /> : <Power size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal === 'add' ? 'Ajouter une société' : `Modifier — ${selected?.nom}`}
          subtitle={modal === 'edit' ? `ID: ${selected?.id}` : undefined}
          onClose={() => setModal(null)}
        >
          <div className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-[var(--color-danger-bg)] rounded-[var(--radius-sm)] border border-[var(--color-danger-border)]">
                <AlertTriangle size={14} className="text-[var(--color-danger)] shrink-0" />
                <p className="text-[12px] text-[var(--color-danger)]">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Code" required hint="Ex: NEXHAUL, GLOBAL_DRIVE (unique, non modifiable)">
                <input
                  className={inputClass}
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  disabled={modal === 'edit'}
                  placeholder="EX: NEXHAUL"
                />
              </FormField>
              <FormField label="Nom court">
                <input
                  className={inputClass}
                  value={form.nom_court}
                  onChange={(e) => setForm((f) => ({ ...f, nom_court: e.target.value }))}
                  placeholder="Ex: NEXHAUL"
                />
              </FormField>
            </div>

            <FormField label="Nom complet" required>
              <input
                className={inputClass}
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Ex: NEXHAUL SAS"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type" required>
                <select
                  className={inputClass}
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {TYPES_SOCIETE.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.group} — {t.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="SIREN">
                <input
                  className={inputClass}
                  value={form.siren}
                  onChange={(e) => setForm((f) => ({ ...f, siren: e.target.value }))}
                  placeholder="123456789"
                  maxLength={14}
                />
              </FormField>
            </div>

            {['PRESTATAIRE_LIVRAISON', 'SOUS_TRAITANT'].includes(form.type) && (
              <FormField
                label="Patterns Salesforce"
                hint="Noms SF utilisés pour détecter les chauffeurs de ce prestataire"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)]">
                    {form.patterns_sf.map((p) => (
                      <span
                        key={p}
                        className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-info-bg)] text-[var(--color-info)] border border-[var(--color-info-border)]"
                      >
                        {p}
                        <button
                          type="button"
                          onClick={() => removePattern(p)}
                          className="hover:text-[var(--color-danger)] transition-colors ml-0.5"
                          aria-label={`Retirer ${p}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {form.patterns_sf.length === 0 && (
                      <span className="text-[11px] text-[var(--color-faint)] font-mono">Aucun pattern défini</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      className={`${inputClass} flex-1`}
                      value={patternInput}
                      onChange={(e) => setPatternInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPattern())}
                      placeholder="Ex: GDS64, NEXHAUL, ADELL..."
                    />
                    <button
                      type="button"
                      onClick={addPattern}
                      className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[11px] font-mono hover:opacity-90 transition-opacity"
                    >
                      + Ajouter
                    </button>
                  </div>
                </div>
              </FormField>
            )}

            {['PRESTATAIRE_LIVRAISON', 'SOUS_TRAITANT'].includes(form.type) && (
              <FormField label="Compte FEC achat" hint="Compte sur lequel sont comptabilisées les factures (ex: 622800)">
                <input
                  className={inputClass}
                  value={form.compte_fec_achat}
                  onChange={(e) => setForm((f) => ({ ...f, compte_fec_achat: e.target.value }))}
                  placeholder="622800"
                />
              </FormField>
            )}

            <div className="pt-2 border-t border-[var(--color-border)]">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
                Contact (optionnel)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField label="Nom contact">
                  <input
                    className={inputClass}
                    value={form.contact_nom}
                    onChange={(e) => setForm((f) => ({ ...f, contact_nom: e.target.value }))}
                    placeholder="Jean Dupont"
                  />
                </FormField>
                <FormField label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                    placeholder="contact@exemple.fr"
                  />
                </FormField>
                <FormField label="Téléphone">
                  <input
                    className={inputClass}
                    value={form.contact_tel}
                    onChange={(e) => setForm((f) => ({ ...f, contact_tel: e.target.value }))}
                    placeholder="06 00 00 00 00"
                  />
                </FormField>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Date début contrat">
                <input
                  className={inputClass}
                  type="date"
                  value={form.date_debut}
                  onChange={(e) => setForm((f) => ({ ...f, date_debut: e.target.value }))}
                />
              </FormField>
              <FormField label="Date fin contrat">
                <input
                  className={inputClass}
                  type="date"
                  value={form.date_fin}
                  onChange={(e) => setForm((f) => ({ ...f, date_fin: e.target.value }))}
                />
              </FormField>
            </div>

            <FormField label="Notes">
              <textarea
                className={`${inputClass} resize-none`}
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Informations complémentaires..."
              />
            </FormField>

            {modal === 'edit' && (
              <div className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                <input
                  type="checkbox"
                  id="actif"
                  checked={form.actif}
                  onChange={(e) => setForm((f) => ({ ...f, actif: e.target.checked }))}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
                <label htmlFor="actif" className="text-[12px] text-[var(--color-ink)] cursor-pointer">
                  Société active
                  <span className="text-[10px] text-[var(--color-muted)] ml-2 font-mono">
                    (désactiver exclut les patterns du matching SF)
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[12px] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                {modal === 'add' ? 'Créer' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
