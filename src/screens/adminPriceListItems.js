// The Supplier rates screens' own declarations — the list (AdminPriceListItems),
// one rate's page (AdminPriceListItem) and the hand-keying form
// (AdminPriceListItemNew). Pure, so it tests without a DOM
// (./adminPriceListItems.test.js); the list rules the rate list shares with
// the rosters stay in ./adminLists.js.
//
// It exists because the rate is three screens now, not one. "For any kind of
// data entry … they will open in their own individual page instead of a tabbed
// drop down" (the client, 23 Sep 2026): a rate used to open under its row on
// /admin/price-lists and the create form dropped down above the table, so the
// field declaration lived in the one .jsx that drew both. Two pages drawing one
// form need it in one place, or the create and the edit drift apart.

// --- addresses ------------------------------------------------------------

/** The API collection, and one row of it. */
export const PRICE_LIST_ITEMS_PATH = '/admin/price-list-items'

/** `/admin/price-list-items/12`. One place, so a typo is a failing test not a 404. */
export const priceListItemPath = (id) => `${PRICE_LIST_ITEMS_PATH}/${id}`

/**
 * The CRM's own addresses: the list, the page one rate opens on, and the
 * hand-keying form. They read differently from the API path above, and would
 * be separate names even if they did not — a link is not a fetch, and moving
 * one should never silently retarget the other. `/new` beats `/:id` by
 * specificity in the router, and a rate id is an integer, so the two never meet.
 */
export const RATES_ROUTE = '/admin/price-lists'
export const rateRoute = (id) => `${RATES_ROUTE}/${id}`
export const NEW_RATE_ROUTE = `${RATES_ROUTE}/new`

// --- the list's search lives in the URL -------------------------------------
//
// With a rate on a page of its own the office LEAVES the list to edit one and
// comes back, and a search held in useState died with the list on the way out:
// Back landed on 19,500 unfiltered rows instead of the six being worked through.
// So the three boxes that FIND a rate — the search term, the supplier and the
// category — are read from and written to the querystring, the AdminOrders
// arrangement. "Show archived" and the drop-detection flag stay local: the flag
// narrows one page client-side and nothing needs to come back to it.

const URL_RATE_FILTERS = Object.freeze(['q', 'supplier', 'category'])

const text = (value) => (typeof value === 'string' ? value : '')

/**
 * The URL's search, VERBATIM. Not trimmed: the supplier box is bound straight
 * to it and filters as it is typed, and trimming on the read would eat the
 * space between "Pierre" and "Frey" before the F arrived. `rateListFilters`
 * trims on the way to the API, which is where it matters.
 *
 * @param {URLSearchParams|null} [params]
 * @returns {{ q: string, supplier: string, category: string }}
 */
export function rateSearchFromParams(params) {
  const read = (key) => text(params ? params.get(key) : '')
  return { q: read('q'), supplier: read('supplier'), category: read('category') }
}

/**
 * The three back into the URL. A blank is ABSENT rather than an empty
 * parameter, so a cleared search leaves a bare path — the rule
 * `buildListQuery` follows on the way to the API. A value is otherwise kept as
 * typed (see rateSearchFromParams).
 *
 * @param {object} [search] anything carrying q / supplier / category
 * @returns {object} ready for setSearchParams
 */
export function rateSearchParams(search = {}) {
  return URL_RATE_FILTERS.reduce((params, key) => {
    const value = text(search[key])
    return value.trim() === '' ? params : { ...params, [key]: value }
  }, {})
}

/**
 * The list as it stands — its route plus the search — for a rate opened from it
 * to come back to.
 *
 * @param {object} [search] rateSearchFromParams' output
 * @returns {string}
 */
export function ratesListRoute(search = {}) {
  const query = new URLSearchParams(rateSearchParams(search)).toString()
  return query ? `${RATES_ROUTE}?${query}` : RATES_ROUTE
}

/**
 * Where a rate's page (and the create form) goes Back to: the list as it was
 * left, handed over in router state by the link that opened the page, or the
 * bare list after a deep link or a refresh. Anything that is not the rates list
 * is ignored — the state is a hand-off between two screens, not a redirect
 * anybody can aim.
 *
 * @param {{ list?: unknown }|null} [state] useLocation().state
 * @returns {string}
 */
export function rateListReturn(state) {
  const to = state?.list
  if (typeof to !== 'string') return RATES_ROUTE
  return to === RATES_ROUTE || to.startsWith(`${RATES_ROUTE}?`) ? to : RATES_ROUTE
}

// --- the form both pages draw ---------------------------------------------

// Enums mirror the API schemas exactly — a value outside them is a 400. The
// category is the exception and is FETCHED (useCategories): it is a table the
// office maintains on the Categories screen, not a schema enum, so a list
// frozen into this file would stop offering words the moment one was added.
export const UNITS = Object.freeze(['metre', 'yard', 'roll', 'piece', 'hide', 'panel'])
// Only the three currencies the supplier templates actually carry. NZD is
// absent on purpose: this column is the supplier's own rate, pre-conversion.
export const CURRENCIES = Object.freeze(['EUR', 'USD', 'GBP'])
export const FREIGHT_CLASSES = Object.freeze(['A', 'B', 'C', 'D', 'E'])

// `supplier` is create-only — it is part of the identity key (supplier,
// category, code), so the PATCH schema omits it and the rate's page shows it
// read-only. Declared apart so the create body can name it and the edit never
// can.
export const IDENTITY_FIELDS = Object.freeze([
  { key: 'supplier', label: 'Supplier', kind: 'text', required: true },
])

// Editable on both create and PATCH.
export const ITEM_FIELDS = Object.freeze([
  { key: 'category', label: 'Category', kind: 'enum', required: true },
  { key: 'code', label: 'Code', kind: 'text', required: true },
  { key: 'unit', label: 'Unit', kind: 'enum', required: true },
  { key: 'wholesale_rate', label: 'Wholesale rate', kind: 'decimal', required: true },
  { key: 'currency', label: 'Currency', kind: 'enum', required: true },
  // The template's Brand column. The storage keeps v1's name (19.5k rows deep, and the
  // converter's committed JSON keys on it); only the label the office reads was corrected.
  { key: 'product_range', label: 'Brand', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'contents', label: 'Contents', kind: 'text' },
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'repeat', label: 'Horizontal repeat', kind: 'text' },
  { key: 'vertical_repeat', label: 'Vertical repeat', kind: 'text' },
  { key: 'duty_class', label: 'Duty class', kind: 'text' },
  { key: 'freight_class', label: 'Freight class', kind: 'enum' },
  { key: 'date_effective', label: 'Date effective', kind: 'date' },
])

// The hand-keying form's starting draft.
export const NEW_ITEM = Object.freeze({
  supplier: '',
  category: 'fabric',
  code: '',
  unit: 'metre',
  wholesale_rate: '',
  currency: 'EUR',
  product_range: '',
  description: '',
  contents: '',
  width: '',
  repeat: '',
  vertical_repeat: '',
  duty_class: '',
  freight_class: '',
  date_effective: '',
})

// --- the hand-keying form's two pickers ---------------------------------------
//
// A rate's `supplier` is free text on the table (it is the import's identity
// key), so a typo made a supplier nobody could find again. The create form now
// offers the suppliers that exist, and the product range — which has always
// held the house — the houses that supplier invoices. The API links the rate
// to the supplier record by the same name.

/** Live suppliers for the rate form, archived excluded, at the API's page ceiling. */
export const RATE_SUPPLIERS_PATH = '/admin/suppliers?limit=200'

/** @param {number} supplierId */
export const rateSupplierPath = (supplierId) => `/admin/suppliers/${supplierId}`

/**
 * The supplier dropdown: live suppliers, alphabetical.
 *
 * @param {ReadonlyArray<{id: number, name: string, currency?: string|null, archived_at?: string|null}>} suppliers
 * @returns {ReadonlyArray<{id: number, name: string, currency: string|null}>}
 */
export function rateSupplierOptions(suppliers = []) {
  return (suppliers ?? [])
    .filter((supplier) => !supplier.archived_at)
    .map((supplier) => ({ id: supplier.id, name: supplier.name, currency: supplier.currency ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The product-range dropdown for one supplier: the live houses it invoices,
 * by name, alphabetical and without repeats.
 *
 * @param {{ brands?: ReadonlyArray<{name: string, archived_at?: string|null}> }|null} supplier the supplier detail read
 * @returns {ReadonlyArray<string>}
 */
export function rateRangeOptions(supplier) {
  const names = (supplier?.brands ?? []).filter((brand) => !brand.archived_at).map((brand) => brand.name)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

/**
 * The currency a newly chosen supplier invoices in, when it is one a rate may
 * carry; otherwise the form keeps what it had.
 *
 * @param {string|null|undefined} currency
 * @param {string} current
 * @returns {string}
 */
export function rateCurrencyFor(currency, current) {
  return CURRENCIES.includes(currency) ? currency : current
}

// The column has a CHECK > 0 and the API's schema an exclusiveMinimum, so the
// sentence is said here before the round trip. A price-on-application item is
// simply not recorded as a rate (the importer skips those rows too).
export const RATE_NOT_POSITIVE = 'Wholesale rate must be greater than zero.'
