// Shared chrome: SideNav + internal TopBar (screens 1–8) and the editorial brand TopBar (screens 9–15).
// Layouts wrap screens via <Outlet/>. Screens render ONLY their main content (PageHeader + body).
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { c } from '../theme.js'
import Wordmark from './Wordmark.jsx'
import { IconUser, IconMenu, IconClose, IconChevron } from './icons.jsx'
import HeaderSearch from './HeaderSearch.jsx'
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

// The wordmark is the storefront's lockup (./Wordmark.jsx). `to` is explicit
// per layout: operations point it at the dashboard, brand world at the library.

// ---------- Internal layout (operations tool) ----------
// One group open at a time (client, Sept 2026): the open one is held by
// SideNav and handed down, so opening a group closes whichever was open, and a
// route change opens the current page's group.
function NavigationGroup({ group, page, expanded, onToggle, onNavigate }) {
  // A group with no label holds ONE page (Dashboard, Suppliers): it renders as
  // a single destination at the group label's weight, so the column is one list
  // of equal rows (client, Sept 2026). Styles live in index.css (`.ab-nav-*`).
  if (!group.label) {
    return group.pages.map(item => {
      const current = page?.id === item.id
      return (
        <Link key={item.id} to={item.to} onClick={onNavigate} aria-current={current ? 'page' : undefined} className="ab-nav-single">
          <span>{item.label}</span>
          {item.navNote && <span className="ab-nav-note">{item.navNote}</span>}
        </Link>
      )
    })
  }
  return (
    <div>
      {group.alwaysOpen
        ? <div className="ab-nav-group" role="presentation">{group.label}</div>
        : <button type="button" className="ab-nav-group" aria-expanded={expanded} aria-controls={`nav-${group.id}`}
            onClick={onToggle}>
            {group.label}<span aria-hidden="true" className="ab-nav-chevron"><IconChevron size={12} /></span>
          </button>}
      <div id={`nav-${group.id}`} hidden={!expanded}>
        {group.pages.map(item => {
          const current = page?.id === item.id
          return (
            <Link key={item.id} to={item.to} onClick={onNavigate} aria-current={current ? 'page' : undefined} className="ab-nav-item">
              <span>{item.label}</span>
              {item.navNote && <span className="ab-nav-note">{item.navNote}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SideNav({ page, pathname, open, onNavigate, closeRef, navRef }) {
  const { can } = useAuth()
  const [openGroup, setOpenGroup] = useState(page?.group ?? null)
  useEffect(() => { if (page?.group) setOpenGroup(page.group) }, [page?.group, pathname])
  return (
    <aside id="workspace-navigation" ref={navRef} className={`r-sidenav${open ? ' r-open' : ''}`}
      role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label={open ? 'Navigation' : undefined}
      style={{ width: 240, flex: 'none', background: c.rail, display: 'flex', flexDirection: 'column', padding: '28px 0 12px', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ padding: '0 20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark width={150} />
        <button ref={closeRef} type="button" className="r-nav-close ab-ghost ab-t" onClick={onNavigate} aria-label="Close navigation"><IconClose size={16} /></button>
      </div>
      <nav aria-label="Workspace" style={{ overflowY: 'auto', minHeight: 0, padding: '0 0 12px', flex: 1, overscrollBehavior: 'contain' }}>
        {workspaceGroups(can).map(group => (
          <NavigationGroup key={group.id} group={group} page={page} onNavigate={onNavigate}
            expanded={group.alwaysOpen || openGroup === group.id}
            onToggle={() => setOpenGroup(current => (current === group.id ? null : group.id))} />
        ))}
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
      {/* The window: the app in the storefront's 96rem container, centred on the
          recessed ground, hairlines down both sides (index.css `.ab-window`). */}
      <div className="ab-window" style={{ color: c.ink }}>
        <a href="#workspace-main" className="ab-skip" onClick={event => { event.preventDefault(); document.getElementById('workspace-main')?.focus() }}>Skip to page content</a>
        {navOpen && <div className="r-nav-overlay" onClick={() => setNavOpen(false)} />}
        <SideNav page={page} pathname={pathname} open={navOpen} navRef={navRef} closeRef={closeRef} onNavigate={() => setNavOpen(false)} />
        <div inert={navOpen ? '' : undefined} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <OfflineBanner />
          <header className="r-internal-header" style={{ height: 62, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 40px', position: 'sticky', top: 0, background: c.rail, zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 12 }}>
              <button ref={menuRef} type="button" className="r-hamburger ab-t" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="workspace-navigation"><IconMenu size={18} color={c.ink} /></button>
              <div style={{ fontSize: 12, fontWeight: 600, color: c.accentDeep }}>{page?.label || 'Atelier'}</div>
              {page?.source && <span style={{ fontSize: 11, color: c.clay, borderLeft: `1px solid ${c.line}`, paddingLeft: 12 }}>{page.source}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <HeaderSearch />
              <UserMenu />
            </div>
          </header>
          {/* No inner cap: the window IS the width, and the content fills it. */}
          <main id="workspace-main" tabIndex={-1} className="r-internal-main" style={{ flex: 1, minWidth: 0, padding: '32px 40px 56px', width: '100%' }}><Outlet /></main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  )
}

// ---------- Brand-world layout (editorial storefront/magazine) ----------
export function BrandLayout() {
  const { pathname } = useLocation()
  return (
    <div className="ab-window" style={{ flexDirection: 'column', color: c.ink }}>
      <OfflineBanner />
      <header className="r-brand-header" style={{ height: 74, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 40px', position: 'sticky', top: 0, background: c.rail, zIndex: 20 }}>
        <Wordmark width={140} to="/library" />
        <nav className="r-brand-nav" style={{ display: 'flex', gap: 30, justifyContent: 'center' }}>
          {brandNav.map((n) => {
            const on = pathname.startsWith(n.path)
            return (
              <Link key={n.path} to={n.path} className="ab-link ab-t"
                style={{ fontSize: 14, fontWeight: 500, color: on ? c.ink : c.inkSoft, borderBottom: on ? `1.5px solid ${c.ink}` : '1.5px solid transparent', paddingBottom: 4 }}>{n.label}</Link>
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
      <Wordmark width={130} to="/library" />
      <div style={{ fontSize: 12, color: c.muted, maxWidth: 320, lineHeight: 1.6 }}>16 York St, Parnell, Auckland · Curators of global design excellence.</div>
    </footer>
  )
}
