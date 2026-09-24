// Shared UI primitives for the Atelier prototype. Inline-styled to match the design refs exactly.
// Screen components import these and compose them. APIs documented inline.
import { useContext, useState } from 'react'
import { WorkspaceContext } from './WorkspaceContext.js'
import { Link } from 'react-router-dom'
import { c, font, radius, shadow, eyebrow as eb, weave } from '../theme.js'
import { asset } from '../data/atelier.js'
import { verbTone } from './verbs.jsx'

// Eyebrow — small UPPERCASE letter-spaced muted label.  <Eyebrow>Section</Eyebrow>
export function Eyebrow({ children, style }) {
  return <div style={{ ...eb, ...style }}>{children}</div>
}

// Em — the softened word inside a headline. It was the Zodiak italic; the
// serif and the italic are both gone from the brand, so it is the same face a
// step lighter (the storefront's muted lead in a two-tone headline).
export function Em({ children }) {
  return <span style={{ color: c.muted }}>{children}</span>
}

// PageHeader — eyebrow + large display headline (+ optional subtitle, right slot).
// <PageHeader eyebrow="…" title={<>Good morning <Em>Liz</Em></>} subtitle="…" right={<Button/>} />
export function PageHeader({ eyebrow, title, subtitle, right }) {
  const workspace = useContext(WorkspaceContext)
  if (workspace) return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', paddingBottom: 20, borderBottom: `1px solid ${c.line}` }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 style={{ margin: '8px 0 0', fontFamily: font.display, fontWeight: 400, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.03em', color: c.ink }}>{title}</h1>
        {subtitle && <div style={{ marginTop: 10, fontSize: 14, color: c.inkSoft, maxWidth: 620, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {(workspace.actions.length > 0 || right) && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
        {workspace.actions.length > 0 && <div role="group" aria-label="Page actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {workspace.actions.map(action => <Link key={action.key} to={action.to} className={`${action.primary ? 'ab-primary' : 'ab-secondary'} ab-t`}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 40, padding: '0 18px', fontFamily: font.ui, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{action.label}</Link>)}
        </div>}
        {right}
      </div>}
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 style={{ margin: '13px 0 0', fontFamily: font.display, fontWeight: 400, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.03em', color: c.ink }}>{title}</h1>
        {subtitle && <div style={{ marginTop: 10, fontSize: 14, color: c.muted, maxWidth: 560, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {right && <div style={{ flex: 'none' }}>{right}</div>}
    </div>
  )
}

// Buttons — the ONLY two CTA styles in the app (design-system pills via .ab-primary/.ab-secondary).
// Two sizes: md (44px, default) for page/panel CTAs, sm (36px) for inline row actions.
// Disabled state is styled once in index.css (.ab-primary:disabled) — never hand-rolled per screen.
// <PrimaryButton onClick>Confirm</PrimaryButton>  <SecondaryButton size="sm">Edit</SecondaryButton>
// The storefront's button is 16px on 16/20 padding; a tool wants it a size
// down, so: 44px / 14px for page and panel actions, 36px / 13px in a row.
const BUTTON_SIZES = {
  md: { height: 44, fontSize: 14, padPrimary: 22, padSecondary: 20 },
  sm: { height: 36, fontSize: 13, padPrimary: 16, padSecondary: 14 },
}
function buttonStyle(size, pad) {
  const m = BUTTON_SIZES[size] || BUTTON_SIZES.md
  return { height: m.height, padding: `0 ${m[pad]}px`, fontFamily: font.ui, fontSize: m.fontSize, fontWeight: 500 }
}
export function PrimaryButton({ children, onClick, style, type = 'button', size = 'md', disabled = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className="ab-primary ab-t" data-tone={verbTone(children)}
    style={{ ...buttonStyle(size, 'padPrimary'), ...style }}>{children}</button>
}
export function SecondaryButton({ children, onClick, style, type = 'button', size = 'md', disabled = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className="ab-secondary ab-t" data-tone={verbTone(children)}
    style={{ ...buttonStyle(size, 'padSecondary'), ...style }}>{children}</button>
}
// ButtonLink — a react-router Link dressed as the primary pill (for navigation CTAs).
export function ButtonLink({ to, children, style, size = 'md' }) {
  return <Link to={to} className="ab-primary ab-t"
    style={{ ...buttonStyle(size, 'padPrimary'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', ...style }}>{children}</Link>
}

// AttributePill — small hairline tag.  <AttributePill>100% Linen</AttributePill>
export function AttributePill({ children, style }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 11px', background: c.panelHead, fontSize: 12, color: c.inkSoft, fontFamily: font.ui, ...style }}>{children}</span>
}

// StatusPill — dot + label in sage/clay/accent/muted.  <StatusPill tone="clay">Overdue</StatusPill>
export function StatusPill({ tone = 'muted', children, style }) {
  const col = { sage: c.sage, clay: c.clay, accent: c.accent, muted: c.muted }[tone] || c.muted
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', background: c.panelHead, fontSize: 12, fontWeight: 500, color: col, fontFamily: font.ui, ...style }}>
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
    <div className="ab-toast" role="status" aria-live="polite" aria-atomic="true"
      style={{ position: 'fixed', left: '50%', bottom: 34, transform: 'translateX(-50%)', zIndex: 50,
        background: c.inverse, color: c.onInverse, padding: '12px 20px', borderRadius: radius.xs,
        fontSize: 13, fontFamily: font.ui, boxShadow: shadow.toast, display: 'flex', alignItems: 'center', gap: 10,
        width: 'max-content', maxWidth: 'calc(100vw - 32px)', overflowWrap: 'anywhere', pointerEvents: 'none' }}>{children}</div>
  )
}

// Hairline — a 1px greige divider.
export const Hairline = ({ style }) => <div style={{ height: 1, background: c.line, ...style }} />

// IndicativeTag — the small "Indicative" marker placed near money.
export const Indicative = ({ style }) => <span style={{ fontSize: 12, fontWeight: 500, color: c.muted, ...style }}>Indicative</span>
