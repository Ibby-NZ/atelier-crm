// A contact's fields, shared by the two places that write them: the create
// page (ContactNew, POST /admin/contacts) and one contact's own page (Contact,
// PATCH /admin/contacts/:id). One component, so the fields, the note box and
// the "company only while unfiled" rule cannot drift between adding a person
// and correcting one. CONTACT_FIELDS in ./contacts.js is the declaration.

import { useState } from 'react'
import { ErrorLine, Field, GhostButton, inputStyle } from '../admin/parts.jsx'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { CONTACT_FIELDS } from './contacts.js'

// One form for add and edit: edit sends only the changed keys (diffFields),
// add sends every field (bodyFrom). Both refuse a blank name before the wire.
// The free-text company box is drawn only for an unfiled contact — a filed
// one's company is its account.
export default function ContactForm({ record, busy, submitLabel, onCancel, onSave }) {
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
    <form onSubmit={submit}>
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
        {onCancel && <GhostButton onClick={onCancel} disabled={busy}>Cancel</GhostButton>}
      </div>
    </form>
  )
}
