import { describe, it, expect } from 'vitest'
import { createConfirmation, tabTargetIndex } from './confirmation.js'

describe('confirmation decisions', () => {
  it('does not accept a mutation until the user confirms', async () => {
    let visible
    const confirmation = createConfirmation(value => { visible = value })
    const decision = confirmation.ask({ body: 'Archive the account?' })
    expect(visible.body).toBe('Archive the account?')
    confirmation.settle(true)
    expect(await decision).toBe(true)
    expect(visible).toBe(null)
  })
  it('cancellation and unmount refuse the pending action', async () => {
    const confirmation = createConfirmation(() => {})
    const cancelled = confirmation.ask({})
    confirmation.settle(false)
    expect(await cancelled).toBe(false)
    const unmounted = confirmation.ask({})
    confirmation.dispose()
    expect(await unmounted).toBe(false)
  })
  it('a repeated request cannot replace an unanswered confirmation', async () => {
    const confirmation = createConfirmation(() => {})
    const original = confirmation.ask({ body: 'Original' })
    expect(await confirmation.ask({ body: 'Replacement' })).toBe(false)
    confirmation.settle(true)
    expect(await original).toBe(true)
  })
  it('cleanup does not publish state and StrictMode can open the next request', async () => {
    const changes=[]
    const confirmation=createConfirmation(v=>changes.push(v))
    const first=confirmation.ask({body:'First'})
    confirmation.dispose()
    expect(changes).toHaveLength(1)
    expect(await first).toBe(false)
    const second=confirmation.ask({body:'Second'})
    confirmation.settle(false)
    expect(await second).toBe(false)
  })
})
describe('modal tab boundaries', () => {
  it('wraps forwards and backwards without changing ordinary tab order', () => {
    expect(tabTargetIndex(3,2,false)).toBe(0)
    expect(tabTargetIndex(3,0,true)).toBe(2)
    expect(tabTargetIndex(3,1,false)).toBe(null)
    expect(tabTargetIndex(3,1,true)).toBe(null)
  })
  it('brings outside focus back in and handles all-disabled controls', () => {
    expect(tabTargetIndex(2,-1,false)).toBe(0)
    expect(tabTargetIndex(2,-1,true)).toBe(1)
    expect(tabTargetIndex(0,-1,false)).toBe(null)
  })
})
