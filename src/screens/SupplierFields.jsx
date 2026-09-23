// The editable supplier columns, shared by the two places that write them: the
// create form on its own page (AdminSupplierNew, /admin/suppliers/new) and the
// edit block on one supplier's own page (AdminSupplier). SUPPLIER_FIELDS is the same whitelist the
// API's PATCH accepts, so create and edit cannot drift apart.

import { font } from '../theme.js'
import { Field, Select, inputStyle } from '../admin/parts.jsx'
import { DISCOUNT_METHODS } from './adminSuppliers.js'

// One select whose options are a flat string list, blank first where the column
// is nullable — discount_method is, because "not decided yet" is a real answer.
function EnumSelect({ value, options, onChange, disabled, ariaLabel }) {
  return (
    <Select value={value ?? ''} onChange={onChange} disabled={disabled} aria-label={ariaLabel}>
      <option value="">—</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  )
}

export default function SupplierFields({ values, onChange, disabled }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field label="Name" hint="The slug is derived from this on create and never changes.">
        <input value={values.name ?? ''} disabled={disabled} onChange={onChange('name')} style={inputStyle} />
      </Field>
      <Field label="Short code">
        <input
          value={values.short_code ?? ''}
          disabled={disabled}
          onChange={onChange('short_code')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="D365 token" hint="The token D365 composes into an item code — PF in “F3518-003 23PF”.">
        <input
          value={values.d365_token ?? ''}
          disabled={disabled}
          onChange={onChange('d365_token')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Country">
        <input value={values.country ?? ''} disabled={disabled} onChange={onChange('country')} style={inputStyle} />
      </Field>
      <Field label="Invoicing currency" hint="What they invoice in, not the country's currency. Blank = no invoice on file.">
        <input
          value={values.currency ?? ''}
          disabled={disabled}
          onChange={onChange('currency')}
          placeholder="EUR"
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Agent">
        <input value={values.agent ?? ''} disabled={disabled} onChange={onChange('agent')} style={inputStyle} />
      </Field>
      <Field label="Incoterm">
        <input value={values.incoterm ?? ''} disabled={disabled} onChange={onChange('incoterm')} style={inputStyle} />
      </Field>
      <Field label="PO email">
        <input value={values.po_email ?? ''} disabled={disabled} onChange={onChange('po_email')} style={inputStyle} />
      </Field>
      <Field label="Discount method" hint="Averaged is the one supplier-level net rate; per-brand is house by house.">
        <EnumSelect
          value={values.discount_method}
          options={DISCOUNT_METHODS}
          disabled={disabled}
          onChange={onChange('discount_method')}
          ariaLabel="Discount method"
        />
      </Field>
      <Field label="Phone" hint="The company line; per-person numbers live in Contact people below.">
        <input
          value={values.phone ?? ''}
          disabled={disabled}
          onChange={onChange('phone')}
          style={{ ...inputStyle, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Address">
        <input value={values.address ?? ''} disabled={disabled} onChange={onChange('address')} style={inputStyle} />
      </Field>
      <Field label="Website">
        <input
          value={values.website_url ?? ''}
          disabled={disabled}
          onChange={onChange('website_url')}
          placeholder="https://…"
          style={inputStyle}
        />
      </Field>
      <Field label="Notes">
        <input value={values.notes ?? ''} disabled={disabled} onChange={onChange('notes')} style={inputStyle} />
      </Field>
    </div>
  )
}
