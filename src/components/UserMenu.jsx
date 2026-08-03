// Profile dropdown for the internal TopBar avatar (top-right).
//
// Replaces the static initials circle with a click-to-open menu: account details,
// reset password, sign out. Presentational only — the demo-grade session it acts on
// lives in AuthContext (localStorage), see the banner in ../auth/roles.js.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { IconUser, IconKey, IconLogout, IconChevron, IconLock } from './icons.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'

export default function UserMenu() {
  const { user, role, can, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Close on outside click or Escape — a menu that traps focus on a click-away feels broken.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const go = (to) => () => { setOpen(false); navigate(to) }
  const doSignOut = () => { setOpen(false); signOut(); navigate('/login', { replace: true }) }

  const items = [
    { key: 'account', label: 'Account details', icon: IconUser, onSelect: go('/account-details') },
    { key: 'password', label: 'Reset password', icon: IconKey, onSelect: go('/account-details#security') },
    // Only a login with ADMIN_USERS (Director) sees the door to user administration.
    ...(can(CAPS.ADMIN_USERS) ? [{ key: 'users', label: 'Manage users', icon: IconLock, onSelect: go('/users') }] : []),
    { key: 'signout', label: 'Sign out', icon: IconLogout, onSelect: doSignOut, danger: true },
  ]

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name} — account menu`}
        title={`${user.name} — signed in`}
        className="ab-t"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
      >
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: c.accent, color: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 15 }}>
          {user.name[0]}
        </span>
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'flex' }}>
          <IconChevron size={14} color={c.muted} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 244, zIndex: 40,
            background: c.paper, border: `1px solid ${c.line}`, borderRadius: 8,
            boxShadow: '0 12px 34px rgba(0,0,0,0.13)', overflow: 'hidden',
          }}
        >
          {/* Identity header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 16px', borderBottom: `1px solid ${c.line}`, background: c.surface }}>
            <span style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 15, color: c.inkSoft }}>
              {user.name[0]}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
                {user.shared && <span style={{ fontWeight: 500, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.brass, marginLeft: 7 }}>Shared</span>}
              </div>
              <div style={{ fontSize: 11, color: c.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
              {role && <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, marginTop: 3 }}>{role.label}</div>}
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: '6px 0' }}>
            {items.map((it) => {
              const Icon = it.icon
              return (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  onClick={it.onSelect}
                  className="ab-rowhover ab-t"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: font.ui, fontSize: 13, color: it.danger ? c.clay : c.inkSoft }}
                >
                  <Icon size={15} color={it.danger ? c.clay : c.brass} />
                  {it.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
