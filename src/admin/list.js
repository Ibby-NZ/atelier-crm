// The pure half of the admin list kit: query building and page arithmetic.
//
// Five screens had grown their own copy of this — same URLSearchParams dance,
// same `Math.max(1, Math.ceil(total / LIMIT))`, same Previous/Next pair — and
// eight more are coming. Everything here is a plain function with no React and
// no fetch, so it is unit-tested directly; this repo has no jsdom, so anything
// that matters must live in a `.js` like this one rather than in a `.jsx`.

export const DEFAULT_LIMIT = 25

/**
 * Serialise filters into a query string, dropping null, undefined and the empty
 * string.
 *
 * That is load-bearing, not tidiness. A filter `<select>` whose "All" option has
 * `value=""` would otherwise send `role=`, and the API's enum answers an empty
 * value with a 400 — which kills the whole list rather than one filter. Same for
 * an unfilled search box.
 *
 * Strings are trimmed, so a box holding only spaces is "no filter" too.
 * Booleans are sent as `true`/`false`: a flag that should vanish when off is the
 * caller's decision, expressed by passing `flag || null`.
 *
 * @param {Record<string, unknown>} [params]
 * @returns {string} e.g. 'page=2&limit=25&q=linen' — no leading '?'
 */
export function buildListQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') search.set(key, trimmed)
      continue
    }
    // An array travels as repeated params (status=paid&status=shipped) —
    // Fastify parses repeats into a schema's array branch. Empty = unset.
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item))
      continue
    }
    // NaN and Infinity would serialise to a value the API cannot parse.
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    search.set(key, String(value))
  }
  return search.toString()
}

/** `path?query`, or the bare path when there is nothing to send. */
export function listPath(path, query) {
  return query ? `${path}?${query}` : path
}

/**
 * How many pages `total` rows make at `limit` per page. Never less than 1: an
 * empty list is still "page 1 of 1", and 0 would make every Next/Previous
 * comparison read backwards.
 *
 * @param {number|string} total
 * @param {number} [limit]
 * @returns {number}
 */
export function pageCount(total, limit = DEFAULT_LIMIT) {
  const size = Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT
  const rows = Number(total)
  const count = Math.ceil((Number.isFinite(rows) ? rows : 0) / size)
  return Math.max(1, Number.isFinite(count) ? count : 1)
}

/**
 * Pull `page` back inside 1..totalPages. Used both when a filter shrinks the
 * result set and when a delete empties the last page.
 *
 * @param {number} page
 * @param {number} totalPages
 * @returns {number}
 */
export function clampPage(page, totalPages) {
  const max = Math.max(1, Math.floor(Number(totalPages)) || 1)
  const wanted = Math.floor(Number(page)) || 1
  return Math.min(max, Math.max(1, wanted))
}

/**
 * Read a list response into `{ rows, total }`.
 *
 * `key` is the array's name in the envelope (`brands`, `items`, `orders`) — the
 * API has no single one. `meta.total` is the paged total where the endpoint
 * pages; several admin reads (brands, inventory) return the whole list with no
 * meta at all, and for those the row count IS the total.
 *
 * @param {object|null} body
 * @param {string} key
 * @returns {{ rows: unknown[], total: number }}
 */
export function readList(body, key) {
  const rows = Array.isArray(body?.[key]) ? body[key] : []
  const total = Number(body?.meta?.total)
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}
