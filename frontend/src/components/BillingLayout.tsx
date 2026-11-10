import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudOff, LayoutGrid } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Select, cn } from './ui'
import { initials } from '../lib/format'

/**
 * Slim kiosk shell for billing-only mode: no sidebar, no navigation —
 * just the counter header and the POS page.
 */
export function BillingLayout({ children }: { children: ReactNode }) {
  const { user, business, branches, branchId, setBranchId, offline } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-ivory-50/10 bg-ink-900 px-3 text-ivory-200 sm:px-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ivory-50/8 ring-1 ring-ivory-50/10">
          <svg viewBox="0 0 64 64" className="h-4 w-4" aria-hidden>
            <path d="M20 45 32 17l12 28h-6.6L32 32.4 26.6 45z" fill="#E8A33D" />
            <circle cx="32" cy="49" r="3.2" fill="#B8532F" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold leading-none text-ivory-50">{business?.name ?? 'Vijay Trendy hub'}</p>
          <p className="mt-0.5 hidden text-[8.5px] font-bold uppercase tracking-[0.18em] text-ivory-200/35 sm:block">
            Billing mode
          </p>
        </div>

        {offline && (
          <span
            className="flex items-center gap-1.5 rounded-full border border-saffron-400/40 bg-saffron-400/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-saffron-300"
            title="Server unreachable — bills are queued on this device and will sync when it is back"
          >
            <CloudOff size={11} /> Offline
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {branches.length > 1 && branchId != null && (
            <Select
              value={String(branchId)}
              onChange={(event) => setBranchId(Number(event.target.value))}
              className="h-8 w-[160px] text-[11px]"
              aria-label="Active branch"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          )}

          <span
            className={cn(
              'hidden items-center gap-1.5 rounded-full border border-ivory-50/10 bg-ivory-50/[0.06] px-1.5 py-0.5 sm:flex'
            )}
            title={user?.fullName}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terracotta-500/25 text-[8px] font-bold text-saffron-300">
              {initials(user?.fullName)}
            </span>
            <span className="hidden text-[10.5px] font-semibold text-ivory-100 md:inline">{user?.fullName?.split(' ')[0]}</span>
          </span>

          <button
            type="button"
            onClick={() => !offline && navigate('/')}
            disabled={offline}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-2.5 transition-colors',
              offline
                ? 'cursor-not-allowed bg-ivory-50/5 text-ivory-200/35'
                : 'bg-ivory-50/8 text-ivory-100 hover:bg-ivory-50/15'
            )}
            title={offline ? 'Connect the server to open the full workspace' : 'Exit billing mode → full app'}
            aria-label="Exit billing mode"
          >
            <LayoutGrid size={15} />
            <span className="hidden text-[11px] font-semibold md:inline">Exit to full app</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1560px] flex-1 px-4 py-4 sm:px-6">{children}</main>
    </div>
  )
}
