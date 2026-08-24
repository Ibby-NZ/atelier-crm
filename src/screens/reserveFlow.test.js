// reserveFlow.js — the rules behind the live reserves & cuttings screens.
//
// The transition map is asserted as a LITERAL second copy of the API's
// src/reserves/reserve-line-states.js, so a hand-edit on either side fails a
// test loudly instead of letting the CRM draw a door the API keeps locked —
// the same idiom sampleFlow.test.js uses. The source scans at the bottom hold
// the rules a behavioural test cannot: no browser clock anywhere near the
// screens, and the list screen composing the delete kit rather than
// re-implementing it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ACCOUNT_MODES,
  ALLOWED_TRANSITIONS,
  CFA_LABELS,
  CFA_VALUES,
  DELETABLE_LINE_STATUSES,
  DOCKET_FIELDS,
  LINE_FIELDS,
  LINE_KINDS,
  LINE_STATUSES,
  NEW_DOCKET,
  NEW_LINE,
  RESERVES_PATH,
  RESERVE_REPORT_PATH,
  RESERVE_SUPPLIERS_PATH,
  availableMoves,
  buildReserveBody,
  buildReserveLines,
  cfaLabel,
  cuttingDraftFrom,
  describeDeleteTarget,
  describeLine,
  describeReserve,
  deleteTargetPath,
  docketSummary,
  findLine,
  isDeletableDocket,
  isDeletableStatus,
  isLineRow,
  lineAttention,
  lineFromPriceHit,
  linePath,
  lineTransitionPath,
  quantityLabel,
  reportExportPath,
  reportFilename,
  reportPath,
  reserveFilters,
  reserveLinesPath,
  reservePath,
  stampDate,
  stampEntries,
  statusLabel,
  statusTone,
} from './reserveFlow.js'

const MODULE_SOURCE = readFileSync(new URL('./reserveFlow.js', import.meta.url), 'utf8')
const LIST_SOURCE = readFileSync(new URL('./AdminReserves.jsx', import.meta.url), 'utf8')
const NEW_SOURCE = readFileSync(new URL('./AdminReserveNew.jsx', import.meta.url), 'utf8')
const REPORT_SOURCE = readFileSync(new URL('./AdminReserveReport.jsx', import.meta.url), 'utf8')

describe('the state machine mirror', () => {
  it('declares exactly the moves the API allows', () => {
    // Literal copy of atelier-api's reserve-line-states.js — keep in lockstep.
    expect(ALLOWED_TRANSITIONS).toEqual({
      requested: ['confirmed', 'arrived', 'cancelled'],
      confirmed: ['arrived', 'cancelled'],
      arrived: ['dispatched'],
      dispatched: [],
      cancelled: [],
    })
  })

  it('speaks the five statuses and the D365 CFA vocabulary', () => {
    expect(LINE_STATUSES).toEqual(['requested', 'confirmed', 'arrived', 'dispatched', 'cancelled'])
    expect(CFA_VALUES).toEqual(['not_required', 'required', 'ordered', 'received', 'approved'])
    expect(Object.keys(CFA_LABELS)).toEqual(CFA_VALUES)
    expect(cfaLabel('approved')).toBe('Approved by client')
    expect(cfaLabel(null)).toBe('—')
  })

  it('offers verbs off the line status, danger only for cancel', () => {
    const moves = availableMoves({ status: 'requested' })
    expect(moves.map((m) => m.key)).toEqual(['confirmed', 'arrived', 'cancelled'])
    expect(moves.find((m) => m.key === 'cancelled').tone).toBe('danger')
    expect(moves.find((m) => m.key === 'confirmed').tone).toBe('accent')
    expect(availableMoves({ status: 'dispatched' })).toEqual([])
    expect(availableMoves(null)).toEqual([])
  })

  it('labels and tones every status', () => {
    expect(statusLabel('requested')).toBe('Requested')
    expect(statusTone('requested')).toBe('clay')
    expect(statusTone('arrived')).toBe('sage')
    expect(statusTone('nonsense')).toBe('muted')
  })
})

describe('stamps and the clock rule', () => {
  it('slices ISO strings and never constructs a Date', () => {
    expect(stampDate('2026-08-20T10:00:00.000Z')).toBe('2026-08-20')
    expect(stampDate(null)).toBe('')
    expect(stampDate('bad')).toBe('')
  })

  it('lists only the stamps a line has, machine-ordered', () => {
    const entries = stampEntries({
      confirmed_at: '2026-08-10T01:00:00Z',
      arrived_at: '2026-08-20T01:00:00Z',
    })
    expect(entries.map((e) => e.status)).toEqual(['confirmed', 'arrived'])
    expect(entries[1].date).toBe('2026-08-20')
  })

  it('reads expiry off the API value, never the device clock', () => {
    expect(lineAttention({ expired: true })).toMatch(/passed/i)
    expect(lineAttention({ expired: false })).toBeNull()
    // A long-past date with expired absent stays quiet: the server decides.
    expect(lineAttention({ reserved_until: '2020-01-01' })).toBeNull()
  })

  it('bans the browser clock from the module and all three screens', () => {
    for (const source of [MODULE_SOURCE, LIST_SOURCE, NEW_SOURCE, REPORT_SOURCE]) {
      expect(source).not.toMatch(/Date\.now\(/)
      expect(source).not.toMatch(/new Date\(/)
      expect(source).not.toMatch(/Date\.parse\(/)
      expect(source).not.toMatch(/getTime\(/)
    }
  })
})

describe('filters', () => {
  it('answers "All" with null so buildListQuery drops it, and flags include_done', () => {
    expect(reserveFilters({})).toEqual({
      q: null,
      kind: null,
      status: null,
      supplier: null,
      include_done: null,
    })
    expect(reserveFilters({ term: '  linen ', kind: 'cutting', status: 'confirmed', supplier: 'de Le Cuona', showDone: true })).toEqual({
      q: 'linen',
      kind: 'cutting',
      status: 'confirmed',
      supplier: 'de Le Cuona',
      include_done: true,
    })
  })

  it('refuses an unknown kind or status rather than forwarding it', () => {
    const filters = reserveFilters({ kind: 'sample', status: 'complete' })
    expect(filters.kind).toBeNull()
    expect(filters.status).toBeNull()
  })
})

describe('paths', () => {
  it('addresses dockets, lines, moves, the facet and the report', () => {
    expect(RESERVES_PATH).toBe('/admin/reserves')
    expect(reservePath(7)).toBe('/admin/reserves/7')
    expect(reserveLinesPath(7)).toBe('/admin/reserves/7/lines')
    expect(linePath(9)).toBe('/admin/reserves/lines/9')
    expect(lineTransitionPath(9)).toBe('/admin/reserves/lines/9/transition')
    expect(RESERVE_SUPPLIERS_PATH).toBe('/admin/reserves/suppliers')
    expect(RESERVE_REPORT_PATH).toBe('/admin/reserves/report')
  })

  it('URL-encodes the supplier into the report paths', () => {
    expect(reportPath('Colefax & Fowler')).toBe(
      '/admin/reserves/report?supplier=Colefax%20%26%20Fowler'
    )
    expect(reportExportPath('Colefax & Fowler')).toBe(
      '/admin/reserves/report/export.csv?supplier=Colefax%20%26%20Fowler'
    )
  })

  it('mirrors the API filename rule for the CORS-invisible disposition', () => {
    expect(reportFilename('Colefax & Fowler')).toBe('atelier-reserves-colefax-fowler.csv')
    expect(reportFilename('')).toBe('atelier-reserves-supplier.csv')
  })
})

describe('naming rows to people', () => {
  it('names a docket by account and number, a line by kind, design and colour', () => {
    expect(describeReserve({ id: 12, account_name: 'Harbourview Interiors' })).toBe(
      'Harbourview Interiors · docket #12'
    )
    expect(describeLine({ kind: 'cutting', product_name: 'Marldon', colour: 'Blue' })).toBe(
      'Cutting · Marldon · Blue'
    )
    expect(describeLine({ kind: 'reserve', product_name: 'Marldon' })).toBe('Reserve · Marldon')
  })

  it('routes one delete dialog by request_id — the discriminator no marker needs', () => {
    const line = { id: 9, request_id: 4, kind: 'reserve', product_name: 'Marldon' }
    const docket = { id: 4, account_name: 'Harbourview Interiors' }
    expect(isLineRow(line)).toBe(true)
    expect(isLineRow(docket)).toBe(false)
    expect(deleteTargetPath(line)).toBe('/admin/reserves/lines/9')
    expect(deleteTargetPath(docket)).toBe('/admin/reserves/4')
    expect(describeDeleteTarget(line)).toContain('Marldon')
    expect(describeDeleteTarget(docket)).toContain('docket #4')
  })

  it('greys delete off the line status; a docket goes only when every line could', () => {
    expect(DELETABLE_LINE_STATUSES).toEqual(['requested', 'cancelled'])
    expect(isDeletableStatus('confirmed')).toBe(false)
    expect(isDeletableDocket({ lines: [{ status: 'requested' }, { status: 'cancelled' }] })).toBe(true)
    expect(isDeletableDocket({ lines: [{ status: 'requested' }, { status: 'arrived' }] })).toBe(false)
    expect(isDeletableDocket({ lines: [] })).toBe(true)
  })
})

describe('quantities', () => {
  it('never prints a missing figure as a real one', () => {
    expect(quantityLabel({ qty: null, multiplier: 1 })).toBe('—')
    expect(quantityLabel({})).toBe('—')
  })

  it('speaks metres, copies, or both', () => {
    expect(quantityLabel({ qty: '11.00', multiplier: 1 })).toBe('11 m')
    expect(quantityLabel({ qty: null, multiplier: 10 })).toBe('× 10')
    expect(quantityLabel({ qty: 2.5, multiplier: 20 })).toBe('2.5 m × 20')
  })
})

describe('starting lines', () => {
  it('fills a line off a price-list hit the way the D365 form did on save', () => {
    const line = lineFromPriceHit(
      { id: 41, supplier: 'Colefax & Fowler', product_range: 'JANE CHURCHILL', description: 'Payton', code: 'J191W' },
      'cutting'
    )
    expect(line.kind).toBe('cutting')
    expect(line.product_name).toBe('Payton')
    expect(line.range_name).toBe('JANE CHURCHILL')
    expect(line.supplier).toBe('Colefax & Fowler')
    expect(line.product_code).toBe('J191W')
    expect(line.price_list_item_id).toBe(41)
  })

  it('falls back to the code when the price row has no description', () => {
    expect(lineFromPriceHit({ code: 'F3701' }).product_name).toBe('F3701')
  })

  it('generates a cutting from a reserve line: same product, fresh lifecycle, linked back', () => {
    const cutting = cuttingDraftFrom({
      id: 9,
      kind: 'reserve',
      product_name: 'Komba',
      range_name: 'LARSEN',
      supplier: 'Colefax & Fowler',
      product_code: 'L9549',
      price_list_item_id: 41,
      colour: 'Clay',
      qty: '15.00',
      multiplier: 1,
      customer_reference: 'SLS-9',
      reserve_number: '4833001A',
      reserved_until: '2026-09-01',
      cfa: 'ordered',
      status: 'confirmed',
    })
    expect(cutting.kind).toBe('cutting')
    expect(cutting.colour).toBe('Clay')
    expect(cutting.customer_reference).toBe('SLS-9')
    expect(cutting.source_line_id).toBe(9)
    // The house's reply belongs to the RESERVE, not the cutting it spawned.
    expect(cutting.reserve_number).toBe('')
    expect(cutting.reserved_until).toBe('')
    expect(cutting.cfa).toBe('not_required')
    expect(cutting.qty).toBe('')
    expect(cutting.multiplier).toBe('1')
  })
})

describe('buildReserveLines', () => {
  it('refuses an empty docket and names the line that fails', () => {
    expect(buildReserveLines([]).error).toMatch(/at least one/i)
    expect(buildReserveLines([{ ...NEW_LINE, product_name: '' }]).error).toContain('Line 1')
    expect(buildReserveLines([NEW_LINE_OK(), { ...NEW_LINE_OK(), qty: 'x' }]).error).toContain('Line 2')
  })

  it('polices qty, copies and the date shape', () => {
    expect(buildReserveLines([{ ...NEW_LINE_OK(), qty: '0' }]).error).toMatch(/above zero/i)
    expect(buildReserveLines([{ ...NEW_LINE_OK(), multiplier: '2.5' }]).error).toMatch(/whole number/i)
    expect(buildReserveLines([{ ...NEW_LINE_OK(), multiplier: '0' }]).error).toMatch(/whole number/i)
    expect(buildReserveLines([{ ...NEW_LINE_OK(), reserved_until: '27/08/2026' }]).error).toMatch(/calendar date/i)
  })

  it('sends blanks as null, numbers as numbers, and defaults copies to 1', () => {
    const built = buildReserveLines([
      { ...NEW_LINE, product_name: ' Marldon ', colour: ' Blue ', qty: '11', multiplier: '' },
    ])
    expect(built.ok).toBe(true)
    const [line] = built.lines
    expect(line.product_name).toBe('Marldon')
    expect(line.colour).toBe('Blue')
    expect(line.qty).toBe(11)
    expect(line.multiplier).toBe(1)
    expect(line.range_name).toBeNull()
    expect(line.reserve_number).toBeNull()
    expect(line).not.toHaveProperty('source_line_id')
  })

  it('carries source_line_id only when the line has one', () => {
    const built = buildReserveLines([{ ...NEW_LINE_OK(), source_line_id: 9 }])
    expect(built.lines[0].source_line_id).toBe(9)
  })
})

const NEW_LINE_OK = () => ({ ...NEW_LINE, product_name: 'Marldon' })

describe('buildReserveBody', () => {
  const lines = [NEW_LINE_OK()]

  it('requires an account in every mode — never neither', () => {
    expect(buildReserveBody({ ...NEW_DOCKET, mode: 'account' }, lines).error).toMatch(/choose/i)
    expect(buildReserveBody({ ...NEW_DOCKET, mode: 'legacy', legacy: null }, lines).error).toMatch(/dynamics/i)
    expect(buildReserveBody({ ...NEW_DOCKET, mode: 'manual', account_name: ' ' }, lines).error).toMatch(/type/i)
  })

  it('sends user_id for a platform account, the snapshot name otherwise', () => {
    const viaUser = buildReserveBody({ ...NEW_DOCKET, mode: 'account', user_id: 5 }, lines)
    expect(viaUser.body.user_id).toBe(5)
    expect(viaUser.body.account_name).toBeUndefined()

    const viaName = buildReserveBody(
      { ...NEW_DOCKET, mode: 'manual', account_name: 'Harbourview Interiors', contact_name: 'Mia' },
      lines
    )
    expect(viaName.body.account_name).toBe('Harbourview Interiors')
    expect(viaName.body.contact_name).toBe('Mia')
    expect(viaName.body.user_id).toBeUndefined()
  })

  it('records the Dynamics account by name plus the injected reference line', () => {
    const legacy = { name: 'Gracious Living Ltd', atelier_account_number: 'ACC-9' }
    const built = buildReserveBody(
      { ...NEW_DOCKET, mode: 'legacy', legacy, notes: 'ring first' },
      lines,
      { legacyReference: (a) => `Dynamics client: ${a.name} (${a.atelier_account_number})` }
    )
    expect(built.body.account_name).toBe('Gracious Living Ltd')
    expect(built.body.notes).toBe('Dynamics client: Gracious Living Ltd (ACC-9)\nring first')
  })

  it('defaults to the Dynamics roster — where the client base still lives', () => {
    expect(NEW_DOCKET.mode).toBe('legacy')
    expect(ACCOUNT_MODES.map((m) => m.key)).toEqual(['legacy', 'account', 'manual'])
  })
})

describe('field declarations', () => {
  it('keeps status out of the PATCHable line fields — a move is a verb', () => {
    expect(LINE_FIELDS.map((f) => f.key)).not.toContain('status')
    expect(LINE_FIELDS.map((f) => f.key)).not.toContain('source_line_id')
    expect(LINE_FIELDS.find((f) => f.key === 'multiplier').required).toBe(true)
    expect(DOCKET_FIELDS.find((f) => f.key === 'account_name').required).toBe(true)
  })

  it('declares exactly the two kinds', () => {
    expect(LINE_KINDS).toEqual(['reserve', 'cutting'])
  })
})

describe('the docket card', () => {
  it('summarises shape and openness', () => {
    expect(
      docketSummary({
        lines: [
          { kind: 'reserve', status: 'confirmed' },
          { kind: 'reserve', status: 'dispatched' },
          { kind: 'cutting', status: 'cancelled' },
        ],
      })
    ).toBe('2 reserves, 1 cutting · 1 open')
    expect(docketSummary({ lines: [{ kind: 'reserve', status: 'cancelled' }] })).toBe(
      '1 reserve · all closed'
    )
    expect(docketSummary({})).toBe('no lines · all closed')
  })

  it('finds a line across the page so a stale editor closes itself', () => {
    const dockets = [{ id: 1, lines: [{ id: 9 }] }, { id: 2, lines: [{ id: 12 }] }]
    expect(findLine(dockets, 12)).toEqual({ id: 12 })
    expect(findLine(dockets, 99)).toBeNull()
  })
})

describe('the screens compose the kit', () => {
  it('AdminReserves goes through useCrudScreen and never re-implements the delete flow', () => {
    expect(LIST_SOURCE).toContain('useCrudScreen')
    expect(LIST_SOURCE).toContain('{...crud.remove.dialog}')
    expect(LIST_SOURCE).toContain('crud.remove.ask(')
    for (const banned of ['apiDelete', 'attemptDelete', 'describeBlockers', 'deleteDialog(']) {
      expect(LIST_SOURCE).not.toContain(banned)
    }
  })

  it('no screen hardcodes a transition — the moves come from availableMoves', () => {
    expect(LIST_SOURCE).toContain('availableMoves(')
    expect(LIST_SOURCE).not.toMatch(/status:\s*'(confirmed|arrived|dispatched|cancelled)'/)
  })

  it('the report screen reads and downloads through src/lib/api.js, never bare fetch', () => {
    expect(REPORT_SOURCE).toContain('apiDownload(')
    expect(REPORT_SOURCE).toContain('apiGet(')
    expect(REPORT_SOURCE).not.toMatch(/[^i]fetch\(/)
  })

  it('the create form searches the price list — the same source the old form read', () => {
    expect(NEW_SOURCE).toContain('/admin/price-list-items')
    expect(NEW_SOURCE).toContain('buildReserveBody(')
  })
})
