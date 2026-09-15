// Page navigation replaces horizontal strips. Original routes and section action
// lists remain authoritative; no URL moves and route guards are unchanged.
import { matchRoutes } from 'react-router-dom'
import { CAPS } from '../auth/roles.js'
import { catalogueTabs, clientsTabs, ordersTabs, priceListTabs, samplesTabs, stockTabs, ordersActions, stockActions } from './sections.js'

const SOURCES = {
  '/catalogue': 'Demo', '/cutting': 'Demo', '/reporting': 'Demo',
  '/sales-orders': 'Dynamics', '/clients/legacy': 'Dynamics',
  '/reserves': 'Dynamics', '/price-lists': 'Dynamics', '/price-lists/parameters': 'Dynamics',
  '/reporting/library': 'Live + indicative',
}
const DETAILS = {
  '/admin/orders': ['/admin/orders/new'],
  '/admin/purchase-orders': ['/admin/purchase-orders/new', '/admin/purchase-orders/:id'],
  '/admin/supplier-invoices': ['/admin/supplier-invoices/new', '/admin/supplier-invoices/:id'],
  '/admin/reserves': ['/admin/reserves/new'],
  '/sales-orders': ['/sales-orders/:id'],
  '/clients/legacy': ['/clients/:id'],
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
  group('orders', 'Orders', ordersTabs, true),
  group('suppliers', null, [{ key: 'suppliers', label: 'Suppliers', to: '/admin/suppliers' }], true),
  group('clients', 'Clients', [...clientsTabs, { key: 'legacy', label: 'Dynamics (historical)', to: '/clients/legacy' }]),
  group('catalogue', 'Catalogue', [...catalogueTabs.slice(1), catalogueTabs[0]]),
  group('stock', 'Stock', stockTabs),
  group('samples', 'Samples', samplesTabs),
  group('pricing', 'Pricing & price lists', [
    { key: 'waterfall', label: 'Pricing', to: '/pricing', cap: CAPS.FINANCE_VIEW }, ...priceListTabs,
  ]),
  group('reporting', 'Reporting', [
    { key: 'library', label: 'Report library', to: '/reporting/library' },
    { key: 'insight', label: 'Insight', to: '/reporting/insight' },
    { key: 'overview', label: 'Overview', to: '/reporting' },
  ]),
  group('administration', 'Administration', [
    { key: 'users', label: 'Users', to: '/users', cap: CAPS.ADMIN_USERS },
    { key: 'xero', label: 'Xero', to: '/admin/xero' },
  ]),
]
const PAGES = GROUPS.flatMap(item => item.pages)
const byPath = path => PAGES.find(page => page.to === path)
const ROUTES = PAGES.flatMap(page => [page.to, ...(DETAILS[page.to] ?? [])].map(path => ({ path, handle: page })))
// Reserved demo paths must beat Dynamics detail patterns, just as App.jsx does.
ROUTES.push(
  { path: '/clients/new', handle: { ...byPath('/clients/legacy'), label: 'New client', source: 'Demo' } },
  { path: '/sales-orders/new', handle: { ...byPath('/sales-orders'), label: 'New sales order', source: 'Demo' } },
  { path: '/search', handle: { id: 'search', label: 'Search', source: 'Demo', group: null } },
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
