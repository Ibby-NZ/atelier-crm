// The signed-out frame: the room on the left, one 460px column on the right
// with the wordmark, a title and a note, then whatever the screen puts under
// it. Sign in, forgot password and reset password all wear it, so the three
// read as one door rather than three designs.
import { c, font } from '../theme.js'
import { WeaveImage } from '../components/ui.jsx'

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

          <div>
            <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: 19, letterSpacing: '0.16em', color: c.ink }}>ATELIER</span>
            <span style={{ display: 'block', fontFamily: font.ui, fontWeight: 600, fontSize: 9, letterSpacing: '0.42em', color: c.brass, marginTop: 2 }}>TEXTILES</span>
          </div>

          <h1 style={{ fontFamily: font.display, fontWeight: 500, fontSize: 38, lineHeight: 1.1, color: c.ink, margin: '34px 0 0' }}>{title}</h1>
          {note && (
            <p style={{ fontSize: 14, lineHeight: 1.65, color: c.inkSoft, marginTop: 12 }}>{note}</p>
          )}

          {children}
        </div>
      </div>
    </div>
  )
}

export function Field({ label, value, onChange, type = 'text', autoComplete }) {
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

// The one line of fine print under an action: a route to the other door.
export function AuthAlt({ children }) {
  return (
    <p style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.6, color: c.muted, fontFamily: font.ui }}>{children}</p>
  )
}

export const authLink = { color: c.inkSoft, textDecoration: 'underline', textUnderlineOffset: 3 }
