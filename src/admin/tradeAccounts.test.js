import { describe, it, expect } from 'vitest'
import {
  TRADE_ACCOUNTS_PATH,
  TRADE_ACCOUNT_SEARCH_LIMIT,
  accountOption,
  tradeAccountSearchPath,
} from './tradeAccounts.js'

describe('tradeAccountSearchPath', () => {
  it('searches the linked accounts with a capped page', () => {
    const path = tradeAccountSearchPath('kedgley')
    expect(path.startsWith(`${TRADE_ACCOUNTS_PATH}?`)).toBe(true)
    const params = new URLSearchParams(path.split('?')[1])
    expect(params.get('q')).toBe('kedgley')
    expect(params.get('limit')).toBe(String(TRADE_ACCOUNT_SEARCH_LIMIT))
  })

  it('drops an empty term rather than sending q=', () => {
    // buildListQuery's rule: an empty q would still be accepted here, but the
    // convention across every list is that unset filters VANISH.
    expect(tradeAccountSearchPath('')).toBe(
      `${TRADE_ACCOUNTS_PATH}?limit=${TRADE_ACCOUNT_SEARCH_LIMIT}`
    )
    expect(tradeAccountSearchPath('   ')).toBe(
      `${TRADE_ACCOUNTS_PATH}?limit=${TRADE_ACCOUNT_SEARCH_LIMIT}`
    )
  })

  it('percent-encodes a term, so an ampersand cannot smuggle a second filter', () => {
    const path = tradeAccountSearchPath('Smith & Caughey')
    const params = new URLSearchParams(path.split('?')[1])
    expect(params.get('q')).toBe('Smith & Caughey')
  })
})

describe('accountOption', () => {
  it('narrows a hit to id, company name and the first linked login', () => {
    expect(
      accountOption({
        id: 12,
        company_name: 'Peter Kedgley Architects',
        name_is_ambiguous: false,
        users: [{ id: 4, email: 'studio@kedgley.co.nz' }, { id: 9, email: 'second@kedgley.co.nz' }],
      })
    ).toEqual({ id: 12, name: 'Peter Kedgley Architects', email: 'studio@kedgley.co.nz' })
  })

  it('answers null, never an empty string, for an account with no linked login', () => {
    // Unlinking the login↔company grant is a back-office routine, so no login
    // is normal; the picker prints nothing rather than a dangling separator.
    expect(accountOption({ id: 3, company_name: 'Walk-in Ltd', users: [] }).email).toBeNull()
    expect(accountOption({ id: 3, company_name: 'Walk-in Ltd' }).email).toBeNull()
  })

  it('survives a malformed row without throwing', () => {
    expect(accountOption()).toEqual({ id: undefined, name: '', email: null })
  })
})
