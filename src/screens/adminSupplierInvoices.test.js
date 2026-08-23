import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import { draftFrom } from '../admin/drafts.js'
import {
  EMPTY_INVOICE_SEARCH,
  EMPTY_UNBILLED_SEARCH,
  MASKED_MONEY_NOTE,
  NEW_SUPPLIER_INVOICE,
  NEW_SUPPLIER_INVOICE_ROUTE,
  SUPPLIER_INVOICES_PATH,
  SUPPLIER_INVOICE_HEADER_FIELDS,
  SUPPLIER_INVOICE_MONEY_FIELDS,
  SUPPLIER_INVOICE_STATUSES,
  STATUS_LABELS,
  UNBILLED_SEARCH_LIMIT,
  allocationAmountText,
  allocationCountLabel,
  allocationPath,
  allocationsPath,
  buildAttachBody,
  buildInvoiceBody,
  buildUnbilledFilters,
  canDeleteInvoice,
  describeSupplierInvoice,
  detachDialog,
  hasInvoiceFilters,
  headerFieldsFor,
  invoiceDateText,
  invoiceFilters,
  invoiceHeaderPatch,
  listShowsMoney,
  moneyText,
  poCostText,
  showsMoney,
  supplierInvoicePath,
  supplierInvoiceRoute,
  unallocatedLabel,
  unallocatedTone,
  unbilledPath,
  varianceLabel,
  varianceTone,
} from './adminSupplierInvoices.js'

// The three supplier-invoice screens cannot be rendered here (no jsdom), so
// everything that is a decision lives in adminSupplierInvoices.js and is
// tested from this side. The .jsx files are scanned at the foot of this file.

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

// Comments are STRIPPED before a negative scan, the posture the purchasing
// suites take on both sides of the API: the rules below are ones this code
// documents at length, and a scan that fails against the paragraph explaining
// why something is absent teaches whoever hits it to delete the explanation.
const code = (name) =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const LIST_CODE = code('AdminSupplierInvoices.jsx')
const DETAIL_CODE = code('AdminSupplierInvoice.jsx')
const NEW_CODE = code('AdminSupplierInvoiceNew.jsx')
const MODULE_CODE = code('adminSupplierInvoices.js')

// A finance login's copy of a reconciled-but-short invoice; the masked twin is
// the same document with every money key DELETED, which is how the API answers
// a login without the grant.
const FINANCE_INVOICE = {
  id: 7,
  supplier_id: 3,
  supplier_name: 'Maison Pierre',
  invoice_number: 'INV-2291',
  invoice_date: '2026-08-01',
  currency: 'EUR',
  status: 'received',
  notes: null,
  allocation_count: 2,
  unstated_allocations: 1,
  total_amount: 2200,
  freight_amount: 210,
  duty_amount: null,
  fx_rate: 0.54821,
  allocated_amount: 1940,
  unallocated_amount: 260,
  purchase_orders_cost: 2140,
  unpriced_purchase_orders: 0,
  variance: 60,
}

const MASKED_INVOICE = {
  id: 7,
  supplier_id: 3,
  supplier_name: 'Maison Pierre',
  invoice_number: 'INV-2291',
  invoice_date: '2026-08-01',
  currency: 'EUR',
  status: 'received',
  notes: null,
  allocation_count: 2,
}

describe('paths', () => {
  it('builds every path from one base', () => {
    expect(SUPPLIER_INVOICES_PATH).toBe('/admin/supplier-invoices')
    expect(supplierInvoicePath(7)).toBe('/admin/supplier-invoices/7')
    expect(unbilledPath).toBe('/admin/supplier-invoices/unbilled')
    expect(allocationsPath(7)).toBe('/admin/supplier-invoices/7/allocations')
    expect(supplierInvoiceRoute(7)).toBe('/admin/supplier-invoices/7')
    expect(NEW_SUPPLIER_INVOICE_ROUTE).toBe('/admin/supplier-invoices/new')
  })

  // The pair IS the identity: a purchase order is on exactly one invoice, so a
  // detach never has to look a join-row id up to undo a mistake.
  it('addresses a detach by purchase-order id, never by allocation id', () => {
    expect(allocationPath(7, 41)).toBe('/admin/supplier-invoices/7/allocations/41')
  })
})

describe('the status vocabulary', () => {
  it('holds exactly what supplier_invoices_status_check holds', () => {
    expect([...SUPPLIER_INVOICE_STATUSES]).toEqual(['received', 'matched', 'disputed'])
  })

  it('labels every status', () => {
    for (const status of SUPPLIER_INVOICE_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy()
    }
  })

  // Unlike po-states.js there is no transitions mirror to port: `matched` is a
  // judgement, not a move, and an invoice goes straight back to `disputed` the
  // moment somebody spots something. A local machine would be a rule to fight.
  it('ports no state machine, because the API has none', () => {
    expect(MODULE_CODE).not.toMatch(/ALLOWED_TRANSITIONS|availableMoves/)
  })
})

describe('money is finance-gated by ABSENCE', () => {
  // A masked figure is DELETED from the payload, never nulled — so hasOwn is
  // the test everywhere, and `amount: null` stays a fact ("not stated") rather
  // than a hole.
  it('reads the gate off the payload with hasOwn', () => {
    expect(showsMoney(FINANCE_INVOICE)).toBe(true)
    expect(showsMoney(MASKED_INVOICE)).toBe(false)
    expect(showsMoney({})).toBe(false)
    expect(listShowsMoney([MASKED_INVOICE, FINANCE_INVOICE])).toBe(true)
    expect(listShowsMoney([MASKED_INVOICE])).toBe(false)
    expect(listShowsMoney([])).toBe(false)
  })

  it('words a masked list rather than leaving it looking complete', () => {
    expect(MASKED_MONEY_NOTE).toMatch(/finance/i)
    expect(LIST_CODE).toContain('MASKED_MONEY_NOTE')
  })

  it('never tests a money key with a null check', () => {
    // `invoice.total_amount == null` cannot tell "not permitted" from a hole
    // in the data; the modules must go through showsMoney/hasOwn.
    expect(MODULE_CODE).not.toMatch(/total_amount\s*==\s*null/)
  })
})

describe('money display', () => {
  it('prints an amount in the invoice currency, never cents', () => {
    expect(moneyText(2200, 'EUR')).toBe('2,200.00 EUR')
    expect(moneyText('48.5', 'EUR')).toBe('48.50 EUR')
    // numeric(12,4) keeps its fraction — a supplier price is not rounded away.
    expect(moneyText(0.5482, 'EUR')).toBe('0.5482 EUR')
    expect(moneyText(0, 'EUR')).toBe('0.00 EUR')
  })

  it('draws a missing figure as an em dash, never a zero', () => {
    // Number(null) is 0, and a zero reads as "stated as nil".
    expect(moneyText(null)).toBe('—')
    expect(moneyText(undefined)).toBe('—')
    expect(moneyText('wool')).toBe('—')
  })

  it('says an unstated allocation amount is unstated, not nil', () => {
    expect(allocationAmountText({ amount: null }, 'EUR')).toBe('Not stated')
    expect(allocationAmountText({ amount: 1940 }, 'EUR')).toBe('1,940.00 EUR')
    // Finance-gated away: the key is absent and the cell is not drawn at all.
    expect(allocationAmountText({}, 'EUR')).toBe('')
  })

  it('says a null purchase-order cost is a missing price, with the count', () => {
    expect(poCostText({ purchase_order_cost: 1940 }, 'EUR')).toBe('1,940.00 EUR')
    expect(poCostText({ purchase_order_cost: null, unpriced_lines: 2 })).toBe(
      'Not priced — 2 lines'
    )
    expect(poCostText({ ordered_cost: 200, unpriced_lines: 0 }, 'EUR')).toBe('200.00 EUR')
    expect(poCostText({ ordered_cost: null, unpriced_lines: 1 })).toBe('Not priced — 1 line')
    expect(poCostText({})).toBe('')
  })
})

describe('the two derived differences', () => {
  it('words how far through the reconciliation the office is', () => {
    expect(unallocatedLabel(FINANCE_INVOICE)).toBe('260.00 EUR to allocate')
    expect(unallocatedLabel({ ...FINANCE_INVOICE, unallocated_amount: 0 })).toBe('Fully allocated')
    // Over-allocation is LEGAL (no CHECK ties the sum to the total) and is
    // stated, never clamped — it is exactly the mistake the figure surfaces.
    expect(unallocatedLabel({ ...FINANCE_INVOICE, unallocated_amount: -40 })).toBe(
      '40.00 EUR over-allocated'
    )
    expect(unallocatedTone({ unallocated_amount: 0 })).toBe('sage')
    expect(unallocatedTone({ unallocated_amount: -40 })).toBe('clay')
    expect(unallocatedTone({ unallocated_amount: 260 })).toBe('clay')
  })

  it('degrades to nothing where the figure was gated away', () => {
    expect(unallocatedLabel(MASKED_INVOICE)).toBe('')
    expect(varianceLabel(MASKED_INVOICE)).toBe('')
  })

  it('words the commercial question, over and under', () => {
    expect(varianceLabel(FINANCE_INVOICE)).toBe('60.00 EUR over quote')
    expect(varianceLabel({ ...FINANCE_INVOICE, variance: -60 })).toBe('60.00 EUR under quote')
    expect(varianceLabel({ ...FINANCE_INVOICE, variance: 0 })).toBe('On quote')
    expect(varianceTone({ variance: 0 })).toBe('sage')
    expect(varianceTone({ variance: 60 })).toBe('clay')
  })

  it('withholds a variance the population cannot support, and says why', () => {
    // Null with unpriced purchase orders is a MISSING PRICE, not a zero
    // discrepancy — the "a figure that cannot be added is absent" rule.
    expect(
      varianceLabel({ ...FINANCE_INVOICE, variance: null, unpriced_purchase_orders: 1 })
    ).toBe('No variance yet — 1 purchase order unpriced')
    expect(varianceTone({ variance: null })).toBe('muted')
  })

  it('recomputes neither figure from the allocations', () => {
    // The server's round4 is the authority; a browser sum drifts.
    expect(MODULE_CODE).not.toMatch(/reduce\([^)]*amount/)
    expect(DETAIL_CODE).not.toMatch(/reduce\([^)]*amount/)
  })
})

describe('counting allocations', () => {
  it('names the attached purchase orders and the unstated ones beside them', () => {
    expect(allocationCountLabel(FINANCE_INVOICE)).toBe('2 purchase orders · 1 unstated')
    expect(allocationCountLabel({ allocation_count: 1, unstated_allocations: 0 })).toBe(
      '1 purchase order'
    )
    expect(allocationCountLabel({ allocation_count: 0 })).toBe('None attached')
    // A masked payload still carries the count — it is not a cost figure.
    expect(allocationCountLabel(MASKED_INVOICE)).toBe('2 purchase orders')
  })
})

describe('a calendar day stays the day the paper says', () => {
  it('formats invoice_date without a Date round trip', () => {
    // new Date('2026-08-01') is UTC midnight, which renders as the 31st of
    // July anywhere west of Greenwich — the shift the API's ::text removed.
    expect(invoiceDateText('2026-08-01')).toBe('01 Aug 2026')
    expect(invoiceDateText('2026-12-31')).toBe('31 Dec 2026')
    expect(invoiceDateText(null)).toBe('—')
    expect(invoiceDateText('')).toBe('—')
    expect(invoiceDateText('not a date')).toBe('—')
  })

  it('never builds a Date from an invoice_date anywhere on the screens', () => {
    for (const source of [MODULE_CODE, LIST_CODE, DETAIL_CODE, NEW_CODE]) {
      expect(source).not.toMatch(/new Date\((row|invoice)\.invoice_date/)
    }
  })
})

describe('list filters', () => {
  it('drops every empty so the enum routes never see status=', () => {
    const query = buildListQuery(invoiceFilters(EMPTY_INVOICE_SEARCH))
    expect(query).toBe('')
  })

  it('forwards what is set and trims it', () => {
    expect(
      invoiceFilters({ supplier_id: '3', status: 'disputed', from: '2026-08-01', to: '', q: ' inv ' })
    ).toEqual({ supplier_id: 3, status: 'disputed', from: '2026-08-01', to: null, q: 'inv' })
  })

  it('refuses a supplier id that is not a positive integer', () => {
    expect(invoiceFilters({ supplier_id: 'abc' }).supplier_id).toBeNull()
    expect(invoiceFilters({ supplier_id: '0' }).supplier_id).toBeNull()
  })

  it('says whether anything is narrowing the list', () => {
    expect(hasInvoiceFilters(EMPTY_INVOICE_SEARCH)).toBe(false)
    expect(hasInvoiceFilters({ ...EMPTY_INVOICE_SEARCH, q: 'inv' })).toBe(true)
  })
})

describe('entering a bill', () => {
  const draft = {
    ...NEW_SUPPLIER_INVOICE,
    supplier_id: '3',
    invoice_number: ' INV-2291 ',
    invoice_date: '2026-08-01',
    total_amount: '2200',
  }

  it('builds the minimum body and omits every blank optional', () => {
    // A blank currency means "use the house's invoicing currency", which the
    // server does on the ABSENT key; status is never sent — a new bill files
    // as received.
    expect(buildInvoiceBody(draft)).toEqual({
      ok: true,
      body: {
        supplier_id: 3,
        invoice_number: 'INV-2291',
        invoice_date: '2026-08-01',
        total_amount: 2200,
      },
    })
  })

  it('carries the optional figures when the paper states them', () => {
    const built = buildInvoiceBody({
      ...draft,
      currency: 'eur',
      freight_amount: '210',
      duty_amount: '0',
      fx_rate: '0.5482',
      notes: 'August consolidated bill',
    })
    expect(built.ok).toBe(true)
    expect(built.body.currency).toBe('EUR')
    expect(built.body.freight_amount).toBe(210)
    // 0 is "stated as nil", a real fact distinct from an omitted blank.
    expect(built.body.duty_amount).toBe(0)
    expect(built.body.fx_rate).toBe(0.5482)
    expect(built.body.notes).toBe('August consolidated bill')
  })

  it('names each missing required fact', () => {
    expect(buildInvoiceBody({ ...draft, supplier_id: '' }).error).toMatch(/house/i)
    expect(buildInvoiceBody({ ...draft, invoice_number: '  ' }).error).toMatch(/invoice number/i)
    expect(buildInvoiceBody({ ...draft, invoice_date: '01/08/2026' }).error).toMatch(/date/i)
    expect(buildInvoiceBody({ ...draft, total_amount: '' }).error).toMatch(/total/i)
  })

  it('refuses a negative amount as a credit note, not a typo', () => {
    expect(buildInvoiceBody({ ...draft, total_amount: '-10' }).error).toMatch(/credit/i)
    expect(buildInvoiceBody({ ...draft, freight_amount: '-1' }).error).toMatch(/credit/i)
  })

  it('refuses a zero FX rate and a malformed currency before the round trip', () => {
    expect(buildInvoiceBody({ ...draft, fx_rate: '0' }).error).toMatch(/more than zero/i)
    expect(buildInvoiceBody({ ...draft, currency: 'EURO' }).error).toMatch(/three-letter/i)
  })
})

describe('the header PATCH', () => {
  it('declares the money fields apart, and only offers them where they exist', () => {
    // The money half of a non-finance payload was DELETED, so drafting it
    // would draw blank boxes over real figures and a save would "clear"
    // values the screen never saw.
    expect(headerFieldsFor(FINANCE_INVOICE)).toHaveLength(
      SUPPLIER_INVOICE_HEADER_FIELDS.length + SUPPLIER_INVOICE_MONEY_FIELDS.length
    )
    expect(headerFieldsFor(MASKED_INVOICE)).toEqual(SUPPLIER_INVOICE_HEADER_FIELDS)
  })

  it('never declares supplier_id, which must stay unmovable', () => {
    // Moving an invoice to another house would leave every attached purchase
    // order belonging to the old one — the agreement broken retroactively by a
    // field that looks like a typo fix.
    const keys = [...SUPPLIER_INVOICE_HEADER_FIELDS, ...SUPPLIER_INVOICE_MONEY_FIELDS].map(
      (field) => field.key
    )
    expect(keys).not.toContain('supplier_id')
    expect(keys).not.toContain('supplier_name')
  })

  it('diffs only what changed, through the one declaration', () => {
    const form = draftFrom(FINANCE_INVOICE, headerFieldsFor(FINANCE_INVOICE))
    expect(invoiceHeaderPatch(FINANCE_INVOICE, form)).toEqual({ patch: {} })

    const edited = { ...form, status: 'matched', freight_amount: '220' }
    expect(invoiceHeaderPatch(FINANCE_INVOICE, edited)).toEqual({
      patch: { status: 'matched', freight_amount: 220 },
    })
  })

  it('keeps an explicit clear distinct from untouched', () => {
    const form = draftFrom(FINANCE_INVOICE, headerFieldsFor(FINANCE_INVOICE))
    const cleared = { ...form, freight_amount: '' }
    expect(invoiceHeaderPatch(FINANCE_INVOICE, cleared)).toEqual({
      patch: { freight_amount: null },
    })
  })

  it('reads an unchanged date as unchanged', () => {
    // invoice_date arrives as 'YYYY-MM-DD' and the input holds the same form;
    // the date kind narrows both before comparing.
    const form = draftFrom(FINANCE_INVOICE, headerFieldsFor(FINANCE_INVOICE))
    expect(form.invoice_date).toBe('2026-08-01')
    expect(invoiceHeaderPatch(FINANCE_INVOICE, form)).toEqual({ patch: {} })
  })

  it('adds the bounds the decimal kind cannot state, in a person’s words', () => {
    const form = draftFrom(FINANCE_INVOICE, headerFieldsFor(FINANCE_INVOICE))
    expect(invoiceHeaderPatch(FINANCE_INVOICE, { ...form, total_amount: '-5' }).error).toMatch(
      /credit/i
    )
    expect(invoiceHeaderPatch(FINANCE_INVOICE, { ...form, fx_rate: '0' }).error).toMatch(
      /more than zero/i
    )
  })

  it('requires the identity fields rather than sending a blank', () => {
    const form = draftFrom(FINANCE_INVOICE, headerFieldsFor(FINANCE_INVOICE))
    expect(invoiceHeaderPatch(FINANCE_INVOICE, { ...form, invoice_number: '' }).error).toMatch(
      /required/i
    )
    expect(invoiceHeaderPatch(FINANCE_INVOICE, { ...form, total_amount: '' }).error).toMatch(
      /required/i
    )
  })
})

describe('the matching search', () => {
  it('is always scoped to the house whose bill is on the desk', () => {
    const built = buildUnbilledFilters(EMPTY_UNBILLED_SEARCH, 3)
    expect(built.ok).toBe(true)
    expect(built.filters.supplier_id).toBe(3)
    expect(built.filters.limit).toBe(UNBILLED_SEARCH_LIMIT)
    // Empties leave as null and buildListQuery drops them.
    expect(buildListQuery(built.filters)).toBe('supplier_id=3&limit=20')
  })

  it('carries the paper’s own facts: date range, amount bounds, our number', () => {
    const built = buildUnbilledFilters(
      { q: 'PO-0014', from: '2026-07-01', to: '2026-07-31', amount_min: '1900', amount_max: '2000' },
      3
    )
    expect(built.ok).toBe(true)
    expect(built.filters).toMatchObject({
      q: 'PO-0014',
      from: '2026-07-01',
      to: '2026-07-31',
      amount_min: 1900,
      amount_max: 2000,
    })
  })

  it('names a bad amount before the round trip, and an inside-out range', () => {
    expect(buildUnbilledFilters({ amount_min: 'wool' }, 3).error).toMatch(/amount/i)
    expect(buildUnbilledFilters({ amount_min: '-5' }, 3).error).toMatch(/credit/i)
    expect(
      buildUnbilledFilters({ amount_min: '2000', amount_max: '1900' }, 3).error
    ).toMatch(/inside out/i)
  })
})

describe('attach and detach', () => {
  it('attaches with a NULL amount when none is stated, never 0', () => {
    // The ordinary half-done state: a consolidated bill often does not break
    // its total down per purchase order at all. 0 would state "charged at
    // nil" as a fact the office never gave.
    expect(buildAttachBody(41, '')).toEqual({
      ok: true,
      body: { purchase_order_id: 41, amount: null },
    })
    expect(buildAttachBody(41, ' 1940 ')).toEqual({
      ok: true,
      body: { purchase_order_id: 41, amount: 1940 },
    })
    expect(buildAttachBody(41, '0')).toEqual({
      ok: true,
      body: { purchase_order_id: 41, amount: 0 },
    })
  })

  it('names a malformed amount rather than posting it', () => {
    expect(buildAttachBody(41, 'wool').error).toMatch(/amount/i)
    expect(buildAttachBody(41, '-5').error).toMatch(/credit/i)
  })

  it('asks before a detach, naming the purchase order and what is lost', () => {
    const dialog = detachDialog({ po_number: 'PO-001040' })
    expect(dialog.title).toContain('PO-001040')
    expect(dialog.body).toMatch(/stated amount is not kept/i)
    expect(dialog.confirmLabel).toBe('Detach')
    expect(detachDialog({}).title).toContain('this purchase order')
  })
})

describe('deleting a bill', () => {
  it('offers the button only where nothing is attached — the 409 stays the gate', () => {
    expect(canDeleteInvoice({ allocation_count: 0 })).toBe(true)
    expect(canDeleteInvoice({ allocation_count: 2 })).toBe(false)
    expect(canDeleteInvoice({})).toBe(true)
  })

  it('names an invoice by its number and its house', () => {
    // The number is unique to the HOUSE that issued it — two maisons both
    // numbering from 1001 is ordinary — so the house disambiguates.
    expect(describeSupplierInvoice(FINANCE_INVOICE)).toBe('INV-2291 — Maison Pierre')
    expect(describeSupplierInvoice({})).toBe('')
  })
})

describe('the screens keep the API’s own rules', () => {
  it('never calls fetch directly', () => {
    for (const source of [LIST_CODE, DETAIL_CODE, NEW_CODE]) {
      expect(source).not.toMatch(/[^a-zA-Z]fetch\(/)
    }
  })

  it('offers no archive toggle: supplier_invoice is archivable: false', () => {
    // `matched` and `disputed` already take a bill off the working list AND
    // say why, which an archive flag cannot.
    expect(LIST_CODE).not.toMatch(/include_archived|Show archived/)
  })

  it('offers no save path for supplier_id on the detail screen', () => {
    expect(DETAIL_CODE).not.toMatch(/supplier_id:/)
  })
})
