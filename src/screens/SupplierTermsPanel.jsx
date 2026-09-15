// One supplier's commercial terms, editable. Sits inside the expanded supplier
// row on AdminSuppliers and is the write half of what that screen showed
// read-only until W23.
//
//   GET|POST    /admin/suppliers/:id/brand-terms
//   PATCH|DELETE       …/brand-terms/:termsId
//   POST               …/brand-terms/:termsId/tiers
//   PATCH|DELETE       …/brand-terms/:termsId/tiers/:tierId
//   PATCH /admin/brands/:id { supplier_id }        ← linking a house
//
// **It reads the STANDALONE terms list, not the terms embedded in
// `GET /admin/suppliers/:id`.** That embed is keyed per LINKED house and drops
// any terms row whose brand does not point at this supplier; this endpoint keys
// on `supplier_id` alone, so nothing is invisible from here.
//
// **Every write shows the net multiplier back.** A chain is MULTIPLICATIVE —
// {0.4, 0.4} is ×0.36, not −80% — and the resolved figure comes back on every
// write response precisely because it is the one field nobody can check by eye.
// `termsSavedNote` is what puts it in front of the person who just typed it.
// Nothing here multiplies a chain: atelier-api's discount-chain.js is the only
// evaluator there is.
//
// **A 403 is the finance gate, not a fault.** These routes need
// `can_view_finance` on top of the backoffice role, because `backoffice` covers
// the showroom as well as the accounts desk. It renders as a LockedPanel
// carrying the API's own written reason.
//
// Layout only: every rule is in ./adminSuppliers.js.

import { useCallback, useEffect, useState } from 'react'
import { c, font } from '../theme.js'
import { LockedPanel } from '../auth/guards.jsx'
import { apiDelete, apiFetch, apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { attemptDelete, deleteDialog } from '../admin/deleteFlow.js'
import {
  Select,
  CheckField,
  ErrorLine,
  Field,
  GhostButton,
  PanelHead,
  PanelNote,
  cellInput,
  messageOf,
  monoText,
  mutedText,
  panel,
  sectionLabel,
  useMutation,
} from '../admin/parts.jsx'
import {
  NEW_TERMS,
  NEW_TIER,
  brandLinkPath,
  brandTermsPath,
  buildTermsBody,
  buildTermsPatch,
  buildTierBody,
  chainPreview,
  draftFromTerms,
  isFinanceRefusal,
  linkableBrands,
  netText,
  pctText,
  termsRowPath,
  termsSavedNote,
  tierPath,
  tiersPath,
} from './adminSuppliers.js'

const smallInput = { ...cellInput, fontSize: 12.5 }

/**
 * @param {{ supplierId: number, supplierName: string, flash: (text: string) => void,
 *   onLinked: () => void }} props
 */
export default function SupplierTermsPanel({ supplierId, supplierName, flash, onLinked }) {
  const [terms, setTerms] = useState([])
  const [brands, setBrands] = useState([])
  const [status, setStatus] = useState('loading')
  const [refusal, setRefusal] = useState('')
  const [locked, setLocked] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState(NEW_TERMS)
  const [showNew, setShowNew] = useState(false)
  const [newTerms, setNewTerms] = useState(NEW_TERMS)
  const [linkBrandId, setLinkBrandId] = useState('')
  // The delete flow, for a terms row and for a tier. Both go through the shared
  // kit rather than a hand-rolled confirm.
  const [target, setTarget] = useState(null)
  const [blocked, setBlocked] = useState(null)
  const [removing, setRemoving] = useState(false)

  const load = useCallback(async () => {
    const body = await apiFetch(brandTermsPath(supplierId))
    setTerms(body.terms ?? [])
    return body.terms ?? []
  }, [supplierId])

  const { busy, error, setError, run } = useMutation({ reload: load, flash })

  useEffect(() => {
    let active = true
    setStatus('loading')
    setLocked(false)
    load()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        // A policy answer, not a failure: the panel says what is missing and
        // who grants it, rather than drawing an empty editor that 403s on save.
        setLocked(isFinanceRefusal(err))
        setRefusal(messageOf(err, 'Could not load this supplier’s terms.'))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [load])

  // The house picker for a new terms row and for the link control. Loaded only
  // once the panel is known to be readable — there is nothing to pick otherwise.
  useEffect(() => {
    if (status !== 'ready') return undefined
    let active = true
    apiFetch('/admin/brands')
      .then((body) => {
        if (active) setBrands(body.brands ?? [])
      })
      .catch(() => {
        if (active) setBrands([])
      })
    return () => {
      active = false
    }
  }, [status])

  if (status === 'loading') return <PanelNote>Loading commercial terms…</PanelNote>
  if (locked) {
    return (
      <div style={{ marginTop: 20 }}>
        <LockedPanel
          title="Commercial terms are cost data"
          reason={refusal}
          hint="Reading and setting what Atelier pays a maison needs finance visibility on your account, which is separate from back-office access — a director grants it."
        />
      </div>
    )
  }
  if (status === 'error') return <PanelNote tone="danger">{refusal}</PanelNote>

  const openTerms = (row) => {
    setError('')
    setOpenId((current) => (current === row.id ? null : row.id))
    setDraft(draftFromTerms(row))
  }

  const saveTerms = (row) => {
    const built = buildTermsPatch(row, draft)
    if (!built.ok) return setError(built.error)
    if (Object.keys(built.patch).length === 0) return flash('No changes to save.')
    return run(
      () => apiSend('PATCH', termsRowPath(supplierId, row.id), built.patch),
      (result) => termsSavedNote(result.terms)
    )
  }

  const createTerms = async (event) => {
    event.preventDefault()
    const built = buildTermsBody(newTerms)
    if (!built.ok) return setError(built.error)
    const ok = await run(
      () => apiSend('POST', brandTermsPath(supplierId), built.body),
      (result) => termsSavedNote(result.terms)
    )
    if (ok) {
      setNewTerms(NEW_TERMS)
      setShowNew(false)
    }
    return undefined
  }

  const addTier = (row, tierDraft, done) => {
    const built = buildTierBody(tierDraft)
    if (!built.ok) return setError(built.error)
    return run(
      () => apiSend('POST', tiersPath(supplierId, row.id), built.body),
      (result) => termsSavedNote(result.terms)
    ).then((ok) => {
      if (ok) done()
    })
  }

  const linkHouse = async () => {
    const id = Number(linkBrandId)
    if (!Number.isInteger(id) || id <= 0) return setError('Choose a house to link.')
    const ok = await run(
      () => apiSend('PATCH', brandLinkPath(id), { supplier_id: supplierId }),
      (result) => `${result.brand?.name ?? 'That house'} now invoices through ${supplierName}.`
    )
    if (ok) {
      setLinkBrandId('')
      onLinked()
    }
    return undefined
  }

  // --- delete (terms row or tier), through the shared kit --------------------
  const askRemove = (entry) => {
    setTarget(entry)
    setBlocked(null)
    setError('')
  }
  const closeRemove = () => {
    setTarget(null)
    setBlocked(null)
  }
  const confirmRemove = async () => {
    if (!target) return
    setRemoving(true)
    const outcome = await attemptDelete(() => apiDelete(target.path), {
      fallback: `That ${target.entity} could not be deleted.`,
    })
    setRemoving(false)
    if (!outcome.ok) {
      setBlocked(outcome.blocked)
      return
    }
    closeRemove()
    await load()
    flash(`${target.name} deleted.`)
  }

  const dialog = deleteDialog({
    entity: target?.entity ?? 'record',
    name: target?.name,
    blocked,
    // Neither a terms row nor a tier has an `archived_at` column, so the API
    // answers `archivable: false` and a refusal correctly offers Cancel alone.
    canArchive: false,
  })

  const options = linkableBrands(brands, supplierId)

  return (
    <div style={{ marginTop: 22, ...panel, background: c.paper }}>
      <PanelHead
        label="Commercial terms · writable"
        right={
          <GhostButton
            disabled={busy}
            onClick={() => {
              setShowNew((open) => !open)
              setError('')
            }}
          >
            {showNew ? 'Cancel' : 'Add terms for a house'}
          </GhostButton>
        }
      />

      <div style={{ padding: '12px 16px', ...mutedText, fontSize: 11.5, lineHeight: 1.6, borderBottom: `1px solid ${c.line}` }}>
        Rates are fractions off list — <span style={{ fontFamily: font.mono }}>0.4</span> is 40%. A
        chain COMPOUNDS: <span style={{ fontFamily: font.mono }}>0.4, 0.4</span> is ×0.36, not −80%.
        The net figure comes back from the server on every save and is shown then, because it is the
        one thing here nobody can check by eye.
      </div>

      <ErrorLine style={{ padding: '10px 16px' }}>{error}</ErrorLine>

      {showNew && (
        <form onSubmit={createTerms} style={{ padding: 16, borderBottom: `1px solid ${c.line}`, display: 'grid', gap: 12 }}>
          <Field label="House" hint="One set of terms per house. Moving them is a delete and a re-create.">
            <Select
              value={newTerms.brand_id}
              disabled={busy}
              onChange={(e) => setNewTerms((t) => ({ ...t, brand_id: e.target.value }))}
              aria-label="House for these terms"
              style={smallInput}
            >
              <option value="">Choose a house…</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>
          <TermsFields values={newTerms} onChange={setNewTerms} disabled={busy} />
          <div>
            <GhostButton type="submit" tone="accent" disabled={busy}>
              Add terms
            </GhostButton>
          </div>
        </form>
      )}

      {terms.length === 0 && (
        <PanelNote>
          No per-house terms on file. That is the normal state for an “averaged” supplier, whose one
          net rate lives on the supplier itself.
        </PanelNote>
      )}

      {terms.map((row) => (
        <div key={row.id} style={{ borderBottom: `1px solid ${c.line}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 12, alignItems: 'center', padding: '11px 16px' }}>
            <span style={{ fontSize: 13, color: c.ink, minWidth: 0 }}>{row.brand_name}</span>
            <span style={{ ...monoText, fontSize: 12.5, textAlign: 'right', color: row.invalid_reason ? c.danger : c.ink }}>
              {row.invalid_reason ? 'Needs review' : netText(row.net_multiplier)}
            </span>
            <span style={{ fontSize: 11.5, color: c.muted, minWidth: 0 }}>
              {row.invalid_reason || row.net_label || (row.indicative ? 'Indicative' : '')}
            </span>
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <GhostButton disabled={busy} onClick={() => openTerms(row)}>
                {openId === row.id ? 'Close' : 'Edit'}
              </GhostButton>
              <GhostButton
                disabled={busy}
                tone="danger"
                onClick={() =>
                  askRemove({
                    entity: 'set of terms',
                    name: `${row.brand_name}’s terms`,
                    path: termsRowPath(supplierId, row.id),
                  })
                }
              >
                Delete
              </GhostButton>
            </span>
          </div>

          {openId === row.id && (
            <div style={{ padding: '4px 16px 18px', background: c.surface, display: 'grid', gap: 14 }}>
              <TermsFields values={draft} onChange={setDraft} disabled={busy} />
              <div>
                <GhostButton tone="accent" disabled={busy} onClick={() => saveTerms(row)}>
                  Save terms
                </GhostButton>
              </div>
              <TierEditor
                terms={row}
                supplierId={supplierId}
                busy={busy}
                onAdd={addTier}
                onPatch={(tier, body) =>
                  run(
                    () => apiSend('PATCH', tierPath(supplierId, row.id, tier.id), body),
                    (result) => termsSavedNote(result.terms)
                  )
                }
                onRemove={(tier) =>
                  askRemove({
                    entity: 'tier',
                    name: `${row.brand_name}’s “${tier.label}” tier`,
                    path: tierPath(supplierId, row.id, tier.id),
                  })
                }
              />
            </div>
          )}
        </div>
      ))}

      {/* A terms row is per HOUSE, so a supplier with no houses has nowhere for
          its terms to show on the detail read. This is the only place in the CRM
          that writes brands.supplier_id. */}
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        <span style={sectionLabel}>Link a house to this supplier</span>
        <span style={{ ...mutedText, fontSize: 11.5 }}>
          A supplier is who INVOICES Atelier; a house is what a client buys. Linking is what makes a
          purchase order for that house addressable — and what makes its terms show on the supplier.
        </span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Select
            value={linkBrandId}
            disabled={busy}
            onChange={(e) => setLinkBrandId(e.target.value)}
            aria-label="House to link"
            style={{ ...smallInput, width: 300 }}
          >
            <option value="">Choose a house…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <GhostButton disabled={busy || !linkBrandId} onClick={linkHouse}>
            Link house
          </GhostButton>
        </div>
      </div>

      <ConfirmDialog
        open={target !== null}
        {...dialog}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
        busy={removing}
      />
    </div>
  )
}

// --- sub-components ---------------------------------------------------------

// The five editable columns, identical on create and on edit, so the two forms
// cannot drift apart.
function TermsFields({ values, onChange, disabled }) {
  const set = (key) => (event) => onChange((current) => ({ ...current, [key]: event.target.value }))
  const preview = chainPreview(values.discount_chain)
  const flat = pctText(values.discount === '' ? null : Number(values.discount))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
      <Field
        label="Flat discount"
        hint={values.discount ? `= ${flat} off list` : 'A fraction off list, e.g. 0.4. Blank for none.'}
      >
        <input
          value={values.discount}
          disabled={disabled}
          inputMode="decimal"
          onChange={set('discount')}
          aria-label="Flat discount"
          style={{ ...smallInput, fontFamily: font.mono }}
        />
      </Field>
      <Field
        label="Discount chain"
        hint={preview ? `${preview} — compounded, the server resolves the net` : 'Comma-separated fractions, e.g. 0.4, 0.4. A house is on a flat rate OR a chain, never both.'}
      >
        <input
          value={values.discount_chain}
          disabled={disabled}
          onChange={set('discount_chain')}
          placeholder="0.4, 0.4"
          aria-label="Discount chain"
          style={{ ...smallInput, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Markup" hint="Multiplies the landed cost — Fabricut sit at 2.1–2.5.">
        <input
          value={values.markup}
          disabled={disabled}
          inputMode="decimal"
          onChange={set('markup')}
          aria-label="Markup"
          style={{ ...smallInput, fontFamily: font.mono }}
        />
      </Field>
      <Field label="Note">
        <input
          value={values.note}
          disabled={disabled}
          onChange={set('note')}
          aria-label="Terms note"
          style={smallInput}
        />
      </Field>
      <div style={{ alignSelf: 'end', paddingBottom: 8 }}>
        <CheckField
          label="Indicative"
          checked={values.indicative}
          disabled={disabled}
          onChange={(e) => onChange((current) => ({ ...current, indicative: e.target.checked }))}
        />
      </div>
    </div>
  )
}

// Tiers under one terms row. A tier changes what the whole row resolves to,
// which is why every tier write answers with the PARENT row — and why the note
// after saving one quotes the parent's net multiplier.
function TierEditor({ terms, busy, onAdd, onPatch, onRemove }) {
  const [tierDraft, setTierDraft] = useState(NEW_TIER)
  const tiers = terms.tiers ?? []
  return (
    <div style={{ ...panel, background: c.paper }}>
      <PanelHead label="Discount tiers" />
      {tiers.length === 0 && (
        <PanelNote>No tiers — this house is on the flat rate or the chain above.</PanelNote>
      )}
      {tiers.map((tier) => (
        <div
          key={tier.id}
          style={{ display: 'grid', gridTemplateColumns: '1.4fr 90px 1fr auto', gap: 12, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${c.line}` }}
        >
          <span style={{ fontSize: 12.5, color: c.inkSoft }}>
            {tier.label}
            {tier.is_fallback && <span style={{ color: c.muted }}> (fallback)</span>}
          </span>
          <span style={{ ...monoText, fontSize: 12.5, textAlign: 'right' }}>−{pctText(tier.pct)}</span>
          {/* Advisory, from the API: a label that is neither a category nor the
              fallback can never be selected by the resolver, and there is no
              other way for the office to see that. */}
          <span style={{ ...mutedText, fontSize: 11 }}>
            {tier.matches_category || tier.is_fallback ? '' : 'Matches no category — never selected'}
          </span>
          <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton
              disabled={busy}
              onClick={() => onPatch(tier, { is_fallback: !tier.is_fallback })}
            >
              {tier.is_fallback ? 'Not the fallback' : 'Make fallback'}
            </GhostButton>
            <GhostButton disabled={busy} tone="danger" onClick={() => onRemove(tier)}>
              Delete
            </GhostButton>
          </span>
        </div>
      ))}
      <div style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={tierDraft.label}
          disabled={busy}
          onChange={(e) => setTierDraft((t) => ({ ...t, label: e.target.value }))}
          placeholder="Category or collection"
          aria-label="Tier label"
          style={{ ...smallInput, width: 200 }}
        />
        <input
          value={tierDraft.pct}
          disabled={busy}
          inputMode="decimal"
          onChange={(e) => setTierDraft((t) => ({ ...t, pct: e.target.value }))}
          placeholder="0.4"
          aria-label="Tier rate"
          style={{ ...smallInput, width: 90, fontFamily: font.mono }}
        />
        <CheckField
          label="Fallback"
          checked={tierDraft.is_fallback}
          disabled={busy}
          onChange={(e) => setTierDraft((t) => ({ ...t, is_fallback: e.target.checked }))}
        />
        <GhostButton
          disabled={busy}
          onClick={() => onAdd(terms, tierDraft, () => setTierDraft(NEW_TIER))}
        >
          Add tier
        </GhostButton>
      </div>
    </div>
  )
}
