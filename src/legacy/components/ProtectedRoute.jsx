import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/** Correspondance module API (court ou préfixé par domaine). */
function permissionMatchesModule(pModule, mod) {
  if (!pModule || mod == null) return false
  return (
    pModule === mod ||
    pModule === `exploitation.${mod}` ||
    pModule === `direction.${mod}` ||
    pModule === `rh.${mod}` ||
    pModule === `parc.${mod}` ||
    pModule === `daf.${mod}` ||
    pModule === `admin.${mod}`
  )
}

const ProtectedRoute = ({ children, allowedRoles, allowedModules }) => {
  const { user, loading, permissions, permissionsLoaded } = useAuth()

  if (loading || (!permissionsLoaded && user?.role !== 'ADMIN')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const hasAccess = () => {
    if (user.role === 'ADMIN') return true
    if (!allowedRoles) return true

    const roleOk = allowedRoles.includes(user.role)

    if (!roleOk && allowedModules && allowedModules.length > 0) {
      return allowedModules.some((mod) =>
        permissions.some(
          (p) =>
            permissionMatchesModule(p.module, mod) &&
            p.action === 'lire' &&
            p.autorise === true
        )
      )
    }

    return roleOk
  }

  if (!hasAccess()) {
    return <Navigate to="/rh/absences" replace />
  }

  return children
}

export default ProtectedRoute
