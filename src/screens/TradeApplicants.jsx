// Trade applicants — the review queue in the Clients section (it used to sit
// under Users & permissions; it belongs with the people who buy, not with staff
// permissions). Approving flips users.trade_approved through the same
// PATCH /admin/users/:id the Clients tab uses. The form itself has one verb,
// Delete form (DELETE /admin/trade-applications/:id), offered once the account
// is declined or gone: the API refuses to delete a login while its form is on
// file, and an archived login still owns its email, so without it a declined
// applicant's address could never be signed up again. See entryActions.
//
// **A row is a pending trade ACCOUNT, not a submitted form.** A trade login the
// office creates itself (POST /admin/users, role `trade`) has no
// `trade_applications` row, so listing forms alone left it in neither tab: the
// Clients tab holds every unapproved trade row back as "awaiting review", and
// this one could not see it. See ./tradeApplicants.js — both counts now come off
// one predicate. A row with a submitted form expands into it; one without says
// so.

import { useState, useRef, useEffect, useCallback } from 'react'
import { c, font } from '../theme.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import ApplicationDetail from '../admin/ApplicationDetail.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import { ErrorLine, GhostButton, PanelHead, PanelNote, ToastLine, panel, useToast } from '../admin/parts.jsx'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import { apiDelete, apiFetch, apiSend, ApiError } from '../lib/api.js'
import { attemptDelete, deleteDialog } from '../admin/deleteFlow.js'
import { buildReviewQueue, entryActions, isPendingEntry, reviewState } from './tradeApplicants.js'

// The form's sections live in ../admin/ApplicationDetail.jsx, shared with the
// client's row on Clients so the two can never drift.

const submittedOn = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TradeApplicants() {
  const confirmation = useConfirmation()
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [showReviewed, setShowReviewed] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState('')
  const { message: toast, flash } = useToast()
  const [removing, setRemoving] = useState(null) // entry whose form is up for deletion
  const [blocked, setBlocked] = useState(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Both sources, in parallel: the submitted forms, and the trade logins the
  // Clients tab is holding back. Either alone loses half the queue.
  const load = useCallback(async (isActive = () => true) => {
    setStatus('loading')
    try {
      const [forms, accounts] = await Promise.all([
        apiFetch('/admin/trade-applications'),
        // include_archived carries the DECLINES: declining archives the login,
        // and the default list excludes archived rows, so without it a decline
        // vanishes from this tab the moment the page reloads.
        apiFetch('/admin/users?segment=clients&role=trade&include_archived=true'),
      ])
      if (!isActive()) return false
      setEntries(buildReviewQueue(forms.applications ?? [], accounts.users ?? []))
      setStatus('ready')
      return true
    } catch (err) {
      if (!isActive()) return false
      setLoadError(err instanceof ApiError ? err.message : 'Could not load trade applications.')
      setStatus('error')
      return false
    }
  }, [])

  useEffect(() => {
    let active = true
    load(() => active)
    return () => { active = false }
  }, [load])

  // Read the whole queue again after a write: its names, states and reviewed
  // population come from the server, just as on the other live list screens.
  const decide = async (request, done) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await request()
      if (await load()) flash(done)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That change could not be saved.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const setApproved = (entry, approved) =>
    decide(
      () => apiSend('PATCH', `/admin/users/${entry.user.id}`, { trade_approved: approved }),
      `${entry.business_name} ${approved ? 'approved for trade' : 'set back to pending'}.`
    )

  // Declining archives the login — the only durable "no" a users row can carry,
  // and the one the API's auth paths already honour. Reversible, so it asks once
  // and offers Restore afterwards rather than warning about permanence it does
  // not have. The row leaves the pending list on success, which is why the toast
  // says where it went.
  const decline = async (entry) => {
    if (
      !await confirmation.ask({
        title: `Decline ${entry.business_name}?`,
        body: `Decline ${entry.business_name}? The account is archived: they can no longer sign in, the application and any history stay intact, and you can restore it from Show reviewed.`,
        confirmLabel: 'Decline' })
    ) {
      return
    }
    return decide(
      () => apiSend('POST', `/admin/users/${entry.user.id}/archive`, {}),
      `${entry.business_name} declined — archived, and listed under Show reviewed.`
    )
  }

  // Restore puts a declined application back where it was: pending, awaiting a
  // decision. It deliberately does not approve — that stays a separate act.
  const restore = (entry) =>
    decide(
      () => apiSend('POST', `/admin/users/${entry.user.id}/restore`, {}),
      `${entry.business_name} restored — back to pending review.`
    )

  // Delete form goes through the shared delete flow: ask, one request, and on a
  // refusal stay open and explain. On success the whole queue reloads rather
  // than patching the entry — an entry whose account is already gone existed
  // only because of its form, so it has to leave the list too.
  const closeRemove = () => {
    setRemoving(null)
    setBlocked(null)
  }
  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    const outcome = await attemptDelete(() => apiDelete(`/admin/trade-applications/${removing.form.id}`), {
      fallback: 'That application could not be deleted.' })
    setBusy(false)
    if (!outcome.ok) {
      setBlocked(outcome.blocked)
      return
    }
    closeRemove()
    await load()
    flash(`${removing.business_name}'s application deleted.`)
  }
  const removeDialog = deleteDialog({
    entity: 'application',
    name: removing?.business_name,
    blocked,
    // trade_applications has no archived_at; the account's archive is the
    // reversible "no", and that verb is Decline on the row itself.
    canArchive: false })

  const visible = showReviewed ? entries : entries.filter(isPendingEntry)
  const pendingCount = entries.filter(isPendingEntry).length

  return (
    <div>
      <PageHeader
        eyebrow="Clients · live"
        title={<>Trade applicants</>}
        subtitle="Trade accounts waiting on a decision — applications submitted from the storefront, with the full form ready for review, and trade logins the office added itself. Approving unlocks trade pricing for that login."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} /> Show reviewed
          </label>
        }
      />
      <SectionTabs tabs={clientsTabs} active="applicants" />

      <div style={{ marginTop: 28 }}>
        <section style={panel}>
          <PanelHead label="Applications" right={<span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{visible.length} shown · {pendingCount} pending</span>} />

          {status === 'loading' && <PanelNote>Loading applications…</PanelNote>}
          {status === 'error' && <PanelNote tone="danger">{loadError}</PanelNote>}
          <ErrorLine style={{ padding: error ? '12px 20px' : undefined }}>{error}</ErrorLine>

          {status === 'ready' && visible.map((entry) => {
            const state = reviewState(entry)
            const can = entryActions(entry)
            const open = openId === entry.key
            return (
              <div key={entry.key} style={{ borderBottom: `1px solid ${c.line}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 140px 260px', gap: 16, alignItems: 'center', padding: '14px 20px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{entry.business_name}</div>
                    <div style={{ fontSize: 11.5, color: c.muted, fontFamily: font.mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.user ? entry.user.email : 'account removed'}
                    </div>
                    {/* An account the office keyed in itself has no form to
                        review; saying so is the difference between "nothing to
                        see" and "something failed to load". */}
                    {!entry.form && (
                      <div style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }}>
                        Added in the back office · no application form
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: c.inkSoft, whiteSpace: 'nowrap' }}>{submittedOn(entry.created_at)}</div>
                  <div><StatusPill tone={state.tone}>{state.label}</StatusPill></div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {entry.form && (
                      <GhostButton disabled={busy} aria-expanded={open} onClick={() => setOpenId(open ? null : entry.key)}>
                        {open ? 'Close' : 'Review'}
                      </GhostButton>
                    )}
                    {can.decline && (
                      <GhostButton disabled={busy} onClick={() => decline(entry)}>Decline</GhostButton>
                    )}
                    {can.approve && (
                      <GhostButton disabled={busy} tone="accent" onClick={() => setApproved(entry, true)}>Approve</GhostButton>
                    )}
                    {can.unapprove && (
                      <GhostButton disabled={busy} onClick={() => setApproved(entry, false)}>Unapprove</GhostButton>
                    )}
                    {can.restore && (
                      <GhostButton disabled={busy} onClick={() => restore(entry)}>Restore</GhostButton>
                    )}
                    {can.deleteForm && (
                      <GhostButton disabled={busy} onClick={() => setRemoving(entry)}>Delete form</GhostButton>
                    )}
                  </div>
                </div>

                {open && entry.form && (
                  <div style={{ padding: '6px 20px 22px', background: c.surface }}>
                    <ApplicationDetail form={entry.form} />
                  </div>
                )}
              </div>
            )
          })}

          {status === 'ready' && visible.length === 0 && (
            <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
              {showReviewed ? 'No trade applications yet.' : 'No trade accounts waiting for review.'}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog {...confirmation.dialog} />
      <ConfirmDialog
        open={removing !== null}
        {...removeDialog}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
        busy={busy}
      />
      <ToastLine message={toast} />
    </div>
  )
}
