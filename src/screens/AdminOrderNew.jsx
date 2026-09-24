// New sales order — the live one, wired to atelier-api's POST /admin/orders.
//
// This is the counterpart to pricing a web request in place: a client rings up,
// walks in, or sends a bespoke enquiry, and the office keys the order itself. It
// lands in the same queue as a storefront request (status `requested`, holding a
// reservation) and drives the same lifecycle from there — what differs is that
// it carries prices from the first minute and names its own client.
//
//   GET  /admin/trade-accounts?q=   → { trade_accounts }  the client roster
//   POST /admin/trade-accounts      → { trade_account }   a client raised here
//   POST /admin/orders              → { order }           (201)
//
// ONE finder, over the roster the office actually trades with. The form used to
// ask which ROSTER the client came from — Account client / Dynamics client /
// Walk-in — before it asked who they were; since the cutover merge
// `trade_accounts` IS the client list (860 companies, 835 with an address), the
// Dynamics mirror is the Archive, and a client nobody has a record of is one
// this form adds to the roster and then has a record of.
//
// The delivery address is never typed here: it comes off the client's own
// record and rides on the order, so the packing slip has somewhere to ship to
// without the order desk copying an address it already holds.
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
  NEW_CLIENT,
  NEW_ORDER,
  buildClientBody,
  buildOrderBody,
  clientFrom,
  clientLine,
  clientReference,
  basisFor,
} from './adminOrderNew.js'
import { PRICE_TYPE_OPTIONS, repriceDrafts } from '../admin/orderFlow.js'

const CLIENT_SEARCH_LIMIT = 8

const box = (width) => ({ ...inputStyle, height: 34, fontSize: 12.5, width })

// The add-a-client form, in the order the office takes the details down.
const CLIENT_FIELDS = [
  { key: 'company_name', label: 'Company name', width: 240 },
  { key: 'primary_contact_name', label: 'Contact name', width: 200 },
  { key: 'email', label: 'Email', width: 240 },
  { key: 'phone', label: 'Phone', width: 160 },
  { key: 'address', label: 'Delivery address', width: 260 },
  { key: 'city', label: 'City', width: 160 },
  { key: 'country', label: 'Country', width: 160 },
]

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
  // The add-a-client form, open or not. Null is closed — the same "null is no
  // form, {} is an open one" shape the lines editor's new-design form uses.
  const [clientDraft, setClientDraft] = useState(null)

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  // Moving the price list re-prices every line still on its catalogue price;
  // a price somebody typed over stays (repriceDrafts).
  const setPriceType = (next) => {
    setLines((current) => repriceDrafts(current, draft.price_type, next))
    set({ price_type: next })
  }
  // A picked client decides the price list: Retail clients retail, the rest
  // trade (basisFor).
  const pickClient = (client) => {
    setPriceType(basisFor(client))
    set({ client })
  }

  const clearSearch = () => {
    setClientHits(null)
    setClientTerm('')
  }

  // Finding and adding are two answers to the same question, so opening one
  // closes the other: results left up behind the form read as clients the form
  // is about to duplicate.
  const searchClients = async (event) => {
    event?.preventDefault()
    setError('')
    setClientDraft(null)
    setSearching(true)
    try {
      const query = buildListQuery({ q: clientTerm, limit: CLIENT_SEARCH_LIMIT })
      const body = await apiFetch(`/admin/trade-accounts?${query}`)
      setClientHits((body.trade_accounts ?? []).map(clientFrom))
    } catch (err) {
      setError(messageOf(err, 'Could not search clients.'))
    } finally {
      setSearching(false)
    }
  }

  const openClientForm = () => {
    setError('')
    clearSearch()
    // The term the search found nothing for is almost always the company name,
    // so it starts the form rather than being thrown away.
    setClientDraft({ ...NEW_CLIENT, company_name: clientTerm.trim() })
  }

  // A client the roster does not hold yet. Created for real, on the same
  // Accounts screen roster — so the next order for them is a search, not
  // another form — and picked into this order straight away.
  const createClient = async () => {
    const built = buildClientBody(clientDraft)
    if (!built.ok) {
      setError(built.error)
      return
    }
    // `run` answers true/false, so the fresh account is caught on the way past
    // — the form has to pick the client it just made, not send the office back
    // to the search box for a row they are looking at.
    let account = null
    const created = await run(
      async () => {
        const body = await apiSend('POST', '/admin/trade-accounts', built.body)
        account = body.trade_account
        return body
      },
      (res) => `${res.trade_account.company_name} added to the client roster.`
    )
    if (!created || !account) return
    pickClient(clientFrom(account))
    setClientDraft(null)
    clearSearch()
  }

  const searchForm = (
    <form onSubmit={searchClients} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <input
        value={clientTerm}
        onChange={(e) => setClientTerm(e.target.value)}
        placeholder="Company, account #, contact, email or phone"
        aria-label="Search clients"
        style={box(300)}
      />
      <GhostButton type="submit" disabled={busy || searching}>
        Find client
      </GhostButton>
      <GhostButton disabled={busy} onClick={openClientForm}>
        Add new client
      </GhostButton>
    </form>
  )

  const picked = draft.client

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
            {picked && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: c.ink }}>{clientLine(picked)}</span>
                  <GhostButton disabled={busy} onClick={() => set({ client: null })}>
                    Change
                  </GhostButton>
                </div>
                <PanelNote>
                  Recorded on the order as “{clientReference(picked)}”.
                  {picked.user_id != null && ' It shows in this client’s portal.'}
                </PanelNote>
                <div style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                  {picked.address ? (
                    <>
                      Delivering to{' '}
                      <span style={{ color: c.ink }}>
                        {[picked.address.line1, picked.address.city, picked.address.country]
                          .filter(Boolean)
                          .join(', ')}
                      </span>{' '}
                      — the address on the client’s record.
                    </>
                  ) : (
                    <>
                      This client has no delivery address on file, so the order carries none. Add
                      one on the Accounts screen and it travels with the next order.
                    </>
                  )}
                </div>
              </div>
            )}

            {!picked && (
              <div style={{ display: 'grid', gap: 12 }}>
                {searchForm}

                {clientHits !== null && clientHits.length === 0 && (
                  <PanelNote>
                    No client matches that. Search on company, account number, contact, email or
                    phone — or add them with “Add new client”.
                  </PanelNote>
                )}

                {clientHits !== null && clientHits.length > 0 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {clientHits.map((client) => (
                      <div
                        key={client.id}
                        style={{ display: 'flex', gap: 12, alignItems: 'center' }}
                      >
                        <span style={{ fontSize: 13, color: c.ink, flex: 1 }}>
                          {clientLine(client)}
                        </span>
                        <GhostButton
                          tone="accent"
                          disabled={busy}
                          onClick={() => {
                            pickClient(client)
                            clearSearch()
                          }}
                        >
                          Use this client
                        </GhostButton>
                      </div>
                    ))}
                  </div>
                )}

                {clientDraft && (
                  <div style={{ ...panel, padding: 20, display: 'grid', gap: 12 }}>
                    <div style={{ ...mutedText, fontSize: 11.5, lineHeight: 1.6 }}>
                      Adds the company to the client roster, where the Accounts screen keeps it —
                      so the next order for them is a search. The delivery address goes on this
                      order and every one after it.
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {CLIENT_FIELDS.map((field) => (
                        <input
                          key={field.key}
                          value={clientDraft[field.key]}
                          onChange={(e) =>
                            setClientDraft((d) => ({ ...d, [field.key]: e.target.value }))
                          }
                          placeholder={field.label}
                          aria-label={field.label}
                          style={box(field.width)}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <GhostButton
                        tone="accent"
                        disabled={busy || !clientDraft.company_name.trim()}
                        onClick={createClient}
                      >
                        Create client and use
                      </GhostButton>
                      <GhostButton disabled={busy} onClick={() => setClientDraft(null)}>
                        Cancel
                      </GhostButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section style={panel}>
          <PanelHead label="Lines" />
          <div style={{ padding: 20 }}>
            <div style={{ marginBottom: 16, maxWidth: 360 }}>
              <Field
                label="Price list"
                hint="Lines pick up this catalogue price. Type over any line to override it."
              >
                <Select
                  value={draft.price_type}
                  disabled={busy}
                  onChange={(e) => setPriceType(e.target.value)}
                  style={{ width: 'auto' }}
                  aria-label="Price list"
                >
                  {PRICE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <OrderLinesEditor
              lines={lines}
              onChange={setLines}
              busy={busy}
              onError={setError}
              priceType={draft.price_type}
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
