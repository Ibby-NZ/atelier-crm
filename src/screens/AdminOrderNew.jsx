// New sales order — the live one, wired to atelier-api's POST /admin/orders.
//
// This is the counterpart to pricing a web request in place: a client rings up,
// walks in, or sends a bespoke enquiry, and the office keys the order itself. It
// lands in the same queue as a storefront request (status `requested`, holding a
// reservation) and drives the same lifecycle from there — what differs is that
// it carries prices from the first minute and names its own client.
//
//   GET  /admin/users?segment=clients&q=          → { users }  the account picker
//   GET  /admin/legacy/accounts?is_customer=true  → { items }  the Dynamics one
//   POST /admin/orders                            → { order }  (201)
//
// Two pickers because there are two client rosters and most of Atelier's trade
// is only in the second: `users` is the platform login roster (the Clients tab),
// while the ~800 accounts the business actually runs on are in the Dynamics
// mirror and have no login at all. Picking one fills the same contact details a
// walk-in is keyed with — the API takes `user_id` or a contact, and a mirror row
// is neither a login nor a stranger — plus the reference line that says which
// Dynamics client it was.
//
// Not to be confused with /sales-orders/new, which is the demo screen writing to
// localStorage. Live writable screens live under /admin — see App.jsx.
//
// Layout only: the attribution rule is ./adminOrderNew.js and the line model is
// ../admin/orderFlow.js, both pure and both unit-tested.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { c } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend, safeFetch } from '../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { staffOptions } from './adminOrders.js'
import { buildListQuery } from '../admin/list.js'
import OrderLinesEditor from '../admin/OrderLinesEditor.jsx'
import {
  Select,
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  ToastLine,
  inputStyle,
  messageOf,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'
import {
  CLIENT_MODES,
  NEW_ORDER,
  buildOrderBody,
  clientLabel,
  legacyContactFrom,
  legacyLabel,
  legacyReference,
} from './adminOrderNew.js'

const CLIENT_SEARCH_LIMIT = 8

export default function AdminOrderNew() {
  const navigate = useNavigate()
  const { message: toast, flash } = useToast()
  // No list on this screen, so no useCrudScreen: a lone useMutation is the kit's
  // shape for a form that only writes.
  const { busy, error, setError, run } = useMutation({ flash })

  const [draft, setDraft] = useState(NEW_ORDER)
  const [lines, setLines] = useState([])

  // The Sales rep select (A6 groundwork), defaulting to whoever is signed in —
  // the office keys most orders for themselves, and a default is what keeps the
  // report from being all-Unassigned. Clearable: keying for a colleague or for
  // nobody are both real answers.
  const { user } = useAuth()
  const [staff, setStaff] = useState([])
  useEffect(() => {
    let active = true
    safeFetch('/admin/users?segment=staff&limit=100').then(({ data }) => {
      if (!active || !data) return
      const options = staffOptions(data.users ?? [])
      setStaff(options)
      const selfId = Number(user?.id)
      if (options.some((option) => option.id === selfId)) {
        setDraft((d) => (d.sales_rep_user_id == null ? { ...d, sales_rep_user_id: selfId } : d))
      }
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [clientTerm, setClientTerm] = useState('')
  const [clientHits, setClientHits] = useState(null)
  const [searching, setSearching] = useState(false)

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  // One search box, because only one picker is ever on screen: switching mode
  // clears it, so a Dynamics result can never be left showing over the account
  // roster (or picked into it — the two rosters have different id columns).
  const searchClients = async (event) => {
    event?.preventDefault()
    setError('')
    setSearching(true)
    try {
      if (draft.mode === 'legacy') {
        const query = buildListQuery({
          is_customer: true,
          q: clientTerm,
          limit: CLIENT_SEARCH_LIMIT,
        })
        const body = await apiFetch(`/admin/legacy/accounts?${query}`)
        setClientHits(body.items ?? [])
      } else {
        const query = buildListQuery({
          segment: 'clients',
          q: clientTerm,
          limit: CLIENT_SEARCH_LIMIT,
        })
        const body = await apiFetch(`/admin/users?${query}`)
        setClientHits(body.users ?? [])
      }
    } catch (err) {
      setError(messageOf(err, 'Could not search clients.'))
    } finally {
      setSearching(false)
    }
  }

  // A Dynamics account has no login, so it is picked into the contact fields —
  // left editable, because the mirror is a snapshot and a phone number taken
  // down today beats one exported months ago.
  const pickLegacyAccount = (account) => {
    set({
      legacy: {
        guid: account.guid,
        name: account.name,
        atelier_account_number: account.atelier_account_number,
        primary_contact: account.primary_contact,
        address1_city: account.address1_city,
      },
      ...legacyContactFrom(account),
    })
    setClientHits(null)
    setClientTerm('')
  }

  const searchForm = (
    <form onSubmit={searchClients} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <input
        value={clientTerm}
        onChange={(e) => setClientTerm(e.target.value)}
        placeholder={
          draft.mode === 'legacy' ? 'Name, account #, contact or email' : 'Name or email'
        }
        aria-label="Search clients"
        style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 280 }}
      />
      <GhostButton type="submit" disabled={busy || searching}>
        Find client
      </GhostButton>
    </form>
  )

  const contactFields = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <input
        value={draft.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="Name"
        aria-label="Client name"
        style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 220 }}
      />
      <input
        value={draft.email}
        onChange={(e) => set({ email: e.target.value })}
        placeholder="Email"
        aria-label="Client email"
        style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 240 }}
      />
      <input
        value={draft.phone}
        onChange={(e) => set({ phone: e.target.value })}
        placeholder="Phone"
        aria-label="Client phone"
        style={{ ...inputStyle, height: 34, fontSize: 12.5, width: 160 }}
      />
    </div>
  )

  const submit = async () => {
    const built = buildOrderBody(draft, lines)
    if (!built.ok) {
      setError(built.error)
      return
    }
    const created = await run(
      () => apiSend('POST', '/admin/orders', built.body),
      (res) => `${res.order.order_number} raised.`
    )
    // The queue is where the order is worked from here on; landing back on this
    // form would read as "it did not save".
    if (created) navigate('/admin/orders')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orders · live"
        title={<>New sales order</>}
        subtitle="An order the office raises itself — a phone call, a walk-in, a bespoke enquiry. It joins the web queue and is confirmed, invoiced and shipped there."
        right={<GhostButton onClick={() => navigate('/admin/orders')}>Back to orders</GhostButton>}
      />
      <SectionTabs tabs={ordersTabs} active="sales" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead label="Who it is for" />
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {CLIENT_MODES.map((mode) => (
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

            {draft.mode === 'account' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {draft.user_id != null && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: c.ink }}>{draft.user_label}</span>
                    <GhostButton
                      disabled={busy}
                      onClick={() => set({ user_id: null, user_label: '' })}
                    >
                      Change
                    </GhostButton>
                  </div>
                )}
                {draft.user_id == null && (
                  <>
                    {searchForm}
                    {clientHits !== null && clientHits.length === 0 && (
                      <PanelNote>
                        No account matches that. Try the Dynamics client mirror, add one on the
                        Clients screen, or record this as a walk-in.
                      </PanelNote>
                    )}
                    {clientHits !== null && clientHits.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {clientHits.map((user) => (
                          <div
                            key={user.id}
                            style={{ display: 'flex', gap: 12, alignItems: 'center' }}
                          >
                            <span style={{ fontSize: 13, color: c.ink, flex: 1 }}>
                              {clientLabel(user)}
                            </span>
                            <GhostButton
                              tone="accent"
                              disabled={busy}
                              onClick={() =>
                                set({ user_id: user.id, user_label: clientLabel(user) })
                              }
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

            {draft.mode === 'legacy' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {draft.legacy != null && (
                  <>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: c.ink }}>{legacyLabel(draft.legacy)}</span>
                      <GhostButton
                        disabled={busy}
                        onClick={() => set({ legacy: null, name: '', email: '', phone: '' })}
                      >
                        Change
                      </GhostButton>
                    </div>
                    {contactFields}
                    <PanelNote>
                      Recorded on the order as “{legacyReference(draft.legacy)}”. The details above
                      go on the order itself, so correct them here if the mirror is out of date.
                    </PanelNote>
                  </>
                )}
                {draft.legacy == null && (
                  <>
                    {searchForm}
                    {clientHits !== null && clientHits.length === 0 && (
                      <PanelNote>
                        No Dynamics client matches that. Search on name, account number, contact or
                        email.
                      </PanelNote>
                    )}
                    {clientHits !== null && clientHits.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {clientHits.map((account) => (
                          <div
                            key={account.guid}
                            style={{ display: 'flex', gap: 12, alignItems: 'center' }}
                          >
                            <span style={{ fontSize: 13, color: c.ink, flex: 1 }}>
                              {legacyLabel(account)}
                            </span>
                            <GhostButton
                              tone="accent"
                              disabled={busy}
                              onClick={() => pickLegacyAccount(account)}
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

            {draft.mode === 'walk_in' && contactFields}
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Lines" />
          <div style={{ padding: 20 }}>
            <OrderLinesEditor
              lines={lines}
              onChange={setLines}
              busy={busy}
              onError={setError}
            />
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Notes" />
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            <Field label="Sales rep">
              <Select
                value={draft.sales_rep_user_id ?? ''}
                disabled={busy}
                onChange={(e) =>
                  set({ sales_rep_user_id: e.target.value === '' ? null : Number(e.target.value) })
                }
                style={{ width: 'auto' }}
              >
                <option value="">Unassigned</option>
                {staff.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <textarea
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              placeholder="Anything the back office needs to know about this order."
              aria-label="Order notes"
              style={{ ...inputStyle, height: 'auto', padding: 10, fontSize: 13 }}
            />
            <div style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
              The order is raised as <strong>requested</strong> and holds its stock straight away.
              Confirm it in the queue once the invoice is out.
            </div>
          </div>
        </section>

        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', gap: 10 }}>
          <GhostButton tone="accent" disabled={busy} onClick={submit}>
            {busy ? 'Raising…' : 'Raise sales order'}
          </GhostButton>
        </div>
      </div>

      <ToastLine message={toast} />
    </div>
  )
}
