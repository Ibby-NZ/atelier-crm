// A house's pricing — the rules behind the Pricing panel on the house's own
// page (HousePricingPanel) and the Dynamics export upload on the Houses list
// (HousePricingImport). atelier-api /admin/pricing/houses/*.
//
// The office asked (Sept 2026) for every figure on the Dynamics "Active
// Tracking Options" export — duty A/B/C, clearance, freight, discount, trade
// markup, the small-order surcharge — to sit on its house and be editable
// there. The API keeps each figure in its ONE home (the house's parameter set,
// the supplier terms, the freight ledger) and this screen never needs to know
// which: it reads one `pricing` object and PUTs one body. Three things it does
// have to honour:
//
//   - The parameter set is a PUT: every column travels, a blank one CLEARS.
//     `buildSaveBody` sends the whole set, so nothing is cleared by omission.
//   - The discount and the freight are sent ONLY when the office changed them.
//     Absent means "leave it" to the API; sending the discount the house merely
//     inherits from its supplier would write terms nobody asked for, and
//     re-sending an unchanged freight rate would be a pointless ledger check.
//   - Freight is a new DATED rate, never an edit (the ledger is append-only),
//     so a changed rate carries a unit and an "effective from" day.
//
// Percentages are as the office writes them (5 is 5%) on every field, the
// discount included — the API converts to the terms' fraction.
//
// Pure — no jsdom in this repo, so every rule lives here and is tested from
// ./housePricing.test.js; the .jsx files are layout.

import { UNITS } from '../utils/units.js'
import { FREIGHT_CLASS_LETTERS } from './adminFreight.js'

export const housePricingPath = (id) => `/admin/pricing/houses/${id}`
export const IMPORT_VALIDATE_PATH = '/admin/pricing/houses/import/validate'
export const IMPORT_APPLY_PATH = '/admin/pricing/houses/import/apply'
/** Stated on the upload, never forwarded from the file (the API parses this type as bytes). */
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export const FREIGHT_UNITS = Object.freeze([...UNITS])

/** How the clearance figure is read (the API's `clearance_basis`); NULL reads as percent. */
export const CLEARANCE_BASES = Object.freeze([
  Object.freeze({ value: 'percent', label: '%' }),
  Object.freeze({ value: 'dollar', label: '$ per unit' }),
])

/**
 * The parameter-set fields, in the order the Dynamics export lists them, then
 * the two the export does not carry. `unit` is what the box is in.
 */
export const PARAMETER_FIELDS = Object.freeze([
  Object.freeze({ key: 'duty_percent_a', label: 'Duty A', unit: '%' }),
  Object.freeze({ key: 'duty_percent_b', label: 'Duty B', unit: '%' }),
  Object.freeze({ key: 'duty_percent_c', label: 'Duty C', unit: '%' }),
  Object.freeze({ key: 'clearance_percent', label: 'Clearance', unit: '%' }),
  Object.freeze({ key: 'trade_markup_percent', label: 'Trade markup', unit: '%' }),
  // On the TRADE sell: 30 is retail = trade × 1.30 (Dynamics' rule; the API's
  // migration 1792358400000). The ranges import fills it from Dynamics' prices.
  Object.freeze({ key: 'retail_markup_percent', label: 'Retail markup', unit: '% on trade' }),
  Object.freeze({ key: 'surcharge_min_qty', label: 'Min qty to avoid surcharge', unit: 'units' }),
  Object.freeze({ key: 'surcharge_per_unit', label: 'Surcharge', unit: '$ / unit' }),
  Object.freeze({ key: 'fx_margin_percent', label: 'FX margin', unit: '%' }),
  Object.freeze({ key: 'handling', label: 'Handling', unit: '$ / unit' }),
])

const FIELD_BY_KEY = new Map(PARAMETER_FIELDS.map((field) => [field.key, field]))

/** Every field an import change line can name. */
export const CHANGE_FIELD_LABELS = Object.freeze({
  ...Object.fromEntries(PARAMETER_FIELDS.map((field) => [field.key, field.label])),
  discount_percent: 'Discount',
  freight: 'Freight',
})

/** Today as the office's own calendar day — the default "effective from". */
export const localToday = (now = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const text = (value) => (value == null ? '' : String(value))

/**
 * The form's starting values: the house's OWN figures only. A value the house
 * inherits (its supplier's default, its supplier's freight) is a placeholder,
 * never a typed value — saving the form must not copy it onto the house.
 *
 * @param {object|null} pricing  GET /admin/pricing/houses/:id → pricing
 */
export function draftFrom(pricing, today = localToday()) {
  const parameters = pricing?.parameters ?? {}
  const discount = pricing?.discount
  // The current rate's own unit (none on a percent rate, and inventing one
  // would read as an edit); the unit the house's price lines are quoted in
  // only when there is no rate yet.
  const unitFor = (rate) => (rate ? (rate.unit ?? '') : (pricing?.freight_unit_hint ?? ''))
  const classRates = new Map((pricing?.freight_classes ?? []).map((rate) => [rate.freight_class, rate]))
  return {
    ...Object.fromEntries(PARAMETER_FIELDS.map((field) => [field.key, text(parameters[field.key])])),
    note: text(parameters.note),
    clearance_basis: parameters.clearance_basis === 'dollar' ? 'dollar' : 'percent',
    discount_percent: discount?.source === 'house' ? text(discount.percent) : '',
    discount_classes: (discount?.classes ?? []).map((entry) => ({
      key: `class-${entry.id}`,
      id: entry.id,
      label: entry.label,
      percent: text(entry.percent),
      is_default: entry.is_default === true,
    })),
    freight_rate: text(pricing?.freight?.rate),
    freight_unit: unitFor(pricing?.freight),
    // One row per letter the house has a rate for or its price lines carry.
    freight_classes: Object.fromEntries(
      freightClassLetters(pricing).map((letter) => {
        const rate = classRates.get(letter)
        return [letter, { rate: text(rate?.rate), unit: unitFor(rate) }]
      })
    ),
    freight_from: today,
  }
}

/**
 * Every freight letter the house has a rate for or its price lines carry, in
 * order — the rows the Freight classes block starts with. Only A..E: a line
 * letter past E cannot hold a rate, so it pays the house's rate and gets no row.
 */
export function freightClassLetters(pricing) {
  const letters = new Set([
    ...(pricing?.freight_classes ?? []).map((rate) => rate.freight_class),
    ...(pricing?.freight_class_lines ?? []).map((row) => row.freight_class),
  ])
  return [...letters].filter((letter) => FREIGHT_CLASS_LETTERS.includes(letter)).sort()
}

/** The letters not yet on the form, for "Add a freight class". */
export const unusedFreightLetters = (draft) =>
  FREIGHT_CLASS_LETTERS.filter((letter) => !Object.hasOwn(draft?.freight_classes ?? {}, letter))

/** The draft without one freight letter's row. Saved, its own rate is removed. */
export const withoutFreightClass = (draft, letter) => {
  const { [letter]: _gone, ...rest } = draft?.freight_classes ?? {}
  return { ...draft, freight_classes: rest }
}

/**
 * Whether a letter's row can be removed: it has a rate of its own, or it was
 * added on this form. A letter only the price lines carry already pays the
 * house's rate — there is nothing of its own to remove.
 */
export const canRemoveFreightClass = (pricing, letter) => {
  const rated = (pricing?.freight_classes ?? []).some((rate) => rate.freight_class === letter)
  const carried = (pricing?.freight_class_lines ?? []).some((row) => row.freight_class === letter)
  return rated || !carried
}

/** Letters whose own rate this form removes on save. */
export const removedFreightClasses = (pricing, draft) =>
  (pricing?.freight_classes ?? [])
    .map((rate) => rate.freight_class)
    .filter((letter) => !Object.hasOwn(draft?.freight_classes ?? {}, letter))
    .sort()

/**
 * "Removed when you save: freight class B, discount class Wallpaper." — or ''.
 * A removal only takes the row off the form; the Save pricing button writes it.
 */
export const pendingRemovalNote = (pricing, draft) => {
  const kept = new Set((draft?.discount_classes ?? []).map((row) => row.id).filter((id) => id != null))
  const parts = [
    ...removedFreightClasses(pricing, draft).map((letter) => `freight class ${letter}`),
    ...(pricing?.discount?.classes ?? []).filter((entry) => !kept.has(entry.id)).map((entry) => `discount class ${entry.label}`),
  ]
  return parts.length === 0 ? '' : `Removed when you save: ${parts.join(', ')}. Press Save pricing to keep the change.`
}

/** The draft with an empty row for a new letter. */
export const withFreightClass = (draft, letter, unit = '') => ({
  ...draft,
  freight_classes: { ...(draft.freight_classes ?? {}), [letter]: { rate: '', unit } },
})

let newClassSerial = 0

/** The draft with a blank discount class at the end. */
export const withDiscountClass = (draft) => ({
  ...draft,
  discount_classes: [
    ...(draft.discount_classes ?? []),
    { key: `new-${(newClassSerial += 1)}`, id: null, label: '', percent: '', is_default: false },
  ],
})

/** The draft with one discount class's field changed; `is_default` is exclusive. */
export const withDiscountClassField = (draft, key, field, value) => ({
  ...draft,
  discount_classes: (draft.discount_classes ?? []).map((entry) => {
    if (field === 'is_default') return { ...entry, is_default: entry.key === key ? value : false }
    return entry.key === key ? { ...entry, [field]: value } : entry
  }),
})

/** The draft without one discount class. */
export const withoutDiscountClass = (draft, key) => ({
  ...draft,
  discount_classes: (draft.discount_classes ?? []).filter((entry) => entry.key !== key),
})

/** What removing a class does to the products that chose it, or '' when none did. */
export function classRemovalNote(entry) {
  const products = Number(entry?.products) || 0
  if (products === 0) return ''
  return `${products} product${products === 1 ? '' : 's'} chose this class — removing it sends ${products === 1 ? 'it' : 'them'} back to matching by category.`
}

/** "12 price lines" beside a freight letter, or why the letter has a row at all. */
export function freightClassHint(pricing, letter) {
  const lines = (pricing?.freight_class_lines ?? []).find((row) => row.freight_class === letter)?.lines ?? 0
  const rate = (pricing?.freight_classes ?? []).find((row) => row.freight_class === letter)
  const used = lines > 0 ? `${lines} price line${lines === 1 ? '' : 's'}` : 'no price lines carry it'
  return rate ? `${used} · current ${freightRateText(rate)} from ${rate.effective_from}` : `${used} · pays the house rate`
}

/**
 * What a blank box falls back to, as a placeholder — "5 (supplier default)" —
 * or '' when nothing does.
 */
export function placeholderFor(key, pricing) {
  if (key === 'discount_percent') {
    const discount = pricing?.discount
    return discount?.source === 'supplier' && discount.percent != null
      ? `${discount.percent} (supplier's averaged rate)`
      : ''
  }
  if (key === 'freight_rate') {
    const rate = pricing?.supplier_freight
    return rate ? `${freightRateText(rate)} (supplier rate)` : ''
  }
  const inherited = pricing?.supplier_parameters?.[key]
  return inherited == null ? '' : `${inherited} (supplier default)`
}

// '' is "not set" (null); anything else must be a number of zero or more.
const parseAmount = (label, raw) => {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { value: null }
  const number = Number(trimmed)
  if (!Number.isFinite(number)) return { error: `${label} must be a number.` }
  if (number < 0) return { error: `${label} cannot be negative.` }
  return { value: number }
}

const sameNumber = (left, right) =>
  left == null || right == null ? left == null && right == null : Math.abs(Number(left) - Number(right)) < 1e-9

/**
 * The PUT body, or the first thing wrong with the form.
 *
 * @param {object} pricing  what the page last read
 * @param {object} draft    the form's values (strings)
 * @returns {{ body: object|null, error: string|null }}
 */
export function buildSaveBody(pricing, draft) {
  const parameters = {}
  for (const field of PARAMETER_FIELDS) {
    const parsed = parseAmount(field.label, draft[field.key])
    if (parsed.error) return { body: null, error: parsed.error }
    parameters[field.key] = parsed.value
  }
  const note = String(draft.note ?? '').trim()
  parameters.note = note === '' ? null : note
  // The parameter set is a PUT: the basis travels every time, or a save clears it.
  parameters.clearance_basis = draft.clearance_basis === 'dollar' ? 'dollar' : 'percent'
  const body = { parameters }

  // The discount: only when the office changed the house's own figure.
  const discount = pricing?.discount
  const saved = discount?.source === 'house' ? discount.percent : null
  const typed = parseAmount('Discount', draft.discount_percent)
  if (typed.error) return { body: null, error: typed.error }
  if (!sameNumber(typed.value, saved)) {
    if (!discount?.editable) {
      return { body: null, error: discount?.reason ?? 'The discount cannot be changed here.' }
    }
    if (typed.value != null && typed.value >= 100) {
      return { body: null, error: 'Discount must be below 100%.' }
    }
    body.discount_percent = typed.value
  }

  // Discount classes: the whole set, only when the office changed it.
  const classes = discountClassesChange(pricing, draft)
  if (classes.error) return { body: null, error: classes.error }
  if (classes.value) body.discount_classes = classes.value

  // Freight: a new dated rate, only when the rate or its unit changed — for
  // the house's every-class rate and for each letter.
  const from = String(draft.freight_from ?? '').trim()
  const freight = freightRateChange('Freight', pricing?.freight ?? null, draft.freight_rate, draft.freight_unit, from)
  if (freight.error) return { body: null, error: freight.error }
  if (freight.value) body.freight = freight.value

  const classRates = new Map((pricing?.freight_classes ?? []).map((rate) => [rate.freight_class, rate]))
  const letters = []
  for (const letter of Object.keys(draft.freight_classes ?? {}).sort()) {
    const row = draft.freight_classes[letter]
    const change = freightRateChange(`Freight class ${letter}`, classRates.get(letter) ?? null, row.rate, row.unit, from)
    if (change.error) return { body: null, error: change.error }
    if (change.value) letters.push({ freight_class: letter, ...change.value })
  }
  if (letters.length > 0) body.freight_classes = letters
  const removed = removedFreightClasses(pricing, draft)
  if (removed.length > 0) body.remove_freight_classes = removed

  return { body, error: null }
}

/**
 * One freight rate's edit: `{}` when there is nothing to send (blank and never
 * set, or unchanged), `{ value }` for a new dated rate, `{ error }` otherwise.
 */
function freightRateChange(label, current, rawRate, rawUnit, from) {
  const rate = parseAmount(label, rawRate)
  if (rate.error) return { error: rate.error }
  const unit = String(rawUnit ?? '').trim()
  if (rate.value == null) {
    return current
      ? { error: `${label} cannot be cleared — the ledger keeps every rate. Enter the new rate instead.` }
      : {}
  }
  const unchanged =
    current &&
    (current.basis === 'dollar'
      ? sameNumber(rate.value, current.rate) && unit === (current.unit ?? '')
      : // A percent-basis rate shown back unchanged is not an edit.
        sameNumber(rate.value, current.rate) && unit === '')
  if (unchanged) return {}
  if (!FREIGHT_UNITS.includes(unit)) {
    const what = label === 'Freight' ? 'the freight rate' : `the rate for ${label.replace(/^Freight/, 'freight')}`
    return { error: `Choose what ${what} is per — metre, roll, piece…` }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { error: 'Choose the day the new freight rate takes effect.' }
  }
  return { value: { rate: rate.value, unit, effective_from: from } }
}

/**
 * The discount classes as the API takes them (`[{ id?, label, percent,
 * is_default }]`), or nothing when they match what the house already has.
 * Checked here in the API's own terms: every class named and rated below 100%,
 * no two names alike (ignoring case), at most one default.
 */
function discountClassesChange(pricing, draft) {
  const current = pricing?.discount?.classes ?? []
  const rows = draft.discount_classes ?? []
  const next = []
  const names = new Set()
  for (const row of rows) {
    const label = String(row.label ?? '').trim()
    if (label === '') return { error: 'Name every discount class, or remove the blank one.' }
    const key = label.toLowerCase()
    if (names.has(key)) return { error: `Two discount classes are called "${label}".` }
    names.add(key)
    const percent = parseAmount(`Discount class "${label}"`, row.percent)
    if (percent.error) return { error: percent.error }
    if (percent.value == null) return { error: `Discount class "${label}" needs a percentage.` }
    if (percent.value >= 100) return { error: `Discount class "${label}" must be below 100%.` }
    next.push({ ...(row.id != null ? { id: row.id } : {}), label, percent: percent.value, is_default: row.is_default === true })
  }
  if (next.filter((entry) => entry.is_default).length > 1) {
    return { error: 'Only one discount class can be the default.' }
  }
  const byId = new Map(current.map((entry) => [entry.id, entry]))
  const same =
    next.length === current.length &&
    next.every((entry) => {
      const was = entry.id == null ? null : byId.get(entry.id)
      return (
        was != null &&
        was.label === entry.label &&
        sameNumber(was.percent, entry.percent) &&
        (was.is_default === true) === entry.is_default
      )
    })
  if (same) return {}
  if (!pricing?.discount?.editable) {
    return { error: pricing?.discount?.reason ?? 'The discount classes cannot be changed here.' }
  }
  return { value: next }
}

/** "5% — this house" style note under the discount box. */
export function discountNote(discount) {
  if (!discount) return ''
  if (!discount.editable) return discount.reason ?? ''
  // With classes, the flat rate is what is left: a product's class wins.
  const rest = (discount.classes ?? []).length > 0 ? ' It covers every product no class does.' : ''
  if (discount.source === 'supplier') {
    return `Blank uses the supplier's averaged rate. A figure here is this house's own flat discount.${rest}`
  }
  if (discount.source === 'missing') return `No discount on file for this house or its supplier.${rest}`
  return `This house's own flat discount, kept on the supplier's terms.${rest}`
}

/** How a house's discount classes are picked, under the classes table. */
export const DISCOUNT_CLASSES_NOTE =
  "A product's class is the one chosen on its page, else the class named after its category, else the default class. The flat discount covers the rest."

/** "$30 / metre" — or "8% of the duty-paid value" for a percent-basis rate. */
export const freightRateText = (rate) =>
  rate.basis === 'percent'
    ? `${rate.rate}% of the duty-paid value`
    : `$${rate.rate}${rate.unit ? ` / ${rate.unit}` : ''}`

/** The house's current freight, or what covers it when it has none. */
export function freightNote(pricing) {
  const own = pricing?.freight
  if (own) {
    return `Current: ${freightRateText(own)} from ${own.effective_from}. A new figure is added as a new dated rate; the old one stays as history.`
  }
  const supplier = pricing?.supplier_freight
  if (supplier) return `No rate of its own — the supplier's ${freightRateText(supplier)} applies.`
  return 'No freight rate on file.'
}

// --- the upload ---------------------------------------------------------------

/**
 * The validate/apply URL. `overwrite` replaces saved values the export
 * disagrees with; the filename carries the export's timestamp.
 */
export function importPath(step, { overwrite = false, filename = '' } = {}) {
  const params = new URLSearchParams()
  if (overwrite) params.set('overwrite', 'true')
  const name = String(filename ?? '').replace(/[\u0000-\u001f/\\]/g, '').slice(0, 200)
  if (name) params.set('filename', name)
  const query = params.toString()
  return `${step === 'apply' ? IMPORT_APPLY_PATH : IMPORT_VALIDATE_PATH}${query ? `?${query}` : ''}`
}

/**
 * Why this file cannot be uploaded, or null. Only the mistakes the API would
 * answer less readably; the export's contents are the API's to judge.
 */
export function importFileProblem(file) {
  if (!file) return 'Choose the Dynamics export first.'
  if (!/\.xlsx$/i.test(typeof file.name === 'string' ? file.name : '')) {
    return 'That is not an .xlsx workbook. Upload the "Active Tracking Options" export exactly as Dynamics saved it.'
  }
  const size = Number(file.size)
  if (Number.isFinite(size)) {
    if (size === 0) return 'That file is empty.'
    if (size > MAX_IMPORT_BYTES) return 'That file is larger than 2 MB — the tracking-options export is a few dozen rows.'
  }
  return null
}

export const CHANGE_KIND_LABELS = Object.freeze({
  fill: 'Fill',
  replace: 'Replace',
  kept: 'Kept — differs',
})

/** A value on a change line as the office reads it. */
export function changeValueText(line, side) {
  const value = side === 'from' ? line.from : line.to
  if (value == null) return '—'
  if (line.field === 'freight') {
    const unit = side === 'from' ? line.from_unit : line.unit
    return `$${value}${unit ? ` / ${unit}` : ''}`
  }
  if (line.field === 'discount_percent') return `${value}%`
  const unit = FIELD_BY_KEY.get(line.field)?.unit
  if (unit === '%') return `${value}%`
  if (unit === '$ / unit') return `$${value}`
  return String(value)
}

/** Change lines grouped by house, in the order the export listed them. */
export function groupChanges(changes = []) {
  const houses = new Map()
  for (const line of changes) {
    const house = houses.get(line.brand_id) ?? { brand_id: line.brand_id, brand: line.brand, range: line.range, lines: [] }
    houses.set(line.brand_id, { ...house, lines: [...house.lines, line] })
  }
  return [...houses.values()]
}

/**
 * One house's lines split for the report: the blanks the export fills — read
 * as ONE row, because a first import fills six or seven figures on every
 * house and a row each made the report two hundred rows long — and the lines
 * that are a decision (replace, or kept because the house says otherwise),
 * each on its own row.
 */
export function houseReportRows(house) {
  const lines = house?.lines ?? []
  return {
    fills: lines.filter((line) => line.kind === 'fill'),
    decisions: lines.filter((line) => line.kind !== 'fill'),
  }
}

/** "Duty A 5% · Clearance 10% · Freight $28 / metre" — the fills in one line. */
export const fillSummaryText = (lines = []) =>
  lines.map((line) => `${CHANGE_FIELD_LABELS[line.field] ?? line.field} ${changeValueText(line, 'to')}`).join(' · ')

/** Whether Apply would write anything. */
export const canApply = (result) =>
  Boolean(result?.dry_run) && (Number(result.values_filled) > 0 || Number(result.values_replaced) > 0)

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** One line under the report's heading. */
export function importSummaryLine(result) {
  if (!result) return ''
  const matched = `${plural(Number(result.houses_matched) || 0, 'house')} matched of ${plural(Number(result.ranges) || 0, 'range')}`
  const fill = Number(result.values_filled) || 0
  const replace = Number(result.values_replaced) || 0
  const kept = Number(result.values_kept) || 0
  const verb = result.dry_run ? ['to fill', 'to replace'] : ['filled', 'replaced']
  return `${matched} · ${fill} ${verb[0]} · ${replace} ${verb[1]} · ${kept} kept`
}

/** The worklist under the changes, in the words the office acts on. */
export const IMPORT_REPORTS = Object.freeze([
  Object.freeze({
    key: 'rangesWithoutBrand',
    title: 'Ranges with no house of that name — nothing applied',
    line: (row) => `${row.range}${row.supplier ? ` (${row.supplier})` : ''}`,
  }),
  Object.freeze({
    key: 'brandsWithoutSupplier',
    title: 'Houses with no supplier linked — discount not written (link the supplier on the house page)',
    line: (row) => row.brand,
  }),
  Object.freeze({
    key: 'termsAlreadyOnFile',
    title: "Houses on a discount chain or tiers — left alone (edit on the supplier's terms)",
    line: (row) => row.brand,
  }),
  Object.freeze({
    key: 'freightWithoutUnit',
    title: 'Freight not written — no unit known for the house (set it on the house page)',
    line: (row) => `${row.brand}: $${row.rate}`,
  }),
  Object.freeze({
    key: 'freightDatedToday',
    title: 'Freight not replaced — the house already has a rate dated today',
    line: (row) => `${row.brand}: $${row.current} kept (export says $${row.rate})`,
  }),
  Object.freeze({
    key: 'brandsWithSeveralRanges',
    title: 'Houses named by more than one range — the first was used',
    line: (row) => `${row.brand}: used ${row.kept}, skipped ${row.skipped}`,
  }),
  Object.freeze({
    key: 'inactiveRanges',
    title: 'Inactive ranges — skipped',
    line: (row) => row.range,
  }),
])

/** Only the report sections that have rows. */
export const reportSections = (reports = {}) =>
  IMPORT_REPORTS.map((section) => ({ ...section, rows: reports?.[section.key] ?? [] })).filter(
    (section) => section.rows.length > 0
  )

/**
 * A 422 that carries per-cell reasons, as a report; null for any other error
 * (which is the ordinary error line).
 */
export function importRefusal(error) {
  if (!error || error.status !== 422) return null
  const body = error.body ?? {}
  return Object.freeze({
    message: typeof body.message === 'string' && body.message ? body.message : 'That file could not be read.',
    errors: Array.isArray(body.errors) ? body.errors.filter((entry) => typeof entry === 'string') : [],
    errorCount: Number.isFinite(body.error_count) ? body.error_count : 0,
  })
}
