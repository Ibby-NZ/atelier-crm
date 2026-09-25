// Stock rules for the Stock panel on a product's page (src/screens/
// ProductStock.jsx — the Manage stock screen it replaced is retired). Pure, so
// the rules that decide what a quantity MEANS are testable without a DOM or an
// API.
//
// Two invariants come from the API (src/inventory/admin-inventory.js) and are
// mirrored here so the panel refuses a bad edit before sending it:
//
//   - Neither quantity may go below zero. A write-off larger than the shelf is a
//     typo, not an instruction.
//   - `reserved <= available` is deliberately NOT enforced. A short backorder
//     legitimately reserves more than is on hand — that is committed demand, and
//     clamping the two together would quietly discard it. So free stock can be
//     negative, and the screen says so rather than hiding it.

import { toNumber } from './drafts.js'

/**
 * Where a colourway's stock row lives. A stock row has no `id` of its own —
 * inventory is one row per colourway — so every stock endpoint (set, adjust,
 * delete) is addressed by the colourway.
 *
 * @param {{ id: number|string }} colourway
 * @returns {string}
 */
export function inventoryPath(colourway) {
  return `/admin/inventory/${colourway?.id}`
}

/**
 * True when a colourway has no stock row, so it cannot sell or be reserved.
 * The product detail LEFT JOINs inventory and reports `inventory: null` in
 * exactly that case — a deleted row, or a short backorder that left none.
 *
 * @param {{ inventory?: object|null }} [colourway]
 * @returns {boolean}
 */
export function needsStockRow(colourway) {
  return colourway?.inventory == null
}

/**
 * How a stock row is named to a person. The SKU is unique across the catalogue
 * (`colourways_sku_key`), so it identifies the row on its own; the colour name
 * is what staff actually recognise, so it comes along.
 *
 * @param {{ sku?: string, name?: string }} [colourway]
 * @returns {string|undefined} undefined lets the dialog say "this stock row"
 */
export function describeStockRow(colourway) {
  const sku = typeof colourway?.sku === 'string' ? colourway.sku.trim() : ''
  if (sku === '') return undefined
  const colour = typeof colourway?.name === 'string' ? colourway.name.trim() : ''
  return colour === '' ? sku : `${sku} (${colour})`
}

/**
 * Uncommitted stock: what is on the shelf minus what is already promised.
 * Negative means more is reserved than held (an oversell or a live backorder).
 *
 * @param {{qty_available?: number|string, qty_reserved?: number|string}} row
 * @returns {number}
 */
export function freeStock(row = {}) {
  return toNumber(row.qty_available) - toNumber(row.qty_reserved)
}

/**
 * Parse a signed adjustment. Negative writes stock down; blank and zero are
 * both "nothing to do" and are refused so an accidental Apply is not recorded
 * as a movement.
 *
 * @param {string} value
 * @returns {{ok: true, value: number}|{ok: false, error: string}}
 */
export function parseDelta(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return { ok: false, error: 'Enter an amount to add or remove.' }
  const delta = Number(trimmed)
  if (!Number.isFinite(delta)) {
    return { ok: false, error: 'The adjustment must be a number, e.g. 12 or -4.5.' }
  }
  if (delta === 0) return { ok: false, error: 'An adjustment of zero changes nothing.' }
  return { ok: true, value: delta }
}

/**
 * Would this adjustment drive available stock negative? The API answers with a
 * 422; asking here first means the person sees which row is short before a
 * request goes out.
 *
 * @param {{qty_available?: number|string}} row
 * @param {number} delta
 * @returns {boolean}
 */
export function wouldGoNegative(row, delta) {
  return toNumber(row?.qty_available) + delta < 0
}

/**
 * Validate an absolute set of both quantities.
 *
 * @param {{qty_available: string, qty_reserved: string}} draft
 * @returns {{ok: true, value: {qty_available: number, qty_reserved: number}}|{ok: false, error: string}}
 */
export function parseQuantities(draft = {}) {
  const parsed = {}
  for (const [key, label] of [
    ['qty_available', 'Available'],
    ['qty_reserved', 'Reserved'],
  ]) {
    const trimmed = (draft[key] ?? '').toString().trim()
    if (trimmed === '') return { ok: false, error: `${label} cannot be blank.` }
    const amount = Number(trimmed)
    if (!Number.isFinite(amount)) {
      return { ok: false, error: `${label} must be a number.` }
    }
    if (amount < 0) {
      return { ok: false, error: `${label} cannot be negative.` }
    }
    parsed[key] = amount
  }
  return { ok: true, value: parsed }
}

/**
 * Only the quantities that actually moved, so an unchanged row is not PATCHed
 * (the API 400s an empty body, and a no-op write would still touch the row).
 *
 * @returns {{qty_available?: number, qty_reserved?: number}}
 */
export function quantityPatch(row, quantities) {
  const patch = {}
  if (quantities.qty_available !== toNumber(row.qty_available)) {
    patch.qty_available = quantities.qty_available
  }
  if (quantities.qty_reserved !== toNumber(row.qty_reserved)) {
    patch.qty_reserved = quantities.qty_reserved
  }
  return patch
}

/**
 * How a row reads at a glance. `tone` drives the colour token the screen picks:
 * 'low' for nothing free, 'over' when reservations exceed the shelf.
 *
 * @returns {{free: number, tone: 'ok'|'low'|'over', label: string}}
 */
export function describeStock(row = {}) {
  const free = freeStock(row)
  const unit = row.unit ?? ''
  if (free < 0) {
    return { free, tone: 'over', label: `${free} ${unit} — oversold` }
  }
  if (free === 0) {
    return { free, tone: 'low', label: `0 ${unit} free` }
  }
  return { free, tone: 'ok', label: `${free} ${unit} free` }
}
