// Pricing — the Dynamics pricing parameters, live from atelier-api's
// GET /admin/freight/parameters. Finance-gated on the API: a 403 renders as a
// LockedPanel carrying the API's own reason. READ-ONLY: Atelier prices in
// Dynamics until cutover and the import re-runs, so there is nothing to save.
//
// This replaced the demo Pricing Engine in September 2026. Its waterfall ran on
// invented constants — 8% freight, 7% duty, markups by product type — and the
// client read them as ours. Every figure here is one their own export states.
//
// Rules live in ./pricingParameters.js (grouping, every cell's text); this file
// is layout.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { ApiError, apiFetch } from '../lib/api.js'
import { HeaderRow, PanelNote, Row } from '../admin/parts.jsx'
import { isFinanceRefusal } from './adminSuppliers.js'
import { pctText } from './priceLists.js'
import {
  PARAMETERS_PATH,
  discountNote,
  dutyText,
  freightText,
  groupBySupplier,
  surchargeText,
} from './pricingParameters.js'

const COLUMNS = '1.6fr 0.9fr 0.9fr 0.9fr 1.5fr 0.8fr 1.1fr'
const LABELS = [
  'Range',
  'Supplier discount',
  'Trade markup',
  'Freight / unit',
  'Duty A · B · C',
  'Clearance',
  'Surcharge',
]
const mono = { fontFamily: font.mono, fontSize: 12, color: c.ink }
const dim = { ...mono, color: c.muted }

export default function PricingParameters() {
  const [state, setState] = useState({ status: 'loading', groups: [], meta: null, error: null })

  useEffect(() => {
    let cancelled = false
    apiFetch(PARAMETERS_PATH)
      .then((body) => {
        if (cancelled) return
        setState({
          status: 'ready',
          groups: groupBySupplier(body.parameters ?? []),
          meta: body.meta ?? null,
          error: null,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setState({ status: isFinanceRefusal(error) ? 'locked' : 'error', groups: [], meta: null, error })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="Pricing · from Dynamics"
        title="Pricing parameters"
        subtitle="The figures each range is priced with today, as Atelier's own system holds them: the supplier discount, the trade markup, freight in dollars per unit, the three duty bands and clearance. Read-only until cutover."
      />

      {state.status === 'loading' && <PanelNote>Loading the parameters…</PanelNote>}

      {state.status === 'locked' && (
        <div style={{ marginTop: 28 }}>
          <LockedPanel
            title="Pricing parameters are finance"
            reason={state.error?.message}
            hint="Director and Finance only. Trade and retail sell prices are on Catalogue and Price Lists."
          />
        </div>
      )}

      {state.status === 'error' && (
        <PanelNote tone="danger">
          {state.error instanceof ApiError ? state.error.message : 'Could not load the pricing parameters.'}
        </PanelNote>
      )}

      {state.status === 'ready' && (
        <div style={{ marginTop: 28, border: `1px solid ${c.line}`, borderRadius: 4, overflow: 'hidden' }}>
          <HeaderRow columns={COLUMNS} labels={LABELS} />

          {state.groups.length === 0 && (
            <PanelNote>No parameters on file yet — the Dynamics tracking-option export has not been imported.</PanelNote>
          )}

          {state.groups.map((group) => (
            <div key={group.supplier}>
              <div style={{ padding: '12px 20px 8px', background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                <span style={{ fontFamily: font.display, fontSize: 15, color: c.ink }}>{group.supplier}</span>
                <span style={{ marginLeft: 10, fontSize: 11, color: c.muted }}>
                  {group.ranges.length} range{group.ranges.length === 1 ? '' : 's'}
                </span>
              </div>
              {group.ranges.map((p) => (
                <Row key={p.guid} columns={COLUMNS}>
                  <span style={{ fontSize: 12.5, color: c.ink }}>{p.name}</span>
                  <span style={p.discount_stated ? mono : dim} title={discountNote(p) ?? undefined}>
                    {pctText(p.discount_percent)}
                  </span>
                  <span style={mono}>{pctText(p.trade_markup_percent)}</span>
                  <span style={p.freight_per_unit == null ? dim : mono}>{freightText(p.freight_per_unit)}</span>
                  <span style={mono}>{dutyText(p)}</span>
                  <span style={mono}>{pctText(p.clearance_percent)}</span>
                  <span style={mono}>{surchargeText(p)}</span>
                </Row>
              ))}
            </div>
          ))}

          <PanelNote>
            {state.meta?.total ?? 0} ranges. {state.meta?.scope} Freight is dollars per the range's own
            unit, and a blank one is unknown — never free. Discounts and markups are per range, which
            is per house, not per product type.
          </PanelNote>
        </div>
      )}
    </>
  )
}
