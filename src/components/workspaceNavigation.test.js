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
    ['/admin/reserves/report', '/admin/reserves/report'],
    ['/admin/reserves/new', '/admin/reserves'],
    ['/clients/applicants', '/clients/applicants'],
    ['/clients/legacy', '/clients/legacy'],
    ['/clients/42', '/clients/legacy'],
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
  // one always-open group and the client read that as inconsistent. What still
  // matters is the order of its pages: sales, then purchasing, then the bill.
  it('orders sales, purchasing and invoices in that order, and discloses like the rest', () => {
    const orders = workspaceGroups(() => true).find(group => group.id === 'orders')
    expect(orders.alwaysOpen).toBeFalsy()
    expect(orders.pages.slice(0, 3).map(page => page.to)).toEqual([
      '/admin/orders', '/admin/purchase-orders', '/admin/supplier-invoices',
    ])
  })

  // The two single destinations stay plain items rather than one-page
  // disclosures that would repeat their own name.
  it('leaves Dashboard and Suppliers as plain destinations', () => {
    const groups = workspaceGroups(() => true)
    for (const id of ['overview', 'suppliers']) {
      const group = groups.find(item => item.id === id)
      expect(group.alwaysOpen).toBe(true)
      expect(group.label).toBeNull()
      expect(group.pages).toHaveLength(1)
    }
  })

  it('honours existing capability boundaries without hiding public staff pages', () => {
    const paths = workspaceGroups(() => false).flatMap(group => group.pages.map(page => page.to))
    expect(paths).not.toContain('/clients')
    expect(paths).not.toContain('/clients/applicants')
    expect(paths).not.toContain('/users')
    expect(paths).not.toContain('/pricing')
    expect(paths).not.toContain('/import')
    expect(paths).toContain('/clients/legacy')
    expect(paths).toContain('/admin/supplier-invoices')
    expect(workspaceGroups(cap => cap === CAPS.PRICELIST_IMPORT).flatMap(group => group.pages.map(page => page.to))).toContain('/import')
  })

  it('marks historical, demo and mixed data sources honestly', () => {
    expect(workspacePage('/sales-orders/42').source).toBe('Dynamics')
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
  it.each(['/admin/orders', '/admin/purchase-orders', '/admin/purchase-orders/42', '/admin/supplier-invoices', '/admin/supplier-invoices/42', '/sales-orders', '/sales-orders/42', '/admin/shipping'])('keeps both create actions on %s', path => {
    expect(workspaceActions(path).map(action => action.to)).toEqual(['/admin/orders/new', '/admin/purchase-orders/new'])
  })

  it.each(['/admin/reserves', '/admin/reserves/report', '/admin/stock', '/reserves', '/cutting'])('keeps the docket action on %s', path => {
    expect(workspaceActions(path).map(action => action.to)).toEqual(['/admin/reserves/new'])
  })

  it('does not offer a create form a link to itself or duplicate its primary submit', () => {
    expect(workspaceActions('/admin/orders/new').map(action => action.to)).toEqual(['/admin/purchase-orders/new'])
    expect(workspaceActions('/admin/purchase-orders/new').every(action => !action.primary)).toBe(true)
    expect(workspaceActions('/admin/reserves/new')).toEqual([])
    expect(workspaceActions('/sales-orders/new')).toEqual([])
  })

  it('emphasises the action for the list being viewed only', () => {
    expect(workspaceActions('/admin/orders').filter(action => action.primary).map(action => action.to)).toEqual(['/admin/orders/new'])
    expect(workspaceActions('/admin/purchase-orders').filter(action => action.primary).map(action => action.to)).toEqual(['/admin/purchase-orders/new'])
    expect(workspaceActions('/admin/supplier-invoices').some(action => action.primary)).toBe(false)
    expect(workspaceActions('/dashboard')).toEqual([])
  })
})
