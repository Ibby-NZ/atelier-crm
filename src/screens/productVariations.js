// The Variations panel on a product's page (ProductVariations.jsx) — what the
// API calls colourways, renamed for the office (Sept 2026). One variation is
// edited at a time, picked from a drop-down: its name, SKU, tones, image, its
// own prices and its stock.
//
// A variation's price is its OWN only when the box is filled; blank sells at
// the product's price (atelier-api COALESCEs each figure on every selling read),
// so the box shows the product's figure as its placeholder, never as a value —
// saving must not copy the product's price onto the variation.
//
// Pure — every rule lives here and is tested from ./productVariations.test.js.

import { centsToDollars } from '../admin/drafts.js'
import { PRODUCT_PRICE_KEYS } from '../admin/priceChange.js'

export const VARIATION_FIELDS = Object.freeze([
  { key: 'name', label: 'Variation name', kind: 'text', required: true },
  { key: 'sku', label: 'SKU', kind: 'text', required: true },
  { key: 'hex_tones', label: 'Tones', kind: 'tones' },
  { key: 'image_url', label: 'Image', kind: 'text' },
  { key: 'retail_price_cents', label: 'Retail price', kind: 'money' },
  { key: 'trade_price_cents', label: 'Trade price', kind: 'money' },
])

/** The prices are director-only, as they are on the product (recordLock.js). */
export const LOCKED_VARIATION_KEYS = PRODUCT_PRICE_KEYS

export const NEW_VARIATION = Object.freeze({ name: '', sku: '', hex_tones: '', image_url: '' })

/** "Ink — AT-VEL-01", "(archived)" appended — one drop-down option. */
export const variationLabel = (colourway) =>
  `${colourway.name} — ${colourway.sku}${colourway.archived_at ? ' (archived)' : ''}`

/**
 * The variation the panel shows: the one picked, while it still exists; else
 * the first live one; else the first at all. null when there are none.
 */
export function pickVariation(colourways = [], selectedId = null) {
  return (
    colourways.find((colourway) => colourway.id === selectedId) ??
    colourways.find((colourway) => !colourway.archived_at) ??
    colourways[0] ??
    null
  )
}

/** A blank price box's placeholder: the product figure it falls back to. */
export function inheritedPriceHint(product, key) {
  const cents = product?.[key]
  return cents == null ? "Product's price (none set)" : `${centsToDollars(cents)} (product's price)`
}
