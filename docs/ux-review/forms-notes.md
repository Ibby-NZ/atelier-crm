# Live form controls

- Scope: `fix/live-form-controls`; shared `src/admin/parts.jsx` and owned live screen JSX only. Read CLAUDE.md in full and screen headers/test twins before edits; current headers identify PriceListImport, PricingWaterfall and SampleScanner as live.
- Select is a native `<select>` with `inputStyle` defaults and caller styles applied last, including `cellInput` / `monoCellInput`. All ordinary native props, children, event handlers and ARIA attributes pass through. No hooks, ref API or dependencies added.
- `GhostButton` forwards remaining native props before its known fields, so ARIA labels/expanded/control relationships reach the button; no ref forwarding.
- `HeaderRow` accepts opt-in `sticky=false` and `numeric=[]`: sticky adds `position: sticky`, `top: 62`, `zIndex: 2`; listed column indices align right. No global sticky change, overflow change or Pagination hooks.
- Preserve the existing 11px Field labels, 12px `sectionLabel` panel heads and 9.5px table labels. Keep existing responsive widths and business/API behavior.
- Baseline context supplied by parent: screenshots of all 42 live/mirror routes at 1440/1024; backend absent. Test/build verification cannot establish live API or camera behavior.
- Every commit is gated by `npm test` followed by `npm run build`. Per-screen notes below record the changes and the numeric-cell audit.

- `AdminCollections.jsx`: Migrate both house selectors; use the shared 34px cell control for the compact filter instead of its drifted 32px height; keep the existing filter name and Field association. Numeric audit: the list has no quantity/money columns; server product-count prose stays unchanged.

- `AdminOrderNew.jsx`: Use Select and an associated 11px Field for Sales rep instead of a section heading. Numeric audit: line cells belong to the shared OrderLinesEditor outside this file; no new calculations.

- `AdminProductSheet.jsx`: Migrate the house picker with its existing Field; remove redundant default style. Numeric audit: summary counts and row-number prose keep the existing formatting and server values.

- `AdminPurchaseOrderNew.jsx`: Migrate the house picker. Numeric audit: right-align the existing mono quantity and unit-price inputs and their headers in goods/sample rows; preserve blank prices, free samples and supplier-currency amounts.

- `AdminPurchaseOrders.jsx`: Migrate status/house filters and share compact input styles. Numeric audit: align the Quantities column/header right; keep qtyText, outstandingLabel, real over-receipts and server receipt state unchanged.

- `AdminSupplierInvoiceNew.jsx`: Migrate the supplier picker, retaining its accessible name and Field. Numeric audit: this is a form, not a numeric list; preserve every supplier-currency/FX draft, optional blank and validation rule.

- `AdminSupplierInvoices.jsx`: Migrate supplier/status filters and share compact input styles. Numeric audit: right-align money columns and their headers; retain existing mono font, server masking, null/unpriced messages, supplier currency and signed variance handling.

- `AdminReserveNew.jsx`: Migrate Kind/CFA controls and normalize compact line inputs from 32px to shared 34px cellInput. Numeric audit: Qty and Copies inputs now use the existing mono treatment and right alignment; snapshot fields and body-building rules stay unchanged.

- `AdminReserveReport.jsx`: Migrate the supplier picker with the standard form-input height. Numeric audit: apply mono/right alignment to the quantity column and header; keep API quantities and copy markers verbatim, without computing totals.

- `AdminReserves.jsx`: Migrate Kind/Status/Supplier/CFA selectors and normalize 32px editor controls to shared cellInput. Numeric audit: right-align the existing mono quantity column and header; keep quantityLabel null/copy semantics and server expiry unchanged.

- `AdminSampleLoans.jsx`: Migrate the tri-state overdue picker; retain its existing accessible name and compact size. The composer already uses the existing 11px form-label format. Numeric audit: reminder/overdue counts are contextual prose from tested helpers, not numeric cells; preserve their meaning.

- `AdminSampleOrders.jsx`: Migrate both list filters and the showroom/supplier form controls; retain existing accessible labels, compact filter sizes and 11px Field labels. Numeric audit: list columns are request/showroom/status/date, with no quantity or money cells.

- `AdminSamples.jsx`: Migrate all six selectors, preserving the full list-status vocabulary, writable form-status vocabulary, tri-state overdue values and existing names/Field associations. Numeric audit: recorded costs are inline contextual text; preserve null/free/withheld distinctions and supplier currency.

- `AdminSuppliers.jsx`: Migrate the discount-method selector; use sectionLabel for Aliases and Houses invoiced panel heads. Numeric audit: right-align the existing mono terms/tier column while preserving per-value finance masking, method descriptions and every formatter.

- `SupplierTermsPanel.jsx`: Migrate both house selectors and reuse cellInput for compact controls. Numeric audit: align net multipliers and tier percentages right; retain the finance refusal, null formatters and server-resolved discount chains.

- `SupplierContactsPanel.jsx`: Migrate the contact-method selector, keeping the existing Field association and accessible name. Numeric audit: this panel lists contact text and dates, with no amount/quantity cells; append-only contact-log behavior stays unchanged.

- `AdminFreight.jsx`: Migrate all seven selectors with existing Field associations or filter names. Numeric audit: right-align the rate column/header while keeping its mono formatter, per-pack units, percentages and append-only ledger unchanged.

- `PriceListImport.jsx`: Migrate the category fallback selector, preserving its Field label and optional blank. Numeric audit: rate-change and import-row counts are contextual prose produced by tested helpers; retain currency transitions, zero-rate skip rules and finance masking.

- `PricingWaterfall.jsx`: Replace the hand-styled house select and rail inputs with shared Select/monoCellInput defaults; use the existing 11px form-label format and sectionLabel for the reference panel heading. Numeric audit: waterfall values already use mono/right alignment; preserve missing-step dashes, supplier currency and every finance/what-if rule.

- `AdminShipping.jsx`: Numeric audit: align the quantity-floor cell, rate input and corresponding headers right; retain the existing mono font and cents/draft formatting. Fields and panel heads already meet the shared label standard; no select to migrate.

- `PricingParameters.jsx`: Numeric audit: align the six mono parameter columns and their headers right, including dimmed/unknown values. This read-only finance-gated reference keeps its existing null, unknown-freight and duty-band formatting; no new calculations or controls.
- Audited without edits: `SampleScanner.jsx` already uses Field/inputStyle/PanelHead, has no native select or numeric list, and keeps camera/wedge behavior intact. `AdminLetterTemplates.jsx` and `AdminShowrooms.jsx` already use 11px form labels and shared panel heads; their lists contain text/date records and count prose, not numeric cells needing alignment.
