import { describe, it, expect } from 'vitest'
import { clientViewModel } from './clientView.js'
import { clientAccount } from '../data/atelier.js'

describe('clientViewModel — seed branch (client.account)', () => {
  const vm = clientViewModel({ id: 'marlow-finch-interiors', name: 'Marlow & Finch Interiors', account: clientAccount })

  it('returns the account stats / timeline / byRange / samplesOut by reference', () => {
    expect(vm.stats).toBe(clientAccount.stats)
    expect(vm.timeline).toBe(clientAccount.timeline)
    expect(vm.byRange).toBe(clientAccount.byRange)
    expect(vm.samplesOut).toBe(clientAccount.samplesOut)
  })

  it('carries the fixed seed pill / since year / salesperson', () => {
    expect(vm.hasAccount).toBe(true)
    expect(vm.locationPill).toBe('Ponsonby, Auckland')
    expect(vm.sinceYear).toBe('2019')
    expect(vm.salesperson).toBe(clientAccount.salesperson)
    expect(vm.contacts).toHaveLength(2)
    expect(vm.contacts[0].name).toBe(clientAccount.contact.name)
  })

  it('a manual override replaces the seed account salesperson', () => {
    const over = clientViewModel(
      { id: 'marlow-finch-interiors', name: 'Marlow & Finch Interiors', account: clientAccount },
      { 'marlow-finch-interiors': { owner: 'Charlotte', audit: [] } },
    )
    expect(over.salesperson).toBe('Charlotte')
  })
})

describe('clientViewModel — generic branch (created client)', () => {
  it('zeroes stats, empties sections and builds the pill from city + region', () => {
    const vm = clientViewModel({ id: 'acme', name: 'Acme', city: 'Nelson', region: 'Wellington', type: 'Retail', contact: { name: '', email: '', phone: '' } })
    expect(vm.hasAccount).toBe(false)
    expect(vm.stats[0].value).toBe('NZ$0.00')
    expect(vm.stats.map((s) => s.value)).toEqual(['NZ$0.00', 'NZ$0.00', '—', '0'])
    expect(vm.timeline).toEqual([])
    expect(vm.byRange).toEqual([])
    expect(vm.samplesOut).toEqual([])
    expect(vm.contacts).toEqual([])
    expect(vm.locationPill).toBe('Nelson, Wellington')
    expect(vm.sinceYear).toBe('2026')
    // Owner now resolves from the region matrix (decision 4): Wellington ⇒ Charlotte.
    expect(vm.salesperson).toBe('Charlotte')
    expect(vm.type).toBe('Retail')
  })

  it('a manual ownership override wins over the region matrix', () => {
    const client = { id: 'acme', name: 'Acme', region: 'Wellington', contact: {} }
    const vm = clientViewModel(client, { acme: { owner: 'Jenette', audit: [] } })
    expect(vm.salesperson).toBe('Jenette')
  })

  it('an unknown region falls back to Liz', () => {
    const vm = clientViewModel({ id: 'x', name: 'X', region: 'Nowhere', contact: {} })
    expect(vm.salesperson).toBe('Liz')
  })

  it('derives a single contact when a contact name is present', () => {
    const vm = clientViewModel({ name: 'Acme', contact: { name: 'Dana Reed', email: 'd@acme.co', phone: '+64 21 000' } })
    expect(vm.contacts).toHaveLength(1)
    expect(vm.contacts[0]).toMatchObject({ initial: 'D', name: 'Dana Reed', email: 'd@acme.co', phone: '+64 21 000' })
  })
})
