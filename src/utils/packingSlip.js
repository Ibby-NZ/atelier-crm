// Packing slips restricted to items currently being shipped (decision 2, 15 Jul). When an order
// part-ships, the slip lists ONLY the lines with material received/shipping now — never the whole
// order — so a partial shipment doesn't claim lines that haven't left the supplier.

// lines: [{ sku, name, ordered, received }]
// → [{ sku, design, ordered, shipped, backordered }] for lines with something to ship (received > 0).
export function packingSlipLines(lines = []) {
  return lines
    .filter((l) => (l.received || 0) > 0)
    .map((l) => ({
      sku: l.sku,
      design: l.name || l.design || '',
      ordered: l.ordered || 0,
      shipped: l.received || 0,
      backordered: Math.max(0, (l.ordered || 0) - (l.received || 0)),
    }))
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]))

// Open a print-ready packing slip in a new window (same pattern as PriceLists.printPDF).
// Returns false when the pop-up is blocked so the caller can flash a hint.
export function printPackingSlip({ poNumber = '', supplier = '', so = '', client = '', lines = [] }) {
  const rows = packingSlipLines(lines)
  const w = window.open('', '_blank')
  if (!w) return false
  const body = rows
    .map((r) => `<tr>
      <td class="mono">${esc(r.sku)}</td><td>${esc(r.design)}</td>
      <td class="mono right">${esc(r.ordered)} m</td>
      <td class="mono right">${esc(r.shipped)} m</td>
      <td class="mono right">${r.backordered ? esc(r.backordered) + ' m' : '—'}</td></tr>`)
    .join('')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slip — ${esc(poNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Georgia, 'Times New Roman', serif; color: #33312B; margin: 40px; }
      .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      .right { text-align: right; }
      header { border-bottom: 2px solid #33312B; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
      .wm { font-size: 22px; letter-spacing: .16em; font-weight: 700; }
      .wm small { display: block; font-family: Arial, sans-serif; font-size: 9px; letter-spacing: .42em; color: #B5985B; margin-top: 3px; }
      h1 { font-size: 20px; font-weight: 500; margin: 0; }
      .sub { font-family: Arial, sans-serif; font-size: 11px; color: #898472; text-align: right; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 6px; }
      th { text-align: left; font-family: Arial, sans-serif; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #898472; border-bottom: 1px solid #D4CFB9; padding: 8px 10px; }
      td { padding: 9px 10px; border-bottom: 1px solid #EBE9DF; }
      footer { margin-top: 20px; font-family: Arial, sans-serif; font-size: 10px; color: #898472; }
    </style></head><body>
    <header>
      <div class="wm">ATELIER<small>TEXTILES</small></div>
      <div class="sub">Packing Slip — Indicative<br>${esc(poNumber)} · ${esc(supplier)}</div>
    </header>
    <h1>Ship to ${esc(client)}</h1>
    <div class="sub" style="text-align:left;margin-top:4px">Origin sales order ${esc(so)}</div>
    <table><thead><tr><th>SKU</th><th>Design</th><th class="right">Ordered</th><th class="right">Shipped</th><th class="right">Backordered</th></tr></thead>
    <tbody>${body}</tbody></table>
    <footer>Only items in this shipment are listed — backordered balances follow on receipt. Generated from the Atelier platform.</footer>
    </body></html>`)
  w.document.close()
  w.focus()
  w.print()
  return true
}
