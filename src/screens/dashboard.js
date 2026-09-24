// The rules behind Dashboard.jsx, now that it draws GET /admin/dashboard live.
// No jsdom here, so everything that is a decision lives in this module and is
// tested in ./dashboard.test.js; the screen is layout.
//
// THE LINKS ARE BUILT FROM THE PAYLOAD. The API states each figure's population
// (`sales_mtd.from`, `open_orders.statuses` behind the `open` set name,
// `inbound.status`), and the tile links carry exactly that — so a tile can
// never open a list that disagrees with its own number. The MTD tile leads to
// the R-13 orders report (revenue-lines) rather than the order desk: that
// report selects out of the SAME scope the figure was summed over, line by
// line, where the order desk's totals also carry shipping.
//
// MONEY HONESTY TRAVELS: a mixed-currency month arrives with `value_cents:
// null` and is drawn as withheld rather than summed; `unpriced_lines` is named
// in the tile's note so a total that includes request-kind lines does not read
// as a discount. The RPT-03 scope rule stays: the company-wide MTD figure is
// withheld entirely from a login without all-company report access.

import { formatCents } from '../admin/orderFlow.js'
import { reportSearchParams } from '../utils/reportFilters.js'

export const DASHBOARD_PATH = '/admin/dashboard'

// The office is in Parnell; a login from elsewhere (or a laptop on UTC) must
// still be greeted on Auckland's day and hour, not the browser's.
const NZ = 'Pacific/Auckland'

/**
 * "Good morning" / "afternoon" / "evening" and the weekday, both in NZ time.
 *
 * @param {Date} [now]
 * @returns {{ salutation: string, weekday: string }}
 */
export function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', hour12: false, timeZone: NZ }).format(now)
  )
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return { salutation, weekday: now.toLocaleDateString('en-NZ', { weekday: 'long', timeZone: NZ }) }
}

const LOADING = '…'

/** The R-13 orders report, filtered to the month the figure covers. */
const mtdLink = (sales) =>
  `/reporting/library?${new URLSearchParams(reportSearchParams('orders', { from: sales.from }))}`

/**
 * The Sales · MTD tile. `allAccess` is the CRM's own RPT-03 scope rule
 * (`access.all`): a login scoped to its own sales gets a withheld tile, not the
 * company figure — same call as R-02/R-11.
 *
 * @param {object|null} sales `sales_mtd` off the payload, null while loading
 * @param {{ allAccess: boolean }} access
 * @returns {{ value: string, note: string, link: string, withheld: boolean }}
 */
export function mtdKpi(sales, { allAccess }) {
  if (!allAccess) {
    return {
      value: '——',
      note: 'Company-wide — not on your access',
      link: '',
      withheld: true,
    }
  }
  if (!sales) return { value: LOADING, note: 'Month to date', link: '', withheld: false }

  const unpriced =
    sales.unpriced_lines > 0
      ? ` · ${sales.unpriced_lines} unpriced line${sales.unpriced_lines === 1 ? '' : 's'} at $0`
      : ''
  if (sales.mixed_currency) {
    return {
      value: '—',
      note: 'Two currencies this month — the report shows both' + unpriced,
      link: mtdLink(sales),
      withheld: false,
    }
  }
  return {
    value: formatCents(sales.value_cents),
    note: `Month to date · paid, shipped + completed${unpriced}`,
    link: mtdLink(sales),
    withheld: false,
  }
}

/**
 * @param {object|null} open `open_orders` off the payload
 * @returns {{ value: string, note: string, link: string }}
 */
export function openKpi(open) {
  return {
    value: open ? String(open.count) : LOADING,
    note: 'Awaiting fulfilment',
    // The order desk expands `open` to the same HELD set the count used.
    link: '/admin/orders?status=open',
  }
}

/**
 * @param {object|null} inbound `inbound` off the payload
 * @returns {{ value: string, note: string, link: string }}
 */
export function inboundKpi(inbound) {
  return {
    value: inbound ? String(inbound.count) : LOADING,
    note: 'Sent to the houses, not yet received',
    link: '/admin/purchase-orders?status=inbound',
  }
}

/**
 * Stock alerts stay INDICATIVE: nothing in the schema holds a par level, so
 * there is no number to draw and inventing one would be a worse lie than an
 * empty tile. The stock report's over-allocation count is the ready candidate
 * if the office asks for a live figure here.
 */
export const STOCK_ALERTS_KPI = Object.freeze({
  value: '—',
  note: 'No par levels on file',
  link: '',
  indicative: true,
})

/** The order desk, searched by the row's own number — one order, no filters. */
export const recentOrderLink = (order) =>
  `/admin/orders?q=${encodeURIComponent(order.order_number)}`
