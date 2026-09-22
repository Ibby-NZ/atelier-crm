// $100 price bands, the same ones the storefront's Price facet draws
// (atelier-storefront src/lib/catalogue.js priceBandFor): "Under $100",
// "$100–$200", "$201–$300", … — band 1 is closed at both ends, every later one
// starts at the previous ceiling plus one. Pure; the products screen turns a
// chosen band into the API's cents range with it.
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

/**
 * Every band from "Under $100" up to the one holding `maxCents` (the
 * catalogue's price ceiling, from GET /admin/products' meta.max_price_cents),
 * "No price" last. The list is paged, so the options cannot come from the
 * rows on screen — a band on page 3 would never be offered.
 *
 * @param {number|string|null|undefined} maxCents
 * @returns {Array<{ value: string, label: string, from: number }>}
 */
export function priceBandOptions(maxCents) {
  const top = priceBandFor(maxCents)
  if (!top) return [NO_PRICE_BAND]
  const bands = [UNDER_FIRST_BAND]
  // Step from one band's floor into the next: any amount just past a ceiling
  // lands in the band above it.
  let band = priceBandFor(PRICE_BAND_WIDTH * 100)
  while (band.from <= top.from) {
    bands.push(band)
    band = priceBandFor((band.from + PRICE_BAND_WIDTH + 1) * 100)
  }
  return [...bands, NO_PRICE_BAND]
}

// A band's `value` is `${from}-${to}` in dollars.
const BAND_VALUE = /^(\d+)-(\d+)$/

/**
 * The GET /admin/products query a band's value means. Unset halves are null
 * so buildListQuery drops them. Matches priceBandFor at cents granularity:
 * 20000 is "$100–$200", 20001 is "$201–$300".
 *
 * @param {string} [value] — '' for "All prices"
 * @returns {{ price_min_cents: number|null, price_max_cents: number|null, unpriced: true|null }}
 */
export function priceBandQuery(value = '') {
  const none = { price_min_cents: null, price_max_cents: null, unpriced: null }
  if (value === NO_PRICE_BAND.value) return { ...none, unpriced: true }
  if (value === UNDER_FIRST_BAND.value) {
    return { ...none, price_max_cents: PRICE_BAND_WIDTH * 100 - 1 }
  }
  const match = BAND_VALUE.exec(value)
  if (!match) return none
  const from = Number(match[1])
  const to = Number(match[2])
  // Band 1 is closed at both ends; every later one starts just past the
  // previous ceiling, which in cents is one above it.
  const min = from === PRICE_BAND_WIDTH ? from * 100 : (from - 1) * 100 + 1
  return { ...none, price_min_cents: min, price_max_cents: to * 100 }
}
