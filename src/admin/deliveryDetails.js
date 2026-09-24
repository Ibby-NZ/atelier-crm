// An order's delivery details, edited on the order page (23 Sep 2026, the
// client: "add the option to edit the delivery details of an order").
//
//   PATCH /admin/orders/:id { shipping_address }   → { order }
//
// The address lives in `orders.shipping_address` — the one the Stripe webhook,
// the storefront's request and the new-order form all write, and the one the
// packing slip prints as Deliver to. The new-order form still fills it from the
// client's record; this is where the office changes it afterwards: delivery to
// the upholsterer, to site, to a different branch.
//
// **Sent ALONE, the API takes it until the order ships** (every status that
// still holds stock, paid included) — the notes-only posture. Once shipped the address is the record of
// where the order went, so the page stops offering the edit rather than
// drawing a button that answers 409.
//
// Pure, so the rules are tested without a DOM (deliveryDetails.test.js).

import { HELD_STATUSES } from './orderFlow.js'

// The API's DELIVERY_EDIT_STATUSES (src/orders/order-states.js) — every held status.
export const DELIVERY_EDIT_STATUSES = HELD_STATUSES

// The form, in the order a delivery is written. `max` is the API schema's
// maxLength for the key (SHIPPING_ADDRESS_SCHEMA), so the box stops where the
// API would refuse. `phone` and `instructions` are not Stripe's — the office
// adds them, and the packing slip prints both under the address.
export const DELIVERY_FIELDS = Object.freeze([
  { key: 'name', label: 'Deliver to', max: 200, hint: 'The company or person receiving it.' },
  { key: 'line1', label: 'Street address', max: 200 },
  { key: 'line2', label: 'Address line 2', max: 200, hint: 'Suburb, c/o, unit or floor.' },
  { key: 'city', label: 'Town / city', max: 100 },
  { key: 'postal_code', label: 'Postcode', max: 20, mono: true },
  { key: 'state', label: 'Region', max: 100 },
  { key: 'country', label: 'Country', max: 100 },
  { key: 'phone', label: 'Delivery phone', max: 50, mono: true, hint: 'Whoever receives it — often not the client.' },
  {
    key: 'instructions',
    label: 'Delivery instructions',
    max: 500,
    multiline: true,
    hint: 'Printed on the packing slip under the address, e.g. “Mark parcel: Lounge”.',
  },
])

/** Whether the page offers Edit delivery for this order. */
export const canEditDelivery = (order) =>
  Boolean(order) && !order.archived_at && DELIVERY_EDIT_STATUSES.includes(order.status)

/**
 * The form's starting values: the order's address, every field a string.
 *
 * @param {object|null} [address] order.shipping_address
 * @returns {Record<string, string>}
 */
export const deliveryDraftFrom = (address) =>
  Object.fromEntries(
    DELIVERY_FIELDS.map(({ key }) => [key, typeof address?.[key] === 'string' ? address[key] : ''])
  )

const trimmed = (draft) =>
  Object.fromEntries(DELIVERY_FIELDS.map(({ key }) => [key, String(draft?.[key] ?? '').trim()]))

export const DELIVERY_NEEDS_WHERE =
  'Add a street address or a town/city — or clear every field to remove the delivery address.'

/**
 * The PATCH body for a delivery edit.
 *
 *  - nothing moved → `{ ok: true, patch: null }` (the page says so; no request)
 *  - every field emptied → `shipping_address: null`, which removes the address
 *    (an order collected from the showroom)
 *  - a name or phone with no street and no town → refused here, in the API's
 *    own terms (it answers 422 to the same body)
 *  - otherwise the whole address, blanks as null, so a cleared line clears
 *
 * @param {object|null} current order.shipping_address as the API last sent it
 * @param {Record<string, string>} draft
 * @returns {{ ok: true, patch: { shipping_address: object|null } | null } | { ok: false, error: string }}
 */
export function buildDeliveryPatch(current, draft) {
  const next = trimmed(draft)
  const before = trimmed(deliveryDraftFrom(current))
  if (DELIVERY_FIELDS.every(({ key }) => next[key] === before[key])) {
    return { ok: true, patch: null }
  }
  if (Object.values(next).every((value) => value === '')) {
    return { ok: true, patch: { shipping_address: null } }
  }
  if (!next.line1 && !next.city) return { ok: false, error: DELIVERY_NEEDS_WHERE }
  return {
    ok: true,
    patch: {
      shipping_address: Object.fromEntries(DELIVERY_FIELDS.map(({ key }) => [key, next[key] || null])),
    },
  }
}
