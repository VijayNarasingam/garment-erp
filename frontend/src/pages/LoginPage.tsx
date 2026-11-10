import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CloudOff, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, Store } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { listOfflineUsers, type OfflineUserSummary } from '../lib/offlineAuth'
import { Button, Field, Input } from '../components/ui'

const demoUsers = [
  { username: 'owner', role: 'Owner', pin: '1234' },
  { username: 'manager', role: 'Manager', pin: '1111' },
  { username: 'cashier', role: 'Cashier', pin: '2222' },
  { username: 'accountant', role: 'Accountant', pin: '4444' }
]

export function LoginPage() {
  const { login, offlineUnlock, session, business, ready } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('Retail@123')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null)
  const [offlineUsers, setOfflineUsers] = useState<OfflineUserSummary[]>([])
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!ready) return
    if (!session) {
      // From here on, any session that appears is the one this page created — never auto-redirect it.
      mountedRef.current = true
      return
    }
    // Redirect only users who were ALREADY signed in before opening /login (e.g. visiting it directly).
    if (!mountedRef.current) navigate('/', { replace: true })
  }, [ready, session, navigate])

  useEffect(() => {
    if (session) return
    void listOfflineUsers().then(setOfflineUsers).catch(() => setOfflineUsers([]))
  }, [session])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})
    try {
      await login(username.trim(), password)
      navigate('/mode', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.network) {
        // Server unreachable — try the cached device credentials (password, then counter PIN).
        try {
          await offlineUnlock(username.trim(), password)
          navigate('/mode', { replace: true })
        } catch (offlineErr) {
          setOfflineNotice('Server unreachable — you can still sign in offline with your password or counter PIN.')
          setError(offlineErr instanceof Error ? offlineErr.message : 'Offline sign-in failed.')
        }
      } else if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.fieldErrors ?? {})
      } else {
        setError('Unable to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="sidebar-texture relative hidden overflow-hidden bg-ink-900 px-12 py-12 text-ivory-100 lg:flex lg:flex-col">
        <div className="absolute -right-24 top-24 h-72 w-72 rounded-full border border-saffron-400/20" />
        <div className="absolute -right-10 top-40 h-52 w-52 rounded-full border border-saffron-400/10" />
        <div className="absolute bottom-0 left-0 h-64 w-full bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ivory-50/8 ring-1 ring-ivory-50/10">
            <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
              <path d="M20 45 32 17l12 28h-6.6L32 32.4 26.6 45z" fill="#E8A33D" />
              <circle cx="32" cy="49" r="3.2" fill="#B8532F" />
            </svg>
          </span>
          <div>
            <p className="font-display text-xl font-semibold leading-none">{business?.name ?? 'Vijay Trendy hub'}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.24em] text-ivory-200/40">Retail ERP</p>
          </div>
        </div>

        <div className="relative mt-auto max-w-lg pb-10">
          <p className="label-xs mb-5 text-saffron-400">Built for the shop floor</p>
          <h1 className="font-display text-[52px] font-medium leading-[1.02] tracking-[-0.02em] text-ivory-50">
            Every bill.
            <br />
            Every stitch.
            <br />
            <span className="text-saffron-400">Accounted for.</span>
          </h1>
          <p className="mt-6 max-w-md text-[13px] leading-6 text-ivory-200/55">
            Multi-branch billing, live stock, purchasing and double-entry books — in one calm workspace that keeps
            working when the internet does not.
          </p>

          <div className="mt-9 grid max-w-md grid-cols-3 gap-3">
            {[
              { value: '2', label: 'Branches' },
              { value: '37', label: 'Live SKUs' },
              { value: '100%', label: 'Offline-first' }
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-ivory-50/8 bg-ivory-50/[0.035] px-3.5 py-3">
                <p className="font-display text-2xl font-semibold text-ivory-50">{item.value}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ivory-200/35">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-ivory-50/8 pt-5 text-[10px] text-ivory-200/35">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} /> Role-based access · audit trail
          </span>
          <span className="font-mono">v1.0.0</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[410px] animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900">
              <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
                <path d="M20 45 32 17l12 28h-6.6L32 32.4 26.6 45z" fill="#E8A33D" />
                <circle cx="32" cy="49" r="3.2" fill="#B8532F" />
              </svg>
            </span>
            <div>
              <p className="font-display text-lg font-semibold leading-none">{business?.name ?? 'Vijay Trendy hub'}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Retail ERP</p>
            </div>
          </div>

          <div className="mb-7">
            <p className="label-xs mb-2 text-terracotta-500">Welcome back</p>
            <h2 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
              Sign in to your counter
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-ink-500">
              Use your store credentials. Access follows the permissions assigned to your role.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="space-y-4"
          >
            <Field label="Username" required error={fieldErrors.username}>
              <div className="relative">
                <Store size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 pl-9"
                  autoComplete="username"
                  placeholder="owner"
                  autoFocus
                />
              </div>
            </Field>

            <Field label="Password" required error={fieldErrors.password}>
              <div className="relative">
                <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 px-9"
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            {offlineNotice && (
              <div className="flex items-start gap-2 rounded-lg border border-saffron-300/60 bg-saffron-400/10 px-3 py-2.5 text-[12px] font-medium text-amber-700">
                <CloudOff size={14} className="mt-0.5 shrink-0" />
                <span>{offlineNotice}</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-brick-300/50 bg-brick-100 px-3 py-2.5 text-[12px] font-medium text-brick-600">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {offlineNotice ? 'Open counter offline' : 'Enter workspace'} <ArrowRight size={15} />
            </Button>
          </form>

          {offlineNotice && offlineUsers.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-ivory-50/70 p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5">
                <CloudOff size={12} className="text-terracotta-500" />
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                  Offline sign-ins saved on this device
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {offlineUsers.map((user) => (
                  <button
                    key={user.username}
                    type="button"
                    onClick={() => {
                      setUsername(user.username)
                      setPassword('')
                      setError(null)
                    }}
                    className="rounded-md border border-line bg-ivory-50 px-2 py-1 text-[10.5px] font-semibold text-ink-600 transition-colors hover:border-terracotta-300 hover:text-terracotta-600"
                    title={user.hasPin ? 'Use the password or the counter PIN' : 'Use the password'}
                  >
                    {user.fullName} <span className="font-mono text-[9px] text-ink-400">@{user.username}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[9.5px] leading-4 text-ink-400">
                Enter the password or the counter PIN above, then “Open counter offline”.
              </p>
            </div>
          )}

          <div className="mt-7 rounded-xl border border-line bg-ivory-50/70 p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Sparkles size={12} className="text-saffron-500" />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Demo accounts · password Retail@123</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {demoUsers.map((user) => (
                <button
                  key={user.username}
                  type="button"
                  onClick={() => {
                    setUsername(user.username)
                    setPassword('Retail@123')
                  }}
                  className="rounded-md border border-line bg-ivory-50 px-2 py-1 text-[10.5px] font-semibold text-ink-600 transition-colors hover:border-terracotta-300 hover:text-terracotta-600"
                  title={`PIN ${user.pin}`}
                >
                  {user.role} <span className="font-mono text-[9px] text-ink-400">@{user.username}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] leading-4 text-ink-400">
            Protected by role permissions, approval PINs and an immutable audit trail.
          </p>
        </div>
      </section>
    </div>
  )
}
