// New supplier rate — one rate keyed by hand, on its own page. It used to drop
// down above the rate table ("Add a rate by hand"), and the client asked for
// every data-entry form to open on a page of its own instead (23 Sep 2026).
//
//   POST /admin/price-list-items   → { item }   (201; 409 on a duplicate
//                                               supplier + category + code)
//   GET  /admin/suppliers?limit=   → { suppliers }  the supplier dropdown
//   GET  /admin/suppliers/:id      → { supplier }   its houses, the range dropdown
//
// This is for the rate the supplier files do not carry — a new season's rates
// arrive through `npm run convert:pricing` + `import:pricing`, not by typing.
// The API stamps the row `source_file: 'manual-entry'` so a hand-keyed rate
// stays distinguishable from an imported one; neither that nor
// `code_normalized` (derived from the code) is offered here.
//
// **The create declares EVERY field, record lock or not.** `code`,
// `wholesale_rate` and `currency` are required on the POST schema, so a body
// built from the lock's shortened list would be a 400 and the lock would read
// as "adding a rate is broken". Nothing existing is upset by a row that did not
// exist a moment ago — the request's own reasoning (src/screens/recordLock.js).
//
// `supplier` is picked exactly once, here, from the suppliers that exist: it is part of the identity key, so
// the rate's page shows it read-only from then on. A duplicate identity is
// detected by the database, never pre-checked, and the API's 409 names it.
//
// On success the office lands on the new rate's page — landing back on an
// empty form would read as "it did not save", and the page is where the rate
// history starts from its first move.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { bodyFrom } from '../admin/drafts.js'
import { useCategories } from '../admin/useCategories.js'
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
import RateFields from './RateFields.jsx'
import {
  IDENTITY_FIELDS,
  ITEM_FIELDS,
  NEW_ITEM,
  PRICE_LIST_ITEMS_PATH,
  RATE_NOT_POSITIVE,
  RATE_SUPPLIERS_PATH,
  rateCurrencyFor,
  rateListReturn,
  rateRangeOptions,
  rateRoute,
  rateSupplierOptions,
  rateSupplierPath,
} from './adminPriceListItems.js'

export default function AdminPriceListItemNew() {
  const navigate = useNavigate()
  const location = useLocation()
  // Back and Cancel return to the list as it was left when "New rate" was
  // pressed on it, or the bare list after a deep link.
  const listRoute = rateListReturn(location.state)
  const { values: CATEGORIES, labelFor: categoryLabel } = useCategories()
  const { message: toast, flash } = useToast()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the
  // kit's shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })
  const [newItem, setNewItem] = useState(NEW_ITEM)
  const [suppliers, setSuppliers] = useState([])
  const [ranges, setRanges] = useState([])

  useEffect(() => {
    let active = true
    apiFetch(RATE_SUPPLIERS_PATH)
      .then((body) => {
        if (active) setSuppliers(rateSupplierOptions(body.suppliers ?? []))
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load the suppliers.'))
      })
    return () => {
      active = false
    }
  }, [setError])

  // The chosen supplier's houses, for the product-range dropdown.
  const chosenId = suppliers.find((supplier) => supplier.name === newItem.supplier)?.id ?? null
  useEffect(() => {
    setRanges([])
    if (!chosenId) return undefined
    let active = true
    apiFetch(rateSupplierPath(chosenId))
      .then((body) => {
        if (active) setRanges(rateRangeOptions(body.supplier))
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load this supplier’s houses.'))
      })
    return () => {
      active = false
    }
  }, [chosenId, setError])

  // Choosing a supplier clears the range (it was the old supplier's house) and
  // takes the supplier's invoicing currency when a rate may carry it.
  const setNew = (key) => (event) => {
    const value = event.target.value
    if (key !== 'supplier') return setNewItem((n) => ({ ...n, [key]: value }))
    const supplier = suppliers.find((row) => row.name === value)
    return setNewItem((n) => ({
      ...n,
      supplier: value,
      product_range: '',
      currency: rateCurrencyFor(supplier?.currency, n.currency),
    }))
  }

  const createItem = async (event) => {
    event.preventDefault()
    const identity = bodyFrom(newItem, IDENTITY_FIELDS)
    if (identity.error) return setError(identity.error)
    const rest = bodyFrom(newItem, ITEM_FIELDS)
    if (rest.error) return setError(rest.error)
    if (rest.body.wholesale_rate <= 0) return setError(RATE_NOT_POSITIVE)
    let created = null
    const ok = await run(async () => {
      const body = await apiSend('POST', PRICE_LIST_ITEMS_PATH, { ...rest.body, ...identity.body })
      created = body.item
      return body
    }, (res) => `Added ${res.item.supplier} ${res.item.code}.`)
    // Replace, so Back from the new rate goes to the list rather than to an
    // emptied form that would post the rate a second time.
    if (ok && created) {
      navigate(rateRoute(created.id), { replace: true, state: { list: listRoute } })
    }
    return undefined
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow="Price lists · live"
        title={<>New supplier rate</>}
        subtitle="One rate keyed by hand, in the supplier's own currency. A new season's rates arrive through the supplier-file import, not here."
        right={<GhostButton onClick={() => navigate(listRoute)}>Back to supplier rates</GhostButton>}
      />

      <section style={{ ...panel, marginTop: 30 }}>
        <PanelHead label="Add a rate by hand" />
        <form onSubmit={createItem} style={{ padding: 20 }}>
          <RateFields
            values={newItem}
            onChange={setNew}
            disabled={busy}
            categories={CATEGORIES}
            categoryLabel={categoryLabel}
            suppliers={suppliers}
            ranges={ranges}
          />
          <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Add rate
            </GhostButton>
            <GhostButton disabled={busy} onClick={() => navigate(listRoute)}>
              Cancel
            </GhostButton>
          </div>
        </form>
      </section>

      <ToastLine message={toast} />
    </div>
  )
}
