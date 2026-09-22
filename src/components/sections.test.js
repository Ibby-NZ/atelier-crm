import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ALL_TAB_SETS,
  ordersActions,
  ordersTabs,
  sectionActions,
  stockActions,
  stockTabs,
} from './sections.js'

// sectionTabs.jsx cannot be rendered here (no jsdom), so the section chrome's
// DECISIONS — which tabs exist, where they point, and which actions ride on the
// strip — live in sections.js and are tested from this side.

const APP_SOURCE = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

describe('the Orders section', () => {
  // The client asked for web orders folded into sales orders "with an
  // identifier that it came from website". One live list, one D365 mirror.
  it('has no Web orders tab and points Sales orders at the LIVE list', () => {
    const keys = ordersTabs.map((tab) => tab.key)
    expect(keys).not.toContain('web')
    expect(ordersTabs.find((tab) => tab.key === 'sales').to).toBe('/admin/orders')
  })

  it('carries no Dynamics mirror tab — that data is in the Archive now', () => {
    // A different DATA SOURCE, read-only: it was never merged into the live
    // list, and since the Archive it is not a tab of this section either. The
    // bookmarked /sales-orders route still works by redirecting there.
    expect(ordersTabs.some((tab) => tab.to === '/sales-orders')).toBe(false)
    expect(ordersTabs.some((tab) => /dynamics/i.test(tab.label))).toBe(false)
  })

  it('points Purchase orders at the live screen, not the retired demo one', () => {
    expect(ordersTabs.find((tab) => tab.key === 'purchase').to).toBe('/admin/purchase-orders')
  })

  it('seats Supplier invoices beside Purchase orders — the other half of one story', () => {
    // Purchase orders are raised per HOUSE and one supplier sells several, so
    // one consolidated bill covers many of them (W14). The tab sits directly
    // after Purchase orders, before the Dynamics mirror.
    const keys = ordersTabs.map((tab) => tab.key)
    expect(keys.indexOf('invoices')).toBe(keys.indexOf('purchase') + 1)
    expect(ordersTabs.find((tab) => tab.key === 'invoices').to).toBe('/admin/supplier-invoices')
  })

  it('seats Suppliers directly under Supplier invoices', () => {
    // Who the bill comes from, one step below the bill: the office reaches a
    // supplier FROM its invoice, so the page sits in this section rather than
    // as a destination of its own in the sidebar (22 Sep 2026).
    const keys = ordersTabs.map((tab) => tab.key)
    expect(keys.indexOf('suppliers')).toBe(keys.indexOf('invoices') + 1)
    expect(ordersTabs.find((tab) => tab.key === 'suppliers').to).toBe('/admin/suppliers')
  })
})

describe('the Stock section', () => {
  // The live dockets lead; the old "Reserves" tab was the Dynamics STOCK
  // mirror all along, and it is in the Archive now (/reserves redirects there)
  // — the same treatment the orders mirror got.
  it('leads with the live dockets and carries no Dynamics mirror tab', () => {
    expect(stockTabs.find((tab) => tab.key === 'live').to).toBe('/admin/reserves')
    expect(stockTabs.find((tab) => tab.key === 'report').to).toBe('/admin/reserves/report')
    expect(stockTabs.some((tab) => tab.to === '/reserves')).toBe(false)
    expect(stockTabs.some((tab) => /dynamics/i.test(tab.label))).toBe(false)
  })
})

describe('section actions', () => {
  // "The new sales order button should be available on all tabs." The actions
  // hang off the SECTION rather than off a screen, so no tab can be missing one.
  it('gives Orders both create actions, resolved from the tab set alone', () => {
    expect(sectionActions(ordersTabs)).toBe(ordersActions)
    expect(ordersActions.map((action) => action.to)).toEqual([
      '/admin/orders/new',
      '/admin/purchase-orders/new',
    ])
  })

  it('gives Stock the docket create action on every tab', () => {
    expect(sectionActions(stockTabs)).toBe(stockActions)
    expect(stockActions.map((action) => action.to)).toEqual(['/admin/reserves/new'])
  })

  it('gives a section with no actions an empty list rather than undefined', () => {
    expect(sectionActions(undefined)).toEqual([])
  })
})

describe('every destination is a route App.jsx declares', () => {
  // The failure this catches is exactly the one this change could cause: a tab
  // or an action pointing at a path that was retired, which falls through the
  // catch-all onto the dashboard and reads as a deleted screen.
  const declared = (path) =>
    APP_SOURCE.includes(`path="${path}"`) ||
    // A dynamic segment is declared with a param name.
    APP_SOURCE.includes(`path="${path.replace(/\/[^/]+$/, '/:id')}"`)

  for (const tabs of ALL_TAB_SETS) {
    for (const tab of tabs) {
      it(`routes ${tab.label} → ${tab.to}`, () => {
        expect(declared(tab.to)).toBe(true)
      })
    }
  }

  for (const action of [...ordersActions, ...stockActions]) {
    it(`routes the ${action.label} action → ${action.to}`, () => {
      expect(declared(action.to)).toBe(true)
    })
  }
})

describe('retired routes redirect rather than falling through', () => {
  // A bookmark on a retired path must not land on the dashboard via the
  // catch-all, which reads as "the screen was deleted" — the rule
  // /users/applicants and /samples already follow.
  it.each([
    ['/purchase-orders', '/admin/purchase-orders'],
    ['/purchase-orders/new', '/admin/purchase-orders/new'],
    // The demo supplier master, retired Sept 2026.
    ['/suppliers', '/admin/suppliers'],
  ])('redirects %s to %s', (path, target) => {
    const route = APP_SOURCE.match(new RegExp(`path="${path}"[^\\n]*`))?.[0] ?? ''
    expect(route).toContain('Navigate')
    expect(route).toContain(target)
  })

  it('sends a demo purchase-order id to the live list, not to a live id', () => {
    // A demo id was a localStorage key and names nothing on the platform.
    const route = APP_SOURCE.match(/path="\/purchase-orders\/:id"[^\n]*/)?.[0] ?? ''
    expect(route).toContain('to="/admin/purchase-orders"')
  })
})
