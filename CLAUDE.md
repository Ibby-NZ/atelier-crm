# atelier-crm

Vite + React 18 SPA, plain JavaScript, ESM, no TypeScript. The back-office tool.
Runs on **http://localhost:5273** (`npm run dev`); needs **atelier-api** on 3001.

## The one distinction that matters: live vs demo vs Dynamics

Three kinds of screen coexist, and confusing them is the easiest way to break
something. A screen is exactly one of:

- **Live** — reads AND writes the platform's own Postgres tables through
  atelier-api's `/admin/*` endpoints. Changes here are real. Routes are grouped
  under `/admin/*` so a URL is unambiguous: `AdminBrands`, `AdminProducts`,
  `AdminStock`, `AdminPriceListItems`, `AdminOrders`, plus `UserManagement`
  (`/users`, the oldest of them).
- **Dynamics mirror** — reads `/admin/legacy/*`, which is **GET-only by design**.
  Atelier still runs live on D365 until cutover and the import re-runs, so these
  screens deliberately cannot write: `PriceLists`, `ClientsList`,
  `ClientAccount`, `Reserves`, `SalesOrdersList`, `SalesOrder`. Do not add a save
  button to one of these — the endpoint does not exist, and inventing it would
  desync the next import.
- **Demo** — still backed by `src/data/*.js` and localStorage (`AppStore`), from
  the pre-API prototype: `Catalogue`, `Collections`, `Suppliers`,
  `PurchaseOrders*`, `SalesOrderNew`, `ClientNew`, `Cutting`, `Samples`,
  `PricingEngine`, `PriceListImport`, `Reporting`, and the whole brand world.
  Edits look like they work and are lost on clear-site-data.

Grouped sections carry a `SectionTabs` strip so the live tab sits beside the
mirror it complements (Library / Products / Houses; Reserves / Cutting / Manage
stock; Price lists / Import / Supplier rates; Sales / Purchase / Web orders).
Tab sets live in `src/components/sectionTabs.jsx`; the SideNav item's `match`
array in `layout.jsx` must list every route the section owns or the nav goes
dark on the new tab.

## Auth

- **There is no landing page. `/` is `RootRedirect` in `App.jsx`** — a decision,
  not a screen: no session goes to `/login`, a live one to `/dashboard` (the
  catch-all `*` route funnels every unknown URL through it too). It and `Login`
  both return `null` while `loading` is true, for the same reason `RequireAuth`
  does: `GET /auth/me` is still in flight on a hard refresh, and deciding early
  bounces a signed-in user to the form on every reload. `Login` also redirects a
  signed-in visitor away, so the form is never a dead end.
- Because the cover page is gone, the **brand world (`/library`, `/journal`,
  `/storefront`, …) has no entry point from the operations tool** — it is
  URL-reachable and self-navigating once you are inside `BrandLayout`. The
  wordmark is per-layout (`Wordmark`'s `to` prop): operations → `/dashboard`,
  brand world → `/library`.
- `src/auth/AuthContext.jsx` is wired to the API: `GET /auth/me` on mount,
  `POST /auth/login`, `POST /auth/logout`. The session is the API's HttpOnly
  signed cookie — there is no local user record.
- Only `backoffice` and `director` may use the CRM (`STAFF_ROLE_MAP`); both map
  to the demo's full-access `director` capability set. `customer`/`trade` resolve
  to no CRM user and the guards bounce them to `/login`.
- **`src/auth/roles.js` CAPS are a drawing decision, not access control** — the
  file says so at length. The API's `requireRole('backoffice')` is the real gate.
  The live screens therefore carry no extra `RequireCap`: every signed-in CRM
  user is already staff.
- Sign in with a seeded staff login: `npm run seed:staff` in atelier-api
  (`liz@ateliertextiles.co.nz`, `STAFF_TEMP_PASSWORD`, default
  `AtelierTemp2026!`).

## API access

- Everything goes through `src/lib/api.js` — `apiFetch` (throws `ApiError` with
  `.status` and `.body`), `apiSend(method, path, payload)`, `safeFetch`. Never
  call `fetch` directly in a screen. Base URL from `VITE_API_BASE_URL`.
- Requests are credentialed, so the API must allow this origin **and the write
  methods**. Both were missing and both broke every CRM write; see the CORS notes
  in atelier-api's CLAUDE.md. Symptom of the method gap: the request appears in
  devtools, the row changes in the database, and the CRM reports a network error
  — because the browser blocked the *response*, not the request.

## Live-screen conventions (`src/admin/`)

- **`drafts.js`** — the DB-row ↔ form-draft plumbing, pure and unit-tested. A
  field is declared once as `{ key, label, kind }` and both directions read that
  declaration, so a value cannot be formatted one way and parsed another. Kinds:
  `text`, `enum`, `upper` (currency), `money` (cents ↔ dollars), `decimal`,
  `date`, `tones` (jsonb hex array ↔ comma list), `bool`, `ref` (nullable id).
  - `diffFields(record, draft, fields)` returns **only changed keys**. Not an
    optimisation: the API 400s an empty PATCH (`minProperties: 1`), several
    columns are create-only, and an explicit clear (`''` → `null`) has to stay
    distinct from untouched.
  - `bodyFrom(draft, fields)` is the create direction — every field, blanks as
    null.
  - A pg `date` arrives as a Date and leaves as `YYYY-MM-DD`; `sameValue` narrows
    both before comparing, or every unchanged date reads as an edit.
- **`parts.jsx`** — shared chrome (`panel`, `PanelHead`, `Field`, `Row`,
  `HeaderRow`, `GhostButton`, `PanelNote`, `ErrorLine`, `ToneChips`) plus two
  hooks: `useToast` (self-clearing, clears on unmount) and `useMutation`, which
  is the cycle every screen repeats — clear error, run the request, **reload the
  list**, flash a note. Reload rather than reconcile locally: slugs, colourway
  counts and reserved quantities are all server-generated.
- **`stock.js`** / **`orderFlow.js`** — the two places with real rules, kept pure
  so they test without a DOM. `orderFlow` mirrors the API's state machine so the
  UI never offers a transition that would 409.
- Errors come from the API's own message (it phrases 409s and 422s well);
  `messageOf` only supplies a fallback for a network drop.

## Rules the forms must honour (all enforced by the API)

- **Slugs are generated on create and immutable.** They are storefront URLs and
  the EmDash match key, so they render read-only. A product slug is built from
  the brand **name**, not its slug — rename the house first and the next
  product's slug follows the new name.
- **`product_type` is immutable** (the colourway's inventory unit was derived
  from it), and a product create takes no inline colourways.
- **SKUs are typed by staff, not generated** — the CRM's Brand-Product-Colour
  generator was never ported. Uniqueness is the database's job; a clash is a 409
  shown inline. `sku` *is* editable (order lines reference `colourway_id`).
- **Removal is archive, never DELETE.** Every list has a "Show archived" toggle
  and a Restore. Products and order lines reference these rows.
- **Stock: `reserved > available` is legal** — a short backorder reserves
  committed demand. The screen shows "oversold" in clay rather than clamping.
  `Apply` (signed delta) is the safe verb for receiving/write-offs; `Set`
  overwrites both figures.
- **`price_list_items.supplier` is create-only** (part of the identity key) and
  `wholesale_rate` stays in the **supplier's currency** — the pricing waterfall
  converts downstream. `code_normalized` and `source_file` are server-derived and
  are shown read-only.
- Web orders: only `requested`/`confirmed` allow line-quantity edits, confirming
  requires the Xero reference (invoicing is manual), and a card checkout holds no
  reservation (the Stripe webhook already decremented).

## Testing

- `npm test` — vitest, pure-logic only. There is **no jsdom and no
  testing-library**, so component tests are not possible without adding deps; the
  established pattern is to put logic in a plain `.js` beside the screen and test
  that (`src/admin/*.test.js`, `src/screens/clientView.test.js`).
- `npm run build` is the cheapest check that every screen still compiles and
  every import resolves.
- For a real browser check, `playwright-core` is already a devDependency and can
  drive the installed Chrome directly — no download:
  `executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`
  with `launchPersistentContext(mkdtempSync(...))` so the user's profile is
  untouched. (`screenshot.sh`/`screenshot.cjs` predate this and expect a cached
  Linux Chromium at `~/.cache/ms-playwright`, which is not present on macOS; the
  README's "no system browser" note is stale.)
- Routing is `HashRouter`, so a deep link is `http://localhost:5273/#/admin/stock`.

## Gotchas

- Styling is inline styles off `src/theme.js` (`c`, `font`, `eyebrow`, `weave`) —
  no CSS modules, no framework. `src/index.css` holds only the reset, the
  `.ab-*` interaction classes and the responsive overrides.
- There is **no ESLint** in this repo, so nothing catches an unused import or a
  JSX-only sub-component; sub-components at the bottom of a screen file are the
  house style (unlike the storefront, whose ESLint forbids them).
- `React.StrictMode` is on, so a mount effect runs twice in dev. Every load
  effect uses an `active` flag.
- pg `numeric` comes back as a string (`'60.00'`) — coerce with `toNumber` from
  `drafts.js` before any arithmetic or equality check.
- `index.html` declares no favicon, so a browser logs a 404 for
  `/favicon.ico` on every page. Cosmetic, pre-existing.
