// Freight rates — live shipping tiers, wired to atelier-api's
// /admin/shipping-rates. Nothing edited them before this screen: the tiers were
// seeded once and could only be changed by the bulk PUT, i.e. by hand with curl.
//
//   GET    /admin/shipping-rates      → { rates }
//   POST   /admin/shipping-rates      → { rate }   201, 409 on a duplicate floor
//   PATCH  /admin/shipping-rates/:id  → { rate }   rate_cents ONLY
//   DELETE /admin/shipping-rates/:id  → { deleted } | 409 last tier for the zone
//
// Three API rules the screen has to honour:
//   - **(zone, threshold_qty) is the identity key, not an editable pair.** The
//     quote resolves against it and the seed upserts on it, so moving either is
//     a delete plus a create. Only the rate is an input; both key columns render
//     as text, and PATCH would strip them anyway.
//   - **A zone is not a table.** It comes into existence with its first tier and
//     disappears with its last, which is why deleting the last tier for a zone
//     is refused: getShippingQuote then answers 400 "unknown shipping zone" and
//     every checkout in that zone stops. The refusal is surfaced as-is.
//   - **A freight tier cannot be archived.** shipping_rates has no archived_at
//     column, so the API's refusal says `archivable: false` and this screen
//     passes useCrudScreen no archive action — the 409 dialog offers Cancel
//     alone, and the only way out is the one the API's message names: add a
//     replacement tier first, or edit this one.

import { useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, ordersTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import { bodyFrom, centsToDollars } from '../admin/drafts.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  SHIPPING_LIST_LIMIT,
  annotateTiers,
  describeShippingRate,
  formatQty,
  ratePatch,
  tierProblem,
  zonesOf,
} from './adminShipping.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

// The whole create body — a tier has no optional column.
const TIER_FIELDS = Object.freeze([
  { key: 'zone', label: 'Zone', kind: 'text', required: true },
  { key: 'threshold_qty', label: 'Quantity from', kind: 'decimal', required: true },
  { key: 'rate_cents', label: 'Rate', kind: 'money', required: true },
])

// A new zone's first tier has to start at 0 or the quote has no floor to fall
// back to, so that is what the form offers.
const NEW_TIER = Object.freeze({ zone: '', threshold_qty: '0', rate_cents: '' })

const TIER_COLUMNS = '1fr 1.2fr 110px 130px 170px'
const ZONE_LIST_ID = 'shipping-zones'

export default function AdminShipping() {
  const [showNew, setShowNew] = useState(false)
  const [newTier, setNewTier] = useState(NEW_TIER)
  const [drafts, setDrafts] = useState({}) // rate id -> the rate box, in dollars

  // One list, so the kit's own mutation cycle serves it — a screen calls
  // useMutation itself only to drive a SECOND list's reload.
  const crud = useCrudScreen({
    path: '/admin/shipping-rates',
    key: 'rates',
    limit: SHIPPING_LIST_LIMIT,
    entity: 'freight tier',
    describe: describeShippingRate,
  })
  const rates = crud.list.rows
  const { message, flash } = crud.toast
  const { busy, error, setError, run } = crud.mutation

  const tiers = annotateTiers(rates)
  const zones = zonesOf(rates)

  // Re-seed every box from server truth after a write, so a saved figure is not
  // immediately overwritten by the stale string still in the input.
  useEffect(() => {
    setDrafts(
      rates.reduce((all, rate) => ({ ...all, [rate.id]: centsToDollars(rate.rate_cents) }), {})
    )
  }, [rates])

  const setNew = (key) => (event) =>
    setNewTier((next) => ({ ...next, [key]: event.target.value }))

  const setRateDraft = (id) => (event) =>
    setDrafts((all) => ({ ...all, [id]: event.target.value }))

  const createTier = async (event) => {
    event.preventDefault()
    const built = bodyFrom(newTier, TIER_FIELDS)
    if (built.error) return setError(built.error)
    const problem = tierProblem(built.body)
    if (problem) return setError(problem)
    // A duplicate (zone, floor) is deliberately not pre-checked: the database
    // detects it and the API's 409 already names the tier to edit instead.
    const ok = await run(
      () => apiSend('POST', '/admin/shipping-rates', built.body),
      (res) =>
        `${describeShippingRate(res.rate)} added at $${centsToDollars(res.rate.rate_cents)}.`
    )
    if (ok) {
      setNewTier(NEW_TIER)
      setShowNew(false)
    }
  }

  const saveRate = (rate) => {
    const result = ratePatch(rate, drafts[rate.id])
    if (result.error) return setError(`${describeShippingRate(rate)}: ${result.error}`)
    if (Object.keys(result.patch).length === 0) return flash('No changes to save.')
    run(
      () => apiSend('PATCH', `/admin/shipping-rates/${rate.id}`, result.patch),
      `${describeShippingRate(rate)} set to $${centsToDollars(result.patch.rate_cents)}.`
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Orders · live"
        title="Freight rates"
        subtitle="The flat freight the storefront charges. Each zone is a ladder of tiers; a quote takes the highest tier whose quantity floor the order reaches, and the lowest tier catches everything under it."
        right={
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, whiteSpace: 'nowrap' }}>
            {crud.list.total} tier{crud.list.total === 1 ? '' : 's'} · {zones.length} zone
            {zones.length === 1 ? '' : 's'}
          </span>
        }
      />
      <SectionTabs tabs={ordersTabs} active="shipping" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30, maxWidth: 1080 }}>
        <section style={panel}>
          <PanelHead
            label="Add a tier"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New tier'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createTier} style={{ padding: 20 }}>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16 }}
                className="r-grid-2"
              >
                <Field
                  label="Zone"
                  hint="Pick an existing zone, or type a new name to create one. A zone exists only while it has tiers, and the checkout uses these names exactly."
                >
                  <input
                    value={newTier.zone}
                    disabled={busy}
                    onChange={setNew('zone')}
                    style={inputStyle}
                    list={ZONE_LIST_ID}
                    placeholder="e.g. Rural"
                  />
                  <datalist id={ZONE_LIST_ID}>
                    {zones.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  label="Quantity from"
                  hint="The tier's floor. A zone's first tier should be 0 so every order has a rate."
                >
                  <input
                    value={newTier.threshold_qty}
                    disabled={busy}
                    onChange={setNew('threshold_qty')}
                    style={inputStyle}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </Field>
                <Field label="Rate" hint="Dollars, e.g. 12.50. Charged flat for the whole order.">
                  <input
                    value={newTier.rate_cents}
                    disabled={busy}
                    onChange={setNew('rate_cents')}
                    style={inputStyle}
                    inputMode="decimal"
                    placeholder="12.50"
                  />
                </Field>
              </div>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Add tier
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead label="Tiers" />
          {!showNew && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {crud.list.status === 'loading' && <PanelNote>Loading freight rates…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}
          {crud.list.status === 'ready' && tiers.length === 0 && (
            <PanelNote>
              No freight tiers yet — until a zone has one, the storefront cannot quote freight for
              it.
            </PanelNote>
          )}

          {crud.list.status === 'ready' && tiers.length > 0 && (
            <>
              <HeaderRow
                columns={TIER_COLUMNS}
                numeric={[2, 3]}
                labels={['Zone', 'Applies to', 'Qty from', 'Rate', '']}
              />
              {tiers.map((tier) => (
                <Row key={tier.id} columns={TIER_COLUMNS}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: c.ink,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {tier.zone}
                  </span>
                  <span style={{ ...mutedText, minWidth: 0 }}>
                    {tier.band}
                    {/* The advance warning that Delete will be refused. Read off
                        the list already on screen, not from a second request. */}
                    {tier.sole && (
                      <span style={{ color: c.clay }}> · the zone’s only tier</span>
                    )}
                  </span>
                  <span style={{ ...monoText, textAlign: 'right' }}>{formatQty(tier.threshold_qty)}</span>
                  <input
                    value={drafts[tier.id] ?? ''}
                    disabled={busy}
                    onChange={setRateDraft(tier.id)}
                    style={{ ...cellInput, fontFamily: font.mono, textAlign: 'right' }}
                    inputMode="decimal"
                    aria-label={`Rate for ${describeShippingRate(tier)}`}
                  />
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <GhostButton tone="accent" disabled={busy} onClick={() => saveRate(tier)}>
                      Save
                    </GhostButton>
                    <GhostButton tone="danger" disabled={busy} onClick={() => crud.remove.ask(tier)}>
                      Delete
                    </GhostButton>
                  </span>
                </Row>
              ))}
              <div style={{ padding: '14px 20px', ...mutedText, lineHeight: 1.6 }}>
                A tier’s zone and quantity floor are fixed — they are how a quote finds the row, so
                moving one is a new tier plus a deletion. Removing a zone’s last tier is refused:
                the checkout would answer “unknown shipping zone” for every order in it.
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
