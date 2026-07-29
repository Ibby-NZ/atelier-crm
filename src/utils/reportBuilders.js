// Pure table builders for the Report Library (R-01…R-11).
// buildReport(state, access) → { cols, rows, minW, note } where each row is { total, cells[] }
// and each cell is a plain descriptor the screen renders:
//   text: { kind:'text', t, sub, align, font:'ui'|'serif'|'mono', color:<theme token>, weight, wrap, size }
//   pill: { kind:'pill', t, tone:'sage'|'clay'|'muted' }
// Colors are theme token NAMES (ink/inkSoft/muted/accent/sage/clay) — resolved at render.
//
// `access` ({ finance, all, owner } — see auth/roles.js accessOf) is applied HERE rather
// than at the screen, because exportRows() flattens whatever this returns. Gating the
// table at the point of construction means CSV and print inherit it; gating at the
// render would leave both exports pouring the masked columns straight back out.

import {
  REPORTS, PERIODS, OWNERS, FY_TOTAL, FY_TOTAL_PRIOR,
  ownerSummary, ownerBySupplier, ownerByRange, ownerByTerritory,
  accounts, ACCOUNT_SUPPLIER_COLS, ACCOUNT_RANGES,
  brandTypes, PRODUCT_TYPES,
  purchasesBySupplier, purchasesByRange, shipments, inwardsGoods,
  zeroCostLines, marginExceptions, notInvoicedLines, deliveryLines,
  stockLines, STOCK_VALUATION,
} from '../data/reportLibrary.js'
import { NO_ACCESS, NO_OWNER_REASON } from '../auth/roles.js'
import { applyReportAccess } from '../auth/reportPolicy.js'

// ---- cell helpers -----------------------------------------------------------

const tx = (t, o = {}) => ({
  kind: 'text', t: String(t == null ? '' : t),
  align: o.a || 'left',
  font: o.m ? 'mono' : o.s ? 'serif' : 'ui',
  color: o.c || (o.s ? 'ink' : 'inkSoft'),
  weight: o.w || 400,
  sub: o.sub || '',
  wrap: Boolean(o.wrap),
  size: o.sz || null,
})
const nm = (t, color) => tx(t, { m: 1, a: 'right', c: color || 'ink' })
const pl = (t, tone) => ({ kind: 'pill', t: String(t), tone })
const row = (cells, total = false) => ({ total, cells })
const col = (t, w, align = 'left') => ({ t, w, align })

const yoyColor = (up) => (up ? 'sage' : 'clay')

// ---- formatters (F = period factor) -----------------------------------------

const kf = (v, F) => {
  const x = v * F
  return 'NZ$' + (x >= 99.5 ? Math.round(x).toLocaleString('en-NZ') : x.toFixed(1)) + 'k'
}
const fk = (sym, v, F) => {
  const x = v * F
  return sym + (x >= 99.5 ? Math.round(x).toLocaleString('en-NZ') : x.toFixed(1)) + 'k'
}
const mm = (v, F) => Math.round(v * F).toLocaleString('en-NZ') + ' m'
const ct = (v, F) => String(Math.max(1, Math.round(v * F)))

export function periodFactor(period) {
  const p = PERIODS.find((x) => x.key === period)
  return p ? p.factor : 1
}

// ---- R-01 sales per owner ----------------------------------------------------
//
// The only report with a salesperson grain, so the only one own-sales scoping
// (RPT-03) can actually act on. When scoped, the whole company disappears: the
// other owners' columns, the all-owners total column, and the grand-total row all
// go. Leaving the grand total would hand a User the company's FY figure — the
// single number the scoping exists to withhold — with the arithmetic done for them.

// No person to scope to (Liz takes no orders; a shared login is not a person).
// This is A6 unresolved, so the report says so rather than defaulting either way:
// showing all-company would break the scoping, showing nothing without a reason
// would just look broken.
const noOwnerTable = (reason) => ({ cols: [], rows: [], minW: '0', note: '', empty: true, emptyReason: reason })

// Shared owner × dimension matrix (supplier / range / territory views).
function ownerMatrix(dimLabel, data, totalLabel, F, access) {
  const scoped = !access.all
  if (scoped && !access.owner) return noOwnerTable(NO_OWNER_REASON)

  const shown = scoped ? OWNERS.filter((o) => o === access.owner) : OWNERS
  const at = shown.map((o) => OWNERS.indexOf(o))

  const cols = [col(dimLabel, '1.4fr'), ...shown.map((o) => col(o, '104px', 'right'))]
  if (!scoped) cols.push(col('Total', '112px', 'right'))

  const sums = shown.map(() => 0)
  const rows = data.map((r) => {
    const vals = at.map((i) => r[2 + i]) // row shape: [label, sub, Rebecca, Jenette, Charlotte]
    vals.forEach((v, i) => { sums[i] += v })
    const cells = [tx(r[0], { s: 1, sub: r[1] }), ...vals.map((v) => nm(kf(v, F), 'inkSoft'))]
    if (!scoped) cells.push(nm(kf(vals.reduce((x, y) => x + y, 0), F)))
    return row(cells)
  })

  // The scoped total is the reader's own book — their figure, not the company's.
  const label = scoped ? `${access.owner} — total` : totalLabel
  const totalCells = [tx(label, { w: 600, c: 'ink' }), ...sums.map((v, i) => nm(kf(v, F), scoped && i === 0 ? 'accent' : 'ink'))]
  if (!scoped) totalCells.push(nm(kf(sums.reduce((x, y) => x + y, 0), F), 'accent'))
  rows.push(row(totalCells, true))

  return { cols, rows, minW: scoped ? '520px' : '840px', note: '' }
}

function buildOwner({ dim }, F, access) {
  if (dim === 'supplier') return ownerMatrix('Supplier', ownerBySupplier, 'All owners', F, access)
  if (dim === 'range') return ownerMatrix('Range', ownerByRange, 'All owners', F, access)
  if (dim === 'territory') return ownerMatrix('Territory', ownerByTerritory, 'All owners', F, access)

  const scoped = !access.all
  if (scoped && !access.owner) return noOwnerTable(NO_OWNER_REASON)

  const cols = [col('Salesperson', '1.4fr'), col('This period', '130px', 'right'), col('Prior period', '130px', 'right'), col('YoY', '90px', 'right')]
  const source = scoped ? ownerSummary.filter(([name]) => name === access.owner) : ownerSummary
  const rows = source.map(([name, ty, ly, yoy, up]) =>
    row([tx(name, { s: 1 }), nm(kf(ty, F)), nm(kf(ly, F), 'muted'), nm(yoy, yoyColor(up))]))

  // Grand total is all-company by definition — withheld from a scoped reader.
  if (!scoped) {
    rows.push(row([tx('All owners', { w: 600, c: 'ink' }), nm(kf(FY_TOTAL, F), 'accent'), nm(kf(FY_TOTAL_PRIOR, F), 'muted'), nm('+7.3%', 'sage')], true))
  }
  return { cols, rows, minW: '700px', note: '' }
}

// ---- R-02 sales per account holder -------------------------------------------

function buildAccount({ dim }, F) {
  if (dim === 'supplier') {
    const cols = [col('Account', '1.5fr'), ...ACCOUNT_SUPPLIER_COLS.map((s) => col(s, '92px', 'right')), col('Total', '100px', 'right')]
    const sums = ACCOUNT_SUPPLIER_COLS.map(() => 0)
    const rows = accounts.map((a) => {
      a.sup.forEach((v, i) => { sums[i] += v })
      return row([tx(a.name, { s: 1 }), ...a.sup.map((v) => nm(kf(v, F), 'inkSoft')), nm(kf(a.ty, F))])
    })
    rows.push(row([tx('All accounts', { w: 600, c: 'ink' }), ...sums.map((v) => nm(kf(v, F))), nm(kf(FY_TOTAL, F), 'accent')], true))
    return { cols, rows, minW: '1020px', note: '' }
  }
  if (dim === 'range') {
    const cols = [col('Account', '1.5fr'), ...ACCOUNT_RANGES.map(([r]) => col(r, '92px', 'right')), col('Other', '84px', 'right'), col('Total', '96px', 'right')]
    const sums = [...ACCOUNT_RANGES.map(() => 0), 0]
    const rows = accounts.map((a) => {
      const vals = ACCOUNT_RANGES.map(([, total]) => Math.round(a.ty * total / FY_TOTAL))
      const other = a.ty - vals.reduce((x, y) => x + y, 0)
      vals.forEach((v, i) => { sums[i] += v }); sums[sums.length - 1] += other
      return row([tx(a.name, { s: 1 }), ...vals.map((v) => nm(kf(v, F), 'inkSoft')), nm(kf(other, F), 'muted'), nm(kf(a.ty, F))])
    })
    rows.push(row([tx('All accounts', { w: 600, c: 'ink' }), ...sums.map((v, i) => nm(kf(v, F), i === sums.length - 1 ? 'muted' : 'ink')), nm(kf(FY_TOTAL, F), 'accent')], true))
    return { cols, rows, minW: '1100px', note: '' }
  }
  const cols = [col('Account', '1.5fr'), col('This period', '125px', 'right'), col('Prior period', '125px', 'right'), col('YoY', '85px', 'right')]
  const rows = accounts.map((a) =>
    row([tx(a.name, { s: 1, sub: a.city }), nm(kf(a.ty, F)), nm(kf(a.ly, F), 'muted'), nm(a.yoy, yoyColor(a.up))]))
  rows.push(row([tx('All accounts', { w: 600, c: 'ink' }), nm(kf(FY_TOTAL, F), 'accent'), nm(kf(FY_TOTAL_PRIOR, F), 'muted'), nm('+7.3%', 'sage')], true))
  return { cols, rows, minW: '720px', note: '' }
}

// ---- R-11 sales by brand & product type --------------------------------------

const brandTotal = (b) => Object.values(b.types).reduce((x, y) => x + y, 0)

function buildBrandType({ dim, brand }, F) {
  if (dim === 'type') {
    const cols = [col('Product type', '1.4fr'), col('Brands', '70px', 'right'), col('Sales', '115px', 'right'), col('Share', '80px', 'right')]
    const totals = PRODUCT_TYPES
      .map((tp) => {
        const carriers = brandTypes.filter((b) => b.types[tp])
        return { tp, n: carriers.length, v: carriers.reduce((x, b) => x + b.types[tp], 0) }
      })
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
    const grand = totals.reduce((x, y) => x + y.v, 0)
    const rows = totals.map((x) =>
      row([tx(x.tp, { s: 1 }), nm(String(x.n), 'inkSoft'), nm(kf(x.v, F)), nm((x.v / grand * 100).toFixed(1) + '%', 'muted')]))
    rows.push(row([tx('All product types', { w: 600, c: 'ink' }), nm(String(brandTypes.length)), nm(kf(grand, F), 'accent'), nm('100%', 'muted')], true))
    return { cols, rows, minW: '640px', note: 'Fabric leads, but trims & passementerie run through four of seven brands — a quiet, growing attachment sale.' }
  }
  if (dim === 'within') {
    const b = brandTypes.find((x) => x.brand === brand) || brandTypes[0]
    const entries = Object.entries(b.types).sort((x, y) => y[1] - x[1])
    const total = entries.reduce((x, e) => x + e[1], 0)
    const cols = [col('Product type · ' + b.brand, '1.4fr'), col('Sales', '115px', 'right'), col('Share of brand', '110px', 'right')]
    const rows = entries.map(([tp, v]) =>
      row([tx(tp, { s: 1 }), nm(kf(v, F)), nm((v / total * 100).toFixed(1) + '%', 'muted')]))
    rows.push(row([tx(b.brand + ' — all types', { w: 600, c: 'ink' }), nm(kf(total, F), 'accent'), nm('100%', 'muted')], true))
    const note = b.brand === 'Pierre Frey'
      ? 'Wallpaper is 19.1% of Pierre Frey — the strongest wallpaper share of any brand carried.' : ''
    return { cols, rows, minW: '620px', note }
  }
  const cols = [col('Brand', '1.4fr'), col('This period', '125px', 'right'), col('Prior period', '125px', 'right'), col('YoY', '85px', 'right')]
  let ty = 0, ly = 0
  const rows = brandTypes.map((b) => {
    const t = brandTotal(b); ty += t; ly += b.prev
    const pct = (t - b.prev) / b.prev * 100
    return row([tx(b.brand, { s: 1, sub: Object.keys(b.types).length + ' product types' }), nm(kf(t, F)), nm(kf(b.prev, F), 'muted'), nm((pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%', yoyColor(pct >= 0))])
  })
  const pctT = (ty - ly) / ly * 100
  rows.push(row([tx('All brands', { w: 600, c: 'ink' }), nm(kf(ty, F), 'accent'), nm(kf(ly, F), 'muted'), nm('+' + pctT.toFixed(1) + '%', 'sage')], true))
  return { cols, rows, minW: '700px', note: '' }
}

// ---- R-06 purchases -----------------------------------------------------------

function buildPurchases({ dim }, F) {
  const note = 'Committed spend at order-date rates; NZ$ figures use the annual FX rate, set yearly with a 10% buffer.'
  if (dim === 'range') {
    const cols = [col('Range', '1.1fr'), col('Supplier', '1fr'), col('Metres', '100px', 'right'), col('Spend · NZ$', '120px', 'right')]
    let tm = 0, tn = 0
    const rows = purchasesByRange.map(([range, supplier, metres, spend]) => {
      tm += metres; tn += spend
      return row([tx(range, { s: 1 }), tx(supplier), nm(mm(metres, F), 'inkSoft'), nm(kf(spend, F))])
    })
    rows.push(row([tx('All ranges', { w: 600, c: 'ink' }), tx(''), nm(mm(tm, F)), nm(kf(tn, F), 'accent')], true))
    return { cols, rows, minW: '760px', note }
  }
  const cols = [col('Supplier', '1.4fr'), col('POs', '60px', 'right'), col('Metres', '95px', 'right'), col('Spend · orig', '110px', 'right'), col('Spend · NZ$', '115px', 'right')]
  let tp = 0, tm = 0, tn = 0
  const rows = purchasesBySupplier.map(([name, ccy, pos, metres, sym, orig, nz]) => {
    tp += pos; tm += metres; tn += nz
    return row([tx(name, { s: 1, sub: ccy }), nm(ct(pos, F), 'inkSoft'), nm(mm(metres, F), 'inkSoft'), nm(fk(sym, orig, F), 'inkSoft'), nm(kf(nz, F))])
  })
  rows.push(row([tx('All suppliers', { w: 600, c: 'ink' }), nm(ct(tp, F)), nm(mm(tm, F)), nm('—', 'muted'), nm(kf(tn, F), 'accent')], true))
  return { cols, rows, minW: '820px', note }
}

// ---- fixed-data reports (no period / dim) --------------------------------------

function buildShipment() {
  const cols = [col('PO', '130px'), col('Supplier', '1.1fr'), col('Routing', '1.2fr'), col('ETA', '75px', 'right'), col('Outstanding', '105px', 'right'), col('Value', '90px', 'right'), col('Status', '128px')]
  const rows = shipments.map(([po, sub, supplier, routing, eta, out, value, status, tone]) =>
    row([tx(po, { m: 1, sub }), tx(supplier), tx(routing), nm(eta, 'inkSoft'), nm(out), nm(value, 'inkSoft'), pl(status, tone)]))
  return { cols, rows, minW: '980px', note: 'Outstanding balances stay on their purchase order — never forced onto a new PO.' }
}

function buildInwards() {
  const cols = [col('Date', '80px'), col('PO', '125px'), col('Design · Colourway', '1.5fr'), col('Received', '95px', 'right'), col('Balance', '90px', 'right'), col('Status', '115px')]
  const rows = inwardsGoods.map(([date, po, line, sku, received, balance, part]) =>
    row([tx(date, { m: 1, c: 'muted' }), tx(po, { m: 1 }), tx(line, { s: 1, sub: sku }), nm(received), nm(balance, part ? 'clay' : 'muted'), pl(part ? 'Part' : 'Complete', part ? 'clay' : 'sage')]))
  return { cols, rows, minW: '880px', note: 'Each receipt appends to its purchase order’s log; the balance remains on the same PO.' }
}

function buildZeroCost() {
  const cols = [col('SO', '115px'), col('Client', '1fr'), col('Line', '1.3fr'), col('Qty', '60px', 'right'), col('Sell', '95px', 'right'), col('Cost', '85px', 'right'), col('Reason', '1.2fr')]
  const rows = zeroCostLines.map(([so, date, client, line, sku, qty, sell, reason]) =>
    row([tx(so, { m: 1, sub: date }), tx(client), tx(line, { s: 1, sub: sku }), nm(qty, 'inkSoft'), nm(sell), nm('NZ$0.00', 'clay'), tx(reason, { c: 'muted', sz: 12, wrap: 1 })]))
  return { cols, rows, minW: '1000px', note: 'Three lines to cost before month-end close — zero-cost sales overstate margin.' }
}

function buildMargin() {
  const cols = [col('SO', '115px'), col('Client', '1fr'), col('Line', '1.3fr'), col('Sell /m', '90px', 'right'), col('Cost /m', '90px', 'right'), col('Margin', '80px', 'right'), col('Flag', '118px')]
  const rows = marginExceptions.map(([so, date, client, line, sku, sell, cost, margin, over]) =>
    row([tx(so, { m: 1, sub: date }), tx(client), tx(line, { s: 1, sub: sku }), nm(sell), nm(cost, 'inkSoft'), nm(margin, 'clay'), pl(over ? 'Over 70%' : 'Under 30%', 'clay')]))
  return { cols, rows, minW: '980px', note: 'Under-band pricing erodes margin; over-band usually signals a stale or missing cost.' }
}

function buildNotInvoiced() {
  const cols = [col('SO', '115px'), col('Client', '1fr'), col('Line', '1.3fr'), col('Qty', '70px', 'right'), col('On hand', '85px', 'right'), col('Value', '105px', 'right'), col('Status', '168px')]
  const rows = notInvoicedLines.map(([so, date, client, line, sku, qty, onHand, value, status, tone]) =>
    row([tx(so, { m: 1, sub: date }), tx(client), tx(line, { s: 1, sub: sku }), nm(qty, 'inkSoft'), nm(onHand, 'sage'), nm(value), pl(status, tone)]))
  return { cols, rows, minW: '1020px', note: 'NZ$7,539.10 awaiting invoice. Fulfilment tracks at the line level — an order stays Partially Shipped until its final line clears.' }
}

function buildDelivery() {
  const cols = [col('SO', '115px'), col('Client', '1fr'), col('Deliver to', '1.1fr'), col('Instructions', '1.4fr'), col('Method', '150px'), col('Dispatch', '75px', 'right'), col('Flag', '118px')]
  const rows = deliveryLines.map(([so, client, to, instructions, method, methodSub, dispatch, flag]) =>
    row([tx(so, { m: 1 }), tx(client), tx(to, { wrap: 1, sz: 12.5 }), tx(instructions, { c: 'muted', sz: 12, wrap: 1 }), tx(method, { sub: methodSub }), nm(dispatch, 'inkSoft'), flag ? pl(flag, 'muted') : tx('—', { c: 'muted' })]))
  return { cols, rows, minW: '1120px', note: 'Instructions print on the packing slip — distinct from the delivery address. “Excl. shipping” lines have the supplier freight estimate deducted from landed cost.' }
}

function buildStock() {
  const cols = [col('SKU', '115px'), col('Design · Colourway', '1.4fr'), col('On hand', '85px', 'right'), col('Allocated', '88px', 'right'), col('Available', '88px', 'right'), col('Landed /m', '95px', 'right'), col('Value', '100px', 'right')]
  const rows = stockLines.map(([sku, line, brand, onHand, allocated, available, landed, value, flagged]) =>
    row([tx(sku, { m: 1 }), tx(line, { s: 1, sub: brand }), nm(onHand + ' m', 'inkSoft'), nm(allocated + ' m', 'inkSoft'), nm(available + ' m', flagged ? 'clay' : 'sage'), nm(landed, 'inkSoft'), nm(value)]))
  rows.push(row([tx('Stock valuation', { w: 600, c: 'ink' }), tx(''), tx(''), tx(''), tx(''), tx(''), nm(STOCK_VALUATION, 'accent')], true))
  return { cols, rows, minW: '960px', note: 'Minimal holdings by design — Atelier operates on an indent model. Samples sit apart as a non-financial asset.' }
}

// ---- dispatch -----------------------------------------------------------------

const BUILDERS = {
  owner: buildOwner,
  account: buildAccount,
  brandtype: buildBrandType,
  purchases: buildPurchases,
  shipment: buildShipment,
  inwards: buildInwards,
  zerocost: buildZeroCost,
  margin: buildMargin,
  notinvoiced: buildNotInvoiced,
  delivery: buildDelivery,
  stock: buildStock,
}

export function reportDef(key) {
  return REPORTS.find((r) => r.key === key) || REPORTS[0]
}

// state: { report, period, dim, brand } → table descriptor (never throws on bad keys).
//
// `access` defaults to NO_ACCESS — fail closed. A caller that forgets to pass it gets
// the most restricted table, not the least: the failure mode of a forgotten gate should
// be a missing column someone reports, not a leaked cost nobody notices.
//
// Whole-report denial (R-02/R-06/R-11) is NOT decided here — canViewReport() owns that,
// because the screen must render a reason rather than an empty table. This applies the
// column-level mask only.
export function buildReport(state, access = NO_ACCESS) {
  const def = reportDef(state.report)
  const F = def.periods ? periodFactor(state.period) : 1
  const build = BUILDERS[def.key]
  const table = build(state, F, access)
  return { def, ...applyReportAccess(table, def.key, access) }
}

// Flatten a built table for CSV / print export: sub-lines join the main text.
export function exportRows(table) {
  const head = table.cols.map((cl) => cl.t)
  const rows = table.rows.map((r) => r.cells.map((cell) => cell.sub ? `${cell.t} — ${cell.sub}` : cell.t))
  return { head, rows }
}
