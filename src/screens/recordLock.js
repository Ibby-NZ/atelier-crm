// Who may move a record's words and its money.
//
// Userback 8287677: "for all records, text and pricing should be read-only, as
// this could easily upset our records." Two live screens carry those columns —
// AdminProducts (the design's specs, its prose and both sell prices) and
// AdminPriceListItems (the supplier's rate, the currency it is quoted in and
// the cloth description beside it) — so the rule is stated once, here, and both
// import it.
//
// **This is a drawing decision, not access control.** atelier-api still accepts
// every one of these columns from any backoffice login; making the refusal real
// means director-gating the write routes, which is a policy change nobody has
// agreed. The same sentence src/auth/roles.js writes about CAPS applies word
// for word: the API is the gate, and this only stops the office being offered
// an edit it asked not to be offered.
//
// **Locked, not removed.** The value stays on screen in a read-only box with
// RECORD_LOCK_NOTE beside it — the treatment panelFields (dynamicsCorrections)
// gives a commercial Dynamics column to a login without finance. A field that
// vanished would read as data loss rather than as a restriction.
//
// **The lever is the DECLARED FIELD LIST**, which is what makes this more than
// styling: diffFields and bodyFrom (src/admin/drafts.js) walk the list they are
// handed and never touch a key it does not declare, so a locked column cannot
// reach a PATCH body at all — not through a stale draft, not through a control
// left wired by mistake. Same lever sampleFieldsFor pulls for the cost pair.
//
// **The lock is on the EDIT path only; a create still declares every field.**
// `code`, `wholesale_rate`, `currency` and `name` are required on their POST
// schemas, so a create body built from the shortened list would be a 400 — the
// lock would read as "adding a rate is broken" rather than as a restriction.
// Nothing existing is upset by a row that did not exist a moment ago, which is
// the request's own reasoning.

export const RECORD_LOCK_NOTE =
  'Text and pricing are read-only on this record — ask a director to change them.'

/**
 * The one gate. `apiRole` is the API's own word for the account
 * (backoffice/director); the CRM capability role maps both to 'director' and
 * cannot tell them apart, so it is never the thing to ask.
 *
 * @param {{apiRole?: string}|null} [user] useAuth().user
 * @returns {boolean}
 */
export const canEditRecords = (user) => user?.apiRole === 'director'

// Every spec box, both sell prices, and the free-text columns beside them —
// `name` included, because a renamed design is exactly the record change the
// request is about. Category, collection, currency and the website switch stay
// open: those are merchandising decisions, not the record's words or its money.
export const LOCKED_PRODUCT_KEYS = Object.freeze([
  'name',
  'product_range',
  'size',
  'composition',
  'width',
  'rubs',
  'application',
  'price_band',
  'lead_time',
  'description',
  'retail_price_cents',
  'trade_price_cents',
  // What the house charges (24 Sep 2026) — locked like a price-list rate's
  // wholesale figure below: it prices every purchase order.
  'wholesale_rate',
  'hi_res_asset_url',
])

// The wholesale rate, the currency it is quoted in, and the free-text columns
// that describe the cloth. Unit, category, freight class and the effective date
// stay open — they classify the row rather than state what it costs or says.
export const LOCKED_RATE_KEYS = Object.freeze([
  'code',
  'wholesale_rate',
  'currency',
  'product_range',
  'description',
  'contents',
  'width',
  'repeat',
  'vertical_repeat',
  'duty_class',
])

/**
 * The fields this login's save may work over. A director gets the declaration
 * back unchanged; everyone else gets it without the locked keys, so diffFields
 * cannot assemble a patch that names one.
 *
 * @param {ReadonlyArray<{key: string}>} fields
 * @param {ReadonlyArray<string>} lockedKeys
 * @param {boolean} isDirector canEditRecords(useAuth().user)
 * @returns {ReadonlyArray<{key: string}>}
 */
export function editableFields(fields = [], lockedKeys = [], isDirector = false) {
  if (isDirector) return fields
  return Object.freeze(fields.filter((field) => !lockedKeys.includes(field.key)))
}

/**
 * Whether one field is drawn read-only. The rendering half of the same rule —
 * the screens draw several of these boxes by hand rather than by mapping the
 * declaration, so the answer has to be available a key at a time.
 *
 * @returns {boolean}
 */
export const isFieldLocked = (key, lockedKeys = [], isDirector = false) =>
  !isDirector && lockedKeys.includes(key)
