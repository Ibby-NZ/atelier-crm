import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  ALLOWED_TRANSITIONS,
  DELETABLE_SAMPLE_ORDER_STATUSES,
  NEW_SAMPLE_ORDER,
  SAMPLE_ORDERS_PATH,
  SAMPLE_ORDER_FIELDS,
  SAMPLE_ORDER_STATUSES,
  STATUS_STAMPS,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  availableMoves,
  describeSampleOrder,
  isDeletableStatus,
  orderMeta,
  orderTitle,
  sampleOrderFilters,
  sampleOrderPath,
  stampDate,
  stampEntries,
  statusLabel,
  statusTone,
  transitionPath,
} from './sampleFlow.js'

const MODULE_SOURCE = readFileSync(new URL('./sampleFlow.js', import.meta.url), 'utf8')
const SCREEN_SOURCE = readFileSync(new URL('./AdminSampleOrders.jsx', import.meta.url), 'utf8')
const APP_SOURCE = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const TABS_SOURCE = readFileSync(
  new URL('../components/sectionTabs.jsx', import.meta.url),
  'utf8'
)

// A sample order as the API returns it: parents by name, one stamp per
// transition, the machine's state.
const order = (extra = {}) => ({
  id: 11,
  showroom_id: 2,
  colourway_id: 12,
  supplier_id: 3,
  label: null,
  status: 'requested',
  requested_at: '2026-08-01T02:00:00.000Z',
  ordered_at: null,
  in_transit_at: null,
  received_at: null,
  displayed_at: null,
  cancelled_at: null,
  notes: null,
  archived_at: null,
  showroom_name: 'Newmarket',
  colourway_name: 'Ecru',
  colourway_sku: 'PF-ATLAS-01',
  product_name: 'Atlas',
  brand_name: 'Pierre Frey',
  supplier_name: 'Pierre Frey',
  ...extra,
})

describe('the machine mirrors the API', () => {
  // The API's src/samples/sample-order-states.js is the authority and answers a
  // wrong move with a 409; this mirror exists so the UI never offers one. The
  // literal map below is this test's second copy of the machine, so a hand-edit
  // to sampleFlow.js cannot drift silently.
  it('declares exactly the moves the API allows', () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      requested: ['ordered', 'cancelled'],
      ordered: ['in_transit', 'cancelled'],
      in_transit: ['received', 'cancelled'],
      received: ['displayed', 'cancelled'],
      displayed: [],
      cancelled: [],
    })
  })

  it('is internally consistent', () => {
    const known = new Set(SAMPLE_ORDER_STATUSES)
    for (const status of SAMPLE_ORDER_STATUSES) {
      expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true)
      expect(typeof STATUS_STAMPS[status]).toBe('string')
      for (const target of ALLOWED_TRANSITIONS[status]) {
        expect(known.has(target)).toBe(true)
        expect(target).not.toBe(status)
      }
    }
    for (const status of DELETABLE_SAMPLE_ORDER_STATUSES) {
      expect(known.has(status)).toBe(true)
    }
  })

  it('keeps displayed and cancelled terminal', () => {
    // An abandoned order is re-raised as a new request, never resurrected —
    // reopening would leave cancelled_at stamped on a live row.
    expect(ALLOWED_TRANSITIONS.displayed).toEqual([])
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([])
  })

  it('stamps one column per state', () => {
    expect(Object.keys(STATUS_STAMPS).sort()).toEqual([...SAMPLE_ORDER_STATUSES].sort())
    expect(new Set(Object.values(STATUS_STAMPS)).size).toBe(SAMPLE_ORDER_STATUSES.length)
  })
})

describe('availableMoves', () => {
  it('offers exactly the legal moves for the state', () => {
    const moves = availableMoves(order())
    expect(moves.map((m) => m.key)).toEqual(['ordered', 'cancelled'])
    expect(moves[0].label).toBe('Mark ordered')
    expect(moves[0].tone).toBe('accent')
    // Cancelling is the destructive-looking one, and reads that way.
    expect(moves[1].label).toBe('Cancel order')
    expect(moves[1].tone).toBe('danger')
  })

  it('offers nothing on a terminal state', () => {
    expect(availableMoves(order({ status: 'displayed' }))).toEqual([])
    expect(availableMoves(order({ status: 'cancelled' }))).toEqual([])
  })

  it('offers nothing on an archived order', () => {
    // Restore it first, so a mutation is never applied to something filed away
    // — the same rule orderFlow.js applies to a web order.
    expect(availableMoves(order({ archived_at: '2026-08-02T00:00:00.000Z' }))).toEqual([])
  })

  it('offers nothing for an unknown state rather than throwing', () => {
    expect(availableMoves(order({ status: 'shipped' }))).toEqual([])
    expect(availableMoves(null)).toEqual([])
  })
})

describe('isDeletableStatus', () => {
  it('allows a hard delete only where nothing happened', () => {
    // The delete policy's "409 unless requested or cancelled": an order placed
    // with a house is a commercial record. This predicate is why Delete is
    // greyed rather than discovered as a refusal.
    expect(isDeletableStatus('requested')).toBe(true)
    expect(isDeletableStatus('cancelled')).toBe(true)
    for (const status of ['ordered', 'in_transit', 'received', 'displayed']) {
      expect(isDeletableStatus(status)).toBe(false)
    }
  })
})

describe('paths', () => {
  it('are built in one place', () => {
    expect(sampleOrderPath(11)).toBe('/admin/sample-orders/11')
    expect(transitionPath({ id: 11 })).toBe('/admin/sample-orders/11/transition')
    expect(SAMPLE_ORDERS_PATH).toBe('/admin/sample-orders')
  })

  it('keeps the row toggle and "Archive instead" apart', () => {
    // "Archive instead" is offered on a REFUSED delete, so pointing it at the
    // toggle would answer a request to remove the row by RESTORING it.
    const archived = order({ archived_at: '2026-08-02T00:00:00.000Z' })
    expect(archiveVerb(archived)).toBe('restore')
    expect(archiveTogglePath(archived)).toBe('/admin/sample-orders/11/restore')
    expect(archiveInsteadPath(archived)).toBe('/admin/sample-orders/11/archive')
    expect(archiveTogglePath(order())).toBe('/admin/sample-orders/11/archive')
  })
})

describe('sampleOrderFilters', () => {
  it('drops an unset filter rather than sending it empty', () => {
    // An "All" select forwarded as '' becomes `status=`, which the endpoint's
    // enum answers with a 400 that kills the WHOLE list, not one filter.
    expect(buildListQuery(sampleOrderFilters())).toBe('')
  })

  it('passes every set filter through', () => {
    const query = buildListQuery(
      sampleOrderFilters({
        term: ' atlas ',
        status: 'ordered',
        showroomId: '4',
        supplierId: '9',
        showArchived: true,
      })
    )
    const params = new URLSearchParams(query)
    expect(params.get('q')).toBe('atlas')
    expect(params.get('status')).toBe('ordered')
    expect(params.get('showroom_id')).toBe('4')
    expect(params.get('supplier_id')).toBe('9')
    expect(params.get('include_archived')).toBe('true')
  })
})

describe('fields', () => {
  it('declares the same columns the API PATCH accepts', () => {
    // Mirrors SAMPLE_ORDER_UPDATE_COLUMNS. A key declared here and missing
    // there is stripped by Ajv's removeAdditional and would save nothing.
    // `status` is deliberately absent from both: the transition endpoint is the
    // only way a state moves, because a move writes the stamp beside it.
    expect(SAMPLE_ORDER_FIELDS.map((f) => f.key)).toEqual([
      'showroom_id',
      'colourway_id',
      'supplier_id',
      'label',
      'notes',
    ])
    expect(Object.keys(NEW_SAMPLE_ORDER).sort()).toEqual(
      SAMPLE_ORDER_FIELDS.map((f) => f.key).sort()
    )
  })

  it('requires the showroom in both directions', () => {
    // The column is NOT NULL — a request can be redirected but never un-homed —
    // and the route types it a plain integer, so a blank must fail HERE rather
    // than arrive as the null the API 400s.
    expect(SAMPLE_ORDER_FIELDS.find((f) => f.key === 'showroom_id').required).toBe(true)
  })
})

describe('labels and tones', () => {
  it('names a status for a person', () => {
    expect(statusLabel('in_transit')).toBe('In transit')
    expect(statusLabel(undefined)).toBe('—')
    // An unknown value from a widened CHECK still prints itself.
    expect(statusLabel('on_a_boat')).toBe('on_a_boat')
  })

  it('uses only tones StatusPill can draw', () => {
    for (const status of SAMPLE_ORDER_STATUSES) {
      expect(['sage', 'clay', 'muted']).toContain(statusTone(status))
    }
    expect(statusTone('unknown')).toBe('muted')
  })
})

describe('orderTitle and orderMeta', () => {
  it('leads with the label where staff typed one', () => {
    expect(orderTitle(order({ label: ' Grand Corail memo ' }))).toBe('Grand Corail memo')
  })

  it('falls back to the design the request names', () => {
    expect(orderTitle(order())).toBe('Atlas — Ecru')
    // An order may name material the catalogue does not hold — often exactly
    // why it is being ordered — so a row with neither is still a real request.
    expect(orderTitle(order({ product_name: null, colourway_name: null }))).toBe(
      'Unlabelled request'
    )
  })

  it('names the house, the design and the colour', () => {
    expect(orderMeta(order())).toBe('Pierre Frey · Atlas · Ecru')
    const unlinked = order({ brand_name: null, product_name: null, colourway_name: null })
    expect(orderMeta(unlinked)).toBe('From Pierre Frey')
    expect(orderMeta({ ...unlinked, supplier_name: null })).toBe('Not linked to a design')
  })
})

describe('describeSampleOrder', () => {
  it('names the row by what it is for and where it is going', () => {
    // Nothing on a sample order is unique — two showrooms asking one house for
    // one design are two real requests — so the dialog names the pair a person
    // asks about rather than pretending one field identifies it.
    expect(describeSampleOrder(order())).toBe('Atlas — Ecru for Newmarket')
    expect(describeSampleOrder(order({ label: 'JT wallcovering book' }))).toBe(
      'JT wallcovering book for Newmarket'
    )
  })

  it('returns undefined for an empty row, so the kit says "That sample order"', () => {
    expect(describeSampleOrder(undefined)).toBeUndefined()
    expect(
      describeSampleOrder({ label: null, product_name: null, showroom_name: null })
    ).toBeUndefined()
  })
})

describe('stampEntries', () => {
  it('lists the stamped transitions in machine order', () => {
    const moved = order({
      status: 'in_transit',
      ordered_at: '2026-08-03T02:00:00.000Z',
      in_transit_at: '2026-08-05T02:00:00.000Z',
    })
    expect(stampEntries(moved).map((e) => e.key)).toEqual(['requested', 'ordered', 'in_transit'])
    expect(stampEntries(moved).at(-1).label).toBe('In transit')
  })

  it('skips a state the order has not been in', () => {
    // A NULL stamp reads as "has not been there" — that is the point of one
    // column per transition.
    expect(stampEntries(order()).map((e) => e.key)).toEqual(['requested'])
    expect(stampEntries({})).toEqual([])
  })

  it('renders a stamp as the date the API sent, never a clock reading', () => {
    expect(stampDate('2026-08-03T02:00:00.000Z')).toBe('2026-08-03')
    expect(stampDate(null)).toBe('')
  })
})

describe('the screen composes the W1 CRUD kit', () => {
  it('uses useCrudScreen and re-implements no step of the delete flow', () => {
    expect(SCREEN_SOURCE).toContain('useCrudScreen')
    expect(SCREEN_SOURCE).toContain('remove.ask')
    expect(SCREEN_SOURCE).toContain('<ConfirmDialog {...remove.dialog} />')
    expect(SCREEN_SOURCE).not.toContain('apiDelete')
    expect(SCREEN_SOURCE).not.toContain('attemptDelete')
    expect(SCREEN_SOURCE).not.toContain('describeBlockers')
    expect(SCREEN_SOURCE).not.toContain('deleteDialog')
    expect(SCREEN_SOURCE).not.toContain('Math.ceil(')
  })

  it('supplies an archive action, so a blocked delete can offer "Archive instead"', () => {
    expect(SCREEN_SOURCE).toContain('archive: (row) => apiSend')
    expect(SCREEN_SOURCE).toContain('archiveInsteadPath')
  })

  it('greys Delete outside requested/cancelled rather than discovering the 409', () => {
    expect(SCREEN_SOURCE).toContain('disabled={busy || !isDeletableStatus(row.status)}')
  })
})

describe('a move is a verb, not a status PATCH', () => {
  it('posts the transition endpoint and never patches status', () => {
    expect(SCREEN_SOURCE).toContain(
      "apiSend('POST', transitionPath(row), { status: move.key })"
    )
    // The PATCH whitelist has no status key (asserted above), and the buttons
    // come from the mirrored machine, so an illegal move is never drawn.
    expect(SCREEN_SOURCE).toContain('availableMoves(row)')
  })

  it('offers the full vocabulary in the list filter', () => {
    // Filtering FOR any state is fine; writing one is not.
    expect(SCREEN_SOURCE).toContain('{SAMPLE_ORDER_STATUSES.map')
  })
})

describe('the screen stays inside its own surface', () => {
  it('names no admin endpoint but the supplier picker', () => {
    // Anchored on the opening quote, so a relative import is not mistaken for
    // an endpoint. Every sample-order and showroom path arrives as an imported
    // constant; suppliers is a <select> source, not a second grid.
    const quoted = SCREEN_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []
    expect(new Set(quoted.map((hit) => hit.slice(1)))).toEqual(new Set(['/admin/suppliers']))
  })

  it('reads no legacy endpoint and touches no staff comment column', () => {
    for (const source of [MODULE_SOURCE, SCREEN_SOURCE]) {
      expect(source).not.toContain('/admin/legacy')
      expect(source).not.toContain('legacy_cuttings')
      expect(source).not.toMatch(/\.comments\b/)
      expect(source).not.toMatch(/['"]comments['"]/)
    }
  })

  it('does no date arithmetic anywhere', () => {
    // The stamps are the API's timestamps rendered verbatim; a Date constructed
    // here would re-render them in the device's time zone and disagree with
    // every other reading of the same row.
    for (const source of [MODULE_SOURCE, SCREEN_SOURCE]) {
      expect(source).not.toMatch(/Date\.now\(/)
      expect(source).not.toMatch(/new Date\(/)
      expect(source).not.toMatch(/Date\.parse\(/)
      expect(source).not.toMatch(/getTime\(/)
    }
    expect(MODULE_SOURCE.length).toBeGreaterThan(0)
    expect(SCREEN_SOURCE.length).toBeGreaterThan(0)
  })
})

describe('the retired routes redirect', () => {
  // There is no jsdom, so the router cannot be mounted; the source is the
  // assertable surface, exactly as the kit-composition scans read it.
  it('sends /samples to the live register', () => {
    expect(APP_SOURCE).toContain(
      '<Route path="/samples" element={<Navigate to="/admin/samples" replace />} />'
    )
  })

  it('sends /showroom-samples to the live sample orders', () => {
    expect(APP_SOURCE).toContain(
      '<Route path="/showroom-samples" element={<Navigate to="/admin/sample-orders" replace />} />'
    )
  })

  it('routes the new screen and keeps the scanner on its own path', () => {
    expect(APP_SOURCE).toContain(
      '<Route path="/admin/sample-orders" element={<AdminSampleOrders />} />'
    )
    expect(APP_SOURCE).toContain('<Route path="/sample-scanner" element={<SampleScanner />} />')
  })

  it('no longer mounts the demo screens', () => {
    // The redirect is what stops a bookmark falling into the catch-all and
    // landing on the dashboard as though the screen had been deleted.
    expect(APP_SOURCE).not.toContain('SampleTracking')
    expect(APP_SOURCE).not.toContain('ShowroomSamples')
  })

  it('retires the Tracking tab and adds Sample orders to the strip', () => {
    expect(TABS_SOURCE).toContain("to: '/admin/sample-orders'")
    // A tab pointing at the redirected route would bounce straight back to the
    // register. The apostrophes anchor the exact path — '/sample-scanner' does
    // not match.
    expect(TABS_SOURCE).not.toContain("to: '/samples'")
  })
})
