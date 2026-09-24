// "Supplier discount tier" on a product page. Which of its house's tiers (JV:
// 40 / 45 / 50%) this product is bought at; blank leaves it to category
// matching and the house default. Drawn only for finance logins — the API
// refuses everyone else. See productTier.js for the routes.

import { useEffect, useState } from 'react'
import { apiFetch, apiSend } from '../lib/api.js'
import { ErrorLine, Field, PanelHead, PanelNote, Select, inputStyle, messageOf, panel } from '../admin/parts.jsx'
import { productTierPath, tierBody, tierOptionLabel } from './productTier.js'

export default function ProductDiscountTier({ product, flash }) {
  const [state, setState] = useState({ status: 'loading', tierId: null, tiers: [], error: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', tierId: null, tiers: [], error: '' })
    apiFetch(productTierPath(product.id))
      .then(({ discount_tier: tier }) => {
        if (active) setState({ status: 'ready', tierId: tier.tier_id, tiers: tier.tiers ?? [], error: '' })
      })
      .catch((err) => {
        if (active) setState({ status: 'error', tierId: null, tiers: [], error: messageOf(err, 'Could not load the discount tiers.') })
      })
    return () => {
      active = false
    }
  }, [product.id])

  const choose = async (value) => {
    setSaving(true)
    try {
      const { discount_tier: tier } = await apiSend('PUT', productTierPath(product.id), tierBody(value))
      setState((current) => ({ ...current, tierId: tier.tier_id, error: '' }))
      flash?.('Discount tier saved.')
    } catch (err) {
      setState((current) => ({ ...current, error: messageOf(err, 'Could not save the discount tier.') }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={panel}>
      <PanelHead label="Supplier discount tier" />
      {state.status === 'loading' && <PanelNote>Loading discount tiers…</PanelNote>}
      {state.status === 'ready' && state.tiers.length === 0 && (
        <PanelNote>This house has no discount tiers. Add them on its supplier’s terms.</PanelNote>
      )}
      {state.status === 'ready' && state.tiers.length > 0 && (
        <div style={{ padding: '20px 20px 24px' }}>
          <Field
            label="Tier"
            hint="Which of the house’s supplier discounts this product is bought at. Blank uses the house default."
          >
            <Select
              value={state.tierId == null ? '' : String(state.tierId)}
              disabled={saving}
              onChange={(e) => choose(e.target.value)}
              aria-label="Supplier discount tier"
              style={{ ...inputStyle, maxWidth: 360 }}
            >
              <option value="">House default</option>
              {state.tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tierOptionLabel(tier)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <ErrorLine style={{ margin: '0 20px 16px' }}>{state.error}</ErrorLine>
    </section>
  )
}
