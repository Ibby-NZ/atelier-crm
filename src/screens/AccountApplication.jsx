import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import ApplicationDetail from '../admin/ApplicationDetail.jsx'
import { apiDelete, safeFetch } from '../lib/api.js'
import { GhostButton, mutedText } from '../admin/parts.jsx'
import { applicationPath, canDeleteApplication } from './clientCompanies.js'

// The trade application that raised this company, on the company (Sept 2026).
// Read on expand, never with the list: the form is thirty columns of business
// and director detail, and the roster page would carry fifty of them.
//
//   GET    /admin/trade-applications/:id   → { application }
//   DELETE /admin/trade-applications/:id   offered once the account is declined
//
// A declined form shows the reason the applicant was emailed (24 Sep 2026).
//
// Delete form is the way out of a dead end, not a review verb: the API refuses
// to delete a login while a form points at it, and an archived login still owns
// its email, so without it a declined applicant's address could never be signed
// up again. A live login's form is the record under review or the client's
// business record, so it is never offered then — see `canDeleteApplication`.

const submittedOn = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AccountApplication({ account, mutation, confirmation }) {
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const id = account.trade_application_id
  // Re-read when a login's state moves: a decline writes its reason onto the form.
  const loginsStamp = (account.users ?? []).map((u) => `${u.id}:${u.archived_at ?? ''}`).join(',')

  useEffect(() => {
    let active = true
    safeFetch(applicationPath(id)).then(({ data, error: failure }) => {
      if (!active) return
      if (failure) setError(failure)
      else setForm(data.application)
    })
    return () => { active = false }
  }, [id, loginsStamp])

  const remove = async () => {
    const ok = await confirmation.ask({
      title: `Delete ${account.company_name}'s application form?`,
      body: 'The submitted form is removed for good. The company row, its contacts and the archived login stay.',
      confirmLabel: 'Delete form',
      confirmTone: 'danger',
    })
    if (ok) mutation.run(() => apiDelete(applicationPath(id)), 'Application form deleted.')
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
          Trade application{form && <span style={{ ...mutedText, fontWeight: 400, marginLeft: 8 }}>submitted {submittedOn(form.created_at)}</span>}
        </span>
        {canDeleteApplication(account) && <GhostButton tone="danger" disabled={mutation.busy} onClick={remove}>Delete form</GhostButton>}
      </div>
      {error && <div style={{ ...mutedText, color: c.clay }}>{error}</div>}
      {!error && !form && <div style={{ ...mutedText, fontStyle: 'italic', fontFamily: font.display }}>Loading the application…</div>}
      {form?.decline_reason && (
        <div style={{ margin: '4px 0 10px', padding: '10px 12px', border: `1px solid ${c.line}`, borderRadius: 4, fontSize: 12.5, color: c.inkSoft }}>
          <strong style={{ color: c.clay }}>Declined {submittedOn(form.declined_at)}.</strong> Reason emailed to the applicant: {form.decline_reason}
        </div>
      )}
      {form && <ApplicationDetail form={form} />}
    </section>
  )
}
