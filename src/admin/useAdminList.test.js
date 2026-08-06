import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pageAfterLoad } from './useAdminList.js'

// The hook itself cannot be rendered — this repo has no jsdom, which is why its
// one non-trivial rule lives in `pageAfterLoad`. The two source assertions at the
// bottom cover the invariants that have no runtime surface at all here; each of
// them is a bug that looks like something else when it regresses.

describe('pageAfterLoad', () => {
  const load = (over) => pageAfterLoad({ page: 1, rows: [], total: 0, limit: 25, ...over })

  it('steps back when a delete empties the last page', () => {
    // 26 rows over two pages; the last one on page 2 is deleted.
    expect(load({ page: 2, rows: [], total: 25, limit: 25 })).toBe(1)
  })

  it('steps all the way back when the list is emptied entirely', () => {
    expect(load({ page: 4, rows: [], total: 0, limit: 25 })).toBe(1)
  })

  it('lands on the new last page, not always page 1', () => {
    // 120 rows became 60: page 5 no longer exists, page 3 does.
    expect(load({ page: 5, rows: [], total: 60, limit: 25 })).toBe(3)
  })

  it('stays put when the page still has rows', () => {
    expect(load({ page: 3, rows: [{ id: 1 }], total: 200, limit: 25 })).toBeNull()
  })

  it('stays put on page 1, because an empty first page is just an empty list', () => {
    // Returning 1 here would set state to the value it already holds on every
    // load of every empty list.
    expect(load({ page: 1, rows: [], total: 0 })).toBeNull()
  })

  it('stays put when the page is empty but still within range', () => {
    // Not reachable from a delete, but a caller must never be sent to a page it
    // is already on — that would re-run the effect forever.
    expect(load({ page: 2, rows: [], total: 100, limit: 25 })).toBeNull()
  })
})

describe('useAdminList source invariants', () => {
  const source = readFileSync(new URL('./useAdminList.js', import.meta.url), 'utf8')

  it('keys the fetch on the serialised query, never on the filters object', () => {
    // A screen passing an inline object literal hands over a new identity every
    // render; an effect keyed on it refetches forever. Both dependency arrays
    // must therefore hold primitives only.
    expect(source).toContain('[path, key, query]')
    expect(source).toContain('[filterQuery]')
    expect(source).not.toMatch(/\[[^\]]*\bfilters\b[^\]]*\]/)
  })

  it('guards the load with an active flag', () => {
    // StrictMode double-mounts every effect, and a filter change leaves the
    // previous page in flight. Without this the older response can land last.
    expect(source).toContain('let active = true')
    expect(source).toContain('active = false')
    expect(source.match(/if \(!active\) return/g)).toHaveLength(2)
  })
})
