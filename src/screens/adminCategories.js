// Categories — the rules behind AdminCategories.jsx, pure and tested here
// because there is no jsdom in this repo.
//
// A category IS a row now (`product_categories` in atelier-api, migration
// 1791379200000): the screen adds and deletes them, the way Collections does
// with collections. It used to list the nine values a CHECK constraint allowed
// and offer a "Move to" select per product, which was the only write it had —
// moving a design between categories belongs on the design, and it is already
// there, in the Products editor's own Category field.
//
// Deleting is the API's decision, not this screen's: `DELETE
// /admin/categories/:slug` probes products, price list lines and freight rates
// and answers 409 with blockers while any of them still carries the category.
// The count beside each row is what says so in advance.

export const CATEGORIES_PATH = '/admin/categories'

// The spreadsheet round trip still fills categories in bulk and keeps its own
// page, linked from the list head.
export const SHEET_PATH = '/admin/product-sheet'

/** Where a category's designs are: the Products list, narrowed to it. */
export function productsPath(slug) {
  return `/admin/products?category=${encodeURIComponent(slug)}`
}

/** The DELETE path for one category. The slug is the key, not an id. */
export function categoryPath(slug) {
  return `${CATEGORIES_PATH}/${encodeURIComponent(slug)}`
}

/**
 * The POST body for a new category, or the reason there is none.
 *
 * Only the label is sent: the API derives the slug and never accepts one, the
 * slug being the value stored on three of its tables. A duplicate is refused
 * here as well as there, because the office types into a list it can see — a
 * 409 for something already on screen reads as a bug.
 *
 * @param {string} label
 * @param {Array<{ label?: string }>} existing
 * @returns {{ body: { label: string } } | { error: string }}
 */
export function newCategoryBody(label, existing = []) {
  const trimmed = String(label ?? '').trim()
  if (trimmed === '') return { error: 'Name the category.' }
  if (trimmed.length > 60) return { error: 'A category name must be 60 characters or fewer.' }
  if (!/[a-z0-9]/i.test(trimmed)) {
    return { error: 'A category name needs at least one letter or number.' }
  }
  const clash = existing.some(
    (category) => (category.label ?? '').trim().toLowerCase() === trimmed.toLowerCase()
  )
  if (clash) return { error: `"${trimmed}" is already a category.` }
  return { body: { label: trimmed } }
}

/** How a category is named to a person — its label, never its slug. */
export function describeCategory(category) {
  return category?.label ?? category?.slug ?? 'That category'
}

/** "12 products" / "1 product" / "None" for a row's count cell. */
export function countLabel(count) {
  if (!count) return 'None'
  return `${count} product${count === 1 ? '' : 's'}`
}

/**
 * Whether Delete is offered at all. The API decides — this only keeps the
 * office from pressing a button whose refusal is already on the screen beside
 * it. It is products only, deliberately: a price list line or a freight rate
 * also blocks a delete, and neither is visible from here, so those come back as
 * the API's 409 and its blocker list.
 *
 * @param {{ product_count?: number }} category
 */
export function canDelete(category) {
  return (category?.product_count ?? 0) === 0
}
