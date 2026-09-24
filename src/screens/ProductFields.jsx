// The product form, shared by the two pages that write a design: the create
// page (AdminProductNew, /admin/products/new) and the design's own page
// (AdminProduct, /admin/products/:id). It used to be written out twice inside
// AdminProducts — once in the "Add a product" drop-down, once in the expanded
// row — and SpecInput already existed because the two had begun to drift into
// two spellings of the same box. One component now draws both, off one set of
// declarations (PRODUCT_FIELDS and friends, in adminCatalogue.js).
//
// The two differ where the API makes them differ, and nowhere else:
//   - House and Type are CHOICES on create and fixed afterwards. `product_type`
//     decides the colourway's stock unit (fabric → metres, finished good →
//     units) and `slug` is the storefront URL, so on the record both render
//     read-only beside the web address. The house is in the page's title line.
//   - The record lock (recordLock.js) is the RECORD's. A create still declares
//     every field — name and currency are required on the POST, so a shortened
//     create body is a 400 — and nothing existing is upset by a row that did
//     not exist a moment ago. So `locked` defaults to "nothing is".
//   - The price-change reason exists only on the record, and only for a
//     director, so the record page hands it in as `reasonField`: it explains a
//     MOVE, and a create moves nothing.
//
// "Show on the website" is not drawn here: each page puts it beside its own
// submit button, which is where the office looks for it.

import { useEffect, useState } from 'react'
import { font } from '../theme.js'
import { apiFetch } from '../lib/api.js'
import { Field, Select, inputStyle, readOnlyInput } from '../admin/parts.jsx'
import ImageField from '../admin/ImageField.jsx'
import {
  PRICE_FIELDS,
  COST_FIELDS,
  PRODUCT_TYPES,
  SIZE_LIST_ID,
  SPEC_FIELDS,
  sizeSourcePath,
  sizesInUse,
  typeLabel,
} from './adminCatalogue.js'

const noLock = () => false

export default function ProductFields({
  values,
  set,
  disabled,
  // The saved product on its own page; null on the create page.
  record = null,
  locked = noLock,
  // Create only: the house picker, and what choosing one does to the draft.
  brands = [],
  onBrand,
  // The chosen house's collections — a collection belongs to one house.
  collections = [],
  categoryOptions = [],
  reasonField = null,
}) {
  const creating = record == null
  const onChange = (key) => (event) => set(key, event.target.value)

  // A locked box keeps its value on screen — locked, not removed, because a
  // field that vanished would read as data loss rather than a restriction.
  const lockable = (key, style = {}) =>
    locked(key)
      ? { readOnly: true, disabled: true, style: { ...readOnlyInput, ...style } }
      : { disabled, onChange: onChange(key), style: { ...inputStyle, ...style } }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }} className="r-grid-2">
      <Field label="Name" hint={creating ? 'The web address is generated from it and is fixed afterwards.' : undefined}>
        <input value={values.name ?? ''} {...lockable('name')} />
      </Field>
      {creating ? (
        <>
          <Field label="House">
            <Select
              value={values.brand_id ?? ''}
              disabled={disabled}
              onChange={(e) => onBrand(e.target.value)}
              style={inputStyle}
            >
              <option value="">Choose a house…</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" hint="Fixed once created — the stock unit (metres or units) comes from it.">
            <Select
              value={values.product_type ?? ''}
              disabled={disabled}
              onChange={onChange('product_type')}
              style={inputStyle}
            >
              {PRODUCT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Web address" hint="Fixed once created.">
            <input value={record.slug ?? ''} readOnly disabled style={readOnlyInput} />
          </Field>
          <Field label="Type" hint="Fixed once created.">
            <input value={typeLabel(record.product_type)} readOnly disabled style={readOnlyInput} />
          </Field>
        </>
      )}
      <Field
        label="Category"
        hint={
          creating
            ? 'What a shopper browses by. Leave it blank to decide later.'
            : 'What a shopper browses by. Not the same thing as Type.'
        }
      >
        <Select value={values.category ?? ''} disabled={disabled} onChange={onChange('category')} style={inputStyle}>
          <option value="">Not categorised</option>
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Collection">
        <Select
          value={values.collection_id ?? ''}
          // On create there is nothing to offer until a house is chosen.
          disabled={disabled || (creating && !values.brand_id)}
          onChange={onChange('collection_id')}
          style={inputStyle}
        >
          <option value="">No collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Currency">
        <input value={values.currency ?? ''} maxLength={3} disabled={disabled} onChange={onChange('currency')} style={inputStyle} />
      </Field>
      {/* Filled from the CRM one house at a time where the reporting-codes
          backfill could not assign one. Blank clears it back to "no range". */}
      <Field
        label="Range"
        hint={
          creating
            ? 'Reporting label — the product line the old D365 reports grouped by.'
            : "Reporting label the reports' range filter matches on. Blank removes it."
        }
      >
        <input value={values.product_range ?? ''} placeholder="e.g. PIERRE FREY" {...lockable('product_range')} />
      </Field>
      {SPEC_FIELDS.map((field) => (
        <SpecInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          disabled={disabled}
          locked={locked(field.key)}
          onChange={onChange(field.key)}
        />
      ))}
      {PRICE_FIELDS.map((field) => (
        <Field label={field.label} key={field.key} hint="In dollars; blank for none.">
          <input
            value={values[field.key] ?? ''}
            inputMode="decimal"
            placeholder="0.00"
            {...lockable(field.key, { fontFamily: font.mono })}
          />
        </Field>
      ))}
      {COST_FIELDS.map((field) => (
        <Field
          label={field.label}
          key={field.key}
          hint="In the house's own currency, before its discount. Purchase orders are priced from it; the wholesale import fills it."
        >
          <input
            value={values[field.key] ?? ''}
            inputMode="decimal"
            placeholder="0.0000"
            {...lockable(field.key, { fontFamily: font.mono })}
          />
        </Field>
      ))}
      {reasonField}
      <ImageField
        field="products.hi_res_asset_url"
        label="Hi-res image"
        hint="The product page's hero when no colourway has a photograph of its own."
        value={values.hi_res_asset_url ?? ''}
        savedValue={creating ? undefined : record.hi_res_asset_url}
        readOnly={locked('hi_res_asset_url')}
        disabled={disabled}
        onChange={(url) => set('hi_res_asset_url', url)}
        style={{ gridColumn: '1 / -1' }}
      />
    </div>
  )
}

// The one <datalist> of sizes on a page, rendered ONCE at the top of it and
// never inside the form. Its options are the sizes the house's own designs
// already use (sizeSourcePath) — the same rule the freight desk's zone box
// follows — so a size the office has used once is offered from then on, and
// typing a new one is how a new size comes to exist. A failed read offers
// nothing: the box is free text either way.
export function SizeList({ brandId }) {
  const [sizes, setSizes] = useState([])

  useEffect(() => {
    const path = sizeSourcePath(brandId)
    if (!path) {
      setSizes([])
      return undefined
    }
    let active = true
    apiFetch(path)
      .then((body) => {
        if (active) setSizes(sizesInUse(body.products))
      })
      .catch(() => {
        if (active) setSizes([])
      })
    return () => {
      active = false
    }
  }, [brandId])

  return (
    <datalist id={SIZE_LIST_ID}>
      {sizes.map((size) => (
        <option key={size} value={size} />
      ))}
    </datalist>
  )
}

// --- sub-components (house style: they live at the bottom of the file) ---

// One spec input, so no two renderings of the form can drift into two spellings
// of the same box. `multiline` is the description's textarea and `list` is the
// size's datalist; everything else is a plain input. `locked` is the read-only
// treatment for a login without the director role — and it drops the datalist
// with it, since offering suggestions into a box that cannot be typed in is
// noise.
function SpecInput({ field, value, disabled, locked, onChange }) {
  const style = locked ? readOnlyInput : inputStyle
  const shared = locked
    ? { value, readOnly: true, disabled: true, style }
    : { value, disabled, onChange, style }
  return (
    <Field label={field.label} style={field.multiline ? { gridColumn: '1 / -1' } : undefined}>
      {field.multiline ? (
        <textarea {...shared} rows={3} style={{ ...style, resize: 'vertical' }} />
      ) : (
        <input {...shared} list={locked ? undefined : field.list} />
      )}
    </Field>
  )
}
