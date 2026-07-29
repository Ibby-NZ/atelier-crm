import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { Em, Indicative, WeaveImage } from '../components/ui.jsx'
import { IconCart, IconLock, IconClose } from '../components/icons.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { storefront } from '../data/atelier.js'

// Tone + unit + chip palette per storefront sku (the data module maps the demo's
// invented goods onto real Atelier brands/designs; we add the colourway hue,
// retail-unit and chip strip locally so we never edit shared files).
const META = {
  'PF-MAD': { tone: ['#E6DAC2', '#C2AE86'], unit: '/m', kind: 'Fabric · by the metre', chips: ['#E6DAC2', '#7FA39A', '#D7B3AE', '#6E7681'] },
  'PF-ATL': { tone: ['#5C6B86', '#2C3A55'], unit: 'ea', kind: 'Cushion', chips: ['#E9DEC9', '#5C6B86', '#C98A5E', '#3A352F'] },
  'JT-PEA': { tone: ['#5E8F7A', '#2C5240'], unit: '/m', kind: 'Fabric · by the metre', chips: ['#5E8F7A', '#2C5240', '#D6C9AF'] },
  'LAR-WRT': { tone: ['#4A453E', '#1C1815'], unit: '/m', kind: 'Fabric · by the metre', chips: ['#4A453E', '#B7917A', '#E4C56A'] },
  'DK-PLD': { tone: ['#8A6326', '#544A40'], unit: 'ea', kind: 'Throw', chips: ['#DAD2BC', '#8A6326', '#2E2C28'] },
  'JT-WLF': { tone: ['#544A40', '#2A241E'], unit: 'ea', kind: 'Throw', chips: ['#E4DDCD', '#B98A4E', '#44506A'] },
}
const metaFor = (sku) => {
  const key = Object.keys(META).find((k) => sku && sku.startsWith(k))
  return META[key] || { tone: ['#CDBE9E', '#9C8A66'], unit: 'ea', kind: 'Finished good', chips: ['#D6C9AF', '#9C8A66'] }
}
const parseMoney = (s) => Number(String(s).replace(/[^0-9.]/g, '')) || 0
const money = (n) => 'NZ$' + n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Storefront() {
  const [mode, setMode] = useState('Retail')
  const [cartCount, setCartCount] = useState(2)
  const [cartOpen, setCartOpen] = useState(false)
  const [hovered, setHovered] = useState(null)

  const trade = mode === 'Trade'
  const toggleMode = () => setMode((m) => (m === 'Retail' ? 'Trade' : 'Retail'))
  const add = () => { setCartCount((n) => n + 1); setCartOpen(true) }

  const products = storefront.map((p) => {
    const m = metaFor(p.sku)
    const retailN = parseMoney(p.retail)
    return { ...p, ...m, retailN, tradeN: Math.round(retailN * 0.75 * 100) / 100 }
  })

  // cart — two lines priced to mode
  const cartRaw = [
    { name: 'Atlas — Indigo', sku: 'PF-ATL-04', qtyN: 14, unit: 'm', retail: 230.1, trade: 172.58, tone: ['#5C6B86', '#2C3A55'] },
    { name: 'Wright — Clay cushion', sku: 'LAR-WRT-03', qtyN: 2, unit: 'ea', retail: 320.0, trade: 240.0, tone: ['#B7917A', '#7C5645'] },
  ]
  const cartItems = cartRaw.map((ci) => {
    const price = trade ? ci.trade : ci.retail
    return { ...ci, qty: `${ci.qtyN} ${ci.unit}`, line: money(price * ci.qtyN) }
  })
  const sub = cartRaw.reduce((a, ci) => a + (trade ? ci.trade : ci.retail) * ci.qtyN, 0)
  const gst = sub * 0.15

  const pillBorder = trade ? c.accent : c.line
  const pillBg = trade ? '#F3EADF' : c.paper
  const pillDot = trade ? c.accent : c.muted
  const pillColor = trade ? c.accent : c.inkSoft

  return (
    <div style={{ minHeight: '100vh', background: c.paper, color: c.ink }}>
      {/* Sub-bar: pricing-mode pill + live cart, just under the shared editorial nav */}
      <div className="r-hero-pad" style={{ borderBottom: `1px solid ${c.line}`, padding: '18px 40px' }}>
        <div style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div onClick={toggleMode} className="ab-t" style={{
              display: 'flex', alignItems: 'center', gap: 9, height: 34, padding: '0 13px',
              border: `1px solid ${pillBorder}`, borderRadius: 18, cursor: 'pointer', background: pillBg,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: pillDot }} />
              <span style={{ fontFamily: font.ui, fontSize: 11.5, fontWeight: 500, color: pillColor }}>
                {trade ? 'Trade · Marlow & Finch' : 'Retail'}
              </span>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.muted }}>
              {trade ? 'Trade pricing & tools active' : 'Sign in for Trade pricing'}
            </span>
          </div>
          <div onClick={() => setCartOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <IconCart size={18} color={c.inkSoft} />
            <span style={{ fontFamily: font.mono, fontSize: 12, color: c.accent }}>{cartCount}</span>
          </div>
        </div>
      </div>

      <div className="r-hero-pad" style={{ maxWidth: 1380, margin: '0 auto', padding: '46px 56px 80px' }}>
        {/* PageHeader */}
        <div style={{ marginBottom: 38 }}>
          <div style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.muted }}>The Shop</div>
          <h1 className="r-hero-h1" style={{ margin: '14px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 44, lineHeight: 1.0, letterSpacing: '-0.02em', color: c.ink }}>
            Curated for the <Em>home</Em>
          </h1>
          <p style={{ margin: '14px 0 0', fontFamily: font.ui, fontSize: 14.5, color: c.muted }}>
            Finished goods and fabric by the metre — to trade and public.
          </p>
        </div>

        {/* Product grid */}
        <div className="r-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '44px 40px' }}>
          {products.map((p, i) => {
            const h = hovered === i
            return (
              <div key={p.sku + i}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                style={{ transition: 'transform .25s ease', transform: h ? 'translateY(-4px)' : 'translateY(0)' }}>
                <Link to="/product" style={{ textDecoration: 'none', display: 'block' }}>
                  <WeaveImage img={p.img} src={p.src} tone={p.tone} radius={4}
                    style={{
                      height: 300, border: `1px solid ${h ? c.brass : c.line}`,
                      boxShadow: h ? '0 16px 36px rgba(33,28,23,.13)' : 'none',
                      transition: 'border-color .25s ease, box-shadow .25s ease',
                    }} />
                </Link>
                <div style={{ padding: '15px 2px 0' }}>
                  <div style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>{p.kind}</div>
                  <div style={{ marginTop: 7, fontFamily: font.display, fontSize: 21, lineHeight: 1.1, color: c.ink }}>{p.name}</div>
                  <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11.5, color: c.muted }}>{p.brand}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>{p.sku}</span>
                  </div>
                  <div style={{ marginTop: 11, display: 'flex', gap: 6 }}>
                    {p.chips.map((ch, j) => (
                      <div key={j} style={{ width: 16, height: 16, borderRadius: 3, background: ch, border: `1px solid ${c.line}` }} />
                    ))}
                  </div>

                  {/* dual pricing */}
                  <div style={{ marginTop: 14, minHeight: 46 }}>
                    {!trade ? (
                      <div>
                        <div style={{ fontFamily: font.mono, fontSize: 14.5, color: c.ink }}>
                          {money(p.retailN)}<span style={{ fontSize: 11, color: c.muted }}> {p.unit}</span>
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <IconLock size={11} color={c.brass} />
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.muted }}>Trade · sign in to view</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
                          <span style={{ fontFamily: font.mono, fontSize: 15, color: c.accent }}>
                            {money(p.tradeN)}<span style={{ fontSize: 11, color: c.muted }}> {p.unit}</span>
                          </span>
                          <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, textDecoration: 'line-through' }}>{money(p.retailN)}</span>
                        </div>
                        <div style={{ marginTop: 3 }}>
                          <span style={{ fontFamily: font.ui, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted }}>Trade · </span>
                          <Indicative />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 13, display: 'flex', gap: 9 }}>
                    <button onClick={add} className="ab-t" style={{
                      height: 38, padding: '0 16px',
                      background: trade ? c.accent : c.paper,
                      color: trade ? c.paper : c.ink,
                      border: trade ? 'none' : `1px solid ${c.ink}`,
                      borderRadius: 3, fontFamily: font.ui, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                    }}>
                      {trade ? 'Add to schedule' : 'Add to cart'}
                    </button>
                    <Link to="/sample-request" style={{
                      height: 38, padding: '0 14px', display: 'flex', alignItems: 'center',
                      background: c.paper, color: c.ink, border: `1px solid ${c.line}`, borderRadius: 3,
                      fontFamily: font.ui, fontSize: 12.5, textDecoration: 'none', cursor: 'pointer',
                    }}>
                      Request sample
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <BrandFooter />

      {/* Cart slide-over / checkout glimpse */}
      {cartOpen && (
        <div onClick={() => setCartOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(33,28,23,.4)', zIndex: 70 }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 392, maxWidth: '100%',
        background: c.paper, borderLeft: `1px solid ${c.line}`, zIndex: 80,
        transform: cartOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .3s ease',
        display: 'flex', flexDirection: 'column',
        boxShadow: cartOpen ? '-18px 0 50px rgba(33,28,23,.16)' : 'none',
      }}>
        <div style={{ padding: '22px 24px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
              {trade ? 'Trade · ' : 'Retail · '}<Indicative />
            </div>
            <div style={{ fontFamily: font.display, fontSize: 21, color: c.ink, marginTop: 3 }}>Your selection</div>
          </div>
          <div onClick={() => setCartOpen(false)} style={{
            width: 30, height: 30, border: `1px solid ${c.line}`, borderRadius: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.muted,
          }}>
            <IconClose size={14} color={c.muted} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 24px' }}>
          {cartItems.map((ci, i) => (
            <div key={i} style={{ display: 'flex', gap: 13, padding: '16px 0', borderBottom: `1px solid ${c.line}` }}>
              <div style={{ width: 54, height: 54, flex: 'none', borderRadius: 4, background: weave(ci.tone[0], ci.tone[1]), border: `1px solid ${c.line}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{ci.name}</div>
                <div style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted, marginTop: 2 }}>{ci.sku} · {ci.qty}</div>
                <div style={{ fontFamily: font.mono, fontSize: 12.5, color: c.ink, marginTop: 7 }}>{ci.line}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px 24px', borderTop: `1px solid ${c.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.inkSoft }}>Subtotal</span>
            <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{money(sub)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.inkSoft }}>
              GST 15% <span style={{ fontSize: 10.5, color: c.muted }}>· reconciled to Xero</span>
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{money(gst)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 13, borderTop: `1px solid ${c.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>Total · </span>
              <Indicative />
            </div>
            <span style={{ fontFamily: font.display, fontWeight: 500, fontSize: 24, color: c.accent }}>{money(sub + gst)}</span>
          </div>

          <button className="ab-primary ab-t" style={{
            marginTop: 18, width: '100%', height: 46, background: c.accent, color: c.paper,
            border: 'none', borderRadius: 3, fontFamily: font.ui, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            Proceed to checkout
          </button>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.muted }}>Secured by</span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.inkSoft, border: `1px solid ${c.line}`, borderRadius: 3, padding: '4px 9px' }}>Stripe</span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.inkSoft, border: `1px solid ${c.line}`, borderRadius: 3, padding: '4px 9px' }}>Afterpay</span>
          </div>
        </div>
      </div>
    </div>
  )
}
