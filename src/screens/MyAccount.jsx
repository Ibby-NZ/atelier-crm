// My Account — brand-world signed-in trade portal (Olivia Marlow, Marlow & Finch Interiors).
import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { c, font, weave } from '../theme.js'
import { Em, SwatchStrip, StatusPill, Toast, Indicative, WeaveImage } from '../components/ui.jsx'
import { IconFile } from '../components/icons.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { projectFolder, tradeOrders, priceLists, clayItem } from '../data/atelier.js'

// Local price-list metadata (download format options + the "updated" stamp).
const priceListMeta = { updated: 'Updated 18 Jun 2026', formats: ['Excel', 'PDF'] }

export default function MyAccount() {
  const [toast, setToast] = useState(null)
  const tRef = useRef()

  const flash = (msg) => {
    setToast(msg)
    clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(null), 2600)
  }
  const download = (brand, fmt) => () => flash(`${brand} trade price list (${fmt}) — preparing download…`)

  // Colourways for the featured project's SwatchStrip — drawn from projectFolder.pieces.
  const projectColourways = projectFolder.pieces.map((p) => ({
    name: p.colourway, sku: p.sku, tone: p.tone,
  }))

  const sectionLabel = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
    textTransform: 'uppercase', color: c.muted, fontFamily: font.ui,
  }
  const panel = { border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }
  const panelHead = {
    padding: '18px 22px', borderBottom: `1px solid ${c.line}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }

  return (
    <div style={{ background: c.paper, color: c.ink, minHeight: '100vh' }}>

      {/* Sub-bar: signed-in identity row, under the shared editorial nav */}
      <div style={{ borderBottom: `1px solid ${c.line}`, background: c.paper }}>
        <div className="r-hero-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px' }}>
          <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <span style={sectionLabel}>Trade Account</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: c.ink }}>Olivia Marlow</div>
                <div style={{ fontSize: 10.5, color: c.muted }}>Marlow &amp; Finch Interiors</div>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.surfaceDeep, border: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.display, fontSize: 15, color: c.inkSoft }}>O</div>
              <Link to="/storefront" className="ab-link ab-t" style={{ fontSize: 11.5, color: c.muted, textDecoration: 'none', borderLeft: `1px solid ${c.line}`, paddingLeft: 14 }}>Sign out</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="r-hero-pad" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 40px' }}>

        {/* PageHeader */}
        <div style={{ margin: '46px 0 40px' }}>
          <div style={sectionLabel}>Trade Account</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 42, lineHeight: 1.0, letterSpacing: '-0.02em', color: c.ink }}>
            Welcome back, <Em>Olivia</Em>
          </h1>
          <p style={{ margin: '13px 0 0', fontSize: 14.5, color: c.muted }}>
            Your trade pricing is unlocked across the full catalogue.
          </p>
        </div>

        <div className="r-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, alignItems: 'start' }}>

          {/* Projects */}
          <section style={panel}>
            <div style={panelHead}>
              <span style={sectionLabel}>Projects</span>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>2 active</span>
            </div>

            <Link to="/project" className="ab-rowhover ab-t" style={{ display: 'flex', gap: 16, padding: '20px 22px', borderBottom: `1px solid ${c.line}`, textDecoration: 'none' }}>
              <WeaveImage img={projectFolder.pieces[0].img} src={projectFolder.pieces[0].src}
                tone={projectFolder.pieces[0].tone}
                style={{ width: 84, height: 84, flex: 'none', border: `1px solid ${c.line}` }} radius={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.display, fontSize: 19, color: c.ink }}>Project {projectFolder.name}</div>
                <div style={{ marginTop: 5, fontSize: 11.5, color: c.muted }}>
                  {projectFolder.pieces.length} items · last edited {projectFolder.lastEdited}
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ pointerEvents: 'none' }}>
                    <SwatchStrip colourways={projectColourways} selected={-1} size={18} />
                  </div>
                  <span style={{ fontSize: 11.5, color: c.accent, borderBottom: `1px solid ${c.accent}`, whiteSpace: 'nowrap' }}>Open project →</span>
                </div>
              </div>
            </Link>

            <Link to="/collections" className="ab-rowhover ab-t" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', textDecoration: 'none' }}>
              <div style={{ width: 60, height: 60, flex: 'none', borderRadius: 4, border: `1px solid ${c.line}`, background: weave('#9FB0BE', '#6E7681') }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.display, fontSize: 17, color: c.ink }}>Coastal Neutrals</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: c.muted }}>Saved board · 8 items</div>
              </div>
              <span style={{ fontSize: 11.5, color: c.muted }}>Open →</span>
            </Link>
          </section>

          {/* Recent orders */}
          <section style={panel}>
            <div style={panelHead}>
              <span style={sectionLabel}>Recent orders</span>
              <span style={{ fontSize: 10.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Synced with back office</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, padding: '10px 22px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }}>Order</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, textAlign: 'right' }}>Cloth</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, width: 116, textAlign: 'right' }}>Status</span>
            </div>
            {tradeOrders.map((o) => (
              <div key={o.number} className="ab-rowhover ab-t" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', padding: '15px 22px', borderBottom: `1px solid ${c.line}`, cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>{o.number}</div>
                  <div style={{ marginTop: 3, fontFamily: font.display, fontSize: 15, color: c.ink }}>{o.design}</div>
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink, textAlign: 'right' }}>{o.qty}</span>
                <span style={{ width: 116, display: 'flex', justifyContent: 'flex-end' }}>
                  <StatusPill tone={o.tone}>{o.status}</StatusPill>
                </span>
              </div>
            ))}
          </section>

          {/* Samples */}
          <section style={panel}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${c.line}` }}>
              <span style={sectionLabel}>Samples</span>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${c.line}` }}>
              <WeaveImage img={clayItem.img} src={clayItem.src} tone={clayItem.tone}
                style={{ width: 52, height: 52, flex: 'none', border: `1px solid ${c.line}` }} radius={5} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.display, fontSize: 16, color: c.ink }}>{clayItem.design} — {clayItem.colourway}</div>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, marginTop: 3 }}>{clayItem.sku} · out 12 days</div>
              </div>
              <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.clay, border: '1px solid #E2C9B8', borderRadius: 3, padding: '5px 10px' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.clay }} />Return due in 2 days
              </span>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 12.5, color: c.muted }}>Keep your library moving — request the next set.</span>
              <Link to="/sample-request" className="ab-primary ab-t" style={{ flex: 'none', display: 'flex', alignItems: 'center', height: 42, padding: '0 20px', borderRadius: 3, textDecoration: 'none', fontFamily: font.ui, fontSize: 13, fontWeight: 500 }}>
                Request samples
              </Link>
            </div>
          </section>

          {/* Price lists */}
          <section style={panel}>
            <div style={panelHead}>
              <span style={sectionLabel}>Price lists</span>
              <span style={{ fontSize: 10.5, color: c.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{priceListMeta.updated} · <Indicative /></span>
            </div>
            {priceLists.map((b) => (
              <div key={b.brand} className="ab-rowhover ab-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 22px', borderBottom: `1px solid ${c.line}` }}>
                <span style={{ fontSize: 13.5, color: c.ink }}>{b.brand}</span>
                <div style={{ display: 'flex', gap: 9 }}>
                  {priceListMeta.formats.map((fmt) => (
                    <button key={fmt} type="button" onClick={download(b.brand, fmt)} title={fmt} className="ab-t"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', border: `1px solid ${c.line}`, borderRadius: 3, cursor: 'pointer', background: 'none' }}>
                      <IconFile size={14} color={c.brass} />
                      <span style={{ fontSize: 11, color: c.inkSoft, fontFamily: font.ui }}>{fmt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ padding: '14px 22px', fontSize: 11.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
              Excel lists prepared for accounts that price in spreadsheet — including McKenzie &amp; Willis.
            </div>
          </section>

        </div>
      </div>

      <BrandFooter />

      {toast && (
        <Toast>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.sage }} />
          {toast}
        </Toast>
      )}
    </div>
  )
}
