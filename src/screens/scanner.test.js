import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  ESSENTIAL_FORMAT,
  IDLE_SCAN,
  MAX_BARCODE_LENGTH,
  NATIVE_FORMATS,
  REPEAT_WINDOW_MS,
  SCAN_FORMATS,
  SCAN_INTERVAL_MS,
  VIDEO_CONSTRAINTS,
  WASM_READER_OPTIONS,
  ZXING_FORMATS,
  admitRead,
  cameraRefusal,
  isPlausibleBarcode,
  nativeFormatPlan,
  normaliseRead,
  readEnvironment,
  scanReducer,
  scannerCapability,
} from './scanner.js'

const RULES_SOURCE = readFileSync(new URL('./scanner.js', import.meta.url), 'utf8')
const DECODER_SOURCE = readFileSync(new URL('./scannerDecoder.js', import.meta.url), 'utf8')
const SCREEN_SOURCE = readFileSync(new URL('./SampleScanner.jsx', import.meta.url), 'utf8')

// The three devices this decision exists for. A design showroom runs on iPads,
// and every browser on one is WebKit underneath — so "iPad" means Safari,
// Chrome and Firefox alike.
const IPAD = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia: () => {} } } }
const ANDROID = { ...IPAD, BarcodeDetector: function BarcodeDetector() {} }
const HTTP_LAPTOP = { ...ANDROID, isSecureContext: false }
const NO_CAMERA = { isSecureContext: true, navigator: { mediaDevices: {} } }

describe('the capability decision', () => {
  it('sends an iPad to the bundled decoder, because iOS has no BarcodeDetector', () => {
    // Safari does not implement it and every iOS browser is WebKit, so the
    // constructor is simply absent — a web app calling it fails silently. This
    // is the decision that turns that absence into a download rather than a
    // dead screen.
    const capability = scannerCapability(readEnvironment(IPAD))
    expect(capability.mode).toBe('wasm')
    expect(capability.reason).toBe('no-native-detector')
    expect(capability.note).toMatch(/download/i)
  })

  it('keeps Android and desktop Chrome off the wasm path entirely', () => {
    const capability = scannerCapability(readEnvironment(ANDROID))
    expect(capability.mode).toBe('native')
    expect(capability.note).toMatch(/nothing extra is downloaded/i)
  })

  it('answers a plain-http page with wedge-only, and says why', () => {
    // getUserMedia is secure-context only. Failing blankly here reads as a
    // broken app; the page is simply not on https.
    const capability = scannerCapability(readEnvironment(HTTP_LAPTOP))
    expect(capability.mode).toBe('wedge-only')
    expect(capability.reason).toBe('insecure-origin')
    expect(capability.note).toMatch(/https/)
  })

  it('answers a device with no camera with wedge-only too, but a different reason', () => {
    const capability = scannerCapability(readEnvironment(NO_CAMERA))
    expect(capability.mode).toBe('wedge-only')
    expect(capability.reason).toBe('no-camera')
  })

  it('checks the origin before the hardware', () => {
    // A page on plain http has no camera to ask about: navigator.mediaDevices
    // is undefined there, so asking in the other order would report "no camera"
    // about a device holding two.
    expect(scannerCapability(readEnvironment({ isSecureContext: false })).reason).toBe(
      'insecure-origin'
    )
  })

  it('reads an unknown environment as offering nothing', () => {
    expect(readEnvironment()).toEqual({ secure: false, camera: false, detector: false })
    expect(scannerCapability().mode).toBe('wedge-only')
  })

  it('states its notes as frozen objects', () => {
    expect(Object.isFrozen(scannerCapability(readEnvironment(IPAD)))).toBe(true)
  })
})

describe('nativeFormatPlan', () => {
  it('uses the native reader when it covers the symbology the register prints', () => {
    const plan = nativeFormatPlan([...NATIVE_FORMATS, 'ean_13', 'pdf417'])
    expect(plan.ok).toBe(true)
    expect(plan.formats).toEqual([...NATIVE_FORMATS])
  })

  it('asks for only what the platform actually supports', () => {
    // Passing a format a platform does not implement is the kind of thing that
    // throws in one browser and is ignored in the next.
    const plan = nativeFormatPlan(['code_128', 'qr_code'])
    expect(plan.formats).toEqual(['code_128', 'qr_code'])
    expect(plan.ok).toBe(true)
  })

  it('falls through to the bundled decoder when Code 128 is missing', () => {
    // A BarcodeDetector that cannot read the register's own symbology is not a
    // scanner for this screen, however many other formats it lists — and a
    // scanner that silently never matches is worse than a 1 MB download.
    expect(nativeFormatPlan(['qr_code', 'ean_13']).ok).toBe(false)
    expect(nativeFormatPlan([]).ok).toBe(false)
    expect(nativeFormatPlan(undefined).ok).toBe(false)
  })
})

describe('the format vocabularies', () => {
  it('are derived from one declaration, never typed twice', () => {
    expect(NATIVE_FORMATS).toEqual(SCAN_FORMATS.map((format) => format.native))
    expect(ZXING_FORMATS).toEqual(SCAN_FORMATS.map((format) => format.zxing))
    expect(NATIVE_FORMATS).toContain(ESSENTIAL_FORMAT)
  })

  it('asks the bundled decoder for the same symbologies and one symbol', () => {
    // Two tags in one frame is an ambiguous scan, not two movements.
    expect(WASM_READER_OPTIONS.formats).toBe(ZXING_FORMATS)
    expect(WASM_READER_OPTIONS.maxNumberOfSymbols).toBe(1)
  })

  it('carries no retail symbology', () => {
    // The register's barcodes are Atelier-issued and alphanumeric
    // (ATL-0049-217), so an EAN could never match the by-barcode read — and
    // every extra symbology is time spent on each frame.
    expect(NATIVE_FORMATS.some((format) => format.startsWith('ean'))).toBe(false)
    expect(NATIVE_FORMATS.some((format) => format.startsWith('upc'))).toBe(false)
  })

  it('asks for the rear camera as an ideal, never an exact', () => {
    // `exact: 'environment'` is an OverconstrainedError on every laptop.
    expect(VIDEO_CONSTRAINTS.video.facingMode).toEqual({ ideal: 'environment' })
    expect(VIDEO_CONSTRAINTS.audio).toBe(false)
  })
})

describe('the barcode shape guard', () => {
  it("accepts the register's own shape", () => {
    expect(isPlausibleBarcode('ATL-0049-217')).toBe(true)
    expect(isPlausibleBarcode('ATX-0001')).toBe(true)
  })

  it("accepts a wedge scanner's trailing newline by trimming it", () => {
    expect(normaliseRead(' ATL-0049-217\r\n')).toBe('ATL-0049-217')
    expect(isPlausibleBarcode(' ATL-0049-217\r\n')).toBe(true)
  })

  it('refuses what a printed barcode can never be', () => {
    expect(isPlausibleBarcode('')).toBe(false)
    expect(isPlausibleBarcode('  ')).toBe(false)
    expect(isPlausibleBarcode('ab')).toBe(false)
    expect(isPlausibleBarcode('x'.repeat(MAX_BARCODE_LENGTH + 1))).toBe(false)
    // A space or a control character INSIDE the code is a half-decoded frame.
    expect(isPlausibleBarcode('ATL 0049')).toBe(false)
    expect(isPlausibleBarcode(undefined)).toBe(false)
    expect(isPlausibleBarcode(42)).toBe(false)
  })

  it("does not enforce Atelier's prefix", () => {
    // samples.barcode is free text; a guard that knew the format would refuse a
    // tag the register happily holds.
    expect(isPlausibleBarcode('9421900000001')).toBe(true)
    expect(isPlausibleBarcode('hanger/47')).toBe(true)
  })
})

describe('admitRead — the gate between the decode loop and the API', () => {
  it('accepts the first sighting and remembers it', () => {
    const decision = admitRead(null, { code: 'ATL-0049-217', at: 1000 })
    expect(decision.accept).toBe(true)
    expect(decision.memory).toEqual({ code: 'ATL-0049-217', at: 1000 })
  })

  it('refuses the same tag while it is still in frame', () => {
    // A video stream decodes the same label four times a second. Without this a
    // single tag would fire a lookup per frame.
    const first = admitRead(null, { code: 'ATL-0049-217', at: 1000 })
    const second = admitRead(first.memory, { code: 'ATL-0049-217', at: 1250 })
    expect(second.accept).toBe(false)
  })

  it('refreshes the suppression while it refuses, so a resting tag never re-fires', () => {
    let memory = admitRead(null, { code: 'ATL-0049-217', at: 0 }).memory
    // Held in frame for well over the window, one frame at a time.
    for (let at = 250; at <= REPEAT_WINDOW_MS * 3; at += 250) {
      const decision = admitRead(memory, { code: 'ATL-0049-217', at })
      expect(decision.accept).toBe(false)
      memory = decision.memory
    }
    expect(memory.at).toBe(REPEAT_WINDOW_MS * 3)
  })

  it('accepts the same tag again once it has been away for the window', () => {
    const first = admitRead(null, { code: 'ATL-0049-217', at: 1000 })
    const later = admitRead(first.memory, { code: 'ATL-0049-217', at: 1000 + REPEAT_WINDOW_MS })
    expect(later.accept).toBe(true)
  })

  it('accepts a different tag immediately', () => {
    const first = admitRead(null, { code: 'ATL-0049-217', at: 1000 })
    expect(admitRead(first.memory, { code: 'ATL-0049-118', at: 1100 }).accept).toBe(true)
  })

  it('refuses everything while a request is in flight, and forgets nothing', () => {
    // The interlock that stops a check-out being posted twice.
    const memory = { code: 'ATL-0049-118', at: 500 }
    const decision = admitRead(memory, { code: 'ATL-0049-217', at: 900, busy: true })
    expect(decision.accept).toBe(false)
    expect(decision.memory).toBe(memory)
  })

  it('refuses a junk decode without disturbing the memory', () => {
    const memory = { code: 'ATL-0049-118', at: 500 }
    expect(admitRead(memory, { code: 'ab', at: 900 }).memory).toBe(memory)
    expect(admitRead(null, { code: undefined, at: 900 })).toEqual({ accept: false, memory: null })
  })

  it('takes its window as an argument, so nothing here reads a clock', () => {
    const first = admitRead(null, { code: 'ATL-0049-217', at: 0 })
    expect(admitRead(first.memory, { code: 'ATL-0049-217', at: 40, repeatWindowMs: 30 }).accept).toBe(
      true
    )
  })
})

describe('the decode-result state machine', () => {
  const sample = { id: 7, barcode: 'ATX-0001' }

  it('starts idle and frozen', () => {
    expect(IDLE_SCAN.status).toBe('idle')
    expect(Object.isFrozen(IDLE_SCAN)).toBe(true)
  })

  it('shows a sample a read or a movement handed back', () => {
    // A check-out answers with the same { sample } shape a read does, which is
    // what lets the panel show the row's new state with no second request.
    const state = scanReducer(IDLE_SCAN, { type: 'found', sample })
    expect(state).toEqual({ status: 'found', sample, code: 'ATX-0001', message: '' })
  })

  it('keeps "not registered" as its own state, because a 404 is an answer', () => {
    const state = scanReducer(IDLE_SCAN, { type: 'missing', code: ' ATL-9999-000 ' })
    expect(state.status).toBe('missing')
    expect(state.code).toBe('ATL-9999-000')
    expect(state.sample).toBe(null)
  })

  it('keeps the sample on screen when a movement is refused', () => {
    // A check-out refused with the row and its form gone reports an error about
    // something invisible.
    const found = scanReducer(IDLE_SCAN, { type: 'found', sample })
    const failed = scanReducer(found, { type: 'failed', message: 'Already out on loan.' })
    expect(failed.sample).toBe(sample)
    expect(failed.message).toBe('Already out on loan.')
  })

  it('clears the last failure when the next scan lands', () => {
    const failed = scanReducer(IDLE_SCAN, { type: 'failed', message: 'nope' })
    expect(scanReducer(failed, { type: 'found', sample }).message).toBe('')
    expect(scanReducer(failed, { type: 'missing', code: 'ATX-2' }).message).toBe('')
  })

  it('resets to the shared idle state', () => {
    const found = scanReducer(IDLE_SCAN, { type: 'found', sample })
    expect(scanReducer(found, { type: 'reset' })).toBe(IDLE_SCAN)
  })

  it('ignores an event it does not know, and mutates nothing', () => {
    const found = scanReducer(IDLE_SCAN, { type: 'found', sample })
    expect(scanReducer(found, { type: 'wat' })).toBe(found)
    expect(scanReducer(found)).toBe(found)
    expect(found.sample).toBe(sample)
  })
})

describe('cameraRefusal', () => {
  it('names the way forward for each refusal, and it is always the box', () => {
    // US-005: the wedge input is the fallback, and it is already on screen.
    for (const name of [
      'NotAllowedError',
      'NotFoundError',
      'NotReadableError',
      'OverconstrainedError',
      'SecurityError',
    ]) {
      expect(cameraRefusal({ name })).toMatch(/box above|wedge/i)
    }
  })

  it('distinguishes a refused permission from a missing camera', () => {
    expect(cameraRefusal({ name: 'NotAllowedError' })).not.toBe(cameraRefusal({ name: 'NotFoundError' }))
  })

  it('still says something useful for an error it has never seen', () => {
    expect(cameraRefusal(new Error('boom'))).toMatch(/box above/i)
    expect(cameraRefusal(undefined)).toMatch(/box above/i)
  })
})

describe('the decoder is loaded on this route only', () => {
  const sources = readdirSync(new URL('..', import.meta.url), { recursive: true })
    // Test files are excluded: this one names the package in its own
    // assertions, and a test cannot put anything in a chunk.
    .filter((name) => /\.jsx?$/.test(String(name)) && !/\.test\.jsx?$/.test(String(name)))
    .map((name) => ({ name: String(name), text: readFileSync(new URL(`../${name}`, import.meta.url), 'utf8') }))

  it('is imported by exactly one module in the whole app', () => {
    // The bundle argument in one assertion: if a second file imported the
    // decoder statically, Rollup would fold the WebAssembly glue into whatever
    // chunk that file lives in and every screen would pay for it.
    const importers = sources.filter((file) => file.text.includes("zxing-wasm")).map((file) => file.name)
    expect(importers).toEqual(['screens/scannerDecoder.js'])
  })

  it('is reached by a dynamic import, never a static one', () => {
    expect(SCREEN_SOURCE).toContain("await import('./scannerDecoder.js')")
    expect(SCREEN_SOURCE).not.toMatch(/^import[^\n]*scannerDecoder/m)
    // And nothing else in the app pulls it in either.
    const importers = sources
      .filter((file) => /from ['"][^'"]*scannerDecoder/.test(file.text))
      .map((file) => file.name)
    expect(importers).toEqual([])
  })

  it('keeps the rules module free of the decoder, so tests need no wasm', () => {
    expect(RULES_SOURCE).not.toContain("from 'zxing-wasm")
    expect(RULES_SOURCE).not.toContain('import(')
  })
})

describe('the .wasm is served by us, not by a CDN', () => {
  it('bundles the binary and overrides the module locator', () => {
    // zxing-wasm's default locateFile points at jsdelivr, which would make a
    // showroom scan depend on a third party — the one thing the client ruled
    // out. Vite's ?url emits the binary into dist/assets and hands back a
    // same-origin path.
    expect(DECODER_SOURCE).toContain("zxing-wasm/reader/zxing_reader.wasm?url")
    expect(DECODER_SOURCE).toContain('prepareZXingModule({')
    expect(DECODER_SOURCE).toContain('locateFile')
  })

  it('names no external host', () => {
    // The scan bans a URL naming a HOST rather than the word "jsdelivr", so
    // the comment above may still explain why the override exists and the
    // insecure-origin note may still tell staff to use an https:// address —
    // the same distinction the samples screens' Dynamics scan draws.
    for (const source of [RULES_SOURCE, DECODER_SOURCE, SCREEN_SOURCE]) {
      expect(source).not.toMatch(/https?:\/\/[a-z0-9-]+\.[a-z]/i)
    }
  })
})

describe('the screen keeps the wedge, and takes every decision from here', () => {
  it('still autofocuses one input that submits itself', () => {
    // US-005. A wedge scanner is a keyboard: it types the code and its Enter
    // submits the form. It costs nothing to keep and is the only thing that
    // works when the camera is refused.
    expect(SCREEN_SOURCE).toContain('autoFocus')
    expect(SCREEN_SOURCE).toContain('<form onSubmit={lookup}')
  })

  it('routes every camera decode through the tested gate', () => {
    expect(SCREEN_SOURCE).toContain('admitRead(readRef.current')
    expect(SCREEN_SOURCE).toContain('scannerCapability(readEnvironment(globalThis))')
    expect(SCREEN_SOURCE).toContain('cameraRefusal(err)')
    expect(SCREEN_SOURCE).toContain('nativeFormatPlan(')
  })

  it('stops the stream when the screen goes', () => {
    // Leaving getTracks() running leaves the camera light on over a screen the
    // staff member has navigated away from.
    expect(SCREEN_SOURCE).toContain('track.stop()')
    expect(SCREEN_SOURCE).toContain('useEffect(() => stopCamera, [stopCamera])')
  })

  it('reads an elapsed-milliseconds clock, never a date', () => {
    // adminSamples.test.js bans Date tokens from this screen because a sample's
    // `overdue` is the API's boolean. performance.now() measures the gap
    // between two decodes and cannot be confused with a due-back comparison.
    expect(SCREEN_SOURCE).toContain('performance.now()')
    for (const source of [RULES_SOURCE, DECODER_SOURCE, SCREEN_SOURCE]) {
      expect(source).not.toMatch(/Date\.now\(/)
      expect(source).not.toMatch(/new Date\(/)
      expect(source).not.toMatch(/Date\.parse\(/)
      expect(source).not.toMatch(/getTime\(/)
    }
  })

  it('decodes about four times a second', () => {
    // Faster buys nothing — a hand cannot present two tags in 250 ms — and
    // costs battery on the device most likely to be running this.
    expect(SCAN_INTERVAL_MS).toBe(250)
    expect(SCREEN_SOURCE).toContain('setInterval(tick, SCAN_INTERVAL_MS)')
  })
})
