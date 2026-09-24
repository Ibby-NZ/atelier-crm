// The freight ledger under the rate table on Supplier rates: what each house
// (or, where a house has no rate of its own, its supplier) costs to land.
//
//   GET /admin/freight/rates?limit=   → { rates, meta }
//   GET /admin/suppliers?limit=       → { suppliers }  names for supplier-scoped groups
//
// Read-only here. Rates are appended one at a time or imported from the yearly
// sheet on Supplier freight — this panel links there rather than repeating it.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { c } from '../theme.js'
import { apiFetch } from '../lib/api.js'
import { GhostButton, PanelHead, PanelNote, messageOf, mutedText, panel } from '../admin/parts.jsx'
import FreightLedgerGroups from './FreightLedgerGroups.jsx'
import {
  FREIGHT_ROUTE,
  NEW_FREIGHT_RATE_ROUTE,
  RATES_PATH,
  RATE_LEDGER_LIMIT,
  SUPPLIERS_PATH,
  SUPPLIER_PICKER_LIMIT,
  groupRates,
  overflowNote,
  readLedger,
  supplierOptions,
} from './adminFreight.js'

export default function FreightByHouse() {
  const [ledger, setLedger] = useState({ status: 'loading', error: '', rates: [], total: 0 })
  const [suppliers, setSuppliers] = useState([])

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch(`${RATES_PATH}?limit=${RATE_LEDGER_LIMIT}`),
      // Names for supplier-scoped groups; without them those group by number.
      apiFetch(`${SUPPLIERS_PATH}?limit=${SUPPLIER_PICKER_LIMIT}`).catch(() => ({ suppliers: [] })),
    ])
      .then(([rates, roster]) => {
        if (!active) return
        setSuppliers(roster?.suppliers ?? [])
        setLedger({ status: 'ready', error: '', ...readLedger(rates) })
      })
      .catch((err) => {
        if (active) setLedger((held) => ({ ...held, status: 'error', error: messageOf(err, 'We could not load the freight rates.') }))
      })
    return () => {
      active = false
    }
  }, [])

  const names = useMemo(
    () => new Map(supplierOptions(suppliers).map((option) => [option.id, option.name])),
    [suppliers]
  )
  const groups = groupRates(ledger.rates, names)
  const capNote = overflowNote(ledger.total, ledger.rates.length)

  return (
    <section style={panel}>
      <PanelHead
        label="Supplier freight · by house"
        right={
          <span style={{ display: 'flex', gap: 8 }}>
            <Link to={NEW_FREIGHT_RATE_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton tone="accent">Append a rate</GhostButton>
            </Link>
            <Link to={FREIGHT_ROUTE} style={{ textDecoration: 'none' }}>
              <GhostButton>Import sheet</GhostButton>
            </Link>
          </span>
        }
      />
      <p style={{ ...mutedText, margin: 0, padding: '12px 20px', borderBottom: `1px solid ${c.line}`, lineHeight: 1.6 }}>
        A house&apos;s own rate wins; a supplier rate covers its houses that have none.
      </p>
      {ledger.status === 'loading' && <PanelNote>Loading freight rates…</PanelNote>}
      {ledger.status === 'error' && <PanelNote tone="danger">{ledger.error}</PanelNote>}
      {ledger.status === 'ready' && ledger.rates.length === 0 && (
        <PanelNote>No freight rates yet — they arrive through the yearly sheet on Supplier freight.</PanelNote>
      )}
      {ledger.status === 'ready' && ledger.rates.length > 0 && <FreightLedgerGroups groups={groups} />}
      {capNote && <div style={{ padding: '12px 20px', ...mutedText }}>{capNote}</div>}
    </section>
  )
}
