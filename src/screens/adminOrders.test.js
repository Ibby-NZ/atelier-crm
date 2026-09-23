import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery, pageCount } from '../admin/list.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { UNPAGED_LIST_LIMIT } from './adminLists.js'
import { ORDER_STATUSES } from '../admin/orderFlow.js'
import {
  CUSTOMER_PO_HINT,
  EMPTY_ORDER_SEARCH,
  HEADER_MAX,
  keepTypedHeader,
  ORDER_HEADER_FIELDS,
  ORDER_LIST_LIMIT,
  SOURCE_FILTER_NOTE,
  TRACKING_URL_MAX,
  URL_ORDER_FILTERS,
  filterBySource,
  hasOrderFilters,
  orderDraftSeed,
  orderListFilters,
  orderSearchFromParams,
  orderSearchParams,
  referenceLine,
  shipBody,
  sourceCountNote,
} from './adminOrders.js'

// The desk is two screens since 16 Sep 2026: the LIST (AdminOrders.jsx) and
// the order's own PAGE (AdminOrder.jsx), where the lines are priced and every
// transition taken. Most rules below are about one or the other; SCREEN_SOURCE
// is the two together, LIST_SOURCE and PAGE_SOURCE each alone.
const LIST_SOURCE = readFileSync(new URL('./AdminOrders.jsx', import.meta.url), 'utf8')
const PAGE_SOURCE = readFileSync(new URL('./AdminOrder.jsx', import.meta.url), 'utf8')
const SCREEN_SOURCE = `${LIST_SOURCE}\n${PAGE_SOURCE}`
const MODULE_SOURCE = readFileSync(new URL('./adminOrders.js', import.meta.url), 'utf8')
const EDITOR_SOURCE = readFileSync(
  new URL('../admin/OrderLinesEditor.jsx', import.meta.url),
  'utf8'
)
// A named const's body, up to the next top-level declaration. Brace counting
// is not worth it here and a `[^}]*` regex trips over the first object literal.
function bodyOf(source, name) {
  const start = source.indexOf(`const ${name} = `)
  if (start === -1) return ''
  const end = source.indexOf('\n  const ', start + 1)
  return source.slice(start, end === -1 ? undefined : end)
}

// The endpoint's own numbers (atelier-api src/orders/admin-orders.js).
const API_DEFAULT_LIMIT = 50
const API_MAX_LIMIT = 200

// The route schemas' own maxLengths (atelier-api src/routes/admin-orders.js:
// editBodySchema and shipBodySchema). Exceeding one is a raw Fastify 400 on a
// save the office has already made, so the boxes carry these as maxLength.
const API_HEADER_MAX = {
  notes: 2000,
  contact_phone: 50,
  client_reference: 200,
  customer_po_number: 200,
}
const API_TRACKING_URL_MAX = 500

describe('ORDER_LIST_LIMIT', () => {
  it('stays inside the endpoint MAX_LIMIT, which is a 400 and not a clamp', () => {
    // `maximum: MAX_LIMIT` is on the route schema, so an over-large limit is
    // refused outright — the whole list dies, it does not come back shorter.
    expect(ORDER_LIST_LIMIT).toBeLessThanOrEqual(API_MAX_LIMIT)
    expect(ORDER_LIST_LIMIT).toBe(API_DEFAULT_LIMIT)
  })

  it('is not the unpaged limit the screen used to send', () => {
    // /admin/orders answered with the whole table until W12; passing 1000 at it
    // now is the 400 that broke this screen.
    expect(ORDER_LIST_LIMIT).not.toBe(UNPAGED_LIST_LIMIT)
    expect(UNPAGED_LIST_LIMIT).toBeGreaterThan(API_MAX_LIMIT)
  })

  it('actually pages a real queue', () => {
    expect(pageCount(0, ORDER_LIST_LIMIT)).toBe(1)
    expect(pageCount(50, ORDER_LIST_LIMIT)).toBe(1)
    expect(pageCount(51, ORDER_LIST_LIMIT)).toBe(2)
  })
})

// Every filter is asserted on the querystring the API actually receives, because
// the failure being guarded against is a param arriving as `x=` — which the
// status enum and the date parser each answer with a 400 that kills the queue.
describe('orderListFilters', () => {
  it('sends nothing at all when nothing is set', () => {
    expect(buildListQuery(orderListFilters())).toBe('')
    expect(buildListQuery(orderListFilters({}))).toBe('')
    expect(buildListQuery(orderListFilters({ ...EMPTY_ORDER_SEARCH, status: '' }))).toBe('')
  })

  it('never sends status= for "All statuses"', () => {
    expect(orderListFilters({ status: '' }).status).toBeNull()
    expect(buildListQuery(orderListFilters({ status: 'requested' }))).toBe('status=requested')
  })

  it('sends include_archived only when it is on', () => {
    expect(orderListFilters({ showArchived: false }).include_archived).toBeNull()
    expect(buildListQuery(orderListFilters({ showArchived: true }))).toBe(
      'include_archived=true'
    )
  })

  it('carries every filter the order desk offers', () => {
    const query = buildListQuery(
      orderListFilters({
        status: 'confirmed',
        showArchived: true,
        q: 'SO-10',
        client: 'Reid',
        reference: 'drawing room',
        po_number: 'PO-88231',
        from: '2026-08-01',
        to: '2026-08-12',
      })
    )
    expect(query).toContain('status=confirmed')
    expect(query).toContain('include_archived=true')
    expect(query).toContain('q=SO-10')
    expect(query).toContain('client=Reid')
    expect(query).toContain('reference=drawing+room')
    expect(query).toContain('po_number=PO-88231')
    expect(query).toContain('from=2026-08-01')
    expect(query).toContain('to=2026-08-12')
  })

  it('treats a box holding only spaces as unset', () => {
    expect(buildListQuery(orderListFilters({ q: '   ', client: '  ', from: '  ' }))).toBe('')
    expect(buildListQuery(orderListFilters({ q: '  SO-10  ' }))).toBe('q=SO-10')
  })

  it('names only filters the endpoint accepts', () => {
    // Ajv's removeAdditional strips an unknown query key silently, so an
    // invented filter would simply never narrow anything.
    expect(Object.keys(orderListFilters()).sort()).toEqual([
      'client',
      'from',
      'include_archived',
      'po_number',
      'q',
      'reference',
      'status',
      'to',
    ])
  })
})

describe('hasOrderFilters', () => {
  it('is false for an untouched bar, so an empty queue reads as empty', () => {
    expect(hasOrderFilters()).toBe(false)
    expect(hasOrderFilters(EMPTY_ORDER_SEARCH)).toBe(false)
    expect(hasOrderFilters({ ...EMPTY_ORDER_SEARCH, q: '   ' })).toBe(false)
  })

  it('is true for anything that narrows the list', () => {
    expect(hasOrderFilters({ status: 'paid' })).toBe(true)
    expect(hasOrderFilters({ q: 'SO-10' })).toBe(true)
    expect(hasOrderFilters({ po_number: 'PO-1' })).toBe(true)
    expect(hasOrderFilters({ from: '2026-08-01' })).toBe(true)
  })

  it('ignores "show archived", which widens the list rather than narrowing it', () => {
    // Otherwise ticking it under no search would relabel an empty queue as
    // "nothing matches those filters", which is a different (and wrong) answer.
    expect(hasOrderFilters({ showArchived: true })).toBe(false)
  })
})

// The search a link can carry (Userback 8287873): a report row leads here with
// the order number already in the URL, so these four are read from it rather
// than from state.
describe('the search that travels in the URL', () => {
  const params = (query) => new URLSearchParams(query)

  it('reads a bare URL as no search at all', () => {
    expect(orderSearchFromParams(params(''))).toEqual({ q: '', from: '', to: '', status: '' })
    expect(orderSearchFromParams()).toEqual({ q: '', from: '', to: '', status: '' })
  })

  it('carries the four a link may set, and leaves the local three alone', () => {
    const search = orderSearchFromParams(
      params('q=ATL-1042&from=2026-08-01&to=2026-08-31&status=paid&client=Reid')
    )
    expect(search).toEqual({ q: 'ATL-1042', from: '2026-08-01', to: '2026-08-31', status: 'paid' })
    expect(URL_ORDER_FILTERS).toEqual(['q', 'from', 'to', 'status'])
    // client / reference / po_number stay in local state — nothing links to them.
    expect(Object.hasOwn(search, 'client')).toBe(false)
  })

  // A hand-typed `?status=pending` is a 400 from the endpoint's enum, which
  // kills the whole list rather than one filter.
  it('drops a status the endpoint does not have', () => {
    expect(orderSearchFromParams(params('status=pending')).status).toBe('')
    for (const status of ORDER_STATUSES) {
      expect(orderSearchFromParams(params(`status=${status}`)).status).toBe(status)
    }
  })

  it('treats a whitespace-only parameter as unset', () => {
    expect(orderSearchFromParams(params('q=+++')).q).toBe('')
    expect(orderSearchFromParams(params('q=++ATL-1042++')).q).toBe('ATL-1042')
  })

  it('writes nothing for a cleared search, and one key per set filter', () => {
    expect(orderSearchParams()).toEqual({})
    expect(orderSearchParams(EMPTY_ORDER_SEARCH)).toEqual({})
    expect(orderSearchParams({ ...EMPTY_ORDER_SEARCH, q: 'ATL-1042', client: 'Reid' })).toEqual({
      q: 'ATL-1042',
    })
  })

  // The screen's own round trip: Search writes the URL and the next render reads
  // it back, so the two cannot disagree about what is being searched for.
  it('round-trips a committed search through the URL', () => {
    const committed = { q: 'ATL-1042', from: '2026-08-01', to: '', status: 'shipped' }
    expect(orderSearchFromParams(new URLSearchParams(orderSearchParams(committed)))).toEqual(committed)
  })

  it('narrows the list through the same orderListFilters as everything else', () => {
    const query = buildListQuery(orderListFilters(orderSearchFromParams(params('q=ATL-1042&status=paid'))))
    expect(query).toContain('q=ATL-1042')
    expect(query).toContain('status=paid')
  })

  // What the re-seed effect is keyed on. Keyed on the whole querystring instead,
  // it fired on the status select's own URL write too — re-seeding the boxes
  // from the URL and erasing a search and a date range typed but not submitted.
  describe('orderDraftSeed', () => {
    it('does not move when only the status does', () => {
      const search = { q: 'ATL-1042', from: '2026-08-01', to: '', status: 'paid' }
      expect(orderDraftSeed({ ...search, status: 'shipped' })).toBe(orderDraftSeed(search))
      expect(orderDraftSeed({ ...search, status: '' })).toBe(orderDraftSeed(search))
      expect(orderDraftSeed(search)).not.toContain('paid')
    })

    it('moves the moment one of the three boxes does', () => {
      const search = { q: 'ATL-1042', from: '2026-08-01', to: '', status: 'paid' }
      expect(orderDraftSeed({ ...search, q: 'ATL-1043' })).not.toBe(orderDraftSeed(search))
      expect(orderDraftSeed({ ...search, from: '2026-07-01' })).not.toBe(orderDraftSeed(search))
      expect(orderDraftSeed({ ...search, to: '2026-08-31' })).not.toBe(orderDraftSeed(search))
    })

    it('is empty for a cleared search, and cannot confuse two searches', () => {
      expect(orderDraftSeed()).toBe('')
      expect(orderDraftSeed(EMPTY_ORDER_SEARCH)).toBe('')
      // Encoded rather than joined by hand: `a&from=b` in the search box is a
      // different search from q=a with a from of b, and the key must say which.
      expect(orderDraftSeed({ q: 'a&from=b' })).not.toBe(orderDraftSeed({ q: 'a', from: 'b' }))
    })
  })
})

describe('ORDER_HEADER_FIELDS', () => {
  const order = Object.freeze({
    notes: 'Cut to 2.4 m drops',
    contact_phone: '021 555 0100',
    client_reference: 'Reid — drawing room',
    customer_po_number: 'PO-88231',
  })

  it('mirrors the API PATCH whitelist and offers no guest_email', () => {
    // Ajv strips a key the API does not accept, so a field declared here and
    // missing there saves nothing and says nothing.
    expect(ORDER_HEADER_FIELDS.map((f) => f.key)).toEqual([
      'notes',
      'contact_phone',
      'client_reference',
      'customer_po_number',
    ])
    // An order attributed to an account must keep writing to the account's own
    // address, so the screen never edits the guest one.
    expect(ORDER_HEADER_FIELDS.map((f) => f.key)).not.toContain('guest_email')
  })

  it('round-trips an unchanged header as an empty patch', () => {
    // diffFields sends only what moved; an empty PATCH body is a 400.
    const draft = draftFrom(order, ORDER_HEADER_FIELDS)
    expect(diffFields(order, draft, ORDER_HEADER_FIELDS).patch).toEqual({})
  })

  it('clears an emptied box to null, never to an empty string', () => {
    // A stored '' is an absence every IS NULL read misses and every ILIKE
    // '%…%' search matches — the API folds it too, and the two agreeing is
    // what keeps a cleared reference findable.
    const draft = { ...draftFrom(order, ORDER_HEADER_FIELDS), customer_po_number: '  ' }
    expect(diffFields(order, draft, ORDER_HEADER_FIELDS).patch).toEqual({
      customer_po_number: null,
    })
  })

  it('sends a corrected PO number on its own', () => {
    const draft = { ...draftFrom(order, ORDER_HEADER_FIELDS), customer_po_number: 'PO-88232' }
    expect(diffFields(order, draft, ORDER_HEADER_FIELDS).patch).toEqual({
      customer_po_number: 'PO-88232',
    })
  })

  it('labels the client PO number as theirs, in full', () => {
    const po = ORDER_HEADER_FIELDS.find((f) => f.key === 'customer_po_number')
    expect(po.label).toBe('Client PO number')
    expect(CUSTOMER_PO_HINT).toMatch(/not one of our own purchase orders/)
  })
})

describe('referenceLine', () => {
  it('shows whichever of the two numbers the client has issued', () => {
    expect(referenceLine({ client_reference: 'Drawing room' })).toBe('Ref Drawing room')
    expect(referenceLine({ customer_po_number: 'PO-1' })).toBe('Client PO PO-1')
    expect(referenceLine({ client_reference: 'A', customer_po_number: 'B' })).toBe(
      'Ref A · Client PO B'
    )
  })

  it('is empty when there is neither, so the row stays quiet', () => {
    expect(referenceLine()).toBe('')
    expect(referenceLine({ client_reference: null, customer_po_number: null })).toBe('')
  })

  it('never abbreviates the client PO to a bare "PO"', () => {
    // A purchase_orders table lands next epic; "PO 88231" on an order row is a
    // number an operator will look for in the wrong book.
    expect(referenceLine({ customer_po_number: '88231' })).toContain('Client PO')
  })
})

// With no jsdom a source scan is the only test a .jsx can have here — the idiom
// adminSamples.test.js and useCrudScreen.test.js use.
describe('the screen composes the kit rather than re-implementing it', () => {
  it('pages through useCrudScreen and the shared Pagination', () => {
    expect(SCREEN_SOURCE).toContain('useCrudScreen')
    expect(SCREEN_SOURCE).toContain('limit: ORDER_LIST_LIMIT')
    expect(SCREEN_SOURCE).toContain('<Pagination')
    expect(SCREEN_SOURCE).not.toContain('UNPAGED_LIST_LIMIT')
  })

  it('leaves the page rules to useAdminList', () => {
    // The kit already resets to page 1 on a filter change and steps back when a
    // delete empties the last page. A screen doing either as well fights it —
    // and an effect keyed on a fresh object literal refetches for ever.
    expect(SCREEN_SOURCE).not.toContain('setPage(')
    expect(MODULE_SOURCE).not.toContain('setPage')
    expect(MODULE_SOURCE).not.toContain('pageAfterLoad')
  })

  it('holds no query building or fetching of its own', () => {
    expect(SCREEN_SOURCE).not.toContain('URLSearchParams')
    expect(SCREEN_SOURCE).not.toContain('Math.ceil(')
    expect(SCREEN_SOURCE).not.toContain('apiFetch')
  })

  // A filter another screen links into belongs in the URL, not in state — the
  // rule AdminCollections' house filter already follows. Held in state, a report
  // row's link would change the address bar and leave the queue as it was.
  it('reads the linkable half of its search from the URL', () => {
    expect(SCREEN_SOURCE).toContain('useSearchParams')
    expect(SCREEN_SOURCE).toContain('orderSearchFromParams(searchParams)')
    expect(SCREEN_SOURCE).toContain('setSearchParams(orderSearchParams(')
    // The mapping is the module's, not a second copy typed into the layout.
    expect(SCREEN_SOURCE).not.toContain('searchParams.get(')
  })

  // The status select writes the URL on the spot, so a re-seed keyed on the
  // whole querystring ran on it and threw away what was in the boxes.
  it('re-seeds the boxes from the three the boxes hold, not from the querystring', () => {
    expect(SCREEN_SOURCE).toContain('orderDraftSeed(urlSearch)')
    expect(SCREEN_SOURCE).toContain('}, [draftSeed])')
    expect(SCREEN_SOURCE).not.toContain('searchParams.toString()')
  })

  it('still applies the search on Search rather than per keystroke', () => {
    // The endpoint pages and the boxes are free text; a request per letter is
    // the thing the draft/committed split exists to prevent.
    expect(SCREEN_SOURCE).toContain('const runSearch = (event) => {')
    expect(SCREEN_SOURCE).toContain('onSubmit={runSearch}')
    expect(SCREEN_SOURCE).toContain('setSearchField')
    expect(SCREEN_SOURCE).not.toMatch(/onChange=\{[^}]*setSearchParams/)
  })

  it('drives every filter through orderListFilters', () => {
    expect(SCREEN_SOURCE).toMatch(/filters: orderListFilters\(/)
    for (const name of ['q', 'client', 'reference', 'po_number', 'from', 'to']) {
      expect(Object.hasOwn(EMPTY_ORDER_SEARCH, name)).toBe(true)
    }
  })

  it('offers the four filters the client asked for, plus the catch-all', () => {
    // Client, date, reference and PO number — the bar matching the one the
    // Dynamics mirror already has beside it.
    expect(SCREEN_SOURCE).toContain('aria-label="Filter by client"')
    expect(SCREEN_SOURCE).toContain('aria-label="Filter by client reference"')
    expect(SCREEN_SOURCE).toContain('aria-label="Filter by the client\'s PO number"')
    expect(SCREEN_SOURCE).toContain('aria-label="Ordered on or after"')
    expect(SCREEN_SOURCE).toContain('aria-label="Ordered on or before"')
    expect(SCREEN_SOURCE).toContain('aria-label="Search orders"')
  })

  it('uses native date inputs rather than a picker dependency', () => {
    expect(SCREEN_SOURCE).toContain('type="date"')
  })

  it('names the client rather than an account id', () => {
    // contactLabel is the fallback chain — the account name, then its email,
    // then the guest's, and `Account #id` only for a payload whose account has
    // gone. It already lives in orderFlow.js; a second copy here could drift.
    expect(SCREEN_SOURCE).toContain('contactLabel(order)')
    expect(SCREEN_SOURCE).not.toMatch(/Account #\$\{/)
  })

  it('edits the client’s two numbers through the declared header fields', () => {
    expect(SCREEN_SOURCE).toContain('ORDER_HEADER_FIELDS')
    expect(SCREEN_SOURCE).toContain('diffFields(order, headerDraft, ORDER_HEADER_FIELDS)')
    expect(SCREEN_SOURCE).toContain("apiSend('PATCH', `/admin/orders/${order.id}`, body)")
  })

  it('prints the packing slip through the shared module, with no PDF library', () => {
    expect(SCREEN_SOURCE).toContain('printOrderPackingSlip(order)')
    expect(SCREEN_SOURCE).toContain('Packing slip')
    // ADR 008: the browser's print dialog is the PDF writer.
    expect(SCREEN_SOURCE).not.toMatch(/jspdf|pdfmake|html2pdf/i)
  })

  it('leaves the purchase-order slip alone', () => {
    // packingSlip.js still serves PurchaseOrders and its `received > 0` filter
    // is a receipting rule that has no meaning on a sales order.
    expect(SCREEN_SOURCE).not.toContain("from '../utils/packingSlip.js'")
  })
})

describe('the Source filter', () => {
  const rows = [
    { id: 1, kind: 'checkout' },
    { id: 2, kind: 'manual' },
    { id: 3, kind: 'order_request' },
    { id: 4, kind: 'backorder_request' },
  ]

  it('is what replaced the Web orders tab: website orders, alone', () => {
    expect(filterBySource(rows, 'website').map((o) => o.id)).toEqual([1, 3, 4])
    expect(filterBySource(rows, 'office').map((o) => o.id)).toEqual([2])
  })

  // Returning the SAME array when nothing is filtered matters: the screen keys
  // its re-seed effect on the list's own rows, and a fresh array every render
  // would make that effect set state for ever.
  it('hands back the very same array when no source is chosen', () => {
    expect(filterBySource(rows, '')).toBe(rows)
    expect(filterBySource(rows)).toBe(rows)
  })

  it('survives a row with no kind', () => {
    expect(filterBySource([{ id: 9 }], 'website').map((o) => o.id)).toEqual([9])
  })
})

describe('sourceCountNote', () => {
  // GET /admin/orders has no `kind` filter — Ajv would strip one silently — so
  // the narrowing happens in the browser over one page. Printing the server's
  // total above a narrowed page is the exact lie this exists to prevent.
  it('states both figures while a source filter is on', () => {
    expect(sourceCountNote({ shown: 12, loaded: 50, total: 412, source: 'website' })).toBe(
      '12 of 50 on this page · 412 matching in total'
    )
  })

  it('is the plain server total when no source is chosen', () => {
    expect(sourceCountNote({ shown: 50, loaded: 50, total: 412 })).toBe('412 matching')
  })

  it('says why the count is partial', () => {
    expect(SOURCE_FILTER_NOTE).toMatch(/endpoint has no source filter/i)
  })
})

describe('the screen keeps the two lists apart', () => {
  // The live list and the D365 mirror are different data sources. Folding web
  // orders in must never have folded the mirror in with them.
  it('never reads a /admin/legacy path', () => {
    expect(SCREEN_SOURCE).not.toContain('/admin/legacy')
  })

  // The section actions live on the tab strip now (sections.js), so the screen
  // must not carry its own copy of the button — two copies drift. The scan is
  // for the LINK, not the words and not the bare path: both the label and the
  // path appear in comments explaining why the button is elsewhere, and a scan
  // either would fail against the explanation — the same trap AdminShipping's
  // "no archive here" scan documents. `to="…"` is the token a screen could only
  // have by rendering the link.
  it('does not render its own New sales order button', () => {
    expect(SCREEN_SOURCE).not.toMatch(/to="\/admin\/orders\/new"/)
  })

  it('is the Sales orders tab', () => {
    expect(SCREEN_SOURCE).toContain('active="sales"')
  })
})

// --- sales rep attribution (A6 groundwork) ----------------------------------

import { repPatch, staffOptions, gstLabel, stockPath, orderPath, productPath, customerOrdersPath, customerHistory, markPaidNote } from './adminOrders.js'

describe('sales rep', () => {
  it('builds the PATCH body off the select value — blank clears', () => {
    expect(repPatch('7')).toEqual({ sales_rep_user_id: 7 })
    expect(repPatch(7)).toEqual({ sales_rep_user_id: 7 })
    expect(repPatch('')).toEqual({ sales_rep_user_id: null })
    // A mangled value sends nothing rather than a 400ing body.
    expect(repPatch('seven')).toBeNull()
  })

  it('turns the staff roster into options, name falling back to email', () => {
    expect(
      staffOptions([
        { id: 4, name: 'Rebecca', email: 'r@atelier.co.nz' },
        { id: 5, name: null, email: 'sales@atelier.co.nz' },
      ])
    ).toEqual([
      { id: 4, label: 'Rebecca' },
      { id: 5, label: 'sales@atelier.co.nz' },
    ])
  })
})

// --- status SETS (the dashboard's Open and Sold tiles) -----------------------

import { STATUS_SETS } from './adminOrders.js'

describe('status sets', () => {
  it('mirrors the API constants: open = HELD_STATUSES, sold = REVENUE_STATUSES', () => {
    expect(STATUS_SETS.open).toEqual(['requested', 'confirmed', 'paid'])
    expect(STATUS_SETS.sold).toEqual(['paid', 'shipped'])
  })

  it('a set name in the URL survives orderSearchFromParams', () => {
    const search = orderSearchFromParams(new URLSearchParams('status=open'))
    expect(search.status).toBe('open')
    // An unknown value is still no filter at all, not a broken list.
    expect(orderSearchFromParams(new URLSearchParams('status=pending')).status).toBe('')
  })

  it('orderListFilters expands a set name to the array the endpoint binds as ANY', () => {
    expect(orderListFilters({ status: 'open' }).status).toEqual([
      'requested',
      'confirmed',
      'paid',
    ])
    // A single status still travels as itself.
    expect(orderListFilters({ status: 'paid' }).status).toBe('paid')
    expect(orderListFilters({ status: '' }).status).toBeNull()
  })
})

// --- notes, tracking and the prepaid invoice (Userback 14 Sep) --------------

describe('the order detail beyond the editable window', () => {
  // The complaint: an order that is paid or shipped could no longer be
  // annotated, because Notes lived inside `{editable && …}` with the lines and
  // the money. The API takes a notes-only PATCH at any non-archived status, so
  // Notes render on their own with their own save. The token is the single
  // field list — a save that reached for ORDER_HEADER_FIELDS would drag the
  // client's numbers and the discount along and be refused past confirmation.
  it('saves notes on their own patch, outside the line-edit block', () => {
    expect(SCREEN_SOURCE).toContain('const NOTES_FIELD = ORDER_HEADER_FIELDS.filter(')
    expect(SCREEN_SOURCE).toContain('diffFields(order, headerDraft, NOTES_FIELD)')
    expect(SCREEN_SOURCE).toContain('Save notes')
    // The old read-only render is gone: it was the only thing shown once the
    // textarea disappeared, and both existing at once is two sources of truth.
    expect(SCREEN_SOURCE).not.toContain('{order.notes && (')
  })

  it('explains what a client reference is where it is only read', () => {
    // "Reference" alone reads as one of ours. One sentence, one constant, used
    // by the read-only pair and the edit form both.
    expect(SCREEN_SOURCE).toContain('const CLIENT_REFERENCE_HINT =')
    expect(SCREEN_SOURCE).toContain('Client reference:')
    expect(SCREEN_SOURCE).not.toMatch(/\n\s+Reference:\{' '\}/)
  })

  it('reads the client’s own numbers under Client, not in a column of their own', () => {
    // Asked for 23 Sep 2026: the reference and PO number are the client's, so
    // they read with the client's name, email and phone.
    const client = PAGE_SOURCE.slice(
      PAGE_SOURCE.indexOf('<span style={sectionLabel}>Client</span>'),
      PAGE_SOURCE.indexOf('<span style={sectionLabel}>Billing &amp; delivery</span>')
    )
    expect(client).toContain('Client reference:')
    expect(client).toContain('Client PO number:')
    expect(PAGE_SOURCE).not.toContain('Client’s own numbers')
  })

  it('ships with an optional tracking URL and says the client was told', () => {
    // The body comes from shipBody, which omits the key when the box is blank
    // (the office hand-delivers) and refuses a scheme-less one before Ship is
    // pressed rather than after — see its own describe below.
    expect(SCREEN_SOURCE).toContain('const ship = shipBody(trackingUrl)')
    expect(SCREEN_SOURCE).toContain('if (!ship.ok) return setError(ship.error)')
    expect(SCREEN_SOURCE).toContain(
      "apiSend('POST', `/admin/orders/${order.id}/ship`, ship.body)"
    )
    expect(SCREEN_SOURCE).toContain('Tracking URL (optional)')
    expect(SCREEN_SOURCE).toContain('the client has been emailed')
    // And it is readable afterwards, as a link, under Delivery.
    expect(SCREEN_SOURCE).toContain('{order.tracking_url && (')
  })

  it('caps every header box at the column the API caps', () => {
    // Without these the typist finds out at the save: the endpoint answers a
    // long value with a raw Fastify 400 and the note is still in the box.
    expect(HEADER_MAX).toEqual(API_HEADER_MAX)
    expect(TRACKING_URL_MAX).toBe(API_TRACKING_URL_MAX)
    for (const key of Object.keys(API_HEADER_MAX)) {
      expect(SCREEN_SOURCE).toContain(`maxLength={HEADER_MAX.${key}}`)
    }
    expect(SCREEN_SOURCE).toContain('maxLength={TRACKING_URL_MAX}')
  })

  it('tells a card checkout apart from an uninvoiced order', () => {
    // "Not invoiced yet" on an order Stripe already settled read as money
    // outstanding. Xero stays a separate line — a prepaid order may never be
    // pushed there at all.
    expect(SCREEN_SOURCE).toContain('Paid by card at checkout — receipt emailed')
    expect(SCREEN_SOURCE).toContain('Not yet in Xero.')
  })
})

// --- a typed note survives somebody else's action ---------------------------

describe('keepTypedHeader', () => {
  // `orders` takes a new identity after EVERY mutation (useMutation always
  // awaits reload), and the screen re-seeds its drafts from the row that comes
  // back. Before this, typing a note on a paid order and then assigning a rep —
  // or shipping it, which is the annotate-then-ship workflow the notes box was
  // added for — threw the note away with no warning.
  const row = { notes: 'packed', contact_phone: '021', client_reference: '', customer_po_number: '' }
  const fresh = () => draftFrom(row, ORDER_HEADER_FIELDS)

  it('keeps a box that has been typed into when the list reloads', () => {
    const typed = { ...fresh(), notes: 'courier collected 3pm' }
    expect(keepTypedHeader(typed, fresh()).notes).toBe('courier collected 3pm')
  })

  it('keeps a box the person emptied — clearing a note is an edit too', () => {
    expect(keepTypedHeader({ ...fresh(), notes: '' }, fresh()).notes).toBe('')
  })

  it('re-seeds a box that still holds server truth', () => {
    // Saving is what makes the two agree: `saveNotes` sends the draft, the row
    // comes back holding it, and the seed lands unopposed.
    const saved = draftFrom({ ...row, notes: 'courier collected 3pm' }, ORDER_HEADER_FIELDS)
    expect(keepTypedHeader(saved, saved)).toEqual(saved)
    expect(keepTypedHeader(fresh(), fresh())).toEqual(fresh())
  })

  it('keeps the stale box when someone ELSE changed that column — the ceiling', () => {
    // "Typed into" is "differs from the row just fetched", which cannot tell a
    // local edit from a concurrent remote one. The open draft wins until the
    // order is closed and reopened. Documented, not desired.
    const remote = draftFrom({ ...row, notes: 'rang about the second roll' }, ORDER_HEADER_FIELDS)
    expect(keepTypedHeader(fresh(), remote).notes).toBe('packed')
  })

  it('seeds wholesale from an empty draft — the state `toggle` leaves behind', () => {
    // Opening another order must never inherit the last one's unsaved note.
    expect(keepTypedHeader({}, fresh())).toEqual(fresh())
  })

  it('mutates neither argument', () => {
    const draft = { ...fresh(), notes: 'typed' }
    const seed = fresh()
    keepTypedHeader(draft, seed)
    expect(draft.notes).toBe('typed')
    expect(seed).toEqual(fresh())
  })

  it('is what the screen re-seeds its header draft with', () => {
    expect(PAGE_SOURCE).toContain(
      'setHeaderDraft((draft) => keepTypedHeader(draft, draftFrom(order, ORDER_HEADER_FIELDS)))'
    )
    // The other half of the rule: a draft belongs to the order it was opened
    // on, and on its own page that is the id in the URL — a new id starts from
    // an empty header draft.
    expect(PAGE_SOURCE).toMatch(/setHeaderDraft\(\{\}\)\n\s+\}, \[id, setError\]\)/)
  })
})


// --- the tracking box, before Ship is pressed -------------------------------

describe('shipBody', () => {
  // The API's ship schema is `pattern: '^(https?://.*)?$'`, and Ship is the
  // press that emails the client — so a value it will refuse has to be refused
  // here, while the box is still on screen and nothing has been sent.

  it('ships a hand delivery with no key at all', () => {
    // Not `{ tracking_url: '' }`: the empty string is legal to the pattern but
    // would put an empty link in the shipped letter.
    expect(shipBody('')).toEqual({ ok: true, body: {} })
    expect(shipBody('   ')).toEqual({ ok: true, body: {} })
    expect(shipBody(undefined)).toEqual({ ok: true, body: {} })
  })

  it('sends a real courier link, trimmed', () => {
    expect(shipBody('  https://tracking.nzpost.co.nz/ABC123  ')).toEqual({
      ok: true,
      body: { tracking_url: 'https://tracking.nzpost.co.nz/ABC123' },
    })
    expect(shipBody('http://courier.example/x').body).toEqual({
      tracking_url: 'http://courier.example/x',
    })
  })

  it('refuses what the API refuses, in the screen own words', () => {
    // A pasted consignment number and a bare domain are the two the office
    // actually types; `javascript:` is why the API validates at all.
    for (const value of ['ABC123456NZ', 'www.nzpost.co.nz', 'javascript:alert(1)']) {
      const result = shipBody(value)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('http://')
      expect(result.body).toBeUndefined()
    }
  })

  it('is as case-sensitive as Ajv, which runs the pattern unflagged', () => {
    // Accepting HTTPS:// here would only move the 400 back to the press.
    expect(shipBody('HTTPS://tracking.nzpost.co.nz/ABC123').ok).toBe(false)
  })
})

describe('gstLabel', () => {
  it('names the basis the API derived the figure on, not just a percentage', () => {
    expect(gstLabel({ rate: 0.15, basis: 'Exclusive' })).toBe('GST (15%)')
    expect(gstLabel({ rate: 0.15, basis: 'Inclusive' })).toBe('GST (15%, included)')
    expect(gstLabel({ rate: 0.15, basis: 'NoTax' })).toBe('GST (none)')
    expect(gstLabel()).toBe('GST (0%)')
  })
})

describe('stockPath', () => {
  it('links a line SKU to the Stock screen with the search seeded, encoded', () => {
    expect(stockPath('PF-ATL-02')).toBe('/admin/stock?q=PF-ATL-02')
    expect(stockPath('A/B 1')).toBe('/admin/stock?q=A%2FB%201')
    expect(stockPath()).toBe('/admin/stock?q=')
  })

  // The screen must actually read it, or the link lands on an unfiltered list.
  it('is honoured by the Stock screen', () => {
    const stock = readFileSync(new URL('./AdminStock.jsx', import.meta.url), 'utf8')
    expect(stock).toContain("searchParams.get('q')")
  })
})


// --- the order page, the product link, the customer's history ---------------

describe('orderPath / productPath', () => {
  it('opens an order on its own page, by id', () => {
    expect(orderPath({ id: 42 })).toBe('/admin/orders/42')
  })

  it('links a SKU to its design’s own page, and to nothing without an id', () => {
    // Straight to the page, not the list's old `?open=` (which the list still
    // redirects for bookmarks): a link the CRM writes should not bounce.
    expect(productPath(7)).toBe('/admin/products/7')
    expect(productPath(null)).toBeNull()
    expect(productPath(undefined)).toBeNull()
  })
})

describe('customerOrdersPath', () => {
  it('asks the desk for everything under that email, archived included', () => {
    const path = customerOrdersPath('  liz@atelier.co.nz ')
    expect(path).toContain('/admin/orders?')
    expect(path).toContain('client=liz%40atelier.co.nz')
    expect(path).toContain('include_archived=true')
    expect(path).toContain('limit=50')
  })

  it('is null with no email to ask about', () => {
    expect(customerOrdersPath('')).toBeNull()
    expect(customerOrdersPath(null)).toBeNull()
  })
})

describe('customerHistory', () => {
  const rows = [
    { status: 'paid', total_cents: 43900 },
    { status: 'shipped', total_cents: '56900' },
    { status: 'requested', total_cents: 66500 },
    { status: 'declined', total_cents: 100 },
  ]

  it('counts every order but sums only paid and shipped money', () => {
    expect(customerHistory(rows, 4)).toEqual({
      orders: 4,
      paidOrders: 2,
      revenueCents: 100800,
      averageCents: 50400,
      partial: false,
    })
  })

  it('says when the page is shorter than the server total', () => {
    expect(customerHistory(rows, 60).partial).toBe(true)
    expect(customerHistory(rows, 60).orders).toBe(60)
  })

  it('is all zeros for nobody', () => {
    expect(customerHistory([], 0)).toEqual({ orders: 0, paidOrders: 0, revenueCents: 0, averageCents: 0, partial: false })
    expect(customerHistory(undefined).orders).toBe(0)
  })
})

describe('markPaidNote', () => {
  it('reads plainly on an un-integrated deployment', () => {
    expect(markPaidNote('SO-1', { order: {} })).toBe('SO-1 — marked paid.')
  })

  it('names the invoice Xero marked paid', () => {
    expect(markPaidNote('SO-1', { xero_payment: { recorded: true, invoice_number: 'INV-0042' } })).toBe(
      'SO-1 — marked paid, and INV-0042 is marked paid in Xero.'
    )
  })

  it("carries Xero's reason when nothing was recorded — the order is still paid", () => {
    expect(markPaidNote('SO-1', { xero_payment: { recorded: false, reason: 'this order has no invoice in Xero yet.' } })).toBe(
      'SO-1 — marked paid. Xero: this order has no invoice in Xero yet.'
    )
  })
})


// --- the list is the list; the page is the desk (16 Sep 2026) ---------------

describe('the order opens on its own page', () => {
  it('the list links every row to /admin/orders/:id and edits nothing itself', () => {
    expect(LIST_SOURCE).toContain('orderPath(order)')
    expect(LIST_SOURCE).not.toContain('OrderLinesEditor')
    expect(LIST_SOURCE).not.toContain('ORDER_HEADER_FIELDS')
    expect(LIST_SOURCE).not.toContain("apiSend('PATCH'")
    expect(LIST_SOURCE).not.toContain('openId')
  })

  it('the page reads one order by id and holds the whole desk', () => {
    expect(PAGE_SOURCE).toContain('useParams()')
    expect(PAGE_SOURCE).toContain('safeFetch(`/admin/orders/${id}`)')
    expect(PAGE_SOURCE).toContain('<OrderLinesEditor')
    expect(PAGE_SOURCE).toContain('availableActions(order)')
    expect(PAGE_SOURCE).toContain('<CustomerOrders')
    // Delete stays with the list and the kit; the page never hand-rolls one.
    expect(PAGE_SOURCE).not.toContain('apiDelete')
    expect(PAGE_SOURCE).not.toContain('remove.ask')
  })

  it('links a line to its design, and keeps the stock row one press away', () => {
    expect(PAGE_SOURCE).toContain('productPath(line.product_id)')
    expect(PAGE_SOURCE).toContain('stockPath(line.sku)')
  })

  it('says what Xero did when an order is marked paid', () => {
    expect(PAGE_SOURCE).toContain('markPaidNote(order.order_number, result)')
  })

  it('cancels, in the office\'s word, at every status the API allows', () => {
    expect(PAGE_SOURCE).toContain("confirmLabel: 'Cancel order'")
    expect(PAGE_SOURCE).not.toContain("confirmLabel: 'Decline'")
  })

  // The same complaint the reserve form drew: catalogue hits with no way off
  // the screen but a refresh. One editor serves the create form and the order
  // page, so the exit is wired once here. No jsdom, so this is a source scan.
  it('the catalogue search can be dismissed, and cataloguing a design dismisses it', () => {
    expect(EDITOR_SOURCE).toContain('Clear results')
    expect(EDITOR_SOURCE).toContain('onClick={clearSearch}')
    expect(bodyOf(EDITOR_SOURCE, 'openProductForm')).toContain('clearSearch()')
  })
})

// --- the Emails section: who hears about a status change (23 Sep 2026) -------
//
// Every status change emails the client, the sales rep and the addresses the
// office adds on the order. The API sends; these rules mirror its
// src/orders/notify-emails.js so Add refuses what the API would 400.

import {
  NOTIFY_EMAILS_MAX,
  PACKING_SLIP_NOT_EMAILED,
  STATUS_EMAIL_NOTE,
  addNotifyEmail,
  removeNotifyEmail,
  statusEmailRecipients,
} from './adminOrders.js'

describe('the Emails section', () => {
  const order = {
    id: 12,
    order_number: 'SO-12',
    client_email: 'client@studio.example',
    guest_email: null,
    sales_rep_user_id: 4,
    sales_rep_name: 'Rebecca',
    sales_rep_email: 'rebecca@atelier.example',
    notify_emails: ['accounts@studio.example'],
  }

  it('lists the client, the rep and the added addresses', () => {
    expect(statusEmailRecipients(order)).toEqual({
      client: 'client@studio.example',
      rep: { name: 'Rebecca', email: 'rebecca@atelier.example' },
      added: ['accounts@studio.example'],
    })
    // A guest order has no account; its own address is the client's.
    expect(statusEmailRecipients({ guest_email: 'walkin@example.com' }).client).toBe('walkin@example.com')
    // Nobody assigned, and an older API with no list at all.
    expect(statusEmailRecipients({})).toEqual({ client: null, rep: null, added: [] })
  })

  it('says so when the rep is assigned but no longer emailed (an archived login)', () => {
    const rep = statusEmailRecipients({ ...order, sales_rep_email: null }).rep
    expect(rep).toEqual({ name: 'Rebecca', email: null })
  })

  it('adds a typed address by sending the WHOLE list, trimmed', () => {
    expect(addNotifyEmail(order, '  pa@studio.example ')).toEqual({
      ok: true,
      patch: { notify_emails: ['accounts@studio.example', 'pa@studio.example'] },
    })
  })

  it('refuses, in words, what the API would refuse or what would double a letter', () => {
    const refused = (typed, over = {}) => addNotifyEmail({ ...order, ...over }, typed)
    expect(refused('   ')).toMatchObject({ ok: false, error: 'Type an email address to add.' })
    expect(refused('not-an-address').ok).toBe(false)
    expect(refused('two words@studio.example').ok).toBe(false)
    // Already emailed — whatever the case it was typed in.
    expect(refused('CLIENT@studio.example').error).toContain("client's address")
    expect(refused('Rebecca@Atelier.example').error).toContain("sales rep's address")
    expect(refused('Accounts@Studio.example').error).toContain('already on the list')
    const full = Array.from({ length: NOTIFY_EMAILS_MAX }, (_, i) => `p${i}@studio.example`)
    expect(refused('one-more@studio.example', { notify_emails: full }).error).toContain(`at most ${NOTIFY_EMAILS_MAX}`)
  })

  it('mirrors the API cap', () => {
    // atelier-api src/orders/notify-emails.js NOTIFY_EMAILS_MAX.
    expect(NOTIFY_EMAILS_MAX).toBe(10)
  })

  it('removes one address and keeps the rest', () => {
    expect(removeNotifyEmail({ notify_emails: ['a@x.example', 'b@x.example'] }, 'a@x.example')).toEqual({
      notify_emails: ['b@x.example'],
    })
    expect(removeNotifyEmail({}, 'a@x.example')).toEqual({ notify_emails: [] })
  })

  it('sits on the order page and saves through the order PATCH', () => {
    expect(PAGE_SOURCE).toContain('<PanelHead label="Emails" />')
    expect(PAGE_SOURCE).toContain('statusEmailRecipients(order)')
    expect(bodyOf(PAGE_SOURCE, 'addEmail')).toContain("apiSend('PATCH', `/admin/orders/${order.id}`, added.patch)")
    expect(bodyOf(PAGE_SOURCE, 'removeEmail')).toContain('removeNotifyEmail(order, email)')
    expect(PAGE_SOURCE).toContain('{STATUS_EMAIL_NOTE}')
    expect(STATUS_EMAIL_NOTE).toMatch(/confirmed, paid, shipped, cancelled/)
  })

  // "We don't send the packing slip as an email": it prints, and nothing on
  // the page posts it anywhere.
  it('never emails the packing slip — it prints, and the section says so', () => {
    expect(PAGE_SOURCE).toContain('{PACKING_SLIP_NOT_EMAILED}')
    expect(PACKING_SLIP_NOT_EMAILED).toMatch(/never emailed/)
    expect(bodyOf(PAGE_SOURCE, 'packingSlip')).toContain('printOrderPackingSlip(order)')
    expect(bodyOf(PAGE_SOURCE, 'packingSlip')).not.toContain('apiSend')
  })
})
