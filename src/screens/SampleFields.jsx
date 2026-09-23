// The editable sample columns, shared by the two places that write them: the
// register-a-sample page (AdminSampleNew) and the edit block on one sample's own
// page (AdminSample). SAMPLE_FIELDS is the same whitelist the API's PATCH
// accepts, so create and edit cannot drift apart. The ONE create/edit
// difference is the barcode's copy: on create a blank asks the server to mint a
// tag (createSampleBody omits the key), while on edit the column is NOT NULL and
// blanking it is refused by the diff.
//
// The status select offers WRITABLE_SAMPLE_STATUSES, never the full vocabulary:
// `out` is set by checking the sample out, and offering it here would put a 400
// behind a reasonable-looking choice.
//
// `finance` decides whether the Value pair is drawn at all (the cost columns are
// DELETED from the response without the grant, not nulled). Both call sites pass
// it; leaving it off this list made the whole register a blank page — the
// reference threw on first render and React unmounted the tree.

import { font } from '../theme.js'
import { Field, Select, inputStyle } from '../admin/parts.jsx'
import { WRITABLE_SAMPLE_STATUSES, statusLabel } from './adminSamples.js'

export default function SampleFields({
  values,
  onChange,
  disabled,
  showrooms,
  suppliers,
  finance = false,
  creating = false,
}) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field
        label="Barcode"
        hint={
          creating
            ? 'Optional — leave blank and the register numbers the tag itself.'
            : 'The tag on the object. Unique, and what the scanner reads.'
        }
      >
        <input
          value={values.barcode ?? ''}
          disabled={disabled}
          onChange={onChange('barcode')}
          placeholder={creating ? 'Leave blank to auto-generate' : undefined}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Label" hint="What staff call it where there is no catalogue link.">
        <input
          value={values.label ?? ''}
          disabled={disabled}
          onChange={onChange('label')}
          style={inputStyle}
        />
      </Field>
      <Field label="Type" hint="Free text: hanger, cutting, book, memo — the office's own word.">
        <input
          value={values.sample_type ?? ''}
          disabled={disabled}
          onChange={onChange('sample_type')}
          style={inputStyle}
        />
      </Field>
      <Field label="Shelf location">
        <input
          value={values.location ?? ''}
          disabled={disabled}
          onChange={onChange('location')}
          style={inputStyle}
        />
      </Field>
      <Field label="Status" hint="“Out” is set by checking the sample out, not here.">
        <Select
          value={values.status ?? ''}
          disabled={disabled}
          onChange={onChange('status')}
          aria-label="Status"
        >
          <option value="">—</option>
          {WRITABLE_SAMPLE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Showroom" hint="Where it stands. Clearing it leaves the sample un-homed, which is normal.">
        <Select
          value={values.showroom_id ?? ''}
          disabled={disabled}
          onChange={onChange('showroom_id')}
          aria-label="Showroom"
        >
          <option value="">—</option>
          {showrooms.map((showroom) => (
            <option key={showroom.id} value={showroom.id}>
              {showroom.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Supplier" hint="Who sent it. History — it survives the house being re-linked.">
        <Select
          value={values.supplier_id ?? ''}
          disabled={disabled}
          onChange={onChange('supplier_id')}
          aria-label="Supplier"
        >
          <option value="">—</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Colourway id"
        hint="The SKU's id, from Catalogue → Colourways. Optional: plenty of samples predate the catalogue."
      >
        <input
          value={values.colourway_id ?? ''}
          disabled={disabled}
          onChange={onChange('colourway_id')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      {finance && (
        <Field
          label="Value"
          hint="What the sample cost, in the supplier's currency. Blank is “no cost recorded”; 0 is a free hanger — different facts, both kept."
        >
          <input
            value={values.unit_cost ?? ''}
            disabled={disabled}
            inputMode="decimal"
            onChange={onChange('unit_cost')}
            style={{ ...inputStyle, fontFamily: font.mono }}
          />
        </Field>
      )}
      {finance && (
        <Field label="Value currency" hint="Free text — a sample can be bought from anyone in anything, NZD included.">
          <input
            value={values.cost_currency ?? ''}
            disabled={disabled}
            onChange={onChange('cost_currency')}
            style={{ ...inputStyle, fontFamily: font.mono }}
          />
        </Field>
      )}
      <Field label="Notes" style={{ gridColumn: '1 / -1' }}>
        <input
          value={values.notes ?? ''}
          disabled={disabled}
          onChange={onChange('notes')}
          style={inputStyle}
        />
      </Field>
    </div>
  )
}
