// Roles & capabilities — GEN-01 (build spec §2.7 / §5 "User/Role").
//
// ─────────────────────────────────────────────────────────────────────────────
// DEMO-GRADE ONLY. THIS IS NOT ACCESS CONTROL.
//
// This app is a static client-side SPA: there is no server, no session, no API.
// Every figure below — costs, margins, supplier spend — is already in the JS
// bundle the browser downloaded. These capabilities decide what is DRAWN, not
// what is KNOWABLE: anyone can read the masked figures from devtools or the
// bundle in seconds.
//
// It demonstrates the SHAPE of GEN-01 for the client. Real enforcement means a
// server that never sends a User the cost columns in the first place — the gate
// belongs in the query, not the render. Do not describe this to Atelier as
// security, and do not carry this file into the Phase-1 build as a foundation.
// ─────────────────────────────────────────────────────────────────────────────

// Capabilities. Absence = denial; `user` deliberately holds none of them.
export const CAPS = {
  PRICING_EDIT: 'pricing.edit',        // change pricing params, per-SKU overrides, publish stock prices
  PRICELIST_IMPORT: 'pricelist.import', // stage/commit supplier price lists
  FINANCE_VIEW: 'finance.view',        // see cost / COGS / landed / margin / supplier spend
  REPORTS_ALL: 'reports.all',          // all-company figures (absent ⇒ own sales only, RPT-03)
  ADMIN_USERS: 'admin.users',          // manage users & role assignment
}

const ALL = Object.values(CAPS)

export const ROLES = {
  director: {
    key: 'director',
    label: 'Director',
    blurb: 'Full access',
    caps: ALL,
  },
  finance: {
    key: 'finance',
    label: 'Finance',
    blurb: 'All pricing, cost and reporting — cannot administer users',
    caps: [CAPS.PRICING_EDIT, CAPS.PRICELIST_IMPORT, CAPS.FINANCE_VIEW, CAPS.REPORTS_ALL],
  },
  user: {
    key: 'user',
    label: 'User',
    blurb: 'General usage — no pricing changes, no cost or margin, own sales reports',
    caps: [],
  },
}

export const ROLE_ORDER = ['director', 'finance', 'user']

// Seeded people. `owner` is the salesperson name this login attributes to — it must
// match data/reportLibrary.js OWNERS for own-sales scoping (RPT-03) to resolve.
//
// Liz and the shared Showroom/Sales logins carry owner:null, and that is not an
// oversight — it is A6 showing through. Liz is in atelier.js `team` but not in
// OWNERS (a director takes no orders), and a shared login has no one person to
// attribute to. Neither can answer "my own sales". Liz is a Director so she reads
// everything anyway; Showroom and Sales are the live A6 gap — see SHARED_LOGIN_NOTE below.
export const USERS = [
  { id: 'liz', name: 'Liz', email: 'elizabethd@atelier.co.nz', role: 'director', owner: null },
  { id: 'jenette', name: 'Jenette', email: 'jenettec@atelier.co.nz', role: 'director', owner: 'Jenette' },
  { id: 'charlotte', name: 'Charlotte', email: 'charlottes@atelier.co.nz', role: 'finance', owner: 'Charlotte' },
  { id: 'rebecca', name: 'Rebecca', email: 'rebeccaf@atelier.co.nz', role: 'user', owner: 'Rebecca' },
  { id: 'showroom', name: 'Showroom', email: 'showroom@ateliertextiles.co.nz', role: 'user', owner: null, shared: true },
  { id: 'sales', name: 'Sales', email: 'sales@atelier.co.nz', role: 'user', owner: null, shared: true },
]

// GEN-01 acceptance criterion 2 keeps shared logins; A6 still owes us the rule for
// attributing their sales to a named person. In the demo this is visible rather than
// papered over: sign in as Showroom and the own-sales report has no rows to show,
// because there is no person to scope to. That empty state IS the open question.
export const SHARED_LOGIN_NOTE =
  'Shared login — sales made here cannot yet attribute to a named salesperson (A6 open).'

// Shown wherever an own-sales view has no person to scope to (Liz, or the shared
// Showroom login). Lives here because the report library and the reporting dashboard
// both say it, and two copies of an explanation drift into two different answers.
export const NO_OWNER_REASON =
  'This login has no salesperson attached, so there are no “own sales” to show. ' +
  'Sales made under a shared login cannot yet attribute to a named person — the rule for that is A6, still owed.'

// DEMO CREDENTIAL. One shared passphrase, in plain source, checked in the browser.
// Every word of that sentence would be a firing offence in production; it exists so
// the login screen can be driven on stage. Real auth: server-side verification
// against a per-user hash (argon2id/bcrypt) — never a constant, never client-side.
export const DEMO_PASSWORD = 'atelier'

export function roleOf(user) {
  return (user && ROLES[user.role]) || null
}

// The single predicate the whole app asks. Unknown user/cap ⇒ false (fail closed).
export function can(user, cap) {
  const role = roleOf(user)
  return Boolean(role && role.caps.includes(cap))
}

// `users` defaults to the seeded cast so existing callers/tests are unchanged; AuthContext passes the
// live roster (seed + admin-created) so a newly-added login can sign in and a removed one cannot.
export function findUserByEmail(email, users = USERS) {
  const q = String(email || '').trim().toLowerCase()
  return users.find((u) => u.email.toLowerCase() === q || u.id === q) || null
}

// Demo authentication. Returns { user } or { error }.
export function authenticate(email, password, users = USERS) {
  const user = findUserByEmail(email, users)
  if (!user) return { error: 'No account matches that email.' }
  if (password !== DEMO_PASSWORD) return { error: 'Incorrect password.' }
  return { user }
}

// What this login may see of the figures — the shape every report gate reads.
//   finance: cost/margin/landed/spend columns may render
//   all:     all-company figures; when false, own-sales only (RPT-03)
//   owner:   the salesperson name to scope to (null ⇒ nothing attributable)
//
// THE BOUNDARY `all` DRAWS, written down because it is not self-evident and will drift:
// it scopes REPORTS, not OPERATIONAL RECORDS. A User cannot read the company's sales
// figures in Reporting or R-01, but still sees the dashboard's order feed, a client's
// account history and a sales order — each of which names a colleague beside an amount.
// That is deliberate: those are the records of the work, not a measure of the people, and
// a salesperson who cannot open an order cannot do the job. It does mean a User can read
// a colleague's individual order amount at line grain while being denied their FY total —
// defensible, and worth Atelier confirming, since the reverse (scoping the operational
// screens too) is a coherent position and a much quieter product.
//
// THE API'S OWN STATEMENT WINS WHERE THERE IS ONE. `GET /auth/me` now carries a
// DERIVED `report_access` — `{ reports, finance }`, backed by
// `users.can_view_finance` and by the role the SERVER resolved — and reading it
// is what makes the masking above fire at all: STAFF_ROLE_MAP in AuthContext
// gives every back-office login the demo's full director capability set, so a
// CRM that consulted the caps alone would draw a showroom login every cost
// figure the API had already agreed to withhold. It is also revocable: the
// statement is re-derived on every /auth/me, so a grant taken away in the back
// office reaches this function on the next page load rather than at the next
// sign-in.
//
// The caps stay as the FALLBACK rather than being deleted, and that is not
// tidiness either: the seeded demo roster carries no report_access, and neither
// does a break-glass session (there is no API to ask), so the demo screens must
// keep resolving through the capability map when there is nothing live to read.
export function accessOf(user) {
  const derived = user && user.report_access
  return {
    finance: derived ? derived.finance === true : can(user, CAPS.FINANCE_VIEW),
    // `reports` is "may read the library at all" and `all` is "all-company
    // figures". They are the same answer against this API: it serves a report to
    // staff or to nobody, and there is no salesperson grain in the live data to
    // scope down to (A6 again) — so a login without `reports` has nothing to be
    // shown, rather than a smaller version of it.
    all: derived ? derived.reports === true : can(user, CAPS.REPORTS_ALL),
    owner: (user && user.owner) || null,
  }
}

// Access for an unauthenticated/absent user: sees nothing. Builders default to this
// so a missing provider fails closed rather than open.
export const NO_ACCESS = { finance: false, all: false, owner: null }
