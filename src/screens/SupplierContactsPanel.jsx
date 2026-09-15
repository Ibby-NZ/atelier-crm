// One supplier's contact people and contact log, inside the expanded row on
// AdminSuppliers — the write surface for:
//
//   GET|POST   /admin/suppliers/:id/contacts
//   PATCH|DELETE      …/contacts/:contactId
//   GET|POST   /admin/suppliers/:id/contact-log
//
// The log is APPEND-ONLY: the API has no edit or delete for an entry, so this
// panel offers none. The "who" on a log entry is the signed-in session —
// nothing here sends a staff field, and the API would strip one anyway.
//
// `onLogged` is called after a log write lands so the parent list can reload
// its Last-contact column — the same remount-on-change posture the terms
// panel's `onLinked` takes.
//
// Layout only: the rules (paths, method vocabulary, body builders, the
// at-a-glance line) live in ./adminSuppliers.js and are tested there.

import { useCallback, useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { apiDelete, apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import Pagination from '../admin/Pagination.jsx'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import {
  Select,
  ErrorLine,
  Field,
  GhostButton,
  PanelNote,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  sectionLabel,
  useMutation,
} from '../admin/parts.jsx'
import {
  CONTACT_FIELDS,
  CONTACT_METHODS,
  NEW_CONTACT,
  NEW_LOG_ENTRY,
  buildLogBody,
  contactLogPath,
  contactPath,
  contactsPath,
  dayText,
} from './adminSuppliers.js'

const LOG_LIMIT = 10

export default function SupplierContactsPanel({ supplierId, flash, onLogged }) {
  const [contacts, setContacts] = useState([])
  const [entries, setEntries] = useState([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [newContact, setNewContact] = useState(NEW_CONTACT)
  const [editId, setEditId] = useState(null)
  const [editDraft, setEditDraft] = useState(NEW_CONTACT)
  const [removing, setRemoving] = useState(null)
  const [logDraft, setLogDraft] = useState(NEW_LOG_ENTRY)

  const reload = useCallback(async () => {
    const [people, log] = await Promise.all([
      apiFetch(contactsPath(supplierId)),
      apiFetch(`${contactLogPath(supplierId)}?page=${logPage}&limit=${LOG_LIMIT}`),
    ])
    setContacts(people.contacts ?? [])
    setEntries(log.entries ?? [])
    setLogTotal(log.meta?.total ?? 0)
  }, [supplierId, logPage])

  useEffect(() => {
    let active = true
    setStatus('loading')
    reload()
      .then(() => active && setStatus('ready'))
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this supplier’s contacts.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [reload])

  const { busy, error, setError, run } = useMutation({ reload, flash })

  const addContact = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newContact, CONTACT_FIELDS)
    if (built.error) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', contactsPath(supplierId), built.body),
      (res) => `${res.contact.name} added.`
    )
    if (ok) {
      setNewContact(NEW_CONTACT)
      setShowAdd(false)
    }
  }

  const saveContact = async (contact) => {
    const diff = diffFields(contact, editDraft, CONTACT_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    const ok = await run(
      () => apiSend('PATCH', contactPath(supplierId, contact.id), diff.patch),
      'Contact saved.'
    )
    if (ok) setEditId(null)
  }

  const removeContact = async () => {
    const target = removing
    setRemoving(null)
    await run(
      () => apiDelete(contactPath(supplierId, target.id)),
      `${target.name} removed.`
    )
  }

  const logContact = async (event) => {
    event.preventDefault()
    const built = buildLogBody(logDraft)
    if (!built.ok) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', contactLogPath(supplierId), built.body),
      'Contact logged.'
    )
    if (ok) {
      setLogDraft(NEW_LOG_ENTRY)
      onLogged?.()
    }
  }

  const setNewField = (key) => (event) =>
    setNewContact((draft) => ({ ...draft, [key]: event.target.value }))
  const setEditField = (key) => (event) =>
    setEditDraft((draft) => ({ ...draft, [key]: event.target.value }))
  const setLogField = (key) => (event) =>
    setLogDraft((draft) => ({ ...draft, [key]: event.target.value }))

  if (status === 'loading') return <PanelNote>Loading contacts…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{loadError}</PanelNote>

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 22 }}>
      <ErrorLine>{error}</ErrorLine>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={sectionLabel}>Contact people</div>
          <GhostButton
            disabled={busy}
            onClick={() => {
              setShowAdd((open) => !open)
              setError('')
            }}
          >
            {showAdd ? 'Cancel' : 'Add person'}
          </GhostButton>
        </div>

        {showAdd && (
          <form onSubmit={addContact} style={{ marginTop: 12 }}>
            <ContactFields values={newContact} onChange={setNewField} disabled={busy} />
            <div style={{ marginTop: 12 }}>
              <GhostButton type="submit" tone="accent" disabled={busy}>
                Add contact
              </GhostButton>
            </div>
          </form>
        )}

        {contacts.length === 0 ? (
          <div style={{ ...mutedText, marginTop: 10 }}>
            No people recorded for this house yet.
          </div>
        ) : (
          <div style={{ marginTop: 10, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            {contacts.map((contact) => (
              <div key={contact.id} style={{ borderBottom: `1px solid ${c.line}` }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 1fr 1.4fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 14px',
                    background: c.paper,
                  }}
                >
                  <span style={{ fontSize: 13, color: c.ink, minWidth: 0 }}>
                    {contact.name}
                    {contact.role && (
                      <span style={{ ...mutedText, fontSize: 11.5 }}> · {contact.role}</span>
                    )}
                  </span>
                  <span style={{ ...monoText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact.phone || '—'}
                  </span>
                  <span style={{ ...monoText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact.email || (contact.note ? contact.note : '—')}
                  </span>
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <GhostButton
                      disabled={busy}
                      onClick={() => {
                        setError('')
                        setEditId((current) => {
                          if (current === contact.id) return null
                          setEditDraft(draftFrom(contact, CONTACT_FIELDS))
                          return contact.id
                        })
                      }}
                    >
                      {editId === contact.id ? 'Close' : 'Edit'}
                    </GhostButton>
                    <GhostButton disabled={busy} tone="danger" onClick={() => setRemoving(contact)}>
                      Remove
                    </GhostButton>
                  </span>
                </div>
                {editId === contact.id && (
                  <div style={{ padding: '12px 14px 16px' }}>
                    <ContactFields values={editDraft} onChange={setEditField} disabled={busy} />
                    <div style={{ marginTop: 12 }}>
                      <GhostButton tone="accent" disabled={busy} onClick={() => saveContact(contact)}>
                        Save contact
                      </GhostButton>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={sectionLabel}>Contact log</div>
        <form
          onSubmit={logContact}
          style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) auto', gap: 12, alignItems: 'end' }}
          className="r-grid-2"
        >
          <Field label="Method">
            <Select
              value={logDraft.method}
              onChange={setLogField('method')}
              disabled={busy}
              aria-label="Contact method"
            >
              <option value="">—</option>
              {CONTACT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" hint="Blank = today.">
            <input
              type="date"
              value={logDraft.contacted_on}
              onChange={setLogField('contacted_on')}
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <Field label="Note">
            <input
              value={logDraft.note}
              onChange={setLogField('note')}
              disabled={busy}
              placeholder="Chased the September price list"
              style={inputStyle}
            />
          </Field>
          <Field label="Follow up">
            <input
              type="date"
              value={logDraft.follow_up_on}
              onChange={setLogField('follow_up_on')}
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <GhostButton type="submit" tone="accent" disabled={busy}>
            Log contact
          </GhostButton>
        </form>

        {entries.length === 0 ? (
          <div style={{ ...mutedText, marginTop: 10 }}>
            No contact recorded yet — this house counts as gone quiet.
          </div>
        ) : (
          <div style={{ marginTop: 10, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 90px 1fr 1fr',
                  gap: 12,
                  padding: '9px 14px',
                  borderBottom: `1px solid ${c.line}`,
                  background: c.paper,
                }}
              >
                <span style={monoText}>{dayText(entry.contacted_on)}</span>
                <span style={{ fontSize: 12.5, color: c.ink }}>{entry.method}</span>
                <span style={{ fontSize: 12.5, color: c.inkSoft, minWidth: 0 }}>
                  {entry.note || '—'}
                  <span style={{ ...mutedText, fontSize: 11.5 }}> · {entry.staff_name}</span>
                </span>
                <span style={{ ...mutedText, fontSize: 11.5, textAlign: 'right' }}>
                  {entry.follow_up_on ? `follow up ${dayText(entry.follow_up_on)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <Pagination
          page={logPage}
          totalPages={Math.max(1, Math.ceil(logTotal / LOG_LIMIT))}
          total={logTotal}
          unit="entries"
          onPage={setLogPage}
          busy={busy}
        />
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name ?? 'this contact'}?`}
        body="This removes the person from the supplier's contact book. The contact log keeps its entries."
        confirmLabel="Remove contact"
        onConfirm={removeContact}
        onCancel={() => setRemoving(null)}
        busy={busy}
      />
    </div>
  )
}

// The same declaration create and edit both read — CONTACT_FIELDS mirrors the
// API's whitelist, so the two forms cannot drift.
function ContactFields({ values, onChange, disabled }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}
      className="r-grid-2"
    >
      {CONTACT_FIELDS.map((field) => (
        <Field key={field.key} label={field.label}>
          <input
            value={values[field.key] ?? ''}
            disabled={disabled}
            onChange={onChange(field.key)}
            style={{
              ...inputStyle,
              ...(field.key === 'email' || field.key === 'phone' ? { fontFamily: font.mono } : {}),
            }}
          />
        </Field>
      ))}
    </div>
  )
}
