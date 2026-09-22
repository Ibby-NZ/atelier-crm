import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import {
  EMPTY_PURCHASE_ORDER_SEARCH,
  PURCHASE_ORDERS_PATH,
  PURCHASE_ORDER_HEADER_FIELDS,
  PURCHASE_ORDER_LIST_LIMIT,
  PURCHASE_ORDER_STATUSES,
  RECEIPT_LABELS,
  availableMoves,
  backordersFor,
  brandOptions,
  buildLineEdits,
  buildPurchaseOrderBody,
  buildReceiptBody,
  canDeletePurchaseOrder,
  canEditPurchaseOrder,
  canReceive,
  closeIntent,
  closedShort,
  costText,
  describePurchaseOrder,
  draftFromPurchaseOrderLine,
  generateBody,
  generatePath,
  goodsLines,
  hasPurchaseOrderFilters,
  newPurchaseOrderLine,
  newPurchaseOrderSampleLine,
  outstandingLabel,
  parseReceiptQty,
  planLineLabel,
  planPath,
  planSummary,
  purchaseOrderFilters,
  purchaseOrderMovePath,
  purchaseOrderPath,
  purchaseOrderRoute,
  qtyText,
  receiptDefault,
  receiptsPath,
  sampleLines,
  sampleReceiptOutcome,
  showsCost,
  totalCostText,
  unlinkedBrandNote,
  supplierOptions,
  brandsForSupplier,
  defaultBrandFor,
  colourwayOptionLabel,
  colourwayPagePaths,
  shouldSyncBill,
  canPushBill,
  billText,
  sentNote,
} from './adminPurchaseOrders.js'

// The three purchase-order screens cannot be rendered here (no jsdom), so
// everything that is a decision lives in adminPurchaseOrders.js and is tested
// from this side. The .jsx files are scanned at the foot of this file.

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

// Comments are STRIPPED before a negative scan, the posture atelier-api's own
// purchasing suite takes: every rule below is one this code documents at length,
// and a scan for `Math.min` or `rollUpReceiptState` that fails against the
// paragraph explaining why they are absent teaches whoever hits it to delete the
// explanation. A comment may still explain; only code may not do it.
const code = (name) =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const LIST_SOURCE = read('AdminPurchaseOrders.jsx')
const DETAIL_SOURCE = read('AdminPurchaseOrder.jsx')
const LIST_CODE = code('AdminPurchaseOrders.jsx')
const DETAIL_CODE = code('AdminPurchaseOrder.jsx')
const NEW_CODE = code('AdminPurchaseOrderNew.jsx')
const MODULE_CODE = code('adminPurchaseOrders.js')

describe('paths', () => {
  it('builds every path from one base', () => {
    expect(PURCHASE_ORDERS_PATH).toBe('/admin/purchase-orders')
    expect(purchaseOrderPath(12)).toBe('/admin/purchase-orders/12')
    expect(purchaseOrderMovePath(12, 'send')).toBe('/admin/purchase-orders/12/send')
    expect(planPath).toBe('/admin/purchase-orders/plan')
    expect(generatePath).toBe('/admin/purchase-orders/generate')
    expect(purchaseOrderRoute(12)).toBe('/admin/purchase-orders/12')
  })

  // Receipts hang off the LINE, not off the order: a receipt is a statement
  // about one design arriving.
  it('books a receipt against a line, never against the order', () => {
    expect(receiptsPath(88)).toBe('/admin/purchase-order-lines/88/receipts')
  })
})

describe('the state machine mirrors the API', () => {
  it('offers exactly the moves the API accepts from each status', () => {
    const keys = (status) => availableMoves({ status }).map((move) => move.key)
    expect(keys('draft')).toEqual(['send', 'cancel'])
    // `closed` is reachable only from `sent`: closing a draft is a cancellation
    // with the wrong word on it, and the two must stay distinguishable.
    expect(keys('sent')).toEqual(['pay', 'close', 'cancel'])
    expect(keys('paid')).toEqual(['close'])
    expect(keys('closed')).toEqual(['pay'])
    expect(keys('cancelled')).toEqual([])
  })

  it('offers nothing for a status it has never heard of, rather than throwing', () => {
    expect(availableMoves({ status: 'invented' })).toEqual([])
    expect(availableMoves()).toEqual([])
  })

  it('holds the same vocabulary the route spends as its enum', () => {
    expect([...PURCHASE_ORDER_STATUSES]).toEqual(['draft', 'sent', 'paid', 'closed', 'cancelled'])
  })
})

describe('closed is NOT full', () => {
  // The single most expensive mistake this screen could make: drawing a
  // purchase order closed short as though everything had arrived.
  it('names a closed order that never came in full', () => {
    expect(closedShort({ status: 'closed', receipt_state: 'part' })).toBe(true)
    expect(closedShort({ status: 'closed', receipt_state: 'none' })).toBe(true)
    expect(closedShort({ status: 'closed', receipt_state: 'full' })).toBe(false)
    expect(closedShort({ status: 'sent', receipt_state: 'part' })).toBe(false)
  })

  it('says which decision Close is taking before it is taken', () => {
    expect(closeIntent({ receipt_state: 'full' })).toMatch(/everything ordered has arrived/i)
    expect(closeIntent({ receipt_state: 'part' })).toMatch(/short/i)
  })

  // Two vocabularies, never merged. `over` is a first-class receipt state.
  it('keeps a separate word for every receipt state, including over', () => {
    expect(Object.keys(RECEIPT_LABELS)).toEqual(['none', 'part', 'full', 'over'])
    expect(RECEIPT_LABELS.over).toMatch(/over/i)
  })

  it('never recomputes a receipt state in the browser', () => {
    // The API derives it from the append-only ledger at read time; a browser
    // summing receipts answers with whichever rows it happens to hold.
    expect(MODULE_CODE).not.toMatch(/receiptState\s*\(/)
    expect(MODULE_CODE).not.toMatch(/rollUpReceiptState/)
    expect(DETAIL_CODE).not.toMatch(/reduce\(/)
  })
})

describe('over-receipt is legitimate and is never clamped', () => {
  it('accepts more than was ordered', () => {
    expect(parseReceiptQty('42')).toEqual({ ok: true, qty: 42 })
    expect(parseReceiptQty('1000000')).toEqual({ ok: true, qty: 1000000 })
  })

  // A mistaken 42 is corrected by a −42 row: the ledger is append-only and has
  // no PATCH and no DELETE.
  it('accepts a negative, which is how a mistake is reversed', () => {
    expect(parseReceiptQty('-42')).toEqual({ ok: true, qty: -42 })
  })

  it('refuses only zero, which is the database CHECK', () => {
    const zero = parseReceiptQty('0')
    expect(zero.ok).toBe(false)
    expect(zero.error).toMatch(/non-zero/i)
  })

  it('refuses a blank and a word', () => {
    expect(parseReceiptQty('').ok).toBe(false)
    expect(parseReceiptQty('lots').ok).toBe(false)
  })

  // The demo screen did `q = Math.min(q, out)`. That is the one line that had to
  // be dropped in the port: clamping destroys exactly the discrepancy the office
  // has to take up with the house.
  it('does not carry the demo screen’s clamp', () => {
    expect(MODULE_CODE).not.toContain('Math.min')
    expect(DETAIL_CODE).not.toContain('Math.min')
  })

  it('states a negative outstanding as an over-receipt rather than hiding it', () => {
    expect(outstandingLabel(-2)).toBe('2 over')
    expect(outstandingLabel(0)).toBe('0')
    expect(outstandingLabel(15)).toBe('15')
    expect(outstandingLabel(null)).toBe('—')
  })

  it('pre-fills the box with the balance, and with nothing once it is square', () => {
    expect(receiptDefault({ qty_outstanding: 15 })).toBe('15')
    expect(receiptDefault({ qty_outstanding: 0 })).toBe('')
    // Never a negative: a reversal is typed deliberately, not offered.
    expect(receiptDefault({ qty_outstanding: -2 })).toBe('')
  })
})

describe('buildReceiptBody', () => {
  it('sends the quantity alone when nothing else was typed', () => {
    expect(buildReceiptBody({ qty: '12' })).toEqual({ ok: true, body: { qty: 12 } })
  })

  // The column is NOT NULL with a now() default: an omitted date takes it, and
  // an explicit null would violate the constraint instead.
  it('omits a blank date rather than sending null', () => {
    const built = buildReceiptBody({ qty: '12', received_at: '' })
    expect(Object.hasOwn(built.body, 'received_at')).toBe(false)
  })

  it('carries the consignment reference, which belongs on the arrival', () => {
    expect(buildReceiptBody({ qty: '3', consignment_ref: 'CN-88', notes: 'torn roll' })).toEqual({
      ok: true,
      body: { qty: 3, consignment_ref: 'CN-88', notes: 'torn roll' },
    })
  })

  it('refuses a zero before the round trip, in the API’s own words', () => {
    expect(buildReceiptBody({ qty: '0' }).ok).toBe(false)
  })
})

describe('the create form', () => {
  // supplier_id is DERIVED from brands.supplier_id. A client-chosen value
  // produces a well-formed purchase order addressed to the WRONG HOUSE, and
  // Ajv would strip the key rather than reject it, so nothing would say so.
  it('never builds a supplier_id, anywhere', () => {
    const built = buildPurchaseOrderBody(
      { brand_id: '4', supplier_id: '9' },
      [{ colourway_id: 1, sku: 'A', qty_ordered: '10' }]
    )
    expect(Object.hasOwn(built.body, 'supplier_id')).toBe(false)
    // The create screen never names it at all. (The LIST screen legitimately
    // does: `supplier_id` is one of the filters GET /admin/purchase-orders
    // accepts, which is a different thing from choosing one on a create.)
    expect(NEW_CODE).not.toMatch(/supplier_id/)
  })

  it('builds the body the route accepts', () => {
    expect(
      buildPurchaseOrderBody(
        { brand_id: '4', expected_at: '2026-09-01', notes: 'phone order' },
        [{ colourway_id: 7, sku: 'RUB-01', qty_ordered: '25.5', unit_price: '48.5', supplier_code: 'X1', notes: '' }]
      )
    ).toEqual({
      ok: true,
      body: {
        brand_id: 4,
        expected_at: '2026-09-01',
        notes: 'phone order',
        lines: [
          { colourway_id: 7, qty_ordered: 25.5, unit_price: 48.5, supplier_code: 'X1', notes: null },
        ],
      },
    })
  })

  // NULL and 0 are different facts, and Number(null) is 0 — a zero purchase
  // price reads as "the house gave it to us".
  it('leaves an unpriced line NULL rather than zero', () => {
    const built = buildPurchaseOrderBody({ brand_id: '1' }, [
      { colourway_id: 7, sku: 'A', qty_ordered: '5', unit_price: '' },
    ])
    expect(built.body.lines[0].unit_price).toBeNull()
  })

  it('accepts a genuinely free line as zero', () => {
    const built = buildPurchaseOrderBody({ brand_id: '1' }, [
      { colourway_id: 7, sku: 'A', qty_ordered: '5', unit_price: '0' },
    ])
    expect(built.body.lines[0].unit_price).toBe(0)
  })

  it('names the row that will not parse', () => {
    expect(
      buildPurchaseOrderBody({ brand_id: '1' }, [{ colourway_id: 7, sku: 'RUB-01', qty_ordered: '0' }])
    ).toEqual({ ok: false, error: 'RUB-01: the quantity must be more than zero.' })
  })

  it('refuses a purchase order with no house and one with no lines', () => {
    expect(buildPurchaseOrderBody({ brand_id: '' }, [{ colourway_id: 1, qty_ordered: '1' }]).ok).toBe(false)
    expect(buildPurchaseOrderBody({ brand_id: '3' }, []).ok).toBe(false)
  })
})

describe('sample lines (C18)', () => {
  it('splits samples from goods, working on drafts and API rows alike', () => {
    const rows = [
      { id: 1, is_sample: false },
      { id: 2, is_sample: true },
      { id: 3 }, // an API row from before the migration reads as goods
    ]
    expect(goodsLines(rows).map((row) => row.id)).toEqual([1, 3])
    expect(sampleLines(rows).map((row) => row.id)).toEqual([2])
  })

  it('starts a sample draft as one, with the tag blank', () => {
    const draft = newPurchaseOrderSampleLine({ id: 7, sku: 'RUB-01' })
    expect(draft.is_sample).toBe(true)
    expect(draft.sample_barcode).toBe('')
    // A goods draft carries the flag off, so the two sections cannot both
    // claim it.
    expect(newPurchaseOrderLine({ id: 7 }).is_sample).toBe(false)
  })

  it('sends the sample keys ONLY on a sample line, and puts samples LAST', () => {
    // Goods send neither key — the API defaults is_sample and a barcode on a
    // goods line is the CHECK's own 422 — and the body order is what puts the
    // samples at the BOTTOM of the raised document (the client's words).
    const built = buildPurchaseOrderBody({ brand_id: '1' }, [
      { colourway_id: 9, sku: 'S-1', qty_ordered: '1', unit_price: '12.5', is_sample: true, sample_barcode: ' ATL-S-001000 ' },
      { colourway_id: 7, sku: 'G-1', qty_ordered: '25', unit_price: '' },
    ])
    expect(built.ok).toBe(true)
    expect(built.body.lines).toEqual([
      { colourway_id: 7, qty_ordered: 25, unit_price: null, supplier_code: null, notes: null },
      {
        colourway_id: 9,
        qty_ordered: 1,
        unit_price: 12.5,
        supplier_code: null,
        notes: null,
        is_sample: true,
        sample_barcode: 'ATL-S-001000',
      },
    ])
  })

  it('sends a blank tag as null — the tag is often printed after the arrival', () => {
    const built = buildPurchaseOrderBody({ brand_id: '1' }, [
      { colourway_id: 9, sku: 'S-1', qty_ordered: '1', is_sample: true, sample_barcode: '' },
    ])
    expect(built.body.lines[0].sample_barcode).toBeNull()
    // And the price rule is the register's own: 0 is a free hanger, blank is
    // unpriced — different facts, both preserved.
    expect(built.body.lines[0].unit_price).toBeNull()
  })

  it('drafts the saved tag and diffs it only on a sample line', () => {
    const saved = [
      { id: 1, sku: 'G-1', qty_ordered: 25, is_sample: false, sample_barcode: null, supplier_code: null, notes: null },
      { id: 2, sku: 'S-1', qty_ordered: 1, is_sample: true, sample_barcode: 'ATL-S-001000', supplier_code: null, notes: null },
    ]
    const drafts = saved.map(draftFromPurchaseOrderLine)
    expect(drafts[1].is_sample).toBe(true)
    expect(drafts[1].sample_barcode).toBe('ATL-S-001000')

    // Untouched drafts produce no edits — a phantom barcode PATCH on a goods
    // line would be the CHECK's 422 on every save.
    expect(buildLineEdits(saved, drafts)).toEqual({ ok: true, lines: null })

    // Correcting the tag on the sample line is one edit naming it.
    const retagged = drafts.map((draft) =>
      draft.id === 2 ? { ...draft, sample_barcode: 'ATL-S-001001' } : draft
    )
    expect(buildLineEdits(saved, retagged)).toEqual({
      ok: true,
      lines: [{ id: 2, sample_barcode: 'ATL-S-001001' }],
    })

    // Typing into a goods draft's tag field changes nothing sendable: the
    // input is never drawn there, and the diff refuses to manufacture one.
    const wrongRow = drafts.map((draft) =>
      draft.id === 1 ? { ...draft, sample_barcode: 'ATL-S-999999' } : draft
    )
    expect(buildLineEdits(saved, wrongRow)).toEqual({ ok: true, lines: null })
  })

  it('keeps a sample line out of the back orders', () => {
    // A sample covers no sales demand, so however short it is, no client is
    // waiting on the balance.
    const purchaseOrder = {
      brand_name: 'Rubelli',
      lines: [
        { sku: 'G-1', product_name: 'Cloth', qty_ordered: 40, qty_received: 25, is_sample: false, allocations: [] },
        { sku: 'S-1', product_name: 'Hanger', qty_ordered: 2, qty_received: 1, is_sample: true, allocations: [] },
      ],
    }
    expect(backordersFor(purchaseOrder).map((entry) => entry.sku)).toEqual(['G-1'])
  })
})

describe('sampleReceiptOutcome', () => {
  it('says which tags were valued and which matched nothing', () => {
    const outcome = sampleReceiptOutcome({
      sample_register: { updated: ['ATL-S-001000'], unmatched: ['ATL-S-001001'] },
    })
    expect(outcome.flowed).toBe('Value flowed into the register for ATL-S-001000.')
    // The warning is the ACTIONABLE half and names the fix: register the tag,
    // then set its value on the sample — the manual field is the fallback.
    expect(outcome.warning).toMatch(/ATL-S-001001 is not in the register/)
    expect(outcome.warning).toMatch(/set its value on the sample/i)
  })

  it('stays silent for an ordinary goods receipt', () => {
    expect(sampleReceiptOutcome({ sample_register: { updated: [], unmatched: [] } })).toEqual({
      flowed: '',
      warning: '',
    })
    // And against an older API that sends no report at all.
    expect(sampleReceiptOutcome({})).toEqual({ flowed: '', warning: '' })
  })

  it('is surfaced by the detail screen as a persistent note, not dropped', () => {
    // The one thing the flow must not do is fail silently: the screen keeps
    // the outcome in state and renders the warning beside the samples.
    expect(DETAIL_SOURCE).toContain('sampleReceiptOutcome')
    expect(DETAIL_SOURCE).toContain('sampleNote?.warning')
  })
})

describe('a house with no supplier', () => {
  const brands = [
    { id: 1, name: 'Rubelli', supplier_id: 4 },
    { id: 2, name: 'Larsen', supplier_id: null },
    { id: 3, name: 'Fabricut', supplier_id: null },
  ]

  // It is REPORTED, never hidden: the 422 names the fix, and hiding the house
  // would leave the office wondering where the maison went.
  it('still offers the house, marked for what it is', () => {
    expect(brandOptions(brands)).toEqual([
      { id: 1, name: 'Rubelli', linked: true, label: 'Rubelli' },
      { id: 2, name: 'Larsen', linked: false, label: 'Larsen — no supplier linked' },
      { id: 3, name: 'Fabricut', linked: false, label: 'Fabricut — no supplier linked' },
    ])
  })

  it('counts them under the picker, because it fires until the backfill runs', () => {
    expect(unlinkedBrandNote(brands)).toMatch(/2 houses here have no supplier linked/)
    expect(unlinkedBrandNote([brands[0]])).toBe('')
  })

  // The API's own sentence names the house and the fix; re-phrasing it here
  // would lose one or the other.
  it('renders the API’s blocked message verbatim rather than a summary', () => {
    expect(LIST_SOURCE).toContain('entry.message')
  })
})

describe('plan, then generate', () => {
  const plan = {
    groups: [
      { brand_id: 4, brand_name: 'Rubelli', line_count: 2, order_count: 3, total_qty: 40 },
      { brand_id: 9, brand_name: 'Larsen', line_count: 1, order_count: 1, total_qty: 12 },
    ],
    blocked: [{ brand_id: 2, brand_name: 'Fabricut', message: '“Fabricut” has no supplier linked.' }],
    candidate_lines: 7,
  }

  // Raising exactly what was previewed. A house that became unlinked in between
  // is then a 422 naming it, which is the honest answer.
  it('raises exactly the houses the plan showed', () => {
    expect(generateBody(plan)).toEqual({ brand_ids: [4, 9] })
  })

  // brand_ids has maxItems: 100 — an over-long list would be a 400 that raises
  // nothing at all, so the unfiltered run (which reports its own blocked list)
  // is the safer fallback.
  it('falls back to the unfiltered run past the route’s 100-house cap', () => {
    const big = { groups: Array.from({ length: 101 }, (_, i) => ({ brand_id: i + 1 })) }
    expect(generateBody(big)).toEqual({})
    expect(generateBody({ groups: [] })).toEqual({})
    expect(generateBody()).toEqual({})
  })

  it('summarises what the dry run found, blocked houses included', () => {
    expect(planSummary(plan)).toBe(
      '2 purchase orders would be raised, and 1 house cannot be ordered from, from 7 open sales-order lines.'
    )
  })

  // "Nothing to raise" and "nothing is owed" are different answers: the first
  // can mean every candidate belongs to a house with no supplier.
  it('distinguishes nothing owed from nothing raisable', () => {
    expect(planSummary({ groups: [], blocked: [], candidate_lines: 0 })).toMatch(/nothing is owed/i)
    expect(
      planSummary({ groups: [], blocked: [{ brand_id: 1 }], candidate_lines: 4 })
    ).toMatch(/nothing can be raised/i)
  })

  it('names the sales orders behind a planned line, and calls the rest a stock buy', () => {
    expect(
      planLineLabel({ allocations: [{ order_number: 'SO-411' }, { order_number: 'SO-411' }, { order_number: 'SO-418' }] })
    ).toBe('for SO-411, SO-418')
    expect(planLineLabel({ allocations: [] })).toBe('stock buy')
    expect(planLineLabel()).toBe('stock buy')
  })

  // The plan writes nothing, so it must not be run through the mutation cycle
  // that reloads the list and reports a change.
  it('reads the plan without reloading the list', () => {
    expect(LIST_SOURCE).toContain('setPlanning')
    expect(LIST_SOURCE).toMatch(/const runPlan = async/)
  })
})

describe('finance gating', () => {
  // A masked figure is DELETED from the payload, not nulled — precisely so a
  // reader can tell "not permitted" from "not priced". So the test is hasOwn.
  it('draws the cost columns only when the payload carries them', () => {
    expect(showsCost({ total_cost: 100, lines: [] })).toBe(true)
    expect(showsCost({ lines: [{ unit_price: null }] })).toBe(true)
    expect(showsCost({ lines: [{ qty_ordered: 5 }] })).toBe(false)
    expect(showsCost({})).toBe(false)
  })

  it('reads an unpriced line as unpriced, not as free', () => {
    expect(costText(null)).toBe('Not priced')
    expect(costText(48.5, 'EUR')).toBe('48.50 EUR')
    // Not cents: purchasing has no integer-cents column anywhere, because a
    // purchase is foreign, fractional and unconverted.
    expect(costText(48.5)).toBe('48.50')
  })

  it('says why there is no total while any line is unpriced', () => {
    expect(totalCostText({ total_cost: 1200, currency: 'EUR' })).toBe('1,200.00 EUR')
    expect(totalCostText({ total_cost: null, unpriced_lines: 2 })).toBe('No total — 2 lines unpriced')
    // Absent means "you may not see it" and must draw nothing at all.
    expect(totalCostText({})).toBe('')
  })

  it('never sends back a price the login cannot read', () => {
    const saved = [{ id: 1, sku: 'A', qty_ordered: 10, supplier_code: null, notes: null }]
    const drafts = [draftFromPurchaseOrderLine(saved[0])]
    expect(drafts[0].unit_price).toBeUndefined()
    const edits = buildLineEdits(saved, [{ ...drafts[0], qty_ordered: '12' }])
    expect(edits.lines).toEqual([{ id: 1, qty_ordered: 12 }])
  })
})

describe('line edits', () => {
  const saved = [
    { id: 1, sku: 'A', qty_ordered: 10, unit_price: 48.5, supplier_code: 'X', notes: null },
    { id: 2, sku: 'B', qty_ordered: 5, unit_price: null, supplier_code: null, notes: null },
  ]
  const drafts = saved.map(draftFromPurchaseOrderLine)

  it('sends nothing when nothing moved — the route refuses an empty body', () => {
    expect(buildLineEdits(saved, drafts)).toEqual({ ok: true, lines: null })
  })

  it('sends only the keys that changed, with the id beside them', () => {
    const edited = [{ ...drafts[0], qty_ordered: '12' }, { ...drafts[1], unit_price: '30' }]
    expect(buildLineEdits(saved, edited).lines).toEqual([
      { id: 1, qty_ordered: 12 },
      { id: 2, unit_price: 30 },
    ])
  })

  it('clears a price back to null rather than to zero', () => {
    const edited = [{ ...drafts[0], unit_price: '' }, drafts[1]]
    expect(buildLineEdits(saved, edited).lines).toEqual([{ id: 1, unit_price: null }])
  })

  it('names the line that will not parse', () => {
    const edited = [{ ...drafts[0], qty_ordered: '-1' }]
    expect(buildLineEdits(saved, edited)).toEqual({
      ok: false,
      error: 'A: the quantity must be more than zero.',
    })
  })
})

describe('the header patch', () => {
  // Mirrors atelier-api's frozen PURCHASE_ORDER_UPDATE_COLUMNS. A key here and
  // not there is stripped by Ajv's removeAdditional and saves nothing.
  const API_UPDATE_COLUMNS = ['expected_at', 'notes', 'po_email', 'agent', 'incoterm', 'currency']

  it('declares exactly the columns the API accepts', () => {
    expect(PURCHASE_ORDER_HEADER_FIELDS.map((field) => field.key).sort()).toEqual(
      [...API_UPDATE_COLUMNS].sort()
    )
  })

  it('never offers status, brand or supplier — each moves another way', () => {
    const keys = PURCHASE_ORDER_HEADER_FIELDS.map((field) => field.key)
    expect(keys).not.toContain('status')
    expect(keys).not.toContain('brand_id')
    expect(keys).not.toContain('supplier_id')
    expect(keys).not.toContain('po_number')
  })

  // expected_at is a timestamptz. Slicing its ISO string reads the UTC day,
  // which is a day early under an NZ session for anything stored at local
  // midnight — the same reason the D365 corrections use `naive`.
  it('reads the expected date from the LOCAL clock, not from the UTC slice', () => {
    expect(PURCHASE_ORDER_HEADER_FIELDS.find((f) => f.key === 'expected_at').kind).toBe('naive')
  })

  it('reports no change when nothing was touched', () => {
    const order = {
      expected_at: '2026-09-01T00:00:00',
      notes: 'x',
      po_email: null,
      agent: null,
      incoterm: 'FOB',
      currency: 'EUR',
    }
    const draft = draftFrom(order, PURCHASE_ORDER_HEADER_FIELDS)
    expect(diffFields(order, draft, PURCHASE_ORDER_HEADER_FIELDS)).toEqual({ patch: {} })
  })
})

describe('filters', () => {
  it('is the endpoint’s own page size', () => {
    expect(PURCHASE_ORDER_LIST_LIMIT).toBe(50)
  })

  // An unset filter must be null, never ''. buildListQuery drops null; forwarded
  // as '' the status select's "All" becomes `status=`, which the route's enum
  // answers with a 400 that kills the whole list rather than one filter — and
  // the two id filters are integers, so '' is a 400 there too.
  it('drops every unset filter instead of sending an empty value', () => {
    expect(purchaseOrderFilters(EMPTY_PURCHASE_ORDER_SEARCH)).toEqual({
      status: null,
      brand_id: null,
      supplier_id: null,
      from: null,
      to: null,
    })
    expect(buildListQuery(purchaseOrderFilters(EMPTY_PURCHASE_ORDER_SEARCH))).toBe('')
  })

  it('sends the ids as integers', () => {
    expect(purchaseOrderFilters({ brand_id: '4', supplier_id: '9' })).toMatchObject({
      brand_id: 4,
      supplier_id: 9,
    })
  })

  it('knows whether anything is narrowing the list', () => {
    expect(hasPurchaseOrderFilters(EMPTY_PURCHASE_ORDER_SEARCH)).toBe(false)
    expect(hasPurchaseOrderFilters({ status: 'sent' })).toBe(true)
  })
})

describe('delete and receive windows', () => {
  // A receipt and an allocation each RESTRICT the delete, and there is no
  // archive to fall back on (`archivable: false`) — so the button is only drawn
  // where it would succeed, and the 409 stays the gate if the row moves.
  it('offers Delete on an untouched draft alone', () => {
    expect(canDeletePurchaseOrder({ status: 'draft', qty_received: 0 })).toBe(true)
    expect(canDeletePurchaseOrder({ status: 'draft', qty_received: 5 })).toBe(false)
    expect(canDeletePurchaseOrder({ status: 'sent', qty_received: 0 })).toBe(false)
    expect(canDeletePurchaseOrder({ status: 'cancelled' })).toBe(false)
  })

  // `draft` is deliberately receivable: plenty of orders are placed by phone and
  // written up after the rolls turn up. Only `cancelled` is refused — its demand
  // went back to the order desk.
  it('takes goods against anything but a cancelled order', () => {
    expect(canReceive({ status: 'draft' })).toBe(true)
    expect(canReceive({ status: 'sent' })).toBe(true)
    expect(canReceive({ status: 'closed' })).toBe(true)
    expect(canReceive({ status: 'cancelled' })).toBe(false)
  })

  it('refuses an edit on a cancelled order, as the API does', () => {
    expect(canEditPurchaseOrder({ status: 'cancelled' })).toBe(false)
    expect(canEditPurchaseOrder({ status: 'closed' })).toBe(true)
  })
})

describe('back orders, ported from the demo screen', () => {
  const order = {
    brand_name: 'Rubelli',
    lines: [
      { sku: 'A', product_name: 'Atlas', qty_ordered: 40, qty_received: 25, allocations: [{ order_number: 'SO-411' }] },
      { sku: 'B', product_name: 'Bosco', qty_ordered: 10, qty_received: 0, allocations: [] },
      { sku: 'C', product_name: 'Como', qty_ordered: 5, qty_received: 5, allocations: [] },
      { sku: 'D', product_name: 'Dune', qty_ordered: 5, qty_received: 7, allocations: [] },
    ],
  }

  // A line with nothing received is not a back order — it has not arrived at
  // all. A line over-received is not one either.
  it('is the part-received-and-still-short lines only', () => {
    const backorders = backordersFor(order)
    expect(backorders.map((entry) => entry.sku)).toEqual(['A'])
    expect(backorders[0].qty).toBe(15)
  })

  it('carries the sales orders ITS allocations name', () => {
    expect(backordersFor(order)[0].so).toBe('for SO-411')
  })

  it('is empty for an order with no lines', () => {
    expect(backordersFor({})).toEqual([])
  })
})

describe('naming a purchase order', () => {
  it('leads with the number, which is unique across the whole ledger', () => {
    expect(describePurchaseOrder({ po_number: 'PO-001042', brand_name: 'Rubelli' })).toBe(
      'PO-001042 — Rubelli'
    )
    expect(describePurchaseOrder({ po_number: 'PO-001042' })).toBe('PO-001042')
  })

  it('prints a missing quantity as an em dash rather than as zero', () => {
    expect(qtyText(null)).toBe('—')
    expect(qtyText('40.00')).toBe('40')
    expect(qtyText(0)).toBe('0')
  })
})

describe('the screens compose the kit', () => {
  it('drives the list through useCrudScreen rather than a hand-rolled paginator', () => {
    expect(LIST_SOURCE).toContain('useCrudScreen')
    expect(LIST_SOURCE).toContain('<Pagination')
    expect(LIST_SOURCE).not.toContain('Math.ceil(')
  })

  it('deletes through the kit’s dialog, never through a bare apiDelete', () => {
    expect(LIST_SOURCE).toContain('crud.remove.ask')
    expect(LIST_SOURCE).toContain('<ConfirmDialog')
    expect(LIST_SOURCE).not.toContain('apiDelete')
  })

  // purchase_orders has no archived_at column, so the API answers
  // `archivable: false` and a refusal correctly offers Cancel alone. The scan is
  // for the PATH, because the comment explaining why there is none says the word.
  it('offers no archive, because the entity has none', () => {
    expect(LIST_SOURCE).not.toContain('/archive')
    expect(DETAIL_SOURCE).not.toContain('/archive')
  })
})

// --- deep-linked search seed (the dashboard's Inbound tile) ------------------

import { purchaseOrderSearchSeed } from './adminPurchaseOrders.js'

describe('purchaseOrderSearchSeed', () => {
  it('carries a valid linked-in status into the search', () => {
    expect(purchaseOrderSearchSeed(new URLSearchParams('status=sent')).status).toBe('sent')
  })

  it('ignores an unknown status and a missing param alike', () => {
    expect(purchaseOrderSearchSeed(new URLSearchParams('status=teleported')).status).toBe('')
    expect(purchaseOrderSearchSeed(undefined).status).toBe('')
  })
})

describe('the supplier-first create form', () => {
  const suppliers = [
    { id: 4, name: 'Pierre Frey Paris', currency: 'EUR', archived_at: null },
    { id: 5, name: 'Colefax & Fowler', currency: 'GBP', archived_at: null },
    { id: 6, name: 'Gone', currency: 'USD', archived_at: '2026-01-01T00:00:00Z' },
  ]
  const brands = [
    { id: 1, name: 'Larsen', supplier_id: 5, archived_at: null },
    { id: 2, name: 'Colefax', supplier_id: 5, archived_at: null },
    { id: 3, name: 'Pierre Frey', supplier_id: 4, archived_at: null },
    { id: 7, name: 'Unlinked', supplier_id: null, archived_at: null },
  ]

  it('lists live suppliers by name with their invoicing currency', () => {
    expect(supplierOptions(suppliers)).toEqual([
      { id: 5, label: 'Colefax & Fowler · GBP' },
      { id: 4, label: 'Pierre Frey Paris · EUR' },
    ])
  })

  it('narrows the houses to the chosen supplier, none until one is chosen', () => {
    expect(brandsForSupplier(brands, '5')).toEqual([
      { id: 2, name: 'Colefax' },
      { id: 1, name: 'Larsen' },
    ])
    expect(brandsForSupplier(brands, '')).toEqual([])
    expect(brandsForSupplier(brands, 4)).toEqual([{ id: 3, name: 'Pierre Frey' }])
  })

  it('pre-picks the house only when the supplier invoices exactly one', () => {
    expect(defaultBrandFor(brandsForSupplier(brands, 4))).toBe('3')
    expect(defaultBrandFor(brandsForSupplier(brands, 5))).toBe('')
  })

  it('labels an item SKU first, then design and colour', () => {
    expect(colourwayOptionLabel({ sku: 'PF-1', product_name: 'Toile', name: 'Indigo' })).toBe(
      'PF-1 · Toile — Indigo'
    )
    expect(colourwayOptionLabel({ product_name: 'Toile', name: 'Indigo' })).toBe('Toile — Indigo')
  })

  it('walks every page of a house’s colourways at the API’s ceiling', () => {
    expect(colourwayPagePaths(3, 0)).toEqual(['/admin/colourways?brand_id=3&limit=200&page=1'])
    expect(colourwayPagePaths(3, 450)).toHaveLength(3)
    expect(colourwayPagePaths(3, 450).at(-1)).toBe('/admin/colourways?brand_id=3&limit=200&page=3')
  })
})

describe('the Xero bill', () => {
  const live = { configured: true, connected: true }

  it('is pushed only for a sent order with no bill on a live connection', () => {
    expect(canPushBill({ status: 'sent' }, live)).toBe(true)
    expect(canPushBill({ status: 'draft' }, live)).toBe(false)
    expect(canPushBill({ status: 'closed' }, live)).toBe(true)
    expect(canPushBill({ status: 'paid' }, live)).toBe(false)
    expect(canPushBill({ status: 'sent', xero_bill_id: 'b1' }, live)).toBe(false)
    expect(canPushBill({ status: 'sent', xero_bill_id: 'b1', xero_bill_status: 'VOIDED' }, live)).toBe(true)
    expect(canPushBill({ status: 'sent' }, { configured: true, connected: false })).toBe(false)
    expect(canPushBill({ status: 'sent' }, null)).toBe(false)
  })

  it('re-asks Xero only while the bill is unsettled', () => {
    expect(shouldSyncBill({})).toBe(false)
    expect(shouldSyncBill({ xero_bill_id: 'b1', xero_bill_status: 'AUTHORISED' })).toBe(true)
    expect(shouldSyncBill({ xero_bill_id: 'b1', xero_bill_status: null })).toBe(true)
    expect(shouldSyncBill({ xero_bill_id: 'b1', xero_bill_status: 'PAID' })).toBe(false)
    expect(shouldSyncBill({ xero_bill_id: 'b1', xero_bill_status: 'VOIDED' })).toBe(false)
  })

  it('reads the bill state as one line, paid with its day', () => {
    expect(billText({})).toBe('Not in Xero')
    expect(billText({ xero_bill_id: 'b1', xero_bill_ref: 'BILL-7', xero_bill_status: 'AUTHORISED' })).toBe(
      'BILL-7 · awaiting payment'
    )
    expect(
      billText({
        xero_bill_id: 'b1',
        xero_bill_ref: 'BILL-7',
        xero_bill_status: 'PAID',
        xero_bill_paid_at: '2026-09-20T11:00:00.000Z',
      })
    ).toBe('BILL-7 · paid 2026-09-20')
    expect(billText({ xero_bill_id: 'b1', xero_bill_status: 'VOIDED' })).toBe('b1 · voided in Xero')
  })

  it('tells the office what Send did in Xero', () => {
    expect(sentNote('PO-000012', {})).toBe('PO-000012 — sent.')
    expect(sentNote('PO-000012', { xero_bill: { raised: true, number: 'BILL-7' } })).toBe(
      'PO-000012 — sent. Bill BILL-7 raised in Xero.'
    )
    expect(sentNote('PO-000012', { xero_bill: { raised: false, reason: 'unpriced' } })).toBe(
      'PO-000012 — sent. Bill NOT raised in Xero: unpriced'
    )
  })
})
