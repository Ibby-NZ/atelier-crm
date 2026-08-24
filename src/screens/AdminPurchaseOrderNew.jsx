// New purchase order — the live one, wired to atelier-api's
// POST /admin/purchase-orders. The counterpart to the derivation on the list
// screen: a stock buy, a re-order placed by phone, anything no open sales order
// records.
//
//   GET  /admin/brands                            → { brands }  the house picker
//   GET  /admin/colourways?brand_id=&q=&limit=    → { colourways } the line picker
//   POST /admin/purchase-orders                   → { purchase_order }  (201)
//
// **The house comes first, and the supplier is never chosen.** `supplier_id` is
// derived from `brands.supplier_id` server-side and no schema here names it: a
// client-chosen value produces a perfectly well-formed purchase order addressed
// to the WRONG HOUSE, and the first anyone would hear of it is that house
// shipping the goods. A house with no supplier is a 422 naming it — surfaced
// verbatim, and flagged in the picker beforehand from the brand rows already
// fetched, because it will fire until `backfill:suppliers` has run.
//
// **The line picker is scoped to the chosen house.** A purchase order is one
// house's paper, so searching the whole catalogue would offer colourways that
// cannot go on it.
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
  brandOptions,
  buildPurchaseOrderBody,
  goodsLines,
  newPurchaseOrderLine,
  newPurchaseOrderSampleLine,
  purchaseOrderRoute,
  sampleLines,
  unlinkedBrandNote,
} from './adminPurchaseOrders.js'

const SEARCH_LIMIT = 8
const LINE_COLUMNS = '1.1fr 1.5fr 90px 110px 110px auto'
// A sample row trades the supplier-code column for the register tag its value
// will flow to on receipt.
const SAMPLE_COLUMNS = '150px 1.6fr 90px 110px auto'
const HIT_COLUMNS = '1.2fr 1.8fr auto'

export default function AdminPurchaseOrderNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })

  const [draft, setDraft] = useState(NEW_PURCHASE_ORDER)
  const [lines, setLines] = useState([])
  const [brands, setBrands] = useState([])
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState(null)
  const [searching, setSearching] = useState(false)

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

  const options = brandOptions(brands)
  const unlinkedNote = unlinkedBrandNote(brands)
  const chosen = options.find((option) => String(option.id) === String(draft.brand_id))

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  // Changing the house empties the lines: they are colourways of the old one,
  // and a purchase order carrying another maison's designs is refused by the
  // derivation of everything downstream from it.
  const chooseBrand = (value) => {
    set({ brand_id: value })
    setLines([])
    setHits(null)
    setError('')
  }

  const search = async (event) => {
    event?.preventDefault()
    if (!draft.brand_id) return setError('Choose the house first — the lines are its colourways.')
    setError('')
    setSearching(true)
    try {
      const query = buildListQuery({ brand_id: Number(draft.brand_id), q: term, limit: SEARCH_LIMIT })
      const body = await apiFetch(`/admin/colourways?${query}`)
      setHits(body.colourways ?? [])
    } catch (err) {
      setError(messageOf(err, 'Could not search the catalogue.'))
    } finally {
      setSearching(false)
    }
    return undefined
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
          <PanelHead label="Which house" />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Field
                label="House"
                hint="The supplier, currency, agent, Incoterm and PO address are taken from whoever invoices this house — they are never chosen here."
              >
                <select
                  value={draft.brand_id}
                  disabled={busy}
                  onChange={(e) => chooseBrand(e.target.value)}
                  aria-label="House"
                  style={inputStyle}
                >
                  <option value="">Choose a house…</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
            {/* Advance warning read off the rows already fetched — not a
                pre-flight. The API's 422 is still the authority. */}
            {chosen && !chosen.linked && (
              <ErrorLine>
                “{chosen.name}” has no supplier linked, so there is no house to address a purchase
                order to. Link one on the Houses screen first.
              </ErrorLine>
            )}
            {unlinkedNote && <span style={{ ...mutedText, fontSize: 11.5 }}>{unlinkedNote}</span>}
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Lines" />
          <HeaderRow
            columns={LINE_COLUMNS}
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
                style={monoCellInput}
              />
              <input
                value={line.unit_price}
                disabled={busy}
                inputMode="decimal"
                placeholder="Not priced"
                onChange={(e) => setLine(index, { unit_price: e.target.value })}
                aria-label={`Unit price for ${line.sku || line.colourway_id}`}
                style={monoCellInput}
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
            An empty price is left unpriced rather than sent as zero — nothing here can derive what
            a house charges, and a zero purchase price reads as free.
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
                  style={monoCellInput}
                />
                <input
                  value={line.unit_price}
                  disabled={busy}
                  inputMode="decimal"
                  placeholder="Not priced"
                  onChange={(e) => setLine(index, { unit_price: e.target.value })}
                  aria-label={`Price for sample ${line.sku || line.colourway_id}`}
                  style={monoCellInput}
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
            <form onSubmit={search} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="SKU, colour or design"
                aria-label="Search this house’s colourways"
                style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
              />
              <GhostButton type="submit" disabled={busy || searching || !draft.brand_id}>
                Search this house
              </GhostButton>
            </form>

            {!draft.brand_id && (
              <span style={{ ...mutedText, fontSize: 11.5 }}>
                Choose a house first — a purchase order carries one house’s designs.
              </span>
            )}

            {hits !== null && hits.length === 0 && (
              <PanelNote>Nothing of this house matches that search.</PanelNote>
            )}

            {hits !== null && hits.length > 0 && (
              <div style={panel}>
                <HeaderRow columns={HIT_COLUMNS} labels={['SKU', 'Colour · design', '']} />
                {hits.map((hit) => (
                  <Row key={hit.id} columns={HIT_COLUMNS}>
                    <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hit.sku}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, color: c.ink }}>{hit.name}</span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                        {hit.product_name}
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <GhostButton tone="accent" disabled={busy} onClick={() => addLine(hit)}>
                        Add line
                      </GhostButton>
                      {/* The dedicated add-a-sample affordance (C18): same
                          design, but a hanger for the library — it lands in the
                          Samples section with a barcode and a price, and never
                          covers sales demand. */}
                      <GhostButton disabled={busy} onClick={() => addSample(hit)}>
                        Add sample
                      </GhostButton>
                    </span>
                  </Row>
                ))}
              </div>
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
