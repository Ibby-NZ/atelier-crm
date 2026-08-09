import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  EMPTY_CHECK_OUT,
  NEW_SAMPLE,
  SAMPLES_PATH,
  isNotFound,
  SAMPLE_FIELDS,
  SAMPLE_STATUSES,
  WRITABLE_SAMPLE_STATUSES,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  byBarcodePath,
  checkInPath,
  checkOutBody,
  checkOutPath,
  describeSample,
  loanState,
  movementVerb,
  sampleFilters,
  sampleMeta,
  samplePath,
  statusLabel,
} from './adminSamples.js'

const MODULE_SOURCE = readFileSync(new URL('./adminSamples.js', import.meta.url), 'utf8')
const SCREEN_SOURCE = readFileSync(new URL('./AdminSamples.jsx', import.meta.url), 'utf8')
const SCANNER_SOURCE = readFileSync(new URL('./SampleScanner.jsx', import.meta.url), 'utf8')

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
    expect(SCREEN_SOURCE.length).toBeGreaterThan(0)
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
    // as an imported constant; suppliers is a <select> source, not a second grid.
    const quoted = SCREEN_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []
    expect(new Set(quoted.map((hit) => hit.slice(1)))).toEqual(new Set(['/admin/suppliers']))
    expect(SAMPLES_PATH).toBe('/admin/samples')
  })
})

describe('the screen composes the W1 CRUD kit', () => {
  it('uses useCrudScreen and re-implements no step of the delete flow', () => {
    expect(SCREEN_SOURCE).toContain('useCrudScreen')
    expect(SCREEN_SOURCE).toContain('remove.ask')
    expect(SCREEN_SOURCE).toContain('<ConfirmDialog {...remove.dialog} />')
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
    expect(SCREEN_SOURCE).toContain('archive: (row) => apiSend')
    expect(SCREEN_SOURCE).toContain('archiveInsteadPath')
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
    expect(SCREEN_SOURCE).toContain('WRITABLE_SAMPLE_STATUSES.map')
    // The brace matters: 'SAMPLE_STATUSES.map' alone is a substring of the
    // writable one, so it would pass without the filter existing.
    expect(SCREEN_SOURCE).toContain('{SAMPLE_STATUSES.map')
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
    expect(Object.keys(NEW_SAMPLE).sort()).toEqual(SAMPLE_FIELDS.map((f) => f.key).sort())
    expect(SAMPLE_FIELDS.find((f) => f.key === 'barcode').required).toBe(true)
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
    // Anchored on the opening quote. The one literal is the router <Link> to
    // the register screen — a navigation target, not a fetch: apiFetch and
    // apiSend in this file take only the imported path builders, asserted
    // above.
    const quoted = SCANNER_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []
    expect(new Set(quoted.map((hit) => hit.slice(1)))).toEqual(new Set(['/admin/samples']))
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
