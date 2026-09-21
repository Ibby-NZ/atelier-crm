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
// The counts are grouped from the products list the screen has already
// fetched (`GET /admin/products` returns the whole list, no meta), so there is
// no second request and no count the API did not already answer.

import { CATEGORY_VALUES, categoryLabel } from '../lib/categories.js'

export const CATEGORIES_PATH = '/admin/categories'

// The spreadsheet round trip keeps its own page, linked from here.
export const SHEET_PATH = '/admin/product-sheet'

// The pseudo-category for products nobody has looked at yet. Always the last
// row, because most of the catalogue still sits in it and it is the queue.
export const UNCATEGORISED = ''

const NO_CATEGORY_LABEL = 'Uncategorised'

/** The key a product groups under — null and '' are the same absence. */
const keyOf = (product) => product.category ?? UNCATEGORISED

/**
 * One row per category, in the vocabulary's order, with a count of the
 * products in it. A value the API serves that this build has no word for gets
 * its own row after the vocabulary (labelled with the raw value, never blank),
 * and Uncategorised is always last.
 *
 * @param {Array<{ category?: string|null }>} products
 * @returns {Array<{ value: string, label: string, count: number }>}
 */
export function categoryRows(products) {
  const counts = new Map()
  for (const product of products) {
    const key = keyOf(product)
    counts.set(key, (counts.get(key) ?? 0) + 1)
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
 * The products in one category, house first then design, so the expanded
 * panel reads the way the Products list does.
 *
 * @param {Array<{ category?: string|null, brand_name?: string, name?: string }>} products
 * @param {string} value a category value, or UNCATEGORISED
 */
export function productsIn(products, value) {
  return products
    .filter((product) => keyOf(product) === value)
    .sort(
      (a, b) =>
        (a.brand_name ?? '').localeCompare(b.brand_name ?? '') ||
        (a.name ?? '').localeCompare(b.name ?? '')
    )
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
