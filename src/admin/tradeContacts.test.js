import { describe, it, expect } from 'vitest'
import {
  CONTACT_FIELDS,
  NEW_CONTACT,
  buildContactBody,
  byGuidPath,
  contactBookPath,
  contactPath,
  contactsPath,
  personPrefill,
} from './tradeContacts.js'

describe('paths', () => {
  it('builds the by-guid bridge and the nested contact endpoints in one place', () => {
    expect(byGuidPath('aaaa-bbbb')).toBe('/admin/trade-accounts/by-guid/aaaa-bbbb')
    // A client raised by hand has no GUID, and `…/by-guid/null` is a 400 from
    // the route's UUID pattern — not the 404 that means "no company row yet".
    expect(contactBookPath({ legacy_account_guid: 'aaaa-bbbb', id: 7 })).toBe(
      '/admin/trade-accounts/by-guid/aaaa-bbbb'
    )
    expect(contactBookPath({ legacy_account_guid: null, id: 7 })).toBe('/admin/trade-accounts/7')
    expect(contactBookPath({})).toBeNull()
    expect(contactsPath(7)).toBe('/admin/trade-accounts/7/contacts')
    expect(contactPath(7, 3)).toBe('/admin/trade-accounts/7/contacts/3')
  })
})

describe('field declarations', () => {
  it('mirrors the API whitelist, name required', () => {
    expect(CONTACT_FIELDS.map((f) => f.key)).toEqual(['name', 'role', 'email', 'phone', 'note'])
    expect(CONTACT_FIELDS.find((f) => f.key === 'name').required).toBe(true)
    expect(Object.keys(NEW_CONTACT)).toEqual(['name', 'role', 'email', 'phone', 'note'])
  })
})

describe('buildContactBody', () => {
  it('trims, refuses a blank name, and folds blanks to null', () => {
    expect(buildContactBody({ ...NEW_CONTACT, name: '   ' }).ok).toBe(false)
    const built = buildContactBody({
      name: '  Jenny  ',
      role: '',
      email: 'jenny@zomia.test',
      phone: '  ',
      note: '',
    })
    expect(built.ok).toBe(true)
    expect(built.body).toEqual({
      name: 'Jenny',
      role: null,
      email: 'jenny@zomia.test',
      phone: null,
      note: null,
    })
  })
})

describe('personPrefill', () => {
  it('turns a Dynamics person into an add-form draft', () => {
    expect(
      personPrefill({
        full_name: 'Jenny Example',
        job_title: 'Design lead',
        email: 'jenny@example.test',
        mobile_phone: '+64 21 555 0100',
        business_phone: null,
      })
    ).toEqual({
      name: 'Jenny Example',
      role: 'Design lead',
      email: 'jenny@example.test',
      phone: '+64 21 555 0100',
      note: '',
    })
  })

  it('prefers the mobile, falls back to the business line, and never yields null', () => {
    const draft = personPrefill({ full_name: 'Viv', business_phone: '09 555 0100' })
    expect(draft.phone).toBe('09 555 0100')
    expect(draft.email).toBe('')
    expect(draft.role).toBe('')
  })
})
