# atelier-crm

Vite + React 18 SPA, plain JavaScript, ESM, no TypeScript. The back-office tool.
Runs on **http://localhost:5273** (`npm run dev`); needs **atelier-api** on 3001.

## The one distinction that matters: live vs demo vs Dynamics

Three kinds of screen coexist, and confusing them is the easiest way to break
something. A screen is exactly one of:

- **Live** — reads AND writes the platform's own Postgres tables through
  atelier-api's `/admin/*` endpoints. Changes here are real. Routes are grouped
  under `/admin/*` so a URL is unambiguous: `AdminBrands`, `AdminCollections`,
  `AdminProducts`, `AdminStock`, `AdminPriceListItems`, `AdminOrders`,
  `AdminOrderNew` (`/admin/orders/new`), plus `UserManagement`
  (`/users`, the oldest of them) and the two tabs of the Clients section,
  `ClientAccounts` (`/clients`) and `TradeApplicants`
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
- **`IMPORT_COLUMNS` (`src/data/importSamples.js`) must stay in step with the API's
  template registry** (`scripts/lib/price-template.js` in atelier-api) — the office
  drops ONE file and both read its header row. It is v3 as of 12 Aug 2026: the
  client's correction of v2 (Product Range → **Brand**, since that cell has always
  held the house; Pack Type → **Unit**; Repeat → **Horizontal Repeat**; Pattern
  Match moved up beside the repeats). The wizard matches by LABEL, not position,
  so a rename here silently unmaps a column instead of failing — which is what
  `COLUMN_ALIASES` is for: every sheet the office already holds still says "Pack
  Type", and those keep mapping. An alias only ever adds a spelling.

Grouped sections carry a `SectionTabs` strip so the live tab sits beside the
mirror it complements (Library / Products / Houses; Reserves / Cutting / Manage
stock; Price lists / Import / Supplier rates; Sales / Purchase / Web orders;
Clients / Applicants). Tab sets live in
`src/components/sectionTabs.jsx`; the SideNav item's `match` array in
`layout.jsx` must list every route the section owns or the nav goes dark on the
new tab. Clients needs no `match`: `navIsOn` is a `startsWith`, so `/clients`
already covers `/clients/applicants` and `/clients/legacy`, and no other item
(`/users` included) matches them.

**Clients is where accounts of the people who BUY are administered.** The client
asked for the trade-application queue to sit "in the clients tab as a subtab
called applicants", so `TradeApplicants` moved there from `/users/applicants`
(which is kept as a `<Navigate>` redirect — a bookmark falling into the
catch-all would silently land on the dashboard and read as a deleted screen).
`/users` is still the SUPERSET view — every role, staff included, and the only
place a backoffice/director login is created — and carries a pointer to
Clients instead of the two-tab strip it used to share.
`ClientAccounts` is the same `/admin/users` endpoint narrowed with
`segment=clients` (role customer + trade). Its rules (query building, the row's
state pill, which verbs a row offers) live in `src/screens/clientAccounts.js`
with a vitest test, because a component cannot be rendered in this repo.

**The section is exactly TWO tabs: Applicants and Clients**, because there are
only two states a client is in — they have applied, or they are a client — and
approving an application is one account changing state rather than a record
moving between lists. `ClientAccounts` (live, writable, full add / edit /
archive / delete) holds `/clients`; it had to, since the Dynamics account mirror
is read-only until cutover and could never be the tab that offers those verbs.
That mirror (`ClientsList`) moved OFF the strip to `/clients/legacy`, reached
from a link in the Clients header and keeping a back-link of its own;
`/clients/accounts` is a `<Navigate>` redirect, the same bookmark rule
`/users/applicants` follows. **A pending applicant is not listed as a client**: a
trade application creates its login on submission with `trade_approved` false, so
`partitionClients` (`clientAccounts.js`, pure + tested) holds those rows back and
shows the count as a link to Applicants. Approving there flips the flag, which is
all it takes for the account to appear in Clients — the filter is client-side
because the list is unpaged, and a server param would grow the endpoint's
vocabulary for one caller. The shown-count is the FILTERED length, never
`crud.list.total`, which still counts the rows being held back.
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
  storefront as public href/src; blank clears). `AdminCollections` edits a
  collection's **tile editorial** (description + image URL, the storefront
  brand-page tile) through the same `COLLECTION_FIELDS` declaration —
  `PATCH /admin/collections/:id` accepts any subset of name/description/
  image_url. (That panel lived inside `AdminBrands` until W2-US-010 gave
  collections their own screen.)
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
- **Archive is the reversible removal and every list still has a "Show archived"
  toggle and a Restore.** Hard DELETE now sits beside it on every live screen and
  is refused by the API while anything still points at the row — see "CRUD
  completion" at the foot of this file. An order is the one record with no delete
  at all, anywhere.
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

## Foundations

The shared admin CRUD kit under `src/admin/`. New list screens compose it rather
than copying a sixth paginator.

- `list.js` is **pure** — `buildListQuery`, `listPath`, `pageCount`, `clampPage`,
  `readList`, no React and no fetch, so it is unit-tested directly.
- **`buildListQuery` drops `null`, `undefined` and the empty string.** That is
  load-bearing, not tidiness: an "All" `<select>` with `value=""` would otherwise
  send `role=`, and the API's enum answers an empty value with a **400 that kills
  the whole list**, not just that filter. Strings are trimmed for the same
  reason. `0` and `false` are kept — they are real answers; a flag that should
  vanish when off is passed as `flag || null`.
- **`readList(body, key)` falls back to the row count when there is no
  `meta.total`.** The API has no single envelope: paged reads carry
  `meta.total`, while `/admin/brands` and `/admin/inventory` return the whole
  list with none, and treating those as `total: 0` would render "0 rows" above a
  full table.
- **`useAdminList` keys its effect on the SERIALISED query string, never on the
  `filters` object.** A screen passing an inline object literal
  (`filters={{ q, role }}`) hands over a new identity every render, and an effect
  keyed on it refetches forever. Both dependency arrays hold primitives only, and
  `useAdminList.test.js` asserts that against the source — there is no jsdom here,
  so a render loop has no runtime surface to catch it.
- **A delete that empties the last page steps back one page** (`pageAfterLoad`,
  exported and unit-tested). Sitting on page 4 of 3 showing nothing reads as
  "the delete broke the list". It steps to the new LAST page, not always page 1,
  and returns null when already on page 1 or within range — otherwise the effect
  would re-run forever.
- Changing a filter resets `page` to 1: page 7 of a narrower result set is
  usually past the end, and silently showing nothing looks like the filter
  matched nothing.
- `Pagination.jsx` returns **null when `totalPages <= 1`**, so a screen drops it
  in unconditionally. It is deliberately **hook-free**: with no jsdom a component
  can only be tested by calling it as the plain function it is, and a hook would
  make that throw. `Pagination.test.js` walks the returned element tree — keep it
  hook-free or that test cannot exist.
- A kit file that no screen imports yet is still compile-checked, because its
  `.test.js` sibling imports it. `npm run build` alone would tree-shake it away.

### Delete kit

- **`apiDelete(path)` in `src/lib/api.js`, never `apiSend('DELETE', path)`.**
  apiSend sets `Content-Type: application/json` with an empty body, and Fastify
  answers that with **400 `FST_ERR_CTP_EMPTY_JSON_BODY`** inside its content-type
  parser — before the route runs, so the response says nothing about the row you
  were deleting. `apiDelete` sends neither header nor body.
- **There is no pre-flight "can I delete this" request.** It is a second round
  trip that races the delete, and the API answers authoritatively in its 409
  (`{ message, blockers, archivable }`). This mirrors the API's own rule that
  duplicates are detected by the database and never pre-checked.
  `attemptDelete(del)` makes exactly one request and its test asserts the count.
- **On a 409 the dialog stays open.** Closing it and flashing a toast throws the
  explanation away at the moment staff need it. `describeBlockers(error, opts)`
  turns the body into `{ message, lines, archivable }`, `deleteDialog` swaps the
  copy to the explanation, and the confirm button **disappears** — the blockers
  will not have vanished a second later, so a retry can only fail again. Cancel
  stays; "Archive instead" appears only when the API said `archivable: true` AND
  the screen supplied an archive action.
- **`describeBlockers` falls back to `messageOf`** whenever the body is missing —
  a 404, a 403 self-delete, a network drop, a 500 with no JSON. That is the
  common path for every failure that is not "something still points at this", and
  skipping it leaves the dialog showing an empty explanation.
- `ConfirmDialog` sets `role="dialog"`, `aria-modal="true"` and
  `aria-labelledby`; **Escape cancels and focus lands on Cancel**, so a stray
  Enter after opening cannot delete a row. Its buttons are native `<button>`s
  carrying GhostButton's styling, *not* `GhostButton` — that component is a plain
  function component and does not forward refs, so `ref={cancelRef}` on it would
  be silently dropped and the focus rule would stop working with no error.
- `useCrudScreen` returns four namespaces (`list`, `toast`, `mutation`, `remove`)
  rather than one flat object: `error` means two different things here (the list
  failed to load vs this edit was refused), and flattening them renders a stale
  save error above a healthy table. Spread `remove.dialog` straight onto
  `<ConfirmDialog />`.

### CI

- `.github/workflows/ci.yml` runs `npm test` then `npm run build` on every pull
  request into `august-6th-updates`. `permissions: contents: read`, so the job
  token cannot push, tag or write to `master`.
- **There is no lint step because there is no ESLint in this repo** — which is
  precisely why `npm run build` is a gate and not a release step: it is the only
  compile check there is, and a bad import or a JSX syntax error surfaces
  nowhere else.
- No typecheck step: there is no TypeScript here. A template that adds one is
  wrong.

## Suppliers

- **`AdminSuppliers` (`/admin/suppliers`) is LIVE; `Suppliers` (`/suppliers`) is
  the demo screen and stays exactly as it was.** They sit side by side under one
  `suppliersTabs` strip ("Supplier master" → "Manage suppliers"), the same
  arrangement Catalogue and Price Lists use. The demo screen still reads
  `src/data/suppliers.js` + localStorage and shows the brand roll-up the office
  recognises; only the live tab's edits persist. The SideNav item carries
  `match: ['/suppliers', '/admin/suppliers']` or the nav goes dark on the new tab.
- **A supplier is who INVOICES Atelier; a brand is what a customer buys.** One
  supplier sells several houses, so the screen's detail panel lists the houses it
  invoices — the link itself is made on `brands.supplier_id`, not here.
- **Cost masking is per VALUE, not per row** (`termsSummary` in
  `src/screens/adminSuppliers.js` carries it as `rateFree`). A value that states
  the METHOD — "2 discount tiers", "Supplier default" — survives a login without
  `CAPS.FINANCE_VIEW`; a value quoting a RATE is replaced by `MaskedFigure`. A
  note that carries its rate in prose gets a `maskedNote` twin, because dropping
  the figure alone would leave the sentence lying. Same rule the demo screen
  already applies, and it is drawing only: the API's `requireRole('backoffice')`
  is the gate.
- **A discount chain is MULTIPLICATIVE and this screen never evaluates one.**
  `{0.4, 0.4}` is ×0.36, not −80%. The API resolves it and sends
  `net_multiplier`; the CRM formats what it was given. Summing a chain would
  undercharge Atelier by 44% of list on every metre.
- **Terms are read-only here.** `supplier_brand_terms` / `supplier_discount_tiers`
  have no write route — `npm run backfill:suppliers` populates them from the
  price lists and the vendored supplier snapshot. A row the API could not
  evaluate arrives with `invalid_reason` instead of a rate and is badged, not
  hidden: the API reports it per row rather than failing the whole supplier read.
- **No slug field and no currency default.** The slug is derived from the name on
  create and is never recomputed on rename (it is the key the backfill addresses
  a supplier by), and `currency` is the supplier's INVOICING currency — blank
  means "no invoice on file yet", which is why the form never fills it from the
  country. Jim Thompson is Thailand and invoices USD.
- **Archive is the verb that always works.** `brands.supplier_id` is RESTRICT, so
  a supplier invoicing a house can never be hard-deleted; `useCrudScreen` is
  given an `archive` action so the blocked dialog can offer "Archive instead"
  rather than leaving staff to unlink the houses — which would destroy the record
  of who invoiced them.
- `src/screens/adminSuppliers.js` holds every rule (paths, the archive verb, the
  field whitelist, `termsSummary`) with `adminSuppliers.test.js` beside it — the
  `.jsx` is layout only, because there is no jsdom here. Its `SUPPLIER_FIELDS`
  mirrors the API's frozen `SUPPLIER_UPDATE_COLUMNS`: a key declared here and
  missing there is stripped by Ajv's `removeAdditional` and saves nothing.

## Featured

- **`AdminBrands`'s "Featured on the storefront" panel is what replaced the
  storefront's hardcoded slug arrays.** Two strips — houses (the `/brands` "In
  focus" row) and collections (the homepage hero plus its latest row) — each
  saved with ONE whole-list `PUT` (`/admin/brands/featured`,
  `/admin/collections/featured`). Every rule lives in
  `src/screens/featuredOrder.js` with `featuredOrder.test.js` beside it; the
  `.jsx` is layout, because there is no jsdom here.
- **Position in the list IS the rank, and the submitted list is authoritative.**
  The API clears every rank and re-applies from the array in one transaction, so
  nothing in the CRM ever computes a rank number — which is exactly what makes a
  swap expressible without a collision — and anything the office removes stops
  being featured the moment Save lands.
- **A collection is named by the `(brand_slug, slug)` PAIR, never the slug
  alone**: a collection slug is unique per brand and never globally, so a
  slug-only body features another house's identically-slugged collection as well
  or instead. `GET /admin/collections` carries `brand_id` and `brand_name` but
  **not** the house slug, so `withBrandSlug` joins it on from the brands list
  before anything can be sent. An entry it cannot resolve blocks the save with a
  message rather than sending a null.
- **The panel reads both catalogue lists itself, archive-inclusive**
  (`FEATURED_SOURCE_PATHS`), rather than sharing the screen's houses list. That
  list follows "Show archived", and an archived row stays FEATURED on purpose
  (the public reads exclude it, and restoring it brings its position back) — so
  a list built from only the visible rows would silently unfeature it on the
  next whole-list save. The picker still refuses to feature an archived row
  anew; that is not the mirror case.
- **The panel follows the houses list rather than holding a reload of its own.**
  Its load effect is keyed on `crud.list.rows`, because every mutation on this
  screen ends in `list.reload()` — including the kit's delete, which a screen
  cannot hook — so a renamed, archived or deleted house reaches the strips
  through one cycle. The featured save goes through `crud.mutation.run` for the
  same reason: reloading the list is what pulls the saved ranks back. Cost: an
  unsaved reorder is discarded if another edit is saved first, the same lifetime
  `brandDraft` already has.
- **The houses screen calls two collection endpoints, and `adminCatalogue.test.js`
  says it calls none.** "leaves AdminBrands with houses only" asserts
  `not.toContain('/admin/collections')` under the comment "Not one collection
  endpoint is called from the houses screen any more" — true when collections
  moved to their own screen, false once this panel exists (it reads
  `/admin/collections?include_archived=true` and writes
  `/admin/collections/featured`). Both paths are constants in `featuredOrder.js`,
  so that scan still passes, for the wrong reason. **The invariant that actually
  survives is narrower and is asserted in `featuredOrder.test.js`: the houses
  screen holds no collection CRUD** — no draft, no fields, no row-addressed path
  — because ordering a storefront strip is not editing a collection. Whoever
  merges these branches should narrow W2's comment to say so.
- **Duplicates are impossible by construction, not by validation.** The API 422s
  an entry listed twice (`UPDATE … FROM` picks a matching source row
  non-deterministically, so a duplicate resolves to an arbitrary rank);
  `addFeatured` refuses one before it reaches the list. `FEATURED_LIMIT` is the
  CRM's copy of the API's `maxItems` cap (12), so the office is stopped at the
  twelfth rather than by a 400 after arranging thirteen.
- **The storefront timing asymmetry is a standing note on the panel**
  (`STOREFRONT_TIMING_NOTE`), not a footnote: `/brands` renders per request so a
  house reorder is live immediately, while the homepage is `prerender = true` and
  only picks a collection change up at the next site build. Unsaid, it reads as
  "I reordered the homepage and nothing happened".

## CRUD completion

Delete wired into the live screens, on top of the kit described under
Foundations. `AdminBrands` (houses) and `AdminProducts` (products) are the first
two consumers of `useCrudScreen`; before this, nothing in the CRM imported it.

- **A screen composes the kit; it never re-implements a step of the flow.**
  `useCrudScreen` gives back four namespaces — `list`, `toast`, `mutation`,
  `remove` — and a screen renders `<ConfirmDialog {...crud.remove.dialog} />`,
  calls `crud.remove.ask(row)` from the row's Delete button, and touches
  `apiDelete`/`attemptDelete`/`describeBlockers`/`deleteDialog` never. There is
  no jsdom here, so `src/screens/adminCatalogue.test.js` holds that with a source
  scan — the same idiom `useCrudScreen.test.js` uses on the kit itself.
- **`archive` is what makes "Archive instead" exist.** The kit reads
  `archive !== null` for the button and the API's `archivable` for whether the
  entity has an archive at all; both must be true. A screen whose entity is
  archivable and that forgets the option renders a 409 dialog offering only
  Cancel, with no error to say why.
- **"Archive instead" ALWAYS archives — it is not the row's Archive/Restore
  toggle.** It is offered on a *refused* delete, so pointing it at the toggle
  would answer the refusal by restoring an already-archived row: putting the row
  back on the website in response to a request to remove it. `archiveTogglePath`
  and `archiveInsteadPath` in `src/screens/adminCatalogue.js` are two functions
  for that reason, not one with a flag.
- **Only the permanent verb is drawn in `tone="danger"`.** Archive used to be,
  because it was the most destructive thing on the row; with a real Delete beside
  it, two red buttons would say the reversible one is as grave as the permanent
  one. Archive is now neutral.
- **A screen with a second list keeps its own `useMutation`.** `useCrudScreen`
  binds `mutation` to *its* list's reload, so AdminBrands (which also holds
  collections) builds a combined `reload` and calls `useMutation` itself, using
  `crud.toast.flash` so both paths share one toast. `crud.mutation` goes unused
  there, deliberately.
- **The open editor follows the list.** Both screens close the expanded row when
  it is no longer in `list.rows` — after a delete, and after an archive with
  "Show archived" off. Without it the next mutation's reload re-reads a row that
  is gone and reports a 404 the staff member cannot act on.
- **Neither `/admin/brands` nor `/admin/products` pages**: both return the whole
  list with no `meta` (so `readList` falls back to the row count) and neither
  declares a `page` param, which Fastify's Ajv strips rather than rejecting. The
  screens therefore pass `CATALOGUE_LIST_LIMIT`, a limit above any plausible row
  count, so `totalPages` stays 1 and nothing implies a pager that could not work.
  No `<Pagination />` is rendered on either screen.
- **A filter must arrive as `null` when it is unset, never `''`.**
  `buildListQuery` drops null/undefined/empty, so "All houses" is the absence of
  `brand_id`; forwarded as an empty string it would become `brand_id=`, which the
  endpoint's integer schema answers with a 400 that kills the whole list rather
  than one filter. `brandListFilters`/`productListFilters` are where that is
  expressed and tested.
- **`DELETE /admin/colourways/:id` has no UI yet.** Colourways are rendered from
  the product detail read rather than from a list of their own, and
  `useCrudScreen` binds one entity per screen, so the colourway rows still offer
  Archive/Restore only. `GET /admin/colourways` (paginated, filterable by
  `product_id`) exists for whoever gives them a screen.

`AdminCollections` (`/admin/collections`) is the third catalogue screen, split
out of AdminBrands' expanded house row.

- **A second list inside another screen's editor is a screen that has not been
  written yet.** Collections were reachable only by knowing their house first,
  editable two fields at a time, and the reason AdminBrands had to build a
  combined `reload` and call `useMutation` itself. Moving them out gave them a
  filter, a create form, a Delete and the by-id read — and left AdminBrands with
  one list, so it now takes `crud.mutation` straight from the kit. Look for this
  shape whenever a screen holds a list it did not name itself after.
- **A collection slug is unique per HOUSE, never globally**
  (`collections_brand_id_slug_unique`) — and so is the display name in practice,
  because the seed strips the house prefix off the vendored titles. A
  catalogue-wide list therefore really does show several "Cappuccino"s, and
  "Delete “Cappuccino”?" is a question three houses can answer. Rows are keyed
  and addressed by `id`, the house is the first column, and everything that names
  a row to a person goes through `describeCollection`, which appends the house.
  The same rule bites any future screen that lists a per-parent-unique child
  across all its parents.
- **A house-scoped filter that another screen links into belongs in the URL, not
  in state.** `collectionsPath(brand)` is `/admin/collections?brand_id=<id>` and
  AdminCollections reads it with `useSearchParams`; held in `useState` instead,
  the link would be ignored whenever the screen was already mounted, and the back
  button would not undo the filter.
- **The house is create-only.** `PATCH /admin/collections/:id` takes
  name/description/image_url only — moving a collection between houses would
  strand its products, whose `brand_id` is a direct FK — so the editor renders it
  read-only, and the create form has its own `CREATE_ONLY_FIELDS`, exactly as
  AdminProducts does for `brand_id`/`product_type`.
- **The expanded row is where `GET /admin/collections/:id` earns its keep.**
  `product_count` is on the detail read and not on the list, and it is the only
  advance warning that Delete will be refused — the kit forbids a pre-flight
  "can I delete this" GET, so the count a staff member is already looking at is
  where that has to come from. It counts archived products too, matching the
  delete probe: `products.collection_id` is SET NULL, so an unprobed delete would
  report success while silently uncollecting every one of them.

`AdminShipping` (`/admin/shipping`, Orders → Freight rates) is the first live
screen for a table nothing in the CRM could edit: the tiers were seeded once and
changed only by the bulk `PUT`, by hand.

- **A screen whose entity has no archive passes `useCrudScreen` no `archive`
  option, and that is the whole handling.** `shipping_rates` has no `archived_at`
  column, so the API's refusal says `archivable: false`; the kit needs both that
  and a supplied action, so the 409 dialog correctly renders Cancel alone. There
  is nothing to add and nothing to branch on — the only mistake available is
  inventing a second button for an endpoint that does not exist. Same for
  `inventory`, whose delete refusal has the same shape.
- **A negative source scan for "this screen offers no archive" must match the
  PATH, not the word.** `not.toContain('archive')` fails against the comment
  explaining why there is none; `not.toContain('/archive')` is the token a screen
  could only have by calling the endpoint. Same family as the `useMutation`
  comment that tripped US-010's first scan.
- **An advance warning derived from rows already on screen is not a pre-flight.**
  A zone's last tier cannot be deleted, and `annotateTiers` marks it `sole` by
  grouping the list the screen has already fetched — no second request, so the
  rule the kit states (the 409 is authoritative, a check beforehand races it)
  is untouched. The prohibition is on asking the API again, not on reading what
  it already said.
- **`(zone, threshold_qty)` is an identity key, so only the rate is an input.**
  The quote resolves against the pair and the seed upserts on it; moving either
  is a delete plus a create, and `PATCH /admin/shipping-rates/:id` accepts
  `rate_cents` alone (declared `required`, not `minProperties: 1`, because Ajv
  strips the immutable keys *after* `minProperties` is evaluated). The row shows
  the zone and the floor as text and offers one box.
- **The band a tier covers is not its floor.** `getShippingQuote` takes the
  highest floor `<= qty` and falls back to the lowest tier when the quantity is
  under every floor, so the lowest tier is described by its ceiling alone
  ("under 20 items"). A zone whose lowest floor is 5 still quotes that tier for
  one item, and a band reading "5 to under 20" would describe a gap that cannot
  happen.
- **A zone is not a table** — it exists only while it has tiers, which is why the
  create form's zone box is a free text input over a `<datalist>` of the zones in
  use (typing a new name is how a zone is created) and why deleting the last tier
  is refused rather than allowed to empty one.

`AdminStock`, `AdminPriceListItems`, `AdminOrders` and the two account rosters
(`ClientAccounts`, `UserManagement`) are the last screens onto the kit; their
pure half is `src/screens/adminLists.js`. With them, **every live list screen in
the CRM composes `useCrudScreen`** and the five copy-pasted paginators are gone.

- **The five paginators were on four Dynamics mirror screens plus one live one**
  (`ClientsList`, `PriceLists`, `Reserves`, `SalesOrdersList`, and
  `AdminPriceListItems`) — each with its own `Math.max(1, Math.ceil(total /
  LIMIT))` and its own Previous/Next pair. The mirrors are read-only and keep
  their hand-rolled fetch (there is no live list to give them), so they take
  `pageCount` + `<Pagination />` and nothing else; only the arithmetic and the
  buttons were shared to begin with. A test scans all five for `Math.ceil(` and
  `Previous` so a sixth copy cannot appear quietly.
- **`<Pagination />` is dropped in on every one of these screens, including the
  four whose endpoint does not page.** It returns null at `totalPages <= 1` and
  `UNPAGED_LIST_LIMIT` sits above any plausible row count, so the rendering is
  identical to AdminBrands/AdminProducts, which render none at all — the
  difference is only that the day one of these endpoints gains `page`, the screen
  already has the pager. `/admin/price-list-items` is the one list in the CRM that
  genuinely pages, and therefore the kit's first real consumer.
- **A stock row has no `id`.** `inventory` is one row per colourway and the read
  model returns `colourway_id` alone, so `useCrudScreen`'s default delete path
  (`${path}/${row.id}`) would send `DELETE /admin/inventory/undefined`.
  `stockDeletePath` is what the `deletePath` option exists for; check the read
  model's projection before trusting the default on any new screen.
- **Delete and create are one feature on Manage stock, not two.** A colourway
  whose stock row is deleted disappears from `GET /admin/inventory` entirely, so
  shipping the delete alone would make it unrecoverable from the CRM. The "Put a
  colourway back into stock" panel searches `GET /admin/colourways` — which
  reports `inventory: null` for exactly those rows — because nothing on a list can
  show what is absent from it. Same shape for any future screen that deletes a
  row its own list is keyed on.
- **`useCrudScreen` discards a delete's response body**, so an API that qualifies
  its success cannot reach the toast. `DELETE /admin/price-list-items/:id` returns
  a `warning` saying the next `npm run import:pricing` re-creates the row; a
  caveat that arrives after the deletion is not a caveat, so it is shown in the
  confirmation instead. `withDeleteCaveat(dialog, copy)` rewrites the **ask**
  step's body and leaves a refusal's alone — `confirmLabel` is the step marker
  (`'Delete'` while asking, `null` once the API has refused, whose body is the
  API's own sentence). Overriding a prop after spreading `remove.dialog` is
  composing the kit; re-implementing `deleteDialog` would not be.
- **A row's name in the dialog has to identify it across the whole list, not
  within its parent.** `describeRate` leads with the supplier because a code is
  unique only within `(supplier, category)` — the same identity-key rule that
  makes `supplier` create-only — and this list spans every supplier at once.
  `describeAccount` uses the email, never `name`, which is nullable and freely
  duplicated. Same rule `describeCollection` follows for its house.
- **An order deletes only where the API allows one, and only through the kit.**
  `order` was `deletable: false` until manual sales orders arrived — an order the
  office keyed by mistake, and a request nobody priced, have to be removable —
  and the two dangers behind that flag now live in the API's registry entry
  instead: `orderGuard` refuses a card checkout (the record of a Stripe payment)
  and anything past `paid`, while `beforeDelete` hands the reservation back
  before the lines CASCADE away. The screen mirrors the guard with
  `canDeleteOrder` (`src/admin/orderFlow.js`) so the button appears only where it
  would succeed, and wires `crud.remove` + `<ConfirmDialog>` like every other kit
  screen; the `archive` option is what puts "Archive instead" on a refusal, which
  for a paid order is the only way out. The test asserts the kit is used rather
  than a hand-rolled `apiDelete`, and that the control is gated.
- **A sales order is raised at `/admin/orders/new` (`AdminOrderNew`), and an
  incoming web request is priced in place on `AdminOrders`.** They are one
  feature: a storefront request arrives with every line at 0, and pricing it —
  setting unit prices, adding or removing lines — is the same PATCH the create
  form's body is built from. Both drive `OrderLinesEditor` (`src/admin/`), which
  owns the catalogue search and the two inline creates: **"Other colour"** POSTs
  a real colourway onto an existing design, and **"New design"** POSTs the
  product then its first colour. Both are ordinary catalogue writes, so anything
  invented mid-order is a permanent catalogue row the storefront and every future
  order can see — which is the point, and why the SKU is typed rather than
  generated. The rules are pure and tested: `draftFromLine` / `draftFromColourway`
  / `buildLinePatch` / `buildCreateLines` in `src/admin/orderFlow.js`, and the
  attribution rule (an account, or a walk-in's details, never neither) in
  `src/screens/adminOrderNew.js`. `/sales-orders/new` is untouched and still the
  demo screen writing to localStorage.
- **Archive stays `tone="danger"` on Web orders even though the screen now has a
  Delete**, which looks like a violation of "only the most permanent verb is red"
  and is not: Delete is offered on a minority of rows (a paid or shipped order can
  never have one), so archive is still the most permanent verb most rows carry —
  and a row whose only red button vanished as it moved to `paid` would read as
  having lost an action rather than gained a state.
- **`UserManagement` is the only screen where a self-delete can happen**, because
  it is the only one that lists the signed-in staff account — `segment=clients`
  never returns one. The API answers 403 (a delete has no body to refuse; the
  caller is simply not permitted), which reaches the dialog with `blockers: []`
  and `archivable: true` — no count lines, and "Archive instead" as the only way
  forward. Wiring Delete on `ClientAccounts` alone would leave that path
  unreachable from the UI.
- **A patch bound to server truth needs no revert on failure.** `UserManagement`
  used to reconcile a PATCH into local state and call `load()` to undo a refusal;
  with the list owned by the kit, the `<select>` and the approval tick read the
  row's saved value, so React re-renders them correctly the moment the mutation
  fails. `useMutation` deliberately does not reload on error, and does not need to.

## Category export

`AdminProductSheet` (`/admin/product-sheet`, Catalogue → Categories) is the
spreadsheet round trip that fills in `products.category`: download one house's
designs as a CSV whose Category column is empty, type into it in Excel, upload
it to be checked, read the report, then apply. Every rule lives in
`src/screens/adminProductSheet.js` with `adminProductSheet.test.js` beside it;
the `.jsx` is layout, because there is no jsdom here.

- **The report comes before the write, structurally.** The API is two routes —
  `POST /admin/product-sheet/validate` (writes nothing) and
  `.../apply` (one transaction) — rather than one with a `?dry_run=` flag, and
  the Apply button does not exist until the dry run has come back clean
  (`canApply`). Choosing a file checks it straight away, because the office's
  first question about a sheet it has just filled in is "is this right?".
- **Apply posts the FILE again, never the dry run's report.** A list of updates
  handed back by a client is a list the client could have edited, so the API
  re-parses the bytes and recomputes; the counts shown after an apply are its
  own, and `applied` is the UPDATE's row count rather than the prediction.
- **This screen never reads the file.** No `FileReader`, no CSV parsing — a
  second opinion about what is in the sheet is a second implementation of the
  parser, and the two would disagree the first time either changed. Only the
  three mistakes the API answers less readably than it could are pre-checked
  (`fileProblem`: no file, an empty one, one past the 4 MB body limit, and an
  `.xlsx` — which the API can only report as a broken header row).
- **`?brand=` must never be sent empty.** The API applies its default through
  Ajv's `useDefaults`, which fires only when the key is ABSENT; `?brand=` is
  present, so it is measured against `^[a-z0-9-]+$` and 400s. That is the
  opposite of `buildListQuery`, which drops an empty filter precisely so it
  never reaches the API — so `exportPath` returns **null** for a blank house and
  the screen refuses rather than sending one.
- **The upload's content type is stated, never forwarded from the file.** The
  route registers a Buffer parser for `text/csv`,
  `application/vnd.ms-excel` and `application/octet-stream` only. A browser
  reports a `.csv` as any of those — or as `text/plain`, which the ROOT Fastify
  instance owns: the body would arrive parsed into a string, `Buffer.isBuffer`
  would be false, and the office would be told to "post the sheet as the raw
  file" about a file it did post.
- **`apiDownload(path)` in `src/lib/api.js`, never `apiFetch`.** apiFetch parses
  JSON and returns null for every other content type, so a CSV fetched through
  it arrives as nothing at all. It returns `{ blob, disposition }` and the
  disposition is usually **null**: `Content-Disposition` is not a
  CORS-safelisted response header and the API does not expose it, so cross-origin
  the filename is invisible and `filenameFrom` falls back to the API's own
  naming rule (`atelier-product-sheet-<slug>.csv`, built from the slug because a
  house NAME is free text and can carry a quote or a CR).
- **A 422 is a report, not an error line.** Both routes refuse a broken sheet in
  the same words — `{ message, errors: [{ row, message }], error_count, summary }`
  — so `refusalFrom` is the only place that reads it and one panel serves both
  buttons. Rendering only `message` would throw away the row numbers, which are
  the only thing that lets a person find the row in Excel. `errors` is capped at
  50 and `changes` at 200 with the true counts beside them, so `cappedNote` says
  so rather than letting a cap read as "that was all of them".
- **The panel states the four legal categories because the sheet cannot** — a CSV
  has nowhere to put a note Excel will not hand back as a data row.
  `CATEGORY_VALUES` mirrors the API's `PRODUCT_CATEGORIES`, which imports the
  vocabulary from the pricing pipeline's registry: `products.category` and
  `price_list_items.category` are one set.
- **A blank Category means "not got to yet", not "clear it".** That is why the
  export leaves the column empty and why a part-finished sheet is safe to
  upload; re-uploading a finished one is a no-op (`applied: 0`), because a stated
  category equal to the stored one counts as unchanged and is never written.

## Reporting

The Report Library (`/reporting/library`) is now two kinds of screen at once, and
which one you are looking at is stated on the panel rather than left to be
inferred.

- **Three of the twelve reports are LIVE** — R-05 (`notinvoiced`), R-10 (`stock`)
  and R-11 (`brandtype`) — fetched from atelier-api's `/admin/reports/*` through
  `apiGet`. The other nine are still the indicative fixtures in
  `src/data/reportLibrary.js`. `liveReportPath(key)` in
  `src/utils/reportBuilders.js` is the single place that decides which is which;
  the screen branches on it and nothing else.
- **The mapping is by QUESTION, not by name, and two of the three are imperfect
  in a way worth knowing.** R-11 asks for brand × product type and the live report
  answers house × design carrying a type column; R-10 asks for holdings *with a
  valuation* and the live report has no landed cost to value them with (A1 is
  still open, so the API declares no cost column rather than writing a
  placeholder). R-05 is the closest fit of the three.
- **THE SERVER IS THE ONLY AUTHORITY ON A LIVE TABLE.** `applyReportAccess` must
  never run over one: atelier-api's `maskReport` already deleted every column this
  login may not have, *before the payload existed*. Running `REPORT_POLICY` on top
  would act on labels that are not there — R-10's `financeTotalRow` would drop a
  totals row carrying no cost at all — while implying this client had a say in it.
  So the "this table is partial" note comes from `meta.masked_columns`, the
  server's own list of LABELS, and the policy's `reportIsMasked` is consulted only
  for a fixture report. One report, one authority.
- **A live report draws NO demo control.** The Period / View / Brand / Design
  pills parameterise a fixture and reach nothing on the server, so they are hidden
  rather than left live — the same rule that hides the period pills on R-12's year
  view. Wiring the API's real filters (`from`, `to`, `brand`, `product_type`,
  `collection`) to one shared bar is its own story; until then a live report is
  fetched unparameterised, at the API's default row limit.
- **"Could not reach the API" and "there are no rows" are opposite answers and get
  different panels.** A failed fetch renders the API's own sentence (it phrases a
  403 and a 400 well) under "Could not load"; an empty population renders the
  report's coverage note under "Nothing to show". Drawing an empty table for the
  first would present a question nobody asked as an answer.
- The load effect is keyed on the **path**, a primitive — an effect keyed on an
  object literal takes a new identity every render and refetches for ever — and
  carries the `active` flag every load effect here does, because StrictMode
  double-mounts.
- **`accessOf` prefers the API's derived `report_access` over the capability map**
  (`src/auth/roles.js`; `AuthContext.toCrmUser` carries it through verbatim).
  `STAFF_ROLE_MAP` gives every back-office login the demo's full *director*
  capability set, so until this preference existed the CRM's masking had never
  fired once — a showroom login was drawn every cost figure the API had already
  agreed to withhold. `reports` maps to `all` and `finance` to `finance`; anything
  that is not literally `true` reads as a denial.
- **The caps stay as the FALLBACK and must not be deleted.** The seeded demo
  roster carries no `report_access`, and neither does a break-glass session (there
  was no API to ask — see `toOfflineUser`), so the demo screens resolve through the
  capability map exactly as they always did. An absent statement is `null`, never a
  defaulted `{ reports: false }`: inventing one would lock the library out of a
  build whose API had not been updated yet.
- **`toCSV` (`src/utils/exporters.js`) now neutralises formula lead-ins**
  (`= + - @ TAB CR` get an apostrophe), matching atelier-api's `src/lib/csv.js`.
  These exports carry house and design names typed by staff — and, on a live
  report, straight out of the platform — into a file built to open in Excel, where
  `=HYPERLINK`/`=WEBSERVICE` exfiltrate. Widen it there, or not at all.
- **The live export button is still the CLIENT-side writer**, flattening the rows
  the screen holds. atelier-api serves the authoritative file at
  `/admin/reports/<report>/export.csv` (every row, its own notes block), and
  pointing the button at it needs a download helper in `src/lib/api.js` — a blob
  path that does not exist yet, since `apiFetch` parses JSON and returns null for
  anything else. That is the next step, not a decision to revisit.
- Rules live in `src/utils/reportBuilders.js` (`buildLiveReport`, `liveNote`,
  `liveMaskedNote`, `liveReportPath`) with `reportBuilders.test.js` beside them and
  the `.jsx` kept to layout — there is no jsdom here, so the envelope mapping is
  tested against a payload transcribed from the API's own shape.

## Samples

`AdminSamples` (`/admin/samples`) and `AdminShowrooms` (`/admin/showrooms`) are
LIVE — they read AND write atelier-api's own tables. They sit in the samples tab
strip beside the demo `SampleTracking` (`/samples`) and `SampleScanner`
(`/sample-scanner`) screens, which are still backed by `src/data/*.js` +
localStorage and are deliberately left exactly as they were. Same arrangement
Catalogue, Suppliers and Price lists use: only the live tabs' edits persist.

- **Overdue is the API's value and is never recomputed in the browser.** Every
  sample row carries `overdue`, derived server-side at read time from the open
  loan's due date; `loanState(sample)` in `src/screens/adminSamples.js` reads the
  boolean and chooses words for it. A browser comparing the dates itself would
  answer with the DEVICE's clock and time zone — a showroom laptop set an hour
  fast would chase a client whose sample is not late — and would disagree with
  the very `overdue=` filter that fetched the row. `adminSamples.test.js` holds
  it two ways: a row whose due date is long past while the API says `false` must
  read "Out with…", and a source scan bans `Date.now(`, `new Date(`,
  `Date.parse(` and `getTime(` from BOTH the module and the `.jsx`. The
  behavioural test alone would pass against a helper added later.
- **Nothing from the Dynamics cutting staging table is displayed.** Its
  free-text staff column is the back office's scratchpad and carries third
  parties' names, emails, phones and home addresses in current rows. Both screens
  read `/admin/samples` and `/admin/showrooms` only; `notes` on a sample row is
  the platform's own staff-typed field and is a different thing. The source scan
  bans the PATH, the TABLE NAME and the field ACCESS rather than the English
  words, so a comment may still explain why the rule exists.
- **“Out” is not a status the form may write.** It is the one status that asserts
  an open loan exists, and only `POST /admin/samples/:id/check-out` writes both
  tables in the transaction that makes it true. `WRITABLE_SAMPLE_STATUSES` is
  DERIVED from `SAMPLE_STATUSES` by filter (never re-typed), the form's select
  offers the writable set and the LIST filter offers the full one — filtering for
  what is out is the register's headline question. Offering `out` in the form
  would put a 400 behind a reasonable-looking choice.
- **A movement is a verb, and the row offers whichever one is possible.**
  `movementVerb(sample)` reads `open_loan`, NOT `status`: the loan row is what
  the movement writes and what the one-open-loan partial unique index guards, so
  if the two ever disagree the loan is the truth. Check-out takes a required
  holder name (a snapshot — the loan keeps it whatever happens to the account)
  and an OPTIONAL due date; a blank date is omitted rather than sent as null,
  because the API types it a string and inventing one would make the sample
  overdue on a deadline nobody set.
- **`overdue` is a TRI-STATE filter and must stay one.** Absent leaves the list
  alone, `true` is the chase list, `false` is "not late back" — out ON TIME or on
  the shelf, which is a different question from "on the shelf" (that is
  `status`). So it is the one filter `sampleFilters` does not pass through
  `value || null`: that idiom would erase the `false` case. Everything else does,
  because `buildListQuery` drops null/undefined/empty and an "All" select
  forwarded as `''` becomes `status=`, which the endpoint's enum answers with a
  400 that kills the whole list.
- **A showroom cannot usually be hard-deleted, so both screens supply an
  `archive` action.** `sample_orders.showroom_id` is NOT NULL + RESTRICT and
  `samples.showroom_id` is probed, so the 409 arrives with `archivable: true` and
  the dialog needs a supplied action to offer "Archive instead". Same for a
  sample with any loan history. `archiveTogglePath` and `archiveInsteadPath` are
  two functions, not one with a flag — "Archive instead" is offered on a REFUSED
  delete, so pointing it at the row's toggle would answer a request to remove the
  row by restoring it.
- **The showroom editor's "What points here" panel is not a pre-flight.**
  `GET /admin/showrooms/:id` carries `sample_count` and `sample_order_count`
  (archived rows included, matching the probes), and `holdsSummary` phrases them.
  It is read from the detail a staff member has already opened — reading what the
  API said, not asking it again, which is the distinction `AdminShipping`'s
  `annotateTiers` draws.
- **`describeSample` leads with the barcode**, which is unique across the whole
  register, because a label ("Atlas hanger") is freely duplicated — the same
  identity rule `describeCollection` follows for its house and `describeRate` for
  its supplier.
- **The colourway link is still an id box.** The showroom and supplier pickers
  are `<select>`s read whole from their endpoints, but `colourways` is ~19k rows
  and needs a search UI like Manage stock's; the row displays the resolved design
  and house names from the API, so a wrong id is visible. A picker is owed.
- **The SideNav's Samples item does not light on the new tabs.**
  `layout.jsx` is outside this workstream's allowed files and its `match` array
  lists `/samples` and `/sample-scanner` only. Cosmetic, and one line for whoever
  owns that file: add `/admin/samples`, `/admin/showrooms` and
  `/admin/sample-orders`.

`AdminSampleOrders` (`/admin/sample-orders`) is the showroom-stocking screen,
and the scanner (`/sample-scanner`) is LIVE as of W4-US-009. The demo Tracking
and Showroom screens are retired: `/samples` redirects to the register and
`/showroom-samples` to sample orders (`<Navigate replace>`, the
`/users/applicants` rule — a bookmark must not fall into the catch-all), their
tab is gone from `samplesTabs`, and their files sit on disk unrouted.

- **`sampleFlow.js` mirrors the API's sample-order state machine** — the same
  arrangement `orderFlow.js` has with web orders. The API
  (`src/samples/sample-order-states.js` there) is the authority and answers a
  wrong move with a 409; the mirror is so staff are never shown a door that is
  locked. `availableMoves(order)` is the only way the screen draws transition
  buttons (archived and terminal rows get none), and `sampleFlow.test.js`
  carries a literal second copy of the transition map so a hand-edit cannot
  drift silently.
- **A move is a verb, not a status PATCH.** `status` is absent from
  `SAMPLE_ORDER_FIELDS` exactly as it is from the API's PATCH whitelist —
  Ajv's removeAdditional would strip it silently, so the whitelist is the real
  defence — and every move posts `POST /admin/sample-orders/:id/transition`
  `{ status }`, which writes the state AND the stamp that dates it. A create
  always lands in `requested`.
- **Delete is greyed outside requested/cancelled rather than discovered.**
  `isDeletableStatus` is the shared predicate behind the registry's guard; the
  API's 409 stays authoritative if the row moves under the button. An order
  past `requested` is a commercial record, so the kit is given an `archive`
  action and the blocked dialog offers "Archive instead".
- **The history line renders the API's stamps verbatim.** `stampEntries` is
  machine-ordered (so `.at(-1)` is "the furthest the order has been", even when
  stamps were back-dated), and `stampDate` slices the ISO string — no Date is
  ever constructed, the same clock rule the register's overdue follows.
- **The scanner is one autofocused input, and now a camera beside it.** A
  barcode wedge scanner is a keyboard: it types the code and its Enter submits
  the lookup, so the box needs nothing installed and is still the fast path at a
  counter. The flow is by-barcode, then whichever of
  check-out/check-in `movementVerb` says the OPEN LOAN allows — never the
  status — through the same `byBarcodePath`/`checkOutBody` helpers the register
  uses, so the two surfaces cannot drift. The by-barcode 404 is rendered as an
  outcome (a real tag the register has never heard of, with a link to register
  it), not an error — `isNotFound` in `adminSamples.js` is the distinction, and
  the lookup deliberately does not go through `useMutation`, whose catch would
  flatten that outcome into the error line.
- **The camera is first-party and the decoder is chosen per device** (W22, and
  the reason ADR 001 in atelier-api is superseded — the full options matrix, the
  measured bundle numbers and the iPad test procedure are in
  `docs/scanner-decoder.md`). Three rules, each of which is what makes the
  fourth runtime dependency defensible:
  - **`BarcodeDetector` does not exist on iOS** — Safari does not implement it
    and every iOS browser is WebKit underneath, so it fails SILENTLY, the
    constructor simply being absent. `scannerCapability` (`src/screens/scanner.js`,
    pure + tested) turns that into a choice — `native` / `wasm` / `wedge-only` —
    and `wedge-only` is not a failure state: it is a plain-http page, or a device
    with no camera, each saying which it is. `getUserMedia` is secure-context
    only, so an https address is a deployment requirement, not advice.
  - **The decoder is behind `await import('./scannerDecoder.js')` and nothing
    else in the app imports that module** (a test scans every `.js`/`.jsx` under
    `src/` to hold it). So Android and desktop Chrome decode natively and
    download nothing, and the ~1 MB WebAssembly is an iOS-and-Safari cost paid
    once, on first use of the camera. The main chunk grew by 2.9 kB gzipped —
    the screen, not the decoder.
  - **The `.wasm` is served from our own origin.** zxing-wasm's default
    `locateFile` points at jsDelivr, which would put a showroom scan behind a
    third party — the one thing the client ruled out. A Vite `?url` import plus
    `prepareZXingModule({ overrides })` is what replaces it; the test bans a
    hosted URL from all three scanner files.
  - What a camera CANNOT be tested for here: there is no jsdom, no browser in CI
    and no camera, so **no decode has ever been proven**. The state machine, the
    debounce and busy interlock (`admitRead` — a video stream decodes the same
    tag four times a second, and without it a check-out posts twice), the shape
    guard and the capability decision are all pure and tested; `readBarcodes`,
    `getUserMedia` and the canvas frame grab are not, and are quarantined in
    `scannerDecoder.js` for that reason.
