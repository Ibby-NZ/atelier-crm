// Report library (R-01…R-13) — the twelve standing reports from the build spec,
// plus R-13, which the client asked for by asking to click through to the orders.
// ALL FIGURES INDICATIVE (fake-for-now). Names, brands, ranges, territories and
// salespeople mirror the rest of the demo dataset (atelier.js / suppliers.js) so the
// library reads as one coherent world. Owner totals reconcile to reporting.stats
// (FY NZ$1.73M): Rebecca 642 · Jenette 589 · Charlotte 499 (NZ$k).

export const REPORT_GROUP_ORDER = ['Sales', 'Purchasing & goods', 'Operations']

// dims: [key, label][] — the "View" pills. periods: true → Month/YTD/FY pills apply.
export const REPORTS = [
  { key: 'owner', group: 'Sales', code: 'R-01', name: 'Sales per owner', desc: 'By salesperson — view by supplier, range or territory.', periods: true, dims: [['summary', 'Summary'], ['supplier', 'By supplier'], ['range', 'By range'], ['territory', 'By territory']] },
  { key: 'account', group: 'Sales', code: 'R-02', name: 'Sales per account holder', desc: 'By trade account — view by supplier or range.', periods: true, dims: [['summary', 'Summary'], ['supplier', 'By supplier'], ['range', 'By range']] },
  { key: 'brandtype', group: 'Sales', code: 'R-11', name: 'Sales by brand & product type', desc: 'By brand, by product type, or type within one brand.', periods: true, dims: [['brand', 'By brand'], ['type', 'By product type'], ['within', 'Type within brand']] },
  // periodDims: the Month/YTD/FY pills scale a year's figures down to a slice of it,
  // which is meaningless on a view whose columns ARE the years. Listing the two views
  // they apply to hides them on the third rather than leaving a live control that
  // silently does nothing.
  { key: 'designsales', group: 'Sales', code: 'R-12', name: 'Sales per design & colourway', desc: 'How much of one design has sold — by colourway, and across the years.', periods: true, periodDims: ['design', 'colourway'], dims: [['design', 'By design'], ['colourway', 'By colourway'], ['year', 'By year']] },
  { key: 'zerocost', group: 'Sales', code: 'R-03', name: 'Sales with zero cost', desc: 'Invoiced lines carrying no landed cost.', periods: false, dims: null },
  { key: 'margin', group: 'Sales', code: 'R-04', name: 'Margin exceptions', desc: 'Sales margin under 30% or over 70%.', periods: false, dims: null },
  { key: 'notinvoiced', group: 'Sales', code: 'R-05', name: 'Not invoiced · stock available', desc: 'Orders ready to bill — product on hand, invoice not raised.', periods: false, dims: null },
  // R-13 has NO fixture and never will: it is the platform's own order lines, and
  // the report every clickable row leads to. See LIVE_REPORTS in
  // utils/reportBuilders.js — before the API serves it the card draws the standard
  // "could not load" panel, which is the same answer any live report gives.
  { key: 'orders', group: 'Sales', code: 'R-13', name: 'Orders placed', desc: 'The orders behind the sales figures — one row per line, newest first.', periods: false, dims: null },
  { key: 'purchases', group: 'Purchasing & goods', code: 'R-06', name: 'Purchases report', desc: 'Committed purchase spend — view by supplier or range.', periods: true, dims: [['supplier', 'By supplier'], ['range', 'By range']] },
  { key: 'shipment', group: 'Purchasing & goods', code: 'R-07', name: 'Shipment report', desc: 'Open inbound consignments and their ETAs.', periods: false, dims: null },
  { key: 'inwards', group: 'Purchasing & goods', code: 'R-08', name: 'Inwards goods report', desc: 'Receipts against purchase orders, most recent first.', periods: false, dims: null },
  { key: 'delivery', group: 'Operations', code: 'R-09', name: 'Delivery details report', desc: 'Addresses, packing-slip instructions and dispatch.', periods: false, dims: null },
  { key: 'stock', group: 'Operations', code: 'R-10', name: 'Stock report', desc: 'Holdings, allocation and indicative valuation.', periods: false, dims: null },
]

// Period pills — factor scales the FY figures down to an indicative slice.
export const PERIODS = [
  { key: 'Month', label: 'Month · Jun', factor: 0.084 },
  { key: 'YTD', label: 'YTD', factor: 0.27 },
  { key: 'FY', label: 'FY2026', factor: 1 },
]

export const OWNERS = ['Rebecca', 'Jenette', 'Charlotte']

// R-01 summary — [name, thisYr, priorYr, yoy, up] (NZ$k FY)
export const ownerSummary = [
  ['Rebecca', 642, 562, '+14.2%', true],
  ['Jenette', 589, 536, '+9.8%', true],
  ['Charlotte', 499, 515, '−3.1%', false],
]

// Matrix rows — [label, sublabel, Rebecca, Jenette, Charlotte] (NZ$k FY).
// Columns sum to the owner totals above.
export const ownerBySupplier = [
  ['Pierre Frey', '', 146, 134, 112],
  ['Manuel Canovas', '', 106, 97, 81],
  ['de Le Cuona', '', 76, 68, 58],
  ['Rubelli Venezia', '', 68, 62, 52],
  ['Larsen', '', 58, 54, 45],
  ['Colefax & Fowler', '', 49, 45, 37],
  ['Jim Thompson', '', 37, 34, 28],
  ['All other suppliers', '', 102, 95, 86],
]

export const ownerByRange = [
  ['Cappuccino', 'Pierre Frey', 82, 74, 59],
  ['Giverny', 'Manuel Canovas', 67, 61, 49],
  ['Nature’s Opera', 'de Le Cuona', 57, 52, 42],
  ['Return to Arcadia', 'Rubelli Venezia', 53, 48, 38],
  ['Larsen 2024', 'Larsen', 45, 41, 33],
  ['All other ranges', '', 338, 313, 278],
]

export const ownerByTerritory = [
  ['Auckland', '', 292, 244, 176],
  ['Canterbury', '', 138, 134, 124],
  ['Wellington', '', 108, 106, 97],
  ['Otago / Queenstown', '', 64, 63, 64],
  ['Waikato / BoP', '', 40, 42, 38],
]

// R-02 — trade accounts (NZ$k FY). sup = split across the account-supplier columns.
export const ACCOUNT_SUPPLIER_COLS = ['P. Frey', 'M. Canovas', 'de Le Cuona', 'Rubelli', 'Other']
export const accounts = [
  { name: 'McKenzie & Willis', city: 'Christchurch', ty: 214, ly: 183, yoy: '+16.9%', up: true, sup: [48, 35, 25, 23, 83] },
  { name: 'Marlow & Finch Interiors', city: 'Ponsonby, Auckland', ty: 189, ly: 164, yoy: '+15.2%', up: true, sup: [43, 31, 22, 20, 73] },
  { name: 'Indigo House Studio', city: 'Wellington', ty: 96, ly: 88, yoy: '+9.1%', up: true, sup: [22, 16, 11, 10, 37] },
  { name: 'Coast & Co Design', city: 'Queenstown', ty: 84, ly: 91, yoy: '−7.7%', up: false, sup: [19, 14, 10, 9, 32] },
  { name: 'Maker Interiors', city: 'Auckland', ty: 61, ly: 54, yoy: '+13.0%', up: true, sup: [14, 10, 7, 6, 24] },
  { name: 'All other trade accounts', city: '', ty: 1086, ly: 1031, yoy: '+5.3%', up: true, sup: [246, 178, 127, 114, 421] },
]
export const ACCOUNT_RANGES = [['Cappuccino', 215], ['Giverny', 177], ['Nature’s Opera', 151], ['Return to Arcadia', 139], ['Larsen 2024', 119]]
export const FY_TOTAL = 1730
export const FY_TOTAL_PRIOR = 1613

// R-11 — NZ$k FY per brand × product type (matches reporting.byBrand FY / prev values).
export const brandTypes = [
  { brand: 'Pierre Frey', prev: 332.9, types: { Fabric: 268, Wallpaper: 74.6, 'Trims & passementerie': 27, 'Rugs & carpets': 22 } },
  { brand: 'Manuel Canovas', prev: 261.4, types: { Fabric: 208, Wallpaper: 51.1, 'Trims & passementerie': 25 } },
  { brand: 'de Le Cuona', prev: 188.2, types: { Fabric: 176.9, 'Finished goods': 25 } },
  { brand: 'Rubelli Venezia', prev: 190.6, types: { Fabric: 148.3, Wallpaper: 20, 'Trims & passementerie': 14 } },
  { brand: 'Larsen', prev: 142.05, types: { Fabric: 141.7, Wallpaper: 15 } },
  { brand: 'Colefax & Fowler', prev: 124.8, types: { Fabric: 92.4, Wallpaper: 27, 'Trims & passementerie': 12 } },
  { brand: 'Jim Thompson', prev: 108.9, types: { Fabric: 84.6, 'Finished goods': 14 } },
]
export const PRODUCT_TYPES = ['Fabric', 'Wallpaper', 'Trims & passementerie', 'Finished goods', 'Rugs & carpets']

// R-06 by supplier — [name, currencyNote, POs, metres, symbol, spendOrig(k), spendNZ$(k)]
export const purchasesBySupplier = [
  ['Pierre Frey', 'EUR', 14, 2840, '€', 96.0, 196.0],
  ['Manuel Canovas', 'GBP', 11, 2120, '£', 69.5, 142.0],
  ['de Le Cuona', 'GBP', 8, 1480, '£', 38.6, 92.0],
  ['Rubelli Venezia', 'EUR', 9, 1760, '€', 44.0, 90.0],
  ['Larsen', 'GBP', 6, 1180, '£', 32.4, 77.0],
  ['Colefax & Fowler', 'GBP', 5, 820, '£', 27.1, 64.0],
  ['Jim Thompson', 'USD', 4, 690, 'US$', 27.4, 49.0],
]

// R-06 by range — [range, supplier, metres, spendNZ$(k)]
export const purchasesByRange = [
  ['Cappuccino', 'Pierre Frey', 980, 68.4],
  ['Giverny', 'Manuel Canovas', 760, 52.1],
  ['Nature’s Opera', 'de Le Cuona', 520, 44.7],
  ['Return to Arcadia', 'Rubelli Venezia', 480, 38.2],
  ['Larsen 2024', 'Larsen', 350, 24.9],
  ['All other ranges', '—', 7800, 481.7],
]

// R-07 — [po, poSub, supplier, routing, eta, outstanding, value, status, tone]
export const shipments = [
  ['PO-2026-0142', 'origin SO-2026-0418', 'Pierre Frey', 'Mainfreight Air · FCA Paris', '02 Jul', '20.0 m', '€980', 'Part-received', 'clay'],
  ['PO-2026-0147', '', 'Manuel Canovas', 'Mainfreight Air · FCA Paris', '12 Jul', '240.0 m', '£12,140', 'In transit', 'muted'],
  ['PO-2026-0151', '', 'de Le Cuona', 'DHL Global Forwarding · FCA London', '18 Jul', '96.0 m', '£3,640', 'In transit', 'muted'],
  ['PO-2026-0153', '', 'Rubelli Venezia', 'Mainfreight Air · FCA Venice', '03 Aug', '180.0 m', '€6,220', 'Booked', 'muted'],
  ['PO-2026-0156', '', 'Jim Thompson', 'Mainfreight Air · FOB Bangkok', '09 Aug', '44.0 m', 'US$7,890', 'Booked', 'muted'],
]

// R-08 — [date, po, line, sku·brand, received, balance, isPart]
export const inwardsGoods = [
  ['24 Jun', 'PO-2026-0142', 'Cappuccino Chenille — Crème', 'PF-CAP-02 · Pierre Frey', '15.0 m', '5.0 m', true],
  ['14 Jun', 'PO-2026-0142', 'Cappuccino Chenille — Noisette', 'PF-CAP-04 · Pierre Frey', '25.0 m', '15.0 m', true],
  ['14 Jun', 'PO-2026-0142', 'Cappuccino Chenille — Écru', 'PF-CAP-01 · Pierre Frey', '30.0 m', '0.0 m', false],
  ['05 Jun', 'PO-2026-0138', 'Giverny Print — Jardin', 'MC-GIV-02 · Manuel Canovas', '60.0 m', '0.0 m', false],
  ['29 May', 'PO-2026-0135', 'Nature’s Opera — Stone', 'DLC-NOP-03 · de Le Cuona', '42.0 m', '0.0 m', false],
  ['21 May', 'PO-2026-0131', 'Return to Arcadia — Verde', 'RUB-ARC-03 · Rubelli Venezia', '38.0 m', '0.0 m', false],
]

// R-03 — [so, date, client, line, sku·brand, qty, sell, reason]
export const zeroCostLines = [
  ['SO-2026-0421', '28 Jun', 'Maker Interiors', 'Larsen 2024 — Leaf', 'LAR-2024-07 · Larsen', '9.0 m', 'NZ$1,406', 'New range — Supplier Discounted Price not loaded'],
  ['SO-2026-0407', '19 Jun', 'Indigo House Studio', 'Silk Ikat — Mist', 'JT-IKA-01 · Jim Thompson', '4.5 m', 'NZ$1,134', 'Manual line — cost missing'],
  ['SO-2026-0398', '11 Jun', 'Coast & Co Design', 'Nature’s Opera — Pebble', 'DLC-NOP-02 · de Le Cuona', '12.0 m', 'NZ$2,148', 'Cost pending duty code (wool · code A)'],
]

// R-04 — [so, date, client, line, sku·brand, sell/m, cost/m, margin, isOver]
export const marginExceptions = [
  ['SO-2026-0402', '24 Jun', 'McKenzie & Willis', 'Cappuccino Chenille — Noir', 'PF-CAP-06 · Pierre Frey', 'NZ$128.40', 'NZ$104.60', '18.5%', false],
  ['SO-2026-0396', '17 Jun', 'Marlow & Finch Interiors', 'Giverny Print — Ivoire', 'MC-GIV-01 · Manuel Canovas', 'NZ$96.20', 'NZ$71.80', '25.4%', false],
  ['SO-2026-0388', '09 Jun', 'Coast & Co Design', 'Return to Arcadia — Wheat', 'RUB-ARC-02 · Rubelli Venezia', 'NZ$189.00', 'NZ$48.90', '74.1%', true],
  ['SO-2026-0379', '02 Jun', 'Indigo House Studio', 'Silk Ikat — Ink', 'JT-IKA-03 · Jim Thompson', 'NZ$252.00', 'NZ$61.30', '75.7%', true],
]

// R-05 — [so, date, client, line, sku·brand, qty, onHand, value, status, tone]
export const notInvoicedLines = [
  ['SO-2026-0413', '24 Jun', 'McKenzie & Willis', 'Cappuccino Chenille — Écru', 'PF-CAP-01 · Pierre Frey', '18.0 m', '30.0 m', 'NZ$2,774.70', 'Ready — not invoiced', 'sage'],
  ['SO-2026-0409', '19 Jun', 'Indigo House Studio', 'Giverny Print — Jardin', 'MC-GIV-02 · Manuel Canovas', '22.0 m', '60.0 m', 'NZ$2,648.80', 'Ready — not invoiced', 'sage'],
  ['SO-2026-0418', '28 Jun', 'Marlow & Finch Interiors', 'Nature’s Opera — Stone', 'DLC-NOP-03 · de Le Cuona', '12.0 m', '12.0 m', 'NZ$2,115.60', 'Partial — line 2 of 3', 'clay'],
]

// R-09 — [so, client, deliverTo, instructions, method, methodSub, dispatch, flag]
export const deliveryLines = [
  ['SO-2026-0418', 'Marlow & Finch Interiors', 'Site — 14 Arney Cres, Remuera', 'Deliver to site rear, contact Olivia on arrival.', 'Courier — NZ', '', '08 Jul', ''],
  ['SO-2026-0415', 'Coast & Co Design', 'Villa Mirage, Jumeirah — Dubai', 'Supplier ships direct — freight removed from landed cost.', 'Drop-ship · DHL Intl', 'Pierre Frey, Paris → Dubai', '11 Jul', 'Excl. shipping'],
  ['SO-2026-0409', 'Indigo House Studio', 'Studio — 7 Holland St, Wellington', 'Hold for Friday install.', 'Mainfreight', '', '10 Jul', ''],
  ['SO-2026-0405', 'McKenzie & Willis', 'Store — 191 High St, Christchurch', 'Consolidate with the monthly order.', 'Mainfreight', '', '15 Jul', ''],
]

// R-10 — [sku, line, brand, onHand, allocated, available, landed/m, value, flagged]
export const stockLines = [
  ['PF-CAP-01', 'Cappuccino Chenille — Écru', 'Pierre Frey', '30.0', '18.0', '12.0', 'NZ$104.60', 'NZ$3,138', false],
  ['PF-CAP-04', 'Cappuccino Chenille — Noisette', 'Pierre Frey', '25.0', '14.0', '11.0', 'NZ$104.60', 'NZ$2,615', false],
  ['DLC-NOP-03', 'Nature’s Opera — Stone', 'de Le Cuona', '12.0', '12.0', '0.0', 'NZ$118.20', 'NZ$1,418', true],
  ['MC-GIV-02', 'Giverny Print — Jardin', 'Manuel Canovas', '60.0', '22.0', '38.0', 'NZ$71.80', 'NZ$4,308', false],
  ['RUB-ARC-03', 'Return to Arcadia — Verde', 'Rubelli Venezia', '38.0', '9.0', '29.0', 'NZ$62.40', 'NZ$2,371', false],
  ['LAR-2024-07', 'Larsen 2024 — Leaf', 'Larsen', '9.0', '9.0', '0.0', '—', '—', true],
]
export const STOCK_VALUATION = 'NZ$13,850'

// ---- R-12 sales per design & colourway ---------------------------------------
//
// The client's ask verbatim: "a sales report on a product/stock (with colour) — how
// much is sold on a product (example: Nuage Ciel), then per year". Every other sales
// report here stops at the range; this one is the only grain that can answer it,
// because the colourway is the unit Atelier actually sells and Ciel is a colourway,
// not a design.
//
// `years` is [FY2024, FY2025, FY2026] in NZ$k, held ONLY at colourway grain — design
// and year totals are summed in utils/reportBuilders.js, never stored a second time
// beside them. A stored total is a duplicate of the same fact and the two drift the
// first edit; on the one report whose whole purpose is "does the colour add up to the
// design", a total that disagrees with its own rows is the worst thing it could show.
//
// Reconciliation (asserted by reportBuilders.test.js), so this sits inside the same
// world as the rest of the file rather than beside it:
//   · design FY2026 totals equal that design's row in ownerByRange / ACCOUNT_RANGES
//     (Cappuccino 215, Giverny 177, Nature's Opera 151, Return to Arcadia 139,
//     Larsen 2024 119); Nuage and Silk Ikat come out of "All other ranges".
//   · every design sits under its brand's product-type figure in `brandTypes`
//     (Nuage is 62 of Pierre Frey's 74.6 wallpaper, not of its fabric).
//   · all designs + OTHER_DESIGNS reconcile to FY_TOTAL / FY_TOTAL_PRIOR.
// `rate` is the indicative sell per unit lifted from that design's OWN line in
// R-03/R-04/R-05 above (e.g. Silk Ikat NZ$252.00/m from marginExceptions), so the
// quantity column and the money column cannot tell two different stories.
export const SALES_YEARS = ['FY2024', 'FY2025', 'FY2026']

export const designSales = [
  {
    design: 'Cappuccino Chenille', brand: 'Pierre Frey', range: 'Cappuccino',
    type: 'Fabric', unit: 'm', rate: 154,
    colourways: [
      { sku: 'PF-CAP-01', name: 'Écru', hex: '#EFE7D8', years: [58, 66, 74] },
      { sku: 'PF-CAP-02', name: 'Crème', hex: '#E8DCC4', years: [41, 47, 53] },
      { sku: 'PF-CAP-04', name: 'Noisette', hex: '#B99A6B', years: [39, 44, 50] },
      { sku: 'PF-CAP-06', name: 'Noir', hex: '#3A3733', years: [30, 34, 38] },
    ],
  },
  {
    design: 'Giverny Print', brand: 'Manuel Canovas', range: 'Giverny',
    type: 'Fabric', unit: 'm', rate: 120,
    colourways: [
      { sku: 'MC-GIV-01', name: 'Ivoire', hex: '#F2ECDD', years: [52, 57, 62] },
      { sku: 'MC-GIV-02', name: 'Jardin', hex: '#6E8B5B', years: [61, 67, 73] },
      { sku: 'MC-GIV-04', name: 'Bleu', hex: '#4E6E8E', years: [36, 39, 42] },
    ],
  },
  {
    design: 'Nature’s Opera', brand: 'de Le Cuona', range: 'Nature’s Opera',
    type: 'Fabric', unit: 'm', rate: 176,
    colourways: [
      { sku: 'DLC-NOP-02', name: 'Pebble', hex: '#C9C1B4', years: [44, 50, 57] },
      { sku: 'DLC-NOP-03', name: 'Stone', hex: '#A9A296', years: [47, 53, 59] },
      { sku: 'DLC-NOP-05', name: 'Flax', hex: '#D6C39A', years: [27, 31, 35] },
    ],
  },
  {
    design: 'Return to Arcadia', brand: 'Rubelli Venezia', range: 'Return to Arcadia',
    type: 'Fabric', unit: 'm', rate: 189,
    colourways: [
      { sku: 'RUB-ARC-02', name: 'Wheat', hex: '#D9C08A', years: [52, 54, 55] },
      { sku: 'RUB-ARC-03', name: 'Verde', hex: '#5F7A55', years: [49, 51, 52] },
      { sku: 'RUB-ARC-06', name: 'Cobalto', hex: '#2F4C7E', years: [30, 31, 32] },
    ],
  },
  {
    design: 'Larsen 2024', brand: 'Larsen', range: 'Larsen 2024',
    type: 'Fabric', unit: 'm', rate: 156,
    // The range opened in FY2025 (nil FY2024, not a missing figure) and Ochre was
    // added to it in FY2026 — so this design is where both "no prior year" shapes
    // actually occur, and the YoY column has to say New rather than divide by nought.
    colourways: [
      { sku: 'LAR-2024-07', name: 'Leaf', hex: '#7E8E5C', years: [0, 42, 60] },
      { sku: 'LAR-2024-03', name: 'Ash', hex: '#9A9690', years: [0, 32, 44] },
      { sku: 'LAR-2024-11', name: 'Ochre', hex: '#C08A3E', years: [0, 0, 15] },
    ],
  },
  // The client's own example. Pierre Frey's NUAGES is a vinyl WALLPAPER on the 2026
  // price list (FP562), so it is sold by the roll — which is exactly why the by-design
  // view carries no quantity column: metres and rolls do not add.
  {
    design: 'Nuage', brand: 'Pierre Frey', range: 'Nuage',
    type: 'Wallpaper', unit: 'rolls', rate: 620,
    colourways: [
      { sku: 'PF-NUA-01', name: 'Ciel', hex: '#A8C6DE', years: [26, 28, 31] },
      { sku: 'PF-NUA-03', name: 'Brume', hex: '#CFD6D8', years: [17, 18, 19] },
      { sku: 'PF-NUA-06', name: 'Ardoise', hex: '#5A6570', years: [11, 12, 12] },
    ],
  },
  {
    design: 'Silk Ikat', brand: 'Jim Thompson', range: 'Silk Ikat',
    type: 'Fabric', unit: 'm', rate: 252,
    colourways: [
      { sku: 'JT-IKA-01', name: 'Mist', hex: '#CBD3D6', years: [28, 29, 31] },
      { sku: 'JT-IKA-03', name: 'Ink', hex: '#2B3340', years: [26, 27, 28] },
      { sku: 'JT-IKA-05', name: 'Saffron', hex: '#D9A441', years: [17, 18, 19] },
    ],
  },
]

// The rest of the catalogue as one row, the way `ownerByRange` carries "All other
// ranges": the report has to reconcile to the FY total, and seven designs plus a
// stated remainder is honest where 200 invented designs would not be.
export const OTHER_DESIGNS = { label: 'All other designs', years: [796, 783, 789] }
