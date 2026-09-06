import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery, pageCount } from '../admin/list.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import { UNPAGED_LIST_LIMIT } from './adminLists.js'
import { ORDER_STATUSES } from '../admin/orderFlow.js'
import {
  CUSTOMER_PO_HINT,
  EMPTY_ORDER_SEARCH,
  ORDER_HEADER_FIELDS,
  ORDER_LIST_LIMIT,
  SOURCE_FILTER_NOTE,
  URL_ORDER_FILTERS,
  filterBySource,
  hasOrderFilters,
  orderDraftSeed,
  orderListFilters,
  orderSearchFromParams,
  orderSearchParams,
  referenceLine,
  sourceCountNote,
} from './adminOrders.js'

const SCREEN_SOURCE = readFileSync(new URL('./AdminOrders.jsx', import.meta.url), 'utf8')
const MODULE_SOURCE = readFileSync(new URL('./adminOrders.js', import.meta.url), 'utf8')

// The endpoint's own numbers (atelier-api src/orders/admin-orders.js).
const API_DEFAULT_LIMIT = 50
const API_MAX_LIMIT = 200

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
