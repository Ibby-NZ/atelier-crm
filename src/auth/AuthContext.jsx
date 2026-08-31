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
//
// SECOND, EMERGENCY PATH: break-glass. When the API cannot be reached at all,
// signIn falls back to a purely local session (./breakGlass.js) so the CRM's
// demo/localStorage screens stay usable through an outage. It is off unless the
// build was given a credential, it authenticates nothing against the API, and
// `offline: true` on the context is what the chrome and api.js use to say so and
// to refuse writes. Read the header of ./breakGlass.js before touching it.

import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { accessOf, can as roleCan, NO_ACCESS, ROLES } from './roles.js'
import { apiFetch, apiSend, ApiError } from '../lib/api.js'
import { BREAK_GLASS, breakGlassEnabled } from './breakGlassConfig.js'
import {
  browserStorage,
  isApiUnreachable,
  verifyBreakGlass,
  startBreakGlassSession,
  readBreakGlassSession,
  endBreakGlassSession,
} from './breakGlass.js'

const AuthContext = createContext(null)

// Which API roles may use the CRM, and the CRM capability role they map to.
const STAFF_ROLE_MAP = { director: 'director', backoffice: 'director' }

// What the operator is told when the API did not answer at all. Only mentions
// the emergency door in builds that actually have one.
const UNREACHABLE_MESSAGE = breakGlassEnabled
  ? 'The API did not answer. If it is down, sign in with the offline access credentials.'
  : 'The API did not answer. Check it is running and try again.'

// A break-glass session drawn as a CRM user. It gets the same capability role
// every staff login gets, because CAPS only decide what is DRAWN — and there is
// no live data to draw. `offline` is the flag everything else keys off.
//
// Deliberately NO `report_access`: nobody asked the API, so there is no derived
// statement to carry and inventing one would be this client asserting its own
// access. accessOf falls back to the caps, which is what keeps the demo report
// library readable through an outage — and every live report on it fails at the
// fetch anyway, with no cookie to send.
function toOfflineUser(session) {
  return {
    id: 'break-glass',
    name: session.name,
    email: session.email,
    role: 'director',
    apiRole: null,
    owner: null,
    offline: true,
  }
}

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
    // Best-effort own-sales scoping key (the demo reports still use it).
    owner: apiUser.name || null,
    // The API's DERIVED report access, carried through verbatim for accessOf to
    // prefer over the capability map. Absent — an older API, or the offline user
    // below — falls back to the caps, which is why this is `|| null` rather than
    // a defaulted object: an invented `{ reports: false }` would lock the demo
    // screens out of a build whose API had not been updated yet.
    report_access: apiUser.report_access || null,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(true)

  // Adopt a stored break-glass session. Returns true when one was taken up.
  // A real API session always wins — this only runs once /auth/me has come back
  // empty, whatever the reason. Deliberately NOT conditional on the API still
  // being down: once someone is working offline, dropping them at the login
  // screen the moment the API twitches back is worse than leaving them in a
  // clearly-labelled read-only shell until they sign out.
  const adoptOfflineSession = useCallback(() => {
    const session = readBreakGlassSession(browserStorage(), BREAK_GLASS)
    setUser(session ? toOfflineUser(session) : null)
    setOffline(Boolean(session))
    return Boolean(session)
  }, [])

  // Resolve the current session once on mount. 401 (guest) is not an error here.
  useEffect(() => {
    let active = true
    apiFetch('/auth/me')
      .then((body) => {
        if (!active) return
        const crm = toCrmUser(body?.user)
        if (crm) {
          setUser(crm)
          setOffline(false)
          return
        }
        adoptOfflineSession()
      })
      .catch(() => {
        if (active) adoptOfflineSession()
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [adoptOfflineSession])

  const signIn = useCallback(async (email, password) => {
    try {
      const body = await apiSend('POST', '/auth/login', { email, password })
      const crm = toCrmUser(body?.user)
      if (!crm) {
        // Authenticated, but not a back-office account — no CRM access.
        return { error: 'This account does not have back-office access.' }
      }
      setUser(crm)
      setOffline(false)
      return { user: crm }
    } catch (err) {
      // Only an outage opens the emergency door. A 401/403/429 is the API
      // working, and must stay a plain refusal.
      if (err instanceof ApiError && isApiUnreachable(err)) {
        if (verifyBreakGlass(BREAK_GLASS, { email, password })) {
          const session = startBreakGlassSession(browserStorage(), BREAK_GLASS)
          if (session) {
            const crm = toOfflineUser(session)
            setUser(crm)
            setOffline(true)
            return { user: crm, offline: true }
          }
        }
        // `unreachable` lets the sign-in screen tell "the API is down" apart
        // from "that password is wrong", which are the same shape here but need
        // very different advice.
        return { error: UNREACHABLE_MESSAGE, unreachable: true }
      }
      const message =
        err instanceof ApiError ? err.message : 'Could not sign in. Please try again.'
      // `status` travels with the message because a 401 and a 429 need different
      // advice and read identically here: only a 401 is about the credential.
      return { error: message, status: err instanceof ApiError ? err.status : 0 }
    }
  }, [])

  const signOut = useCallback(async () => {
    // An offline session has no server side to end, and the API is presumably
    // still down — skip the call rather than wait out its timeout.
    if (!offline) {
      try {
        await apiSend('POST', '/auth/logout', {})
      } catch {
        /* clear local state regardless */
      }
    }
    endBreakGlassSession(browserStorage())
    setUser(null)
    setOffline(false)
  }, [offline])

  const value = useMemo(() => ({
    user,
    loading,
    offline,
    role: user ? ROLES[user.role] : null,
    access: user ? accessOf(user) : NO_ACCESS,
    can: (cap) => roleCan(user, cap),
    signIn,
    signOut,
  }), [user, loading, offline, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Fails closed: outside a provider you are nobody and may see nothing.
const SIGNED_OUT = {
  user: null,
  loading: false,
  offline: false,
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
