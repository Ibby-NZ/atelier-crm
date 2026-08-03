// Product Page — brand-world editorial hero for Pierre Frey · Atlas (the `hero` design).
// Mirrors design_handoff "Product Page.dc.html": breadcrumb, two-column hero with weave-macro
// image + colourway select, signed-in trade price block, spec sheet, tags, "In this room" band.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { hero } from '../data/atelier.js'
import { canonical, nzd } from '../data/pricing.js'
import { PrimaryButton, SecondaryButton, WeaveImage, Indicative } from '../components/ui.jsx'
import { BrandFooter } from '../components/layout.jsx'

// Trade / retail figures (indicative) — from the pricing waterfall for Atlas · Indigo.
const TRADE = nzd(canonical.trade)
const RETAIL = nzd(canonical.retail)

// Spec rows mapped from the real `hero` object.
const specsLeft = [
  { label: 'Composition', value: hero.composition },
  { label: 'Width', value: hero.width },
  { label: 'Application', value: hero.application },
  { label: 'Martindale', value: `${hero.rubs} rubs` },
]
const specsRight = [
  { label: 'Origin', value: 'Paris, France' },
  { label: 'Lead time', value: '4–6 weeks' },
  // Technical product fields from the 15 Jul template expansion (fall back to 'Plain' when absent).
  { label: 'Repeat', value: hero.repeat || 'Plain' },
  ...(hero.verticalRepeat ? [{ label: 'Vertical repeat', value: hero.verticalRepeat }] : []),
  ...(hero.patternMatch ? [{ label: 'Pattern match', value: hero.patternMatch }] : []),
]
const tags = ['Viscose blend', 'Upholstery & drapery', 'Heavy weight', 'FR treatable', '6 colourways']

export default function ProductPage() {
  const [selected, setSelected] = useState(hero.selected ?? 0)
  const [signedIn, setSignedIn] = useState(true)
  const [saved, setSaved] = useState(false)

  const cw = hero.colourways
  const sel = cw[selected]
  const accountLabel = signedIn ? 'Olivia · Marlow & Finch' : 'Sign in · Trade'

  return (
    <div style={{ background: c.paper, color: c.ink, fontFamily: font.ui }}>
      {/* sub-bar: account toggle (sits just under shared brand nav) */}
      <div style={{ borderBottom: `1px solid ${c.line}`, padding: '0 40px' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '12px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <span
            onClick={() => setSignedIn(v => !v)}
            className="ab-t"
            style={{ fontSize: 12, letterSpacing: '0.06em', color: c.inkSoft, cursor: 'pointer', borderBottom: `1px solid ${c.line}`, paddingBottom: 2 }}>
            {accountLabel}
          </span>
        </div>
      </div>

      <div className="r-hero-pad" style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 40px 0' }}>
        {/* breadcrumb */}
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>
          <Link to="/library" className="ab-link" style={{ color: c.muted }}>Library</Link> · {hero.brand} · {hero.design}
        </div>

        {/* Hero two-column */}
        <div className="r-pp-hero" style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1.08fr 1fr', gap: 56, alignItems: 'start' }}>
          {/* hero image */}
          <div style={{ position: 'relative' }}>
            <WeaveImage
              img={hero.img} src={hero.src} tone={sel.tone}
              style={{ height: 560, border: `1px solid ${c.line}` }} radius={4} />
            <div style={{ position: 'absolute', left: 16, top: 16, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(247,242,233,.82)', background: 'rgba(51,49,43,.28)', borderRadius: 4, padding: '6px 10px' }}>
              Weave macro · {sel.name}
            </div>
          </div>

          {/* detail column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, letterSpacing: '0.1em', color: c.inkSoft }}>{hero.brand} — {hero.country}</span>
              <Link to="/journal" style={{ fontSize: 12, color: c.brass, textDecoration: 'none', borderBottom: `1px solid ${c.brass}`, paddingBottom: 1 }}>
                Read the house story
              </Link>
            </div>

            <h1 className="r-hero-h1" style={{ margin: '14px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 46, lineHeight: 1.0, letterSpacing: '-0.02em', color: c.ink }}>{hero.design}</h1>
            <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.65, color: c.muted, maxWidth: 440 }}>{hero.story}</p>

            {/* selected colourway name */}
            <div style={{ marginTop: 30, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted }}>
                Colourway — <span style={{ color: c.ink }}>{sel.name}</span>
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>{sel.sku}</span>
            </div>

            {/* SwatchStrip — selecting swaps hero tone + name + SKU */}
            <div style={{ marginTop: 14, display: 'flex', gap: 14 }}>
              {cw.map((w, i) => {
                const on = i === selected
                return (
                  <div key={w.sku} onClick={() => setSelected(i)} className="ab-t" style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: `linear-gradient(135deg, ${w.tone[0]}, ${w.tone[1]})`, border: `1px solid ${c.line}`, boxShadow: on ? `0 0 0 2px ${c.accent}` : 'none' }} />
                    <div style={{ marginTop: 7, fontFamily: font.mono, fontSize: 9.5, color: on ? c.ink : c.muted }}>
                      {w.sku.replace('PF-ATL-', '·')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* price block */}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${c.line}` }}>
              {signedIn ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }}>
                    <span>Trade</span><Indicative style={{ fontSize: 10 }} />
                  </div>
                  <div style={{ marginTop: 11, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: font.mono, fontWeight: 500, fontSize: 30, color: c.accent }}>
                      {TRADE}<span style={{ fontSize: 15, color: c.muted }}> /m</span>
                    </span>
                    <span style={{ fontFamily: font.mono, fontSize: 15, color: c.muted, textDecoration: 'line-through' }}>{RETAIL}</span>
                    <span style={{ fontSize: 11, color: c.muted }}>retail</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: c.inkSoft }}>Trade pricing held for account holders.</span>
                  <span onClick={() => setSignedIn(true)} style={{ fontSize: 13, color: c.accent, cursor: 'pointer', borderBottom: `1px solid ${c.accent}` }}>
                    Sign in for Trade pricing
                  </span>
                </div>
              )}
            </div>

            {/* CTAs */}
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <Link to="/sample-request" style={{ textDecoration: 'none' }}>
                <PrimaryButton style={{ height: 46, padding: '0 24px', fontSize: 14 }}>Request a sample</PrimaryButton>
              </Link>
              <SecondaryButton
                onClick={() => setSaved(v => !v)}
                style={{ height: 46, padding: '0 22px', border: `1px solid ${c.ink}`, background: saved ? c.surfaceDeep : c.paper }}>
                {saved ? 'Saved to project ✓' : 'Save to project'}
              </SecondaryButton>
            </div>
          </div>
        </div>

        {/* Spec sheet */}
        <div className="r-pp-spec" style={{ marginTop: 64, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 56px' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 6 }}>Specification</div>
            {specsLeft.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderBottom: `1px solid ${c.line}` }}>
                <span style={{ fontSize: 13, color: c.muted }}>{s.label}</span>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{s.value}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 6 }}>&nbsp;</div>
            {specsRight.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderBottom: `1px solid ${c.line}` }}>
                <span style={{ fontSize: 13, color: c.muted }}>{s.label}</span>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>{s.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderBottom: `1px solid ${c.line}` }}>
              <span style={{ fontSize: 13, color: c.muted }}>Availability</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: c.sage, border: '1px solid #CBD3BC', borderRadius: 4, padding: '4px 10px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.sage }} />{hero.status}
              </span>
            </div>
          </div>
        </div>

        {/* Tag pills */}
        <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 9 }}>
          {tags.map((t) => (
            <span key={t} style={{ fontSize: 11.5, color: c.inkSoft, border: `1px solid ${c.line}`, borderRadius: 4, padding: '6px 12px' }}>{t}</span>
          ))}
        </div>

        {/* In this room */}
        <div style={{ marginTop: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, marginBottom: 16 }}>In this room</div>
          <div style={{ position: 'relative', height: 420, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            <WeaveImage img={hero.img} src={hero.src} tone={sel.tone} style={{ position: 'absolute', inset: 0, height: '100%' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 30px', background: 'linear-gradient(to top, rgba(51,49,43,.62), rgba(51,49,43,0))' }}>
              <div style={{ fontFamily: font.display, fontStyle: 'italic', fontSize: 22, color: c.paper, maxWidth: 560, lineHeight: 1.3 }}>
                {sel.name}, upholstered across a low daybed — caught in the late warmth of a Parnell afternoon.
              </div>
            </div>
          </div>
        </div>
      </div>

      <BrandFooter />
    </div>
  )
}
