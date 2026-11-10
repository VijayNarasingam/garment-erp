import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeIndianRupee,
  Boxes,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  CircleUserRound,
  CloudOff,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Settings2,
  Shirt,
  Store,
  Truck,
  Users,
  Wallet,
  Wifi,
  X
} from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { PageResponse, SalesReturn } from '../lib/types'
import { cn, IconButton } from './ui'
import { formatDate, initials, todayISO } from '../lib/format'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  permissions?: string[]
  any?: boolean
  badge?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permissions: ['dashboard.view'] }]
  },
  {
    label: 'Sell',
    items: [
      { to: '/pos', label: 'POS billing', icon: ScanBarcode, permissions: ['pos.bill'] },
      { to: '/sales', label: 'Sales', icon: ReceiptText, permissions: ['invoice.view', 'pos.bill'], any: true },
      { to: '/returns', label: 'Returns', icon: RotateCcw, permissions: ['pos.return', 'invoice.view'], any: true }
    ]
  },
  {
    label: 'Stock',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes, permissions: ['inventory.view'], any: true },
      { to: '/products', label: 'Products', icon: Shirt, permissions: ['product.view', 'product.manage'], any: true },
      { to: '/purchasing', label: 'Purchasing', icon: Truck, permissions: ['purchase.view'], any: true }
    ]
  },
  {
    label: 'Relations',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, permissions: ['customer.view', 'customer.manage'], any: true },
      { to: '/suppliers', label: 'Suppliers', icon: Building2, permissions: ['supplier.view', 'supplier.manage'], any: true }
    ]
  },
  {
    label: 'Finance',
    items: [
      { to: '/expenses', label: 'Expenses', icon: Wallet, permissions: ['expense.view', 'expense.manage'], any: true },
      { to: '/cash', label: 'Cash register', icon: BadgeIndianRupee, permissions: ['cash.view', 'cash.open'], any: true },
      { to: '/accounting', label: 'Accounting', icon: Calculator, permissions: ['accounting.view', 'report.view'], any: true }
    ]
  },
  {
    label: 'System',
    items: [
      { to: '/sync', label: 'Offline sync', icon: RefreshCw, permissions: ['sync.use', 'sync.manage'], any: true },
      { to: '/settings', label: 'Settings', icon: Settings2 }
    ]
  }
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, business, branches, branchId, setBranchId, has, hasAny, logout, offline } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })
  const [branchOpen, setBranchOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const modeRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const pendingReturnsQuery = useQuery({
    queryKey: ['returns', branchId, 'PENDING'],
    queryFn: () => api<PageResponse<SalesReturn>>(`/api/returns${qs({ branchId, status: 'PENDING', page: 0, size: 1 })}`),
    enabled: Boolean(branchId) && has('return.approve'),
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000
  })
  const pendingReturnCount = pendingReturnsQuery.data?.totalElements ?? 0

  const toggleSidebar = useCallback(() => {
    setCollapsed((value) => {
      const next = !value
      try {
        localStorage.setItem('sidebar-collapsed', next ? '1' : '0')
      } catch {
        // Storage unavailable; still collapse for this session.
      }
      return next
    })
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar])

  useEffect(() => {
    setMobileOpen(false)
    setBranchOpen(false)
    setUserOpen(false)
    setModeOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!modeOpen) return
    const outside = (event: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(event.target as Node)) setModeOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [modeOpen])

  const currentBranch = branches.find((branch) => branch.id === branchId)
  const isBilling = location.pathname === '/billing' || location.pathname.startsWith('/pos')
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permissions) return true
        return item.any ? hasAny(...item.permissions) : has(...item.permissions)
      })
    }))
    .filter((group) => group.items.length > 0)

  const onLogout = () => {
    queryClient.clear()
    logout()
    navigate('/login')
  }

  return (
    <div className="relative z-10 min-h-screen">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          'sidebar-texture fixed inset-y-0 left-0 z-50 flex w-[258px] flex-col bg-ink-900 text-ivory-200 transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'
        )}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-5">
          <Link to="/" className="group flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ivory-50/8 ring-1 ring-ivory-50/10">
              <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
                <path d="M20 45 32 17l12 28h-6.6L32 32.4 26.6 45z" fill="#E8A33D" />
                <circle cx="32" cy="49" r="3.2" fill="#B8532F" />
              </svg>
            </span>
            <span>
              <span className="block max-w-[180px] truncate font-display text-[19px] font-semibold leading-none text-ivory-50">{business?.name ?? 'Retail ERP'}</span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.22em] text-ivory-200/45">
                Garment ERP
              </span>
            </span>
          </Link>
          <button
            className="rounded-lg p-1.5 text-ivory-200/60 hover:bg-ivory-50/10 hover:text-ivory-50 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mx-3 mb-4 rounded-xl border border-ivory-50/8 bg-ivory-50/[0.045] px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ivory-200/40">Trading as</p>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-ivory-100">{business?.name ?? '—'}</p>
          <p className="mt-0.5 text-[10px] text-ivory-200/40">
            {business?.gstEnabled ? `GSTIN ${business.gstin ?? '—'}` : 'GST not enabled'}
          </p>
        </div>

        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-ivory-200/30">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors',
                        isActive
                          ? 'bg-ivory-50/[0.075] text-ivory-50'
                          : 'text-ivory-200/60 hover:bg-ivory-50/[0.045] hover:text-ivory-100'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            'absolute -left-3 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-saffron-400 transition-opacity',
                            isActive ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <item.icon size={15} strokeWidth={isActive ? 2.1 : 1.8} className={isActive ? 'text-saffron-400' : 'text-ivory-200/40 group-hover:text-ivory-200/70'} />
                        {item.label}
                        {item.to === '/returns' && pendingReturnCount > 0 && (
                          <span className="ml-auto min-w-[18px] rounded-full bg-saffron-400 px-1.5 py-0.5 text-center text-[9.5px] font-bold leading-none text-ink-900">
                            {pendingReturnCount}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-ivory-50/8 p-3">
          <div className="mt-1 flex items-center gap-2.5 px-1.5 py-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta-500/20 text-[10px] font-bold text-saffron-300 ring-1 ring-saffron-400/20">
              {initials(user?.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-semibold text-ivory-100">{user?.fullName}</p>
              <p className="truncate text-[9.5px] uppercase tracking-wider text-ivory-200/35">{user?.roles?.[0] ?? 'Staff'}</p>
            </div>
            <button onClick={onLogout} className="rounded-md p-1.5 text-ivory-200/40 hover:bg-ivory-50/10 hover:text-ivory-100" title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div className={cn('transition-[padding] duration-300', collapsed ? 'lg:pl-0' : 'lg:pl-[258px]')}>
        <header className="sticky top-0 z-30 border-b border-line/80 bg-ivory-100/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu size={18} />
            </IconButton>
            <IconButton
              label={collapsed ? 'Open sidebar (Ctrl+B)' : 'Close sidebar (Ctrl+B)'}
              className="hidden lg:inline-flex"
              onClick={toggleSidebar}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </IconButton>

            <div className="hidden items-center gap-1.5 text-[11px] text-ink-400 md:flex">
              <span className="font-semibold text-ink-500">{formatDate(todayISO())}</span>
              <span className="text-ink-300">·</span>
              <span>{business?.financialYearStartMonth ? `FY ${financialYearLabel(business.financialYearStartMonth)}` : ''}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden sm:block" ref={modeRef}>
                <button
                  type="button"
                  onClick={() => {
                    setModeOpen((value) => !value)
                    setBranchOpen(false)
                    setUserOpen(false)
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-ivory-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-600 transition-colors hover:border-terracotta-300 hover:text-terracotta-600"
                  aria-haspopup="menu"
                  aria-expanded={modeOpen}
                  title="Switch between dashboard and billing counter"
                >
                  {isBilling ? <ScanBarcode size={11} /> : <LayoutDashboard size={11} />}
                  {isBilling ? 'Billing' : 'Dashboard'}
                  <ChevronDown size={11} className={cn('transition-transform duration-150', modeOpen && 'rotate-180')} />
                </button>
                {modeOpen && (
                  <div
                    role="menu"
                    className="animate-rise absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-ivory-50 p-1 shadow-float"
                  >
                    <p className="px-2.5 pb-1 pt-1.5 text-[8.5px] font-bold uppercase tracking-[0.16em] text-ink-400">
                      Switch workspace
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setModeOpen(false)
                        navigate('/')
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        !isBilling ? 'bg-terracotta-50 text-terracotta-700' : 'text-ink-600 hover:bg-ivory-100'
                      )}
                    >
                      <LayoutDashboard size={14} className={!isBilling ? 'text-terracotta-600' : 'text-ink-400'} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11.5px] font-semibold leading-tight">Dashboard</span>
                        <span className="block text-[9px] leading-tight text-ink-400">
                          Full workspace — stock, reports, settings
                        </span>
                      </span>
                      {!isBilling && <Check size={13} className="shrink-0 text-terracotta-600" />}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setModeOpen(false)
                        navigate('/billing')
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        isBilling ? 'bg-terracotta-50 text-terracotta-700' : 'text-ink-600 hover:bg-ivory-100'
                      )}
                    >
                      <ScanBarcode size={14} className={isBilling ? 'text-terracotta-600' : 'text-ink-400'} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11.5px] font-semibold leading-tight">Billing</span>
                        <span className="block text-[9px] leading-tight text-ink-400">
                          Counter — POS only, no sidebar
                        </span>
                      </span>
                      {isBilling && <Check size={13} className="shrink-0 text-terracotta-600" />}
                    </button>
                  </div>
                )}
              </div>

              <span
                className={cn(
                  'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider sm:flex',
                  offline ? 'border-brick-300/50 bg-brick-100 text-brick-600' : 'border-sage-200 bg-sage-100 text-sage-600'
                )}
              >
                {offline ? <CloudOff size={11} /> : <Wifi size={11} />}
                {offline ? 'Offline mode' : 'Online'}
              </span>

              <div className="relative">
                <button
                  onClick={() => {
                    setBranchOpen((value) => !value)
                    setUserOpen(false)
                  }}
                  className="flex h-8.5 items-center gap-2 rounded-lg border border-line bg-ivory-50 px-2.5 text-[11.5px] font-semibold text-ink-700 hover:border-ivory-400"
                >
                  <Store size={13} className="text-terracotta-500" />
                  <span className="max-w-[140px] truncate">{currentBranch?.name ?? 'Select branch'}</span>
                  <ChevronDown size={12} className="text-ink-400" />
                </button>
                {branchOpen && (
                  <div className="absolute right-0 top-10 z-40 w-64 overflow-hidden rounded-xl border border-line bg-ivory-50 p-1.5 shadow-float">
                    <p className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-400">Active branch</p>
                    {branches.map((branch) => (
                      <button
                        key={branch.id}
                        onClick={() => {
                          setBranchId(branch.id)
                          setBranchOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px]',
                          branch.id === branchId ? 'bg-terracotta-50 text-terracotta-700' : 'text-ink-600 hover:bg-ivory-100'
                        )}
                      >
                        <span>
                          <span className="block font-semibold">{branch.name}</span>
                          <span className="block text-[10px] text-ink-400">
                            {branch.code} · {branch.city ?? '—'}
                          </span>
                        </span>
                        {branch.primaryBranch && <span className="text-[9px] font-bold uppercase text-saffron-500">Main</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => {
                    setUserOpen((value) => !value)
                    setBranchOpen(false)
                  }}
                  className="flex h-8.5 items-center gap-2 rounded-lg border border-line bg-ivory-50 px-2 text-ink-600 hover:border-ivory-400"
                >
                  <CircleUserRound size={16} className="text-ink-400" />
                  <span className="hidden text-[11.5px] font-semibold sm:block">{user?.fullName?.split(' ')[0]}</span>
                  <ChevronDown size={12} className="text-ink-400" />
                </button>
                {userOpen && (
                  <div className="absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-xl border border-line bg-ivory-50 p-1.5 shadow-float">
                    <div className="border-b border-line-soft px-2.5 pb-2.5 pt-1.5">
                      <p className="text-[12px] font-bold text-ink-900">{user?.fullName}</p>
                      <p className="text-[10px] text-ink-400">{user?.email ?? user?.username}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-terracotta-500">
                        {user?.roles?.join(' · ')}
                      </p>
                    </div>
                    <Link to="/settings?tab=profile" className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-ink-600 hover:bg-ivory-100">
                      <CircleUserRound size={14} /> My profile
                    </Link>
                    <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-brick-500 hover:bg-brick-100/50">
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6">{children}</main>
      </div>
    </div>
  )
}

function financialYearLabel(startMonth: number) {
  const now = new Date()
  const year = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}
