import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Eye, EyeOff } from 'lucide-react'
import API_BASE from '../../config/api';
const API_CONFIGS = [
  {
    key: 'salesforce_sandbox',
    label: 'Salesforce Sandbox',
    icon: '☁️',
    description: 'Environnement de test Salesforce',
    fields: (data) => [
      { label: 'URL de connexion', value: data?.loginUrl },
      { label: 'Utilisateur', value: data?.username },
      { label: 'Security Token', value: data?.hasToken ? '••••' : null, secret: false },
    ],
  },
  {
    key: 'salesforce_prod',
    label: 'Salesforce Production',
    icon: '☁️',
    description: 'Environnement de production Salesforce',
    fields: (data) => [
      { label: 'URL de connexion', value: data?.loginUrl },
      { label: 'Utilisateur', value: data?.username },
      { label: 'Security Token', value: data?.hasToken ? 'Configuré ✓' : 'Manquant ✕', secret: false },
    ],
  },
  {
    key: 'wex',
    label: 'WEX Fleet',
    icon: '⛽',
    description: 'API cartes carburant WEX',
    fields: (data) => [
      { label: 'Base URL', value: data?.baseUrl },
      { label: 'Client ID', value: data?.clientId, secret: true },
      { label: 'Account Number', value: data?.accountNumber },
      {
        label: 'Dernière synchro',
        value: data?.lastSync ? new Date(data.lastSync).toLocaleString('fr-FR') : null,
      },
    ],
  },
  {
    key: 'webfleet',
    label: 'Webfleet',
    icon: '🚛',
    description: 'API télématique véhicules',
    fields: (data) => [
      { label: 'Account', value: data?.account },
      { label: 'Username', value: data?.username },
      { label: 'API Key', value: data?.hasApiKey ? 'Configurée ✓' : 'Manquante ✕', secret: false },
    ],
  },
  {
    key: 'smtp',
    credentialsKey: 'microsoft_graph',
    label: 'Email (Microsoft Graph)',
    icon: '📧',
    description: "Envoi d'emails via Microsoft Graph API",
    fields: (data) => {
      if (data?.type === 'SMTP') {
        return [
          { label: 'Type', value: data?.type },
          { label: 'Hôte', value: data?.host },
          { label: 'Port', value: data?.port != null ? String(data.port) : null },
          { label: 'Utilisateur', value: data?.user },
        ]
      }
      return [
        { label: 'Type', value: data?.type || 'Microsoft Graph' },
        { label: 'Expéditeur', value: data?.fromEmail },
        { label: 'Client ID', value: data?.clientId },
        { label: 'Tenant ID', value: data?.tenantId },
      ]
    },
  },
  {
    key: 'postgresql',
    label: 'PostgreSQL',
    icon: '🗄️',
    description: 'Base de données principale',
    fields: (data) => [{ label: 'Hôte', value: data?.host }],
  },
]

const API_FIELDS = {
  salesforce_sandbox: [
    { key: 'loginUrl', label: 'URL de connexion', placeholder: 'https://test.salesforce.com', secret: false },
    { key: 'username', label: "Nom d'utilisateur", placeholder: 'user@domain.com', secret: false },
    { key: 'password', label: 'Mot de passe', placeholder: '••••••••', secret: true },
    { key: 'securityToken', label: 'Security Token', placeholder: 'Token Salesforce', secret: true },
  ],
  salesforce_prod: [
    { key: 'loginUrl', label: 'URL de connexion', placeholder: 'https://login.salesforce.com', secret: false },
    { key: 'username', label: "Nom d'utilisateur", placeholder: 'user@domain.com', secret: false },
    { key: 'password', label: 'Mot de passe', placeholder: '••••••••', secret: true },
    { key: 'securityToken', label: 'Security Token', placeholder: 'Token Salesforce', secret: true },
  ],
  wex: [
    { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.wexapi.com', secret: false },
    { key: 'clientId', label: 'Client ID', placeholder: 'client_id', secret: true },
    { key: 'clientSecret', label: 'Client Secret', placeholder: '••••••••', secret: true },
    { key: 'username', label: "Nom d'utilisateur", placeholder: 'username', secret: false },
    { key: 'password', label: 'Mot de passe', placeholder: '••••••••', secret: true },
    { key: 'accountNumber', label: 'Account Number', placeholder: '12345678', secret: false },
  ],
  webfleet: [
    { key: 'account', label: 'Account', placeholder: 'transport-xxx', secret: false },
    { key: 'username', label: "Nom d'utilisateur", placeholder: 'username', secret: false },
    { key: 'password', label: 'Mot de passe', placeholder: '••••••••', secret: true },
    { key: 'apiKey', label: 'API Key', placeholder: 'votre-api-key', secret: true },
  ],
  smtp: [
    { key: 'host', label: 'Hôte SMTP', placeholder: 'smtp.office365.com', secret: false },
    { key: 'port', label: 'Port', placeholder: '587', secret: false },
    { key: 'user', label: 'Utilisateur', placeholder: 'user@domain.com', secret: false },
    { key: 'password', label: 'Mot de passe', placeholder: '••••••••', secret: true },
  ],
  microsoft_graph: [
    { key: 'tenantId', label: 'Tenant ID', placeholder: '1e8da374-...', secret: false },
    { key: 'clientId', label: 'Client ID', placeholder: '6d26944c-...', secret: false },
    { key: 'clientSecret', label: 'Client Secret', placeholder: '••••••••', secret: true },
    { key: 'fromEmail', label: 'Email expéditeur', placeholder: 'notifications@domain.com', secret: false },
  ],
  postgresql: [
    {
      key: 'connectionString',
      label: 'Connection String',
      placeholder: 'postgresql://user:pass@host:5432/db',
      secret: true,
    },
  ],
}

const StatusBadge = ({ statut }) => {
  const config =
    {
      connecté: { bg: '#ECFDF5', color: '#10B981', icon: '✓', label: 'Connecté' },
      erreur: { bg: '#FEF2F2', color: '#EF4444', icon: '✕', label: 'Erreur' },
      non_configure: { bg: '#F0F2F6', color: '#6B7280', icon: '—', label: 'Non configuré' },
    }[statut] || { bg: '#F0F2F6', color: '#6B7280', icon: '?', label: statut }

  return (
    <span
      style={{ background: config.bg, color: config.color }}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  )
}

const CredentialRow = ({ label, value, secret = false }) => {
  const [visible, setVisible] = useState(false)
  if (!value) return null
  const display = secret && !visible ? '••••••••••••' : value
  return (
    <div className="flex items-center justify-between border-b border-[#F0F2F6] py-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wider text-[#6B7280]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#0F1729] font-['DM_Mono']">{display}</span>
        {secret && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
            aria-label={visible ? 'Masquer' : 'Afficher'}
          >
            {visible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Connexions() {
  const [connexions, setConnexions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [editingApi, setEditingApi] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const fetchConnexions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/admin/connexions`)
      const data = await res.json()
      setConnexions(data.apis)
      setLastUpdate(new Date(data.timestamp))
    } catch (err) {
      console.error('Erreur chargement connexions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConnexions()
  }, [fetchConnexions])

  const openEdit = async (apiKey) => {
    setEditingApi(apiKey)
    setTestResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/admin/connexions/${apiKey}/credentials`)
      const data = await res.json()
      const base = data && typeof data === 'object' ? { ...data } : {}
      delete base.updatedAt
      setEditForm(base)
    } catch {
      setEditForm({})
    }
  }

  const saveCredentials = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/admin/connexions/${editingApi}/credentials`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        console.error('Erreur sauvegarde:', errBody.error || res.statusText)
        setTestResult({ statut: 'erreur', message: errBody.error || `HTTP ${res.status}` })
        return
      }
      setEditingApi(null)
      setEditForm({})
      setTestResult(null)
      fetchConnexions()
    } catch (err) {
      console.error('Erreur sauvegarde:', err)
      setTestResult({ statut: 'erreur', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const testConnexion = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/admin/connexions/${editingApi}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (err) {
      setTestResult({ statut: 'erreur', message: err.message })
    } finally {
      setTesting(false)
    }
  }

  const closeModal = () => {
    setEditingApi(null)
    setTestResult(null)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] font-['DM_Sans']">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E4E7EE] bg-white px-8 py-5">
        <div>
          <h1 className="font-['Syne'] text-xl font-bold text-[#0F1729]">Connexions API</h1>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Statut en temps réel des services connectés
            {lastUpdate && ` · Mis à jour à ${lastUpdate.toLocaleTimeString('fr-FR')}`}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchConnexions}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-[#F0F2F6] px-4 py-2 text-sm font-semibold text-[#0F1729] transition-colors hover:bg-[#E4E7EE] disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Résumé statuts */}
      {connexions && (
        <div className="flex flex-wrap items-center gap-4 px-8 py-4">
          {['connecté', 'erreur', 'non_configure'].map((s) => {
            const count = Object.values(connexions).filter((a) => a.statut === s).length
            if (!count) return null
            const colors = {
              connecté: 'text-[#10B981] bg-[#ECFDF5]',
              erreur: 'text-[#EF4444] bg-[#FEF2F2]',
              non_configure: 'text-[#6B7280] bg-[#F0F2F6]',
            }
            const labels = {
              connecté: 'connectées',
              erreur: 'en erreur',
              non_configure: 'non configurées',
            }
            return (
              <span key={s} className={`rounded-full px-3 py-1 text-xs font-bold ${colors[s]}`}>
                {count} {labels[s]}
              </span>
            )
          })}
        </div>
      )}

      {/* Grille des APIs */}
      <div className="grid grid-cols-1 gap-4 px-8 pb-8 md:grid-cols-2">
        {API_CONFIGS.map((api) => {
          const data = connexions?.[api.key]
          const fields = data ? api.fields(data) : []
          const visibleFields = fields.filter((f) => f.value)
          return (
            <div key={api.key} className="overflow-hidden rounded-xl border border-[#E4E7EE] bg-white">
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-[#F0F2F6] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{api.icon}</span>
                  <div>
                    <div className="font-['Syne'] text-sm font-bold text-[#0F1729]">{api.label}</div>
                    <div className="text-xs text-[#9CA3AF]">{api.description}</div>
                  </div>
                </div>
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
                ) : (
                  <StatusBadge statut={data?.statut || 'non_configure'} />
                )}
              </div>
              {/* Message erreur */}
              {data?.statut === 'erreur' && data?.message && (
                <div className="border-b border-[#FEE2E2] bg-[#FEF2F2] px-5 py-3">
                  <p className="text-xs font-medium text-[#EF4444]">{data.message}</p>
                </div>
              )}
              {/* Credentials */}
              <div className="px-5 py-3">
                {visibleFields.map((f) => (
                  <CredentialRow key={f.label} label={f.label} value={f.value} secret={f.secret} />
                ))}
                {visibleFields.length === 0 && (
                  <p className="py-2 text-xs text-[#9CA3AF]">Aucune information disponible</p>
                )}
              </div>
              <div className="border-t border-[#F0F2F6] px-5 py-3">
                <button
                  type="button"
                  onClick={() => openEdit(api.credentialsKey || api.key)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#2563EB] transition-colors hover:text-blue-700"
                >
                  ✏️ Modifier les credentials
                </button>
                {api.key === 'smtp' && connexions?.smtp?.statut === 'connecté' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_BASE}/api/admin/mail/test`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ to: 'ggleizes@groupeg2l.fr' }),
                        })
                        const data = await res.json()
                        if (data.success) alert('✅ Email envoyé avec succès !')
                        else alert('❌ Erreur : ' + (data.error || 'Inconnue'))
                      } catch (err) {
                        alert('❌ Erreur : ' + err.message)
                      }
                    }}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#10B981] transition-colors hover:text-green-700"
                  >
                    📧 Envoyer un email de test
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editingApi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#E4E7EE] bg-white px-6 py-4">
              <div>
                <h2 className="font-['Syne'] text-base font-bold text-[#0F1729]">
                  {API_CONFIGS.find((a) => a.key === editingApi || a.credentialsKey === editingApi)?.label}
                </h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">Modifier les credentials de connexion</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-[#6B7280] hover:bg-[#F0F2F6]"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4 p-6">
              {(API_FIELDS[editingApi] || []).map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={editForm[field.key] ?? ''}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      className="w-full rounded-lg border border-[#E4E7EE] px-3 py-2.5 text-sm text-[#0F1729] font-['DM_Mono'] transition-colors focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                </div>
              ))}

              {testResult && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                    testResult.statut === 'connecté'
                      ? 'bg-[#ECFDF5] text-[#10B981]'
                      : 'bg-[#FEF2F2] text-[#EF4444]'
                  }`}
                >
                  {testResult.statut === 'connecté' ? '✓' : '✕'} {testResult.message}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#E4E7EE] bg-white px-6 py-4">
              <button
                type="button"
                onClick={testConnexion}
                disabled={testing}
                className="flex items-center gap-2 rounded-lg bg-[#F0F2F6] px-4 py-2 text-sm font-semibold text-[#0F1729] transition-colors hover:bg-[#E4E7EE] disabled:opacity-50"
              >
                {testing ? '⏳ Test...' : '🔌 Tester la connexion'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-[#F0F2F6]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveCredentials}
                  disabled={saving}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '⏳ Sauvegarde...' : '✓ Sauvegarder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
