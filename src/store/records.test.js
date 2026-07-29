import { describe, it, expect } from 'vitest'
import {
  slugify,
  uniqueId,
  nextNumber,
  buildClient,
  buildSalesOrder,
  buildPurchaseOrder,
  seedClients,
  designLibrary,
} from './records.js'
import { computeOrderTotals } from '../data/atelier.js'
import { tradeUnit } from '../data/pricing.js'
import { supplierByName } from '../data/suppliers.js'

describe('slugify', () => {
  it('lowercases and collapses non-alphanumerics to single hyphens', () => {
    expect(slugify('McKenzie & Willis')).toBe('mckenzie-willis')
    expect(slugify('Coast & Co Design')).toBe('coast-co-design')
    expect(slugify('  Trailing —  ')).toBe('trailing')
  })
})

describe('uniqueId', () => {
  it('returns the base when free, else suffixes -2, -3, …', () => {
    expect(uniqueId('acme', [])).toBe('acme')
    expect(uniqueId('acme', ['acme'])).toBe('acme-2')
    expect(uniqueId('acme', ['acme', 'acme-2'])).toBe('acme-3')
    expect(uniqueId('acme', new Set(['acme']))).toBe('acme-2')
  })
})

describe('nextNumber', () => {
  it('increments above the seed max and any created numbers, zero-padded to 4', () => {
    expect(nextNumber('SO-2026-', [], 418)).toBe('SO-2026-0419')
    expect(nextNumber('SO-2026-', ['SO-2026-0419'], 418)).toBe('SO-2026-0420')
    expect(nextNumber('PO-2026-', [], 142)).toBe('PO-2026-0143')
  })
})

describe('buildClient', () => {
  it('rejects an empty name with an error', () => {
    expect(buildClient({ name: '   ' }).error).toBeTruthy()
    expect(buildClient({}).error).toBeTruthy()
  })

  it('builds a slug id, collision-safe, with blank contact defaults', () => {
    const c = buildClient({ name: 'Robert Andrews', city: 'Nelson', region: 'Wellington', type: 'Retail', tier: 2 }, ['robert-andrews'])
    expect(c.id).toBe('robert-andrews-2')
    expect(c.seeded).toBe(false)
    expect(c.contact).toEqual({ name: '', email: '', phone: '' })
    expect(c.tier).toBe(2)
  })
})

describe('buildSalesOrder → computeOrderTotals', () => {
  it('produces an order whose 12 m line qualifies for the tier discount and totals correctly', () => {
    const client = { id: 'indigo-house-studio', name: 'Indigo House Studio', tier: 2 }
    const order = buildSalesOrder(
      { project: 'Studio refresh', salesperson: 'Liz', lines: [{ design: 'Atlas', colourway: 'Indigo', sku: 'PF-ATL-04', tone: ['#5C6B86', '#2C3A55'], qty: 12 }] },
      ['SO-2026-0418'],
      client,
    )
    expect(order.number).toBe('SO-2026-0419')
    expect(order.id).toBe(order.number)
    expect(order.seeded).toBe(false)
    expect(order.status).toBe('Draft')
    expect(order.clientTier).toBe(2)

    const unit = tradeUnit('Atlas')
    const t = computeOrderTotals(order)
    expect(t.subtotal).toBeCloseTo(unit * 12, 6)
    expect(t.qualifies).toBe(true) // 12 m > volumeThreshold 5
    expect(t.discountPct).toBeCloseTo(0.05, 6) // Tier 2
    const net = t.subtotal - t.discount + t.freight
    expect(t.gst).toBeCloseTo(net * 0.15, 6) // GST 15%
    expect(t.total).toBeCloseTo(net + t.gst, 6)
  })
})

describe('buildPurchaseOrder', () => {
  it('copies supplier defaults and starts with received:0 lines and no receipts', () => {
    const fabricut = supplierByName('Fabricut')
    const po = buildPurchaseOrder(
      { eta: '20 Jul', lines: [{ design: 'Mesa', colourway: 'Adobe', sku: 'FB-MES-01', tone: ['#C89B7B', '#8F5F3F'], ordered: 40, unit: 48 }] },
      [],
      fabricut,
    )
    expect(po.number).toBe('PO-2026-0143')
    expect(po.supplier).toBe('Fabricut')
    expect(po.supplierId).toBe('fabricut')
    expect(po.currency).toBe('USD')
    expect(po.agent).toBe(fabricut.agent)
    expect(po.incoterm).toBe(fabricut.incoterm)
    expect(po.receipts).toEqual([])
    expect(po.lines).toHaveLength(1)
    expect(po.lines[0].received).toBe(0)
    expect(po.lines[0].design).toBe('Mesa — Adobe')
    expect(po.lines[0].unit).toBe('US$48.00')
    expect(po.lines[0].line).toBe('US$1,920.00')
  })
})

describe('seedClients', () => {
  it('adapts the 5 seed rows to stable slug ids including marlow-finch-interiors', () => {
    const seeds = seedClients()
    expect(seeds).toHaveLength(5)
    expect(seeds.every((c) => c.seeded === true)).toBe(true)
    expect(seeds.map((c) => c.id)).toEqual([
      'mckenzie-willis',
      'marlow-finch-interiors',
      'indigo-house-studio',
      'coast-co-design',
      'maker-interiors',
    ])
  })
})

describe('designLibrary', () => {
  it('includes the Atlas Indigo SKU and a Fabricut SKU with a numeric unit', () => {
    const lib = designLibrary()
    const atlas = lib.find((o) => o.sku === 'PF-ATL-04')
    expect(atlas).toBeTruthy()
    expect(atlas.label).toBe('Atlas — Indigo')

    const fab = lib.find((o) => o.sku === 'FB-MES-01')
    expect(fab).toBeTruthy()
    expect(fab.supplier).toBe('Fabricut')
    expect(typeof fab.unit).toBe('number')
    expect(fab.unit).toBeGreaterThan(0)
  })
})
