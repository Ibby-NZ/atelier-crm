// Append a house freight rate — on its own page. The form used to drop down
// above the ledger ("Append a rate"), and the client asked for every data-entry
// form to open on a page of its own instead (23 Sep 2026).
//
//   POST /admin/freight/rates        → the rate row (201); 409 on a same-day
//                                      duplicate for one scope and category
//
// **An append, never an edit (FR-192).** The ledger has no PATCH and no DELETE:
// a correction is a NEW row dated from the day it takes effect, and the
// resolver picks the newest dated rate at or before the day it is asked about.
// So there is no rate page to land on after a save — the office goes back to
// the ledger, where the new row now shows under its scope. The same-day
// duplicate is detected by the database, never pre-checked, and its 409
// sentence (date the correction instead) is shown verbatim.
//
// A new rate is always a house (range) rate: supplier-wide freight was retired
// from this form on 28 Sep 2026, once freight classes moved onto the house.
// Supplier rows already on the ledger still show there and still resolve. Dollars are the default and the
// recommendation (C19); a dollar rate states its unit and a percent rate must
// not (FR-187). Every one of those rules is in ./adminFreight.js and tested
// there; this file is layout.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { useCategories } from '../admin/useCategories.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  Select,
  ToastLine,
  inputStyle,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  BASES,
  FREIGHT_ROUTE,
  HOUSES_PATH,
  RATES_PATH,
  UNITS,
  houseOptions,
  FREIGHT_CLASS_LETTERS,
  newRateDraft,
  rateBody,
  rateFigure,
  unitRequired,
} from './adminFreight.js'

export default function AdminFreightRateNew() {
  const navigate = useNavigate()
  // The live vocabulary. `supplier_freight_rates.category` references the same
  // table `products.category` does, so a category added on the Categories
  // screen is filable here the minute it exists — which a frozen list would
  // not offer and `rateBody` would refuse before the request was even sent.
  const { values: categoryValues, labelFor: categoryName } = useCategories()
  const { message: toast, flash } = useToast()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the
  // kit's shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  const [draft, setDraft] = useState(newRateDraft)
  const setField = (key) => (event) => setDraft((held) => ({ ...held, [key]: event.target.value }))

  // The houses for the house scope, by name — the key a house rate is stored
  // under and looked up by.
  const [houses, setHouses] = useState({ status: 'loading', names: [] })
  useEffect(() => {
    let active = true
    apiFetch(HOUSES_PATH)
      .then((body) => {
        if (active) setHouses({ status: 'ready', names: houseOptions(body?.brands) })
      })
      .catch(() => {
        if (active) setHouses({ status: 'error', names: [] })
      })
    return () => {
      active = false
    }
  }, [])

  const appendRate = async (event) => {
    event.preventDefault()
    // The mirror of the API's own validateFreightRate: the common mistakes are
    // named before the round trip. Anything that slips through — above all the
    // 409 a same-day duplicate raises — lands here as the API's own sentence.
    const built = rateBody(draft, categoryValues)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', RATES_PATH, built.body),
      (rate) => `Appended ${rateFigure(rate)} from ${rate.effective_from}.`
    )
    // Replace, so Back from the ledger does not return to an emptied form.
    if (ok) navigate(FREIGHT_ROUTE, { replace: true })
    return undefined
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow="Price lists · live"
        title="Append a freight rate"
        subtitle="What a consignment costs to land, for one house, from the day it takes effect. The ledger is append-only — a correction is a new dated rate, never an overwrite."
        right={<GhostButton onClick={() => navigate(FREIGHT_ROUTE)}>Back to supplier freight</GhostButton>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Append a rate" />
        <form onSubmit={appendRate} style={{ padding: 20 }}>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}
            className="r-grid-2"
          >
            <Field
              label="House"
              hint={
                houses.status === 'error'
                  ? 'The house list could not be loaded — refresh.'
                  : undefined
              }
            >
              <Select
                value={draft.range_name}
                disabled={busy || houses.status !== 'ready'}
                onChange={setField('range_name')}
                aria-label="House"
              >
                <option value="">{houses.status === 'loading' ? 'Loading…' : 'Choose a house'}</option>
                {houses.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" hint="Blank covers every category — one quote for everything they ship is one row, not four.">
              <Select value={draft.category} disabled={busy} onChange={setField('category')}>
                <option value="">All categories</option>
                {categoryValues.map((category) => (
                  <option key={category} value={category}>
                    {categoryName(category)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Freight class"
              hint="The price lines' freight letter this rate is for. Blank covers every class — a line whose letter has no rate pays it."
            >
              <Select value={draft.freight_class} disabled={busy} onChange={setField('freight_class')}>
                <option value="">All classes</option>
                {FREIGHT_CLASS_LETTERS.map((letter) => (
                  <option key={letter} value={letter}>
                    {letter}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Basis"
              hint="Dollars are the default and the recommendation — freight is an amount per pack, not a percentage."
            >
              {/* Dollar first: the order IS the recommendation (C19). */}
              <Select value={draft.basis} disabled={busy} onChange={setField('basis')}>
                {BASES.map((basis) => (
                  <option key={basis} value={basis}>
                    {basis}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rate" hint={draft.basis === 'percent' ? 'A percentage of the discounted rate.' : "In dollars, per the unit beside it."}>
              <input
                value={draft.rate}
                inputMode="decimal"
                placeholder="0.00"
                disabled={busy}
                onChange={setField('rate')}
                style={{ ...inputStyle, fontFamily: font.mono }}
              />
            </Field>
            <Field
              label="Unit"
              hint={
                unitRequired(draft.basis)
                  ? 'The pack the dollar is per — a per-roll figure applied to a metre overcharges by the roll length.'
                  : 'A percent rate is per nothing — the unit stays blank.'
              }
            >
              <Select
                value={unitRequired(draft.basis) ? draft.unit : ''}
                disabled={busy || !unitRequired(draft.basis)}
                onChange={setField('unit')}
              >
                <option value="">{unitRequired(draft.basis) ? 'Choose a unit' : '—'}</option>
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Effective from"
              hint="The day it takes effect. One rate per scope, category and day — a same-day retype is refused; date the correction instead."
            >
              <input
                type="date"
                value={draft.effective_from}
                disabled={busy}
                onChange={setField('effective_from')}
                style={inputStyle}
              />
            </Field>
            <Field label="Note" hint="Why this rate is this number — a carrier quote, an annual uplift letter.">
              <input value={draft.note} disabled={busy} onChange={setField('note')} style={inputStyle} />
            </Field>
          </div>
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Append rate
            </GhostButton>
            <GhostButton disabled={busy} onClick={() => navigate(FREIGHT_ROUTE)}>
              Cancel
            </GhostButton>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
