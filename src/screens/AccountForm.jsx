// The company details form, shared by the two places that write them: the
// create page (ClientCompanyNew, POST /admin/trade-accounts) and one company's
// own page (ClientCompany, PATCH /admin/trade-accounts/:id). One component, so
// the field list, the address box and the rename rule cannot drift between
// raising a company and correcting it. The declarations it reads are
// ACCOUNT_FIELDS / NEW_ACCOUNT_FIELDS in ./clientCompanies.js. `owners` is the
// account-owner dropdown's options (ownerOptions), edit only — the owner is
// the account manager the client sees.

import { useState } from 'react'
import { ErrorLine, Field, GhostButton, Select, inputStyle } from '../admin/parts.jsx'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import { ACCOUNT_FIELDS, CUSTOMER_TYPES, NEW_ACCOUNT_FIELDS, canRename } from './clientCompanies.js'

// One form for add and edit. Edit sends only the changed keys (diffFields);
// add sends every field (bodyFrom). The record is flattened first because the
// API nests the account owner. The company name is greyed on a Dynamics row
// — see `canRename`.
export default function AccountForm({ account, owners = [], busy, submitLabel, onCancel, onSave }) {
  const creating = !account.id
  const fields = creating ? NEW_ACCOUNT_FIELDS : ACCOUNT_FIELDS
  const record = { ...account, account_owner_id: account.account_owner?.id ?? null }
  const [draft, setDraft] = useState(() => draftFrom(record, fields))
  const [error, setError] = useState('')
  const set = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const rename = creating || canRename(account)

  const submit = (event) => {
    event.preventDefault()
    const result = creating ? bodyFrom(draft, fields) : diffFields(record, draft, fields)
    if (result.error) return setError(result.error)
    const payload = result.patch ?? result.body
    if (Object.keys(payload).length === 0) return setError('Nothing has changed.')
    setError('')
    onSave(payload)
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {fields.map((field) => (
          <Field key={field.key} label={field.label} style={field.key === 'address' ? { gridColumn: 'span 2' } : undefined}
            hint={field.key === 'company_name' && !rename
              ? 'Matched to Dynamics invoice history — not renamed here.'
              : field.key === 'account_owner_id' ? 'Shown to the client as their account manager.' : undefined}>
            {field.key === 'address'
              ? <textarea value={draft[field.key] ?? ''} onChange={set(field.key)} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} />
              : field.key === 'customer_type'
                ? <Select value={draft[field.key] ?? ''} onChange={set(field.key)}><option value="">—</option>{CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                : field.key === 'account_owner_id'
                  ? <Select value={draft[field.key] ?? ''} onChange={set(field.key)} aria-label="Account owner"><option value="">— Nobody —</option>{owners.map((o) => <option key={o.id} value={String(o.id)}>{o.label}</option>)}</Select>
                  : <input value={draft[field.key] ?? ''} onChange={set(field.key)} style={inputStyle} disabled={field.key === 'company_name' && !rename} />}
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
