// The signed-out frame: the room on the left, one 460px column on the right
// with the wordmark, a title and a note, then whatever the screen puts under
// it. Sign in, forgot password and reset password all wear it, so the three
// read as one door rather than three designs.
import { c, font } from '../theme.js'
import { WeaveImage } from '../components/ui.jsx'
import Wordmark from '../components/Wordmark.jsx'

export default function AuthFrame({ title, note, children }) {
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

      {/* ---- the column ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px 56px' }} className="r-hero-pad">
        <div style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>

          <Wordmark width={180} to={null} />

          <h1 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.03em', color: c.ink, margin: '40px 0 0' }}>{title}</h1>
          {note && (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: c.inkSoft, marginTop: 14 }}>{note}</p>
          )}

          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({ label, value, onChange, type = 'text', autoComplete }) {
  return (
    <label style={{ display: 'block', marginTop: 18 }}>
      <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: c.inkSoft, marginBottom: 8 }}>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="ab-input"
        style={{ width: '100%', height: 44, padding: '0 12px', border: `1px solid ${c.lineStrong}`, borderRadius: 0, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 14, outline: 'none' }}
      />
    </label>
  )
}

// The one line of fine print under an action: a route to the other door.
export function AuthAlt({ children }) {
  return (
    <p style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.6, color: c.muted, fontFamily: font.ui }}>{children}</p>
  )
}

export const authLink = { color: c.ink, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 4, textDecorationThickness: 1.5 }
