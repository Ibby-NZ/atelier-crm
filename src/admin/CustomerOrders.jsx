// One customer's order history — the WooCommerce "customer history" block
// (16 Sep 2026: "view trade customers and normal customers past order history
// specific to them"). Drawn in two places: the order page's sidebar and the
// client's own row on Clients. The rules are in ../screens/adminOrders.js
// (customerOrdersPath, customerHistory); this is layout and the fetch.
//
// safeFetch, never a mutation: reading a history writes nothing, and a failed
// read is one line here rather than an error over the screen that holds it.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { safeFetch } from '../lib/api.js'
import { STATUS_LABELS, formatCents, formatOrderTotal } from './orderFlow.js'
import { customerHistory, customerOrdersPath, orderPath } from '../screens/adminOrders.js'
import { monoText, mutedText, sectionLabel } from './parts.jsx'

const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

/**
 * @param {{email: string|null, excludeId?: number|null, limit?: number, compact?: boolean}} props
 *   excludeId — the order being looked at, left out of the list (it is on screen already).
 */
export default function CustomerOrders({ email, excludeId = null, limit = 8, refreshKey = null }) {
  // `refreshKey` is whatever the parent wants a re-read on — the order page
  // passes its own status and total, so marking an order paid moves the
  // "paid in total" figure without a reload.
  const path = customerOrdersPath(email)
  const [state, setState] = useState({ status: path ? 'loading' : 'empty', rows: [], total: 0, error: '' })

  useEffect(() => {
    if (!path) return undefined
    let active = true
    setState({ status: 'loading', rows: [], total: 0, error: '' })
    safeFetch(path).then(({ data, error }) => {
      if (!active) return
      if (error || !data) {
        setState({ status: 'error', rows: [], total: 0, error: error?.message || 'Could not load the order history.' })
        return
      }
      setState({ status: 'ready', rows: data.orders ?? [], total: data.meta?.total ?? (data.orders ?? []).length, error: '' })
    })
    return () => {
      active = false
    }
  }, [path, refreshKey])

  if (!path) return <div style={{ ...mutedText, fontStyle: 'italic', fontFamily: font.display }}>No email on file to look up.</div>
  if (state.status === 'loading') return <div style={mutedText}>Loading order history…</div>
  if (state.status === 'error') return <div style={{ ...mutedText, color: c.clay }}>{state.error}</div>

  const history = customerHistory(state.rows, state.total)
  const listed = state.rows.filter((row) => row.id !== excludeId).slice(0, limit)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <Stat label="Orders" value={history.orders.toLocaleString('en-NZ')} />
        <Stat label="Paid in total" value={formatCents(history.revenueCents)} />
        <Stat label="Average order" value={formatCents(history.averageCents)} />
      </div>
      {history.partial && (
        <div style={{ ...mutedText, fontSize: 11, marginTop: 6 }}>
          Money summed over the {state.rows.length} most recent orders.
        </div>
      )}
      {listed.length === 0 ? (
        <div style={{ ...mutedText, marginTop: 12, fontStyle: 'italic', fontFamily: font.display }}>
          {history.orders === 0 ? 'No orders yet.' : 'No other orders.'}
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {listed.map((row) => (
            <Link
              key={row.id}
              to={orderPath(row)}
              className="ab-t"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                gap: 10,
                alignItems: 'baseline',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: 12,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ ...monoText, display: 'block', fontSize: 12, fontWeight: 600, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.order_number}
                </span>
                <span style={{ ...mutedText, fontSize: 11 }}>{shortDate(row.created_at)}</span>
              </span>
              <span style={{ ...mutedText, fontSize: 11.5 }}>{STATUS_LABELS[row.status] ?? row.status}</span>
              <span style={{ ...monoText, fontSize: 12, textAlign: 'right' }}>{formatOrderTotal(row)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <span style={{ ...sectionLabel, fontSize: 10 }}>{label}</span>
      <div style={{ ...monoText, fontSize: 14, fontWeight: 600, color: c.ink, marginTop: 4 }}>{value}</div>
    </div>
  )
}
