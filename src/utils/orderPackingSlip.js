// The packing slip off a SALES ORDER — the third document the order desk prints
// (W12 US-007), and the one that carries no money at all. The client's words:
// "there's no prices on a packing slip".
//
// **Laid out as Atelier's Dynamics packing slip, in the platform's brand** (23
// Sep 2026, the client sent SO-08082 to copy): letterhead with Atelier's own
// details, the order's facts beside it, Invoice to / Deliver to, then Stock
// code / Description / Quantity / UOM, and the packing slip terms word for word
// beneath the lines (moved there 24 Sep 2026, at the client's request). The
// brand is the storefront's design system (src/index.css): the wordmark, Inter,
// ink on paper, the ochre accent — no serif, which the client took out of the
// brand in Sept 2026.
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
import { WORDMARK_PATHS, WORDMARK_VIEWBOX } from '../components/wordmarkPaths.js'

// Atelier's own details, as the Dynamics slip printed them in its letterhead.
// The phone and freephone are the storefront's (atelier-storefront
// src/lib/site.js), which is where the client keeps them current.
export const COMPANY = Object.freeze({
  name: 'Atelier Textiles Limited',
  lines: Object.freeze(['PO Box 5017', 'Victoria Street West', 'Auckland']),
  phone: '+64 9 373 3866',
  freephone: '0800 ATELIER',
  email: 'enquiries@atelier.co.nz',
  web: 'atelier.co.nz',
})

// Word for word as the client supplied it (and as the Dynamics slip carries
// it). Legal wording — change it only when they do.
export const PACKING_SLIP_TERMS =
  'Orders cannot be cancelled once cut and/or dispatched. Please check all details of this order. ' +
  'Unless notified by return, this is accepted as your confirmed order. Atelier Textiles Limited ' +
  'shall not be liable for the failure to deliver, or for any delay in delivery arising from any ' +
  'cause beyond our reasonable control. New Zealand delivery expenses will be added to your account.'

// The unit of measure column. `line.unit` is the inventory row's ('metres' |
// 'units'); a colourway that has never been stocked has none, and the column is
// left blank rather than guessing metres against a cushion.
const UOM_LABELS = Object.freeze({ metres: 'Metres', units: 'Units' })

/**
 * The lines of a sales order as a packing slip lists them: what to pick, what it
 * is, how much of it, and what it is for. No prices, by construction —
 * `unit_price_cents` is not read here and has nowhere to go.
 *
 * pg hands `qty` back as a string ('10.00'), so it is coerced once, here.
 * `description` / `composition` / `width` / `size` are the product record's,
 * printed under the design the way the Dynamics slip printed Contents and Width;
 * null on an older API or an unfilled product, and then simply not printed.
 *
 * @param {ReadonlyArray<{sku?: string, product_name?: string, colourway_name?: string|null,
 *   qty?: number|string, unit?: string|null, cut_requirements?: string|null,
 *   description?: string|null, composition?: string|null, width?: string|null,
 *   size?: string|null}>} [lines]
 * @returns {Array<{sku: string, design: string, colour: string, qty: number, unit: string,
 *   cut: string, description: string, composition: string, width: string, size: string}>}
 */
export function orderPackingSlipLines(lines = []) {
  return lines.map((line) => {
    const qty = Number(line?.qty)
    return {
      sku: line?.sku ?? '',
      design: line?.product_name ?? '',
      colour: line?.colourway_name ?? '',
      qty: Number.isFinite(qty) ? qty : 0,
      unit: UOM_LABELS[line?.unit] ?? '',
      cut: line?.cut_requirements ?? '',
      description: line?.description ?? '',
      composition: line?.composition ?? '',
      width: line?.width ?? '',
      size: line?.size ?? '',
    }
  })
}

/**
 * A delivery address as readable lines — the postal part only. The delivery
 * phone and instructions the office adds (`phone`, `instructions`) are printed
 * by the caller beneath these, because they are not lines of an address.
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
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])
  )

/**
 * The order date as the office writes one (17/09/2026), on the NEW ZEALAND
 * calendar. The timezone is stated rather than left to the printing machine:
 * an order taken at 9am in Auckland is still the previous day in UTC, so both
 * a laptop set to UTC and a slice of the ISO string would print yesterday.
 *
 * @param {string|null|undefined} value an ISO timestamp
 * @returns {string} '' when there is no usable date
 */
export function slipDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

// A labelled fact, omitted entirely when there is nothing to say — an empty
// "Client PO number:" reads as a missing number rather than as one that was
// never issued.
const factRow = (label, value) =>
  value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : ''

// The brand's token values (src/index.css), written out because the print
// window is a fresh document the CRM's stylesheet never reaches. Named as the
// tokens are, so a change there is a search away.
const INK = '#211b14' // --color-text-primary / --color-bg-inverse
const INK_SOFT = '#2c241b' // --color-text-secondary
const MUTED = '#867c71' // --color-neutral-800
const ACCENT = '#a57b55' // --color-pink-500, the wordmark's ochre
const ACCENT_DEEP = '#8b6746' // --accent-deep, the eyebrow
const WORDMARK_INK = '#63594e' // --color-neutral-900, --wordmark-ink
const PAPER = '#f9f4ed' // --color-bg-canvas
const ON_INVERSE = '#fcf9f6' // --color-text-on-inverse
const RULE = 'rgba(0, 0, 0, 0.1)' // --color-border-subtle

const wordmarkSvg = () =>
  `<svg class="wm" viewBox="${WORDMARK_VIEWBOX}" role="img" aria-label="Atelier Textiles" xmlns="http://www.w3.org/2000/svg">${WORDMARK_PATHS.map(
    (path) => `<path fill="${path.tone === 'accent' ? ACCENT : WORDMARK_INK}" d="${path.d}"/>`
  ).join('')}</svg>`

const lines = (parts) => parts.map((part) => esc(part)).join('<br>')

/**
 * The print-ready document, as a string.
 *
 * **`customer_po_number` is labelled "Client PO number" and nothing shorter.**
 * It is the PO the CLIENT issued to US; Atelier's own purchase orders are a
 * different record entirely (W13's `purchase_orders`), and a slip that says
 * plain "PO number" is one an operator will reconcile against the wrong book.
 *
 * **Invoice to is who the order is FOR; Deliver to is where it GOES**, and the
 * two differ routinely (invoiced to the designer, delivered to the
 * upholsterer). The platform keeps one address per order — the delivery — so
 * Invoice to prints the client as the order knows them: name, email, phone.
 *
 * @param {object} [order] an order as GET /admin/orders returns it
 * @returns {string}
 */
export function packingSlipHtml(order = {}) {
  const rows = orderPackingSlipLines(order.lines ?? [])
  const address = order.shipping_address && typeof order.shipping_address === 'object' ? order.shipping_address : {}
  const deliverTo = addressLines(order.shipping_address)
  const email = order.client_email ?? order.guest_email ?? ''

  const invoiceTo = [contactLabel(order), email !== contactLabel(order) ? email : '', order.contact_phone].filter(
    (part) => part && String(part).trim()
  )

  const deliverBlock =
    deliverTo.length > 0
      ? `<div class="addr">${lines(deliverTo)}${address.phone ? `<br>${esc(address.phone)}` : ''}</div>${
          address.instructions ? `<div class="instr">${esc(address.instructions)}</div>` : ''
        }`
      : '<div class="addr none">No delivery address recorded.</div>'

  const body = rows
    .map((row) => {
      const specs = [
        row.composition && `Contents: ${row.composition}`,
        row.width && `Width: ${row.width}`,
        row.size && `Size: ${row.size}`,
      ].filter(Boolean)
      return `<tr>
        <td class="mono code">${esc(row.sku)}</td>
        <td><div class="design">${esc(row.design)}${row.colour ? ` <span class="colour">${esc(row.colour)}</span>` : ''}</div>${
          row.description ? `<div class="desc">${esc(row.description)}</div>` : ''
        }${row.cut ? `<div class="note">${esc(row.cut)}</div>` : ''
        }${specs.length > 0 ? `<div class="spec">${lines(specs)}</div>` : ''}</td>
        <td class="mono num">${esc(row.qty.toFixed(2))}</td>
        <td class="uom">${esc(row.unit)}</td></tr>`
    })
    .join('')

  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><title>Packing Slip ${esc(order.order_number)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
      @page { size: A4; margin: 14mm 14mm 16mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Inter, sans-serif; color: ${MUTED}; } }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Inter, -apple-system, 'Segoe UI', sans-serif; color: ${INK}; font-size: 10pt; line-height: 1.45; margin: 0; }
      .sheet { max-width: 190mm; margin: 0 auto; padding: 10mm 0; }
      @media print { .sheet { padding: 0; } }
      .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12mm; padding-bottom: 5mm; border-bottom: 1.5pt solid ${INK}; }
      .wm { width: 58mm; height: auto; display: block; }
      h1 { margin: 0; font-size: 20pt; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
      h1 .no { color: ${ACCENT}; font-weight: 500; }
      .meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; margin-top: 5mm; }
      .company { color: ${INK_SOFT}; }
      .company strong { font-weight: 600; color: ${INK}; }
      .company .contact { margin-top: 2mm; color: ${MUTED}; }
      .facts { border-collapse: collapse; }
      .facts th { text-align: left; font-weight: 500; color: ${MUTED}; padding: 0 8mm 1mm 0; white-space: nowrap; }
      .facts td { text-align: right; font-weight: 500; padding: 0 0 1mm; }
      .lbl { font-size: 9pt; font-weight: 600; color: ${ACCENT_DEEP}; margin-bottom: 1.5mm; }
      .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 7mm; padding: 5mm 6mm; background: ${PAPER}; }
      .addr { font-size: 10.5pt; }
      .addr.none { color: ${MUTED}; font-style: italic; }
      .instr { margin-top: 2mm; font-weight: 600; }
      .terms { margin-top: 6mm; text-align: center; }
      .terms .lbl { margin-bottom: 1mm; }
      .terms p { margin: 0 auto; max-width: 170mm; font-size: 8.5pt; color: ${INK_SOFT}; }
      table.items { border-collapse: collapse; width: 100%; margin-top: 5mm; }
      .items th { background: ${INK}; color: ${ON_INVERSE}; text-align: left; font-size: 9pt; font-weight: 600; padding: 2mm 3mm; }
      .items td { padding: 3mm; border-bottom: 1px solid ${RULE}; vertical-align: top; }
      .items tr { break-inside: avoid; }
      .items .code { width: 34mm; font-size: 9pt; }
      .items .num { width: 22mm; text-align: right; }
      .items .uom { width: 18mm; }
      .items th.num { text-align: right; }
      .design { font-weight: 600; }
      .colour { font-weight: 400; color: ${INK_SOFT}; }
      .desc { margin-top: 1mm; font-size: 9pt; color: ${INK_SOFT}; white-space: pre-line; }
      .note { margin-top: 1mm; }
      .spec { margin-top: 1mm; font-size: 9pt; color: ${MUTED}; }
      .empty { color: ${MUTED}; font-style: italic; }
      footer { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid ${RULE}; display: flex; justify-content: space-between; font-size: 8pt; color: ${MUTED}; }
    </style></head><body><div class="sheet">
    <header class="top">
      ${wordmarkSvg()}
      <h1>Packing Slip <span class="no">${esc(order.order_number)}</span></h1>
    </header>
    <section class="meta">
      <div class="company">
        <strong>${esc(COMPANY.name)}</strong><br>${lines(COMPANY.lines)}
        <div class="contact">Phone ${esc(COMPANY.phone)} · Freephone ${esc(COMPANY.freephone)}<br>${esc(COMPANY.email)}</div>
      </div>
      <table class="facts"><tbody>
        ${factRow('Order number', order.order_number)}
        ${factRow('Date', slipDate(order.created_at))}
        ${factRow('Client reference', order.client_reference)}
        ${factRow('Client PO number', order.customer_po_number)}
      </tbody></table>
    </section>
    <section class="parties">
      <div><div class="lbl">Invoice to</div><div class="addr">${lines(invoiceTo)}</div></div>
      <div><div class="lbl">Deliver to</div>${deliverBlock}</div>
    </section>
    <table class="items">
      <thead><tr><th>Stock code</th><th>Description</th><th class="num">Quantity</th><th>UOM</th></tr></thead>
      <tbody>${body || '<tr><td colspan="4" class="empty">This order has no lines.</td></tr>'}</tbody>
    </table>
    <section class="terms">
      <div class="lbl">Packing slip terms</div>
      <p>${esc(PACKING_SLIP_TERMS)}</p>
    </section>
    <footer><span>${esc(COMPANY.name)} · ${esc(COMPANY.web)}</span><span>A packing slip carries no prices — the invoice is where the amounts are.</span></footer>
    </div></body></html>`
}

/**
 * Open the packing slip in a print window. Returns false when the pop-up was
 * blocked, so the caller can flash a hint rather than looking like it did
 * nothing — the same contract printPackingSlip has for a purchase order.
 *
 * Inter comes from Google Fonts, as it does for the CRM itself, so the dialog
 * waits for the page and its font to load; printing straight away put the first
 * slip of the day in the fallback face. It never waits long — a slow or blocked
 * font must not cost the office its print dialog.
 *
 * @param {object} order
 * @returns {boolean}
 */
export function printOrderPackingSlip(order) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(packingSlipHtml(order))
  w.document.close()
  let printed = false
  const print = () => {
    if (printed) return
    printed = true
    w.focus()
    w.print()
  }
  w.addEventListener('load', () => (w.document.fonts?.ready ?? Promise.resolve()).then(print, print))
  setTimeout(print, 1500)
  return true
}
