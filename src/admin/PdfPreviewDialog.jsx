// The PDF preview before a send (25 Sep 2026: "a preview ability for purchase
// orders before sending it"). The API draws the document — the purchase order,
// a bulk purchase order, or the statement asking a house for one invoice — with
// the same code the letter attaches, so what is read here is what the house
// receives. The dialog shows it, offers it as a download, and carries the one
// act that sends it; nothing is sent until that button is pressed.
//
// Chrome only, like ConfirmDialog, whose accessibility rules it keeps: a modal
// portalled to the body with everything behind it inert, Escape and the
// backdrop close it (not while a send is in flight), Tab stays inside, focus
// lands on Close — never on the button that sends — and returns on close.
//
// A preview the API REFUSES (a draft on a statement, two houses, an order
// already on a supplier invoice) is shown as the API's own sentence, and the
// send button stays disabled: the send would be refused in the same words.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tabTargetIndex } from './confirmation.js'
import { c, font, radius, shadow } from '../theme.js'
import { apiDownload } from '../lib/api.js'
import { ErrorLine, messageOf } from './parts.jsx'

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
  width: 'min(980px, 100%)',
  height: 'calc(100dvh - 48px)',
  background: c.paper,
  border: `1px solid ${c.line}`,
  borderRadius: radius.md,
  padding: 20,
  boxShadow: shadow.modal,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 0,
}

const frame = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  border: `1px solid ${c.line}`,
  background: c.surface,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const button = { padding: '8px 14px', fontFamily: font.ui, fontSize: 13, whiteSpace: 'nowrap', textDecoration: 'none' }

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   body?: string,
 *   source?: { path: string, payload: object }|null,  what to ask the API to draw
 *   filename?: string,                                  the download's name
 *   actionLabel?: string|null,                          the send; omitted = preview only
 *   onAction?: () => void,
 *   onClose?: () => void,
 *   busy?: boolean,                                     a send in flight
 *   error?: string,                                     the send's refusal
 * }} props
 */
export default function PdfPreviewDialog({
  open,
  title,
  body,
  source = null,
  filename = 'purchase-order.pdf',
  actionLabel = null,
  onAction,
  onClose,
  busy = false,
  error = '',
}) {
  const closeRef = useRef(null)
  const cardRef = useRef(null)
  const backdropRef = useRef(null)
  const latest = useRef({ onClose, busy })
  latest.current = { onClose, busy }
  const close = () => {
    if (!latest.current.busy) latest.current.onClose?.()
  }

  // The drawn PDF, as an object URL the frame and the download both point at.
  const [pdf, setPdf] = useState({ status: 'idle', url: null, message: '' })
  // A primitive key, so a parent re-rendering with an equal object literal does
  // not fetch the PDF again.
  const sourceKey = open && source ? JSON.stringify(source) : null

  useEffect(() => {
    if (!sourceKey) return undefined
    let active = true
    let url = null
    setPdf({ status: 'loading', url: null, message: '' })
    const { path, payload } = JSON.parse(sourceKey)
    apiDownload(path, { method: 'POST', payload })
      .then(({ blob }) => {
        if (!active) return
        const file = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
        url = URL.createObjectURL(file)
        setPdf({ status: 'ready', url, message: '' })
      })
      .catch((err) => {
        if (active) setPdf({ status: 'error', url: null, message: messageOf(err, 'The PDF could not be drawn.') })
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sourceKey])

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const background = [...document.body.children].filter((node) => node !== backdropRef.current)
    const previousInert = background.map((node) => node.inert)
    background.forEach((node) => {
      node.inert = true
    })
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.preventDefault()
        close()
      }
      if (event.key !== 'Tab') return
      const controls = [...cardRef.current.querySelectorAll('button, a[href], iframe, [tabindex]')].filter(
        (node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length
      )
      const target = tabTargetIndex(controls.length, controls.indexOf(document.activeElement), event.shiftKey)
      if (!controls.length || target !== null) {
        event.preventDefault()
        if (target !== null) controls[target].focus()
        else cardRef.current.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      background.forEach((node, index) => {
        node.inert = previousInert[index]
      })
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
    // Keyed on `open` alone, as ConfirmDialog is: callback identities change
    // while a send is in flight, and re-running would pull focus back to Close.
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      ref={backdropRef}
      style={scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          close()
        }
      }}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-title"
        aria-describedby={body ? 'pdf-preview-body' : undefined}
        aria-busy={busy || pdf.status === 'loading'}
        style={card}
      >
        <div>
          <h2 id="pdf-preview-title" style={{ fontFamily: font.display, fontSize: 17, color: c.ink, margin: 0 }}>
            {title}
          </h2>
          {body ? (
            <p id="pdf-preview-body" style={{ fontSize: 13, color: c.inkSoft, lineHeight: 1.5, margin: '6px 0 0' }}>
              {body}
            </p>
          ) : null}
        </div>

        <div style={frame}>
          {pdf.status === 'ready' ? (
            <iframe title={`${title} — PDF preview`} src={pdf.url} style={{ width: '100%', height: '100%', border: 0 }} />
          ) : (
            <span style={{ fontSize: 13, color: pdf.status === 'error' ? c.clay : c.inkSoft, padding: 20, maxWidth: 560, textAlign: 'center' }}>
              {pdf.status === 'error' ? pdf.message : 'Drawing the PDF…'}
            </span>
          )}
        </div>

        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button ref={closeRef} type="button" className="ab-row-button ab-t" disabled={busy} onClick={close} style={button}>
            Close
          </button>
          {pdf.status === 'ready' ? (
            <a href={pdf.url} download={filename} className="ab-row-button ab-t" style={button}>
              Download PDF
            </a>
          ) : null}
          {actionLabel ? (
            <button
              type="button"
              className="ab-row-button ab-t"
              data-tone="accent"
              disabled={busy || pdf.status !== 'ready'}
              onClick={onAction}
              style={button}
            >
              {busy ? 'Sending…' : actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
