import { Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { InternalLayout, BrandLayout } from './components/layout.jsx'
import { RequireAuth, RequireCap } from './auth/guards.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import { CAPS } from './auth/roles.js'

import Login from './screens/Login.jsx'
import Dashboard from './screens/Dashboard.jsx'
import PricingEngine from './screens/PricingEngine.jsx'
import Catalogue from './screens/Catalogue.jsx'
import SalesOrdersList from './screens/SalesOrdersList.jsx'
import SalesOrderNew from './screens/SalesOrderNew.jsx'
import SalesOrder from './screens/SalesOrder.jsx'
import Reserves from './screens/Reserves.jsx'
import Cutting from './screens/Cutting.jsx'
import Suppliers from './screens/Suppliers.jsx'
import Reporting from './screens/Reporting.jsx'
import ReportLibrary from './screens/ReportLibrary.jsx'
import PriceLists from './screens/PriceLists.jsx'
import PriceListImport from './screens/PriceListImport.jsx'
import Search from './screens/Search.jsx'
import ClientsList from './screens/ClientsList.jsx'
import ClientNew from './screens/ClientNew.jsx'
import ClientAccount from './screens/ClientAccount.jsx'
import AccountDetails from './screens/AccountDetails.jsx'
import UserManagement from './screens/UserManagement.jsx'
import TradeApplicants from './screens/TradeApplicants.jsx'
import SampleScanner from './screens/SampleScanner.jsx'
// Live back-office screens: these read AND write the platform's own tables via
// atelier-api's /admin/* endpoints, unlike the Dynamics mirrors beside them.
// Access is enforced server-side by requireRole('backoffice'); every CRM login
// is already staff (see AuthContext's STAFF_ROLE_MAP), so they need no extra
// RequireCap on top of the RequireAuth the layout provides.
import ClientAccounts from './screens/ClientAccounts.jsx'
import AdminBrands from './screens/AdminBrands.jsx'
import AdminCollections from './screens/AdminCollections.jsx'
import AdminProducts from './screens/AdminProducts.jsx'
import AdminStock from './screens/AdminStock.jsx'
import AdminPriceListItems from './screens/AdminPriceListItems.jsx'
import AdminOrders from './screens/AdminOrders.jsx'
import AdminOrderNew from './screens/AdminOrderNew.jsx'
import AdminSuppliers from './screens/AdminSuppliers.jsx'
import AdminPurchaseOrders from './screens/AdminPurchaseOrders.jsx'
import AdminPurchaseOrderNew from './screens/AdminPurchaseOrderNew.jsx'
import AdminPurchaseOrder from './screens/AdminPurchaseOrder.jsx'
import AdminShipping from './screens/AdminShipping.jsx'
import AdminProductSheet from './screens/AdminProductSheet.jsx'
import AdminSamples from './screens/AdminSamples.jsx'
import AdminShowrooms from './screens/AdminShowrooms.jsx'
import AdminSampleOrders from './screens/AdminSampleOrders.jsx'
import AdminXero from './screens/AdminXero.jsx'
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />

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
        {/* Applicants moved to /clients/applicants (it belongs with the people
            who buy, not with staff permissions). A bookmark on the old path must
            not fall through to the catch-all, which would silently land the
            operator on the dashboard as though the screen had been deleted. */}
        <Route path="/users/applicants" element={<Navigate to="/clients/applicants" replace />} />
        <Route path="/pricing" element={
          <RequireCap cap={CAPS.FINANCE_VIEW}
            title="The pricing engine is finance"
            reason="Every step it shows — wholesale rate, supplier discount, COGS, landed cost — is cost. There is no version of this screen without the figures, so it is closed to your role rather than masked."
            hint="Director and Finance only. Trade and retail sell prices are on Catalogue and Price Lists." >
            <PricingEngine />
          </RequireCap>} />
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/sales-orders" element={<SalesOrdersList />} />
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
        <Route path="/reserves" element={<Reserves />} />
        <Route path="/cutting" element={<Cutting />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/reporting" element={<Reporting />} />
        <Route path="/reporting/library" element={<ReportLibrary />} />
        <Route path="/price-lists" element={<PriceLists />} />
        <Route path="/import" element={
          <RequireCap cap={CAPS.PRICELIST_IMPORT}
            title="Importing a price list changes pricing"
            reason="A staged import republishes supplier cost and sell prices across every SKU in the range, so it sits with the roles that own pricing."
            hint="Director and Finance only. You can still read the published price lists." >
            <PriceListImport />
          </RequireCap>} />
        <Route path="/search" element={<Search />} />
        {/* Clients section: two LIVE tabs (/clients and /clients/applicants),
            with the Dynamics mirror kept reachable at /clients/legacy.
            React Router v6 ranks routes by specificity, not declaration order, so
            /clients/new, /clients/legacy and /clients/applicants all beat
            /clients/:id whatever the order here — verified with matchRoutes
            against these exact paths. They are still written above the dynamic
            route so the reading order matches the resolution order. */}
        <Route path="/clients" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="Account administration is admin-only"
            reason="Adding, re-roling and archiving client logins decides who can sign in to the website and who sees trade pricing, so it sits with the Director account alone."
            hint="Director only. Finance and User roles cannot manage accounts." >
            <ClientAccounts />
          </RequireCap>} />
        <Route path="/clients/new" element={<ClientNew />} />
        {/* The read-only D365 account mirror. It held the Clients tab until the
            live roster took the name; it cannot be that tab, because the office
            needs add/edit/delete and this mirror has none. */}
        <Route path="/clients/legacy" element={<ClientsList />} />
        {/* Bookmark rule, as for /users/applicants below. */}
        <Route path="/clients/accounts" element={<Navigate to="/clients" replace />} />
        <Route path="/clients/applicants" element={
          <RequireCap cap={CAPS.ADMIN_USERS}
            title="User administration is admin-only"
            reason="Trade applications carry business and director details, and approving one unlocks trade pricing for that login, so review sits with the Director account alone."
            hint="Director only. Finance and User roles cannot review applicants." >
            <TradeApplicants />
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
        <Route path="/showroom-samples" element={<Navigate to="/admin/sample-orders" replace />} />

        {/* Live platform data (atelier-api). Grouped under /admin so a route is
            unambiguously the writable one, not the Dynamics mirror. */}
        <Route path="/admin/brands" element={<AdminBrands />} />
        {/* Distinct from the brand world's demo /collections screen: this one is
            live, writable and house-scoped via ?brand_id=. */}
        <Route path="/admin/collections" element={<AdminCollections />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/stock" element={<AdminStock />} />
        <Route path="/admin/price-lists" element={<AdminPriceListItems />} />
        <Route path="/admin/orders" element={<AdminOrders />} />
        {/* The live create form. Not to be confused with /sales-orders/new,
            which is the demo screen writing to localStorage. */}
        <Route path="/admin/orders/new" element={<AdminOrderNew />} />
        <Route path="/admin/suppliers" element={<AdminSuppliers />} />
        {/* Purchase orders, live. The list carries the derivation (plan, then
            generate); the detail is the receipting desk. */}
        <Route path="/admin/purchase-orders" element={<AdminPurchaseOrders />} />
        <Route path="/admin/purchase-orders/new" element={<AdminPurchaseOrderNew />} />
        <Route path="/admin/purchase-orders/:id" element={<AdminPurchaseOrder />} />
        {/* The physical sample register and the address book behind it. Live and
            writable, unlike the demo Tracking/Showroom screens they sit beside in
            the samples tab strip. */}
        <Route path="/admin/samples" element={<AdminSamples />} />
        <Route path="/admin/showrooms" element={<AdminShowrooms />} />
        <Route path="/admin/sample-orders" element={<AdminSampleOrders />} />
        {/* Freight tiers. Nothing edited them before — they were seeded once and
            changed only by the bulk PUT, i.e. by hand. */}
        <Route path="/admin/shipping" element={<AdminShipping />} />
        {/* The category round trip: download a house's designs as a sheet, fill
            in the Category column, upload it back. */}
        <Route path="/admin/product-sheet" element={<AdminProductSheet />} />
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
