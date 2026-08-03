// Form-draft plumbing shared by every live back-office screen (products,
// brands, stock, supplier rates, orders).
//
// Two jobs, both pure so they unit-test without a DOM:
//
//   draftFrom(record, fields)      DB row  → editable string draft
//   diffFields(record, draft, f)   draft   → { patch } | { error }
//
// `diffFields` returns ONLY the changed keys. That is not an optimisation: the
// API 400s an empty PATCH body (`minProperties: 1`) and several columns are
// create-only, so sending a whole record back would fail or be rejected. It
// also keeps an explicit clear (`''` → null) distinct from "untouched", which is
// the same distinction `Object.hasOwn` draws in the API's buildUpdate.
//
// A field is declared once, as { key, label, kind }, and both directions read
// the same declaration — so a screen cannot format a value one way and parse it
// another.

const HEX_TONE_PATTERN = /^#[0-9a-fA-F]{6}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// --- value coercion -------------------------------------------------------

// Blank (or whitespace-only) input clears a nullable column.
export function blankToNull(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

// Money is integer cents in the API; every form works in dollars, because
// staff type "186.00", not "18600".
export function centsToDollars(cents) {
  return cents == null ? '' : (Number(cents) / 100).toFixed(2)
}

export function parseDollars(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, value: null }
  return { ok: true, value: Math.round(amount * 100) }
}

// hex_tones is a jsonb array of '#rrggbb'. The form keeps it a plain text input
// (a comma-separated list) rather than a colour-picker array, so it is parsed
// and REJECTED here — a malformed tone must never reach the API as a 500.
export function parseTones(value) {
  const parts = (value ?? '')
    .split(',')
    .map((tone) => tone.trim())
    .filter(Boolean)
  if (parts.length === 0) return { ok: true, value: null }
  if (!parts.every((tone) => HEX_TONE_PATTERN.test(tone))) {
    return { ok: false, value: null }
  }
  return { ok: true, value: parts }
}

export function tonesToText(hexTones) {
  return Array.isArray(hexTones) ? hexTones.join(', ') : ''
}

// A Postgres `date` arrives from pg as a JS Date (or as a string over JSON).
// `<input type="date">` wants exactly YYYY-MM-DD, so both forms are narrowed to
// that. Sliced from the ISO string rather than built from getMonth() — a local
// -to-UTC round trip would shift a NZ date by a day.
export function toDateInput(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    return ISO_DATE_PATTERN.test(value.slice(0, 10)) ? value.slice(0, 10) : ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return ''
}

function parseDate(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  return ISO_DATE_PATTERN.test(trimmed)
    ? { ok: true, value: trimmed }
    : { ok: false, value: null }
}

// A public link (the storefront renders it as an href), so only absolute
// http(s) URLs pass — mirrors the API's websiteUrlFrom 422 rule, caught here so
// the mistake is named before a round trip.
export function parseUrl(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? { ok: true, value: trimmed }
      : { ok: false, value: null }
  } catch {
    return { ok: false, value: null }
  }
}

// numeric(12,4) in the supplier's own currency — not cents, and not rounded.
function parseDecimal(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const amount = Number(trimmed)
  if (!Number.isFinite(amount)) return { ok: false, value: null }
  return { ok: true, value: amount }
}

// --- per-kind read / write ------------------------------------------------

// How a stored value becomes the string an <input> holds.
const FORMATTERS = {
  text: (v) => v ?? '',
  enum: (v) => v ?? '',
  upper: (v) => v ?? '',
  money: centsToDollars,
  decimal: (v) => (v == null ? '' : String(v)),
  tones: tonesToText,
  bool: (v) => Boolean(v),
  ref: (v) => (v == null ? '' : String(v)),
  date: toDateInput,
  url: (v) => v ?? '',
}

// How that string becomes the value the API is sent. Each returns
// { ok, value } — never throws, so a screen can report the field that failed.
const PARSERS = {
  text: (raw) => ({ ok: true, value: blankToNull(raw) }),
  enum: (raw) => ({ ok: true, value: blankToNull(raw) }),
  upper: (raw) => {
    const next = blankToNull(raw)
    if (next == null) return { ok: true, value: null }
    const code = next.toUpperCase()
    return CURRENCY_PATTERN.test(code)
      ? { ok: true, value: code }
      : { ok: false, value: null }
  },
  money: parseDollars,
  decimal: parseDecimal,
  date: parseDate,
  tones: parseTones,
  url: parseUrl,
  bool: (raw) => ({ ok: true, value: Boolean(raw) }),
  ref: (raw) => {
    const next = blankToNull(raw)
    if (next == null) return { ok: true, value: null }
    const id = Number(next)
    return Number.isInteger(id) && id > 0
      ? { ok: true, value: id }
      : { ok: false, value: null }
  },
}

// The message shown when a kind refuses its input. Phrased for a person, since
// it lands directly in the screen's error line.
const HINTS = {
  upper: 'must be a three-letter currency code, e.g. NZD.',
  money: 'must be an amount in dollars, e.g. 129.50.',
  decimal: 'must be a number, e.g. 12.5000.',
  date: 'must be a date, e.g. 2026-07-01.',
  tones: 'must be comma-separated hex codes, e.g. #AABBCC, #112233.',
  ref: 'is not a valid selection.',
  url: 'must be a full web address, e.g. https://www.pierrefrey.com.',
}

// Two values are "the same" for diffing purposes. Tones are arrays, so they
// compare by their text form; everything else is a scalar after parsing.
function sameValue(kind, left, right) {
  if (kind === 'tones') return tonesToText(left) === tonesToText(right)
  if (kind === 'bool') return Boolean(left) === Boolean(right)
  // A date arrives from pg as a Date and leaves as 'YYYY-MM-DD'; comparing the
  // two forms directly would report every unchanged date as an edit.
  if (kind === 'date') return toDateInput(left) === toDateInput(right)
  const a = left === undefined ? null : left
  const b = right === undefined ? null : right
  return a === b
}

// --- the two public directions -------------------------------------------

/**
 * Build an editable draft from a record. Every declared field is present, so a
 * controlled input never flips between undefined and a string.
 *
 * @param {object} record
 * @param {ReadonlyArray<{key: string, kind?: string}>} fields
 * @returns {object}
 */
export function draftFrom(record = {}, fields = []) {
  const draft = {}
  for (const field of fields) {
    const format = FORMATTERS[field.kind ?? 'text'] ?? FORMATTERS.text
    draft[field.key] = format(record[field.key])
  }
  return draft
}

/**
 * Diff a draft against the record it came from.
 *
 * @param {object} record  the row as the API last returned it
 * @param {object} draft   the form state
 * @param {ReadonlyArray<{key: string, label: string, kind?: string, required?: boolean}>} fields
 * @returns {{patch: object}|{error: string}}
 */
export function diffFields(record = {}, draft = {}, fields = []) {
  const patch = {}
  for (const field of fields) {
    const kind = field.kind ?? 'text'
    const parsed = (PARSERS[kind] ?? PARSERS.text)(draft[field.key])
    if (!parsed.ok) {
      return { error: `${field.label} ${HINTS[kind] ?? 'is not valid.'}` }
    }
    if (field.required && (parsed.value == null || parsed.value === '')) {
      return { error: `${field.label} is required.` }
    }
    if (!sameValue(kind, parsed.value, record[field.key] ?? null)) {
      patch[field.key] = parsed.value
    }
  }
  return { patch }
}

/**
 * Build a create body: every declared field, changed or not, blanks as null.
 * Unlike a PATCH, a create has no prior row to diff against.
 *
 * @returns {{body: object}|{error: string}}
 */
export function bodyFrom(draft = {}, fields = []) {
  const body = {}
  for (const field of fields) {
    const kind = field.kind ?? 'text'
    const parsed = (PARSERS[kind] ?? PARSERS.text)(draft[field.key])
    if (!parsed.ok) {
      return { error: `${field.label} ${HINTS[kind] ?? 'is not valid.'}` }
    }
    if (field.required && (parsed.value == null || parsed.value === '')) {
      return { error: `${field.label} is required.` }
    }
    body[field.key] = parsed.value
  }
  return { body }
}

// pg hands back numeric columns as strings ('60.00'); anything doing arithmetic
// or an equality check on a quantity must go through this first.
export const toNumber = (value) => (value == null ? 0 : Number(value))
