// September page-navigation iteration: workspaceNavigation.js now consumes these
// original page/action definitions. SectionTabs is a null compatibility wrapper;
// PageHeader owns the rendered actions. The older comments below record why the
// destinations and action coverage were chosen, not the current strip layout.
//
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
  // Supplier invoices sit beside Purchase orders because they are the other
  // half of one story: purchase orders are raised per HOUSE and one supplier
  // sells several houses, so every few weeks ONE consolidated bill arrives
  // covering MANY of them (W14). A tab of its own, never a column on the
  // purchase list — the bill is a document with its own filters and its own
  // reconciliation.
  { key: 'invoices', label: 'Supplier invoices', to: '/admin/supplier-invoices' },
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
  // What the incumbent priced with, per range — a reference beside the office's
  // own parameters on /pricing, never the source. Finance-gated by the API.
  { key: 'parameters', label: 'Dynamics parameters', to: '/price-lists/parameters' },
]

// Samples — all LIVE as of W4-US-009: the register and showrooms on
// atelier-api's /admin/samples and /admin/showrooms, sample orders on
// /admin/sample-orders, and the scanner rewired to the by-barcode and
// check-out/check-in endpoints. The demo Tracking tab is retired — its old
// /samples route now redirects to the register, so a tab pointing at it would
// bounce straight back here.
//
// W20 adds the loan desk: Outstanding loans is the cross-register queue on
// /admin/sample-loans — what is out, everywhere, where the register's own loan
// list answers one sample at a time. Letters used to sit here too, on the
// argument that the reminder desk is where the office meets a letter; the
// office read it as "the emails live under Samples" and asked for it to move
// (Userback 8367893, 8373807) — it is in `adminTabs` now.
export const samplesTabs = [
  { key: 'register', label: 'Sample register', to: '/admin/samples' },
  { key: 'loans', label: 'Outstanding loans', to: '/admin/sample-loans' },
  { key: 'showrooms', label: 'Showrooms', to: '/admin/showrooms' },
  { key: 'orders', label: 'Sample orders', to: '/admin/sample-orders' },
  { key: 'scanner', label: 'Scanner', to: '/sample-scanner' },
]

// Admin — the settings nobody visits daily: the set letters, the Xero
// connection and the staff logins. One sidebar item instead of three, so the
// working screens (orders, stock, clients, samples) read as the app and the
// plumbing sits behind one door (Userback 8373807). Users keeps its cap; the
// tab hides for a login that cannot manage accounts, like every capped tab.
export const adminTabs = [
  { key: 'letters', label: 'Letters', to: '/admin/letters' },
  { key: 'xero', label: 'Xero', to: '/admin/xero' },
  { key: 'users', label: 'Users & permissions', to: '/users', cap: CAPS.ADMIN_USERS },
]

// Stock — the LIVE reserves & cuttings dockets lead (the replacement for the
// D365 fulmar_reserve and cutting forms, entered account-first), with the
// per-supplier report beside them. The old "Reserves" tab was the Dynamics
// STOCK mirror all along ("Stock · from Dynamics"), so it keeps its route for
// bookmarks and is relabelled for what it is — read-only until cutover, the
// same treatment the orders mirror got. The Cutting tab stays the demo
// remnant-rolls screen, which is a different question from cutting REQUESTS.
export const stockTabs = [
  { key: 'live', label: 'Reserves & cuttings', to: '/admin/reserves' },
  { key: 'report', label: 'Supplier report', to: '/admin/reserves/report' },
  { key: 'cutting', label: 'Cutting', to: '/cutting' },
  { key: 'manage', label: 'Manage stock', to: '/admin/stock' },
  { key: 'reserves', label: 'Dynamics (historical)', to: '/reserves' },
]

// The one thing the office starts from anywhere in this section — the
// account-first docket form. Section-owned for the same reason ordersActions
// is: a button pasted into five screens is five places for it to drift.
export const stockActions = [
  { key: 'new-reserve', label: 'New reserve / cutting', to: '/admin/reserves/new' },
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

// (There is no usersTabs: Applicants moved into the Clients section above, and
// Users & permissions is a tab of `adminTabs` beside Letters and Xero.)

// Keyed on the tab array's IDENTITY rather than on a name, because the tab set
// already IS the section: every screen in a section passes it to <SectionTabs>,
// so nothing new has to be threaded through a screen for the actions to appear
// on all of its tabs. Both sides are module constants, so the identity is fixed
// for the life of the bundle.
const SECTION_ACTIONS = new Map([
  [ordersTabs, ordersActions],
  [stockTabs, stockActions],
])

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
  catalogueTabs,
  clientsTabs,
  adminTabs,
]
