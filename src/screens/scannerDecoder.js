// The bundled fallback decoder — zxing-cpp compiled to WebAssembly.
//
// **This file is reached by `await import()` and by nothing else.** It is the
// only module in the CRM that pulls the decoder in, so Rollup gives it a chunk
// of its own and no other screen pays for it: the main bundle is unchanged, and
// even on the scanner route nothing is fetched until a device without a native
// `BarcodeDetector` actually starts the camera. That is the whole reason the
// capability decision (scanner.js) exists — Android and desktop Chrome decode
// natively and never load this; Safari and every browser on an iPad do.
//
// **The .wasm is served by us, never by a CDN.** zxing-wasm's default
// `locateFile` points at jsdelivr, which would make a showroom scan depend on a
// third party — exactly what the client ruled out ("no third party dependency,
// everything should connect to the CRM"). Importing the binary with Vite's
// `?url` emits it into `dist/assets/` and hands back its hashed same-origin
// path; the override below is what makes the module ask for that instead.
// A source scan in scanner.test.js holds both halves of that rule.
//
// Nothing here is unit-tested and nothing here can be: it needs a camera, a
// canvas and a GPU-backed video frame. Everything that is a DECISION was kept
// out of it — see scanner.js — so what is left is the call itself.

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { MAX_DECODE_WIDTH, WASM_READER_OPTIONS } from './scanner.js'

// At module scope, so it is in force before anything can instantiate the
// module — the emscripten glue asks `locateFile` once, at the first decode.
// (`prepareZXingModule` rather than the deprecated `setZXingModuleOverrides`.
// The package's default CDN path is still minified into this chunk as dead
// code; it is unreachable, because this override replaces it before the only
// call that would read it.)
prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : `${prefix}${path}`) },
})

/**
 * Grab the current video frame as ImageData, scaled down to something worth
 * decoding. An iPad's 4K frame costs several times the decode time and carries
 * no detail a printed label needs.
 *
 * @returns {ImageData|null} null while the stream has no dimensions yet — the
 *   first frames after `play()` are legitimately 0×0.
 */
function frameOf(video, canvas, context) {
  const width = video?.videoWidth ?? 0
  const height = video?.videoHeight ?? 0
  if (width === 0 || height === 0) return null
  const scale = Math.min(1, MAX_DECODE_WIDTH / width)
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)
  if (canvas.width !== targetWidth) canvas.width = targetWidth
  if (canvas.height !== targetHeight) canvas.height = targetHeight
  context.drawImage(video, 0, 0, targetWidth, targetHeight)
  return context.getImageData(0, 0, targetWidth, targetHeight)
}

/**
 * A detector with the same surface a native `BarcodeDetector` has —
 * `detect(video)` → `[{ rawValue, format }]` — so the screen has ONE call site
 * and cannot drift between the two paths.
 *
 * @returns {{ detect: (video: HTMLVideoElement) => Promise<{rawValue: string, format: string}[]> }}
 */
export function createWasmDetector() {
  const canvas = document.createElement('canvas')
  // willReadFrequently: this canvas exists to be read back several times a
  // second, which is the case the flag is for.
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return {
    async detect(video) {
      const frame = frameOf(video, canvas, context)
      if (!frame) return []
      const results = await readBarcodes(frame, WASM_READER_OPTIONS)
      return results
        .filter((result) => result.isValid && result.text)
        .map((result) => ({ rawValue: result.text, format: result.format }))
    },
  }
}
