// Trade applicants — the review queue in the Clients section (it used to sit
// under Users & permissions; it belongs with the people who buy, not with staff
// permissions). Approving flips users.trade_approved through the same
// PATCH /admin/users/:id the Clients tab uses — the application itself is
// read-only.
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
import { PageHeader, StatusPill, Toast, PrimaryButton, SecondaryButton } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend, ApiError } from '../lib/api.js'
import { buildReviewQueue, entryActions, isPendingEntry, reviewState } from './tradeApplicants.js'

const sectionLabel = { fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.muted, fontFamily: font.ui }
const panel = { border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }

const BUSINESS_TYPE_LABELS = {
  limited_liability_company: 'Limited Liability Company',
  sole_trader: 'Sole Trader',
  partnership: 'Partnership',
}
const yesNo = (v) => (v ? 'Yes' : 'No')
const dash = (v) => (v && String(v).trim() ? v : '—')

// Display layout mirroring the paper form's six sections.
const FORM_SECTIONS = [
  {
    title: 'Customer details',
    rows: [
      ['Business name', (a) => dash(a.business_name)],
      ['Registered name (if different)', (a) => dash(a.registered_name)],
      ['Postal address', (a) => dash(a.postal_address)],
      ['Delivery address', (a) => dash(a.delivery_address)],
      ['Landline phone', (a) => dash(a.landline_phone)],
      ['Mobile phone', (a) => dash(a.mobile_phone)],
    ],
  },
  {
    title: 'Accounts contact',
    rows: [
      ['Contact name', (a) => dash(a.accounts_contact_name)],
      ['Contact person', (a) => dash(a.accounts_contact_person)],
      ['Email', (a) => dash(a.accounts_email)],
    ],
  },
  {
    title: 'Design contact',
    rows: [
      ['Contact name', (a) => dash(a.design_contact_name)],
      ['Email', (a) => dash(a.design_contact_email)],
      ['Phone', (a) => dash(a.design_contact_phone)],
      ['Design qualifications', (a) => dash(a.design_qualifications)],
    ],
  },
  {
    title: 'Communication preferences',
    rows: [
      ['Mailchimp notifications', (a) => yesNo(a.mailchimp_opt_in)],
      ['Primary contact email', (a) => dash(a.primary_contact_email)],
      ['Would like to visit the showrooms', (a) => yesNo(a.wants_showroom_visit)],
      ['Would like an account manager to call', (a) => yesNo(a.wants_account_manager)],
    ],
  },
  {
    title: 'Trading account details',
    rows: [
      ['NZBN', (a) => dash(a.nzbn)],
      ['Type of business', (a) => BUSINESS_TYPE_LABELS[a.business_type] ?? dash(a.business_type)],
      ['Registered office address', (a) => dash(a.registered_office_address)],
      ['Directors / proprietors — names & addresses', (a) => dash(a.directors_names_addresses)],
      ['Directors / proprietors — dates of birth', (a) => dash(a.directors_dates_of_birth)],
      ['Cash account acceptable', (a) => yesNo(a.cash_account_acceptable)],
    ],
  },
  {
    title: 'Trade reference',
    rows: [['Name / contact person / phone', (a) => dash(a.trade_reference)]],
  },
  {
    title: 'Consent',
    rows: [
      ['Terms of Trade accepted', (a) => yesNo(a.terms_accepted)],
      ['The customer (full business & contact name)', (a) => dash(a.customer_full_name)],
      ['Name of signatory', (a) => dash(a.signatory_name)],
      ['Position / title', (a) => dash(a.signatory_position)],
      ['Signature', (a) => dash(a.signature)],
    ],
  },
]

const submittedOn = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TradeApplicants() {
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [showReviewed, setShowReviewed] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const tRef = useRef()

  const flash = (msg) => {
    setToast(msg)
    clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(null), 3600)
  }

  // Both sources, in parallel: the submitted forms, and the trade logins the
  // Clients tab is holding back. Either alone loses half the queue.
  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [forms, accounts] = await Promise.all([
        apiFetch('/admin/trade-applications'),
        // include_archived carries the DECLINES: declining archives the login,
        // and the default list excludes archived rows, so without it a decline
        // vanishes from this tab the moment the page reloads.
        apiFetch('/admin/users?segment=clients&role=trade&include_archived=true'),
      ])
      setEntries(buildReviewQueue(forms.applications ?? [], accounts.users ?? []))
      setStatus('ready')
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load trade applications.')
      setStatus('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Every verb here rewrites the same users row, so they share one path: send,
  // reconcile the fresh account into the entry, say what happened. Reconciling
  // from the RESPONSE rather than from what was asked for is what keeps the pill
  // honest when the API refuses part of it.
  const decide = async (entry, request, done) => {
    setError('')
    try {
      const res = await request()
      setEntries((list) =>
        list.map((x) => (x.key === entry.key ? { ...x, user: res.user } : x))
      )
      flash(done)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That change could not be saved.')
      load() // revert to server truth
    }
  }

  const setApproved = (entry, approved) =>
    decide(
      entry,
      () => apiSend('PATCH', `/admin/users/${entry.user.id}`, { trade_approved: approved }),
      `${entry.business_name} ${approved ? 'approved for trade' : 'set back to pending'}.`
    )

  // Declining archives the login — the only durable "no" a users row can carry,
  // and the one the API's auth paths already honour. Reversible, so it asks once
  // and offers Restore afterwards rather than warning about permanence it does
  // not have. The row leaves the pending list on success, which is why the toast
  // says where it went.
  const decline = (entry) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Decline ${entry.business_name}? The account is archived: they can no longer sign in, the application and any history stay intact, and you can restore it from Show reviewed.`
      )
    ) {
      return
    }
    return decide(
      entry,
      () => apiSend('POST', `/admin/users/${entry.user.id}/archive`, {}),
      `${entry.business_name} declined — archived, and listed under Show reviewed.`
    )
  }

  // Restore puts a declined application back where it was: pending, awaiting a
  // decision. It deliberately does not approve — that stays a separate act.
  const restore = (entry) =>
    decide(
      entry,
      () => apiSend('POST', `/admin/users/${entry.user.id}/restore`, {}),
      `${entry.business_name} restored — back to pending review.`
    )

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

      <div style={{ marginTop: 28, maxWidth: 1000 }}>
        <section style={panel}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={sectionLabel}>Applications</span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
              {visible.length} shown · {pendingCount} pending
            </span>
          </div>

          {status === 'loading' && <div style={{ padding: '16px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading applications…</div>}
          {status === 'error' && <div role="alert" style={{ padding: '16px 20px', fontSize: 12.5, color: c.clay }}>{loadError}</div>}
          {error && <div role="alert" style={{ padding: '12px 20px', fontSize: 12.5, color: c.clay, borderBottom: `1px solid ${c.line}` }}>{error}</div>}

          {status === 'ready' && visible.map((entry) => {
            const state = reviewState(entry)
            const can = entryActions(entry)
            const open = openId === entry.key
            return (
              <div key={entry.key} style={{ borderBottom: `1px solid ${c.line}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 140px 170px', gap: 16, alignItems: 'center', padding: '14px 20px' }}>
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
                      <SecondaryButton size="sm" onClick={() => setOpenId(open ? null : entry.key)}>
                        {open ? 'Close' : 'Review'}
                      </SecondaryButton>
                    )}
                    {can.decline && (
                      <SecondaryButton size="sm" onClick={() => decline(entry)}>Decline</SecondaryButton>
                    )}
                    {can.approve && (
                      <PrimaryButton size="sm" onClick={() => setApproved(entry, true)}>Approve</PrimaryButton>
                    )}
                    {can.unapprove && (
                      <SecondaryButton size="sm" onClick={() => setApproved(entry, false)}>Unapprove</SecondaryButton>
                    )}
                    {can.restore && (
                      <SecondaryButton size="sm" onClick={() => restore(entry)}>Restore</SecondaryButton>
                    )}
                  </div>
                </div>

                {open && entry.form && (
                  <div style={{ padding: '6px 20px 22px', background: c.surface }}>
                    {FORM_SECTIONS.map((section) => (
                      <div key={section.title} style={{ marginTop: 18 }}>
                        <div style={{ ...sectionLabel, marginBottom: 10 }}>{section.title}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }} className="r-grid-2">
                          {section.rows.map(([label, value]) => (
                            <div key={label}>
                              <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.muted, marginBottom: 3 }}>{label}</div>
                              <div style={{ fontSize: 13, color: c.ink, whiteSpace: 'pre-wrap' }}>{value(entry.form)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
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

      {toast && (
        <Toast>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.sage }} />
          {toast}
        </Toast>
      )}
    </div>
  )
}
