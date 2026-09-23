import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { GhostButton, HeaderRow, Row, Select, ToastLine, cellInput, monoText, mutedText } from '../admin/parts.jsx'
import {
  CONTACTS_PATH,
  FILED_OPTIONS,
  NEW_CONTACT_ROUTE,
  PAGE_LIMIT,
  companyCell,
  companyHref,
  contactFilters,
  contactPath,
  contactRoute,
} from './contacts.js'

// Contacts — the whole address book, live: every person the office knows,
// across every company and none. The cutover merge carried all 2,662 Dynamics
// contacts over; 1,373 landed filed under their account, the rest wait here
// unfiled with the company D365 named as text, for the office to file.
//
// One contact OPENS ON ITS OWN PAGE (Contact, /clients/contacts/:id) and "Add
// contact" on another (ContactNew, /clients/contacts/new) — 23 Sep 2026, the
// client's "every data entry on its own page". Both used to open inside this
// screen: the editor under its row, the form above the list. This screen is
// the list, the filter, the search and the row's Delete, which stays here as
// the kit's flow bound to a list it can reload. A filed contact's company
// opens its account's page.
//
//   GET    /admin/contacts?q=&filed=&page=      → { contacts, meta }
//   DELETE /admin/contacts/:id
//
// Rules live in ./contacts.js, tested; this file is layout.

const COLUMNS = '1.6fr 1.1fr 1.6fr 1.5fr 1.1fr 1fr'
const LABELS = ['Name', 'Role', 'Company', 'Email', 'Phone', '']
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

const describeContact = (contact) => contact?.name ?? 'this contact'

export default function Contacts() {
  const [draft, setDraft] = useState('')
  const [term, setTerm] = useState('')
  const [filed, setFiled] = useState('')

  const crud = useCrudScreen({
    path: CONTACTS_PATH,
    key: 'contacts',
    limit: PAGE_LIMIT,
    filters: contactFilters({ term, filed }),
    entity: 'contact',
    describe: describeContact,
    deletePath: (contact) => contactPath(contact.id),
  })
  const { rows, total, status, error } = crud.list

  const submit = (event) => { event.preventDefault(); setTerm(draft) }

  return (
    <>
      <PageHeader
        eyebrow="Clients · live"
        title="Contacts"
        subtitle="Everyone the office knows, across every company. A contact filed under an account shows on that account; one not yet filed carries the company Dynamics named."
        right={
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Name, role, company, email, phone" aria-label="Search contacts" style={{ ...cellInput, width: 300 }} />
            <GhostButton type="submit">Search</GhostButton>
            <Select value={filed} onChange={(e) => setFiled(e.target.value)} style={{ ...cellInput, width: 'auto' }} aria-label="Filed">
              {FILED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Link to={NEW_CONTACT_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">Add contact</GhostButton>
            </Link>
          </form>
        }
      />
      <SectionTabs tabs={clientsTabs} active="contacts" />

      <ToastLine message={crud.toast.message} />

      <div style={{ marginTop: 18, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <HeaderRow columns={COLUMNS} labels={LABELS} />
        {status === 'loading' && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>Loading contacts…</div>}
        {status === 'error' && <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{error}</div>}
        {status === 'ready' && rows.length === 0 && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>No contacts match.</div>}
        {status === 'ready' && rows.map((contact) => {
          const company = companyCell(contact)
          const href = companyHref(contact)
          return (
            <Row key={contact.id} columns={COLUMNS}>
              <span style={cell}>
                <Link to={contactRoute(contact.id)} className="ab-link" style={{ fontFamily: font.display, fontSize: 14, color: c.ink, textDecoration: 'none' }}>
                  {contact.name}
                </Link>
              </span>
              <span style={cell}>{contact.role ?? '—'}</span>
              <span style={{ ...cell, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {href
                  ? <Link to={href} className="ab-link" style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: c.inkSoft, textDecoration: 'none' }}>{company.text}</Link>
                  : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.text}</span>}
                {!company.filed && <StatusPill tone="clay" style={{ flex: 'none' }}>not filed</StatusPill>}
              </span>
              <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{contact.email ?? '—'}</span>
              <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{contact.phone ?? '—'}</span>
              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Link to={contactRoute(contact.id)} style={{ textDecoration: 'none' }}>
                  <GhostButton>Open</GhostButton>
                </Link>
                <GhostButton tone="danger" onClick={() => crud.remove.ask(contact)}>Delete</GhostButton>
              </span>
            </Row>
          )
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={mutedText}>{total.toLocaleString('en-NZ')} contact{total === 1 ? '' : 's'}</span>
        <Pagination page={crud.list.page} totalPages={crud.list.totalPages} total={total} unit="contacts" onPage={crud.list.setPage} busy={status === 'loading'} />
      </div>
      <ConfirmDialog {...crud.remove.dialog} />
    </>
  )
}
