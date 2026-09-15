// Pricing — the platform's own cost-plus waterfall, live from atelier-api's
// /admin/pricing/* (finance-gated: a 403 renders as a LockedPanel with the
// API's reason), drawn in the language of the original Pricing Engine: the
// numbered waterfall with the formula under each step and a hover tooltip, and
// the parameters rail beside it with an Automatic / Manual toggle.
//
// AUTOMATIC shows the house exactly as the API resolves it — every input with
// its source. MANUAL unlocks the rail: a typed value goes to the API as a
// what-if override (source "edited") and the waterfall moves live; nothing is
// written until Save, which PUTs the edited savable parameters onto the house
// (or the supplier's default) and the FX rate onto its currency. Discount,
// freight and retail markup can be tried but not saved here — they live on the
// supplier's terms and the freight ledger, and the rail says so.
//
// Opens on Pierre Frey. Rules live in ./pricingWaterfall.js; this file is layout.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { Em, Eyebrow, PrimaryButton, SecondaryButton } from '../components/ui.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { apiFetch, apiSend, safeFetch } from '../lib/api.js'
import { Select, ErrorLine, PanelNote, ToastLine, messageOf, monoCellInput, sectionLabel, useMutation, useToast } from '../admin/parts.jsx'
import { useIsNarrow } from '../hooks/useIsNarrow.js'
import { isFinanceRefusal } from './adminSuppliers.js'
import { indexByRange, parameterFor, pctText } from './priceLists.js'
import { PARAMETERS_PATH, dutyText, freightText } from './pricingParameters.js'
import {
  BRANDS_PATH,
  CATEGORIES,
  DEFAULT_WHOLESALE,
  DUTY_CLASSES,
  KEY_STEPS,
  MODES,
  RAIL_ROWS,
  brandParametersPath,
  cleanOverrides,
  defaultHouseId,
  foreign,
  fxBodyFrom,
  fxRatePath,
  nzd,
  parseWholesale,
  pickableHouses,
  railDraftValue,
  railValueText,
  savableBody,
  savableColumn,
  sourceLabel,
  stepOp,
  supplierParametersPath,
  unsavableTouched,
  waterfallPath,
} from './pricingWaterfall.js'

const caps = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }
const fieldLabel = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const note = { fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }
const railInput = {
  ...monoCellInput,
  width: 72,
  textAlign: 'right',
  fontSize: 13,
  color: c.accent,
  border: `1px solid ${c.brass}`,
}

// The demo's segmented toggle — mode, duty class, category.
function Segmented({ options, labels = options, value, onChange, small = false }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.paper }}>
      {options.map((option, index) => {
        const on = option === value
        return (
          <button key={String(option)} type="button" onClick={() => onChange(option)} className="ab-t"
            style={{ border: 'none', cursor: 'pointer', padding: small ? '6px 10px' : '9px 18px', fontFamily: font.ui, fontSize: small ? 11.5 : 12.5, fontWeight: 500, background: on ? c.accent : 'transparent', color: on ? c.paper : c.inkSoft }}>
            {labels[index]}
          </button>
        )
      })}
    </div>
  )
}

export default function PricingWaterfall() {
  const narrow = useIsNarrow()
  const [houses, setHouses] = useState([])
  const [brandId, setBrandId] = useState('')
  const [wholesale, setWholesale] = useState(DEFAULT_WHOLESALE)
  const [dutyClass, setDutyClass] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState(MODES[0])
  const [overrides, setOverrides] = useState({})
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | locked | error
  const [failure, setFailure] = useState('')
  const [d365, setD365] = useState(null)
  const [hovered, setHovered] = useState(null)
  const { message, flash } = useToast()

  const manual = mode === 'Manual'
  const rate = parseWholesale(wholesale)
  // A primitive dependency: only a what-if that would reach the API counts.
  const overridesKey = JSON.stringify(cleanOverrides(overrides))

  useEffect(() => {
    let active = true
    apiFetch(BRANDS_PATH)
      .then((body) => {
        if (!active) return
        const list = pickableHouses(body.brands ?? [])
        setHouses(list)
        setBrandId((current) => current || defaultHouseId(list))
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

  const load = useCallback(async () => {
    if (!brandId || rate == null) return null
    const body = await apiFetch(
      waterfallPath({ brandId, wholesaleRate: rate, dutyClass, category, overrides: JSON.parse(overridesKey) })
    )
    setPreview(body)
    return body
  }, [brandId, rate, dutyClass, category, overridesKey])

  useEffect(() => {
    if (!brandId) {
      setStatus('idle')
      return undefined
    }
    if (rate == null) return undefined
    let active = true
    // Typing in Manual mode recomputes after a short pause; everything else at once.
    const timer = setTimeout(() => {
      setStatus((current) => (current === 'ready' ? 'ready' : 'loading'))
      load()
        .then(() => {
          if (active) setStatus('ready')
        })
        .catch((err) => {
          if (!active) return
          setStatus(isFinanceRefusal(err) ? 'locked' : 'error')
          setFailure(messageOf(err, 'Could not compute the waterfall.'))
        })
    }, overridesKey === '{}' ? 0 : 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [load, brandId, rate, overridesKey])

  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  const selectMode = (next) => {
    setMode(next)
    setError('')
    if (next === 'Automatic') setOverrides({})
  }
  const editOverride = (key, value) => setOverrides((current) => ({ ...current, [key]: value }))

  const save = async (scope) => {
    const target = scope === 'house' ? preview.parameters.house : preview.parameters.supplier
    const body = savableBody(target, overrides, dutyClass)
    const fx = fxBodyFrom(overrides)
    if (!body && !fx) {
      return setError('Nothing edited here can be saved — discount, freight and retail markup are set on their own screens.')
    }
    const ok = await run(
      async () => {
        if (body) {
          await apiSend('PUT', scope === 'house' ? brandParametersPath(preview.brand.id) : supplierParametersPath(preview.supplier.id), body)
        }
        if (fx) await apiSend('PUT', fxRatePath(preview.currency), fx)
      },
      scope === 'house' ? `Saved to ${preview.brand.name}.` : `Saved as ${preview.supplier.name}'s default.`
    )
    if (ok) {
      // The saved values are now the house's own; only the what-ifs that cannot
      // be saved here stay typed in.
      const keep = new Set(unsavableTouched(overrides, dutyClass).map((row) => row.key))
      setOverrides((current) => Object.fromEntries(Object.entries(current).filter(([key]) => keep.has(key))))
    }
    return undefined
  }

  const supplier = preview?.supplier ?? null
  const currency = preview?.currency ?? null
  const d365Row = useMemo(() => (preview && d365 ? parameterFor(d365, { range_name: preview.brand?.name }) : null), [preview, d365])
  const untouchable = manual ? unsavableTouched(overrides, dutyClass) : []

  return (
    <>
      {/* Header + Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Pricing Engine</Eyebrow>
          <h1 style={{ margin: '13px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 42, lineHeight: 1.04, letterSpacing: '-0.015em', color: c.ink }}>
            The <Em>Waterfall</Em>
          </h1>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              aria-label="House"
              style={{ width: 'auto', minWidth: 220 }}
            >
              {houses.length === 0 && <option value="">Loading houses…</option>}
              {houses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
            {supplier && (
              <>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.brass }} />
                <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 17, color: c.ink }}>invoiced by {supplier.name}</span>
              </>
            )}
            {preview && !supplier && <span style={{ ...note, fontSize: 13 }}>no supplier linked</span>}
            {currency && (
              <span title="The supplier's invoicing currency" style={{ fontFamily: font.mono, fontSize: 12, color: c.muted, border: `1px solid ${c.line}`, borderRadius: 4, padding: '3px 8px' }}>{currency}</span>
            )}
          </div>
        </div>

        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ ...fieldLabel, marginBottom: 9 }}>Mode</div>
          <Segmented options={MODES} value={mode} onChange={selectMode} />
          <div style={{ ...note, marginTop: 9 }}>{manual ? 'Parameters unlocked — type to try, save to keep' : 'Derived from the house’s parameters'}</div>
        </div>
      </div>

      {status === 'idle' && <PanelNote>Loading houses…</PanelNote>}
      {status === 'loading' && !preview && <PanelNote>Computing the waterfall…</PanelNote>}
      {status === 'locked' && (
        <div style={{ marginTop: 28 }}>
          <LockedPanel title="The waterfall is finance" reason={failure} hint="Director and Finance only. Trade and retail sell prices are on Catalogue and Price Lists." />
        </div>
      )}
      {status === 'error' && <PanelNote tone="danger">{failure}</PanelNote>}

      {preview && status !== 'locked' && (
        <div id="pe-grid" style={{ marginTop: 38, display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 322px', gap: narrow ? 32 : 48, alignItems: 'start' }}>
          {/* Waterfall */}
          <section>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <Eyebrow>Cost-plus waterfall</Eyebrow>
              <div style={{ ...caps, fontSize: 10 }}>Per unit · {currency ?? 'foreign'} → NZ$</div>
            </div>
            <div style={{ borderTop: `1px solid ${c.line}` }}>
              {preview.waterfall.steps.map((step, i) => {
                const key = KEY_STEPS.includes(step.step)
                const hot = hovered === i
                const missing = step.amount == null
                const op = stepOp(step.step, preview, dutyClass)
                const rowBg = hot ? c.surface : key ? '#F3EADF' : 'transparent'
                return (
                  <div key={step.step} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                    style={{ position: 'relative', display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 18, alignItems: 'center', padding: '16px 12px', borderBottom: `1px solid ${c.line}`, background: rowBg, transition: 'background .15s' }}>
                    <div style={{ fontFamily: font.mono, fontSize: 12, color: c.brass }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: font.display, fontSize: key ? 20 : 16, fontWeight: key ? 600 : 500, color: c.ink }}>{step.label}</div>
                      <div style={{ marginTop: 4, fontFamily: font.mono, fontSize: 12, color: missing ? c.clay : c.muted }}>{op}</div>
                    </div>
                    <div style={{ fontFamily: font.mono, fontWeight: 500, fontSize: key ? 24 : 18, color: missing ? c.muted : key ? c.accent : c.ink, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {step.step === 'wholesale' ? foreign(step.amount, currency) : nzd(step.amount)}
                      <span style={{ color: c.muted, fontSize: 11 }}> /unit</span>
                    </div>
                    {hot && (
                      <div style={{ position: 'absolute', left: 44, top: '100%', transform: 'translateY(-4px)', zIndex: 20, background: c.ink, color: c.paper, padding: '9px 13px', borderRadius: 4, maxWidth: 380, boxShadow: '0 8px 24px rgba(51,49,43,.18)' }}>
                        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.brass, marginBottom: 4 }}>Formula</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: c.surface, fontFamily: font.mono }}>{op}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ ...note, marginTop: 12, fontSize: 12.5, color: preview.waterfall.missing.length ? c.clay : c.muted }}>
              {preview.waterfall.missing.length
                ? `Stops at the first input nobody has set: ${preview.waterfall.missing.join(', ')}. Switch to Manual and enter it in the rail.`
                : `Every input has a source. Landed ${nzd(preview.waterfall.landed)} · trade ${nzd(preview.waterfall.trade_sell)} · retail ${nzd(preview.waterfall.retail_sell)}.`}
            </div>
          </section>

          {/* Parameters rail */}
          <aside style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 4, padding: '22px 22px 24px' }}>
            <Eyebrow>Parameters</Eyebrow>
            <div style={{ ...note, marginTop: 6, fontSize: 14, color: c.inkSoft }}>
              {supplier ? `${supplier.name}’s default unless ${preview.brand.name} overrides it` : 'No supplier linked — this house’s own values only'}
            </div>

            {/* The line being priced */}
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
                <span style={fieldLabel}>Wholesale rate<span style={{ color: c.muted }}> · {currency ?? 'supplier currency'}</span></span>
                <input value={wholesale} onChange={(e) => setWholesale(e.target.value)} inputMode="decimal" aria-label="Wholesale rate"
                  style={{ ...railInput, color: rate == null ? c.danger : c.ink, border: `1px solid ${rate == null ? c.danger : c.line}` }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 2px' }}>
                <span style={fieldLabel}>Duty class</span>
                <Segmented small options={DUTY_CLASSES} labels={['None', 'A', 'B', 'C']} value={dutyClass} onChange={setDutyClass} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 2px' }}>
                <span style={fieldLabel}>Category</span>
                <Segmented small options={CATEGORIES} labels={['Any', 'Fabric', 'Wallpaper', 'Trim', 'Accessory']} value={category} onChange={setCategory} />
              </div>
            </div>

            {/* The parameters, in waterfall order */}
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {RAIL_ROWS.map((row) => {
                const input = preview.inputs[row.key]
                const column = savableColumn(row, dutyClass)
                return (
                  <div key={row.key} className="ab-t"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', border: `1px ${manual ? 'dashed' : 'solid'} ${manual ? c.brass : c.line}`, borderRadius: 4, background: manual ? c.paper : 'transparent' }}>
                    <span style={{ fontSize: 12.5, color: c.inkSoft, minWidth: 0 }}>
                      <span style={fieldLabel}>{row.label}</span>
                      <span style={{ color: input?.value == null && input?.source === 'missing' ? c.clay : c.muted }}> · {sourceLabel(input)}</span>
                      {manual && !column && <span style={{ color: c.muted }}> · what-if</span>}
                    </span>
                    {manual ? (
                      <input value={railDraftValue(row, input, overrides)} onChange={(e) => editOverride(row.key, e.target.value)} inputMode="decimal"
                        aria-label={`${row.label} — override`} placeholder={row.unit} style={railInput} />
                    ) : (
                      <span style={{ fontFamily: font.mono, fontSize: 13, color: input?.value == null ? c.muted : c.ink, flex: 'none' }}>{railValueText(row, input)}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {manual ? (
              <>
                <div style={{ ...note, marginTop: 9 }}>
                  {untouchable.length
                    ? `${untouchable.map((r) => r.label).join(', ')}: what-if only here — set on ${[...new Set(untouchable.map((r) => r.where ?? 'a duty class'))].join(' / ')}.`
                    : 'Percentages as written (5 = 5%). Save writes the edited rows to the house; discount, freight and retail markup are what-if only.'}
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <PrimaryButton size="sm" onClick={() => save('house')} disabled={busy}>Save to {preview.brand.name}</PrimaryButton>
                  {supplier && (
                    <SecondaryButton size="sm" onClick={() => save('supplier')} disabled={busy}>Save as {supplier.name} default</SecondaryButton>
                  )}
                </div>
                {error && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
              </>
            ) : (
              <div style={{ ...note, marginTop: 9 }}>Switch to Manual to try a value or change one.</div>
            )}

            {/* Dynamics reference */}
            <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
              <div style={{ ...sectionLabel, marginBottom: 4 }}>Dynamics reference{d365Row ? ` · range ${d365Row.name}` : ''}</div>
              <div style={{ ...note, marginBottom: 10 }}>What the old system priced this house with — a reference, not the source.</div>
              {d365Row ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    ['Supplier discount', pctText(d365Row.discount_percent)],
                    ['Trade markup', pctText(d365Row.trade_markup_percent)],
                    ['Freight / unit', freightText(d365Row.freight_per_unit)],
                    ['Duty A · B · C', dutyText(d365Row)],
                    ['Clearance', pctText(d365Row.clearance_percent)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 12px', border: `1px solid ${c.line}`, borderRadius: 4 }}>
                      <span style={{ fontSize: 12, color: c.inkSoft }}>{label}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 12, color: c.ink }}>{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={note}>{d365 ? 'No Dynamics range matches this house.' : 'Dynamics parameters need finance visibility.'}</div>
              )}
            </div>

            <div style={{ marginTop: 18, borderTop: `1px solid ${c.line}`, paddingTop: 14, fontSize: 11.5, color: c.muted, lineHeight: 1.6 }}>
              Discount and retail markup: <Link to="/admin/suppliers" style={{ color: c.accent }}>Suppliers → terms</Link>. Freight: <Link to="/admin/freight" style={{ color: c.accent }}>Price Lists → Freight</Link>. The full Dynamics table: <Link to="/price-lists/parameters" style={{ color: c.accent }}>Dynamics parameters</Link>.
            </div>
          </aside>
        </div>
      )}

      <ToastLine message={message} />
    </>
  )
}
