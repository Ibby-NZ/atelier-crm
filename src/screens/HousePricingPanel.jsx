// The Pricing panel on a house's own page (/admin/brands/:id): every figure
// the Dynamics tracking-options export carries for the house — duty A/B/C,
// clearance, freight, discount, trade markup, the small-order surcharge — plus
// the FX margin and handling the waterfall also reads, editable in one form.
//
//   GET /admin/pricing/houses/:id → { pricing }
//   PUT /admin/pricing/houses/:id { parameters, discount_percent?, discount_classes?,
//                                   freight?, freight_classes? } → { pricing }
//
// Freight CLASSES are a rate per freight letter (A, B, C… — the letter every
// price line carries): a line pays its letter's rate, and a letter with no rate
// pays the house's every-class rate. Discount CLASSES are the house's discount
// tiers: a product's chosen class, else the class named after its category,
// else the default class, else the flat discount. Both edit here (Sept 2026,
// the office asked); a house on a compounded chain keeps its discount on the
// supplier's terms.
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
import { FREIGHT_CLASS_LETTERS } from './adminFreight.js'
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
  DISCOUNT_CLASSES_NOTE,
  PARAMETER_FIELDS,
  buildSaveBody,
  classRemovalNote,
  discountNote,
  draftFrom,
  freightClassHint,
  freightNote,
  housePricingPath,
  CLEARANCE_BASES,
  placeholderFor,
  unusedFreightLetters,
  withDiscountClass,
  withDiscountClassField,
  withFreightClass,
  withoutFreightClass,
  canRemoveFreightClass,
  pendingRemovalNote,
  withoutDiscountClass,
} from './housePricing.js'

const FIELD = Object.fromEntries(PARAMETER_FIELDS.map((field) => [field.key, field]))

// The boxes in the export's own order, grouped the way the office reads them.
const GROUPS = Object.freeze([
  { label: 'Duty', keys: ['duty_percent_a', 'duty_percent_b', 'duty_percent_c'] },
  { label: 'Landing and markup', keys: ['clearance_percent', 'trade_markup_percent', 'retail_markup_percent'] },
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
    // Clearance is a percentage or dollars per unit, as the house states it.
    const unit = key === 'clearance_percent' ? (draft.clearance_basis === 'dollar' ? '$ per unit' : '%') : field.unit
    return (
      <Field key={key} label={`${field.label} (${unit})`}>
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
              {group.keys.flatMap((key) =>
                key === 'clearance_percent'
                  ? [
                      box(key),
                      <Field key="clearance_basis" label="Clearance is">
                        <Select value={draft.clearance_basis ?? 'percent'} onChange={set('clearance_basis')} disabled={busy} style={inputStyle}>
                          {CLEARANCE_BASES.map((basis) => (
                            <option key={basis.value} value={basis.value}>
                              {basis.label}
                            </option>
                          ))}
                        </Select>
                      </Field>,
                    ]
                  : [box(key)]
              )}
            </div>
          </div>
        ))}

        <div>
          <div style={groupLabel}>Freight</div>
          <div style={grid} className="r-grid-2">
            <Field label="Freight ($)" hint="Per unit of whatever each product is sold in — the unit is set on the product.">
              <input
                value={draft.freight_rate ?? ''}
                onChange={set('freight_rate')}
                disabled={busy}
                inputMode="decimal"
                placeholder={placeholderFor('freight_rate', pricing)}
                style={inputStyle}
              />
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
          <FreightClasses pricing={pricing} draft={draft} setDraft={setDraft} busy={busy} />
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
          <DiscountClasses pricing={pricing} draft={draft} setDraft={setDraft} busy={busy} />
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
        {/* A Remove only takes the row off the form; say so beside the button that writes it. */}
        {pendingRemovalNote(pricing, draft) && (
          <div role="status" style={{ fontSize: 13, color: c.clay }}>{pendingRemovalNote(pricing, draft)}</div>
        )}
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

const subLabel = { fontSize: 13, fontWeight: 600, color: c.inkSoft, margin: '20px 0 4px' }
const smallMuted = { ...mutedText, fontSize: 12, lineHeight: 1.5 }
const letterBadge = {
  fontFamily: font.mono,
  fontSize: 13,
  fontWeight: 600,
  color: c.ink,
  textAlign: 'center',
  padding: '10px 0',
  background: c.panelHead,
}
const classRow = {
  display: 'grid',
  gridTemplateColumns: '48px minmax(0, 1fr) minmax(0, 1.6fr) auto',
  gap: 12,
  alignItems: 'center',
  marginTop: 8,
}

// A rate per freight letter. Rows start from the letters the house has a rate
// for or its price lines carry; "Add freight class" opens another. A new
// figure is appended like the house's own; Remove takes the letter's own rate
// away on save, so its lines pay the house's rate again.
function FreightClasses({ pricing, draft, setDraft, busy }) {
  const [adding, setAdding] = useState('')
  const letters = Object.keys(draft.freight_classes ?? {}).sort()
  const unused = unusedFreightLetters(draft)
  const houseRate = pricing.freight ? `${pricing.freight.rate} (house rate)` : ''
  const setRow = (letter, field) => (event) => {
    const value = event.target.value
    setDraft((held) => ({
      ...held,
      freight_classes: { ...held.freight_classes, [letter]: { ...held.freight_classes[letter], [field]: value } },
    }))
  }
  const add = () => {
    setDraft((held) => withFreightClass(held, adding))
    setAdding('')
  }

  return (
    <div>
      <div style={subLabel}>Freight classes</div>
      <div style={smallMuted}>
        A price line pays the rate for its own freight letter; a letter with no rate here pays the house&apos;s rate
        above. A new figure is added as a new dated rate, from the day above.
      </div>
      {letters.length === 0 && (
        <div style={{ ...smallMuted, marginTop: 8 }}>No price line of this house carries a freight class yet.</div>
      )}
      {letters.map((letter) => (
        <div key={letter} style={classRow} className="r-grid-2">
          <span style={letterBadge} aria-hidden="true">
            {letter}
          </span>
          <input
            value={draft.freight_classes[letter].rate}
            onChange={setRow(letter, 'rate')}
            disabled={busy}
            inputMode="decimal"
            placeholder={houseRate}
            aria-label={`Freight class ${letter} ($)`}
            style={inputStyle}
          />
          <span style={smallMuted}>{freightClassHint(pricing, letter)}</span>
          {canRemoveFreightClass(pricing, letter) && (
            <GhostButton
              disabled={busy}
              aria-label={`Remove freight class ${letter}`}
              onClick={() => setDraft((held) => withoutFreightClass(held, letter))}
            >
              Remove
            </GhostButton>
          )}
        </div>
      ))}
      {unused.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Select
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            disabled={busy}
            aria-label="Freight class to add"
            style={{ ...inputStyle, width: 130 }}
          >
            <option value="">Letter…</option>
            {unused.map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </Select>
          <GhostButton disabled={busy || adding === ''} onClick={add}>
            Add freight class
          </GhostButton>
        </div>
      )}
    </div>
  )
}

// The house's discount classes (its supplier-terms tiers), edited as a set:
// name, rate, and at most one default. A house on a compounded chain shows
// them read-only — the chain wins, and it lives on the supplier's terms.
function DiscountClasses({ pricing, draft, setDraft, busy }) {
  const discount = pricing.discount
  const editable = discount.editable
  const rows = draft.discount_classes ?? []
  const saved = new Map((discount.classes ?? []).map((entry) => [entry.id, entry]))
  const field = (key, name) => (event) =>
    setDraft((held) =>
      withDiscountClassField(held, key, name, name === 'is_default' ? event.target.checked : event.target.value)
    )
  const inputFor = editable ? editableInput : readOnlyInput

  return (
    <div>
      <div style={subLabel}>Discount classes</div>
      {rows.length === 0 && (
        <div style={{ ...smallMuted, marginTop: 4 }}>
          No classes — every product takes the flat discount above.
        </div>
      )}
      {rows.map((row) => {
        const note = row.id != null ? classRemovalNote(saved.get(row.id)) : ''
        return (
          <div key={row.key}>
            <div
              style={{ ...classRow, gridTemplateColumns: '90px minmax(0, 2fr) minmax(0, 1fr) auto auto' }}
              className="r-grid-2"
            >
              <Select
                value={row.discount_class ?? ''}
                onChange={field(row.key, 'discount_class')}
                disabled={busy || !editable}
                aria-label={`Letter for ${row.label || 'this class'}`}
                style={inputFor}
              >
                <option value="">—</option>
                {FREIGHT_CLASS_LETTERS.map((letter) => (
                  <option key={letter} value={letter}>
                    {letter}
                  </option>
                ))}
              </Select>
              <input
                value={row.label}
                onChange={field(row.key, 'label')}
                disabled={busy || !editable}
                placeholder={row.discount_class ? `Class ${row.discount_class}` : 'e.g. Wallpaper, New collections'}
                aria-label="Discount class name"
                style={inputFor}
              />
              <input
                value={row.percent}
                onChange={field(row.key, 'percent')}
                disabled={busy || !editable}
                inputMode="decimal"
                placeholder="%"
                aria-label={`Discount for ${row.label || 'this class'} (%)`}
                style={inputFor}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: c.inkSoft }}>
                <input
                  type="checkbox"
                  checked={row.is_default}
                  onChange={field(row.key, 'is_default')}
                  disabled={busy || !editable}
                />
                Default
              </label>
              {editable ? (
                <GhostButton disabled={busy} onClick={() => setDraft((held) => withoutDiscountClass(held, row.key))}>
                  Remove
                </GhostButton>
              ) : (
                <span />
              )}
            </div>
            {note && <div style={{ ...smallMuted, marginTop: 4 }}>{note}</div>}
          </div>
        )
      })}
      {editable && (
        <div style={{ marginTop: 12 }}>
          <GhostButton disabled={busy} onClick={() => setDraft((held) => withDiscountClass(held))}>
            Add discount class
          </GhostButton>
        </div>
      )}
      <div style={{ ...smallMuted, marginTop: 10 }}>{DISCOUNT_CLASSES_NOTE}</div>
    </div>
  )
}
