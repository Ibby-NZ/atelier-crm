// Categories — the merchandising vocabulary, drawn the way Collections is: one
// row per category, what it holds, and Delete on the row.
//
//   GET    /admin/categories        → { categories: [{ slug, label, sort, product_count }] }
//   POST   /admin/categories        → { category }           (label in, slug derived)
//   DELETE /admin/categories/:slug  → { deleted } | 409 { blockers }
//
// Three things this screen used to be, and is not:
//   - **It had no create and no Delete**, because the vocabulary was a CHECK
//     constraint shared by three API tables and a tenth word was a migration.
//     It is `product_categories` now, so both are forms.
//   - **It offered a "Move to" select per product.** Moving a design between
//     categories is an edit to the DESIGN, and it already lives on the design —
//     Products → the row's Category field. Two places to do one thing is how the
//     two start disagreeing about which is authoritative.
//   - **It counted products itself**, out of a products list it fetched and
//     grouped client-side. The count comes from the API now, so the number on
//     the row is the whole catalogue's rather than the loaded page's.
//
// Deleting is the API's call: it probes products, price list lines and freight
// rates and answers 409 with blockers while any of them still carries the
// category. The count is the warning; ConfirmDialog carries the refusal.
//
// Rules live in ./adminCategories.js, tested there; this file is layout.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiSend } from '../lib/api.js'
import ConfirmDialog from '../admin/ConfirmDialog.jsx'
import { useCrudScreen } from '../admin/useCrudScreen.js'
import {
  CATEGORIES_PATH,
  SHEET_PATH,
  canDelete,
  categoryPath,
  countLabel,
  describeCategory,
  newCategoryBody,
  productsPath,
} from './adminCategories.js'
import {
  ErrorLine,
  Field,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  inputStyle,
  monoText,
  mutedText,
  panel,
} from '../admin/parts.jsx'

// Category · Web address · Products · Delete.
const CATEGORY_COLUMNS = '1.4fr 1fr 1fr 120px'

export default function AdminCategories() {
  const [label, setLabel] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')

  // The list, the toast and the whole delete flow. No `archive` action: a
  // category is a word, not a record with a history, and the API offers no
  // archive arm to fall back to.
  const crud = useCrudScreen({
    path: CATEGORIES_PATH,
    key: 'categories',
    entity: 'category',
    describe: describeCategory,
    deletePath: (category) => categoryPath(category.slug),
  })
  const categories = crud.list.rows
  const { message } = crud.toast
  const { busy, run } = crud.mutation

  const createCategory = async (event) => {
    event.preventDefault()
    const result = newCategoryBody(label, categories)
    if (result.error) return setError(result.error)
    setError('')
    const ok = await run(
      () => apiSend('POST', CATEGORIES_PATH, result.body),
      (res) => `${describeCategory(res.category)} added — web address ${res.category.slug}.`
    )
    if (ok) {
      setLabel('')
      setShowNew(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title="Categories"
        subtitle="The axis a shopper browses by. Add the words this catalogue needs and delete the ones it does not; a design is put into one on its own page, under Products."
      />
      <SectionTabs tabs={catalogueTabs} active="categories" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Add a category"
            right={
              <GhostButton
                disabled={busy}
                onClick={() => {
                  setShowNew((open) => !open)
                  setError('')
                }}
              >
                {showNew ? 'Cancel' : 'New category'}
              </GhostButton>
            }
          />
          {showNew && (
            <form onSubmit={createCategory} style={{ padding: 20 }}>
              <Field
                label="Name"
                hint="The web address is generated from it and is fixed afterwards — it is the value stored on every product, price list line and freight rate in this category."
              >
                <input
                  value={label}
                  disabled={busy}
                  onChange={(e) => setLabel(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Area rug"
                  maxLength={60}
                />
              </Field>
              <ErrorLine style={{ marginTop: 14 }}>{error}</ErrorLine>
              <div style={{ marginTop: 18 }}>
                <GhostButton type="submit" tone="accent" disabled={busy}>
                  Add category
                </GhostButton>
              </div>
            </form>
          )}
        </section>

        <section style={panel}>
          <PanelHead
            label="Categories"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Link
                  to={SHEET_PATH}
                  className="ab-link"
                  style={{ fontSize: 12.5, color: c.accentDeep, whiteSpace: 'nowrap' }}
                >
                  Fill in by spreadsheet →
                </Link>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
                </span>
              </span>
            }
          />
          {crud.mutation.error && (
            <ErrorLine style={{ padding: '12px 20px' }}>{crud.mutation.error}</ErrorLine>
          )}
          {crud.list.status === 'loading' && <PanelNote>Loading categories…</PanelNote>}
          {crud.list.status === 'error' && <PanelNote tone="danger">{crud.list.error}</PanelNote>}

          {crud.list.status === 'ready' && (
            <>
              <HeaderRow
                columns={CATEGORY_COLUMNS}
                labels={['Category', 'Web address', 'Products', '']}
              />
              {categories.length === 0 && <PanelNote>No categories yet.</PanelNote>}
              {categories.map((category) => (
                <Row key={category.slug} columns={CATEGORY_COLUMNS}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>
                    {category.label}
                  </span>
                  <span style={monoText}>{category.slug}</span>
                  {/* The count is a door: the designs in a category are edited
                      on the Products list, filtered to it. */}
                  {category.product_count > 0 ? (
                    <Link
                      to={productsPath(category.slug)}
                      className="ab-link"
                      style={{ ...mutedText, color: c.accentDeep, textDecoration: 'none' }}
                    >
                      {countLabel(category.product_count)}
                    </Link>
                  ) : (
                    <span style={mutedText}>{countLabel(category.product_count)}</span>
                  )}
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {/* The permanent verb is the QUIET one on the row, the
                        AdminCollections rule (15 Sep 2026 audit, CRM-07): the
                        danger colour belongs to the dialog it opens. Disabled
                        rather than hidden while designs still carry the
                        category — the reason is the number in the cell beside
                        it, and a button that vanishes reads as a permission the
                        office does not have. */}
                    <GhostButton
                      disabled={busy || !canDelete(category)}
                      style={{ border: 'none', color: c.muted }}
                      onClick={() => crud.remove.ask(category)}
                    >
                      Delete
                    </GhostButton>
                  </span>
                </Row>
              ))}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog {...crud.remove.dialog} />
      <ToastLine message={message} />
    </div>
  )
}
