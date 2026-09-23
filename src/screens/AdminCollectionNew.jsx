// New collection, on a page of its own. It used to drop down above the
// collections list ("Add a collection"); the client asked on 23 Sep 2026 for
// every kind of data entry to open "in their own individual page instead of a
// tabbed drop down", and a create is data entry too.
//
//   GET  /admin/brands      → { brands }  the house picker
//   POST /admin/collections → { collection }  (201)
//
// The form is CollectionFields, the same component the collection's own page
// draws. The house is chosen here and never again (COLLECTION_CREATE_ONLY_FIELDS:
// PATCH does not take it), and `?brand_id=` pre-picks it — the list links here
// with the house it is filtered to, because the common path is arriving from
// that house's row on Houses, and the old drop-down pre-picked it in place.
//
// A created collection lands on its own page, where the slug the API generated
// is shown; the name only has to be unique within its house.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import CollectionFields from './CollectionFields.jsx'
import {
  COLLECTIONS_ROUTE,
  COLLECTION_CREATE_ONLY_FIELDS,
  COLLECTION_FIELDS,
  NEW_COLLECTION,
  collectionRoute,
  collectionsPath,
  describeCollection,
} from './adminCatalogue.js'
import {
  ErrorLine,
  GhostButton,
  PanelHead,
  ToastLine,
  messageOf,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'

export default function AdminCollectionNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { message: toast, flash } = useToast()
  // No list on this page, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  // The house the list was filtered to, if any: it pre-picks the form, and
  // Back and Cancel return to that same filtered list.
  const [fromBrand] = useState(() => searchParams.get('brand_id') ?? '')
  const backTo = fromBrand ? collectionsPath({ id: fromBrand }) : COLLECTIONS_ROUTE
  const [newCollection, setNewCollection] = useState(() => ({ ...NEW_COLLECTION, brand_id: fromBrand }))
  const [brands, setBrands] = useState([])

  // Houses back the picker; they change far less often than collections, so
  // they load once. This page has no other read, so a failure says so — an
  // empty picker with no reason reads as "there are no houses".
  useEffect(() => {
    let active = true
    apiFetch('/admin/brands')
      .then((body) => {
        if (active) setBrands(body.brands ?? [])
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load the houses.'))
      })
    return () => {
      active = false
    }
  }, [setError])

  const set = (key, value) => setNewCollection((next) => ({ ...next, [key]: value }))

  const createCollection = async (event) => {
    event.preventDefault()
    const house = bodyFrom(newCollection, COLLECTION_CREATE_ONLY_FIELDS)
    if (house.error) return setError(house.error)
    const rest = bodyFrom(newCollection, COLLECTION_FIELDS)
    if (rest.error) return setError(rest.error)
    let created = null
    const ok = await run(
      () =>
        apiSend('POST', '/admin/collections', { ...rest.body, ...house.body }).then((body) => {
          created = body.collection
          return body
        }),
      (res) => `${describeCollection(res.collection)} created — slug ${res.collection.slug}.`
    )
    // Replace, not push: Back from the new collection should go to the list,
    // not to a filled form that would create it a second time.
    if (ok && created) navigate(collectionRoute(created.id), { replace: true })
    return undefined
  }

  const backLink = (
    <>
      <Link to={backTo} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to collections
      </Link>
      {' · live'}
    </>
  )

  return (
    <div>
      <PageHeader
        eyebrow={backLink}
        title="New collection"
        subtitle="How a house groups its designs on the storefront. A collection belongs to exactly one house, fixed once it is created."
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Add a collection" />
        <form onSubmit={createCollection} style={{ padding: 20 }}>
          <CollectionFields values={newCollection} set={set} disabled={busy} brands={brands} />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Create collection
            </GhostButton>
            <Link to={backTo} style={{ textDecoration: 'none' }}>
              <GhostButton>Cancel</GhostButton>
            </Link>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
