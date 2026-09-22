// The rules behind AdminSuppliers, kept out of the .jsx so they can be tested.
// This repo has no jsdom, so a component cannot be rendered — the house pattern
// is a plain .js beside the screen (see clientAccounts.js) holding everything
// that is a decision rather than a layout.
//
// Three of those decisions are worth naming here, because getting one wrong is
// not a cosmetic bug:
//
//   - **A discount chain is MULTIPLICATIVE.** `{0.4, 0.4}` is ×0.36 — 40% off,
//     then 40% off the result — NOT −80%. The API resolves it (its
//     discount-chain.js is the only evaluator) and hands over `net_multiplier`;
//     this module only formats what it was given, and never sums a chain.
//   - **Masking is per VALUE, not per row.** A term that states the METHOD
//     without quoting a rate ("3 discount tiers", "no per-brand terms") is safe
//     for a login without FINANCE_VIEW; the rate itself is not. `rateFree`
//     carries that distinction, and a note that quotes its rate in prose gets a
//     masked twin — dropping the number would leave the sentence lying.
//   - **A supplier is never hard-deleted while a house points at it.**
//     `brands.supplier_id` is RESTRICT, so archive is the verb that always
//     works; `archiveVerb` is what the row's button and the blocked dialog's
//     "Archive instead" both read.

export const SUPPLIERS_PATH = '/admin/suppliers'

/** `/admin/suppliers/12`. One place, so a typo is a failing test not a 404. */
export const supplierPath = (id) => `${SUPPLIERS_PATH}/${id}`

/**
 * Which lifecycle verb a row offers. An archived supplier offers `restore`; a
 * live one offers `archive`. Both are POSTs to the same path shape.
 *
 * @param {{ archived_at?: string|null }} supplier
 * @returns {'archive'|'restore'}
 */
export const archiveVerb = (supplier) =>
  supplier?.archived_at ? 'restore' : 'archive'

/** The endpoint that verb posts to. */
export const archivePath = (supplier) =>
  `${supplierPath(supplier?.id)}/${archiveVerb(supplier)}`

// Mirrors SUPPLIER_UPDATE_COLUMNS in atelier-api's src/suppliers/admin-suppliers.js
// — the frozen whitelist a PATCH may write. A key absent there is stripped by
// Ajv's removeAdditional before the handler sees it, so a field declared here
// and not there would silently save nothing.
//
// `slug` is deliberately not among them: it is server-generated on create and is
// NOT recomputed on rename, because it is the stable key the backfill and any
// later import address a supplier by.
export const SUPPLIER_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'short_code', label: 'Short code', kind: 'text' },
  { key: 'd365_token', label: 'D365 token', kind: 'text' },
  { key: 'country', label: 'Country', kind: 'text' },
  { key: 'currency', label: 'Invoicing currency', kind: 'upper' },
  { key: 'agent', label: 'Agent', kind: 'text' },
  { key: 'incoterm', label: 'Incoterm', kind: 'text' },
  { key: 'po_email', label: 'PO email', kind: 'text' },
  { key: 'discount_method', label: 'Discount method', kind: 'enum' },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'address', label: 'Address', kind: 'text' },
  { key: 'website_url', label: 'Website', kind: 'url' },
  { key: 'notes', label: 'Notes', kind: 'text' },
])

// Mirrors `suppliers_discount_method_check` via the route's DISCOUNT_METHOD_ENUM.
// A value outside it is a 400, so the form offers exactly these two and a blank
// (the column is nullable — "not decided yet" is a real answer).
export const DISCOUNT_METHODS = Object.freeze(['averaged', 'per-brand'])

export const NEW_SUPPLIER = Object.freeze({
  name: '',
  short_code: '',
  d365_token: '',
  country: '',
  currency: '',
  agent: '',
  incoterm: '',
  po_email: '',
  discount_method: '',
  phone: '',
  address: '',
  website_url: '',
  notes: '',
})

/**
 * The list filters, in the shape buildListQuery expects. `include_archived` is
 * passed as `flag || null` so it VANISHES when off rather than serialising as
 * `include_archived=false` — the documented way a boolean filter opts out.
 *
 * @param {{ term?: string, showArchived?: boolean }} [state]
 * @returns {{ q: string, include_archived: true|null }}
 */
export function supplierFilters({ term = '', showArchived = false } = {}) {
  return { q: term, include_archived: showArchived || null }
}

/** '40%' from 0.4. Rates are stored as fractions; nobody reads 0.4 as a discount. */
export const pctText = (rate) =>
  rate == null || !Number.isFinite(Number(rate)) ? '—' : `${Math.round(Number(rate) * 100)}%`

/** '×0.36' from 0.36 — the net multiplier, never a summed percentage. */
export const netText = (multiplier) =>
  multiplier == null || !Number.isFinite(Number(multiplier))
    ? '—'
    : `×${Number(multiplier).toFixed(2)}`

/** '40% then 40%' — the chain as written, each rate on its own. */
export const chainText = (chain) =>
  (Array.isArray(chain) ? chain : []).map(pctText).join(' then ')

/**
 * One line of supplier identity for the row's second line: what it invoices in
 * and how it is rated. Neither is a rate, so both survive the mask.
 *
 * @param {object} supplier
 * @returns {string}
 */
export function supplierMeta(supplier = {}) {
  const parts = [supplier.country, supplier.currency, supplier.discount_method]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  // How many houses point here, from the list read's `brand_count`. A supplier
  // nobody has linked reads "No houses linked" — the state that makes a PO
  // unaddressable and had nowhere to show before. Not a rate, so it survives
  // the finance mask.
  const count = Number.isFinite(Number(supplier.brand_count))
    ? Number(supplier.brand_count)
    : null
  if (count != null) {
    parts.push(count === 0 ? 'No houses linked' : `${count} house${count === 1 ? '' : 's'}`)
  }
  return parts.length ? parts.join(' · ') : 'No commercial details on file'
}

/**
 * How one house's terms read on screen.
 *
 * Returns `{ value, note, maskedNote, rateFree, invalid }`:
 *   - `value` is the headline. When `rateFree` is false it quotes a rate and the
 *     screen renders <MaskedFigure /> in its place for a login without
 *     FINANCE_VIEW.
 *   - `maskedNote` replaces `note` for that login wherever the note itself
 *     quotes the rate (the chain's "×0.36 net" is the only such case today).
 *   - `invalid` marks a row the API could not evaluate — a `discount_chain`
 *     element outside [0, 1), which no CHECK can catch because a constraint
 *     cannot hold a subquery. The API reports it on the row rather than failing
 *     the whole supplier read, and the screen badges it.
 *
 * Precedence mirrors the API's resolveTermsChain: chain, then tiers, then the
 * flat rate, then the markup.
 *
 * @param {object|null} terms  a supplier_brand_terms row as the API returns it
 * @returns {{ value: string, note: string, maskedNote: string|null,
 *   rateFree: boolean, invalid: boolean }}
 */
export function termsSummary(terms) {
  const plain = (value, note, rateFree = false, maskedNote = null) => ({
    value,
    note,
    maskedNote,
    rateFree,
    invalid: false,
  })

  if (!terms) {
    // The normal state for an `averaged` supplier: one net rate on the supplier,
    // nothing per house.
    return plain('Supplier default', 'No per-brand terms recorded', true)
  }
  if (terms.invalid_reason) {
    return {
      value: 'Terms need review',
      note: terms.invalid_reason,
      maskedNote: 'A recorded rate is out of range — ask finance to check it.',
      rateFree: true,
      invalid: true,
    }
  }

  const chain = Array.isArray(terms.discount_chain) ? terms.discount_chain : []
  if (chain.length > 0) {
    return plain(
      chainText(chain),
      `Compounded — ${netText(terms.net_multiplier)} net`,
      false,
      'Compounded chain — sequential rates, not a single discount'
    )
  }

  const tiers = Array.isArray(terms.tiers) ? terms.tiers : []
  if (tiers.length > 0) {
    // A count is not a rate, so it survives the mask; the tier rates below it
    // do not.
    return plain(
      `${tiers.length} discount tier${tiers.length === 1 ? '' : 's'}`,
      'Tier by collection or category — see below',
      true
    )
  }

  if (terms.discount != null) {
    return plain(`−${pctText(terms.discount)}`, 'Flat per-brand discount')
  }
  if (terms.markup != null) {
    return plain(`×${terms.markup}`, 'Per-brand retail markup')
  }
  return plain('No rate recorded', 'Terms row exists but carries no rate', true)
}

/** A tier's label with the fallback one named for what it is. */
export const tierLabel = (tier) =>
  tier?.is_fallback ? `${tier.label} (fallback)` : (tier?.label ?? '')

// ---------------------------------------------------------------------------
// Commercial terms — WRITABLE as of W23. They were read-only here because
// `supplier_brand_terms` had no write route and `npm run backfill:suppliers` was
// the only writer; the API now serves the full nested CRUD:
//
//   GET|POST    /admin/suppliers/:id/brand-terms
//   PATCH|DELETE       …/brand-terms/:termsId
//   POST               …/brand-terms/:termsId/tiers
//   PATCH|DELETE       …/brand-terms/:termsId/tiers/:tierId
//
// **THE CHAIN IS MULTIPLICATIVE AND IS NEVER EVALUATED HERE.** `{0.4, 0.4}` is
// ×0.36 — 40% off, then 40% off the result — not −80%. atelier-api's
// discount-chain.js is the ONE evaluator, every write answers with the resolved
// `net_multiplier`, and `termsSavedNote` shows that number back the moment a
// save lands. It is the only field on this screen nobody can check by eye, and a
// typo in it moves every price under that house. Multiplying the rates here to
// "preview" it would be a second evaluator, and the two would disagree the first
// time either changed.
//
// **Rates are FRACTIONS off list, 0 ≤ r < 1** — the form's own storage shape,
// matching the column (`numeric(6,4)`) and the API's refusals ("a fraction off
// list: 0 or more and below 1"). `pctText` echoes each one as a percentage
// beside the box, which is formatting a single rate, not resolving a chain.
//
// **Nothing here pre-checks a constraint.** The one-terms-row-per-house UNIQUE,
// the discount-XOR-chain CHECK, the case-insensitive tier label index and the
// single-fallback index are all the database's, and it phrases each refusal
// better than a guess would. What IS checked here is the shape of what was
// typed, so a stray letter is named before a round trip.

/** `/admin/suppliers/12/brand-terms` and everything under it. */
export const brandTermsPath = (supplierId) => `${supplierPath(supplierId)}/brand-terms`
export const termsRowPath = (supplierId, termsId) => `${brandTermsPath(supplierId)}/${termsId}`
export const tiersPath = (supplierId, termsId) => `${termsRowPath(supplierId, termsId)}/tiers`
export const tierPath = (supplierId, termsId, tierId) =>
  `${tiersPath(supplierId, termsId)}/${tierId}`

/** `PATCH /admin/brands/:id { supplier_id }` — one of the two link controls. */
export const brandLinkPath = (brandId) => `/admin/brands/${brandId}`

// ---------------------------------------------------------------------------
// The SUPPLIER's own rate — `suppliers.default_discount`.
//
// One net discount off list for every house this supplier invoices: the 9 Jul
// rule's `discount_method = 'averaged'`, which stated the METHOD while the rate
// lived nowhere. A house with terms of its own keeps them — the API resolves
// per-brand terms FIRST and falls back to this — so the two are never added.
//
// It is NOT on the supplier form above: that PATCH is open to any back-office
// login, and a rate is cost data. It is written through the finance-gated
// terms surface, which is why it is edited inside <SupplierTermsPanel>.
// ---------------------------------------------------------------------------

/** `/admin/suppliers/12/default-discount`. */
export const defaultDiscountPath = (supplierId) => `${supplierPath(supplierId)}/default-discount`

/**
 * The PATCH body. Blank CLEARS the rate (an explicit null), which is a
 * different statement from 0 — 0 is "their prices arrive already net", a term
 * somebody checked, and blank is "nobody has asked them yet".
 *
 * @param {string} raw
 * @returns {{ok: true, body: {default_discount: number|null}}|{ok: false, error: string}}
 */
export function buildDefaultDiscountBody(raw) {
  const parsed = parseRate(raw)
  if (!parsed.ok) return parsed
  return { ok: true, body: { default_discount: parsed.value } }
}

/**
 * The sentence shown when the supplier rate saves. It says what the rate now
 * covers, because the number alone does not: it applies to every house that has
 * no terms row of its own, and to none of the houses that do.
 *
 * @param {{ name?: string, default_discount?: number|null }} [supplier]
 * @returns {string}
 */
export function defaultDiscountNote(supplier = {}) {
  const house = supplier.name ? `${supplier.name}: ` : ''
  if (supplier.default_discount == null) {
    return `${house}supplier discount cleared. Houses with no terms of their own now have no rate.`
  }
  return `${house}${pctText(supplier.default_discount)} off list on every house with no terms of its own.`
}

export const NEW_TERMS = Object.freeze({
  brand_id: '',
  discount: '',
  discount_chain: '',
  markup: '',
  indicative: false,
  note: '',
})

export const NEW_TIER = Object.freeze({ label: '', pct: '', is_fallback: false })

/**
 * A rate typed into a box → the fraction the column holds. Blank is null (the
 * column is nullable and "no flat discount" is a real answer); anything outside
 * [0, 1) is refused here with the API's own words, because the CHECK phrases it
 * the same way and a round trip adds nothing.
 *
 * @param {string} raw
 * @returns {{ok: true, value: number|null}|{ok: false, error: string}}
 */
export function parseRate(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const rate = Number(trimmed)
  if (!Number.isFinite(rate)) {
    return { ok: false, error: 'A discount is a fraction off list, e.g. 0.4 for 40%.' }
  }
  if (rate < 0 || rate >= 1) {
    return {
      ok: false,
      error: 'A discount is a fraction off list: 0 or more and below 1. 1 would be a free metre.',
    }
  }
  return { ok: true, value: rate }
}

/**
 * The chain, as a comma-separated list of fractions. "No chain" is `[]`, never
 * null — the column is NOT NULL and an absent chain is an empty array.
 *
 * @param {string} raw
 * @returns {{ok: true, value: number[]}|{ok: false, error: string}}
 */
export function parseChain(raw) {
  const parts = String(raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const chain = []
  for (const part of parts) {
    const parsed = parseRate(part)
    if (!parsed.ok || parsed.value === null) {
      return { ok: false, error: `“${part}” is not a rate. A chain is fractions, e.g. 0.4, 0.4.` }
    }
    chain.push(parsed.value)
  }
  return { ok: true, value: chain }
}

/**
 * The chain read back as percentages — "40% then 40%" — so a typed 0.04 is
 * visible as 4% before it is saved. Each rate on its own: this states what was
 * typed and deliberately does NOT say what they come to together, which is the
 * server's answer.
 *
 * @param {string} raw
 * @returns {string}
 */
export function chainPreview(raw) {
  const parsed = parseChain(raw)
  if (!parsed.ok) return ''
  return parsed.value.length === 0 ? '' : chainText(parsed.value)
}

/** A markup multiplies the landed cost, so it must be above 0. */
export function parseMarkup(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  const markup = Number(trimmed)
  if (!Number.isFinite(markup) || markup <= 0) {
    return { ok: false, error: 'A markup multiplies the landed cost, so it must be above 0.' }
  }
  return { ok: true, value: markup }
}

const termsValues = (draft) => {
  const discount = parseRate(draft.discount)
  if (!discount.ok) return discount
  const chain = parseChain(draft.discount_chain)
  if (!chain.ok) return chain
  const markup = parseMarkup(draft.markup)
  if (!markup.ok) return markup
  const note = String(draft.note ?? '').trim()
  return {
    ok: true,
    value: {
      discount: discount.value,
      discount_chain: chain.value,
      markup: markup.value,
      indicative: Boolean(draft.indicative),
      note: note === '' ? null : note,
    },
  }
}

/**
 * The create body for `POST /admin/suppliers/:id/brand-terms`. `brand_id` is
 * required and is the row's IDENTITY (one set of terms per house), which is why
 * it is absent from the patch below: moving terms to another maison is a delete
 * and a re-create, never an edit.
 *
 * @param {object} draft
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildTermsBody(draft = NEW_TERMS) {
  const brandId = Number(String(draft.brand_id ?? '').trim())
  if (!Number.isInteger(brandId) || brandId <= 0) {
    return { ok: false, error: 'Choose the house these terms are for.' }
  }
  const values = termsValues(draft)
  if (!values.ok) return values
  return { ok: true, body: { brand_id: brandId, ...values.value } }
}

/**
 * The patch for an existing terms row: only what moved. The route demands
 * `minProperties: 1`, so an unchanged save is refused rather than sent.
 *
 * @param {object} terms the row as the API last returned it
 * @param {object} draft
 * @returns {{ok: true, patch: object}|{ok: false, error: string}}
 */
export function buildTermsPatch(terms = {}, draft = NEW_TERMS) {
  const values = termsValues(draft)
  if (!values.ok) return values
  const next = values.value
  const patch = {}
  if ((terms.discount ?? null) !== next.discount) patch.discount = next.discount
  if (chainText(terms.discount_chain ?? []) !== chainText(next.discount_chain)) {
    patch.discount_chain = next.discount_chain
  }
  if ((terms.markup ?? null) !== next.markup) patch.markup = next.markup
  if (Boolean(terms.indicative) !== next.indicative) patch.indicative = next.indicative
  if ((terms.note ?? null) !== next.note) patch.note = next.note
  return { ok: true, patch }
}

/**
 * A tier's create/patch body. The label is free text matched case-insensitively
 * against the LINE's category — deliberately not the products.category enum,
 * because the houses quote things the enum has no word for — so there is nothing
 * to validate it against beyond "is it a label at all".
 *
 * @param {object} draft
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildTierBody(draft = NEW_TIER) {
  const label = String(draft.label ?? '').trim()
  if (label === '') {
    return { ok: false, error: 'A tier needs a label: it is matched against the line’s category.' }
  }
  const pct = parseRate(draft.pct)
  if (!pct.ok) return pct
  if (pct.value === null) {
    return { ok: false, error: 'A tier needs a rate, e.g. 0.4 for 40% off.' }
  }
  return { ok: true, body: { label, pct: pct.value, is_fallback: Boolean(draft.is_fallback) } }
}

/** A saved terms row, as the edit form holds it. */
export const draftFromTerms = (terms = {}) => ({
  brand_id: terms.brand_id == null ? '' : String(terms.brand_id),
  discount: terms.discount == null ? '' : String(terms.discount),
  discount_chain: (terms.discount_chain ?? []).join(', '),
  markup: terms.markup == null ? '' : String(terms.markup),
  indicative: Boolean(terms.indicative),
  note: terms.note ?? '',
})

/**
 * **The sentence shown the instant a terms write lands.** Every write answers
 * with the row in the read model's shape, so `net_multiplier` is what the chain
 * the office just typed actually evaluates to — and there is no other way to
 * check it. A row the API could not evaluate says so instead, with its reason.
 *
 * @param {object} [terms] the row from a create/patch/tier response
 * @returns {string}
 */
export function termsSavedNote(terms = {}) {
  const house = terms.brand_name ? `${terms.brand_name}: ` : ''
  if (terms.invalid_reason) {
    return `${house}saved, but the rate cannot be resolved — ${terms.invalid_reason}`
  }
  if (terms.net_multiplier == null) {
    return `${house}saved. No rate on file yet.`
  }
  const chain = Array.isArray(terms.discount_chain) ? terms.discount_chain : []
  const how = chain.length > 1 ? ` (${chainText(chain)}, compounded)` : ''
  const from = terms.net_label ? ` via “${terms.net_label}”` : ''
  return `${house}saved — net ${netText(terms.net_multiplier)}${how}${from}.`
}

/**
 * Which houses can be linked to this supplier, and which are being taken off
 * another one.
 *
 * A terms row is per BRAND, and `GET /admin/suppliers/:id` embeds terms per
 * LINKED house — so a brand-new supplier with no houses has nowhere for its
 * terms to show. `PATCH /admin/brands/:id { supplier_id }` is what makes the
 * link, and it is the only place in the CRM that writes it.
 *
 * @param {ReadonlyArray<object>} brands  rows from GET /admin/brands
 * @param {number} supplierId
 * @returns {ReadonlyArray<{id: number, name: string, label: string}>}
 */
export function linkableBrands(brands = [], supplierId) {
  return brands
    .filter((brand) => String(brand.supplier_id ?? '') !== String(supplierId))
    .map((brand) => ({
      id: brand.id,
      name: brand.name,
      // NAMED, not "another supplier": moving a house is a commercial decision,
      // and which house it is being taken off is the whole of it. The API
      // serves `supplier_name` on the admin list for this; the fallback covers
      // a link to a supplier the list did not carry.
      label:
        brand.supplier_id == null
          ? brand.name
          : `${brand.name} — invoiced by ${brand.supplier_name ?? 'another supplier'}`,
    }))
}

// ---------------------------------------------------------------------------
// Contact people + the contact log.
//
// Contacts are the PEOPLE at a house (several per supplier is the point); the
// log is Atelier's own record of being in touch — date, staff member, method,
// note, optional follow-up. The log is APPEND-ONLY server-side: the API has no
// edit or delete for an entry, so this module offers none either. The "who" is
// the signed-in session — the create body never carries a staff field.
// ---------------------------------------------------------------------------

export const contactsPath = (supplierId) => `${supplierPath(supplierId)}/contacts`
export const contactPath = (supplierId, contactId) => `${contactsPath(supplierId)}/${contactId}`
export const contactLogPath = (supplierId) => `${supplierPath(supplierId)}/contact-log`

// Mirrors supplier_contact_log_method_check via the route's CONTACT_METHODS.
export const CONTACT_METHODS = Object.freeze(['call', 'email', 'visit', 'showroom'])

// The drafts.js declaration both contact forms read — same shape as
// SUPPLIER_FIELDS, so create and edit cannot drift.
export const CONTACT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', kind: 'text', required: true },
  { key: 'role', label: 'Role', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'note', label: 'Note', kind: 'text' },
])

export const NEW_CONTACT = Object.freeze({ name: '', role: '', email: '', phone: '', note: '' })

export const NEW_LOG_ENTRY = Object.freeze({
  method: '',
  contacted_on: '',
  note: '',
  follow_up_on: '',
})

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The POST /contact-log body. A blank `contacted_on` is OMITTED — the server
 * dates the entry today (its CURRENT_DATE default), so "just spoke to them"
 * needs nothing typed. A malformed date is refused here with the field named,
 * rather than round-tripping to a 400.
 *
 * @param {{ method?: string, contacted_on?: string, note?: string,
 *           follow_up_on?: string }} draft
 * @returns {{ok: true, body: object}|{ok: false, error: string}}
 */
export function buildLogBody(draft = NEW_LOG_ENTRY) {
  const method = String(draft.method ?? '').trim()
  if (!CONTACT_METHODS.includes(method)) {
    return { ok: false, error: 'Pick how the contact happened: call, email, visit or showroom.' }
  }
  const body = { method }
  for (const key of ['contacted_on', 'follow_up_on']) {
    const value = String(draft[key] ?? '').trim()
    if (value === '') continue
    if (!ISO_DAY.test(value)) {
      return { ok: false, error: `${key === 'contacted_on' ? 'Contact date' : 'Follow-up date'} must be a date, e.g. 2026-09-02.` }
    }
    body[key] = value
  }
  const note = String(draft.note ?? '').trim()
  if (note !== '') body.note = note
  return { ok: true, body }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2 Sep 2026' from '2026-09-02' — deterministic, no locale/ICU drift. */
export const dayText = (iso) => {
  if (typeof iso !== 'string' || !ISO_DAY.test(iso)) return iso ?? ''
  const [year, month, day] = iso.split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

/**
 * The at-a-glance line the supplier list shows per row, off `last_contact`.
 * Null means never contacted — the "gone quiet" state the column exists to
 * surface, so it says so rather than showing a dash.
 *
 * @param {{ contacted_on: string, method: string, staff_name: string,
 *           follow_up_on: string|null }|null|undefined} last
 * @returns {string}
 */
export function lastContactText(last) {
  if (!last) return 'No contact yet'
  const parts = [dayText(last.contacted_on), last.method, last.staff_name].filter(Boolean)
  const line = parts.join(' · ')
  return last.follow_up_on ? `${line} · follow up ${dayText(last.follow_up_on)}` : line
}

/**
 * Is this refusal the finance gate rather than a fault?
 *
 * The terms routes need `can_view_finance` on top of the backoffice role — a
 * house's commercial terms are cost data, and `backoffice` covers the showroom
 * as well as the accounts desk. A 403 there is a policy answer with a written
 * reason, so it is rendered as a LockedPanel carrying the API's own sentence
 * rather than as a broken panel.
 *
 * @param {{status?: number}} [error]
 * @returns {boolean}
 */
export const isFinanceRefusal = (error) => error?.status === 403
