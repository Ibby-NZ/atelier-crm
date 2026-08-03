// Account details — the signed-in staff member's own profile, role and access.
// Reached from the TopBar avatar menu (../components/UserMenu.jsx).
//
// DEMO-GRADE. The password form here is indicative: this build has no server, so it
// cannot actually reset a credential (see the banner in ../auth/roles.js). It shows
// the SHAPE of the flow — the real reset lives server-side in the GEN-01 build.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill, Toast, Indicative, PrimaryButton, SecondaryButton } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'

// Human labels for each capability, in the order they read best as an access summary.
const CAP_LABELS = [
  [CAPS.FINANCE_VIEW, 'View cost, margin, landed & supplier spend'],
  [CAPS.PRICING_EDIT, 'Edit pricing & publish stock prices'],
  [CAPS.PRICELIST_IMPORT, 'Import supplier price lists'],
  [CAPS.REPORTS_ALL, 'All-company reporting (not just own sales)'],
  [CAPS.ADMIN_USERS, 'Manage users & role assignment'],
]

const sectionLabel = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: c.muted, fontFamily: font.ui,
}
const panel = { border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }
const panelHead = { padding: '16px 20px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

export default function AccountDetails() {
  const { user, role, can, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const securityRef = useRef(null)
  const [toast, setToast] = useState(null)
  const tRef = useRef()

  const flash = (msg) => {
    setToast(msg)
    clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(null), 3200)
  }

  // The "Reset password" menu item deep-links to #security — bring that card into view.
  useEffect(() => {
    if (location.hash === '#security' && securityRef.current) {
      securityRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash])

  if (!user) return null

  const resetPassword = (e) => {
    e.preventDefault()
    flash('Indicative — password resets are handled by the server in the live build.')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Your account"
        title={<>Account details</>}
        subtitle="Your profile and what your role can reach. Sign-in and password changes are owned by the server in the live build."
      />

      <div className="r-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start', marginTop: 34 }}>

        {/* Identity */}
        <section style={panel}>
          <div style={panelHead}><span style={sectionLabel}>Profile</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '20px' }}>
            <div style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 22, color: c.inkSoft }}>
              {user.name[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: font.display, fontSize: 21, color: c.ink }}>
                {user.name}
                {user.shared && <span style={{ fontFamily: font.ui, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.brass, marginLeft: 10 }}>Shared login</span>}
              </div>
              <div style={{ fontSize: 12.5, color: c.muted, fontFamily: font.mono, marginTop: 3 }}>{user.email}</div>
            </div>
          </div>
          <dl style={{ margin: 0, borderTop: `1px solid ${c.line}` }}>
            <Row label="Role">{role ? role.label : '—'}</Row>
            <Row label="Salesperson">{user.owner || <span style={{ color: c.muted }}>Not attributed</span>}</Row>
          </dl>
        </section>

        {/* Role & access */}
        <section style={panel}>
          <div style={panelHead}>
            <span style={sectionLabel}>Access</span>
            <span style={{ fontSize: 11, color: c.muted }}>{role ? role.blurb : ''}</span>
          </div>
          <div>
            {CAP_LABELS.map(([cap, label]) => {
              const allowed = can(cap)
              return (
                <div key={cap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 20px', borderBottom: `1px solid ${c.line}` }}>
                  <span style={{ fontSize: 13, color: allowed ? c.ink : c.muted }}>{label}</span>
                  <StatusPill tone={allowed ? 'sage' : 'muted'}>{allowed ? 'Allowed' : 'Restricted'}</StatusPill>
                </div>
              )
            })}
          </div>
        </section>

        {/* Security / password */}
        <section id="security" ref={securityRef} style={{ ...panel, gridColumn: '1 / -1' }}>
          <div style={panelHead}>
            <span style={sectionLabel}>Password &amp; security</span>
            <Indicative />
          </div>
          <div style={{ padding: '18px 20px' }}>
            <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.6, color: c.muted, maxWidth: 560 }}>
              In the live build, resetting a password verifies your current one and stores a new
              per-user hash on the server. This demo has no server, so the form below is indicative —
              it shows the flow without changing any credential.
            </p>
            <form onSubmit={resetPassword} style={{ maxWidth: 400 }}>
              <Field label="Current password" type="password" autoComplete="current-password" />
              <Field label="New password" type="password" autoComplete="new-password" />
              <Field label="Confirm new password" type="password" autoComplete="new-password" />
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <PrimaryButton type="submit">Update password</PrimaryButton>
                <SecondaryButton onClick={() => flash('Indicative — a reset link would be emailed to you in the live build.')}>
                  Forgot password?
                </SecondaryButton>
              </div>
            </form>
          </div>
        </section>
      </div>

      <div style={{ marginTop: 32, paddingTop: 22, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: c.muted }}>Signed in as {user.email}.</span>
        <SecondaryButton onClick={() => { signOut(); navigate('/login', { replace: true }) }} style={{ color: c.clay }}>
          Sign out
        </SecondaryButton>
      </div>

      {toast && (
        <Toast>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.brass }} />
          {toast}
        </Toast>
      )}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '13px 20px', borderBottom: `1px solid ${c.line}` }}>
      <dt style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13.5, color: c.ink }}>{children}</dd>
    </div>
  )
}

function Field({ label, type = 'text', autoComplete }) {
  return (
    <label style={{ display: 'block', marginTop: 14 }}>
      <span style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginBottom: 7 }}>{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        style={{ width: '100%', height: 42, padding: '0 13px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 14, outline: 'none' }}
      />
    </label>
  )
}
