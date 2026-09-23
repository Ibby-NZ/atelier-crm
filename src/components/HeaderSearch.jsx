// The search lives in the bar (client, Sept 2026: "not another page — search in
// the bar and it shows recommendations in a dropdown"). It asks the live API,
// not a demo index: four lists that take `q` — colourways (a design by name,
// SKU or house), clients, orders and suppliers — five hits each, in parallel,
// after 220ms of quiet typing. Arrow keys move, Enter opens, Escape closes; a
// click anywhere else closes. Nothing is fetched for fewer than two characters.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api.js'
import { IconSearch } from './icons.jsx'

const SOURCES = [
  { key: 'colourways', label: 'Designs', path: (q) => `/admin/colourways?q=${q}&limit=5`, list: (b) => b.colourways ?? [],
    hit: (r) => ({ id: `cw-${r.id}`, title: r.product_name ? `${r.product_name} — ${r.name}` : r.name, meta: [r.brand_name, r.product_slug].filter(Boolean).join(' · '), sub: r.sku, to: r.product_id != null ? `/admin/products/${r.product_id}` : '/admin/products' }) },
  { key: 'users', label: 'Clients', path: (q) => `/admin/users?q=${q}&limit=5`, list: (b) => b.users ?? [],
    hit: (r) => ({ id: `user-${r.id}`, title: r.name || r.email, meta: [r.email, r.role].filter(Boolean).join(' · '), sub: '', to: `/clients/${r.id}` }) },
  { key: 'orders', label: 'Orders', path: (q) => `/admin/orders?q=${q}&limit=5`, list: (b) => b.orders ?? [],
    hit: (r) => ({ id: `order-${r.id}`, title: r.order_number, meta: [r.contact_name || r.contact_email, r.status].filter(Boolean).join(' · '), sub: '', to: `/admin/orders/${r.id}` }) },
  { key: 'suppliers', label: 'Suppliers', path: (q) => `/admin/suppliers?q=${q}&limit=5`, list: (b) => b.suppliers ?? [],
    hit: (r) => ({ id: `sup-${r.id}`, title: r.name, meta: [r.country, r.currency].filter(Boolean).join(' · '), sub: '', to: `/admin/suppliers/${r.id}` }) },
]

export default function HeaderSearch() {
  const navigate = useNavigate()
  const wrapRef = useRef(null)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cursor, setCursor] = useState(-1)

  const q = query.trim()
  useEffect(() => {
    if (q.length < 2) { setGroups([]); setBusy(false); return }
    let active = true
    setBusy(true)
    const timer = setTimeout(async () => {
      const enc = encodeURIComponent(q)
      const results = await Promise.all(SOURCES.map(async (source) => {
        try {
          const body = await apiFetch(source.path(enc))
          return { key: source.key, label: source.label, hits: source.list(body).slice(0, 5).map(source.hit) }
        } catch { return { key: source.key, label: source.label, hits: [] } }
      }))
      if (!active) return
      setGroups(results.filter((g) => g.hits.length > 0))
      setBusy(false)
      setCursor(-1)
    }, 220)
    return () => { active = false; clearTimeout(timer) }
  }, [q])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups])
  const go = (hit) => { setOpen(false); setQuery(''); navigate(hit.to) }
  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); return }
    if (!flat.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => (i + 1) % flat.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => (i - 1 + flat.length) % flat.length) }
    if (e.key === 'Enter') { e.preventDefault(); go(flat[cursor >= 0 ? cursor : 0]) }
  }

  const showMenu = open && q.length >= 2
  return (
    <div ref={wrapRef} className="ab-search r-hdr-search" role="search">
      <span className="ab-search-icon"><IconSearch size={14} color="currentColor" /></span>
      <input
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search designs, clients, orders…"
        aria-label="Search"
        aria-expanded={showMenu}
        aria-controls="header-search-menu"
        autoComplete="off"
      />
      {showMenu && (
        <div id="header-search-menu" className="ab-search-menu" role="listbox">
          {busy && !groups.length && <div className="ab-search-note">Searching…</div>}
          {!busy && !groups.length && <div className="ab-search-note">Nothing matches “{q}”.</div>}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="ab-search-group">{g.label}</div>
              {g.hits.map((hit) => {
                const index = flat.indexOf(hit)
                return (
                  <button key={hit.id} type="button" role="option" aria-selected={index === cursor} className="ab-search-hit"
                    onMouseEnter={() => setCursor(index)} onClick={() => go(hit)}>
                    <span style={{ minWidth: 0 }}>
                      <span className="ab-search-hit-title">{hit.title}</span>
                      {hit.meta && <span className="ab-search-hit-meta" style={{ display: 'block' }}>{hit.meta}</span>}
                    </span>
                    {hit.sub && <span className="ab-search-hit-sub">{hit.sub}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
