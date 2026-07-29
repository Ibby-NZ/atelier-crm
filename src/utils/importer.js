// Import-engine resolution: map a parsed price-list sheet onto the pricing waterfall.
// Pure functions — the screen only renders what these return. Validation happens HERE,
// before any FX call, because fxInfo's EUR fallback must never mask a bad row.

import { IMPORT_COLUMNS } from '../data/importSamples.js'
import { isKnownCurrency } from '../data/fx.js'
import { resolveDiscount, chainLabel } from '../data/discounts.js'
import { computeWaterfall, pricingInputs } from '../data/pricing.js'
import { normalizeSupplierCode } from './sku.js'
import { unitFromPackType } from './units.js'

const DUTY_PLACEHOLDER = 0.07 // pending the broker's range-level duty table (A10)
const FREIGHT_DEFAULT = 0.08 // range-level default when the sheet leaves Freight Rate blank

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Match the file's header against the known template columns (normalized exact match).
export function autoMapColumns(header) {
  const wanted = IMPORT_COLUMNS.map((name) => ({ name, key: norm(name) }))
  const map = {}
  const extras = []
  header.forEach((h, idx) => {
    const hit = wanted.find((w) => w.key === norm(h))
    if (hit && map[hit.name] == null) map[hit.name] = idx
    else extras.push(h)
  })
  return {
    map,
    mapped: IMPORT_COLUMNS.filter((n) => map[n] != null),
    unmapped: IMPORT_COLUMNS.filter((n) => map[n] == null),
    extras,
  }
}

// '' → null · '8' / '8%' → 0.08 · '0.08' → 0.08 · junk → NaN.
// Rule: a numeric over 1 is a percentage (÷100); at or under 1 it is already a fraction.
export function parseRate(s) {
  const t = String(s == null ? '' : s).trim()
  if (t === '') return null
  const m = t.match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (!m) return NaN
  const n = parseFloat(m[1])
  return n > 1 ? n / 100 : n
}

// Decision 1 (15 Jul): freight can be quoted as a dollar value OR a percentage, per user preference.
// '$30' / '30 $' ⇒ { mode:'dollar', value:30 } · '8' / '8%' ⇒ { mode:'percent', value:0.08 } ·
// blank + supplier $ lookup ⇒ dollar from the supplier default (with a note) · junk ⇒ % default + warn.
// Kept separate from parseRate (which also parses Duty) so that path's return type is unchanged.
export function parseFreight(s, supplier = {}) {
  const t = String(s == null ? '' : s).trim()
  const issues = []
  const isDollar = /^\$\s*\d/.test(t) || /\d\s*\$$/.test(t)
  if (isDollar) {
    const n = parseFloat(t.replace(/[^0-9.]/g, ''))
    return { mode: 'dollar', value: Number.isNaN(n) ? 0 : n, issues }
  }
  if (t === '') {
    if (supplier.freightDollar != null) {
      issues.push({ field: 'Freight Rate', level: 'warn', message: `Freight blank — defaulted to supplier $${supplier.freightDollar}/unit lookup` })
      return { mode: 'dollar', value: supplier.freightDollar, issues }
    }
    return { mode: 'percent', value: FREIGHT_DEFAULT, issues }
  }
  const parsed = parseRate(t)
  if (parsed == null || Number.isNaN(parsed)) {
    issues.push({ field: 'Freight Rate', level: 'warn', message: `Freight '${t}' unreadable — 8% placeholder applied` })
    return { mode: 'percent', value: FREIGHT_DEFAULT, issues }
  }
  return { mode: 'percent', value: parsed, issues }
}

// Resolve one sheet row: validate at the boundary, pick the discount chain from the supplier's
// flag/structure, and (when clean) run the row through the live waterfall.
export function resolveRow(cells, map, supplier) {
  const issues = []
  const val = (col) => (map[col] == null ? '' : String(cells[map[col]] ?? '').trim())

  // Decision 6 (15 Jul): standardise supplier codes to the uniform format on import. Keep the
  // raw value so the preview can show what changed and Xero-sync mismatches stay traceable.
  const rawCode = val('Code')
  const code = normalizeSupplierCode(rawCode)
  if (rawCode && code !== rawCode) {
    issues.push({ field: 'Code', level: 'warn', message: `Code '${rawCode}' standardised to '${code}'` })
  }
  const range = val('Product Range')
  const description = val('Description')
  const itemType = val('Item Type')
  const width = val('Width')
  // Decision 8 (15 Jul): carry the technical product fields through the template expansion.
  const repeat = val('Repeat')
  const verticalRepeat = val('Vertical Repeat')
  const patternMatch = val('Pattern Match')
  // Decision 7 (15 Jul): capture the pack type as the product's unit of measure.
  const unit = unitFromPackType(val('Pack Type'))

  let currency = val('Currency').toUpperCase()
  if (!currency) {
    currency = supplier.currency
    issues.push({ field: 'Currency', level: 'warn', message: `No currency — defaulted to supplier ${supplier.currency}` })
  } else if (!isKnownCurrency(currency)) {
    issues.push({ field: 'Currency', level: 'error', message: `Unknown currency '${currency}' — no FX row on file` })
  }

  const wholesaleRaw = val('Wholesale Rate').replace(/,(?=\d{3})/g, '')
  let wholesaleForeign = null
  if (/^\d+(\.\d+)?$/.test(wholesaleRaw)) {
    wholesaleForeign = parseFloat(wholesaleRaw)
  } else {
    issues.push({ field: 'Wholesale Rate', level: 'error', message: `Wholesale Rate '${val('Wholesale Rate') || '—'}' is not a number — row cannot be priced` })
  }

  const dutyRaw = val('Duty Rate')
  let dutyPct
  if (dutyRaw === '') {
    dutyPct = DUTY_PLACEHOLDER
    issues.push({ field: 'Duty Rate', level: 'warn', message: 'Duty blank — 7% placeholder pending broker mapping (A10)' })
  } else if (/^[A-Za-z]+$/.test(dutyRaw)) {
    dutyPct = DUTY_PLACEHOLDER
    issues.push({ field: 'Duty Rate', level: 'warn', message: `Duty code '${dutyRaw}' — awaiting broker mapping (A10)` })
  } else {
    const parsed = parseRate(dutyRaw)
    if (Number.isNaN(parsed)) {
      dutyPct = DUTY_PLACEHOLDER
      issues.push({ field: 'Duty Rate', level: 'warn', message: `Duty '${dutyRaw}' unreadable — 7% placeholder pending broker mapping (A10)` })
    } else {
      dutyPct = parsed ?? DUTY_PLACEHOLDER
    }
  }

  const freight = parseFreight(val('Freight Rate'), supplier)
  issues.push(...freight.issues)
  const freightPct = freight.mode === 'percent' ? freight.value : 0
  const freightDollar = freight.mode === 'dollar' ? freight.value : 0

  // The 9 Jul inclusive/exclusive flag decides whether P2 runs at all.
  let chain
  let discountLabel
  if (supplier.terms.discountIncluded) {
    chain = []
    discountLabel = 'Included in supplied price — P2 skipped'
  } else {
    const d = resolveDiscount({ supplier: supplier.name, brand: range })
    chain = d.chain
    discountLabel = chain.length ? chainLabel(chain) : d.label
  }

  const hasError = issues.some((i) => i.level === 'error')
  const wf = hasError
    ? null
    : computeWaterfall({
        wholesaleForeign,
        currency,
        forexMargin: pricingInputs.forexMargin,
        discountChain: chain,
        freight: freightPct,
        freightMode: freight.mode,
        freightDollar,
        clearance: pricingInputs.clearance,
        duty: dutyPct,
        handling: pricingInputs.handling,
        retailMarkup: pricingInputs.retailMarkup,
        tradeMarkup: pricingInputs.tradeMarkup,
        tradeMarkupMode: 'percent',
        tiers: pricingInputs.tiers,
      })

  return {
    code, rawCode, range, description, itemType, width, unit,
    repeat, verticalRepeat, patternMatch,
    currency, wholesaleForeign, dutyPct,
    freightPct, freightMode: freight.mode, freightDollar,
    chain, discountLabel, wf, issues,
  }
}

export function buildPreview(parsed, supplier) {
  const { map, mapped, unmapped, extras } = autoMapColumns(parsed.header)
  const rows = parsed.rows.map((cells, idx) => ({ n: idx + 1, ...resolveRow(cells, map, supplier) }))
  const errorCount = rows.filter((r) => r.issues.some((i) => i.level === 'error')).length
  const warnCount = rows.filter((r) => r.issues.some((i) => i.level === 'warn')).length
  // Decision 8 (15 Jul): templates are expanding — the definitive product-field list is owed from Charlotte.
  const pendingNotes = ['Template field expansion in progress — full product-field list owed from Charlotte (15 Jul).']
  return { map, mapped, unmapped, extras, rows, errorCount, warnCount, stageable: rows.length - errorCount, pendingNotes }
}
