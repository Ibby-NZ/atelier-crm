// $100 price bands, the same ones the storefront's Price facet draws
// (atelier-storefront src/lib/catalogue.js priceBandFor): "Under $100",
// "$100–$200", "$201–$300", … — band 1 is closed at both ends, every later one
// starts at the previous ceiling plus one. Pure; the products screen filters
// its loaded list with it.
export const PRICE_BAND_WIDTH = 100

const dollars = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 0 })

export const UNDER_FIRST_BAND = Object.freeze({
  value: `under-${PRICE_BAND_WIDTH}`,
  label: `Under $${PRICE_BAND_WIDTH}`,
  from: 0,
})

// A row with no price at all is its own answer — the office uses it to find
// what still needs pricing. Sorts last.
export const NO_PRICE_BAND = Object.freeze({ value: 'none', label: 'No price', from: Infinity })

/**
 * @param {number|string|null|undefined} cents — pg returns numerics as strings.
 * @returns {{ value: string, label: string, from: number }|null}
 */
export function priceBandFor(cents) {
  const amount = cents == null || cents === '' ? NaN : Number(cents) / 100
  if (!Number.isFinite(amount)) return null
  if (amount < PRICE_BAND_WIDTH) return UNDER_FIRST_BAND
  const band = Math.max(1, Math.ceil((amount - PRICE_BAND_WIDTH) / PRICE_BAND_WIDTH))
  const from = band === 1 ? PRICE_BAND_WIDTH : band * PRICE_BAND_WIDTH + 1
  const to = (band + 1) * PRICE_BAND_WIDTH
  return { value: `${from}-${to}`, label: `$${dollars.format(from)}–$${dollars.format(to)}`, from }
}

// The figure a product is banded on: retail (what the storefront shows a
// shopper) first, the trade figure where there is no retail — a fabric from an
// international house carries only the latter.
export const productPriceCents = (product) =>
  product?.retail_price_cents ?? product?.trade_price_cents ?? null

export const productPriceBand = (product) => priceBandFor(productPriceCents(product)) ?? NO_PRICE_BAND

/** The bands present in a list, sorted by amount, "No price" last. */
export function priceBandOptions(products = []) {
  const seen = new Map()
  for (const product of products) {
    const band = productPriceBand(product)
    if (!seen.has(band.value)) seen.set(band.value, band)
  }
  return [...seen.values()].sort((a, b) => a.from - b.from)
}

/** Client-side narrowing of the loaded product list. '' means "All". */
export function matchesProductFilters(product, { category = '', priceBand = '' } = {}) {
  if (category && (product?.category ?? '') !== category) return false
  if (priceBand && productPriceBand(product).value !== priceBand) return false
  return true
}
