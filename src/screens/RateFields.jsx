// The parts one supplier rate is drawn with on the screens that show it: the
// form, shared by the hand-keying page (AdminPriceListItemNew) and the rate's
// own page (AdminPriceListItem), plus the enum select and the drop-detection
// tag the list (AdminPriceListItems) uses too.
//
// The form was drawn twice when both halves lived in the list — a create form
// dropping down above the table and an editor opening under the row — and the
// two had already drifted: the create form carried the hints (the code is kept
// raw, the rate is in the supplier's currency, pattern-match notes live in the
// vertical repeat) and the editor did not. One component now, over the one
// declaration in ./adminPriceListItems.js, so they cannot drift again.
//
// What still differs between the two is the IDENTITY, and it is keyed on
// `record`: without one (a create) the supplier is a box, because it is part of
// the identity key and is typed exactly once; with one (an edit) it is read-only
// and the two server-derived columns are shown beside it — `code_normalized`
// (typing it would let it disagree with the code) and `source_file` (a
// hand-keyed row is stamped 'manual-entry' by the API, so provenance is never an
// input). The record lock is the other difference, and it is the CALLER's
// `locked` answer: a create locks nothing (see src/screens/recordLock.js).

import { c, font } from '../theme.js'
import { dayOf } from '../admin/priceHistory.js'
import { Field, Select, inputStyle, readOnlyInput } from '../admin/parts.jsx'
import { rateFlag } from './adminLists.js'
import { CURRENCIES, FREIGHT_CLASSES, UNITS } from './adminPriceListItems.js'

const NOTHING_LOCKED = () => false

export default function RateFields({
  values,
  onChange,
  disabled,
  record = null,
  locked = NOTHING_LOCKED,
  categories,
  categoryLabel,
  children,
}) {
  const box = (key, props = {}) => (
    <ItemInput
      draft={values}
      field={key}
      locked={locked(key)}
      busy={disabled}
      onChange={onChange(key)}
      {...props}
    />
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }} className="r-grid-2">
      {record ? (
        <>
          <Field label="Supplier" hint="Part of the identity key — fixed.">
            <input value={record.supplier} readOnly disabled style={readOnlyInput} />
          </Field>
          <Field label="Normalised code" hint="Derived from the code.">
            <input value={record.code_normalized ?? ''} readOnly disabled style={{ ...readOnlyInput, fontFamily: font.mono }} />
          </Field>
          <Field label="Source" hint="Provenance of this row.">
            <input value={record.source_file ?? ''} readOnly disabled style={readOnlyInput} />
          </Field>
        </>
      ) : (
        <Field label="Supplier" hint="Part of the row's identity — fixed afterwards.">
          <input value={values.supplier ?? ''} disabled={disabled} onChange={onChange('supplier')} style={inputStyle} />
        </Field>
      )}
      <Field label="Category">
        <EnumSelect value={values.category} options={categories} labelOf={categoryLabel} disabled={disabled} onChange={onChange('category')} />
      </Field>
      <Field label="Code" hint="Kept raw; the normalised form is derived server-side.">
        {box('code', { mono: true })}
      </Field>
      <Field label="Unit">
        <EnumSelect value={values.unit} options={UNITS} disabled={disabled} onChange={onChange('unit')} />
      </Field>
      <Field label="Wholesale rate" hint="In the supplier's currency, up to 4 decimals.">
        {box('wholesale_rate', { inputMode: 'decimal', placeholder: '0.0000', mono: true })}
      </Field>
      <Field label="Currency">
        {locked('currency') ? (
          <ItemInput draft={values} field="currency" locked busy={disabled} />
        ) : (
          <EnumSelect value={values.currency} options={CURRENCIES} disabled={disabled} onChange={onChange('currency')} />
        )}
      </Field>
      <Field label="Product range">{box('product_range')}</Field>
      <Field label="Description">{box('description')}</Field>
      <Field label="Contents">{box('contents')}</Field>
      <Field label="Width">{box('width')}</Field>
      <Field label="Repeat">{box('repeat')}</Field>
      <Field label="Vertical repeat" hint="Pattern-match notes live here too.">
        {box('vertical_repeat')}
      </Field>
      <Field label="Duty class" hint="Stored raw — the broker's duty table is still owed.">
        {box('duty_class')}
      </Field>
      <Field label="Freight class">
        <EnumSelect value={values.freight_class} options={FREIGHT_CLASSES} allowBlank disabled={disabled} onChange={onChange('freight_class')} />
      </Field>
      <Field label="Date effective">
        <input type="date" value={values.date_effective ?? ''} disabled={disabled} onChange={onChange('date_effective')} style={inputStyle} />
      </Field>
      {/* Whatever the caller adds to the grid — the rate's page puts the
          change-reason box here, beside the rate it explains. */}
      {children}
    </div>
  )
}

// --- sub-components (house style: they live at the bottom of the screen file) ---

// A select whose options are a flat string list, with a blank first entry when
// the column is nullable.
// `labelOf` is optional and defaults to the stored value, which is what every
// enum on these screens showed before: `metre`, `EUR`, `A`. The category list is
// the one that needs it — `bed-linen` is a storage spelling, not a word to put
// in front of somebody.
export function EnumSelect({ value, options, onChange, disabled, allowBlank, ariaLabel, style, labelOf }) {
  return (
    <Select
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ ...inputStyle, ...style }}
    >
      {allowBlank && <option value="">—</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {labelOf ? labelOf(option) : option}
        </option>
      ))}
    </Select>
  )
}

// One text box in the form, drawn read-only when the record lock covers its
// column. Eleven of these are rendered, so the locked/editable branch is
// written once here rather than eleven times inline.
function ItemInput({ draft, field, locked, busy, onChange, inputMode, placeholder, mono }) {
  const style = { ...(locked ? readOnlyInput : inputStyle), ...(mono ? { fontFamily: font.mono } : null) }
  const editable = { disabled: busy, onChange, placeholder }
  const fixed = { readOnly: true, disabled: true }
  return (
    <input value={draft[field] ?? ''} inputMode={inputMode} style={style} {...(locked ? fixed : editable)} />
  )
}

// Which of the two drop-detection facts a rate wears (rateFlag orders them —
// the stored decision outranks the derived suspicion). Clay is the alarm tone,
// the oversold treatment on Manage stock; brass is the step quieter "look at
// this" — a suspicion the next full import can dissolve, so it must not shout
// like a verdict. Drawn on the list row and again on the rate's own page, which
// is now the only place the row is not.
export function FlagTag({ item }) {
  const flag = rateFlag(item)
  if (!flag) return null
  const discontinued = flag === 'discontinued'
  return (
    <span
      title={
        discontinued
          ? `Marked discontinued ${dayOf(item.discontinued_at)}.`
          : 'The most recent import covering this supplier and category did not name this code.'
      }
      style={{
        display: 'block',
        fontWeight: 600,
        fontSize: 9.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: discontinued ? c.clay : c.brass,
        marginTop: 3,
      }}
    >
      {discontinued ? 'Discontinued' : 'Suspect — missing from last import'}
    </span>
  )
}
