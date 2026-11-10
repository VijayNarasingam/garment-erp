import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, LayoutGrid, LogOut, ScanBarcode, CloudOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { initials } from '../lib/format'
import { cn, Spinner } from '../components/ui'

interface ModeOption {
  mode: 'billing' | 'full'
  step: string
  icon: typeof ScanBarcode
  title: string
  description: string
}

const options: ModeOption[] = [
  {
    mode: 'billing',
    step: '1',
    icon: ScanBarcode,
    title: 'Billing',
    description: 'New sale counter · POS only, no sidebar. Scan and bill.'
  },
  {
    mode: 'full',
    step: '2',
    icon: LayoutGrid,
    title: 'Everything',
    description: 'Full workspace — dashboard, stock, purchases, reports, settings.'
  }
]

/** Shown right after login: pick billing counter mode or the full workspace. */
export function ModePage() {
  const { user, business, has, logout, offline } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<ModeOption['mode'] | null>(null)

  const pick = (option: ModeOption) => {
    setPending(option.mode)
    navigate(option.mode === 'billing' ? '/billing' : '/', { replace: true })
  }

  const billingAllowed = has('pos.bill')

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[540px] animate-rise">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900">
              <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
                <path d="M20 45 32 17l12 28h-6.6L32 32.4 26.6 45z" fill="#E8A33D" />
                <circle cx="32" cy="49" r="3.2" fill="#B8532F" />
              </svg>
            </span>
            <div>
              <p className="font-display text-lg font-semibold leading-none text-ink-900">{business?.name ?? 'Vijay Trendy hub'}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Retail ERP</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-ivory-50 px-2.5 py-1.5 text-[11px] font-semibold text-ink-500 transition-colors hover:border-brick-300 hover:text-brick-500"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <div className="mb-2 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-terracotta-500/15 text-[12px] font-bold text-terracotta-600 ring-1 ring-terracotta-400/25">
            {initials(user?.fullName)}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-terracotta-500">Signed in successfully</p>
            <p className="font-display text-[20px] font-semibold leading-tight text-ink-900">
              Hello, {user?.fullName?.split(' ')[0]} — where to start?
            </p>
          </div>
        </div>

        {offline && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-saffron-300/60 bg-saffron-400/10 px-3 py-2 text-[11.5px] font-medium text-amber-700">
            <CloudOff size={13} className="shrink-0" />
            Offline mode — bills are saved on this device and will sync when the server is back.
          </div>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2">
          {options.map((option, index) => {
            const Icon = option.icon
            const disabled = (option.mode === 'billing' && !billingAllowed) || (option.mode === 'full' && offline)
            const isBusy = pending === option.mode
            const busy = pending !== null
            return (
              <button
                key={option.mode}
                type="button"
                disabled={disabled || busy || isBusy}
                onClick={() => pick(option)}
                className={cn(
                  'group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150',
                  disabled
                    ? 'cursor-not-allowed border-line bg-ivory-50/40 opacity-55'
                    : busy
                      ? 'cursor-wait border-line bg-ivory-50/60 opacity-70'
                      : 'bg-ivory-50 hover:-translate-y-0.5 hover:shadow-float',
                  disabled
                    ? ''
                    : option.mode === 'billing'
                      ? 'border-saffron-300/70 hover:border-saffron-400'
                      : 'border-line hover:border-terracotta-300'
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    disabled
                      ? 'bg-ivory-200 text-ink-300'
                      : option.mode === 'billing'
                        ? 'bg-saffron-400/15 text-saffron-600'
                        : 'bg-terracotta-500/10 text-terracotta-600'
                  )}
                >
                  {isBusy ? <Spinner /> : <Icon size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded px-1 py-0.5 font-mono text-[9px] font-bold',
                        option.mode === 'billing' ? 'bg-saffron-400/15 text-saffron-600' : 'bg-ivory-200 text-ink-500'
                      )}
                    >
                      {option.step}
                    </span>
                    <span className="font-display text-[15px] font-semibold text-ink-900">{option.title}</span>
                  </span>
                  <span className="mt-1 block text-[10.5px] leading-4 text-ink-500">{option.description}</span>
                  {disabled && option.mode === 'billing' && (
                    <span className="mt-1 block text-[9.5px] font-semibold text-brick-500">No billing permission for this role.</span>
                  )}
                  {disabled && option.mode === 'full' && offline && (
                    <span className="mt-1 block text-[9.5px] font-semibold text-brick-500">
                      Offline — connect the server to open the full workspace.
                    </span>
                  )}
                </span>
                {!disabled && <ArrowRight size={13} className="absolute right-3.5 top-4 text-ink-300 transition-colors group-hover:text-terracotta-500" />}
                {index === 0 && !disabled && (
                  <span className="absolute -top-1.5 right-3 rounded-full bg-saffron-400 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-ink-900">
                    Counter
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-6 text-center text-[10px] leading-4 text-ink-400">
          Pick billing for a distraction-free counter. Exit billing any time from the top bar to reach the full app.
        </p>
      </div>
    </div>
  )
}
