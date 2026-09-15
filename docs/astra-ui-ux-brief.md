# Atelier CRM — UI/UX improvement brief

**For:** GPT Astra 6, working in the `atelier-crm` repository.
**From:** Verum, 15 September 2026.
**Scope:** improve the usability, consistency and polish of the back-office CRM
**without changing what it does**. No new features, no API changes, no new
visual language. Consistency, clarity, feedback, states, keyboard and screen-reader
reach, information hierarchy.

---

## 0. Read this first

1. Read `CLAUDE.md` at the repo root **in full** before touching anything. It is
   1,400 lines of invariants and confirmed regressions, not style preferences.
   Every "why" in this brief is expanded there. When this brief and `CLAUDE.md`
   disagree, `CLAUDE.md` wins; when `CLAUDE.md` and a screen's header comment
   disagree, the header comment is newer.
2. The API contract is fixed. If a UX improvement needs the API to change (a new
   filter, a field, an endpoint), write it up as a request against `atelier-api`
   and stop. Never fake it client-side (a client-side filter over a paged list
   silently lies — see §7).
3. Work screen by screen, one concern per pull request, tests and build green.
   Big-bang restyles will be rejected.

---

## 1. What this app is

- **Back-office tool for Atelier Textiles** (16 York St, Parnell, Auckland, NZ), a
  distributor of European fabric and wallpaper houses (Pierre Frey, Rubelli,
  Colefax & Fowler, Jim Thompson, de Le Cuona, Larsen…) selling to the trade
  (interior designers, at trade prices) and retail.
- **Users are a handful of staff**, not the public. Director (Liz, the client
  lead), office and pricing (Jenette), showroom staff, the accounts desk. API
  roles: `backoffice` and `director`. Every CRM login is staff; a director
  additionally gets finance figures, user administration, custom discounts, Xero
  connect/disconnect, bulk legacy import.
- **Three apps, three ports**: API (Fastify + Postgres, `:3001`), storefront
  (Astro, `:4321`, the public site atelier.co.nz), CRM (this repo, `:5273`). The
  storefront and the CRM share the design tokens; the CRM is the operational
  sibling.
- **The office still runs Microsoft Dynamics 365 until cutover.** The CRM shows
  D365 exports read-only ("Dynamics (historical)" tabs) beside its own live
  tables. This split shapes every screen — see §3.
- **Locale en-NZ everywhere**: colourway, catalogue, metres, organise. Money is
  NZD cents on the platform side (`formatCents`); supplier costs stay in the
  supplier's own currency and are never converted in the browser.
- **Feedback arrives through Userback** (widget in `index.html`, project
  "Atelier"). Items are cited by number in code comments (`8287873` report
  drill-down, `8287677` record lock). Three recent rounds shaped the current
  screens: Liz's 8-point note (3 Sep), Jenette's pricing note (9 Sep), Shalakha's
  15-item round (14 Sep). The client reads demo figures as real figures — that
  is why the demo pricing engine and supplier master were deleted, and why
  "Indicative" tags matter.
- **Primary viewport is desktop ≥ 1280px.** iPad matters for one thing: the
  sample scanner in the showroom (camera needs https). Phones are a safety net,
  not a target.

---

## 2. Stack and hard constraints

| Constraint | Detail |
|---|---|
| Framework | Vite 5 + React 18, plain JavaScript ESM. **No TypeScript.** |
| Lint | **No ESLint.** Nothing catches an unused import except review. |
| Styling | Inline style objects off `src/theme.js` tokens. `src/index.css` holds only the reset, the `.ab-*` interaction classes (hover/transition/disabled) and the `.r-*` responsive overrides. **No CSS framework, no CSS modules, no CSS-in-JS, no Tailwind.** |
| Routing | `HashRouter`. Deep links look like `http://localhost:5273/#/admin/orders`. |
| Tests | vitest, **pure logic only. No jsdom, no testing-library.** Pattern: decisions live in `screenName.js` beside `ScreenName.jsx` and are tested; the `.jsx` is layout only. Many tests are source scans (they grep the `.jsx` for a token) — a refactor that renames a token can fail a test with no runtime change. Read the failing test before "fixing" it. |
| Gates | `npm test` then `npm run build`. **Build is the only compile check.** CI runs both on every PR. |
| Dependencies | `react`, `react-dom`, `react-router-dom`, `zxing-wasm`. **Do not add** a UI library, icon pack, date library, state library, form library or CSS tooling. Each existing dependency has a paragraph justifying it in `CLAUDE.md`. |
| StrictMode | On. Load effects double-fire in dev; every load effect uses the `let active = true` cleanup pattern. Keep it. |
| Effects | Keyed on primitives only (serialised query strings, ids), never on object literals — a render loop has no test surface here. |
| API | Everything through `src/lib/api.js` (`apiFetch`, `apiSend`, `apiDelete`, `apiDownload`, `safeFetch`). Never `fetch` directly. Fastify's Ajv **strips unknown body keys silently**, so the frontend field whitelists (`*_FIELDS` declarations) are the real gate. |
| Numbers | pg `numeric` arrives as a string. `toNumber` (0 for null — form drafts) vs `numberOrNull` (staging figures). Cents are integers; purchasing is fractional in supplier currency and never cents. |
| Branch | Default branch is **`master`**. Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`. |

---

## 3. The one distinction: live / Dynamics mirror / demo

Every screen is exactly one of three kinds. Confusing them is the fastest way to
break something or to polish something that is about to be deleted.

**Live** — reads and writes the platform's own tables via `/admin/*`. Real
changes. Improve freely. Routes are grouped under `/admin/*`, plus `/users`,
`/clients`, `/clients/applicants`, `/pricing`, `/import`, `/sample-scanner`,
`/reporting/library` (four live reports), `/reporting/insight`, `/dashboard`.

**Dynamics mirror** — reads `/admin/legacy/*`, **GET-only by design**. Never add
a save, an edit, a delete or a "create" to one: `PriceLists` (`/price-lists`),
`ClientsList` (`/clients/legacy`), `ClientAccount` (`/clients/:id`), `Reserves`
(`/reserves`), `SalesOrdersList` (`/sales-orders`), `SalesOrder`
(`/sales-orders/:id`), `PricingParameters` (`/price-lists/parameters`). The one
write they carry is the `DynamicsCorrection` overlay (a separate overrides
table), already built.

**Demo** — pre-API prototype backed by `src/data/*.js` + localStorage
(`AppStore`). Edits look real and are lost on clear-site-data. `Catalogue`
(`/catalogue`, the Library tab), `Reporting` (`/reporting`, the reporting home;
nine of thirteen library reports are fixtures), `Search` (`/search`, the header
search box), `Cutting` (`/cutting`), `SalesOrderNew` (`/sales-orders/new`),
`ClientNew` (`/clients/new`), `AccountDetails` (mostly), and the whole brand
world (`/library`, `/product`, `/journal`, `/storefront`, `/collections`,
`/account`, `/sample-request`, `/project`). **Do not invest polish in demo
screens.** Do flag where a nav item lands on one (see §8).

`CLAUDE.md` still lists `PriceListImport` as demo; it is live now (wired to
`/admin/price-lists/import/*`) — trust the file's header comment.

---

## 4. Design language

Tokens are in `src/theme.js` and mirror the Figma "Design System" page (Atelier
file, node 3347-3314). Do not introduce a colour, font size, radius or shadow
that is not a token or a size already in use.

**Palette (`c`)**
- `paper #F2F0E9` canvas · `surface #EBE9DF` panels/nav · `surfaceDeep #E5E1D4` table headers, chips, read-only inputs
- `ink #33312B` text · `inkSoft #605D4F` secondary · `muted #898472` eyebrows, meta, placeholders
- `line #D4CFB9` **every** 1px hairline
- `accent #B5985B` ochre — **sparingly**: primary CTA, active nav/tab, the one key figure · `accentSoft #735F33` hover · `accentSubtle #C7AD77` ghost hover
- `brass #937942` fine strokes, italic annotations, focus border — never fills
- `sage #6F7A5A` positive / in stock · `clay #B06A4F` warning / low / overdue / oversold · `danger #D8281F` errors and the destructive verb only
- `inverse` / `onInverse` dark panels (the toast)

**Type (`font`)**
- `display` and `ui` are both Switzer (Inter fallback). `display` for headlines, design and product names, big figures; `ui` for labels, tables, controls.
- `accent` Zodiak italic — **accent words only**, inside a headline (`<Em>`). Never body copy.
- `mono` IBM Plex Mono — SKUs, codes, barcodes, money, tabular figures.
- Eyebrow: 12/600 uppercase, 0.1em tracking, muted. Header-row labels 9.5/600 uppercase 0.12em. Field labels 11 uppercase 0.12em.
- PageHeader h1: 40/500, −0.025em, line-height 1.1.

**Shape**
- `radius`: xs 4 · sm 8 (inputs) · md 12 (panels) · pill 9999 (every button and badge).
- `shadow`: none on panels. `lift` on hovered tiles, `modal` on dialogs, `toast` on toasts. Nothing else casts a shadow.
- Hairlines separate rows; panels are a hairline border on `paper` with a `surface` PanelHead.

**Buttons — three, no more**
- `PrimaryButton` ochre pill (md 44px / sm 36px) — one per view, the thing the page is for.
- `SecondaryButton` outline pill — the alternative.
- `GhostButton` (`admin/parts.jsx`) hairline pill, 12px — every row-level verb (Save, Add, Archive, Restore, Delete). `tone="danger"` **only on the permanent verb** (Delete). Archive is neutral. (`AdminOrders` keeps a red Archive deliberately; the reason is documented there.)
- Disabled look is defined once in `index.css`; never hand-roll one.

**Status**
- `StatusPill` dot + label, tones sage / clay / muted. `ArchivedTag` clay uppercase. Archived rows render at 0.55 opacity.
- `Indicative` tag beside any figure that is not from the platform.
- `MaskedFigure` (`——`) where a finance figure was deleted server-side. Never blur or dot-out a real value.

**Feedback**
- Success: `ToastLine`/`Toast`, bottom-centre, ink on paper, self-clears at 3.6 s. Success only.
- Failure: inline `ErrorLine` (`role="alert"`, danger) under the control or at the top of the panel. **The API's own sentence wins**; `messageOf` supplies a fallback only for a network drop.
- Loading / empty / error inside a panel: `PanelNote` (one muted italic line) so a panel never collapses to nothing.
- Credentials (a temp password) go in a **dismissable notice**, never a toast.

---

## 5. Component kit — reuse before you write

| Where | What |
|---|---|
| `src/components/ui.jsx` | `PageHeader` (eyebrow + h1 + subtitle + right slot), `Eyebrow`, `Em`, `PrimaryButton`, `SecondaryButton`, `ButtonLink`, `AttributePill`, `StatusPill`, `WeaveImage` (image with woven-gradient fallback), `Swatch`, `SwatchStrip`, `Toast`, `Hairline`, `Indicative` |
| `src/admin/parts.jsx` | The live-screen chrome: `panel`, `PanelHead`, `Field`, `CheckField`, `GhostButton`, `ErrorLine`, `PanelNote`, `ArchivedTag`, `Row`, `HeaderRow`, `ToneChips`; style objects `inputStyle`, `cellInput`, `monoCellInput`, `readOnlyInput`, `sectionLabel`, `mutedText`, `monoText`; hooks `useToast`, `useMutation`; `ToastLine`, `messageOf` |
| `src/admin/` | `ConfirmDialog` (role=dialog, Escape cancels, focus on Cancel, 409 keeps it open), `Pagination` (hook-free, returns null at one page), `OrderLinesEditor`, `TradeAccountPicker`, `useCrudScreen` (`list` / `toast` / `mutation` / `remove`), `useAdminList`, `drafts.js` (field declarations, `diffFields`, `bodyFrom`), `deleteFlow.js`, `list.js` |
| `src/components/form.jsx` | The **demo-era** form kit: `FormField`, `TextInput`, `SelectInput` (brass focus border), `NotFound`. Overlaps `parts.jsx` — see §8 |
| `src/components/sectionTabs.jsx` + `sections.js` | `SectionTabs` strip (tabs + per-section header actions). Tab sets: `catalogueTabs`, `ordersTabs`, `stockTabs`, `priceListTabs`, `samplesTabs`, `clientsTabs` |
| `src/components/layout.jsx` | `InternalLayout`: 240px sticky `SideNav` on `surface`, 62px sticky header (section eyebrow, "Search the library…" box, `UserMenu`), `<main>` padding 44/56, max-width 1240. `BrandLayout` is the demo editorial shell. `internalNav` with `match` arrays. |
| `src/auth/guards.jsx` | `RequireAuth`, `RequireCap` → `LockedPanel` (always says **why**), `MaskedFigure` |
| `src/components/` | `OfflineBanner`, `UserMenu` (menu with Escape/outside-click), `LegacyImportPanel`, `DynamicsCorrection`, `TradeContactsPanel`, `reportTable.jsx`, `reportingTabs.jsx`, `icons.jsx` (inline brass-stroke icons) |
| `src/hooks/useIsNarrow.js` | `window.innerWidth < 900`; used by two screens only. The rest of responsive is `.r-*` classes with `!important` in `index.css` at 1024px and 640px. |

**Screen anatomy (live list screen)**: `PageHeader` → `SectionTabs` → optional
filter bar → create panel (collapsible or always-open) → list panel
(`HeaderRow` + `Row` per record, a row expands inline into its editor) →
`<Pagination />` → `<ConfirmDialog {...crud.remove.dialog} />` →
`<ToastLine />`. Study `AdminCollections.jsx` (487 lines) as the cleanest
example; `AdminProducts.jsx` (1,140) and `AdminOrders.jsx` (1,012) are the
heaviest.

---

## 6. Navigation map

SideNav order and what each item owns (tabs from `sections.js`):

| Nav item | Lands on | Tabs / routes |
|---|---|---|
| Dashboard | `/dashboard` (live) | KPI tiles link into their lists |
| Pricing | `/pricing` (live, finance-gated) | the cost-plus waterfall, Automatic/Manual, per house and supplier |
| Catalogue | `/catalogue` (**demo**) | Library (demo) · Products · Houses · Collections · Categories |
| Orders | `/admin/orders` (live) | Sales orders · Purchase orders · Supplier invoices · Dynamics (historical) · Freight rates. Header actions: New sales order, New purchase order |
| Stock | `/admin/reserves` (live) | Reserves & cuttings · Supplier report · Cutting (demo) · Manage stock · Dynamics (historical). Action: New reserve / cutting |
| Suppliers | `/admin/suppliers` (live) | single screen; terms and contacts panels in the expanded row |
| Reporting | `/reporting` (**demo** home) | `/reporting/library` (4 live + 9 fixture reports), `/reporting/insight` |
| Price Lists | `/price-lists` (mirror) | Price lists (mirror) · Import (live) · Supplier rates (live) · Freight (live, append-only) · Dynamics parameters (mirror) |
| Clients | `/clients` (live, director) | Clients · Applicants. Mirror at `/clients/legacy`, detail `/clients/:id` |
| Samples | `/samples` → `/admin/samples` | Sample register · Outstanding loans · Showrooms · Sample orders · Scanner · Letters |
| Showroom Samples | `/showroom-samples` → `/admin/sample-orders` | a second top-level entry into the Samples section |
| Users | `/users` (live, director) | every role incl. staff; the only place staff logins are created |
| Xero | `/admin/xero` (live) | connection + bulk syncs; invoice push button lives on Orders |

Header: section eyebrow only (no breadcrumb), search box → `/search` (demo),
`UserMenu` (Account details, Reset password, Manage users, Sign out).
Signed-out routes: `/login`, `/forgot-password`, `/reset-password` share
`AuthFrame.jsx`.

**Retired routes redirect, never 404 and never fall into the catch-all**:
`/suppliers`, `/purchase-orders*`, `/samples`, `/showroom-samples`,
`/users/applicants`, `/clients/accounts`. Keep that rule for anything you move.

---

## 7. UX rules already decided — do not undo

These are the product's settled answers. Each one fixed a confirmed problem.

**Errors and confirmation**
- Inline, in the API's words. No `alert()`. The API phrases 409s and 422s well.
- A refused delete (409) **keeps the dialog open**, swaps in the API's explanation and blockers, and the Confirm button **disappears** (a retry can only fail again). "Archive instead" appears only when the API says `archivable: true` **and** the screen supplied an archive action. "Archive instead" always archives — it is never the row's Archive/Restore toggle.
- No pre-flight "can I delete this?" request. Advance warnings come from data already on screen (`product_count` on a detail read, `sole` tier from the loaded list).
- A 422 with row numbers (sheet imports) is a **report panel**, not an error line.
- "Could not load" (API's sentence) and "Nothing to show" (coverage note) are opposite answers and get different panels. An empty table is never drawn for a failed fetch.

**Lists and filters**
- Mutate → **reload the list** → toast. Never reconcile locally; slugs, counts and reserved quantities are server-generated.
- A filter that another screen links into **lives in the URL** (`useSearchParams`), not in state; Apply writes the URL, typing never fetches. Boxes nothing links to stay local.
- An unset filter is `null`, never `''` — an empty enum value is a 400 that kills the whole list.
- Changing a filter resets to page 1. A delete that empties the last page steps back one page.
- A client-side narrowing over a paged list must say so in the count line ("12 of 50 on this page · 412 matching in total"). Never raise `limit` to hide it.
- A controlled `<select>` whose value has no option renders blank — every vocabulary comes from one exported list (`CATEGORY_OPTIONS`, `STATUS_LABELS`, `SAMPLE_STATUSES`…), never retyped.
- Rows are keyed and addressed by `id`; a row's name in a dialog identifies it across the **whole list** (`describeCollection` adds the house, `describeRate` the supplier, `describeAccount` uses the email, `describeSample` the barcode).

**Truth and masking**
- The server is the only authority on a live table. Finance masking is by **key deletion** on the API; the CRM draws the absence (`MaskedFigure`, or the column not drawn at all). Never blur, never compute a figure the server withheld.
- Locked, not removed: a director-only field renders in `readOnlyInput` with one `RECORD_LOCK_NOTE`, so a restriction never reads as data loss. The lever is the declared field list, not styling.
- `LockedPanel` always states the reason. A silent redirect hides the boundary.
- Derived values come from the API: `overdue`, `receipt_state`, `qty_outstanding`, `net_multiplier`, `category` on reserves. **Never construct a `Date` for a business rule** (device clock ≠ server clock); slice ISO strings for display.
- `null` renders as an em dash, never as 0 or blank-that-looks-like-zero. A category this build has not been taught renders its raw value, never blank.
- Over-receipt, oversold and negative markup are real answers and are shown, not clamped.
- Anything not from the platform carries `Indicative`.

**Verbs and state machines**
- The UI never offers a transition the API would 409: `orderFlow.js`, `sampleFlow.js`, `reserveFlow.js` mirror the API's state machines and are the only source of transition buttons.
- A status move is a verb (`POST …/transition`), never a `status` PATCH.
- Only the permanent verb is red. Archive is reversible and neutral; every list has "Show archived" and Restore.
- SKUs are typed by staff; slugs are generated on create and immutable; `product_type`, house, supplier are create-only and render read-only in editors.

**Dialogs and keyboard**
- `ConfirmDialog`: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape cancels, focus lands on Cancel so a stray Enter cannot delete. Its buttons are native `<button>`s because `GhostButton` does not forward refs.
- `UserMenu`: Escape and outside-click close it; `aria-haspopup`, `aria-expanded`.
- Expanded rows carry `aria-expanded`.

**Navigation**
- A route that moves keeps a `<Navigate replace>` at the old path.
- The SideNav `match` array must list every route a section owns or the nav goes dark on that tab.
- `/` is a decision, not a page; the wordmark goes home per layout.

**Copy**
- Sentences, en-NZ, plain. Panel notes explain *why* ("Receipting does not move stock — see Manage stock"). Timing asymmetries are said on the panel (`STOREFRONT_TIMING_NOTE`).
- "House" for a brand in UI copy; "supplier" is who invoices; "design" is a product; "colourway" is a SKU.

---

## 8. Known debts and opportunities (observed 15 Sep 2026)

Ranked by value for the effort. Do the top block first.

**Block A — consistency of feedback and confirmation**
1. **Ten native dialogs remain**: `window.confirm` in `AdminXero`, `TradeApplicants`, `AdminOrders`, `AdminPriceListItems`, `ClientAccounts`, `AdminBrands`, `AdminProducts`, `UserManagement` (×2) and a `window.prompt` for the email change in `UserManagement`. They are unstyled, block the thread, and skip the dialog's a11y and focus rules. Replace with `ConfirmDialog` (or an inline confirm step for the prompt) — and keep the copy, which is deliberate. Read each screen's `.test.js` first: several scan the `.jsx` for tokens.
2. **No visible keyboard focus.** `index.css` has no `:focus-visible` rule and most controls are inline-styled with `outline: none`. Add one focus ring (brass 1px offset, or the `c.accent` ring `Swatch` already uses) for buttons, links, inputs, selects and row toggles. The demo `TextInput` already switches its border to brass on focus — match that.
3. **Clickable rows that are not keyboard-reachable**: the Dashboard's recent-order and inbound rows and two rows in `ReportLibrary` are `div onClick`. The live list screens already do it right — a row that expands is a `<button aria-expanded>` (see `AdminProducts`), a row that navigates is a `<Link>` laid out as the row (`ClientsList`, report rows). Bring the stragglers in line.

**Block B — one form language**
4. **Two form kits.** `components/form.jsx` (demo era: 44px, radius 4, brass focus) and `admin/parts.jsx` (live era: 42px, radius 8, no focus state) both style inputs, and 74 raw `<select>` elements across screens carry their own inline styles. Converge on `parts.jsx` (`inputStyle` family) and add a `Select` primitive there with the same height, radius and focus ring; migrate screen by screen. Do not touch `form.jsx` users that are demo screens.
5. **Field labels come in three sizes** (10.5 / 11 / 12 uppercase). Settle on the `Field` component's 11px for form labels and the 12px `sectionLabel` for panel heads; header-row labels stay 9.5.

**Block C — orientation on deep screens**
6. **Detail screens have no breadcrumb or back affordance in the header.** `/admin/purchase-orders/:id`, `/admin/supplier-invoices/:id`, `/clients/:id`, `/sales-orders/:id`, `/reporting/insight` rely on the SideNav being lit. Add a consistent back link in `PageHeader`'s eyebrow slot ("← Purchase orders") — do not add a breadcrumb component or a new layout region.
7. **Nav items that land on demo screens**: Catalogue → `/catalogue` (demo Library) while the live work is on the Products tab; Reporting → `/reporting` (demo home) while the live reports are in the library. Propose (do not silently change) landing Catalogue on `/admin/products` and Reporting on `/reporting/library`, keeping the old routes reachable as tabs. The `match` arrays already cover both.
8. **"Showroom Samples" is a second top-level nav entry into the Samples section** (it redirects to the Sample orders tab). One section, one entry — propose removing the item and relying on the tab. Ask first; the client may navigate by it.
9. **The header search box says "Search the library…" and opens the demo `Search` screen.** Either label it honestly or hide it until a live search exists. Ask.

**Block D — dense list screens**
10. Audit numeric columns for alignment and font: the rule is right-aligned, `font.mono`, em dash for null. Most screens follow it; check each list once and fix the exceptions rather than restyling the column system.
11. Header rows do not stick on long lists (`AdminPriceListItems`, `AdminStock`, `AdminOrders`). A sticky `HeaderRow` under the 62px header is a two-line change inside `HeaderRow`; verify it inside the `panel`'s `overflow: hidden`.
12. Expanded-row editors on the three largest screens are hard to scan (the editor pushes every row below it). Do **not** replace them with a drawer or modal without a design conversation — the inline editor is the client's known pattern. Improve within it: a visible left rule in `accent` on the open row, the editor on `surface`, a sticky Save/Cancel bar at its foot.

**Block E — small but visible**
13. `index.html` initialises the Userback widget with placeholder identity (`id: "123456"`, `someone@example.com`). Either identify the signed-in user from `AuthContext` after `/auth/me` resolves, or remove `user_data`. Feedback threads currently arrive anonymous.
14. The toast is success-only and sits 34px from the bottom; on a short viewport it can cover a row's Save. Fine on desktop; check at 640px.
15. The `.r-*` responsive layer uses `!important` overrides on inline styles and is explicitly desktop-first. Do not extend it screen by screen; if a screen genuinely needs tablet support (scanner, sample register on iPad) use `useIsNarrow` in that screen.

**Owed, but not yours to build (API or product decisions)**
- A colourway picker on the sample register (currently an id box, ~19k rows).
- `DELETE /admin/colourways/:id` has no UI.
- The Dashboard's Stock alerts tile is indicative (no par-level schema).
- The live report export is client-side; the API's `export.csv` needs a download helper wired in.
- Source filter on Orders is client-side until the API grows a `kind` param.
- Sales-by-rep own-sales scoping (A6), region reporting (A7).

---

## 9. How to work

1. **Set up**: `npm install`, `npm run dev` → `http://localhost:5273`. Needs `atelier-api` running on `:3001` with a migrated, seeded database and `npm run seed:staff` (login `elizabethd@atelier.co.nz` / `AtelierTemp2026!` locally). `VITE_API_BASE_URL` in `.env` if not the default.
2. **Read** `CLAUDE.md`, then the section of it for the screen you are on, then the screen's header comment, then its `.js` twin and test.
3. **Before changing a screen, screenshot it.** `playwright-core` is a devDependency; drive the installed Chrome with `chromium.launch({ channel: 'chrome' })` (no browser download). Sign-in inputs are `input[type=email]` / `input[type=password]` + a "Sign in" button. Compare before/after at 1440 and 1024 wide. Attach both to the PR.
4. **Change the smallest thing.** A fix to shared chrome (`parts.jsx`, `ui.jsx`, `index.css`) lands everywhere at once — prefer that to per-screen edits, and check every consumer (`grep -rn 'from .*parts.jsx' src`).
5. **Keep decisions out of `.jsx`.** If you add a rule (which rows get a back link, what a label says under a condition), put it in the screen's `.js` twin with a test.
6. **Run** `npm test && npm run build` before every commit. A source-scan test failing after a rename is telling you what the rename broke; update the scan only if the invariant still holds.
7. **Commit** conventional, one concern each, with the *why* in the body in the house style (the git log is the model: `feat(catalogue): the products list narrows by category and price band`). Branch from `master`, PR into `master`.
8. **Document**: if you change a convention (focus ring, a new primitive, a moved landing route), add the bullet to `CLAUDE.md` in the section it belongs to — that file is how the next agent learns it.
9. **Report** what you did, what you skipped and why, and every question you could not answer yourself.

The dev-only `Agentation` toolbar (`src/main.jsx`) lets a reviewer annotate the
running page; it is tree-shaken from builds and is not part of the product.

---

## 10. Ask before you…

- Move or rename a route, a nav item, or a tab (bookmarks and muscle memory).
- Change a landing page (§8 items 7–9).
- Replace the inline expanded-row editor with a drawer, modal or separate page.
- Change any copy the client asked for verbatim (quoted in `CLAUDE.md`: "in the clients tab as a subtab called applicants", "identifier that it came from website", "read-only, as this could easily upset our records").
- Add a dependency of any kind.
- Touch anything under `src/data/`, `src/store/`, or a demo screen beyond what a shared-chrome fix drags in.
- Change what a finance-gated or director-only control does — the CRM's `CAPS` are a drawing decision; the API is the gate, and the two must keep agreeing.
- Widen the responsive layer.

---

## 11. Vocabulary

| Word | Means |
|---|---|
| House / brand | A fabric house (Pierre Frey). `brands` table. What a customer buys. |
| Supplier | Who invoices Atelier. One supplier sells several houses (Colefax & Fowler → Colefax, Jane Churchill, Larsen, Manuel Canovas). |
| Design / product | A pattern. `products`. Has a category (nine values, one list) and a `product_type` (`fabric` → metres, `finished_good` → units). |
| Colourway | A sellable SKU of a design. `colourways`; one `inventory` row each. |
| Collection | A house's range grouping. Slug unique per house, not globally. |
| Range | D365's word for a house's price list group (Dynamics mirror). |
| Trade / retail | Two prices. Trade needs an approved trade account. `trade_only` hides a house from the public entirely. |
| Reserve / cutting | Stock held against a client / fabric cut to length. |
| Sample | A physical hanger or memo, not stock. Loans go out to clients; sample orders stock a showroom. |
| Order kinds | `checkout` (website, card), `manual` (office), `order_request`, `backorder_request`. Source = Website / Office. |
| Purchase order | Raised per house, addressed to its supplier. Receipts are an append-only ledger. |
| Supplier invoice | One consolidated bill covering several purchase orders. |
| Waterfall | Cost-plus pricing steps: supplier list → discount → FX → duty → freight → landed → trade → retail. Finance-gated. |
| Dynamics / D365 / legacy / mirror | The office's current system; read-only exports shown beside live data. |
| Indicative | A figure not from the platform. |
| Break-glass | Offline emergency sign-in; unlocks the shell, writes nothing. |
