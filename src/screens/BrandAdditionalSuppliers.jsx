// "Also invoiced by" on a house page: the suppliers besides the main one that
// invoice this house (Stroheim comes from Fabricut AND Jim Thompson).
//
//   POST   /admin/brands/:id/suppliers {supplier_id}   → { brand }
//   DELETE /admin/brands/:id/suppliers/:supplierId     → { brand }
//
// The main supplier stays the "Supplier" field above — pricing and purchase-
// order planning use it. A purchase order can be raised against any of them;
// the API refuses the main supplier here with a 422, and promoting one of these
// to main drops it from this list.

import { useState } from 'react'
import { c } from '../theme.js'
import { apiSend } from '../lib/api.js'
import { GhostButton, PanelNote, Select, inputStyle } from '../admin/parts.jsx'
import { additionalSupplierChoices } from './adminCatalogue.js'

export default function BrandAdditionalSuppliers({ brand, suppliers, busy, run }) {
  const [choice, setChoice] = useState('')
  const listed = brand.additional_suppliers ?? []
  const choices = additionalSupplierChoices(suppliers, brand)

  const add = () =>
    run(
      () => apiSend('POST', `/admin/brands/${brand.id}/suppliers`, { supplier_id: Number(choice) }),
      'Supplier added.'
    ).then((ok) => ok && setChoice(''))

  const remove = (supplier) =>
    run(
      () => apiSend('DELETE', `/admin/brands/${brand.id}/suppliers/${supplier.id}`),
      `${supplier.name} removed.`
    )

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {listed.length === 0 ? (
        <PanelNote>Only the main supplier invoices this house.</PanelNote>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {listed.map((supplier) => (
            <li key={supplier.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: c.ink }}>{supplier.name}</span>
              <GhostButton disabled={busy} onClick={() => remove(supplier)}>
                Remove
              </GhostButton>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Select
          value={choice}
          disabled={busy || choices.length === 0}
          onChange={(e) => setChoice(e.target.value)}
          aria-label="Add a supplier for this house"
          style={{ ...inputStyle, maxWidth: 320 }}
        >
          <option value="">Add a supplier…</option>
          {choices.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        <GhostButton tone="accent" disabled={busy || !choice} onClick={add}>
          Add supplier
        </GhostButton>
      </div>
    </div>
  )
}
