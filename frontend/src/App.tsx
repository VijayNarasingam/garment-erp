import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from './lib/auth'
import { AppLayout } from './components/Layout'
import { BillingLayout } from './components/BillingLayout'
import { EmptyState, Spinner } from './components/ui'
import { LoginPage } from './pages/LoginPage'

const ModePage = lazy(() => import('./pages/ModePage').then((module) => ({ default: module.ModePage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const PosPage = lazy(() => import('./pages/PosPage').then((module) => ({ default: module.PosPage })))
const SalesPage = lazy(() => import('./pages/SalesPage').then((module) => ({ default: module.SalesPage })))
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((module) => ({ default: module.InventoryPage })))
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((module) => ({ default: module.ProductsPage })))
const PurchasingPage = lazy(() => import('./pages/PurchasingPage').then((module) => ({ default: module.PurchasingPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((module) => ({ default: module.CustomersPage })))
const SuppliersPage = lazy(() => import('./pages/SuppliersPage').then((module) => ({ default: module.SuppliersPage })))
const ReturnsPage = lazy(() => import('./pages/ReturnsPage').then((module) => ({ default: module.ReturnsPage })))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then((module) => ({ default: module.ExpensesPage })))
const CashPage = lazy(() => import('./pages/CashPage').then((module) => ({ default: module.CashPage })))
const AccountingPage = lazy(() => import('./pages/AccountingPage').then((module) => ({ default: module.AccountingPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const SyncPage = lazy(() => import('./pages/SyncPage').then((module) => ({ default: module.SyncPage })))

function Splash() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-900">
        <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
          <path d="M20 45 32 17l12 28h-6.6L32 32.4 26.6 45z" fill="#E8A33D" />
          <circle cx="32" cy="49" r="3.2" fill="#B8532F" />
        </svg>
      </span>
      <Spinner />
    </div>
  )
}

function Protected() {
  const { ready, session, offline } = useAuth()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  // Offline sessions may only touch the billing counter (data is last-synced, not live).
  if (offline) return <Navigate to="/mode" replace />
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

function Guard({
  permissions,
  any,
  children
}: {
  permissions: string[]
  any?: boolean
  children: React.ReactNode
}) {
  const { has, hasAny } = useAuth()
  const allowed = any ? hasAny(...permissions) : has(...permissions)
  if (!allowed) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don’t have access to this area"
        description="Your role does not include the required permission. Ask the owner or an administrator to update your role."
      />
    )
  }
  return <>{children}</>
}

/** Billing-only kiosk route: same auth gate, slim header, no sidebar. */
function BillingProtected() {
  const { ready, session } = useAuth()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return (
    <BillingLayout>
      <Guard permissions={['pos.bill']}>
        <PosPage />
      </Guard>
    </BillingLayout>
  )
}

/** Post-login mode chooser: standalone screen, no sidebar. */
function ModeProtected() {
  const { ready, session } = useAuth()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <ModePage />
}

export function App() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      <Route path="/billing" element={<BillingProtected />} />
      <Route path="/mode" element={<ModeProtected />} />
      <Route element={<Protected />}>
        <Route
          index
          element={
            <Guard permissions={['dashboard.view']}>
              <DashboardPage />
            </Guard>
          }
        />
        <Route
          path="pos"
          element={
            <Guard permissions={['pos.bill']}>
              <PosPage />
            </Guard>
          }
        />
        <Route
          path="sales"
          element={
            <Guard permissions={['invoice.view', 'pos.bill']} any>
              <SalesPage />
            </Guard>
          }
        />
        <Route
          path="inventory"
          element={
            <Guard permissions={['inventory.view']}>
              <InventoryPage />
            </Guard>
          }
        />
        <Route
          path="products"
          element={
            <Guard permissions={['product.view', 'product.manage']} any>
              <ProductsPage />
            </Guard>
          }
        />
        <Route
          path="purchasing"
          element={
            <Guard permissions={['purchase.view']}>
              <PurchasingPage />
            </Guard>
          }
        />
        <Route
          path="customers"
          element={
            <Guard permissions={['customer.view', 'customer.manage']} any>
              <CustomersPage />
            </Guard>
          }
        />
        <Route
          path="suppliers"
          element={
            <Guard permissions={['supplier.view', 'supplier.manage']} any>
              <SuppliersPage />
            </Guard>
          }
        />
        <Route
          path="returns"
          element={
            <Guard permissions={['pos.return', 'invoice.view']} any>
              <ReturnsPage />
            </Guard>
          }
        />
        <Route
          path="expenses"
          element={
            <Guard permissions={['expense.view', 'expense.manage']} any>
              <ExpensesPage />
            </Guard>
          }
        />
        <Route
          path="cash"
          element={
            <Guard permissions={['cash.view', 'cash.open']} any>
              <CashPage />
            </Guard>
          }
        />
        <Route
          path="accounting"
          element={
            <Guard permissions={['accounting.view', 'report.view']} any>
              <AccountingPage />
            </Guard>
          }
        />
        <Route
          path="sync"
          element={
            <Guard permissions={['sync.use', 'sync.manage']} any>
              <SyncPage />
            </Guard>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
