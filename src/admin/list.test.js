import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LIMIT,
  buildListQuery,
  clampPage,
  listPath,
  pageCount,
  readList,
} from './list.js'

describe('buildListQuery', () => {
  it('drops null, undefined and the empty string', () => {
    // The regression this exists for: an "All" option with value="" sending
    // `role=`, which the API's enum answers with a 400 that kills the whole list.
    expect(
      buildListQuery({ role: '', segment: null, q: undefined, page: 1 })
    ).toBe('page=1')
  })

  it('treats a whitespace-only string as no filter, and trims the rest', () => {
    expect(buildListQuery({ q: '   ' })).toBe('')
    expect(buildListQuery({ q: '  linen  ' })).toBe('q=linen')
  })

  it('keeps a literal zero and both booleans', () => {
    // 0 is a real threshold_qty and false is a real answer; only absence and
    // emptiness mean "do not filter".
    expect(buildListQuery({ threshold_qty: 0, include_archived: false })).toBe(
      'threshold_qty=0&include_archived=false'
    )
    expect(buildListQuery({ include_archived: true })).toBe('include_archived=true')
  })

  it('drops a number that cannot be sent', () => {
    expect(buildListQuery({ page: Number.NaN, limit: Infinity })).toBe('')
  })

  it('percent-encodes values rather than building the string by hand', () => {
    expect(buildListQuery({ q: '100% linen & silk' })).toBe('q=100%25+linen+%26+silk')
  })

  it('survives no argument at all', () => {
    expect(buildListQuery()).toBe('')
    expect(buildListQuery(null)).toBe('')
  })
})

describe('listPath', () => {
  it('omits the ? when there is nothing to send', () => {
    expect(listPath('/admin/brands', '')).toBe('/admin/brands')
    expect(listPath('/admin/brands', 'page=2')).toBe('/admin/brands?page=2')
  })
})

describe('pageCount', () => {
  it('is never less than one, so an empty list is page 1 of 1', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(0)).toBe(1)
  })

  it('rounds a partial page up', () => {
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
    expect(pageCount(51, 25)).toBe(3)
  })

  it('falls back to the default limit rather than dividing by zero', () => {
    expect(pageCount(50, 0)).toBe(50 / DEFAULT_LIMIT)
    expect(pageCount(50, -5)).toBe(2)
  })
})

describe('clampPage', () => {
  it('pulls a page back inside the range', () => {
    expect(clampPage(7, 3)).toBe(3)
    expect(clampPage(0, 3)).toBe(1)
    expect(clampPage(-2, 3)).toBe(1)
    expect(clampPage(2, 3)).toBe(2)
  })

  it('treats junk as page 1', () => {
    expect(clampPage(undefined, 3)).toBe(1)
    expect(clampPage(Number.NaN, 3)).toBe(1)
    expect(clampPage(2, 0)).toBe(1)
  })
})

describe('readList', () => {
  it('reads the named array and the paged total', () => {
    expect(readList({ brands: [{ id: 1 }], meta: { total: 41 } }, 'brands')).toEqual({
      rows: [{ id: 1 }],
      total: 41,
    })
  })

  it('falls back to the row count when the endpoint does not page', () => {
    // /admin/brands and /admin/inventory return the whole list with no meta.
    expect(readList({ brands: [{ id: 1 }, { id: 2 }] }, 'brands')).toEqual({
      rows: [{ id: 1 }, { id: 2 }],
      total: 2,
    })
  })

  it('never returns a non-array, whatever the body was', () => {
    expect(readList(null, 'brands')).toEqual({ rows: [], total: 0 })
    expect(readList({}, 'brands')).toEqual({ rows: [], total: 0 })
    expect(readList({ brands: 'nope' }, 'brands')).toEqual({ rows: [], total: 0 })
  })
})

describe('array filters', () => {
  // A status SET (the dashboard's Open tile) travels as repeated params —
  // Fastify parses repeats into the schema's array branch.
  it('serialises an array as repeated params, in order', () => {
    expect(buildListQuery({ status: ['paid', 'shipped'], page: 2 })).toBe(
      'status=paid&status=shipped&page=2'
    )
  })

  it('drops an empty array like any other unset filter', () => {
    expect(buildListQuery({ status: [], q: 'x' })).toBe('q=x')
  })
})
