// One collection on its own page. The client, 23 Sep 2026: "for any kind of
// data entry … they will open in their own individual page instead of a tabbed
// drop down." This is the editor that used to open INSIDE the collection's row
// on /admin/collections, in the same order — the form, the product count, Save —
// and the list is only the list now (AdminCollections).
//
//   GET   /admin/collections/:id → { collection } (+ product_count)
//   PATCH /admin/collections/:id → { collection }
//
// **The by-id read is where this page earns its keep, as the expanded row did.**
// `product_count` is on the detail read and not on the list, and it is the only
// advance warning that Delete will be refused — the kit forbids a pre-flight
// "can I delete this" GET, so the count a staff member is already looking at is
// where that has to come from. It counts archived products too, matching the
// delete probe: `products.collection_id` is SET NULL, so an unprobed delete
// would report success while silently uncollecting every one of them. Delete
// itself stays on the list, with Archive and Restore: they are lifecycle verbs
// on a row, and a collection that has just been deleted has no page to stay on.
//
// A collection's slug and display name are both unique per HOUSE, never
// globally, so "Cappuccino" alone is a question three houses can answer — the
// house sits under the title, and is read-only here (see CollectionFields).

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import CollectionFields from './CollectionFields.jsx'
import { COLLECTIONS_ROUTE, COLLECTION_FIELDS, brandRoute } from './adminCatalogue.js'
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

export default function AdminCollection() {
  const { id } = useParams()
  const { message: toast, flash } = useToast()

  const [collection, setCollection] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | missing | error
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState({})

  const load = useCallback(async () => {
    const body = await apiFetch(`/admin/collections/${id}`)
    setCollection(body.collection ?? null)
    return body.collection ?? null
  }, [id])

  // useMutation's cycle with the DETAIL read standing in for a list reload: a
  // rename is re-read, so a server-side change lands in the draft.
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
        setLoadError(messageOf(err, 'Could not load this collection.'))
        setStatus(err?.status === 404 ? 'missing' : 'error')
      })
    return () => {
      active = false
    }
  }, [load])

  // Re-seed the form from server truth whenever the record reloads.
  useEffect(() => {
    if (!collection) return
    setDraft(draftFrom(collection, COLLECTION_FIELDS))
  }, [collection])

  const backLink = (
    <>
      <Link to={COLLECTIONS_ROUTE} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to collections
      </Link>
      {' · live'}
    </>
  )

  if (status === 'missing') {
    return (
      <NotFound
        title="Collection not found"
        backTo={COLLECTIONS_ROUTE}
        backLabel="Back to collections"
        message="That collection could not be found — it may have been deleted, or the link is out of date."
      />
    )
  }
  if (status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Collection" />
        <PanelNote>Loading collection…</PanelNote>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Collection" />
        <PanelNote tone="danger">{loadError}</PanelNote>
      </div>
    )
  }
  if (!collection) return null

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))

  const saveCollection = () => {
    const diff = diffFields(collection, draft, COLLECTION_FIELDS)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', `/admin/collections/${collection.id}`, diff.patch), 'Collection saved.')
  }

  const count = collection.product_count

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={
          <>
            {collection.name}
            {collection.archived_at && <ArchivedTag />}
          </>
        }
        // The house, because the name alone is not unique — and one press
        // from its own page.
        subtitle={
          <Link to={brandRoute(collection.brand_id)} className="ab-link" style={{ color: 'inherit' }}>
            {collection.brand_name}
          </Link>
        }
        right={<span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{collection.slug}</span>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Collection" />
        <div style={{ padding: '20px 20px 24px' }}>
          <CollectionFields record={collection} values={draft} set={set} disabled={busy} />
          {/* The count the delete probe will use — archived products
              included, because products.collection_id is SET NULL and a
              delete would otherwise uncollect them silently. */}
          <div style={{ marginTop: 16, ...mutedText }}>
            {count === 0
              ? 'No products in this collection — it can be deleted outright.'
              : `${count} product${count === 1 ? '' : 's'} in this collection (archived ones included). Delete is refused until they are moved out; Archive takes the grouping off the storefront and leaves them selling.`}
          </div>
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 16 }}>
            <GhostButton tone="accent" disabled={busy} onClick={saveCollection}>
              Save collection
            </GhostButton>
          </div>
        </div>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
