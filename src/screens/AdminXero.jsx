// Xero — LIVE connection and sync screen, wired to atelier-api's /admin/xero/*
// (C4). Invoicing itself lives on the Orders screen ("Create invoice in
// Xero" beside the manual reference); this screen owns the connection and the
// two bulk syncs.
//
//   GET  /admin/xero/status         → { xero: { configured, connected, grant_type, org_name } }
//   POST /admin/xero/connect        → { consent_url }            director only
//   GET  /admin/xero/callback       → browser redirect back here ?connected=1/0&reason=…
//   POST /admin/xero/disconnect     → { xero }                   director only
//   POST /admin/xero/sync/contacts  → { result: { linked, created, failed } }
//   POST /admin/xero/sync/suppliers → { result: { linked, created, failed } }
//   POST /admin/xero/sync/items     → 202 { job }  starts the background catalogue sync
//   GET  /admin/xero/sync/items     → { job: { running, total, pushed, failed, error } | null }
//   POST /admin/xero/pull/contacts  → { result: { seen, companies, suppliers, people, skipped, failed } }
//   POST /admin/xero/pull/statuses  → { result: { invoices, bills } }
//
// Two directions: the sync blocks push platform → Xero; the pull blocks read
// Xero → platform (contacts both ways, and the status of every invoice and
// bill pushed — a PAID invoice marks its order paid here). The API runs the
// pull on a timer when XERO_PULL_INTERVAL_MINUTES is set; these buttons are
// the same calls by hand.
//
// Three API rules the screen honours:
//   - **Unconfigured is a server state, not an error.** With no XERO_CLIENT_ID
//     the API answers { configured: false } and every action 503s — the screen
//     says what to set and offers nothing.
//   - **Connect/disconnect are DIRECTOR-only** (the consent grants an external
//     system the company's books). The buttons render disabled for backoffice
//     with a note; the API 403 is the real gate.
//   - **Connecting is a NAVIGATION, not a request**: the consent URL is opened
//     in this tab, Xero bounces the director's browser through the API's
//     callback, and the API redirects back here with ?connected=1/0 — which is
//     read once on mount and folded into the toast.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useConfirmation } from '../admin/useConfirmation.js'
import { SectionTabs, adminTabs } from '../components/sectionTabs.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiSend, safeFetch } from '../lib/api.js'

const ITEM_POLL_MS = 3000
import {
  describeContactSync,
  describeItemSync,
  describePullContacts,
  describePullStatuses,
  parseXeroReturn,
  syncFailures,
} from './adminXero.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  messageOf,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useToast,
} from '../admin/parts.jsx'

export default function AdminXero() {
  const confirmation = useConfirmation()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isDirector = user?.apiRole === 'director'

  const [status, setStatus] = useState(null) // null = still loading
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [contactResult, setContactResult] = useState(null)
  const [supplierResult, setSupplierResult] = useState(null)
  const [itemResult, setItemResult] = useState(null)
  const [pullContactsResult, setPullContactsResult] = useState(null)
  const [pullStatusesResult, setPullStatusesResult] = useState(null)
  const { message, flash } = useToast()

  const loadStatus = async () => {
    const { data, error: loadError } = await safeFetch('/admin/xero/status')
    if (loadError) {
      setError(messageOf(loadError))
      return
    }
    setStatus(data.xero)
  }

  // StrictMode mounts twice — the active flag keeps the stale pass silent.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error: loadError } = await safeFetch('/admin/xero/status')
      if (!active) return
      if (loadError) setError(messageOf(loadError))
      else setStatus(data.xero)
    })()
    return () => {
      active = false
    }
  }, [])

  // The OAuth callback bounced back here with ?connected=… — say how it went,
  // then clear the query so a refresh doesn't repeat the toast.
  useEffect(() => {
    const outcome = parseXeroReturn(location.search)
    if (!outcome) return
    if (outcome.outcome === 'connected') flash('Connected to Xero.')
    else setError(`Xero connection failed${outcome.reason ? ` — ${outcome.reason}` : ''}.`)
    navigate('/admin/xero', { replace: true })
  }, [])

  const run = async (fn) => {
    setError('')
    setBusy(true)
    try {
      return await fn()
    } catch (requestError) {
      setError(messageOf(requestError))
      return null
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      const body = await apiSend('POST', '/admin/xero/connect', {})
      // Same-tab navigation: Xero brings the director back via the API.
      window.location.assign(body.consent_url)
    })

  const disconnect = async () => {
    if (!await confirmation.ask({
      title: 'Disconnect Xero?',
      body: 'Disconnect Xero? Invoice pushes and syncs stop until a director reconnects.',
      confirmLabel: 'Disconnect',
    })) {
      return
    }
    run(async () => {
      await apiSend('POST', '/admin/xero/disconnect', {})
      await loadStatus()
      flash('Xero disconnected.')
    })
  }

  const syncContacts = () =>
    run(async () => {
      const body = await apiSend('POST', '/admin/xero/sync/contacts', {})
      setContactResult(body.result)
      flash(`Clients synced — ${describeContactSync(body.result)}.`)
    })

  const syncSuppliers = () =>
    run(async () => {
      const body = await apiSend('POST', '/admin/xero/sync/suppliers', {})
      setSupplierResult(body.result)
      flash(`Suppliers synced — ${describeContactSync(body.result)}.`)
    })

  // The catalogue sync runs in the API's background (minutes at Xero's rate
  // limit); the screen polls it rather than holding a request open.
  const pollItemSync = async () => {
    for (;;) {
      const { data, error: pollError } = await safeFetch('/admin/xero/sync/items')
      if (pollError) {
        setError(messageOf(pollError))
        return null
      }
      setItemResult(data.job)
      if (!data.job?.running) return data.job
      await new Promise((resolve) => setTimeout(resolve, ITEM_POLL_MS))
    }
  }

  const syncItems = async () => {
    const body = await run(() => apiSend('POST', '/admin/xero/sync/items', {}))
    if (!body) return
    setItemResult(body.job)
    const job = await pollItemSync()
    if (job?.error) setError(job.error)
    else if (job) flash(`Catalogue synced — ${describeItemSync(job)}.`)
  }

  // A sync started before this page opened (or before a reload) keeps going
  // on the server; pick its progress back up.
  useEffect(() => {
    ;(async () => {
      const { data } = await safeFetch('/admin/xero/sync/items')
      if (data?.job?.running) pollItemSync()
      else if (data?.job) setItemResult(data.job)
    })()
  }, [])

  const pullContacts = () =>
    run(async () => {
      const body = await apiSend('POST', '/admin/xero/pull/contacts', {})
      setPullContactsResult(body.result)
      flash(`Contacts pulled — ${describePullContacts(body.result)}.`)
    })

  const pullStatuses = () =>
    run(async () => {
      const body = await apiSend('POST', '/admin/xero/pull/statuses', {})
      setPullStatusesResult(body.result)
      flash(`Statuses pulled — ${describePullStatuses(body.result)}.`)
    })

  const configured = status?.configured
  const connectedNow = status?.connected

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow="Administration"
        title="Xero"
        subtitle="Invoices from sales orders, bills from purchase orders, clients, suppliers and the catalogue in step both ways. The documents are pushed from their own screens — this is the connection behind them."
      />
      <SectionTabs tabs={adminTabs} active="xero" />

      <section style={{ ...panel, marginTop: 28 }}>
        <PanelHead label="Connection" />
        {status === null ? (
          error ? <PanelNote tone="danger">{error}</PanelNote> : <PanelNote>Checking the connection…</PanelNote>
        ) : !configured ? (
          <PanelNote>
            Xero is not configured on the API. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET in
            atelier-api&apos;s environment; until then every Xero action answers 503.
          </PanelNote>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', padding: '16px 20px 20px' }}>
            <div>
              <span style={sectionLabel}>Status</span>
              <div style={{ marginTop: 8, fontFamily: font.ui, fontSize: 14 }}>
                {connectedNow ? (
                  <>
                    Connected{status.org_name ? <> to <strong>{status.org_name}</strong></> : null}
                  </>
                ) : (
                  'Not connected'
                )}
              </div>
              <div style={{ ...mutedText, marginTop: 4 }}>
                {status.grant_type === 'client_credentials'
                  ? 'Custom connection — the credentials are the consent; nothing to click.'
                  : 'Standard app — a director consents once, Xero remembers it.'}
              </div>
            </div>
            {status.grant_type !== 'client_credentials' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <GhostButton disabled={busy || !isDirector} onClick={connect}>
                  {connectedNow ? 'Reconnect' : 'Connect to Xero'}
                </GhostButton>
                {connectedNow && (
                  <GhostButton tone="danger" disabled={busy || !isDirector} onClick={disconnect}>
                    Disconnect
                  </GhostButton>
                )}
              </div>
            )}
          </div>
        )}
        {configured && !isDirector && status?.grant_type !== 'client_credentials' && (
          <PanelNote>Connecting and disconnecting are director-only.</PanelNote>
        )}
        {status !== null && <ErrorLine>{error}</ErrorLine>}
      </section>

      {configured && (
        <section style={{ ...panel, marginTop: 18 }}>
          <PanelHead label="Push to Xero" />
          <PanelNote>
            All match-first: clients and suppliers link to their existing Xero contact by email
            or exact name before anything is created, and catalogue items key on SKU, so
            re-running is a refresh, never a duplicate. A client filed under a company invoices
            as the company. Invoice and bill pushes link contacts one at a time anyway — the bulk
            run just does it ahead of the first document.
          </PanelNote>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 20px 20px' }}>
            <SyncBlock
              label="Clients → Xero customers"
              buttonLabel="Sync clients"
              busy={busy}
              disabled={!connectedNow}
              onRun={syncContacts}
              line={describeContactSync(contactResult)}
              failures={syncFailures(contactResult)}
            />
            <SyncBlock
              label="Suppliers → Xero suppliers"
              buttonLabel="Sync suppliers"
              busy={busy}
              disabled={!connectedNow}
              onRun={syncSuppliers}
              line={describeContactSync(supplierResult)}
              failures={syncFailures(supplierResult)}
            />
            <SyncBlock
              label="Catalogue → Xero items"
              buttonLabel="Sync catalogue"
              busy={busy}
              disabled={!connectedNow || itemResult?.running === true}
              onRun={syncItems}
              line={describeItemSync(itemResult)}
              failures={syncFailures(itemResult)}
            />
          </div>
        </section>
      )}

      {configured && (
        <section style={{ ...panel, marginTop: 18 }}>
          <PanelHead label="Pull from Xero" />
          <PanelNote>
            Contacts: every active Xero contact is matched to a client or supplier here (by id,
            then email, then exact name) and its email, phone and address refreshed from Xero;
            a Xero customer nobody here knows becomes a new client, a Xero supplier a new
            supplier. Names are never changed from this side. Statuses: every invoice and bill
            pushed is re-read — an invoice paid in Xero marks its order paid here, and a voided
            one lets the office push a corrected copy.
          </PanelNote>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 20px 20px' }}>
            <SyncBlock
              label="Xero contacts → clients & suppliers"
              buttonLabel="Pull contacts"
              busy={busy}
              disabled={!connectedNow}
              onRun={pullContacts}
              line={describePullContacts(pullContactsResult)}
              failures={syncFailures(pullContactsResult)}
            />
            <SyncBlock
              label="Invoice & bill statuses → orders"
              buttonLabel="Pull statuses"
              busy={busy}
              disabled={!connectedNow}
              onRun={pullStatuses}
              line={describePullStatuses(pullStatusesResult)}
              failures={syncFailures({
                failed: [
                  ...(pullStatusesResult?.invoices?.failed ?? []),
                  ...(pullStatusesResult?.bills?.failed ?? []),
                ],
              })}
            />
          </div>
        </section>
      )}

      <ConfirmDialog {...confirmation.dialog} />
      <ToastLine message={message} />
    </div>
  )
}

function SyncBlock({ label, buttonLabel, busy, disabled, onRun, line, failures }) {
  return (
    <div style={{ minWidth: 260, flex: '1 1 260px' }}>
      <span style={sectionLabel}>{label}</span>
      <div style={{ marginTop: 10 }}>
        <GhostButton disabled={busy || disabled} onClick={onRun}>
          {buttonLabel}
        </GhostButton>
      </div>
      {line && <div style={{ ...mutedText, marginTop: 8 }}>{line}</div>}
      {failures.shown.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {failures.shown.map((failure) => (
            <div key={failure.key} style={{ ...monoText, marginTop: 2 }}>
              {failure.key} — {failure.message}
            </div>
          ))}
          {failures.more > 0 && (
            <div style={{ ...mutedText, marginTop: 4 }}>…and {failures.more} more.</div>
          )}
        </div>
      )}
    </div>
  )
}
