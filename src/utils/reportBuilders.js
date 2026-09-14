// Pure table builders for the Report Library (R-01…R-13).
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
  designSales, OTHER_DESIGNS, SALES_YEARS,
} from '../data/reportLibrary.js'
import { NO_ACCESS, NO_OWNER_REASON } from '../auth/roles.js'
import { applyReportAccess } from '../auth/reportPolicy.js'
// The filter bar's own vocabulary and blank rule, so a drill-down link and the
// bar it lands in cannot disagree about which filters travel or how.
import { reportSearchParams } from './reportFilters.js'
// A row that carries an identity (a slug, a SKU, a month) opens its insight.
import { insightLinkFor } from './insight.js'

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
// A colourway IS a colour, and R-12 is the report about them, so the swatch rides on
// the text cell rather than arriving as a third cell kind: exportRows() still flattens
// it to its name and SKU, and the CSV loses the square but not one word of the row.
const sw = (t, hex, sub) => ({ ...tx(t, { s: 1, sub }), hex })
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

// ---- R-12 sales per design & colourway -----------------------------------------
//
// One report, three views, because the client asked one question at three grains:
// which designs sell (design), which colourways of one design sell (colourway), and
// how a single colourway has moved across the years (year — "Nuage Ciel, per year"
// is one row of it).
//
// EVERY total here is summed from the colourway rows at render, never read from a
// stored total. On the one report whose whole point is whether the colours add up to
// the design, a total that disagrees with the rows above it would be worse than no
// total at all.

const ON_HAND = new Map(stockLines.map((r) => [r[0], r[3]]))
const LATEST = SALES_YEARS.length - 1

const designByName = (name) => designSales.find((d) => d.design === name) || designSales[0]
const designYears = (d) => SALES_YEARS.map((_, i) => d.colourways.reduce((s, cw) => s + cw.years[i], 0))

// Quantity is derived from money ÷ the design's own sell rate, so it moves with the
// period pills exactly as the money does and the two can never disagree. Units are the
// design's (metres for cloth, rolls for wallpaper) and are printed, never assumed.
const qty = (d, v, F) => Math.round(v * 1000 * F / d.rate).toLocaleString('en-NZ') + ' ' + d.unit

// A design that did not exist in the prior year has no percentage — Larsen 2024 opened
// in FY2025, and "+∞%" or a silent "0.0%" would both be a lie about a launch.
const deltaCell = (prev, cur) => {
  if (!prev) return nm(cur ? 'New' : '—', 'muted')
  const pct = (cur - prev) / prev * 100
  return nm((pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%', yoyColor(pct >= 0))
}
// Takes the prior and latest year off a series, so nothing here breaks if SALES_YEARS
// grows a column.
const deltaOf = (years) => deltaCell(years[LATEST - 1], years[LATEST])

const share = (v, total) => nm(total ? (v / total * 100).toFixed(1) + '%' : '—', 'muted')

function buildDesignSales({ dim, design }, F) {
  if (dim === 'colourway' || dim === 'year') {
    const d = designByName(design)
    const totals = designYears(d)
    const label = `${d.design} — all colourways`

    if (dim === 'year') {
      const cols = [col(`Colourway · ${d.design}`, '1.4fr'), ...SALES_YEARS.map((y) => col(y, '104px', 'right')), col('YoY', '92px', 'right')]
      const rows = d.colourways.map((cw) => row([
        sw(cw.name, cw.hex, cw.sku),
        ...cw.years.map((v, i) => nm(kf(v, 1), i === LATEST ? 'ink' : 'muted')),
        deltaOf(cw.years),
      ]))
      rows.push(row([tx(label, { w: 600, c: 'ink' }),
        ...totals.map((v, i) => nm(kf(v, 1), i === LATEST ? 'accent' : 'muted')),
        deltaOf(totals)], true))
      const opened = totals[0] === 0
      return {
        cols, rows, minW: '720px',
        // No period pills on this view (periodDims) — the columns already ARE the
        // periods, so the export has to name the span rather than inherit "FY2026"
        // from a pill group that is not on screen.
        periodLabel: `${SALES_YEARS[0]}–${SALES_YEARS[LATEST]}`,
        note: opened
          ? `${d.design} opened in ${SALES_YEARS[1]}, so its first year is nil rather than missing.`
          : `Three financial years at colourway grain — the “and per year” half of the ask, one row per colour.`,
      }
    }

    // Widths are kept tight enough that the whole table fits the report panel at
    // 1500px: the last column here is a Share that reads as absent, not as scrolled,
    // when it falls off the right edge.
    const cols = [col(`Colourway · ${d.design}`, '1.4fr'), col('On hand', '92px', 'right'), col('Quantity', '104px', 'right'), col('Sales', '112px', 'right'), col('Share', '80px', 'right')]
    const total = totals[LATEST]
    const rows = d.colourways.map((cw) => {
      const v = cw.years[LATEST]
      const held = ON_HAND.get(cw.sku)
      // On hand is a holding as at today and is NOT scaled by the period factor: a
      // month view asking for a twelfth of the stock on the shelf would be nonsense.
      return row([
        sw(cw.name, cw.hex, cw.sku),
        held ? nm(`${held} ${d.unit}`, 'sage') : nm('—', 'muted'),
        nm(qty(d, v, F), 'inkSoft'),
        nm(kf(v, F)),
        share(v, total),
      ])
    })
    rows.push(row([tx(label, { w: 600, c: 'ink' }), nm('—', 'muted'), nm(qty(d, total, F)), nm(kf(total, F), 'accent'), nm('100%', 'muted')], true))
    return {
      cols, rows, minW: '720px',
      note: `${d.brand} · ${d.type}, sold by the ${d.unit === 'm' ? 'metre' : 'roll'}. On hand is R-10’s holding for the colourways Atelier stocks — a dash is a colour held to order, not a nil stock figure, and it does not total.`,
    }
  }

  // By design — the whole catalogue, so no quantity column: Nuage is sold by the roll
  // and everything above it by the metre, and a column adding the two is a figure with
  // no unit. Quantity lives in the two single-design views, where the unit is one thing.
  const cols = [col('Design', '1.5fr'), col('Colourways', '88px', 'right'), col('This period', '112px', 'right'), col('Prior period', '112px', 'right'), col('YoY', '84px', 'right'), col('Share', '78px', 'right')]
  const ranked = designSales
    .map((d) => ({ d, years: designYears(d) }))
    .sort((a, b) => b.years[LATEST] - a.years[LATEST])
  const grand = ranked.reduce((s, x) => s + x.years[LATEST], 0) + OTHER_DESIGNS.years[LATEST]
  const grandPrev = ranked.reduce((s, x) => s + x.years[LATEST - 1], 0) + OTHER_DESIGNS.years[LATEST - 1]

  const rows = ranked.map(({ d, years }) => row([
    tx(d.design, { s: 1, sub: `${d.brand} · ${d.type}` }),
    nm(String(d.colourways.length), 'inkSoft'),
    nm(kf(years[LATEST], F)),
    nm(kf(years[LATEST - 1], F), 'muted'),
    deltaOf(years),
    share(years[LATEST], grand),
  ]))
  rows.push(row([
    tx(OTHER_DESIGNS.label, { s: 1 }), nm('—', 'muted'),
    nm(kf(OTHER_DESIGNS.years[LATEST], F), 'inkSoft'),
    nm(kf(OTHER_DESIGNS.years[LATEST - 1], F), 'muted'),
    deltaOf(OTHER_DESIGNS.years),
    share(OTHER_DESIGNS.years[LATEST], grand),
  ]))
  rows.push(row([
    tx('All designs', { w: 600, c: 'ink' }), nm('—', 'muted'),
    nm(kf(grand, F), 'accent'), nm(kf(grandPrev, F), 'muted'),
    deltaCell(grandPrev, grand),
    nm('100%', 'muted'),
  ], true))
  return { cols, rows, minW: '760px', note: 'Quantity is deliberately absent from this view — cloth sells by the metre and wallpaper by the roll, so a single column adding them would be a figure with no unit. Pick a design to see its colourways, quantities and years.' }
}

// ---- dispatch -----------------------------------------------------------------

const BUILDERS = {
  owner: buildOwner,
  account: buildAccount,
  brandtype: buildBrandType,
  designsales: buildDesignSales,
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

// R-13 is the first report with NO fixture behind it — it is the platform's own
// answer or nothing at all. Everything that walks the library (the export
// buttons, the leak sweep, the structural tests) asks this rather than
// discovering it as a crash inside buildReport.
export const hasFixture = (key) => Boolean(BUILDERS[key])

const NO_FIXTURE_REASON =
  'This report is served by the platform and has no indicative version — it draws once the API answers.'

// state: { report, period, dim, brand } → table descriptor (never throws on bad keys).
//
// `access` defaults to NO_ACCESS — fail closed. A caller that forgets to pass it gets
// the most restricted table, not the least: the failure mode of a forgotten gate should
// be a missing column someone reports, not a leaked cost nobody notices.
//
// Whole-report denial (R-02/R-06/R-11/R-12) is NOT decided here — canViewReport() owns that,
// because the screen must render a reason rather than an empty table. This applies the
// column-level mask only.
export function buildReport(state, access = NO_ACCESS) {
  const def = reportDef(state.report)
  if (!hasFixture(def.key)) {
    return { def, cols: [], rows: [], minW: '0', note: '', empty: true, emptyReason: NO_FIXTURE_REASON }
  }
  const F = def.periods ? periodFactor(state.period) : 1
  const build = BUILDERS[def.key]
  const table = build(state, F, access)
  return { def, ...applyReportAccess(table, def.key, access) }
}

// ---- live reports (atelier-api) ------------------------------------------------
//
// Four of the thirteen are served by the platform now, from its own orders and
// inventory rather than from data/reportLibrary.js. Everything below turns one
// of those responses into the SAME table descriptor the demo builders emit, so
// the screen renders one shape and exportRows() keeps working unchanged.
//
// THE SERVER IS THE ONLY AUTHORITY ON A LIVE TABLE. `applyReportAccess` must
// NOT run over one: atelier-api's maskReport already deleted every column this
// login may not have, before the payload existed — and running the CRM's policy
// on top would act on labels that are not there (R-10's `financeTotalRow` would
// drop a totals row that carries no cost at all) while implying the client had
// a say in it. The masked note therefore comes from `meta.masked_columns`, the
// server's own list, and never from REPORT_POLICY. One report, one authority.
//
// The mapping is by question, not by name, and two of the three are imperfect
// in a way worth stating: R-11 asks for brand × product type and the live
// report answers house × design carrying a type column; R-10 asks for holdings
// with a valuation and the live report has no landed cost to value them with
// (A1 open), so it carries none rather than a placeholder.
//
// R-13 (`orders`) is the exception to "the mapping is by question": it exists
// BECAUSE the platform answers it. The office asked to click a report figure and
// see the orders behind it, and the line-grain read is what those orders are —
// so it has no fixture at all (hasFixture), and it is the report every clickable
// row leads to.
export const LIVE_REPORTS = Object.freeze({
  brandtype: '/admin/reports/product-performance',
  notinvoiced: '/admin/reports/not-invoiced',
  stock: '/admin/reports/stock',
  orders: '/admin/reports/revenue-lines',
  // R-01 — order-grain attribution (A6 groundwork). The static fixture stays
  // as the fallback shape; the live table is the API's sales-by-rep.
  owner: '/admin/reports/sales-by-rep',
  // R-12 — the client's verbatim ask ("how much is sold on a product, with
  // colour"): sales and stock on one row per colourway, catalogue-rooted so a
  // colour nobody buys is a row too.
  designsales: '/admin/reports/colourway-performance',
})

// Columns the API declares so a row can be OPENED by identity, not drawn: the
// slugs beside the names, and the colourway's hex, which rides on the name
// cell as a swatch instead of standing as a column of hex strings. The CRM's
// CSV (exportRows) follows the drawn columns, so none of these reach it either;
// the API's own export writes them, as the identities a spreadsheet keys on.
const HIDDEN_LIVE_KEYS = new Set(['brand_slug', 'product_slug', 'collection_slug', 'hex'])
const SWATCH_HOST_KEYS = ['colourway_name', 'name']

// null for a report that is still demo data — which is what the screen branches
// on, so "is this live" is asked in one place.
export const liveReportPath = (key) => LIVE_REPORTS[key] || null

// Fixed widths by kind, so a figure column never stretches; the first column is
// the subject and takes the slack.
const LIVE_WIDTHS = { text: '1fr', number: '104px', money: '124px', date: '112px' }
const LIVE_SUBJECT_WIDTH = '1.4fr'
const LIVE_MIN_COLUMN_PX = 128

const liveAlign = (kind) => (kind === 'text' ? 'left' : 'right')

// Cents to units at 2dp, the same conversion atelier-api's CSV writer makes
// (src/reports/export.js) — the column declares `kind: 'money'` once for the
// table and the file alike, and 100000 under a heading of "Sales" is a wrong
// figure to every human who reads it. No symbol: the row carries its own
// currency column and this formatter never guesses one.
const liveMoney = (value) => {
  const cents = Number(value)
  if (!Number.isFinite(cents)) return String(value)
  return (cents / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const liveNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-NZ') : String(value)
}

// The API sends timestamps as ISO strings; the office reads dates.
const liveDate = (value) => String(value).slice(0, 10)

// An ABSENT key is a dash, never a zero. A totals row deliberately omits a
// figure that cannot be added — metres and units do not sum, and neither do two
// currencies — so a nil printed there would state a total nobody computed.
function liveCell(column, source, { total = false, subject = false } = {}) {
  const value = source ? source[column.key] : undefined
  if (value === undefined || value === null || value === '') {
    return tx('—', { a: liveAlign(column.kind), c: 'muted' })
  }
  if (column.kind === 'money') return nm(liveMoney(value), total ? 'accent' : 'ink')
  if (column.kind === 'number') return nm(liveNumber(value), total ? 'ink' : 'inkSoft')
  if (column.kind === 'date') return nm(liveDate(value), 'inkSoft')
  if (total) return tx(value, { w: 600, c: 'ink' })
  return tx(value, subject ? { s: 1 } : {})
}

// What the table says about itself, below it. Coverage first because it states
// what the figures ARE; the rest qualify them.
export function liveNote(meta = {}) {
  const parts = []
  if (meta.coverage && meta.coverage.note) parts.push(meta.coverage.note)
  if (meta.truncated) {
    parts.push(`Showing ${meta.row_limit} of ${meta.rows_total} rows — the totals cover every row.`)
  }
  // A filter the report could not honour narrowed nothing. Said here for the
  // same reason the API writes it into the CSV: silence reads as "filtered".
  if (meta.ignored_filters && meta.ignored_filters.length) {
    parts.push(`Filters this report cannot honour were ignored: ${meta.ignored_filters.join(', ')}.`)
  }
  return parts.join(' ')
}

// The server's own list of what it withheld, by LABEL — all `meta.masked_columns`
// carries, because a withheld figure's KEY is the machine name of something this
// login may not have. An unannounced mask is worse than a locked report: it looks
// complete.
export function liveMaskedNote(meta = {}) {
  const masked = meta.masked_columns || []
  if (!masked.length) return ''
  return `${masked.join(' and ')} ${masked.length > 1 ? 'are' : 'is'} not shown on your access — this table is partial.`
}

const LIVE_NO_ROWS =
  'The platform holds no rows for this report yet. Orders and holdings created here appear as soon as they exist.'
const LIVE_NO_COLUMNS =
  'The API answered with no columns, so there is nothing to draw. This is a fault rather than an empty report — tell whoever runs the platform.'

// ---- drill-down (Userback 8287873) ---------------------------------------------
//
// "For the reports, we should be able to click and see what orders were placed."
// A row leads to the orders behind it, and WHICH orders those are is read off the
// row rather than off the report's name wherever it can be: every report grained
// by order line carries `order_number` (not-invoiced and revenue-lines both), so
// one rule covers them and any later report at that grain.
//
// An aggregate row has no order number, so product performance leads to R-13 with
// its own row's dimension applied. `category` is the only filterable dimension
// its rows actually carry — atelier-api deliberately gives NO report a
// `brand_code` or `range` column (its reports/CLAUDE.md: they are filters only) —
// so an uncategorised row leads nowhere rather than to an unfiltered list dressed
// up as a drill-down.
//
// THE ROW'S DIMENSION IS NOT THE WHOLE QUESTION. The figure being clicked was
// produced under the bar's applied filters as well, so the link carries those
// too — `meta.filters` is the API's own echo of what it applied, which is why
// they come off the envelope rather than off the screen's state. Without them a
// director who filtered August clicked an August figure and was shown every
// wallpaper line the platform holds, across all time, titled as the orders
// behind that August number: a wrong answer, not a missing feature. Only the
// bar's own keys survive the trip (reportSearchParams' vocabulary), so a filter
// R-13 has no box for cannot arrive in a URL the bar would then fail to draw.
const ORDERS_REPORT = 'orders'
const PRODUCT_PERFORMANCE = 'product-performance'
const trimmedValue = (value) => (value == null ? '' : String(value).trim())

/**
 * Where one row of a live report leads, as a router path — '' for a row with
 * nothing behind it.
 *
 * @param {string} report the API's own report name (`payload.report`)
 * @param {object} source the row as the API sent it, before the cells were built
 * @param {object} [filters] the applied filters the API echoed (`meta.filters`)
 * @returns {string}
 */
export function reportRowLink(report, source, filters = {}) {
  const orderNumber = trimmedValue(source && source.order_number)
  // An order number identifies ONE order; narrowing it further could only hide
  // the row that was clicked, so the order desk's link carries no filters.
  if (orderNumber) return `/admin/orders?q=${encodeURIComponent(orderNumber)}`
  // A row that names a house, a collection, a design, a colour or a month opens
  // the insight for it, under the same context. This is what "click on a
  // report and see its workings" means: every aggregate row is a door.
  const insight = insightLinkFor(source, filters)
  if (insight) return insight
  if (report !== PRODUCT_PERFORMANCE) return ''
  const category = trimmedValue(source && source.category)
  if (!category) return ''
  const search = new URLSearchParams(reportSearchParams(ORDERS_REPORT, { ...filters, category }))
  return `/reporting/library?${search}`
}

/**
 * Turn one atelier-api report envelope — { report, title, columns, rows, totals,
 * meta } — into the screen's table descriptor.
 *
 * A payload with no rows returns the `empty` shape the demo builders use rather
 * than a bare header: a heading over nothing reads as broken, where a sentence
 * saying the window held no rows is an answer.
 */
export function buildLiveReport(payload, { hide = [] } = {}) {
  const declared = (payload && payload.columns) || []
  const meta = (payload && payload.meta) || {}
  if (!declared.length) {
    return { cols: [], rows: [], minW: '0', note: '', empty: true, emptyReason: LIVE_NO_COLUMNS, live: true, masked: '' }
  }

  // The drawn columns. The link columns stay on the SOURCE row (reportRowLink
  // reads them) and leave the table; `hide` is the caller's own list — the
  // insight drops a column whose every value IS the pinned subject. Hiding
  // never empties a table: a table of only hidden columns keeps them all.
  const shown = declared.filter((column) => !HIDDEN_LIVE_KEYS.has(column.key) && !hide.includes(column.key))
  const columns = shown.length ? shown : declared.filter((column) => !HIDDEN_LIVE_KEYS.has(column.key))
  const swatchAt = columns.findIndex((column) => SWATCH_HOST_KEYS.includes(column.key))

  const cols = columns.map((column, i) =>
    col(column.label, i === 0 ? LIVE_SUBJECT_WIDTH : LIVE_WIDTHS[column.kind] || LIVE_WIDTHS.text, liveAlign(column.kind)))

  const cellsOf = (source, options) => {
    const cells = columns.map((column, i) => liveCell(column, source, { ...options, subject: i === 0 }))
    // A colourway's hex rides on its name as a swatch (the R-12 rule): the
    // cell already carries the name, so the CSV loses the square and not a word.
    const hex = trimmedValue(source && source.hex)
    if (hex && swatchAt >= 0 && !options.total) cells[swatchAt] = { ...cells[swatchAt], hex }
    return cells
  }

  // The totals row deliberately gets no link: it is every order at once, which
  // is the list the reader is already looking at.
  const rows = (payload.rows || []).map((source) => ({
    ...row(cellsOf(source, {})),
    link: reportRowLink(payload.report, source, meta.filters),
  }))

  if (payload.totals) {
    rows.push(row(cellsOf(payload.totals, { total: true }), true))
  }

  const masked = liveMaskedNote(meta)
  if (!payload.rows || !payload.rows.length) {
    return {
      cols: [], rows: [], minW: '0', note: '', live: true, masked, meta,
      empty: true,
      emptyReason: liveNote(meta) || LIVE_NO_ROWS,
    }
  }

  return {
    cols,
    rows,
    minW: `${cols.length * LIVE_MIN_COLUMN_PX}px`,
    note: liveNote(meta),
    live: true,
    masked,
    meta,
    title: payload.title || '',
  }
}

// Flatten a built table for CSV / print export: sub-lines join the main text.
export function exportRows(table) {
  const head = table.cols.map((cl) => cl.t)
  const rows = table.rows.map((r) => r.cells.map((cell) => cell.sub ? `${cell.t} — ${cell.sub}` : cell.t))
  return { head, rows }
}
