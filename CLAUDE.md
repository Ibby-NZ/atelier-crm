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
  `AdminOrderNew` (`/admin/orders/new`), the three purchase-order screens
  (`AdminPurchaseOrders`, `AdminPurchaseOrderNew`, `AdminPurchaseOrder` under
  `/admin/purchase-orders`), `AdminXero` (`/admin/xero` — the Xero connection
  and bulk syncs, C4; the invoice push button lives on `AdminOrders` and
  renders only when `/admin/xero/status` answers configured+connected, so an
  un-integrated deployment shows the manual-reference flow unchanged), plus
  `UserManagement`
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
  `SalesOrderNew`, `ClientNew`, `Cutting`, `Samples`,
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
stock; Price lists / Import / Supplier rates; Sales orders / Purchase orders /
Dynamics (historical) / Freight rates;
Clients / Applicants). Tab sets — and the header ACTIONS a section offers — live in
`src/components/sections.js` (pure, with `sections.test.js` beside it);
`sectionTabs.jsx` is the strip's layout and re-exports them, so every screen's
existing `import { SectionTabs, ordersTabs } from '.../sectionTabs.jsx'` is
unchanged. The SideNav item's `match` array in
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
  (`elizabethd@atelier.co.nz`, `STAFF_TEMP_PASSWORD`, default
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
- Order discounts (Rebecca-R2): 0/5/10% are standard tiers any staff login may
  set; **Custom is director-only** — the one place the CRM tells `backoffice`
  and `director` apart, via `useAuth().user.apiRole` (the CRM capability role
  maps both to `director` and cannot). The API's in-handler role check is the
  real gate (403 surfaces inline); the rules live in
  `src/screens/orderDiscount.js`, which mirrors atelier-api's
  `src/orders/discounts.js`. An untouched draft builds a **null** patch before
  the director refusal, so back-office users can still edit lines on a
  director-discounted order; the printed discount amount is derived from the
  server's `subtotal + shipping − total`, never recomputed from the pct.

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
- **Terms are WRITABLE as of W23** (`SupplierTermsPanel.jsx` inside the expanded
  supplier row); they were read-only while `npm run backfill:suppliers` was the
  only writer. Four things about that panel:
  - It reads the **standalone** list (`GET /admin/suppliers/:id/brand-terms`),
    not the terms embedded in `GET /admin/suppliers/:id`. The embed is keyed per
    LINKED house and silently drops any terms row whose brand does not point at
    this supplier; the standalone list keys on `supplier_id` alone.
  - **Every write answers with the resolved `net_multiplier`, and it is flashed
    immediately** (`termsSavedNote`). A chain is the one field nobody can check
    by eye — `{0.4, 0.4}` is ×0.36 — and a typo moves every price under that
    house. Nothing in the CRM multiplies a chain out; a test scans
    `adminSuppliers.js` for `reduce(` and `*=` to keep it that way.
  - Rates are typed as **fractions** (0.4 = 40%), matching the column and the
    API's own refusals, with `pctText` echoing each one. That is formatting a
    single rate, not resolving a chain.
  - **The terms routes are finance-gated on top of the backoffice role** (they
    need `can_view_finance`, because `backoffice` covers the showroom as well as
    the accounts desk). A 403 renders a `LockedPanel` carrying the API's own
    sentence — `isFinanceRefusal` is the distinction, and it is the whole
    handling: there is no capability guess in the CRM.
  A row the API could not evaluate arrives with `invalid_reason` instead of a
  rate and is badged, not hidden: the API reports it per row rather than failing
  the whole supplier read.
- **`PATCH /admin/brands/:id { supplier_id }` is the only way a house is linked
  to a supplier, and the terms panel is the only place in the CRM that sends
  it.** A terms row is per BRAND, so a brand-new supplier with no houses has
  nowhere for its terms to show on the detail read — and a purchase order for an
  unlinked house is a 422. The read-only summary block above the panel is
  deliberately kept: it is the per-HOUSE view (masked per value), while the
  panel is the terms-row view.
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

## The category vocabulary (`src/lib/categories.js`)

`category` is ONE list of nine values, and it is stated **once** for this repo.

- **It used to be written out three times** — `adminProductSheet.js`,
  `adminFreight.js` and `AdminPriceListItems.jsx` each declared their own copy, so
  widening it from four values to nine meant finding all three (and two test
  pins). The first two now take it from `src/lib/categories.js` and export it on,
  so every existing `import { CATEGORY_VALUES } from './adminProductSheet.js'` is
  unchanged; `src/lib/categories.test.js` asserts all three are the SAME frozen
  array, which is what stops a fourth copy appearing quietly.
- **The report filter bar WAS that fourth copy**, and it is the case that shows
  why a stale copy is not always a caught failure: `REPORT_CATEGORIES` in
  `src/utils/reportFilters.js` stayed four values long, so when the drill-down
  put a `cushion` or a `towel` row's category into the bar the table narrowed
  correctly while the Category select rendered BLANK — a controlled select whose
  value has no matching option has `selectedIndex -1`, and the reader sees an
  unfiltered-looking bar over a filtered table. It is now `CATEGORY_OPTIONS`
  itself, pinned by the same identity assertion.
- **`import` then `export`, never `export … from`.** A bare re-export does not
  bind the name in the re-exporting module's own scope, and `rateBody` in
  `adminFreight.js` validates against it — so the bare form builds fine and
  throws `CATEGORY_VALUES is not defined` at the first freight-rate save. Caught
  by that file's own suite; do not "tidy" it back.
- **The list mirrors THREE API columns at once** (`products.category`,
  `price_list_items.category`, `supplier_freight_rates.category`), which carry
  identical CHECKs — atelier-api's own test compares the three definitions to
  each other, because a value in one and not the others silently stops matching
  rather than failing. Widen this file only AFTER the API's migration ships; a
  stale copy here is a caught failure (the API's schema 400s an unknown value),
  never a wrong answer.
- **`categoryLabel` falls back to the RAW VALUE, never to blank.** The CRM and
  the API deploy separately, so a CRM can be a version behind; a row rendering as
  an empty cell reads as "no category" when the truth is "a category this build
  has not been taught". Blank is reserved for a genuinely absent category.
- **The products list narrows by house, category and price band.** House is the API's filter (`brand_id`); category and price band narrow the LOADED rows client-side (`matchesProductFilters`, `src/lib/priceBands.js`, tested) — the API's product list filters by house only, and the list is one page of up to `CATALOGUE_LIST_LIMIT`, so nothing on a later page is missed. The bands are the storefront's: $100 wide, "Under $100", "$100–$200", "$201–$300" … (band 1 closed at both ends, each later one from the previous ceiling plus one), banded on retail first and trade where there is no retail, with "No price" as its own row so the office can find what still needs pricing. The band dropdown lists only the bands present in the loaded list. The count reads "N of M shown" once either narrows.
- **`category` is not `product_type`.** `product_type` (`fabric | finished_good`)
  decides the colourway's stock unit and is create-only; `category` is the
  merchandising axis a shopper browses by, and it is editable. A cushion and a
  throw are both finished goods.
- **`AdminProducts` is the single-design door onto `products.category`** — until
  it existed the column could only be written in bulk, by uploading a CSV through
  Catalogue → Categories. Blank clears it; the list column shows an em dash for
  uncategorised, because most of the catalogue still is.
- **`Reserves` shows a DERIVED category.** The API computes it from the stock
  row's `item_type`, so nothing stores it and a correction made in the panel (the
  type is an overridable D365 column) moves the category with it. Where the
  vocabulary has no word for the type the API sends null and the screen falls
  back to the raw item type — an em dash there would say D365 holds nothing,
  which is not what is true.

## Size and description (`products.size`, `products.description`)

The two columns that let a finished good say what it actually is. Before them a
duvet cover could not state whether it was a queen or a king, and a towel could
not tell a face cloth from a bath sheet — the office was writing both into the
product NAME, where nothing can read them.

- **ONE PRODUCT PER SIZE, and price is the reason.** `retail_price_cents` and
  `trade_price_cents` are on the product; a bath sheet and a face cloth are
  different prices, so they are two rows ("Galata Bath Towel", "Galata Hand
  Towel"), not two variants of one. **`colourways` stays the COLOUR axis** and
  the inventory unit. Holding size on the colourway instead would mean moving
  price onto it and re-pointing every order line, price read and stock screen —
  that is the change this deliberately is not.
- **Free text over a `<datalist>`, never an enum.** The vocabulary is per
  category and open-ended (single/double/queen/king for bed linen,
  face/hand/bath/bath sheet for towels), so an enum would need an API migration
  every time the office stocked a new size — the trap `categories.js` documents
  at length. `sizesInUse` (`adminCatalogue.js`, pure + tested) reads the
  suggestions off the products **already fetched**: no second request, the
  distinction `annotateTiers` draws, and typing a size nobody has used is how a
  new one comes to exist. Same shape as AdminShipping's zone box.
- **The datalist is rendered ONCE, at the top of the screen.** The create form
  and an open editor can both be on screen, and two elements sharing an `id` is
  the kind of thing that works until it does not.
- **`SpecInput` is why the two forms cannot drift.** AdminProducts renders
  SPEC_FIELDS twice (create, editor) and used to inline the same `<input>` in
  both. The field declaration now carries `list` (the size's datalist) and
  `multiline` (the description's textarea), and one sub-component reads them —
  a third rendering of a spec box is the thing to look for.
- **Size is a LIST column as well as a form field.** Two duvet covers differing
  only in size read as one row repeated without it; an em dash where there is
  none, because a fabric has no size.
- **`description` is on the DETAIL read only, never the card.** It is prose for
  the product page — the storefront renders it above the flow lede rather than
  replacing it, because that sentence explains how the thing is BOUGHT and stays
  true whatever the description says. Carrying it on the list would inflate
  every card for something nothing draws.
- The storefront's `/products` gains a **Size facet** (`ProductLibrary`'s
  FILTERS). Like Collections and Category beside it, `facetLists` drops an empty
  facet, so it does not render until the office has set some.

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

- **Four of the thirteen reports are LIVE** — R-05 (`notinvoiced`), R-10
  (`stock`), R-11 (`brandtype`) and R-13 (`orders`) — fetched from atelier-api's
  `/admin/reports/*` through `apiGet`. The other nine are still the indicative
  fixtures in `src/data/reportLibrary.js`. `liveReportPath(key)` in
  `src/utils/reportBuilders.js` is the single place that decides which is which;
  the screen branches on it and nothing else.
- **The mapping is by QUESTION, not by name, and two of the four are imperfect
  in a way worth knowing.** R-11 asks for brand × product type and the live report
  answers house × design carrying a type column; R-10 asks for holdings *with a
  valuation* and the live report has no landed cost to value them with (A1 is
  still open, so the API declares no cost column rather than writing a
  placeholder). R-05 is the closest fit of the four.
- **R-13 "Orders placed" is the one report with NO fixture behind it** — it is
  `/admin/reports/revenue-lines`, the line-grain read, or nothing at all. So
  `buildReport` answers it with the empty shape rather than looking for a builder
  that does not exist (`hasFixture`, which is also what the library's own
  structural test and leak sweep skip it by), and until the API serves it the
  card draws the standard "Could not load" panel — the same answer any live
  report gives an unreachable endpoint.
- **A live report's ROWS LEAD SOMEWHERE (Userback 8287873)** — "we should be able
  to click and see what orders were placed". `reportRowLink(report, sourceRow,
  meta.filters)` decides it off the row the API sent, not off the report's name wherever it can:
  every report grained by an order line carries `order_number` (R-05 and R-13
  both), so one rule links them to `/admin/orders?q=<number>`. An aggregate row
  has no order number, so product performance leads to R-13 with its own row's
  **category** applied — the only filterable dimension its rows carry, because
  atelier-api gives no report a `brand_code` or `range` COLUMN (they are filters
  only), and an uncategorised row therefore leads nowhere rather than to an
  unfiltered list dressed up as a drill-down. A linked row is a real `<Link>`
  laid out as the grid row, the `ClientsList` pattern; the totals row never
  carries one, because it is every order at once.
- **A drill-down carries the APPLIED FILTERS as well as the row's dimension.**
  The figure being clicked was produced under both, so the link merges
  `meta.filters` — the API's own echo of what it applied, which is why they come
  off the envelope and not off the screen's state — through `reportSearchParams`,
  whose vocabulary drops anything the bar has no box for (`brand` arrives as an
  array). Without them a director who filtered August clicked an August figure
  and got every wallpaper line the platform holds, across all time, titled as the
  orders behind that August number: a wrong answer, not a missing feature. The
  order-desk link is the exception and carries none — an order number is one
  order, and a filter on top could only hide the row that was clicked.
- **The report key and the APPLIED filters live in the URL, and the draft does
  not.** A row link from one report into another only narrows anything if the
  screen reads its state from the address bar — this screen is usually already
  mounted when one of its own rows is clicked, and `useState` would let the URL
  change while the table stayed as it was (the rule `AdminCollections`' house
  filter already follows). `reportFiltersFromParams` / `reportSearchParams` in
  `reportFilters.js` are the mapping, and Apply is still the only thing that
  writes the URL, so typing never fetches. `AdminOrders` adopted the same pattern
  for the four filters a link can carry — `q`, `from`, `to`, `status`
  (`orderSearchFromParams` / `orderSearchParams`); its other three boxes stay in
  local state because nothing links to them, and a `status` the endpoint's enum
  does not have is dropped rather than sent as the 400 that kills the whole list.
  `reportFiltersFromParams` drops an unknown `category` for the same two reasons:
  the API's enum answers one with a 400 that kills the whole report, and a
  controlled select whose value has no option renders BLANK over a table it
  narrowed.
- **The re-seed effect is keyed on the boxes' OWN URL values, never on the whole
  querystring.** `AdminOrders`' status select commits straight to the URL (a
  closed list, no draft), so an effect keyed on `searchParams.toString()` fired on
  it too and re-seeded the search and date boxes from the URL — silently erasing
  what had been typed and not yet submitted. `orderDraftSeed(urlSearch)`
  (adminOrders.js, pure + tested) is the primitive it keys on instead: the three
  boxes, serialised, `status` deliberately absent.
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
  view. What a live report draws instead is the LIVE filter bar — category, a
  date range, brand code and range — sent to the API as the querystring
  `reportFilters.js` builds, at the API's default row limit.
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

## Orders: one list, and purchasing

W24. The client asked for two things that turned out to be one change: *"we can
keep web orders under sales order but with an identifier that it came from
website — no need of the separate tab for it"*, and *"the new sales order button
should be available on all tabs"*.

- **The identifier already existed.** `orders.kind` is `checkout` | `manual` |
  `order_request` | `backorder_request`, so folding the Web orders tab into Sales
  orders needed no schema change: `sourceOf` in `src/admin/orderFlow.js` derives
  Website / Office from it, the row prints the source with `KIND_LABELS`
  underneath as the finer answer, and `AdminOrders` is now the section's "Sales
  orders" tab. `SOURCE_LABELS` is a SECOND reading of the kind, deliberately not
  a second spelling of the same map.
- **THE SOURCE FILTER IS CLIENT-SIDE, AND THE COUNT LINE SAYS SO.**
  `GET /admin/orders` has no `kind` filter and Ajv's `removeAdditional` would
  STRIP one silently — the request would look fine and narrow nothing. So
  `filterBySource` narrows the page already fetched and `sourceCountNote` prints
  "12 of 50 on this page · 412 matching in total" rather than the server's total
  above a narrowed table. Do NOT paper over it by raising `limit`: the route's
  `MAX_LIMIT` is 200 and an over-large value is a 400 that kills the whole list.
  The real fix is one property on the endpoint's querystring schema plus a clause
  in `src/orders/order-filters.js`, and then this filter becomes a query param.
- **The narrowed array is for RENDERING only.** `AdminOrders` keeps `orders =
  crud.list.rows` (a stable identity) for the effect that re-seeds the open
  order's drafts, and renders `visible`. Keying that effect on the filtered copy
  hands it a fresh array every render and it sets state for ever — the same
  identity rule `useAdminList` states for its own dependencies.
- **The Dynamics order mirror is a different DATA SOURCE and was never merged
  in.** `SalesOrdersList` keeps `/sales-orders` (bookmarks) and is relabelled
  "Dynamics (historical)". It is GET-only until cutover.
- **The section's create actions hang off the TAB SET, not off a screen.**
  `ordersActions` in `sections.js`, resolved by `sectionActions(tabs)` keyed on
  the tab array's identity — every screen in a section already passes that array
  to `<SectionTabs>`, so both buttons appear on all four tabs with nothing
  threaded through a screen. `AdminOrders` no longer carries its own copy, and a
  test asserts it does not (scanning for `to="/admin/orders/new"`, not for the
  words — the comment explaining the absence contains both).

`AdminPurchaseOrders` / `AdminPurchaseOrderNew` / `AdminPurchaseOrder` are the
two CRM screens W13's purchasing API never got, plus the create form. The demo
`/purchase-orders*` routes redirect here; their files sit on disk unrouted, the
same treatment the retired samples screens got. Rules in
`src/screens/adminPurchaseOrders.js`, tested beside it.

- **Receipt state is DERIVED server-side and is never recomputed here.** There is
  no `qty_received` column: the API sums the append-only ledger at read time and
  sends `qty_received`, `qty_outstanding` and `receipt_state` on every line and
  on the order. A browser summing receipts answers with whichever page it holds
  and disagrees with the very figure the office is chasing. `receiptState` and
  `rollUpReceiptState` are deliberately NOT ported, and a test scans for them.
- **`closed` is not `full`, and both are drawn.** `status` is what a person did;
  the receipt state is what arrived. A purchase order closed short because the
  house discontinued the balance is a DECISION — `closedShort` names the
  disagreement out loud on the row and again on the detail, because "Closed"
  alone reads as "everything came in".
- **Over-receipt is legitimate and is never clamped.** The demo screen's
  `q = Math.min(q, out)` is the one line that had to be dropped in the port:
  clamping destroys exactly the discrepancy the office takes up with the house.
  `qty_outstanding` goes negative and `outstandingLabel` says "2 over".
  `outstandingLabel(null)` is an em dash, not 0 — `Number(null)` is 0, which
  would print a missing figure as square.
- **A receipt is never edited or deleted; a mistake is a NEGATIVE row.** There is
  no PATCH and no DELETE on the ledger, so `parseReceiptQty` accepts a negative
  and refuses only zero (the database's `CHECK (qty <> 0)`).
- **`supplier_id` is DERIVED from `brands.supplier_id` and is never sent.** No
  body here names it; a client-chosen value produces a well-formed purchase order
  addressed to the WRONG HOUSE and Ajv strips the key rather than rejecting it,
  so nothing would say so. **A house with no supplier is a 422 naming it**, and
  it fires on most houses until `backfill:suppliers` has run: the create form
  marks unlinked houses in the picker (read off the `supplier_id` already on the
  brand rows — reading what the API said, not a pre-flight) and the plan renders
  its `blocked` entries' own sentences verbatim, with a link to Houses.
- **Plan before generate, structurally.** Two routes running the same planner, so
  the preview and the act cannot disagree; `generateBody` then raises exactly the
  houses just previewed (`brand_ids`), falling back to the unfiltered run past
  the route's `maxItems: 100`. The plan is NOT run through `useMutation`: it
  writes nothing, so reloading the list would say something happened.
- **Cost is finance-gated by DELETION, not by nulling.** `unit_price` ABSENT is
  "you may not see it" and `unit_price: null` is "nobody has priced this line" —
  so `showsCost` and `draftFromPurchaseOrderLine` test with `Object.hasOwn`, the
  cost columns are not drawn at all without the grant, and a price the login
  cannot read is never sent back in a PATCH.
- **No integer cents anywhere in purchasing.** `unit_price` is `numeric(12,4)` in
  the supplier's own currency: a purchase is foreign, fractional and
  unconverted, and treating €48.0000 as 48 cents is a mistake nothing in the
  schema objects to. `costText`, not `formatCents`.
- **`expected_at` is the `naive` draft kind, not `date`.** It is a timestamptz,
  and slicing its ISO string reads the UTC day — a day early under an NZ session
  for anything stored at local midnight.
- **No archive option on the kit.** `purchase_orders` has no `archived_at`
  column and the API answers `archivable: false`, so a refused delete correctly
  offers Cancel alone; `cancelled` and `closed` are what take a finished order
  off the list, and they say why. Delete is drawn only on an untouched draft.
- **Receipting does not move stock**, and the detail screen says so with a
  pointer to Manage stock. That is the API's deliberate decision, not a gap here.
- `deriveBackorders` (`src/utils/backorders.js`) is REUSED rather than
  reinvented: `backordersFor` calls it a line at a time so each entry carries the
  sales orders its own allocations name, instead of one whole-order origin.

## Price Lists: the attribute line and the derived markup

`PriceLists` (`/price-lists`) is a Dynamics mirror and stays GET-only. What the
office asked for — the cloth attributes, the FX rate, and "what mark up is on
each item and how much room we have to play on discounts" — is all reading, and
the rules live in `src/screens/priceLists.js` with `priceLists.test.js` beside
it.

- **A row is TWO lines, not eleven columns.** Contents / Width / Repeat /
  Vertical repeat / FX / Markup do not fit the money grid at 1280px without
  shrinking every column into illegibility, so they sit on a second line that
  carries its own inline labels — self-describing, so it needs no second header
  strip and no alignment with the columns above it.
- **Markup is DERIVED in the browser because nothing stores it.** The live
  `price_list_items` side is buy-side only (no fx, duty, freight or handling),
  so there is no per-item markup to read; the D365 row is the one place carrying
  both ends of the waterfall, and `markupPct` is
  `(trade_sell_price_nz / landed_cost_nz − 1) × 100` off the row already on
  screen. It is never sent back. (A stored per-HOUSE markup does exist —
  `supplier_brand_terms.markup` — and is a different figure.)
- **`toNumber` from `src/admin/drafts.js` is the wrong tool here**: it answers 0
  for null, which is right for a form draft and wrong for a staging figure —
  "0.0%" is a statement about the row, not the absence of one. `numberOrNull` is
  the null-preserving twin, and a **zero** `landed_cost_nz` (D365 carries rows
  that were never costed) is refused as hard as a null, or the division prints
  Infinity as a spectacular markup. A negative markup is kept: selling under
  landed cost is a real answer.
- **An absent key must read as a blank cell.** The five columns arrive only once
  atelier-api's `prices` read projection carries them, and the two deploy
  separately — a CRM running ahead of the API sees them missing, which is an em
  dash, not a crash. Same rule `categoryLabel` follows for a category this build
  has not been taught.
- **`price_exchange_rate` is the authoritative FX**, with `exchange_rate` (D365's
  annual planning rate) standing in where the row struck none — atelier-api's
  `docs/d365-export-analysis.md` A9; the two agree on all but 14 of the 19,327
  rows.
- The correction panel's `PRICE_FIELDS` (`dynamicsCorrections.js`) does **not**
  yet declare the four new text columns, so they are readable and not
  correctable. Adding them is four lines, and only once the API's projection
  ships: a key declared there and missing from the API is a 422 on save.

## The record lock (`src/screens/recordLock.js`)

Userback 8287677: *"for all records, text and pricing should be read-only, as
this could easily upset our records."* Two live screens carry those columns —
`AdminProducts` (specs, prose, both sell prices) and `AdminPriceListItems` (the
wholesale rate, its currency, the cloth text) — so the rule is stated once and
both import it, with `recordLock.test.js` beside it.

- **It is a DRAWING decision, exactly like `roles.js` CAPS.** atelier-api still
  accepts every one of these columns from any backoffice login. Making the
  refusal real means director-gating `POST/PATCH /admin/price-list-items` and
  the price/text fields of `PATCH /admin/products/:id` — a policy change that
  affects staff workflows and has not been agreed, so the API is still the gate
  and this only stops the office being offered an edit it asked not to be
  offered.
- **The lever is the DECLARED FIELD LIST, not the styling.** `editableFields`
  hands a non-director the declaration minus the locked keys, and `diffFields`
  walks only the list it is given — so a locked column cannot reach a PATCH body
  even through a stale draft or a control left wired by mistake. Same lever
  `sampleFieldsFor(finance)` pulls for the sample cost pair.
- **Locked, not removed** — the value stays on screen in `readOnlyInput` with
  one `RECORD_LOCK_NOTE` line at the top of the editor, the treatment
  `panelFields` gives a commercial Dynamics column without finance. A field that
  vanished would read as data loss rather than as a restriction. The
  change-reason box goes with the prices it explains: without the grant there is
  no move to explain.
- **The lock is on the EDIT path only; a create still declares every field.**
  `name`, `code`, `wholesale_rate` and `currency` are required on their POST
  schemas, so a create body built from the shortened list is a 400 — the lock
  would read as "adding a rate is broken". Nothing existing is upset by a row
  that did not exist a moment ago, which is the request's own reasoning.
- **`canEditRecords` reads `apiRole`, never the capability map**, the same
  distinction the custom-discount control and `LegacyImportPanel` draw:
  `STAFF_ROLE_MAP` maps backoffice and director onto one capability set and
  cannot tell them apart.
- A key typoed into `LOCKED_PRODUCT_KEYS`/`LOCKED_RATE_KEYS` would lock nothing
  and fail nowhere else, so the test scans both `.jsx` files for each key's
  declaration — there is no jsdom here.
