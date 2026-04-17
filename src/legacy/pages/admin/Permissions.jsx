import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Shield } from 'lucide-react'
import API_BASE from '../../config/api';
const MODULES = [
  {
    id: 'direction',
    label: 'Direction',
    icon: '🎯',
    subs: [
      { id: 'suivi-global', label: 'Suivi Global', actions: ['lire', 'exporter'] },
      { id: 'prefact-prestataires', label: 'Préfact. Prestataires', actions: ['lire', 'écrire', 'exporter'] },
      { id: 'prefact-clients', label: 'Préfact. Clients', actions: ['lire', 'écrire', 'exporter'] },
      { id: 'analyse-financiere', label: 'Analyse financière', actions: ['lire', 'exporter'] },
      { id: 'rentabilite', label: 'Rentabilité', actions: ['lire', 'exporter'] },
      { id: 'ticpe', label: 'TICPE', actions: ['lire', 'exporter'] },
      { id: 'fec', label: 'Dashboard FEC', actions: ['lire', 'exporter'] },
    ],
  },
  {
    id: 'exploitation',
    label: 'Exploitation',
    icon: '🚚',
    subs: [
      { id: 'dashboard-exploitation', label: 'Dashboard', actions: ['lire'] },
      { id: 'planning-chargeur', label: 'Planning chargeur', actions: ['lire', 'écrire'] },
      { id: 'suivi-colis', label: 'Suivi colis', actions: ['lire', 'écrire'] },
      { id: 'carburant', label: 'Carburant', actions: ['lire', 'écrire', 'exporter'] },
      { id: 'sav', label: 'SAV', actions: ['lire', 'écrire', 'exporter'] },
      { id: 'cdg', label: 'Contrôle Gestion', actions: ['lire', 'exporter'] },
    ],
  },
  {
    id: 'rh',
    label: 'RH',
    icon: '👥',
    subs: [
      { id: 'dashboard-rh', label: 'Dashboard', actions: ['lire'] },
      { id: 'graphiques-rh', label: 'Graphiques', actions: ['lire', 'exporter'] },
      { id: 'organigramme', label: 'Organigramme', actions: ['lire'] },
      { id: 'employes', label: 'Employés', actions: ['lire', 'écrire'] },
      { id: 'absences', label: 'Absences', actions: ['lire', 'écrire', 'valider'] },
      { id: 'soldes-cp', label: 'Soldes CP', actions: ['lire', 'écrire'] },
      { id: 'documents', label: 'Documents', actions: ['lire', 'écrire', 'supprimer'] },
      { id: 'acomptes', label: 'Acomptes', actions: ['lire', 'écrire', 'valider'] },
    ],
  },
  {
    id: 'parc',
    label: 'Gestion Parc',
    icon: '🔧',
    subs: [
      { id: 'dashboard-parc', label: 'Dashboard', actions: ['lire'] },
      { id: 'ordres-reparation', label: 'Ordres réparation', actions: ['lire', 'écrire', 'supprimer'] },
      { id: 'stock', label: 'Stock', actions: ['lire', 'écrire'] },
      { id: 'planning-garage', label: 'Planning garage', actions: ['lire', 'écrire'] },
      { id: 'fournisseurs', label: 'Fournisseurs', actions: ['lire', 'écrire', 'supprimer'] },
      { id: 'recherche-vehicules', label: 'Recherche véhicules', actions: ['lire'] },
    ],
  },
  {
    id: 'daf',
    label: 'DAF',
    icon: '💰',
    subs: [
      { id: 'mad', label: 'Mises à disposition', actions: ['lire', 'écrire'] },
      { id: 'webfleet', label: 'Webfleet', actions: ['lire'] },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: '👑',
    subs: [
      { id: 'utilisateurs', label: 'Utilisateurs', actions: ['lire', 'écrire', 'supprimer'] },
      { id: 'permissions', label: 'Permissions', actions: ['lire', 'écrire'] },
      { id: 'connexions', label: 'Connexions API', actions: ['lire', 'écrire'] },
      { id: 'salesforce', label: 'Salesforce', actions: ['lire', 'écrire'] },
    ],
  },
]

const DEFAULT_PERMISSIONS = {
  ADMIN: 'all',
  RH: ['rh.*', 'direction.suivi-global.lire'],
  MANAGER: ['rh.absences.lire', 'rh.absences.valider', 'rh.employes.lire', 'exploitation.*'],
  EXPLOITATION: ['exploitation.*', 'sav.lire'],
  COMPTABLE: ['rh.acomptes.lire', 'rh.acomptes.valider'],
  GESTIONNAIRE_PARC: ['parc.*'],
  EMPLOYE: ['rh.absences.lire', 'rh.documents.lire', 'rh.soldes-cp.lire'],
}

const ACTION_ORDER = ['lire', 'écrire', 'exporter', 'valider', 'supprimer']

function stateKey(moduleKey, action) {
  return `${moduleKey}|${action}`
}

function buildPermissionItems() {
  const items = []
  for (const mod of MODULES) {
    for (const sub of mod.subs) {
      const moduleKey = `${mod.id}.${sub.id}`
      for (const act of sub.actions) {
        items.push({ mod, sub, moduleKey, act, subId: sub.id })
      }
    }
  }
  return items
}

function findModuleKeyForSubId(subId) {
  for (const mod of MODULES) {
    const sub = mod.subs.find((s) => s.id === subId)
    if (sub) return `${mod.id}.${sub.id}`
  }
  return null
}

/** Normalise une ligne DB (module = sousModuleId OU legacy parent.sub) vers stateKey */
function dbRowToStateKey(rowModule, rowAction) {
  if (!rowModule) return null
  if (rowModule.includes('.')) {
    return `${rowModule}|${rowAction}`
  }
  const mk = findModuleKeyForSubId(rowModule)
  if (mk) return `${mk}|${rowAction}`
  return `${rowModule}|${rowAction}`
}

function expandRoleDefaults(role) {
  const map = new Map()
  const def = DEFAULT_PERMISSIONS[role]
  if (!def) return map
  if (def === 'all') {
    for (const { moduleKey, act } of buildPermissionItems()) {
      map.set(stateKey(moduleKey, act), true)
    }
    return map
  }
  for (const p of def) {
    if (p.endsWith('.*')) {
      const modId = p.slice(0, -2)
      const mod = MODULES.find((m) => m.id === modId)
      if (mod) {
        for (const sub of mod.subs) {
          const mk = `${mod.id}.${sub.id}`
          for (const act of sub.actions) {
            map.set(stateKey(mk, act), true)
          }
        }
      }
    } else {
      const parts = p.split('.')
      if (parts.length >= 3) {
        const act = parts[parts.length - 1]
        const subId = parts[parts.length - 2]
        const modId = parts.slice(0, -2).join('.')
        const mk = `${modId}.${subId}`
        map.set(stateKey(mk, act), true)
      } else if (parts.length === 2) {
        const [subOrShortcut, act] = parts
        const mk = findModuleKeyForSubId(subOrShortcut)
        if (mk) map.set(stateKey(mk, act), true)
      }
    }
  }
  return map
}

function mergeEffectivePermissions(dbList, role) {
  const defaults = expandRoleDefaults(role)
  const dbMap = new Map()
  if (Array.isArray(dbList)) {
    for (const row of dbList) {
      const sk = dbRowToStateKey(row.module, row.action)
      if (sk) dbMap.set(sk, !!row.autorise)
    }
  }
  const effective = {}
  for (const { moduleKey, act } of buildPermissionItems()) {
    const k = stateKey(moduleKey, act)
    if (dbMap.has(k)) {
      effective[k] = dbMap.get(k)
    } else {
      effective[k] = !!defaults.get(k)
    }
  }
  return effective
}

function getRoleColor(role) {
  const colors = {
    RH: 'bg-purple-600',
    MANAGER: 'bg-blue-600',
    EMPLOYE: 'bg-green-600',
    COMPTABLE: 'bg-indigo-600',
    GESTIONNAIRE_PARC: 'bg-orange-600',
    EXPLOITATION: 'bg-teal-600',
    ADMIN: 'bg-red-600',
    DIRECTION: 'bg-slate-700',
  }
  return colors[role] || 'bg-gray-600'
}

function roleLabel(role) {
  const m = {
    ADMIN: 'Administrateur',
    RH: 'RH',
    MANAGER: 'Manager',
    EMPLOYE: 'Employé',
    COMPTABLE: 'Comptable',
    GESTIONNAIRE_PARC: 'Gestionnaire parc',
    EXPLOITATION: 'Exploitation',
    DIRECTION: 'Direction',
  }
  return m[role] || role
}

function initialsFromUser(u) {
  const nom = u?.nom || ''
  const prenom = u?.prenom || ''
  const full = `${prenom} ${nom}`.trim() || nom || u?.email || ''
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return '?'
}

function Toggle({ checked, disabled, onChange, busy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || busy}
      onClick={() => !disabled && !busy && onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 ${
        checked ? 'bg-[#2563EB]' : 'bg-[#E4E7EE]'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${busy ? 'opacity-70' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-2/3 rounded-lg bg-[#E4E7EE]" />
      <div className="h-64 rounded-xl border border-[#E4E7EE] bg-white" />
      <div className="h-64 rounded-xl border border-[#E4E7EE] bg-white" />
    </div>
  )
}

function UserListSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-[72px] rounded-lg bg-[#E4E7EE]/80" />
      ))}
    </div>
  )
}

export default function Permissions() {
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [permState, setPermState] = useState({})
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [busyKeys, setBusyKeys] = useState({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message) => {
    setToast(message)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) || null,
    [users, selectedId]
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const nom =
        u.nomComplet || `${u.prenom || ''} ${u.nom || ''}`.trim() || ''
      return (
        nom.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q))
      )
    })
  }, [users, search])

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch(`${API_BASE}/api/utilisateurs`)
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!selectedUser) {
      setPermState({})
      return
    }
    if (selectedUser.role === 'ADMIN') {
      setPermState({})
      setLoadingPerms(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingPerms(true)
      try {
        let dbList = []
        try {
          const res = await fetch(`${API_BASE}/api/permissions/${selectedUser.id}`)
          if (res.ok) dbList = await res.json()
        } catch (err) {
          console.warn(err)
        }
        const merged = mergeEffectivePermissions(dbList, selectedUser.role)
        if (!cancelled) setPermState(merged)
      } finally {
        if (!cancelled) setLoadingPerms(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedUser])

  /** API : module = sousModuleId (id du sous-module) */
  const postPermission = async (utilisateurId, sousModuleId, action, autorise) => {
    const res = await fetch(`${API_BASE}/api/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utilisateurId, module: sousModuleId, action, autorise }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erreur sauvegarde permission')
    }
  }

  const setBusy = (k, v) => {
    setBusyKeys((prev) => ({ ...prev, [k]: v }))
  }

  const handleToggle = async (moduleKey, subId, action, next) => {
    if (!selectedUser || selectedUser.role === 'ADMIN') return
    const sk = stateKey(moduleKey, action)
    setBusy(sk, true)
    const prev = permState[sk]
    setPermState((s) => ({ ...s, [sk]: next }))
    try {
      await postPermission(selectedUser.id, subId, action, next)
      showToast('Permission enregistrée')
    } catch (e) {
      setPermState((s) => ({ ...s, [sk]: prev }))
      console.error(e)
    } finally {
      setBusy(sk, false)
    }
  }

  const handleModuleAllowAll = async (mod) => {
    if (!selectedUser || selectedUser.role === 'ADMIN') return
    setBulkBusy(true)
    try {
      for (const sub of mod.subs) {
        const mk = `${mod.id}.${sub.id}`
        for (const act of sub.actions) {
          const sk = stateKey(mk, act)
          setPermState((s) => ({ ...s, [sk]: true }))
          await postPermission(selectedUser.id, sub.id, act, true)
        }
      }
      showToast('Module mis à jour')
    } catch (e) {
      console.error(e)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleModuleRevokeAll = async (mod) => {
    if (!selectedUser || selectedUser.role === 'ADMIN') return
    setBulkBusy(true)
    try {
      for (const sub of mod.subs) {
        const mk = `${mod.id}.${sub.id}`
        for (const act of sub.actions) {
          const sk = stateKey(mk, act)
          setPermState((s) => ({ ...s, [sk]: false }))
          await postPermission(selectedUser.id, sub.id, act, false)
        }
      }
      showToast('Module mis à jour')
    } catch (e) {
      console.error(e)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleApplyRoleDefaults = async () => {
    if (!selectedUser || selectedUser.role === 'ADMIN') return
    setBulkBusy(true)
    const defaults = expandRoleDefaults(selectedUser.role)
    try {
      const next = { ...permState }
      for (const { moduleKey, act, subId } of buildPermissionItems()) {
        const sk = stateKey(moduleKey, act)
        const val = !!defaults.get(sk)
        next[sk] = val
        await postPermission(selectedUser.id, subId, act, val)
      }
      setPermState(next)
      showToast('Permissions par défaut appliquées')
    } catch (e) {
      console.error(e)
    } finally {
      setBulkBusy(false)
    }
  }

  const actionsUsedInModule = (mod) => {
    const set = new Set()
    mod.subs.forEach((sub) => sub.actions.forEach((a) => set.add(a)))
    return ACTION_ORDER.filter((a) => set.has(a))
  }

  return (
    <div className="relative min-h-full bg-[#F7F8FA] font-['DM_Sans']">
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-[#E4E7EE] bg-white px-4 py-2.5 text-sm font-medium text-[#0F1729] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}

      <header className="border-b border-[#E4E7EE] bg-white px-8 py-6">
        <h1 className="text-2xl font-bold text-[#0F1729] font-['Syne']">
          Permissions — Module · Sous-section · Action
        </h1>
      </header>

      <div className="flex min-h-[calc(100vh-8rem)] gap-4 p-6">
        <aside className="w-[280px] shrink-0 rounded-xl border border-[#E4E7EE] bg-white">
          <div className="border-b border-[#E4E7EE] p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] font-['Syne']">
              Utilisateurs
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom…"
                className="w-full rounded-lg border border-[#E4E7EE] bg-[#F7F8FA] py-2 pl-9 pr-3 text-sm text-[#0F1729] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
          </div>
          {loadingUsers ? (
            <UserListSkeleton />
          ) : (
            <div className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto p-3">
              {filteredUsers.map((u) => {
                const active = u.id === selectedId
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border border-[#E4E7EE] p-3 text-left transition-colors ${
                      active
                        ? 'border-l-4 border-l-[#2563EB] bg-[#EFF6FF] pl-[11px]'
                        : 'bg-white hover:bg-[#F0F2F6]'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getRoleColor(
                        u.role
                      )}`}
                    >
                      {initialsFromUser(u)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#0F1729]">
                        {u.nomComplet ||
                          `${u.prenom || ''} ${u.nom || ''}`.trim() ||
                          u.email}
                      </p>
                      <span className="mt-0.5 inline-block rounded-md bg-[#F0F2F6] px-2 py-0.5 text-[10px] font-semibold text-[#6B7280]">
                        {roleLabel(u.role)}
                      </span>
                      {u.role === 'ADMIN' && (
                        <span className="mt-1 ml-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                          Accès total
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 rounded-xl border border-[#E4E7EE] bg-white">
          {!selectedUser ? (
            <div className="flex min-h-[320px] items-center justify-center p-8 text-center text-[#6B7280]">
              Sélectionnez un utilisateur
            </div>
          ) : loadingPerms && selectedUser.role !== 'ADMIN' ? (
            <PanelSkeleton />
          ) : selectedUser.role === 'ADMIN' ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
                <Shield className="h-8 w-8" strokeWidth={1.75} />
              </div>
              <p className="max-w-md text-lg font-semibold text-[#0F1729] font-['Syne']">
                Cet utilisateur a accès à tout
              </p>
              <p className="text-sm text-[#6B7280]">
                Les comptes administrateur ne sont pas restreints par les permissions granulaires.
              </p>
            </div>
          ) : (
            <div className="p-6">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#0F1729] font-['Syne']">
                    {selectedUser.nomComplet ||
                      `${selectedUser.prenom || ''} ${selectedUser.nom || ''}`.trim() ||
                      selectedUser.email}
                  </h2>
                  <p className="text-sm text-[#6B7280]">{selectedUser.email}</p>
                </div>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={handleApplyRoleDefaults}
                  className="rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {bulkBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Application…
                    </span>
                  ) : (
                    'Appliquer permissions par défaut du rôle'
                  )}
                </button>
              </div>

              <div className="space-y-6">
                {MODULES.map((mod) => {
                  const cols = actionsUsedInModule(mod)
                  return (
                    <section
                      key={mod.id}
                      className="overflow-hidden rounded-xl border border-[#E4E7EE] bg-[#F7F8FA]/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E7EE] bg-white px-4 py-3">
                        <h3 className="text-base font-bold text-[#0F1729] font-['Syne']">
                          <span className="mr-2">{mod.icon}</span>
                          {mod.label}
                        </h3>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => handleModuleAllowAll(mod)}
                            className="rounded-lg border border-[#E4E7EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-50"
                          >
                            Tout autoriser
                          </button>
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => handleModuleRevokeAll(mod)}
                            className="rounded-lg border border-[#E4E7EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:bg-[#F0F2F6] disabled:opacity-50"
                          >
                            Tout révoquer
                          </button>
                        </div>
                      </div>
                      <div className="overflow-x-auto bg-white">
                        <table className="w-full min-w-[640px] text-left text-[13px]">
                          <thead>
                            <tr className="border-b border-[#E4E7EE] bg-[#F7F8FA]">
                              <th className="px-4 py-2 font-semibold text-[#6B7280]">
                                Sous-module
                              </th>
                              {cols.map((a) => (
                                <th
                                  key={a}
                                  className="px-2 py-2 text-center font-semibold capitalize text-[#6B7280]"
                                >
                                  {a}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {mod.subs.map((sub) => {
                              const mk = `${mod.id}.${sub.id}`
                              return (
                                <tr
                                  key={sub.id}
                                  className="border-b border-[#E4E7EE] last:border-0"
                                >
                                  <td className="px-4 py-3 font-medium text-[#0F1729]">
                                    {sub.label}
                                  </td>
                                  {cols.map((action) => {
                                    const applies = sub.actions.includes(action)
                                    const sk = stateKey(mk, action)
                                    const on = !!permState[sk]
                                    if (!applies) {
                                      return (
                                        <td
                                          key={action}
                                          className="px-2 py-3 text-center text-[#CBD5E1]"
                                        >
                                          —
                                        </td>
                                      )
                                    }
                                    return (
                                      <td key={action} className="px-2 py-3 text-center">
                                        <div className="flex justify-center">
                                          <Toggle
                                            checked={on}
                                            busy={!!busyKeys[sk]}
                                            onChange={(n) =>
                                              handleToggle(mk, sub.id, action, n)
                                            }
                                          />
                                        </div>
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
