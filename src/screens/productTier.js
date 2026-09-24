// The product page's discount-tier picker (atelier-api migration 1791638400000).
//
//   GET /admin/products/:id/discount-tier → { discount_tier: { tier_id, tiers } }
//   PUT /admin/products/:id/discount-tier {tier_id|null}
//
// Finance-gated on the API: a tier is a discount, so the page draws the picker
// only for a login with finance visibility. Blank = no choice, which prices the
// product by category matching and the house's fallback tier as before.

/** @param {number} productId */
export const productTierPath = (productId) => `/admin/products/${productId}/discount-tier`

/**
 * One option's label: the tier's name and its rate as a whole percentage.
 *
 * @param {{ label: string, pct: number, is_fallback?: boolean }} tier
 * @returns {string}
 */
export function tierOptionLabel(tier) {
  const pct = Math.round(Number(tier.pct) * 10000) / 100
  return `${tier.label} — ${pct}%${tier.is_fallback ? ' (house default)' : ''}`
}

/**
 * The PUT body for a select value: '' clears the choice.
 *
 * @param {string} value
 * @returns {{ tier_id: number|null }}
 */
export function tierBody(value) {
  const id = Number(value)
  return { tier_id: value !== '' && Number.isInteger(id) && id > 0 ? id : null }
}
