# Atelier CRM: page navigation iteration

This second iteration makes the working screens individual sidebar destinations and gives the dashboard and order desks a clearer layout. It retains the first iteration's confirmations, focus treatment, form controls, feedback fixes and inline editors.

## What changed

| Area | Result |
| --- | --- |
| Page navigation | 37 existing destinations are organised in the sidebar. Sales orders, Purchase orders and Supplier invoices remain directly visible. Other groups open for their current page and can be operated by keyboard. |
| Page space | Horizontal section strips are removed. Compact operations headers contain the existing create actions. The working area gains 48px of width at 1440px. Existing URLs, redirects and deep links remain intact. |
| Dashboard | Separate KPI cards and framed recent-order/inbound queues establish a clearer hierarchy. Loading and unavailable notes keep the panels understandable. All metrics, links, indicative labels and masking remain unchanged. |
| Sales orders | Persistent filter labels, grouped queue controls, clearer document/client identity, and wrapping row actions. Existing source coverage notes, filter handlers and sticky editor controls remain. |
| Purchase orders | The records dominate the page. Demand planning occupies a compact, initially closed disclosure above the list, keeping it discoverable on long pages. Planning still precedes generation; an API refusal remains visible even if the disclosure closes. |
| Supplier invoices | Document and supplier identity are grouped together. Allocation information sits beside status. Total, unallocated and variance retain distinct, right-aligned columns; the server's finance masking remains authoritative. |
| Keyboard | Exact current-page indication, native sidebar disclosures, a skip link, and phone navigation with focus containment, Escape and focus return. Historical and demo destinations are labelled. |

Your request authorises this navigation restructure. Catalogue and Reporting now expose their existing pages through sidebar groups; their former demo destinations remain reachable. Sample orders has one home under Samples, while the Showroom Samples redirect remains. Both existing Orders create actions remain available across the working order pages; a create form omits its own link. No URLs were renamed.

## Verification

- `npm test`: **1,585 passing tests in 74 files**. This includes 33 new navigation/action tests. No existing source-scan assertions were weakened.
- `npm run build`: passed. The existing large-chunk warning remains.
- Browser checks: **22 passing navigation, action, keyboard and disclosure scenarios**, **10 passing layout comparisons**, and **12 passing sticky-header/footer checks**.
- Screenshots: 28 views at 1440×1000 and 1024×1000, with viewport and full-page captures before and after: **224 PNGs** in the main comparison set.
- Independent code review found no outstanding critical or important issues. Both identified navigation edge cases were fixed and verified.
- Source audit: no unused imports in the 11 changed JavaScript/JSX files. The four screens' loading, filter and mutation logic is unchanged. API helpers, auth/capabilities, declared field lists, routing, design tokens, dependencies, demo data and stores are unchanged.

The verified application revision is `bb8a37f1659342824852299bb0c039dcf822237e`, compared with iteration 1 at `6f22dab424e71c38beb47256f920bb8526cbe7df`. The final documentation commit changes no application code.

### Measured first-viewport rows

Complete rows at 1000px viewport height; counts alone do not establish readability.

| Page | 1440px before → after | 1024px before → after |
| --- | ---: | ---: |
| Sales orders | 5 → 5 | 2 → 3 |
| Purchase orders | 6 → 7 | 2 → 4 |
| Supplier invoices | 6 → 6 | 5 → 4 |
| Products | 4 → 6 | 3 → 3 |

The invoice layout at 1024px uses more row height so its previously clipped columns remain readable. None of these five measured pages gained document overflow or lost usable content width. The final sales layout keeps “All sources” visible and avoids the extra text-filter row at 1024px.

## Evidence and review units

`evidence-v2/before-populated/` and `evidence-v2/after-populated/` contain matching images. Begin with `dashboard`, `salesorders`, `purchaseorders` and `supplierinvoices`, using the `-1440-viewport.png` or `-1024-viewport.png` files. Manifests identify source and fixture fingerprints. The QA README describes checks, isolation and the initial diagnostic runs; those runs are retained separately and are not final acceptance evidence.

The source archive includes the revised project and conventional-commit patches since iteration 1. Review navigation, Dashboard, Sales orders, Purchase orders and Supplier invoices as separate concerns; fold follow-up sizing or feedback fixes into the relevant review. Apply the patches only to an iteration-1 checkout matching the named baseline. The full revised source can be used directly instead. No Git remote was supplied, so no remote PRs were opened.

`CLAUDE.md` records the conventions. The older handover and workstream notes describe iteration 1 and are superseded by this document where navigation differs.

## Limits and remaining work

Browser checks use isolated, clearly named QA fixtures. No running atelier-api/database was supplied, so connected API behaviour, real authorisation, Xero, mail delivery and transaction durability require verification in the development environment. No real messages or transactions were sent. External fonts were blocked consistently; comparisons use the same fallback fonts. Camera/iPad hardware was not exercised.

Header search still opens the existing demo search; the separate decision about hiding or relabelling it remains open. No new search was invented. API/product debts from the brief remain outside this pass, including server-side order-source filtering, report scoping, colourway selection and stock par alerts. Existing cramped Users/Products content at 1024px is not a broader responsive redesign. No new dependency or responsive breakpoint was added.
