// One sample order on its own page (23 Sep 2026). The client asked that "any
// kind of data entry … open in their own individual page instead of a tabbed
// drop down", and the order's editor was one of those drop-downs: the form, the
// lifecycle moves and the history opened inside the row on
// /admin/sample-orders. The list is the list; the order is its own page.
//
//   GET   /admin/sample-orders/:id              → { sample_order }
//   PATCH /admin/sample-orders/:id              → { sample_order }  (never `status`)
//   POST  /admin/sample-orders/:id/transition   { status } → { sample_order }
//
// A MOVE IS A VERB, NOT A STATUS PATCH. The buttons come from availableMoves —
// the mirror of the API's machine in sampleFlow.js — so the page never offers a
// move the API would 409, and each one posts the transition endpoint, which
// writes the state AND the stamp that dates it. The history line renders those
// stamps verbatim; nothing here reads a clock.
//
// The single detail read feeds the whole page — form, moves, history — and
// every write re-reads it, so a move shows its new stamp at once.
//
// Archive, restore and delete stay on the list: they are lifecycle verbs on a
// row, and the row is where the office reaches for them (Delete greyed there
// outside requested/cancelled, the API's 409 still authoritative).

import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, StatusPill } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import SampleOrderFields from './SampleOrderFields.jsx'
import { useSamplePickers } from './useSamplePickers.js'
import {
  ArchivedTag,
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  messageOf,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  SAMPLE_ORDERS_PATH,
  SAMPLE_ORDER_FIELDS,
  availableMoves,
  orderMeta,
  orderTitle,
  sampleOrderPath,
  stampDate,
  stampEntries,
  statusLabel,
  statusTone,
  transitionPath,
} from './sampleFlow.js'
import { arrivalNote } from './adminSamples.js'

export default function AdminSampleOrder() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()

  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({})
  const { showrooms, suppliers } = useSamplePickers()

  const load = useCallback(async () => {
    const body = await apiFetch(sampleOrderPath(id))
    setOrder(body.sample_order ?? null)
    return body.sample_order ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload: a
  // save or a move answers with the order, and re-reading is what brings its
  // new stamp into the history.
  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load this sample order.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Arriving from the raise-a-request page, whose toast unmounted with it:
  // flash the note it left in router state once, then clear it so a reload or
  // a Back does not announce the request again.
  useEffect(() => {
    const note = arrivalNote(location.state)
    if (!note) return
    flash(note)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, flash, navigate])

  // Re-seed the form from server truth whenever the record reloads.
  useEffect(() => {
    if (!order) return
    setDraft(draftFrom(order, SAMPLE_ORDER_FIELDS))
  }, [order])

  const backLink = (
    <>
      <Link to={SAMPLE_ORDERS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to sample orders
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Sample order not found"
        backTo={SAMPLE_ORDERS_PATH}
        backLabel="Back to sample orders"
        message="That sample order could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Sample order" />
        <PanelNote>Loading sample order…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Sample order" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!order) return null

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  const saveOrder = () => {
    const diff = diffFields(order, draft, SAMPLE_ORDER_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', sampleOrderPath(order.id), diff.patch), 'Sample order saved.')
  }

  // The move. The buttons come from the mirrored machine, so a 409 here means
  // the order moved under us — the reload shows where it actually is.
  const moveOrder = (move) =>
    run(
      () => apiSend('POST', transitionPath(order), { status: move.key }),
      `Moved to ${statusLabel(move.key)}.`
    )

  const moves = availableMoves(order)

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {orderTitle(order)}
            {order.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={[orderMeta(order), order.showroom_name ? `For ${order.showroom_name}` : '']
          .filter(Boolean)
          .join(' · ')}
        right={<StatusPill tone={statusTone(order.status)}>{statusLabel(order.status)}</StatusPill>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Sample order" />
        {/* The same stack the row expansion held, in the same order — the form,
            Save beside the moves, then the history. */}
        <div style={{ padding: '20px 20px 26px' }}>
          <SampleOrderFields
            values={draft}
            onChange={setField}
            disabled={busy}
            showrooms={showrooms}
            suppliers={suppliers}
          />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostButton tone="accent" disabled={busy} onClick={saveOrder}>
              Save order
            </GhostButton>
            {moves.map((move) => (
              <GhostButton
                key={move.key}
                tone={move.tone}
                disabled={busy}
                onClick={() => moveOrder(move)}
              >
                {move.label}
              </GhostButton>
            ))}
          </div>
          {moves.length === 0 && !order.archived_at && (
            <PanelNote>
              {statusLabel(order.status)} is a terminal state — an abandoned or finished order
              is re-raised as a new request, never reopened.
            </PanelNote>
          )}
          <OrderHistory order={order} />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// One line per stamped transition, in machine order. The dates are the API's
// stamps rendered verbatim — nothing here reads a clock, so this page can never
// disagree with the row it was handed.
function OrderHistory({ order }) {
  const entries = stampEntries(order)
  if (entries.length === 0) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          ...mutedText,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        History
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {entries.map((entry) => (
          <span key={entry.key} style={{ fontSize: 12.5, color: c.inkSoft }}>
            {entry.label}{' '}
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>
              {stampDate(entry.at)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
