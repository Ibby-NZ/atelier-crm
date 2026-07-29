import { describe, it, expect } from 'vitest'
import { CAPS, ROLES, USERS, DEMO_PASSWORD, can, accessOf, authenticate } from './roles.js'
import { canViewReport, reportDesc } from './reportPolicy.js'
import { REPORTS } from '../data/reportLibrary.js'
import { buildReport } from '../utils/reportBuilders.js'

const userOf = (id) => USERS.find((u) => u.id === id)
const ALL_CAPS = Object.values(CAPS)

describe('can — the single predicate, failing closed', () => {
  it('denies an unknown capability, a null user, and an unknown role', () => {
    expect(can(userOf('liz'), 'reports.invent')).toBe(false)
    expect(can(null, CAPS.FINANCE_VIEW)).toBe(false)
    expect(can(undefined, CAPS.FINANCE_VIEW)).toBe(false)
    expect(can({ id: 'ghost', role: 'archivist' }, CAPS.FINANCE_VIEW)).toBe(false)
  })

  it('a Director holds every capability', () => {
    ALL_CAPS.forEach((cap) => expect(can(userOf('liz'), cap)).toBe(true))
    expect(ROLES.director.caps).toEqual(expect.arrayContaining(ALL_CAPS))
  })

  it('Finance holds everything except user admin', () => {
    const charlotte = userOf('charlotte')
    ALL_CAPS.filter((cap) => cap !== CAPS.ADMIN_USERS)
      .forEach((cap) => expect(can(charlotte, cap)).toBe(true))
    expect(can(charlotte, CAPS.ADMIN_USERS)).toBe(false)
  })

  it('a User holds none — absence is the denial', () => {
    expect(ROLES.user.caps).toEqual([])
    ALL_CAPS.forEach((cap) => expect(can(userOf('rebecca'), cap)).toBe(false))
    ALL_CAPS.forEach((cap) => expect(can(userOf('showroom'), cap)).toBe(false))
  })
})

describe('accessOf — what a login may see of the figures', () => {
  it('reads the caps, and an absent user sees nothing', () => {
    expect(accessOf(userOf('rebecca'))).toEqual({ finance: false, all: false, owner: 'Rebecca' })
    expect(accessOf(userOf('charlotte'))).toEqual({ finance: true, all: true, owner: 'Charlotte' })
    expect(accessOf(null)).toEqual({ finance: false, all: false, owner: null })
  })

  // Neither can answer “my own sales” — Liz takes no orders, a shared login is not a
  // person. A6 owes us the attribution rule; until then the null is the honest answer.
  it('carries no salesperson for Liz or the shared Showroom login', () => {
    expect(accessOf(userOf('liz')).owner).toBe(null)
    expect(accessOf(userOf('showroom')).owner).toBe(null)
  })
})

describe('authenticate — demo credential check', () => {
  it('rejects a wrong password without disclosing the account', () => {
    const r = authenticate('rebecca@ateliertextiles.co.nz', 'not-the-passphrase')
    expect(r.user).toBeUndefined()
    expect(r.error).toBe('Incorrect password.')
  })

  it('rejects an unknown email', () => {
    const r = authenticate('nobody@example.com', DEMO_PASSWORD)
    expect(r.user).toBeUndefined()
    expect(r.error).toBe('No account matches that email.')
  })

  it('accepts a seeded account', () => {
    const r = authenticate('liz@ateliertextiles.co.nz', DEMO_PASSWORD)
    expect(r.error).toBeUndefined()
    expect(r.user.id).toBe('liz')
    expect(r.user.role).toBe('director')
  })
})

describe('canViewReport — whole-report denial', () => {
  const asUser = accessOf(userOf('rebecca'))
  const asFinance = accessOf(userOf('charlotte'))

  it('denies an unknown report key rather than rendering it ungated', () => {
    expect(canViewReport(asFinance, 'nope')).toBe(false)
    expect(canViewReport(asUser, 'nope')).toBe(false)
  })

  it('denies R-02, R-06 and R-11 to a User', () => {
    expect(canViewReport(asUser, 'account')).toBe(false)    // R-02 — no salesperson grain (A6)
    expect(canViewReport(asUser, 'brandtype')).toBe(false)  // R-11 — same gap
    expect(canViewReport(asUser, 'purchases')).toBe(false)  // R-06 — supplier spend end to end
  })

  it('allows R-02, R-06 and R-11 to Finance', () => {
    expect(canViewReport(asFinance, 'account')).toBe(true)
    expect(canViewReport(asFinance, 'brandtype')).toBe(true)
    expect(canViewReport(asFinance, 'purchases')).toBe(true)
  })

  it('leaves the maskable reports open to a User — mask the finance, keep the workflow', () => {
    expect(canViewReport(asUser, 'zerocost')).toBe(true)
    expect(canViewReport(asUser, 'margin')).toBe(true)
    expect(canViewReport(asUser, 'stock')).toBe(true)
    expect(canViewReport(asUser, 'shipment')).toBe(true)
  })
})

// A cost escapes a report through its prose as readily as through a column. These
// cover the leaks the adversarial pass found after the first cut of the gate.
describe('reportDesc — the heading is a leak surface too', () => {
  const user = accessOf(userOf('rebecca'))
  const finance = accessOf(userOf('charlotte'))

  it('withholds R-04’s standing description, which states the margin band outright', () => {
    const def = REPORTS.find((r) => r.key === 'margin')
    expect(def.desc).toContain('30%') // the real one names the band
    const shown = reportDesc(def, user)
    expect(shown).not.toContain('30%')
    expect(shown).not.toContain('70%')
    expect(shown).not.toMatch(/margin/i)
  })

  it('leaves every description intact for a finance login', () => {
    REPORTS.forEach((def) => expect(reportDesc(def, finance)).toBe(def.desc))
  })

  it('stops advertising a stock valuation the reader cannot see', () => {
    const def = REPORTS.find((r) => r.key === 'stock')
    expect(reportDesc(def, user)).not.toMatch(/valuation/i)
  })
})

describe('applyReportAccess — masked tables give back the space they no longer use', () => {
  it('reclaims the dropped columns’ width from minW', () => {
    const full = buildReport({ report: 'stock' }, accessOf(userOf('liz')))
    const masked = buildReport({ report: 'stock' }, accessOf(userOf('rebecca')))
    // R-10 loses 'Landed /m' (95px) and 'Value' (100px)
    expect(parseInt(masked.minW)).toBe(parseInt(full.minW) - 195)
  })

  it('never widens a table it masked', () => {
    for (const key of ['zerocost', 'margin', 'shipment', 'stock']) {
      const full = buildReport({ report: key }, accessOf(userOf('liz')))
      const masked = buildReport({ report: key }, accessOf(userOf('rebecca')))
      expect(parseInt(masked.minW)).toBeLessThan(parseInt(full.minW))
    }
  })
})
