import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { designs } from '../data/atelier.js'
import { buildSku, parseSku, skuFormat, colorCode } from '../utils/sku.js'
import { supplierByName } from '../data/suppliers.js'
import { PageHeader, Em, WeaveImage, Indicative, Swatch } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { useIsNarrow } from '../hooks/useIsNarrow.js'
import { CAPS } from '../auth/roles.js'
import { useCan } from '../auth/AuthContext.jsx'
import { MaskedFigure } from '../auth/guards.jsx'

// Supplier facets — "Fabricut" is the real multi-brand house, its children sourced from the
// supplier master (GEN-05) so the facet and the Suppliers screen stay in step.
// Other suppliers are pulled from the real `designs` set; Fabricut is added as a local facet
// since the demo seeds it but the real catalogue maps its hero onto Pierre Frey et al.
const SUPPLIER_DEFS = [
  { name: 'All suppliers', key: 'All' },
  { name: 'Pierre Frey', key: 'Pierre Frey' },
  { name: 'Manuel Canovas', key: 'Manuel Canovas' },
  { name: 'Fabricut', key: 'Fabricut', children: (supplierByName('Fabricut')?.brands || []).map((b) => b.name) },
  { name: 'Larsen', key: 'Larsen' },
  { name: 'Rubelli Venezia', key: 'Rubelli Venezia' },
  { name: 'Jim Thompson', key: 'Jim Thompson' },
  { name: 'Colefax & Fowler', key: 'Colefax & Fowler' },
]

const COMPOSITIONS = ['Viscose', 'Linen', 'Cotton', 'Wool', 'Polyamide']

// Inherited pricing parameters (the cost-plus waterfall the demo inherits to every SKU). Duty and
// Retail are shown per selected design (they are variable/optional — P3/P6); the rest are range-level.
//
// `cost` marks a parameter that reveals what the textile cost to land, and every one of these does —
// including the two markups, which is not obvious. A markup is a RATIO TO COST, and the sell prices it
// produces are drawn ungated all over the app (a trade price on a sales order, a retail price in the
// Journal). Publish the ratio beside a public price and the cost falls out by division:
// NZ$187.76 ÷ 1.55 = NZ$121.14, the exact landed cost the /pricing route is closed to this role for.
// A salesperson quotes off the PRICE and never needs the multiplier, so masking the ratio costs them
// nothing and closes the arithmetic.
const PARAM_DEFS = [
  { key: 'duty', label: 'Duty', value: '7%', cost: true },
  { key: 'freight', label: 'Freight', value: '8%', cost: true },
  { key: 'clearance', label: 'Clearance', value: '2%', cost: true },
  { key: 'retail', label: 'Retail', value: '×2.2', cost: true },
  { key: 'trade', label: 'Trade markup', value: '55%', cost: true },
]

const STATUS_DOT = { sage: c.sage, clay: c.clay, muted: c.muted }

export default function Catalogue() {
  const navigate = useNavigate()
  // The catalogue itself is open to every signed-in role — a salesperson needs it. Only the
  // waterfall's mutation controls and the cost rates behind them answer to a capability.
  const canPrice = useCan(CAPS.PRICING_EDIT)
  const canFinance = useCan(CAPS.FINANCE_VIEW)
  const [activeSupplier, setActiveSupplier] = useState('All')
  const [expanded, setExpanded] = useState({})
  const [application, setApplication] = useState(null)
  const [selected, setSelected] = useState(0)
  const [selectedSku, setSelectedSku] = useState(designs[0].colourways[0].sku)
  const [overrides, setOverrides] = useState({})
  const [overrideValues, setOverrideValues] = useState(() =>
    Object.fromEntries(PARAM_DEFS.map((p) => [p.key, p.value]))
  )
  // Workshop 30 Jun (decision 2): 'show on website'. No retail price + shown ⇒ auto trade-only.
  const [showWeb, setShowWeb] = useState(false)

  const pickSupplier = (key, expandable) => {
    setActiveSupplier(key)
    if (expandable) setExpanded((s) => ({ ...s, [key]: !s[key] }))
  }
  const pickDesign = (i) => {
    setSelected(i)
    setSelectedSku(designs[i].colourways[0].sku)
  }
  const pickApp = (a) => setApplication((p) => (p === a ? null : a))
  const toggleOverride = (k) => {
    // Clearing an override restores the inherited default; enabling one leaves the value editable.
    if (overrides[k]) {
      const def = PARAM_DEFS.find((p) => p.key === k)
      if (def) setOverrideValues((s) => ({ ...s, [k]: def.value }))
    }
    setOverrides((s) => ({ ...s, [k]: !s[k] }))
  }
  const editOverride = (k, value) => setOverrideValues((s) => ({ ...s, [k]: value }))

  const matchSupplier = (d) =>
    activeSupplier === 'All' || d.supplier === activeSupplier || d.brand.includes(activeSupplier)
  const matchApp = (d) => !application || d.application === application
  const rows = designs.map((d, i) => ({ d, i })).filter(({ d }) => matchSupplier(d) && matchApp(d))

  const detail = designs[selected]
  const anyOverride = Object.values(overrides).some(Boolean)
  // SKU logic (decision 8 · S1): a SKU = Range acronym + design Code + ColorCode. Parse the acronym and
  // code from the design's first SKU, then GENERATE per-colour codes from those parts via buildSku.
  const { rangeAcronym, code } = parseSku(detail.colourways[0].sku)
  const prefix = `${rangeAcronym}-`
  const skuFmt = skuFormat({ rangeAcronym, code })
  // Website visibility (decision 2 · P5/P6): a product with a retail markup shows a public retail price;
  // one without (retailMarkup null) is trade-only and login-gated when shown. inHouse = Atelier's own.
  const shownRetail = showWeb && !!detail.retailMarkup
  const tradeOnly = showWeb && !detail.retailMarkup
  // Per-design variable/optional duty & retail markup, surfaced in the parameters drawer (P3/P6).
  const paramDisplay = (p) => {
    if (overrides[p.key]) return overrideValues[p.key]
    if (p.key === 'duty') return detail.duty ?? 'None'
    if (p.key === 'retail') return detail.retailMarkup ?? 'Trade-only'
    return overrideValues[p.key]
  }
  const narrow = useIsNarrow()

  return (
    <>
      <PageHeader
        eyebrow="Product Catalogue"
        title={<>Designs &amp; <Em>Colourways</Em></>}
      />
      <SectionTabs tabs={catalogueTabs} active="library" />

      <div
        style={{
          marginTop: 30,
          display: 'grid',
          gridTemplateColumns: narrow ? '1fr' : '196px minmax(0,1fr) 348px',
          gap: narrow ? 24 : 36,
          alignItems: 'start',
        }}
      >
        {/* ===== Filter rail ===== */}
        <aside>
          <div style={railLabel}>Supplier</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {SUPPLIER_DEFS.map((s) => {
              const isChildActive = s.children && s.children.includes(activeSupplier)
              const on = s.key === activeSupplier && !isChildActive
              const open = !!(s.children && expanded[s.key])
              return (
                <div key={s.key}>
                  <div
                    onClick={() => pickSupplier(s.key, !!s.children)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 0',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontFamily: font.ui,
                        color: on ? c.accent : c.inkSoft,
                        fontWeight: on ? 600 : 400,
                        borderBottom: `1.5px solid ${on ? c.accent : 'transparent'}`,
                        paddingBottom: 2,
                      }}
                    >
                      {s.name}
                    </span>
                    {s.children && (
                      <span style={{ fontFamily: font.mono, fontSize: 13, color: c.brass }}>
                        {open ? '–' : '+'}
                      </span>
                    )}
                  </div>
                  {open && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '2px 0 4px 12px',
                        borderLeft: `1px solid ${c.line}`,
                        marginLeft: 2,
                      }}
                    >
                      {s.children.map((child) => {
                        const con = child === activeSupplier
                        return (
                          <div
                            key={child}
                            onClick={() => pickSupplier(child, false)}
                            style={{ padding: '5px 0 5px 10px', cursor: 'pointer' }}
                          >
                            <span
                              style={{
                                fontSize: 12.5,
                                fontFamily: font.ui,
                                color: con ? c.accent : c.muted,
                                fontWeight: con ? 600 : 400,
                                borderBottom: `1.5px solid ${con ? c.accent : 'transparent'}`,
                                paddingBottom: 2,
                              }}
                            >
                              {child}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 26, borderTop: `1px solid ${c.line}`, paddingTop: 20 }}>
            <div style={{ ...railLabel, marginBottom: 13 }}>Application</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Upholstery', 'Drapery'].map((a) => {
                const on = application === a
                return (
                  <div
                    key={a}
                    onClick={() => pickApp(a)}
                    className="ab-t"
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${on ? c.accent : c.line}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: font.ui,
                      color: on ? c.accent : c.inkSoft,
                      background: on ? '#F3EADF' : 'transparent',
                    }}
                  >
                    {a}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 20 }}>
            <div style={{ ...railLabel, marginBottom: 13 }}>Composition</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COMPOSITIONS.map((comp) => (
                <div
                  key={comp}
                  style={{
                    padding: '5px 11px',
                    border: `1px solid ${c.line}`,
                    borderRadius: 4,
                    fontSize: 11.5,
                    fontFamily: font.ui,
                    color: c.inkSoft,
                  }}
                >
                  {comp}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ===== DataTable ===== */}
        <section
          style={{
            border: `1px solid ${c.line}`,
            borderRadius: 4,
            overflow: 'hidden',
            background: c.paper,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1.7fr 1.3fr 1fr auto',
              gap: 18,
              alignItems: 'center',
              padding: '12px 20px',
              background: c.surfaceDeep,
              borderBottom: `1px solid ${c.line}`,
            }}
          >
            <div />
            <div style={colHead}>Design</div>
            <div style={colHead}>Composition</div>
            <div style={colHead}>Application</div>
            <div style={{ ...colHead, textAlign: 'right' }}>Band · Indicative</div>
          </div>

          {rows.map(({ d, i }) => {
            const on = i === selected
            return (
              <div
                key={d.design + d.brand}
                onClick={() => pickDesign(i)}
                className="ab-t"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1.7fr 1.3fr 1fr auto',
                  gap: 18,
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderBottom: `1px solid ${c.line}`,
                  cursor: 'pointer',
                  background: on ? c.surface : 'transparent',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = c.surface }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}
              >
                <WeaveImage
                  img={d.img}
                  src={d.src}
                  tone={d.colourways[0].tone}
                  radius={4}
                  style={{ width: 48, height: 48, border: `1px solid ${c.line}` }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: font.display, fontSize: 16.5, color: c.ink }}>{d.design}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, fontFamily: font.ui, color: c.muted }}>
                    {d.brand} · {d.colourways.length} colourways
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}>{d.composition}</div>
                  <div style={{ marginTop: 3, fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                    {d.width}{d.rubs && d.rubs !== '—' ? ` · ${d.rubs} rubs` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: STATUS_DOT[d.statusTone] || c.muted,
                      flex: 'none',
                    }}
                  />
                  <span style={{ fontSize: 12, fontFamily: font.ui, color: c.inkSoft }}>{d.application}</span>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{d.priceBand}</div>
                  <div style={{ marginTop: 3, fontSize: 10, fontFamily: font.ui, color: c.muted }}>{d.status}</div>
                </div>
              </div>
            )
          })}
        </section>

        {/* ===== Detail drawer ===== */}
        <aside
          style={{
            border: `1px solid ${c.line}`,
            borderRadius: 4,
            background: c.surface,
            overflow: 'hidden',
            position: narrow ? 'static' : 'sticky',
            top: 20,
          }}
        >
          <WeaveImage
            img={detail.img}
            src={detail.src}
            tone={detail.colourways[0].tone}
            style={{ height: 128, borderBottom: `1px solid ${c.line}` }}
          />
          <div style={{ padding: '22px 22px 24px' }}>
            <div style={railLabel}>Design</div>
            <h2
              style={{
                margin: '7px 0 0',
                fontFamily: font.display,
                fontWeight: 500,
                fontSize: 24,
                lineHeight: 1.1,
                color: c.ink,
              }}
            >
              {detail.design}
            </h2>
            <div style={{ marginTop: 6, fontSize: 12.5, fontFamily: font.ui, color: c.muted }}>
              {detail.brand} · {detail.composition}
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {detail.inHouse && (
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.paper, background: c.accent, borderRadius: 4, padding: '3px 7px' }}>In-house</span>
              )}
              {detail.duty == null && (
                <span style={{ fontSize: 10, fontFamily: font.ui, color: c.sage, border: `1px solid ${c.line}`, borderRadius: 4, padding: '3px 7px' }}>No duty</span>
              )}
              {detail.retailMarkup == null && (
                <span style={{ fontSize: 10, fontFamily: font.ui, color: c.clay, border: `1px solid ${c.line}`, borderRadius: 4, padding: '3px 7px' }}>Trade-only</span>
              )}
            </div>

            <div style={{ ...railLabel, marginTop: 20, marginBottom: 13 }}>
              {detail.colourways.length} colourways
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {detail.colourways.map((w) => {
                const on = w.sku === selectedSku
                return (
                  <div
                    key={w.sku}
                    onClick={() => setSelectedSku(w.sku)}
                    className="ab-t"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 6,
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: on ? c.surfaceDeep : 'transparent',
                    }}
                  >
                    <Swatch tone={w.tone} size={34} selected={on} radius={5} />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 13, fontFamily: font.ui, color: c.ink, fontWeight: on ? 600 : 400 }}>
                        {w.name}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{w.sku}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 13,
                }}
              >
                <div style={railLabel}>Inherited parameters</div>
                <div style={{ fontSize: 10.5, fontFamily: font.ui, color: anyOverride ? c.accent : c.muted }}>
                  Mode: {anyOverride ? 'Manual' : 'Automatic'}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PARAM_DEFS.map((p) => {
                  // Masking outranks editing: an input hands over the very figure it is editing, so a
                  // login without FINANCE_VIEW never reaches the cost rates through the override either.
                  const masked = p.cost && !canFinance
                  if (masked || !canPrice) {
                    return (
                      <div key={p.key} style={readOnlyParam}>
                        <span style={{ fontSize: 11.5, fontFamily: font.ui, color: c.inkSoft }}>{p.label}</span>
                        {masked ? (
                          <MaskedFigure label="Cost" />
                        ) : (
                          <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.ink }}>
                            {paramDisplay(p)}
                          </span>
                        )}
                      </div>
                    )
                  }
                  const ov = !!overrides[p.key]
                  return (
                    <div
                      key={p.key}
                      onClick={() => toggleOverride(p.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '6px 10px',
                        border: `1px ${ov ? 'dashed' : 'solid'} ${ov ? c.brass : c.line}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: ov ? c.paper : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 11.5, fontFamily: font.ui, color: c.inkSoft }}>{p.label}</span>
                      {ov ? (
                        <input
                          value={overrideValues[p.key]}
                          onChange={(e) => editOverride(p.key, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`${p.label} — custom value`}
                          style={{
                            width: 52,
                            textAlign: 'right',
                            fontFamily: font.mono,
                            fontSize: 11.5,
                            color: c.accent,
                            border: `1px solid ${c.brass}`,
                            borderRadius: 4,
                            background: c.paper,
                            padding: '2px 6px',
                          }}
                        />
                      ) : (
                        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.ink }}>
                          {paramDisplay(p)}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontFamily: font.ui,
                          color: c.brass,
                        }}
                      >
                        {ov ? 'Custom' : 'Override'}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div
                style={{
                  marginTop: 9,
                  fontSize: 11,
                  color: c.muted,
                  fontStyle: 'italic',
                  fontFamily: font.display,
                }}
              >
                {canPrice
                  ? 'Tap a parameter to override per SKU.'
                  : 'Inherited from the range — per-SKU overrides are set by Finance.'}
              </div>
            </div>

            {/* Range code & website visibility (Workshop 30 Jun · decisions 2, 5, 8) */}
            <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
              <div style={railLabel}>Range code &amp; visibility</div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span title="Range code prefix — ensures unique item codes across ranges"
                  style={{ fontFamily: font.mono, fontSize: 12, color: c.brass, border: `1px solid ${c.line}`, borderRadius: 4, padding: '3px 8px' }}>Prefix {prefix}</span>
                <span style={{ fontSize: 11.5, fontFamily: font.ui, color: c.muted }}>
                  SKU format <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{skuFmt}</span>
                </span>
              </div>
              {/* SKU built from parts (S1): Range acronym + Code + ColorCode → e.g. the first colourway */}
              <div style={{ marginTop: 8, fontSize: 11, fontFamily: font.ui, color: c.muted }}>
                <span style={{ fontFamily: font.mono, color: c.brass }}>{rangeAcronym}</span> +{' '}
                <span style={{ fontFamily: font.mono, color: c.brass }}>{code}</span> +{' '}
                <span style={{ fontFamily: font.mono, color: c.brass }}>{colorCode(1)}</span> ⟶{' '}
                <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{buildSku({ rangeAcronym, code, colorCode: colorCode(1) })}</span>
              </div>
              {/* Codes are non-editable in the CRM (decision 5, 15 Jul) to keep Xero in sync. */}
              <div title="Codes are generated from Range acronym + design code + colour code — never hand-typed, to prevent Xero sync errors"
                style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: font.ui, color: c.muted, border: `1px solid ${c.line}`, borderRadius: 4, padding: '3px 8px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.brass }} />
                Locked · system-generated
              </div>

              {/* Retail-vs-trade-only turns on this box, which makes it a pricing decision, not a display one. */}
              {canPrice ? (
                <label style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showWeb} onChange={(e) => setShowWeb(e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: c.accent, cursor: 'pointer' }} />
                  <span style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}>Show on website</span>
                </label>
              ) : (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}>Show on website</span>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: showWeb ? c.accent : c.muted, border: `1px solid ${c.line}`, borderRadius: 4, padding: '2px 8px' }}>
                    {showWeb ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
              <div style={{ marginTop: 9, fontSize: 11, fontStyle: 'italic', fontFamily: font.display, color: showWeb ? c.accent : c.muted }}>
                {!showWeb
                  ? 'Hidden from the website.'
                  : shownRetail
                    ? `Shown on the website with a public retail price${detail.inHouse ? ' · in-house textile' : ''}.`
                    : 'No retail price set — treated as trade-only (login-gated in a later phase).'}
              </div>
            </div>

            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => navigate('/pricing')}
                className="ab-primary ab-t"
                style={{
                  height: 42,
                  borderRadius: 4,
                  fontFamily: font.ui,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Open in Pricing Engine
              </button>
              <button
                onClick={() => navigate('/sample-request')}
                className="ab-secondary ab-t"
                style={{
                  height: 40,
                  borderRadius: 4,
                  fontFamily: font.ui,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Request a sample
              </button>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Indicative />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

const railLabel = {
  fontFamily: font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: c.muted,
  marginBottom: 14,
}

// The read-only parameter reads as a settled fact, not a disabled control: same chip rhythm as the
// editable row, minus the affordances — no dashed brass, no cursor, no 'Override' tag to reach for.
const readOnlyParam = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '6px 10px',
  border: `1px solid ${c.line}`,
  borderRadius: 4,
}

const colHead = {
  fontFamily: font.ui,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: c.muted,
}
