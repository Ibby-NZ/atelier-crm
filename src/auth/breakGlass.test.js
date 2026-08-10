import { describe, it, expect } from 'vitest'
import { sha256Hex, digestsMatch } from './sha256.js'
import {
  BREAK_GLASS_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  readBreakGlassConfig,
  isApiUnreachable,
  verifyBreakGlass,
  startBreakGlassSession,
  readBreakGlassSession,
  endBreakGlassSession,
} from './breakGlass.js'

// "correct horse battery staple" style passphrase — long and random is the
// whole security argument for shipping the digest publicly.
const PASSPHRASE = 'gantry-kestrel-gantry-plinth-5861'
const DIGEST = 'f2eb05a534777ad21566613f742bd925e7d8e2e41c043b0b5bd2f300c6a1e172'

const config = readBreakGlassConfig({
  email: 'Recovery@ateliertextiles.co.nz',
  passwordHash: DIGEST,
  name: 'Offline access',
})

// Minimal sessionStorage stand-in — the real one is not present under vitest's
// default Node environment (this repo has no jsdom).
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    size: () => map.size,
  }
}

describe('sha256', () => {
  it('matches the published FIPS 180-4 vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('handles inputs that straddle the 64-byte block boundary', () => {
    // 55/56 bytes is where the length field stops fitting in the final block —
    // an off-by-one in the padding shows up here and nowhere else.
    expect(sha256Hex('x'.repeat(55))).toBe(
      'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072')
    expect(sha256Hex('x'.repeat(56))).toBe(
      '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e')
  })

  it('digestsMatch is false for different or differently-sized digests', () => {
    expect(digestsMatch(DIGEST, DIGEST)).toBe(true)
    expect(digestsMatch(DIGEST, DIGEST.replace(/.$/, '0'))).toBe(false)
    expect(digestsMatch(DIGEST, DIGEST.slice(0, 63))).toBe(false)
    expect(digestsMatch(null, DIGEST)).toBe(false)
  })
})

describe('readBreakGlassConfig', () => {
  it('is off unless both an email and a 64-char digest are supplied', () => {
    expect(readBreakGlassConfig(null)).toBeNull()
    expect(readBreakGlassConfig({})).toBeNull()
    expect(readBreakGlassConfig({ email: 'a@b.c' })).toBeNull()
    expect(readBreakGlassConfig({ passwordHash: DIGEST })).toBeNull()
    // A truncated or non-hex digest is a misconfiguration, not a weak password.
    expect(readBreakGlassConfig({ email: 'a@b.c', passwordHash: DIGEST.slice(0, 32) })).toBeNull()
    expect(readBreakGlassConfig({ email: 'a@b.c', passwordHash: 'not-a-digest' })).toBeNull()
  })

  it('normalises the email and digest, and defaults the display name', () => {
    const c = readBreakGlassConfig({ email: '  Recovery@X.CO.NZ ', passwordHash: DIGEST.toUpperCase() })
    expect(c.email).toBe('recovery@x.co.nz')
    expect(c.passwordHash).toBe(DIGEST)
    expect(c.name).toBe('Offline access')
  })
})

describe('isApiUnreachable', () => {
  it('is true only for a transport failure or a server-side collapse', () => {
    expect(isApiUnreachable({ status: 0 })).toBe(true)      // fetch threw
    expect(isApiUnreachable({ status: 500 })).toBe(true)
    expect(isApiUnreachable({ status: 503 })).toBe(true)     // database down
  })

  it('is false when the API answered correctly — a bad password is not an outage', () => {
    expect(isApiUnreachable({ status: 401 })).toBe(false)
    expect(isApiUnreachable({ status: 403 })).toBe(false)
    expect(isApiUnreachable({ status: 404 })).toBe(false)
    expect(isApiUnreachable({ status: 422 })).toBe(false)
    expect(isApiUnreachable({ status: 429 })).toBe(false)
    expect(isApiUnreachable(new Error('boom'))).toBe(false)
    expect(isApiUnreachable(null)).toBe(false)
  })
})

describe('verifyBreakGlass', () => {
  it('accepts the configured pair, ignoring email case and surrounding space', () => {
    expect(verifyBreakGlass(config, { email: 'recovery@ateliertextiles.co.nz', password: PASSPHRASE })).toBe(true)
    expect(verifyBreakGlass(config, { email: '  RECOVERY@ateliertextiles.co.nz  ', password: PASSPHRASE })).toBe(true)
  })

  it('rejects a wrong passphrase, a wrong email, and an empty password', () => {
    expect(verifyBreakGlass(config, { email: 'recovery@ateliertextiles.co.nz', password: 'wrong' })).toBe(false)
    expect(verifyBreakGlass(config, { email: 'someone@else.co.nz', password: PASSPHRASE })).toBe(false)
    expect(verifyBreakGlass(config, { email: 'recovery@ateliertextiles.co.nz', password: '' })).toBe(false)
    expect(verifyBreakGlass(config, {})).toBe(false)
  })

  it('rejects everything when the feature is not configured', () => {
    expect(verifyBreakGlass(null, { email: 'recovery@ateliertextiles.co.nz', password: PASSPHRASE })).toBe(false)
  })
})

describe('the offline session', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage()
    const started = startBreakGlassSession(storage, config, 1_000)
    expect(started.email).toBe(config.email)
    expect(readBreakGlassSession(storage, config, 2_000)).toMatchObject({ email: config.email, startedAt: 1_000 })
  })

  it('expires on its own, and clears itself when it does', () => {
    const storage = fakeStorage()
    startBreakGlassSession(storage, config, 0)
    expect(readBreakGlassSession(storage, config, SESSION_MAX_AGE_MS - 1)).not.toBeNull()
    expect(readBreakGlassSession(storage, config, SESSION_MAX_AGE_MS)).toBeNull()
    expect(storage.getItem(BREAK_GLASS_STORAGE_KEY)).toBeNull()
  })

  it('is void once the credential is rotated or the feature is switched off', () => {
    const rotated = readBreakGlassConfig({ email: 'new-recovery@ateliertextiles.co.nz', passwordHash: DIGEST })

    const a = fakeStorage()
    startBreakGlassSession(a, config, 1_000)
    expect(readBreakGlassSession(a, rotated, 2_000)).toBeNull()

    const b = fakeStorage()
    startBreakGlassSession(b, config, 1_000)
    expect(readBreakGlassSession(b, null, 2_000)).toBeNull()
  })

  it('ignores a hand-written or corrupted storage entry', () => {
    expect(readBreakGlassSession(fakeStorage({ [BREAK_GLASS_STORAGE_KEY]: '{ not json' }), config)).toBeNull()
    // Forging the payload does not help: the email must match the build's own.
    const forged = JSON.stringify({ v: 1, email: 'attacker@example.com', startedAt: Date.now() })
    expect(readBreakGlassSession(fakeStorage({ [BREAK_GLASS_STORAGE_KEY]: forged }), config)).toBeNull()
    // A future-dated session is not a way to extend the window either.
    const future = JSON.stringify({ v: 1, email: config.email, startedAt: 10_000 })
    expect(readBreakGlassSession(fakeStorage({ [BREAK_GLASS_STORAGE_KEY]: future }), config, 1_000)).toBeNull()
  })

  it('treats absent storage as "no emergency access"', () => {
    expect(startBreakGlassSession(null, config)).toBeNull()
    expect(readBreakGlassSession(null, config)).toBeNull()
    expect(() => endBreakGlassSession(null)).not.toThrow()
  })

  it('signing out removes it', () => {
    const storage = fakeStorage()
    startBreakGlassSession(storage, config, 1_000)
    endBreakGlassSession(storage)
    expect(readBreakGlassSession(storage, config, 1_100)).toBeNull()
  })
})
