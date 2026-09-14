// The Insight view's pure half: which row leads where, how the URL spells a
// subject, and what the headline tiles say. No DOM, no fetch — everything a
// test can hold without a browser (the same split reportFilters.js makes for
// the library's bar).
//
// THE SUBJECT LIVES IN THE URL. A house, a collection, a design or a colour is
// pinned by `brand`, `collection`, `product` or `sku` — the API's own filter
// names (atelier-api src/reports/filters.js), so the querystring the screen
// reads is the querystring it sends, minus nothing. The library bar's five
// context keys ride along unchanged, which is what lets a director who
// filtered August click a house and see August's insight, not all time's.
//
// ROWS CARRY THEIR OWN IDENTITY. Every live report the API serves now declares
// slug columns beside the names (`brand_slug`, `product_slug`,
// `collection_slug`, `sku`) precisely so a row can be opened by identity rather
// than by a name that may not be unique. The screen does not draw them
// (reportBuilders.js HIDDEN_LIVE_KEYS); this module reads them.

import { categoryLabel } from '../lib/categories.js'

export const INSIGHT_API_PATH = '/admin/reports/insight'
export const INSIGHT_ROUTE = '/reporting/insight'

// The deepest pin first, because pinsOf reads a row in this order.
export const PIN_KEYS = Object.freeze(['sku', 'product', 'collection', 'brand'])
// The library bar's vocabulary — carried, never interpreted here.
export const CONTEXT_KEYS = Object.freeze(['category', 'from', 'to', 'brand_code', 'range'])
// One fixed order, so one subject is always one URL (the fetch effect keys on it).
export const INSIGHT_KEYS = Object.freeze(['brand', 'collection', 'product', 'sku', ...CONTEXT_KEYS])

// A value is a single string here. The API echoes `brand` back as a LIST, and
// a list of one is that one; a list of several is a comparison the insight
// does not pin (the house section stays), so it is dropped.
const single = (value) => {
  if (Array.isArray(value)) return value.length === 1 ? single(value[0]) : ''
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

const pick = (source, keys) =>
  keys.reduce((out, key) => {
    const value = single(source ? source[key] : '')
    return value === '' ? out : { ...out, [key]: value }
  }, {})

/** URL → the applied subject and context, only the keys that are set. */
export function insightFiltersFromParams(params) {
  return pick(
    Object.fromEntries(INSIGHT_KEYS.map((key) => [key, params ? params.get(key) : ''])),
    INSIGHT_KEYS
  )
}

/** Filters → '' or '?brand=…&from=…', in INSIGHT_KEYS order, blanks absent. */
export function insightQuery(filters = {}) {
  const params = new URLSearchParams()
  for (const key of INSIGHT_KEYS) {
    const value = single(filters[key])
    if (value !== '') params.append(key, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const insightRoute = (filters = {}) => `${INSIGHT_ROUTE}${insightQuery(filters)}`

/** The library bar's context out of a filter set — what travels with every pin. */
export const contextOf = (filters = {}) => pick(filters, CONTEXT_KEYS)

/** The pins out of a filter set. */
export const pinsOf = (filters = {}) => pick(filters, PIN_KEYS)

// A month cell (`2026-03`, the month grain's own format) is a window: the first
// of the month to its last day, in the bar's own YYYY-MM-DD.
const MONTH = /^(\d{4})-(\d{2})$/
export function monthRange(month) {
  const match = MONTH.exec(single(month))
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2])
  if (index < 1 || index > 12) return null
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate()
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}` }
}

/**
 * What one row of a live report pins, read off the row itself. The deepest
 * identity wins: a colourway row names its design and house too, and the SKU
 * alone is the narrower subject. A month row pins a WINDOW rather than a
 * subject. A row carrying none of them (a client, a rep, a status) pins nothing.
 *
 * @param {object} row the row as the API sent it
 * @returns {object|null}
 */
export function rowPins(row) {
  if (!row) return null
  const sku = single(row.sku)
  if (sku) return { sku }
  const product = single(row.product_slug)
  const brand = single(row.brand_slug)
  if (product) return brand ? { brand, product } : { product }
  const collection = single(row.collection_slug)
  if (collection) return brand ? { brand, collection } : { collection }
  if (brand) return { brand }
  const window = monthRange(row.month)
  if (window) return window
  return null
}

/**
 * Where a live row leads inside the insight, or '' for a row with no identity.
 * The row's pins REPLACE the current ones (a deeper subject), and the current
 * context travels; a month row keeps the current pins and replaces the window.
 *
 * @param {object} row
 * @param {object} [filters] the filters the API echoed (`meta.filters`)
 */
export function insightLinkFor(row, filters = {}) {
  const pins = rowPins(row)
  if (!pins) return ''
  if (pins.from) {
    return insightRoute({ ...pinsOf(filters), ...contextOf(filters), ...pins })
  }
  return insightRoute({ ...contextOf(filters), ...pins })
}

// ---- the heading ---------------------------------------------------------------

/**
 * The subject's kind read off the URL alone — the API's `subject.kind` rule
 * (deepest pin wins), so the heading is right before the payload lands and a
 * mistyped pin still says what kind of thing it failed to find.
 */
export function kindOfFilters(filters = {}) {
  if (single(filters.sku)) return 'colourway'
  if (single(filters.product)) return 'design'
  if (single(filters.collection)) return 'collection'
  if (single(filters.brand)) return 'house'
  return 'all'
}

/**
 * Columns every row of every section would repeat because the subject pins
 * them: the house's name under a house, the design's name and category under
 * a design. Dropped from the grid (buildLiveReport's `hide`) so the figures
 * fit; the unit (`product_type`) and `currency` stay, because a quantity
 * without its unit and a value without its currency are the two things these
 * tables never show.
 */
export function pinnedColumns(filters = {}) {
  const kind = kindOfFilters(filters)
  if (kind === 'all') return []
  const hide = ['brand_name']
  if (kind === 'collection') hide.push('collection_name')
  if (kind === 'design' || kind === 'colourway') hide.push('product_name', 'category')
  return hide
}

const nameOr = (record, key, fallback) => (record && record[key]) || fallback

/**
 * What the page is about, as three lines: an eyebrow (the kind and its parent),
 * the title (the subject's name) and a detail. An unresolved pin — a mistyped
 * slug — shows the raw filter, never a guess.
 *
 * @param {object} subject payload.subject
 * @param {object} filters the applied filters
 */
export function subjectHeading(subject = {}, filters = {}) {
  const kind = subject.kind || 'all'
  if (kind === 'colourway') {
    const colour = subject.colourway
    return {
      eyebrow: `${nameOr(colour, 'brand_name', 'House')} · Colourway`,
      title: colour ? `${colour.product_name} — ${colour.name}` : filters.sku,
      detail: colour ? colour.sku : 'This SKU is not in the catalogue.',
      hex: colour ? colour.hex : null,
    }
  }
  if (kind === 'design') {
    const product = subject.product
    const parts = [product && product.collection_name, product && categoryLabel(product.category)].filter(Boolean)
    return {
      eyebrow: `${nameOr(product, 'brand_name', 'House')} · Design`,
      title: nameOr(product, 'name', filters.product),
      detail: product ? parts.join(' · ') : 'This design is not in the catalogue.',
    }
  }
  if (kind === 'collection') {
    const [collection] = subject.collections || []
    return {
      eyebrow: `${nameOr(collection, 'brand_name', 'House')} · Collection`,
      title: nameOr(collection, 'name', filters.collection),
      detail: collection ? '' : 'This collection is not in the catalogue.',
    }
  }
  if (kind === 'house' || kind === 'houses') {
    const brands = subject.brands || []
    return {
      eyebrow: kind === 'house' ? 'House' : 'Houses',
      title: brands.length ? brands.map((b) => b.name).join(', ') : filters.brand,
      detail: brands.length ? '' : 'This house is not in the catalogue.',
    }
  }
  return { eyebrow: 'Whole platform', title: 'Every house, every design', detail: '' }
}

/**
 * The trail out to wider subjects, current one last and unlinked. Every step
 * keeps the applied context, so widening never loses the window.
 *
 * @returns {Array<{ label: string, to?: string }>}
 */
export function breadcrumbs(subject = {}, filters = {}) {
  const context = contextOf(filters)
  const trail = [{ label: 'All', to: insightRoute(context) }]
  const kind = subject.kind || 'all'
  const push = (label, pins) => trail.push({ label, to: insightRoute({ ...context, ...pins }) })

  const colour = subject.colourway
  const product = subject.product
  const [collection] = subject.collections || []
  const brand = (subject.brands || [])[0]

  if (kind === 'colourway' && colour) {
    push(colour.brand_name, { brand: colour.brand_slug })
    push(colour.product_name, { brand: colour.brand_slug, product: colour.product_slug })
  } else if (kind === 'design' && product) {
    push(product.brand_name, { brand: product.brand_slug })
    if (product.collection_slug) {
      push(product.collection_name, { brand: product.brand_slug, collection: product.collection_slug })
    }
  } else if (kind === 'collection' && collection) {
    push(collection.brand_name, { brand: collection.brand_slug })
  } else if (kind !== 'all' && !brand && !colour && !product && !collection && kind !== 'houses') {
    // An unresolved pin: nothing to widen through.
  }

  if (kind === 'all') return [{ label: 'All' }]
  const heading = subjectHeading(subject, filters)
  return [...trail, { label: heading.title }]
}

// ---- the tiles -----------------------------------------------------------------

const UNIT_LABELS = Object.freeze({ metres: 'm', units: 'units' })
const unitLabel = (unit, productType) =>
  UNIT_LABELS[unit] || (productType === 'fabric' ? 'm' : productType === 'finished_good' ? 'units' : '')

const number = (value) =>
  value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en-NZ')

const money = (cents, currency) => {
  if (cents == null || !Number.isFinite(Number(cents))) return '—'
  const amount = (Number(cents) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${currency} ${amount}` : amount
}

/**
 * The headline figures as tiles. A figure the API withheld (mixed currencies,
 * mixed units) is a dash with the reason under it — never a summed lie.
 *
 * @param {object|null} summary payload.summary
 * @returns {Array<{ label: string, value: string, sub: string }>}
 */
export function summaryTiles(summary) {
  if (!summary) return []
  const stock = summary.stock || {}
  const queue = summary.awaiting_invoice || {}
  const unit = unitLabel(null, summary.product_type)
  return [
    { label: 'Orders', value: number(summary.orders), sub: `${number(summary.lines)} lines · ${(summary.statuses || []).join(' / ')}` },
    {
      label: 'Sold',
      value: summary.mixed_units ? '—' : `${number(summary.qty)}${unit ? ` ${unit}` : ''}`,
      sub: summary.mixed_units ? 'Metres and units do not add' : `${number(summary.colourways_sold)} colourways · ${number(summary.designs)} designs`,
    },
    {
      label: 'Sales',
      value: summary.mixed_currency ? '—' : money(summary.value_cents, summary.currency),
      sub: summary.mixed_currency
        ? 'More than one currency in the window'
        : summary.unpriced_lines ? `${number(summary.unpriced_lines)} unpriced lines at nil` : 'Every line priced',
    },
    { label: 'Clients', value: number(summary.clients), sub: `${number(summary.houses)} ${summary.houses === 1 ? 'house' : 'houses'}` },
    {
      label: 'On hand',
      value: stock.mixed_units ? '—' : `${number(stock.on_hand)}${stock.unit ? ` ${unitLabel(stock.unit)}` : ''}`,
      sub: stock.mixed_units
        ? 'Metres and units do not add'
        : `${number(stock.colourways_held)} colourways held · ${number(stock.held_unsold)} never sold in window`,
    },
    {
      label: 'Available',
      value: stock.mixed_units ? '—' : `${number(stock.available)}${stock.unit ? ` ${unitLabel(stock.unit)}` : ''}`,
      sub: stock.over_allocated ? `${number(stock.over_allocated)} over-allocated` : `${number(stock.allocated)} allocated`,
    },
    { label: 'Awaiting invoice', value: number(queue.lines), sub: 'lines without a Xero reference' },
  ]
}

// ---- the sections ----------------------------------------------------------------

export const SECTION_TITLES = Object.freeze({
  by_month: 'Sales by month',
  by_house: 'By house',
  by_collection: 'By collection',
  by_design: 'By design',
  by_category: 'By category',
  by_colourway: 'By colourway — sold against stock',
  by_client: 'Who buys it',
  by_rep: 'By staff member',
  by_status: 'Where the demand sits',
  awaiting_invoice: 'Awaiting invoice',
  recent_orders: 'Recent orders',
})

export const sectionTitle = (key) => SECTION_TITLES[key] || key

/** A sentence saying what the rows are of, from the section's own meta. */
export function sectionIntro(key, meta = {}) {
  if (key === 'by_status') return 'Every lifecycle status, not only paid and shipped — the archived are out.'
  if (key === 'by_colourway') {
    return 'One row per colourway that sold in the window or is held. Sales are of the window; on hand, allocated and available are as at now.'
  }
  if (key === 'recent_orders') return `Newest ${meta.row_limit || ''} lines. The full list is R-13, Orders placed.`.replace('  ', ' ')
  if (key === 'awaiting_invoice') return 'Oldest first; card checkouts are never invoiced here and are not listed.'
  if (key === 'by_month') return 'A month with no sale is absent rather than nil. Open a month to narrow the window to it.'
  return ''
}
