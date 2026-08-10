import { describe, it, expect } from 'vitest'
import { buildReviewQueue, isPendingEntry, reviewState } from './tradeApplicants.js'
import { partitionClients } from './clientAccounts.js'

const user = (over = {}) => ({
  id: 1,
  email: 'studio@example.test',
  name: 'Studio',
  role: 'trade',
  trade_approved: false,
  archived_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const application = (over = {}) => ({
  id: 10,
  business_name: 'Marlow and Finch',
  created_at: '2026-08-02T00:00:00.000Z',
  user: user(),
  ...over,
})

describe('buildReviewQueue', () => {
  it('lists a pending trade login that has no application form', () => {
    const queue = buildReviewQueue([], [user({ id: 7, name: 'Probe Studio' })])
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ key: 'user-7', form: null, business_name: 'Probe Studio' })
  })

  it('falls back to the email when a back-office account has no name', () => {
    const queue = buildReviewQueue([], [user({ id: 7, name: null })])
    expect(queue[0].business_name).toBe('studio@example.test')
  })

  // The regression: one account was reported twice, once per source.
  it('never lists an account twice when it has both a form and a login', () => {
    const queue = buildReviewQueue([application()], [user()])
    expect(queue).toHaveLength(1)
    expect(queue[0].form).not.toBeNull()
  })

  it('keeps an application whose account has been removed', () => {
    const queue = buildReviewQueue([application({ user: null })], [])
    expect(queue).toHaveLength(1)
    expect(reviewState(queue[0])).toEqual({ label: 'Account removed', tone: 'muted' })
  })

  it('leaves an approved or archived form-less account out — nobody is waiting on it', () => {
    const users = [
      user({ id: 2, trade_approved: true }),
      user({ id: 3, archived_at: '2026-08-01T00:00:00.000Z' }),
      user({ id: 4, role: 'customer' }),
    ]
    expect(buildReviewQueue([], users)).toEqual([])
  })

  it('orders newest first, with a total tie-break', () => {
    const queue = buildReviewQueue(
      [application({ id: 10, created_at: '2026-08-02T00:00:00.000Z' })],
      [
        user({ id: 7, created_at: '2026-08-05T00:00:00.000Z' }),
        user({ id: 8, created_at: '2026-08-01T00:00:00.000Z' }),
      ]
    )
    expect(queue.map((e) => e.key)).toEqual(['user-7', 'application-10', 'user-8'])
  })

  // The two tabs disagreeing is the whole bug: Clients counted a pending trade
  // login the Applicants tab could not show.
  it('shows exactly what the Clients tab holds back as awaiting review', () => {
    const rows = [
      user({ id: 7 }),
      user({ id: 8, trade_approved: true }),
      user({ id: 9, role: 'customer' }),
    ]
    const { pendingCount } = partitionClients(rows)
    expect(buildReviewQueue([], rows).filter(isPendingEntry)).toHaveLength(pendingCount)
  })
})

describe('reviewState', () => {
  it('reads approval off the account, not the form', () => {
    expect(reviewState({ user: user({ trade_approved: true }) })).toEqual({ label: 'Approved', tone: 'sage' })
    expect(reviewState({ user: user() })).toEqual({ label: 'Pending review', tone: 'clay' })
    expect(reviewState({ user: user({ archived_at: 'x', trade_approved: true }) }).label).toBe('Account archived')
  })
})
