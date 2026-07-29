// Generic sub-navigation tab strip — same pattern as the Reporting tabs
// (Overview / Report library). Active tab renders as a static span; the
// rest are links. Tab sets for each grouped section live here so screens
// and the SideNav grouping stay in sync.
import { Link } from 'react-router-dom'
import { c } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'

// A tab carrying `cap` is dropped for logins without it, following the SideNav.
// The route behind it is guarded either way — this only stops the strip offering a
// door that opens onto a locked panel, and taking the strip itself away with it.
export function SectionTabs({ tabs, active }) {
  const { can } = useAuth()
  const visible = tabs.filter((t) => !t.cap || can(t.cap))
  return (
    <div style={{ marginTop: 20, display: 'flex', gap: 24, borderBottom: `1px solid ${c.line}` }}>
      {visible.map((t) => {
        const on = t.key === active
        if (on) {
          return (
            <span key={t.key} style={{ paddingBottom: 9, fontSize: 13, color: c.accent, fontWeight: 600, borderBottom: `2px solid ${c.accent}` }}>
              {t.label}
            </span>
          )
        }
        return (
          <Link key={t.key} to={t.to} className="ab-link" style={{ textDecoration: 'none', paddingBottom: 9, fontSize: 13, color: c.muted, borderBottom: '2px solid transparent' }}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

export const ordersTabs = [
  { key: 'sales', label: 'Sales orders', to: '/sales-orders' },
  { key: 'purchase', label: 'Purchase orders', to: '/purchase-orders' },
]

export const priceListTabs = [
  { key: 'lists', label: 'Price lists', to: '/price-lists' },
  { key: 'import', label: 'Import', to: '/import', cap: CAPS.PRICELIST_IMPORT },
]

export const samplesTabs = [
  { key: 'tracking', label: 'Tracking', to: '/samples' },
  { key: 'scanner', label: 'Scanner', to: '/sample-scanner' },
]

export const stockTabs = [
  { key: 'reserves', label: 'Reserves', to: '/reserves' },
  { key: 'cutting', label: 'Cutting', to: '/cutting' },
]
