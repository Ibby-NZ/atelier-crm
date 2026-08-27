// The merchandising category — ONE vocabulary, stated once for the whole CRM.
//
// It is `products.category`, `price_list_items.category` and
// `supplier_freight_rates.category` in atelier-api: three columns carrying
// identical CHECKs, plus `CATEGORIES` in its `scripts/lib/price-template.js`.
// The API's own test compares the three CHECK definitions to EACH OTHER, because
// a value in one and not the others does not fail anywhere — it silently stops
// matching. This file is that list's one crossing into this repo.
//
// It used to be written out THREE times here — `adminProductSheet.js`,
// `adminFreight.js` and `AdminPriceListItems.jsx` each declared their own copy —
// and all three had to be found and edited when the vocabulary grew from four
// values to nine. The first two now re-export from here so every existing
// `import { CATEGORY_VALUES } from './adminProductSheet.js'` is unchanged; that
// is the same seam atelier-api uses for `scripts/lib/text.js`.
//
// A screen sending a value outside this list gets a 400 from the API's schema.
// It cannot get a wrong answer — which is why this being a stale copy is a
// caught failure rather than a silent one, and why the list may be widened here
// only AFTER the API's migration ships.

/**
 * The nine values, in the API's order.
 *
 * The first four are the supplier rate sheet's vocabulary and describe what
 * Atelier BUYS. The last five describe what it SELLS — Towels, Bed Linen,
 * Throws/Blankets and Cushions used to collapse into `accessory`, which is why
 * 958 stock rows came through the category workbooks with no suggestion at all.
 * They come from the office's own corrected in-stock sheet: 381 rows, seven item
 * types, the whole of what is on the shelf.
 */
export const CATEGORY_VALUES = Object.freeze([
  'fabric',
  'wallpaper',
  'trimming',
  'accessory',
  'bed-linen',
  'towel',
  'cushion',
  'throw',
  'misc',
])

/**
 * What a person reads. Sentence case, matching every other label in the CRM,
 * and `misc` is spelled out — the stored value is an abbreviation and a screen
 * is not the place to make somebody expand one.
 */
export const CATEGORY_LABELS = Object.freeze({
  fabric: 'Fabric',
  wallpaper: 'Wallpaper',
  trimming: 'Trimming',
  accessory: 'Accessory',
  'bed-linen': 'Bed linen',
  towel: 'Towel',
  cushion: 'Cushion',
  throw: 'Throw',
  misc: 'Miscellaneous',
})

/**
 * A category's label, or the raw value if the API ever serves one this build
 * has no word for — never blank. A deployed CRM can be a version behind the API
 * (they ship separately), and a row rendering as an empty cell reads as "no
 * category" when the truth is "a category this screen has not been taught yet".
 *
 * @param {string|null|undefined} value
 * @returns {string} the label, or '' only where there is genuinely no category
 */
export const categoryLabel = (value) =>
  value == null || value === '' ? '' : (CATEGORY_LABELS[value] ?? value)

/** `{ value, label }` for a <select>, in the API's order. */
export const CATEGORY_OPTIONS = Object.freeze(
  CATEGORY_VALUES.map((value) => Object.freeze({ value, label: CATEGORY_LABELS[value] }))
)
