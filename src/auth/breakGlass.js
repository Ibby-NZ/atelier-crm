// Break-glass sign-in — the emergency way into the CRM when atelier-api is
// unreachable or its database is down.
//
// WHAT IT IS. A local-only session. It authenticates nobody: it sets no API
// cookie, carries no API privilege, and every /admin/* request still needs the
// API's own signed cookie, so a break-glass user cannot read or write one row
// of live data. What it unlocks is the SHELL — the CRM's demo/localStorage
// screens (Catalogue, Suppliers, Pricing engine, Reporting, the brand world)
// keep working with the API flat on its back, and those are the screens worth
// having in that moment.
//
// SECURITY POSTURE — read this before changing anything here.
//   * The digest below is compiled into the JavaScript bundle and is therefore
//     PUBLIC. Anyone who can load the CRM can read it and grind it offline.
//     One unsalted SHA-256 is not a password KDF. That is survivable only
//     because the passphrase is long and random — four dictionary words plus
//     digits is ~10^20 guesses. NEVER set this to a human-chosen password, and
//     never reuse a passphrase that opens anything else.
//   * The blast radius of a crack is "can draw the CRM chrome and the demo
//     data" — not the database, which is why this trade is acceptable at all.
//   * It is OFF unless both env vars are set at build time. An unconfigured
//     build has no bypass, not a weak one.
//   * It is only offered after a live sign-in attempt has actually failed
//     unreachably (see isApiUnreachable). That is a footgun guard, not a
//     security control — someone determined can fake a network failure in their
//     own browser. It exists so this never becomes a second everyday front door.
//   * The session lives in sessionStorage: it dies with the tab, and expires on
//     its own after SESSION_MAX_AGE_MS.
//
// Rotating the credential: change the env var, rebuild, redeploy. Live
// break-glass sessions are invalidated automatically because readSession
// re-checks the stored email against the configured one.

import { sha256Hex, digestsMatch } from './sha256.js'

export const BREAK_GLASS_STORAGE_KEY = 'atelier_crm_break_glass'

// A forgotten tab should not stay a standing bypass for a week.
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

const SHA256_HEX = /^[0-9a-f]{64}$/

export const OFFLINE_WRITE_MESSAGE =
  'Offline access — nothing can be saved. Sign in against the API to make changes.'

// Normalise + validate the build-time configuration. Returns null (feature off)
// unless BOTH an email and a well-formed 64-character digest are present, so a
// half-filled .env can never produce a bypass that accepts an empty password.
export function readBreakGlassConfig(raw) {
  if (!raw || typeof raw !== 'object') return null
  const email = String(raw.email ?? '').trim().toLowerCase()
  const passwordHash = String(raw.passwordHash ?? '').trim().toLowerCase()
  if (!email || !SHA256_HEX.test(passwordHash)) return null
  const name = String(raw.name ?? '').trim() || 'Offline access'
  return Object.freeze({ email, passwordHash, name })
}

// "The API did not answer" — a transport failure (ApiError status 0) or the
// server itself falling over (5xx, which is what a dead database looks like
// from out here). A 401/403/422 is the API working correctly and must NOT open
// the emergency door.
export function isApiUnreachable(error) {
  const status = error?.status
  if (typeof status !== 'number') return false
  return status === 0 || status >= 500
}

// Constant-time-ish credential check. The email is compared case-insensitively
// (it is an identifier, not a secret); the passphrase is compared as digests.
export function verifyBreakGlass(config, { email, password } = {}) {
  if (!config) return false
  if (String(email ?? '').trim().toLowerCase() !== config.email) return false
  if (typeof password !== 'string' || password === '') return false
  return digestsMatch(sha256Hex(password), config.passwordHash)
}

// sessionStorage, or null where it is unavailable (SSR, or a browser with
// storage blocked). Callers treat null as "break-glass not possible".
export function browserStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function sessionFrom(config, startedAt) {
  return { v: 1, email: config.email, name: config.name, startedAt }
}

export function startBreakGlassSession(storage, config, now = Date.now()) {
  if (!storage || !config) return null
  const session = sessionFrom(config, now)
  try {
    storage.setItem(BREAK_GLASS_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage full or blocked — the caller still gets a session for this page
    // view; it simply will not survive a reload.
  }
  return session
}

// Returns the stored session, or null. Null whenever anything is off: no
// config (the feature was turned off or the credential rotated), a different
// email, malformed JSON, or past SESSION_MAX_AGE_MS. A rejected session is
// cleared so it cannot be re-evaluated on every render.
export function readBreakGlassSession(storage, config, now = Date.now()) {
  if (!storage) return null
  let raw
  try {
    raw = storage.getItem(BREAK_GLASS_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }

  const valid =
    config
    && parsed
    && parsed.v === 1
    && parsed.email === config.email
    && Number.isFinite(parsed.startedAt)
    && now - parsed.startedAt >= 0
    && now - parsed.startedAt < SESSION_MAX_AGE_MS

  if (!valid) {
    endBreakGlassSession(storage)
    return null
  }
  return { v: 1, email: parsed.email, name: config.name, startedAt: parsed.startedAt }
}

export function endBreakGlassSession(storage) {
  if (!storage) return
  try {
    storage.removeItem(BREAK_GLASS_STORAGE_KEY)
  } catch {
    /* nothing to do — the session is already unusable to us */
  }
}
