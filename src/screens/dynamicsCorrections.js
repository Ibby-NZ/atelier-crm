// The rules behind the Dynamics correction panel, kept out of the .jsx so they
// can be tested. This repo has no jsdom, so a component cannot be rendered —
// the house pattern is a plain .js beside the screen (see adminShowrooms.js).
//
// atelier-api has been able to CORRECT a staged Dynamics record since
// `d365_overrides` landed; nothing in this CRM ever sent one, and every Dynamics
// screen still said "read-only by design". This module is the missing half.
//
// The correction is stored BESIDE the staging row, never on it: the D365 import
// re-runs until cutover and upserts every mapped column to EXCLUDED, so anything
// written onto a `legacy_*` row vanishes at the next import with no error. That
// is why a PATCH here speaks four verbs rather than sending a row back:
//
//   set           { col: value }  override a column. `null` is a deliberate
//                                 override TO EMPTY — it is NOT a revert.
//   revert        ['col']         drop the correction and return the column to
//                                 whatever Dynamics currently says. The ONLY
//                                 way back; an empty string is not the same.
//   custom        { key: value }  a field Dynamics has no column for.
//   revert_custom ['key']         remove one.
//
// Two things a reasonable implementer gets wrong, both of which this module
// exists to make unconstructable:
//
//   - `diffFields` cannot express a revert. Its baseline is the MERGED value
//     (the override already applied), and its only null is a CLEAR — so
//     "clear to empty" and "return to Dynamics" collapse into one output. Worse,
//     reverting a correction whose value happens to EQUAL Dynamics' produces an
//     empty diff, which the house "nothing to save" guard would then swallow.
//     Revert is therefore separate state, and the emptiness test spans all four
//     verbs.
//   - A column named in both `set` and `revert` is a 422, not a precedence rule.
//     A reverted field's draft value is dropped BEFORE diffing, so the pair
//     cannot be built.
//
// Mirrors atelier-api's src/legacy/read-entities.js (the per-entity column list
// and its `commercial` set) and src/legacy/override-schema.js (the custom-field
// rules). A key declared here and missing there is a 422; a `commercial` flag
// missing here is a 403.

import { diffFields, draftFrom } from '../admin/drafts.js'

export const LEGACY_PATH = '/admin/legacy'

// From src/legacy/override-schema.js. Repeated client-side so a bad custom field
// is an inline sentence rather than a round trip and a 422.
export const CUSTOM_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/
export const MAX_CUSTOM_FIELDS = 50
export const MAX_CUSTOM_VALUE_LENGTH = 2000

// --- what each entity may correct ----------------------------------------
//
// THE KEYS ARE THE READ VOCABULARY AND ARE NOT THE IMPORT VOCABULARY.
// `/admin/legacy/:entity` takes accounts | sales-orders | stock | prices; the
// import route takes accounts | sales_orders | stock_items | product_prices,
// and BOTH spellings are live in the very files this panel is mounted in
// (PriceLists.jsx passes entity="product_prices" to LegacyImportPanel). A copied
// string would build a URL matching no read config, apply nothing, and raise
// nothing — so every lookup here THROWS on a name it does not know.
//
// `kind` is derived one-for-one from the column's declared cast type in
// LEGACY_TABLES (which is what override-schema.js validates against):
//     text -> 'text'   numeric -> 'numeric'   boolean -> 'tribool'
//     timestamp -> 'naive'
// `currency` is 'text', not 'upper' — the staging column carries no CHECK and
// the export's spelling is not guaranteed to be a three-letter code.
//
// `commercial: true` marks a column the API additionally gates on
// `can_view_finance` and answers 403 without.

const ACCOUNT_FIELDS = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'atelier_account_number', label: 'Account number', kind: 'text' },
  { key: 'customer_type', label: 'Customer type', kind: 'text' },
  { key: 'is_customer', label: 'Is a customer', kind: 'tribool' },
  { key: 'is_supplier', label: 'Is a supplier', kind: 'tribool' },
  { key: 'primary_contact', label: 'Primary contact', kind: 'text' },
  { key: 'primary_contact_email', label: 'Contact email', kind: 'text' },
  { key: 'email', label: 'Account email', kind: 'text' },
  { key: 'main_phone', label: 'Main phone', kind: 'text' },
  { key: 'other_phone', label: 'Other phone', kind: 'text' },
  { key: 'address1_city', label: 'City', kind: 'text' },
  { key: 'province', label: 'Region', kind: 'text' },
  { key: 'territory', label: 'Territory', kind: 'text' },
  { key: 'currency', label: 'Currency', kind: 'text' },
  { key: 'discount', label: 'Discount', kind: 'numeric', commercial: true },
  { key: 'credit_limit', label: 'Credit limit', kind: 'numeric', commercial: true },
  // TEXT, not numeric — do not guess from the name.
  { key: 'payment_terms', label: 'Payment terms', kind: 'text', commercial: true },
  { key: 'owner', label: 'Owner', kind: 'text' },
  // `status` and `status_reason` are two columns; the read-only screens label
  // status_reason "Status" and never draw `status` at all.
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'status_reason', label: 'Status reason', kind: 'text' },
  { key: 'xero_contact_id', label: 'Xero contact id', kind: 'text' },
]

const SALES_ORDER_FIELDS = [
  { key: 'number', label: 'Order number', kind: 'text' },
  { key: 'customer', label: 'Customer', kind: 'text' },
  { key: 'contact', label: 'Contact', kind: 'text' },
  { key: 'reference', label: 'Reference', kind: 'text' },
  { key: 'order_date', label: 'Order date', kind: 'naive' },
  { key: 'expected_delivery_date', label: 'Expected delivery', kind: 'naive' },
  { key: 'total_ex_gst', label: 'Total ex GST', kind: 'numeric', commercial: true },
  { key: 'gst', label: 'GST', kind: 'numeric', commercial: true },
  { key: 'total_incl_gst', label: 'Total incl GST', kind: 'numeric', commercial: true },
  { key: 'currency', label: 'Currency', kind: 'text' },
  { key: 'pricing_type', label: 'Pricing type', kind: 'text', commercial: true },
  {
    key: 'sales_order_discount_pct',
    label: 'Order discount %',
    kind: 'numeric',
    commercial: true,
  },
  { key: 'deliver_to', label: 'Deliver to', kind: 'text' },
  { key: 'owner', label: 'Owner', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'status_reason', label: 'Status reason', kind: 'text' },
]

const STOCK_FIELDS = [
  { key: 'item_code', label: 'Item code', kind: 'text' },
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'supplier', label: 'Supplier', kind: 'text' },
  { key: 'range_name', label: 'Range', kind: 'text' },
  { key: 'item_type', label: 'Item type', kind: 'text' },
  { key: 'item_measure', label: 'Measure', kind: 'text' },
  { key: 'stock_on_hand', label: 'Stock on hand', kind: 'numeric' },
  { key: 'stock_available', label: 'Stock available', kind: 'numeric' },
  { key: 'reserve_note', label: 'Reserve note', kind: 'text' },
  { key: 'retail_price', label: 'Retail price', kind: 'numeric', commercial: true },
  { key: 'trade_price', label: 'Trade price', kind: 'numeric', commercial: true },
  { key: 'currency', label: 'Currency', kind: 'text' },
  { key: 'product_price_list', label: 'Price list', kind: 'text', commercial: true },
  { key: 'can_sell', label: 'Can sell', kind: 'tribool' },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'status_reason', label: 'Status reason', kind: 'text' },
]

const PRICE_FIELDS = [
  { key: 'code', label: 'Code', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'range_name', label: 'Range', kind: 'text' },
  { key: 'item_type', label: 'Item type', kind: 'text' },
  { key: 'pack_type', label: 'Pack type', kind: 'text' },
  // TEXT in the staging table ("137cm", "V x 70H"), not a number.
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'currency', label: 'Currency', kind: 'text' },
  { key: 'wholesale_rate', label: 'Wholesale rate', kind: 'numeric', commercial: true },
  { key: 'landed_cost_nz', label: 'Landed cost NZ', kind: 'numeric', commercial: true },
  {
    key: 'retail_sell_price_nz',
    label: 'Retail sell NZ',
    kind: 'numeric',
    commercial: true,
  },
  {
    key: 'trade_sell_price_nz',
    label: 'Trade sell NZ',
    kind: 'numeric',
    commercial: true,
  },
  {
    key: 'trade_sell_price_under_5m_nz',
    label: 'Trade sell under 5m NZ',
    kind: 'numeric',
    commercial: true,
  },
  {
    key: 'set_prices_manually',
    label: 'Prices set manually',
    kind: 'tribool',
    commercial: true,
  },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'status_reason', label: 'Status reason', kind: 'text' },
]

const FIELDS_BY_ENTITY = Object.freeze({
  accounts: Object.freeze(ACCOUNT_FIELDS.map((f) => Object.freeze(f))),
  'sales-orders': Object.freeze(SALES_ORDER_FIELDS.map((f) => Object.freeze(f))),
  stock: Object.freeze(STOCK_FIELDS.map((f) => Object.freeze(f))),
  prices: Object.freeze(PRICE_FIELDS.map((f) => Object.freeze(f))),
})

export const LEGACY_ENTITIES = Object.freeze(Object.keys(FIELDS_BY_ENTITY))

function entityFields(entity) {
  if (!Object.hasOwn(FIELDS_BY_ENTITY, entity)) {
    throw new Error(
      `Unknown Dynamics entity "${entity}" — expected one of ${LEGACY_ENTITIES.join(', ')}.`
    )
  }
  return FIELDS_BY_ENTITY[entity]
}

// --- paths ----------------------------------------------------------------

/** `/admin/legacy/accounts/<guid>`. Throws on the import spelling. */
export function recordPath(entity, guid) {
  entityFields(entity)
  return `${LEGACY_PATH}/${entity}/${encodeURIComponent(guid ?? '')}`
}

/** `/admin/legacy/accounts/<guid>/restore` — un-suppresses a hidden record. */
export function restorePath(entity, guid) {
  return `${recordPath(entity, guid)}/restore`
}

// --- what the panel draws -------------------------------------------------

/**
 * Every field the panel draws, in declaration order, each carrying `locked`.
 *
 * A commercial column for a viewer without `can_view_finance` is LOCKED, not
 * removed: the value is already on the screen above (ClientAccount renders the
 * credit limit), so hiding it here would read as a regression while proving
 * nothing. Locking means the panel never offers an edit whose answer is a
 * guaranteed 403 — and reverting a commercial column is finance-gated at the API
 * too, so the Revert button goes with the input.
 *
 * @param {string} entity  READ vocabulary. Unknown -> throws.
 * @param {{finance?: boolean}} access  pass useAccess().finance
 */
export function panelFields(entity, { finance = false } = {}) {
  return Object.freeze(
    entityFields(entity).map((field) =>
      Object.freeze({
        ...field,
        commercial: Boolean(field.commercial),
        locked: Boolean(field.commercial) && !finance,
      })
    )
  )
}

/**
 * The tri-state a Dynamics column is in, from SERVER truth only —
 * `overridden_fields` (list and detail reads) and `override.stale_fields`
 * (detail read only, the corrections Dynamics has since moved underneath).
 *
 * "Being edited" is deliberately not here: it is draft !== baseDraft, which the
 * panel already holds and which is not a decision worth a module round trip.
 *
 * @returns {'upstream'|'corrected'|'stale'}
 */
export function fieldState(record, key) {
  const stale = record?.override?.stale_fields
  if (Array.isArray(stale) && stale.includes(key)) return 'stale'
  const overridden = record?.overridden_fields
  return Array.isArray(overridden) && overridden.includes(key) ? 'corrected' : 'upstream'
}

/**
 * The custom fields as an editable list, sorted by key. Values are stringified
 * for the input; the record keeps whatever type it had until somebody edits it,
 * which is what the string comparison in `correctionBody` protects.
 *
 * @returns {Array<{key: string, value: string}>}
 */
export function customDraftFrom(record) {
  const fields = record?.custom_fields
  if (!fields || typeof fields !== 'object') return []
  return Object.keys(fields)
    .sort()
    .map((key) => ({ key, value: fields[key] == null ? '' : String(fields[key]) }))
}

// --- the body -------------------------------------------------------------

const customText = (value) => (value == null ? '' : String(value))

/**
 * Build the PATCH body in the API's four verbs, sending ONLY what changed.
 *
 * @param {object} record   the merged record the drafts came from
 * @param {ReadonlyArray} fields   panelFields() output — carries `locked`
 * @param {{draft?: object, revert?: string[], custom?: Array<{key: string, value: string}>}} edits
 * @returns {{body: object}|{error: string}|{empty: true}}
 */
export function correctionBody(record = {}, fields = [], edits = {}) {
  const { draft = {}, revert = [], custom = [] } = edits

  // Locked (commercial, no finance) columns are excluded from BOTH verbs.
  const writable = fields.filter((field) => !field.locked)
  const reverting = writable
    .filter((field) => revert.includes(field.key))
    .map((field) => field.key)

  // Drop a reverted field before diffing, or its stale input would be sent as a
  // `set` alongside its own `revert` — which the API refuses with a 422.
  const setFields = writable.filter((field) => !reverting.includes(field.key))

  // A field is only diffed if its input DIFFERS FROM THE FORMATTED BASELINE —
  // `draftFrom` is what seeded the inputs, so an untouched one is identical to
  // it, string for string. Parsing every field instead lets the parsers rewrite
  // values nobody touched: `blankToNull` trims, so a merged value carrying
  // surrounding whitespace (or an '' where the column reads as null) comes back
  // altered and lands in `set` the first time somebody saves an edit to an
  // entirely different field. An override survives every `npm run import:legacy`
  // and masks the upstream value indefinitely, so an accidental one is expensive
  // and invisible. Clearing a populated field still differs from its baseline,
  // so a deliberate `set: { col: null }` is unaffected.
  const baseline = draftFrom(record, setFields)
  const touched = setFields.filter((field) => draft[field.key] !== baseline[field.key])
  const diff = diffFields(record, draft, touched)
  if (diff.error) return { error: diff.error }

  const declared = new Set(fields.map((field) => field.key))
  const existing = (record && record.custom_fields) || {}

  if (custom.length > MAX_CUSTOM_FIELDS) {
    return { error: `A record may carry at most ${MAX_CUSTOM_FIELDS} custom fields.` }
  }

  const customPatch = {}
  const seen = new Set()
  for (const row of custom) {
    const key = (row?.key ?? '').trim()
    if (!CUSTOM_KEY_PATTERN.test(key)) {
      return {
        error: `"${key}" is not a valid custom field name — lower-case letters, digits and underscores, starting with a letter, up to 40 characters.`,
      }
    }
    // Shadowing is refused whatever this viewer may EDIT, so the check runs over
    // every declared column including the locked ones: two values under one name
    // cannot be told apart by anyone reading the record.
    if (key === 'guid' || declared.has(key)) {
      return { error: `"${key}" is already a Dynamics column — correct it instead of adding a custom field.` }
    }
    if (seen.has(key)) {
      return { error: `"${key}" is listed twice — a custom field can only be given one value.` }
    }
    seen.add(key)

    const text = (row?.value ?? '').trim() === '' ? null : String(row.value)
    if (text != null && text.length > MAX_CUSTOM_VALUE_LENGTH) {
      return { error: `"${key}" is longer than ${MAX_CUSTOM_VALUE_LENGTH} characters.` }
    }
    // Compared as STRINGS: a number-valued custom field would otherwise be
    // re-sent as a string on every unrelated save.
    if (!Object.hasOwn(existing, key) || customText(text) !== customText(existing[key])) {
      customPatch[key] = text
    }
  }

  const revertCustom = Object.keys(existing).filter((key) => !seen.has(key))

  const body = {}
  if (Object.keys(diff.patch).length > 0) body.set = diff.patch
  if (reverting.length > 0) body.revert = reverting
  if (Object.keys(customPatch).length > 0) body.custom = customPatch
  if (revertCustom.length > 0) body.revert_custom = revertCustom

  // The API 400s an empty PATCH, and the emptiness test has to span all four:
  // a lone revert is a real request whose diff is legitimately empty.
  return Object.keys(body).length === 0 ? { empty: true } : { body }
}
