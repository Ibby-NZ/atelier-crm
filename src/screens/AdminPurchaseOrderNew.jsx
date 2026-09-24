// New purchase order — the live one, wired to atelier-api's
// POST /admin/purchase-orders. The counterpart to the derivation on the list
// screen: a stock buy, a re-order placed by phone, anything no open sales order
// records.
//
//   GET  /admin/suppliers?limit=                  → { suppliers } the supplier picker
//   GET  /admin/brands                            → { brands }  the house picker
//   GET  /admin/colourways?brand_id=&limit=&page= → { colourways } the item picker
//   POST /admin/purchase-orders                   → { purchase_order }  (201)
//
// **The supplier comes first (22 Sep 2026, client asked), the house follows,
// and the supplier is STILL never sent.** `supplier_id` is derived from
// `brands.supplier_id` server-side and no schema here names it: a
// client-chosen value produces a perfectly well-formed purchase order addressed
// to the WRONG HOUSE, and the first anyone would hear of it is that house
// shipping the goods. So the supplier picker is a FILTER over the houses list
// (`brandsForSupplier`, off the `supplier_id` already on the brand rows): a
// supplier invoicing one house pre-picks it; one invoicing several asks which,
// because the API raises one purchase order per house. An unlinked house is
// unreachable from this form, so its 422 cannot fire here.
//
// **The item picker is one dropdown of the chosen house's colourways**, every
// page of them (`colourwayPagePaths`) — a house can carry more than the API's
// 200-a-page. A purchase order is one house's paper, so the whole catalogue is
// never offered.
//
// **A sample is added from the same picker and lands in its own section at the
// bottom (C18)** — "Add sample" beside "Add line". It carries the register tag
// its price will flow to when the hanger is receipted, and it never covers
// sales demand; the API refuses an allocation against it.
//
// Money here is the supplier's own currency at numeric(12,4) — NOT cents.
// Purchasing has no integer-cents column anywhere: a purchase is foreign,
// fractional and unconverted. An empty price is NULL ("nobody has priced this"),
// which is a different fact from 0.
//
// Layout only: every rule is in ./adminPurchaseOrders.js.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery } from '../admin/list.js'
import {
  Select,
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  inputStyle,
  messageOf,
  monoCellInput,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  NEW_PURCHASE_ORDER,
  PURCHASE_ORDERS_PATH,
  SUPPLIER_PICKER_LIMIT,
  brandsForSupplier,
  buildPurchaseOrderBody,
  colourwayOptionLabel,
  colourwayPagePaths,
  defaultBrandFor,
  goodsLines,
  newPurchaseOrderLine,
  newPurchaseOrderSampleLine,
  purchaseOrderRoute,
  sampleLines,
  supplierOptions,
} from './adminPurchaseOrders.js'

const LINE_COLUMNS = '1.1fr 1.5fr 90px 110px 110px auto'
// A sample row trades the supplier-code column for the register tag its value
// will flow to on receipt.
const SAMPLE_COLUMNS = '150px 1.6fr 90px 110px auto'

export default function AdminPurchaseOrderNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })

  const [draft, setDraft] = useState(NEW_PURCHASE_ORDER)
  const [lines, setLines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [brands, setBrands] = useState([])
  const [supplierId, setSupplierId] = useState('')
  // The chosen house's colourways: null until a house is chosen, [] while
  // loading or when the house has none.
  const [items, setItems] = useState(null)
  const [itemId, setItemId] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch(`/admin/suppliers?${buildListQuery({ limit: SUPPLIER_PICKER_LIMIT })}`),
      apiFetch('/admin/brands'),
    ])
      .then(([supplierBody, brandBody]) => {
        if (!active) return
        setSuppliers(supplierBody.suppliers ?? [])
        setBrands(brandBody.brands ?? [])
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load the suppliers and houses.'))
      })
    return () => {
      active = false
    }
  }, [setError])

  // Every page of the chosen house's colourways, into one dropdown.
  useEffect(() => {
    if (!draft.brand_id) {
      setItems(null)
      return undefined
    }
    let active = true
    setLoadingItems(true)
    setItems([])
    const brandId = Number(draft.brand_id)
    apiFetch(colourwayPagePaths(brandId, 0)[0])
      .then(async (first) => {
        const rest = colourwayPagePaths(brandId, first.meta?.total ?? 0).slice(1)
        const pages = await Promise.all(rest.map((path) => apiFetch(path)))
        return [first, ...pages].flatMap((body) => body.colourways ?? [])
      })
      .then((all) => {
        if (active) setItems(all)
      })
      .catch((err) => {
        if (active) setError(messageOf(err, 'Could not load this house’s items.'))
      })
      .finally(() => {
        if (active) setLoadingItems(false)
      })
    return () => {
      active = false
    }
  }, [draft.brand_id, setError])

  const supplierChoices = supplierOptions(suppliers)
  const houses = brandsForSupplier(brands, supplierId)
  const chosenItem = (items ?? []).find((item) => String(item.id) === itemId) ?? null

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  // Changing the house empties the lines: they are colourways of the old one,
  // and a purchase order carrying another maison's designs is refused by the
  // derivation of everything downstream from it.
  const chooseBrand = (value) => {
    set({ brand_id: value })
    setLines([])
    setItemId('')
    setError('')
  }

  const chooseSupplier = (value) => {
    setSupplierId(value)
    chooseBrand(defaultBrandFor(brandsForSupplier(brands, value)))
    set({ supplier_id: value })
  }

  const addLine = (colourway) => setLines((current) => [...current, newPurchaseOrderLine(colourway)])
  // A sample of the same design, on the same paper (C18). Same state array —
  // buildPurchaseOrderBody puts the samples at the bottom of the document — but
  // its own section below, so the split staff will see on the raised order is
  // the one they keyed.
  const addSample = (colourway) =>
    setLines((current) => [...current, newPurchaseOrderSampleLine(colourway)])
  const setLine = (index, patch) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  const removeLine = (index) => setLines((current) => current.filter((_, i) => i !== index))

  const submit = async () => {
    const built = buildPurchaseOrderBody(draft, lines)
    if (!built.ok) return setError(built.error)
    let created = null
    const ok = await run(() => {
      return apiSend('POST', PURCHASE_ORDERS_PATH, built.body).then((body) => {
        created = body.purchase_order
        return body
      })
    }, (result) => `${result.purchase_order.po_number} raised.`)
    // The order is worked from its own screen from here on; landing back on an
    // empty form would read as "it did not save".
    if (ok && created) navigate(purchaseOrderRoute(created.id))
    return undefined
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orders · live"
        title={<>New purchase order</>}
        subtitle="A purchase order the office keys itself — a stock buy, or an order placed by phone. It is addressed to whoever invoices the house."
        right={
          <GhostButton onClick={() => navigate('/admin/purchase-orders')}>
            Back to purchase orders
          </GhostButton>
        }
      />
      <SectionTabs tabs={ordersTabs} active="purchase" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead label="Who and what" />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Field
                label="Supplier"
                hint="Whoever invoices Atelier. Currency, agent, Incoterm and PO address are taken from their record."
              >
                <Select
                  value={supplierId}
                  disabled={busy}
                  onChange={(e) => chooseSupplier(e.target.value)}
                  aria-label="Supplier"
                >
                  <option value="">Choose a supplier…</option>
                  {supplierChoices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="House"
                hint={
                  houses.length > 1
                    ? 'This supplier invoices several houses; a purchase order is one house’s paper.'
                    : 'Filled from the supplier.'
                }
              >
                <Select
                  value={draft.brand_id}
                  disabled={busy || !supplierId}
                  onChange={(e) => chooseBrand(e.target.value)}
                  aria-label="House"
                >
                  <option value="">{supplierId ? 'Choose a house…' : 'Choose a supplier first'}</option>
                  {houses.map((house) => (
                    <option key={house.id} value={house.id}>
                      {house.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expected" hint="When the house says it will ship. Optional.">
                <input
                  type="date"
                  value={draft.expected_at}
                  disabled={busy}
                  onChange={(e) => set({ expected_at: e.target.value })}
                  aria-label="Expected date"
                  style={inputStyle}
                />
              </Field>
              <Field label="Notes" hint="Anything that has to travel with the paper.">
                <input
                  value={draft.notes}
                  disabled={busy}
                  onChange={(e) => set({ notes: e.target.value })}
                  aria-label="Notes"
                  style={inputStyle}
                />
              </Field>
            </div>
            {supplierId && houses.length === 0 && (
              <ErrorLine>
                This supplier invoices no house yet. Link one on the Houses screen first — a
                purchase order is raised against a house.
              </ErrorLine>
            )}
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Lines" />
          <HeaderRow
            columns={LINE_COLUMNS}
            numeric={[2, 3]}
            labels={['SKU', 'Design · colour', 'Quantity', 'Unit price', 'Supplier code', '']}
          />
          {goodsLines(lines).length === 0 && (
            <PanelNote>No lines yet — search this house’s colourways below.</PanelNote>
          )}
          {/* One state array, two sections: the samples render below, and the
              index into `lines` is what setLine/removeLine key on, so the map
              stays over the whole array and skips the other kind. */}
          {lines.map((line, index) => line.is_sample ? null : (
            <Row key={`${line.colourway_id}-${index}`} columns={LINE_COLUMNS}>
              <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {line.sku || `#${line.colourway_id}`}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {line.product_name || '—'}
                </span>
                <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                  {line.colourway_name}
                </span>
              </span>
              <input
                value={line.qty_ordered}
                disabled={busy}
                inputMode="decimal"
                onChange={(e) => setLine(index, { qty_ordered: e.target.value })}
                aria-label={`Quantity for ${line.sku || line.colourway_id}`}
                style={{ ...monoCellInput, textAlign: 'right' }}
              />
              <input
                value={line.unit_price}
                disabled={busy}
                inputMode="decimal"
                placeholder="Not priced"
                onChange={(e) => setLine(index, { unit_price: e.target.value })}
                aria-label={`Unit price for ${line.sku || line.colourway_id}`}
                style={{ ...monoCellInput, textAlign: 'right' }}
              />
              <input
                value={line.supplier_code}
                disabled={busy}
                placeholder="Optional"
                onChange={(e) => setLine(index, { supplier_code: e.target.value })}
                aria-label={`Supplier code for ${line.sku || line.colourway_id}`}
                style={cellInput}
              />
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <GhostButton tone="danger" disabled={busy} onClick={() => removeLine(index)}>
                  Remove
                </GhostButton>
              </span>
            </Row>
          ))}
          <div style={{ padding: '12px 20px', ...mutedText, fontSize: 11.5, borderTop: `1px solid ${c.line}` }}>
            Leave a price blank and it is worked out from the design&rsquo;s wholesale rate less the
            house&rsquo;s discount; where no wholesale rate is set yet it stays unpriced rather than
            zero, because a zero purchase price reads as free.
          </div>
        </section>

        {/* C18: samples at the BOTTOM of the paper, in the client's words. The
            barcode is the register tag the price will flow to when the hanger
            is receipted; it is optional, because the tag is often printed after
            the arrival — the value then goes onto the sample by hand. */}
        {sampleLines(lines).length > 0 && (
          <section style={panel}>
            <PanelHead label="Samples" />
            <HeaderRow
              columns={SAMPLE_COLUMNS}
              numeric={[2, 3]}
              labels={['Barcode', 'Design · colour', 'Quantity', 'Price', '']}
            />
            {lines.map((line, index) => !line.is_sample ? null : (
              <Row key={`${line.colourway_id}-${index}`} columns={SAMPLE_COLUMNS}>
                <input
                  value={line.sample_barcode}
                  disabled={busy}
                  placeholder="No tag yet"
                  onChange={(e) => setLine(index, { sample_barcode: e.target.value })}
                  aria-label={`Sample barcode for ${line.sku || line.colourway_id}`}
                  style={monoCellInput}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {line.product_name || '—'}
                  </span>
                  <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                    {line.colourway_name} · {line.sku || `#${line.colourway_id}`}
                  </span>
                </span>
                <input
                  value={line.qty_ordered}
                  disabled={busy}
                  inputMode="decimal"
                  onChange={(e) => setLine(index, { qty_ordered: e.target.value })}
                  aria-label={`Quantity for sample ${line.sku || line.colourway_id}`}
                  style={{ ...monoCellInput, textAlign: 'right' }}
                />
                <input
                  value={line.unit_price}
                  disabled={busy}
                  inputMode="decimal"
                  placeholder="Not priced"
                  onChange={(e) => setLine(index, { unit_price: e.target.value })}
                  aria-label={`Price for sample ${line.sku || line.colourway_id}`}
                  style={{ ...monoCellInput, textAlign: 'right' }}
                />
                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <GhostButton tone="danger" disabled={busy} onClick={() => removeLine(index)}>
                    Remove
                  </GhostButton>
                </span>
              </Row>
            ))}
            <div style={{ padding: '12px 20px', ...mutedText, fontSize: 11.5, borderTop: `1px solid ${c.line}` }}>
              When a sample is receipted, its price flows into the register by this barcode — 0
              records a free hanger, an empty price records nothing. Both are different facts, and
              both stay reachable.
            </div>
          </section>
        )}

        <section style={panel}>
          <PanelHead label="Add a line" />
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field
                label="Item"
                hint={
                  items === null
                    ? 'Choose a house first — a purchase order carries one house’s designs.'
                    : loadingItems
                      ? 'Loading this house’s items…'
                      : `${items.length} item${items.length === 1 ? '' : 's'} from this house.`
                }
              >
                <Select
                  value={itemId}
                  disabled={busy || items === null || loadingItems}
                  onChange={(e) => setItemId(e.target.value)}
                  aria-label="Item"
                  style={{ minWidth: 360 }}
                >
                  <option value="">Choose an item…</option>
                  {(items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {colourwayOptionLabel(item)}
                    </option>
                  ))}
                </Select>
              </Field>
              <GhostButton tone="accent" disabled={busy || !chosenItem} onClick={() => addLine(chosenItem)}>
                Add line
              </GhostButton>
              {/* The dedicated add-a-sample affordance (C18): same design, but a
                  hanger for the library — it lands in the Samples section with
                  a barcode and a price, and never covers sales demand. */}
              <GhostButton disabled={busy || !chosenItem} onClick={() => addSample(chosenItem)}>
                Add sample
              </GhostButton>
            </div>
            {items !== null && !loadingItems && items.length === 0 && (
              <PanelNote>This house has no colourways in the catalogue yet.</PanelNote>
            )}
          </div>
        </section>

        <div>
          <ErrorLine style={{ marginBottom: 12 }}>{error}</ErrorLine>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <GhostButton tone="accent" disabled={busy} onClick={submit}>
              Raise purchase order
            </GhostButton>
            <span style={{ ...mutedText, fontSize: 11.5, fontFamily: font.ui }}>
              It is raised as a draft. Marking it sent is a separate step, on the order itself.
            </span>
          </div>
        </div>
      </div>

      <ToastLine message={toast} />
    </div>
  )
}
