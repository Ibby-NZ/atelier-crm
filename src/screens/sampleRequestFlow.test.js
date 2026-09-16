import { describe, it, expect } from 'vitest'
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
  transitionPath,
} from './sampleRequestFlow.js'

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
