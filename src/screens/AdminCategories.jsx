// Categories — the merchandising axis, drawn the way Collections is: one row
// per category with a count, a house filter, and an expanded panel listing
// what sits in it. The list is the whole products read
// (`GET /admin/products`, brand-filtered server-side like Collections) grouped
// client-side; the only write is moving a product between categories through
// `PATCH /admin/products/:id`, the same call the Products editor makes.
//
// There is no create form and no Delete: the vocabulary is a CHECK constraint
// shared by three API tables (`src/lib/categories.js`), so a new category is a
// migration. The spreadsheet round trip that fills categories in bulk keeps its
// own page (`/admin/product-sheet`), linked from the list head.
//
// Rules live in ./adminCategories.js, tested there; this file is layout.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, catalogueTabs } from '../components/sectionTabs.jsx'
import { apiFetch, apiSend } from '../lib/api.js'
import { CATEGORY_OPTIONS } from '../lib/categories.js'
import { useAdminList } from '../admin/useAdminList.js'
import { CATALOGUE_LIST_LIMIT, productListFilters } from './adminCatalogue.js'
import { productPath } from './adminOrders.js'
import {
  SHEET_PATH,
  UNCATEGORISED,
  categoryPatch,
  categoryRows,
  countLabel,
  describeProduct,
  productsIn,
} from './adminCategories.js'
import {
  Select,
  ArchivedTag,
  ErrorLine,
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  ToastLine,
  cellInput,
  monoText,
  mutedText,
  panel,
  useMutation,
  useToast,
} from '../admin/parts.jsx'

// Category · Web address · Products · Open/Close.
const CATEGORY_COLUMNS = '1.4fr 1fr 1fr auto'
// House · Design · Web address · Move to.
const PRODUCT_COLUMNS = '1fr 1.4fr 1fr 180px'

export default function AdminCategories() {
  // The house filter lives in the URL, the AdminCollections rule, so a link
  // in from Houses narrows the list even when this screen is already mounted.
  const [searchParams, setSearchParams] = useSearchParams()
  const brandFilter = searchParams.get('brand_id') ?? ''
  const [showArchived, setShowArchived] = useState(false)
  const [brands, setBrands] = useState([])
  const [openValue, setOpenValue] = useState(null)

  const list = useAdminList({
    path: '/admin/products',
    key: 'products',
    limit: CATALOGUE_LIST_LIMIT,
    filters: productListFilters(brandFilter, showArchived),
  })
  const rows = categoryRows(list.rows)
  const { message, flash } = useToast()
  const { busy, error, setError, run } = useMutation({ reload: list.reload, flash })

  const setBrandFilter = (value) =>
    setSearchParams(value ? { brand_id: value } : {}, { replace: true })

  useEffect(() => {
    let active = true
    apiFetch('/admin/brands')
      .then((body) => {
        if (active) setBrands(body.brands ?? [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const toggle = (value) => {
    setError('')
    setOpenValue((open) => (open === value ? null : value))
  }

  const move = (product, value) =>
    run(
      () => apiSend('PATCH', `/admin/products/${product.id}`, categoryPatch(value)),
      () => `${describeProduct(product)} moved.`
    )

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue · live"
        title="Categories"
        subtitle="The axis a shopper browses by. Open a category to see the designs in it and move any of them; the vocabulary itself is fixed."
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.inkSoft, whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{' '}
            Show archived
          </label>
        }
      />
      <SectionTabs tabs={catalogueTabs} active="categories" />

      <div style={{ display: 'grid', gap: 26, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Categories"
            right={
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Link to={SHEET_PATH} className="ab-link" style={{ fontSize: 12.5, color: c.accentDeep, whiteSpace: 'nowrap' }}>
                  Update by spreadsheet →
                </Link>
                <Select
                  value={brandFilter}
                  disabled={busy}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  style={{ ...cellInput, width: 200 }}
                  aria-label="Filter by house"
                >
                  <option value="">All houses</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {list.total} design{list.total === 1 ? '' : 's'}
                </span>
              </span>
            }
          />
          {error && <ErrorLine style={{ padding: '12px 20px' }}>{error}</ErrorLine>}
          {list.status === 'loading' && <PanelNote>Loading categories…</PanelNote>}
          {list.status === 'error' && <PanelNote tone="danger">{list.error}</PanelNote>}

          {list.status === 'ready' && (
            <>
              <HeaderRow columns={CATEGORY_COLUMNS} labels={['Category', 'Web address', 'Products', '']} />
              {rows.map((row) => {
                const open = openValue === row.value
                const products = open ? productsIn(list.rows, row.value) : []
                return (
                  <div key={row.value || 'uncategorised'}>
                    <Row columns={CATEGORY_COLUMNS}>
                      <button
                        type="button"
                        onClick={() => toggle(row.value)}
                        aria-expanded={open}
                        className="ab-t"
                        style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{row.label}</span>
                      </button>
                      <span style={monoText}>{row.value || '—'}</span>
                      <span style={mutedText}>{countLabel(row.count)}</span>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <GhostButton disabled={busy} onClick={() => toggle(row.value)}>
                          {open ? 'Close' : 'Edit'}
                        </GhostButton>
                      </span>
                    </Row>

                    {open && (
                      <div style={{ background: c.surface, borderBottom: `1px solid ${c.line}` }}>
                        {products.length === 0 ? (
                          <PanelNote>No designs in this category{brandFilter ? ' for this house' : ''}.</PanelNote>
                        ) : (
                          <>
                            <HeaderRow columns={PRODUCT_COLUMNS} labels={['House', 'Design', 'Web address', 'Move to']} />
                            {products.map((product) => (
                              <Row key={product.id} columns={PRODUCT_COLUMNS} archived={Boolean(product.archived_at)}>
                                <span style={{ ...mutedText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {product.brand_name}
                                </span>
                                <Link
                                  to={productPath(product.id)}
                                  className="ab-link"
                                  style={{ fontSize: 13.5, fontWeight: 600, color: c.ink, textDecoration: 'none', minWidth: 0 }}
                                >
                                  {product.name}
                                  {product.archived_at && <ArchivedTag />}
                                </Link>
                                <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {product.slug}
                                </span>
                                <Select
                                  value={product.category ?? UNCATEGORISED}
                                  disabled={busy}
                                  onChange={(e) => move(product, e.target.value)}
                                  style={cellInput}
                                  aria-label={`Category for ${describeProduct(product)}`}
                                >
                                  <option value={UNCATEGORISED}>Uncategorised</option>
                                  {CATEGORY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </Row>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </section>
      </div>

      <ToastLine message={message} />
    </div>
  )
}
