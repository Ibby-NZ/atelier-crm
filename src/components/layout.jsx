// Shared chrome: SideNav + internal TopBar (screens 1–8) and the editorial brand TopBar (screens 9–15).
// Layouts wrap screens via <Outlet/>. Screens render ONLY their main content (PageHeader + body).
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { c, font, radius } from '../theme.js'
import { IconSearch, IconUser, IconMenu, IconClose, IconChevron } from './icons.jsx'
import UserMenu from './UserMenu.jsx'
import OfflineBanner from './OfflineBanner.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { WorkspaceContext } from './WorkspaceContext.js'
import { workspaceActions, workspaceGroups, workspacePage } from './workspaceNavigation.js'

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
function NavigationGroup({ group, page, pathname, onNavigate }) {
  const active = page?.group === group.id
  const [open, setOpen] = useState(active)
  useEffect(() => { if (active) setOpen(true) }, [active, pathname])
  const expanded = group.alwaysOpen || open
  const labelStyle = { fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: active ? c.inkSoft : c.muted }
  return (
    <div style={{ padding: '4px 0' }}>
      {group.label && (group.alwaysOpen
        ? <div style={{ ...labelStyle, padding: '10px 14px 6px' }}>{group.label}</div>
        : <button type="button" className="ab-nav ab-t" aria-expanded={expanded} aria-controls={`nav-${group.id}`}
            onClick={() => setOpen(value => !value)}
            style={{ ...labelStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: 0, borderRadius: radius.xs, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            {group.label}<span aria-hidden="true" style={{ transform: expanded ? 'rotate(90deg)' : 'none', display: 'flex' }}><IconChevron size={12} /></span>
          </button>)}
      <div id={`nav-${group.id}`} hidden={!expanded}>
        {group.pages.map(item => {
          const current = page?.id === item.id
          return (
            <Link key={item.id} to={item.to} onClick={onNavigate} aria-current={current ? 'page' : undefined} className="ab-nav ab-t"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '2px 0', padding: '9px 12px', borderLeft: `2px solid ${current ? c.accent : 'transparent'}`, borderRadius: radius.xs, background: current ? c.paper : 'transparent', color: current ? c.ink : c.inkSoft, fontWeight: current ? 600 : 500, fontSize: 13.5 }}>
              <span>{item.label}</span>
              {item.navNote && <span style={{ color: c.muted, fontSize: 10.5, fontWeight: 400 }}>{item.navNote}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SideNav({ page, pathname, open, onNavigate, closeRef, navRef }) {
  const { can } = useAuth()
  return (
    <aside id="workspace-navigation" ref={navRef} className={`r-sidenav${open ? ' r-open' : ''}`}
      role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label={open ? 'Navigation' : undefined}
      style={{ width: 240, flex: 'none', background: c.surface, borderRight: `1px solid ${c.line}`, display: 'flex', flexDirection: 'column', padding: '24px 0 12px', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ padding: '0 26px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark />
        <button ref={closeRef} type="button" className="r-nav-close ab-ghost ab-t" onClick={onNavigate} aria-label="Close navigation"><IconClose size={16} /></button>
      </div>
      <nav aria-label="Workspace" style={{ overflowY: 'auto', minHeight: 0, padding: '0 12px 12px', flex: 1, overscrollBehavior: 'contain' }}>
        {workspaceGroups(can).map(group => <NavigationGroup key={group.id} group={group} page={page} pathname={pathname} onNavigate={onNavigate} />)}
      </nav>
    </aside>
  )
}

export function InternalLayout() {
  const { pathname } = useLocation()
  const page = workspacePage(pathname)
  const [navOpen, setNavOpen] = useState(false)
  const navRef = useRef(null)
  const closeRef = useRef(null)
  const menuRef = useRef(null)
  useEffect(() => { setNavOpen(false) }, [pathname])
  useEffect(() => {
    if (!navOpen) return
    closeRef.current?.focus()
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); setNavOpen(false) }
      if (event.key === 'Tab') {
        const controls = [...navRef.current.querySelectorAll('a[href], button:not(:disabled)')].filter(el => el.getClientRects().length)
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    const onResize = () => { if (window.innerWidth > 640) setNavOpen(false) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      menuRef.current?.focus()
    }
  }, [navOpen])
  return (
    <WorkspaceContext.Provider value={{ page, actions: workspaceActions(pathname) }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: c.paper, color: c.ink }}>
        <a href="#workspace-main" className="ab-skip" onClick={event => { event.preventDefault(); document.getElementById('workspace-main')?.focus() }}>Skip to page content</a>
        {navOpen && <div className="r-nav-overlay" onClick={() => setNavOpen(false)} />}
        <SideNav page={page} pathname={pathname} open={navOpen} navRef={navRef} closeRef={closeRef} onNavigate={() => setNavOpen(false)} />
        <div inert={navOpen ? '' : undefined} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <OfflineBanner />
          <header className="r-internal-header" style={{ height: 62, flex: 'none', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 32px', position: 'sticky', top: 0, background: c.paper, zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 12 }}>
              <button ref={menuRef} type="button" className="r-hamburger ab-t" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="workspace-navigation"><IconMenu size={18} color={c.ink} /></button>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.inkSoft }}>{page?.label || 'Atelier'}</div>
              {page?.source && <span style={{ fontSize: 11, color: c.clay, borderLeft: `1px solid ${c.line}`, paddingLeft: 12 }}>{page.source}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Link to="/search" className="r-hdr-search ab-t" style={{ display: 'flex', alignItems: 'center', gap: 9, width: 240, height: 34, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
                <IconSearch size={14} /><span style={{ fontSize: 12.5, color: c.muted }}>Search the library…</span>
              </Link>
              <UserMenu />
            </div>
          </header>
          <main id="workspace-main" tabIndex={-1} className="r-internal-main" style={{ flex: 1, minWidth: 0, padding: '28px 32px 44px', maxWidth: 1240, width: '100%' }}><Outlet /></main>
        </div>
      </div>
    </WorkspaceContext.Provider>
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
