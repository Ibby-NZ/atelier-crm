// Manage stock — live inventory, wired to atelier-api's /admin/inventory. This
// is the manual correction path: receiving a delivery, writing off shrinkage,
// fixing a mis-typed count.
//
//   GET   /admin/inventory?q=                     → { inventory }
//   PATCH /admin/inventory/:colourwayId           → { inventory }  (absolute set)
//   POST  /admin/inventory/:colourwayId/adjust    → { inventory }  (signed delta)
//
// The URL is keyed on the colourway, not an inventory-row id: inventory is one
// row per colourway, so the colourway is the natural address.
//
// Normal movement does NOT happen here — a request reserves stock, shipping
// converts the reservation to a decrement, declining releases it, all through
// the order state machine. Two quantities are editable anyway because reality
// and the ledger do disagree, and someone has to be able to say so.
//
// Reserved is allowed to exceed available: a short backorder legitimately
// reserves more than is on hand. The screen shows that as "oversold" rather than
// clamping it, because clamping would silently discard committed demand.

import { useCallback, useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { describeStock, parseDelta, parseQuantities, quantityPatch, wouldGoNegative } from '../admin/stock.js'
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
  useMutation,
  useToast,
} from '../admin/parts.jsx'

const COLUMNS = '1.1fr 1.5fr 1fr 90px 90px 1fr 1.1fr'
const TONE_COLOUR = { ok: c.sage, low: c.muted, over: c.clay }

const draftOf = (row) => ({
  qty_available: String(row.qty_available),
  qty_reserved: String(row.qty_reserved),
  delta: '',
})

export default function AdminStock() {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [term, setTerm] = useState('') // committed search term
  const [draftTerm, setDraftTerm] = useState('')
  const [drafts, setDrafts] = useState({}) // colourway_id -> draft
  const { message, flash } = useToast()

  const load = useCallback(async () => {
    const query = term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''
    const body = await apiFetch(`/admin/inventory${query}`)
    const inventory = body.inventory ?? []
    setRows(inventory)
    // Re-seed every draft from server truth after a write, so a saved figure is
    // not immediately overwritten by the stale string still in the input.
    setDrafts(
      inventory.reduce((acc, row) => ({ ...acc, [row.colourway_id]: draftOf(row) }), {})
    )
  }, [term])

  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    load()
      .then(() => active && setStatus('ready'))
      .catch((err) => {
        if (!active) return
        setLoadError(messageOf(err, 'Could not load stock.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [load])

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

  return (
    <div>
      <PageHeader
        eyebrow="Stock · live"
        title={<>Manage stock</>}
        subtitle="Correct the platform's own inventory — receiving, shrinkage, a mis-typed count. Orders move these figures on their own."
      />
      <SectionTabs tabs={stockTabs} active="manage" />

      <section style={{ ...panel, marginTop: 30 }}>
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
                {rows.length} shown
              </span>
            </span>
          }
        />

        <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>
        {status === 'loading' && <PanelNote>Loading stock…</PanelNote>}
        {status === 'error' && <PanelNote tone="danger">{loadError}</PanelNote>}
        {status === 'ready' && rows.length === 0 && (
          <PanelNote>
            {term.trim() ? 'Nothing matches that search.' : 'No stock rows yet.'}
          </PanelNote>
        )}

        {status === 'ready' && rows.length > 0 && (
          <>
            <HeaderRow
              columns={COLUMNS}
              labels={['SKU', 'Colourway · product', 'House', 'Available', 'Reserved', 'Free', 'Adjust']}
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
                      style={{ ...cellInput, fontFamily: font.mono, width: 62, padding: '0 6px' }}
                      aria-label={`Adjustment for ${row.sku}`}
                    />
                    <GhostButton disabled={busy} onClick={() => adjust(row)}>
                      Apply
                    </GhostButton>
                    <GhostButton disabled={busy} tone="accent" onClick={() => save(row)}>
                      Set
                    </GhostButton>
                  </span>
                </Row>
              )
            })}
            <div style={{ padding: '13px 20px', ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
              <strong style={{ fontWeight: 600 }}>Apply</strong> adds or removes from the current
              figure (use a minus for a write-off). <strong style={{ fontWeight: 600 }}>Set</strong>{' '}
              replaces both figures with what is typed. Reserved above available is a live
              backorder, not a fault.
            </div>
          </>
        )}
      </section>

      <ToastLine message={message} />
    </div>
  )
}
