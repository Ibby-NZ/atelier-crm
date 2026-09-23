import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import { diffFields, draftFrom } from '../admin/drafts.js'
import {
  EMPTY_CHECK_OUT,
  NEW_SAMPLE,
  NEW_SAMPLE_ROUTE,
  SAMPLES_PATH,
  arrivalNote,
  isNotFound,
  SAMPLE_COST_FIELDS,
  SAMPLE_FIELDS,
  SAMPLE_STATUSES,
  WRITABLE_SAMPLE_STATUSES,
  recordedCostText,
  sampleCostText,
  sampleFieldsFor,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  byBarcodePath,
  checkInPath,
  checkOutBody,
  checkOutPath,
  createSampleBody,
  createdSampleNote,
  describeSample,
  loanState,
  movementVerb,
  sampleFilters,
  sampleMeta,
  samplePath,
  sampleRoute,
  statusLabel,
  withTradeAccount,
} from './adminSamples.js'

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const MODULE_SOURCE = read('adminSamples.js')
// The register is several files since 23 Sep 2026 (every record on its own
// page): the LIST (AdminSamples.jsx), one sample's PAGE (AdminSample.jsx), the
// register-a-sample page (AdminSampleNew.jsx), the form both of those draw
// (SampleFields.jsx) and the two <select> sources (useSamplePickers.js). Rules
// about one of them read that file; SCREEN_SOURCE is all five together, so
// every ban that held the old single file holds the whole screen.
const LIST_SOURCE = read('AdminSamples.jsx')
const PAGE_SOURCE = read('AdminSample.jsx')
const NEW_SOURCE = read('AdminSampleNew.jsx')
const FIELDS_SOURCE = read('SampleFields.jsx')
const PICKERS_SOURCE = read('useSamplePickers.js')
const SCREEN_FILES = [LIST_SOURCE, PAGE_SOURCE, NEW_SOURCE, FIELDS_SOURCE, PICKERS_SOURCE]
const SCREEN_SOURCE = SCREEN_FILES.join('\n')
const SCANNER_SOURCE = read('SampleScanner.jsx')

// A sample as the API returns it: parents by name, the open loan, the loan count
// and the DERIVED overdue.
const sample = (extra = {}) => ({
  id: 7,
  barcode: 'ATX-0001',
  label: 'Atlas hanger',
  sample_type: 'hanger',
  location: 'Bay 3',
  status: 'in_library',
  colourway_id: 12,
  supplier_id: 3,
  showroom_id: 2,
  notes: null,
  archived_at: null,
  overdue: false,
  loan_count: 0,
  open_loan: null,
  colourway_name: 'Ecru',
  colourway_sku: 'PF-ATLAS-01',
  product_name: 'Atlas',
  brand_name: 'Pierre Frey',
  supplier_name: 'Pierre Frey',
  showroom_name: 'Newmarket',
  ...extra,
})

const openLoan = (extra = {}) => ({
  id: 4,
  holder_name: 'Peter Kedgley Architects',
  trade_account_id: null,
  out_at: '2026-01-04T02:00:00.000Z',
  due_back_at: '2026-01-18T02:00:00.000Z',
  ...extra,
})

describe('overdue comes from the API and is never recomputed here', () => {
  it('reads the boolean, not the due date', () => {
    // The decisive case: a due date long past, and the API nonetheless says the
    // sample is not overdue. A browser recomputing would contradict it.
    const notLate = sample({
      open_loan: openLoan({ due_back_at: '2020-01-01T00:00:00.000Z' }),
      overdue: false,
    })
    expect(loanState(notLate).text).toBe('Out with Peter Kedgley Architects')
    expect(loanState(notLate).tone).toBe('ink')

    // And the mirror: a due date in the far future while the API says overdue.
    // Only a reader of `overdue` gets both of these right.
    const late = sample({
      open_loan: openLoan({ due_back_at: '2099-01-01T00:00:00.000Z' }),
      overdue: true,
    })
    expect(loanState(late).text).toBe('Overdue — with Peter Kedgley Architects')
    expect(loanState(late).tone).toBe('danger')
  })

  it('says nothing about lateness when nothing is out', () => {
    expect(loanState(sample()).text).toBe('On the shelf')
    expect(loanState(sample()).tone).toBe('muted')
    // A sample on the shelf is not late back, whatever a stale flag might say.
    expect(loanState(sample({ overdue: true })).text).toBe('On the shelf')
  })

  it('treats a missing overdue as not overdue rather than as truthy', () => {
    const noFlag = sample({ open_loan: openLoan(), overdue: undefined })
    expect(loanState(noFlag).tone).toBe('ink')
  })

  it('names an unnamed holder rather than printing undefined at a person', () => {
    expect(loanState(sample({ open_loan: openLoan({ holder_name: '  ' }) })).text).toBe(
      'Out with someone'
    )
  })

  it('does no date arithmetic anywhere in the screen', () => {
    // The rule is about the SOURCE, not about one function's answer: a helper
    // added later that compared the dates would pass every assertion above while
    // still reading the device's clock. The tokens are the only ways to get one.
    // The scanner renders the same rows, so it is held to the same ban.
    for (const source of [MODULE_SOURCE, SCREEN_SOURCE, SCANNER_SOURCE]) {
      expect(source).not.toMatch(/Date\.now\(/)
      expect(source).not.toMatch(/new Date\(/)
      expect(source).not.toMatch(/Date\.parse\(/)
      expect(source).not.toMatch(/getTime\(/)
    }
    // The scan is only worth anything if it read the files at all.
    expect(MODULE_SOURCE.length).toBeGreaterThan(0)
    for (const source of SCREEN_FILES) expect(source.length).toBeGreaterThan(0)
    expect(SCANNER_SOURCE.length).toBeGreaterThan(0)
  })
})

describe('nothing from the Dynamics cutting staging table is displayed', () => {
  it('reads no legacy endpoint and touches no staff comment column', () => {
    // That column carries third parties' names, emails, phones and home
    // addresses. The register reads /admin/samples only.
    //
    // The scan bans the PATH, the TABLE and the FIELD ACCESS rather than the
    // English words, so a comment may still explain why the rule exists.
    for (const source of [MODULE_SOURCE, SCREEN_SOURCE, SCANNER_SOURCE]) {
      expect(source).not.toContain('/admin/legacy')
      expect(source).not.toContain('legacy_cuttings')
      expect(source).not.toMatch(/\.comments\b/)
      expect(source).not.toMatch(/['"]comments['"]/)
    }
  })

  it('names no admin surface but the supplier picker', () => {
    // Anchored on the opening quote, so a relative import ('../admin/drafts.js')
    // is not mistaken for an endpoint. Every samples and showrooms path arrives
    // as an imported constant; suppliers is a <select> source, not a second grid
    // — and it is named once, in the picker hook the three screens share.
    const quoted = SCREEN_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []
    expect(new Set(quoted.map((hit) => hit.slice(1)))).toEqual(new Set(['/admin/suppliers']))
    expect(PICKERS_SOURCE).toContain('/admin/suppliers')
    expect(SAMPLES_PATH).toBe('/admin/samples')
  })
})

describe('the screen composes the W1 CRUD kit', () => {
  it('uses useCrudScreen and re-implements no step of the delete flow', () => {
    // Delete stays on the register's row — a sample that is gone has no page
    // to stay on — so the kit is composed by the LIST.
    expect(LIST_SOURCE).toContain('useCrudScreen')
    expect(LIST_SOURCE).toContain('remove.ask')
    expect(LIST_SOURCE).toContain('<ConfirmDialog {...remove.dialog} />')
    // The kit owns these; a screen reaching for one is re-implementing the flow.
    expect(SCREEN_SOURCE).not.toContain('apiDelete')
    expect(SCREEN_SOURCE).not.toContain('attemptDelete')
    expect(SCREEN_SOURCE).not.toContain('describeBlockers')
    expect(SCREEN_SOURCE).not.toContain('deleteDialog')
    // And it must not hand-roll a pager: the five copies the kit replaced all
    // looked exactly like this.
    expect(SCREEN_SOURCE).not.toContain('Math.ceil(')
  })

  it('supplies an archive action, so a blocked delete can offer "Archive instead"', () => {
    // samples.archived_at exists and sample_loans.sample_id is RESTRICT, so a
    // sample with history is refused a delete for good — archiving is the only
    // way one leaves the working list. The kit needs BOTH the API's `archivable`
    // and a supplied action; forgetting the action renders a 409 dialog offering
    // only Cancel, with no error to say why.
    expect(LIST_SOURCE).toContain('archive: (row) => apiSend')
    expect(LIST_SOURCE).toContain('archiveInsteadPath')
  })
})

describe('one sample opens on its own page (23 Sep 2026)', () => {
  // The client: every kind of data entry opens "in their own individual page
  // instead of a tabbed drop down". The row used to expand into the form, the
  // check-out and the movement history; the create form dropped down above.
  it('builds the page links in one place, apart from the API paths', () => {
    // A link is not a fetch: the same string today, two names so that moving
    // one can never silently retarget the other.
    expect(sampleRoute(7)).toBe('/admin/samples/7')
    expect(NEW_SAMPLE_ROUTE).toBe('/admin/samples/new')
  })

  it('links every row to its page and keeps no editor inside the list', () => {
    expect(LIST_SOURCE).toContain('to={sampleRoute(row.id)}')
    expect(LIST_SOURCE).toContain('to={NEW_SAMPLE_ROUTE}')
    expect(LIST_SOURCE).not.toContain('openId')
    expect(LIST_SOURCE).not.toContain('<SampleFields')
    expect(LIST_SOURCE).not.toContain('CheckOutForm')
  })

  it('reads the one detail and feeds the history from it, reloading after every write', () => {
    // The movement history used to be a second fetch of its own that went
    // stale when the sample moved; the page's single read carries the loans.
    expect(PAGE_SOURCE).toContain('apiFetch(samplePath(id))')
    expect(PAGE_SOURCE).toContain('useMutation({ reload: load, flash })')
    expect(PAGE_SOURCE).toContain('<SampleLoans loans={sample.loans ?? []} />')
    // A 404 is a "not found" page with a way back, not an empty form.
    expect(PAGE_SOURCE).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(PAGE_SOURCE).toContain('<NotFound')
  })

  it('draws ONE form on both pages, finance passed at both call sites', () => {
    // Leaving `finance` off SampleFields' parameters once blanked the whole
    // register: the free identifier threw on first render. There is no ESLint
    // and the build does not catch it, so the declaration is pinned.
    expect(FIELDS_SOURCE).toContain('finance = false')
    for (const source of [PAGE_SOURCE, NEW_SOURCE]) {
      expect(source).toContain("import SampleFields from './SampleFields.jsx'")
      expect(source).toContain('sampleFieldsFor(finance)')
      expect(source).toContain('finance={finance}')
    }
  })

  it('lands a new sample on its page, replacing the form, with the toast in hand', () => {
    // The create page unmounts the moment the POST lands, so the minted
    // barcode travels in router state and the sample's page flashes it.
    expect(NEW_SOURCE).toContain('navigate(sampleRoute(created.id), {')
    expect(NEW_SOURCE).toContain('replace: true')
    expect(NEW_SOURCE).toContain('createdSampleNote(built.body, created)')
    expect(PAGE_SOURCE).toContain('arrivalNote(location.state)')
  })
})

describe('arrivalNote', () => {
  it('reads the note a create page left in router state', () => {
    expect(arrivalNote({ flash: 'Registered with the new barcode ATL-S-001000.' })).toBe(
      'Registered with the new barcode ATL-S-001000.'
    )
  })

  it('answers null for anything that is not a note, so an ordinary visit flashes nothing', () => {
    expect(arrivalNote(null)).toBeNull()
    expect(arrivalNote(undefined)).toBeNull()
    expect(arrivalNote({})).toBeNull()
    expect(arrivalNote({ flash: '   ' })).toBeNull()
    expect(arrivalNote({ flash: 42 })).toBeNull()
    // Another screen's router state (the supplier invoice's combine hand-off)
    // is not a note either.
    expect(arrivalNote({ supplier_id: '3' })).toBeNull()
  })
})

describe('paths', () => {
  it('are built in one place', () => {
    expect(samplePath(7)).toBe('/admin/samples/7')
    expect(checkOutPath({ id: 7 })).toBe('/admin/samples/7/check-out')
    expect(checkInPath({ id: 7 })).toBe('/admin/samples/7/check-in')
  })

  it('escapes a scanned barcode into the by-barcode path', () => {
    // The scanner's read is an exact match on a path SEGMENT, so a tag carrying
    // a slash or a percent must not change the route it addresses.
    expect(byBarcodePath('ATX/001')).toBe('/admin/samples/by-barcode/ATX%2F001')
    expect(byBarcodePath('100%')).toBe('/admin/samples/by-barcode/100%25')
  })

  it('keeps the row toggle and "Archive instead" apart', () => {
    // "Archive instead" is offered on a REFUSED delete, so pointing it at the
    // toggle would answer a request to remove the row by RESTORING it.
    const archived = sample({ archived_at: '2026-02-01T00:00:00.000Z' })
    expect(archiveVerb(archived)).toBe('restore')
    expect(archiveTogglePath(archived)).toBe('/admin/samples/7/restore')
    expect(archiveInsteadPath(archived)).toBe('/admin/samples/7/archive')

    const live = sample()
    expect(archiveVerb(live)).toBe('archive')
    expect(archiveTogglePath(live)).toBe('/admin/samples/7/archive')
  })
})

describe('sampleFilters', () => {
  it('drops an unset filter rather than sending it empty', () => {
    // An "All" select forwarded as '' becomes `status=`, which the endpoint's
    // enum answers with a 400 that kills the WHOLE list, not one filter.
    const query = buildListQuery(sampleFilters())
    expect(query).toBe('')
  })

  it('keeps overdue tri-state', () => {
    // Absent leaves the list alone; true is the chase list; false is "not late
    // back" — out ON TIME or on the shelf, which is a different question from
    // "on the shelf".
    expect(buildListQuery(sampleFilters({ overdue: '' }))).toBe('')
    expect(buildListQuery(sampleFilters({ overdue: 'true' }))).toBe('overdue=true')
    expect(buildListQuery(sampleFilters({ overdue: 'false' }))).toBe('overdue=false')
  })

  it('passes every set filter through', () => {
    const query = buildListQuery(
      sampleFilters({
        term: ' linen ',
        status: 'out',
        showroomId: '4',
        supplierId: '9',
        overdue: 'true',
        showArchived: true,
      })
    )
    const params = new URLSearchParams(query)
    expect(params.get('q')).toBe('linen')
    expect(params.get('status')).toBe('out')
    expect(params.get('showroom_id')).toBe('4')
    expect(params.get('supplier_id')).toBe('9')
    expect(params.get('overdue')).toBe('true')
    expect(params.get('include_archived')).toBe('true')
  })

  it('vanishes include_archived when the box is unticked', () => {
    expect(buildListQuery(sampleFilters({ showArchived: false }))).toBe('')
  })
})

describe('statuses', () => {
  it('derives the writable set rather than re-typing it', () => {
    // Mirrors the API deriving WRITABLE_SAMPLE_STATUSES from SAMPLE_STATUSES:
    // widening the CHECK widens both, and the two cannot drift.
    expect(SAMPLE_STATUSES).toContain('out')
    expect(WRITABLE_SAMPLE_STATUSES).not.toContain('out')
    expect(WRITABLE_SAMPLE_STATUSES).toEqual(SAMPLE_STATUSES.filter((s) => s !== 'out'))
  })

  it('offers the writable set in the form and the full one in the filter', () => {
    // `out` asserts an open loan exists and only check-out can make that true;
    // offering it in the form would put a 400 behind a reasonable-looking
    // choice. Filtering FOR what is out is the register's headline question.
    expect(FIELDS_SOURCE).toContain('WRITABLE_SAMPLE_STATUSES.map')
    // The brace matters: 'SAMPLE_STATUSES.map' alone is a substring of the
    // writable one, so it would pass without the filter existing.
    expect(LIST_SOURCE).toContain('{SAMPLE_STATUSES.map')
    expect(FIELDS_SOURCE).not.toContain('{SAMPLE_STATUSES.map')
  })

  it('names a status for a person', () => {
    expect(statusLabel('in_library')).toBe('In the library')
    expect(statusLabel(undefined)).toBe('—')
    // An unknown value from a widened CHECK still prints itself rather than
    // vanishing.
    expect(statusLabel('lent_out')).toBe('lent_out')
  })

  it('declares the same columns the API PATCH accepts', () => {
    // Mirrors SAMPLE_UPDATE_COLUMNS. A key declared here and missing there is
    // stripped by Ajv's removeAdditional and would save nothing.
    expect(SAMPLE_FIELDS.map((f) => f.key)).toEqual([
      'barcode',
      'label',
      'sample_type',
      'location',
      'status',
      'colourway_id',
      'supplier_id',
      'showroom_id',
      'notes',
    ])
    // The blank form covers the WIDEST field list (finance included): bodyFrom
    // only reads the keys its field list declares, so the cost blanks are inert
    // for a login whose list excludes them.
    expect(Object.keys(NEW_SAMPLE).sort()).toEqual(
      sampleFieldsFor(true).map((f) => f.key).sort()
    )
    expect(SAMPLE_FIELDS.find((f) => f.key === 'barcode').required).toBe(true)
  })
})

describe('the cost fields are finance-gated (C18)', () => {
  it('appends the cost pair ONLY with finance visibility', () => {
    // Not cosmetic: the API 403s a write naming either key from a login
    // without the grant, and bodyFrom sends EVERY declared field (blanks as
    // null included) — so a form that always carried them would put a 403
    // behind every save a showroom login makes.
    expect(sampleFieldsFor(true).map((f) => f.key)).toEqual([
      ...SAMPLE_FIELDS.map((f) => f.key),
      'unit_cost',
      'cost_currency',
    ])
    expect(sampleFieldsFor(false)).toBe(SAMPLE_FIELDS)
    expect(sampleFieldsFor(undefined)).toBe(SAMPLE_FIELDS)
  })

  it('keeps the value decimal and the currency free text', () => {
    // `decimal`, not `money`: numeric(12,4) in the supplier's own currency,
    // never cents. `text`, not `upper`: the API deliberately holds no CHECK on
    // cost_currency, so a three-letter rule here would refuse what it accepts.
    const byKey = Object.fromEntries(SAMPLE_COST_FIELDS.map((f) => [f.key, f]))
    expect(byKey.unit_cost.kind).toBe('decimal')
    expect(byKey.cost_currency.kind).toBe('text')
    expect(SAMPLE_COST_FIELDS.some((f) => f.required)).toBe(false)
  })

  it('round-trips a cost through the shared draft plumbing', () => {
    // The API returns unit_cost as a NUMBER (its read model coerces the pg
    // string), so an untouched figure must not diff as an edit.
    const record = sample({ unit_cost: 48.5, cost_currency: 'EUR' })
    const fields = sampleFieldsFor(true)
    const draft = draftFrom(record, fields)
    expect(draft.unit_cost).toBe('48.5')
    expect(diffFields(record, draft, fields)).toEqual({ patch: {} })

    // An explicit clear is null ("no cost recorded"), which is a different
    // statement from 0 ("free, and we know it") — both must stay reachable.
    expect(diffFields(record, { ...draft, unit_cost: '' }, fields).patch).toEqual({
      unit_cost: null,
    })
    expect(diffFields(record, { ...draft, unit_cost: '0' }, fields).patch).toEqual({
      unit_cost: 0,
    })
  })
})

describe('sampleCostText keeps NULL and 0 different facts', () => {
  it('prints nothing when the key is ABSENT — the finance gate, not a value', () => {
    // The API DELETES the key from a non-finance response rather than nulling
    // it; absent and null are different statements and only one is a fact
    // about the sample.
    expect(sampleCostText(sample())).toBe('')
    expect(recordedCostText(sample())).toBe('')
  })

  it('tells "no cost recorded" from "free of charge"', () => {
    // `Number(null)` is 0 — the platform's own documented trap — so these two
    // must never read the same.
    expect(sampleCostText(sample({ unit_cost: null, cost_currency: null }))).toBe(
      'No cost recorded'
    )
    expect(sampleCostText(sample({ unit_cost: 0, cost_currency: 'EUR' }))).toBe(
      'Free of charge'
    )
  })

  it('prints a recorded figure with its own currency', () => {
    expect(sampleCostText(sample({ unit_cost: 48.5, cost_currency: 'EUR' }))).toBe('48.5 EUR')
    expect(sampleCostText(sample({ unit_cost: 12, cost_currency: null }))).toBe('12')
  })

  it('shows the row line only a RECORDED value, zero included', () => {
    // "No cost recorded" on every unpriced row would drown the register in its
    // ordinary state; a free hanger IS a recorded fact and does appear.
    expect(recordedCostText(sample({ unit_cost: null }))).toBe('')
    expect(recordedCostText(sample({ unit_cost: 0, cost_currency: 'NZD' }))).toBe(
      'Free of charge'
    )
    expect(recordedCostText(sample({ unit_cost: 87.25, cost_currency: 'EUR' }))).toBe(
      '87.25 EUR'
    )
  })
})

describe('describeSample', () => {
  it('leads with the barcode, which is unique across the register', () => {
    expect(describeSample(sample())).toBe('ATX-0001 (Atlas hanger)')
    expect(describeSample(sample({ label: null }))).toBe('ATX-0001')
  })

  it('tells two samples of the same design apart', () => {
    // A label is freely duplicated; the tag on the object is not.
    const a = sample({ barcode: 'ATX-0001' })
    const b = sample({ barcode: 'ATX-0002' })
    expect(describeSample(a)).not.toBe(describeSample(b))
  })

  it('returns undefined for a barcode-less row, so the kit says "That sample"', () => {
    expect(describeSample({})).toBeUndefined()
    expect(describeSample()).toBeUndefined()
  })
})

describe('movementVerb', () => {
  it('reads the open loan, not the status', () => {
    // The loan row is what the movement writes and what the one-open-loan index
    // guards; if the two ever disagree the loan is the truth.
    expect(movementVerb(sample())).toBe('check-out')
    expect(movementVerb(sample({ open_loan: openLoan() }))).toBe('check-in')
    expect(movementVerb(sample({ status: 'out', open_loan: null }))).toBe('check-out')
  })
})

describe('createSampleBody', () => {
  it('OMITS a blank barcode rather than sending null', () => {
    // Omitting the key IS the ask-the-server-to-mint-a-tag action (W20-US-002):
    // the API 400s both '' and an explicit null so an empty box can never mint
    // by accident, which means bodyFrom's blanks-as-null shape would make the
    // mint unreachable. Absence is the one deliberate spelling.
    const built = createSampleBody(NEW_SAMPLE)
    expect(built.error).toBeUndefined()
    expect('barcode' in built.body).toBe(false)
    // Every NULLABLE field still goes, blanks as null, exactly as a create
    // body always has. `status` is absent too — see the next test.
    expect(built.body).toEqual({
      label: null,
      sample_type: null,
      location: null,
      colourway_id: null,
      supplier_id: null,
      showroom_id: null,
      notes: null,
    })
  })

  it('OMITS an unchosen status the same way — the schema types it a bare enum', () => {
    // The create schema's `status` is a plain string enum where the nullable
    // columns are ['string','null'], so an explicit null is a 400 behind the
    // untouched '—' option; absent, the column defaults to in_library. Verified
    // against the API's own Fastify: { status: null } → 400, absent → 200.
    expect('status' in createSampleBody(NEW_SAMPLE).body).toBe(false)
    expect(createSampleBody({ ...NEW_SAMPLE, status: 'retired' }).body.status).toBe('retired')
  })

  it('sends a typed barcode trimmed, so a supplied tag wins and no number is spent', () => {
    const built = createSampleBody({ ...NEW_SAMPLE, barcode: '  ATX-0001  ' })
    expect(built.body.barcode).toBe('ATX-0001')
  })

  it('treats a whitespace-only barcode as blank', () => {
    // The input box holding three spaces is the same statement as holding
    // nothing: nobody typed a tag.
    expect('barcode' in createSampleBody({ ...NEW_SAMPLE, barcode: '   ' }).body).toBe(false)
  })

  it('still reports a bad field by name', () => {
    expect(createSampleBody({ ...NEW_SAMPLE, colourway_id: 'twelve' }).error).toMatch(/Colourway/)
  })

  it('leaves the EDIT semantics alone: a required barcode the diff refuses to clear', () => {
    // The column is NOT NULL, so blanking the tag on an existing row must fail
    // in the form rather than surface as a 400. Held here so loosening the
    // create path can never quietly loosen the edit path with it.
    expect(SAMPLE_FIELDS.find((f) => f.key === 'barcode').required).toBe(true)
  })

  it('carries the cost pair only when handed the finance field list', () => {
    // The create form draws Value inputs with the finance grant, so the body
    // must carry what they hold — while a non-finance body must never name
    // the keys the API 403s. The field list IS that switch, passed through.
    const draft = { ...NEW_SAMPLE, unit_cost: '12.5', cost_currency: 'gbp' }
    const finance = createSampleBody(draft, sampleFieldsFor(true))
    expect(finance.body.unit_cost).toBe(12.5)
    expect(finance.body.cost_currency).toBe('gbp')
    // Blanks still travel as null for a finance login (an explicit clear)…
    const blank = createSampleBody(NEW_SAMPLE, sampleFieldsFor(true))
    expect(blank.body.unit_cost).toBeNull()
    // …and the default list never names them at all.
    expect('unit_cost' in createSampleBody(draft).body).toBe(false)
    expect('cost_currency' in createSampleBody(draft).body).toBe(false)
  })

  it('is what the screen builds the create body with, finance-aware list and all', () => {
    // The merge of the loans-desk and valuation branches once resolved this
    // call site to bodyFrom(newSample, fields), which silently sent
    // `barcode: null` — a 400 — and made the server mint unreachable. The
    // scan pins the call AND the absence of any bodyFrom in the screen.
    expect(NEW_SOURCE).toContain('createSampleBody(newSample, fields)')
    expect(SCREEN_SOURCE).not.toContain('bodyFrom(')
  })
})

describe('createdSampleNote', () => {
  it('calls out a minted barcode, which the office reads off the screen once', () => {
    const note = createdSampleNote({ label: null }, { barcode: 'ATL-S-001000' })
    expect(note).toContain('ATL-S-001000')
    expect(note).toMatch(/new barcode/i)
  })

  it('does not claim a typed barcode was minted', () => {
    const note = createdSampleNote({ barcode: 'ATX-0001' }, sample())
    expect(note).not.toMatch(/new barcode/i)
    expect(note).toContain('ATX-0001')
  })
})

describe('checkOutBody', () => {
  it('requires someone to take it', () => {
    expect(checkOutBody(EMPTY_CHECK_OUT).error).toMatch(/who is taking it/i)
    expect(checkOutBody({ holder_name: '   ' }).error).toBeTruthy()
  })

  it('sends the trimmed holder alone when nothing else is filled in', () => {
    // A blank due date is OMITTED, never sent as null: the API types it a string,
    // so an explicit null is a 400 — and inventing a date would make the sample
    // overdue on a deadline nobody set.
    expect(checkOutBody({ holder_name: '  Marguerite  ' }).body).toEqual({
      holder_name: 'Marguerite',
    })
  })

  it('carries the due date and notes when they are given', () => {
    expect(
      checkOutBody({ holder_name: 'Liz', due_back_at: '2026-09-01', notes: ' second fitting ' })
        .body
    ).toEqual({
      holder_name: 'Liz',
      due_back_at: '2026-09-01',
      notes: 'second fitting',
    })
  })

  it('links the trade account as an integer, and only when one was picked', () => {
    // The API types trade_account_id `integer`, so '' and null are 400s — a
    // blank is OMITTED, the same rule the due date follows. The name still
    // stands alone for a walk-in.
    expect(checkOutBody({ holder_name: 'Liz', trade_account_id: '12' }).body).toEqual({
      holder_name: 'Liz',
      trade_account_id: 12,
    })
    expect(checkOutBody({ holder_name: 'Liz', trade_account_id: '' }).body).toEqual({
      holder_name: 'Liz',
    })
    expect('trade_account_id' in checkOutBody({ holder_name: 'Liz' }).body).toBe(false)
  })

  it('refuses a mangled selection rather than forwarding it as a 400', () => {
    expect(checkOutBody({ holder_name: 'Liz', trade_account_id: 'twelve' }).error).toMatch(
      /trade account/i
    )
    expect(checkOutBody({ holder_name: 'Liz', trade_account_id: '0' }).error).toBeTruthy()
  })
})

describe('withTradeAccount', () => {
  it('folds a picked company into the draft and fills a BLANK holder name', () => {
    const next = withTradeAccount(EMPTY_CHECK_OUT, { id: 12, name: 'Peter Kedgley Architects' })
    expect(next.trade_account_id).toBe('12')
    expect(next.trade_account_name).toBe('Peter Kedgley Architects')
    expect(next.holder_name).toBe('Peter Kedgley Architects')
  })

  it('never overwrites a holder somebody typed', () => {
    // holder_name is the snapshot of who actually has the thing; the account is
    // only the current owner of the relationship.
    const typed = { ...EMPTY_CHECK_OUT, holder_name: 'Marguerite (courier pickup)' }
    const next = withTradeAccount(typed, { id: 12, name: 'Peter Kedgley Architects' })
    expect(next.holder_name).toBe('Marguerite (courier pickup)')
    expect(next.trade_account_id).toBe('12')
  })

  it('clears the link, and only the link, on null', () => {
    const linked = withTradeAccount(EMPTY_CHECK_OUT, { id: 12, name: 'Kedgley' })
    const cleared = withTradeAccount(linked, null)
    expect(cleared.trade_account_id).toBe('')
    expect(cleared.trade_account_name).toBe('')
    // The filled-in name survives: it may be exactly who is standing there.
    expect(cleared.holder_name).toBe('Kedgley')
  })

  it('is wired into both check-out forms, which share one body builder', () => {
    // The register and the scanner must not drift: both fold the pick through
    // withTradeAccount and both post whatever checkOutBody builds from it.
    expect(PAGE_SOURCE).toContain('withTradeAccount')
    expect(PAGE_SOURCE).toContain('TradeAccountPicker')
    expect(SCANNER_SOURCE).toContain('withTradeAccount')
    expect(SCANNER_SOURCE).toContain('TradeAccountPicker')
  })
})

describe('isNotFound', () => {
  it('recognises the by-barcode 404, which is an answer rather than a failure', () => {
    // The endpoint is an exact match on the unique column: 404 means "no sample
    // carries that barcode", and the scanner offers the register instead of an
    // error line.
    expect(isNotFound({ status: 404 })).toBe(true)
  })

  it('leaves every real failure to messageOf', () => {
    expect(isNotFound({ status: 500 })).toBe(false)
    expect(isNotFound({ status: 0 })).toBe(false)
    expect(isNotFound(new Error('network drop'))).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
  })
})

describe('the scanner calls by-barcode, then whichever movement the loan allows', () => {
  // The acceptance criterion, held against the source — there is no jsdom, so
  // the flow cannot be driven. Every path arrives through the helpers this file
  // already tests, so the scanner cannot spell an endpoint differently.
  it('looks a scan up through the exact by-barcode read', () => {
    expect(SCANNER_SOURCE).toContain('apiFetch(byBarcodePath(')
  })

  it('offers the verb the open loan makes possible, and posts the matching endpoint', () => {
    expect(SCANNER_SOURCE).toContain("movementVerb(sample) === 'check-out'")
    expect(SCANNER_SOURCE).toContain("apiSend('POST', checkOutPath(sample), built.body)")
    expect(SCANNER_SOURCE).toContain("apiSend('POST', checkInPath(sample), {})")
    // The body goes through the same builder the register uses, so the two
    // check-out forms cannot drift apart.
    expect(SCANNER_SOURCE).toContain('checkOutBody(checkOut)')
  })

  it('treats the 404 as an outcome, not an error', () => {
    expect(SCANNER_SOURCE).toContain('isNotFound(err)')
  })

  it('names no admin endpoint of its own', () => {
    // Anchored on the opening quote. apiFetch and apiSend in this file take
    // only the imported path builders, asserted above — and since 23 Sep 2026
    // its two router links arrive through the page helpers too: a found tag
    // opens the sample's own page, an unknown one the register-a-sample page.
    const quoted = SCANNER_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []
    expect(quoted).toEqual([])
    expect(SCANNER_SOURCE).toContain('to={sampleRoute(sample.id)}')
    expect(SCANNER_SOURCE).toContain('to={NEW_SAMPLE_ROUTE}')
  })
})

describe('sampleMeta', () => {
  it('names the house, the design and the colour', () => {
    expect(sampleMeta(sample())).toBe('Pierre Frey · Atlas · Ecru')
  })

  it('says a sample with no catalogue link is normal, not broken', () => {
    // Plenty predate the catalogue or come from a house Atelier does not stock.
    const unlinked = sample({ brand_name: null, product_name: null, colourway_name: null })
    expect(sampleMeta(unlinked)).toBe('Not linked to a design')
    expect(sampleMeta({ ...unlinked, label: null })).toBe('No design and no label')
  })
})
