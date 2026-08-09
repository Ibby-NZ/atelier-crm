// The scanner — LIVE, wired to the sample register (W4-US-009). It replaced a
// phone-frame preview that simulated a scan against demo data and wrote
// nothing.
//
//   GET  /admin/samples/by-barcode/:barcode   → 200 { sample } or 404, never a list
//   POST /admin/samples/:id/check-out         → { sample }
//   POST /admin/samples/:id/check-in          → { sample }
//
// There is no camera. A barcode wedge scanner (USB or bluetooth) is a keyboard:
// it types the code into the focused input and sends Enter, which submits the
// lookup — so the whole screen is built around one autofocused box. Typing the
// code by hand works identically.
//
// The flow is the acceptance criterion verbatim: by-barcode first, then
// whichever movement the row's open loan makes possible. `movementVerb` reads
// the loan, not `status` — the loan row is what the movement writes and what
// the one-open-loan index guards, so if the two ever disagree the loan is the
// truth. A 404 is an ANSWER (the tag is real and unregistered), not an error,
// so it offers the register rather than a failure line.
//
// Every rule here is imported from adminSamples.js, where it is unit-tested —
// this file is layout, because there is no jsdom in this repo. Overdue comes
// from the API's boolean via loanState; there is no date arithmetic here.

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, samplesTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import {
  ArchivedTag,
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  mutedText,
  panel,
  useToast,
} from '../admin/parts.jsx'
import {
  EMPTY_CHECK_OUT,
  byBarcodePath,
  checkInPath,
  checkOutBody,
  checkOutPath,
  isNotFound,
  loanState,
  movementVerb,
  sampleMeta,
  statusLabel,
} from './adminSamples.js'

export default function SampleScanner() {
  const [barcode, setBarcode] = useState('')
  // null = waiting for a scan; { sample } = found; { missing } = a real tag the
  // register has never heard of.
  const [scan, setScan] = useState(null)
  const [checkOut, setCheckOut] = useState(EMPTY_CHECK_OUT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message, flash } = useToast()
  const inputRef = useRef(null)

  // Not useMutation: there is no list to reload, and the lookup's 404 is an
  // outcome to render, not an error to flash — useMutation would flatten the
  // two into one red line.
  const lookup = async (event) => {
    event.preventDefault()
    const code = barcode.trim()
    if (code === '') return setError('Scan or type a barcode first.')
    setBusy(true)
    setError('')
    try {
      const body = await apiFetch(byBarcodePath(code))
      setScan({ sample: body.sample })
      setCheckOut(EMPTY_CHECK_OUT)
    } catch (err) {
      if (isNotFound(err)) setScan({ missing: code })
      else setError(messageOf(err, 'The register could not be reached.'))
    } finally {
      setBusy(false)
    }
  }

  // Both movements land here: run the verb, show the sample the API handed
  // back (the same shape a plain read returns), and put focus back on the box
  // so the next scan needs no click.
  const movement = async (fn, note) => {
    setBusy(true)
    setError('')
    try {
      const body = await fn()
      setScan({ sample: body.sample })
      setCheckOut(EMPTY_CHECK_OUT)
      flash(note)
      inputRef.current?.focus()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const sendOut = (sample) => {
    const built = checkOutBody(checkOut)
    if (built.error) return setError(built.error)
    movement(
      () => apiSend('POST', checkOutPath(sample), built.body),
      `Checked out to ${built.body.holder_name}.`
    )
  }

  const takeBack = (sample) => {
    movement(
      () => apiSend('POST', checkInPath(sample), {}),
      'Checked back into the library.'
    )
  }

  const reset = () => {
    setScan(null)
    setBarcode('')
    setError('')
    setCheckOut(EMPTY_CHECK_OUT)
    inputRef.current?.focus()
  }

  const setCheckOutField = (key) => (event) =>
    setCheckOut((v) => ({ ...v, [key]: event.target.value }))

  const sample = scan?.sample ?? null
  const loan = sample ? loanState(sample) : null

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Scanner</>}
        subtitle="Scan a tag to record a movement against the register. A wedge scanner types into the box and submits itself; typing the barcode works the same."
      />
      <SectionTabs tabs={samplesTabs} active="scanner" />

      <div style={{ maxWidth: 640, margin: '30px auto 0', display: 'grid', gap: 26 }}>
        <section style={panel}>
          <PanelHead label="Scan a barcode" />
          <form onSubmit={lookup} style={{ display: 'flex', gap: 10, padding: 20 }}>
            <input
              ref={inputRef}
              autoFocus
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="ATL-…"
              style={{ ...inputStyle, fontFamily: font.mono, flex: 1 }}
              aria-label="Sample barcode"
            />
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Look up
            </GhostButton>
            {scan && (
              <GhostButton disabled={busy} onClick={reset}>
                Scan next
              </GhostButton>
            )}
          </form>
          <ErrorLine style={{ padding: '0 20px 14px' }}>{error}</ErrorLine>
        </section>

        {scan?.missing && (
          <section style={panel}>
            <PanelHead label="Not in the register" />
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: c.ink }}>
                No sample carries the barcode{' '}
                <span style={{ fontFamily: font.mono }}>{scan.missing}</span>.
              </div>
              <PanelNote>
                Check the tag — one wrong character reads as a different sample —
                or register it on the <Link to="/admin/samples">Sample register</Link>.
              </PanelNote>
            </div>
          </section>
        )}

        {sample && (
          <section style={panel}>
            <PanelHead
              label="Sample"
              right={
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>
                  {statusLabel(sample.status)}
                </span>
              }
            />
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: font.mono, fontSize: 13, color: c.ink }}>
                {sample.barcode}
                {sample.archived_at && <ArchivedTag />}
              </div>
              <div style={{ marginTop: 4, fontFamily: font.display, fontSize: 18, color: c.ink }}>
                {sample.label || sampleMeta(sample)}
              </div>
              <div style={{ marginTop: 2, ...mutedText }}>
                {sampleMeta(sample)}
                {sample.location ? ` · ${sample.location}` : ''}
              </div>
              {/* The API's overdue, worded by loanState. Never recomputed here. */}
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12.5,
                  color:
                    loan.tone === 'danger' ? c.danger : loan.tone === 'ink' ? c.ink : c.muted,
                }}
              >
                {loan.text}
              </div>

              {movementVerb(sample) === 'check-out' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendOut(sample)
                  }}
                  style={{ marginTop: 20 }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: 16,
                    }}
                    className="r-grid-2"
                  >
                    <Field label="Who is taking it" hint="Kept on the loan whatever happens to the account.">
                      <input
                        value={checkOut.holder_name}
                        disabled={busy}
                        onChange={setCheckOutField('holder_name')}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Due back" hint="Optional — leave blank when no date was agreed.">
                      <input
                        type="date"
                        value={checkOut.due_back_at}
                        disabled={busy}
                        onChange={setCheckOutField('due_back_at')}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Notes">
                      <input
                        value={checkOut.notes}
                        disabled={busy}
                        onChange={setCheckOutField('notes')}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <GhostButton type="submit" tone="accent" disabled={busy}>
                      Check out
                    </GhostButton>
                  </div>
                </form>
              ) : (
                <div style={{ marginTop: 20 }}>
                  <GhostButton tone="accent" disabled={busy} onClick={() => takeBack(sample)}>
                    Check in
                  </GhostButton>
                  <PanelNote>
                    Checking in closes the loan and returns the sample to the library. A
                    damaged return is a follow-up edit on the register.
                  </PanelNote>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <ToastLine message={message} />
    </div>
  )
}
