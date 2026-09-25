// Shared fetch helper for talking to atelier-api (ported from the storefront's
// src/lib/api.js). One place for the base URL, credentials and error handling so
// screens never build raw fetch calls.
//
// The API session is an HttpOnly signed cookie, so every request must send
// credentials. Cross-origin (CRM :5273 → API :3001) is allowed by the API's CORS
// (the storefront origin plus this one — see atelier-api app.js).

import { BREAK_GLASS } from '../auth/breakGlassConfig.js'
import {
  browserStorage,
  readBreakGlassSession,
  OFFLINE_WRITE_MESSAGE,
} from '../auth/breakGlass.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const GENERIC_MESSAGE =
  'We could not load this right now. Please refresh or try again shortly.'
const NETWORK_MESSAGE =
  'We could not reach the API. Check it is running and try again.'

export class ApiError extends Error {
  constructor(message, status = 0, cause) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    // Parsed JSON error body, when the API returned one (422s carry
    // { message, errors: [{ field, message }] }).
    this.body = null
    if (cause) this.cause = cause
  }
}

function messageFromBody(body, status) {
  if (body && typeof body === 'object') {
    const detail = body.message || body.error
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  if (status === 404) return 'We could not find what you were looking for.'
  if (status === 401 || status === 403) return 'Please sign in to view this.'
  return GENERIC_MESSAGE
}

async function parseBody(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

// A break-glass session (see ../auth/breakGlass.js) is local-only and carries no
// API cookie, so every write it attempts would come back 401 the moment the API
// recovers — which reads as "the app is broken", not "you are not signed in".
// Refuse it here instead, with a sentence that says why. Reads are left alone:
// they also cannot see live data without the cookie, and letting them through
// keeps the failure honest. /auth/* is exempt so signing out — and then signing
// in properly once the API is back — still works.
function blockedWhileOffline(path, method) {
  if (method === 'GET' || method === 'HEAD') return false
  if (path.startsWith('/auth/')) return false
  return readBreakGlassSession(browserStorage(), BREAK_GLASS) !== null
}

// Throws ApiError on network failure or non-2xx. Returns parsed JSON otherwise.
export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (blockedWhileOffline(path, method)) {
    throw new ApiError(OFFLINE_WRITE_MESSAGE, 0)
  }

  const url = `${API_BASE_URL}${path}`
  let response
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    })
  } catch (cause) {
    throw new ApiError(NETWORK_MESSAGE, 0, cause)
  }

  const body = await parseBody(response)
  if (!response.ok) {
    const error = new ApiError(messageFromBody(body, response.status), response.status)
    error.body = body
    throw error
  }
  return body
}

// Never throws — returns { data, error }. Use where a screen should render an
// error state rather than crash.
export async function safeFetch(path, options = {}) {
  try {
    const data = await apiFetch(path, options)
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

// Convenience JSON helpers.
export const apiGet = (path) => apiFetch(path)
export const apiSend = (method, path, payload) =>
  apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// A DELETE carries no body, and must not claim to. apiSend('DELETE', path) would
// send `Content-Type: application/json` with `undefined` serialised away to an
// empty body, and Fastify rejects that with 400 FST_ERR_CTP_EMPTY_JSON_BODY in
// its content-type parser — before the route runs, so the answer says nothing
// about the row you were trying to delete. Sending neither header nor body is
// what makes the request reach the handler.
export const apiDelete = (path) => apiFetch(path, { method: 'DELETE' })

// A file upload that reports its progress — the image fields' request (see
// src/admin/imageUpload.js). fetch() cannot report upload progress, so this is
// the app's one XMLHttpRequest; everything else keeps apiFetch's contract: the
// same base URL, the cookie, the break-glass refusal, and an ApiError carrying
// the API's own sentence. The body is the raw file with its type STATED by the
// caller, like every other upload here — not multipart.
//
// `signal` aborts it, and the rejection then carries `aborted: true`, so a
// cancelled upload can be told apart from a failed one.
export function apiUpload(path, body, { contentType, onProgress, signal } = {}) {
  if (blockedWhileOffline(path, 'POST')) {
    return Promise.reject(new ApiError(OFFLINE_WRITE_MESSAGE, 0))
  }
  return new Promise((resolve, reject) => {
    const cancelled = () => {
      const error = new ApiError('Upload cancelled.', 0)
      error.aborted = true
      reject(error)
    }
    if (signal?.aborted) return cancelled()

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    if (contentType) xhr.setRequestHeader('Content-Type', contentType)
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      let parsed = null
      if ((xhr.getResponseHeader('content-type') || '').includes('application/json')) {
        try {
          parsed = JSON.parse(xhr.responseText)
        } catch {
          parsed = null
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(parsed)
      const error = new ApiError(messageFromBody(parsed, xhr.status), xhr.status)
      error.body = parsed
      reject(error)
    }
    xhr.onerror = () => reject(new ApiError(NETWORK_MESSAGE, 0))
    xhr.onabort = cancelled
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

// A file download rather than a JSON read — the product-sheet export, and
// anything else the API answers with bytes. apiFetch parses JSON and returns
// null for every other content type, so a CSV fetched through it arrives as
// nothing at all; this keeps the same base URL, credentials and ApiError
// contract (including a 404's own message) and hands back the body instead.
//
// The raw Content-Disposition is returned rather than a filename, and it is
// usually **null**: it is not a CORS-safelisted response header, so the browser
// hides it unless the API names it in Access-Control-Expose-Headers, which it
// does not. A caller therefore needs a fallback name of its own — see
// filenameFrom in src/screens/adminProductSheet.js.
//
// `{ method: 'POST', payload }` asks for a file drawn from a JSON body — the
// purchase-order PDF preview (POST /admin/purchase-orders/pdf), which names
// its purchase orders in the body and writes nothing.
export async function apiDownload(path, { method = 'GET', payload } = {}) {
  const url = `${API_BASE_URL}${path}`
  let response
  try {
    // No Accept header: this asks for a file, not for JSON.
    response = await fetch(url, {
      method,
      credentials: 'include',
      ...(payload === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    })
  } catch (cause) {
    throw new ApiError(NETWORK_MESSAGE, 0, cause)
  }

  if (!response.ok) {
    // A refusal is still JSON, so the API's own sentence survives.
    const body = await parseBody(response)
    const error = new ApiError(messageFromBody(body, response.status), response.status)
    error.body = body
    throw error
  }

  return { blob: await response.blob(), disposition: response.headers.get('content-disposition') }
}
