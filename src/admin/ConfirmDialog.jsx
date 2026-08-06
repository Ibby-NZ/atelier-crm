// The one destructive-action dialog. Chrome only — every decision about what it
// says lives in deleteFlow.js, which is testable; this repo has no jsdom.
//
// Accessibility is not decoration on a modal: `role="dialog"` + `aria-modal`
// tell a screen reader the rest of the page is inert, Escape is the expected way
// out of any modal, and **focus lands on Cancel, never on the destructive
// button** — a stray Enter after opening must not delete a row.
//
// The buttons are native `<button>`s carrying GhostButton's styling rather than
// `GhostButton` itself: that component does not forward refs (it is a plain
// function component), so `ref={cancelRef}` on it would be dropped and the
// focus rule above would silently stop working.

import { useEffect, useRef } from 'react'
import { c, font, radius } from '../theme.js'
import { ErrorLine } from './parts.jsx'

/**
 * Escape cancels. Exported so it can be unit-tested without a DOM — a component
 * with hooks cannot be called as a plain function.
 *
 * @param {() => void} [onCancel]
 * @returns {(event: KeyboardEvent) => void}
 */
export function escapeCancels(onCancel) {
  return (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault?.()
    onCancel?.()
  }
}

const scrim = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(51, 49, 43, 0.42)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 60,
}

const card = {
  width: 'min(460px, 100%)',
  background: c.paper,
  border: `1px solid ${c.line}`,
  borderRadius: radius.md,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const titleStyle = { fontFamily: font.display, fontSize: 17, color: c.ink, margin: 0 }
const bodyStyle = { fontSize: 13, color: c.inkSoft, lineHeight: 1.5, margin: 0 }
const lineStyle = { fontFamily: font.mono, fontSize: 12, color: c.ink }

// Kept in step with parts.jsx GhostButton by eye; see the header note for why
// this cannot simply be that component.
const ghost = (tone, disabled) => ({
  background: 'none',
  border: `1px solid ${c.line}`,
  borderRadius: radius.pill,
  padding: '7px 12px',
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: font.ui,
  fontSize: 12,
  color: disabled ? c.muted : tone === 'danger' ? c.danger : c.ink,
  whiteSpace: 'nowrap',
})

/**
 * @param {{ open: boolean, title: string, body?: string, lines?: string[],
 *   confirmLabel?: string|null, secondaryLabel?: string|null,
 *   onConfirm?: () => void, onSecondary?: () => void, onCancel?: () => void,
 *   busy?: boolean, error?: string }} props
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  lines = [],
  confirmLabel,
  secondaryLabel,
  onConfirm,
  onSecondary,
  onCancel,
  busy = false,
  error = '',
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    // The safe button, so Enter straight after opening cancels rather than
    // deletes. The ref is attached by the time an effect runs.
    cancelRef.current?.focus()
    const onKey = escapeCancels(onCancel)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      style={scrim}
      // A click on the backdrop cancels, like Escape. Clicks inside the card do
      // not, so a mis-drag across the panel cannot dismiss it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={card}>
        <h2 id="confirm-dialog-title" style={titleStyle}>
          {title}
        </h2>
        {body ? <p style={bodyStyle}>{body}</p> : null}
        {lines.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {lines.map((line) => (
              <li key={line} style={lineStyle}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            ref={cancelRef}
            type="button"
            className="ab-t"
            disabled={busy}
            onClick={onCancel}
            style={ghost('ink', busy)}
          >
            Cancel
          </button>
          {secondaryLabel ? (
            <button
              type="button"
              className="ab-t"
              disabled={busy}
              onClick={onSecondary}
              style={ghost('ink', busy)}
            >
              {secondaryLabel}
            </button>
          ) : null}
          {confirmLabel ? (
            <button
              type="button"
              className="ab-t"
              disabled={busy}
              onClick={onConfirm}
              style={ghost('danger', busy)}
            >
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
