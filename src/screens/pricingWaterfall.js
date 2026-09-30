// The Pricing screen's rules — the platform's OWN waterfall, on parameters the
// office sets per supplier and per house (atelier-api /admin/pricing/*), in
// the visual language of the original Pricing Engine: a numbered waterfall
// with the formula under each step, and a parameters rail beside it with an
// Automatic / Manual toggle.
//
// AUTOMATIC shows the house as the API resolves it — every input with its
// source. MANUAL unlocks the rail: a typed value is sent to the API as a
// what-if override (source `manual`) and the waterfall moves live; nothing is
// written until Save, which PUTs the edited SAVABLE parameters onto the house's
// override set (or the supplier's default). Discount, freight and retail markup
// can be tried but not saved here — they live on the supplier's terms and the
// freight ledger, and the rail says so. (A house's discount and freight are
// edited on its own page's Pricing panel — ./housePricing.js.)
//
// Pure — no jsdom in this repo, so every decision a cell makes lives here and
// is tested from ./pricingWaterfall.test.js.

import { DASH, pctText } from './priceLists.js'
import { nzdPerUnitText } from '../admin/exchangeRate.js'

export const WATERFALL_PATH = '/admin/pricing/waterfall'
export const FX_PATH = '/admin/pricing/fx-rates'
export const BRANDS_PATH = '/admin/brands'
export const supplierParametersPath = (id) => `/admin/pricing/parameters/suppliers/${id}`
export const brandParametersPath = (id) => `/admin/pricing/parameters/brands/${id}`
export const fxRatePath = (currency) => `${FX_PATH}/${currency}`

/** The house the screen opens on. Pierre Frey is the house the office prices most. */
export const DEFAULT_HOUSE_SLUG = 'pierre-frey'
export const DEFAULT_WHOLESALE = '100'
export const DUTY_CLASSES = Object.freeze(['', 'A', 'B', 'C'])
// The freight letters the price lines carry (A–E in the corpus). A line's
// letter picks the house's rate for it; none is the house's every-class rate.
export const FREIGHT_CLASSES = Object.freeze(['', 'A', 'B', 'C', 'D', 'E'])
export const CATEGORIES = Object.freeze(['', 'fabric', 'wallpaper', 'trimming', 'accessory'])
export const MODES = Object.freeze(['Automatic', 'Manual'])

/** Where an input came from, as the rail says it after the label. */
export const SOURCE_LABELS = Object.freeze({
  house: 'this house',
  supplier: 'supplier default',
  terms: 'supplier terms',
  'freight-ledger': 'freight ledger',
  fx: 'exchange rate',
  none: 'no duty class',
  missing: 'not set',
  manual: 'edited',
  product: 'this product',
})

export const sourceLabel = (input) => SOURCE_LABELS[input?.source] ?? input?.source ?? DASH

/**
 * The rail, in waterfall order. `savable` names the parameter column a Save
 * writes (a function of the duty class for duty); false means what-if only,
 * with `where` saying which screen owns the value. `unit` is how the value is
 * printed and typed.
 */
export const RAIL_ROWS = Object.freeze([
  Object.freeze({ key: 'discount_percent', label: 'Supplier discount', unit: '%', savable: false, where: 'Suppliers → terms' }),
  Object.freeze({ key: 'fx_rate', label: 'FX rate', unit: 'per NZ$1', savable: 'fx' }),
  Object.freeze({ key: 'fx_margin_percent', label: 'FX margin', unit: '%', savable: 'fx_margin_percent' }),
  Object.freeze({ key: 'duty_percent', label: 'Duty', unit: '%', savable: (dutyClass) => (dutyClass ? `duty_percent_${dutyClass.toLowerCase()}` : null) }),
  Object.freeze({ key: 'freight', label: 'Freight', unit: '$ / unit', savable: false, where: 'Price Lists → Freight' }),
  Object.freeze({ key: 'clearance_percent', label: 'Clearance', unit: '%', savable: 'clearance_percent' }),
  Object.freeze({ key: 'handling', label: 'Handling', unit: '$ / unit', savable: 'handling' }),
  Object.freeze({ key: 'trade_markup_percent', label: 'Trade markup', unit: '%', savable: 'trade_markup_percent' }),
  // On the trade sell (30 = trade × 1.30), the house's own since Sept 2026.
  Object.freeze({ key: 'retail_markup_percent', label: 'Retail markup', unit: '% on trade', savable: 'retail_markup_percent' }),
])

/** The parameter column a rail row saves to, for the duty class in play; null when it cannot be saved. */
export const savableColumn = (row, dutyClass = '') =>
  typeof row.savable === 'function' ? row.savable(dutyClass) : row.savable || null

/** Which resolved input drives each waterfall step. `wholesale` is the figure typed in. */
export const STEP_INPUT = Object.freeze({
  export_price: 'discount_percent',
  price_ex_duty: 'fx_rate',
  price_incl_duty: 'duty_percent',
  freight_amount: 'freight',
  landed_ex_handling: 'clearance_percent',
  landed: 'handling',
  trade_sell: 'trade_markup_percent',
  retail_sell: 'retail_markup_percent',
})

/** The steps drawn large and highlighted, as the demo drew COGS and Trade Sell. */
export const KEY_STEPS = Object.freeze(['landed', 'trade_sell', 'retail_sell'])

const nzdFormat = new Intl.NumberFormat('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** NZ dollars, or a dash for a step the waterfall could not reach. */
export const nzd = (amount) => (amount == null ? DASH : `$${nzdFormat.format(Number(amount))}`)

/** A figure in its own currency, as the wholesale line prints it. */
export const foreign = (amount, currency) =>
  amount == null ? DASH : `${nzdFormat.format(Number(amount))} ${currency ?? ''}`.trim()

/** A typed wholesale rate as a number, or null when it is not one the API would take. */
export const parseWholesale = (value) => {
  const raw = String(value ?? '').trim()
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * The what-if overrides the API will accept: only the rail keys, only finite
 * non-negative numbers. A blank is "no override", a word is ignored.
 */
export const cleanOverrides = (overrides = {}) =>
  Object.fromEntries(
    RAIL_ROWS.map((row) => row.key)
      .filter((key) => {
        const raw = String(overrides[key] ?? '').trim()
        if (raw === '') return false
        const n = Number(raw)
        return Number.isFinite(n) && n >= 0
      })
      .map((key) => [key, Number(String(overrides[key]).trim())])
  )

/** The query for one preview: house, rate, the optional class and category, and any clean overrides. */
export const waterfallPath = ({ brandId, wholesaleRate, dutyClass = '', freightClass = '', category = '', overrides = {} }) => {
  const params = new URLSearchParams({ brand_id: String(brandId), wholesale_rate: String(wholesaleRate) })
  if (dutyClass) params.set('duty_class', dutyClass)
  if (freightClass) params.set('freight_class', freightClass)
  if (category) params.set('category', category)
  for (const [key, value] of Object.entries(cleanOverrides(overrides))) params.set(key, String(value))
  return `${WATERFALL_PATH}?${params.toString()}`
}

/** A resolved input's value as the rail prints it, in the row's unit. */
export const railValueText = (row, input) => {
  const value = input?.value
  if (value == null) return DASH
  switch (row.unit) {
    case '%':
      return pctText(value)
    case '% on trade':
      return `${pctText(value)} on trade`
    case '$ / unit':
      return `$${Number(value).toFixed(2)}`
    case '×':
      return `×${value}`
    default:
      return String(value)
  }
}

/** What the rail input holds: the override while typing, else the resolved value as a plain string. */
export const railDraftValue = (row, input, overrides = {}) => {
  if (Object.hasOwn(overrides, row.key)) return String(overrides[row.key])
  return input?.value == null ? '' : String(input.value)
}

/**
 * The formula line under a step — the operation with the figure it used and
 * where the figure came from. A missing input names itself so the reader knows
 * which rail row to fill.
 */
export const stepOp = (step, preview, dutyClass = '') => {
  const currency = preview?.currency ?? 'foreign'
  const inputs = preview?.inputs ?? {}
  const src = (key) => sourceLabel(inputs[key])
  const missing = (label) => `${label} not set — enter it in the rail`
  const v = (key) => inputs[key]?.value
  switch (step) {
    case 'wholesale':
      return `supplier list price per unit, in ${currency}`
    case 'export_price': {
      if (v('discount_percent') == null) return missing('Supplier discount')
      const shape = inputs.discount_percent.detail?.shape
      const how = shape === 'chain' ? ' (compounded chain)' : shape === 'tier' && inputs.discount_percent.detail?.label ? ` (tier: ${inputs.discount_percent.detail.label})` : ''
      return `− ${pctText(v('discount_percent'))} supplier discount${how} · ${src('discount_percent')}`
    }
    case 'price_ex_duty': {
      if (v('fx_rate') == null) return missing('FX rate')
      if (v('fx_margin_percent') == null) return missing('FX margin')
      const margin = Number(v('fx_margin_percent'))
      return `÷ ${v('fx_rate')} ${currency} per NZ$1 (${nzdPerUnitText(v('fx_rate'), currency)})${margin > 0 ? `, softened by ${pctText(margin)} margin` : ''} · ${src('fx_rate')}`
    }
    case 'price_incl_duty': {
      if (inputs.duty_percent?.source === 'none') return 'no duty class on the line — no duty'
      if (v('duty_percent') == null) return missing(`Duty${dutyClass ? ` (class ${dutyClass})` : ''}`)
      return `+ ${pctText(v('duty_percent'))} duty${dutyClass ? ` (class ${dutyClass})` : ''} · ${src('duty_percent')}`
    }
    case 'freight_amount': {
      if (v('freight') == null) return missing('Freight')
      const detail = inputs.freight.detail ?? {}
      // Which rate answered: the letter's own, or the house's every-class one.
      const letter = detail.freight_class ? ` (class ${detail.freight_class})` : ''
      return detail.basis === 'percent'
        ? `+ ${pctText(v('freight'))} of the duty-paid value${letter} · ${src('freight')}`
        : `+ $${Number(v('freight')).toFixed(2)} per unit freight${letter} · ${src('freight')}`
    }
    case 'landed_ex_handling':
      if (v('clearance_percent') == null) return missing('Clearance')
      return inputs.clearance_percent.detail?.basis === 'dollar'
        ? `+ $${Number(v('clearance_percent')).toFixed(2)} clearance per unit · ${src('clearance_percent')}`
        : `× (1 + ${pctText(v('clearance_percent'))} clearance) over duty-paid value and freight · ${src('clearance_percent')}`
    case 'landed':
      if (v('handling') == null) return missing('Handling')
      return `+ $${Number(v('handling')).toFixed(2)} warehouse handling per unit · ${src('handling')}`
    case 'trade_sell':
      if (v('trade_markup_percent') == null) return missing('Trade markup')
      return `+ ${pctText(v('trade_markup_percent'))} trade markup on landed cost · ${src('trade_markup_percent')}`
    case 'retail_sell':
      if (v('retail_markup_percent') != null) {
        return `× (1 + ${pctText(v('retail_markup_percent'))} retail markup) on the trade sell · ${src('retail_markup_percent')}`
      }
      if (v('retail_markup') == null) return missing('Retail markup')
      return `× ${v('retail_markup')} retail markup on landed cost · ${src('retail_markup')}`
    default:
      return ''
  }
}

/**
 * The PUT body a Save writes for one scope: the scope's CURRENT set with the
 * savable overrides merged over it (PUT semantics — every column travels).
 * Returns null when no override is savable, so the caller can say so.
 */
export const savableBody = (currentSet, overrides = {}, dutyClass = '') => {
  const clean = cleanOverrides(overrides)
  const body = {
    duty_percent_a: currentSet?.duty_percent_a ?? null,
    duty_percent_b: currentSet?.duty_percent_b ?? null,
    duty_percent_c: currentSet?.duty_percent_c ?? null,
    clearance_percent: currentSet?.clearance_percent ?? null,
    trade_markup_percent: currentSet?.trade_markup_percent ?? null,
    fx_margin_percent: currentSet?.fx_margin_percent ?? null,
    handling: currentSet?.handling ?? null,
    // Not on the rail (the surcharge is no waterfall input), but a column of
    // the same set: omitted from a PUT, it would be cleared by every Save here.
    surcharge_min_qty: currentSet?.surcharge_min_qty ?? null,
    surcharge_per_unit: currentSet?.surcharge_per_unit ?? null,
    // The same for the retail markup and how clearance is read (Sept 2026).
    retail_markup_percent: currentSet?.retail_markup_percent ?? null,
    clearance_basis: currentSet?.clearance_basis ?? null,
    note: currentSet?.note ?? null,
  }
  let touched = 0
  for (const row of RAIL_ROWS) {
    const column = savableColumn(row, dutyClass)
    if (!column || column === 'fx' || !Object.hasOwn(clean, row.key)) continue
    body[column] = clean[row.key]
    touched += 1
  }
  return touched === 0 ? null : body
}

/** The FX body when the rail's FX rate was edited, else null. */
export const fxBodyFrom = (overrides = {}) => {
  const clean = cleanOverrides(overrides)
  if (!Object.hasOwn(clean, 'fx_rate') || clean.fx_rate <= 0) return null
  return { rate: clean.fx_rate }
}

/** Which rail rows the current overrides touch that cannot be saved here — the note names their screens. */
export const unsavableTouched = (overrides = {}, dutyClass = '') => {
  const clean = cleanOverrides(overrides)
  return RAIL_ROWS.filter((row) => Object.hasOwn(clean, row.key) && !savableColumn(row, dutyClass))
}

/** Houses for the picker: unarchived, by name. */
export const pickableHouses = (brands = []) =>
  brands
    .filter((b) => !b.archived_at)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))

/** The house the screen opens on: the default slug when present, else the first. */
export const defaultHouseId = (houses = []) =>
  (houses.find((h) => h.slug === DEFAULT_HOUSE_SLUG) ?? houses[0])?.id ?? ''
