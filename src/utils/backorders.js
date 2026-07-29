// Back orders generated on receipt of material (decision 2, 15 Jul). Atelier holds little stock, so
// most orders are shortages pulled from back order; a back order exists once material has been
// RECEIVED against a PO line but the line is still short of what was ordered.
//
// Pure + derived from the live PO `lines` — no persistence, so it recomputes after every receipt.
// Demo shortcut: the sales-order link is the PO's whole-order origin (po.origin), not a per-SKU
// allocation; a production build would allocate received metres to specific SO lines.

// lines: [{ sku, name, ordered, received }]
// → [{ sku, design, qty, so, client, status }] for every part-received-but-short line.
export function deriveBackorders(lines = [], { so = '—', client = '—' } = {}) {
  return lines
    .filter((l) => (l.received || 0) > 0 && (l.ordered || 0) - (l.received || 0) > 0)
    .map((l) => ({
      sku: l.sku,
      design: l.name || l.design || '',
      qty: (l.ordered || 0) - (l.received || 0),
      so,
      client,
      status: 'Awaiting supplier',
    }))
}
