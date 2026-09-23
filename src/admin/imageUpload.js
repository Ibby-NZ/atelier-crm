// Image fields — the pure half of <ImageField> (./ImageField.jsx).
//
// Every storefront image the CRM sets used to be a pasted address: the house
// image and logo, a collection's tile, a product's hi-res asset and each
// colourway's photograph. The field now uploads the file and writes the address
// the API hands back into the SAME column, so nothing downstream moves — the
// draft still holds a URL string, `diffFields` still diffs it, the storefront
// still reads `*_url`. Pasting a link stays possible as the secondary path.
//
// The request (atelier-api, not built yet — see the PR that added this file):
//
//   POST /admin/media?field=<table.column>&filename=<name>
//        Content-Type: image/jpeg | image/png | image/webp   body: the raw bytes
//     → 201 { media: { id, url, filename, mime, size, width, height } }
//
// **Raw bytes, not multipart.** atelier-api has no multipart parser by decision
// (admin-price-list-import.js says so), and every upload the CRM already makes —
// price lists, the product sheet, freight, the Dynamics bundle — posts the File
// as the body with its type stated. The metadata rides in the query string, so
// no custom header needs a CORS allowance.
//
// **`url` must come back absolute.** brands.image_url, brands.logo_url and
// collections.image_url go through the API's websiteUrlFrom, which 422s a
// root-relative path — and EmDash serves its media at one
// (/_emdash/api/media/file/<key>), so the API has to prefix the storefront's
// origin. readUpload refuses anything else rather than let the save fail later.
//
// ponytail: until the route exists the upload answers 404, which uploadMessage
// turns into "paste a link for now" — the link path is the old field, unchanged.

import { parseUrl } from './drafts.js'
import { apiUpload } from '../lib/api.js'

export const MEDIA_UPLOAD_PATH = '/admin/media'

// Must equal the route's bodyLimit in atelier-api, and whatever sits in front of
// it must let a body this size through — nginx's default is 1 MB (see the PR).
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const EXTENSION_TYPES = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
})

// Names some systems still report for the same two formats.
const TYPE_ALIASES = Object.freeze({
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
})

// SVG is left out on purpose: it is a document that can carry script, and the
// file would be served from the storefront's own origin.
const PHOTO = Object.freeze({
  types: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  label: 'JPEG, PNG or WebP',
  refusal: 'is not a JPEG, PNG or WebP image.',
  ground: 'light',
})

// The mark is drawn over the house photograph, so it has to have a transparent
// background — a JPEG cannot, and would sit on the tile as a box. It is white on
// nothing, so its preview is drawn on a dark ground or it would be invisible.
const LOGO = Object.freeze({
  types: Object.freeze(['image/png', 'image/webp']),
  label: 'PNG or WebP with a transparent background',
  refusal: 'is not a PNG or WebP. A logo needs a transparent background, which a JPEG cannot have.',
  ground: 'dark',
})

// One entry per column the CRM uploads into — keyed `table.column`, which is
// also the `field` the API is told, so it can pick the folder, check the type
// again and record where the file went.
export const IMAGE_FIELDS = Object.freeze({
  'brands.image_url': PHOTO,
  'brands.logo_url': LOGO,
  'collections.image_url': PHOTO,
  'products.hi_res_asset_url': PHOTO,
  'colourways.image_url': PHOTO,
})

/**
 * The declaration for a column. Throws on an unknown key — that is a typo in a
 * screen, and silently accepting every type would hide it.
 *
 * @param {string} field e.g. 'brands.logo_url'
 */
export function imageField(field) {
  const spec = IMAGE_FIELDS[field]
  if (!spec) throw new Error(`Unknown image field "${field}".`)
  return spec
}

/**
 * The type the upload is SENT as. Stated rather than forwarded: a browser can
 * report an empty type for a file it does not recognise, so the extension is the
 * fallback. Null for anything that is not one of the three image types.
 *
 * @param {{ name?: string, type?: string }} file
 * @returns {string|null}
 */
export function imageTypeOf(file) {
  const lower = typeof file?.type === 'string' ? file.type.toLowerCase() : ''
  const reported = TYPE_ALIASES[lower] ?? lower
  if (Object.values(EXTENSION_TYPES).includes(reported)) return reported
  if (reported !== '') return null
  const extension = /\.([a-z0-9]+)$/i.exec(file?.name ?? '')?.[1]?.toLowerCase()
  return (extension && EXTENSION_TYPES[extension]) || null
}

// '820 KB', '1.4 MB', '10 MB'. Binary units, because that is what the limit is.
export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  const mb = n / (1024 * 1024)
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`
}

/**
 * What is wrong with a chosen file before it is sent, or null when nothing is.
 * Only what the API would answer less readably: the API still checks the bytes
 * themselves — a renamed PDF has an image extension and is not an image.
 *
 * @param {File|{ name?: string, type?: string, size?: number }|null} file
 * @param {string} field
 * @returns {string|null}
 */
export function imageProblem(file, field) {
  const spec = imageField(field)
  if (!file) return 'Choose an image first.'
  const name = file.name || 'That file'
  const type = imageTypeOf(file)
  if (!type || !spec.types.includes(type)) return `${name} ${spec.refusal}`
  const size = Number(file.size)
  if (Number.isFinite(size)) {
    if (size === 0) return `${name} is empty.`
    if (size > MAX_IMAGE_BYTES) {
      const limit = formatBytes(MAX_IMAGE_BYTES)
      // Rounded, a file a few bytes over would read "is 10 MB — the limit is 10 MB".
      const actual = formatBytes(size) === limit ? `just over ${limit}` : formatBytes(size)
      return `${name} is ${actual} — the limit is ${limit}. Save a smaller copy (2560 pixels on the long edge is plenty for the website) and try again.`
    }
  }
  return null
}

/**
 * @param {string} field
 * @param {string} filename
 * @returns {string}
 */
export function uploadPath(field, filename) {
  imageField(field)
  const query = new URLSearchParams({ field })
  if (filename) query.set('filename', filename)
  return `${MEDIA_UPLOAD_PATH}?${query}`
}

/**
 * The address to store from the API's answer, or why there is none.
 *
 * @param {unknown} body
 * @returns {{ url: string, media: object }|{ error: string }}
 */
export function readUpload(body) {
  const media = body && typeof body === 'object' ? body.media : null
  const parsed = parseUrl(typeof media?.url === 'string' ? media.url : '')
  if (!parsed.ok || parsed.value == null) {
    return { error: 'The image uploaded, but the API did not send back a full web address for it.' }
  }
  return { url: parsed.value, media }
}

/**
 * The sentence for a failed upload. The API phrases its own refusals, so its
 * message wins except where the status says more than the body does.
 *
 * @param {{ status?: number, message?: string, aborted?: boolean }} error
 * @returns {string}
 */
export function uploadMessage(error) {
  if (error?.aborted) return ''
  switch (error?.status) {
    // No route yet. A 405/501 is the same news from a proxy in front.
    case 404:
    case 405:
    case 501:
      return 'Image upload is not switched on in the API yet. Paste a link to the image for now.'
    // Often nginx rather than the API, with an HTML body and no sentence of ours.
    case 413:
      return 'That image is larger than the server accepts. Save a smaller copy and try again.'
    case 415:
      return 'The server refused that type of file. Use a JPEG, PNG or WebP.'
    default:
      return error?.message || 'The image could not be uploaded.'
  }
}

/**
 * The file's own name from a stored address — what the asset card shows. Empty
 * when the address has no path to name it by.
 *
 * @param {string} url
 * @returns {string}
 */
export function fileNameFromUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return ''
  let path
  try {
    path = new URL(url.trim()).pathname
  } catch {
    path = url.trim().split(/[?#]/)[0]
  }
  const last = path.split('/').filter(Boolean).pop() ?? ''
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/**
 * The asset card's second line: '2560 × 1707 · JPEG · 1.4 MB', each part only
 * when it is known — an address typed by hand has no size.
 *
 * @param {{ width?: number, height?: number, name?: string, bytes?: number }} image
 * @returns {string}
 */
export function describeImage({ width, height, name, bytes } = {}) {
  const parts = []
  if (width > 0 && height > 0) parts.push(`${width} × ${height}`)
  const extension = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]
  if (extension) parts.push(extension.toUpperCase())
  if (bytes > 0) parts.push(formatBytes(bytes))
  return parts.join(' · ')
}

/**
 * Check, send and read one image. Resolves to the address to store; rejects with
 * an Error whose `message` is the sentence to show (empty, with `aborted`, when
 * the person cancelled). `send` is injected so the whole cycle tests without a
 * network — the default is apiUpload.
 *
 * @param {File} file
 * @param {string} field
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal,
 *           send?: typeof apiUpload }} [options]
 * @returns {Promise<{ url: string, media: object }>}
 */
export async function uploadImage(file, field, { onProgress, signal, send = apiUpload } = {}) {
  const problem = imageProblem(file, field)
  if (problem) throw new Error(problem)
  let body
  try {
    body = await send(uploadPath(field, file.name), file, {
      contentType: imageTypeOf(file),
      onProgress,
      signal,
    })
  } catch (error) {
    const failure = new Error(uploadMessage(error))
    failure.aborted = Boolean(error?.aborted)
    failure.status = error?.status
    throw failure
  }
  const read = readUpload(body)
  if (read.error) throw new Error(read.error)
  return read
}
