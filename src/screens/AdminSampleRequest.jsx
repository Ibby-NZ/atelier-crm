// One sample request on its own page (23 Sep 2026). The client asked that "any
// kind of data entry … open in their own individual page instead of a tabbed
// drop down", and the request's detail was one of those drop-downs: who asked,
// their note and the cuttings opened inside the row on /admin/sample-requests.
// The queue is the list; the request is its own page.
//
//   GET  /admin/sample-requests/:id                → { sample_request }
//   POST /admin/sample-requests/:id/transition      { status } → { sample_request }
//
// There is nothing to edit: a request is what the shopper sent, lines and all,
// and the office's only answer is to mark it sent once the cuttings go out, or
// decline it. Those two moves are here as well as on the queue's row — this is
// where the cuttings are read, so it is where the office decides — and they
// come from availableMoves, the mirror of the API's machine in
// sampleRequestFlow.js, so a door that is locked is never drawn.
//
// Archive, restore and delete stay on the queue's row: they are lifecycle verbs
// on a row, and the row is where the office reaches for them.

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import {
  ArchivedTag,
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  messageOf,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import { productPath } from './adminOrders.js'
import {
  SAMPLE_REQUESTS_PATH,
  availableMoves,
  lineCountLabel,
  movedLine,
  requesterLabel,
  sampleRequestPath,
  statusLabel,
  statusTone,
  transitionPath,
} from './sampleRequestFlow.js'

const LINE_COLUMNS = '1fr 1.6fr 1.4fr'

export default function AdminSampleRequest() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [request, setRequest] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    const body = await apiFetch(sampleRequestPath(id))
    setRequest(body.sample_request ?? null)
    return body.sample_request ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload: a
  // move answers with the request, and re-reading is what stamps it here.
  const { busy, error, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this sample request.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  const backLink = (
    <>
      <Link to={SAMPLE_REQUESTS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to sample requests
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Sample request not found"
        backTo={SAMPLE_REQUESTS_PATH}
        backLabel="Back to sample requests"
        message="That sample request could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Sample request" />
        <PanelNote>Loading sample request…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Sample request" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!request) return null

  const move = (target) =>
    run(
      () => apiSend('POST', transitionPath(request), { status: target.key }),
      `${request.request_number} — ${statusLabel(target.key).toLowerCase()}.`
    )

  const moves = availableMoves(request)

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            <span style={{ fontFamily: font.mono }}>{request.request_number}</span>
            {request.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={`${requesterLabel(request)} · ${lineCountLabel(request)} · ${movedLine(request)}`}
        right={<StatusPill tone={statusTone(request.status)}>{statusLabel(request.status)}</StatusPill>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead
          label="Request"
          right={
            moves.length > 0 ? (
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {moves.map((target) => (
                  <GhostButton key={target.key} tone={target.tone} disabled={busy} onClick={() => move(target)}>
                    {target.label}
                  </GhostButton>
                ))}
              </span>
            ) : null
          }
        />
        <ErrorLine style={{ padding: '12px 20px 0' }}>{error}</ErrorLine>
        {/* The same stack the row expansion held, in the same order — who asked
            and their note side by side, then the cuttings. */}
        <div style={{ padding: '18px 20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            <div>
              <span style={sectionLabel}>Who asked</span>
              <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7 }}>
                <div style={{ color: c.ink, fontWeight: 500 }}>{requesterLabel(request)}</div>
                <div>
                  <a href={`mailto:${request.contact_email}`} style={{ color: c.accent }}>{request.contact_email}</a>
                </div>
                {request.contact_phone && <div style={monoText}>{request.contact_phone}</div>}
                {request.user_id != null ? (
                  <div style={{ marginTop: 6 }}>
                    <Link to={`/clients/accounts?q=${encodeURIComponent(request.account_email ?? request.contact_email)}`} style={{ color: c.accent }}>
                      Open client account
                    </Link>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, fontStyle: 'italic', fontFamily: font.display }}>Guest — no account.</div>
                )}
              </div>
            </div>
            <div>
              <span style={sectionLabel}>Their note</span>
              <div style={{ marginTop: 10, ...mutedText, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {request.notes || <span style={{ fontStyle: 'italic', fontFamily: font.display }}>Nothing added.</span>}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <span style={sectionLabel}>Cuttings</span>
            <div style={{ ...panel, marginTop: 10, background: c.paper }}>
              <HeaderRow columns={LINE_COLUMNS} labels={['SKU', 'Design', 'Note']} />
              {(request.lines ?? []).map((line) => (
                <Row key={line.id} columns={LINE_COLUMNS} style={{ alignItems: 'start' }}>
                  <span style={{ ...monoText, paddingTop: 2 }}>
                    {productPath(line.product_id) ? (
                      <Link to={productPath(line.product_id)} style={{ color: 'inherit' }}>{line.sku}</Link>
                    ) : (
                      line.sku
                    )}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: c.ink }}>
                      {line.product_name ?? '—'}
                      {line.colourway_name ? ` — ${line.colourway_name}` : ''}
                    </span>
                    {line.brand_name && <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>{line.brand_name}</span>}
                  </span>
                  <span style={{ ...mutedText, fontSize: 12, whiteSpace: 'pre-wrap' }}>{line.note ?? '—'}</span>
                </Row>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
