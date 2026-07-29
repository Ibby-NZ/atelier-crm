// Unit conversion for order quantities — open item F / A11.
// Atelier is supplied in metres; some trade clients (and the yard-based mills) read in yards.
// The single client-facing unit + numeric-quantity decision (F/A11) is still OWED, so orders quote
// in metres and show the yard equivalent as a REFERENCE only. This module pins the exact factor so
// the two figures can never drift, and centralises the free-text→number parse that the
// numeric-quantity decision will eventually make unnecessary.

export const YARDS_PER_METRE = 1.0936133 // exact: 1 / 0.9144

export const metresToYards = (m) => (Number(m) || 0) * YARDS_PER_METRE
export const yardsToMetres = (y) => (Number(y) || 0) / YARDS_PER_METRE

// Quantities are still free text today (e.g. "18 m"); making them numeric is part of F/A11.
export const parseQuantity = (q) => parseFloat(String(q).replace(/[^0-9.]/g, '')) || 0

// Decision 7 (15 Jul): the unit of measure is a standard format — a numeric value followed by a
// text descriptor ("per metre" / "per piece" / "per hide"). These are the descriptors in use.
export const UNITS = ['metre', 'yard', 'piece', 'hide', 'roll', 'panel']
export const UNIT_ABBR = { metre: 'm', yard: 'yd', piece: 'pc', hide: 'hide', roll: 'roll', panel: 'panel' }

// The ratified display format: numeric value + descriptor, e.g. formatQuantity(18) ⇒ '18 m'.
export const formatQuantity = (value, unit = 'metre') => `${value} ${UNIT_ABBR[unit] || unit}`
// The "per <unit>" phrasing decided on 15 Jul, e.g. unitLabel('piece') ⇒ 'per piece'.
export const unitLabel = (unit = 'metre') => `per ${unit}`

// Split a free-text quantity into { value, unit }. '18 m' ⇒ { value:18, unit:'metre' };
// '2 rolls' ⇒ { value:2, unit:'roll' }; a bare number ⇒ metres; junk ⇒ { value:0, unit:'metre' }.
const UNIT_WORDS = {
  m: 'metre', metre: 'metre', metres: 'metre', meter: 'metre', meters: 'metre',
  yd: 'yard', yard: 'yard', yards: 'yard',
  pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece', ea: 'piece', each: 'piece',
  hide: 'hide', hides: 'hide',
  roll: 'roll', rolls: 'roll',
  panel: 'panel', panels: 'panel',
}
export function parseQuantityUnit(q) {
  const value = parseQuantity(q)
  const word = String(q ?? '').toLowerCase().match(/[a-z]+/)?.[0] || ''
  return { value, unit: UNIT_WORDS[word] || 'metre' }
}

// Map an import "Pack Type" cell to a unit descriptor. 'Roll' ⇒ 'roll'; blank/unknown ⇒ 'metre'.
export function unitFromPackType(s) {
  const word = String(s ?? '').toLowerCase().match(/[a-z]+/)?.[0] || ''
  return UNIT_WORDS[word] || 'metre'
}

// Both units from one metre figure: { m, yd, yards: "19.7 yd" }.
export function dualUnit(metres, { dp = 1 } = {}) {
  const m = Number(metres) || 0
  const yd = metresToYards(m)
  return { m, yd, yards: `${yd.toFixed(dp)} yd` }
}
