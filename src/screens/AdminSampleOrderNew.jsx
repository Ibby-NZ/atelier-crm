// Request sample material — its own page since 23 Sep 2026. The client asked
// that "any kind of data entry … open in their own individual page instead of a
// tabbed drop down", and this form used to drop down above the sample-orders
// list.
//
//   POST /admin/sample-orders   → { sample_order }  (201, always `requested`)
//
// The form is <SampleOrderFields>, the one the order's own page edits with, so
// the two cannot drift. There is no status to choose: a create always lands in
// "requested", and every later state is a move made on the order's page.
//
// Once the request exists it is worked from its own page, and this page is
// replaced by it in history: Back from the new order returns to the list, not
// to an empty form that reads as "it did not save". The toast travels with that
// navigation in router state (arrivalNote), because this page unmounts the
// moment it would have been shown.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import SampleOrderFields from './SampleOrderFields.jsx'
import { useSamplePickers } from './useSamplePickers.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  NEW_SAMPLE_ORDER,
  SAMPLE_ORDERS_PATH,
  SAMPLE_ORDER_FIELDS,
  orderTitle,
  sampleOrderRoute,
} from './sampleFlow.js'

export default function AdminSampleOrderNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this page, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  const [newOrder, setNewOrder] = useState(NEW_SAMPLE_ORDER)
  const { showrooms, suppliers } = useSamplePickers()

  const createOrder = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newOrder, SAMPLE_ORDER_FIELDS)
    if (built.error) return setError(built.error)
    let created = null
    const ok = await run(() =>
      apiSend('POST', SAMPLE_ORDERS_PATH, built.body).then((body) => {
        created = body.sample_order
        return body
      })
    )
    if (ok && created) {
      navigate(sampleOrderRoute(created.id), {
        replace: true,
        state: { flash: `${orderTitle(created)} requested.` },
      })
    }
    return undefined
  }

  const setNewField = (key) => (event) =>
    setNewOrder((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={
          <>
            <Link to={SAMPLE_ORDERS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Back to sample orders
            </Link>
            {' · live'}
          </>
        }
        title={<>Request sample material</>}
        subtitle="Material asked of a house for one of the showrooms. It starts as Requested and is moved on from its own page as it is ordered, ships and arrives."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="The request" />
        <form onSubmit={createOrder} style={{ padding: 20 }}>
          <SampleOrderFields
            values={newOrder}
            onChange={setNewField}
            disabled={busy}
            showrooms={showrooms}
            suppliers={suppliers}
          />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Raise request
            </GhostButton>
            <Link to={SAMPLE_ORDERS_PATH} style={{ textDecoration: 'none' }}>
              <GhostButton disabled={busy}>Cancel</GhostButton>
            </Link>
          </div>
          <PanelNote>
            Every order starts as “Requested” and is advanced from its own page — a state
            and the date it was reached are written together.
          </PanelNote>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
