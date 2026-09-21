import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { CONTACT_FIELDS, CONTACTS_ROUTE, companyCell, contactFilters, fileUnderBody } from './contacts.js'
import { ACCOUNT_FIELDS } from './clientCompanies.js'

describe('contactFilters', () => {
  it('maps the filed select onto the API boolean and drops the rest', () => {
    expect(buildListQuery(contactFilters())).toBe('')
    expect(buildListQuery(contactFilters({ term: ' ann ', filed: 'false' }))).toBe('q=ann&filed=false')
    expect(contactFilters({ filed: 'true' }).filed).toBe(true)
  })
})

describe('cells and bodies', () => {
  it('shows the account for a filed contact and the text for an unfiled one', () => {
    expect(companyCell({ trade_account_id: 3, company: 'Zomia', company_name: null })).toEqual({ text: 'Zomia', filed: true })
    expect(companyCell({ trade_account_id: null, company: 'Somewhere', company_name: 'Somewhere' })).toEqual({ text: 'Somewhere', filed: false })
    expect(companyCell({ trade_account_id: null })).toEqual({ text: '—', filed: false })
  })

  it('files and unfiles with one key', () => {
    expect(fileUnderBody('12')).toEqual({ trade_account_id: 12 })
    expect(fileUnderBody(null)).toEqual({ trade_account_id: null })
  })

  it('diffs a contact edit down to the changed keys, blanks as null', () => {
    const record = { name: 'Ann', role: 'Buyer', email: 'a@x.test', phone: null, company_name: null, note: null }
    const draft = { ...draftFrom(record, CONTACT_FIELDS), role: '', phone: '021' }
    expect(diffFields(record, draft, CONTACT_FIELDS)).toEqual({ patch: { role: null, phone: '021' } })
  })

  it('declares the account fields the API accepts, company name first', () => {
    // The company name leads the form (Sept 2026); the API refuses a rename on
    // a Dynamics-linked row and the screen greys it — see canRename.
    expect(ACCOUNT_FIELDS[0].key).toBe('company_name')
  })
})

describe('the Contacts tab', () => {
  it('is routed', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    expect(app).toContain(`path="${CONTACTS_ROUTE}" element={`)
    expect(app).toContain('<Contacts />')
  })
})
