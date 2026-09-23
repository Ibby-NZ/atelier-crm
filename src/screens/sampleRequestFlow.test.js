import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ALLOWED_TRANSITIONS,
  SAMPLE_REQUEST_STATUSES,
  availableMoves,
  describeSampleRequest,
  isDeletableStatus,
  lineCountLabel,
  linesSummary,
  movedLine,
  requesterLabel,
  sampleRequestFilters,
  archiveInsteadPath,
  archiveTogglePath,
  sampleRequestPath,
  sampleRequestRoute,
  transitionPath,
} from './sampleRequestFlow.js'

// The queue (AdminSampleRequests.jsx) and one request's own page
// (AdminSampleRequest.jsx, since 23 Sep 2026). No jsdom here, so the source is
// the assertable surface for what each draws.
const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const LIST_SOURCE = read('AdminSampleRequests.jsx')
const PAGE_SOURCE = read('AdminSampleRequest.jsx')

// A literal second copy of the API's machine (atelier-api
// src/samples/sample-request-states.js), so a hand-edit here cannot drift silently.
const API_TRANSITIONS = {
  pending: ['sent', 'declined'],
  sent: [],
  declined: [],
}

describe('the mirrored machine', () => {
  it('matches the API transition map exactly', () => {
    expect(ALLOWED_TRANSITIONS).toEqual(API_TRANSITIONS)
    expect(SAMPLE_REQUEST_STATUSES).toEqual(['pending', 'sent', 'declined'])
  })

  it('offers a pending request Mark sent and Decline, and a terminal row nothing', () => {
    expect(availableMoves({ status: 'pending' }).map((m) => [m.key, m.label, m.tone])).toEqual([
      ['sent', 'Mark sent', 'accent'],
      ['declined', 'Decline', 'danger'],
    ])
    expect(availableMoves({ status: 'sent' })).toEqual([])
    expect(availableMoves({ status: 'pending', archived_at: '2026-09-16T00:00:00Z' })).toEqual([])
    expect(availableMoves(null)).toEqual([])
  })

  it('deletes only pending and declined', () => {
    expect(isDeletableStatus('pending')).toBe(true)
    expect(isDeletableStatus('declined')).toBe(true)
    expect(isDeletableStatus('sent')).toBe(false)
  })
})

describe('paths', () => {
  it('addresses the row by id and archives on a refusal, never toggles', () => {
    expect(transitionPath({ id: 4 })).toBe('/admin/sample-requests/4/transition')
    expect(archiveTogglePath({ id: 4 })).toBe('/admin/sample-requests/4/archive')
    expect(archiveTogglePath({ id: 4, archived_at: 'x' })).toBe('/admin/sample-requests/4/restore')
    expect(archiveInsteadPath({ id: 4, archived_at: 'x' })).toBe('/admin/sample-requests/4/archive')
  })

  it('names the page link apart from the API path, though the strings agree today', () => {
    // A link is not a fetch: two names so that moving one can never silently
    // retarget the other.
    expect(sampleRequestPath(4)).toBe('/admin/sample-requests/4')
    expect(sampleRequestRoute(4)).toBe('/admin/sample-requests/4')
  })
})

describe('one request opens on its own page (23 Sep 2026)', () => {
  // The client: every kind of data entry opens "in their own individual page
  // instead of a tabbed drop down". Who asked, their note and the cuttings
  // used to open inside the queue's row.
  it('links every row to its page and keeps nothing expanded inside the queue', () => {
    expect(LIST_SOURCE).toContain('to={sampleRequestRoute(row.id)}')
    expect(LIST_SOURCE).not.toContain('openId')
    expect(LIST_SOURCE).not.toContain('Who asked')
  })

  it('reads the one detail, and a 404 is a "not found" page', () => {
    expect(PAGE_SOURCE).toContain('apiFetch(sampleRequestPath(id))')
    expect(PAGE_SOURCE).toContain('useMutation({ reload: load, flash })')
    expect(PAGE_SOURCE).toContain("err?.status === 404 ? 'missing' : 'error'")
    expect(PAGE_SOURCE).toContain('<NotFound')
  })

  it('draws the moves from the mirrored machine on the page and on the row', () => {
    // A move is the transition endpoint, never a status PATCH, and the buttons
    // come from availableMoves on both surfaces, so a locked door is never drawn.
    expect(PAGE_SOURCE).toContain('availableMoves(request)')
    expect(PAGE_SOURCE).toContain("apiSend('POST', transitionPath(request), { status: target.key })")
    expect(LIST_SOURCE).toContain('availableMoves(row)')
    expect(LIST_SOURCE).toContain("apiSend('POST', transitionPath(row), { status: target.key })")
  })

  it('keeps delete on the queue, through the kit, greyed outside pending/declined', () => {
    expect(LIST_SOURCE).toContain('<ConfirmDialog {...remove.dialog} />')
    expect(LIST_SOURCE).toContain('disabled={busy || !isDeletableStatus(row.status)}')
    expect(PAGE_SOURCE).not.toContain('remove.ask')
  })
})

describe('filters and labels', () => {
  it('passes an unset filter as null, never the empty string', () => {
    expect(sampleRequestFilters({ term: ' ', status: '', showArchived: false })).toEqual({
      q: null,
      status: null,
      include_archived: null,
    })
    expect(sampleRequestFilters({ term: 'SR-1', status: 'pending', showArchived: true })).toEqual({
      q: 'SR-1',
      status: 'pending',
      include_archived: 'true',
    })
  })

  it('names the requester by account, then contact, then email', () => {
    expect(requesterLabel({ account_name: 'Studio', contact_name: 'Sam', contact_email: 's@x' })).toBe('Studio')
    expect(requesterLabel({ contact_name: 'Sam', contact_email: 's@x' })).toBe('Sam')
    expect(requesterLabel({ contact_email: 's@x' })).toBe('s@x')
  })

  it('summarises the lines and dates the last move off the API stamps', () => {
    const row = {
      status: 'sent',
      sent_at: '2026-09-16T03:00:00.000Z',
      created_at: '2026-09-15T03:00:00.000Z',
      lines: [
        { product_name: 'Atlas', colourway_name: 'Flax', sku: 'A' },
        { sku: 'B' },
        { product_name: 'C' },
        { product_name: 'D' },
      ],
    }
    expect(linesSummary(row)).toBe('Atlas — Flax · B · C +1 more')
    expect(lineCountLabel(row)).toBe('4 cuttings')
    expect(lineCountLabel({ lines: [{}] })).toBe('1 cutting')
    expect(movedLine(row)).toBe('Sent 2026-09-16')
    expect(movedLine({ status: 'pending', created_at: '2026-09-15T03:00:00.000Z' })).toBe('Received 2026-09-15')
    expect(describeSampleRequest({ request_number: 'SR-1' })).toBe('SR-1')
  })
})
