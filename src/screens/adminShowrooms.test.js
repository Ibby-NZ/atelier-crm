import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildListQuery } from '../admin/list.js'
import {
  NEW_SHOWROOM,
  SHOWROOMS_PATH,
  SHOWROOM_FIELDS,
  archiveInsteadPath,
  archiveTogglePath,
  archiveVerb,
  describeShowroom,
  holdsSummary,
  showroomFilters,
  showroomMeta,
  showroomPath,
} from './adminShowrooms.js'

const MODULE_SOURCE = readFileSync(new URL('./adminShowrooms.js', import.meta.url), 'utf8')
const SCREEN_SOURCE = readFileSync(new URL('./AdminShowrooms.jsx', import.meta.url), 'utf8')

const showroom = (extra = {}) => ({
  id: 2,
  name: 'Newmarket',
  address: '12 Broadway',
  city: 'Auckland',
  contact_name: 'Liz',
  contact_email: 'liz@example.com',
  contact_phone: '09 555 0000',
  notes: null,
  archived_at: null,
  ...extra,
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
    // sample_orders.showroom_id is NOT NULL and RESTRICT, so a showroom that has
    // ever been sent an order can never be hard-deleted. Without the action the
    // 409 dialog would offer Cancel alone, with nothing to say why.
    expect(SCREEN_SOURCE).toContain('archive: (row) => apiSend')
    expect(SCREEN_SOURCE).toContain('archiveInsteadPath')
  })

  it('names no endpoint of its own — every path comes from adminShowrooms.js', () => {
    // Anchored on the opening quote, so a relative import ('../admin/drafts.js')
    // is not mistaken for an endpoint.
    const quoted = SCREEN_SOURCE.match(/['"`]\/admin\/[a-z-]+/g) ?? []
    expect(quoted).toEqual([])
    expect(SCREEN_SOURCE).toContain('showroomPath')
  })

  it('reads the by-id detail rather than asking whether a delete would work', () => {
    // The kit forbids a pre-flight "can I delete this" GET — it races the delete
    // and the 409 is authoritative. The counts come from the detail read a staff
    // member has already opened, which is reading what the API already said.
    expect(SCREEN_SOURCE).toContain('apiFetch(showroomPath(id))')
    expect(SCREEN_SOURCE).toContain('holdsSummary')
  })
})

describe('paths', () => {
  it('are built in one place', () => {
    expect(SHOWROOMS_PATH).toBe('/admin/showrooms')
    expect(showroomPath(2)).toBe('/admin/showrooms/2')
  })

  it('keeps the row toggle and "Archive instead" apart', () => {
    // "Archive instead" is offered on a REFUSED delete, so pointing it at the
    // toggle would answer a request to remove the row by RESTORING it.
    const archived = showroom({ archived_at: '2026-02-01T00:00:00.000Z' })
    expect(archiveVerb(archived)).toBe('restore')
    expect(archiveTogglePath(archived)).toBe('/admin/showrooms/2/restore')
    expect(archiveInsteadPath(archived)).toBe('/admin/showrooms/2/archive')

    expect(archiveVerb(showroom())).toBe('archive')
    expect(archiveTogglePath(showroom())).toBe('/admin/showrooms/2/archive')
  })
})

describe('showroomFilters', () => {
  it('drops an unset filter rather than sending it empty', () => {
    expect(buildListQuery(showroomFilters())).toBe('')
    expect(buildListQuery(showroomFilters({ term: '   ' }))).toBe('')
  })

  it('vanishes include_archived when the box is unticked', () => {
    expect(buildListQuery(showroomFilters({ showArchived: false }))).toBe('')
    expect(buildListQuery(showroomFilters({ showArchived: true }))).toBe('include_archived=true')
  })

  it('trims the search term', () => {
    expect(buildListQuery(showroomFilters({ term: ' Auckland ' }))).toBe('q=Auckland')
  })
})

describe('SHOWROOM_FIELDS', () => {
  it('declares the same columns the API PATCH accepts', () => {
    // Mirrors SHOWROOM_UPDATE_COLUMNS in atelier-api's src/samples/showrooms.js.
    // A key declared here and missing there is stripped by Ajv's
    // removeAdditional and would silently save nothing.
    expect(SHOWROOM_FIELDS.map((f) => f.key)).toEqual([
      'name',
      'address',
      'city',
      'contact_name',
      'contact_email',
      'contact_phone',
      'notes',
    ])
    expect(Object.keys(NEW_SHOWROOM).sort()).toEqual(SHOWROOM_FIELDS.map((f) => f.key).sort())
  })

  it('requires the name, which is NOT NULL and unique', () => {
    expect(SHOWROOM_FIELDS.find((f) => f.key === 'name').required).toBe(true)
  })

  it('offers no id, no timestamp and no archive column', () => {
    const keys = SHOWROOM_FIELDS.map((f) => f.key)
    expect(keys).not.toContain('id')
    expect(keys).not.toContain('archived_at')
    expect(keys).not.toContain('created_at')
    expect(keys).not.toContain('sample_count')
  })
})

describe('describeShowroom', () => {
  it('names the row by its unique name', () => {
    expect(describeShowroom(showroom())).toBe('Newmarket')
    expect(describeShowroom({ name: '  Ponsonby  ' })).toBe('Ponsonby')
  })

  it('returns undefined for a nameless row, so the kit says "That showroom"', () => {
    expect(describeShowroom({})).toBeUndefined()
    expect(describeShowroom()).toBeUndefined()
    expect(describeShowroom({ name: '   ' })).toBeUndefined()
  })
})

describe('showroomMeta', () => {
  it('reads as an address book line', () => {
    expect(showroomMeta(showroom())).toBe('Auckland · Liz · 09 555 0000')
  })

  it('says so when there is nothing on file', () => {
    expect(showroomMeta({ name: 'Bare' })).toBe('No address or contact on file')
    expect(showroomMeta()).toBe('No address or contact on file')
  })
})

describe('holdsSummary', () => {
  it('warns in advance that Delete will be refused, and says what to do instead', () => {
    const both = holdsSummary({ sample_count: 12, sample_order_count: 3 })
    expect(both.blocked).toBe(true)
    expect(both.text).toContain('12 samples')
    expect(both.text).toContain('3 sample orders')
    expect(both.text).toMatch(/archive it instead/i)
  })

  it('names only the relation that actually blocks', () => {
    const samplesOnly = holdsSummary({ sample_count: 1, sample_order_count: 0 })
    expect(samplesOnly.text).toContain('1 sample')
    expect(samplesOnly.text).not.toContain('sample order')
  })

  it('says an empty showroom really can be deleted', () => {
    const empty = holdsSummary({ sample_count: 0, sample_order_count: 0 })
    expect(empty.blocked).toBe(false)
    expect(empty.text).toMatch(/can be deleted/i)
  })

  it('treats a detail read that has not arrived as empty rather than as blocked', () => {
    // The panel renders a loading note first, so this only guards against a
    // half-loaded read printing "NaN samples point at this showroom".
    expect(holdsSummary(null).blocked).toBe(false)
    expect(holdsSummary(undefined).text).not.toMatch(/NaN/)
  })
})

describe('nothing from the Dynamics cutting staging table is displayed', () => {
  it('reads no legacy endpoint and touches no staff comment column', () => {
    for (const source of [MODULE_SOURCE, SCREEN_SOURCE]) {
      expect(source).not.toContain('/admin/legacy')
      expect(source).not.toContain('legacy_cuttings')
      expect(source).not.toMatch(/\.comments\b/)
    }
    // A scan that read nothing passes every per-file check vacuously.
    expect(MODULE_SOURCE.length).toBeGreaterThan(0)
    expect(SCREEN_SOURCE.length).toBeGreaterThan(0)
  })
})
