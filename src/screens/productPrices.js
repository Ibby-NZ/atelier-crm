// Product prices — the Dynamics "Active Product Prices" export, re-imported, each
// row priced through its house's range parameters by atelier-api
// (src/pricing/product-prices.js there). The rules for the list, the product's
// own page, the panel on a catalogue product and the upload live here; the
// .jsx files are layout, because there is no jsdom in this repo.
//
//   GET  /admin/product-prices?q&range&currency&include_previous&page&limit
//   GET  /admin/product-prices/ranges
//   GET  /admin/product-prices/:id
//   POST /admin/product-prices/import/validate|apply?filename=   raw .xlsx
//
// THE PRICE IS THE API'S. Every figure on these screens — each step, the
// landed cost, the trade sell, the difference from Dynamics — arrives computed
// and rounded; nothing here multiplies a rate. The one sum drawn is the
// client's own intermediate (price incl duty + freight, "175.26" in their
// ELLA STRIPE example), added from two figures the API already rounded.
//
// FINANCE-GATED by the API, reads included: a 403 is a LockedPanel with the
// API's sentence (`isFinanceRefusal`), never an empty list.

import { brandRoute } from './adminCatalogue.js'
import { foreign, nzd } from './pricingWaterfall.js'
import { nzdPerUnitText } from '../admin/exchangeRate.js'

const DASH = '—'

export const PRODUCT_PRICES_PATH = '/admin/product-prices'
export const PRODUCT_PRICE_RANGES_PATH = `${PRODUCT_PRICES_PATH}/ranges`
export const productPricePath = (id) => `${PRODUCT_PRICES_PATH}/${id}`

/** The screens' own routes — named apart from the API paths although the strings match. */
export const PRODUCT_PRICES_ROUTE = '/admin/product-prices'
export const productPriceRoute = (id) => `${PRODUCT_PRICES_ROUTE}/${id}`

export const PRODUCT_PRICE_LIST_LIMIT = 50
/** A catalogue product rarely has more than a handful of rows behind it. */
export const PRODUCT_PANEL_LIMIT = 20

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** The API's body limit for the upload (32 MB); the 25 Sep 2026 export is 3.9 MB. */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024

export const CURRENCY_OPTIONS = Object.freeze(['', 'EUR', 'USD', 'GBP', 'NZD'])

export { nzd, foreign }

/** A 403 from the API is the finance gate — drawn as a LockedPanel, not an error. */
export const isFinanceRefusal = (error) => error?.status === 403

// --- the list ------------------------------------------------------------------

/**
 * The list's search, from the URL — so Back from a product's page lands on the
 * same search over twenty thousand rows.
 */
export const productPriceSearchFromParams = (params) => ({
  q: params.get('q') ?? '',
  range: params.get('range') ?? '',
  currency: CURRENCY_OPTIONS.includes(params.get('currency') ?? '') ? params.get('currency') ?? '' : '',
  all: params.get('all') === 'true',
})

/** The URL for a search; empty values stay out of it. */
export const productPriceSearchParams = ({ q = '', range = '', currency = '', all = false } = {}) => {
  const out = {}
  if (q.trim()) out.q = q.trim()
  if (range) out.range = range
  if (currency) out.currency = currency
  if (all) out.all = 'true'
  return out
}

/**
 * The API filters. Every unset one is null so `buildListQuery` drops it — an
 * empty `currency=` is a 400 from the endpoint's pattern, which kills the list.
 */
export const productPriceFilters = ({ q = '', range = '', currency = '', all = false } = {}) => ({
  q: q.trim() || null,
  range: range || null,
  currency: currency || null,
  include_previous: all || null,
})

/** The list address as it stood, handed to a row's page so its Back returns there. */
export const productPricesListRoute = (search = {}) => {
  const params = new URLSearchParams(productPriceSearchParams(search)).toString()
  return params ? `${PRODUCT_PRICES_ROUTE}?${params}` : PRODUCT_PRICES_ROUTE
}

/** Where a product's page sends Back: the list it came from, or the bare list after a deep link. */
export const productPriceListReturn = (state) =>
  typeof state?.from === 'string' && state.from.startsWith(PRODUCT_PRICES_ROUTE) ? state.from : PRODUCT_PRICES_ROUTE

/** The range select's options: every range the rows name, with its count. */
export const rangeOptions = (ranges = []) =>
  ranges.map((range) => ({
    value: range.range_name,
    label: `${range.range_name} (${range.products.toLocaleString('en-NZ')})${range.house ? '' : ' — no house'}`,
  }))

// --- one price's words ---------------------------------------------------------------

export const INPUT_LABELS = Object.freeze({
  discount_percent: 'Supplier discount',
  fx_rate: 'Exchange rate',
  fx_margin_percent: 'FX margin',
  duty_percent: 'Duty',
  freight: 'Freight',
  clearance_percent: 'Clearance',
  handling: 'Handling',
  trade_markup_percent: 'Trade markup',
  retail_markup: 'Retail markup',
})

/** Where an input came from, said after it. `none` carries its own reason. */
export const SOURCE_TEXT = Object.freeze({
  house: 'the house',
  supplier: 'supplier default',
  terms: 'supplier terms',
  'freight-ledger': 'house freight',
  fx: 'exchange rate',
  missing: 'not set',
  // The product price's own "Markup to Trade %", over its range's (Sept 2026).
  product: "the product's own",
})

export const sourceText = (input) => {
  if (!input) return DASH
  if (input.source === 'none') return input.detail?.reason ?? 'not a step here'
  if (input.source === 'freight-ledger' && input.detail?.scope === 'supplier') return 'supplier freight'
  return SOURCE_TEXT[input.source] ?? input.source
}

const pct = (value) => `${Number(value).toLocaleString('en-NZ', { maximumFractionDigits: 3 })}%`

/** The engine's names for a missing input (`computeWaterfall`'s `missing`). */
export const MISSING_LABELS = Object.freeze({
  wholesale_rate: 'Wholesale rate',
  discount: 'Supplier discount',
  fx_rate: 'Exchange rate',
  fx_margin: 'FX margin',
  duty: 'Duty',
  freight: 'Freight',
  clearance: 'Clearance',
  handling: 'Handling',
  trade_markup: 'Trade markup',
  retail_markup: 'Retail markup',
})

/** "Freight and clearance not set", from the API's `missing` list. */
export const missingText = (missing = []) => {
  const names = missing.map((key) => MISSING_LABELS[key] ?? key)
  if (names.length === 0) return ''
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${list} not set`
}

/**
 * What a row's price cell says when there is no price: the house is missing,
 * or which of its figures are. Null when it priced.
 */
export const unpricedText = (pricing) => {
  if (!pricing) return DASH
  if (pricing.status === 'priced') return null
  if (pricing.status === 'no_house') return 'No house for this range'
  return missingText(pricing.missing) || pricing.reason || 'Not priced'
}

/** The difference from Dynamics' own trade sell, signed, or "agrees". */
export const differenceText = (pricing) => {
  if (pricing?.difference == null) return DASH
  if (pricing.agrees) return 'agrees'
  const sign = pricing.difference > 0 ? '+' : '−'
  return `${sign}${nzd(Math.abs(pricing.difference))}`
}

/** A signed difference over the list's rows reads in clay; agreement in sage. */
export const differenceTone = (pricing) =>
  pricing?.difference == null ? 'muted' : pricing.agrees ? 'positive' : 'warning'

/**
 * A product Dynamics priced by hand ("Set prices manually" — Alpaka, Garrett
 * Leather…) is not run through the range formula: the API takes Dynamics'
 * own trade price and puts the house's retail markup on it (1 Oct 2026).
 */
const handPricedLines = (pricing) => {
  const lines = [{ key: 'trade_sell', label: 'Trade sell', amount: nzd(pricing.trade_sell), op: "Dynamics' own price — it priced this product by hand", key_step: true }]
  const markup = pricing.inputs?.retail_markup_percent
  lines.push({
    key: 'retail_sell',
    label: 'Retail sell',
    amount: pricing.retail_sell == null ? DASH : nzd(pricing.retail_sell),
    op: markup?.value == null
      ? "Retail markup not set — set it on the house's Pricing panel"
      : `× (1 + ${pct(markup.value)} retail markup) on the trade sell · ${sourceText(markup)}`,
  })
  return lines
}

/**
 * The step list as the office reads the formula: wholesale, the discount (only
 * where there is one), price ex duty, price incl duty, freight, landed, trade
 * sell. The engine's `landed_ex_handling` is the landed cost itself unless a
 * handling charge is set, so it is drawn once or twice accordingly.
 *
 * @param {object} pricing the API's `pricing` for one row
 * @param {{ currency: string }} product
 * @returns {{ key: string, label: string, amount: string, op: string, key_step?: boolean, subtotal?: string }[]}
 */
export const stepLines = (pricing, product) => {
  if (pricing?.hand_priced) return handPricedLines(pricing)
  if (!pricing?.steps) return []
  const amount = Object.fromEntries(pricing.steps.map((step) => [step.step, step.amount]))
  const inputs = pricing.inputs ?? {}
  const value = (key) => inputs[key]?.value
  const src = (key) => sourceText(inputs[key])
  const notSet = (key) => `${INPUT_LABELS[key]} not set — set it on the house's Pricing panel`
  const lines = []

  lines.push({ key: 'wholesale', label: 'Wholesale rate', amount: foreign(amount.wholesale, product.currency), op: `the supplier's price per unit, in ${product.currency}` })

  const discount = value('discount_percent')
  if (discount == null || Number(discount) !== 0) {
    lines.push({
      key: 'export_price',
      label: 'After supplier discount',
      amount: foreign(amount.export_price, product.currency),
      op: discount == null ? notSet('discount_percent') : `− ${pct(discount)} supplier discount · ${src('discount_percent')}`,
    })
  }

  const fx = inputs.fx_rate
  lines.push({
    key: 'price_ex_duty',
    label: 'Price ex duty',
    amount: nzd(amount.price_ex_duty),
    op:
      fx?.value == null
        ? `No exchange rate for ${product.currency} — set it on the Pricing screen`
        : fx.source === 'none'
          ? fx.detail?.reason ?? 'no exchange'
          : `÷ ${value('fx_rate')} ${product.currency} per NZ$1 (${nzdPerUnitText(value('fx_rate'), product.currency)})${Number(value('fx_margin_percent')) > 0 ? `, softened by ${pct(value('fx_margin_percent'))} FX margin` : ''} · ${src('fx_rate')}${fx.detail?.planned ? ' (to be set by this import)' : ''}`,
  })

  const duty = inputs.duty_percent
  lines.push({
    key: 'price_incl_duty',
    label: 'Price incl duty',
    amount: nzd(amount.price_incl_duty),
    op:
      duty?.source === 'none'
        ? `no duty — ${duty.detail?.reason ?? 'none on this product'}`
        : duty?.value == null
          ? notSet('duty_percent')
          : `+ ${pct(duty.value)} duty (class ${duty.detail?.duty_class ?? 'A'}) · ${src('duty_percent')}`,
  })

  const freight = inputs.freight
  const subtotal =
    amount.price_incl_duty == null || amount.freight_amount == null
      ? null
      : Math.round((amount.price_incl_duty + amount.freight_amount) * 100) / 100
  lines.push({
    key: 'freight_amount',
    label: 'Freight',
    amount: freight?.value == null ? DASH : `+ ${nzd(amount.freight_amount)}`,
    op: freight?.value == null ? notSet('freight') : `+ ${nzd(freight.value)} per unit · ${src('freight')}`,
    subtotal: subtotal == null ? null : nzd(subtotal),
  })

  const handling = inputs.handling
  const hasHandling = handling?.source !== 'none'
  const clearanceOp =
    value('clearance_percent') == null
      ? notSet('clearance_percent')
      : inputs.clearance_percent?.detail?.basis === 'dollar'
        ? `+ ${nzd(value('clearance_percent'))} clearance per unit · ${src('clearance_percent')}`
        : `× (1 + ${pct(value('clearance_percent'))} clearance) over the duty-paid price and freight · ${src('clearance_percent')}`
  if (hasHandling) {
    lines.push({ key: 'landed_ex_handling', label: 'Landed before handling', amount: nzd(amount.landed_ex_handling), op: clearanceOp })
    lines.push({
      key: 'landed',
      label: 'Landed cost',
      amount: nzd(amount.landed),
      op: handling?.value == null ? notSet('handling') : `+ ${nzd(handling.value)} handling per unit · ${src('handling')}`,
      key_step: true,
    })
  } else {
    lines.push({ key: 'landed', label: 'Landed cost', amount: nzd(amount.landed), op: clearanceOp, key_step: true })
  }

  lines.push({
    key: 'trade_sell',
    label: 'Trade sell',
    amount: nzd(amount.trade_sell),
    op:
      value('trade_markup_percent') == null
        ? notSet('trade_markup_percent')
        : `× (1 + ${pct(value('trade_markup_percent'))} trade markup) on landed cost · ${src('trade_markup_percent')}`,
    key_step: true,
  })
  if (amount.retail_sell != null) {
    lines.push({
      key: 'retail_sell',
      label: 'Retail sell',
      amount: nzd(amount.retail_sell),
      op:
        value('retail_markup_percent') != null
          ? `× (1 + ${pct(value('retail_markup_percent'))} retail markup) on the trade sell · ${src('retail_markup_percent')}`
          : `× ${value('retail_markup')} retail markup on landed cost · ${src('retail_markup')}`,
    })
  }
  return lines
}

/**
 * The sentence beside the platform's trade sell: Dynamics' own figure and why
 * the two may part. Dynamics priced freight per range × letter, and freight is
 * where the two part on every differing row the API measured (30 Sep 2026).
 * The platform takes the house's rate for the row's letter when the house has
 * one (the API's `detail.freight_class`), so the sentence says which it used
 * and, when it fell back, where to set the letter's rate.
 */
export const dynamicsNote = (pricing) => {
  const theirs = pricing?.dynamics?.trade_sell
  if (theirs == null) return 'Dynamics carried no trade sell price for this product.'
  if (pricing.trade_sell == null) return `Dynamics priced it at ${nzd(theirs)}.`
  if (pricing.agrees) return `Dynamics priced it at ${nzd(theirs)} too.`
  const letter = pricing.dynamics.freight_letter
  const classRate = pricing.inputs?.freight?.detail?.freight_class
  const freight = classRate
    ? `The house's freight for letter ${classRate} applies, so check that rate and the range figures.`
    : letter
      ? `Dynamics charged freight for the product's letter (${letter}); the house has no rate for ${letter}, so its every-class freight applies. Set a rate for ${letter} under Freight classes on the house's page.`
      : "The house's freight applies; the range figures are the ones to check."
  return `Dynamics priced it at ${nzd(theirs)} (${differenceText(pricing)} here). ${freight}`
}

/** "Small orders: + $20.00 per unit under 5" — the house's surcharge, when it has one. */
export const surchargeText = (surcharge) => {
  if (!surcharge || surcharge.per_unit == null) return null
  const under = surcharge.min_qty == null ? '' : ` under ${Number(surcharge.min_qty).toLocaleString('en-NZ')}`
  return `Small orders: + ${nzd(surcharge.per_unit)} per unit${under} (${surcharge.source === 'house' ? 'the house' : 'supplier default'}).`
}

export const houseLink = (house) => (house ? brandRoute(house.id) : null)

// --- onto the catalogue product ----------------------------------------------------

export const applyToProductPath = (productPriceId) => `${PRODUCT_PRICES_PATH}/${productPriceId}/apply-to-product`

/**
 * The product's own trade price against its range price: what the "Price from
 * its range" panel says, and whether it offers "Set as the trade price". Both
 * figures are the API's (the product's cents, the pricing's rounded trade sell).
 *
 * @param {{ trade_price_cents?: number|null }} product the catalogue product
 * @param {object} pricing a product price row's `pricing`
 */
export const productPriceState = (product, pricing) => {
  const current = product?.trade_price_cents == null ? null : Number(product.trade_price_cents) / 100
  const range = pricing?.status === 'priced' ? pricing.trade_sell : null
  if (range == null) return { current, range, action: null, text: current == null ? 'No trade price on the product' : `On the product: ${nzd(current)}` }
  if (current == null) return { current, range, action: 'set', text: 'The product has no trade price yet' }
  if (Math.round(current * 100) === Math.round(range * 100)) return { current, range, action: null, text: 'The product carries this price' }
  return { current, range, action: 'set', text: `The product carries ${nzd(current)}` }
}

/** "1 catalogue product given its trade price · 1 kept its own" — the sync's counts. */
export const catalogueLine = (catalogue) => {
  if (!catalogue) return ''
  const parts = []
  const filled = Number(catalogue.trade_filled ?? 0) + Number(catalogue.trade_replaced ?? 0)
  parts.push(`${filled.toLocaleString('en-NZ')} catalogue product${filled === 1 ? '' : 's'} given ${filled === 1 ? 'its' : 'their'} trade price`)
  if (catalogue.wholesale_filled) parts.push(`${Number(catalogue.wholesale_filled).toLocaleString('en-NZ')} wholesale rate${catalogue.wholesale_filled === 1 ? '' : 's'} filled`)
  if (catalogue.category_filled) parts.push(`${Number(catalogue.category_filled).toLocaleString('en-NZ')} categor${catalogue.category_filled === 1 ? 'y' : 'ies'} filled`)
  if (catalogue.kept_count) parts.push(`${Number(catalogue.kept_count).toLocaleString('en-NZ')} kept a price of ${catalogue.kept_count === 1 ? 'its' : 'their'} own (set it from the product's page)`)
  if (catalogue.ambiguous_count) parts.push(`${Number(catalogue.ambiguous_count).toLocaleString('en-NZ')} named by two rows at different prices — left alone`)
  return parts.join(' · ')
}

// --- the upload ------------------------------------------------------------------

export const importPath = (step, filename) =>
  `${PRODUCT_PRICES_PATH}/import/${step}${filename ? `?filename=${encodeURIComponent(filename)}` : ''}`

/** What is wrong with a chosen file before it is sent, or null. The API re-checks. */
export const importFileProblem = (file) => {
  if (!file) return 'Choose the product prices export first.'
  if (file.size === 0) return 'That file is empty.'
  if (!/\.xlsx$/i.test(file.name ?? '')) return 'That is not an .xlsx workbook — upload the export as Dynamics saved it.'
  if (file.size > MAX_IMPORT_BYTES) return 'That file is larger than 32 MB — is it the product prices export?'
  return null
}

/** A 422 with the API's per-row reasons, or null for any other failure. */
export const importRefusal = (error) => {
  if (error?.status !== 422 || !error.body || typeof error.body !== 'object') return null
  return {
    message: error.body.message ?? error.message,
    errors: Array.isArray(error.body.errors) ? error.body.errors : [],
    errorCount: Number(error.body.error_count) || 0,
  }
}

export const canApply = (result) =>
  Boolean(result) && Number(result.rows_read) > 0 && result.import_id == null && !result.applied

/**
 * "Markup to trade % — 39 set, 36 changed, 13 not imported yet": the API's
 * report of a product's own markups, from a "Markup to Trade %" export (or a
 * prices export carrying the column). '' when the file had none.
 */
export const markupsLine = (result) => {
  const m = result?.markups
  if (!m) return ''
  const unknown = Number(m.unknown) > 0 ? `, ${n(m.unknown)} not imported yet (skipped)` : ''
  const catalogue = m.catalogue ?? result.catalogue
  const moved = result.applied && catalogue ? ` · ${n(catalogue.trade_replaced)} product price(s) re-priced` : ''
  return `Markup to trade % — ${n(m.markups_stated)} set, ${n(m.changed)} changed${unknown}${moved}`
}

const n = (value) => Number(value ?? 0).toLocaleString('en-NZ')

/** "21,102 rows — 21,102 new, 0 changed, 0 unchanged". */
export const importSummaryLine = (result) => {
  if (!result) return ''
  const parts = [`${n(result.rows_new)} new`, `${n(result.rows_changed)} changed`, `${n(result.rows_unchanged)} unchanged`]
  const gone = Number(result.rows_not_in_file) > 0 ? ` · ${n(result.rows_not_in_file)} no longer in the export (kept, flagged)` : ''
  return `${n(result.rows_read)} rows — ${parts.join(', ')}${gone}`
}

/** "Priced 20,420 of 21,102 · 8,234 agree with Dynamics · 12,165 differ". */
export const comparisonLine = (comparison) => {
  if (!comparison) return ''
  return (
    `Priced ${n(comparison.priced)} of ${n(comparison.products)} · ` +
    `${n(comparison.agree)} agree with Dynamics' trade sell · ${n(comparison.differ)} differ`
  )
}

// A stated rate is the export's Exchange Rate column; a voted one is worked
// back from an older export's prices (API product-prices-import.js).
const fxSource = (line) => (line.source === 'file' ? "the export's Exchange Rate column" : 'read from the export')

/** One exchange-rate line of the import report. */
export const fxLineText = (line) => {
  const share = line.share == null ? '' : ` (${(line.share * 100).toLocaleString('en-NZ', { maximumFractionDigits: 1 })}% of its rows agree)`
  switch (line.action) {
    case 'home':
      return `${line.currency} — priced in NZ$, no exchange (${n(line.rows)} rows)`
    case 'fill':
      return `${line.currency} ${line.implied} per NZ$1 — ${fxSource(line)}${share}; the platform has none, so applying sets it`
    case 'update':
      return `${line.currency} ${line.implied} per NZ$1 — ${fxSource(line)}${share}; the platform has ${line.current}, so applying replaces it`
    case 'keep':
      return `${line.currency} ${line.current} per NZ$1 — already set, and the export agrees`
    case 'differs':
      return `${line.currency}: the export implies ${line.implied}${share}, the platform has ${line.current} — kept. Change it on the Pricing screen if the export is right.`
    default:
      return `${line.currency}: no clear rate in the export — import the ranges onto the houses first, so each range's discount is known, then check again.`
  }
}

/** The ranges worth the office's attention: no house, or figures missing. */
export const rangeReportRows = (comparison) =>
  (comparison?.ranges ?? [])
    .filter((range) => !range.house || range.missing.length > 0)
    .map((range) => ({
      range: range.range_name,
      house: range.house,
      products: range.products,
      text: range.house ? missingText(range.missing) : 'No house carries this name — raise it (or rename one) and its products price at once',
    }))

/** Every range, for the full comparison table. */
export const rangeComparisonRows = (comparison) =>
  (comparison?.ranges ?? []).map((range) => ({
    range: range.range_name,
    house: range.house,
    products: range.products,
    priced: range.priced,
    agree: range.agree,
    differ: range.differ,
  }))
