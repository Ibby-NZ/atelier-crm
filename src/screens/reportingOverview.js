// Pure rules for the Reporting overview (Reporting.jsx) — LIVE as of 16 Sep
// 2026. The screen was the demo's invented roll-up (`reporting` in
// src/data/atelier.js: a fictional FY, regions that sum to a headline nobody
// earned, a blocked-report wall), and the client asked for it to read the
// platform and to talk to the rest of Reporting.
//
// It now draws three things, all of them the API's own answers:
//   · the dashboard KPIs (src/screens/dashboard.js — mtdKpi/openKpi/inboundKpi,
//     reused rather than re-derived, so the landing tiles and this page can
//     never disagree),
//   · two live report tables through the same buildLiveReport + <ReportTable>
//     the Report Library renders, and
//   · the library's own filter vocabulary, held in the URL, so a filter applied
//     here travels to the library, the insight view and every drill-down.
//
// No jsdom in this repo, so every rule lives here with reportingOverview.test.js
// beside it; the .jsx is layout and effects.

import { LIVE_REPORTS } from '../utils/reportBuilders.js'
import { buildReportQuery, reportSearchParams } from '../utils/reportFilters.js'

/**
 * The panels the overview draws, in order. Each names a LIVE endpoint and the
 * report-library key that report is published under, so "Open the full report"
 * is a link rather than a second implementation.
 *
 * `hide` drops a column that is noise at a glance and is still in the full
 * report — never a column that carries a figure.
 */
export const OVERVIEW_PANELS = Object.freeze([
  Object.freeze({
    key: 'owner',
    title: 'Sales by staff member',
    blurb: 'Who the platform attributes each order to, over the period in the bar above.',
    path: LIVE_REPORTS.owner,
    hide: ['unpriced_lines'],
  }),
  Object.freeze({
    key: 'brandtype',
    title: 'Sales by house and design',
    blurb: 'What sold, newest period first. A row opens the orders behind it.',
    path: LIVE_REPORTS.brandtype,
    hide: ['product_type', 'unpriced_lines'],
  }),
])

/** Every path the overview fetches, for a test that wants to walk them. */
export const OVERVIEW_PATHS = Object.freeze(OVERVIEW_PANELS.map((panel) => panel.path))

/**
 * The URL a panel's "full report" link goes to: the Report Library on that
 * report, carrying the filters currently applied here. Same vocabulary the
 * library reads back with reportFiltersFromParams, which is what makes the two
 * screens one tool rather than two.
 *
 * @param {string} key  a report-library key
 * @param {object} filters
 * @returns {string}
 */
export function overviewReportHref(key, filters = {}) {
  // reportSearchParams answers a plain object (the shape <Link to> and
  // setSearchParams both take), so it is serialised here rather than assumed to
  // be a URLSearchParams.
  return `/reporting/library?${new URLSearchParams(reportSearchParams(key, filters)).toString()}`
}

/**
 * The querystring a panel is fetched with. Identical to the library's, so the
 * same filters produce the same figures on both screens — and an unfiltered
 * overview asks for exactly what the library's unfiltered report asks for.
 *
 * @param {string} path
 * @param {object} filters
 * @returns {string}
 */
export function overviewFetchPath(path, filters = {}) {
  // buildReportQuery already carries its own '?' (or is empty), the shape the
  // library concatenates — so this is a join, not a second query builder.
  return `${path}${buildReportQuery(filters)}`
}

/**
 * What the export writes: one section per panel that actually loaded, in the
 * order they are drawn. A panel that failed or was refused contributes nothing
 * rather than an empty section that reads as "no sales".
 *
 * @param {Array<{title: string, table: object|null}>} panels
 * @returns {Array<{title: string, head: string[], rows: string[][]}>}
 */
export function overviewExportSections(panels = []) {
  return panels
    .filter((panel) => panel.table && panel.table.rows && panel.table.rows.length > 0)
    .map((panel) => ({
      title: panel.title,
      head: panel.table.cols.map((column) => column.t),
      rows: panel.table.rows.map((row) => row.cells.map((cell) => String(cell.v ?? ''))),
    }))
}

/**
 * The period a date range describes, for the page's eyebrow. Plain text off the
 * filters the office typed — never a Date constructed here, which would read
 * the device's clock and disagree with the API's own `meta.coverage`.
 *
 * @param {{from?: string, to?: string}} filters
 * @returns {string}
 */
export function periodLabel(filters = {}) {
  const from = (filters.from ?? '').trim()
  const to = (filters.to ?? '').trim()
  if (from && to) return `${from} to ${to}`
  if (from) return `from ${from}`
  if (to) return `up to ${to}`
  return 'every order the platform holds'
}
