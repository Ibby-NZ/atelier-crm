import { describe, it, expect } from 'vitest'
import { parseCSV } from './csv.js'

describe('parseCSV — the import boundary never throws', () => {
  it('parses CRLF and LF input identically', () => {
    const crlf = parseCSV('a,b\r\n1,2\r\n3,4')
    const lf = parseCSV('a,b\n1,2\n3,4')
    expect(crlf.header).toEqual(['a', 'b'])
    expect(crlf.rows).toEqual([['1', '2'], ['3', '4']])
    expect(lf.header).toEqual(crlf.header)
    expect(lf.rows).toEqual(crlf.rows)
    expect(crlf.errors).toEqual([])
  })

  it('strips a leading BOM', () => {
    expect(parseCSV('﻿a,b\n1,2').header[0]).toBe('a')
  })

  it('handles quoted commas and escaped quotes', () => {
    const r = parseCSV('desc,rate\n"Jardine, Aqua",39.00\n"say ""hi""",x')
    expect(r.rows[0]).toEqual(['Jardine, Aqua', '39.00'])
    expect(r.rows[1]).toEqual(['say "hi"', 'x'])
  })

  it('skips blank lines but preserves trailing empty fields', () => {
    const r = parseCSV('a,b\n\n1,\n\n')
    expect(r.rows).toEqual([['1', '']])
    expect(r.errors).toEqual([])
  })

  it('pads short rows and truncates long rows, with an error entry each', () => {
    const short = parseCSV('a,b,c\n1,2')
    expect(short.rows[0]).toEqual(['1', '2', ''])
    expect(short.errors[0].message).toContain('padded')
    const long = parseCSV('a,b\n1,2,3')
    expect(long.rows[0]).toEqual(['1', '2'])
    expect(long.errors[0].message).toContain('truncated')
  })

  it('reports unterminated quotes without throwing', () => {
    const r = parseCSV('a,b\n"open,2')
    expect(r.errors.some((e) => e.message.includes('unterminated'))).toBe(true)
    expect(r.rows.length).toBe(1)
  })

  it('returns a No data error for empty input', () => {
    expect(parseCSV('').errors[0].message).toBe('No data')
    expect(parseCSV('   \n  ').errors[0].message).toBe('No data')
  })
})
