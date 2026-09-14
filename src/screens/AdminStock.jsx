// Manage stock — live inventory, wired to atelier-api's /admin/inventory. This
// is the manual correction path: receiving a delivery, writing off shrinkage,
// fixing a mis-typed count.
//
//   GET    /admin/inventory?q=                     → { inventory }
//   POST   /admin/inventory                        → { inventory }  (201, by colourway_id)
//   PATCH  /admin/inventory/:colourwayId           → { inventory }  (absolute set)
//   POST   /admin/inventory/:colourwayId/adjust    → { inventory }  (signed delta)
//   DELETE /admin/inventory/:colourwayId           → { deleted } | 409
//
// The URL is keyed on the colourway, not an inventory-row id: inventory is one
// row per colourway, so the colourway is the natural address. Create is the
// exception and names the colourway in the body — there is no row to address yet.
//
// Normal movement does NOT happen here — a request reserves stock, shipping
// converts the reservation to a decrement, declining releases it, all through
// the order state machine. Two quantities are editable anyway because reality
// and the ledger do disagree, and someone has to be able to say so.
//
// Reserved is allowed to exceed available: a short backorder legitimately
// reserves more than is on hand. The screen shows that as "oversold" rather than
// clamping it, because clamping would silently discard committed demand.
//
// Delete and create are one feature, not two. Deleting a stock row is how a
// colourway is taken out of circulation, and a colourway with no row vanishes
// from this list entirely — so without the "Put a colourway back into stock"
// panel below, the removal would be irreversible from the CRM. The panel
// searches GET /admin/colourways (which reports `inventory: null` for exactly
// those rows) because nothing on this screen's own list can show what is absent
// from it.
//
// Stock is NOT archivable — the table has no archived_at column — so the API's
// refusal says `archivable: false` and useCrudScreen is given no archive action.
// The Cancel-only 409 dialog that produces is the correct rendering, not an
// oversight: the way past a reserved-stock refusal is to ship or decline the
// orders holding it.

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery } from '../admin/list.js'
import Pagination from '../admin/Pagination.jsx'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import { describeStock, parseDelta, parseQuantities, quantityPatch, wouldGoNegative } from '../admin/stock.js'
import {
  UNPAGED_LIST_LIMIT,
  describeStockRow,
  needsStockRow,
  stockDeletePath,
  stockListFilters,
} from './adminLists.js'
import {
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

const COLUMNS = '1.1fr 1.4fr 0.9fr 88px 88px 0.9fr 1.5fr'
const RESTOCK_COLUMNS = '1fr 1.4fr 1.2fr 150px'
const TONE_COLOUR = { ok: c.sage, low: c.muted, over: c.clay }

// How many colourways the restock search shows. Well inside the endpoint's
// MAX_LIMIT of 200; the search is for finding one SKU, not for browsing.
const RESTOCK_SEARCH_LIMIT = 25

const draftOf = (row) => ({
  qty_available: String(row.qty_available),
  qty_reserved: String(row.qty_reserved),
  delta: '',
})

export default function AdminStock() {
  // `?q=` seeds the search so an order line's SKU can link straight to its
  // stock row (Userback 8367841). Read once: the search box owns it after that.
  const [searchParams] = useSearchParams()
  const [term, setTerm] = useState(() => searchParams.get('q') ?? '') // committed search term
  const [draftTerm, setDraftTerm] = useState(() => searchParams.get('q') ?? '')
  const [drafts, setDrafts] = useState({}) // colourway_id -> draft
  const [showRestock, setShowRestock] = useState(false)
  const [restockTerm, setRestockTerm] = useState('')
  const [restockRows, setRestockRows] = useState(null) // null = not searched yet
  const [restockBusy, setRestockBusy] = useState(false)

  // The list, the toast, the mutate-then-reload cycle and the delete flow in
  // one. No `archive` option: inventory has no archived_at, so there is no
  // endpoint for "Archive instead" to point at.
  const crud = useCrudScreen({
    path: '/admin/inventory',
    key: 'inventory',
    limit: UNPAGED_LIST_LIMIT,
    filters: stockListFilters(term),
    entity: 'stock row',
    describe: describeStockRow,
    deletePath: stockDeletePath,
  })
  const rows = crud.list.rows
  const { message, flash } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  // Re-seed every draft from server truth after a load, so a saved figure is not
  // immediately overwritten by the stale string still in the input. useAdminList
  // holds `rows` in state, so its identity is stable between renders and this
  // does not loop.
  useEffect(() => {
    setDrafts(rows.reduce((acc, row) => ({ ...acc, [row.colourway_id]: draftOf(row) }), {}))
  }, [rows])

  const search = (event) => {
    event.preventDefault()
    setError('')
    setTerm(draftTerm)
  }

  const setDraft = (id, key) => (event) =>
    setDrafts((all) => ({ ...all, [id]: { ...all[id], [key]: event.target.value } }))

  const save = (row) => {
    const draft = drafts[row.colourway_id] ?? {}
    const parsed = parseQuantities(draft)
    if (!parsed.ok) return setError(`${row.sku}: ${parsed.error}`)
    const patch = quantityPatch(row, parsed.value)
    if (Object.keys(patch).length === 0) return flash('No changes to save.')
    run(
      () => apiSend('PATCH', `/admin/inventory/${row.colourway_id}`, patch),
      `${row.sku} set to ${parsed.value.qty_available} ${row.unit}.`
    )
  }

  // An adjustment is the honest verb for receiving or writing off: it is applied
  // to whatever the current figure is, so two people correcting the same row do
  // not overwrite each other the way two absolute sets would.
  const adjust = (row) => {
    const draft = drafts[row.colourway_id] ?? {}
    const parsed = parseDelta(draft.delta)
    if (!parsed.ok) return setError(`${row.sku}: ${parsed.error}`)
    if (wouldGoNegative(row, parsed.value)) {
      return setError(
        `${row.sku}: that would take available below zero — only ${row.qty_available} ${row.unit} on hand.`
      )
    }
    run(
      () => apiSend('POST', `/admin/inventory/${row.colourway_id}/adjust`, { delta: parsed.value }),
      `${row.sku} ${parsed.value > 0 ? 'up' : 'down'} ${Math.abs(parsed.value)} ${row.unit}.`
    )
  }

  // The restock search reads the colourway browse rather than this screen's
  // list: a colourway with no stock row is exactly what is missing from here.
  const searchColourways = useCallback(async (event) => {
    event?.preventDefault()
    setError('')
    setRestockBusy(true)
    try {
      const query = buildListQuery({ q: restockTerm, limit: RESTOCK_SEARCH_LIMIT })
      const body = await apiFetch(`/admin/colourways?${query}`)
      setRestockRows(body.colourways ?? [])
    } catch (err) {
      setError(messageOf(err, 'Could not search colourways.'))
    } finally {
      setRestockBusy(false)
    }
  }, [restockTerm, setError])

  // `unit` is derived by the API from the colourway's product type and is never
  // sent — it is what every quantity on the row means, so a client-chosen one
  // would silently redenominate the stock.
  const createStockRow = async (colourway) => {
    const ok = await run(
      () => apiSend('POST', '/admin/inventory', { colourway_id: colourway.id }),
      (res) => `${colourway.sku} back in stock at 0 ${res.inventory.unit}.`
    )
    // Re-run the search so the row it came from stops offering the button.
    if (ok) await searchColourways()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Stock · live"
        title={<>Manage stock</>}
        subtitle="Correct the platform's own inventory — receiving, shrinkage, a mis-typed count. Orders move these figures on their own."
      />
      <SectionTabs tabs={stockTabs} active="manage" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Put a colourway back into stock"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowRestock((open) => !open)
                  setError('')
                }}
              >
                {showRestock ? 'Cancel' : 'Add a stock row'}
              </GhostButton>
            }
          />
          {showRestock && (
            <div style={{ padding: 20 }}>
              <form onSubmit={searchColourways} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  value={restockTerm}
                  onChange={(e) => setRestockTerm(e.target.value)}
                  placeholder="SKU, colourway or design"
                  style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
                  aria-label="Search colourways"
                />
                <GhostButton type="submit" disabled={busy || restockBusy}>
                  Find colourways
                </GhostButton>
              </form>
              <div style={{ ...mutedText, fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
                A colourway whose stock row was deleted disappears from the list below, so this is
                the way back to it. The opening quantities are zero and the unit is derived from the
                design — a fabric in metres, a finished good in units.
              </div>

              {restockRows !== null && restockRows.length === 0 && (
                <PanelNote>Nothing matches that search.</PanelNote>
              )}
              {restockRows !== null && restockRows.length > 0 && (
                <div style={{ ...panel, marginTop: 16 }}>
                  <HeaderRow
                    columns={RESTOCK_COLUMNS}
                    labels={['SKU', 'Colourway · design', 'House', '']}
                  />
                  {restockRows.map((colourway) => (
                    <Row key={colourway.id} columns={RESTOCK_COLUMNS}>
                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {colourway.sku}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {colourway.name}
                        </span>
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {colourway.product_name}
                        </span>
                      </span>
                      <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {colourway.brand_name}
                      </span>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {needsStockRow(colourway) ? (
                          <GhostButton
                            tone="accent"
                            disabled={busy}
                            onClick={() => createStockRow(colourway)}
                          >
                            Add stock row
                          </GhostButton>
                        ) : (
                          <span style={{ ...mutedText, fontSize: 11.5 }}>Already stocked</span>
                        )}
                      </span>
                    </Row>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Inventory"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={draftTerm}
                    onChange={(e) => setDraftTerm(e.target.value)}
                    placeholder="SKU, colourway, product or house"
                    style={{ ...inputStyle, height: 32, fontSize: 12.5, width: 260 }}
                    aria-label="Search stock"
                  />
                  <GhostButton type="submit" disabled={busy}>
                    Search
                  </GhostButton>
                </form>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {crud.list.total} shown
                </span>
              </span>
            }
          />

          <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
          {crud.list.status === 'loading' && <PanelNote>Loading stock…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && rows.length === 0 && (
            <PanelNote>
              {term.trim() ? 'Nothing matches that search.' : 'No stock rows yet.'}
            </PanelNote>
          )}

          {crud.list.status === 'ready' && rows.length > 0 && (
            <>
              <HeaderRow
                columns={COLUMNS}
                labels={['SKU', 'Colourway · product', 'House', 'Available', 'Reserved', 'Free', '']}
              />
              {rows.map((row) => {
                const draft = drafts[row.colourway_id] ?? draftOf(row)
                const stock = describeStock(row)
                return (
                  <Row key={row.colourway_id} columns={COLUMNS}>
                    <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.sku}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.colourway_name}
                      </span>
                      <span style={{ display: 'block', ...mutedText, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.product_name}
                      </span>
                    </span>
                    <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.brand_name}
                    </span>
                    <input
                      value={draft.qty_available}
                      inputMode="decimal"
                      disabled={busy}
                      onChange={setDraft(row.colourway_id, 'qty_available')}
                      style={{ ...cellInput, fontFamily: font.mono }}
                      aria-label={`Available for ${row.sku}`}
                    />
                    <input
                      value={draft.qty_reserved}
                      inputMode="decimal"
                      disabled={busy}
                      onChange={setDraft(row.colourway_id, 'qty_reserved')}
                      style={{ ...cellInput, fontFamily: font.mono }}
                      aria-label={`Reserved for ${row.sku}`}
                    />
                    <span style={{ fontFamily: font.mono, fontSize: 11.5, color: TONE_COLOUR[stock.tone] }}>
                      {stock.label}
                    </span>
                    <span style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <input
                        value={draft.delta}
                        inputMode="decimal"
                        placeholder="±"
                        disabled={busy}
                        onChange={setDraft(row.colourway_id, 'delta')}
                        style={{ ...cellInput, fontFamily: font.mono, width: 58, padding: '0 6px' }}
                        aria-label={`Adjustment for ${row.sku}`}
                      />
                      <GhostButton disabled={busy} onClick={() => adjust(row)}>
                        Apply
                      </GhostButton>
                      <GhostButton disabled={busy} tone="accent" onClick={() => save(row)}>
                        Set
                      </GhostButton>
                      <GhostButton disabled={busy} tone="danger" onClick={() => crud.remove.ask(row)}>
                        Delete
                      </GhostButton>
                    </span>
                  </Row>
                )
              })}
              <div style={{ padding: '13px 20px', ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                <strong style={{ fontWeight: 600 }}>Apply</strong> adds or removes from the current
                figure (use a minus for a write-off). <strong style={{ fontWeight: 600 }}>Set</strong>{' '}
                replaces both figures with what is typed. Reserved above available is a live
                backorder, not a fault. <strong style={{ fontWeight: 600 }}>Delete</strong> takes the
                colourway out of circulation entirely — it keeps the SKU in the catalogue and is
                refused while any order still holds stock on it.
              </div>
            </>
          )}
        </section>
      </div>

      <Pagination
        page={crud.list.page}
        totalPages={crud.list.totalPages}
        total={crud.list.total}
        unit="stock rows"
        onPage={crud.list.setPage}
        busy={busy}
      />

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
