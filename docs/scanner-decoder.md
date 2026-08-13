# The scanner's decoder — options, measurements and recommendation

**Workstream:** W22 · **Date:** 2026-08-13 · **Status:** decided and implemented
**Supersedes:** ADR 001 (atelier-api `_bmad-output/planning-artifacts/architecture.md`)
**Prior analysis:** `research-sample-scanner.md` in the same folder

## The question

The client's instruction was *"something similar to Orca Scan, but we do not want any third party
dependency — everything should connect to the CRM."* So the scanner is first-party, inside the CRM,
posting to atelier-api and to nothing else. No Orca Scan, no commercial SDK, no Power Platform.

That decides the product and leaves one engineering question: **what decodes the barcode?**

This repo has three runtime dependencies — `react`, `react-dom`, `react-router-dom`. A fourth is an
architectural act, not a footnote, so the options below are measured rather than estimated.

## The finding that shapes everything, and has not gone away

**`BarcodeDetector` is not implemented on iOS.** Safari does not provide it, and every iOS browser is
WebKit underneath, so Chrome and Firefox on an iPad do not either. A web app calling it fails
*silently* — the constructor is simply absent.

A design showroom runs on iPads. So a camera scanner that only uses the native API is a scanner that
does not work at Atelier, and the WebAssembly cost ADR 001 declined to pay is unavoidable **for those
devices**. What is avoidable is making everyone else pay it, which is what the capability decision in
`src/screens/scanner.js` is for.

## What was measured

Three isolated Vite builds, each an entry importing one candidate and nothing else, so the number is
the decoder's own cost with React and the app excluded. Reproduce by pointing
`build.rollupOptions.input` at a one-line module that imports the package. Gzip is `gzip -c | wc -c`
(what a correctly configured nginx serves).

| Option | Licence | Last publish | JS raw | JS gzip | .wasm raw | .wasm gzip | Over the wire |
|---|---|---|---|---|---|---|---|
| **A. `zxing-wasm@3.1.2` (`/reader`)** — zxing-cpp compiled to WASM | MIT | 2026-07-18 | 35,716 | **12,857** | 1,065,634 | **448,278** | **461 kB** |
| **B. `barcode-detector@3.2.1`** — a `BarcodeDetector` polyfill that ships A underneath | MIT | 2026-07-12 | 42,907 | 15,108 | *(same file as A)* | 448,278 | 463 kB |
| **C. `@zxing/library@0.23.0`** — the pure-JavaScript ZXing port | Apache-2.0 | 2026-04-29 | 430,916 | **111,448** | — | — | **111 kB** |
| **D. Native `BarcodeDetector`** — where the browser has one | n/a | n/a | 0 | 0 | — | — | **0** |

Symbology check — the register's barcodes are Atelier-issued and alphanumeric (`ATL-0049-217`), which
means Code 128 in practice (Code 39 and QR are the plausible alternatives; EAN/UPC are numeric-only
and therefore impossible). **A, B, C and D can all decode Code 128, Code 39 and QR**, so symbology
support does not separate them. What separates them is decode quality on a moving hand-held frame,
which is the thing staff complain about, and where zxing-cpp is materially better than the JS port.

Two more measured facts that decided A over B:

- **B is not one dependency, it is two.** `barcode-detector` vendors zxing-wasm into its own dist and
  its default `locateFile` points at **jsDelivr**. To keep the binary first-party you must install
  `zxing-wasm` as well, to import the `.wasm` and hand it over — so B costs both packages plus 2.3 kB
  gzip of polyfill, and buys an API shape that a ten-line adapter provides (`createWasmDetector` in
  `src/screens/scannerDecoder.js` returns `detect(video) → [{ rawValue, format }]`, which is what
  native returns).
- **C declares `engines: { node: ">= 24.0.0" }`** and CI runs Node 22 (`.github/workflows/ci.yml`), so
  `npm ci` prints `EBADENGINE` on every run and an `engine-strict` setting anywhere would break the
  build outright.

## Recommendation, and what was implemented

**Native `BarcodeDetector` when the browser has one; `zxing-wasm/reader` (option A) as the bundled
fallback, dynamically imported, with the `.wasm` served from our own origin.**

That is one new runtime dependency (a fourth), MIT-licensed, tracking the actively maintained
zxing-cpp upstream.

Three properties are load-bearing:

1. **The download is an iOS-and-Safari cost, not everyone's.** `scannerCapability()` decides
   native / wasm / wedge-only before anything is fetched. Chrome on Android, on ChromeOS and on the
   desktop decodes natively and never touches the WASM path.
2. **The decoder is behind `await import()`**, in a module (`scannerDecoder.js`) that nothing else in
   the app imports — a unit test asserts exactly that, by scanning every `.js`/`.jsx` under `src/`.
   So it is a chunk of its own, fetched on first use of the camera, and the main bundle is untouched.
3. **The `.wasm` is ours.** zxing-wasm's default `locateFile` points at jsDelivr; the module overrides
   it with a Vite `?url` import, which emits the binary into `dist/assets/` and returns a hashed
   same-origin path. A showroom scan therefore reaches atelier-crm and atelier-api and nothing else,
   which is the client's instruction restated as code. (The package's CDN string is still minified
   into the chunk as unreachable dead code; the override is applied at module scope, before the one
   call that would read it.)

### Bundle delta, integrated (`npm run build`)

| | before | after | delta |
|---|---|---|---|
| `index-*.js` (every screen pays) | 763.49 kB / 204.97 kB gzip | 770.71 kB / 207.84 kB gzip | **+7.22 kB / +2.87 kB gzip** |
| `scannerDecoder-*.js` (lazy) | — | 36.44 kB / 13.21 kB gzip | new chunk |
| `zxing_reader-*.wasm` (lazy) | — | 1,065.87 kB / 448.31 kB gzip | new asset |

The main-chunk growth is the screen itself — the camera panel, the capability copy and the rules
module — not the decoder. The 500 kB warning was already there before this change (the app is one
chunk) and is no worse for any other screen. Lazy-loading the whole `/sample-scanner` route would
*reduce* the main chunk; that is a routing change across `App.jsx` and is the obvious next step if the
main bundle is ever attacked properly.

### The conditions under which this recommendation holds

- **It holds while the showroom is on iPads.** If every scanning device turned out to be Android, the
  fallback would still be dead weight in the repo but would never be downloaded — no reason to
  revisit.
- **It stops holding if the register adopts a symbology zxing-cpp does not read** (none of the
  plausible ones qualify), or if Apple ships `BarcodeDetector` in WebKit — at which point the
  capability decision picks native on its own and the dependency can be deleted with no other change.
- **It stops holding if decode quality is the complaint.** Then the question is a commercial SDK
  (four figures a year, licensed) and this document is the baseline it must beat. Test A first with
  `tryHarder` and the frame size in `scanner.js`, which are one line each.
- **C becomes the better answer** only if the 1 MB binary is genuinely unaffordable — a metered
  connection, a very slow line — and the slower, less tolerant JS decode is acceptable in exchange.
  It is 350 kB gzip cheaper and that is a real difference; it lost on decode quality, on the Node
  engines mismatch with CI, and because the binary is cached after the first scan.
- **The wedge scanner is not superseded by any of this.** ADR 001's actual decision — that a
  keyboard-wedge scanner is the right primary at a counter — survives intact. The camera is the
  second door, for walking a shelf.

## What is NOT verified, and cannot be here

This repo has **no jsdom, no browser in CI and no camera**. Everything below is stated plainly because
a report that implies otherwise is worse than no report:

- **No decode has been proven.** Nothing in the test suite has ever turned a photograph of a barcode
  into a string. `npm test` covers the capability decision, the format vocabularies, the shape guard,
  the debounce and busy interlock, the decode-result state machine, the camera-refusal copy, and —
  by source scan — that the decoder is dynamically imported by exactly one module and loads its
  binary from our own origin. It does not cover `readBarcodes` itself, `getUserMedia`, the canvas
  frame grab, or the `<video>` element.
- **The WASM download has been measured but not exercised.** The build emits it; no test fetches it.
- **`BarcodeDetector.getSupportedFormats()` has not been observed on a real device.** The plan built
  from its answer (`nativeFormatPlan`) is tested against every list shape; the list itself is the
  platform's.
- **iOS behaviour is inferred from the documented absence of the API**, not from a device in this
  session. The fallback exists precisely because that inference could be wrong in the safe direction
  only.

The manual procedure below is what closes those gaps. It needs a person, an iPad and a printed tag.

## Manual test procedure

### 0. What you need

- An iPad (or iPhone) and an Android phone if you have one — the two halves of the decision.
- A printed tag. Any barcode generator that emits **Code 128** will do; encode a barcode that exists
  in the register (Sample register → the Barcode column), and a second one that does not.
- The CRM **on https or on localhost**. `getUserMedia` is secure-context only, and the screen will say
  so and offer the wedge box if you get this wrong — which is itself one of the checks.

To serve it over https locally, without adding a dependency:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout /tmp/crm-key.pem -out /tmp/crm-cert.pem -subj "/CN=$(ipconfig getifaddr en0)" \
  -addext "subjectAltName=IP:$(ipconfig getifaddr en0)"
```

then add to `vite.config.js` **temporarily** (do not commit):

```js
server: { host: true, port: 5273, https: { key: '/tmp/crm-key.pem', cert: '/tmp/crm-cert.pem' } }
```

Open `https://<laptop-ip>:5273/#/sample-scanner` on the iPad and accept the certificate warning.
(Trusting it properly: mail yourself `crm-cert.pem`, install the profile, then Settings → General →
About → Certificate Trust Settings.) atelier-api must also be reachable from the iPad — set
`VITE_API_BASE_URL` to the laptop's address, and `CRM_BASE_URL` on the API to the https origin, or
CORS refuses every call including sign-in.

### 1. The capability decision (the point of the whole exercise)

| Device | Expected |
|---|---|
| **iPad / iPhone, any browser** | "Use the camera" is offered. Starting it downloads ~1 MB once (visible in Safari's Web Inspector network tab as `zxing_reader-*.wasm`, from **your** origin — if it comes from `cdn.jsdelivr.net`, this document's central claim is broken). The panel then reads **"Decoding with the downloaded reader"**. |
| **Android Chrome** | Camera starts with **no** `.wasm` request at all. The panel reads **"Decoding in the browser"**. |
| **Any device on plain `http://`** | No camera button. The note names https and localhost, and the barcode box above still works. |
| **A desktop with no webcam** | No camera button; the note says so. |

### 2. Permission and refusal (US-005)

1. Start the camera and **deny** the prompt → a sentence naming site settings, the box above still
   focused and usable. Nothing hangs, no blank panel.
2. Reload, allow it → the preview appears within a second or two.
3. Navigate away to the Sample register while the camera is live → **the camera light goes out**.
   (This is the one failure that is invisible on the screen itself.)

### 3. Scanning (US-002 / US-003 / US-004)

1. Hold the registered tag in the frame. It should look itself up **once** — the sample panel
   appears, and holding the tag there does not re-fire (watch the network tab: one
   `by-barcode` request, not four a second).
2. Take the tag away and present it again after ~3 seconds → it looks up again.
3. Check out to a holder name, with and without a due-back date. The panel should flip to "Out
   with …" and offer **Check in**. Confirm on the Sample register that a loan row exists.
4. Check in → back to "On the shelf".
5. Present the **unregistered** tag → "Not in the register", naming the code, with a link to the
   register. This is an answer, not an error: no red line.
6. With the camera still live, type a barcode into the box and press Enter → same result. Then scan
   with a **wedge scanner** into the same box → same result again.
7. Present two different tags in quick succession → the second replaces the first. (Known and
   accepted: a half-typed check-out form is discarded when a different tag is scanned. Use "Scan
   next" or the wedge box if that ever bites.)

### 4. Decode quality — the thing to actually report back

Note how it behaves at arm's length, at an angle, and under showroom lighting, on both devices. If
the iPad is noticeably worse than the Android phone, that is the WASM-vs-native gap this document
predicts, and the knobs are `WASM_READER_OPTIONS` (`tryHarder`), `MAX_DECODE_WIDTH` and
`SCAN_INTERVAL_MS` in `src/screens/scanner.js` — all three are one-line changes and none of them is
a redesign.

## Files

| Story | File |
|---|---|
| US-001 | this document; `package.json` (one new dependency, `zxing-wasm`) |
| US-002 | `src/screens/scannerDecoder.js` (dynamically imported), `src/screens/SampleScanner.jsx` |
| US-003 / US-004 | `src/screens/SampleScanner.jsx` — unchanged calls into `src/screens/adminSamples.js` |
| US-005 | `src/screens/SampleScanner.jsx` (the box was already there), `cameraRefusal` in `scanner.js` |
| US-006 | `src/screens/scanner.js` + `src/screens/scanner.test.js` |
