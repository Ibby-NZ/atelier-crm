// The Currency select and its Exchange rate box, as two grid cells — the house
// form (BrandFields) and the product form (ProductFields) both draw it. The
// rules are in ./exchangeRate.js.
//
// The rates are read once per mounting form; picking a currency moves the box
// at once, with no request and no save. GET /admin/pricing/fx-rates is
// finance-gated like every /admin/pricing/* read, so a login without finance
// is not sent to be refused — the box says "Finance only" (NZD still reads 1).
//
// Finance can type a rate and press Save rate: PUT /admin/pricing/fx-rates/:cur.
// It is its own write, not part of Save house / Save product, because the rate
// belongs to the currency, not to this record.

import { useEffect, useState } from 'react'
import { font } from '../theme.js'
import { apiFetch, apiSend } from '../lib/api.js'
import { useCan } from '../auth/AuthContext.jsx'
import { CAPS } from '../auth/roles.js'
import { FX_PATH, fxRatePath } from '../screens/pricingWaterfall.js'
import { currencyChoices, exchangeRateView, parseRate, withRate } from './exchangeRate.js'
import { ErrorLine, Field, GhostButton, Select, inputStyle, messageOf, readOnlyInput } from './parts.jsx'

function useFxRates() {
  const finance = useCan(CAPS.FINANCE_VIEW)
  const [fx, setFx] = useState({ status: finance ? 'loading' : 'locked', rates: [] })

  useEffect(() => {
    if (!finance) {
      setFx({ status: 'locked', rates: [] })
      return undefined
    }
    let active = true
    apiFetch(FX_PATH)
      .then((body) => {
        if (active) setFx({ status: 'ready', rates: body.rates ?? [] })
      })
      .catch(() => {
        if (active) setFx({ status: 'error', rates: [] })
      })
    return () => {
      active = false
    }
  }, [finance])

  const saved = (rate) => setFx((current) => ({ ...current, rates: withRate(current.rates, rate) }))
  return [fx, saved]
}

export default function CurrencyFields({ value, onChange, disabled }) {
  const [fx, saved] = useFxRates()
  const rate = exchangeRateView(fx, value)
  const [saving, setSaving] = useState(false)
  // What was typed, and for WHICH currency and saved rate. A new currency, or
  // a saved rate, is a new key — the box shows what is on file again, in the
  // same render (an effect resetting it would flash the old text first).
  const key = `${value}|${rate.value}`
  const [edit, setEdit] = useState({ key, draft: '', error: '' })
  const { draft, error } = edit.key === key ? edit : { draft: rate.value, error: '' }
  const setDraft = (text) => setEdit({ key, draft: text, error: '' })
  const setError = (message) => setEdit({ key, draft, error: message })

  const changed = rate.editable && draft.trim() !== rate.value
  const saveRate = async () => {
    const parsed = parseRate(draft)
    if (parsed.error) return setError(parsed.error)
    setSaving(true)
    setError('')
    try {
      const body = await apiSend('PUT', fxRatePath(value), { rate: parsed.rate, note: 'Set in the CRM' })
      saved(body.rate)
    } catch (err) {
      setError(messageOf(err, 'Could not save the exchange rate.'))
    } finally {
      setSaving(false)
    }
    return undefined
  }

  return (
    <>
      <Field label="Currency">
        <Select
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => {
            // An unsaved rate is dropped, not kept for when this currency comes back.
            setEdit({ key: '', draft: '', error: '' })
            onChange(e.target.value)
          }}
          style={inputStyle}
        >
          {!value && <option value="">Choose a currency…</option>}
          {currencyChoices(fx.rates, value).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Exchange rate" hint={rate.hint}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={rate.editable ? draft : rate.value}
            readOnly={!rate.editable}
            disabled={!rate.editable || disabled || saving}
            inputMode="decimal"
            placeholder={rate.editable ? 'e.g. 0.45' : undefined}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Exchange rate for ${value || 'the chosen currency'}`}
            style={{ ...(rate.editable ? inputStyle : readOnlyInput), fontFamily: font.mono, flex: 1, minWidth: 0 }}
          />
          {changed && (
            <GhostButton tone="accent" disabled={disabled || saving} onClick={saveRate}>
              Save rate
            </GhostButton>
          )}
        </span>
        <ErrorLine style={{ marginTop: 6 }}>{error}</ErrorLine>
      </Field>
    </>
  )
}
