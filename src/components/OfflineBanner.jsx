// Standing notice that this is a break-glass session, not a real one.
//
// An unlabelled offline session is the dangerous version of this feature:
// every live screen would render empty and every save would fail, and the
// operator would read that as "the CRM is broken" rather than "I am signed in
// locally because the API is down". So it says both things — what works and
// what does not — in one line.
//
// Renders nothing at all in a normal session, so it costs the standard path
// one boolean.

import { c, font } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'

export default function OfflineBanner() {
  const { offline } = useAuth()
  if (!offline) return null

  return (
    <div
      role="status"
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: '4px 10px',
        padding: '9px 40px',
        background: c.surfaceDeep,
        borderBottom: `1px solid ${c.clay}`,
        fontFamily: font.ui,
        fontSize: 12.5,
        lineHeight: 1.5,
        color: c.ink,
      }}
    >
      <span style={{ fontSize: 12, color: c.clay, fontWeight: 600 }}>
        Offline access
      </span>
      <span style={{ color: c.inkSoft }}>
        Signed in locally because the API did not answer. Live data (clients, orders, stock,
        price lists) is unavailable and nothing can be saved. Sign out and back in once the API
        is up.
      </span>
    </div>
  )
}
