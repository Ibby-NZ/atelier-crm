// Pure logic for the two live catalogue screens — AdminBrands (Houses &
// collections) and AdminProducts (Products & colourways).
//
// This repo has no jsdom, so a screen cannot be rendered in a test. Anything
// with a rule in it therefore lives here, beside the screens, and is tested
// directly (see ./adminCatalogue.test.js) — the same split clientAccounts.js
// makes for the Trade accounts screen.
//
// Three rules, each of which has a wrong answer that fails quietly:
//
//   · **An unset filter is null, never the empty string.** useAdminList
//     serialises these through buildListQuery, which drops null/undefined/'' —
//     so "All houses" must arrive here as null. Forwarded as '' it would become
//     `brand_id=`, and the endpoint's integer schema answers that with a 400
//     that kills the whole list rather than one filter.
//   · **Neither list pages, so the limit is bigger than the table.**
//     `/admin/brands` and `/admin/products` return every row with no `meta`
//     (readList falls back to the row count), and they never declared a `page`
//     param — Fastify's Ajv strips it. Left at the kit's default 25, `totalPages`
//     would read 2 over a 41-row answer: a pager that cannot work, over rows that
//     are all already on screen.
//   · **"Archive instead" always ARCHIVES.** It is the escape offered on a
//     REFUSED delete, so pointing it at the archive/restore toggle would answer
//     a 409 on an already-archived row by putting that row back on the website.
//     The row's own Archive button is the toggle; this is not.

// Above any plausible row count for either table: both endpoints answer with the
// whole list, so this exists to keep `totalPages` at 1 rather than to page.
export const CATALOGUE_LIST_LIMIT = 1000

/**
 * Filters for GET /admin/brands.
 *
 * @param {boolean} [showArchived]
 * @returns {{ include_archived: boolean|null }}
 */
export function brandListFilters(showArchived = false) {
  return { include_archived: showArchived || null }
}

/**
 * Filters for GET /admin/products. `brandId` comes straight off a <select>, so
 * it is a string, and "All houses" is its empty value.
 *
 * @param {string|number} [brandId]
 * @param {boolean} [showArchived]
 * @returns {{ brand_id: string|number|null, include_archived: boolean|null }}
 */
export function productListFilters(brandId = '', showArchived = false) {
  return { brand_id: brandId || null, include_archived: showArchived || null }
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
