# Atelier CRM UI/UX review

> Iteration 1 record. The [page navigation iteration](v2/HANDOVER.md) supersedes its navigation decisions and contains the current verification and delivery notes.

The supplied source now has shared confirmations, visible keyboard focus, native keyboard navigation, consistent live form controls and clearer inline editors. Existing API contracts, access rules, design tokens and navigation destinations are retained.

## Changes

| Area | Result |
| --- | --- |
| Confirmation | All nine native confirms use ConfirmDialog; the Users email prompt is a labelled inline editor. Original confirmation bodies are preserved. Cancel receives focus, Tab stays in the dialog, dismissal restores focus, and busy deletes cannot be dismissed. Existing 409 blockers and Archive instead rules stay in the delete kit. |
| Users | Temporary credentials remain in a dismissible notice. Email refusals keep the typed value and show one inline API error. Cancel, Escape and successful save restore focus to the current account button even after the roster reloads. |
| Feedback | Applicants reload both queue sources before success feedback. Xero distinguishes a failed load from an unconfigured connection. Success toasts announce politely and allow clicks through to covered controls. Userback no longer sends a fabricated identity. |
| Keyboard | Dashboard navigation rows are links; report selection controls are buttons with pressed state. A shared brass focus ring covers links, buttons, fields and row toggles. |
| Forms | Live selectors use the native Select primitive in parts.jsx. Shared Field/input styles replace drifted local controls; audited numeric exceptions use existing mono tokens, right alignment and missing-value conventions. Demo form consumers remain intact. |
| Detail orientation | Existing PageHeader eyebrows link back to purchase orders, supplier invoices, historical clients, historical orders and the contextual report library. No route was moved or renamed. |
| Dense lists | Orders, supplier rates and stock have sticky list headers. Products, Orders and supplier rates retain inline editors with an accent rule, surface background and sticky Save/Cancel actions. |

CLAUDE.md records the new shared conventions. The adjacent workstream notes provide the per-screen audit; their integration notes describe intermediate branches and are superseded by this handover and the final evidence report.

## Verification

The original baseline passed 1,544 tests in 71 files. The current implementation passes 1,552 tests in 73 files and the Vite production build. No existing source-scan tests were rewritten to conceal a failed invariant. The build retains its original large-chunk warning.

Browser verification passed 44 scenarios at 1440 and 1024, plus both Users Cancel/Escape checks after a roster reload, and all 12 requested sticky-header/footer checks. Two delete/archive cases were rerun after removing an unrelated email-focus assertion accidentally inserted into the harness; no production change was needed for those reruns. Raw runs are preserved. Products and Rates now match their original document widths at both sizes.

Before/after evidence includes 42 live/mirror routes with API-error states, plus 15 populated screens at both widths with full-page and viewport images. See evidence/REPORT.md for the screenshot index, exact checks, failed-baseline controls and corrected regression evidence.

The review uses isolated synthetic API fixtures. No atelier-api server, migrated database or staff seed was supplied. Browser checks therefore establish client behaviour for the recorded responses, not real authorization, database constraints, mail delivery, Xero/OAuth or transaction durability. Camera/iPad hardware was not exercised. External fonts were unavailable; before and after captures use the same fallback fonts.

No dependencies were added. API helpers, declared field lists, finance/auth modules, routing/navigation definitions, design tokens, src/data and src/store are unchanged. The only demo-facing changes come from shared chrome and the specifically requested report keyboard controls. Existing cramped/clipped Users and Products layouts at 1024 remain documented; the responsive layer was not widened.

## Review and integration

The input ZIP contains no Git history or remote. An untouched local master baseline was imported, then changes were committed by screen and concern with npm test followed by npm run build before every commit. The delivery contains the revised source and an ordered conventional-commit patch series. No remote pull requests have been opened.

Apply the patches to a clean checkout matching the supplied archive, in numerical order, and review the screen/concern commits as successive PRs into master. Shared primitives precede their consumers. The included baseline is a local import identifier, not a claim about the upstream master commit. See patches/README.md and the screenshot index in evidence/REPORT.md.

Do not treat the combined delivery as a request for one large restyling PR. Follow-up focus and sizing fixes belong with their original concerns when preparing the corresponding PRs. Run the real test/build gates and connected API checks in that repository before merging.

## Decisions left for the client

| Decision | Proposed choice | Preserved until approval |
| --- | --- | --- |
| Catalogue landing | Open Products at /admin/products; keep Library reachable as its existing tab. | /catalogue |
| Reporting landing | Open /reporting/library, with its existing live/fixture distinction. | /reporting |
| Showroom Samples | Remove the duplicate top-level entry and retain the Sample orders tab and redirect. | Existing top-level entry |
| Header search | Hide it until live search exists; an explicit demo label is the alternative. | Existing label and /search destination |

No copy requested verbatim by the client, director/finance action, route/tab/nav label, dependency, drawer/modal editing pattern or responsive breakpoint was changed without approval.

The brief's API/product debts remain outside this implementation: colourway selection/deletion, real stock par alerts, live report export wiring, server-side Orders kind filtering, sales-rep scoping and region reporting. No client-side substitute was invented. Userback's fake identity was removed using the brief's permitted option; authenticated identity integration is still outstanding if named feedback threads are required.
