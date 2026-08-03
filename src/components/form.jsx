// Shared form controls for the three create screens (client / sales order / purchase order) — matched
// to the Atelier system: uppercase letter-spaced labels, hairline inputs, brass focus. Inline-styled
// to stay consistent with the rest of the prototype; focus state is local so the border can transition.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'

const fieldLabel = {
  fontFamily: font.ui,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: c.muted,
  marginBottom: 9,
}

const baseControl = (focused) => ({
  width: '100%',
  height: 44,
  boxSizing: 'border-box',
  border: `1px solid ${focused ? c.brass : c.line}`,
  borderRadius: 4,
  background: c.paper,
  padding: '0 13px',
  fontSize: 13.5,
  color: c.ink,
  fontFamily: font.ui,
  outline: 'none',
  transition: 'border-color .15s',
})

// FormField — label + control (+ optional inline error / hint).
export function FormField({ label, children, error, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {label && <div style={fieldLabel}>{label}</div>}
      {children}
      {hint && !error && <div style={{ marginTop: 6, fontSize: 11.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>{hint}</div>}
      {error && <div style={{ marginTop: 6, fontSize: 12, color: c.clay }}>{error}</div>}
    </div>
  )
}

// TextInput — controlled single-line input; onChange receives the raw string value.
export function TextInput({ value, onChange, placeholder, type = 'text', ariaLabel, invalid = false }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={{ ...baseControl(focused), borderColor: invalid ? c.clay : focused ? c.brass : c.line }}
    />
  )
}

// SelectInput — native select over string options or {value,label} objects.
export function SelectInput({ value, onChange, options = [], ariaLabel }) {
  const [focused, setFocused] = useState(false)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={ariaLabel}
      style={{ ...baseControl(focused), cursor: 'pointer' }}
    >
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        )
      })}
    </select>
  )
}

// NotFound — friendly panel for unknown :id routes (client-facing demo must never crash).
export function NotFound({ title = 'Not found', message, backTo = '/dashboard', backLabel = 'Back' }) {
  return (
    <div style={{ maxWidth: 560, margin: '40px auto 0', border: `1px solid ${c.line}`, borderRadius: 8, background: c.surface, padding: '40px 36px', textAlign: 'center' }}>
      <div style={{ fontFamily: font.display, fontSize: 24, color: c.ink }}>{title}</div>
      <div style={{ marginTop: 12, fontSize: 13.5, color: c.muted, lineHeight: 1.6 }}>
        {message || 'That record could not be found — it may have been removed, or the link is out of date.'}
      </div>
      <Link
        to={backTo}
        className="ab-t"
        style={{ display: 'inline-block', marginTop: 22, fontSize: 13, color: c.accent, textDecoration: 'none', borderBottom: `1px solid ${c.accent}`, paddingBottom: 2 }}
      >
        {backLabel} →
      </Link>
    </div>
  )
}
