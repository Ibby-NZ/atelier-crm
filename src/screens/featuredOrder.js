// The ordering rules behind AdminBrands' "Featured on the storefront" panel.
// This repo has no jsdom, so a component cannot be rendered — the house pattern
// is a plain .js beside the screen (see adminSuppliers.js, clientAccounts.js)
// holding everything that is a decision rather than a layout.
//
// Four of those decisions are worth naming here, because getting one wrong is
// not a cosmetic bug:
//
//   - **Position in the list IS the rank.** PUT /admin/brands/featured and
//     PUT /admin/collections/featured take the whole list, clear every rank and
//     re-apply from the submitted order. So the list this module builds is
//     authoritative: anything missing from it stops being featured, and nothing
//     here ever computes a rank number — which is exactly what lets a swap be
//     expressed without a collision.
//   - **A collection is named by the (brand_slug, slug) PAIR, never the slug
//     alone.** A collection slug is unique per brand and never globally, so a
//     slug-only body would feature another house's identically-slugged
//     collection as well, or instead. The admin collection read model carries
//     brand_id and brand_name but NOT the house slug, so `withBrandSlug` joins
//     it on before anything can be sent.
//   - **An archived row stays featured on purpose.** The public read models
//     already exclude it, so it simply does not appear, and restoring it brings
//     its position back. It must therefore stay in this list: a save built from
//     only the rows the screen happened to be showing would silently unfeature
//     it. AdminBrands loads archive-inclusive rows for that reason.
//   - **Duplicates are impossible by construction, not by validation.** The API
//     422s an entry listed twice (`UPDATE … FROM` picks one matching source row
//     non-deterministically, so a duplicate would resolve to an arbitrary rank);
//     `addFeatured` refuses one before it can reach the list at all.

export const FEATURED_BRANDS_PATH = '/admin/brands/featured'
export const FEATURED_COLLECTIONS_PATH = '/admin/collections/featured'

// Mirrors FEATURED_LIMIT in atelier-api's src/catalogue/admin-brands.js, which
// caps both bodies as `maxItems` — a longer list is a 400 there. Boundary
// sanity rather than a product rule: the homepage leads with three and its
// latest row shows four.
export const FEATURED_LIMIT = 12

// The storefront asymmetry, stated where the office decides. It is real and it
// would otherwise read as a bug: /brands is rendered per request, so a reordered
// house strip is live immediately, while the homepage is `prerender = true` and
// only picks up a collection change at the next site build.
export const STOREFRONT_TIMING_NOTE =
  'Featured houses appear on the storefront Houses page immediately. Featured collections lead the homepage, which is pre-rendered, so they appear at the next site build rather than straight away.'

/** A house is named by its slug. */
export const brandKey = (entry) => (typeof entry?.slug === 'string' ? entry.slug : '')

/** A collection is named by the PAIR — see the header. */
export const collectionKey = (entry) =>
  typeof entry?.brand_slug === 'string' && typeof entry?.slug === 'string'
    ? `${entry.brand_slug}/${entry.slug}`
    : ''

const brandsBody = (list) => ({ slugs: list.map(brandKey) })

const collectionsBody = (list) => ({
  collections: list.map((entry) => ({ brand_slug: entry.brand_slug, slug: entry.slug })),
})

// The two lists differ only in how a row is named, labelled and sent, so every
// operation below takes one of these rather than being written twice.
export const BRAND_LIST = Object.freeze({
  noun: 'house',
  plural: 'houses',
  path: FEATURED_BRANDS_PATH,
  keyOf: brandKey,
  labelOf: (entry) => entry?.name ?? '',
  bodyFrom: brandsBody,
})

export const COLLECTION_LIST = Object.freeze({
  noun: 'collection',
  plural: 'collections',
  path: FEATURED_COLLECTIONS_PATH,
  keyOf: collectionKey,
  labelOf: (entry) => [entry?.brand_name, entry?.name].filter(Boolean).join(' — '),
  bodyFrom: collectionsBody,
})

// The API's tie-break, repeated so two rows sharing a rank read here in the
// order the storefront will draw them: featured_rank, then name, then id.
const byRank = (a, b) =>
  a.featured_rank - b.featured_rank ||
  String(a.name ?? '').localeCompare(String(b.name ?? '')) ||
  (a.id ?? 0) - (b.id ?? 0)

/**
 * The featured rows of an admin list, in rank order. Rank is an ORDER, never a
 * slot: an archived row and a gap in the numbers are both normal, so nothing
 * here indexes by the rank itself.
 *
 * @param {readonly object[]} rows
 * @returns {object[]}
 */
export function featuredFrom(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.featured_rank != null)
    .sort(byRank)
}

/**
 * Attach each collection's house slug, which the admin read model does not
 * carry. Without it the (brand_slug, slug) pair cannot be built at all.
 *
 * @param {readonly object[]} collections
 * @param {readonly object[]} brands
 * @returns {object[]}
 */
export function withBrandSlug(collections = [], brands = []) {
  const slugById = new Map(
    (Array.isArray(brands) ? brands : []).map((brand) => [brand.id, brand.slug])
  )
  return (Array.isArray(collections) ? collections : []).map((collection) => ({
    ...collection,
    brand_slug: slugById.get(collection?.brand_id) ?? null,
  }))
}

/**
 * Move one entry by `delta` positions. A move off either end is refused by
 * returning the list unchanged — and by identity, so a caller can tell nothing
 * happened. Up at the top and down at the bottom are the normal way someone
 * discovers where the ends are, not an error worth a message.
 *
 * @param {readonly object[]} list
 * @param {number} index
 * @param {number} delta
 * @returns {object[]}
 */
export function move(list, index, delta) {
  const items = Array.isArray(list) ? list : []
  const target = index + delta
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return items
  if (!Number.isInteger(target) || target < 0 || target >= items.length) return items
  const next = [...items]
  const [entry] = next.splice(index, 1)
  next.splice(target, 0, entry)
  return next
}

/**
 * Append an entry. Returns `{ list, error }` — a refusal leaves the list
 * untouched and says why, rather than throwing at a click handler.
 *
 * @param {readonly object[]} list
 * @param {object} entry
 * @param {{ noun: string, keyOf: (entry: object) => string, labelOf: (entry: object) => string }} kind
 * @returns {{ list: object[], error: string }}
 */
export function addFeatured(list, entry, kind) {
  const items = Array.isArray(list) ? list : []
  const key = kind.keyOf(entry)
  if (!key) {
    return { list: items, error: `That ${kind.noun} has no web address yet, so it cannot be featured.` }
  }
  if (items.some((item) => kind.keyOf(item) === key)) {
    return { list: items, error: `${kind.labelOf(entry)} is already featured.` }
  }
  // The cap is the API's, restated so the office is stopped at the twelfth
  // rather than by a 400 after arranging thirteen.
  if (items.length >= FEATURED_LIMIT) {
    return {
      list: items,
      error: `A featured list holds at most ${FEATURED_LIMIT} ${kind.plural}. Remove one first.`,
    }
  }
  return { list: [...items, entry], error: '' }
}

/**
 * Drop the entry at `index`. Out of range leaves the list unchanged.
 *
 * @param {readonly object[]} list
 * @param {number} index
 * @returns {object[]}
 */
export function removeFeatured(list, index) {
  const items = Array.isArray(list) ? list : []
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return items
  return items.filter((_, position) => position !== index)
}

/**
 * The rows still available to add, in the order the picker should offer them.
 * Two exclusions, for different reasons:
 *   - a row the list cannot name (a collection whose house is not loaded), since
 *     offering it would only build a body the API refuses;
 *   - an archived row, because featuring one anew would put something in the
 *     order that cannot appear. This is not the mirror of `featuredFrom`, which
 *     KEEPS an archived row that is already featured — archiving is reversible
 *     and must not cost the office its position.
 *
 * @param {readonly object[]} rows
 * @param {readonly object[]} list
 * @param {object} kind
 * @returns {object[]}
 */
export function candidates(rows = [], list = [], kind) {
  const taken = new Set((Array.isArray(list) ? list : []).map(kind.keyOf))
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const key = kind.keyOf(row)
      return Boolean(key) && !taken.has(key) && !row.archived_at
    })
    .sort((a, b) => kind.labelOf(a).localeCompare(kind.labelOf(b)))
}

/**
 * Entries this list could not name to the API. Non-empty means the save must be
 * refused: sending the list without them would quietly unfeature them, and
 * sending a null slug is a 400.
 *
 * @param {readonly object[]} list
 * @param {object} kind
 * @returns {object[]}
 */
export const unresolved = (list = [], kind) =>
  (Array.isArray(list) ? list : []).filter((entry) => !kind.keyOf(entry))

/**
 * Whether two lists name the same entries in the same order — the screen's
 * "no changes to save" test. A whole-list PUT would happily rewrite identical
 * ranks; the office should still be told nothing moved.
 *
 * @param {readonly object[]} a
 * @param {readonly object[]} b
 * @param {object} kind
 * @returns {boolean}
 */
export const sameOrder = (a = [], b = [], kind) =>
  a.length === b.length && a.every((entry, index) => kind.keyOf(entry) === kind.keyOf(b[index]))

/**
 * The request body for a whole-list reorder, or the reason it cannot be built.
 * Position is the rank, so this is a plain projection of the list's order.
 *
 * @param {readonly object[]} list
 * @param {object} kind
 * @returns {{ body: object|null, error: string }}
 */
export function saveBody(list, kind) {
  const items = Array.isArray(list) ? list : []
  const missing = unresolved(items, kind)
  if (missing.length > 0) {
    return {
      body: null,
      error: `Reload the page — ${missing.length} featured ${
        missing.length === 1 ? kind.noun : kind.plural
      } could not be identified.`,
    }
  }
  return { body: kind.bodyFrom(items), error: '' }
}
