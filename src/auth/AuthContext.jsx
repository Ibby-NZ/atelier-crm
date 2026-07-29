// Session context — who is signed in, and what they may read.
//
// Wired to atelier-api: the session is the API's HttpOnly signed cookie. This
// context resolves it via GET /auth/me on mount, POST /auth/login to sign in,
// POST /auth/logout to sign out. It no longer reads a localStorage user-id or
// the AppStore roster (that was the demo).
//
// The API roles are customer/trade/backoffice/director. Only backoffice/director
// are staff and may use the CRM; both map to the demo's full-access 'director'
// capability set here (the API's requireRole is the real gate — these caps only
// decide what is DRAWN). customer/trade resolve to no CRM user, so the guards
// bounce them to /login. The useAuth()/useCan()/useAccess() surface is unchanged
// so every screen keeps working.

import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { accessOf, can as roleCan, NO_ACCESS, ROLES } from './roles.js'
import { apiFetch, apiSend, ApiError } from '../lib/api.js'

const AuthContext = createContext(null)

// Which API roles may use the CRM, and the CRM capability role they map to.
const STAFF_ROLE_MAP = { director: 'director', backoffice: 'director' }

// Map an atelier-api user ({ id, email, name, role, trade_approved }) to the CRM
// user shape the screens/roles engine consume, or null for a non-staff account.
function toCrmUser(apiUser) {
  if (!apiUser) return null
  const crmRole = STAFF_ROLE_MAP[apiUser.role]
  if (!crmRole) return null
  return {
    id: String(apiUser.id),
    name: apiUser.name || apiUser.email,
    email: apiUser.email,
    role: crmRole,
    apiRole: apiUser.role,
    // Best-effort own-sales scoping key (reporting is demo-only for now).
    owner: apiUser.name || null,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Resolve the current session once on mount. 401 (guest) is not an error here.
  useEffect(() => {
    let active = true
    apiFetch('/auth/me')
      .then((body) => {
        if (active) setUser(toCrmUser(body?.user))
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    try {
      const body = await apiSend('POST', '/auth/login', { email, password })
      const crm = toCrmUser(body?.user)
      if (!crm) {
        // Authenticated, but not a back-office account — no CRM access.
        return { error: 'This account does not have back-office access.' }
      }
      setUser(crm)
      return { user: crm }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not sign in. Please try again.'
      return { error: message }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await apiSend('POST', '/auth/logout', {})
    } catch {
      /* clear local state regardless */
    }
    setUser(null)
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    role: user ? ROLES[user.role] : null,
    access: user ? accessOf(user) : NO_ACCESS,
    can: (cap) => roleCan(user, cap),
    signIn,
    signOut,
  }), [user, loading, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Fails closed: outside a provider you are nobody and may see nothing.
const SIGNED_OUT = {
  user: null,
  loading: false,
  role: null,
  access: NO_ACCESS,
  can: () => false,
  signIn: async () => ({ error: 'No auth provider.' }),
  signOut: async () => {},
}

export function useAuth() {
  return useContext(AuthContext) || SIGNED_OUT
}

// Convenience: useCan(CAPS.PRICING_EDIT) → boolean
export function useCan(cap) {
  return useAuth().can(cap)
}

// Convenience: the { finance, all, owner } shape the report gates read.
export function useAccess() {
  return useAuth().access
}
