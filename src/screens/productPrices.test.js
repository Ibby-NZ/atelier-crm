import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PRODUCT_PRICES_ROUTE,
  applyToProductPath,
  catalogueLine,
  productPriceState,
  canApply,
  comparisonLine,
  differenceText,
  dynamicsNote,
  fxLineText,
  importFileProblem,
  importPath,
  importRefusal,
  importSummaryLine,
  missingText,
  productPriceFilters,
  productPriceListReturn,
  productPriceSearchFromParams,
  productPriceSearchParams,
  productPricesListRoute,
  rangeOptions,
  rangeReportRows,
  stepLines,
  surchargeText,
  unpricedText,
} from './productPrices.js'

// ELLA STRIPE (MADEAUX), as atelier-api's GET /admin/product-prices/:id prices
// it — the client's own worked example.
const ELLA = Object.freeze({ code: 'ELLA STRIPE', currency: 'GBP', wholesale_rate: 47.6 })
const step = (name, amount) => ({ step: name, amount })
const ellaPricing = (over = {}) => ({
  status: 'priced',
  house: { id: 9, name: 'Madeaux', slug: 'madeaux' },
  inputs: {
    discount_percent: { value: 0, source: 'terms' },
    fx_rate: { value: 0.38, source: 'fx', detail: { currency: 'GBP' } },
    fx_margin_percent: { value: 0, source: 'none', detail: { reason: 'The range formula has no FX margin.' } },
    duty_percent: { value: 0, source: 'none', detail: { reason: 'Dynamics charged no duty on this product.' } },
    freight: { value: 50, source: 'freight-ledger', detail: { basis: 'dollar', unit: 'metre', scope: 'range' } },
    clearance_percent: { value: 10, source: 'house' },
    handling: { value: 0, source: 'none', detail: { reason: 'The range formula has no handling charge.' } },
    trade_markup_percent: { value: 87, source: 'house' },
    retail_markup: { value: null, source: 'missing' },
  },
  steps: [
    step('wholesale', 47.6),
    step('export_price', 47.6),
    step('price_ex_duty', 125.26),
    step('price_incl_duty', 125.26),
    step('freight_amount', 50),
    step('landed_ex_handling', 192.79),
    step('landed', 192.79),
    step('trade_sell', 360.52),
    step('retail_sell', null),
  ],
  landed: 192.79,
  trade_sell: 360.52,
  missing: [],
  dynamics: { price_ex_duty: 125.26, price_incl_duty: 125.26, trade_sell: 360.52, freight_letter: 'A' },
  difference: 0,
  agrees: true,
  ...over,
})

describe('the list', () => {
  it('keeps the search in the URL and sends only what is set', () => {
    const params = new URLSearchParams('q=ella&range=MADEAUX&currency=GBP&all=true')
    const search = productPriceSearchFromParams(params)
    expect(search).toEqual({ q: 'ella', range: 'MADEAUX', currency: 'GBP', all: true })
    expect(productPriceSearchParams(search)).toEqual({ q: 'ella', range: 'MADEAUX', currency: 'GBP', all: 'true' })
    expect(productPriceFilters(search)).toEqual({ q: 'ella', range: 'MADEAUX', currency: 'GBP', include_previous: true })
    // An "All" select must be absent, never `currency=` (a 400 that kills the list).
    expect(productPriceFilters({ q: '  ', range: '', currency: '' })).toEqual({ q: null, range: null, currency: null, include_previous: null })
    // A currency the API would refuse is dropped rather than sent.
    expect(productPriceSearchFromParams(new URLSearchParams('currency=CHF')).currency).toBe('')
  })

  it('hands a product page its way back to the same search, and only to this list', () => {
    expect(productPricesListRoute({ q: 'ella', range: 'MADEAUX' })).toBe(`${PRODUCT_PRICES_ROUTE}?q=ella&range=MADEAUX`)
    expect(productPricesListRoute({})).toBe(PRODUCT_PRICES_ROUTE)
    expect(productPriceListReturn({ from: `${PRODUCT_PRICES_ROUTE}?q=ella` })).toBe(`${PRODUCT_PRICES_ROUTE}?q=ella`)
    expect(productPriceListReturn({ from: '/admin/orders' })).toBe(PRODUCT_PRICES_ROUTE)
    expect(productPriceListReturn(null)).toBe(PRODUCT_PRICES_ROUTE)
  })

  it('names a range without a house in the range filter', () => {
    expect(
      rangeOptions([
        { range_name: 'MADEAUX', products: 158, house: { id: 9 } },
        { range_name: 'BOUSSAC', products: 64, house: null },
      ])
    ).toEqual([
      { value: 'MADEAUX', label: 'MADEAUX (158)' },
      { value: 'BOUSSAC', label: 'BOUSSAC (64) — no house' },
    ])
  })
})

describe('one price', () => {
  // 1 Oct 2026: Alpaka and the other rows Dynamics priced by hand.
  it('reads a hand-priced product as Dynamics’ price with the house’s retail markup on it', () => {
    const hand = { status: 'priced', hand_priced: true, trade_sell: 561, retail_sell: 729.3, steps: null,
      inputs: { retail_markup_percent: { value: 30, source: 'house' } } }
    expect(stepLines(hand, { currency: 'EUR' }).map((line) => [line.label, line.amount])).toEqual([
      ['Trade sell', '$561.00'],
      ['Retail sell', '$729.30'],
    ])
    const unset = stepLines({ ...hand, retail_sell: null, inputs: { retail_markup_percent: { value: null, source: 'missing' } } }, { currency: 'EUR' })
    expect(unset[1]).toMatchObject({ amount: '—', op: "Retail markup not set — set it on the house's Pricing panel" })
  })

  it('reads the office’s ELLA STRIPE example back step by step', () => {
    const lines = stepLines(ellaPricing(), ELLA)
    expect(lines.map((line) => [line.label, line.amount])).toEqual([
      ['Wholesale rate', '47.60 GBP'],
      // No discount on MADEAUX, so no discount step.
      ['Price ex duty', '$125.26'],
      ['Price incl duty', '$125.26'],
      ['Freight', '+ $50.00'],
      // No handling set: the landed cost is the clearance step itself.
      ['Landed cost', '$192.79'],
      ['Trade sell', '$360.52'],
    ])
    const by = Object.fromEntries(lines.map((line) => [line.key, line]))
    expect(by.price_ex_duty.op).toBe('÷ 0.38 GBP per NZ$1 (NZ$2.63 per 1 GBP) · exchange rate')
    expect(by.price_incl_duty.op).toBe('no duty — Dynamics charged no duty on this product.')
    expect(by.freight_amount.op).toBe('+ $50.00 per metre · house freight')
    // The client's own intermediate: 125.26 + 50.
    expect(by.freight_amount.subtotal).toBe('$175.26')
    expect(by.landed.op).toBe('× (1 + 10% clearance) over the duty-paid price and freight · the house')
    expect(by.trade_sell.op).toBe('× (1 + 87% trade markup) on landed cost · the house')
    expect(by.trade_sell.key_step).toBe(true)
  })

  it('draws the discount, the duty band and a handling charge when the house has them', () => {
    const pricing = ellaPricing({
      inputs: {
        ...ellaPricing().inputs,
        discount_percent: { value: 50, source: 'terms' },
        duty_percent: { value: 5, source: 'house', detail: { duty_class: 'A' } },
        handling: { value: 2, source: 'house' },
      },
      steps: [
        step('wholesale', 100), step('export_price', 50), step('price_ex_duty', 111.11), step('price_incl_duty', 116.67),
        step('freight_amount', 35), step('landed_ex_handling', 166.83), step('landed', 168.83), step('trade_sell', 278.57), step('retail_sell', null),
      ],
    })
    const lines = stepLines(pricing, { currency: 'EUR' })
    expect(lines.map((line) => line.key)).toEqual([
      'wholesale', 'export_price', 'price_ex_duty', 'price_incl_duty', 'freight_amount', 'landed_ex_handling', 'landed', 'trade_sell',
    ])
    const by = Object.fromEntries(lines.map((line) => [line.key, line]))
    expect(by.export_price.op).toBe('− 50% supplier discount · supplier terms')
    expect(by.price_incl_duty.op).toBe('+ 5% duty (class A) · the house')
    expect(by.landed.op).toBe('+ $2.00 handling per unit · the house')
  })

  it('names the figure that stops a price rather than printing a number', () => {
    const pricing = ellaPricing({
      status: 'incomplete',
      inputs: { ...ellaPricing().inputs, freight: { value: null, source: 'missing', detail: { reason: 'no rate' } } },
      steps: ellaPricing().steps.map((s) => (['wholesale', 'export_price', 'price_ex_duty', 'price_incl_duty'].includes(s.step) ? s : { ...s, amount: null })),
      trade_sell: null,
      missing: ['freight'],
      difference: null,
      agrees: null,
    })
    const by = Object.fromEntries(stepLines(pricing, ELLA).map((line) => [line.key, line]))
    expect(by.freight_amount).toMatchObject({ amount: '—', subtotal: null, op: "Freight not set — set it on the house's Pricing panel" })
    expect(by.trade_sell.amount).toBe('—')
    expect(unpricedText(pricing)).toBe('Freight not set')
    expect(differenceText(pricing)).toBe('—')
  })

  it('says what is missing, and why a range cannot price at all', () => {
    expect(missingText(['freight', 'clearance', 'trade_markup'])).toBe('Freight, Clearance and Trade markup not set')
    expect(missingText(['fx_rate'])).toBe('Exchange rate not set')
    expect(missingText([])).toBe('')
    expect(unpricedText(ellaPricing())).toBeNull()
    expect(unpricedText({ status: 'no_house', missing: [] })).toBe('No house for this range')
  })

  it('compares with Dynamics in words, naming the freight letter when they part', () => {
    expect(differenceText(ellaPricing())).toBe('agrees')
    expect(dynamicsNote(ellaPricing())).toBe('Dynamics priced it at $360.52 too.')
    const parted = ellaPricing({ difference: 20.57, agrees: false, trade_sell: 308.55, dynamics: { trade_sell: 287.98, freight_letter: 'B' } })
    expect(differenceText(parted)).toBe('+$20.57')
    expect(dynamicsNote(parted)).toBe(
      "Dynamics priced it at $287.98 (+$20.57 here). Dynamics charged freight for the product's letter (B); " +
        "the house has no rate for B, so its every-class freight applies. Set a rate for B under Freight classes on the house's page."
    )
    const classed = { ...parted, inputs: { ...parted.inputs, freight: { value: 3, source: 'freight-ledger', detail: { freight_class: 'B' } } } }
    expect(dynamicsNote(classed)).toMatch(/The house's freight for letter B applies/)
    expect(differenceText({ difference: -4.88, agrees: false })).toBe('−$4.88')
    expect(dynamicsNote(ellaPricing({ dynamics: { trade_sell: null } }))).toMatch(/no trade sell price/)
  })

  it('states the house surcharge when it has one', () => {
    expect(surchargeText({ min_qty: 5, per_unit: 20, source: 'house' })).toBe('Small orders: + $20.00 per unit under 5 (the house).')
    expect(surchargeText(null)).toBeNull()
  })
})

describe('onto the catalogue product', () => {
  it('offers "Set as the trade price" only where the product lacks or differs from its range price', () => {
    const priced = ellaPricing()
    expect(productPriceState({ trade_price_cents: null }, priced)).toMatchObject({ action: 'set', text: 'The product has no trade price yet' })
    expect(productPriceState({ trade_price_cents: 36052 }, priced)).toMatchObject({ action: null, text: 'The product carries this price' })
    expect(productPriceState({ trade_price_cents: 40000 }, priced)).toMatchObject({ action: 'set', text: 'The product carries $400.00' })
    // No range price to set: nothing is offered.
    expect(productPriceState({ trade_price_cents: 40000 }, { status: 'incomplete', trade_sell: null })).toMatchObject({ action: null })
    expect(applyToProductPath(7)).toBe('/admin/product-prices/7/apply-to-product')
  })

  it('says what an upload wrote onto the catalogue', () => {
    expect(catalogueLine({ trade_filled: 1, trade_replaced: 0, wholesale_filled: 1, category_filled: 1, kept_count: 0 })).toBe(
      '1 catalogue product given its trade price · 1 wholesale rate filled · 1 category filled'
    )
    expect(catalogueLine({ trade_filled: 2, kept_count: 3, ambiguous_count: 1 })).toBe(
      "2 catalogue products given their trade price · 3 kept a price of their own (set it from the product's page) · 1 named by two rows at different prices — left alone"
    )
  })
})

describe('the upload', () => {
  it('checks the file before sending it', () => {
    expect(importFileProblem(null)).toMatch(/Choose/)
    expect(importFileProblem({ name: 'x.xlsx', size: 0 })).toMatch(/empty/)
    expect(importFileProblem({ name: 'prices.csv', size: 10 })).toMatch(/not an \.xlsx/)
    expect(importFileProblem({ name: 'Active Product Prices.xlsx', size: 3_900_000 })).toBeNull()
    expect(importFileProblem({ name: 'huge.xlsx', size: 40 * 1024 * 1024 })).toMatch(/32 MB/)
    expect(importPath('validate', 'Active Product Prices 25-09-2026 12-07-28 PM.xlsx')).toBe(
      '/admin/product-prices/import/validate?filename=Active%20Product%20Prices%2025-09-2026%2012-07-28%20PM.xlsx'
    )
  })

  it('reads a refusal’s per-row reasons, and nothing else as one', () => {
    const refused = importRefusal({ status: 422, body: { message: '1 row could not be read.', errors: ['row 3: …'], error_count: 1 } })
    expect(refused).toEqual({ message: '1 row could not be read.', errors: ['row 3: …'], errorCount: 1 })
    expect(importRefusal({ status: 403, body: { message: 'no' } })).toBeNull()
    expect(importRefusal({ status: 0 })).toBeNull()
  })

  it('summarises a check, and offers Apply only on a check', () => {
    const check = { rows_read: 21102, rows_new: 21102, rows_changed: 0, rows_unchanged: 0, rows_not_in_file: 0 }
    expect(importSummaryLine(check)).toBe('21,102 rows — 21,102 new, 0 changed, 0 unchanged')
    expect(importSummaryLine({ ...check, rows_not_in_file: 3 })).toMatch(/3 no longer in the export \(kept, flagged\)$/)
    expect(canApply(check)).toBe(true)
    expect(canApply({ ...check, import_id: 4 })).toBe(false)
    expect(canApply(null)).toBe(false)
    expect(comparisonLine({ products: 21102, priced: 20420, agree: 8234, differ: 12165 })).toBe(
      "Priced 20,420 of 21,102 · 8,234 agree with Dynamics' trade sell · 12,165 differ"
    )
  })

  it('explains each exchange rate the export implies', () => {
    expect(fxLineText({ currency: 'GBP', rows: 2748, implied: 0.38, share: 0.999, current: null, action: 'fill' })).toBe(
      'GBP 0.38 per NZ$1 — read from the export (99.9% of its rows agree); the platform has none, so applying sets it'
    )
    expect(fxLineText({ currency: 'EUR', implied: 0.45, share: 0.969, current: 0.5, action: 'differs' })).toMatch(/implies 0\.45 .* has 0\.5 — kept/)
    expect(fxLineText({ currency: 'USD', implied: 0.51, share: 1, current: 0.51, action: 'keep' })).toMatch(/already set/)
    expect(fxLineText({ currency: 'NZD', rows: 26, action: 'home' })).toMatch(/no exchange/)
    expect(fxLineText({ currency: 'USD', action: 'unclear' })).toMatch(/import the ranges onto the houses first/)
    expect(fxLineText({ currency: 'EUR', implied: 0.45, share: 1, current: null, action: 'fill', source: 'file' })).toBe(
      "EUR 0.45 per NZ$1 — the export's Exchange Rate column (100% of its rows agree); the platform has none, so applying sets it"
    )
    expect(fxLineText({ currency: 'EUR', implied: 0.45, share: 1, current: 0.47, action: 'update', source: 'file' })).toMatch(
      /Exchange Rate column .* the platform has 0\.47, so applying replaces it$/
    )
  })

  it('lists the ranges that need the office: no house, or figures missing', () => {
    const rows = rangeReportRows({
      ranges: [
        { range_name: 'MADEAUX', house: { id: 9 }, products: 158, missing: [] },
        { range_name: 'HAMAM', house: { id: 6 }, products: 575, missing: ['freight'] },
        { range_name: 'BOUSSAC', house: null, products: 64, missing: [] },
      ],
    })
    expect(rows.map((row) => [row.range, row.text])).toEqual([
      ['HAMAM', 'Freight not set'],
      ['BOUSSAC', expect.stringMatching(/No house carries this name/)],
    ])
  })
})

describe('the screens', () => {
  const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

  // 1 Oct 2026 (Armani Casa 4741): the product page asked by name, and a
  // product built from a row is named "SETA FIAMMATA 4741 (1)".
  it('asks for a product’s range price by the product, not by its name', () => {
    const source = readFileSync(new URL('./ProductRangePricing.jsx', import.meta.url), 'utf8')
    expect(source).toContain('buildListQuery({ product_id: product.id')
    expect(source).not.toContain('design: product.name')
  })

  it('compute no price themselves — every figure is the API’s', () => {
    for (const file of ['AdminProductPrices.jsx', 'AdminProductPrice.jsx', 'ProductPricesImport.jsx', 'ProductRangePricing.jsx']) {
      const source = read(file)
      expect(source, file).not.toMatch(/trade_markup_percent[^\n]*\*|\*\s*\(1\s*\+/)
      expect(source, file).not.toContain('fetch(')
    }
  })
})
