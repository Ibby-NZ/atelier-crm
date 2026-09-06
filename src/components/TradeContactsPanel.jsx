// The contact book on a client company, mounted on the mirror detail screen
// (/clients/:id, GUID-keyed).
//
//   GET  /admin/trade-accounts/by-guid/:guid   → the company row + contacts +
//                                                the matching Dynamics people
//   POST /admin/trade-accounts { legacy_account_guid }   ← "Enable contacts":
//        creates the company row BARE (grants no login anything) so the book
//        can exist before any portal login does
//   POST|PATCH|DELETE …/:id/contacts(/:contactId)
//
// Every contact write answers with the fresh trade account, so this panel
// holds ONE object and redraws off it. The Dynamics people list is read-only
// source material — a per-row Add prefills the form, which is the whole point
// (never retype Jenny, Viv, Haike).
//
// Layout only: paths, field declarations and body builders live in
// ../admin/tradeContacts.js and are tested there.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { ApiError, apiDelete, apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { draftFrom } from '../admin/drafts.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  PanelNote,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  useMutation,
} from '../admin/parts.jsx'
import {
  CONTACT_FIELDS,
  NEW_CONTACT,
  buildContactBody,
  byGuidPath,
  contactPath,
  contactsPath,
  personPrefill,
} from '../admin/tradeContacts.js'

const sectionHead = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: c.muted,
}

export default function TradeContactsPanel({ guid }) {
  // null = no company row yet (the by-guid 404) — the "Enable contacts" branch.
  const [account, setAccount] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [flashNote, setFlashNote] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState(NEW_CONTACT)
  const [editId, setEditId] = useState(null)
  const [removing, setRemoving] = useState(null)

  useEffect(() => {
    let active = true
    setStatus('loading')
    apiFetch(byGuidPath(guid))
      .then((body) => {
        if (!active) return
        setAccount(body.trade_account)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof ApiError && err.status === 404) {
          setAccount(null)
          setStatus('ready')
          return
        }
        setLoadError(messageOf(err, 'The contact book could not be loaded.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [guid])

  // Every mutation's response carries the fresh account, so "reload" is just
  // adopting it — no second read.
  const { busy, error, setError, run } = useMutation({ flash: setFlashNote })
  const adopt = (body) => setAccount(body.trade_account)

  const enable = () =>
    run(async () => {
      adopt(await apiSend('POST', '/admin/trade-accounts', { legacy_account_guid: guid }))
    }, 'Contact book enabled for this client.')

  const submitContact = async (event) => {
    event.preventDefault()
    const built = buildContactBody(draft)
    if (!built.ok) return setError(built.error)
    const ok = await run(async () => {
      if (editId != null) {
        adopt(await apiSend('PATCH', contactPath(account.id, editId), built.body))
      } else {
        adopt(await apiSend('POST', contactsPath(account.id), built.body))
      }
    }, editId != null ? 'Contact saved.' : `${built.body.name} added.`)
    if (ok) {
      setDraft(NEW_CONTACT)
      setShowAdd(false)
      setEditId(null)
    }
  }

  const removeContact = async () => {
    const target = removing
    setRemoving(null)
    await run(async () => {
      adopt(await apiDelete(contactPath(account.id, target.id)))
    }, `${target.name} removed.`)
  }

  const openAdd = (prefill = NEW_CONTACT) => {
    setError('')
    setEditId(null)
    setDraft(prefill)
    setShowAdd(true)
  }

  const openEdit = (contact) => {
    setError('')
    setEditId(contact.id)
    setDraft(draftFrom(contact, CONTACT_FIELDS))
    setShowAdd(true)
  }

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  if (status === 'loading') return <PanelNote>Loading the contact book…</PanelNote>
  if (status === 'error') return <PanelNote tone="danger">{loadError}</PanelNote>

  if (!account) {
    return (
      <div style={{ marginTop: 30 }}>
        <div style={sectionHead}>Contacts</div>
        <div style={{ marginTop: 10, ...mutedText }}>
          No contact book exists for this client yet.
        </div>
        <div style={{ marginTop: 12 }}>
          <GhostButton tone="accent" disabled={busy} onClick={enable}>
            Enable contacts
          </GhostButton>
        </div>
        <ErrorLine style={{ marginTop: 10 }}>{error}</ErrorLine>
      </div>
    )
  }

  const contacts = account.contacts ?? []
  const people = account.d365_people ?? []

  return (
    <div style={{ marginTop: 30, display: 'grid', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={sectionHead}>Contacts</div>
          <GhostButton
            disabled={busy}
            onClick={() => {
              if (showAdd) {
                setShowAdd(false)
                setEditId(null)
              } else {
                openAdd()
              }
            }}
          >
            {showAdd ? 'Cancel' : 'Add contact'}
          </GhostButton>
        </div>

        <ErrorLine style={{ marginTop: 8 }}>{error}</ErrorLine>
        {flashNote && (
          <div style={{ marginTop: 6, fontSize: 12, color: c.sage }}>{flashNote}</div>
        )}

        {showAdd && (
          <form onSubmit={submitContact} style={{ marginTop: 12 }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}
              className="r-grid-2"
            >
              {CONTACT_FIELDS.map((field) => (
                <Field key={field.key} label={field.label}>
                  <input
                    value={draft[field.key] ?? ''}
                    disabled={busy}
                    onChange={setField(field.key)}
                    style={inputStyle}
                  />
                </Field>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <GhostButton type="submit" tone="accent" disabled={busy}>
                {editId != null ? 'Save contact' : 'Add contact'}
              </GhostButton>
            </div>
          </form>
        )}

        {contacts.length === 0 ? (
          <div style={{ ...mutedText, marginTop: 10 }}>
            No people recorded yet{people.length > 0 ? ' — add them from the Dynamics list below.' : '.'}
          </div>
        ) : (
          <div style={{ marginTop: 10, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            {contacts.map((contact) => (
              <div
                key={contact.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.1fr 1fr 1.3fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderBottom: `1px solid ${c.line}`,
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
                  {contact.email || contact.note || '—'}
                </span>
                <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <GhostButton disabled={busy} onClick={() => openEdit(contact)}>
                    Edit
                  </GhostButton>
                  <GhostButton disabled={busy} tone="danger" onClick={() => setRemoving(contact)}>
                    Remove
                  </GhostButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {people.length > 0 && (
        <div>
          <div style={sectionHead}>People in Dynamics</div>
          <div style={{ ...mutedText, marginTop: 6 }}>
            Read-only, from the mirror — Add copies one into the contact book above.
          </div>
          <div style={{ marginTop: 10, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
            {people.map((person, index) => (
              <div
                key={`${person.full_name}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.1fr 1fr 1.3fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '9px 14px',
                  borderBottom: `1px solid ${c.line}`,
                }}
              >
                <span style={{ fontSize: 12.5, color: c.inkSoft, minWidth: 0 }}>
                  {person.full_name || '—'}
                  {person.job_title && (
                    <span style={{ ...mutedText, fontSize: 11.5 }}> · {person.job_title}</span>
                  )}
                </span>
                <span style={{ ...monoText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {person.mobile_phone || person.business_phone || '—'}
                </span>
                <span style={{ ...monoText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {person.email || '—'}
                </span>
                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <GhostButton disabled={busy} onClick={() => openAdd(personPrefill(person))}>
                    Add
                  </GhostButton>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name ?? 'this contact'}?`}
        body="This removes the person from the client's contact book. Their portal login, if any, is untouched."
        confirmLabel="Remove contact"
        onConfirm={removeContact}
        onCancel={() => setRemoving(null)}
        busy={busy}
      />
    </div>
  )
}
