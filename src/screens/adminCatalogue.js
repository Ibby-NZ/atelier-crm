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
