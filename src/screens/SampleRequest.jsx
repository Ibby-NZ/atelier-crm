import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { hero, clayItem, projectFolder } from '../data/atelier.js'
import { Eyebrow, Em, PrimaryButton, Swatch, Hairline } from '../components/ui.jsx'
import { BrandFooter } from '../components/layout.jsx'
import { IconClose, IconCheck, IconArrow } from '../components/icons.jsx'

// Items being requested — drawn from the real project folder, falling back to the hero pair.
const sourcePieces = (projectFolder.pieces && projectFolder.pieces.length
  ? projectFolder.pieces.slice(0, 3).map((p) => ({
      design: p.design,
      colourway: p.colourway,
      supplier: p.supplier,
      sku: p.sku,
      tone: p.tone,
    }))
  : [
      { design: hero.design, colourway: hero.colourways[hero.selected].name, supplier: hero.brand, sku: hero.colourways[hero.selected].sku, tone: hero.colourways[hero.selected].tone },
      { design: clayItem.design, colourway: clayItem.colourway, supplier: clayItem.brand, sku: clayItem.sku, tone: clayItem.tone },
    ])

// Local delivery detail — the recurring Marlow & Finch designer.
const delivery = {
  contact: 'Olivia Marlow',
  studio: 'Marlow & Finch Interiors',
  address: '14 Crummer Road, Ponsonby, Auckland 1021',
  method: 'Courier · 1–2 working days',
}

export default function SampleRequest() {
  const [items, setItems] = useState(sourcePieces)
  const [confirmed, setConfirmed] = useState(false)

  const remove = (i) => setItems((xs) => xs.filter((_, j) => j !== i))

  const container = { maxWidth: 760, margin: '0 auto', padding: '0 40px' }

  return (
    <div>
      {/* Sub-bar */}
      <div style={{ borderBottom: `1px solid ${c.line}` }}>
        <div className="r-hero-pad" style={{ ...container, padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>
            <Link to="/library" className="ab-link" style={{ color: c.muted }}>Library</Link> · Request samples
          </div>
          <Link to="/product" className="ab-link ab-t" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: c.inkSoft }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconArrow size={14} /></span>
            Keep browsing
          </Link>
        </div>
      </div>

      <div className="r-hero-pad" style={{ ...container, padding: '52px 40px 0' }}>
        {!confirmed ? (
          <>
            {/* Header */}
            <Eyebrow>Atelier Textiles · Sample service</Eyebrow>
            <h1 style={{ margin: '13px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 42, lineHeight: 1.06, letterSpacing: '-0.01em', color: c.ink }}>
              Request <Em>samples</Em>
            </h1>
            <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.6, color: c.muted, maxWidth: 480 }}>
              Cuttings are sent from the Parnell library to your studio — to be held, draped and lived with before you specify.
            </p>

            {/* Item list */}
            <div style={{ marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
                  Samples · {items.length}
                </div>
              </div>
              <Hairline style={{ marginTop: 12 }} />

              {items.length === 0 ? (
                <div style={{ padding: '34px 0', textAlign: 'center', fontSize: 14, color: c.muted }}>
                  No samples selected.{' '}
                  <Link to="/library" className="ab-link" style={{ color: c.accent }}>Return to the library</Link>.
                </div>
              ) : (
                items.map((it, i) => (
                  <div key={it.sku || i}>
                    <div className="ab-rowhover" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '17px 4px' }}>
                      <Swatch tone={it.tone} size={46} radius={5} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.display, fontSize: 18, color: c.ink, lineHeight: 1.2 }}>
                          {it.design} — {it.colourway}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12.5, color: c.muted }}>{it.supplier}</div>
                      </div>
                      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, flex: 'none' }}>{it.sku}</span>
                      <button onClick={() => remove(i)} title="Remove" className="ab-ghost ab-t"
                        style={{ flex: 'none', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${c.line}`, borderRadius: '50%', background: 'none', cursor: 'pointer' }}>
                        <IconClose size={13} color={c.muted} />
                      </button>
                    </div>
                    <Hairline />
                  </div>
                ))
              )}
            </div>

            {/* Delivery details */}
            <div style={{ marginTop: 38 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 14 }}>
                Delivery details
              </div>
              <div style={{ border: `1px solid ${c.line}`, borderRadius: 4, padding: '22px 24px', background: c.surface }}>
                <div style={{ fontFamily: font.display, fontSize: 17, color: c.ink }}>{delivery.contact}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: c.inkSoft }}>{delivery.studio}</div>
                <div style={{ marginTop: 12, fontSize: 13, color: c.muted, lineHeight: 1.55 }}>{delivery.address}</div>
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 12.5, color: c.muted }}>{delivery.method}</span>
                  <Link to="/account" className="ab-link" style={{ fontSize: 12.5, color: c.inkSoft, borderBottom: `1px solid ${c.line}`, paddingBottom: 1 }}>Change</Link>
                </div>
              </div>
            </div>

            {/* Confirm */}
            <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={() => setConfirmed(true)} style={{ opacity: items.length ? 1 : 0.45, pointerEvents: items.length ? 'auto' : 'none' }}>
                Confirm sample request
              </PrimaryButton>
              <span style={{ fontSize: 12.5, color: c.muted, maxWidth: 280, lineHeight: 1.5 }}>
                No charge for trade accounts. Cuttings remain Atelier property.
              </span>
            </div>
          </>
        ) : (
          /* Confirmation state */
          <div style={{ padding: '8px 0 12px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto', borderRadius: '50%', border: `1px solid ${c.line}`, background: c.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconCheck size={22} color={c.sage} />
            </div>
            <Eyebrow style={{ marginTop: 26 }}>Request received</Eyebrow>
            <h1 style={{ margin: '13px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 38, lineHeight: 1.1, letterSpacing: '-0.01em', color: c.ink }}>
              Your samples are <Em>on their way</Em>
            </h1>
            <p style={{ margin: '14px auto 0', fontSize: 14.5, lineHeight: 1.6, color: c.muted, maxWidth: 420 }}>
              {items.length} {items.length === 1 ? 'cutting is' : 'cuttings are'} being prepared in the Parnell library and dispatched to {delivery.studio}.
            </p>

            <div style={{ maxWidth: 440, margin: '32px auto 0', border: `1px solid ${c.line}`, borderRadius: 4, padding: '6px 22px', textAlign: 'left' }}>
              {items.map((it, i) => (
                <div key={it.sku || i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0' }}>
                    <Swatch tone={it.tone} size={30} radius={4} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: c.ink }}>
                      {it.design} — {it.colourway}
                      <span style={{ color: c.muted }}> · {it.supplier}</span>
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{it.sku}</span>
                  </div>
                  {i < items.length - 1 && <Hairline />}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 30 }}>
              <Link to="/samples" className="ab-link ab-t" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: c.accent, fontWeight: 500 }}>
                Track in Sample Tracking
                <IconArrow size={15} color={c.accent} />
              </Link>
            </div>
            <div style={{ marginTop: 16 }}>
              <Link to="/library" className="ab-link" style={{ fontSize: 12.5, color: c.muted }}>Back to the library</Link>
            </div>
          </div>
        )}
      </div>

      <BrandFooter />
    </div>
  )
}
