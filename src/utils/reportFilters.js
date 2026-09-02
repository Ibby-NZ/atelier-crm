// The Report Library's live filter bar, reduced to what is testable without a
// DOM: one filter object becomes one querystring, or one sentence saying why it
// cannot.
//
// ONE bar drives all three live reports — that is the API's own design
// (src/reports/filters.js over there): a filter a report cannot honour is
// declined SERVER-side and echoed back in `meta.ignored_filters`, which
// liveNote() already prints under the table. So nothing here knows which report
// the query is for, and a date range typed while the stock snapshot is open is
// sent, ignored, and said to have been ignored — never silently dropped by this
// module.
//
// The values travel as a querystring because the API's report routes read
// filters from the query (the CSV export takes the same ones), and every value
// is encoded through URLSearchParams: `range` is free text the office typed —
// `RAMM, SON & CROCKER` is a real value — and hand-joining it into a URL is how
// an ampersand becomes a second parameter.

// The bar's Category select, taken from the ONE vocabulary this repo states
// (../lib/categories.js — PRODUCT_CATEGORIES in atelier-api's
// src/reports/filters.js is the same list). It used to be a fourth copy of it,
// four values long after the API grew to nine, and the symptom was not a
// refused filter: the drill-down puts a row's own category into the bar, so a
// cushion or a towel narrowed the table correctly while a controlled select
// with no matching option rendered BLANK — an unfiltered-looking bar over a
// filtered table. Imported and re-exported rather than `export … from`, so the
// name is bound in this module's scope too (reportFiltersFromParams reads it).
import { CATEGORY_OPTIONS, CATEGORY_VALUES } from '../lib/categories.js'

export const REPORT_CATEGORIES = CATEGORY_OPTIONS

// Every filter the bar draws, blank. Declared once so the screen's state, the
// Clear button and buildReportQuery all agree on which keys exist — a key
// missing here is one the query builder silently drops.
export const EMPTY_REPORT_FILTERS = Object.freeze({
  category: '',
  from: '',
  to: '',
  brand_code: '',
  range: '',
})

// The querystring keys, in one fixed order, so one filter set is always one
// URL — the effect that fetches a live report is keyed on that URL, and two
// spellings of the same filters would refetch for nothing.
const FILTER_KEYS = Object.freeze(['category', 'from', 'to', 'brand_code', 'range'])

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * The refusals worth catching BEFORE a round trip — the same posture drafts.js
 * takes with a URL. Only the backwards range is checked: the date inputs emit
 * valid dates or '', the category is a closed select, and the two free-text
 * filters are validated for shape by the API (which phrases its 400s well).
 *
 * @param {object} [filters]
 * @returns {string} '' when sendable, otherwise the sentence to show inline
 */
export function reportFilterError(filters = {}) {
  const from = trimmed(filters.from)
  const to = trimmed(filters.to)
  // ISO dates compare correctly as strings — the same comparison the API makes.
  if (from && to && from > to) {
    return `The date range is backwards — from (${from}) is after to (${to}).`
  }
  return ''
}

/**
 * One filter object → the querystring to append to a live report path.
 *
 * Blank and whitespace-only values are ABSENT, never sent as empty parameters:
 * the API treats an empty value as no filter, but a URL that says
 * `?brand_code=` reads as one that filtered. An unknown key is ignored — the
 * FILTER_KEYS list is the vocabulary, exactly as the API's whitelist is on its
 * side.
 *
 * @param {object} [filters]
 * @returns {string} '' or '?category=…&from=…' ready to concatenate
 */
export function buildReportQuery(filters = {}) {
  const params = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const value = trimmed(filters[key])
    if (value !== '') params.append(key, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Whether anything is set — what the bar shows a Clear button for. */
export function hasReportFilters(filters = {}) {
  return FILTER_KEYS.some((key) => trimmed(filters[key]) !== '')
}

// ---- the bar in the URL ------------------------------------------------------
//
// The applied filters live in the screen's querystring alongside `?r=`, because
// a report row links THROUGH to another report with a filter already applied
// (Userback 8287873) and the library is usually already mounted when it does.
// Held in state, that link would change the URL and narrow nothing — the rule
// AdminCollections' house filter already follows.
//
// What is TYPED stays in state: the report routes are rate-limited, so the
// draft only reaches the URL — and the API — when Apply is pressed.

// A category the select cannot draw is no filter at all — the rule
// orderSearchFromParams already follows for `status`. Both halves of forwarding
// one are wrong: the API's enum answers an unknown category with a 400 that
// kills the whole report, and the bar would meanwhile show a blank select over
// it. Only `category` is closed; the two free-text filters and the dates are
// the API's to refuse.
const readable = (key, value) =>
  key === 'category' && !CATEGORY_VALUES.includes(value) ? '' : value

/**
 * URL → the filter bar's applied set. Only the bar's own keys are read: `r`
 * names the report and anything else is ignored, the same posture the API takes
 * with a filter name it does not hold.
 *
 * @param {URLSearchParams} [params]
 * @returns {object} every key of EMPTY_REPORT_FILTERS, blank where unset
 */
export function reportFiltersFromParams(params) {
  return FILTER_KEYS.reduce((filters, key) => {
    const value = readable(key, trimmed(params ? params.get(key) : ''))
    return value === '' ? filters : { ...filters, [key]: value }
  }, { ...EMPTY_REPORT_FILTERS })
}

/**
 * The report and its filters back into the URL. A blank filter is ABSENT rather
 * than an empty parameter — the same rule buildReportQuery follows on the way to
 * the API, and what keeps a cleared bar from reading as one that filtered.
 *
 * @param {string} report the report key (`?r=`)
 * @param {object} [filters]
 * @returns {object} ready for setSearchParams
 */
export function reportSearchParams(report, filters = {}) {
  return FILTER_KEYS.reduce((params, key) => {
    const value = trimmed(filters[key])
    return value === '' ? params : { ...params, [key]: value }
  }, { r: report })
}
