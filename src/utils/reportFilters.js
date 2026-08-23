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

// Boundary copy of the API's four-value category vocabulary
// (products.category's CHECK; PRODUCT_CATEGORIES in atelier-api's
// src/reports/filters.js). Copied so the select can be drawn without a round
// trip; the API remains the authority, and an unknown value there is a 400
// naming the filter. Order is the CHECK's own.
export const REPORT_CATEGORIES = Object.freeze([
  { value: 'fabric', label: 'Fabric' },
  { value: 'wallpaper', label: 'Wallpaper' },
  { value: 'trimming', label: 'Trimming' },
  { value: 'accessory', label: 'Accessory' },
])

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
