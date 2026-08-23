// Shared chrome: SideNav + internal TopBar (screens 1–8) and the editorial brand TopBar (screens 9–15).
// Layouts wrap screens via <Outlet/>. Screens render ONLY their main content (PageHeader + body).
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { c, font } from '../theme.js'
import { IconSearch, IconCart, IconUser, IconMenu } from './icons.jsx'
import UserMenu from './UserMenu.jsx'
import OfflineBanner from './OfflineBanner.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'

// Grouped sections (Orders, Price Lists, Samples) list every route they own in
// `match` so the nav item stays lit on each of its tabbed pages.
// `cap` (optional) hides the item from logins that lack the capability — the route
// itself is guarded in App.jsx regardless; hiding the link is courtesy, not the gate.
export const internalNav = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Pricing', path: '/pricing', cap: CAPS.FINANCE_VIEW },
  { label: 'Catalogue', path: '/catalogue', match: ['/catalogue', '/admin/products', '/admin/brands', '/admin/collections', '/admin/product-sheet'] },
  // Orders lands on the LIVE list now, not on the Dynamics mirror: web orders
  // folded into it, so /admin/orders is the section's own first tab. The mirror
  // keeps /sales-orders and stays in `match` so bookmarks still light the nav.
  { label: 'Orders', path: '/admin/orders', match: ['/admin/orders', '/admin/purchase-orders', '/sales-orders', '/purchase-orders', '/admin/shipping'] },
  { label: 'Stock', path: '/reserves', match: ['/reserves', '/cutting', '/admin/stock'] },
  { label: 'Suppliers', path: '/suppliers', match: ['/suppliers', '/admin/suppliers'] },
  { label: 'Reporting', path: '/reporting' },
  { label: 'Price Lists', path: '/price-lists', match: ['/price-lists', '/import', '/admin/price-lists'] },
  { label: 'Clients', path: '/clients' },
  // '/admin/sample-loans' must be listed by NAME: navIsOn is a startsWith and
  // '/admin/samples' does not prefix it (the s), so without it the loan desk
  // would leave the whole section dark.
  { label: 'Samples', path: '/samples', match: ['/samples', '/sample-scanner', '/admin/samples', '/admin/sample-loans', '/admin/showrooms'] },
  { label: 'Showroom Samples', path: '/showroom-samples', match: ['/showroom-samples', '/admin/sample-orders'] },
  { label: 'Users', path: '/users', cap: CAPS.ADMIN_USERS },
]

// Routes reachable outside the SideNav (e.g. the header search) still need a header title.
const navIsOn = (item, pathname) => (item.match || [item.path]).some((m) => pathname.startsWith(m))
export const brandNav = [
  { label: 'Library', path: '/library' },
  { label: 'Collections', path: '/collections' },
  { label: 'Journal', path: '/journal' },
  { label: 'Trade', path: '/storefront' },
]

// `to` is explicit per layout: there is no cover page to send the wordmark back to,
// so each half of the app points it at its own home — operations at the dashboard,
// brand world at the library.
function Wordmark({ size = 23, center = false, to = '/dashboard' }) {
  return (
    <Link to={to} style={{ textAlign: center ? 'center' : 'left', display: 'block' }}>
      <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: size, letterSpacing: '0.16em', color: c.ink }}>ATELIER</div>
      <div style={{ fontFamily: font.ui, fontWeight: 600, fontSize: size * 0.43, letterSpacing: '0.42em', color: c.brass, marginTop: 3 }}>TEXTILES</div>
    </Link>
  )
}

// ---------- Internal layout (operations tool) ----------
function SideNav({ open = false, onNavigate }) {
  const { pathname } = useLocation()
  const { can } = useAuth()
  const items = internalNav.filter((item) => !item.cap || can(item.cap))
  return (
    <aside className={`r-sidenav${open ? ' r-open' : ''}`} style={{ width: 240, flex: 'none', background: c.surface, borderRight: `1px solid ${c.line}`, display: 'flex', flexDirection: 'column', padding: '28px 0', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ padding: '0 26px 26px' }}><Wordmark /></div>
      <nav style={{ display: 'flex', flexDirection: 'column', padding: '8px 14px', gap: 1 }}>
        {items.map((item) => {
          const on = navIsOn(item, pathname)
          return (
            <Link key={item.path} to={item.path} onClick={onNavigate} className="ab-nav ab-t"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 4 }}>
              <span style={{ width: 2, height: 15, borderRadius: 2, background: on ? c.accent : 'transparent', flex: 'none' }} />
              <span style={{ fontSize: 13.5, letterSpacing: '0.01em', color: on ? c.ink : c.inkSoft, fontWeight: on ? 600 : 500 }}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export function InternalLayout() {
  const { pathname } = useLocation()
  const active = internalNav.find((n) => navIsOn(n, pathname)) || (pathname.startsWith('/search') ? { label: 'Search' } : null)
  const [navOpen, setNavOpen] = useState(false)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.paper, color: c.ink }}>
      {navOpen && <div className="r-nav-overlay" onClick={() => setNavOpen(false)} />}
      <SideNav open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <OfflineBanner />
        <header className="r-internal-header" style={{ height: 62, flex: 'none', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', position: 'sticky', top: 0, background: c.paper, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <button className="r-hamburger ab-t" onClick={() => setNavOpen(true)} aria-label="Open navigation">
              <IconMenu size={18} color={c.ink} />
            </button>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>{active ? active.label : 'Atelier'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Link to="/search" className="r-hdr-search ab-t" style={{ display: 'flex', alignItems: 'center', gap: 9, width: 240, height: 34, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
              <IconSearch size={14} /><span style={{ fontSize: 12.5, color: c.muted }}>Search the library…</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="r-internal-main" style={{ flex: 1, padding: '44px 56px 56px', maxWidth: 1240, width: '100%' }}><Outlet /></main>
      </div>
    </div>
  )
}

// ---------- Brand-world layout (editorial storefront/magazine) ----------
export function BrandLayout() {
  const { pathname } = useLocation()
  return (
    <div style={{ minHeight: '100vh', background: c.paper, color: c.ink }}>
      <OfflineBanner />
      <header className="r-brand-header" style={{ height: 74, borderBottom: `1px solid ${c.line}`, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 40px', position: 'sticky', top: 0, background: c.paper, zIndex: 20 }}>
        <Wordmark size={19} to="/library" />
        <nav className="r-brand-nav" style={{ display: 'flex', gap: 30, justifyContent: 'center' }}>
          {brandNav.map((n) => {
            const on = pathname.startsWith(n.path)
            return (
              <Link key={n.path} to={n.path} className="ab-link ab-t"
                style={{ fontSize: 13, letterSpacing: '0.04em', color: on ? c.accent : c.inkSoft, borderBottom: on ? `2px solid ${c.accent}` : '2px solid transparent', paddingBottom: 4 }}>{n.label}</Link>
            )
          })}
        </nav>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Link to="/journal" className="ab-link r-brand-about" style={{ fontSize: 12.5, color: c.muted }}>About</Link>
          <Link to="/account" className="ab-link ab-t" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: c.inkSoft }}>
            <IconUser size={15} />My Account
          </Link>
        </div>
      </header>
      <Outlet />
    </div>
  )
}

// Shared editorial footer for brand-world screens (optional use).
export function BrandFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${c.line}`, marginTop: 64, padding: '40px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
      <Wordmark size={17} to="/library" />
      <div style={{ fontSize: 12, color: c.muted, maxWidth: 320, lineHeight: 1.6 }}>16 York St, Parnell, Auckland · Curators of global design excellence.</div>
    </footer>
  )
}
