import { describe, it, expect } from 'vitest'
import { signInEmailPatch } from './userManagement.js'

describe('sign-in email change', () => {
  it('keeps the original trim/lowercase rule and changes only email', () => {
    expect(signInEmailPatch('old@example.test', ' NEW@Example.Test ')).toEqual({email:'new@example.test'})
  })
  it('does not write blank, cancelled or unchanged addresses', () => {
    for(const next of [null, undefined, '', '  ', ' OLD@EXAMPLE.TEST ']) {
      expect(signInEmailPatch('old@example.test',next)).toBe(null)
    }
  })
})
