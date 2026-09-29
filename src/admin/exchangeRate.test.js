import { describe, expect, it } from 'vitest'
import { currencyChoices, exchangeRateView, parseRate, reversedRateError, withRate } from './exchangeRate.js'

const FILE_NOTE = 'From the Dynamics product prices export (Active Product Prices 28-09-2026 9-09-29 AM.xlsx)'
const rates = [
  { currency: 'EUR', rate: 0.45, set_on: '2026-09-28', note: FILE_NOTE },
  { currency: 'AUD', rate: 0.9, set_on: '2026-09-01', note: null },
]
const ready = { status: 'ready', rates }

describe('currencyChoices', () => {
  it('puts NZD first, then the rest alphabetically, with rates on file added', () => {
    expect(currencyChoices(rates)).toEqual(['NZD', 'AUD', 'EUR', 'GBP', 'USD'])
  })

  it('always offers the saved value, so a select never renders blank', () => {
    expect(currencyChoices([], 'CHF')).toEqual(['NZD', 'CHF', 'EUR', 'GBP', 'USD'])
  })
})

describe('exchangeRateView', () => {
  it("follows the chosen currency to its rate, naming the import file it came from", () => {
    expect(exchangeRateView(ready, 'EUR')).toEqual({
      value: '0.45',
      editable: true,
      hint: `EUR per NZ$1 (NZ$2.22 per 1 EUR), set 2026-09-28 — ${FILE_NOTE}. Saving changes it for every EUR house and product.`,
    })
    expect(exchangeRateView(ready, 'AUD').hint).toBe(
      'AUD per NZ$1 (NZ$1.11 per 1 AUD), set 2026-09-01. Saving changes it for every AUD house and product.'
    )
  })

  it('leaves a missing rate blank to type, rather than showing zero', () => {
    expect(exchangeRateView(ready, 'GBP')).toMatchObject({ value: '', editable: true })
    expect(exchangeRateView(ready, 'GBP').hint).toMatch(/No GBP rate yet — the product prices import sets it/)
  })

  it('is a fixed 1 for NZD whatever the rates say, finance or not', () => {
    expect(exchangeRateView(ready, 'NZD')).toMatchObject({ value: '1', editable: false })
    expect(exchangeRateView({ status: 'locked', rates: [] }, 'NZD').value).toBe('1')
  })

  it('names why there is no figure, and offers nothing to edit then', () => {
    const view = (status, currency = 'EUR') => exchangeRateView({ status, rates: [] }, currency)
    expect(view('locked')).toMatchObject({ value: 'Finance only', editable: false })
    expect(view('loading')).toMatchObject({ value: 'Loading…', editable: false })
    expect(view('error')).toMatchObject({ value: 'Could not load', editable: false })
    expect(view('ready', '')).toMatchObject({ value: '', editable: false })
  })
})

describe('parseRate', () => {
  it('takes a positive number, as typed', () => {
    expect(parseRate(' 0.47 ')).toEqual({ rate: 0.47 })
  })

  it('refuses a blank, zero, negative or non-number', () => {
    for (const text of ['', '0', '-1', 'abc', '0.4.5']) {
      expect(parseRate(text).error).toBe('An exchange rate is a number above zero, e.g. 0.45.')
    }
  })

  // 30 Sep 2026: USD's 0.51 read as "reversed"; 2 typed in its place would
  // price every USD product about four times too low.
  it('refuses a rate typed the other way round — NZ$ per unit — for a currency worth more than NZ$1', () => {
    expect(parseRate('1.96', 'USD').error).toBe('That is NZ$ per USD. The rate is USD per NZ$1 — for NZ$1.96 per 1 USD, type 0.5102.')
    expect(parseRate('0.51', 'USD')).toEqual({ rate: 0.51 })
    // A currency a NZ$ buys many of is above 1 the right way round.
    expect(parseRate('88', 'JPY')).toEqual({ rate: 88 })
    expect(reversedRateError(0.45, 'EUR')).toBeNull()
  })
})

describe('withRate', () => {
  it('replaces the saved currency in place and adds a new one, without touching the list it was given', () => {
    const saved = { currency: 'EUR', rate: 0.47, set_on: '2026-09-29', note: 'Set in the CRM' }
    const next = withRate(rates, saved)
    expect(next.find((r) => r.currency === 'EUR').rate).toBe(0.47)
    expect(rates.find((r) => r.currency === 'EUR').rate).toBe(0.45)
    expect(withRate(rates, { currency: 'GBP', rate: 0.38 }).map((r) => r.currency)).toEqual(['EUR', 'AUD', 'GBP'])
  })
})
