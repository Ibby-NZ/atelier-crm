import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader, AttributePill, SecondaryButton } from '../components/ui.jsx'
import { SectionTabs, clientsTabs } from '../components/sectionTabs.jsx'
import LegacyImportPanel from '../components/LegacyImportPanel.jsx'
import { apiFetch, ApiError } from '../lib/api.js'

// Clients — the real Atelier customer list, read live from atelier-api's
// Dynamics-365 staging window (GET /admin/legacy/accounts?is_customer=true).
// Read-only by design: Atelier still runs on D365, so this mirrors it rather than
// editing it (see the API's src/legacy/legacy-read.js). Searchable + paginated
// because there are ~800 accounts.
//
// It is the first tab of the Clients section; the two beside it (Trade accounts,
// Applicants) are the LIVE platform accounts. Same section, opposite posture —
// hence the strip, so the difference is visible rather than assumed.

const COLS = '1.8fr 0.9fr 1.2fr 1.2fr 0.9fr 0.9fr'
const LIMIT = 25
const hCell = { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.muted }
const cell = { fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function ClientsList() {
  const [term, setTerm] = useState('') // committed search term
  const [draft, setDraft] = useState('') // input value
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false) // import panel open?

  const load = useCallback(async () => {
    setStatus('loading')
    const params = new URLSearchParams({ is_customer: 'true', page: String(page), limit: String(LIMIT) })
    if (term.trim()) params.set('q', term.trim())
    try {
      const body = await apiFetch(`/admin/legacy/accounts?${params.toString()}`)
      setData({ items: body.items ?? [], total: body.meta?.total ?? 0 })
      setStatus('ready')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load clients.')
      setStatus('error')
    }
  }, [term, page])

  useEffect(() => { load() }, [load])

  const submitSearch = (e) => {
    e.preventDefault()
    setPage(1)
    setTerm(draft)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT))

  return (
    <>
      <PageHeader
        eyebrow="Trade Accounts · from Dynamics"
        title="Clients"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search name, account #, contact, email"
                style={{ height: 38, width: 300, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.paper, color: c.ink, fontFamily: font.ui, fontSize: 13, outline: 'none' }}
              />
              <button type="submit" className="ab-t" style={{ height: 38, padding: '0 16px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, color: c.ink, fontFamily: font.ui, fontSize: 13, cursor: 'pointer' }}>Search</button>
            </form>
            <SecondaryButton size="sm" onClick={() => setImporting((open) => !open)}>
              {importing ? 'Close import' : 'Import'}
            </SecondaryButton>
          </div>
        }
      />
      <SectionTabs tabs={clientsTabs} active="clients" />

      {/* Renders nothing for non-Directors — the API refuses them anyway. */}
      {importing && (
        <LegacyImportPanel
          entity="accounts"
          title="Import clients from Dynamics"
          fileHint="accounts.json.gz"
          onImported={load}
        />
      )}

      <div style={{ marginTop: 24, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '12px 20px', background: c.surfaceDeep, borderBottom: `1px solid ${c.line}` }}>
          <div style={hCell}>Account</div>
          <div style={hCell}>Type</div>
          <div style={hCell}>Contact</div>
          <div style={hCell}>Email</div>
          <div style={hCell}>City</div>
          <div style={hCell}>Owner</div>
        </div>

        {status === 'loading' && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>Loading clients…</div>
        )}
        {status === 'error' && (
          <div role="alert" style={{ padding: '18px 20px', fontSize: 12.5, color: c.clay }}>{error}</div>
        )}
        {status === 'ready' && data.items.length === 0 && (
          <div style={{ padding: '18px 20px', fontSize: 12.5, color: c.muted, fontStyle: 'italic', fontFamily: font.display }}>No clients match “{term}”.</div>
        )}

        {status === 'ready' && data.items.map((cl) => (
          <Link key={cl.guid} to={`/clients/${cl.guid}`} className="ab-rowhover ab-t" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.line}`, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.name}</span>
              {cl.atelier_account_number && (
                <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>{cl.atelier_account_number}</span>
              )}
            </div>
            <span style={cell}>{cl.customer_type || '—'}</span>
            <span style={cell}>{cl.primary_contact || '—'}</span>
            <span style={{ ...cell, fontFamily: font.mono, fontSize: 11.5 }}>{cl.primary_contact_email || cl.email || '—'}</span>
            <span style={cell}>{cl.address1_city || cl.province || '—'}</span>
            <span style={cell}>{cl.owner || '—'}</span>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: c.muted }}>
          {data.total} client{data.total === 1 ? '' : 's'} · <AttributePill style={{ fontSize: 9.5, padding: '2px 7px' }}>read-only from Dynamics</AttributePill>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="ab-t" style={{ height: 32, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, color: page <= 1 ? c.muted : c.ink, fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer' }}>Previous</button>
          <span style={{ fontSize: 12, color: c.muted, fontFamily: font.mono }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="ab-t" style={{ height: 32, padding: '0 12px', border: `1px solid ${c.line}`, borderRadius: 4, background: c.surface, color: page >= totalPages ? c.muted : c.ink, fontSize: 12, cursor: page >= totalPages ? 'default' : 'pointer' }}>Next</button>
        </span>
      </div>
    </>
  )
}
