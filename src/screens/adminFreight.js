// Pure logic for AdminFreight (Price lists → Freight), the screen over
// atelier-api's /admin/freight/rates* routes.
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Everything
// that is a decision rather than a layout lives here and is tested directly —
// the same split adminProductSheet.js and adminSuppliers.js make.
//
// The table behind this screen is unlike every other admin list, and the rules
// below all follow from that:
//
//   · **The ledger is APPEND-ONLY (FR-192).** There is no PATCH and no DELETE
//     route to call — an edit is a NEW row with a later `effective_from`, and
//     the resolver picks the newest rate at or before the date it is asked
//     about. So this screen has no Edit, no Archive and no Delete affordance,
//     and the copy says so rather than leaving the office to hunt for one.
//   · **Scope is a supplier OR a range, exactly one** — the schema's own
//     `(supplier_id IS NULL) <> (range_name IS NULL)` CHECK. The form makes the
//     choice structural (a scope picker shows one control at a time), and
//     `rateBody` sends exactly one key: the POST schema has no nullable scope
//     types, so sending the other as null would 400 rather than read as unset.
//   · **Dollars are the default and the recommendation (FR-186, C19).** Freight
//     is a dollar amount per unit and never was a percentage; `percent` exists
//     because clearance and duty legitimately are, so it is offered second and
//     nothing here computes one unless a row says so.
//   · **A dollar rate states its unit; a percent rate must not (FR-187).** The
//     unit is the range's own pack type — a per-roll figure applied to a metre
//     overcharges by roughly the roll length (Rebecca's wallpaper point). The
//     mirror errors before the round trip; a unit left in the draft after the
//     basis flipped to percent is DROPPED silently, because the form hid the
//     field and the leftover is the form's fault, not the operator's.
//   · **A same-day duplicate is a 409, and its message is the API's.** The
//     unique index keys on scope + category + day, so the correction is a new
//     date, not a retype — the 409 sentence says exactly that and the screen
//     shows it verbatim through messageOf.
//
// The CSV round trip restates the product sheet's contract (validate is its own
// route, apply re-posts the FILE, one transaction, row numbers on every
// failure) with one difference: this sheet only ever APPENDS. A row that says
// the same thing as the ledger is `unchanged`; one that contradicts it is an
// ERROR telling the office to date the correction — never an overwrite.

import { SUPPLIERS_PATH } from './adminSuppliers.js'

/** The ledger. GET lists it (paged, newest first); POST appends one rate. */
export const RATES_PATH = '/admin/freight/rates'

/** The CSV round trip. Validate is a dry run and its own route — see above. */
export const EXPORT_PATH = '/admin/freight/rates/export.csv'
export const VALIDATE_PATH = '/admin/freight/rates/validate'
export const APPLY_PATH = '/admin/freight/rates/apply'

/**
 * The CRM's own addresses: the ledger, and the page one rate is appended on.
 * The append form dropped down above the ledger until the client asked for
 * every data-entry form on a page of its own (23 Sep 2026). There is no page
 * per RATE: the ledger has no by-id read and nothing on a rate is editable, so
 * the append lands back on the ledger, where the new row shows under its scope.
 */
export const FREIGHT_ROUTE = '/admin/freight'
export const NEW_FREIGHT_RATE_ROUTE = `${FREIGHT_ROUTE}/new`

export { SUPPLIERS_PATH }

/** Live houses for the house picker. The API caps nothing here: a house list is short. */
export const HOUSES_PATH = '/admin/brands'

/**
 * The house picker: live houses by name, alphabetical. A house rate is keyed
 * on the house's NAME (the API refuses one no house carries), so the name is
 * the value.
 *
 * @param {ReadonlyArray<{name: string, archived_at?: string|null}>} brands
 * @returns {ReadonlyArray<string>}
 */
export function houseOptions(brands = []) {
  return [...new Set((brands ?? []).filter((brand) => !brand.archived_at).map((brand) => brand.name))].sort(
    (a, b) => a.localeCompare(b)
  )
}

/**
 * The API's MAX_LIMIT for /admin/freight/rates. Charlotte keys one rate per
 * scope per year, so one fetch at this cap holds the whole ledger for years —
 * which is what lets the list GROUP by scope instead of paging, and
 * `overflowNote` is what stops the cap ever reading as "that was all of them".
 */
export const RATE_LEDGER_LIMIT = 500

/**
 * The API's MAX_LIMIT for /admin/suppliers — well above any plausible house
 * count (~40 today), so the picker holds every supplier in one fetch.
 */
export const SUPPLIER_PICKER_LIMIT = 200

/** Mirrors FREIGHT_BASES — dollar FIRST, because it is the default (C19). */
export const BASES = Object.freeze(['dollar', 'percent'])

/**
 * The SEEDED vocabulary, and a fallback only. `supplier_freight_rates.category`
 * references `product_categories` in the API — a table the office maintains on
 * the Categories screen — so the live list is what `useCategories` fetches and
 * the screen hands to `rateBody`. This is what that check falls back to when a
 * caller passes nothing (every unit test here does).
 *
 * IMPORTED and then exported, never `export … from`: a bare re-export does not
 * bind the name in THIS module's scope, and `rateBody` below validates against
 * it — which is a ReferenceError at the first save, not a build error.
 */
import { CATEGORY_VALUES } from '../lib/categories.js'

export { CATEGORY_VALUES }

/** Mirrors FREIGHT_UNITS — the pack the dollar figure is PER. */
export const UNITS = Object.freeze(['metre', 'yard', 'roll', 'piece', 'hide', 'panel'])

/** The two scopes the CHECK allows. Exactly one is ever sent. */
export const SCOPE = Object.freeze({ supplier: 'supplier', range: 'range' })

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The fallback for the ledger's explanatory copy. The GET's `meta.note` is the
 * API's own sentence and wins when present — one author for the rule, so the
 * screen cannot drift from what the routes actually do.
 */
export const APPEND_NOTE =
  'Append-only: a new rate never overwrites the old one. Correct a rate by dating a new one.'

/**
 * The screen's copy over the note the API sent, when it sent one.
 *
 * @param {{ note?: string }|null} [meta]  the GET /admin/freight/rates meta
 * @returns {string}
 */
export function ledgerNote(meta) {
  const note = meta?.note
  return typeof note === 'string' && note.trim() !== '' ? note : APPEND_NOTE
}

/**
 * A fresh Add-rate draft. Scope opens on supplier (the picker), basis on
 * DOLLAR — C19's exact ask — and the unit deliberately BLANK: which pack a
 * dollar is per is Rebecca's per-roll vs per-metre point, so it is a choice the
 * office makes, never a default it inherits.
 *
 * @returns {object}
 */
export function newRateDraft() {
  return {
    // Freight is set per house (Sept 2026), so that is where the form starts.
    scope: SCOPE.range,
    supplier_id: '',
    range_name: '',
    category: '',
    basis: 'dollar',
    rate: '',
    unit: '',
    effective_from: '',
    note: '',
  }
}

/** Whether the unit field is live — required exactly when the basis is dollar. */
export const unitRequired = (basis) => basis !== 'percent'

/**
 * The POST body for one rate, or the first problem with the draft.
 *
 * Mirrors the API's validateFreightRate so the common mistakes are named before
 * the round trip — but only pre-empts, never replaces: anything that slips
 * through still lands as the API's own 400/409/422 sentence in the error line.
 *
 * Three omissions are load-bearing (the POST schema has no nullable types, so
 * an explicit null 400s rather than reading as unset):
 *   - only ONE scope key is ever present (the CHECK's "exactly one"),
 *   - `category` is absent for "every category",
 *   - `unit` is absent for a percent rate, even when the draft still holds one
 *     from before the basis flipped.
 *
 * @param {object} [draft]  from newRateDraft, as the form edited it
 * @param {readonly string[]} [vocabulary]  the categories the API currently
 *   holds; defaults to the seeded nine for a caller with nothing fetched
 * @returns {{ body: object }|{ error: string }}
 */
export function rateBody(draft = {}, vocabulary = CATEGORY_VALUES) {
  const body = {}

  if (draft.scope === SCOPE.range) {
    const range = (draft.range_name ?? '').trim()
    if (range === '') return { error: 'Choose the house this rate is quoted for.' }
    if (range.length > 200) return { error: 'House must be 200 characters or fewer.' }
    body.range_name = range
  } else {
    const id = Number(String(draft.supplier_id ?? '').trim())
    if (!Number.isInteger(id) || id <= 0) {
      return { error: 'Choose the supplier this rate is quoted for.' }
    }
    body.supplier_id = id
  }

  const category = (draft.category ?? '').trim()
  if (category !== '') {
    if (!vocabulary.includes(category)) {
      return { error: `"${category}" is not a category. Leave it blank for every category.` }
    }
    body.category = category
  }

  const basis = draft.basis === 'percent' ? 'percent' : 'dollar'
  body.basis = basis

  const rateText = String(draft.rate ?? '').trim()
  const rate = Number(rateText)
  if (rateText === '' || !Number.isFinite(rate) || rate < 0) {
    return { error: 'Rate must be a number of zero or more.' }
  }
  body.rate = rate

  if (basis === 'dollar') {
    const unit = (draft.unit ?? '').trim()
    if (!UNITS.includes(unit)) {
      return {
        error: `A dollar rate must state its unit — one of ${UNITS.join(', ')}. A per-roll figure applied to a metre overcharges by the roll length.`,
      }
    }
    body.unit = unit
  }

  const day = (draft.effective_from ?? '').trim()
  if (!ISO_DAY.test(day)) return { error: 'Effective from must be a date, e.g. 2026-07-01.' }
  body.effective_from = day

  const note = (draft.note ?? '').trim()
  if (note !== '') {
    if (note.length > 500) return { error: 'Note must be 500 characters or fewer.' }
    body.note = note
  }

  return { body }
}

/**
 * Read the GET /admin/freight/rates envelope. NOT the kit's readList: that
 * narrows to { rows, total } and drops `meta` — and here `meta.note` is the
 * API's own statement of the append-only rule, which the screen renders as its
 * explanatory copy rather than paraphrasing it.
 *
 * @param {object|null} body
 * @returns {{ rates: object[], total: number, meta: object|null }}
 */
export function readLedger(body) {
  const rates = Array.isArray(body?.rates) ? body.rates : []
  const total = Number(body?.meta?.total)
  return {
    rates,
    total: Number.isFinite(total) ? total : rates.length,
    meta: body?.meta ?? null,
  }
}

/**
 * The ledger's filter params. Empties are dropped by buildListQuery, which
 * matters here: `category=` would fail the API's enum and kill the whole list.
 * `range_name` is an EXACT (case-insensitive) match on the API side — it is the
 * incumbent's key, a spelling — so the filter box says so rather than promising
 * a search it cannot do.
 *
 * @param {{ supplierId?: string, rangeName?: string, category?: string }} state
 * @returns {object}
 */
export function rateListFilters({ supplierId = '', rangeName = '', category = '' } = {}) {
  return { supplier_id: supplierId, range_name: rangeName, category }
}

/**
 * The supplier picker's options, in the API's order (alpha). A row without an
 * integer id cannot be posted, so it is dropped rather than rendered as an
 * option that 400s.
 *
 * @param {ReadonlyArray<{ id?: number, name?: string }>} [suppliers]
 * @returns {Array<{ id: number, name: string }>}
 */
export function supplierOptions(suppliers = []) {
  return suppliers
    .filter((supplier) => Number.isInteger(supplier?.id) && supplier.id > 0)
    .map((supplier) => ({
      id: supplier.id,
      name:
        typeof supplier.name === 'string' && supplier.name.trim() !== ''
          ? supplier.name
          : `Supplier #${supplier.id}`,
    }))
}

/**
 * A rate's scope, as the person reads it. The ledger row carries `supplier_id`
 * (an integer nobody recognises), so the list resolves it through the picker's
 * own roster; a supplier the roster does not hold (archived, or the list failed)
 * still renders as its number rather than as a blank.
 *
 * @param {{ supplier_id?: number|null, range_name?: string|null }} rate
 * @param {Map<number, string>} [supplierNames]
 * @returns {{ kind: 'supplier'|'range', key: string, label: string }}
 */
export function scopeOf(rate = {}, supplierNames) {
  if (rate.supplier_id != null) {
    return {
      kind: SCOPE.supplier,
      // The unique index folds range spellings to lower case; supplier ids need
      // no folding, but both keys carry their kind so a range named "12" can
      // never collide with supplier 12.
      key: `supplier:${rate.supplier_id}`,
      label: supplierNames?.get(rate.supplier_id) ?? `Supplier #${rate.supplier_id}`,
    }
  }
  const range = rate.range_name ?? ''
  return { kind: SCOPE.range, key: `range:${range.toLowerCase()}`, label: range }
}

/**
 * The ledger grouped by scope, in first-appearance order. The API lists newest
 * first, so the scope with the most recent entry tops the screen — which is the
 * one the office just touched. Rates inside a group keep the API's order
 * (newest first), because the newest dated rate is the one the resolver picks.
 *
 * @param {ReadonlyArray<object>} [rates]
 * @param {Map<number, string>} [supplierNames]
 * @returns {Array<{ key: string, kind: string, label: string, rates: object[] }>}
 */
export function groupRates(rates = [], supplierNames) {
  const groups = new Map()
  for (const rate of rates) {
    const scope = scopeOf(rate, supplierNames)
    const held = groups.get(scope.key)
    if (held) {
      held.rates.push(rate)
    } else {
      groups.set(scope.key, { ...scope, rates: [rate] })
    }
  }
  return [...groups.values()]
}

/**
 * The figure as the office quotes it: "$35 / roll" or "8%". pg hands numeric
 * back as a string ('35.0000'), so it is narrowed through Number first — but a
 * value Number cannot read is shown raw rather than as NaN.
 *
 * @param {{ basis?: string, rate?: number|string, unit?: string|null }} rate
 * @returns {string}
 */
export function rateFigure(rate = {}) {
  const figure = Number(rate.rate)
  const text = Number.isFinite(figure) ? String(figure) : String(rate.rate ?? '')
  if (rate.basis === 'percent') return `${text}%`
  return rate.unit ? `$${text} / ${rate.unit}` : `$${text}`
}

/** NULL means every category, and must never print as "null". */
export const categoryLabel = (category) => category ?? 'all'

/**
 * "Showing the newest 500 of 612 rates…" — or null while the cap holds, which
 * it will for years (see RATE_LEDGER_LIMIT). Without this line the cap would
 * read as "that was the whole ledger".
 *
 * @param {number} total
 * @param {number} shown
 * @returns {string|null}
 */
export function overflowNote(total, shown) {
  if (!Number.isFinite(total) || total <= shown) return null
  return `Showing the newest ${shown} of ${total} rates — filter by scope or category to narrow.`
}

// --- the CSV round trip ----------------------------------------------------

/** Stated, never forwarded from the file — the API registers a Buffer parser
 * for text/csv (and the two Excel aliases); text/plain belongs to the root
 * Fastify instance and would arrive parsed into a string. */
export const SHEET_CONTENT_TYPE = 'text/csv'

/** Mirrors SHEET_BODY_LIMIT on the freight routes — a rate ledger is a few
 * hundred rows a year, so 2 MB is not a sheet. */
export const MAX_SHEET_BYTES = 2 * 1024 * 1024

/** The API's own FREIGHT_RATE_SHEET_FILENAME — the fallback name, because
 * Content-Disposition is not CORS-safelisted and comes back null cross-origin. */
export const SHEET_FILENAME = 'atelier-freight-rates.csv'

/** Mirrors MAX_REPORTED_ERRORS / MAX_REPORTED_CHANGES — the caps behind cappedNote. */
export const MAX_REPORTED_ERRORS = 50
export const MAX_REPORTED_CHANGES = 200

/**
 * The name to save the export under: the API's own when the browser can see the
 * header, else the API's naming rule restated. Anything that is not a plain
 * filename is discarded rather than sanitised — a value with a path separator
 * in it is not a name this API wrote.
 *
 * @param {string|null} disposition  the raw Content-Disposition, or null
 * @returns {string}
 */
export function filenameFrom(disposition) {
  const match = typeof disposition === 'string' ? /filename="?([^";]+)"?/.exec(disposition) : null
  const named = match ? match[1].trim() : ''
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(named)) return named
  return SHEET_FILENAME
}

/**
 * Why this file cannot be uploaded, or null when it can be. Only the mistakes
 * the API answers less readably than it could — an unknown basis, a bad date or
 * a contradicted ledger row are all phrased well by the API per row, and are
 * deliberately NOT pre-checked here: this screen never reads the file's
 * contents, because a second opinion about what is in it is a second
 * implementation of the parser.
 *
 * @param {{ name?: string, size?: number }|null} [file]
 * @returns {string|null}
 */
export function fileProblem(file) {
  if (!file) return 'Choose the filled-in sheet first.'
  if (/\.xlsx?$/i.test(typeof file.name === 'string' ? file.name : '')) {
    return (
      'That is an Excel workbook, not the sheet. In Excel choose File → Save As and pick ' +
      '“CSV (Comma delimited)”, then upload that file.'
    )
  }
  const size = Number(file.size)
  if (Number.isFinite(size)) {
    if (size === 0) return 'That file is empty.'
    if (size > MAX_SHEET_BYTES) {
      return 'That file is larger than 2 MB. A rate ledger is a few hundred rows a year, so this is probably not one.'
    }
  }
  return null
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * The report's counts as one line. When there are no errors the file balances —
 * `rows === skipped + repeats + unchanged + created` — so every row read is
 * accounted for by one of these words. `created`, not `changed`: this sheet
 * only ever appends, and the vocabulary should not suggest an edit exists.
 *
 * @param {{ rows?: number, skipped?: number, repeats?: number,
 *           unchanged?: number, created?: number }|null} [summary]
 * @returns {string}
 */
export function summaryLine(summary) {
  if (!summary) return ''
  const count = (key) => (Number.isFinite(summary[key]) ? summary[key] : 0)
  const parts = [`${plural(count('rows'), 'row', 'rows')} read`]
  if (count('skipped') > 0) parts.push(`${count('skipped')} left blank`)
  if (count('repeats') > 0) parts.push(`${count('repeats')} repeated`)
  if (count('unchanged') > 0) parts.push(`${count('unchanged')} already on the ledger`)
  parts.push(
    count('created') === 0
      ? 'nothing to append'
      : `${plural(count('created'), 'rate', 'rates')} to append`
  )
  return parts.join(' · ')
}

/**
 * One pending append, as a person reads it. The API's change entry already
 * carries `scope` as a sentence fragment ("supplier 12" / "range HAMAM"), so
 * only the figure and the category need phrasing here.
 *
 * @param {{ row?: number, scope?: string, category?: string|null,
 *           basis?: string, rate?: number, unit?: string|null,
 *           effective_from?: string }} change
 * @returns {string}
 */
export function describeChange(change = {}) {
  const scope = typeof change.scope === 'string' && change.scope.trim() !== '' ? change.scope : '?'
  return (
    `Row ${change.row ?? '?'} · ${scope} — ${categoryLabel(change.category)} · ` +
    `${rateFigure(change)} from ${change.effective_from ?? '?'}`
  )
}

/**
 * A row-level refusal, or null when the failure is not one. Validate and apply
 * answer a broken sheet with the SAME 422 body — { message, errors: [{ row,
 * message }], error_count, summary } — so this is the only place that reads it
 * and one renderer serves both buttons. The 400 a file that is not a rate sheet
 * at all produces has nothing to say per row and falls back to the ordinary
 * error line.
 *
 * @param {{ status?: number, body?: object }|null} [error]  an ApiError
 * @returns {{ message: string, errors: Array<{ row: number, message: string }>,
 *            errorCount: number, summary: object|null }|null}
 */
export function refusalFrom(error) {
  if (!error || error.status !== 422) return null
  const body = error.body
  const errors = Array.isArray(body?.errors)
    ? body.errors.filter((entry) => entry && typeof entry.message === 'string')
    : []
  if (errors.length === 0) return null
  return Object.freeze({
    message:
      typeof body.message === 'string' && body.message.trim() !== ''
        ? body.message
        : 'That sheet could not be read. Nothing has been written.',
    errors,
    errorCount: Number.isFinite(body.error_count) ? body.error_count : errors.length,
    summary: body.summary ?? null,
  })
}

/**
 * "Showing the first 50 of 214 rows." — or null when nothing was left out. The
 * API caps `errors` at 50 and `changes` at 200 with the true counts beside
 * them; a silent cap would read as "that was all of them".
 *
 * @param {number} shown
 * @param {number} total
 * @param {string} noun  singular
 * @returns {string|null}
 */
export function cappedNote(shown, total, noun) {
  if (!Number.isFinite(total) || total <= shown) return null
  return `Showing the first ${shown} of ${plural(total, noun, `${noun}s`)}.`
}

/**
 * The three things the report panel can be showing: a clean dry run, a refusal,
 * or what an apply did. One of them decides whether the write is offered.
 */
export const REPORT = Object.freeze({ clean: 'clean', refused: 'refused', applied: 'applied' })

/**
 * Whether the Apply button exists. Nothing may be written until a dry run has
 * come back clean — the API enforces the same split with two routes — and once
 * a sheet has been applied the button goes away: re-applying is a no-op (every
 * row `unchanged`, which the unique index makes true), but a button that does
 * nothing visible reads as one that failed.
 *
 * @param {{ kind?: string }|null} [report]
 * @returns {boolean}
 */
export const canApply = (report) => report?.kind === REPORT.clean

/**
 * What the office is told after an apply. `applied` is the transaction's own
 * count — the database's statement, not the sheet's prediction.
 *
 * @param {{ applied?: number }} [result]
 * @returns {string}
 */
export function appliedNote(result) {
  const applied = Number.isFinite(result?.applied) ? result.applied : 0
  if (applied === 0) {
    return 'Nothing to append — every rate on the sheet is already on the ledger.'
  }
  return `${plural(applied, 'rate', 'rates')} appended to the ledger.`
}
