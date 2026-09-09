// Pricing — the platform's own cost-plus waterfall, live from atelier-api's
// /admin/pricing/* (finance-gated: a 403 renders as a LockedPanel with the
// API's reason).
//
// Pick a house, type a wholesale rate in the supplier's currency, and every
// step is computed by the API's ONE waterfall engine from parameters the office
// owns: the house's override, else its supplier's default, else "not set" —
// never a guessed constant. Discount and retail markup come from the supplier's
// terms (Suppliers screen), freight from the ledger (Price Lists → Freight),
// the exchange rate from the table edited here. Under each editable field the
// Dynamics export's figure for the same range is shown as a reference.
//
// Saving a parameter set is a PUT of the whole set: a blank field CLEARS. Every
// rule lives in ./pricingWaterfall.js; this file is layout.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { ApiError, apiDelete, apiFetch, apiSend, safeFetch } from '../lib/api.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  messageOf,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import { isFinanceRefusal } from './adminSuppliers.js'
import { indexByRange, parameterFor } from './priceLists.js'
import { PARAMETERS_PATH } from './pricingParameters.js'
import {
  BRANDS_PATH,
  CATEGORIES,
  DEFAULT_WHOLESALE,
  DUTY_CLASSES,
  EMPTY_DRAFT,
  FX_PATH,
  PARAMETER_FIELDS,
  STEP_INPUT,
  brandParametersPath,
  buildFxBody,
  buildParametersBody,
  d365Hint,
  draftFromParameters,
  draftIsBlank,
  fxRatePath,
  inputText,
  nzd,
  parseWholesale,
  pickableHouses,
  supplierParametersPath,
  waterfallPath,
} from './pricingWaterfall.js'

const STEP_COLUMNS = '1.7fr 1fr 2fr'
const KEY_STEPS = new Set(['landed', 'trade_sell', 'retail_sell'])
const smallInput = { ...inputStyle, height: 34, fontSize: 12.5 }
const mono = { fontFamily: font.mono, fontSize: 12.5, color: c.ink }

export default function PricingWaterfall() {
  const [houses, setHouses] = useState([])
  const [brandId, setBrandId] = useState('')
  const [wholesale, setWholesale] = useState(DEFAULT_WHOLESALE)
  const [dutyClass, setDutyClass] = useState('')
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | locked | error
  const [failure, setFailure] = useState('')
  const [d365, setD365] = useState(null) // Map by range name, or null when not finance
  const [fxDraft, setFxDraft] = useState({ rate: '', set_on: '' })
  const [supplierDraft, setSupplierDraft] = useState(EMPTY_DRAFT)
  const [houseDraft, setHouseDraft] = useState(EMPTY_DRAFT)
  const { message, flash } = useToast()

  useEffect(() => {
    let active = true
    apiFetch(BRANDS_PATH)
      .then((body) => {
        if (active) setHouses(pickableHouses(body.brands ?? []))
      })
      .catch(() => {
        if (active) setHouses([])
      })
    safeFetch(PARAMETERS_PATH).then(({ data }) => {
      if (active && data) setD365(indexByRange(data.parameters ?? []))
    })
    return () => {
      active = false
    }
  }, [])

  const rate = parseWholesale(wholesale)

  const load = useCallback(async () => {
    if (!brandId || rate == null) return null
    const body = await apiFetch(waterfallPath({ brandId, wholesaleRate: rate, dutyClass, category }))
    setPreview(body)
    setSupplierDraft(draftFromParameters(body.parameters?.supplier))
    setHouseDraft(draftFromParameters(body.parameters?.house))
    if (body.currency) {
      const { data } = await safeFetch(FX_PATH)
      const current = (data?.rates ?? []).find((r) => r.currency === body.currency)
      setFxDraft({ rate: current ? String(current.rate) : '', set_on: current?.set_on ?? '' })
    }
    return body
  }, [brandId, rate, dutyClass, category])

  useEffect(() => {
    if (!brandId) {
      setStatus('idle')
      setPreview(null)
      return undefined
    }
    if (rate == null) return undefined
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setStatus(isFinanceRefusal(err) ? 'locked' : 'error')
        setFailure(messageOf(err, 'Could not compute the waterfall.'))
      })
    return () => {
      active = false
    }
  }, [load, brandId, rate])

  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  const d365Row = useMemo(
    () => (preview && d365 ? parameterFor(d365, { range_name: preview.brand?.name }) : null),
    [preview, d365]
  )

  const saveSet = (scope) => {
    const draft = scope === 'house' ? houseDraft : supplierDraft
    const path = scope === 'house' ? brandParametersPath(preview.brand.id) : supplierParametersPath(preview.supplier.id)
    if (draftIsBlank(draft)) {
      return run(() => apiDelete(path), scope === 'house' ? 'House override cleared — the supplier default applies.' : 'Supplier default cleared.')
    }
    const built = buildParametersBody(draft)
    if (!built.ok) return setError(built.error)
    return run(() => apiSend('PUT', path, built.body), scope === 'house' ? 'House override saved.' : 'Supplier default saved.')
  }

  const saveFx = (event) => {
    event.preventDefault()
    const built = buildFxBody(fxDraft)
    if (!built.ok) return setError(built.error)
    return run(() => apiSend('PUT', fxRatePath(preview.currency), built.body), `${preview.currency} rate saved.`)
  }

  const supplier = preview?.supplier ?? null

  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="The waterfall"
        subtitle="One house, one wholesale rate, every step — computed from the parameters Atelier sets, not from the old system. A step that cannot be reached says which input is missing."
      />

      {/* Controls */}
      <section style={{ ...panel, marginTop: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, padding: '16px 20px' }}>
          <Field label="House">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={smallInput}>
              <option value="">Choose a house…</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>
          <Field label={`Wholesale rate${preview?.currency ? ` (${preview.currency})` : ''}`} hint={rate == null ? 'A number, zero or more.' : undefined}>
            <input value={wholesale} onChange={(e) => setWholesale(e.target.value)} inputMode="decimal" style={{ ...smallInput, fontFamily: font.mono }} />
          </Field>
          <Field label="Duty class" hint="Blank = no duty on the line.">
            <select value={dutyClass} onChange={(e) => setDutyClass(e.target.value)} style={smallInput}>
              {DUTY_CLASSES.map((d) => (
                <option key={d} value={d}>{d === '' ? 'None' : d}</option>
              ))}
            </select>
          </Field>
          <Field label="Category" hint="Selects a freight rate and a discount tier.">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={smallInput}>
              {CATEGORIES.map((k) => (
                <option key={k} value={k}>{k === '' ? 'Any' : k}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {status === 'idle' && <PanelNote>Choose a house to see its waterfall.</PanelNote>}
      {status === 'loading' && !preview && <PanelNote>Computing…</PanelNote>}
      {status === 'locked' && (
        <div style={{ marginTop: 20 }}>
          <LockedPanel title="The waterfall is finance" reason={failure} hint="Director and Finance only. Trade and retail sell prices are on Catalogue and Price Lists." />
        </div>
      )}
      {status === 'error' && <PanelNote tone="danger">{failure}</PanelNote>}

      {preview && status !== 'locked' && (
        <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: 28, alignItems: 'start' }}>
          {/* The waterfall */}
          <section style={panel}>
            <PanelHead
              label={`${preview.brand.name}${supplier ? ` · invoiced by ${supplier.name}` : ' · no supplier linked'}`}
              right={<span style={mutedText}>per unit · {preview.currency ?? 'no currency'} → NZ$</span>}
            />
            <HeaderRow columns={STEP_COLUMNS} labels={['Step', 'Amount', 'Input used']} />
            {preview.waterfall.steps.map((step) => {
              const inputKey = STEP_INPUT[step.step]
              const input = inputKey ? preview.inputs[inputKey] : null
              const key = KEY_STEPS.has(step.step)
              const missing = input && input.value == null
              return (
                <Row key={step.step} columns={STEP_COLUMNS} style={key ? { background: '#F3EADF' } : undefined}>
                  <span style={{ fontSize: key ? 14 : 12.5, fontWeight: key ? 600 : 400, color: c.ink }}>{step.label}</span>
                  <span style={{ ...mono, fontSize: key ? 15 : 12.5, color: step.amount == null ? c.muted : key ? c.accent : c.ink }}>
                    {step.step === 'wholesale' && step.amount != null ? `${step.amount} ${preview.currency ?? ''}` : nzd(step.amount)}
                  </span>
                  <span style={{ fontSize: 12, color: missing ? c.clay : c.inkSoft }}>
                    {inputKey ? inputText(inputKey, input, preview.currency) : 'typed above'}
                  </span>
                </Row>
              )
            })}
            {preview.waterfall.missing.length > 0 ? (
              <PanelNote tone="danger">
                Not computed past the first missing input: {preview.waterfall.missing.join(', ')}. Set it in the panel beside.
              </PanelNote>
            ) : (
              <PanelNote>Every input has a source. Landed {nzd(preview.waterfall.landed)} · trade {nzd(preview.waterfall.trade_sell)} · retail {nzd(preview.waterfall.retail_sell)}.</PanelNote>
            )}
          </section>

          {/* Parameters */}
          <div style={{ display: 'grid', gap: 20 }}>
            <ParameterSet
              title={supplier ? `Supplier default · ${supplier.name}` : 'Supplier default'}
              note={supplier ? 'Applies to every house this supplier invoices unless the house overrides it.' : 'Link this house to a supplier on the Suppliers screen to set a default.'}
              draft={supplierDraft}
              onChange={setSupplierDraft}
              onSave={() => saveSet('supplier')}
              disabled={!supplier || busy}
              d365={null}
            />
            <ParameterSet
              title={`This house · ${preview.brand.name}`}
              note="Only the fields set here override the supplier default. Save with every field blank to clear the override."
              draft={houseDraft}
              onChange={setHouseDraft}
              onSave={() => saveSet('house')}
              disabled={busy}
              d365={d365Row}
            />

            <section style={panel}>
              <PanelHead label={`Exchange rate${preview.currency ? ` · ${preview.currency}` : ''}`} />
              {preview.currency ? (
                <form onSubmit={saveFx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, padding: '14px 20px', alignItems: 'end' }}>
                  <Field label={`${preview.currency} per NZ$1`}>
                    <input value={fxDraft.rate} onChange={(e) => setFxDraft((d) => ({ ...d, rate: e.target.value }))} inputMode="decimal" style={{ ...smallInput, fontFamily: font.mono }} />
                  </Field>
                  <Field label="Set on">
                    <input type="date" value={fxDraft.set_on ?? ''} onChange={(e) => setFxDraft((d) => ({ ...d, set_on: e.target.value }))} style={smallInput} />
                  </Field>
                  <GhostButton type="submit" disabled={busy}>Save</GhostButton>
                </form>
              ) : (
                <PanelNote>No currency on this house or its supplier, so no rate can apply.</PanelNote>
              )}
              <PanelNote>The FX margin that softens the rate is a parameter above. Discount and retail markup are the supplier's terms — edit them under <Link to="/admin/suppliers" style={{ color: c.accent }}>Suppliers</Link>; freight is the <Link to="/admin/freight" style={{ color: c.accent }}>freight ledger</Link>.</PanelNote>
            </section>

            {error && <ErrorLine>{error}</ErrorLine>}
          </div>
        </div>
      )}

      <ToastLine message={message} />
    </>
  )
}

function ParameterSet({ title, note, draft, onChange, onSave, disabled, d365 }) {
  const set = (key) => (e) => onChange({ ...draft, [key]: e.target.value })
  return (
    <section style={panel}>
      <PanelHead label={title} right={<GhostButton onClick={onSave} disabled={disabled}>Save</GhostButton>} />
      <div style={{ padding: '4px 20px 6px', ...mutedText, fontSize: 11.5 }}>{note}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '10px 20px 16px' }}>
        {PARAMETER_FIELDS.map((field) => (
          <Field key={field.key} label={`${field.label} (${field.unit})`} hint={d365Hint(d365, field) ?? undefined}>
            <input value={draft[field.key]} onChange={set(field.key)} inputMode="decimal" disabled={disabled} style={{ ...smallInput, fontFamily: font.mono }} />
          </Field>
        ))}
        <Field label="Note" style={{ gridColumn: '1 / -1' }}>
          <input value={draft.note} onChange={set('note')} disabled={disabled} style={smallInput} />
        </Field>
      </div>
    </section>
  )
}
