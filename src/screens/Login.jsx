// Sign in — staff log in against atelier-api (POST /auth/login).
//
// Back-office accounts are seeded by `npm run seed:staff` with a shared TEMP
// password; the quick-fill buttons fill it so the CRM can be driven immediately.
// Real per-user passwords + change-on-first-login are a follow-up.

import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { Eyebrow, PrimaryButton } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Mirrors src/seed/seed-staff.js in atelier-api.
const TEMP_PASSWORD = 'AtelierTemp2026!'
const STAFF = [
  { name: 'Liz', email: 'liz@ateliertextiles.co.nz', label: 'Director' },
  { name: 'Jenette', email: 'jenette@ateliertextiles.co.nz', label: 'Director' },
  { name: 'Charlotte', email: 'charlotte@ateliertextiles.co.nz', label: 'Back office' },
  { name: 'Rebecca', email: 'rebecca@ateliertextiles.co.nz', label: 'Back office' },
  { name: 'Showroom', email: 'showroom@ateliertextiles.co.nz', label: 'Back office' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { signIn } = useAuth()
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
    if (result.error) return setError(result.error)
    setError('')
    navigate(from, { replace: true })
  }

  // Presenter affordance: fill the form for a staff account in one click.
  function quickFill(person) {
    setEmail(person.email)
    setPassword(TEMP_PASSWORD)
    setError('')
  }

  return (
    <div style={{ minHeight: '100vh', background: c.paper, display: 'flex', flexDirection: 'column' }}>
      <div className="r-hero-pad" style={{ position: 'relative', padding: '56px 56px 40px', borderBottom: `1px solid ${c.line}`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: weave('#EBE9DF', '#DEDAC9'), opacity: 0.5 }} />
        <div style={{ position: 'relative' }}>
          <Link to="/" style={{ display: 'block' }}>
            <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 23, letterSpacing: '0.16em', color: c.ink }}>ATELIER</div>
            <div style={{ fontFamily: font.ui, fontWeight: 600, fontSize: 10, letterSpacing: '0.42em', color: c.brass, marginTop: 3 }}>TEXTILES</div>
          </Link>
        </div>
      </div>

      <div className="r-hero-pad" style={{ flex: 1, padding: '56px', maxWidth: 1040, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 56 }} className="r-cover-grid">

          {/* ---- the form ---- */}
          <div>
            <Eyebrow>Operations</Eyebrow>
            <h1 style={{ fontFamily: font.display, fontWeight: 500, fontSize: 38, lineHeight: 1.1, color: c.ink, margin: '13px 0 0' }}>Sign in</h1>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: c.inkSoft, marginTop: 12, maxWidth: 420 }}>
              Each person signs in as themselves. What you see — pricing, cost, margin and whose
              sales appear in a report — follows the role attached to your login.
            </p>

            <form onSubmit={submit} style={{ marginTop: 28, maxWidth: 400 }}>
              <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
              <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />

              {error && (
                <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: c.clay, fontFamily: font.ui }}>{error}</div>
              )}

              <PrimaryButton type="submit" disabled={submitting} style={{ marginTop: 22, width: '100%' }}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </PrimaryButton>
            </form>
          </div>

          {/* ---- staff accounts ---- */}
          <div>
            <Eyebrow>Staff accounts</Eyebrow>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: c.muted, margin: '12px 0 18px', maxWidth: 400 }}>
              Choose a login to fill the form. The seeded temp password is
              <span style={{ fontFamily: font.mono, color: c.inkSoft }}> {TEMP_PASSWORD}</span> — change it after first sign-in.
            </p>
            <div style={{ borderTop: `1px solid ${c.line}` }}>
              {STAFF.map((u) => {
                return (
                  <button key={u.email} onClick={() => quickFill(u)} className="ab-rowhover ab-t"
                    style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', padding: '13px 8px', margin: '0 -8px', borderBottom: `1px solid ${c.line}`, background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer' }}>
                    <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 14, color: c.inkSoft }}>
                      {u.name[0]}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: font.display, fontSize: 15.5, color: c.ink }}>
                        {u.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: c.muted, fontFamily: font.mono, marginTop: 2 }}>{u.email}</span>
                    </span>
                    <span style={{ flex: 'none', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{u.label}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: 22, padding: '16px 18px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface }}>
              <div style={{ fontSize: 12, lineHeight: 1.65, color: c.muted }}>
                <strong style={{ color: c.inkSoft, fontWeight: 600 }}>Indicative demo.</strong> Roles here decide what the
                screen draws, not what the browser holds — every figure is already in the page. Real
                enforcement belongs on the server, which is scoped as GEN-01 in the build spec.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="r-hero-pad" style={{ borderTop: `1px solid ${c.line}`, padding: '20px 56px', fontSize: 12, color: c.muted, fontFamily: font.ui }}>
        Prepared by Verum · Indicative demo · seeded with Atelier’s real catalogue
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
