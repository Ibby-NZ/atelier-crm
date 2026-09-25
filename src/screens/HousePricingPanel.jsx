// The Pricing panel on a house's own page (/admin/brands/:id): every figure
// the Dynamics tracking-options export carries for the house — duty A/B/C,
// clearance, freight, discount, trade markup, the small-order surcharge — plus
// the FX margin and handling the waterfall also reads, editable in one form.
//
//   GET /admin/pricing/houses/:id → { pricing }
//   PUT /admin/pricing/houses/:id { parameters, discount_percent?, freight? } → { pricing }
//
// The API files each figure in its one home (the house's parameter set, the
// supplier terms, the dated freight ledger) in one transaction; the rules for
// what this form sends are in ./housePricing.js. A blank box is "not set on
// this house" and shows, greyed, what applies instead.
//
// FINANCE-GATED, reads included: a login without finance visibility gets the
// API's 403 sentence in a LockedPanel, never a form of blanks.

import { useCallback, useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { apiFetch, apiSend } from '../lib/api.js'
import { LockedPanel } from '../auth/guards.jsx'
import { isFinanceRefusal } from './adminSuppliers.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  Select,
  inputStyle,
  messageOf,
  mutedText,
  panel,
  readOnlyInput,
} from '../admin/parts.jsx'
import {
  FREIGHT_UNITS,
  PARAMETER_FIELDS,
  buildSaveBody,
  discountNote,
  draftFrom,
  freightNote,
  housePricingPath,
  placeholderFor,
} from './housePricing.js'

const FIELD = Object.fromEntries(PARAMETER_FIELDS.map((field) => [field.key, field]))

// The boxes in the export's own order, grouped the way the office reads them.
const GROUPS = Object.freeze([
  { label: 'Duty', keys: ['duty_percent_a', 'duty_percent_b', 'duty_percent_c'] },
  { label: 'Landing and markup', keys: ['clearance_percent', 'trade_markup_percent'] },
  { label: 'Small-order surcharge', keys: ['surcharge_min_qty', 'surcharge_per_unit'] },
  { label: 'Also on the waterfall', keys: ['fx_margin_percent', 'handling'] },
])

const grid = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }
// The discount box switches between this and readOnlyInput as the house's
// terms allow. Both states set the `borderColor` longhand beside the `border`
// shorthand, so the switch only changes a value; dropping the longhand is what
// React warns about ("Removing borderColor border").
const editableInput = { ...inputStyle, borderColor: c.lineStrong }
const groupLabel = { ...mutedText, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, margin: '0 0 10px' }

export default function HousePricingPanel({ brandId, supplierId, flash }) {
  const [pricing, setPricing] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | locked | error
  const [failure, setFailure] = useState('')
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const body = await apiFetch(housePricingPath(brandId))
      setPricing(body.pricing)
      setStatus('ready')
    } catch (err) {
      setFailure(messageOf(err, "Could not load this house's pricing."))
      setStatus(isFinanceRefusal(err) ? 'locked' : 'error')
    }
  }, [brandId])

  // `supplierId` is a dependency on purpose: linking the house to a supplier on
  // the form above is what makes its discount writable.
  useEffect(() => {
    load()
  }, [load, supplierId])

  useEffect(() => {
    if (pricing) setDraft(draftFrom(pricing))
  }, [pricing])

  const set = (key) => (event) => setDraft((held) => ({ ...held, [key]: event.target.value }))

  const save = async () => {
    const { body, error: problem } = buildSaveBody(pricing, draft)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const saved = await apiSend('PUT', housePricingPath(brandId), body)
      setPricing(saved.pricing)
      flash?.('Pricing saved.')
    } catch (err) {
      setError(messageOf(err, 'The pricing could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  const box = (key, { disabled = false } = {}) => {
    const field = FIELD[key]
    return (
      <Field key={key} label={`${field.label} (${field.unit})`}>
        <input
          value={draft[key] ?? ''}
          onChange={set(key)}
          disabled={busy || disabled}
          inputMode="decimal"
          placeholder={placeholderFor(key, pricing)}
          style={inputStyle}
        />
      </Field>
    )
  }

  let body
  if (status === 'loading') body = <PanelNote>Loading pricing…</PanelNote>
  else if (status === 'error') body = <PanelNote tone="danger">{failure}</PanelNote>
  else if (status === 'locked') {
    body = (
      <div style={{ padding: 20 }}>
        <LockedPanel
          title="Pricing is finance"
          reason={failure}
          hint="Duty, freight, discount and markup are cost figures — Director and Finance only."
        />
      </div>
    )
  } else {
    const discount = pricing.discount
    body = (
      <div style={{ padding: '20px 20px 24px', display: 'grid', gap: 22 }}>
        <p style={{ ...mutedText, margin: 0, lineHeight: 1.6, maxWidth: 760 }}>
          This house&apos;s own figures. A blank box is not set here — what applies instead is shown
          in grey. Percentages as you would write them: 5 is 5%.
        </p>

        {GROUPS.slice(0, 2).map((group) => (
          <div key={group.label}>
            <div style={groupLabel}>{group.label}</div>
            <div style={grid} className="r-grid-2">
              {group.keys.map((key) => box(key))}
            </div>
          </div>
        ))}

        <div>
          <div style={groupLabel}>Freight</div>
          <div style={grid} className="r-grid-2">
            <Field label="Freight ($ per unit)">
              <input
                value={draft.freight_rate ?? ''}
                onChange={set('freight_rate')}
                disabled={busy}
                inputMode="decimal"
                placeholder={placeholderFor('freight_rate', pricing)}
                style={inputStyle}
              />
            </Field>
            <Field label="Per">
              <Select value={draft.freight_unit ?? ''} onChange={set('freight_unit')} disabled={busy} style={inputStyle}>
                <option value="">Choose a unit</option>
                {FREIGHT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="A new rate takes effect">
              <input
                type="date"
                value={draft.freight_from ?? ''}
                onChange={set('freight_from')}
                disabled={busy}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ ...mutedText, marginTop: 8, lineHeight: 1.5 }}>{freightNote(pricing)}</div>
        </div>

        <div>
          <div style={groupLabel}>Supplier discount</div>
          <div style={grid} className="r-grid-2">
            <Field label="Discount (%)">
              <input
                value={draft.discount_percent ?? ''}
                onChange={set('discount_percent')}
                disabled={busy || !discount.editable}
                inputMode="decimal"
                placeholder={placeholderFor('discount_percent', pricing)}
                style={discount.editable ? editableInput : readOnlyInput}
              />
            </Field>
          </div>
          <div style={{ ...mutedText, marginTop: 8, lineHeight: 1.5 }}>{discountNote(discount)}</div>
        </div>

        {GROUPS.slice(2).map((group) => (
          <div key={group.label}>
            <div style={groupLabel}>{group.label}</div>
            <div style={grid} className="r-grid-2">
              {group.keys.map((key) => box(key))}
            </div>
          </div>
        ))}

        <Field label="Note" hint="Where these figures came from, or why they differ from the supplier's.">
          <input value={draft.note ?? ''} onChange={set('note')} disabled={busy} style={inputStyle} />
        </Field>

        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <GhostButton tone="accent" disabled={busy} onClick={save}>
            Save pricing
          </GhostButton>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
            {pricing.house.supplier_name ? `Invoiced by ${pricing.house.supplier_name}` : 'No supplier linked'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <section style={{ ...panel, marginTop: 26 }}>
      <PanelHead label="Pricing" />
      {body}
    </section>
  )
}
