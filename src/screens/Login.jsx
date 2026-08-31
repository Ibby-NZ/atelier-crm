// Sign in — staff log in against atelier-api (POST /auth/login).
//
// Split screen: full-bleed interior photograph on the left, sign-in on the
// right. Staff pick their profile tile (Netflix-style) for one-click sign-in
// with the seeded temp password from `npm run seed:staff`; the email/password
// form below covers accounts whose password has been changed.
//
// When the API does not answer, the form doubles as the break-glass door: the
// same two fields take the offline credentials (../auth/breakGlass.js). It is
// never advertised up front — the note only appears after a sign-in attempt has
// actually failed unreachably, and only in a build that has a credential.

import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { Eyebrow, PrimaryButton, WeaveImage } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { breakGlassEnabled } from '../auth/breakGlassConfig.js'

// Mirrors src/seed/seed-staff.js in atelier-api.
const TEMP_PASSWORD = 'AtelierTemp2026!'
const STAFF = [
  { name: 'Liz', email: 'elizabethd@atelier.co.nz', label: 'Director', tone: ['#C7AD77', '#937942'] },
  { name: 'Jenette', email: 'jenettec@atelier.co.nz', label: 'Director', tone: ['#D3C098', '#735F33'] },
  { name: 'Charlotte', email: 'charlottes@atelier.co.nz', label: 'Back office', tone: ['#E5E1D4', '#B5985B'] },
  { name: 'Rebecca', email: 'rebeccaf@atelier.co.nz', label: 'Back office', tone: ['#DEDAC9', '#898472'] },
  { name: 'Showroom', email: 'showroom@ateliertextiles.co.nz', label: 'Back office', tone: ['#EBE9DF', '#605D4F'] },
  { name: 'Sales', email: 'sales@atelier.co.nz', label: 'Back office', tone: ['#E3E0D2', '#6F6A57'] },
]

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

  // Profile tile = one-click sign-in with the seeded temp password. If that
  // account has moved off the default, fall back to the form with the email
  // pre-filled so only the password is left to type.
  async function quickSignIn(person) {
    setEmail(person.email)
    setPassword(TEMP_PASSWORD)
    setError('')
    setSubmitting(true)
    const result = await signIn(person.email, TEMP_PASSWORD)
    setSubmitting(false)
    if (result.error) {
      setPassword('')
      // An outage is not a changed password — saying so would send the operator
      // hunting for a credential that is fine.
      setUnreachable(Boolean(result.unreachable))
      // The API answers a wrong password and an account that was never seeded with
      // the same 401 (deliberately — it must not enumerate accounts), so the note
      // stays true for both instead of blaming a password change.
      return setError(result.unreachable
        ? result.error
        : `The shared temp password did not sign ${person.name} in — enter their password below.`)
    }
    navigate(from, { replace: true })
  }

  // This is the app's front door, so it is also where a cached session is spent:
  // showing the form to someone already signed in is a dead end they have to guess
  // their way out of. Waits on `loading` — GET /auth/me has not answered yet on a
  // cold load, and drawing the form first would flash it under a live session.
  if (loading) return null
  if (user) return <Navigate to={from} replace />

  return (
    <div className="r-login-grid" style={{ minHeight: '100vh', background: c.paper, display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 6fr)' }}>

      {/* ---- the room ---- */}
      <div className="r-login-img" style={{ position: 'relative', minHeight: '100vh' }}>
        <WeaveImage
          img="crm-sign-in.jpg"
          tone={['#EBE9DF', '#C9C2A9']}
          alt="Striped sheer curtains along a timber-lined room, with a dark dining table and a potted tree beyond"
          style={{ position: 'absolute', inset: 0 }}
        />
      </div>

      {/* ---- sign in ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px 56px' }} className="r-hero-pad">
        <div style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>

          <div>
            <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: 19, letterSpacing: '0.16em', color: c.ink }}>ATELIER</span>
            <span style={{ display: 'block', fontFamily: font.ui, fontWeight: 600, fontSize: 9, letterSpacing: '0.42em', color: c.brass, marginTop: 2 }}>TEXTILES</span>
          </div>

          <h1 style={{ fontFamily: font.display, fontWeight: 500, fontSize: 38, lineHeight: 1.1, color: c.ink, margin: '34px 0 0' }}>Sign in</h1>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: c.inkSoft, marginTop: 12 }}>
            Each person signs in as themselves. What you see — pricing, cost, margin and whose
            sales appear in a report — follows the role attached to your login.
          </p>

          {/* ---- who's signing in ---- */}
          <Eyebrow style={{ marginTop: 30 }}>Who&rsquo;s signing in?</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px 12px', marginTop: 16 }}>
            {STAFF.map((u) => (
              <button key={u.email} onClick={() => quickSignIn(u)} disabled={submitting} className="r-profile ab-t" title={u.email}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <span className="r-avatar ab-t" style={{ width: 64, height: 64, borderRadius: 8, background: weave(u.tone[0], u.tone[1]), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 24, color: c.ink, boxShadow: `0 0 0 1px ${c.line}` }}>
                  {u.name[0]}
                </span>
                <span style={{ display: 'block', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontFamily: font.ui, fontSize: 12.5, color: c.ink }}>{u.name}</span>
                  <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, marginTop: 2, whiteSpace: 'nowrap' }}>{u.label}</span>
                </span>
              </button>
            ))}
          </div>

          {/* ---- or with email ---- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 30 }}>
            <span style={{ flex: 1, height: 1, background: c.line }} />
            <span style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>or with email</span>
            <span style={{ flex: 1, height: 1, background: c.line }} />
          </div>

          <form onSubmit={submit} style={{ marginTop: 6 }}>
            <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
            <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />

            {error && (
              <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: c.clay, fontFamily: font.ui }}>{error}</div>
            )}

            {/* Only after a real outage, and only where a credential was built in. */}
            {unreachable && breakGlassEnabled && (
              <div style={{ marginTop: 14, padding: '12px 14px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.brass, fontWeight: 600 }}>Offline access</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: c.inkSoft, marginTop: 6 }}>
                  Enter the offline access email and passphrase in the fields above to open the
                  CRM without the API. Live data will be unavailable and nothing can be saved.
                </div>
              </div>
            )}

            <PrimaryButton type="submit" disabled={submitting} style={{ marginTop: 22, width: '100%' }}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </form>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoComplete }) {
  return (
    <label style={{ display: 'block', marginTop: 16 }}>
      <span style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginBottom: 7 }}>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', height: 44, padding: '0 13px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 14, outline: 'none' }}
      />
    </label>
  )
}
