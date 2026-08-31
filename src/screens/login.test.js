import { describe, it, expect } from 'vitest'
import { tileFailureMessage } from './Login.jsx'

describe('tileFailureMessage', () => {
  it('blames the temp password only on a 401', () => {
    expect(tileFailureMessage('Liz', { error: 'Invalid email or password.', status: 401 }))
      .toBe('The shared temp password did not sign Liz in — enter their password below.')
  })

  it('keeps the API sentence when the caller is rate limited', () => {
    const result = { error: 'Rate limit exceeded, retry in 14 minutes', status: 429 }
    expect(tileFailureMessage('Liz', result)).toBe(result.error)
  })

  it('keeps the outage sentence', () => {
    const result = { error: 'The API did not answer.', unreachable: true, status: 0 }
    expect(tileFailureMessage('Liz', result)).toBe(result.error)
  })

  it('keeps a refusal that carries no status, such as no back-office access', () => {
    const result = { error: 'This account does not have back-office access.' }
    expect(tileFailureMessage('Sales', result)).toBe(result.error)
  })
})
