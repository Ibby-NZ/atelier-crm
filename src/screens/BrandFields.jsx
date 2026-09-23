// The house form, shared by the two pages that write one: the create page
// (AdminBrandNew, /admin/brands/new) and the house's own page (AdminBrand,
// /admin/brands/:id). Both used to be written out inside AdminBrands — the
// "Add a house" drop-down and the expanded row — with the same boxes in two
// places and hints already drifting apart. One component now draws both, off
// BRAND_FIELDS / BRAND_EDIT_FIELDS in adminCatalogue.js.
//
// The two differ where the API makes them differ, and nowhere else:
//   - The web address is generated on create and IMMUTABLE — the storefront URL
//     and the EmDash brand-page match key — so it only exists to show on the
//     record, read-only.
//   - The supplier is EDIT-only: POST /admin/brands does not take one (Ajv
//     strips the key), so a create form offering it would draw a select that
//     silently saves nothing. The record page hands in its options.
//   - A hint that says what a BLANK does ("blank removes it") only means
//     something on a record that has a value to remove.

import { Field, CheckField, Select, inputStyle, readOnlyInput } from '../admin/parts.jsx'

export default function BrandFields({ values, set, disabled, record = null, supplierOptions = [] }) {
  const creating = record == null
  const hint = (onCreate, onRecord) => (creating ? onCreate : onRecord)
  const text = (key) => ({
    value: values[key] ?? '',
    disabled,
    onChange: (e) => set(key, e.target.value),
  })
  const tick = (key) => ({
    checked: values[key],
    disabled,
    onChange: (e) => set(key, e.target.checked),
  })

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="r-grid-2">
        <Field label="House name" hint={hint('The web address is generated from it and is fixed afterwards.', undefined)}>
          <input {...text('name')} style={inputStyle} placeholder="e.g. Pierre Frey" />
        </Field>
        <Field label="Currency">
          <input {...text('currency')} maxLength={3} style={inputStyle} />
        </Field>
        {!creating && (
          <Field label="Web address" hint="Fixed once created — storefront links depend on it.">
            <input value={record.slug ?? ''} readOnly disabled style={readOnlyInput} />
          </Field>
        )}
        <Field label="Country">
          <input {...text('country')} style={inputStyle} placeholder="e.g. France" />
        </Field>
        {/* The link a purchase order is addressed through. The same column the
            supplier screen's link picker writes — set from either end, read on
            both. */}
        {!creating && (
          <Field label="Supplier" hint="Who invoices Atelier for this house. Blank means nobody does yet.">
            <Select
              value={values.supplier_id ?? ''}
              disabled={disabled}
              onChange={(e) => set('supplier_id', e.target.value)}
              aria-label="Supplier for this house"
              style={inputStyle}
            >
              <option value="">No supplier</option>
              {supplierOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {/* Filled from the CRM one house at a time — the backfill planner found
            no defensible source for it, so this input IS the write path. Blank
            clears it; a code already used by another of this supplier's houses
            is the API's 409, shown inline. */}
        <Field
          label="Brand code"
          hint={hint(
            "The reporting designation the old D365 reports keyed on — unique within this house's supplier.",
            'D365 reporting designation, e.g. CF — reports filter on it. Blank removes it.'
          )}
        >
          <input {...text('brand_code')} style={inputStyle} placeholder="e.g. CF" />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="Headline" hint="One line — the house's storefront page opens on it, above the story.">
          <input {...text('headline')} style={inputStyle} maxLength={200} placeholder="e.g. Silk woven in Lyon since 1787." />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="Story" hint="The body copy on the house's storefront page — on the right for an ordinary house, under the headline for a bespoke one.">
          <textarea
            {...text('story')}
            rows={3}
            style={{ ...inputStyle, height: 'auto', padding: 12, lineHeight: 1.6, resize: 'vertical' }}
          />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field
          label="Website"
          hint={hint(
            "The house's own site — the storefront brand page links out to it.",
            "The house's own site — blank removes the storefront link."
          )}
        >
          <input {...text('website_url')} style={inputStyle} placeholder="https://www.pierrefrey.com" />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field
          label="House image"
          hint={hint(
            "The photograph the storefront's house tiles show, with the maison's name over it. Blank falls back to a collection or product shot.",
            "Shown on the storefront's house tiles under the maison's name — blank falls back to a collection or product shot."
          )}
        >
          <input {...text('image_url')} style={inputStyle} placeholder="https://media.atelier.co.nz/houses/pierre-frey.jpg" />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field
          label="Logo"
          hint={hint(
            "A transparent PNG of the maison's mark, white on nothing — the tile centres it over the house image in place of the typed name. Blank shows the name.",
            "A transparent PNG of the maison's mark — centred over the house image on the storefront tile in place of the name. Blank shows the name."
          )}
        >
          <input {...text('logo_url')} style={inputStyle} placeholder="https://media.atelier.co.nz/houses/pierre-frey-logo.png" />
        </Field>
      </div>
      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <CheckField label="International house — retail prices stay hidden from shoppers" {...tick('is_international')} />
        {/* The public/closed switch. Untick it and this house's products
            appear on the storefront to everyone, signed in or not; ticked,
            only approved trade accounts and staff can reach them. */}
        <CheckField
          label="Trade only — signed-out visitors to the website cannot see this house's products at all"
          {...tick('trade_only')}
        />
        <CheckField
          label="Bespoke — takes made-to-measure commissions; listed on the website's Bespoke page, with the quote enquiry form on its house page"
          {...tick('bespoke')}
        />
      </div>
    </>
  )
}
