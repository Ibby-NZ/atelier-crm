// Report access policy (R-01…R-13) — the one place that decides what a login
// may read of the report library. Kept together, not scattered across screens,
// because the leaks here are subtle and want one auditable list.
//
// DEMO-GRADE. See the banner in ./roles.js — masking a column does not unsend it.
//
// Two rules, and the second is the one that bites:
//
//   1. WHOLE-REPORT denial, when the report simply *is* the finance (R-06), or
//      when its grain cannot answer "my own sales" (R-02, R-11 — see A6 below).
//
//   2. COLUMN-LEVEL masking, when the report survives losing its cost columns
//      (R-03, R-04, R-07, R-10). The principle the client chose: mask the
//      finance, keep the workflow. A salesperson still needs to know what is in
//      stock; they do not need to know what it landed at.
//
// The trap in rule 2: a cost column is not the only thing that leaks a cost.
// R-04's "Under 30%" flag pill states the margin band in words, and R-03/R-04's
// footnotes narrate the margin story. Dropping the numeric column while leaving
// those behind masks the figure and publishes the fact. Hence `pillMask` and
// `noteWhenMasked` — they are not polish, they close the actual hole.
//
// A6 (Atelier-Action-List.md — person definitions, owed by Liz & Jenette):
// R-02 is grained by trade account and R-11 by brand. Neither carries a
// salesperson dimension, so "scope it to Rebecca's own sales" has nothing to
// scope ON. This is not a coding gap to work around — it is the missing input
// showing through, and the honest demo behaviour is to say so rather than quietly
// serve all-company figures to a role explicitly denied them.

import { CAPS } from './roles.js'

// needsCap       — deny the whole report unless the login holds this capability
// denialReason   — shown in place of the report; explains WHY, never just "denied"
// financeCols    — column labels dropped when the login lacks finance.view
// financeTotalRow— drop the totals row too when masked (its total IS a cost figure)
// pillMask       — { from: [labels], to: 'neutral text' } for pills that state a band
// noteWhenMasked — replacement footnote when the real one narrates cost/margin
// ownerScoped    — honours own-sales-only scoping (RPT-03); handled in buildOwner
export const REPORT_POLICY = {
  // R-01 — live against /admin/reports/sales-by-rep. The live report has no
  // own-sales scoping yet (that is the real A6 decision), so the honest gate is
  // all-company access with the reason written down — the R-02/R-11 posture.
  // `ownerScoped` stays for the demo builder, which still scopes the fixture.
  owner: {
    ownerScoped: true,
    needsCap: CAPS.REPORTS_ALL,
    denialReason:
      'The live sales-by-staff report is not yet scoped to your own sales — that needs A6 ' +
      '(salesperson vs owner vs account holder) settled with Atelier. Until then it is ' +
      'company-wide and needs all-company report access.',
  },

  // R-02 — grained by trade account. A6 owes us the account-owner rule.
  account: {
    needsCap: CAPS.REPORTS_ALL,
    denialReason:
      'Sales per account holder has no salesperson grain, so it cannot be scoped to your own sales. ' +
      'Resolving A6 (account owner / account manager) would let this report open to the User role.',
  },

  // R-11 — grained by brand. Same shape of gap as R-02.
  brandtype: {
    needsCap: CAPS.REPORTS_ALL,
    denialReason:
      'Sales by brand & product type is a company-wide roll-up with no salesperson grain — ' +
      'it cannot be scoped to your own sales (A6).',
  },

  // R-12 — grained by design and colourway. The same A6 gap as R-02 and R-11, and
  // it must be closed for the same reason: its by-design view totals to the company's
  // FY figure, which own-sales scoping exists to withhold. Carrying no cost column is
  // not enough to open it — the leak this rule guards is the all-company TOTAL, not
  // the margin. The denial points at R-10 because half this report's usefulness to a
  // salesperson (what is on the shelf, by colour) is already on their access there.
  designsales: {
    needsCap: CAPS.REPORTS_ALL,
    denialReason:
      'Sales per design & colourway is grained by design, not by salesperson, so it cannot be scoped ' +
      'to your own sales (A6) — and its totals are the company’s. Holdings by colourway are open to ' +
      'you in R-10, the stock report.',
  },

  // R-03 — filed under Sales, but its whole purpose is a cost exception. The
  // footnote is the leak: it names the margin consequence outright.
  zerocost: {
    financeCols: ['Cost'],
    noteWhenMasked: 'Three lines are missing a cost and need review before month-end close.',
  },

  // R-04 — the hard case. Masking "Cost /m" and "Margin" still leaves a pill
  // reading "Under 30%", which is the margin band in words — and the report's own
  // standing description ("Sales margin under 30% or over 70%") says it again in
  // the heading. A figure has three ways out of this report and only one of them
  // is a column.
  margin: {
    financeCols: ['Cost /m', 'Margin'],
    pillMask: { from: ['Under 30%', 'Over 70%'], to: 'Pricing review' },
    noteWhenMasked: 'These lines are flagged for pricing review.',
    descWhenMasked: 'Sales lines flagged for pricing review.',
  },

  // R-05 — "Value" here is sell, not cost. Open.
  notinvoiced: {},

  // R-13 — the order lines behind the sales figures, and the report every
  // clickable row leads to. Grained by order line, so it has no more of a
  // salesperson dimension than R-02 or R-11 (A6 again) and its total is the
  // company's revenue — the same leak the R-12 rule guards, which is why it is
  // gated with them rather than left open like R-05. Its money is sell, not
  // cost, so nothing here is finance-masked.
  orders: {
    needsCap: CAPS.REPORTS_ALL,
    denialReason:
      'Orders placed lists every order line the platform holds, with no salesperson grain to scope ' +
      'it to your own sales (A6) — and its total is the company’s.',
  },

  // R-06 — committed purchase spend. There is no version of this minus the money.
  purchases: {
    needsCap: CAPS.FINANCE_VIEW,
    denialReason: 'The purchases report is committed supplier spend — a finance report end to end.',
  },

  // R-07 — "Value" is the supplier PO value. Minus it, the ETAs and routing are
  // still exactly what a salesperson chasing an order needs.
  shipment: {
    financeCols: ['Value'],
  },

  // R-08 — quantities only.
  inwards: {},

  // R-09 — the footnote mentions landed cost in prose but carries no figure.
  delivery: {},

  // R-10 — minus landed and value this is a stock availability report, which is
  // useful to everyone. The totals row is "Stock valuation" — a pure cost figure,
  // so it goes with the columns, and the description stops advertising a valuation
  // the reader cannot see.
  stock: {
    financeCols: ['Landed /m', 'Value'],
    financeTotalRow: true,
    descWhenMasked: 'Holdings and allocation.',
  },
}

const policyFor = (key) => REPORT_POLICY[key] || {}

// Fixed column widths are 'NNNpx'; flexible ones ('1.4fr') contribute nothing to the
// minimum. Dropping a column has to give its width back, or the masked table keeps
// scrolling horizontally for a column that is no longer there.
const pxOf = (w) => {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(String(w || ''))
  return m ? parseFloat(m[1]) : 0
}

// Fail closed: an unknown report key is denied rather than rendered ungated.
export function canViewReport(access, key) {
  if (!REPORT_POLICY[key]) return false
  const p = policyFor(key)
  if (!p.needsCap) return true
  if (p.needsCap === CAPS.REPORTS_ALL) return Boolean(access.all)
  if (p.needsCap === CAPS.FINANCE_VIEW) return Boolean(access.finance)
  return false
}

export function reportDenialReason(key) {
  return policyFor(key).denialReason || 'You do not have access to this report.'
}

// The report's standing description, swapped when it narrates a figure this login
// cannot read. A heading is a place a cost escapes from just as surely as a column
// is — R-04's real description states the margin band outright.
export function reportDesc(def, access) {
  if (access.finance) return def.desc
  return policyFor(def.key).descWhenMasked || def.desc
}

// Does this login lose any column of this report? Drives the "masked" hint so the
// reader knows the table is partial rather than believing it is the whole picture.
export function reportIsMasked(access, key) {
  if (access.finance) return false
  const p = policyFor(key)
  return Boolean(p.financeCols && p.financeCols.length)
}

// Strip finance columns (and the cells beneath them) from a built table.
// Applied inside buildReport, which is what exportRows() flattens — so CSV and
// print inherit the same gate instead of needing a second, driftable copy.
export function applyReportAccess(table, key, access) {
  if (access.finance) return table
  const p = policyFor(key)
  const drop = p.financeCols || []
  let { cols, rows, note, minW } = table

  if (drop.length) {
    const keep = cols.map((cl) => !drop.includes(cl.t))
    const reclaimed = cols.filter((_, i) => !keep[i]).reduce((s, cl) => s + pxOf(cl.w), 0)
    cols = cols.filter((_, i) => keep[i])
    // Cells are positional — strip them in lockstep with the columns or every figure
    // renders one header to the left, which is worse than showing the cost.
    rows = rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => keep[i]) }))
    if (p.financeTotalRow) rows = rows.filter((r) => !r.total)
    if (p.noteWhenMasked) note = p.noteWhenMasked
    const base = pxOf(minW)
    if (base && reclaimed) minW = Math.max(0, base - reclaimed) + 'px'
  }

  if (p.pillMask) {
    rows = rows.map((r) => ({
      ...r,
      cells: r.cells.map((cell) =>
        cell.kind === 'pill' && p.pillMask.from.includes(cell.t)
          ? { ...cell, t: p.pillMask.to, tone: 'muted' }
          : cell),
    }))
  }

  return { ...table, cols, rows, note, minW }
}
