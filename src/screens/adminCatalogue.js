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
// Since 23 Sep 2026 each of the three screens is a LIST, with the record on its
// own page and the create form on a page of its own (AdminProduct, AdminBrand,
// AdminCollection, and a …New beside each). The field declarations moved here
// from the screens for that reason: the create page and the record page both
// read them, and a declaration kept in one screen and copied into another is
// the drift the shared form components exist to prevent. The CRM routes are
// here too, at the foot of this file.

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

export const BRANDS_ROUTE = '/admin/brands'
export const NEW_BRAND_ROUTE = '/admin/brands/new'
/** `/admin/brands/12` — one house on its own page. */
export const brandRoute = (id) => `${BRANDS_ROUTE}/${id}`

export const COLLECTIONS_ROUTE = '/admin/collections'
/** `/admin/collections/12` — one collection on its own page. */
export const collectionRoute = (id) => `${COLLECTIONS_ROUTE}/${id}`

/**
 * The create page for a collection, pre-picking a house when the list is
 * filtered to one — the common path is arriving from that house's row on
 * Houses, and the list's own "New collection" used to pre-pick it in place.
 * Carried in the URL for the reason the list's filter is: state would not
 * survive the navigation.
 *
 * @param {string|number|null} [brandId]
 * @returns {string}
 */
export function newCollectionRoute(brandId) {
  const query = buildListQuery({ brand_id: brandId || null })
  return query ? `${COLLECTIONS_ROUTE}/new?${query}` : `${COLLECTIONS_ROUTE}/new`
}

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

/**
 * The supplier roster behind a house page's picker — archive-INCLUSIVE, unlike
 * the list read it replaces. The by-id house read (GET /admin/brands/:id)
 * carries `supplier_id` but not the `supplier_name` the list read joins on,
 * and that name is exactly what supplierOptions needs for the one case that
 * matters: a house still invoiced by an ARCHIVED supplier. One roster read that
 * includes archived rows answers it without a second request per house.
 * ponytail: one page of them; paginate the picker if the roster outgrows the
 * API's MAX_LIMIT of 200 (the office runs ~40).
 */
export const SUPPLIER_ROSTER_PATH = `/admin/suppliers?${buildListQuery({ include_archived: true, limit: 200 })}`

/**
 * The house page's supplier picker, from the archive-inclusive roster above:
 * the LIVE suppliers as options, plus the house's current supplier by name
 * when it is archived — supplierOptions' rule, fed the name the by-id read
 * does not carry. An archived supplier is never offered to a house that is not
 * already on it: archiving one means no new links.
 *
 * @param {ReadonlyArray<{id: number, name: string, archived_at?: string|null}>} [roster]
 * @param {number|string|null} [supplierId] the house's saved supplier_id
 * @returns {ReadonlyArray<{id: number, name: string}>}
 */
export function supplierPicker(roster = [], supplierId = null) {
  const rows = roster ?? []
  const current =
    supplierId == null ? null : (rows.find((row) => String(row.id) === String(supplierId)) ?? null)
  const live = rows.filter((row) => !row.archived_at)
  return supplierOptions(live, {
    supplier_id: supplierId ?? null,
    supplier_name: current?.name ?? null,
  })
}

/**
 * The line under a house page's title: where it is from, and the two
 * public-facing states the list prints as columns, in the visitor's terms. Read
 * off the SAVED record, so it says what the storefront is doing now rather than
 * what an unsaved tick would make it do.
 *
 * @param {{ country?: string|null, trade_only?: boolean, is_international?: boolean, bespoke?: boolean }} brand
 * @returns {string}
 */
export function brandMeta(brand) {
  return [
    brand?.country || null,
    brand?.trade_only ? 'Trade only' : 'Public',
    brand?.is_international ? 'Price hidden' : 'Price shown',
    brand?.bespoke ? 'Bespoke' : null,
  ]
    .filter(Boolean)
    .join(' · ')
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

// Houses ---------------------------------------------------------------------

export const BRAND_FIELDS = Object.freeze([
  { key: 'name', label: 'House name', kind: 'text', required: true },
  { key: 'currency', label: 'Currency', kind: 'upper', required: true },
  { key: 'country', label: 'Country', kind: 'text' },
  // The D365 reporting designation ("CF", "ST") the office's old reporting was
  // built on. `text`, so a cleared input goes up as null and empties the
  // column; unique per supplier on the API side, and a clash comes back as a
  // 409 whose sentence lands in the same inline error line as every other.
  { key: 'brand_code', label: 'Brand code', kind: 'text' },
  // The line the storefront house page opens on, above the story (16 Sep 2026).
  { key: 'headline', label: 'Headline', kind: 'text' },
  { key: 'story', label: 'Story', kind: 'text' },
  { key: 'website_url', label: 'Website', kind: 'url' },
  { key: 'image_url', label: 'House image', kind: 'url' },
  { key: 'logo_url', label: 'Logo', kind: 'url' },
  { key: 'is_international', label: 'International house', kind: 'bool' },
  { key: 'trade_only', label: 'Trade only', kind: 'bool' },
  // Takes made-to-measure commissions: the storefront lists the house on
  // /bespoke and puts the quote enquiry form on its page.
  { key: 'bespoke', label: 'Bespoke', kind: 'bool' },
])

// Who INVOICES this house. Edit-only, deliberately: POST /admin/brands does not
// take a supplier (Ajv strips the key), so offering the control on the create
// form would draw a select that silently saves nothing. A house is created,
// then linked — which is also the order the office works in, since the supplier
// record often arrives with the first invoice.
//
// `ref` is the FK kind: blank goes up as an explicit null, which is how the
// office says "nobody invoices this house yet"; an unknown id is the API's 422
// from the foreign key. This is the SECOND of the two controls that write
// `brands.supplier_id` — the other is the link picker in <SupplierTermsPanel>,
// which is finance-gated because it sits among the rates. Nothing here reads or
// writes a rate, so this one is open to any back-office login.
export const BRAND_EDIT_FIELDS = Object.freeze([
  ...BRAND_FIELDS,
  { key: 'supplier_id', label: 'Supplier', kind: 'ref' },
])

// A new house defaults to CLOSED, matching the API's `trade_only` create default
// and the column's NOT NULL DEFAULT TRUE: a maison Atelier has just been given
// must not appear on the public website the moment someone types its name.
export const NEW_BRAND = Object.freeze({
  name: '',
  currency: 'NZD',
  country: '',
  brand_code: '',
  headline: '',
  story: '',
  website_url: '',
  image_url: '',
  logo_url: '',
  is_international: true,
  trade_only: true,
  bespoke: false,
})

// Collections ----------------------------------------------------------------

// The storefront tile editorial, moved to the Collections screen with the panel
// it belonged to (it lived inside AdminBrands until W2-US-010). The image is a
// public <img src>, so the `url` kind's http(s)-only rule applies exactly as it
// does to the brand website.
export const COLLECTION_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'image_url', label: 'Image', kind: 'url' },
])

// The house is set once and never patched: PATCH /admin/collections/:id takes
// name/description/image_url only, because moving a collection between houses
// would strand its products, whose own `brand_id` is a direct FK.
export const COLLECTION_CREATE_ONLY_FIELDS = Object.freeze([
  { key: 'brand_id', label: 'House', kind: 'ref', required: true },
])

export const NEW_COLLECTION = Object.freeze({ brand_id: '', name: '', description: '', image_url: '' })
