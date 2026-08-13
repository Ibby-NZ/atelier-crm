// The camera scanner's rules — pure, so every one of them tests without a
// camera, a permission prompt or a DOM. There is no jsdom in this repo, so the
// .jsx beside this file is layout and effects only; anything that is a DECISION
// lives here (the same split adminSamples.js / AdminSamples.jsx already draws).
//
// Four decisions shape the screen, and each is a correctness rule:
//
//   - **`BarcodeDetector` does not exist on iOS.** Safari does not implement it
//     and every iOS browser is WebKit underneath, so Chrome and Firefox on an
//     iPad do not either — and it fails SILENTLY, because the constructor is
//     simply absent. `scannerCapability` is what turns that absence into a
//     choice (native / bundled wasm / wedge-only) rather than a blank screen,
//     and it is why the wasm decoder is dynamically imported: Android and
//     desktop Chrome must never download it.
//   - **A camera is a privilege, not a given.** A denied permission, a device
//     with no camera, and a page served over plain http (getUserMedia is
//     secure-context only) are three different answers and each has to SAY so —
//     the wedge box is still there and still works, which is the whole point of
//     keeping it.
//   - **A video stream decodes the same label many times a second.** Without
//     `admitRead` a single tag held in frame would fire a lookup per frame, and
//     a check-out could be posted twice. The gate is a debounce plus a busy
//     interlock, and it is the piece most worth having under test.
//   - **A 404 from the by-barcode read is an ANSWER, not an error** (a real tag
//     the register has never heard of). `scanReducer` keeps `missing` as its own
//     state for that reason — see `isNotFound` in adminSamples.js.
//
// No date arithmetic here or in the screen: `adminSamples.test.js` bans every
// way of reading the device's calendar from both files, because a sample's
// `overdue` is the API's boolean and a showroom laptop set an hour fast would
// otherwise chase a client whose sample is not late. The debounce clock is
// `performance.now()`, a monotonic elapsed-milliseconds counter rather than a
// calendar: it answers "how long since the last decode", never "is this late
// back". A source scan holds all three files to it.

/**
 * The symbologies we ask a decoder for, in both vocabularies at once: the
 * W3C/`BarcodeDetector` names and zxing-cpp's. Declaring the pair together is
 * what stops the two lists drifting.
 *
 * The register's barcodes are Atelier-issued and alphanumeric (`ATL-0049-217`),
 * so a retail EAN/UPC is not in this list on purpose — it could never match the
 * by-barcode read, and every extra symbology is time spent per frame. Adding a
 * supplier's own EAN tags later is one line here.
 */
export const SCAN_FORMATS = Object.freeze([
  Object.freeze({ native: 'code_128', zxing: 'Code128' }),
  Object.freeze({ native: 'code_39', zxing: 'Code39' }),
  Object.freeze({ native: 'qr_code', zxing: 'QRCode' }),
])

export const NATIVE_FORMATS = Object.freeze(SCAN_FORMATS.map((format) => format.native))
export const ZXING_FORMATS = Object.freeze(SCAN_FORMATS.map((format) => format.zxing))

/**
 * The one symbology a native implementation must support for us to use it.
 * Code 128 is what a label printer emits for `ATL-0049-217` by default (it is
 * the only one of the three that carries mixed case and punctuation compactly),
 * so a `BarcodeDetector` without it is not a scanner for THIS register however
 * many other formats it lists.
 */
export const ESSENTIAL_FORMAT = 'code_128'

/** Reader options for the bundled decoder. `maxNumberOfSymbols: 1` because a
 * frame holding two tags is an ambiguous scan, not two movements. */
export const WASM_READER_OPTIONS = Object.freeze({
  formats: ZXING_FORMATS,
  tryHarder: true,
  maxNumberOfSymbols: 1,
})

/** ~4 decodes a second. Faster buys nothing (a hand cannot present two tags in
 * 250 ms) and costs battery on the device most likely to be running this. */
export const SCAN_INTERVAL_MS = 250

/** A frame wider than this is scaled down before decoding: a 4K iPad frame
 * costs several times the decode time and adds no detail a printed label needs. */
export const MAX_DECODE_WIDTH = 1280

/** How long the same code stays suppressed after it was accepted. Long enough
 * that a tag resting in frame is read once; short enough that a deliberate
 * re-scan does not feel broken. "Scan next" clears the memory outright. */
export const REPEAT_WINDOW_MS = 2500

/** The rear camera, at a size worth decoding. `ideal` rather than `exact` — an
 * `exact` facingMode is an OverconstrainedError on every laptop. */
export const VIDEO_CONSTRAINTS = Object.freeze({
  audio: false,
  video: Object.freeze({
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  }),
})

const CAPABILITIES = Object.freeze({
  native: Object.freeze({
    mode: 'native',
    reason: 'native-detector',
    note: "This browser decodes barcodes itself, so nothing extra is downloaded.",
  }),
  wasm: Object.freeze({
    mode: 'wasm',
    reason: 'no-native-detector',
    note:
      'This browser has no built-in barcode reader — Safari and every browser on an iPad or iPhone are in that position — so starting the camera downloads a decoder once (about 1 MB, then cached).',
  }),
  insecure: Object.freeze({
    mode: 'wedge-only',
    reason: 'insecure-origin',
    note:
      'The camera needs a secure page: an https:// address, or localhost. This page is neither, so open the CRM over https to scan with a camera. The box above still works with a wedge scanner.',
  }),
  noCamera: Object.freeze({
    mode: 'wedge-only',
    reason: 'no-camera',
    note:
      'This device offers no camera to the browser. Scan with a wedge scanner into the box above, or type the barcode.',
  }),
})

/**
 * Read the three facts the capability decision turns on out of a window-like
 * object. Passed in rather than reached for, so a test can state any device.
 *
 * @param {{ isSecureContext?: boolean, BarcodeDetector?: unknown,
 *   navigator?: { mediaDevices?: { getUserMedia?: unknown } } }} [win]
 * @returns {{ secure: boolean, camera: boolean, detector: boolean }}
 */
export function readEnvironment(win = {}) {
  return {
    secure: win.isSecureContext === true,
    camera: typeof win.navigator?.mediaDevices?.getUserMedia === 'function',
    detector: typeof win.BarcodeDetector === 'function',
  }
}

/**
 * Which scanner this device can offer, and the sentence that says why.
 *
 * Order matters: a page on plain http has no camera to ask about, so the origin
 * is checked before the hardware. `wedge-only` is not a failure — it is the
 * answer the counter runs on anyway.
 *
 * @param {{ secure?: boolean, camera?: boolean, detector?: boolean }} [env]
 * @returns {{ mode: 'native'|'wasm'|'wedge-only', reason: string, note: string }}
 */
export function scannerCapability(env = {}) {
  if (!env.secure) return CAPABILITIES.insecure
  if (!env.camera) return CAPABILITIES.noCamera
  return env.detector ? CAPABILITIES.native : CAPABILITIES.wasm
}

/**
 * What to do with a native `BarcodeDetector` once it has said which formats it
 * actually supports — which is a per-platform list, not a constant, and is only
 * knowable asynchronously.
 *
 * `ok: false` means "fall through to the bundled decoder": the native reader is
 * present but cannot read the symbology this register prints, and a scanner
 * that silently never matches is worse than a 1 MB download.
 *
 * @param {string[]} supported
 * @returns {{ ok: boolean, formats: string[] }}
 */
export function nativeFormatPlan(supported) {
  const offered = Array.isArray(supported) ? supported : []
  const formats = NATIVE_FORMATS.filter((format) => offered.includes(format))
  return { ok: formats.includes(ESSENTIAL_FORMAT), formats }
}

/** A decode is bytes off a camera: trim it, and treat anything else as empty. */
export const normaliseRead = (value) => (typeof value === 'string' ? value.trim() : '')

export const MIN_BARCODE_LENGTH = 3
export const MAX_BARCODE_LENGTH = 64

/**
 * The shape guard. A decoder under a moving camera occasionally emits a partial
 * or a stray symbol, and every accepted read costs a request and a state change.
 *
 * It deliberately does NOT enforce Atelier's `ATL-…` shape: `samples.barcode` is
 * free text, and a guard that knew the format would refuse a tag the register
 * happily holds. What it refuses is what a printed barcode can never be — empty,
 * absurdly short or long, or carrying whitespace or a control character in the
 * middle (a wedge scanner's trailing Enter is a submit, not part of the code).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlausibleBarcode(value) {
  const code = normaliseRead(value)
  if (code.length < MIN_BARCODE_LENGTH || code.length > MAX_BARCODE_LENGTH) return false
  // A barcode is printable and unbroken: anything at or below the space, and
  // DEL, is a stray byte from a half-decoded frame. The code is already
  // trimmed, so this can only fire on the inside of it. A hyphen is legal —
  // `ATL-0049-217` is the register's own shape.
  for (const character of code) {
    const point = character.codePointAt(0)
    if (point <= 0x20 || point === 0x7f) return false
  }
  return true
}

/**
 * The gate between the decode loop and the API. Returns whether to look this
 * read up, and the memory to carry into the next frame.
 *
 * Three refusals, and the middle one is the reason this function exists:
 *
 *   - the read is not barcode-shaped;
 *   - a request is already in flight (`busy`) — a video stream decodes the same
 *     label 4 times a second, and without this a check-out is posted twice;
 *   - the same code was accepted moments ago. Its timestamp is REFRESHED while
 *     it is refused, so a tag resting in frame stays suppressed rather than
 *     re-firing every `repeatWindowMs`.
 *
 * `at` is elapsed milliseconds (performance.now()), never a date.
 *
 * @param {{ code: string, at: number }|null} memory
 * @param {{ code?: unknown, at?: number, busy?: boolean, repeatWindowMs?: number }} read
 * @returns {{ accept: boolean, memory: {code: string, at: number}|null }}
 */
export function admitRead(memory, { code, at = 0, busy = false, repeatWindowMs = REPEAT_WINDOW_MS } = {}) {
  const value = normaliseRead(code)
  if (busy || !isPlausibleBarcode(value)) return { accept: false, memory }
  const repeat = memory?.code === value && at - memory.at < repeatWindowMs
  return { accept: !repeat, memory: { code: value, at } }
}

/** Nothing scanned yet. Frozen: it is shared by every reset. */
export const IDLE_SCAN = Object.freeze({ status: 'idle', sample: null, code: '', message: '' })

/**
 * The decode-result state machine — what the screen is showing about the last
 * scan, and the only thing that decides which panel is drawn.
 *
 *   idle → found   a sample came back
 *   idle → missing a real tag the register has never heard of (the by-barcode
 *                  404, which is an ANSWER: the panel offers to register it)
 *   any  → failed  the request itself failed. **The sample is kept**: a
 *                  check-out that is refused must leave the row and its form on
 *                  screen, or the error arrives about something invisible.
 *   any  → reset   "Scan next", and the debounce memory is cleared beside it so
 *                  the same tag can be scanned again immediately.
 *
 * A movement (check-out / check-in) answers with the same `{ sample }` shape a
 * read does, so it dispatches `found` too — that is what makes the panel show
 * the new state of the row without a second request.
 *
 * @param {{ status: string, sample: object|null, code: string, message: string }} state
 * @param {{ type: string, sample?: object, code?: string, message?: string }} event
 */
export function scanReducer(state = IDLE_SCAN, event = {}) {
  switch (event.type) {
    case 'found':
      return { status: 'found', sample: event.sample ?? null, code: event.sample?.barcode ?? '', message: '' }
    case 'missing':
      return { status: 'missing', sample: null, code: normaliseRead(event.code), message: '' }
    case 'failed':
      return { ...state, status: 'failed', message: event.message ?? '' }
    case 'reset':
      return IDLE_SCAN
    default:
      return state
  }
}

const REFUSALS = Object.freeze({
  NotAllowedError:
    'Camera access was refused. Allow it in the browser’s site settings, or keep using a wedge scanner in the box above.',
  NotFoundError: 'No camera was found on this device. The box above still works.',
  NotReadableError:
    'The camera is busy in another app. Close it and try again, or use the box above.',
  OverconstrainedError:
    'No camera on this device matched what the scanner asked for. Use the box above.',
  SecurityError:
    'The browser blocked the camera on this page. It needs an https:// address; the box above works either way.',
})

const REFUSAL_FALLBACK =
  'The camera could not be started. Scan into the box above instead — a wedge scanner needs no permission.'

/**
 * Why the camera did not start, in a sentence that names the way forward. Every
 * one of them points at the wedge box, because that is the fallback and it is
 * already on screen.
 *
 * @param {{ name?: string }|unknown} error
 * @returns {string}
 */
export const cameraRefusal = (error) => REFUSALS[error?.name] ?? REFUSAL_FALLBACK
