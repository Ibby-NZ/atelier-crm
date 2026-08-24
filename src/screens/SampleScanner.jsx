// The scanner — LIVE, wired to the sample register (W4-US-009, camera added in
// W22). It replaced a phone-frame preview that simulated a scan against demo
// data and wrote nothing.
//
//   GET  /admin/samples/by-barcode/:barcode   → 200 { sample } or 404, never a list
//   POST /admin/samples/:id/check-out         → { sample }
//   POST /admin/samples/:id/check-in          → { sample }
//
// **Two ways in, one flow.** A barcode wedge scanner (USB or bluetooth) is a
// keyboard: it types the code into the focused input and sends Enter, which
// submits the lookup — so the screen is still built around one autofocused box,
// and typing the code by hand works identically. The camera decodes into the
// SAME lookup. It is a second door, never a replacement: a wedge is faster at a
// counter, costs nothing to keep, and is the only thing that works when camera
// permission is refused, when the device has no camera, or when the page is not
// on a secure origin (getUserMedia is https-or-localhost only). The screen says
// which of those it is rather than failing blankly.
//
// **The decoder is loaded by `await import()` and only when it is needed.**
// Chrome on Android and on the desktop has `BarcodeDetector` built in and never
// downloads anything; Safari — and therefore every browser on an iPad, since
// they are all WebKit underneath — has no such API, so those devices fetch the
// WebAssembly decoder once, on first use of the camera. Nothing about this
// reaches the main bundle. See docs/scanner-decoder.md for the measurements.
//
// The flow is the acceptance criterion verbatim: by-barcode first, then
// whichever movement the row's open loan makes possible. `movementVerb` reads
// the loan, not `status` — the loan row is what the movement writes and what
// the one-open-loan index guards, so if the two ever disagree the loan is the
// truth. A 404 is an ANSWER (the tag is real and unregistered), not an error,
// so it offers the register rather than a failure line.
//
// Every rule here is imported from adminSamples.js and scanner.js, where they
// are unit-tested — this file is layout and effects, because there is no jsdom
// in this repo. Overdue comes from the API's boolean via loanState; there is no
// date arithmetic here. (`performance.now()` below is elapsed milliseconds for
// the decode debounce, not a reading of the device's calendar.)

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font, radius } from '../theme.js'
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
import TradeAccountPicker from '../admin/TradeAccountPicker.jsx'
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
  withTradeAccount,
} from './adminSamples.js'
import {
  IDLE_SCAN,
  SCAN_INTERVAL_MS,
  VIDEO_CONSTRAINTS,
  admitRead,
  cameraRefusal,
  nativeFormatPlan,
  readEnvironment,
  scanReducer,
  scannerCapability,
} from './scanner.js'

const CAMERA_OFF = Object.freeze({ status: 'off', decoder: '', message: '' })

const DECODER_LABELS = Object.freeze({
  native: 'Decoding in the browser',
  wasm: 'Decoding with the downloaded reader',
})

export default function SampleScanner() {
  const [barcode, setBarcode] = useState('')
  // The decode-result state machine (scanner.js): idle / found / missing /
  // failed. `missing` is its own state because the by-barcode 404 is an answer.
  const [scan, dispatch] = useReducer(scanReducer, IDLE_SCAN)
  const [checkOut, setCheckOut] = useState(EMPTY_CHECK_OUT)
  const [busy, setBusy] = useState(false)
  const [camera, setCamera] = useState(CAMERA_OFF)
  const { message, flash } = useToast()
  const inputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  // The debounce memory admitRead carries between frames — a ref, not state:
  // nothing renders from it and a re-render four times a second is waste.
  const readRef = useRef(null)

  // What this device can offer, decided once. On an iPad this is `wasm`; on
  // Android Chrome `native`; on plain http or a machine with no camera it is
  // `wedge-only` and the camera panel explains itself instead of a dead button.
  const capability = useMemo(() => scannerCapability(readEnvironment(globalThis)), [])

  // Not useMutation: there is no list to reload, and the lookup's 404 is an
  // outcome to render, not an error to flash — useMutation would flatten the
  // two into one red line. Stable identity, because the decode loop depends on it.
  const lookUpCode = useCallback(async (raw) => {
    const code = typeof raw === 'string' ? raw.trim() : ''
    if (code === '') return dispatch({ type: 'failed', message: 'Scan or type a barcode first.' })
    setBarcode(code)
    setBusy(true)
    try {
      const body = await apiFetch(byBarcodePath(code))
      dispatch({ type: 'found', sample: body.sample })
      setCheckOut(EMPTY_CHECK_OUT)
    } catch (err) {
      if (isNotFound(err)) dispatch({ type: 'missing', code })
      else dispatch({ type: 'failed', message: messageOf(err, 'The register could not be reached.') })
    } finally {
      setBusy(false)
    }
  }, [])

  const lookup = (event) => {
    event.preventDefault()
    lookUpCode(barcode)
  }

  // Both movements land here: run the verb, show the sample the API handed
  // back (the same shape a plain read returns), and put focus back on the box
  // so the next wedge scan needs no click.
  const movement = async (fn, note) => {
    setBusy(true)
    try {
      const body = await fn()
      dispatch({ type: 'found', sample: body.sample })
      setCheckOut(EMPTY_CHECK_OUT)
      flash(note)
      inputRef.current?.focus()
    } catch (err) {
      dispatch({ type: 'failed', message: messageOf(err) })
    } finally {
      setBusy(false)
    }
  }

  const sendOut = (sample) => {
    const built = checkOutBody(checkOut)
    if (built.error) return dispatch({ type: 'failed', message: built.error })
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

  // Refs only, so it is safe as an unmount cleanup: a component that has gone
  // has no state to set, but the camera light must still go out.
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks()?.forEach((track) => track.stop())
    streamRef.current = null
    detectorRef.current = null
    readRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  /**
   * The one place either decoder is built. Native when the browser has one AND
   * it reads the symbology this register prints — `getSupportedFormats()` is a
   * per-platform list, so a detector that cannot read Code 128 falls through to
   * the bundled reader rather than silently never matching.
   *
   * The `import()` is what keeps the WebAssembly out of every other chunk.
   */
  const buildDetector = async () => {
    if (capability.mode === 'native') {
      try {
        const plan = nativeFormatPlan(await globalThis.BarcodeDetector.getSupportedFormats())
        if (plan.ok) {
          return { decoder: 'native', detector: new globalThis.BarcodeDetector({ formats: plan.formats }) }
        }
      } catch {
        // A native detector that cannot say what it reads is one we cannot use.
        // Falling through costs a download; refusing costs the scan.
      }
    }
    const { createWasmDetector } = await import('./scannerDecoder.js')
    return { decoder: 'wasm', detector: createWasmDetector() }
  }

  const startCamera = async () => {
    setCamera({ ...CAMERA_OFF, status: 'starting' })
    try {
      const built = await buildDetector()
      const stream = await globalThis.navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS)
      streamRef.current = stream
      detectorRef.current = built.detector
      readRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamera({ status: 'live', decoder: built.decoder, message: '' })
    } catch (err) {
      stopCamera()
      // A refusal is not a dead end — it is the wedge box, which is on screen.
      setCamera({ ...CAMERA_OFF, message: cameraRefusal(err) })
      inputRef.current?.focus()
    }
  }

  const closeCamera = () => {
    stopCamera()
    setCamera(CAMERA_OFF)
    inputRef.current?.focus()
  }

  // The decode loop. Everything it decides — is this barcode-shaped, is it the
  // same tag we just read, is a request already in flight — is admitRead's,
  // which is pure and tested; what is left here is the timer and the call.
  useEffect(() => {
    if (camera.status !== 'live') return undefined
    let active = true
    let inFlight = false
    const tick = async () => {
      if (!active || inFlight) return
      const detector = detectorRef.current
      const video = videoRef.current
      if (!detector || !video) return
      inFlight = true
      try {
        const results = await detector.detect(video)
        const decision = admitRead(readRef.current, {
          code: results?.[0]?.rawValue,
          // Elapsed milliseconds, not a date: this measures the gap between two
          // decodes and can never be confused with a due-back comparison.
          at: performance.now(),
          busy,
        })
        readRef.current = decision.memory
        if (active && decision.accept) lookUpCode(decision.memory.code)
      } catch {
        // One frame that will not decode is not worth a red line — the next
        // arrives in 250 ms. A camera that has actually died stops the stream,
        // which the video element shows on its own.
      } finally {
        inFlight = false
      }
    }
    const timer = setInterval(tick, SCAN_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [camera.status, busy, lookUpCode])

  const reset = () => {
    dispatch({ type: 'reset' })
    setBarcode('')
    setCheckOut(EMPTY_CHECK_OUT)
    // Clearing the memory is what lets the SAME tag be scanned again at once.
    readRef.current = null
    inputRef.current?.focus()
  }

  const setCheckOutField = (key) => (event) =>
    setCheckOut((v) => ({ ...v, [key]: event.target.value }))
  // The picker's fold, shared with the register: null clears the link, and a
  // picked company fills a BLANK holder name without overwriting a typed one.
  const linkAccount = (account) => setCheckOut((v) => withTradeAccount(v, account))

  const sample = scan.sample
  const loan = sample ? loanState(sample) : null
  const live = camera.status === 'live'

  return (
    <div>
      <PageHeader
        eyebrow="Samples · live"
        title={<>Scanner</>}
        subtitle="Scan a tag to record a movement against the register. A wedge scanner types into the box and submits itself; typing the barcode works the same, and the camera below reads the same tags."
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
            {scan.status !== 'idle' && (
              <GhostButton disabled={busy} onClick={reset}>
                Scan next
              </GhostButton>
            )}
          </form>
          <ErrorLine style={{ padding: '0 20px 14px' }}>{scan.message}</ErrorLine>
        </section>

        <section style={panel}>
          <PanelHead
            label="Scan with the camera"
            right={
              live ? (
                <span style={{ fontSize: 12.5, color: c.muted }}>
                  {DECODER_LABELS[camera.decoder]}
                </span>
              ) : null
            }
          />
          <div style={{ padding: 20 }}>
            {capability.mode === 'wedge-only' ? (
              <PanelNote>{capability.note}</PanelNote>
            ) : (
              <>
                {/* Always mounted so the ref exists before getUserMedia resolves;
                    playsInline or iOS takes the video fullscreen on play(). */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  aria-label="Camera preview"
                  style={{
                    display: live ? 'block' : 'none',
                    width: '100%',
                    maxHeight: 320,
                    objectFit: 'cover',
                    borderRadius: radius.sm,
                    background: c.inverse,
                    marginBottom: 14,
                  }}
                />
                <GhostButton
                  tone={live ? 'ink' : 'accent'}
                  disabled={camera.status === 'starting'}
                  onClick={live ? closeCamera : startCamera}
                >
                  {live ? 'Stop camera' : camera.status === 'starting' ? 'Starting…' : 'Use the camera'}
                </GhostButton>
                <PanelNote>
                  {live
                    ? 'Hold the tag steady in the frame. A scan looks itself up on its own — the same tag is only read once.'
                    : capability.note}
                </PanelNote>
              </>
            )}
            <ErrorLine>{camera.message}</ErrorLine>
          </div>
        </section>

        {scan.status === 'missing' && (
          <section style={panel}>
            <PanelHead label="Not in the register" />
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: c.ink }}>
                No sample carries the barcode{' '}
                <span style={{ fontFamily: font.mono }}>{scan.code}</span>.
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
                    {/* Its search runs on a button and an Enter it swallows —
                        never through this form, which would check the sample
                        out to a half-filled draft. */}
                    <TradeAccountPicker
                      value={
                        checkOut.trade_account_id
                          ? { id: checkOut.trade_account_id, name: checkOut.trade_account_name }
                          : null
                      }
                      onPick={linkAccount}
                      onClear={() => linkAccount(null)}
                      disabled={busy}
                      hint="Optional — the name alone is fine for a walk-in."
                    />
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
