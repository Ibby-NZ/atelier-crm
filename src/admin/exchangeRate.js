// The Currency select and the Exchange rate box beside it, on the house and
// product forms (28 Sep 2026: "make the currency field a drop down that is
// dynamically linked to another field called exchange rate").
//
// The rate is the platform's own `fx_rates` row for the chosen currency — the
// one the pricing waterfall divides by, foreign units per NZ$1 — never a
// second copy on the house or the product. It is tied to the product prices
// import: the export's Exchange Rate column fills and replaces it (API
// product-prices-import.js), and its note names the file. Finance can type a
// new one here; it lasts until an export states another. A rate is per
// CURRENCY, so saving it reprices every house and product in that currency,
// and the hint says so.
//
// Pure — no jsdom here, so every decision the box makes is tested from
// ./exchangeRate.test.js.

export const HOME_CURRENCY = 'NZD'

// Currencies one NZ$ buys LESS than one of (USD 0.51, EUR 0.45, GBP 0.38 in
// Sept 2026), so their rate is always below 1. One typed at 1 or more is the
// rate the other way round — NZ$ per unit, how the office says it ("2 NZD per
// 1 USD", 30 Sep 2026) — and would price everything in that currency about
// four times too low, since the waterfall divides by it.
export const STRONGER_THAN_NZD = Object.freeze(['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'USD'])

/** "NZ$1.96 per 1 USD" — the same rate the way round the office reads it. */
export const nzdPerUnitText = (rate, currency) => `NZ$${(1 / Number(rate)).toFixed(2)} per 1 ${currency}`

/** The sentence refusing a rate typed the other way round, or null. */
export const reversedRateError = (rate, currency) =>
  STRONGER_THAN_NZD.includes(currency) && Number(rate) >= 1
    ? `That is NZ$ per ${currency}. The rate is ${currency} per NZ$1 — for NZ$${rate} per 1 ${currency}, type ${Number((1 / Number(rate)).toFixed(4))}.`
    : null
// The four the catalogue carries today; any currency with a rate on file, and
// the record's own value, are added to them (currencyChoices).
export const BASE_CURRENCIES = Object.freeze(['NZD', 'EUR', 'GBP', 'USD'])

/** NZD first, then alphabetical; the saved value is always offered. */
export const currencyChoices = (rates = [], current = '') => {
  const codes = new Set([...BASE_CURRENCIES, ...rates.map((r) => r.currency), current].filter(Boolean))
  const rest = [...codes].filter((code) => code !== HOME_CURRENCY).sort()
  return [HOME_CURRENCY, ...rest]
}

/**
 * What the Exchange rate box shows for `currency`, and whether it can be typed
 * in (finance, rates read, a foreign currency chosen).
 *
 * @param {{ status: 'loading'|'ready'|'error'|'locked', rates: object[] }} fx
 * @returns {{ value: string, hint: string, editable: boolean }}
 */
export const exchangeRateView = (fx, currency) => {
  const fixed = (value, hint) => ({ value, hint, editable: false })
  if (!currency) return fixed('', 'Choose a currency first.')
  if (currency === HOME_CURRENCY) return fixed('1', 'NZ dollars — no exchange.')
  if (fx.status === 'locked') return fixed('Finance only', 'Exchange rates are cost data.')
  if (fx.status === 'loading') return fixed('Loading…', '')
  if (fx.status === 'error') return fixed('Could not load', 'The rate could not be read — try reloading.')
  const everywhere = `Saving changes it for every ${currency} house and product.`
  const found = fx.rates.find((r) => r.currency === currency)
  if (!found) {
    return {
      value: '',
      hint: `No ${currency} rate yet — the product prices import sets it, or type one. ${everywhere}`,
      editable: true,
    }
  }
  const source = found.note ? ` — ${found.note}` : ''
  return {
    value: String(found.rate),
    hint: `${currency} per NZ$1 (${nzdPerUnitText(found.rate, currency)}), set ${found.set_on}${source}. ${everywhere}`,
    editable: true,
  }
}

const RATE_PATTERN = /^\d*\.?\d+$/

/** A typed rate, or the sentence saying why it is not one. */
export const parseRate = (text, currency = null) => {
  const trimmed = String(text ?? '').trim()
  const rate = Number(trimmed)
  if (!RATE_PATTERN.test(trimmed) || !(rate > 0)) {
    return { error: 'An exchange rate is a number above zero, e.g. 0.45.' }
  }
  const reversed = reversedRateError(rate, currency)
  return reversed ? { error: reversed } : { rate }
}

/** The rate list with one currency's saved row in it — a new list. */
export const withRate = (rates, saved) =>
  rates.some((r) => r.currency === saved.currency)
    ? rates.map((r) => (r.currency === saved.currency ? saved : r))
    : [...rates, saved]
