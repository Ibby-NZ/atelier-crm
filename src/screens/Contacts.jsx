import { useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import TradeAccountPicker from '../admin/TradeAccountPicker.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { apiSend } from '../lib/api.js'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { ErrorLine, Field, GhostButton, HeaderRow, Row, Select, ToastLine, cellInput, inputStyle, monoText, mutedText } from '../admin/parts.jsx'
import {
  CONTACTS_PATH,
  CONTACT_FIELDS,
  FILED_OPTIONS,
  PAGE_LIMIT,
  companyCell,
  contactFilters,
  contactPath,
  fileUnderBody,
} from './contacts.js'

// Contacts — the whole address book, live: every person the office knows,
// across every company and none. The cutover merge carried all 2,662 Dynamics
// contacts over; 1,373 landed filed under their account, the rest wait here
// unfiled with the company D365 named as text, for the office to file.
//
//   GET    /admin/contacts?q=&filed=&page=      → { contacts, meta }
//   POST   /admin/contacts                      → { contact }
//   PATCH  /admin/contacts/:id                  → { contact }   (fields, or trade_account_id to file / unfile)
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
  const [editing, setEditing] = useState(null) // contact id
  const [adding, setAdding] = useState(false)

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
  const { busy, run } = crud.mutation

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
            <GhostButton tone="accent" onClick={() => setAdding((open) => !open)}>{adding ? 'Cancel' : 'Add contact'}</GhostButton>
          </form>
        }
      />
      <SectionTabs tabs={clientsTabs} active="contacts" />

      {crud.mutation.error && <ErrorLine style={{ marginTop: 14 }}>{crud.mutation.error}</ErrorLine>}
      <ToastLine message={crud.toast.message} />

      {adding && (
        <ContactForm
          record={{}}
          busy={busy}
          submitLabel="Add contact"
          onCancel={() => setAdding(false)}
          onSave={async (values) => {
            const ok = await run(() => apiSend('POST', CONTACTS_PATH, values), `${values.name} added.`)
            if (ok) setAdding(false)
          }}
        />
      )}

      <div style={{ marginTop: 18, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <HeaderRow columns={COLUMNS} labels={LABELS} />
        {status === 'loading' && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>Loading contacts…</div>}
        {status === 'error' && <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{error}</div>}
        {status === 'ready' && rows.length === 0 && <div style={{ padding: '18px 20px', ...mutedText, fontStyle: 'italic' }}>No contacts match.</div>}
        {status === 'ready' && rows.map((contact) => {
          const company = companyCell(contact)
          const open = editing === contact.id
          return (
            <div key={contact.id}>
              <Row columns={COLUMNS} style={{ background: open ? c.surface : undefined }}>
                <span style={{ ...cell, fontFamily: font.display, fontSize: 14, color: c.ink }}>{contact.name}</span>
                <span style={cell}>{contact.role ?? '—'}</span>
                <span style={{ ...cell, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.text}</span>
                  {!company.filed && <StatusPill tone="clay" style={{ flex: 'none' }}>not filed</StatusPill>}
                </span>
                <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{contact.email ?? '—'}</span>
                <span style={{ ...cell, ...monoText, fontSize: 11.5 }}>{contact.phone ?? '—'}</span>
                <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <GhostButton disabled={busy} onClick={() => setEditing(open ? null : contact.id)}>{open ? 'Close' : 'Edit'}</GhostButton>
                  <GhostButton tone="danger" disabled={busy} onClick={() => crud.remove.ask(contact)}>Delete</GhostButton>
                </span>
              </Row>
              {open && (
                <div style={{ padding: '0 20px 18px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                  <FileUnder
                    contact={contact}
                    busy={busy}
                    onFile={(accountId) => run(
                      () => apiSend('PATCH', contactPath(contact.id), fileUnderBody(accountId)),
                      accountId == null ? `${contact.name} unfiled.` : `${contact.name} filed.`
                    )}
                  />
                  <ContactForm
                    record={contact}
                    busy={busy}
                    submitLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSave={async (patch) => {
                      const ok = await run(() => apiSend('PATCH', contactPath(contact.id), patch), `${contact.name} saved.`)
                      if (ok) setEditing(null)
                    }}
                  />
                </div>
              )}
            </div>
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

// Which company this person belongs to. The picker is the same one the sample
// register uses; "Unfile" takes them out and keeps the company as text.
function FileUnder({ contact, busy, onFile }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '14px 0' }}>
      <div style={{ flex: '1 1 320px' }}>
        <TradeAccountPicker
          label="Filed under"
          value={contact.trade_account_id ? { id: contact.trade_account_id, name: contact.company } : null}
          disabled={busy}
          onPick={(option) => onFile(option.id)}
          onClear={() => onFile(null)}
        />
      </div>
    </div>
  )
}

// One form for add and edit: edit sends only the changed keys (diffFields),
// add sends every field (bodyFrom). Both refuse a blank name before the wire.
function ContactForm({ record, busy, submitLabel, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => draftFrom(record, CONTACT_FIELDS))
  const [error, setError] = useState('')
  const filed = Boolean(record.trade_account_id)
  const fields = CONTACT_FIELDS.filter((field) => field.key !== 'company_name' || !filed)
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))

  const submit = (event) => {
    event.preventDefault()
    const result = record.id ? diffFields(record, draft, fields) : bodyFrom(draft, fields)
    if (result.error) return setError(result.error)
    const payload = result.patch ?? result.body
    if (Object.keys(payload).length === 0) return setError('Nothing has changed.')
    setError('')
    onSave(payload)
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 14, padding: '18px 20px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            {field.key === 'note'
              ? <textarea value={draft[field.key] ?? ''} onChange={set(field.key)} rows={2} style={{ ...inputStyle, height: 'auto', padding: 10 }} />
              : <input value={draft[field.key] ?? ''} onChange={set(field.key)} style={inputStyle} />}
          </Field>
        ))}
      </div>
      {error && <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <GhostButton type="submit" tone="accent" disabled={busy}>{submitLabel}</GhostButton>
        <GhostButton onClick={onCancel} disabled={busy}>Cancel</GhostButton>
      </div>
    </form>
  )
}
