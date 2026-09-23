// The editable showroom columns, shared by the two places that write them: the
// new-showroom page (AdminShowroomNew) and the edit block on one showroom's own
// page (AdminShowroom). They are identical on create and on edit —
// SHOWROOM_FIELDS is the same whitelist the API's PATCH accepts, so the two
// forms cannot drift apart.

import { Field, inputStyle } from '../admin/parts.jsx'

export default function ShowroomFields({ values, onChange, disabled }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
      className="r-grid-2"
    >
      <Field label="Name" hint="Unique. It is what every sample and sample order names this place by.">
        <input
          value={values.name ?? ''}
          disabled={disabled}
          onChange={onChange('name')}
          style={inputStyle}
        />
      </Field>
      <Field label="Address">
        <input
          value={values.address ?? ''}
          disabled={disabled}
          onChange={onChange('address')}
          style={inputStyle}
        />
      </Field>
      <Field label="City">
        <input
          value={values.city ?? ''}
          disabled={disabled}
          onChange={onChange('city')}
          style={inputStyle}
        />
      </Field>
      <Field label="Contact">
        <input
          value={values.contact_name ?? ''}
          disabled={disabled}
          onChange={onChange('contact_name')}
          style={inputStyle}
        />
      </Field>
      <Field label="Contact email">
        <input
          value={values.contact_email ?? ''}
          disabled={disabled}
          onChange={onChange('contact_email')}
          style={inputStyle}
        />
      </Field>
      <Field label="Contact phone">
        <input
          value={values.contact_phone ?? ''}
          disabled={disabled}
          onChange={onChange('contact_phone')}
          style={inputStyle}
        />
      </Field>
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
