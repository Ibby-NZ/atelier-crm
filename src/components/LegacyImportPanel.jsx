// Import panel for the Dynamics-365 export bundle — the no-shell, no-laptop way
// to load Atelier's real data into a deployed API.
//
// Sits collapsed behind an "Import" action on Clients and Orders. Director only,
// mirroring the API's guard: back office may browse the staging tables, only a
// Director may bulk-write them. Hiding it for everyone else is presentation, not
// enforcement — POST /admin/legacy/import/:entity is what actually refuses.

import { useRef, useState } from 'react'
import { c, font } from '../theme.js'
import { PrimaryButton, SecondaryButton } from './ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiFetch, ApiError } from '../lib/api.js'
import { readUpload, pushRecords } from '../lib/legacyImport.js'

// One request per batch, straight to the API. ApiError carries `status`, which
// pushRecords reads to decide retry vs surface.
const send = ({ entity, body, gzipped }) =>
  apiFetch(`/admin/legacy/import/${entity}`, {
    method: 'POST',
    headers: { 'Content-Type': gzipped ? 'application/gzip' : 'application/json' },
    body: gzipped ? body : JSON.stringify(body),
  })

const label = { fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.muted }
const note = { fontSize: 12, lineHeight: 1.6, color: c.inkSoft }

export default function LegacyImportPanel({ entity, title, fileHint, onImported }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [records, setRecords] = useState(null)
  const [progress, setProgress] = useState(null)
  const [status, setStatus] = useState('idle') // idle | reading | ready | sending | done | error
  const [message, setMessage] = useState('')

  if (user?.apiRole !== 'director') return null

  const reset = () => {
    setFile(null)
    setRecords(null)
    setProgress(null)
    setStatus('idle')
    setMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const choose = async (event) => {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    setFile(chosen)
    setStatus('reading')
    setMessage('')
    try {
      const parsed = await readUpload(chosen)
      setRecords(parsed)
      setStatus('ready')
    } catch (error) {
      setRecords(null)
      setStatus('error')
      setMessage(error.message)
    }
  }

  const run = async () => {
    setStatus('sending')
    setMessage('')
    try {
      const summary = await pushRecords({ entity, records, send, onProgress: setProgress })
      setStatus('done')
      setMessage(`${summary.records.toLocaleString('en-NZ')} records loaded in ${summary.batches} batches.`)
      onImported?.()
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof ApiError
          ? error.message
          : `${error.message} — the load is safe to run again; records already in are refreshed, not duplicated.`
      )
    }
  }

  const percent = progress ? Math.round((progress.sent / progress.total) * 100) : 0

  return (
    <div style={{ marginTop: 20, border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, padding: '18px 20px' }}>
      <div style={label}>{title}</div>
      <p style={{ ...note, margin: '8px 0 14px', maxWidth: 640 }}>
        Choose {fileHint} from the Dynamics export bundle. Loading the same file twice is
        safe — every record carries its Dynamics GUID, so a repeat refreshes the row
        instead of duplicating it.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.gz,application/json,application/gzip"
          onChange={choose}
          disabled={status === 'sending'}
          style={{ fontSize: 12.5, fontFamily: font.ui, color: c.inkSoft }}
        />
        {status === 'ready' && (
          <PrimaryButton onClick={run} size="sm">
            Load {records.length.toLocaleString('en-NZ')} records
          </PrimaryButton>
        )}
        {(status === 'done' || status === 'error') && (
          <SecondaryButton onClick={reset} size="sm">Choose another file</SecondaryButton>
        )}
      </div>

      {status === 'reading' && <p style={{ ...note, marginTop: 12 }}>Reading {file?.name}…</p>}

      {status === 'sending' && (
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 4, background: c.line, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${percent}%`, background: c.brass, transition: 'width 120ms linear' }} />
          </div>
          <p style={{ ...note, marginTop: 8, fontFamily: font.mono, fontSize: 11.5 }}>
            batch {progress?.batch ?? 0} of {progress?.batches ?? '…'} · {(progress?.sent ?? 0).toLocaleString('en-NZ')} of{' '}
            {(progress?.total ?? records?.length ?? 0).toLocaleString('en-NZ')} records
          </p>
        </div>
      )}

      {status === 'done' && (
        <p role="status" style={{ ...note, marginTop: 12, color: c.sage }}>{message}</p>
      )}
      {status === 'error' && (
        <p role="alert" style={{ ...note, marginTop: 12, color: c.clay }}>{message}</p>
      )}
    </div>
  )
}
