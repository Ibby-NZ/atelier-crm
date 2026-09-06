import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, ApiError } from '../lib/api.js'
import DynamicsCorrection from '../components/DynamicsCorrection.jsx'
import TradeContactsPanel from '../components/TradeContactsPanel.jsx'

// Client account — one real Atelier customer, read live from atelier-api's
// Dynamics-365 staging window (GET /admin/legacy/accounts/:guid). The route param
// :id is the D365 record GUID (see ClientsList — rows link here by cl.guid).
//
// The STAGING TABLE is still read-only — Atelier runs on D365 until cutover and
// every re-import rewrites those rows — so a correction is stored beside it in
// d365_overrides and merged back in at read time. That is what the correction
// panel writes; the values above it are the merged result. The full ~190-column
// original stays one collapsible section away, untouched, because it is what a
// correction is judged against.

const labelCell = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: c.muted,
}

// A value counts as present unless it is null/undefined or a blank string.
// Numbers (incl. 0) and booleans are shown as-is.
const isEmpty = (v) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

// Render one raw D365 cell verbatim; objects/arrays serialise, blanks show a dash.
const formatRaw = (v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const formatImported = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-NZ')
}

// Curated key fields, in display order. `mono` marks ids/emails/codes for the
// tabular typeface. Empty values are filtered out so no blank rows render.
const curatedFields = (record) =>
  [
    { label: 'Account number', value: record.atelier_account_number, mono: true },
    { label: 'Type', value: record.customer_type },
    { label: 'Owner', value: record.owner },
    { label: 'Primary contact', value: record.primary_contact },
    { label: 'Contact email', value: record.primary_contact_email || record.email, mono: true },
    { label: 'Phone', value: record.main_phone, mono: true },
    { label: 'City', value: record.address1_city },
    { label: 'Region', value: record.province },
    { label: 'Territory', value: record.territory },
    { label: 'Currency', value: record.currency, mono: true },
    { label: 'Discount', value: record.discount },
    { label: 'Credit limit', value: record.credit_limit, mono: true },
    { label: 'Payment terms', value: record.payment_terms },
    { label: 'Status', value: record.status_reason },
    { label: 'Xero contact ID', value: record.xero_contact_id, mono: true },
  ].filter((f) => !isEmpty(f.value))

const BackLink = () => (
  <Link to="/clients" className="ab-t" style={{ fontSize: 12.5, color: c.muted, textDecoration: 'none', fontFamily: font.ui }}>
    ← Back to clients
  </Link>
)

export default function ClientAccount() {
  const { id } = useParams()
  const [record, setRecord] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | error
  const [error, setError] = useState('')

  // Hoisted out of the effect and RETURNING its promise, because it is also the
  // post-save reload: a correction changes overridden_fields / stale_fields /
  // custom_fields, all of which the server computes, so nothing here may be
  // patched optimistically.
  //
  // Cancellation is a `runId` counter and NOT the per-effect `active` flag this
  // screen used to carry (the same shape SalesOrder uses). A flag captured at
  // mount would silently discard the post-save refetch, since `load` is called
  // from outside the effect that created it; the counter belongs to the screen,
  // so only a LATER load can retire an earlier one. Without either, navigating
  // client A -> client B renders A's record under B's URL whenever A's response
  // lands second.
  const runId = useRef(0)

  const load = useCallback(() => {
    const run = ++runId.current
    return apiFetch(`/admin/legacy/accounts/${encodeURIComponent(id)}`)
      .then((body) => {
        if (run !== runId.current) return
        const rec = body?.record ?? null
        setRecord(rec)
        setStatus(rec ? 'ready' : 'notfound')
      })
      .catch((err) => {
        if (run !== runId.current) return
        if (err instanceof ApiError && err.status === 404) {
          setStatus('notfound')
          return
        }
        setError(err instanceof ApiError ? err.message : 'Could not load this client.')
        setStatus('error')
      })
  }, [id])

  useEffect(() => {
    setStatus('loading')
    setError('')
    load()
  }, [load])

  if (status === 'notfound') {
    return (
      <NotFound
        title="Client not found"
        backTo="/clients"
        backLabel="Back to clients"
        message="That client account could not be found in Dynamics — it may have been removed, or the link is out of date."
      />
    )
  }

  if (status === 'loading') {
    return (
      <>
        <BackLink />
        <div style={{ marginTop: 16, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '20px 22px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
          Loading client…
        </div>
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        <BackLink />
        <div role="alert" style={{ marginTop: 16, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '20px 22px', fontSize: 13, color: c.clay }}>
          {error}
        </div>
      </>
    )
  }

  const fields = curatedFields(record)
  const rawEntries = record.raw && typeof record.raw === 'object' ? Object.entries(record.raw) : []
  const importedAt = formatImported(record.imported_at)
  const corrected = record.overridden_fields ?? []
  // Corrections Dynamics has since moved underneath — a work queue, so it is
  // said at the top of the screen rather than left to be found field by field.
  const stale = record.override?.stale_fields ?? []

  return (
    <>
      <BackLink />

      <div style={{ marginTop: 14 }}>
        <PageHeader eyebrow="Client · from Dynamics" title={record.name || 'Untitled account'} />
      </div>

      {/* Provenance + flags */}
      <div style={{ marginTop: 15, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <AttributePill>
          {record.origin === 'local' ? 'raised in the back office' : 'mirrored from Dynamics'}
        </AttributePill>
        {corrected.length > 0 && (
          <AttributePill>{corrected.length} corrected here</AttributePill>
        )}
        {record.is_customer && <AttributePill>Customer</AttributePill>}
        {record.is_supplier && <AttributePill>Supplier</AttributePill>}
        {record.customer_type && <AttributePill>{record.customer_type}</AttributePill>}
      </div>

      {stale.length > 0 && (
        <div
          role="status"
          style={{
            marginTop: 15,
            border: `1px solid ${c.clay}`,
            borderRadius: 4,
            background: c.surface,
            padding: '13px 18px',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: c.ink,
            fontFamily: font.ui,
          }}
        >
          Dynamics has changed underneath {stale.length === 1 ? 'a correction' : `${stale.length} corrections`} on this
          account: <span style={{ fontFamily: font.mono }}>{stale.join(', ')}</span>. Check each one below — keeping it
          holds the old figure, reverting hands the field back to Dynamics.
        </div>
      )}

      {/* Curated key fields — a definition list, blanks omitted */}
      <div style={{ marginTop: 28, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.surface }}>
        {fields.length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>
            No curated fields on file for this account.
          </div>
        )}
        {fields.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '200px 1fr',
              gap: 18,
              alignItems: 'baseline',
              padding: '13px 20px',
              borderBottom: i === fields.length - 1 ? 'none' : `1px solid ${c.line}`,
            }}
          >
            <div style={labelCell}>{f.label}</div>
            <div style={{ fontSize: 13.5, color: c.ink, fontFamily: f.mono ? font.mono : font.ui, wordBreak: 'break-word' }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {/* Corrections — written to d365_overrides, never to the staging row.
          The panel fetches the record itself (only the detail read carries
          override.base / stale_fields), so `load` is passed purely to refresh
          what this screen draws above it. */}
      <div style={{ marginTop: 30 }}>
        <DynamicsCorrection entity="accounts" guid={id} onSaved={load} />
      </div>

      {/* The contact book — several named people per company, kept on the
          trade_accounts row (NOT the mirror row: the import upsert would
          destroy anything written there). GUID-keyed via by-guid. */}
      <TradeContactsPanel guid={id} />

      {/* Full original record — every D365 column, kept out of the way */}
      {rawEntries.length > 0 && (
        <details style={{ marginTop: 30 }}>
          <summary
            className="ab-t"
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: c.muted,
              padding: '4px 0',
            }}
          >
            All Dynamics fields · {rawEntries.length}
          </summary>
          <div style={{ marginTop: 14, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden', background: c.surface }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                <tbody>
                  {rawEntries.map(([key, value], i) => (
                    <tr key={key} style={{ borderBottom: i === rawEntries.length - 1 ? 'none' : `1px solid ${c.line}` }}>
                      <td
                        style={{
                          ...labelCell,
                          padding: '10px 16px',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'top',
                          textTransform: 'none',
                          letterSpacing: 0,
                          fontSize: 11.5,
                          background: c.surfaceDeep,
                          borderRight: `1px solid ${c.line}`,
                        }}
                      >
                        {key}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12.5, color: c.inkSoft, fontFamily: font.mono, wordBreak: 'break-word', verticalAlign: 'top' }}>
                        {formatRaw(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {/* Provenance footer */}
      {(importedAt || record.source_file) && (
        <div style={{ marginTop: 22, fontSize: 11.5, color: c.muted, fontFamily: font.ui }}>
          {importedAt ? `Imported ${importedAt}` : 'Imported'}
          {record.source_file && (
            <>
              {' from '}
              <span style={{ fontFamily: font.mono }}>{record.source_file}</span>
            </>
          )}
        </div>
      )}
    </>
  )
}
