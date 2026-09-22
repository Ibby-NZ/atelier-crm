// Categories — the rules behind AdminCategories.jsx, pure and tested here
// because there is no jsdom in this repo.
//
// A category is NOT a row: the vocabulary is a CHECK constraint on three API
// columns (`src/lib/categories.js`), so this screen lists the fixed values the
// way Collections lists its rows — one line per category, a count, an expanded
// panel of what sits in it — and the only write is moving a product from one
// category to another (`PATCH /admin/products/:id { category }`). Creating,
// renaming or deleting a category is an API migration, not a form.
//
// The counts come from `GET /admin/products/categories` — the products list
// pages now, so the screen cannot group the whole catalogue itself — and an
// opened category is a paged read of `GET /admin/products` narrowed to it.

import { CATEGORY_VALUES, categoryLabel } from '../lib/categories.js'
import { listPath, buildListQuery } from '../admin/list.js'
import { productListFilters } from './adminCatalogue.js'

export const CATEGORIES_PATH = '/admin/categories'

// The counts endpoint; it takes the list's house and archived filters.
export const COUNTS_PATH = '/admin/products/categories'

// The spreadsheet round trip keeps its own page, linked from here.
export const SHEET_PATH = '/admin/product-sheet'

// The pseudo-category for products nobody has looked at yet. Always the last
// row, because most of the catalogue still sits in it and it is the queue.
export const UNCATEGORISED = ''

const NO_CATEGORY_LABEL = 'Uncategorised'

/** The key a count groups under — null and '' are the same absence. */
const keyOf = (row) => row.category ?? UNCATEGORISED

/**
 * The counts read for the current filters, unset ones dropped (buildListQuery
 * drops null/'' — `brand_id=` would 400 on the integer schema).
 *
 * @param {string|number} [brandId]
 * @param {boolean} [showArchived]
 * @returns {string}
 */
export function countsPath(brandId = '', showArchived = false) {
  return listPath(COUNTS_PATH, buildListQuery(productListFilters(brandId, showArchived)))
}

/**
 * Filters for the paged product list inside an opened category. Uncategorised
 * is `uncategorised=true`: '' cannot travel as `category=`.
 *
 * @param {string|number} brandId
 * @param {boolean} showArchived
 * @param {string} value a category value, or UNCATEGORISED
 * @returns {object}
 */
export function categoryProductFilters(brandId, showArchived, value) {
  return {
    ...productListFilters(brandId, showArchived, { category: value }),
    uncategorised: value === UNCATEGORISED || null,
  }
}

/**
 * One row per category, in the vocabulary's order, with a count of the
 * products in it. A value the API serves that this build has no word for gets
 * its own row after the vocabulary (labelled with the raw value, never blank),
 * and Uncategorised is always last.
 *
 * @param {Array<{ category: string|null, count: number }>} counted — what
 *   GET /admin/products/categories answers
 * @returns {Array<{ value: string, label: string, count: number }>}
 */
export function categoryRows(counted) {
  const counts = new Map()
  for (const row of counted) {
    const key = keyOf(row)
    counts.set(key, (counts.get(key) ?? 0) + row.count)
  }
  const unknown = [...counts.keys()].filter(
    (key) => key !== UNCATEGORISED && !CATEGORY_VALUES.includes(key)
  ).sort()
  return [...CATEGORY_VALUES, ...unknown, UNCATEGORISED].map((value) => ({
    value,
    label: value === UNCATEGORISED ? NO_CATEGORY_LABEL : categoryLabel(value),
    count: counts.get(value) ?? 0,
  }))
}

/**
 * The PATCH body that moves a product. Choosing Uncategorised clears the
 * column — `null`, never '', which the API's enum would 400.
 *
 * @param {string} value
 * @returns {{ category: string|null }}
 */
export function categoryPatch(value) {
  return { category: value === UNCATEGORISED ? null : value }
}

/** How a product is named to a person — the house, because names repeat across houses. */
export function describeProduct(product) {
  return product.brand_name ? `${product.brand_name} · ${product.name}` : product.name
}

/** "12 products" / "1 product" / "None" for a row's count cell. */
export function countLabel(count) {
  if (count === 0) return 'None'
  return `${count} product${count === 1 ? '' : 's'}`
}
