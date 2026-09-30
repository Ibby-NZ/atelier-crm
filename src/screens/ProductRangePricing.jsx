// "Price from its range" on a catalogue product's page (/admin/products/:id) —
// the Dynamics product price rows behind this design, each priced through the
// house (25 Sep 2026, client asked for the calculation "shown on products in
// the CRM"), and whether the PRODUCT itself carries that price.
//
//   GET  /admin/product-prices?product_id=<id>&limit=20
//   POST /admin/product-prices/:id/apply-to-product { product_id }
//
// The API finds the rows: the one the product was built from
// (`product_price_id`), else its house plus its name as the Dynamics
// description. Until 1 Oct 2026 this panel asked by house + name itself, and a
// product built from a row is named "SETA FIAMMATA 4741 (1)" — no row carries
// that, so the panel was empty on thousands of products. The uploads write the range price onto a product
// whose trade price is BLANK; a product carrying a different one keeps it
// until somebody presses "Set as the trade price" here — a manual price move,
// recorded in the product's Price history with the range it came from.
//
// Drawn only for a login with finance visibility (the page's `finance` flag,
// as the discount tier beside it is); the API is the gate either way.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { c } from '../theme.js'
import { apiFetch, apiSend } from '../lib/api.js'
import { buildListQuery, listPath } from '../admin/list.js'
import { ErrorLine, GhostButton, HeaderRow, PanelHead, PanelNote, Row, messageOf, monoText, mutedText, panel } from '../admin/parts.jsx'
import {
  PRODUCT_PANEL_LIMIT,
  PRODUCT_PRICES_PATH,
  applyToProductPath,
  catalogueLine,
  differenceText,
  differenceTone,
  foreign,
  isFinanceRefusal,
  nzd,
  productPriceRoute,
  productPriceState,
  unpricedText,
} from './productPrices.js'

const COLUMNS = '1.3fr 110px 110px 110px 90px 1.2fr'
const TONES = { positive: c.sage, warning: c.clay, muted: c.muted }

export default function ProductRangePricing({ product, onApplied, flash }) {
  const [state, setState] = useState({ status: 'loading', rows: [], error: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const query = buildListQuery({ product_id: product.id, limit: PRODUCT_PANEL_LIMIT })
    try {
      const body = await apiFetch(listPath(PRODUCT_PRICES_PATH, query))
      setState({ status: 'ready', rows: body?.product_prices ?? [], error: null })
    } catch (err) {
      setState({ status: isFinanceRefusal(err) ? 'locked' : 'error', rows: [], error: err })
    }
  }, [product.id, product.name, product.brand_id])

  useEffect(() => {
    load()
  }, [load])

  const setAsTradePrice = async (row) => {
    setBusy(true)
    setError('')
    try {
      const body = await apiSend('POST', applyToProductPath(row.id), { product_id: product.id })
      flash?.(`Trade price set to ${nzd(row.pricing?.trade_sell)} from ${row.range_name} — ${catalogueLine(body?.catalogue)}.`)
      await onApplied?.()
    } catch (err) {
      setError(messageOf(err, 'The price could not be set.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={panel}>
      <PanelHead label="Price from its range" />
      {state.status === 'loading' && <PanelNote>Loading the price…</PanelNote>}
      {state.status === 'locked' && <PanelNote>Product prices need finance visibility.</PanelNote>}
      {state.status === 'error' && <PanelNote tone="danger">{messageOf(state.error, 'Could not load the price.')}</PanelNote>}
      {state.status === 'ready' && state.rows.length === 0 && (
        <PanelNote>No row of the Dynamics product prices export names this design under this house.</PanelNote>
      )}
      {state.status === 'ready' && state.rows.length > 0 && (
        <>
          <HeaderRow columns={COLUMNS} labels={['Dynamics product', 'Wholesale', 'Range price', 'Dynamics', 'Difference', 'This product']} numeric={[1, 2, 3, 4]} />
          {state.rows.map((row) => {
            const unpriced = unpricedText(row.pricing)
            const onProduct = productPriceState(product, row.pricing)
            return (
              <Row key={row.id} columns={COLUMNS} style={{ fontSize: 13, padding: '10px 20px', alignItems: 'center' }}>
                <span style={{ minWidth: 0 }}>
                  <Link to={productPriceRoute(row.id)} className="ab-link" style={{ color: c.ink }}>
                    {row.code}
                  </Link>
                  <span style={{ ...mutedText, display: 'block' }}>
                    {[row.item_type, row.range_name].filter(Boolean).join(' · ')} · see the calculation
                  </span>
                </span>
                <span style={{ ...monoText, textAlign: 'right' }}>{foreign(row.wholesale_rate, row.currency)}</span>
                <span style={{ ...monoText, textAlign: 'right', color: c.ink, fontWeight: 600 }}>
                  {unpriced ? <span style={{ ...mutedText, color: c.clay }}>{unpriced}</span> : nzd(row.pricing?.trade_sell)}
                </span>
                <span style={{ ...monoText, textAlign: 'right' }}>{nzd(row.dynamics_trade_sell)}</span>
                <span style={{ ...monoText, textAlign: 'right', color: TONES[differenceTone(row.pricing)] }}>{differenceText(row.pricing)}</span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...mutedText, color: onProduct.action ? c.clay : c.sage }}>{onProduct.text}</span>
                  {onProduct.action && (
                    <GhostButton disabled={busy} onClick={() => setAsTradePrice(row)}>
                      Set as the trade price
                    </GhostButton>
                  )}
                </span>
              </Row>
            )
          })}
          <ErrorLine style={{ padding: '0 20px 12px' }}>{error}</ErrorLine>
        </>
      )}
    </section>
  )
}
