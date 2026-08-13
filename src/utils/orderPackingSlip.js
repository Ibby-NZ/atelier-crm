// The packing slip off a SALES ORDER — the third document the order desk prints
// (W12 US-007), and the one that carries no money at all. The client's words:
// "there's no prices on a packing slip".
//
// Ported from ./packingSlip.js, which does the same job for a PURCHASE order and
// is deliberately left exactly as it was. The two documents differ in the one
// place that matters: a PO line carries `received`, so that slip filters to
// `received > 0` and reports Ordered / Shipped / Backordered against a supplier
// delivery. **Receipting is not something that happens to a sales order.** Its
// lines carry `qty` — what the client asked for — and every one of them is on
// the slip, so there is no filter here and no shipped/backordered arithmetic.
//
// **No PDF library** (ADR 008 in atelier-api's architecture.md): the browser's
// own print dialog offers "Save as PDF", and bundling a renderer would be a
// megabyte to reproduce a button that already exists. The ceiling that decision
// accepts is that page breaks and margins are the browser's to choose.
//
// **The document is built by a PURE function.** This repo has no jsdom, so the
// "no prices" rule can only be tested if what the print window receives is a
// string a test can read — which is why `packingSlipHtml` exists separately from
// `printOrderPackingSlip`. See orderPackingSlip.test.js: it asserts that no
// money value CAN appear in the output, not merely that this mapper omits one.

import { contactLabel } from '../admin/orderFlow.js'

/**
 * The lines of a sales order as a packing slip lists them: what to pick, what it
 * is, how much of it, and how it is to be cut. No prices, by construction —
 * `unit_price_cents` is not read here and has nowhere to go.
 *
 * pg hands `qty` back as a string ('10.00'), so it is coerced once, here.
 *
 * ponytail: the quantity prints without a unit. `metres` vs `units` lives on
 * products.product_type and the API's order-line projection does not carry it;
 * printing "m" against a cushion would be worse than printing nothing. Add the
 * unit here when the line carries it.
 *
 * @param {ReadonlyArray<{sku?: string, product_name?: string, qty?: number|string,
 *   cut_requirements?: string|null}>} [lines]
 * @returns {Array<{sku: string, design: string, qty: number, cut: string}>}
 */
export function orderPackingSlipLines(lines = []) {
  return lines.map((line) => {
    const qty = Number(line?.qty)
    return {
      sku: line?.sku ?? '',
      design: line?.product_name ?? '',
      qty: Number.isFinite(qty) ? qty : 0,
      cut: line?.cut_requirements ?? '',
    }
  })
}

/**
 * A Stripe-collected (or hand-keyed) delivery address as readable lines. A
 * request-kind order has none until someone adds it, so absence is stated by the
 * caller rather than left as a blank block.
 *
 * @param {object|null} [address]
 * @returns {string[]}
 */
export function addressLines(address) {
  if (!address || typeof address !== 'object') return []
  return [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.postal_code].filter(Boolean).join(' '),
    address.state,
    address.country,
  ].filter((part) => part && String(part).trim())
}

const esc = (value) =>
  String(value == null ? '' : value).replace(
    /[&<>]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char])
  )

// The order date, sliced out of the ISO string rather than parsed. Constructing a
// Date would render the document in the printing machine's timezone, so an order
// taken late in a NZ afternoon could print with yesterday's date on an office
// laptop set to UTC.
const dayOf = (value) => String(value ?? '').slice(0, 10)

// A labelled fact, omitted entirely when there is nothing to say — an empty
// "Client PO number:" reads as a missing number rather than as one that was
// never issued.
const factRow = (label, value) =>
  value ? `<div><span class="lbl">${esc(label)}</span> ${esc(value)}</div>` : ''

/**
 * The print-ready document, as a string.
 *
 * **`customer_po_number` is labelled "Client PO number" and nothing shorter.**
 * It is the PO the CLIENT issued to US; Atelier's own purchase orders are a
 * different record entirely (W13's `purchase_orders`), and a slip that says
 * plain "PO number" is one an operator will reconcile against the wrong book.
 *
 * @param {object} [order] an order as GET /admin/orders returns it
 * @returns {string}
 */
export function packingSlipHtml(order = {}) {
  const rows = orderPackingSlipLines(order.lines ?? [])
  const shipTo = addressLines(order.shipping_address)

  const body = rows
    .map(
      (row) => `<tr>
      <td class="mono">${esc(row.sku)}</td>
      <td>${esc(row.design)}${row.cut ? `<div class="cut">${esc(row.cut)}</div>` : ''}</td>
      <td class="mono right">${esc(row.qty)}</td></tr>`
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip — ${esc(order.order_number)}</title>
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
      .facts { font-family: Arial, sans-serif; font-size: 11px; color: #898472; line-height: 1.8; margin-top: 6px; }
      .facts .lbl { display: inline-block; min-width: 128px; color: #B5985B; letter-spacing: .06em; text-transform: uppercase; font-size: 9px; }
      .ship { margin-top: 4px; font-size: 13px; line-height: 1.6; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 22px; }
      th { text-align: left; font-family: Arial, sans-serif; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #898472; border-bottom: 1px solid #D4CFB9; padding: 8px 10px; }
      td { padding: 9px 10px; border-bottom: 1px solid #EBE9DF; vertical-align: top; }
      .cut { font-family: Arial, sans-serif; font-size: 10.5px; color: #898472; margin-top: 3px; }
      footer { margin-top: 20px; font-family: Arial, sans-serif; font-size: 10px; color: #898472; }
    </style></head><body>
    <header>
      <div class="wm">ATELIER<small>TEXTILES</small></div>
      <div class="sub">Packing Slip<br>${esc(order.order_number)}</div>
    </header>
    <h1>Ship to ${esc(contactLabel(order))}</h1>
    <div class="ship">${shipTo.map((line) => esc(line)).join('<br>') || '<em>No delivery address recorded.</em>'}</div>
    <div class="facts">
      ${factRow('Order date', dayOf(order.created_at))}
      ${factRow('Client reference', order.client_reference)}
      ${factRow('Client PO number', order.customer_po_number)}
      ${factRow('Contact', order.contact_phone)}
    </div>
    <table><thead><tr><th>SKU</th><th>Design</th><th class="right">Quantity</th></tr></thead>
    <tbody>${body}</tbody></table>
    <footer>A packing slip carries no prices — the invoice is where the amounts are. Generated from the Atelier platform.</footer>
    </body></html>`
}

/**
 * Open the packing slip in a print window. Returns false when the pop-up was
 * blocked, so the caller can flash a hint rather than looking like it did
 * nothing — the same contract printPackingSlip has for a purchase order.
 *
 * @param {object} order
 * @returns {boolean}
 */
export function printOrderPackingSlip(order) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(packingSlipHtml(order))
  w.document.close()
  w.focus()
  w.print()
  return true
}
