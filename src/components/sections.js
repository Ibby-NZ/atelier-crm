// The grouped sections' tab sets and their header actions — the DATA half of
// sectionTabs.jsx, pulled into a plain .js so it can be unit-tested. This repo
// has no jsdom, so a `.jsx` cannot be rendered in a test; anything that is a
// decision rather than a layout lives here (the same split adminSuppliers.js
// and adminOrders.js make for their screens).
//
// `sectionTabs.jsx` re-exports everything below, so every screen keeps importing
// `{ SectionTabs, ordersTabs }` from the .jsx exactly as before.
//
// A "live" tab reads AND WRITES the platform's own tables through atelier-api;
// a Dynamics tab mirrors D365 read-only until cutover, so the two stay visibly
// distinct rather than merging into one screen that sometimes saves and
// sometimes does not.

import { CAPS } from '../auth/roles.js'

// Orders. **One list, not two.** `orders.kind` already says where an order came
// from — `checkout` from the website, `manual` keyed by the office — so the
// separate "Web orders" tab was a second list over the same table, and the
// client asked for it folded in with the source shown as a column instead. The
// live list is therefore the "Sales orders" tab; the D365 mirror beside it keeps
// its own route (bookmarks) and is labelled for what it is, because it is
// read-only until cutover and can never be the tab that raises an order.
//
// Freight rates sits here rather than in a section of its own: the tiers price
// the shipping line on a storefront checkout, which is the order the tab beside
// it shows.
export const ordersTabs = [
  { key: 'sales', label: 'Sales orders', to: '/admin/orders' },
  { key: 'purchase', label: 'Purchase orders', to: '/admin/purchase-orders' },
  { key: 'legacy', label: 'Dynamics (historical)', to: '/sales-orders' },
  { key: 'shipping', label: 'Freight rates', to: '/admin/shipping' },
]

// The two things the office starts from anywhere in this section. They belong to
// the SECTION, not to a screen: the client asked for "New sales order" on every
// tab, and a button pasted into four screens is four places for it to drift out
// of step. `SectionTabs` resolves them from the tab set it was handed, so no
// screen passes or renders them.
export const ordersActions = [
  { key: 'new-sales-order', label: 'New sales order', to: '/admin/orders/new' },
  { key: 'new-purchase-order', label: 'New purchase order', to: '/admin/purchase-orders/new' },
]

// Freight is NOT the Orders section's "Freight rates" tab: that one is
// /admin/shipping — the tiers that price the shipping line on a storefront
// checkout, i.e. what a CUSTOMER pays outbound. This tab is the supplier
// freight ledger behind the landed-cost waterfall — what ATELIER pays to land a
// consignment — and it sits here because it prices the same supplier rows the
// tab beside it shows.
export const priceListTabs = [
  { key: 'lists', label: 'Price lists', to: '/price-lists' },
  { key: 'import', label: 'Import', to: '/import', cap: CAPS.PRICELIST_IMPORT },
  { key: 'rates', label: 'Supplier rates', to: '/admin/price-lists' },
  { key: 'freight', label: 'Freight', to: '/admin/freight' },
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

// Keyed on the tab array's IDENTITY rather than on a name, because the tab set
// already IS the section: every screen in a section passes it to <SectionTabs>,
// so nothing new has to be threaded through a screen for the actions to appear
// on all of its tabs. Both sides are module constants, so the identity is fixed
// for the life of the bundle.
const SECTION_ACTIONS = new Map([[ordersTabs, ordersActions]])

/**
 * The header actions a section offers, or an empty array for a section with
 * none. Sections without actions render no action bar at all.
 *
 * @param {ReadonlyArray<object>} tabs one of the tab sets above
 * @returns {ReadonlyArray<{key: string, label: string, to: string}>}
 */
export function sectionActions(tabs) {
  return SECTION_ACTIONS.get(tabs) ?? []
}

/** Every tab set, for a test that wants to walk all of them. */
export const ALL_TAB_SETS = [
  ordersTabs,
  priceListTabs,
  samplesTabs,
  stockTabs,
  suppliersTabs,
  catalogueTabs,
  clientsTabs,
]
