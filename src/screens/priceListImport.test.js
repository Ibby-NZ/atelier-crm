import { describe, it, expect } from 'vitest'
import {
  APPLY_PATH,
  IMPORTS_PATH,
  IMPORT_CATEGORIES,
  MAX_IMPORT_BYTES,
  MAX_REPORTED_CHANGES,
  REPORT,
  VALIDATE_PATH,
  appliedNote,
  canApply,
  cappedNote,
  describeRateChange,
  fileLine,
  importContentType,
  importFileProblem,
  importQuery,
  refusalFrom,
  runLine,
  summaryLine,
} from './priceListImport.js'

describe('the two routes', () => {
  it('keeps the dry run and the write structurally apart', () => {
    // Two routes, not one with a ?dry_run= flag: a request that can write must
    // never be one query parameter away from one that cannot.
    expect(VALIDATE_PATH).toBe('/admin/price-lists/import/validate')
    expect(APPLY_PATH).toBe('/admin/price-lists/import/apply')
    expect(IMPORTS_PATH).toBe('/admin/price-lists/imports')
  })
})

describe('importContentType', () => {
  it('states the type from the extension, never the browser', () => {
    expect(importContentType('BOUSSAC FABRIC PL 2026.csv')).toBe('text/csv')
    expect(importContentType('Drop.XLSX')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  })

  it('falls back to octet-stream — the server sniffs the bytes anyway', () => {
    expect(importContentType('rates.txt')).toBe('application/octet-stream')
    expect(importContentType('')).toBe('application/octet-stream')
  })

  it('never answers text/plain, which the root Fastify instance owns', () => {
    // text/plain would arrive parsed into a string, Buffer.isBuffer false, and
    // the office told to "post the raw file" about a file it did post.
    for (const name of ['a.csv', 'a.xlsx', 'a.txt', 'a']) {
      expect(importContentType(name)).not.toBe('text/plain')
    }
  })
})

describe('importFileProblem', () => {
  it('asks for a file first', () => {
    expect(importFileProblem(null)).toMatch(/price list first/)
  })

  it('turns away the one format the importer genuinely cannot read', () => {
    // .xls is BIFF — neither a zip nor decodable text — so the server's loud
    // 400 would talk about headers; the save-as instruction is the real fix.
    expect(importFileProblem({ name: 'OLD DROP.xls', size: 1024 })).toMatch(/\.xlsx/)
  })

  it('refuses an empty or oversized body before the round trip', () => {
    expect(importFileProblem({ name: 'a.csv', size: 0 })).toMatch(/empty/)
    expect(importFileProblem({ name: 'a.csv', size: MAX_IMPORT_BYTES + 1 })).toMatch(/16 MB/)
  })

  it('does not second-guess the parser about anything else', () => {
    // A wrong header, a broken row, "Leather" — all phrased well by the API
    // per row. Pre-checking them here would be a second parser.
    expect(importFileProblem({ name: 'BOUSSAC FABRIC PL 2026.csv', size: 40_000 })).toBe(null)
    expect(importFileProblem({ name: 'workbook.xlsx', size: 400_000 })).toBe(null)
  })
})

describe('importQuery', () => {
  it('carries the filename, encoded — it is stored as every row source', () => {
    expect(importQuery({ filename: 'BOUSSAC FABRIC PL 2026.csv' })).toEqual({
      query: '?filename=BOUSSAC%20FABRIC%20PL%202026.csv',
    })
  })

  it('sends the fallbacks only when stated', () => {
    // An empty supplier= would fail the schema minLength — buildListQuery's
    // drop-empties rule again.
    expect(
      importQuery({ filename: 'a.csv', supplier: ' Boussac ', category: 'fabric' }).query
    ).toBe('?filename=a.csv&supplier=Boussac&category=fabric')
    expect(importQuery({ filename: 'a.csv', supplier: '   ', category: '' }).query).toBe(
      '?filename=a.csv'
    )
  })

  it('mirrors the API filename gate rather than 400ing on it', () => {
    expect(importQuery({ filename: '' }).error).toMatch(/price list first/)
    expect(importQuery({ filename: 'drops/2026.csv' }).error).toMatch(/rename/)
    expect(importQuery({ filename: 'drops\\2026.csv' }).error).toMatch(/rename/)
    expect(importQuery({ filename: `a${String.fromCharCode(9)}b.csv` }).error).toMatch(/rename/)
    expect(importQuery({ filename: 'x'.repeat(201) }).error).toMatch(/rename/)
  })
})

describe('refusalFrom', () => {
  const body = {
    error: 'Unprocessable Entity',
    message: '3 rows of "DROP.csv" could not be read. Nothing has been written.',
    errors: [
      { row: 4, message: 'DROP.csv:4: empty code' },
      { row: 9, message: 'DROP.csv:9: "Leather" is not one of the categories this catalogue holds' },
    ],
    error_count: 3,
    unmappable_categories: [{ row: 9, value: 'Leather' }],
    unmappable_category_count: 1,
    summary: { file: 'DROP.csv', rows: 12, failed: 3 },
  }

  it('reads the shared 422 shape both routes refuse with', () => {
    const refusal = refusalFrom({ status: 422, body })
    expect(refusal.message).toMatch(/Nothing has been written/)
    expect(refusal.errors).toHaveLength(2)
    expect(refusal.errorCount).toBe(3)
    // US-004: the unmappable categories are their own bucket — "Leather" is a
    // question for the client, not a typo for the office.
    expect(refusal.unmappable).toEqual([{ row: 9, value: 'Leather' }])
    expect(refusal.unmappableCount).toBe(1)
    expect(refusal.summary.rows).toBe(12)
  })

  it('leaves every other failure to the plain error line', () => {
    // The 400 a non-price-list produces, the batch-level 422, the finance 403
    // and a network drop all have nothing to say per row.
    expect(refusalFrom({ status: 400, body: { message: 'Unexpected header row' } })).toBe(null)
    expect(refusalFrom({ status: 422, body: { message: 'DROP.csv: bad batch' } })).toBe(null)
    expect(refusalFrom({ status: 403, body: null })).toBe(null)
    expect(refusalFrom(null)).toBe(null)
  })
})

describe('the report lines', () => {
  const summary = {
    file: 'BOUSSAC FABRIC PL 2026.csv',
    template_version: 'v1',
    rows: 312,
    imported: 298,
    skipped: 6,
    duplicates: 2,
    failed: 6,
    created: 24,
    changed: 187,
    unchanged: 87,
  }

  it('names the file and the layout it matched', () => {
    // The header row IS the version, so the layout is worth stating.
    expect(fileLine(summary)).toBe('BOUSSAC FABRIC PL 2026.csv · v1 layout')
    expect(fileLine(null)).toBe('')
  })

  it('accounts for every line of the file in one sentence', () => {
    expect(summaryLine(summary)).toBe(
      '312 rows read · 6 unpriced · 2 repeated · 6 failed · 24 new · 187 rate changes · 87 unchanged'
    )
  })

  it('leaves out the zero buckets a clean file never fills', () => {
    expect(summaryLine({ rows: 10, created: 10, changed: 0, unchanged: 0 })).toBe(
      '10 rows read · 10 new · 0 rate changes · 0 unchanged'
    )
    expect(summaryLine(null)).toBe('')
  })

  it('describes a rate move with its row and its money', () => {
    expect(
      describeRateChange({
        row: 41,
        supplier: 'Boussac',
        category: 'fabric',
        code: 'F3518',
        from: 58.5,
        from_currency: 'EUR',
        to: 60,
        to_currency: 'EUR',
      })
    ).toBe('Row 41 · Boussac fabric F3518 — 58.5 → 60 EUR')
  })

  it('states both currencies when the move CHANGES currency', () => {
    // A currency swap at the same figure is a real change and must never print
    // as '58.5 → 58.5'.
    expect(
      describeRateChange({ row: 3, code: 'X', from: 58.5, from_currency: 'USD', to: 58.5, to_currency: 'EUR' })
    ).toBe('Row 3 · X — 58.5 USD → 58.5 EUR')
  })

  it('speaks the transaction after an apply, not the prediction', () => {
    expect(appliedNote({ applied: 298, summary: { changed: 187 } })).toBe(
      '298 rows landed in one transaction — 187 rate changes recorded in the price history.'
    )
    expect(appliedNote({ applied: 0 })).toBe('Nothing was applied.')
    expect(appliedNote(null)).toBe('Nothing was applied.')
  })

  it('reuses the sheet screen report plumbing rather than restating it', () => {
    expect(canApply({ kind: REPORT.clean })).toBe(true)
    expect(canApply({ kind: REPORT.refused })).toBe(false)
    expect(canApply({ kind: REPORT.applied })).toBe(false)
    // The API caps changes at 200 with the true count beside them; a silent
    // cap would read as "that was all".
    expect(cappedNote(MAX_REPORTED_CHANGES, 3120, 'rate change')).toBe(
      'Showing the first 200 of 3120 rate changes.'
    )
    expect(cappedNote(12, 12, 'rate change')).toBe(null)
  })
})

describe('runLine', () => {
  it('balances one logged import the way the summary does', () => {
    expect(
      runLine({ rows_read: 312, rows_imported: 304, rows_skipped: 6, rows_duplicate: 2 })
    ).toBe('312 read · 304 imported · 6 unpriced · 2 repeated')
    expect(runLine({ rows_read: 10, rows_imported: 10, rows_skipped: 0, rows_duplicate: 0 })).toBe(
      '10 read · 10 imported'
    )
    expect(runLine()).toBe('0 read · 0 imported')
  })
})

describe('the category fallback vocabulary', () => {
  it('mirrors the four stored values exactly', () => {
    // The screen's select must offer what the CHECK accepts and no more —
    // whether a fifth word exists is the client's decision, asked through the
    // refusal report, never through this list growing quietly.
    expect(IMPORT_CATEGORIES).toEqual(['fabric', 'wallpaper', 'trimming', 'accessory'])
    expect(Object.isFrozen(IMPORT_CATEGORIES)).toBe(true)
  })
})
