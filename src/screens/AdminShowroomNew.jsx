// A new showroom — its own page since 23 Sep 2026. The client asked that "any
// kind of data entry … open in their own individual page instead of a tabbed
// drop down", and this form used to drop down above the showrooms list.
//
//   POST /admin/showrooms   → { showroom }  (201)
//
// The form is <ShowroomFields>, the one the showroom's own page edits with, so
// the two cannot drift. Once the showroom exists it is worked from its own
// page, and this page is replaced by it in history: Back from the new showroom
// returns to the list, not to an empty form that reads as "it did not save".
// The toast travels with that navigation in router state (arrivalNote), because
// this page unmounts the moment it would have been shown.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import ShowroomFields from './ShowroomFields.jsx'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  ToastLine,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import { NEW_SHOWROOM, SHOWROOMS_PATH, SHOWROOM_FIELDS, showroomRoute } from './adminShowrooms.js'

export default function AdminShowroomNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this page, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  const [newShowroom, setNewShowroom] = useState(NEW_SHOWROOM)

  const createShowroom = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newShowroom, SHOWROOM_FIELDS)
    if (built.error) return setError(built.error)
    let created = null
    const ok = await run(() =>
      apiSend('POST', SHOWROOMS_PATH, built.body).then((body) => {
        created = body.showroom
        return body
      })
    )
    if (ok && created) {
      navigate(showroomRoute(created.id), {
        replace: true,
        state: { flash: `${created.name} added.` },
      })
    }
    return undefined
  }

  const setNewField = (key) => (event) =>
    setNewShowroom((n) => ({ ...n, [key]: event.target.value }))

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={
          <>
            <Link to={SHOWROOMS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
              ← Back to showrooms
            </Link>
            {' · live'}
          </>
        }
        title={<>New showroom</>}
        subtitle="A place samples stand and sample orders are sent. The name is unique — it is what every sample and sample order names this place by."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="The showroom" />
        <form onSubmit={createShowroom} style={{ padding: 20 }}>
          <ShowroomFields values={newShowroom} onChange={setNewField} disabled={busy} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Add showroom
            </GhostButton>
            <Link to={SHOWROOMS_PATH} style={{ textDecoration: 'none' }}>
              <GhostButton disabled={busy}>Cancel</GhostButton>
            </Link>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
