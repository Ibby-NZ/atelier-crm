// The Pricing screen's rules — the platform's OWN waterfall, on parameters the
// office sets per supplier and per house (atelier-api /admin/pricing/*).
//
// The screen shows one house at one wholesale rate: every step of the
// waterfall, the input that drove it and WHERE that input came from (this
// house, the supplier's default, the supplier's terms, the freight ledger, the
// exchange-rate table, or nowhere yet). Beside it, the two parameter sets are
// editable — a PUT of the whole set, so a blank field CLEARS (the API's rule:
// a patch would let a stale duty band survive beside a fresh clearance).
//
// Dynamics is a reference here, never the source: the value the client's export
// carries for the same range is shown under each field as a hint, joined by
// house name exactly as Price Lists joins it.
//
// Pure — no jsdom in this repo, so every decision a cell makes lives here and
// is tested from ./pricingWaterfall.test.js.

import { DASH, pctText } from './priceLists.js'

export const WATERFALL_PATH = '/admin/pricing/waterfall'
export const FX_PATH = '/admin/pricing/fx-rates'
export const BRANDS_PATH = '/admin/brands'
export const supplierParametersPath = (id) => `/admin/pricing/parameters/suppliers/${id}`
export const brandParametersPath = (id) => `/admin/pricing/parameters/brands/${id}`
export const fxRatePath = (currency) => `${FX_PATH}/${currency}`

export const DEFAULT_WHOLESALE = '100'
export const DUTY_CLASSES = Object.freeze(['', 'A', 'B', 'C'])
export const CATEGORIES = Object.freeze(['', 'fabric', 'wallpaper', 'trimming', 'accessory'])

/** The seven editable parameters, in the order the office reads a waterfall. `d365` names the export's column. */
export const PARAMETER_FIELDS = Object.freeze([
  Object.freeze({ key: 'duty_percent_a', label: 'Duty A', unit: '%', d365: 'duty_rate_a' }),
  Object.freeze({ key: 'duty_percent_b', label: 'Duty B', unit: '%', d365: 'duty_rate_b' }),
  Object.freeze({ key: 'duty_percent_c', label: 'Duty C', unit: '%', d365: 'duty_rate_c' }),
  Object.freeze({ key: 'clearance_percent', label: 'Clearance', unit: '%', d365: 'clearance_percent' }),
  Object.freeze({ key: 'trade_markup_percent', label: 'Trade markup', unit: '%', d365: 'trade_markup_percent' }),
  Object.freeze({ key: 'fx_margin_percent', label: 'FX margin', unit: '%', d365: null }),
  Object.freeze({ key: 'handling', label: 'Handling', unit: '$ / unit', d365: null }),
])

/** Where an input came from, as the screen says it. */
export const SOURCE_LABELS = Object.freeze({
  house: 'this house',
  supplier: 'supplier default',
  terms: 'supplier terms',
  'freight-ledger': 'freight ledger',
  fx: 'exchange rate',
  none: 'no duty class',
  missing: 'not set',
})

/** Which resolved input drives each waterfall step. `wholesale` is the figure typed in. */
export const STEP_INPUT = Object.freeze({
  export_price: 'discount_percent',
  price_ex_duty: 'fx_rate',
  price_incl_duty: 'duty_percent',
  freight_amount: 'freight',
  landed_ex_handling: 'clearance_percent',
  landed: 'handling',
  trade_sell: 'trade_markup_percent',
  retail_sell: 'retail_markup',
})

const nzdFormat = new Intl.NumberFormat('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** NZ dollars, or a dash for a step the waterfall could not reach. */
export const nzd = (amount) => (amount == null ? DASH : `$${nzdFormat.format(Number(amount))}`)

/** The query for one preview. Empty duty class and category are left off. */
export const waterfallPath = ({ brandId, wholesaleRate, dutyClass = '', category = '' }) => {
  const params = new URLSearchParams({ brand_id: String(brandId), wholesale_rate: String(wholesaleRate) })
  if (dutyClass) params.set('duty_class', dutyClass)
  if (category) params.set('category', category)
  return `${WATERFALL_PATH}?${params.toString()}`
}

/** A typed wholesale rate as a number, or null when it is not one the API would take. */
export const parseWholesale = (value) => {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) && n >= 0 && String(value ?? '').trim() !== '' ? n : null
}

/**
 * What the input cell under a step says: the value in its own unit, then its
 * source. A missing input names itself so the reader knows which field to fill.
 */
export const inputText = (key, input, currency = null) => {
  if (!input) return DASH
  const source = SOURCE_LABELS[input.source] ?? input.source
  if (input.value == null) return `${source}`
  switch (key) {
    case 'fx_rate':
      return `${input.value} ${currency ?? ''} per NZ$1 · ${source}`.replace('  ', ' ')
    case 'freight': {
      const detail = input.detail ?? {}
      const figure = detail.basis === 'percent' ? pctText(input.value) : `$${Number(input.value).toFixed(2)}${detail.unit ? ` / ${detail.unit}` : ''}`
      return `${figure} · ${source}`
    }
    case 'handling':
      return `$${Number(input.value).toFixed(2)} · ${source}`
    case 'retail_markup':
      return `×${input.value} · ${source}`
    case 'discount_percent': {
      const shape = input.detail?.shape
      const how = shape === 'chain' ? ' (compounded chain)' : shape === 'tier' && input.detail?.label ? ` (tier: ${input.detail.label})` : ''
      return `${pctText(input.value)}${how} · ${source}`
    }
    default:
      return `${pctText(input.value)} · ${source}`
  }
}

/** The form draft for one parameter set (strings, blank for null). */
export const draftFromParameters = (row) => ({
  ...Object.fromEntries(PARAMETER_FIELDS.map((f) => [f.key, row?.[f.key] == null ? '' : String(row[f.key])])),
  note: row?.note ?? '',
})

export const EMPTY_DRAFT = Object.freeze(draftFromParameters(null))

/**
 * The PUT body from a draft: blank clears (null), anything else must be a
 * non-negative number. Returns { ok, body } or { ok: false, error }.
 */
export const buildParametersBody = (draft) => {
  const body = {}
  for (const field of PARAMETER_FIELDS) {
    const raw = String(draft?.[field.key] ?? '').trim()
    if (raw === '') {
      body[field.key] = null
      continue
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number.` }
    if (n < 0) return { ok: false, error: `${field.label} cannot be negative.` }
    body[field.key] = n
  }
  const note = String(draft?.note ?? '').trim()
  body.note = note === '' ? null : note
  return { ok: true, body }
}

/** True when every field of the draft is blank — nothing to save, and the row can be cleared instead. */
export const draftIsBlank = (draft) =>
  PARAMETER_FIELDS.every((f) => String(draft?.[f.key] ?? '').trim() === '') && String(draft?.note ?? '').trim() === ''

/** The FX body: a positive rate, an optional day. */
export const buildFxBody = ({ rate, set_on }) => {
  const n = Number(String(rate ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'The exchange rate must be above zero.' }
  const day = String(set_on ?? '').trim()
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'Set on must be a date (YYYY-MM-DD).' }
  return { ok: true, body: { rate: n, ...(day ? { set_on: day } : {}) } }
}

/** "Dynamics: 5%" under a field, or null when the export carries nothing for it. */
export const d365Hint = (parameter, field) => {
  if (!parameter || !field.d365) return null
  const value = parameter[field.d365]
  if (value == null) return null
  return field.unit === '%' ? `Dynamics: ${pctText(value)}` : `Dynamics: ${value}`
}

/** Houses for the picker: unarchived, by name. */
export const pickableHouses = (brands = []) =>
  brands
    .filter((b) => !b.archived_at)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
