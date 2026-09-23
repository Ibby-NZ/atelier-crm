import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { workspaceActions, workspaceGroups, workspacePage } from './workspaceNavigation.js'
import { ALL_TAB_SETS } from './sections.js'
import { CAPS } from '../auth/roles.js'

describe('dedicated workspace pages', () => {
  it.each([
    ['/admin/orders', '/admin/orders'],
    ['/admin/orders/new', '/admin/orders'],
    ['/admin/purchase-orders/42', '/admin/purchase-orders'],
    ['/admin/purchase-orders/new', '/admin/purchase-orders'],
    ['/admin/supplier-invoices/42', '/admin/supplier-invoices'],
    ['/admin/suppliers/42', '/admin/suppliers'],
    ['/admin/reserves/report', '/admin/reserves/report'],
    ['/admin/reserves/new', '/admin/reserves'],
    ['/clients/accounts/42', '/clients/accounts'],
    ['/clients/accounts/new', '/clients/accounts'],
    ['/clients/contacts', '/clients/contacts'],
    ['/clients/contacts/42', '/clients/contacts'],
    ['/clients/contacts/new', '/clients/contacts'],
    ['/archive', '/archive'],
    ['/archive/stock_items', '/archive'],
    ['/clients/42', '/archive'],
    ['/sales-orders/42', '/archive'],
    ['/price-lists/parameters', '/price-lists/parameters'],
    ['/reporting/library', '/reporting/library'],
  ])('identifies the exact owning page of %s', (path, owner) => {
    expect(workspacePage(path)?.to).toBe(owner)
  })

  it('does not mistake an unknown prefix for a working page', () => {
    expect(workspacePage('/admin/orders-invalid')).toBeNull()
    expect(workspacePage('/unknown')).toBeNull()
  })

  it('keeps all former tabs reachable once, with no invented routes', () => {
    const pages = workspaceGroups(() => true).flatMap(group => group.pages)
    expect(new Set(pages.map(page => page.to)).size).toBe(pages.length)
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    for (const tab of ALL_TAB_SETS.flat()) expect(pages.map(page => page.to)).toContain(tab.to)
    for (const page of pages) expect(app).toContain(`path="${page.to}"`)
  })

  // Orders DISCLOSES like every other section since 16 Sep 2026 — it was the
  // one always-open group and the client read that as inconsistent. Since 23
  // Sep 2026 it is sales and purchasing only; the bill went to Suppliers.
  it('orders sales then purchasing, and discloses like the rest', () => {
    const orders = workspaceGroups(() => true).find(group => group.id === 'orders')
    expect(orders.alwaysOpen).toBeFalsy()
    expect(orders.pages.map(page => page.to)).toEqual(['/admin/orders', '/admin/purchase-orders'])
  })

  // Dashboard stays a plain item rather than a one-page disclosure that would
  // repeat its own name.
  it('leaves Dashboard plain', () => {
    const overview = workspaceGroups(() => true).find(item => item.id === 'overview')
    expect(overview.alwaysOpen).toBe(true)
    expect(overview.label).toBeNull()
    expect(overview.pages).toHaveLength(1)
  })

  // 23 Sep 2026, client asked: Suppliers and its adjacent pages are one
  // disclosing section, placed directly under Stock.
  it('seats a Suppliers section directly under Stock', () => {
    const groups = workspaceGroups(() => true)
    const ids = groups.map(item => item.id)
    expect(ids.indexOf('suppliers')).toBe(ids.indexOf('stock') + 1)
    const suppliers = groups.find(item => item.id === 'suppliers')
    expect(suppliers.label).toBe('Suppliers')
    expect(suppliers.alwaysOpen).toBeFalsy()
    expect(suppliers.pages.map(page => page.to)).toEqual([
      '/admin/suppliers', '/admin/supplier-invoices', '/admin/reserves/report',
    ])
  })

  it.each(['/admin/suppliers', '/admin/suppliers/42', '/admin/supplier-invoices', '/admin/supplier-invoices/new', '/admin/supplier-invoices/42', '/admin/reserves/report'])('opens the Suppliers section on %s', path => {
    expect(workspacePage(path)?.group).toBe('suppliers')
  })

  it('keeps the docket pages in Stock', () => {
    expect(workspacePage('/admin/reserves')?.group).toBe('stock')
    expect(workspacePage('/admin/reserves/new')?.group).toBe('stock')
  })

  // The demo Library is hidden for now (23 Sep 2026): no sidebar row offers
  // it, but a bookmark still resolves, opens Catalogue and carries its badge.
  it('hides the demo Library from the sidebar without breaking its bookmark', () => {
    const pages = workspaceGroups(() => true).flatMap(group => group.pages)
    expect(pages.map(page => page.to)).not.toContain('/catalogue')
    const library = workspacePage('/catalogue')
    expect(library.group).toBe('catalogue')
    expect(pages.map(page => page.id)).not.toContain(library.id)
  })

  it('honours existing capability boundaries without hiding public staff pages', () => {
    const paths = workspaceGroups(() => false).flatMap(group => group.pages.map(page => page.to))
    expect(paths).not.toContain('/clients/accounts')
    expect(paths).not.toContain('/clients/contacts')
    expect(paths).not.toContain('/users')
    expect(paths).not.toContain('/pricing')
    expect(paths).not.toContain('/import')
    expect(paths).toContain('/archive')
    expect(paths).toContain('/admin/supplier-invoices')
    expect(workspaceGroups(cap => cap === CAPS.PRICELIST_IMPORT).flatMap(group => group.pages.map(page => page.to))).toContain('/import')
  })

  it('marks historical, demo and mixed data sources honestly', () => {
    expect(workspacePage('/sales-orders/42').source).toBe('Dynamics')
    expect(workspacePage('/archive/accounts').source).toBe('Dynamics')
    expect(workspacePage('/clients/new').source).toBe('Demo')
    expect(workspacePage('/sales-orders/new').source).toBe('Demo')
    expect(workspacePage('/catalogue').source).toBe('Demo')
    // The overview reads the platform since 16 Sep 2026, so it carries no
    // source badge at all — the same as any other live page.
    expect(workspacePage('/reporting').source).toBeNull()
    expect(workspacePage('/reporting/library').source).toBe('Live + indicative')
    expect(workspacePage('/import').source).toBeNull()
  })
})

describe('actions survive removal of the tab strips', () => {
  it.each(['/admin/orders', '/admin/purchase-orders', '/admin/purchase-orders/42'])('keeps both create actions on %s', path => {
    expect(workspaceActions(path).map(action => action.to)).toEqual(['/admin/orders/new', '/admin/purchase-orders/new'])
  })

  it.each(['/admin/reserves', '/admin/stock'])('keeps the docket action on %s', path => {
    expect(workspaceActions(path).map(action => action.to)).toEqual(['/admin/reserves/new'])
  })

  // The supplier pages left Orders and Stock (23 Sep 2026); each list keeps
  // its own create button, so the section adds none.
  it.each(['/admin/suppliers', '/admin/supplier-invoices', '/admin/supplier-invoices/42', '/admin/reserves/report'])('offers no section action on %s', path => {
    expect(workspaceActions(path)).toEqual([])
  })

  it('does not offer a create form a link to itself or duplicate its primary submit', () => {
    expect(workspaceActions('/admin/orders/new').map(action => action.to)).toEqual(['/admin/purchase-orders/new'])
    expect(workspaceActions('/admin/purchase-orders/new').every(action => !action.primary)).toBe(true)
    expect(workspaceActions('/admin/reserves/new')).toEqual([])
    expect(workspaceActions('/sales-orders/new')).toEqual([])
    // The Archive is read-only; no section action belongs on it.
    expect(workspaceActions('/archive/sales_orders')).toEqual([])
    // Freight rates left Orders for Administration (22 Sep 2026), so it no
    // longer offers to raise an order.
    expect(workspaceActions('/admin/shipping')).toEqual([])
  })

  it('emphasises the action for the list being viewed only', () => {
    expect(workspaceActions('/admin/orders').filter(action => action.primary).map(action => action.to)).toEqual(['/admin/orders/new'])
    expect(workspaceActions('/admin/purchase-orders').filter(action => action.primary).map(action => action.to)).toEqual(['/admin/purchase-orders/new'])
    expect(workspaceActions('/dashboard')).toEqual([])
  })
})
