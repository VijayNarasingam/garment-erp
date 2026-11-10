import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { cn } from './ui'

type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  title: string
  description?: string
  tone: ToastTone
}

interface ToastContextValue {
  push: (title: string, options?: { description?: string; tone?: ToastTone }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: TriangleAlert
}

const tones: Record<ToastTone, string> = {
  success: 'text-sage-600 bg-sage-100 border-sage-200',
  error: 'text-brick-600 bg-brick-100 border-brick-300/50',
  info: 'text-ink-600 bg-ivory-200 border-line',
  warning: 'text-saffron-500 bg-saffron-100 border-saffron-200'
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((title: string, options?: { description?: string; tone?: ToastTone }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((current) => [...current.slice(-3), { id, title, description: options?.description, tone: options?.tone ?? 'success' }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4800)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(380px,calc(100vw_-_2.5rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = icons[toast.tone]
          return (
            <div
              key={toast.id}
              className="animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-ivory-50 p-3.5 shadow-float"
              role="status"
            >
              <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', tones[toast.tone])}>
                <Icon size={15} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-5 text-ink-900">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs leading-5 text-ink-500">{toast.description}</p>}
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ivory-200 hover:text-ink-700"
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
