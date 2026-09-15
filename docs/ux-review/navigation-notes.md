# Keyboard and detail navigation notes

Branch: `fix/keyboard-and-back-links`.

## Proposed CLAUDE.md bullets

- Use a native React Router `Link` for navigation rows. Dashboard recent orders
  retain `recentOrderLink(order)` and inbound purchase orders retain
  `purchaseOrderRoute(po.id)`; changing the element must not change the list or
  filter behind the figure. Keep the existing row grid and hover treatment.
- Report Library selection controls are native `button type="button"` elements
  with `aria-pressed`, including the fixture-only Period / View / Brand / Design
  pills. Keep `selectReport` and its applied URL filters intact. A selection must
  not apply a typed draft or replace the existing URL-update semantics.
- Detail pages put an explicit list `Link` in `PageHeader`'s eyebrow slot, beside
  any source label such as `live` or `from Dynamics`. Do not use browser history
  for that return: details can be opened from Dashboard, another record, or a
  bookmark. Existing loading/error/not-found Back controls use the same list.
- The Dynamics client detail returns to `/clients/legacy`. `/clients` is the
  live account roster. Keep that distinction in every existing return state.
- Insight's return uses its existing `libraryHref`: R-11 with the current
  reporting context, excluding subject pins the library cannot represent.
- Live filter forms use shared `Field` labels, native `Select`, and `inputStyle`
  or its compact `cellInput` variant. Keep filter drafts, submission timing,
  finance gating, and numeric/date values unchanged. Fixture-only controls
  receive native keyboard access, with no other polish.

## Detail destinations

| Screen | Header return | Other existing Back states |
| --- | --- | --- |
| `AdminPurchaseOrder.jsx` | `/admin/purchase-orders` | Not found uses the same list; loading/error previously had no Back. |
| `AdminSupplierInvoice.jsx` | `/admin/supplier-invoices` | Not found uses the same list; loading/error previously had no Back. |
| `ClientAccount.jsx` | `/clients/legacy` | Loading, error, and not found all return to the mirror list. |
| `SalesOrder.jsx` | `/sales-orders` | Loading, error, and both not-found links keep the same destination. |
| `ReportInsight.jsx` | `/reporting/library?r=brandtype` plus current context | Header remains available during loading/error and an access refusal. |

The old standalone mirror header links and Insight's secondary library link were
moved into the eyebrow. The existing Dynamics provenance badges remain in place.
No back-link or label questions remain outstanding after parent review.

## Form integration for the parent

The parent supplied `1ff9110` after the navigation pass. Its exact shared patch
was adopted separately as `f8189fb`, after tests and build, and supplies `Select`
plus the optional `HeaderRow` props. **Skip `f8189fb` during integration**: the
parent already has the same primitive patch in `f606e00`. No additional edits
were made to `parts.jsx` or the supplied `forms-notes.md`.

Both live selects now use the shared component:

| Screen | Control | Preserved behavior |
| --- | --- | --- |
| `ReportLibrary.jsx` | Live Category filter | `filterDraft.category`, `setFilter('category')`, the empty All option, `REPORT_CATEGORIES`, and `{ ...filterControl, minWidth: 130 }`. |
| `AdminSupplierInvoice.jsx` | Invoice Status | `headerDraft.status ?? ''`, `busy`, `setHeaderField('status')`, `aria-label="Status"`, and `SUPPLIER_INVOICE_STATUSES` / `STATUS_LABELS`. |

Report Library's live bar uses shared `Field` and 34px `cellInput` defaults with
`width: 'auto'`; Apply/Clear use the same height. Per parent review, there is no
local outline override: focus treatment belongs to the parent's global
focus-visible rules. Existing specific widths and category options remain.
Invoice matching search fields use visible shared labels as their accessible
names and retain the existing input styles. Invoice Status takes `Select`'s
`inputStyle` defaults. Purchase-order forms already use shared fields and input
styles. The other assigned screens have no local form controls to migrate.

## Verification and limits

- Read `CLAUDE.md` in full before inspecting screen headers and tests. Checked
  the purchase-order, supplier-invoice, and Dynamics source-scan assertions
  before editing; kept them unchanged.
- Ran `npm test` followed by `npm run build` before every commit. Each test run
  passed all 71 files / 1,544 tests; every build completed successfully.
- Existing decision coverage includes Dashboard targets, purchasing and invoice
  rules, report filter round-trips, live report links, and Insight context. No
  decision logic changed, so no new styling or implementation-mirroring tests
  were added. Vitest remains pure; no dependencies were added.
- Builds still report the existing main-chunk size warning. npm reports the
  environment's existing `http-proxy` configuration warning.
- The parent has the before captures at 1440 and 1024. No browser after-captures
  or keyboard run was performed in this branch. The QA API was unavailable and
  the backend absent, so live-data rendering and writes were not exercised.
  Parent QA should compare both widths, Tab/Enter through Dashboard rows,
  Tab/Enter/Space through rail and pill buttons, and verify the return URLs and
  applied reporting context.
- Owned changes affect only the seven assigned screen files and this note. The
  separately adopted shared patch also brings `src/admin/parts.jsx` and
  `docs/ux-review/forms-notes.md`. `CLAUDE.md`, routes, navigation/tab labels, API
  helpers, and dependencies were not edited.
