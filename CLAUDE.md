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
  (`/users`, the oldest of them) and the two live tabs of the Clients section,
  `ClientAccounts` (`/clients/accounts`) and `TradeApplicants`
  (`/clients/applicants`) — both on `/admin/users`, both outside the `/admin/*`
  URL grouping because the office navigates them as Clients, not as admin.
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
stock; Price lists / Import / Supplier rates; Sales / Purchase / Web orders;
Clients / Trade accounts / Applicants). Tab sets live in
`src/components/sectionTabs.jsx`; the SideNav item's `match` array in
`layout.jsx` must list every route the section owns or the nav goes dark on the
new tab. Clients needs no `match`: `navIsOn` is a `startsWith`, so `/clients`
already covers `/clients/accounts` and `/clients/applicants`, and no other item
(`/users` included) matches them.

**Clients is where accounts of the people who BUY are administered.** The client
asked for the trade-application queue to sit "in the clients tab as a subtab
called applicants", so `TradeApplicants` moved there from `/users/applicants`
(which is kept as a `<Navigate>` redirect — a bookmark falling into the
catch-all would silently land on the dashboard and read as a deleted screen).
`/users` is still the SUPERSET view — every role, staff included, and the only
place a backoffice/director login is created — and carries a pointer to
Clients → Trade accounts instead of the two-tab strip it used to share.
`ClientAccounts` is the same `/admin/users` endpoint narrowed with
`segment=clients` (role customer + trade). Its rules (query building, the row's
state pill, which verbs a row offers) live in `src/screens/clientAccounts.js`
with a vitest test, because a component cannot be rendered in this repo.
The temp password a create returns is shown in a **dismissable notice, not the
toast** — the API returns it once and never again, and a self-clearing toast is
the wrong lifetime for a credential someone has to write down.

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

### Break-glass (offline) sign-in

- **A second, emergency door for when atelier-api is unreachable or its database
  is down.** `src/auth/breakGlass.js` (+ `sha256.js`, `breakGlassConfig.js`).
  `AuthContext.signIn` falls back to it *only* when a live attempt failed
  unreachably (`isApiUnreachable`: ApiError status 0 or ≥ 500) — a 401/403/429
  is the API working and stays a plain refusal. Read the module header before
  changing any of it.
- **It authenticates nothing.** No API cookie is set, so every `/admin/*` call
  still 401s: a break-glass user cannot read or write one row of live data. What
  it unlocks is the shell, which is worth having because the demo/localStorage
  screens (Catalogue, Suppliers, Pricing engine, Reporting, the brand world) keep
  working through an outage.
- **Off unless configured.** `VITE_BREAKGLASS_EMAIL` +
  `VITE_BREAKGLASS_PASSWORD_SHA256` (both required, else the feature does not
  exist in the build). Vite inlines them, so a change needs a **rebuild** — and
  the digest ships **publicly** in the bundle. One unsalted SHA-256 is not a
  password KDF, so the passphrase MUST be long and random; that, plus the nil
  privilege above, is the whole security argument. Rotate by changing the var
  and rebuilding: `readBreakGlassSession` re-checks the stored email against the
  configured one, so live offline sessions die automatically.
- **Not `crypto.subtle`.** WebCrypto is secure-context only, so on a plain-http
  staging box it is `undefined` — the emergency login would fail exactly where
  it is most needed. Hence the hand-rolled `sha256.js`, which also runs under
  vitest with no environment branch.
- Session lives in **sessionStorage** (dies with the tab), expires after 12 h,
  and is adopted on mount only after `/auth/me` yields no user. Once adopted it
  is kept until sign-out even if the API recovers — dropping someone at the
  login screen mid-task is worse than a labelled read-only shell.
- `useAuth().offline` is the flag: `OfflineBanner` (both layouts) says what
  works and what does not, and `src/lib/api.js` refuses every non-GET to a
  non-`/auth/*` path with `OFFLINE_WRITE_MESSAGE` rather than let a save look
  like it might have landed. `/auth/*` stays open so sign-out — and a proper
  sign-in once the API is back — still work.
- Guarded by `src/auth/breakGlass.test.js` (16 tests, pure). Verified in a real
  browser against a dead API: wrong passphrase stays out, right one reaches
  `/dashboard`, banner renders, session survives a reload, demo screens draw,
  writes are refused, sign-out clears it.

## API access

- Everything goes through `src/lib/api.js` — `apiFetch` (throws `ApiError` with
  `.status` and `.body`), `apiSend(method, path, payload)`, `safeFetch`. Never
  call `fetch` directly in a screen. Base URL from `VITE_API_BASE_URL`.
- Requests are credentialed, so the API must allow this origin **and the write
  methods**. Both were missing and both broke every CRM write; see the CORS notes
  in atelier-api's CLAUDE.md. Symptom of the method gap: the request appears in
  devtools, the row changes in the database, and the CRM reports a network error
  — because the browser blocked the *response*, not the request.

## Loading the Dynamics bundle from the browser (`src/lib/legacyImport.js`)

- **Why it exists**: the normalised D365 exports are client PII and gitignored, so
  no deploy carries them to a server, and the server may have no shell to run
  `npm run import:legacy` on. Symptom when that is skipped: Clients / Orders /
  Price Lists / Stock all render **200 with zero rows** — an empty grid that
  reads as a broken app, not as missing data. This is the path that needs
  neither shell nor laptop.
- `LegacyImportPanel` (`src/components/LegacyImportPanel.jsx`) is one generic
  panel behind an **Import** toggle on Clients (`accounts`), Orders
  (`sales_orders`), Price Lists (`product_prices`) and Stock (`stock_items`). It
  takes `entity` + `fileHint`, and `onImported` re-runs the screen's `load()`.
  Any of the eleven entity names works — wire more screens by passing a
  different `entity`.
- **Director only**, mirroring `POST /admin/legacy/import/:entity`. The panel
  returns `null` for anyone else, but that is presentation: the API is what
  refuses (back office may browse the staging tables, not bulk-write them).
- **Batching is load-bearing, not an optimisation.** 1000 records a batch keeps
  the largest request ~400 KB gzipped, under nginx's 1 MB default
  `client_max_body_size` — which is what lets this work against a server we
  cannot reconfigure. A test asserts the gzipped batch stays under 1 MB. Without
  `CompressionStream` the batch drops to 150 and the body goes as plain JSON.
- Uploads accept `.json.gz` or plain `.json`, sniffing the **gzip magic number**
  rather than trusting the extension (someone always renames the file).
- Re-running is safe and is the documented repair: every record carries its
  Dynamics GUID, so a repeat refreshes the row. The client retries transport
  failures and 5xx three times, and surfaces a 4xx immediately — a rejected
  batch fails identically on every attempt and retrying only burns the API's
  rate-limit bucket.
- Guarded by `src/lib/legacyImport.test.js` (16 tests, logic only — `send` is
  injected so it needs no network or DOM). Verified end to end in a real browser
  against an empty database: 866 accounts, 48 sales orders, 19,327 price rows
  (20 batches), 7,611 stock items.

## Live-screen conventions (`src/admin/`)

- **`drafts.js`** — the DB-row ↔ form-draft plumbing, pure and unit-tested. A
  field is declared once as `{ key, label, kind }` and both directions read that
  declaration, so a value cannot be formatted one way and parsed another. Kinds:
  `text`, `enum`, `upper` (currency), `money` (cents ↔ dollars), `decimal`,
  `date`, `tones` (jsonb hex array ↔ comma list), `bool`, `ref` (nullable id),
  `url` (absolute http(s) only — mirrors the API's 422 rule for
  `brands.website_url` and `collections.image_url`, both rendered by the
  storefront as public href/src; blank clears). `AdminBrands` edits a
  collection's **tile editorial** (description + image URL, the storefront
  brand-page tile) through the same `COLLECTION_FIELDS` declaration —
  `PATCH /admin/collections/:id` accepts any subset of name/description/
  image_url.
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
- **`brands.trade_only` is the storefront's public/closed switch**, edited on
  `AdminBrands` and printed on the brand row beside the `is_international`
  pricing state. Set (the default for a new house, and for every represented
  maison in the seed), a signed-out visitor cannot see that house's products at
  all — they are absent from the public grid and each product page answers 403
  until an approved trade account signs in. It is a DIFFERENT gate from
  `is_international`, which only hides the retail price, so the row prints both.
  The seed writes it on INSERT only, so an edit made here survives every reseed
  and re-opening a house is a CRM decision, never a seed change.
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
