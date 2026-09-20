// Sign in — staff log in against atelier-api (POST /auth/login).
//
// Split screen (AuthFrame): full-bleed interior photograph on the left, the
// email/password form on the right. The row of one-click staff tiles that
// used to sit above the form — each carrying the shared temp password — is
// gone: every person signs in as themselves, with their own password, and a
// forgotten one is recovered through /forgot-password rather than read out.
//
// When the API does not answer, the form doubles as the break-glass door: the
// same two fields take the offline credentials (../auth/breakGlass.js). It is
// never advertised up front — the note only appears after a sign-in attempt has
// actually failed unreachably, and only in a build that has a credential.

import { useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PrimaryButton } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { breakGlassEnabled } from '../auth/breakGlassConfig.js'
import AuthFrame, { Field, AuthAlt, authLink } from './AuthFrame.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [unreachable, setUnreachable] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { signIn, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Honour the deep link they were bounced from, so a shared /reporting URL still
  // lands on /reporting after signing in.
  const from = location.state?.from?.pathname || '/dashboard'

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setUnreachable(Boolean(result.unreachable))
      return setError(result.error)
    }
    setError('')
    setUnreachable(false)
    navigate(from, { replace: true })
  }

  // This is the app's front door, so it is also where a cached session is spent:
  // showing the form to someone already signed in is a dead end they have to guess
  // their way out of. Waits on `loading` — GET /auth/me has not answered yet on a
  // cold load, and drawing the form first would flash it under a live session.
  if (loading) return null
  if (user) return <Navigate to={from} replace />

  return (
    <AuthFrame
      title="Sign in"
      note="Each person signs in as themselves. What you see — pricing, cost, margin and whose sales appear in a report — follows the role attached to your login."
    >
      <form onSubmit={submit} style={{ marginTop: 6 }}>
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
        <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />

        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 13, color: c.danger, fontFamily: font.ui }}>{error}</div>
        )}

        {/* Only after a real outage, and only where a credential was built in. */}
        {unreachable && breakGlassEnabled && (
          <div style={{ marginTop: 14, padding: '12px 14px', border: `1px solid ${c.line}`, background: c.surface }}>
            <div style={{ fontSize: 12, color: c.accent, fontWeight: 600 }}>Offline access</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: c.inkSoft, marginTop: 6 }}>
              Enter the offline access email and passphrase in the fields above to open the
              CRM without the API. Live data will be unavailable and nothing can be saved.
            </div>
          </div>
        )}

        <PrimaryButton type="submit" disabled={submitting} style={{ marginTop: 28, width: '100%', height: 52, fontSize: 16 }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
        <AuthAlt><Link to="/forgot-password" style={authLink}>Forgot your password?</Link></AuthAlt>
      </form>
    </AuthFrame>
  )
}
