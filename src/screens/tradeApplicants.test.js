import { describe, it, expect } from 'vitest'
import { buildReviewQueue, entryActions, isPendingEntry, reviewState } from './tradeApplicants.js'
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

  it('leaves an approved form-less account out — it is a client, nobody is waiting on it', () => {
    const users = [
      user({ id: 2, trade_approved: true }),
      user({ id: 3, trade_approved: true, archived_at: '2026-08-01T00:00:00.000Z' }),
      user({ id: 4, role: 'customer' }),
    ]
    expect(buildReviewQueue([], users)).toEqual([])
  })

  // Declining archives the login. Dropping it here would repeat the bug this
  // screen exists to fix — the row vanishing from the tab it was decided on.
  it('keeps a DECLINED form-less account, so the decision can be seen and undone', () => {
    const declined = user({ id: 3, archived_at: '2026-08-01T00:00:00.000Z' })
    const queue = buildReviewQueue([], [declined])
    expect(queue).toHaveLength(1)
    expect(reviewState(queue[0])).toEqual({ label: 'Declined', tone: 'muted' })
    expect(entryActions(queue[0])).toMatchObject({ restore: true, approve: false })
    // …but it is not waiting on anybody, so it stays out of the pending view.
    expect(isPendingEntry(queue[0])).toBe(false)
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
    expect(reviewState({})).toEqual({ label: 'Account removed', tone: 'muted' })
  })

  // Archiving is the decline, but an account approved FIRST and archived later
  // was not declined — calling it that misreports a client the office retired.
  it('tells a decline apart from an approved account that was archived later', () => {
    expect(reviewState({ user: user({ archived_at: 'x' }) }).label).toBe('Declined')
    expect(reviewState({ user: user({ archived_at: 'x', trade_approved: true }) }).label).toBe(
      'Approved · archived'
    )
  })
})

describe('entryActions', () => {
  it('offers Approve and Decline on a pending application', () => {
    expect(entryActions({ user: user() })).toEqual({
      approve: true,
      decline: true,
      unapprove: false,
      restore: false,
    })
  })

  // Restore puts a decline back to pending; it must never approve by the back
  // door, so an archived row offers that one verb and nothing else.
  it('offers Restore alone on a declined application', () => {
    expect(entryActions({ user: user({ archived_at: 'x' }) })).toEqual({
      approve: false,
      decline: false,
      unapprove: false,
      restore: true,
    })
  })

  it('offers Unapprove alone once approved', () => {
    expect(entryActions({ user: user({ trade_approved: true }) })).toEqual({
      approve: false,
      decline: false,
      unapprove: true,
      restore: false,
    })
  })

  it('offers nothing when the account has been removed — there is no row to patch', () => {
    expect(entryActions({ user: null })).toEqual({
      approve: false,
      decline: false,
      unapprove: false,
      restore: false,
    })
    expect(entryActions()).toMatchObject({ approve: false, restore: false })
  })
})
