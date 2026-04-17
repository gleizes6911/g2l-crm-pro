import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Home,
  TrendingUp,
  Truck,
  Car,
  Users,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
  Database,
} from 'lucide-react'
import API_BASE from '../config/api'

const SIDEBAR_OPEN_PX = 240

const sections = [
  {
    id: 'accueil',
    name: 'Accueil',
    icon: Home,
    roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION', 'GESTIONNAIRE_PARC', 'COMPTABLE', 'EMPLOYE'],
    items: [
      { path: '/direction/dashboard', label: 'Vue d\'ensemble groupe', permissionId: 'suivi-global', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION'] },
      { path: '/direction/suivi-operationnel', label: 'Suivi opérationnel', permissionId: 'suivi-global', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION'] }
    ]
  },
  {
    id: 'finance',
    name: 'Finance & Pilotage',
    icon: TrendingUp,
    roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'],
    items: [
      { path: '/direction/analyse-financiere', label: 'Analyse financière', permissionId: 'analyse-financiere', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'] },
      { path: '/direction/analytique', label: 'Analyse par métier', permissionId: 'analyse-financiere', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'] },
      { path: '/direction/rentabilite', label: 'Rentabilité', permissionId: 'rentabilite', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'] },
      {
        path: '/finance/masse-salariale',
        label: 'Masse salariale',
        icon: Users,
        permissionId: 'rentabilite',
        roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'],
      },
      { path: '/direction/fec', label: 'Dashboard FEC', permissionId: 'fec', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'] },
      { path: '/direction/ticpe', label: 'TICPE', permissionId: 'ticpe', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'] },
      { path: '/direction/prefacturation-prestataires', label: 'Préfacturation', permissionId: 'prefact-prestataires', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER'] },
      { path: '/gestion/controleur', label: 'Contrôle de gestion', permissionId: 'cdg', roles: ['MANAGER', 'EXPLOITATION', 'ADMIN'] }
    ]
  },
  {
    id: 'exploitation',
    name: 'Exploitation',
    icon: Truck,
    roles: ['EXPLOITATION', 'ADMIN', 'MANAGER', 'DIRECTION', 'RH'],
    items: [
      { path: '/exploitation/dashboard', label: 'Dashboard', permissionId: 'dashboard-exploitation', roles: ['EXPLOITATION', 'ADMIN'] },
      { path: '/exploitation/planning-chargeur', label: 'Planning chargeur', permissionId: 'planning-chargeur', roles: ['EXPLOITATION', 'ADMIN'] },
      { path: '/exploitation/suivi-colis', label: 'Suivi colis', permissionId: 'suivi-colis', roles: ['EXPLOITATION', 'ADMIN'] },
      { path: '/exploitation/carburant', label: 'Carburant', permissionId: 'carburant', roles: ['EXPLOITATION', 'ADMIN'] },
      { path: '/sav/suivi-stats', label: 'SAV', permissionId: 'sav', roles: ['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION'] }
    ]
  },
  {
    id: 'flotte',
    name: 'Flotte & Parc',
    icon: Car,
    roles: ['GESTIONNAIRE_PARC', 'ADMIN', 'RH', 'MANAGER'],
    items: [
      { path: '/parc/dashboard', label: 'Dashboard parc', permissionId: 'dashboard-parc', roles: ['GESTIONNAIRE_PARC', 'ADMIN'] },
      { path: '/parc/ordres-reparation', label: 'Ordres de réparation', permissionId: 'ordres-reparation', roles: ['GESTIONNAIRE_PARC', 'ADMIN'] },
      { path: '/parc/stock', label: 'Stock & Fournisseurs', permissionId: 'stock', roles: ['GESTIONNAIRE_PARC', 'ADMIN'] },
      { path: '/parc/planning', label: 'Planning garage', permissionId: 'planning-garage', roles: ['GESTIONNAIRE_PARC', 'ADMIN'] },
      { path: '/flotte/webfleet', label: 'Webfleet GPS', permissionId: 'webfleet', roles: ['RH', 'MANAGER', 'ADMIN'] },
      { path: '/flotte/assurances', label: 'Véhicules & Assurances', permissionId: 'recherche-vehicules', roles: ['GESTIONNAIRE_PARC', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION', 'DIRECTION'] },
      { path: '/daf/mad', label: 'Mises à disposition', permissionId: 'mad', roles: ['RH', 'ADMIN'] }
    ]
  },
  {
    id: 'rh',
    name: 'Ressources Humaines',
    icon: Users,
    roleOnly: true,
    roles: ['RH', 'MANAGER', 'EMPLOYE', 'COMPTABLE'],
    items: [
      { path: '/rh/dashboard', label: 'Dashboard RH', permissionId: 'dashboard-rh', roles: ['RH', 'MANAGER'] },
      { path: '/rh/employes', label: 'Employés', permissionId: 'employes', roles: ['RH', 'MANAGER'] },
      { path: '/rh/absences', label: 'Absences', permissionId: 'absences', roles: ['RH', 'MANAGER', 'EMPLOYE'] },
      { path: '/rh/soldes-cp', label: 'Soldes CP', permissionId: 'soldes-cp', roles: ['RH', 'MANAGER', 'EMPLOYE'] },
      { path: '/rh/documents', label: 'Documents', permissionId: 'documents', roles: ['RH', 'MANAGER', 'EMPLOYE'] },
      { path: '/rh/organigramme', label: 'Organigramme', permissionId: 'organigramme', roles: ['RH', 'MANAGER'] },
      { path: '/rh/acomptes', label: 'Mes acomptes', permissionId: 'acomptes-employe', roles: ['EMPLOYE'] },
      {
        path: '/rh/acomptes-rh',
        label: 'Acomptes',
        permissionId: 'acomptes-rh',
        roles: ['RH'],
        subItems: [
          { path: '/rh/acomptes-rh?tab=a-traiter', label: 'À traiter', roles: ['RH'], badgeKey: 'acomptesRHATraiter' },
          { path: '/rh/acomptes-rh?tab=en-cours', label: 'En cours', roles: ['RH'], badgeKey: 'acomptesRHEnCours' },
          { path: '/rh/acomptes-rh?tab=traites', label: 'Traités', roles: ['RH'] }
        ]
      },
      {
        path: '/manager/acomptes',
        label: 'Acomptes équipe',
        permissionId: 'acomptes-manager',
        roles: ['MANAGER'],
        subItems: [
          { path: '/manager/acomptes', label: 'Dashboard', roles: ['MANAGER'] },
          { path: '/manager/acomptes?tab=en-attente', label: 'À valider', roles: ['MANAGER'], badgeKey: 'acomptesEnAttente' },
          { path: '/manager/acomptes?tab=valides', label: 'Validés', roles: ['MANAGER'] }
        ]
      },
      { path: '/comptable/acomptes?tab=nouveaux', label: 'Acomptes — Paiements', permissionId: 'acomptes-comptable', roles: ['COMPTABLE'], badgeKey: 'acomptesNouveaux' }
    ]
  },
  {
    id: 'admin',
    name: 'Administration',
    icon: Settings,
    roles: ['ADMIN'],
    items: [
      { path: '/admin/utilisateurs', label: 'Utilisateurs', permissionId: 'utilisateurs', roles: ['ADMIN'] },
      { path: '/admin/permissions', label: 'Permissions', permissionId: 'permissions', roles: ['ADMIN'] },
      { path: '/admin/connexions', label: 'Connexions API', permissionId: 'connexions', roles: ['ADMIN'] },
      {
        path: '/admin/referentiel',
        label: 'Référentiel G2L',
        permissionId: 'connexions',
        roles: ['ADMIN'],
        icon: Database,
      },
      { path: '/parametres/salesforce', label: 'Salesforce', permissionId: 'salesforce', roles: ['ADMIN'] }
    ]
  }
]

function resolveModuleId(permissionId) {
  const map = {
    'acomptes-employe': 'acomptes',
    'acomptes-rh': 'acomptes',
    'acomptes-manager': 'acomptes',
    'acomptes-comptable': 'acomptes',
  }
  return map[permissionId] || permissionId
}

function initialsFromNom(nom) {
  if (!nom || typeof nom !== 'string') return '?'
  const parts = nom.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return '?'
}

export default function Sidebar({ collapsed = false, onToggle }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, permissions, permissionsLoaded } = useAuth()
  const [notificationCount, setNotificationCount] = useState(0)
  const [acomptesEnAttenteCount, setAcomptesEnAttenteCount] = useState(0)
  const [acomptesNouveauxCount, setAcomptesNouveauxCount] = useState(0)
  const [acomptesEnCoursCount, setAcomptesEnCoursCount] = useState(0)
  const [acomptesRHATraiterCount, setAcomptesRHATraiterCount] = useState(0)
  const [acomptesRHEnCoursCount, setAcomptesRHEnCoursCount] = useState(0)
  const [expandedItems, setExpandedItems] = useState({})

  useEffect(() => {
    if (user && user.userId) {
      fetchNotificationCount()
      if (user.role === 'MANAGER') {
        fetchAcomptesEnAttenteCount()
      }
      if (user.role === 'COMPTABLE') {
        fetchAcomptesComptableCounts()
      }
      if (user.role === 'RH') {
        fetchAcomptesRHCounts()
      }
      const interval = setInterval(() => {
        fetchNotificationCount()
        if (user.role === 'MANAGER') {
          fetchAcomptesEnAttenteCount()
        }
        if (user.role === 'COMPTABLE') {
          fetchAcomptesComptableCounts()
        }
        if (user.role === 'RH') {
          fetchAcomptesRHCounts()
        }
      }, 30000) // Rafraîchir toutes les 30s
      return () => clearInterval(interval)
    }
  }, [user])

  const fetchNotificationCount = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/notifications/${user.userId}/count`)
      if (response.ok) {
        const data = await response.json()
        setNotificationCount(data.count || 0)
      }
    } catch (error) {
      console.error('Erreur récupération notifications:', error)
    }
  }

  const fetchAcomptesEnAttenteCount = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/acomptes/manager/en-attente/count`)
      if (response.ok) {
        const data = await response.json()
        setAcomptesEnAttenteCount(data.count || 0)
      }
    } catch (error) {
      console.error('Erreur récupération acomptes en attente:', error)
    }
  }

  const fetchAcomptesComptableCounts = async () => {
    try {
      const [nouveauxRes, enCoursRes] = await Promise.all([
        fetch(`${API_BASE}/api/acomptes/comptable/nouveaux/count`),
        fetch(`${API_BASE}/api/acomptes/comptable/en-cours/count`)
      ])
      if (nouveauxRes.ok) {
        const nouveauxData = await nouveauxRes.json()
        setAcomptesNouveauxCount(nouveauxData.count || 0)
      }
      if (enCoursRes.ok) {
        const enCoursData = await enCoursRes.json()
        setAcomptesEnCoursCount(enCoursData.count || 0)
      }
    } catch (error) {
      console.error('Erreur récupération acomptes comptable:', error)
    }
  }

  const fetchAcomptesRHCounts = async () => {
    try {
      const [aTraiterRes, enCoursRes] = await Promise.all([
        fetch(`${API_BASE}/api/acomptes/rh/a-traiter/count`),
        fetch(`${API_BASE}/api/acomptes/rh/en-cours/count`)
      ])
      if (aTraiterRes.ok) {
        const aTraiterData = await aTraiterRes.json()
        setAcomptesRHATraiterCount(aTraiterData.count || 0)
      }
      if (enCoursRes.ok) {
        const enCoursData = await enCoursRes.json()
        setAcomptesRHEnCoursCount(enCoursData.count || 0)
      }
    } catch (error) {
      console.error('Erreur récupération acomptes RH:', error)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const getRoleLabel = (role) => {
    const labels = {
      'RH': 'RH',
      'MANAGER': 'Manager',
      'EMPLOYE': 'Employé',
      'COMPTABLE': 'Comptable',
      'GESTIONNAIRE_PARC': 'Gestionnaire Parc',
      'EXPLOITATION': 'Exploitation',
      'ADMIN': 'Administrateur',
      'DIRECTION': 'Direction',
    }
    return labels[role] || role
  }

  const getRoleColor = (role) => {
    const colors = {
      'RH': 'bg-purple-600',
      'MANAGER': 'bg-blue-600',
      'EMPLOYE': 'bg-green-600',
      'COMPTABLE': 'bg-indigo-600',
      'GESTIONNAIRE_PARC': 'bg-orange-600',
      'EXPLOITATION': 'bg-teal-600',
      'ADMIN': 'bg-red-600',
      'DIRECTION': 'bg-slate-700',
    }
    return colors[role] || 'bg-gray-600'
  }

  const hasPermission = useCallback(
    (permissionId) => {
      if (!permissionId) return true
      if (user?.role === 'ADMIN') return true
      const moduleId = resolveModuleId(permissionId)
      return permissions.some(
        (p) =>
          (p.module === moduleId ||
            p.module === 'exploitation.' + moduleId ||
            p.module === 'direction.' + moduleId ||
            p.module === 'rh.' + moduleId ||
            p.module === 'parc.' + moduleId ||
            p.module === 'daf.' + moduleId ||
            p.module === 'admin.' + moduleId) &&
          p.action === 'lire' &&
          p.autorise === true
      )
    },
    [user?.role, permissions]
  )

  const filteredSections = useMemo(() => {
    if (!user?.role) return []
    return sections
      .filter((section) => {
        if (user?.role === 'ADMIN') return true
        const roleAccess = section.roles.includes(user?.role)
        if (section.roleOnly) return roleAccess
        const permissionAccess =
          !roleAccess &&
          section.items.some(
            (item) => item.permissionId && hasPermission(item.permissionId)
          )
        return roleAccess || permissionAccess
      })
      .map((section) => ({
        ...section,
        items: section.items
          .filter((item) => {
            if (user?.role === 'ADMIN') return true
            const roleOk = !item.roles || item.roles.includes(user?.role)
            if (section.roleOnly) return roleOk
            const permOk =
              !roleOk &&
              item.permissionId &&
              hasPermission(item.permissionId)
            return roleOk || permOk
          })
          .map((item) => ({
            ...item,
            subItems: item.subItems
              ? item.subItems.filter(
                  (subItem) =>
                    user?.role === 'ADMIN' ||
                    !subItem.roles ||
                    subItem.roles.includes(user?.role)
                )
              : undefined,
          })),
      }))
      .filter((section) => section.items.length > 0)
  }, [user?.role, permissionsLoaded, hasPermission])

  // Auto-expand items avec sous-items actifs
  useEffect(() => {
    if (!user?.role) return

    filteredSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.subItems) {
          const hasActiveSubItem = item.subItems.some((subItem) => {
            const subPathnameMatch = subItem.path.split('?')[0] === location.pathname
            const searchParams = new URLSearchParams(location.search)
            const subItemParams = new URLSearchParams(subItem.path.split('?')[1] || '')
            const subTabMatch = subItemParams.get('tab') === searchParams.get('tab')
            return subPathnameMatch && (subItemParams.get('tab') ? subTabMatch : true)
          })
          if (hasActiveSubItem) {
            setExpandedItems((prev) =>
              prev[item.path] ? prev : { ...prev, [item.path]: true }
            )
          }
        }
      })
    })
  }, [location.pathname, location.search, user?.role, filteredSections])

  const itemBase = 'flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] transition-colors duration-150 w-full text-left'
  const itemIdle = 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-hover)]'
  const itemActive = 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
  const badgeClass = 'ml-auto shrink-0 min-w-[18px] rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white'

  return (
    <div
      className="fixed left-0 top-0 z-30 flex h-screen flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] overflow-hidden"
      style={{
        width: collapsed ? 0 : SIDEBAR_OPEN_PX,
        transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className="flex h-full min-h-0 w-[240px] min-w-[240px] flex-col">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--color-primary)] text-[10px] font-bold text-white tracking-wide">
              G2L
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-ink)] truncate leading-tight">G2L CRM PRO</p>
              <p className="text-[10px] text-[var(--color-muted)] truncate leading-tight">Groupe G2L · Perpignan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:text-[var(--color-ink-2)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Réduire le menu"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* ── NAVIGATION ── */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2">
          {filteredSections.map((sec) => {
            const SectionIcon = sec.icon
            return (
              <div key={sec.id} className="mb-4">

                <div className="flex items-center gap-1.5 px-2.5 mb-1">
                  {SectionIcon && <SectionIcon size={11} className="text-[var(--color-faint)] shrink-0" aria-hidden />}
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">
                    {sec.name}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {sec.items.map((item) => {
                    const NavIcon = item.icon
                    const hasSubItems = item.subItems && item.subItems.length > 0
                    const isExpanded = expandedItems[item.path] || false
                    const pathnameMatch = item.path.split('?')[0] === location.pathname
                    const searchParams = new URLSearchParams(location.search)
                    const itemParams = new URLSearchParams(item.path.split('?')[1] || '')
                    const tabMatch = itemParams.get('tab') === searchParams.get('tab')
                    const isActive = pathnameMatch && (itemParams.get('tab') ? tabMatch : true)
                    const hasActiveSubItem = hasSubItems && item.subItems.some(sub => {
                      const sm = sub.path.split('?')[0] === location.pathname
                      const sp = new URLSearchParams(sub.path.split('?')[1] || '')
                      return sm && (sp.get('tab') ? sp.get('tab') === searchParams.get('tab') : true)
                    })

                    let badgeCount = 0
                    if (item.badgeKey === 'acomptesEnAttente') badgeCount = acomptesEnAttenteCount
                    else if (item.badgeKey === 'acomptesNouveaux') badgeCount = acomptesNouveauxCount
                    else if (item.badgeKey === 'acomptesEnCours') badgeCount = acomptesEnCoursCount

                    if (hasSubItems) {
                      return (
                        <div key={item.path}>
                          <button
                            type="button"
                            onClick={() => setExpandedItems(prev => ({ ...prev, [item.path]: !isExpanded }))}
                            className={`${itemBase} ${hasActiveSubItem ? itemActive : itemIdle}`}
                          >
                            <span className="flex-1 truncate">{item.label}</span>
                            <ChevronRight
                              size={12}
                              className={`shrink-0 text-[var(--color-faint)] transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                              aria-hidden
                            />
                          </button>
                          {isExpanded && (
                            <div className="ml-3 pl-2.5 border-l border-[var(--color-border)] mt-0.5 space-y-0.5">
                              {item.subItems.map((sub) => {
                                const sm = sub.path.split('?')[0] === location.pathname
                                const sp = new URLSearchParams(sub.path.split('?')[1] || '')
                                const st = sp.get('tab') === searchParams.get('tab')
                                const isSubActive = sm && (sp.get('tab') ? st : true)
                                let subBadge = 0
                                if (sub.badgeKey === 'acomptesRHATraiter') subBadge = acomptesRHATraiterCount
                                else if (sub.badgeKey === 'acomptesRHEnCours') subBadge = acomptesRHEnCoursCount
                                else if (sub.badgeKey === 'acomptesEnAttente') subBadge = acomptesEnAttenteCount
                                return (
                                  <Link
                                    key={sub.path}
                                    to={sub.path}
                                    className={`${itemBase} ${isSubActive ? itemActive : itemIdle}`}
                                  >
                                    <span className="flex-1 truncate">{sub.label}</span>
                                    {subBadge > 0 && (
                                      <span className={badgeClass}>{subBadge > 9 ? '9+' : subBadge}</span>
                                    )}
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`${itemBase} ${isActive ? itemActive : itemIdle}`}
                      >
                        {NavIcon && (
                          <NavIcon size={16} className="shrink-0 text-[var(--color-muted)]" aria-hidden />
                        )}
                        <span className="flex-1 truncate">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className={badgeClass}>{badgeCount > 9 ? '9+' : badgeCount}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* ── FOOTER ── */}
        <div className="shrink-0 border-t border-[var(--color-border)] p-2 space-y-0.5">

          <Link
            to="/rh/notifications"
            className={`${itemBase} ${location.pathname === '/rh/notifications' ? itemActive : itemIdle}`}
          >
            <Bell size={14} className="shrink-0" aria-hidden />
            <span className="flex-1 truncate">Notifications</span>
            {notificationCount > 0 && (
              <span className={badgeClass}>{notificationCount > 9 ? '9+' : notificationCount}</span>
            )}
          </Link>

          {user && (
            <div className="flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 mt-1">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${getRoleColor(user.role)}`}>
                {initialsFromNom(user.nom)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-[var(--color-ink)] truncate leading-tight">{user.nom}</p>
                <p className="text-[10px] text-[var(--color-muted)] truncate leading-tight">{getRoleLabel(user.role)}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-[var(--color-faint)] hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Déconnexion"
                aria-label="Déconnexion"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
