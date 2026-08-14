import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ALL_TAB_SETS,
  ordersActions,
  ordersTabs,
  sectionActions,
  suppliersTabs,
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

  it('keeps the Dynamics mirror as its own tab, on its own route', () => {
    const legacy = ordersTabs.find((tab) => tab.key === 'legacy')
    // A different DATA SOURCE, read-only until cutover: it can never be merged
    // into the live list, and the bookmarked route has to keep working.
    expect(legacy.to).toBe('/sales-orders')
    expect(legacy.label).toMatch(/historical/i)
  })

  it('points Purchase orders at the live screen, not the retired demo one', () => {
    expect(ordersTabs.find((tab) => tab.key === 'purchase').to).toBe('/admin/purchase-orders')
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

  it('gives a section with no actions an empty list rather than undefined', () => {
    expect(sectionActions(suppliersTabs)).toEqual([])
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

  for (const action of ordersActions) {
    it(`routes the ${action.label} action → ${action.to}`, () => {
      expect(declared(action.to)).toBe(true)
    })
  }
})

describe('retired routes redirect rather than falling through', () => {
  // A bookmark on a retired path must not land on the dashboard via the
  // catch-all, which reads as "the screen was deleted" — the rule
  // /users/applicants and /samples already follow.
  it.each(['/purchase-orders', '/purchase-orders/new'])('redirects %s', (path) => {
    const route = APP_SOURCE.match(new RegExp(`path="${path}"[^\\n]*`))?.[0] ?? ''
    expect(route).toContain('Navigate')
    expect(route).toContain('/admin/purchase-orders')
  })

  it('sends a demo purchase-order id to the live list, not to a live id', () => {
    // A demo id was a localStorage key and names nothing on the platform.
    const route = APP_SOURCE.match(/path="\/purchase-orders\/:id"[^\n]*/)?.[0] ?? ''
    expect(route).toContain('to="/admin/purchase-orders"')
  })
})
