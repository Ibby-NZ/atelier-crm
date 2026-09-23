// Supplier report — the chooser. Which houses are owed a chase, and how much
// each one owes.
//
//   GET /admin/reserves/suppliers   → { suppliers: [{ supplier, open_lines }] }
//
// One house's report OPENS ON ITS OWN PAGE (AdminReserveSupplierReport,
// /admin/reserves/report/:supplier — 23 Sep 2026, client asked: "for any kind of
// data entry … supplier report … they will open in their own individual page").
// This screen used to be a supplier <select> driving the report table beneath
// it, so a report had no address: it could not be bookmarked, sent to a
// colleague, or come back to with the browser's Back button. Now it is a list,
// and each row is a link.
//
// The list is the API's facet and nothing else: every house with at least one
// OPEN line (requested or confirmed), by name, with the count. A house whose
// every line has arrived, been dispatched or been cancelled is not on it — there
// is nothing to send them. The name is the free-text snapshot on the line, so
// it is what the link carries (URL-encoded by `reportRoute`); there is no
// supplier id on a reserve line to key it by.
//
// `?supplier=` is honoured as a redirect to the house's page, so a link built
// the way the API addresses the report still lands.
//
// "Could not reach the API" and "there is nothing to chase" are opposite
// answers and get different panels — same rule the Report Library states.

import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { c, font } from '../theme.js'
import { PageHeader } from '../components/ui.jsx'
import { SectionTabs, stockTabs } from '../components/sectionTabs.jsx'
import { apiGet } from '../lib/api.js'
import {
  GhostButton,
  HeaderRow,
  PanelHead,
  PanelNote,
  Row,
  messageOf,
  panel,
} from '../admin/parts.jsx'
import { RESERVE_SUPPLIERS_PATH, openLinesLabel, reportRoute } from './reserveFlow.js'

const COLUMNS = '1.6fr 1fr 110px'

export default function AdminReserveReport() {
  const [searchParams] = useSearchParams()
  const legacySupplier = searchParams.get('supplier')

  const [suppliers, setSuppliers] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // A `?supplier=` visit renders the redirect below and never needs the list.
    if (legacySupplier) return undefined
    let active = true
    apiGet(RESERVE_SUPPLIERS_PATH)
      .then((body) => {
        if (active) setSuppliers(body.suppliers ?? [])
      })
      .catch((err) => {
        if (active) {
          setSuppliers([])
          setError(messageOf(err, 'Could not load the supplier list.'))
        }
      })
    return () => {
      active = false
    }
  }, [legacySupplier])

  if (legacySupplier) return <Navigate to={reportRoute(legacySupplier)} replace />

  return (
    <div>
      <PageHeader
        eyebrow="Stock · live"
        title={<>Supplier report</>}
        subtitle="Everything still expected from one house — open reserves and cuttings with their references — ready to send when a shipment is being closed. Open a house to read its report and download the CSV."
      />
      <SectionTabs tabs={stockTabs} active="report" />

      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <section style={panel}>
          <PanelHead
            label="Houses with open lines"
            right={
              suppliers && suppliers.length > 0 ? (
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {suppliers.length.toLocaleString('en-NZ')} house{suppliers.length === 1 ? '' : 's'}
                </span>
              ) : null
            }
          />
          {suppliers === null && <PanelNote>Loading the supplier list…</PanelNote>}
          {error && <PanelNote tone="danger">{error}</PanelNote>}
          {suppliers !== null && suppliers.length === 0 && !error && (
            <PanelNote>No open reserve or cutting lines anywhere — there is nothing to chase.</PanelNote>
          )}
          {suppliers !== null && suppliers.length > 0 && (
            <>
              <HeaderRow columns={COLUMNS} labels={['Supplier', 'Still expected', '']} />
              {suppliers.map((row) => (
                <Row key={row.supplier} columns={COLUMNS}>
                  <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Link
                      to={reportRoute(row.supplier)}
                      className="ab-link"
                      style={{ color: c.ink, textDecoration: 'none' }}
                    >
                      {row.supplier}
                    </Link>
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.inkSoft }}>
                    {openLinesLabel(row.open_lines)}
                  </span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Link to={reportRoute(row.supplier)} style={{ textDecoration: 'none' }}>
                      <GhostButton>Open</GhostButton>
                    </Link>
                  </span>
                </Row>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
