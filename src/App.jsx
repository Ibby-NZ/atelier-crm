import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import { InternalLayout, BrandLayout } from './components/layout.jsx'
import { RequireAuth, RequireCap } from './auth/guards.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import { CAPS } from './auth/roles.js'

import Login from './screens/Login.jsx'
import ForgotPassword from './screens/ForgotPassword.jsx'
import ResetPassword from './screens/ResetPassword.jsx'
import Dashboard from './screens/Dashboard.jsx'
import PricingWaterfall from './screens/PricingWaterfall.jsx'
import PricingParameters from './screens/PricingParameters.jsx'
import Catalogue from './screens/Catalogue.jsx'
import SalesOrderNew from './screens/SalesOrderNew.jsx'
import SalesOrder from './screens/SalesOrder.jsx'
import Reporting from './screens/Reporting.jsx'
import ReportLibrary from './screens/ReportLibrary.jsx'
import PriceListImport from './screens/PriceListImport.jsx'
import ClientNew from './screens/ClientNew.jsx'
import ClientAccount from './screens/ClientAccount.jsx'
import AccountDetails from './screens/AccountDetails.jsx'
import UserManagement from './screens/UserManagement.jsx'
import SampleScanner from './screens/SampleScanner.jsx'
import Archive from './screens/Archive.jsx'
import ClientCompanies from './screens/ClientCompanies.jsx'
import ClientCompany from './screens/ClientCompany.jsx'
import ClientCompanyNew from './screens/ClientCompanyNew.jsx'
import { PENDING_ACCOUNTS } from './screens/clientCompanies.js'
import Contacts from './screens/Contacts.jsx'
import Contact from './screens/Contact.jsx'
import ContactNew from './screens/ContactNew.jsx'
// Live back-office screens: these read AND write the platform's own tables via
// atelier-api's /admin/* endpoints, unlike the Dynamics mirrors beside them.
// Access is enforced server-side by requireRole('backoffice'); every CRM login
// is already staff (see AuthContext's STAFF_ROLE_MAP), so they need no extra
// RequireCap on top of the RequireAuth the layout provides.
import AdminBrands from './screens/AdminBrands.jsx'
import AdminBrand from './screens/AdminBrand.jsx'
import AdminBrandNew from './screens/AdminBrandNew.jsx'
import AdminCollections from './screens/AdminCollections.jsx'
import AdminCollection from './screens/AdminCollection.jsx'
import AdminCollectionNew from './screens/AdminCollectionNew.jsx'
import AdminProducts from './screens/AdminProducts.jsx'
import AdminProduct from './screens/AdminProduct.jsx'
import AdminProductNew from './screens/AdminProductNew.jsx'
import AdminStock from './screens/AdminStock.jsx'
import AdminReserves from './screens/AdminReserves.jsx'
import AdminReserve from './screens/AdminReserve.jsx'
import AdminReserveNew from './screens/AdminReserveNew.jsx'
import AdminReserveReport from './screens/AdminReserveReport.jsx'
import AdminReserveSupplierReport from './screens/AdminReserveSupplierReport.jsx'
import AdminPriceListItems from './screens/AdminPriceListItems.jsx'
import AdminPriceListItem from './screens/AdminPriceListItem.jsx'
import AdminPriceListItemNew from './screens/AdminPriceListItemNew.jsx'
import AdminOrders from './screens/AdminOrders.jsx'
import AdminOrderNew from './screens/AdminOrderNew.jsx'
import AdminOrder from './screens/AdminOrder.jsx'
import AdminSampleRequests from './screens/AdminSampleRequests.jsx'
import AdminSampleRequest from './screens/AdminSampleRequest.jsx'
import AdminSuppliers from './screens/AdminSuppliers.jsx'
import AdminSupplier from './screens/AdminSupplier.jsx'
import AdminSupplierNew from './screens/AdminSupplierNew.jsx'
import AdminPurchaseOrders from './screens/AdminPurchaseOrders.jsx'
import AdminPurchaseOrderNew from './screens/AdminPurchaseOrderNew.jsx'
import AdminBulkOrders from './screens/AdminBulkOrders.jsx'
import AdminBulkOrder from './screens/AdminBulkOrder.jsx'
import AdminPurchaseOrder from './screens/AdminPurchaseOrder.jsx'
import AdminSupplierInvoices from './screens/AdminSupplierInvoices.jsx'
import AdminSupplierInvoiceNew from './screens/AdminSupplierInvoiceNew.jsx'
import AdminSupplierInvoice from './screens/AdminSupplierInvoice.jsx'
import AdminShipping from './screens/AdminShipping.jsx'
import AdminFreight from './screens/AdminFreight.jsx'
import AdminFreightRateNew from './screens/AdminFreightRateNew.jsx'
import AdminProductSheet from './screens/AdminProductSheet.jsx'
import AdminCategories from './screens/AdminCategories.jsx'
import AdminSamples from './screens/AdminSamples.jsx'
import AdminSample from './screens/AdminSample.jsx'
import AdminSampleNew from './screens/AdminSampleNew.jsx'
import AdminShowrooms from './screens/AdminShowrooms.jsx'
import AdminShowroom from './screens/AdminShowroom.jsx'
import AdminShowroomNew from './screens/AdminShowroomNew.jsx'
import AdminSampleOrders from './screens/AdminSampleOrders.jsx'
import AdminSampleOrder from './screens/AdminSampleOrder.jsx'
import AdminSampleOrderNew from './screens/AdminSampleOrderNew.jsx'
import AdminXero from './screens/AdminXero.jsx'
import AdminSampleLoans from './screens/AdminSampleLoans.jsx'
import AdminLetterTemplates from './screens/AdminLetterTemplates.jsx'
import AdminLetterTemplate from './screens/AdminLetterTemplate.jsx'
import LibraryBrowse from './screens/LibraryBrowse.jsx'
import ProductPage from './screens/ProductPage.jsx'
import ProjectFolder from './screens/ProjectFolder.jsx'
import Journal from './screens/Journal.jsx'
import JournalStory from './screens/JournalStory.jsx'
import Storefront from './screens/Storefront.jsx'
import MyAccount from './screens/MyAccount.jsx'
import Collections from './screens/Collections.jsx'
import SampleRequest from './screens/SampleRequest.jsx'

// The CRM has no public landing page. `/` is a decision, not a screen: a visitor
// with no session lands on the sign-in form, a cached session goes straight to the
// operations dashboard. It waits on `loading` for the same reason RequireAuth does —
// GET /auth/me is still in flight on a hard refresh, and redirecting before it
// answers would bounce a signed-in user to /login every time they reload.
function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function InsightRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/reporting${search}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      {/* The two halves of a password reset, reachable signed-out: the first
          asks for the email, the second lands from the emailed link with
          ?token=. Outside RequireAuth on purpose — the whole point is that the
          person cannot sign in. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Internal operations tool (SideNav + TopBar) — staff only, individual logins (GEN-01).
          RequireAuth wraps the layout, so every internal route below inherits the gate and a
          new screen cannot be added un-guarded by forgetting a wrapper. Routes needing a
          capability on top of "signed in" carry their own RequireCap. */}
      <Route element={<RequireAuth><InternalLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account-details" element={<AccountDetails />} />
        <Route path="/users" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="User administration is admin-only"
            reason="Adding, removing and re-roling logins changes who can reach pricing, cost and reporting across the whole app, so it sits with the Director account alone."
            hint="Director only. Finance and User roles cannot manage accounts." >
            <UserManagement />
          </RequireCap>} />
        {/* The Applicants queue is gone (Sept 2026): a trade application raises
            its company on submission and is reviewed on the Accounts row, so
            both old paths land on the roster narrowed to the review queue. A
            bookmark must not fall through to the catch-all, which would
            silently land the operator on the dashboard as though the screen
            had been deleted. */}
        <Route path="/users/applicants" element={<Navigate to={PENDING_ACCOUNTS} replace />} />
        <Route path="/pricing" element={
          <RequireCap cap={CAPS.FINANCE_VIEW}
            title="The waterfall is finance"
            reason="Every step it shows — supplier discount, exchange rate, duty, freight, clearance, landed cost, markups — is cost. There is no version of this screen without the figures, so it is closed to your role rather than masked."
            hint="Director and Finance only. Trade and retail sell prices are on Catalogue and Price Lists." >
            <PricingWaterfall />
          </RequireCap>} />
        <Route path="/catalogue" element={<Catalogue />} />
        {/* The Dynamics mirror lists are folded into the Archive (Sept 2026, in
            preparation for going live): the working sections are live-only and
            the incumbent's data is browsed in one place, /archive. The four old
            list routes redirect there with their entity preselected, so a
            bookmark still lands on the same data. The per-record correction
            screens below (/sales-orders/:id, /clients/:id) stay, reached from
            the Archive's record drawer. */}
        <Route path="/sales-orders" element={<Navigate to="/archive/sales_orders" replace />} />
        <Route path="/sales-orders/new" element={<SalesOrderNew />} />
        <Route path="/sales-orders/:id" element={<SalesOrder />} />
        {/* The demo purchase-order screens are retired: W13 shipped the whole
            purchasing API and these three paths now redirect to the live
            screens rather than falling into the catch-all, which would land a
            bookmark on the dashboard as though the section had been deleted —
            the same rule /samples and /users/applicants follow. A demo id was
            a localStorage key and names nothing live, so the detail path
            redirects to the list. Their files sit on disk unrouted. */}
        <Route path="/purchase-orders" element={<Navigate to="/admin/purchase-orders" replace />} />
        <Route path="/purchase-orders/new" element={<Navigate to="/admin/purchase-orders/new" replace />} />
        <Route path="/purchase-orders/:id" element={<Navigate to="/admin/purchase-orders" replace />} />
        <Route path="/reserves" element={<Navigate to="/archive/stock_items" replace />} />
        {/* The demo Cutting screen is retired (Sept 2026): invented roll
            balances beside the live dockets, and the cutting PROCESS is still
            unscoped. Cutting requests live on the reserves dockets. */}
        <Route path="/cutting" element={<Navigate to="/admin/reserves" replace />} />
        {/* The demo supplier master is retired (Sept 2026): the client read its
            invented brand roll-up as ours. The live screen is /admin/suppliers,
            and a bookmark on the old path redirects rather than falling into
            the catch-all — the /purchase-orders rule. */}
        <Route path="/suppliers" element={<Navigate to="/admin/suppliers" replace />} />
        {/* The overview carries the insight (one subject, every angle) beneath
            the FY roll-ups; the old /reporting/insight bookmark redirects with
            its subject intact. */}
        <Route path="/reporting" element={<Reporting />} />
        <Route path="/reporting/library" element={<ReportLibrary />} />
        <Route path="/reporting/insight" element={<InsightRedirect />} />
        <Route path="/price-lists" element={<Navigate to="/archive/product_prices" replace />} />
        {/* The Dynamics range parameters, as a reference beside the office's own
            (which live on /pricing). Finance-gated by the API; the screen locks.
            Hidden from the sidebar (23 Sep 2026) but kept for bookmarks. */}
        <Route path="/price-lists/parameters" element={<PricingParameters />} />
        <Route path="/import" element={
          <RequireCap cap={CAPS.PRICELIST_IMPORT}
            title="Importing a price list changes pricing"
            reason="A staged import republishes supplier cost and sell prices across every SKU in the range, so it sits with the roles that own pricing."
            hint="Director and Finance only. You can still read the published price lists." >
            <PriceListImport />
          </RequireCap>} />
        {/* Clients section: two LIVE tabs, Accounts and Contacts. The Clients
            tab (portal logins) and Applicants (the review queue) folded into
            Accounts in Sept 2026 — a login is edited on the company it belongs
            to, and an application is reviewed on the company it raised — so
            /clients and /clients/applicants redirect rather than fall through
            to the catch-all. React Router v6 ranks routes by specificity, not
            declaration order, so /clients/new and /clients/legacy beat
            /clients/:id whatever the order here — verified with matchRoutes
            against these exact paths. They are still written above the dynamic
            route so the reading order matches the resolution order. */}
        <Route path="/clients" element={<Navigate to="/clients/accounts" replace />} />
        <Route path="/clients/applicants" element={<Navigate to={PENDING_ACCOUNTS} replace />} />
        <Route path="/clients/new" element={<ClientNew />} />
        <Route path="/clients/legacy" element={<Navigate to="/archive/accounts" replace />} />
        {/* The client roster — every company, live in trade_accounts since the
            cutover merge, each (on its own page) with its logins, its
            application and its contact book. Director-gated: it creates,
            re-roles and archives real logins. */}
        <Route path="/clients/accounts" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="The client roster carries every company's contacts, terms and portal logins, and approving a login unlocks trade pricing, so it sits with the Director account alone."
            hint="Director only. Finance and User roles cannot manage accounts." >
            <ClientCompanies />
          </RequireCap>} />
        {/* One company on its own page, and "New account" on another (23 Sep
            2026: the client asked for every record on its own page). Both wear
            the roster's gate — the page edits the same logins, the form raises
            a company. /new beats /:id by specificity, and neither can meet the
            Dynamics /clients/:id below, which is a segment shorter. */}
        <Route path="/clients/accounts/new" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="The client roster carries every company's contacts, terms and portal logins, and approving a login unlocks trade pricing, so it sits with the Director account alone."
            hint="Director only. Finance and User roles cannot manage accounts." >
            <ClientCompanyNew />
          </RequireCap>} />
        <Route path="/clients/accounts/:id" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="The client roster carries every company's contacts, terms and portal logins, and approving a login unlocks trade pricing, so it sits with the Director account alone."
            hint="Director only. Finance and User roles cannot manage accounts." >
            <ClientCompany />
          </RequireCap>} />
        {/* The whole address book — every person, filed or not. */}
        <Route path="/clients/contacts" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="The address book carries every client contact's details, so it sits with the Director account alone."
            hint="Director only." >
            <Contacts />
          </RequireCap>} />
        {/* One contact on its own page, and "Add contact" on another (23 Sep
            2026, the same request as the accounts above). Both wear the
            address book's gate; /new beats /:id by specificity. */}
        <Route path="/clients/contacts/new" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="The address book carries every client contact's details, so it sits with the Director account alone."
            hint="Director only." >
            <ContactNew />
          </RequireCap>} />
        <Route path="/clients/contacts/:id" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="The address book carries every client contact's details, so it sits with the Director account alone."
            hint="Director only." >
            <Contact />
          </RequireCap>} />
        <Route path="/clients/:id" element={<ClientAccount />} />
        {/* The demo Tracking and Showroom screens are retired: their routes
            redirect to the live register and sample orders rather than falling
            into the catch-all, which would silently land a bookmark on the
            dashboard as though the screen had been deleted — the same rule
            /users/applicants follows above. The scanner stays on its own route,
            rewired to the real endpoints. */}
        <Route path="/samples" element={<Navigate to="/admin/samples" replace />} />
        <Route path="/sample-scanner" element={<SampleScanner />} />
        {/* The Dynamics archive: all twelve staging tables, any column
            filterable, the view in the URL. /archive alone opens the default
            entity; the entity segment is what the picker navigates. */}
        <Route path="/archive" element={<Archive />} />
        <Route path="/archive/:entity" element={<Archive />} />
        <Route path="/showroom-samples" element={<Navigate to="/admin/sample-orders" replace />} />

        {/* Live platform data (atelier-api). Grouped under /admin so a route is
            unambiguously the writable one, not the Dynamics mirror. */}
        <Route path="/admin/brands" element={<AdminBrands />} />
        {/* One house on its own page, and a new one on its own form (23 Sep
            2026). The featured strips stay on the list: they order the whole
            catalogue, not one house. */}
        <Route path="/admin/brands/new" element={<AdminBrandNew />} />
        <Route path="/admin/brands/:id" element={<AdminBrand />} />
        {/* Distinct from the brand world's demo /collections screen: this one is
            live, writable and house-scoped via ?brand_id=. */}
        <Route path="/admin/collections" element={<AdminCollections />} />
        {/* One collection on its own page, and a new one on its own form (23
            Sep 2026); /new takes the list's ?brand_id= to pre-pick the house. */}
        <Route path="/admin/collections/new" element={<AdminCollectionNew />} />
        <Route path="/admin/collections/:id" element={<AdminCollection />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        {/* One design on its own page, and a new one on its own form (23 Sep
            2026): the editor used to open under its row and the create form
            above the list. The list redirects its old ?open=<id> here. */}
        <Route path="/admin/products/new" element={<AdminProductNew />} />
        <Route path="/admin/products/:id" element={<AdminProduct />} />
        <Route path="/admin/stock" element={<AdminStock />} />
        {/* Live reserves & cuttings — the docket list, its account-first create
            form, and the per-supplier report. The Dynamics stock mirror keeps
            /reserves as "Dynamics (historical)" on the same tab strip. */}
        <Route path="/admin/reserves" element={<AdminReserves />} />
        <Route path="/admin/reserves/new" element={<AdminReserveNew />} />
        <Route path="/admin/reserves/report" element={<AdminReserveReport />} />
        {/* One house's report on its own page (23 Sep 2026): the chooser used
            to drive the table from a <select>, so a report had no address.
            :supplier is the line's free-text snapshot, URL-encoded. */}
        <Route path="/admin/reserves/report/:supplier" element={<AdminReserveSupplierReport />} />
        {/* One docket on its own page (23 Sep 2026): its fields, lines, moves
            and "+ Cutting" used to open in place under the list row. /new and
            /report are static, so they outrank :id. */}
        <Route path="/admin/reserves/:id" element={<AdminReserve />} />
        <Route path="/admin/price-lists" element={<AdminPriceListItems />} />
        {/* One supplier rate on its own page, and a rate keyed by hand on its
            own page — both used to open inside the list, the editor under its
            row and the create form above the table (client, 23 Sep 2026).
            /new beats /:id by specificity. Not /price-lists/parameters: that
            is the Dynamics reference, a different screen. */}
        <Route path="/admin/price-lists/new" element={<AdminPriceListItemNew />} />
        <Route path="/admin/price-lists/:id" element={<AdminPriceListItem />} />
        <Route path="/admin/orders" element={<AdminOrders />} />
        {/* The live create form. Not to be confused with /sales-orders/new,
            which is the demo screen writing to localStorage. */}
        <Route path="/admin/orders/new" element={<AdminOrderNew />} />
        {/* One order on its own page — the WooCommerce shape the client asked
            for (16 Sep 2026): the list is the list, the detail is the desk. */}
        <Route path="/admin/orders/:id" element={<AdminOrder />} />
        <Route path="/admin/suppliers" element={<AdminSuppliers />} />
        {/* The create form on its own page (23 Sep 2026) — it used to drop open
            above the list. /new beats /:id by specificity. */}
        <Route path="/admin/suppliers/new" element={<AdminSupplierNew />} />
        {/* One supplier on its own page: the row used to expand, and the
            contacts, houses, terms and bills panels under it pushed the list
            off the screen. The header search has linked here all along. */}
        <Route path="/admin/suppliers/:id" element={<AdminSupplier />} />
        {/* Purchase orders, live. The list carries the derivation (plan, then
            generate); the detail is the receipting desk. */}
        <Route path="/admin/purchase-orders" element={<AdminPurchaseOrders />} />
        <Route path="/admin/purchase-orders/new" element={<AdminPurchaseOrderNew />} />
        <Route path="/admin/purchase-orders/bulk" element={<AdminBulkOrders />} />
        <Route path="/admin/purchase-orders/bulk/:id" element={<AdminBulkOrder />} />
        <Route path="/admin/purchase-orders/:id" element={<AdminPurchaseOrder />} />
        {/* Consolidated supplier invoices (W14): one house's bill covering many
            purchase orders. The list keys and filters the bills; the detail is
            the reconciliation desk — attach and detach purchase orders against
            the paper. /new beats /:id by specificity, as on /clients. */}
        <Route path="/admin/supplier-invoices" element={<AdminSupplierInvoices />} />
        <Route path="/admin/supplier-invoices/new" element={<AdminSupplierInvoiceNew />} />
        <Route path="/admin/supplier-invoices/:id" element={<AdminSupplierInvoice />} />
        {/* The physical sample register and the address book behind it. Live and
            writable, unlike the demo Tracking/Showroom screens they sit beside in
            the samples tab strip. */}
        <Route path="/admin/samples" element={<AdminSamples />} />
        {/* One sample on its own page, and registering one on its own page too:
            the row used to expand into the form, the check-out and the
            movement history, and the create form dropped down above the list
            (23 Sep 2026). /new beats /:id by specificity. */}
        <Route path="/admin/samples/new" element={<AdminSampleNew />} />
        <Route path="/admin/samples/:id" element={<AdminSample />} />
        <Route path="/admin/showrooms" element={<AdminShowrooms />} />
        {/* One showroom on its own page, and a new one on its own page: the
            row used to expand into the form and its "What points here"
            counts, and the create form dropped down above the list. */}
        <Route path="/admin/showrooms/new" element={<AdminShowroomNew />} />
        <Route path="/admin/showrooms/:id" element={<AdminShowroom />} />
        <Route path="/admin/sample-orders" element={<AdminSampleOrders />} />
        {/* One sample order on its own page — the form, its lifecycle moves and
            its stamped history used to open inside the row — and a new
            request raised on its own page rather than above the list. */}
        <Route path="/admin/sample-orders/new" element={<AdminSampleOrderNew />} />
        <Route path="/admin/sample-orders/:id" element={<AdminSampleOrder />} />
        {/* Cuttings asked for through the website, pending until sent. */}
        <Route path="/admin/sample-requests" element={<AdminSampleRequests />} />
        {/* One request on its own page: who asked, their note and the
            cuttings used to open inside the row. No /new — a request
            arrives from the website. */}
        <Route path="/admin/sample-requests/:id" element={<AdminSampleRequest />} />
        {/* The cross-register loan queue and its compose-before-send reminders,
            and the set letters those reminders are drafted from. */}
        <Route path="/admin/sample-loans" element={<AdminSampleLoans />} />
        <Route path="/admin/letters" element={<AdminLetterTemplates />} />
        {/* One email on its own page, where it is edited — the editor used to
            open under its row (client, 23 Sep 2026). Keyed by the template's
            NAME, which is how the API addresses one; there is no id. */}
        <Route path="/admin/letters/:name" element={<AdminLetterTemplate />} />
        {/* Freight tiers. Nothing edited them before — they were seeded once and
            changed only by the bulk PUT, i.e. by hand. */}
        <Route path="/admin/shipping" element={<AdminShipping />} />
        {/* The supplier freight ledger (inbound landed cost, not the checkout
            tiers above). Append-only by design: the screen offers no edit and
            no delete, because the API has no PATCH and no DELETE to call. */}
        <Route path="/admin/freight" element={<AdminFreight />} />
        {/* Appending one rate, on its own page — the form dropped down above
            the ledger (client, 23 Sep 2026). No page per rate: nothing on one
            is editable, so the append lands back on the ledger. */}
        <Route path="/admin/freight/new" element={<AdminFreightRateNew />} />
        {/* The category round trip: download a house's designs as a sheet, fill
            in the Category column, upload it back. */}
        <Route path="/admin/product-sheet" element={<AdminProductSheet />} />
        {/* The Categories tab: one row per category with a count, expanded to
            the designs in it, each movable — the Collections shape. */}
        <Route path="/admin/categories" element={<AdminCategories />} />
        {/* Xero connection + bulk syncs (C4). Invoice pushes live on the Orders
            screen; this is the connection behind them. */}
        <Route path="/admin/xero" element={<AdminXero />} />
      </Route>

      {/* Brand world (editorial TopBar) */}
      <Route element={<BrandLayout />}>
        <Route path="/library" element={<LibraryBrowse />} />
        <Route path="/product" element={<ProductPage />} />
        <Route path="/project" element={<ProjectFolder />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/journal/story" element={<JournalStory />} />
        <Route path="/storefront" element={<Storefront />} />
        <Route path="/account" element={<MyAccount />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/sample-request" element={<SampleRequest />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
