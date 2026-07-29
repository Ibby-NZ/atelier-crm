// Route & section guards. DEMO-GRADE — see the banner in ./roles.js.
//
// These guard the RENDER, which is the only thing a client-side app can guard.
// A real gate refuses at the query: the server never puts a cost in a User's
// response, so there is nothing to hide in the browser. Keeping the guards in one
// file makes that boundary easy to point at when this is rebuilt for real.

import { Navigate, useLocation } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Eyebrow } from '../components/ui.jsx'
import { useAuth } from './AuthContext.jsx'

// Signed out ⇒ bounce to /login, remembering where they were headed so the deep
// link survives the round trip.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  // While GET /auth/me is still resolving on a fresh load, render nothing rather
  // than bounce a signed-in user to /login before their session comes back.
  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

// LockedPanel — the standing "you can't see this" state. It always says WHY:
// a locked door with no sign on it just reads as a broken app, and in a demo the
// reason is the whole point being shown.
export function LockedPanel({ title = 'Not available on your access', reason, hint }) {
  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 3, background: c.surface, padding: '28px 30px', maxWidth: 620 }}>
      <Eyebrow>Restricted</Eyebrow>
      <div style={{ fontFamily: font.display, fontSize: 21, color: c.ink, margin: '10px 0 8px' }}>{title}</div>
      {reason && <div style={{ fontSize: 13.5, lineHeight: 1.6, color: c.inkSoft }}>{reason}</div>}
      {hint && <div style={{ fontSize: 12, lineHeight: 1.6, color: c.muted, marginTop: 10 }}>{hint}</div>}
    </div>
  )
}

// Section/route guard by capability. Renders a LockedPanel rather than redirecting:
// a silent bounce hides the boundary, and on stage the boundary is the feature.
export function RequireCap({ cap, children, title, reason, hint }) {
  const { can } = useAuth()
  if (!can(cap)) return <LockedPanel title={title} reason={reason} hint={hint} />
  return children
}

// MaskedFigure — stands in for a single cost/margin number a login may not read.
// Deliberately not a blur or a row of dots over the real value: those ship the
// figure to the DOM and call it hidden. This renders in its place.
export function MaskedFigure({ label = 'Finance' }) {
  return (
    <span title={`${label} — not available on your access`}
      style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted, letterSpacing: '0.04em' }}>——</span>
  )
}
