import { useState } from 'react'
import { c, font } from '../theme.js'
import { Eyebrow, Em, Indicative } from '../components/ui.jsx'
import { pricing, hero } from '../data/atelier.js'
import { computeWaterfall as computeWF, canonical, pricingInputs, nzd, plain } from '../data/pricing.js'
import { fxTable, fxCurrencies, nzdMultiplier, FX_SET_ON, FX_REVIEW_NOTE } from '../data/fx.js'
import { useIsNarrow } from '../hooks/useIsNarrow.js'

const asPct = (s) => (parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0) / 100
const asMult = (s) => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0

// Product-type markups (Action src #12): one range can carry several retail markups by product type.
// The selected type sets the range's Retail markup, which drives step 6 of the waterfall live.
const PRODUCT_TYPES = pricing.productTypeMarkups || []
const DEFAULT_PRODUCT_TYPE = ((PRODUCT_TYPES.find((p) => p.default) || PRODUCT_TYPES[0] || {}).type) || ''

// Map the (editable) range parameters onto the shared cost-plus waterfall and compute live. Forex
// margin (P1) and supplier discount (P2) are genuine inputs; `tradeMode` selects the trade-markup
// basis — a percentage of cost or a flat dollar value add (P7). Figures are indicative.
function waterfall(v, tradeMode, freightMode) {
  const r = computeWF({
    wholesaleForeign: pricingInputs.wholesaleForeign,
    currency: pricingInputs.currency,
    forexMargin: asPct(v['Forex margin']),
    supplierDiscount: asPct(v['Supplier discount']),
    freight: asPct(v['Freight']),
    freightDollar: asMult(v['Freight']),
    freightMode,
    clearance: asPct(v['Clearance']),
    duty: asPct(v['Duty']),
    handling: pricingInputs.handling,
    retailMarkup: asMult(v['Retail markup']),
    tradeMarkup: asPct(v['Trade markup']),
    tradeMarkupDollar: asMult(v['Trade markup']),
    tradeMarkupMode: tradeMode,
    tiers: pricingInputs.tiers,
  })
  return {
    1: nzd(r.wholesale),
    2: nzd(r.supplierDiscounted),
    3: nzd(r.priceExDuty),
    4: nzd(r.cogs),
    5: nzd(r.landed),
    6: r.retail == null ? '—' : nzd(r.retail),
    7: nzd(r.trade),
    8: nzd(r.tier1) + ' / ' + plain(r.tier2),
  }
}

// Publish review gate — indicative before/after trade prices across the range's colourways,
// derived from the canonical Trade Sell so they cascade with the waterfall.
const changes = hero.colourways.map((cw, i) => {
  const to = canonical.trade + (i >= 3 ? 5.4 : 0)
  return { name: cw.name, sku: cw.sku, from: nzd(to - 4.05), to: nzd(to) }
})

export default function PricingEngine() {
  const [mode, setMode] = useState('Automatic')
  const [hovered, setHovered] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [paramValues, setParamValues] = useState(() =>
    Object.fromEntries(pricing.params.map((p) => [p.label, p.value]))
  )
  const [productType, setProductType] = useState(DEFAULT_PRODUCT_TYPE)
  // Trade markup basis (P7): percentage of cost, or a flat dollar value add.
  const [tradeMode, setTradeMode] = useState('percent')
  // Freight basis (decision 1, 15 Jul): a % of the supplier-discounted price, or a flat $/metre.
  const [freightMode, setFreightMode] = useState('percent')
  const manual = mode === 'Manual'

  // Automatic derives values live from the range; Manual unlocks them for per-range overrides.
  function selectMode(next) {
    setMode(next)
    setReviewOpen(false)
    if (next === 'Automatic') {
      setParamValues(Object.fromEntries(pricing.params.map((p) => [p.label, p.value])))
      setProductType(DEFAULT_PRODUCT_TYPE)
      setTradeMode('percent')
      setFreightMode('percent')
    }
  }
  const editParam = (label, value) => setParamValues((s) => ({ ...s, [label]: value }))

  // Picking a product type sets the range's Retail markup to that type's rate — recomputes the waterfall.
  function selectProductType(type) {
    const pt = PRODUCT_TYPES.find((p) => p.type === type)
    setProductType(type)
    if (pt) editParam('Retail markup', pt.markup)
  }

  // Switching the trade-markup basis resets the Trade markup field to that mode's default.
  function selectTradeMode(next) {
    setTradeMode(next)
    editParam('Trade markup', next === 'dollar' ? `$${pricingInputs.tradeMarkupDollar}` : '55%')
  }
  // Switching the freight basis resets the Freight field to that mode's default ($30/m or 8%).
  function selectFreightMode(next) {
    setFreightMode(next)
    editParam('Freight', next === 'dollar' ? `$${pricingInputs.freightDollar}` : '8%')
  }
  const wf = waterfall(paramValues, tradeMode, freightMode)
  const narrow = useIsNarrow()

  const subject = pricing.subject
  const modeNote = manual
    ? 'Parameters unlocked — edit to override'
    : 'Derived live from range parameters'

  return (
    <>
      {/* PageHeader + Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Pricing Engine</Eyebrow>
          <h1 style={{ margin: '13px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 42, lineHeight: 1.04, letterSpacing: '-0.015em', color: c.ink }}>
            The <Em>Waterfall</Em>
          </h1>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: font.display, fontSize: 16, color: c.inkSoft }}>{subject.brand} · Range “{subject.range}”</span>
            {subject.prefix && (
              <span title="Range code prefix — ensures unique item codes across ranges"
                style={{ fontFamily: font.mono, fontSize: 12, color: c.brass, border: `1px solid ${c.line}`, borderRadius: 3, padding: '3px 8px' }}>Prefix {subject.prefix}</span>
            )}
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.brass }} />
            <span style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 17, color: c.ink }}>{subject.design} — {subject.colourway}</span>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted, border: `1px solid ${c.line}`, borderRadius: 3, padding: '3px 8px' }}>{subject.sku}</span>
          </div>
        </div>

        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted, marginBottom: 9 }}>Mode</div>
          <div style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.paper }}>
            {['Automatic', 'Manual'].map((label) => {
              const on = label === mode
              return (
                <button key={label} onClick={() => selectMode(label)} className="ab-t"
                  style={{ border: 'none', cursor: 'pointer', padding: '9px 18px', fontFamily: font.ui, fontSize: 12.5, fontWeight: 500, background: on ? c.accent : 'transparent', color: on ? c.paper : c.inkSoft }}>
                  {label}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 9, fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>{modeNote}</div>
        </div>
      </div>

      {/* Waterfall + Rail */}
      <div id="pe-grid" style={{ marginTop: 38, display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 322px', gap: narrow ? 32 : 48, alignItems: 'start' }}>

        {/* Waterfall */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <Eyebrow>Cost-plus waterfall</Eyebrow>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>Per metre · Indicative</div>
          </div>
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {pricing.steps.map((r, i) => {
              const key = !!r.key
              const hot = hovered === i
              const rowBg = hot ? c.surface : (key ? '#F3EADF' : 'transparent')
              return (
                <div key={r.n} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                  style={{ position: 'relative', display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 18, alignItems: 'center', padding: '16px 12px', borderBottom: `1px solid ${c.line}`, background: rowBg, transition: 'background .15s' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 12, color: c.brass }}>{String(r.n).padStart(2, '0')}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: font.display, fontSize: key ? 20 : 16, fontWeight: key ? 600 : 500, color: c.ink }}>{r.name}</div>
                    <div style={{ marginTop: 4, fontFamily: font.mono, fontSize: 12, color: c.muted }}>{r.op}</div>
                  </div>
                  <div style={{ fontFamily: font.mono, fontWeight: 500, fontSize: key ? 24 : 18, color: key ? c.accent : c.ink, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {wf[r.n]}<span style={{ color: c.muted, fontSize: 11 }}> /m</span>
                  </div>
                  {hot && (
                    <div style={{ position: 'absolute', left: 44, top: '100%', transform: 'translateY(-4px)', zIndex: 20, background: c.ink, color: c.paper, padding: '9px 13px', borderRadius: 4, maxWidth: 340, boxShadow: '0 8px 24px rgba(33,28,23,.18)' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.brass, marginBottom: 4 }}>Formula</div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: c.surface, fontFamily: font.mono }}>{r.op}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Range Parameters rail */}
        <aside style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 4, padding: '22px 22px 24px' }}>
          <Eyebrow>Range parameters</Eyebrow>
          <div style={{ marginTop: 6, fontFamily: font.display, fontStyle: 'italic', fontSize: 14, color: c.inkSoft }}>{pricing.inheritNote}</div>

          {/* Product-type markups (Action src #12) — a range holds several retail markups by product type. */}
          {PRODUCT_TYPES.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted, marginBottom: 10 }}>Product-type markup</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {PRODUCT_TYPES.map((pt) => {
                  const on = pt.type === productType
                  return (
                    <button key={pt.type} onClick={() => selectProductType(pt.type)} className="ab-t"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', border: `1px solid ${on ? c.accent : c.line}`, borderRadius: 3, background: on ? '#F3EADF' : c.paper, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, color: on ? c.accent : c.inkSoft, fontWeight: on ? 600 : 400 }}>{pt.type}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: c.muted, marginTop: 1 }}>{pt.note}</span>
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 13, color: on ? c.accent : c.ink, flex: 'none' }}>{pt.markup}</span>
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: 9, fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Retail markup varies by product type within the range.</div>
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {pricing.params.map((p) => (
              <div key={p.label} className="ab-t"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', border: `1px ${manual ? 'dashed' : 'solid'} ${manual ? c.brass : c.line}`, borderRadius: 3, background: manual ? c.paper : 'transparent' }}>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>
                  {p.label}
                  {p.label === 'Retail markup' && productType && <span style={{ color: c.muted }}> · {productType}</span>}
                  {p.label === 'Trade markup' && <span style={{ color: c.muted }}> · {tradeMode === 'dollar' ? '$/m add' : '% of cost'}</span>}
                  {p.label === 'Freight' && <span style={{ color: c.muted }}> · {freightMode === 'dollar' ? '$/m' : '%'}</span>}
                </span>
                {manual ? (
                  <input
                    value={paramValues[p.label]}
                    onChange={(e) => editParam(p.label, e.target.value)}
                    aria-label={`${p.label} — override`}
                    style={{ width: 72, textAlign: 'right', fontFamily: font.mono, fontSize: 13, color: c.accent, border: `1px solid ${c.brass}`, borderRadius: 3, background: c.paper, padding: '4px 8px' }}
                  />
                ) : (
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{paramValues[p.label]}</span>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 9, fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
            Supplier discount defaults to the supplier's averaged rate (9 Jul rule) — JV excluded, per-brand.
          </div>

          {/* FX table (A9): annual per-currency rates in both conventions — actual (foreign per NZ$1) and CRM. */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted, marginBottom: 4 }}>FX table · set {FX_SET_ON}</div>
            <div style={{ fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display, marginBottom: 10 }}>{FX_REVIEW_NOTE} · both conventions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {fxCurrencies.map((code) => {
                const f = fxTable[code]
                const on = code === pricingInputs.currency
                return (
                  <div key={code}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', border: `1px solid ${c.line}`, borderLeft: `2px solid ${on ? c.accent : c.line}`, borderRadius: 3, background: on ? '#F3EADF' : 'transparent' }}>
                    <span style={{ fontSize: 12.5, color: on ? c.accent : c.inkSoft, fontWeight: on ? 600 : 400 }}>
                      {f.symbol} <span style={{ fontFamily: font.mono, fontSize: 11 }}>{code}</span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontFamily: font.mono, fontSize: 12, color: c.ink }}>{f.actual} /NZ$ · CRM {f.crm}</span>
                      <span style={{ display: 'block', fontFamily: font.mono, fontSize: 10.5, color: c.muted, marginTop: 1 }}>NZ${nzdMultiplier(code).toFixed(4)} / {f.symbol}1 incl. margin</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Trade markup basis (P7): percentage of cost or a flat dollar value add. */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Trade markup basis</span>
            <div style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.paper }}>
              {[{ k: 'percent', t: '% of cost' }, { k: 'dollar', t: '$ value add' }].map((o) => {
                const on = o.k === tradeMode
                return (
                  <button key={o.k} onClick={() => selectTradeMode(o.k)} className="ab-t"
                    style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontFamily: font.ui, fontSize: 11.5, fontWeight: 500, background: on ? c.accent : 'transparent', color: on ? c.paper : c.inkSoft }}>
                    {o.t}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Freight basis (decision 1, 15 Jul): a % of the discounted price, or a flat $/metre value. */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 11, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Freight basis</span>
            <div style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.paper }}>
              {[{ k: 'percent', t: '% of price' }, { k: 'dollar', t: '$ per metre' }].map((o) => {
                const on = o.k === freightMode
                return (
                  <button key={o.k} onClick={() => selectFreightMode(o.k)} className="ab-t"
                    style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontFamily: font.ui, fontSize: 11.5, fontWeight: 500, background: on ? c.accent : 'transparent', color: on ? c.paper : c.inkSoft }}>
                    {o.t}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted, marginBottom: 14 }}>{hero.design} · 6 colourways</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
              {hero.colourways.map((s, i) => {
                const on = i === hero.selected
                return (
                  <div key={s.sku} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 5, background: `linear-gradient(135deg, ${s.tone[0]}, ${s.tone[1]})`, border: `1px solid ${c.line}`, boxShadow: on ? `0 0 0 2px ${c.accent}` : 'none' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: on ? c.ink : c.inkSoft, fontWeight: on ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontFamily: font.mono, fontSize: 10, color: c.muted }}>{s.sku}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Harder cases */}
      <div style={{ marginTop: 52, border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px', borderBottom: `1px solid ${c.line}`, background: c.surface }}>
          <Eyebrow>The exceptions</Eyebrow>
          <h2 style={{ margin: '8px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 25, color: c.ink }}>
            Harder cases, <Em>handled</Em>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr 1fr' }}>
          <div style={{ padding: '24px 28px', borderRight: narrow ? 'none' : `1px solid ${c.line}`, borderBottom: narrow ? `1px solid ${c.line}` : 'none' }}>
            <div style={{ fontFamily: font.display, fontSize: 17, color: c.ink }}>Pierre Frey · Atlas</div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: c.muted }}>{pricing.harderCases.tiersTitle}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pricing.harderCases.tiers.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', border: `1px solid ${c.line}`, borderRadius: 3 }}>
                  <span style={{ fontSize: 13, color: c.inkSoft }}>{t.name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{t.pct}</span>
                </div>
              ))}
            </div>
          </div>

          {/* JV — the per-brand + compounded exception the current CRM cannot model (9 Jul). */}
          <div style={{ padding: '24px 28px', borderRight: narrow ? 'none' : `1px solid ${c.line}`, borderBottom: narrow ? `1px solid ${c.line}` : 'none' }}>
            <div style={{ fontFamily: font.display, fontSize: 17, color: c.ink }}>Janelli Volpi</div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: c.muted }}>{pricing.harderCases.jvTitle}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pricing.harderCases.jv.tiers.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', border: `1px solid ${c.line}`, borderRadius: 3 }}>
                  <span style={{ fontSize: 13, color: c.inkSoft }}>{t.name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, flex: 'none' }}>{t.pct}</span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: c.inkSoft, padding: '2px 2px 0' }}>{pricing.harderCases.jv.sisters}</div>
              <div style={{ padding: '11px 14px', border: `1px solid ${c.line}`, borderRadius: 3, background: '#F3EADF' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13, color: c.ink, fontWeight: 600 }}>{pricing.harderCases.jv.fabrics.name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.accent, flex: 'none' }}>{pricing.harderCases.jv.fabrics.chain}</span>
                </div>
                <div style={{ marginTop: 5, fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>{pricing.harderCases.jv.fabrics.example}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '24px 28px' }}>
            <div style={{ fontFamily: font.display, fontSize: 17, color: c.ink }}>Fabricut</div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: c.muted }}>{pricing.harderCases.houseTitle}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pricing.harderCases.fabricut.map((b) => (
                <div key={b.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', border: `1px solid ${c.line}`, borderRadius: 3 }}>
                  <span style={{ fontSize: 13, color: c.inkSoft }}>{b.name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{b.markup}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer publish gate */}
      <div style={{ marginTop: 36, borderTop: `1px solid ${c.line}`, paddingTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: c.muted }}>
          <span style={{ fontFamily: font.mono, color: c.inkSoft }}>{pricing.reviewCount}</span> prices recalculated across the range · awaiting publish
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setReviewOpen((v) => !v)} className="ab-t"
            style={{ height: 40, padding: '0 18px', background: c.paper, color: c.ink, border: `1px solid ${c.ink}`, borderRadius: 3, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {reviewOpen ? 'Hide review' : `Review ${pricing.reviewCount} changes before publish`}
          </button>
          <button disabled={!reviewOpen} className={reviewOpen ? 'ab-primary ab-t' : 'ab-t'}
            style={{ height: 40, padding: '0 22px', background: reviewOpen ? c.accent : c.surfaceDeep, color: reviewOpen ? c.paper : c.muted, border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 500, cursor: reviewOpen ? 'pointer' : 'not-allowed' }}>
            Publish stock prices
          </button>
        </div>
      </div>

      {reviewOpen && (
        <div style={{ marginTop: 18, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '20px 24px' }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Eyebrow>Review {pricing.reviewCount} changes</Eyebrow>
            <Indicative />
          </div>
          <div style={{ borderTop: `1px solid ${c.line}` }}>
            {changes.map((ch) => (
              <div key={ch.sku} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 18, alignItems: 'center', padding: '11px 4px', borderBottom: `1px solid ${c.line}` }}>
                <span style={{ fontSize: 13, color: c.ink }}>{ch.name} <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{ch.sku}</span></span>
                <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted, textDecoration: 'line-through' }}>{ch.from}</span>
                <span style={{ color: c.brass }}>→</span>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: c.accent }}>{ch.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
