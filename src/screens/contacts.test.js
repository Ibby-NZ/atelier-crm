import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import {
  CONTACT_FIELDS,
  CONTACTS_ROUTE,
  NEW_CONTACT_ROUTE,
  companyCell,
  companyHref,
  contactFilters,
  contactPath,
  contactRoute,
  fileUnderBody,
} from './contacts.js'
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

describe('a contact on its own page', () => {
  it('builds the page and the create page off the list route, apart from the API read', () => {
    expect(contactRoute(7)).toBe('/clients/contacts/7')
    expect(NEW_CONTACT_ROUTE).toBe('/clients/contacts/new')
    expect(contactPath(7)).toBe('/admin/contacts/7')
  })

  // A filed contact's company is a record with a page; an unfiled one's is
  // only the words D365 gave it.
  it("opens a filed contact's company on its account page, and nothing for an unfiled one", () => {
    expect(companyHref({ trade_account_id: 3, company: 'Zomia' })).toBe('/clients/accounts/3')
    expect(companyHref({ trade_account_id: null, company_name: 'Somewhere' })).toBeNull()
    expect(companyHref()).toBeNull()
  })
})

describe('the Contacts tab', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

  it('is routed', () => {
    expect(app).toContain(`path="${CONTACTS_ROUTE}" element={`)
    expect(app).toContain('<Contacts />')
  })

  // The route's own text, from its path to the next <Route (indexOf, not a
  // regex over newlines, which a CRLF checkout would break).
  const routeText = (path) => {
    const start = app.indexOf(`path="${path}"`)
    if (start === -1) return ''
    const end = app.indexOf('<Route', start)
    return app.slice(start, end === -1 ? undefined : end)
  }

  it('routes the contact page and the create page behind the address book gate', () => {
    for (const [path, screen] of [
      [CONTACTS_ROUTE, '<Contacts />'],
      ['/clients/contacts/:id', '<Contact />'],
      [NEW_CONTACT_ROUTE, '<ContactNew />'],
    ]) {
      const route = routeText(path)
      expect(route).toContain('RequireCap cap={CAPS.ADMIN_USERS}')
      expect(route).toContain(screen)
    }
  })
})

// No jsdom: the three screens are pinned by their source.
describe('the list, the page and the create page', () => {
  const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
  const LIST = read('Contacts.jsx')
  const PAGE = read('Contact.jsx')
  const CREATE = read('ContactNew.jsx')

  it('keeps the list a list: rows open the page, Delete stays on the row, nothing edits inline', () => {
    expect(LIST).toContain('to={contactRoute(contact.id)}')
    expect(LIST).toContain('to={NEW_CONTACT_ROUTE}')
    expect(LIST).toContain('crud.remove.ask(contact)')
    expect(LIST).toContain('companyHref(contact)')
    expect(LIST).not.toContain('ContactForm')
    expect(LIST).not.toContain('TradeAccountPicker')
    expect(LIST).not.toContain('apiSend')
  })

  it('reads the one contact and reloads it after every write', () => {
    expect(PAGE).toContain('apiFetch(contactPath(id))')
    expect(PAGE).toContain('useMutation({ reload: load, flash })')
    expect(PAGE).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(PAGE).toContain('<NotFound')
    expect(PAGE).toContain('let active = true')
  })

  // Filing is its own PATCH — the API clears the text company itself — and
  // comes before the form, as it did in the row.
  it('files through the picker on its own body, above the form', () => {
    expect(PAGE).toContain('fileUnderBody(accountId)')
    expect(PAGE).toContain('<TradeAccountPicker')
    const picker = PAGE.indexOf('<FileUnder contact={contact}')
    const form = PAGE.indexOf('<ContactForm key=')
    expect(picker).not.toBe(-1)
    expect(form).toBeGreaterThan(picker)
  })

  it('shares ONE form between adding a person and correcting one', () => {
    expect(PAGE).toContain("import ContactForm from './ContactForm.jsx'")
    expect(CREATE).toContain("import ContactForm from './ContactForm.jsx'")
  })

  it('lands a new contact on their own page, replacing the form in history', () => {
    expect(CREATE).toContain("apiSend('POST', CONTACTS_PATH, values)")
    expect(CREATE).toContain('navigate(contactRoute(created.id), { replace: true })')
    expect(CREATE).toContain('onCancel={() => navigate(CONTACTS_ROUTE)}')
  })
})
