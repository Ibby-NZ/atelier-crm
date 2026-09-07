import { describe, it, expect } from 'vitest'
import { readResetToken, newPasswordError, MIN_PASSWORD_LENGTH } from './passwordReset.js'

describe('readResetToken', () => {
  it('pulls the token out of the emailed link', () => {
    expect(readResetToken('?token=abc-DEF_123')).toBe('abc-DEF_123')
    expect(readResetToken('token=%20x%20')).toBe('x')
    expect(readResetToken('?token=')).toBe('')
    expect(readResetToken('')).toBe('')
    expect(readResetToken(undefined)).toBe('')
  })
})

describe('newPasswordError', () => {
  const ok = 'a'.repeat(MIN_PASSWORD_LENGTH)
  it('holds the API floor and the confirmation', () => {
    expect(newPasswordError('', '')).toBe('Choose a new password.')
    expect(newPasswordError('short', 'short')).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    expect(newPasswordError(ok, `${ok}x`)).toBe('The two passwords do not match.')
    expect(newPasswordError(ok, ok)).toBe('')
  })
})
