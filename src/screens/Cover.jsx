import { Link } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { Eyebrow } from '../components/ui.jsx'
import { internalNav, brandNav } from '../components/layout.jsx'
import { IconArrow } from '../components/icons.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const extraBrand = [
  { label: 'Product page', path: '/product' }, { label: 'Project folder', path: '/project' },
  { label: 'Journal story', path: '/journal/story' }, { label: 'My account', path: '/account' },
]

export default function Cover() {
  const { user, role, can, signOut } = useAuth()
  // Signed in, the contents mirror what the SideNav will actually offer — a cover
  // that lists a screen the reader's role cannot open is a promise the app breaks.
  // Signed out it stays complete: this is the index of the whole system, not of one seat.
  // Goes through can() rather than reading role.caps: one predicate, and it fails
  // closed on a role that isn't in ROLES instead of throwing on the index page.
  const opsItems = user ? internalNav.filter((n) => !n.cap || can(n.cap)) : internalNav
  return (
    <div style={{ minHeight: '100vh', background: c.paper, display: 'flex', flexDirection: 'column' }}>
      {/* hero band */}
      <div className="r-hero-pad" style={{ position: 'relative', padding: '72px 56px 56px', borderBottom: `1px solid ${c.line}`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: weave('#EFE8DA', '#E0D4BC'), opacity: 0.5 }} />
        <div style={{ position: 'relative' }}>
          <Eyebrow>Atelier Textiles · Parnell, Auckland</Eyebrow>
          <h1 className="r-hero-h1" style={{ fontFamily: font.display, fontWeight: 500, fontSize: 58, lineHeight: 1.04, letterSpacing: '-0.02em', color: c.ink, margin: '16px 0 0', maxWidth: 880 }}>
            A platform for <span style={{ fontStyle: 'italic', color: c.accent }}>curators</span> of global design excellence
          </h1>
          <p style={{ fontFamily: font.ui, fontSize: 16, lineHeight: 1.7, color: c.inkSoft, maxWidth: 620, marginTop: 22 }}>
            A working preview — how Atelier’s operations, pricing, catalogue and brand world could feel as one owned system. Every figure is indicative.
          </p>
          <div style={{ display: 'flex', gap: 14, marginTop: 30, flexWrap: 'wrap' }}>
            <Link to={user ? '/dashboard' : '/login'} className="ab-primary ab-t" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 48, padding: '0 24px', borderRadius: 3, fontFamily: font.ui, fontSize: 14, fontWeight: 500 }}>
              {user ? 'Enter the operations tool' : 'Sign in to the operations tool'} <IconArrow size={16} color={c.paper} />
            </Link>
            <Link to="/library" className="ab-secondary ab-t" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 48, padding: '0 24px', borderRadius: 3, fontFamily: font.ui, fontSize: 14, fontWeight: 500 }}>
              Enter the brand world <IconArrow size={16} color={c.ink} />
            </Link>
          </div>

          {user && (
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, fontFamily: font.ui, fontSize: 12.5, color: c.muted }}>
              <span>Signed in as <span style={{ color: c.inkSoft, fontWeight: 600 }}>{user.name}</span> · {role.label}</span>
              <span style={{ color: c.line }}>|</span>
              <button onClick={signOut} className="ab-t" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: font.ui, fontSize: 12.5, color: c.accent }}>Sign out</button>
            </div>
          )}
        </div>
      </div>

      {/* contents */}
      <div className="r-cover-grid r-hero-pad" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', maxWidth: 1100, width: '100%', margin: '0 auto', padding: '48px 56px' }}>
        <Section title="Operations" sub="The gallery-grade ERP" items={opsItems} />
        <Section title="Brand world" sub="The editorial storefront & journal" items={[...brandNav.filter(n => n.path !== '/collections'), ...extraBrand]} />
      </div>
      <div className="r-hero-pad" style={{ borderTop: `1px solid ${c.line}`, padding: '20px 56px', fontSize: 12, color: c.muted, fontFamily: font.ui }}>
        Prepared by Verum · Indicative demo · seeded with Atelier’s real catalogue
      </div>
    </div>
  )
}

function Section({ title, sub, items }) {
  return (
    <div className="r-cover-section" style={{ padding: '0 36px' }}>
      <Eyebrow>{sub}</Eyebrow>
      <h2 style={{ fontFamily: font.display, fontWeight: 500, fontSize: 26, color: c.ink, margin: '10px 0 18px' }}>{title}</h2>
      <div style={{ borderTop: `1px solid ${c.line}` }}>
        {items.map((n) => (
          <Link key={n.path} to={n.path} className="ab-rowhover ab-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 8px', borderBottom: `1px solid ${c.line}`, margin: '0 -8px' }}>
            <span style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{n.label}</span>
            <IconArrow size={15} />
          </Link>
        ))}
      </div>
    </div>
  )
}
