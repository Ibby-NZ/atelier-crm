import { describe, it, expect, vi } from 'vitest'
import { MERGE_PATH, MOVES, STAYS, mergedNothing, runMerge, summariseMerge } from './legacyMerge.js'

// The shape `mergeLegacy` returns in atelier-api (src/legacy/merge.js) and the
// route hands back under `summary`.
const summary = (overrides = {}) => ({
  accounts: { created: 860, unnamed: 0 },
  contacts: { created: 2662, filed: 1373, unfiled: 736, no_company: 553 },
  reserves: { dockets: 1026, lines: 2855, declined: [] },
  housesRaised: [],
  catalogue: { items: 7611, noHouse: 89, products: 3485, colourways: 5833, inventoryCreated: 5833, unknownBrands: [], skips: [], conflicts: 0 },
  stock: { matched: 5833, stocked: 436, priced: 3000, unmatchedHouse: 0 },
  ...overrides,
})

describe('summariseMerge', () => {
  it('reads one line per table, in the order the CLI prints them', () => {
    const lines = summariseMerge(summary())
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatch(/^Accounts — 860 trade account\(s\) created/)
    expect(lines[1]).toContain('2,662 created')
    expect(lines[1]).toContain('1,373 filed under an account')
    expect(lines[2]).toBe('Reserves — 2,855 line(s) in 1,026 docket(s).')
    expect(lines[3]).toContain('7,611 stock item(s) → 5,833 colourway(s) across 3,485 product(s)')
    expect(lines[4]).toBe('Stock — 5,833 item(s) matched a colourway; 436 quantity(ies) set, 3,000 product price(s) filled.')
  })

  it('names the houses it raised and the houses it skipped, only when there are any', () => {
    const lines = summariseMerge(summary({
      housesRaised: ['SOLBIATI', 'LIBECO'],
      catalogue: { items: 10, noHouse: 0, products: 1, colourways: 1, inventoryCreated: 1, unknownBrands: [{ brand: 'ATELIER MISC', rows: 4 }], skips: [], conflicts: 0 },
      reserves: { dockets: 1, lines: 1, declined: [{ guid: 'x', reason: 'no customer' }] },
    }))
    expect(lines).toHaveLength(7)
    expect(lines[2]).toBe('Reserves — 1 line(s) in 1 docket(s); 1 declined (no customer or no product).')
    expect(lines[3]).toBe('Houses — raised 2: SOLBIATI, LIBECO.')
    expect(lines[5]).toBe('Houses not in the catalogue (items skipped) — ATELIER MISC: 4.')
  })

  it('survives a missing or partial summary', () => {
    expect(summariseMerge(null)).toEqual([])
    expect(summariseMerge({})).toHaveLength(5)
    expect(summariseMerge({})[0]).toContain('0 trade account(s) created')
  })
})

describe('mergedNothing', () => {
  it('is true only when every count is zero', () => {
    expect(mergedNothing(summary())).toBe(false)
    expect(mergedNothing(summary({
      accounts: { created: 0, unnamed: 0 },
      contacts: { created: 0 },
      reserves: { dockets: 0, lines: 0, declined: [] },
      catalogue: { colourways: 0 },
      stock: { stocked: 0, priced: 0 },
    }))).toBe(true)
    // A second run over an already-merged corpus creates nothing new but still
    // refreshes stock quantities — that is not "nothing".
    expect(mergedNothing(summary({
      accounts: { created: 0, unnamed: 0 },
      contacts: { created: 0 },
      reserves: { dockets: 0, lines: 0, declined: [] },
      catalogue: { colourways: 0 },
      stock: { stocked: 3, priced: 0 },
    }))).toBe(false)
    expect(mergedNothing(null)).toBe(true)
  })
})

describe('runMerge', () => {
  it('POSTs to the merge route asking for houses to be raised, and returns the summary', async () => {
    const send = vi.fn(async () => ({ summary: summary() }))
    const result = await runMerge({ send })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(MERGE_PATH, { create_houses: true })
    expect(result.accounts.created).toBe(860)
  })

  it('lets the caller keep unknown houses out of the catalogue', async () => {
    const send = vi.fn(async () => ({ summary: summary() }))
    await runMerge({ send, createHouses: false })
    expect(send).toHaveBeenCalledWith(MERGE_PATH, { create_houses: false })
  })

  it('surfaces the API\'s refusal untouched', async () => {
    const send = vi.fn(async () => { throw new Error('Another merge is already running.') })
    await expect(runMerge({ send })).rejects.toThrow('Another merge is already running.')
  })
})

describe('the vocabulary the panel shows', () => {
  it('names the four things that move and the four that stay', () => {
    expect(MOVES).toHaveLength(4)
    expect(MOVES.join(' ')).toMatch(/Accounts/)
    expect(MOVES.join(' ')).toMatch(/Contacts/)
    expect(MOVES.join(' ')).toMatch(/Reserves/)
    expect(MOVES.join(' ')).toMatch(/Stock/)
    expect(STAYS.join(' ')).toMatch(/Sales orders.*purchase orders.*stay in the Archive/)
  })
})
