import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from './lib/auth'
import { AppLayout } from './components/Layout'
import { BillingLayout } from './components/BillingLayout'
import { EmptyState, Spinner } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { ModePage } from './pages/ModePage'
import { DashboardPage } from './pages/DashboardPage'
import { PosPage } from './pages/PosPage'
import { SalesPage } from './pages/SalesPage'
import { InventoryPage } from './pages/InventoryPage'
import { ProductsPage } from './pages/ProductsPage'
import { PurchasingPage } from './pages/PurchasingPage'
import { CustomersPage } from './pages/CustomersPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { ReturnsPage } from './pages/ReturnsPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { CashPage } from './pages/CashPage'
import { AccountingPage } from './pages/AccountingPage'
import { SettingsPage } from './pages/SettingsPage'
import { SyncPage } from './pages/SyncPage'

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
  )
}
