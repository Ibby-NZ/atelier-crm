// New reserve / cutting docket — LIVE, wired to atelier-api's POST /admin/reserves.
//
// The shape is the office's own wish, verbatim: "instead of product first — we
// should put accounts first — then enter the reserve/cutting in each line so
// we don't have to create a new form all the time." One docket = one account's
// visit to this form; a hundred cuttings for a launch is one docket with lines,
// each line ONE colour, identical copies said once with the Copies multiplier.
//
//   GET  /admin/users?segment=clients&q=          → { users }  the account picker
//   GET  /admin/legacy/accounts?is_customer=true  → { items }  the Dynamics one
//   GET  /admin/price-list-items?q=&limit=        → { items }  the product lookup
//   POST /admin/reserves                          → { reserve } (201)
//
// Picking a price-list hit fills Range and Supplier the way the old D365 form
// did on save — but as a SNAPSHOT the office can still overtype, plus the
// pointer the API keeps while the rate row lives. Free-typing a line the price
// list has never heard of stays legal (ATELIER STOCK rows have no supplier at
// all in the current book).
//
// Layout only: the attribution rule, line validation and body assembly live in
// ./reserveFlow.js, tested beside it. The client pickers reuse
// ./adminOrderNew.js's label/reference helpers rather than respelling them.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { c } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery } from '../admin/list.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import { clientLabel, legacyContactFrom, legacyLabel, legacyReference } from './adminOrderNew.js'
import {
  ACCOUNT_MODES,
  CFA_VALUES,
  LINE_KINDS,
  NEW_DOCKET,
  NEW_LINE,
  RESERVES_PATH,
  buildReserveBody,
  cfaLabel,
  kindLabel,
  lineFromPriceHit,
} from './reserveFlow.js'

const CLIENT_SEARCH_LIMIT = 8
const PRODUCT_SEARCH_LIMIT = 8

export default function AdminReserveNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen — a lone useMutation is the kit's shape for a form
  // that only writes.
  const { busy, error, setError, run } = useMutation({ flash })

  const [draft, setDraft] = useState(NEW_DOCKET)
  const [lines, setLines] = useState([])
  const [clientTerm, setClientTerm] = useState('')
  const [clientHits, setClientHits] = useState(null)
  const [productTerm, setProductTerm] = useState('')
  const [productHits, setProductHits] = useState(null)
  const [searching, setSearching] = useState(false)

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const setLine = (index, patch) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const searchClients = async (event) => {
    event?.preventDefault()
    setError('')
    setSearching(true)
    try {
      if (draft.mode === 'legacy') {
        const query = buildListQuery({ is_customer: true, q: clientTerm, limit: CLIENT_SEARCH_LIMIT })
        const body = await apiFetch(`/admin/legacy/accounts?${query}`)
        setClientHits(body.items ?? [])
      } else {
        const query = buildListQuery({ segment: 'clients', q: clientTerm, limit: CLIENT_SEARCH_LIMIT })
        const body = await apiFetch(`/admin/users?${query}`)
        setClientHits(body.users ?? [])
      }
    } catch (err) {
      setError(messageOf(err, 'Could not search clients.'))
    } finally {
      setSearching(false)
    }
  }

  // The product lookup is the price list — the same source the old form read,
  // so picking a hit is what fills Range and Supplier.
  const searchProducts = async (event) => {
    event?.preventDefault()
    setError('')
    setSearching(true)
    try {
      const query = buildListQuery({ q: productTerm, limit: PRODUCT_SEARCH_LIMIT })
      const body = await apiFetch(`/admin/price-list-items?${query}`)
      setProductHits(body.items ?? [])
    } catch (err) {
      setError(messageOf(err, 'Could not search the price list.'))
    } finally {
      setSearching(false)
    }
  }

  const addFromHit = (hit, kind) => {
    setLines((current) => [...current, lineFromPriceHit(hit, kind)])
  }

  const pickLegacyAccount = (account) => {
    set({
      legacy: {
        guid: account.guid,
        name: account.name,
        atelier_account_number: account.atelier_account_number,
        primary_contact: account.primary_contact,
        address1_city: account.address1_city,
      },
      contact_name: legacyContactFrom(account).name ?? '',
    })
    setClientHits(null)
    setClientTerm('')
  }

  const submit = async () => {
    const built = buildReserveBody(draft, lines, { legacyReference })
    if (!built.ok) {
      setError(built.error)
      return
    }
    const created = await run(
      () => apiSend('POST', RESERVES_PATH, built.body),
      (res) => `Docket #${res.reserve.id} raised for ${res.reserve.account_name}.`
    )
    if (created) navigate('/admin/reserves')
  }

  const searchForm = (
    <form onSubmit={searchClients} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <input
        value={clientTerm}
        onChange={(e) => setClientTerm(e.target.value)}
        placeholder={draft.mode === 'legacy' ? 'Name, account #, contact or email' : 'Name or email'}
        aria-label="Search clients"
        style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
      />
      <GhostButton type="submit" disabled={busy || searching}>
        Find client
      </GhostButton>
    </form>
  )

  const lineInput = (index, line, key, label, width = 120, mono = false) => (
    <Field label={label}>
      <input
        value={line[key] ?? ''}
        onChange={(e) => setLine(index, { [key]: e.target.value })}
        aria-label={`${label} line ${index + 1}`}
        style={{ ...inputStyle, height: 32, fontSize: 12.5, width, ...(mono ? monoText : {}) }}
      />
    </Field>
  )

  return (
    <div>
      <PageHeader
        eyebrow="Stock · live"
        title={<>New reserve / cutting docket</>}
        subtitle="Account first, then every reserve and cutting on one docket. One colour per line; say identical cuttings once with the Copies count."
        right={<GhostButton onClick={() => navigate(RESERVES_PATH)}>Back to reserves</GhostButton>}
      />
      <SectionTabs tabs={stockTabs} active="live" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead label="Who it is for" />
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCOUNT_MODES.map((mode) => (
                <GhostButton
                  key={mode.key}
                  tone={draft.mode === mode.key ? 'accent' : 'ink'}
                  disabled={busy}
                  onClick={() => {
                    set({ mode: mode.key })
                    setError('')
                    setClientHits(null)
                    setClientTerm('')
                  }}
                >
                  {mode.label}
                </GhostButton>
              ))}
            </div>

            {draft.mode === 'legacy' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {draft.legacy != null && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: c.ink }}>{legacyLabel(draft.legacy)}</span>
                    <GhostButton disabled={busy} onClick={() => set({ legacy: null, contact_name: '' })}>
                      Change
                    </GhostButton>
                  </div>
                )}
                {draft.legacy == null && (
                  <>
                    {searchForm}
                    {clientHits !== null && clientHits.length === 0 && (
                      <PanelNote>No Dynamics client matches that. Search on name, account number, contact or email.</PanelNote>
                    )}
                    {clientHits !== null && clientHits.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {clientHits.map((account) => (
                          <div key={account.guid} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: c.ink, flex: 1 }}>{legacyLabel(account)}</span>
                            <GhostButton tone="accent" disabled={busy} onClick={() => pickLegacyAccount(account)}>
                              Use this client
                            </GhostButton>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {draft.mode === 'account' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {draft.user_id != null && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: c.ink }}>{draft.user_label}</span>
                    <GhostButton disabled={busy} onClick={() => set({ user_id: null, user_label: '' })}>
                      Change
                    </GhostButton>
                  </div>
                )}
                {draft.user_id == null && (
                  <>
                    {searchForm}
                    {clientHits !== null && clientHits.length === 0 && (
                      <PanelNote>No account matches that. Try the Dynamics client roster, or type the name.</PanelNote>
                    )}
                    {clientHits !== null && clientHits.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {clientHits.map((user) => (
                          <div key={user.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: c.ink, flex: 1 }}>{clientLabel(user)}</span>
                            <GhostButton
                              tone="accent"
                              disabled={busy}
                              onClick={() => set({ user_id: user.id, user_label: clientLabel(user) })}
                            >
                              Use this client
                            </GhostButton>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {draft.mode === 'manual' && (
              <Field label="Account name">
                <input
                  value={draft.account_name}
                  onChange={(e) => set({ account_name: e.target.value })}
                  placeholder="Who the docket is for"
                  aria-label="Account name"
                  style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
                />
              </Field>
            )}

            <Field
              label="Contact"
              hint="Optional. The account matters more than the contact — name one when the account has twenty consultants."
            >
              <input
                value={draft.contact_name}
                onChange={(e) => set({ contact_name: e.target.value })}
                aria-label="Contact name"
                style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
              />
            </Field>
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Lines" />
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <form onSubmit={searchProducts} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={productTerm}
                onChange={(e) => setProductTerm(e.target.value)}
                placeholder="Search the price list — design, code or house"
                aria-label="Search price list"
                style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 300 }}
              />
              <GhostButton type="submit" disabled={busy || searching}>
                Find product
              </GhostButton>
              <GhostButton
                disabled={busy}
                onClick={() => setLines((current) => [...current, { ...NEW_LINE }])}
              >
                Add blank line
              </GhostButton>
            </form>

            {productHits !== null && productHits.length === 0 && (
              <PanelNote>
                Nothing in the price list matches that. Add a blank line and type the product —
                Atelier&apos;s own stock has no supplier row at all.
              </PanelNote>
            )}
            {productHits !== null && productHits.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {productHits.map((hit) => (
                  <div key={hit.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: c.ink, flex: 1 }}>
                      {hit.description || hit.code}
                      <span style={{ ...mutedText, marginLeft: 8, fontSize: 11.5 }}>
                        {[hit.product_range, hit.supplier].filter(Boolean).join(' · ')}
                      </span>
                      <span style={{ ...monoText, marginLeft: 8 }}>{hit.code}</span>
                    </span>
                    <GhostButton tone="accent" disabled={busy} onClick={() => addFromHit(hit, 'reserve')}>
                      + Reserve
                    </GhostButton>
                    <GhostButton disabled={busy} onClick={() => addFromHit(hit, 'cutting')}>
                      + Cutting
                    </GhostButton>
                  </div>
                ))}
              </div>
            )}

            {lines.length === 0 && (
              <PanelNote>No lines yet. Search the price list above, or add a blank line.</PanelNote>
            )}

            {lines.map((line, index) => (
              <div
                key={index}
                style={{ padding: 14, background: c.surfaceDeep, borderRadius: 8, display: 'grid', gap: 10 }}
              >
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label="Kind">
                    <select
                      value={line.kind}
                      onChange={(e) => setLine(index, { kind: e.target.value })}
                      aria-label={`Kind line ${index + 1}`}
                      style={{ ...inputStyle, height: 32, fontSize: 12.5 }}
                    >
                      {LINE_KINDS.map((value) => (
                        <option key={value} value={value}>
                          {kindLabel(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {lineInput(index, line, 'product_name', 'Design', 170)}
                  {lineInput(index, line, 'range_name', 'Range', 140)}
                  {lineInput(index, line, 'supplier', 'Supplier', 140)}
                  {lineInput(index, line, 'product_code', 'Code', 100, true)}
                  {lineInput(index, line, 'colour', 'Colour', 130)}
                  {lineInput(index, line, 'qty', 'Qty (m)', 70)}
                  {lineInput(index, line, 'multiplier', 'Copies', 60)}
                  {lineInput(index, line, 'customer_reference', 'Customer ref', 110)}
                  {line.kind === 'reserve' && (
                    <Field label="CFA">
                      <select
                        value={line.cfa ?? ''}
                        onChange={(e) => setLine(index, { cfa: e.target.value })}
                        aria-label={`CFA line ${index + 1}`}
                        style={{ ...inputStyle, height: 32, fontSize: 12.5 }}
                      >
                        <option value="">—</option>
                        {CFA_VALUES.map((value) => (
                          <option key={value} value={value}>
                            {cfaLabel(value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {lineInput(index, line, 'comment', 'Comment', 200)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <GhostButton
                    disabled={busy}
                    onClick={() =>
                      setLines((current) => [
                        ...current.slice(0, index + 1),
                        { ...line, colour: '' },
                        ...current.slice(index + 1),
                      ])
                    }
                  >
                    Duplicate — next colour
                  </GhostButton>
                  <GhostButton
                    tone="danger"
                    disabled={busy}
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </GhostButton>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Notes" />
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            <textarea
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              placeholder="Anything the warehouse or the house needs to know about this docket."
              aria-label="Docket notes"
              style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
            />
            <div style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
              Every line starts as <strong>requested</strong>. When the house replies, type the
              reserve number and hold date onto the line from the reserves list — and mark lines
              arrived and dispatched there, so nobody has to read the notes to know.
            </div>
          </div>
        </section>

        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', gap: 10 }}>
          <GhostButton tone="accent" disabled={busy} onClick={submit}>
            {busy ? 'Raising…' : 'Raise docket'}
          </GhostButton>
        </div>
      </div>

      <ToastLine message={toast} />
    </div>
  )
}
