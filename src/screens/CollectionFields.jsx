// The collection form, shared by the two pages that write one: the create page
// (AdminCollectionNew, /admin/collections/new) and the collection's own page
// (AdminCollection, /admin/collections/:id). Both used to be written out inside
// AdminCollections — the "Add a collection" drop-down and the expanded row —
// and one component now draws both, off COLLECTION_FIELDS in adminCatalogue.js.
//
// The two differ where the API makes them differ, and nowhere else:
//   - **The house is create-only.** PATCH /admin/collections/:id takes
//     name/description/image_url and nothing else — moving a collection between
//     houses would strand its products, whose own `brand_id` is a direct FK — so
//     it is a choice here on create and read-only on the record.
//   - The web address is generated on create and fixed, and unique within the
//     house rather than across the catalogue; it exists to show on the record.

import { Field, Select, inputStyle, readOnlyInput } from '../admin/parts.jsx'

export default function CollectionFields({ values, set, disabled, record = null, brands = [] }) {
  const creating = record == null
  const text = (key) => ({
    value: values[key] ?? '',
    disabled,
    onChange: (e) => set(key, e.target.value),
    style: inputStyle,
  })

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
        <Field
          label="Name"
          hint={
            creating
              ? 'The web address is generated from it and is fixed afterwards. It only has to be unique within this house.'
              : undefined
          }
        >
          <input {...text('name')} placeholder="e.g. Cappuccino" />
        </Field>
        {!creating && (
          <Field
            label="Web address"
            hint="Fixed once created, and unique within this house rather than across the catalogue."
          >
            <input value={record.slug ?? ''} readOnly disabled style={readOnlyInput} />
          </Field>
        )}
        {creating ? (
          <Field label="House" hint="Fixed once created — a collection belongs to one house.">
            <Select value={values.brand_id ?? ''} disabled={disabled} onChange={(e) => set('brand_id', e.target.value)}>
              <option value="">Choose a house…</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="House" hint="Fixed once created.">
            <input value={record.brand_name ?? ''} readOnly disabled style={readOnlyInput} />
          </Field>
        )}
      </div>
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }} className="r-grid-2">
        <Field label="Description" hint="Shown on the storefront brand page's collection tile.">
          <input {...text('description')} placeholder="Tile description" />
        </Field>
        <Field label="Image" hint="Tile image, https:// only.">
          <input {...text('image_url')} placeholder="https://…" />
        </Field>
      </div>
    </>
  )
}
