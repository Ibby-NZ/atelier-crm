// One showroom on its own page (23 Sep 2026). The client asked that "any kind
// of data entry … open in their own individual page instead of a tabbed drop
// down", and the showroom's editor was one of those drop-downs: the form and the
// "What points here" panel opened inside the row on /admin/showrooms. The list
// is the list; the showroom is its own page.
//
//   GET   /admin/showrooms/:id   → { showroom } + sample_count, sample_order_count
//   PATCH /admin/showrooms/:id   → { showroom }
//
// The single detail read feeds BOTH halves of this page — the edit form and the
// "What points here" counts — so saving re-reads it and the counts come along.
// In the row, the counts were a second fetch of the same endpoint.
//
// Archive, restore and delete stay on the list: they are lifecycle verbs on a
// row, and the row is where the office reaches for them.
//
// **The counts are not a pre-flight.** They come from the by-id read a staff
// member has already opened, which is reading what the API said rather than
// asking again — the kit forbids a "can I delete this" GET, because it races
// the delete and the 409 is authoritative. They count archived rows too,
// matching the delete probes exactly.

import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { c } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import ShowroomFields from './ShowroomFields.jsx'
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
  SHOWROOMS_PATH,
  SHOWROOM_FIELDS,
  holdsSummary,
  showroomMeta,
  showroomPath,
} from './adminShowrooms.js'
import { arrivalNote } from './adminSamples.js'

export default function AdminShowroom() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()

  const [showroom, setShowroom] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({})

  const load = useCallback(async () => {
    const body = await apiFetch(showroomPath(id))
    setShowroom(body.showroom ?? null)
    return body.showroom ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload: a
  // PATCH answers with the showroom, and re-reading is what keeps the counts
  // below true.
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
        setLoadError(messageOf(err, 'Could not load this showroom.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Arriving from the new-showroom page, whose toast unmounted with it: flash
  // the note it left in router state once, then clear it so a reload or a Back
  // does not announce the create again.
  useEffect(() => {
    const note = arrivalNote(location.state)
    if (!note) return
    flash(note)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, flash, navigate])

  // Re-seed the form from server truth whenever the record reloads.
  useEffect(() => {
    if (!showroom) return
    setDraft(draftFrom(showroom, SHOWROOM_FIELDS))
  }, [showroom])

  const backLink = (
    <>
      <Link to={SHOWROOMS_PATH} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to showrooms
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Showroom not found"
        backTo={SHOWROOMS_PATH}
        backLabel="Back to showrooms"
        message="That showroom could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Showroom" />
        <PanelNote>Loading showroom…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Showroom" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!showroom) return null

  const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }))

  const saveShowroom = () => {
    const diff = diffFields(showroom, draft, SHOWROOM_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', showroomPath(showroom.id), diff.patch), 'Showroom saved.')
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {showroom.name}
            {showroom.archived_at && <ArchivedTag />}
          </>
        }
        subtitle={showroomMeta(showroom)}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Showroom" />
        {/* The same stack the row expansion held, in the same order — the form,
            then what points here. */}
        <div style={{ padding: '20px 20px 26px' }}>
          <ShowroomFields values={draft} onChange={setField} disabled={busy} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18 }}>
            <GhostButton tone="accent" disabled={busy} onClick={saveShowroom}>
              Save showroom
            </GhostButton>
          </div>
          <ShowroomHolds detail={showroom} />
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// What stands in the showroom, from the by-id read this page already holds.
// This is the only advance warning that Delete will be refused — the kit
// forbids asking the API "can I delete this", because that races the delete
// and the 409 is authoritative. The counts include archived rows, matching the
// probes exactly.
function ShowroomHolds({ detail }) {
  const holds = holdsSummary(detail)
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
        What points here
      </div>
      <div style={{ marginTop: 8, fontSize: 12.5, color: holds.blocked ? c.ink : c.muted }}>
        {holds.text}
      </div>
    </div>
  )
}
