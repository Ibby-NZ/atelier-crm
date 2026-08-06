import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CATEGORY_VALUES,
  DEFAULT_BRAND_SLUG,
  MAX_SHEET_BYTES,
  REPORT,
  SHEET_CONTENT_TYPE,
  appliedNote,
  brandOptions,
  canApply,
  cappedNote,
  describeChange,
  exportPath,
  fileProblem,
  filenameFrom,
  initialBrand,
  refusalFrom,
  summaryLine,
} from './adminProductSheet.js'

const HOUSES = Object.freeze([
  { id: 3, slug: 'colefax-and-fowler', name: 'Colefax & Fowler' },
  { id: 1, slug: 'atelier-textiles-nz', name: 'Atelier Textiles NZ' },
  { id: 7, slug: 'pierre-frey', name: 'Pierre Frey' },
])

describe('exportPath', () => {
  it('names the house explicitly', () => {
    expect(exportPath('pierre-frey')).toBe(
      '/admin/product-sheet/export.csv?brand=pierre-frey'
    )
  })

  it('refuses an empty house rather than sending ?brand=', () => {
    // Ajv's useDefaults fills an ABSENT key only, so `?brand=` is present, meets
    // the ^[a-z0-9-]+$ pattern instead and 400s — which kills the download.
    expect(exportPath('')).toBeNull()
    expect(exportPath('   ')).toBeNull()
    expect(exportPath(undefined)).toBeNull()
  })

  it('refuses anything that is not a slug', () => {
    // A slug is server-generated and immutable; anything else names no house.
    expect(exportPath('Pierre Frey')).toBeNull()
    expect(exportPath('../admin/users')).toBeNull()
  })
})

describe('brandOptions', () => {
  it('keeps the API’s order', () => {
    expect(brandOptions(HOUSES).map((option) => option.slug)).toEqual([
      'colefax-and-fowler',
      'atelier-textiles-nz',
      'pierre-frey',
    ])
  })

  it('drops a row that could not be asked for', () => {
    expect(brandOptions([{ name: 'No slug' }, { slug: 'A House', name: 'x' }])).toEqual([])
  })

  it('falls back to the slug when a house has no name', () => {
    expect(brandOptions([{ slug: 'jim-thompson', name: '  ' }])).toEqual([
      { slug: 'jim-thompson', name: 'jim-thompson' },
    ])
  })
})

describe('initialBrand', () => {
  it('opens on Atelier’s own workroom when the catalogue holds it', () => {
    expect(initialBrand(brandOptions(HOUSES))).toBe(DEFAULT_BRAND_SLUG)
  })

  it('falls back to the first house rather than sending a slug that is not there', () => {
    // CI runs migrations only, so the seed's house may not exist at all.
    const options = brandOptions([HOUSES[0], HOUSES[2]])
    expect(initialBrand(options)).toBe('colefax-and-fowler')
  })

  it('is empty for an empty catalogue', () => {
    expect(initialBrand([])).toBe('')
  })
})

describe('filenameFrom', () => {
  it('uses the API’s own filename when the browser can see the header', () => {
    expect(
      filenameFrom(
        'attachment; filename="atelier-product-sheet-pierre-frey.csv"',
        'pierre-frey'
      )
    ).toBe('atelier-product-sheet-pierre-frey.csv')
  })

  it('falls back to the API’s naming rule when the header is invisible', () => {
    // Content-Disposition is not CORS-safelisted, so cross-origin this is null.
    expect(filenameFrom(null, 'jim-thompson')).toBe(
      'atelier-product-sheet-jim-thompson.csv'
    )
  })

  it('discards anything that is not a plain filename', () => {
    expect(filenameFrom('attachment; filename="../../etc/passwd"', 'x')).toBe(
      'atelier-product-sheet-x.csv'
    )
    expect(filenameFrom('attachment', 'x')).toBe('atelier-product-sheet-x.csv')
  })
})

describe('fileProblem', () => {
  const file = (name, size) => ({ name, size })

  it('passes a sheet', () => {
    expect(fileProblem(file('atelier-product-sheet-pierre-frey.csv', 4096))).toBeNull()
  })

  it('asks for a file at all', () => {
    expect(fileProblem(null)).toMatch(/Choose the filled-in sheet/)
  })

  it('names the workbook mistake, which the API can only report as a broken header', () => {
    expect(fileProblem(file('sheet.xlsx', 90000))).toMatch(/CSV \(Comma delimited\)/)
    expect(fileProblem(file('SHEET.XLS', 90000))).toMatch(/CSV \(Comma delimited\)/)
  })

  it('refuses an empty file and one past the API’s body limit', () => {
    expect(fileProblem(file('sheet.csv', 0))).toBe('That file is empty.')
    expect(fileProblem(file('sheet.csv', MAX_SHEET_BYTES + 1))).toMatch(/larger than 4 MB/)
    expect(fileProblem(file('sheet.csv', MAX_SHEET_BYTES))).toBeNull()
  })
})

describe('summaryLine', () => {
  it('accounts for every row read', () => {
    // rows === skipped + repeats + unchanged + changed, which is what makes the
    // line checkable rather than a number nobody can verify.
    expect(
      summaryLine({ rows: 48, skipped: 40, repeats: 2, unchanged: 3, changed: 3 })
    ).toBe('48 rows read · 40 left blank · 2 repeated · 3 already set · 3 categories to change')
  })

  it('says nothing about a count of zero, except the one that matters', () => {
    expect(summaryLine({ rows: 1, skipped: 0, repeats: 0, unchanged: 1, changed: 0 })).toBe(
      '1 row read · 1 already set · nothing to change'
    )
  })

  it('is empty with no summary', () => {
    expect(summaryLine(null)).toBe('')
  })
})

describe('describeChange', () => {
  it('reads as a sentence about one row', () => {
    expect(
      describeChange({ row: 4, id: 12, design: 'Aurora', from: null, to: 'fabric' })
    ).toBe('Row 4 · Aurora — not set → fabric')
  })

  it('never prints null at a person', () => {
    // Every product predates the column, so `from: null` is the common case.
    expect(describeChange({ row: 9, id: 12, design: '', from: 'fabric', to: 'wallpaper' })).toBe(
      'Row 9 · Product 12 — fabric → wallpaper'
    )
  })
})

describe('refusalFrom', () => {
  const refusal = {
    status: 422,
    body: {
      message: '2 rows could not be read. Nothing has been written.',
      errors: [
        { row: 3, message: '"fabrik" is not a category.' },
        { row: 9, message: 'No product with ID 4001.' },
      ],
      error_count: 2,
      summary: { rows: 12, skipped: 8, repeats: 0, unchanged: 1, changed: 1 },
    },
  }

  it('keeps the row numbers, which are how a person finds the row in Excel', () => {
    expect(refusalFrom(refusal).errors.map((entry) => entry.row)).toEqual([3, 9])
    expect(refusalFrom(refusal).message).toMatch(/Nothing has been written/)
    expect(refusalFrom(refusal).errorCount).toBe(2)
  })

  it('reports the true count when the API capped the list', () => {
    const capped = { status: 422, body: { ...refusal.body, error_count: 214 } }
    expect(refusalFrom(capped).errorCount).toBe(214)
  })

  it('is null for a failure that has nothing to say per row', () => {
    // A file that is not a product sheet at all is a 400, and a network drop
    // carries no body — both belong on the ordinary error line.
    expect(refusalFrom({ status: 400, body: { message: 'Unexpected header row' } })).toBeNull()
    expect(refusalFrom({ status: 0, body: null })).toBeNull()
    expect(refusalFrom({ status: 422, body: { message: 'x' } })).toBeNull()
    expect(refusalFrom(null)).toBeNull()
  })
})

describe('cappedNote', () => {
  it('says so when the API left rows out', () => {
    expect(cappedNote(50, 214, 'row')).toBe('Showing the first 50 of 214 rows.')
  })

  it('is silent when nothing was left out', () => {
    expect(cappedNote(2, 2, 'row')).toBeNull()
    expect(cappedNote(50, undefined, 'row')).toBeNull()
  })
})

describe('appliedNote', () => {
  it('quotes the database’s own count', () => {
    expect(appliedNote({ applied: 3 })).toBe('3 categories applied.')
    expect(appliedNote({ applied: 1 })).toBe('1 category applied.')
  })

  it('says a re-upload changed nothing rather than reporting a silent zero', () => {
    // Re-applying the same file is a no-op by construction: a stated category
    // equal to the stored one is `unchanged`, never a write.
    expect(appliedNote({ applied: 0 })).toMatch(/Nothing to apply/)
  })
})

describe('the panel’s copies of API constants', () => {
  it('states the four categories the sheet cannot carry', () => {
    // The export deliberately prints no note in the file — a CSV has nowhere to
    // put one Excel will not hand back as a data row — so the panel must.
    expect([...CATEGORY_VALUES]).toEqual(['fabric', 'wallpaper', 'trimming', 'accessory'])
  })

  it('posts a content type the API registered a Buffer parser for', () => {
    // text/plain and application/json belong to the ROOT instance: the body
    // would arrive parsed, Buffer.isBuffer would be false, and the office would
    // be told to post the raw file about a file it did post.
    expect(['text/csv', 'application/vnd.ms-excel', 'application/octet-stream']).toContain(
      SHEET_CONTENT_TYPE
    )
  })
})

describe('canApply', () => {
  it('is false until a report has been read', () => {
    // "A validation report shown before applying" is the story's own criterion,
    // and it is structural here rather than a habit: the Apply button does not
    // exist until the dry run has come back clean.
    expect(canApply(null)).toBe(false)
    expect(canApply({ kind: REPORT.refused })).toBe(false)
  })

  it('is false again once the sheet has been applied', () => {
    // Re-applying is harmless (a stated category equal to the stored one is
    // `unchanged`), but a button that stays lit after it has been pressed reads
    // as one that did not work.
    expect(canApply({ kind: REPORT.applied })).toBe(false)
  })

  it('is true for a clean dry run', () => {
    expect(canApply({ kind: REPORT.clean })).toBe(true)
  })
})

describe('the screen', () => {
  const source = readFileSync(new URL('./AdminProductSheet.jsx', import.meta.url), 'utf8')

  it('reads the file back through the API, never in the browser', () => {
    // A second opinion about what is in the sheet is a second implementation of
    // the parser, and the two would disagree the first time either changed.
    expect(source).not.toContain('FileReader')
    expect(source).not.toContain('csvRows')
  })

  it('posts to both routes and gates Apply on the dry run', () => {
    expect(source).toContain('VALIDATE_PATH')
    expect(source).toContain('APPLY_PATH')
    expect(source).toContain('canApply')
  })

  it('goes through src/lib/api.js for every request', () => {
    // Never a raw fetch in a screen: api.js is where credentials, the base URL
    // and the ApiError contract live.
    expect(source).not.toMatch(/(^|[^A-Za-z])fetch\(/)
  })
})
