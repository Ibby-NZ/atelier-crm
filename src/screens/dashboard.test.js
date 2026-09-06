import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_PATH,
  STOCK_ALERTS_KPI,
  inboundKpi,
  mtdKpi,
  openKpi,
  recentOrderLink,
} from './dashboard.js'

// The dashboard draws what /admin/dashboard answers, and every figure links to
// the list it is made of — built FROM the payload's own stated populations
// (`from`, `statuses`, `status`), so a tile can never disagree with the list it
// opens. These are the rules; the screen is layout.

const SALES = Object.freeze({
  value_cents: 3000000,
  currency: 'NZD',
  mixed_currency: false,
  orders: 12,
  unpriced_lines: 0,
  from: '2026-09-01',
  statuses: ['paid', 'shipped'],
})

describe('the sales MTD tile', () => {
  it('formats the figure and links into the orders report from the payload window', () => {
    const kpi = mtdKpi(SALES, { allAccess: true })
    expect(kpi.value).toBe('$30,000.00')
    expect(kpi.withheld).toBe(false)
    // The link is the revenue-lines report — the SAME population the figure was
    // summed over, filtered to the same window the payload states.
    expect(kpi.link).toBe('/reporting/library?r=orders&from=2026-09-01')
  })

  it('is withheld, without a link, for a login without all-company access', () => {
    const kpi = mtdKpi(SALES, { allAccess: false })
    expect(kpi.value).toBe('——')
    expect(kpi.withheld).toBe(true)
    expect(kpi.link).toBe('')
  })

  it('withholds a total the API refused to add (mixed currencies), but keeps the link', () => {
    const kpi = mtdKpi({ ...SALES, value_cents: null, mixed_currency: true }, { allAccess: true })
    expect(kpi.value).toBe('—')
    expect(kpi.note).toContain('currencies')
    expect(kpi.link).toBe('/reporting/library?r=orders&from=2026-09-01')
  })

  it('names the unpriced lines instead of letting the total read as a discount', () => {
    const kpi = mtdKpi({ ...SALES, unpriced_lines: 3 }, { allAccess: true })
    expect(kpi.note).toContain('3 unpriced')
  })

  it('survives the payload not having arrived yet', () => {
    const kpi = mtdKpi(null, { allAccess: true })
    expect(kpi.value).toBe('…')
    expect(kpi.link).toBe('')
  })
})

describe('the open-orders tile', () => {
  it('counts and links with the set name the order desk expands', () => {
    const kpi = openKpi({ count: 17, statuses: ['requested', 'confirmed', 'paid'] })
    expect(kpi.value).toBe('17')
    expect(kpi.link).toBe('/admin/orders?status=open')
  })

  it('shows an ellipsis while loading', () => {
    expect(openKpi(null).value).toBe('…')
  })
})

describe('the inbound tile', () => {
  it('counts sent POs and links to the filtered PO list', () => {
    const kpi = inboundKpi({ count: 5, status: 'sent', purchase_orders: [] })
    expect(kpi.value).toBe('5')
    expect(kpi.link).toBe('/admin/purchase-orders?status=sent')
  })
})

describe('the stock-alerts tile', () => {
  it('stays indicative — no par levels exist in the schema, so no number is invented', () => {
    expect(STOCK_ALERTS_KPI.value).toBe('—')
    expect(STOCK_ALERTS_KPI.link).toBe('')
    expect(STOCK_ALERTS_KPI.indicative).toBe(true)
  })
})

describe('row links', () => {
  it('a recent order leads to the order desk searched by its own number', () => {
    expect(recentOrderLink({ order_number: 'AT-2026-0142' })).toBe(
      '/admin/orders?q=AT-2026-0142'
    )
  })

  it('the endpoint path is declared once', () => {
    expect(DASHBOARD_PATH).toBe('/admin/dashboard')
  })
})
