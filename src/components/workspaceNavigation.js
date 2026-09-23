// Page navigation replaces horizontal strips. Original routes and section action
// lists remain authoritative; no URL moves and route guards are unchanged.
import { matchRoutes } from 'react-router-dom'
import { CAPS } from '../auth/roles.js'
import { adminTabs, catalogueTabs, clientsTabs, ordersTabs, priceListTabs, samplesTabs, stockTabs, ordersActions, stockActions } from './sections.js'

const SOURCES = {
  // /reporting is LIVE as of 16 Sep 2026 — it reads the dashboard and two
  // /admin/reports/* tables — so it no longer carries the Demo badge.
  '/catalogue': 'Demo',
  '/archive': 'Dynamics', '/price-lists/parameters': 'Dynamics',
  '/reporting/library': 'Live + indicative',
}
const DETAILS = {
  '/admin/orders': ['/admin/orders/new', '/admin/orders/:id'],
  '/admin/purchase-orders': ['/admin/purchase-orders/new', '/admin/purchase-orders/:id'],
  '/admin/supplier-invoices': ['/admin/supplier-invoices/new', '/admin/supplier-invoices/:id'],
  '/admin/suppliers': ['/admin/suppliers/new', '/admin/suppliers/:id'],
  '/admin/reserves': ['/admin/reserves/new'],
  '/admin/reserves/report': ['/admin/reserves/report/:supplier'],
  // The spreadsheet round trip is the Categories list's bulk door.
  '/admin/categories': ['/admin/product-sheet'],
  // The per-record Dynamics screens belong to the Archive now that the four
  // mirror lists are folded into it.
  '/archive': ['/archive/:entity', '/sales-orders/:id', '/clients/:id'],
}
function group(id, label, pages, alwaysOpen = false) {
  return { id, label, alwaysOpen, pages: pages.map(page => ({
    ...page, id: `${id}-${page.key}`, group: id, groupLabel: label,
    source: SOURCES[page.to] ?? null,
    navNote: SOURCES[page.to] === 'Demo' ? 'Demo' : SOURCES[page.to] === 'Dynamics' && !page.label.includes('Dynamics') ? 'Dynamics' : null,
  })) }
}
const GROUPS = [
  group('overview', null, [{ key: 'dashboard', label: 'Dashboard', to: '/dashboard' }], true),
  // Orders discloses like Clients, Catalogue, Stock and the rest (16 Sep 2026:
  // "have Orders tabbed like clients, reporting, stock"). It was alwaysOpen, so
  // its five pages sat flat under a static heading while every other section
  // collapsed — one section behaving unlike the others reads as unfinished.
  group('orders', 'Orders', ordersTabs),
  group('clients', 'Clients', clientsTabs),
  group('catalogue', 'Catalogue', [...catalogueTabs.slice(1), catalogueTabs[0]]),
  group('stock', 'Stock', stockTabs),
  group('samples', 'Samples', samplesTabs),
  group('pricing', 'Pricing & price lists', [
    { key: 'waterfall', label: 'Pricing', to: '/pricing', cap: CAPS.FINANCE_VIEW }, ...priceListTabs,
  ]),
  group('reporting', 'Reporting', [
    { key: 'overview', label: 'Overview', to: '/reporting' },
    { key: 'library', label: 'Report library', to: '/reporting/library' },
  ]),
  group('administration', 'Administration', adminTabs),
  // Everything Atelier held in Dynamics 365 — one page, every table, read-only.
  group('archive', null, [{ key: 'archive', label: 'Archive', to: '/archive' }], true),
]
const PAGES = GROUPS.flatMap(item => item.pages)
const byPath = path => PAGES.find(page => page.to === path)
const ROUTES = PAGES.flatMap(page => [page.to, ...(DETAILS[page.to] ?? [])].map(path => ({ path, handle: page })))
// Reserved demo paths must beat Dynamics detail patterns, just as App.jsx does.
ROUTES.push(
  { path: '/clients/new', handle: { ...byPath('/clients/accounts'), label: 'New client', source: 'Demo' } },
  { path: '/sales-orders/new', handle: { ...byPath('/archive'), label: 'New sales order', source: 'Demo' } },
  { path: '/account-details', handle: { id: 'account', label: 'Account details', source: 'Demo', group: null } },
)
export function workspacePage(pathname) {
  return matchRoutes(ROUTES, pathname)?.[0].route.handle ?? null
}
export function workspaceGroups(can) {
  return GROUPS.map(item => ({ ...item, pages: item.pages.filter(page => !page.cap || can(page.cap)) }))
    .filter(item => item.pages.length > 0)
}
export function workspaceActions(pathname) {
  // This standalone demo form never offered the live section's create actions.
  if (pathname === '/sales-orders/new') return []
  const page = workspacePage(pathname)
  const actions = page?.group === 'orders' ? ordersActions : page?.group === 'stock' ? stockActions : []
  return actions.filter(action => action.to !== pathname).map(action => ({
    ...action, primary: pathname === page.to && action.to === `${page.to}/new`,
  }))
}
