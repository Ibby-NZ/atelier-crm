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
