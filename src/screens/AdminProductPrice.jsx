// One product price on its own page — the whole calculation, step by step
// (25 Sep 2026, client asked: "the price calculation … shown on products in the
// CRM"). Off GET /admin/product-prices/:id.
//
// The steps are the client's own formula, as atelier-api prices it through the
// house its range names: wholesale ÷ exchange rate = price ex duty; + the
// range's duty where Dynamics charged one; + the house's freight; × (1 +
// clearance) = landed; × (1 + trade markup) = trade sell. Each line says the
// figure it used and where that figure lives (the house, the supplier's terms,
// the exchange rate), so a price that looks wrong says which figure to change —
// and the house link is one press away. Dynamics' own figures sit beside it.
//
// READ-ONLY. A product price is a row of the Dynamics export; the figures that
// price it are edited on the house (its Pricing panel) and on the Pricing
// screen (exchange rates). Finance-gated by the API: a 403 is a LockedPanel.
//
// Rules in ./productPrices.js; this file is layout.

import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { NotFound } from '../components/form.jsx'
import { LockedPanel } from '../auth/guards.jsx'
import { apiFetch } from '../lib/api.js'
import { PanelHead, PanelNote, Row, messageOf, monoText, mutedText, panel } from '../admin/parts.jsx'
import { productRoute } from './adminCatalogue.js'
import {
  dynamicsNote,
  foreign,
  houseLink,
  isFinanceRefusal,
  nzd,
  productPriceListReturn,
  productPricePath,
  stepLines,
  surchargeText,
  unpricedText,
} from './productPrices.js'

const STEP_COLUMNS = '200px 1fr 140px'
const FACT_COLUMNS = '180px 1fr'

export default function AdminProductPrice() {
  const { id } = useParams()
  const listRoute = productPriceListReturn(useLocation().state)
  const [state, setState] = useState({ status: 'loading', product: null, error: null })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', product: null, error: null })
    apiFetch(productPricePath(id))
      .then((body) => {
        if (active) setState({ status: 'ready', product: body?.product_price ?? null, error: null })
      })
      .catch((err) => {
        if (!active) return
        const status = err?.status === 404 ? 'missing' : isFinanceRefusal(err) ? 'locked' : 'error'
        setState({ status, product: null, error: err })
      })
    return () => {
      active = false
    }
  }, [id])

  const backLink = (
    <>
      <Link to={listRoute} className="ab-link" style={{ color: 'inherit', textDecoration: 'none' }}>
        ← Back to product prices
      </Link>
      {' · from the Dynamics export'}
    </>
  )

  if (state.status === 'missing') {
    return (
      <NotFound
        title="Product price not found"
        backTo={listRoute}
        backLabel="Back to product prices"
        message="That product price could not be found — the link may be out of date."
      />
    )
  }
  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Product price" />
        <PanelNote>Loading the price…</PanelNote>
      </div>
    )
  }
  if (state.status === 'locked') {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Product price" />
        <div style={{ marginTop: 28 }}>
          <LockedPanel
            title="Product prices are finance"
            reason={state.error?.message}
            hint="Wholesale rates and landed costs are cost figures. Director and Finance only."
          />
        </div>
      </div>
    )
  }
  if (state.status === 'error' || !state.product) {
    return (
      <div>
        <PageHeader eyebrow={backLink} title="Product price" />
        <PanelNote tone="danger">{messageOf(state.error, 'Could not load this product price.')}</PanelNote>
      </div>
    )
  }

  const product = state.product
  const pricing = product.pricing ?? {}
  const house = pricing.house
  const unpriced = unpricedText(pricing)
  const lines = stepLines(pricing, product)
  const surcharge = surchargeText(pricing.surcharge)

  const facts = [
    ['Range', house ? <Link to={houseLink(house)} className="ab-link">{product.range_name}</Link> : <span style={{ color: c.clay }}>{product.range_name} — no house carries this name</span>],
    ['House', house ? <Link to={houseLink(house)} className="ab-link">{house.name}</Link> : '—'],
    ['Type', product.item_type ?? '—'],
    ['Wholesale rate', <span key="w" style={monoText}>{foreign(product.wholesale_rate, product.currency)}</span>],
    ['Date effective', product.date_effective ?? '—'],
    ['Repeat', [product.horizontal_repeat && `${product.horizontal_repeat} horizontal`, product.vertical_repeat && `${product.vertical_repeat} vertical`].filter(Boolean).join(' · ') || '—'],
    ['Duty', pricing.hand_priced ? "In Dynamics' price — priced by hand" : product.duty_class ? `Class ${product.duty_class} — Dynamics charged duty on this product` : 'None — Dynamics charged no duty on this product'],
    ['Dynamics freight letter', product.freight_letter ?? '—'],
    ['In the export', product.in_latest_export ? 'Yes — in the latest import' : 'No longer — a later export left it out'],
  ]

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        eyebrow={backLink}
        title={product.code}
        subtitle={[product.description !== product.code ? product.description : null, product.item_type, product.range_name].filter(Boolean).join(' · ')}
        right={
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...mutedText }}>Trade sell</div>
            <div style={{ fontFamily: font.mono, fontSize: 26, color: c.ink }}>{unpriced ? '—' : nzd(pricing.trade_sell)}</div>
            <div style={{ ...mutedText }}>Dynamics {nzd(pricing.dynamics?.trade_sell)}</div>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, marginTop: 24, alignItems: 'start' }}>
        <div style={{ ...panel, minWidth: 0 }}>
          <PanelHead label="The calculation" right={house ? <Link to={houseLink(house)} className="ab-link" style={{ fontSize: 12.5 }}>Edit {house.name}&apos;s figures</Link> : null} />
          {unpriced && (
            <PanelNote tone="danger">
              {unpriced}. {house ? `Fill it on ${house.name}'s Pricing panel and this product prices at once.` : pricing.reason}
            </PanelNote>
          )}
          {lines.map((line) => (
            <Row
              key={line.key}
              columns={STEP_COLUMNS}
              style={{ padding: line.key_step ? '14px 20px' : '10px 20px', alignItems: 'baseline', background: line.key_step ? c.panelHead : undefined }}
            >
              <span style={{ fontSize: line.key_step ? 14.5 : 13.5, fontWeight: line.key_step ? 600 : 500, color: c.ink }}>{line.label}</span>
              <span style={{ ...mutedText, lineHeight: 1.5 }}>
                {line.op}
                {line.subtotal && <span style={{ display: 'block', ...monoText }}>= {line.subtotal} before clearance</span>}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: line.key_step ? 16 : 13.5, textAlign: 'right', color: c.ink, fontWeight: line.key_step ? 600 : 400 }}>
                {line.amount}
              </span>
            </Row>
          ))}
          {surcharge && <PanelNote>{surcharge}</PanelNote>}
        </div>

        <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          <div style={panel}>
            <PanelHead label="Dynamics" />
            <div style={{ padding: '12px 20px 16px', fontSize: 13, color: c.inkSoft, lineHeight: 1.6 }}>{dynamicsNote(pricing)}</div>
            {[
              ['Price ex duty', pricing.dynamics?.price_ex_duty],
              ['Price incl duty', pricing.dynamics?.price_incl_duty],
              ['Trade sell (over 5 m)', pricing.dynamics?.trade_sell],
            ].map(([label, value]) => (
              <Row key={label} columns="1fr 110px" style={{ padding: '8px 20px', fontSize: 13 }}>
                <span style={{ color: c.inkSoft }}>{label}</span>
                <span style={{ ...monoText, textAlign: 'right' }}>{nzd(value)}</span>
              </Row>
            ))}
          </div>

          <div style={panel}>
            <PanelHead label="In the catalogue" />
            {product.catalogue_products?.length > 0 ? (
              product.catalogue_products.map((item) => (
                <Row key={item.id} columns="1fr" style={{ padding: '9px 20px', fontSize: 13 }}>
                  <Link to={productRoute(item.id)} className="ab-link">{item.name}</Link>
                </Row>
              ))
            ) : (
              <PanelNote>No catalogue product under {house?.name ?? 'this range'} carries this name.</PanelNote>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...panel, marginTop: 20 }}>
        <PanelHead label="From the export" />
        {facts.map(([label, value]) => (
          <Row key={label} columns={FACT_COLUMNS} style={{ padding: '9px 20px', fontSize: 13 }}>
            <span style={{ color: c.muted }}>{label}</span>
            <span style={{ color: c.inkSoft, minWidth: 0 }}>{value}</span>
          </Row>
        ))}
      </div>
    </div>
  )
}
