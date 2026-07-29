// Pure builders that turn create-form input into store records. No React, no storage — just data
// shaping — so they are unit-testable and reused by both the live preview (orderFromLines) and the
// committed record (buildSalesOrder). Created records are a strict subset of the seeded shapes in
// ../data/atelier.js so the existing detail screens + computeOrderTotals work on them unchanged.

import { designs, clients as seedClientRows, salesOrder, purchaseOrder, team, regions } from '../data/atelier.js'
import { tradeUnit, nzd } from '../data/pricing.js'
import { nzdMultiplier, fxInfo } from '../data/fx.js'
import { parseQuantity, formatQuantity } from '../utils/units.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SYMBOL = { USD: 'US$', EUR: '€', GBP: '£' }

// Trailing integer of a code like 'SO-2026-0418' → 418; 0 when absent.
const numTail = (s) => {
  const m = String(s).match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : 0
}

// Seed maxima, derived from the seeds so created numbering can never collide with them.
const SO_SEED_MAX = numTail(salesOrder.number) // 418
const PO_SEED_MAX = numTail(purchaseOrder.number) // 142

// '16 Jul' — matches the seed date format ('17 Jun', '02 Jul').
export function shortDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')} ${MONTHS[dt.getMonth()]}`
}

// lowercase, non-alphanumeric runs → single '-', trimmed. 'McKenzie & Willis' → 'mckenzie-willis'.
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// A collision-free id: `base`, else `base-2`, `base-3`, … `taken` may be an array or a Set.
export function uniqueId(base, taken = []) {
  const has = taken instanceof Set ? (x) => taken.has(x) : (x) => taken.includes(x)
  if (!has(base)) return base
  let n = 2
  while (has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// Next zero-padded 4-digit number for a prefix, above both the seed max and any created numbers.
export function nextNumber(prefix, existingNumbers = [], seedMax = 0) {
  const max = Math.max(seedMax, 0, ...existingNumbers.map(numTail))
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// Metres out of a qty that may be a number or free text ('12 m').
const metresOf = (q) => (typeof q === 'number' ? q : parseQuantity(q))

// One order line in the seeded salesOrder line shape (unit is the trade $/m; qty carries metres).
function toOrderLine(l) {
  const m = metresOf(l.qty ?? l.metres)
  const unit = typeof l.unit === 'number' ? l.unit : tradeUnit(l.design)
  return {
    design: l.design,
    colourway: l.colourway,
    sku: l.sku,
    tone: l.tone,
    qty: formatQuantity(m, 'metre'),
    unit,
    total: nzd(unit * m),
  }
}

// A number-less order for the live summary (computeOrderTotals reads rooms + tier + summary).
export function orderFromLines(lines, client) {
  return {
    seeded: false,
    status: 'Draft',
    client: client?.name || '',
    clientId: client?.id || '',
    clientTier: client?.tier || 1,
    volumeThreshold: 5,
    rooms: [{ room: 'Main', lines: (lines || []).map(toOrderLine) }],
    summary: { freightBase: 185.0, excludeShipping: false, gstRate: 0.15 },
  }
}

// Client record. Empty name → { error } so the form can show an inline error and NOT commit.
export function buildClient(form = {}, existingIds = []) {
  const name = String(form.name || '').trim()
  if (!name) return { error: 'Client name is required.' }
  const contact = form.contact || {}
  return {
    id: uniqueId(slugify(name) || 'client', existingIds),
    seeded: false,
    name,
    city: String(form.city || '').trim(),
    region: form.region || regions[0],
    type: form.type || 'Trade',
    tier: Number(form.tier) || 1,
    contact: {
      name: String(contact.name || '').trim(),
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
    },
    note: String(form.note || '').trim(),
    createdAt: new Date().toISOString(),
  }
}

// Committed sales order — a strict subset of the seeded salesOrder shape.
export function buildSalesOrder(form = {}, existingNumbers = [], client) {
  const number = nextNumber('SO-2026-', existingNumbers, SO_SEED_MAX)
  return {
    ...orderFromLines(form.lines, client),
    id: number,
    number,
    project: String(form.project || '').trim(),
    salesperson: form.salesperson || team[team.length - 1],
    deliveryInstructions: String(form.deliveryInstructions || '').trim(),
    timeline: [
      { label: 'Draft created', date: shortDate(), state: 'current' },
      { label: 'Order confirmed', date: '—', state: 'todo' },
      { label: 'Dispatched', date: '—', state: 'todo' },
      { label: 'Delivered', date: '—', state: 'todo' },
    ],
    createdAt: new Date().toISOString(),
  }
}

// Money formatter for the PO currency: 'US$48.00', '€1,920.00'.
const money = (currency, n) =>
  `${SYMBOL[currency] || fxInfo(currency).symbol}${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Committed purchase order — a subset of the seeded purchaseOrder shape. Supplier defaults are copied
// from the supplier master AT CREATE so the record is self-contained (no re-keying, no live lookup).
export function buildPurchaseOrder(form = {}, existingNumbers = [], supplier) {
  const number = nextNumber('PO-2026-', existingNumbers, PO_SEED_MAX)
  const currency = supplier?.currency || 'EUR'
  const sym = SYMBOL[currency] || fxInfo(currency).symbol
  return {
    id: number,
    number,
    seeded: false,
    supplier: supplier?.name || '',
    supplierId: supplier?.id || '',
    city: supplier?.city || '',
    country: supplier?.country || '',
    currency,
    agent: supplier?.agent || '',
    incoterm: supplier?.incoterm || '',
    fx: `NZ$${nzdMultiplier(currency).toFixed(4)} / ${sym}1 · ${sym}${fxInfo(currency).actual} per NZ$1`,
    eta: String(form.eta || '').trim(),
    origin: '—',
    status: 'Draft',
    tracking: { carrier: '—', supplierRef: '—', customerRef: '—' },
    lines: (form.lines || []).map((l) => {
      const ordered = metresOf(l.ordered ?? l.qty)
      const unitPrice = Number(l.unit) || 48.0
      return {
        sku: l.sku,
        design: l.colourway ? `${l.design} — ${l.colourway}` : (l.design || l.name || ''),
        tone: l.tone,
        ordered,
        received: 0,
        unit: money(currency, unitPrice),
        line: money(currency, unitPrice * ordered),
      }
    }),
    receipts: [],
    createdAt: new Date().toISOString(),
  }
}

// The 5 seed clients as store records (seeded, contact blank — the list rows carry none; the rich
// Marlow & Finch contact/account is attached by getClient). Stable slug ids.
export function seedClients() {
  return seedClientRows.map((cl) => ({
    id: slugify(cl.name),
    seeded: true,
    name: cl.name,
    city: cl.city,
    region: cl.region,
    type: cl.type,
    tier: cl.tier,
    contact: { name: '', email: '', phone: '' },
    note: cl.note || '',
    createdAt: null,
  }))
}

// Flatten every design × colourway into type-ahead options for the create forms — validated library,
// no free codes. Fabricut colourways come free (they are now in `designs`). unit is numeric trade $/m.
export function designLibrary() {
  const out = []
  for (const d of designs) {
    const unit = tradeUnit(d.design)
    for (const cw of d.colourways) {
      out.push({
        label: `${d.design} — ${cw.name}`,
        design: d.design,
        colourway: cw.name,
        sku: cw.sku,
        tone: cw.tone,
        unit,
        price: nzd(unit),
        supplier: d.supplier,
        brand: d.brand,
      })
    }
  }
  return out
}
