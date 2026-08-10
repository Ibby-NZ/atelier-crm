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

// Tab sets. A "live" tab reads AND WRITES the platform's own tables through
// atelier-api; the Dynamics screens beside it mirror D365 read-only until
// cutover, so the two stay visibly distinct rather than merging into one screen
// that sometimes saves and sometimes does not.
// Freight rates sits with Web orders rather than in a section of its own: the
// tiers price the shipping line on a storefront checkout, which is the order
// the tab beside it shows.
export const ordersTabs = [
  { key: 'sales', label: 'Sales orders', to: '/sales-orders' },
  { key: 'purchase', label: 'Purchase orders', to: '/purchase-orders' },
  { key: 'web', label: 'Web orders', to: '/admin/orders' },
  { key: 'shipping', label: 'Freight rates', to: '/admin/shipping' },
]

export const priceListTabs = [
  { key: 'lists', label: 'Price lists', to: '/price-lists' },
  { key: 'import', label: 'Import', to: '/import', cap: CAPS.PRICELIST_IMPORT },
  { key: 'rates', label: 'Supplier rates', to: '/admin/price-lists' },
]

// Samples — all LIVE as of W4-US-009: the register and showrooms on
// atelier-api's /admin/samples and /admin/showrooms, sample orders on
// /admin/sample-orders, and the scanner rewired to the by-barcode and
// check-out/check-in endpoints. The demo Tracking tab is retired — its old
// /samples route now redirects to the register, so a tab pointing at it would
// bounce straight back here.
export const samplesTabs = [
  { key: 'register', label: 'Sample register', to: '/admin/samples' },
  { key: 'showrooms', label: 'Showrooms', to: '/admin/showrooms' },
  { key: 'orders', label: 'Sample orders', to: '/admin/sample-orders' },
  { key: 'scanner', label: 'Scanner', to: '/sample-scanner' },
]

export const stockTabs = [
  { key: 'reserves', label: 'Reserves', to: '/reserves' },
  { key: 'cutting', label: 'Cutting', to: '/cutting' },
  { key: 'manage', label: 'Manage stock', to: '/admin/stock' },
]

// Suppliers — the demo supplier master (src/data/suppliers.js + localStorage)
// first, then the LIVE screen on atelier-api's /admin/suppliers. The demo screen
// is deliberately left untouched: it shows the brand roll-up and the PO defaults
// the office already recognises, while the live tab is the one whose edits
// persist. The strip is what makes each reachable from the other.
export const suppliersTabs = [
  { key: 'master', label: 'Supplier master', to: '/suppliers' },
  { key: 'manage', label: 'Manage suppliers', to: '/admin/suppliers' },
]

export const catalogueTabs = [
  { key: 'library', label: 'Library', to: '/catalogue' },
  { key: 'products', label: 'Products', to: '/admin/products' },
  { key: 'brands', label: 'Houses', to: '/admin/brands' },
  { key: 'collections', label: 'Collections', to: '/admin/collections' },
  { key: 'categories', label: 'Categories', to: '/admin/product-sheet' },
]

// Clients — the people who buy, in one section. Two tabs, and only two, because
// there are only two states a client is in: they have applied, or they are a
// client. Approving an application flips `trade_approved`, which is exactly what
// moves the account from the first list into the second — one account changing
// state, never two records.
//
// Both tabs are LIVE and writable, backed by atelier-api's /admin/users
// (segment=clients) and /admin/trade-applications. The Dynamics mirror held the
// "Clients" tab until this split and now lives at /clients/legacy, linked from
// the Clients screen: it is read-only until cutover, so it could never be the
// tab that offers add, edit and delete.
//
// Both carry CAPS.ADMIN_USERS because they create, re-role and archive real
// logins — the same power Users & permissions holds. The routes are guarded
// regardless; dropping the tab only stops the strip offering a door onto a
// locked panel.
//
// "Clients" lists customer AND trade accounts, because a retail customer
// applying for trade is one account changing role, not two.
export const clientsTabs = [
  { key: 'clients', label: 'Clients', to: '/clients', cap: CAPS.ADMIN_USERS },
  { key: 'applicants', label: 'Applicants', to: '/clients/applicants', cap: CAPS.ADMIN_USERS },
]

// (There is no usersTabs any more: Applicants moved into the Clients section
// above, which left Users & permissions a one-tab strip — a strip with a single
// tab reads as a broken navigation, so UserManagement carries a pointer to
// Clients instead.)
