import { describe, it, expect } from 'vitest'
import {
  OVERVIEW_PANELS,
  OVERVIEW_PATHS,
  overviewExportSections,
  overviewFetchPath,
  overviewReportHref,
  periodLabel,
} from './reportingOverview.js'
import { LIVE_REPORTS } from '../utils/reportBuilders.js'

describe('the overview is live', () => {
  it('draws only reports the API actually serves', () => {
    expect(OVERVIEW_PATHS.length).toBeGreaterThan(0)
    for (const path of OVERVIEW_PATHS) {
      expect(path).toMatch(/^\/admin\/reports\//)
      expect(Object.values(LIVE_REPORTS)).toContain(path)
    }
  })

  it('names each panel by a report-library key, so the full report is a link', () => {
    for (const panel of OVERVIEW_PANELS) {
      expect(LIVE_REPORTS[panel.key]).toBe(panel.path)
    }
  })

  it('hides no column that carries a figure', () => {
    for (const panel of OVERVIEW_PANELS) {
      expect(panel.hide).not.toContain('value_cents')
      expect(panel.hide).not.toContain('qty')
      expect(panel.hide).not.toContain('orders')
    }
  })
})

describe('the filters travel', () => {
  const filters = { category: 'fabric', from: '2026-07-01', to: '2026-07-31', brand_code: 'CF', range: '' }

  it('fetches a panel with the library’s own querystring', () => {
    const path = overviewFetchPath('/admin/reports/sales-by-rep', filters)
    expect(path.startsWith('/admin/reports/sales-by-rep?')).toBe(true)
    expect(path).toContain('category=fabric')
    expect(path).toContain('from=2026-07-01')
    expect(path).toContain('brand_code=CF')
  })

  it('asks for the plain report when nothing is filtered', () => {
    expect(overviewFetchPath('/admin/reports/stock', {})).toBe('/admin/reports/stock')
  })

  it('links into the library on that report, carrying what is applied here', () => {
    const href = overviewReportHref('owner', filters)
    expect(href.startsWith('/reporting/library?')).toBe(true)
    expect(href).toContain('r=owner')
    expect(href).toContain('category=fabric')
  })
})

describe('the export writes what is on screen', () => {
  const table = {
    cols: [{ t: 'Staff member' }, { t: 'Value' }],
    rows: [{ cells: [{ v: 'Liz' }, { v: '474.00' }] }],
  }

  it('one section per panel that loaded', () => {
    expect(
      overviewExportSections([
        { title: 'Sales by staff member', table },
        { title: 'Refused', table: null },
        { title: 'Empty', table: { cols: table.cols, rows: [] } },
      ])
    ).toEqual([
      { title: 'Sales by staff member', head: ['Staff member', 'Value'], rows: [['Liz', '474.00']] },
    ])
  })

  it('is empty when nothing loaded — never a header with no rows', () => {
    expect(overviewExportSections([])).toEqual([])
  })
})

describe('periodLabel', () => {
  it('says what the bar is asking for, and never builds a Date', () => {
    expect(periodLabel({ from: '2026-07-01', to: '2026-07-31' })).toBe('2026-07-01 to 2026-07-31')
    expect(periodLabel({ from: '2026-07-01' })).toBe('from 2026-07-01')
    expect(periodLabel({ to: '2026-07-31' })).toBe('up to 2026-07-31')
    expect(periodLabel({})).toBe('every order the platform holds')
  })
})
