// Pure logic for the three live catalogue screens — AdminBrands (Houses),
// AdminCollections (Collections) and AdminProducts (Products & colourways).
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Anything
// with a rule in it therefore lives here, beside the screens, and is tested
// directly (see ./adminCatalogue.test.js) — the same split clientAccounts.js
// makes for the Clients screen.
//
// Four rules, each of which has a wrong answer that fails quietly:
//
//   · **An unset filter is null, never the empty string.** useAdminList
//     serialises these through buildListQuery, which drops null/undefined/'' —
//     so "All houses" must arrive here as null. Forwarded as '' it would become
//     `brand_id=`, and the endpoint's integer schema answers that with a 400
//     that kills the whole list rather than one filter.
//   · **Houses and collections do not page, so their limit is bigger than the
//     table.** `/admin/brands` and `/admin/collections` return every row with
//     no `meta` (readList falls back to the row count), and neither declares a
//     `page` param — Fastify's Ajv strips it. Left at the kit's default 25,
//     `totalPages` would read 2 over a 41-row answer: a pager that cannot work,
//     over rows that are all already on screen. `/admin/products` DOES page
//     (and caps `limit` at 200), so its filters all go to the API — search,
//     category and price band included — rather than narrowing the page on
//     screen, where a match on page 3 would never be found.
//   · **"Archive instead" always ARCHIVES.** It is the escape offered on a
//     REFUSED delete, so pointing it at the archive/restore toggle would answer
//     a 409 on an already-archived row by putting that row back on the website.
//     The row's own Archive button is the toggle; this is not.
//   · **A collection is identified by its house as well as its own name.** Both
//     the slug (`collections_brand_id_slug_unique`) and the display name are
//     unique per house and not globally — the seed strips the house prefix off
//     the vendored titles, so a catalogue-wide list genuinely shows several
//     "Cappuccino"s. Anything that names one row to a human therefore names its
//     house too; see describeCollection.
//
// Since 23 Sep 2026 a catalogue screen is a LIST, with the record on its own
// page and the create form on a page of its own (AdminProducts → AdminProduct,
// AdminProductNew). The field declarations moved here from the screen for that
// reason: the create page and the record page both read them, and a
// declaration kept in one screen and copied into another is the drift the
// shared form component exists to prevent. The CRM routes are here too, at the
// foot of this file.

import { buildListQuery } from '../admin/list.js'
import { priceBandQuery } from '../lib/priceBands.js'

// Above any plausible row count for houses or collections: both endpoints
// answer with the whole list, so this exists to keep `totalPages` at 1 rather
// than to page. Never pass it to /admin/products — that endpoint caps `limit`
// at 200, so this is a 400 there, not a big page.
export const CATALOGUE_LIST_LIMIT = 1000

// Products page. Well inside the endpoint's MAX_LIMIT of 200.
export const PRODUCT_LIST_LIMIT = 25

/**
 * Filters for GET /admin/brands.
 *
 * @param {boolean} [showArchived]
 * @returns {{ include_archived: boolean|null }}
 */
export function brandListFilters(showArchived = false) {
  return { include_archived: showArchived || null }
}

// The two house-scoped lists take the same pair of filters, and get the same
// null-not-empty-string treatment. Kept as one implementation behind two named
// exports so a screen reads its own contract rather than another screen's.
const brandScopedFilters = (brandId, showArchived) => ({
  brand_id: brandId || null,
  include_archived: showArchived || null,
})

/**
 * Filters for GET /admin/products. `brandId` comes straight off a <select>, so
 * it is a string, and "All houses" is its empty value; so are the category and
 * price band. `q` is the search box, trimmed so a blank one sends nothing.
 *
 * @param {string|number} [brandId]
 * @param {boolean} [showArchived]
 * @param {{ q?: string, category?: string, priceBand?: string }} [narrowing]
 * @returns {object} the query, unset filters null
 */
export function productListFilters(
  brandId = '',
  showArchived = false,
  { q = '', category = '', priceBand = '' } = {}
) {
  return {
    ...brandScopedFilters(brandId, showArchived),
    q: (typeof q === 'string' ? q.trim() : '') || null,
    category: category || null,
    ...priceBandQuery(priceBand),
  }
}

/**
 * Filters for GET /admin/collections. On this screen `brandId` also arrives
 * from the URL (AdminBrands links through with `?brand_id=`), which is a string
 * either way.
 *
 * @param {string|number} [brandId]
 * @param {boolean} [showArchived]
 * @returns {{ brand_id: string|number|null, include_archived: boolean|null }}
 */
export function collectionListFilters(brandId = '', showArchived = false) {
  return brandScopedFilters(brandId, showArchived)
}

/**
 * The link off a house row through to that house's collections. The house is
 * carried in the URL rather than in screen state so the link is shareable and
 * the back button works; AdminCollections reads it with useSearchParams.
 *
 * @param {{ id: number|string }} brand
 * @returns {string}
 */
export function collectionsPath(brand) {
  return `/admin/collections?brand_id=${brand.id}`
}

/**
 * How a collection is named to a human — in the delete dialog's title, in its
 * toast, and anywhere else one row has to be told from another.
 *
 * The house is part of the name because a collection's name is unique per house
 * and not globally: "Delete “Cappuccino”?" is a question three different houses
 * can answer, and this screen lists all of them at once. Returns undefined for
 * a nameless row so useCrudScreen falls back to "That collection".
 *
 * @param {{ name?: string, brand_name?: string }} [collection]
 * @returns {string|undefined}
 */
export function describeCollection(collection) {
  const name = typeof collection?.name === 'string' ? collection.name.trim() : ''
  if (name === '') return undefined
  const house = typeof collection?.brand_name === 'string' ? collection.brand_name.trim() : ''
  return house === '' ? name : `${name} (${house})`
}

/**
 * The row's own Archive/Restore verb — reversible, so it toggles.
 *
 * @param {string} base e.g. '/admin/brands'
 * @param {{ id: number|string, archived_at?: string|null }} row
 * @returns {string}
 */
export function archiveTogglePath(base, row) {
  return `${base}/${row.id}/${row.archived_at ? 'restore' : 'archive'}`
}

/**
 * The path behind the delete dialog's "Archive instead". Always archive: the
 * button only exists on a refusal, and restoring the row would be the opposite
 * of the removal that was just refused.
 *
 * @param {string} base
 * @param {{ id: number|string }} row
 * @returns {string}
 */
export function archiveInsteadPath(base, row) {
  return `${base}/${row.id}/archive`
}

/**
 * The sizes already in use, for the size box's suggestion list.
 *
 * Read off the products the screen has ALREADY fetched — no second request, the
 * same distinction AdminShipping's `annotateTiers` draws: reading what the API
 * said is not a pre-flight, asking it again would be. So the list follows the
 * house filter, which is the right scope anyway: the sizes a house's towels
 * come in are the ones worth offering while editing that house.
 *
 * There is no sizes table and there should not be one — the vocabulary is per
 * category and open-ended, and typing a size nobody has used yet is how a new
 * one comes to exist. Sorted so the box does not reshuffle between renders, and
 * de-duplicated on the trimmed value so " Queen" and "Queen" are one entry.
 *
 * @param {Array<{ size?: string|null }>} rows
 * @returns {string[]} unique, trimmed, non-blank, sorted
 */
export function sizesInUse(rows) {
  const seen = new Set()
  for (const row of rows ?? []) {
    const size = typeof row?.size === 'string' ? row.size.trim() : ''
    if (size !== '') seen.add(size)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/**
 * The options behind the Houses screen's supplier picker.
 *
 * The live supplier roster, plus the house's CURRENT supplier where the roster
 * does not carry it — an archived supplier still invoices the houses linked to
 * it (`brands.supplier_id` is RESTRICT precisely so archiving cannot silently
 * unlink them), and a select whose value matches no option renders blank. That
 * blank would read as "no supplier", and saving the form from there would
 * unlink a live commercial relationship nobody meant to touch.
 *
 * @param {ReadonlyArray<{id: number, name: string}>} suppliers rows from GET /admin/suppliers
 * @param {{ supplier_id?: number|null, supplier_name?: string|null }} [brand]
 * @returns {ReadonlyArray<{id: number, name: string}>}
 */
export function supplierOptions(suppliers = [], brand = {}) {
  const options = (suppliers ?? []).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
  }))
  const current = brand?.supplier_id ?? null
  if (current == null || options.some((option) => String(option.id) === String(current))) {
    return options
  }
  return [
    ...options,
    { id: current, name: brand.supplier_name ? `${brand.supplier_name} (archived)` : `Supplier ${current}` },
  ]
}

// --- the record pages --------------------------------------------------------
//
// One record, one page (23 Sep 2026, the client: "for any kind of data entry …
// they will open in their own individual page instead of a tabbed drop down").
// These are CRM ROUTES, not API paths. Several read the same as the API's by-id
// reads today, and they are separate names on purpose: a link is not a fetch,
// and moving one should never silently retarget the other.

export const PRODUCTS_ROUTE = '/admin/products'
export const NEW_PRODUCT_ROUTE = '/admin/products/new'
/** `/admin/products/12` — one design on its own page. */
export const productRoute = (id) => `${PRODUCTS_ROUTE}/${id}`

/**
 * Where an old `/admin/products?open=<id>` link lands now. That query opened
 * one design INSIDE the list — the order page's SKU link and the sample desk's
 * wrote it, and staff will have it bookmarked — and a design has its own page
 * now, so the link is redirected there rather than broken. Anything but a
 * plain id is ignored and the list shows as normal: `/admin/products/abc`
 * would be the API's 400, a worse answer than the list.
 *
 * @param {string|null} [value] the raw `open` search param
 * @returns {string|null} the product's page, or null to stay on the list
 */
export function openedProductRoute(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  return /^\d+$/.test(id) ? productRoute(id) : null
}

// The endpoint's MAX_LIMIT: a larger `limit` is a 400 there, not a bigger page.
export const SIZE_SOURCE_LIMIT = 200

/**
 * The read behind a product page's size suggestions: the house's own designs,
 * one page at the endpoint's ceiling. The suggestions used to come off the
 * list the screen had already fetched (sizesInUse's "no second request"), and
 * a page has no list — so it reads the scope that list was filtered to anyway,
 * the house, because the sizes a house's towels come in are the ones worth
 * offering while editing one of them. Null until a house is known, which on
 * the create page means until one is chosen.
 *
 * @param {string|number|null} [brandId]
 * @returns {string|null}
 */
export function sizeSourcePath(brandId) {
  if (!brandId) return null
  const query = buildListQuery({ ...productListFilters(brandId), limit: SIZE_SOURCE_LIMIT })
  return `/admin/products?${query}`
}


// --- field declarations ------------------------------------------------------
//
// One declaration per column, read by draftFrom, diffFields and bodyFrom alike,
// so a form cannot format a value one way and parse it another. Moved here from
// the three screens when create and edit became two pages sharing one form.

// Products -------------------------------------------------------------------

export const PRODUCT_TYPES = Object.freeze([
  { value: 'fabric', label: 'Fabric' },
  { value: 'finished_good', label: 'Finished good' },
])
export const typeLabel = (value) => PRODUCT_TYPES.find((t) => t.value === value)?.label ?? value

// The id of the one <datalist> of sizes already in use. It is rendered ONCE per
// page (<SizeList>, at the top) rather than inside the form: two elements
// sharing an id is the kind of thing that works until it does not.
export const SIZE_LIST_ID = 'admin-product-sizes'

// Free-text spec columns, all nullable — a blank input clears them.
// `list` hangs a <datalist> off the input; `multiline` renders a <textarea>.
// Both are presentation, read only by SpecInput in ProductFields.jsx.
export const SPEC_FIELDS = Object.freeze([
  // One product per size — a bath sheet and a face cloth are different prices,
  // and price lives on the product, so they are two rows rather than two
  // variants of one. Free text over the sizes already in use: the vocabulary is
  // per category and open-ended (queen/king for bed linen, hand/bath for
  // towels), and typing a new one is how a new size comes to exist. Same shape
  // the freight desk gives its zones.
  { key: 'size', label: 'Size', kind: 'text', list: SIZE_LIST_ID },
  { key: 'composition', label: 'Composition', kind: 'text' },
  { key: 'width', label: 'Width', kind: 'text' },
  { key: 'rubs', label: 'Rubs', kind: 'text' },
  { key: 'application', label: 'Application', kind: 'text' },
  { key: 'price_band', label: 'Price band', kind: 'text' },
  { key: 'lead_time', label: 'Lead time', kind: 'text' },
  // Sales prose for the storefront's product page — the API types it
  // `nullableText` (2000), like a collection's editorial, not one of the short
  // spec fields above it. Hence the textarea.
  { key: 'description', label: 'Description', kind: 'text', multiline: true },
])

// Money is integer cents in the API and dollars in the form (kind: 'money').
export const PRICE_FIELDS = Object.freeze([
  { key: 'retail_price_cents', label: 'Retail price', kind: 'money' },
  { key: 'trade_price_cents', label: 'Trade price', kind: 'money' },
])

// Editable on both create and PATCH. brand_id and product_type are create-only
// and therefore live in PRODUCT_CREATE_ONLY_FIELDS instead.
export const PRODUCT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper', required: true },
  { key: 'collection_id', label: 'Collection', kind: 'ref' },
  // The merchandising axis, and EDITABLE — unlike `product_type` in
  // PRODUCT_CREATE_ONLY_FIELDS below, which decides the colourway's stock unit
  // and would strand stock if it moved. Blank clears it: uncategorised is a
  // real state (most of the catalogue), not a gap. Until this field existed the
  // column could only be written in bulk, through Catalogue → Categories.
  { key: 'category', label: 'Category', kind: 'enum' },
  // The reporting dimension, not a spec: Atelier's own spelling of the house's
  // product line ("PIERRE FREY", "C & C Milano Bedding"), which the report
  // layer's `range` filter matches on. Free text — the range vocabulary lives
  // in the D365 staging mirror, not in a table — and `text` kind, so a cleared
  // input goes up as null and empties the column.
  { key: 'product_range', label: 'Range', kind: 'text' },
  ...SPEC_FIELDS,
  ...PRICE_FIELDS,
  { key: 'hi_res_asset_url', label: 'Hi-res asset URL', kind: 'text' },
  { key: 'show_on_website', label: 'Show on the website', kind: 'bool' },
])

export const PRODUCT_CREATE_ONLY_FIELDS = Object.freeze([
  { key: 'brand_id', label: 'House', kind: 'ref', required: true },
  { key: 'product_type', label: 'Type', kind: 'enum', required: true },
])

export const NEW_PRODUCT = Object.freeze({
  brand_id: '',
  product_type: 'fabric',
  name: '',
  currency: 'NZD',
  collection_id: '',
  category: '',
  product_range: '',
  size: '',
  composition: '',
  width: '',
  rubs: '',
  application: '',
  price_band: '',
  lead_time: '',
  description: '',
  retail_price_cents: '',
  trade_price_cents: '',
  hi_res_asset_url: '',
  show_on_website: false,
})
