// Shared chrome for the live back-office screens.
//
// These screens edit real rows through atelier-api's /admin/* endpoints, so they
// look and behave alike on purpose: one Panel per concern, a hairline row per
// record, inline errors instead of alerts, and a Toast for anything that
// succeeded. Extracted here so a fix to (say) the disabled-input treatment lands
// on all five screens rather than four of them.
//
// Styling follows the house convention: inline styles off the `c`/`font` tokens,
// no CSS modules, no framework.

import { useCallback, useEffect, useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { Toast } from '../components/ui.jsx'
import { ApiError } from '../lib/api.js'

export const panel = {
  border: `1px solid ${c.line}`,
  borderRadius: 4,
  overflow: 'hidden',
  background: c.paper,
}

export const sectionLabel = {
  fontFamily: font.ui,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: c.muted,
}

export const inputStyle = {
  width: '100%',
  height: 42,
  padding: '0 12px',
  border: `1px solid ${c.line}`,
  borderRadius: 3,
  background: c.paper,
  color: c.ink,
  fontFamily: font.ui,
  fontSize: 14,
  outline: 'none',
}

// A row control inside a table cell — same look, shorter, and mono where it
// holds a SKU or a figure.
export const cellInput = { ...inputStyle, height: 34, fontSize: 13, padding: '0 8px' }
export const monoCellInput = { ...cellInput, fontFamily: font.mono, fontSize: 12 }

export const mutedText = { fontSize: 12.5, color: c.muted, fontFamily: font.ui }
export const monoText = { fontFamily: font.mono, fontSize: 12, color: c.inkSoft }

// A read-only value that is deliberately not editable (a generated slug, a fixed
// product type). Greyed and non-interactive so it reads as "fixed", not "broken".
export const readOnlyInput = {
  ...inputStyle,
  background: c.surfaceDeep,
  color: c.muted,
  cursor: 'not-allowed',
}

export function PanelHead({ label, right }) {
  return (
    <div
      style={{
        padding: '15px 20px',
        borderBottom: `1px solid ${c.line}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        background: c.surface,
      }}
    >
      <span style={sectionLabel}>{label}</span>
      {right}
    </div>
  )
}

export function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: 'block', minWidth: 0, ...style }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: c.muted,
          marginBottom: 7,
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: c.muted, lineHeight: 1.5 }}>
          {hint}
        </span>
      )}
    </label>
  )
}

export function CheckField({ label, checked, onChange, disabled }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        fontSize: 13,
        color: c.inkSoft,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <input type="checkbox" checked={Boolean(checked)} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  )
}

// The neutral action button used for every row-level verb (Save, Add, Archive).
// `tone` picks the one thing that varies: claret for a destructive verb, ink for
// the rest.
export function GhostButton({ children, onClick, disabled, tone = 'ink', type = 'button', style }) {
  const colour = tone === 'danger' ? c.clay : tone === 'accent' ? c.accent : c.ink
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="ab-t"
      style={{
        background: 'none',
        border: `1px solid ${c.line}`,
        borderRadius: 3,
        padding: '7px 12px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: font.ui,
        fontSize: 12,
        color: disabled ? c.muted : colour,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function ErrorLine({ children, style }) {
  if (!children) return null
  return (
    <div
      role="alert"
      style={{ fontSize: 12.5, color: c.clay, fontFamily: font.ui, lineHeight: 1.55, ...style }}
    >
      {children}
    </div>
  )
}

// Loading / error / empty all render as one muted line inside a panel, so a
// panel never collapses to nothing while it waits.
export function PanelNote({ children, tone = 'muted' }) {
  return (
    <div
      style={{
        padding: '16px 20px',
        fontSize: 12.5,
        color: tone === 'danger' ? c.clay : c.muted,
        fontStyle: tone === 'danger' ? 'normal' : 'italic',
        fontFamily: tone === 'danger' ? font.ui : font.display,
      }}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      {children}
    </div>
  )
}

export function ArchivedTag() {
  return (
    <span
      style={{
        fontWeight: 500,
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: c.clay,
        marginLeft: 7,
      }}
    >
      Archived
    </span>
  )
}

// Every list row: one hairline-separated grid, dimmed when the record is
// archived so a restored-vs-live row is legible at a glance.
export function Row({ columns, archived, children, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 14,
        alignItems: 'center',
        padding: '13px 20px',
        borderBottom: `1px solid ${c.line}`,
        opacity: archived ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function HeaderRow({ columns, labels }) {
  return (
    <Row
      columns={columns}
      style={{ background: c.surfaceDeep, padding: '9px 20px', borderBottom: `1px solid ${c.line}` }}
    >
      {labels.map((label, index) => (
        <span
          key={`${label}-${index}`}
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: c.muted,
          }}
        >
          {label}
        </span>
      ))}
    </Row>
  )
}

export function ToneChips({ tones = [] }) {
  if (!Array.isArray(tones) || tones.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginBottom: 6 }}>
      {tones.map((tone, index) => (
        <span
          key={`${tone}-${index}`}
          title={tone}
          style={{
            width: 14,
            height: 14,
            border: `1px solid ${c.line}`,
            background: tone,
            flex: 'none',
          }}
        />
      ))}
    </span>
  )
}

// --- behaviour ------------------------------------------------------------

/**
 * A transient success line. Screens fire it after a mutation lands; it clears
 * itself, and clears on unmount so a pending timer never sets state on a gone
 * component.
 */
export function useToast(ms = 3600) {
  const [message, setMessage] = useState(null)
  const timer = useRef()
  const flash = useCallback(
    (text) => {
      setMessage(text)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(null), ms)
    },
    [ms]
  )
  useEffect(() => () => clearTimeout(timer.current), [])
  return { message, flash }
}

export function ToastLine({ message }) {
  if (!message) return null
  return (
    <Toast>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.sage }} />
      {message}
    </Toast>
  )
}

// Every screen turns a thrown ApiError into the same human sentence. The API
// already phrases 409s ("a brand with that name exists") and 422s, so its
// message wins; the fallback only covers a network drop or a non-JSON 500.
export function messageOf(err, fallback = 'That change could not be saved.') {
  return err instanceof ApiError && err.message ? err.message : fallback
}

/**
 * The mutate-then-reload cycle every screen repeats: clear the error, run the
 * request, reload the list so server-generated fields (slugs, counts, reserved
 * quantities) are true again, then flash a note.
 *
 * Returns a `run` that resolves true on success and false on failure, plus the
 * busy flag and the current inline error.
 */
export function useMutation({ reload, flash }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(
    async (fn, note) => {
      setBusy(true)
      setError('')
      try {
        const result = await fn()
        if (reload) await reload()
        if (note) flash(typeof note === 'function' ? note(result) : note)
        return true
      } catch (err) {
        setError(messageOf(err))
        return false
      } finally {
        setBusy(false)
      }
    },
    [reload, flash]
  )

  return { busy, error, setError, run }
}
