import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import API_BASE from '../config/api';

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState([])
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  const chargerPermissions = useCallback(async (userId, role) => {
    if (!userId) {
      setPermissions([])
      setPermissionsLoaded(true)
      return
    }
    if (role === 'ADMIN') {
      setPermissions([])
      setPermissionsLoaded(true)
      return
    }
    setPermissionsLoaded(false)
    try {
      const res = await fetch(`${API_BASE}/api/permissions/${userId}`)
      if (res.ok) {
        const data = await res.json()
        setPermissions(Array.isArray(data) ? data : [])
      } else {
        setPermissions([])
      }
    } catch (err) {
      console.error('Erreur chargement permissions:', err)
      setPermissions([])
    } finally {
      setPermissionsLoaded(true)
    }
  }, [])

  const verifierSession = useCallback(
    async (sid) => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/session/${sid}`)
        const data = await response.json()

        if (data.success) {
          setUser(data.user)
          setSessionId(sid)
          await chargerPermissions(data.user.userId, data.user.role)
        } else {
          localStorage.removeItem('sessionId')
          setUser(null)
          setPermissions([])
          setPermissionsLoaded(true)
        }
      } catch (err) {
        console.error('Erreur vérification session:', err)
        localStorage.removeItem('sessionId')
        setUser(null)
        setPermissions([])
        setPermissionsLoaded(true)
      } finally {
        setLoading(false)
      }
    },
    [chargerPermissions]
  )

  useEffect(() => {
    const storedSessionId = localStorage.getItem('sessionId')
    if (storedSessionId) {
      verifierSession(storedSessionId)
    } else {
      setLoading(false)
      setPermissionsLoaded(true)
    }
  }, [verifierSession])

  const login = async (email, password) => {
    try {
      console.log('[AUTH] Appel API login...')
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      console.log('[AUTH] Réponse status:', response.status)
      const data = await response.json()
      console.log('[AUTH] Données reçues:', data)

      if (data.success) {
        console.log('[AUTH] Connexion réussie, mise à jour du state...')
        setUser(data.user)
        setSessionId(data.sessionId)
        localStorage.setItem('sessionId', data.sessionId)
        await chargerPermissions(data.user.userId, data.user.role)
        console.log('[AUTH] State mis à jour, user:', data.user)
        return { success: true }
      } else {
        return { success: false, error: data.error }
      }
    } catch (err) {
      console.error('[AUTH] Erreur login:', err)
      return { success: false, error: 'Erreur de connexion: ' + err.message }
    }
  }

  const logout = async () => {
    try {
      if (sessionId) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        })
      }

      setUser(null)
      setSessionId(null)
      setPermissions([])
      setPermissionsLoaded(true)
      localStorage.removeItem('sessionId')
    } catch (err) {
      console.error('Erreur logout:', err)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionId,
        loading,
        permissions,
        permissionsLoaded,
        login,
        logout,
        chargerPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
