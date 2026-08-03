// Shared UI primitives for the Atelier prototype. Inline-styled to match the design refs exactly.
// Screen components import these and compose them. APIs documented inline.
import { useState } from 'react'
import { c, font, eyebrow as eb, weave } from '../theme.js'
import { asset } from '../data/atelier.js'

// Eyebrow — small UPPERCASE letter-spaced muted label.  <Eyebrow>Section</Eyebrow>
export function Eyebrow({ children, style }) {
  return <div style={{ ...eb, ...style }}>{children}</div>
}

// Em — Zodiak accent word inside a headline (accent words only, per the DS).  Title <Em>word</Em>
export function Em({ children }) {
  return <span style={{ fontFamily: font.accent, fontStyle: 'italic', color: c.inkSoft }}>{children}</span>
}

// PageHeader — eyebrow + large display headline (+ optional subtitle, right slot).
// <PageHeader eyebrow="…" title={<>Good morning <Em>Liz</Em></>} subtitle="…" right={<Button/>} />
export function PageHeader({ eyebrow, title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 style={{ margin: '13px 0 0', fontFamily: font.display, fontWeight: 500, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.025em', color: c.ink }}>{title}</h1>
        {subtitle && <div style={{ marginTop: 10, fontSize: 14, color: c.muted, maxWidth: 560, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {right && <div style={{ flex: 'none' }}>{right}</div>}
    </div>
  )
}

// Buttons. <PrimaryButton onClick>Confirm</PrimaryButton>  <SecondaryButton>Save</SecondaryButton>
export function PrimaryButton({ children, onClick, style, type = 'button' }) {
  return <button type={type} onClick={onClick} className="ab-primary ab-t"
    style={{ height: 44, padding: '0 22px', borderRadius: 4, fontFamily: font.ui, fontSize: 13.5, fontWeight: 500, ...style }}>{children}</button>
}
export function SecondaryButton({ children, onClick, style, type = 'button' }) {
  return <button type={type} onClick={onClick} className="ab-secondary ab-t"
    style={{ height: 44, padding: '0 20px', borderRadius: 4, fontFamily: font.ui, fontSize: 13.5, fontWeight: 500, ...style }}>{children}</button>
}

// AttributePill — small hairline tag.  <AttributePill>100% Linen</AttributePill>
export function AttributePill({ children, style }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 11px', border: `1px solid ${c.line}`, borderRadius: 4, fontSize: 12, color: c.inkSoft, fontFamily: font.ui, ...style }}>{children}</span>
}

// StatusPill — dot + label in sage/clay/muted.  <StatusPill tone="clay">Overdue</StatusPill>
export function StatusPill({ tone = 'muted', children, style }) {
  const col = { sage: c.sage, clay: c.clay, muted: c.muted }[tone] || c.muted
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '3px 10px', border: `1px solid ${c.line}`, borderRadius: 4, fontSize: 11.5, color: col, fontFamily: font.ui, ...style }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, flex: 'none' }} />{children}
  </span>
}

// WeaveImage — fabric/interior image with graceful fallback: local file -> remote src -> woven gradient.
// <WeaveImage img={p.img} src={p.src} tone={['#aaa','#555']} style={{aspectRatio:'4/3'}} radius={4} />
export function WeaveImage({ img, src, tone = ['#E5E1D4', '#D3C098'], alt = '', style = {}, radius = 0, className = '' }) {
  const [stage, setStage] = useState(img ? 'local' : (src ? 'remote' : 'none'))
  const url = stage === 'local' ? asset(img) : stage === 'remote' ? src : null
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', background: weave(tone[0], tone[1]), borderRadius: radius, ...style }}>
      {url && <img src={url} alt={alt} loading="lazy"
        onError={() => setStage(stage === 'local' && src ? 'remote' : 'none')}
        className="ab-img"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </div>
  )
}

// Swatch — a single fabric/colour chip (rounded square, gradient from tone).
export function Swatch({ tone = ['#E5E1D4', '#D3C098'], size = 30, selected = false, radius = 4, style }) {
  return <span style={{ width: size, height: size, borderRadius: radius, flex: 'none', background: weave(tone[0], tone[1]), boxShadow: selected ? `0 0 0 2px ${c.accent}` : `0 0 0 1px ${c.line}`, ...style }} />
}

// SwatchStrip — signature row of colourway chips (name + mono SKU). selectable.
// <SwatchStrip colourways={design.colourways} selected={i} onSelect={setI} />
export function SwatchStrip({ colourways = [], selected = 0, onSelect, size = 34, showSku = false }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {colourways.map((cw, i) => {
        const on = i === selected
        return (
          <button key={cw.sku || cw.name || i} onClick={() => onSelect && onSelect(i)} title={cw.name}
            className="ab-t" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: onSelect ? 'pointer' : 'default', padding: 0 }}>
            <Swatch tone={cw.tone} size={size} selected={on} />
            <span style={{ fontSize: 10.5, fontFamily: font.ui, color: on ? c.ink : c.muted }}>{cw.name}</span>
            {showSku && <span style={{ fontSize: 9.5, fontFamily: font.mono, color: c.muted }}>{cw.sku}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Toast — small confirmation that floats bottom-centre. Render conditionally: {toast && <Toast>{toast}</Toast>}
export function Toast({ children }) {
  return (
    <div className="ab-toast" style={{ position: 'fixed', left: '50%', bottom: 34, transform: 'translateX(-50%)', zIndex: 60, background: c.ink, color: c.paper, padding: '12px 20px', borderRadius: 4, fontSize: 13, fontFamily: font.ui, boxShadow: '0 12px 32px rgba(51,49,43,.28)', display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
  )
}

// Hairline — a 1px greige divider.
export const Hairline = ({ style }) => <div style={{ height: 1, background: c.line, ...style }} />

// IndicativeTag — the small "Indicative" marker placed near money.
export const Indicative = ({ style }) => <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted, ...style }}>Indicative</span>
