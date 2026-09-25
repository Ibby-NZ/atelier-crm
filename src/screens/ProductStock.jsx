// "Stock" on a product's page — each colourway's live inventory, corrected where
// the design itself is edited. It replaces the Manage stock screen (/admin/stock,
// retired 25 Sep 2026: "have stock management functionality placed in the
// product page itself") and keeps all four of its verbs, one colourway a row:
//
//   POST   /admin/inventory                        → { inventory }  (201, by colourway_id)
//   PATCH  /admin/inventory/:colourwayId           → { inventory }  (absolute set)
//   POST   /admin/inventory/:colourwayId/adjust    → { inventory }  (signed delta)
//   DELETE /admin/inventory/:colourwayId           → { deleted } | 409
//
// The figures are the product detail's own `inventory` snapshot on each
// colourway, so every write goes through the page's `run` and re-reads the
// product — nothing is reconciled locally, and a failure lands on the page's
// one error line under Save.
//
// Normal movement does NOT happen here — a request reserves stock, shipping
// converts the reservation to a decrement, cancelling releases it, and booking
// goods in on a purchase order adds to it. This is the manual correction path:
// shrinkage, a mis-typed count, a delivery that never had a PO.
//
// Reserved is allowed to exceed available: a short backorder legitimately
// reserves more than is on hand. The panel shows that as "oversold" rather than
// clamping it, because clamping would silently discard committed demand.
//
// Delete and create are still one feature. A colourway whose stock row is
// deleted cannot sell; Manage stock needed a colourway search to bring one
// back, because it vanished from that list. Here every colourway of the design
// is listed whether it has a row or not, so the way back is the row's own "Add
// stock row".
//
// Stock is NOT archivable — the table has no archived_at column — so the
// API's refusal says `archivable: false` and the dialog offers Cancel alone. The
// way past a reserved-stock refusal is to ship or cancel the orders holding it.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { apiDelete, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { attemptDelete, deleteDialog } from '../admin/deleteFlow.js'
import {
  describeStock,
  describeStockRow,
  inventoryPath,
  needsStockRow,
  parseDelta,
  parseQuantities,
  quantityPatch,
  wouldGoNegative,
} from '../admin/stock.js'
import {
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  cellInput,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

const COLUMNS = '1fr 1.2fr 88px 88px 1fr minmax(250px, 1.5fr)'
const TONE_COLOUR = { ok: c.sage, low: c.muted, over: c.clay }

const draftOf = (inventory) => ({
  qty_available: String(inventory?.qty_available ?? ''),
  qty_reserved: String(inventory?.qty_reserved ?? ''),
  delta: '',
})

export default function ProductStock({ product, busy, run, setError, reload, flash }) {
  const [drafts, setDrafts] = useState({}) // colourway id -> draft
  // The delete flow: `target` is the colourway under the dialog, `blocked` the
  // API's explanation once a delete has been refused.
  const [target, setTarget] = useState(null)
  const [blocked, setBlocked] = useState(null)
  const [removing, setRemoving] = useState(false)

  // Re-seed every draft from server truth whenever the product is re-read, so a
  // saved figure is not immediately overwritten by the stale string still in
  // the input. Keyed on the product object, which every write replaces.
  useEffect(() => {
    setDrafts(
      (product.colourways ?? []).reduce(
        (acc, colourway) => ({ ...acc, [colourway.id]: draftOf(colourway.inventory) }),
        {}
      )
    )
  }, [product])

  const colourways = product.colourways ?? []

  const setDraft = (id, key) => (event) =>
    setDrafts((all) => ({ ...all, [id]: { ...all[id], [key]: event.target.value } }))

  const save = (colourway) => {
    const stock = colourway.inventory
    const parsed = parseQuantities(drafts[colourway.id] ?? draftOf(stock))
    if (!parsed.ok) return setError(`${colourway.sku}: ${parsed.error}`)
    const patch = quantityPatch(stock, parsed.value)
    if (Object.keys(patch).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', inventoryPath(colourway), patch),
      `${colourway.sku} set to ${parsed.value.qty_available} ${stock.unit}.`
    )
  }

  // An adjustment is the honest verb for receiving or writing off: it is applied
  // to whatever the current figure is, so two people correcting the same row do
  // not overwrite each other the way two absolute sets would.
  const adjust = (colourway) => {
    const stock = colourway.inventory
    const parsed = parseDelta(drafts[colourway.id]?.delta)
    if (!parsed.ok) return setError(`${colourway.sku}: ${parsed.error}`)
    if (wouldGoNegative(stock, parsed.value)) {
      return setError(
        `${colourway.sku}: that would take available below zero — only ${stock.qty_available} ${stock.unit} on hand.`
      )
    }
    return run(
      () => apiSend('POST', `${inventoryPath(colourway)}/adjust`, { delta: parsed.value }),
      `${colourway.sku} ${parsed.value > 0 ? 'up' : 'down'} ${Math.abs(parsed.value)} ${stock.unit}.`
    )
  }

  // `unit` is derived by the API from the design's product type and is never
  // sent — it is what every quantity on the row means, so a client-chosen one
  // would silently redenominate the stock.
  const addRow = (colourway) =>
    run(
      () => apiSend('POST', '/admin/inventory', { colourway_id: colourway.id }),
      (res) => `${colourway.sku} now has a stock row, at 0 ${res.inventory.unit}.`
    )

  const askRemove = (colourway) => {
    setTarget(colourway)
    setBlocked(null)
    setError('')
  }
  const closeRemove = () => {
    setTarget(null)
    setBlocked(null)
  }
  const confirmRemove = async () => {
    if (!target) return
    setRemoving(true)
    // One request, no pre-flight — the API's 409 is the answer.
    const outcome = await attemptDelete(() => apiDelete(inventoryPath(target)), {
      fallback: 'That stock row could not be deleted.',
    })
    setRemoving(false)
    if (!outcome.ok) {
      setBlocked(outcome.blocked)
      return
    }
    const name = describeStockRow(target) ?? 'That stock row'
    closeRemove()
    await reload()
    flash(`${name} deleted.`)
  }

  const dialog = deleteDialog({
    entity: 'stock row',
    name: target ? describeStockRow(target) : undefined,
    blocked,
    canArchive: false,
  })

  return (
    <section style={panel}>
      <PanelHead label="Stock" />
      {colourways.length === 0 ? (
        <PanelNote>No colourways yet — stock is held per colourway, so add one above first.</PanelNote>
      ) : (
        <>
          <HeaderRow
            columns={COLUMNS}
            labels={['SKU', 'Colourway', 'Available', 'Reserved', 'Free', '']}
            numeric={[2, 3, 4]}
          />
          {colourways.map((colourway) => {
            const stock = colourway.inventory
            const draft = drafts[colourway.id] ?? draftOf(stock)
            const described = stock ? describeStock(stock) : null
            return (
              <Row key={colourway.id} columns={COLUMNS} archived={Boolean(colourway.archived_at)}>
                <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {colourway.sku}
                </span>
                <span style={{ fontSize: 13, color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {colourway.name}
                </span>
                {needsStockRow(colourway) ? (
                  <>
                    <span style={{ ...mutedText, fontSize: 11.5, gridColumn: 'span 3', textAlign: 'right' }}>
                      No stock row — it cannot sell or be reserved until it has one.
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <GhostButton tone="accent" disabled={busy} onClick={() => addRow(colourway)}>
                        Add stock row
                      </GhostButton>
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      value={draft.qty_available}
                      inputMode="decimal"
                      disabled={busy}
                      onChange={setDraft(colourway.id, 'qty_available')}
                      style={{ ...cellInput, fontFamily: font.mono, textAlign: 'right' }}
                      aria-label={`Available for ${colourway.sku}`}
                    />
                    <input
                      value={draft.qty_reserved}
                      inputMode="decimal"
                      disabled={busy}
                      onChange={setDraft(colourway.id, 'qty_reserved')}
                      style={{ ...cellInput, fontFamily: font.mono, textAlign: 'right' }}
                      aria-label={`Reserved for ${colourway.sku}`}
                    />
                    <span style={{ fontFamily: font.mono, fontSize: 11.5, color: TONE_COLOUR[described.tone], textAlign: 'right' }}>
                      {described.label}
                    </span>
                    <span style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <input
                        value={draft.delta}
                        inputMode="decimal"
                        placeholder="±"
                        disabled={busy}
                        onChange={setDraft(colourway.id, 'delta')}
                        style={{ ...cellInput, fontFamily: font.mono, width: 58, padding: '0 6px', textAlign: 'right' }}
                        aria-label={`Adjustment for ${colourway.sku}`}
                      />
                      <GhostButton disabled={busy} onClick={() => adjust(colourway)}>
                        Apply
                      </GhostButton>
                      <GhostButton disabled={busy} tone="accent" onClick={() => save(colourway)}>
                        Set
                      </GhostButton>
                      <GhostButton disabled={busy} tone="danger" onClick={() => askRemove(colourway)}>
                        Delete
                      </GhostButton>
                    </span>
                  </>
                )}
              </Row>
            )
          })}
          <div style={{ padding: '13px 20px', ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
            <strong style={{ fontWeight: 600 }}>Apply</strong> adds or removes from the current
            figure (use a minus for a write-off). <strong style={{ fontWeight: 600 }}>Set</strong>{' '}
            replaces both figures with what is typed. Reserved above available is a live
            backorder, not a fault. <strong style={{ fontWeight: 600 }}>Delete</strong> removes the
            stock row, which takes the colourway out of circulation — it keeps the SKU in the
            catalogue and is refused while any order still holds stock on it. Orders, and goods
            booked in on a purchase order, move these figures on their own.
          </div>
        </>
      )}

      <ConfirmDialog
        open={target !== null}
        {...dialog}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
        busy={removing}
      />
    </section>
  )
}
