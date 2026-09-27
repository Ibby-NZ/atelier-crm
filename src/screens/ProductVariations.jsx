// "Variations" on a product's page — the product's colourways (the API's word),
// one at a time. The office, Sept 2026: pick the variation from a drop-down,
// edit its price there (blank = the product's price) and adjust its stock
// there. Rules in ./productVariations.js; the stock block is ProductStock.jsx.
//
//   POST   /admin/products/:id/colourways       → { colourway } (+ stock row)
//   PATCH  /admin/colourways/:id                → { colourway }
//   POST   /admin/colourways/:id/archive|restore
//
// Every write goes through the page's `run`, which re-reads the product; the
// drop-down keeps its pick across that re-read (pickVariation).

import { useEffect, useState } from 'react'
import ImageField from '../admin/ImageField.jsx'
import { bodyFrom, diffFields, draftFrom } from '../admin/drafts.js'
import ProductStock from './ProductStock.jsx'
import { archiveTogglePath } from './adminCatalogue.js'
import { RECORD_LOCK_NOTE, editableFields, isFieldLocked } from './recordLock.js'
import {
  LOCKED_VARIATION_KEYS,
  NEW_VARIATION,
  VARIATION_FIELDS,
  inheritedPriceHint,
  pickVariation,
  variationLabel,
} from './productVariations.js'
import { apiSend } from '../lib/api.js'
import {
  ArchivedTag,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  Select,
  ToneChips,
  inputStyle,
  monoCellInput,
  cellInput,
  mutedText,
  panel,
  readOnlyInput,
} from '../admin/parts.jsx'

// The add-a-variation line: name, SKU, tones, image, the button.
const NEW_COLUMNS = '1.1fr 1fr 1.1fr minmax(190px, 1.2fr) 150px'

export default function ProductVariations({ product, isDirector, busy, run, setError, reload, flash }) {
  const colourways = product.colourways ?? []
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState({})
  const [newVariation, setNewVariation] = useState(NEW_VARIATION)

  const selected = pickVariation(colourways, selectedId)
  const fields = editableFields(VARIATION_FIELDS, LOCKED_VARIATION_KEYS, isDirector)
  const locked = (key) => isFieldLocked(key, LOCKED_VARIATION_KEYS, isDirector)

  // Re-seed from server truth on every re-read and on every pick, so a saved
  // figure is not overwritten by a stale string.
  useEffect(() => {
    setDraft(selected ? draftFrom(selected, VARIATION_FIELDS) : {})
  }, [selected])

  const set = (key) => (event) => setDraft((held) => ({ ...held, [key]: event.target.value }))

  const save = () => {
    const diff = diffFields(selected, draft, fields)
    if (diff.error) return setError(diff.error)
    if (Object.keys(diff.patch).length === 0) return flash('No changes to save.')
    return run(() => apiSend('PATCH', `/admin/colourways/${selected.id}`, diff.patch), 'Variation saved.')
  }

  const toggleArchive = () => {
    const archived = Boolean(selected.archived_at)
    run(
      () => apiSend('POST', archiveTogglePath('/admin/colourways', selected), {}),
      archived ? `${selected.name} restored.` : `${selected.name} archived.`
    )
  }

  const add = async () => {
    const built = bodyFrom(newVariation, VARIATION_FIELDS.slice(0, 4))
    if (built.error) return setError(built.error)
    let created = null
    const ok = await run(
      async () => {
        created = (await apiSend('POST', `/admin/products/${product.id}/colourways`, built.body)).colourway
      },
      () => `Added ${created.name}. Its stock row starts at zero.`
    )
    if (!ok) return undefined
    // Show the new variation, so its price and stock are the next thing edited.
    setSelectedId(created.id)
    setNewVariation(NEW_VARIATION)
    return undefined
  }

  const priceBox = (key, label) => (
    <Field label={label} hint={locked(key) ? RECORD_LOCK_NOTE : 'Blank sells at the product’s price.'}>
      <input
        value={draft[key] ?? ''}
        inputMode="decimal"
        placeholder={inheritedPriceHint(product, key)}
        disabled={busy}
        readOnly={locked(key)}
        onChange={set(key)}
        style={locked(key) ? readOnlyInput : inputStyle}
      />
    </Field>
  )

  return (
    <section style={panel}>
      <PanelHead label="Variations" right={<span style={mutedText}>{colourways.length} in all</span>} />
      {selected ? (
        <div style={{ padding: '20px 20px 8px', display: 'grid', gap: 16 }}>
          <Field label="Variation">
            <Select
              value={String(selected.id)}
              disabled={busy}
              onChange={(event) => setSelectedId(Number(event.target.value))}
              aria-label="Variation"
              style={inputStyle}
            >
              {colourways.map((colourway) => (
                <option key={colourway.id} value={colourway.id}>
                  {variationLabel(colourway)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="r-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Name">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input value={draft.name ?? ''} disabled={busy} onChange={set('name')} style={inputStyle} />
                {selected.archived_at && <ArchivedTag />}
              </span>
            </Field>
            <Field label="SKU">
              <input value={draft.sku ?? ''} disabled={busy} onChange={set('sku')} style={{ ...inputStyle, fontFamily: monoCellInput.fontFamily }} />
            </Field>
            {priceBox('retail_price_cents', 'Retail price')}
            {priceBox('trade_price_cents', 'Trade price')}
            <Field label="Tones">
              <ToneChips tones={selected.hex_tones} />
              <input
                value={draft.hex_tones ?? ''}
                placeholder="#AABBCC, #112233"
                disabled={busy}
                onChange={set('hex_tones')}
                style={{ ...inputStyle, fontFamily: monoCellInput.fontFamily }}
              />
            </Field>
            <Field label="Image">
              <ImageField
                compact
                field="colourways.image_url"
                label={`image for ${selected.name}`}
                value={draft.image_url ?? ''}
                savedValue={selected.image_url}
                disabled={busy}
                onChange={(url) => setDraft((held) => ({ ...held, image_url: url }))}
              />
            </Field>
          </div>

          <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton tone="accent" disabled={busy} onClick={save}>
              Save variation
            </GhostButton>
            <GhostButton disabled={busy} tone={selected.archived_at ? 'ink' : 'danger'} onClick={toggleArchive}>
              {selected.archived_at ? 'Restore' : 'Archive'}
            </GhostButton>
          </span>

          <ProductStock
            product={product}
            colourway={selected}
            busy={busy}
            run={run}
            setError={setError}
            reload={reload}
            flash={flash}
          />
        </div>
      ) : (
        <PanelNote>No variations yet — a product needs at least one to be orderable.</PanelNote>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: NEW_COLUMNS, gap: 10, padding: '13px 20px', alignItems: 'center' }}>
        <input
          value={newVariation.name}
          placeholder="Variation name"
          disabled={busy}
          onChange={(e) => setNewVariation((n) => ({ ...n, name: e.target.value }))}
          style={cellInput}
        />
        <input
          value={newVariation.sku}
          placeholder="SKU"
          disabled={busy}
          onChange={(e) => setNewVariation((n) => ({ ...n, sku: e.target.value }))}
          style={monoCellInput}
        />
        <input
          value={newVariation.hex_tones}
          placeholder="#AABBCC, #112233"
          disabled={busy}
          onChange={(e) => setNewVariation((n) => ({ ...n, hex_tones: e.target.value }))}
          style={monoCellInput}
        />
        <ImageField
          compact
          field="colourways.image_url"
          label="image for the new variation"
          value={newVariation.image_url}
          disabled={busy}
          onChange={(url) => setNewVariation((n) => ({ ...n, image_url: url }))}
        />
        <GhostButton disabled={busy} onClick={add} style={{ justifySelf: 'end' }}>
          Add variation
        </GhostButton>
      </div>
    </section>
  )
}
