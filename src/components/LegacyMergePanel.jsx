// Promote the Dynamics archive onto the live book — the no-shell way to run
// `npm run merge:legacy` on a deployed API.
//
// Sits collapsed behind a "Promote to live" action on the Archive, beside the
// import panel it follows: load the bundle, then promote it. Director only,
// mirroring the API's guard on POST /admin/legacy/merge (hiding it for everyone
// else is presentation; the API is what refuses). The words — what moves, what
// stays, the summary lines — live in ../lib/legacyMerge.js, tested; this file
// is layout.

import { useState } from 'react'
import { c, font } from '../theme.js'
import { PrimaryButton, SecondaryButton } from './ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiSend, ApiError } from '../lib/api.js'
import { MOVES, STAYS, mergedNothing, runMerge, summariseMerge } from '../lib/legacyMerge.js'

const label = { fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }
const note = { fontSize: 12, lineHeight: 1.6, color: c.inkSoft }
const list = { margin: '6px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: c.inkSoft }

const send = (path, body) => apiSend('POST', path, body)

export default function LegacyMergePanel({ onMerged }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [lines, setLines] = useState([])
  const [message, setMessage] = useState('')

  if (user?.apiRole !== 'director') return null

  const run = async () => {
    setStatus('running')
    setMessage('')
    setLines([])
    try {
      const summary = await runMerge({ send })
      setLines(summariseMerge(summary))
      setMessage(
        mergedNothing(summary)
          ? 'Nothing to promote: the archive holds no client, contact, reserve or stock item that is not already on the live book.'
          : 'Promoted. Clients, Contacts, Reserves and Stock now carry what the archive holds.'
      )
      setStatus('done')
      onMerged?.()
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof ApiError
          ? error.message
          : `${error.message} — nothing is half-written; once the cause is fixed this is safe to run again.`
      )
    }
  }

  return (
    <div style={{ marginTop: 20, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '18px 20px' }}>
      <div style={label}>Promote the archive onto the live book</div>
      <p style={{ ...note, margin: '8px 0 0', maxWidth: 680 }}>
        The archive is what Dynamics said. The working sections — Clients, Contacts, Reserves, Stock —
        read the live tables, which this fills from it. Safe to run again: every row it writes remembers
        the Dynamics record it came from, so a repeat refreshes rather than duplicates.
      </p>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 10 }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ ...label, fontSize: 10 }}>Moves</div>
          <ul style={list}>{MOVES.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ ...label, fontSize: 10 }}>Stays in the archive</div>
          <ul style={list}>{STAYS.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        {status !== 'done' && (
          <PrimaryButton onClick={run} size="sm" disabled={status === 'running'}>
            {status === 'running' ? 'Promoting…' : status === 'error' ? 'Try again' : 'Promote to live'}
          </PrimaryButton>
        )}
        {status === 'done' && <SecondaryButton onClick={run} size="sm">Run again</SecondaryButton>}
        {status === 'running' && <span style={{ ...note, fontFamily: font.mono, fontSize: 11.5 }}>Usually a few seconds; longer the first time the stock items land.</span>}
      </div>

      {status === 'done' && (
        <div role="status" style={{ marginTop: 12 }}>
          <p style={{ ...note, margin: 0, color: c.sage }}>{message}</p>
          <ul style={{ ...list, fontFamily: font.mono, fontSize: 11.5 }}>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      {status === 'error' && (
        <p role="alert" style={{ ...note, marginTop: 12, color: c.clay }}>{message}</p>
      )}
    </div>
  )
}
