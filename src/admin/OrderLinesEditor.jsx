// The order line editor, shared by the two screens that build an order: the new
// sales order form and the detail panel that prices an incoming web request.
//
// Layout only — every rule (what a draft line is, what changed, what a row comes
// to) lives in ./orderFlow.js, which unit-tests without a DOM. This file owns
// the search, the three ways a line gets added, and the table.
//
// Three ways, because the catalogue is never quite complete when someone is on
// the phone:
//   - the design is in the catalogue          -> search and add it
//   - the design is there, the colour is not  -> "Other colour" creates the
//                                                colourway, and it is a real one
//                                                from then on
//   - neither exists                          -> "New design" creates the
//                                                product, then its first colour
//
// The two creates are ordinary POSTs to the catalogue admin, so a colourway
// invented here is the same row the storefront and every future order will see.

import { useState } from 'react'

import { apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery } from './list.js'
import {
  panel,
  inputStyle,
  Select,
  cellInput,
  monoCellInput,
  mutedText,
  monoText,
  sectionLabel,
  GhostButton,
  HeaderRow,
  PanelNote,
  Row,
  messageOf,
} from './parts.jsx'
import { draftFromColourway, draftSubtotalCents, formatCents } from './orderFlow.js'
import { c } from '../theme.js'

const SEARCH_LIMIT = 8
const LINE_COLUMNS = '1.3fr 1.6fr 0.7fr 0.9fr 1.3fr auto'
const HIT_COLUMNS = '1.2fr 1.8fr 1.1fr auto'

const PRODUCT_TYPES = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'finished_good', label: 'Finished good' },
]

const blankColourway = () => ({ name: '', sku: '' })
const blankProduct = () => ({ brand_id: '', name: '', product_type: 'fabric', currency: 'NZD' })

/**
 * @param {{
 *   lines: Array<object>,
 *   onChange: (lines: Array<object>) => void,
 *   busy?: boolean,
 *   disabled?: boolean,
 *   onError: (message: string) => void,
 * }} props
 */
export default function OrderLinesEditor({ lines, onChange, busy, disabled, onError }) {
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState(null)
  const [searching, setSearching] = useState(false)
  // Which search hit's "Other colour" form is open, and what it holds.
  const [colourwayFor, setColourwayFor] = useState(null)
  const [colourwayDraft, setColourwayDraft] = useState(blankColourway)
  // The new-design form, and the houses it picks from (loaded on first open).
  const [productDraft, setProductDraft] = useState(null)
  const [brands, setBrands] = useState([])

  const locked = Boolean(disabled)

  const setLine = (index, patch) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const removeLine = (index) => onChange(lines.filter((_, i) => i !== index))

  const addLine = (draft) => {
    onChange([...lines, draft])
    // Collapse the forms the line came from: the next line starts a new search.
    setColourwayFor(null)
    setProductDraft(null)
  }

  const search = async (event) => {
    event?.preventDefault()
    onError('')
    setSearching(true)
    try {
      const query = buildListQuery({ q: term, limit: SEARCH_LIMIT })
      const body = await apiFetch(`/admin/colourways?${query}`)
      setHits(body.colourways ?? [])
    } catch (err) {
      onError(messageOf(err, 'Could not search the catalogue.'))
    } finally {
      setSearching(false)
    }
  }

  // A colour the supplier has that the catalogue does not. It is created for
  // real, so it is available to every screen from here on — which is why the
  // form asks for a SKU rather than inventing one (SKUs are staff-typed).
  const createColourway = async (productId) => {
    onError('')
    try {
      const body = await apiSend('POST', `/admin/products/${productId}/colourways`, {
        name: colourwayDraft.name.trim(),
        sku: colourwayDraft.sku.trim(),
      })
      addLine(draftFromColourway(body.colourway))
      setColourwayDraft(blankColourway())
      // The new colour would not be in the stale hit list; re-run the search so
      // what is on screen matches what exists.
      await search()
    } catch (err) {
      onError(messageOf(err, 'Could not add that colour.'))
    }
  }

  const openProductForm = async () => {
    setProductDraft(blankProduct())
    onError('')
    if (brands.length > 0) return
    try {
      const body = await apiFetch('/admin/brands')
      setBrands(body.brands ?? [])
    } catch (err) {
      onError(messageOf(err, 'Could not load the houses.'))
    }
  }

  // A design nobody has catalogued yet: the product and its first colour, in two
  // calls, because that is the shape of the API (a product create takes no
  // inline colourways).
  const createProduct = async () => {
    onError('')
    try {
      const created = await apiSend('POST', '/admin/products', {
        brand_id: Number(productDraft.brand_id),
        name: productDraft.name.trim(),
        product_type: productDraft.product_type,
        currency: productDraft.currency.trim().toUpperCase(),
      })
      const body = await apiSend('POST', `/admin/products/${created.product.id}/colourways`, {
        name: colourwayDraft.name.trim(),
        sku: colourwayDraft.sku.trim(),
      })
      addLine(
        draftFromColourway({ ...body.colourway, product_name: created.product.name })
      )
      setColourwayDraft(blankColourway())
    } catch (err) {
      onError(messageOf(err, 'Could not add that design.'))
    }
  }

  const subtotal = draftSubtotalCents(lines)

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={panel}>
        <HeaderRow
          columns={LINE_COLUMNS}
          labels={['SKU', 'Design', 'Quantity', 'Unit price', 'Line note', '']}
          numeric={[2, 3]}
        />
        {lines.length === 0 && <PanelNote>No lines yet — search the catalogue below.</PanelNote>}
        {lines.map((line, index) => (
          <Row key={line.id ?? `new-${line.colourway_id}-${index}`} columns={LINE_COLUMNS}>
            <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {line.sku || `#${line.colourway_id}`}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 13,
                  color: c.ink,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {line.product_name || '—'}
              </span>
              {(line.colourway_name || line.brand_name) && (
                <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                  {[line.colourway_name, line.brand_name].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <input
                value={line.qty}
                onChange={(e) => setLine(index, { qty: e.target.value })}
                disabled={busy || locked}
                inputMode="decimal"
                aria-label={`Quantity for ${line.sku || line.colourway_id}`}
                style={{ ...monoCellInput, textAlign: 'right' }}
              />
              {line.unit && (
                <span style={{ ...mutedText, fontSize: 11.5 }}>
                  {line.unit === 'metres' ? 'm' : line.unit}
                </span>
              )}
            </span>
            <input
              value={line.price}
              onChange={(e) => setLine(index, { price: e.target.value })}
              disabled={busy || locked}
              inputMode="decimal"
              placeholder="Not priced yet"
              aria-label={`Unit price for ${line.sku || line.colourway_id}`}
              style={{ ...monoCellInput, textAlign: 'right' }}
            />
            <input
              value={line.cut}
              onChange={(e) => setLine(index, { cut: e.target.value })}
              disabled={busy || locked}
              placeholder="Optional"
              aria-label={`Line note for ${line.sku || line.colourway_id}`}
              style={cellInput}
            />
            <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <GhostButton tone="danger" disabled={busy || locked} onClick={() => removeLine(index)}>
                Remove
              </GhostButton>
            </span>
          </Row>
        ))}
        {lines.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 14,
              padding: '12px 20px',
              borderTop: `1px solid ${c.line}`,
            }}
          >
            <span style={{ ...mutedText, fontSize: 11.5 }}>Subtotal</span>
            <span style={{ ...monoText, color: c.ink }}>{formatCents(subtotal)}</span>
          </div>
        )}
      </div>

      {!locked && (
        <div style={panel}>
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <form onSubmit={search} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="SKU, colour or design"
                aria-label="Search the catalogue"
                style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
              />
              <GhostButton type="submit" disabled={busy || searching}>
                Search catalogue
              </GhostButton>
              <GhostButton disabled={busy} onClick={openProductForm}>
                New design
              </GhostButton>
            </form>

            {hits !== null && hits.length === 0 && (
              <PanelNote>
                Nothing matches that search. If the design is new, add it with “New design”.
              </PanelNote>
            )}

            {hits !== null && hits.length > 0 && (
              <div style={panel}>
                <HeaderRow columns={HIT_COLUMNS} labels={['SKU', 'Colour · design', 'House', '']} />
                {hits.map((hit) => (
                  <div key={hit.id}>
                    <Row columns={HIT_COLUMNS}>
                      <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hit.sku}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, color: c.ink }}>
                          {hit.name}
                        </span>
                        <span style={{ display: 'block', ...mutedText, fontSize: 11.5 }}>
                          {hit.product_name}
                        </span>
                      </span>
                      <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden' }}>
                        {hit.brand_name}
                      </span>
                      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <GhostButton
                          disabled={busy}
                          onClick={() => {
                            setColourwayFor(colourwayFor === hit.id ? null : hit.id)
                            setColourwayDraft(blankColourway())
                          }}
                        >
                          Other colour
                        </GhostButton>
                        <GhostButton
                          tone="accent"
                          disabled={busy}
                          onClick={() => addLine(draftFromColourway(hit))}
                        >
                          Add line
                        </GhostButton>
                      </span>
                    </Row>
                    {colourwayFor === hit.id && (
                      <div
                        style={{
                          padding: '14px 20px',
                          borderTop: `1px solid ${c.line}`,
                          display: 'grid',
                          gap: 10,
                        }}
                      >
                        <div style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                          A colour of <strong>{hit.product_name}</strong> the catalogue does not
                          hold yet. It is created for real, so it is available from here on.
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <input
                            value={colourwayDraft.name}
                            onChange={(e) =>
                              setColourwayDraft((d) => ({ ...d, name: e.target.value }))
                            }
                            placeholder="Colour name"
                            aria-label="New colour name"
                            style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
                          />
                          <input
                            value={colourwayDraft.sku}
                            onChange={(e) =>
                              setColourwayDraft((d) => ({ ...d, sku: e.target.value }))
                            }
                            placeholder="SKU"
                            aria-label="New colour SKU"
                            style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
                          />
                          <GhostButton
                            tone="accent"
                            disabled={
                              busy || !colourwayDraft.name.trim() || !colourwayDraft.sku.trim()
                            }
                            onClick={() => createColourway(hit.product_id)}
                          >
                            Create colour and add
                          </GhostButton>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {productDraft && (
              <div style={{ ...panel, padding: 20, display: 'grid', gap: 12 }}>
                <div style={sectionLabel}>New design</div>
                <div style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                  Creates the design and its first colour in the catalogue. The rest of its
                  specification is filled in later, on the Designs screen.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Select
                    value={productDraft.brand_id}
                    onChange={(e) => setProductDraft((d) => ({ ...d, brand_id: e.target.value }))}
                    aria-label="House"
                    style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
                  >
                    <option value="">House…</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                  <input
                    value={productDraft.name}
                    onChange={(e) => setProductDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Design name"
                    aria-label="Design name"
                    style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
                  />
                  <Select
                    value={productDraft.product_type}
                    onChange={(e) =>
                      setProductDraft((d) => ({ ...d, product_type: e.target.value }))
                    }
                    aria-label="Product type"
                    style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 160 }}
                  >
                    {PRODUCT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                  <input
                    value={productDraft.currency}
                    onChange={(e) => setProductDraft((d) => ({ ...d, currency: e.target.value }))}
                    placeholder="NZD"
                    aria-label="Currency"
                    style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 90 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    value={colourwayDraft.name}
                    onChange={(e) => setColourwayDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="First colour name"
                    aria-label="First colour name"
                    style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
                  />
                  <input
                    value={colourwayDraft.sku}
                    onChange={(e) => setColourwayDraft((d) => ({ ...d, sku: e.target.value }))}
                    placeholder="SKU"
                    aria-label="First colour SKU"
                    style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 200 }}
                  />
                  <GhostButton
                    tone="accent"
                    disabled={
                      busy ||
                      !productDraft.brand_id ||
                      !productDraft.name.trim() ||
                      !colourwayDraft.name.trim() ||
                      !colourwayDraft.sku.trim()
                    }
                    onClick={createProduct}
                  >
                    Create design and add
                  </GhostButton>
                  <GhostButton disabled={busy} onClick={() => setProductDraft(null)}>
                    Cancel
                  </GhostButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
