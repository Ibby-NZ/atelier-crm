// The editable sample-order columns, shared by the two places that write them:
// the raise-a-request page (AdminSampleOrderNew) and the edit block on one
// order's own page (AdminSampleOrder). They are identical on create and on edit
// — SAMPLE_ORDER_FIELDS is the same whitelist the API's PATCH accepts, so the
// two forms cannot drift.
//
// `status` is deliberately not here: a create always lands in "requested" and a
// move goes through the transition endpoint, which stamps the date beside it.

import { Field, Select, inputStyle } from '../admin/parts.jsx'

export default function SampleOrderFields({ values, onChange, disabled, showrooms, suppliers }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field label="Showroom" hint="Where the material is going. Required — a request with no destination cannot be fulfilled.">
        <Select
          value={values.showroom_id ?? ''}
          disabled={disabled}
          onChange={onChange('showroom_id')}
        >
          <option value="">Choose a showroom…</option>
          {showrooms.map((showroom) => (
            <option key={showroom.id} value={showroom.id}>
              {showroom.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Label" hint="What is being asked for, in the office's words — especially for material the catalogue does not hold.">
        <input
          value={values.label ?? ''}
          disabled={disabled}
          onChange={onChange('label')}
          style={inputStyle}
        />
      </Field>
      <Field label="Supplier">
        <Select
          value={values.supplier_id ?? ''}
          disabled={disabled}
          onChange={onChange('supplier_id')}
        >
          <option value="">No supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </Field>
      {/* An id box, not a picker: colourways is ~19k rows and needs the search
          UI Manage stock has. The page shows the resolved design and house from
          the API, so a wrong id is visible rather than silent. */}
      <Field label="Colourway id" hint="Optional. The order shows the resolved design once saved.">
        <input
          value={values.colourway_id ?? ''}
          disabled={disabled}
          onChange={onChange('colourway_id')}
          style={inputStyle}
        />
      </Field>
      <Field label="Notes" style={{ gridColumn: 'span 2' }}>
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
