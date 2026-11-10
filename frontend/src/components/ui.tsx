import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { createPortal } from 'react-dom'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Loader2, Search, X, type LucideIcon } from 'lucide-react'
import type { Tone } from '../lib/format'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const buttonVariants = {
  primary:
    'bg-terracotta-500 text-ivory-50 shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(184,83,47,0.7)] hover:bg-terracotta-600 active:bg-terracotta-700',
  secondary: 'border border-line bg-ivory-50 text-ink-800 hover:border-ivory-400 hover:bg-ivory-100',
  ghost: 'text-ink-600 hover:bg-ivory-200/70 hover:text-ink-900',
  danger: 'bg-brick-500 text-white hover:bg-brick-600',
  dark: 'bg-ink-900 text-ivory-100 hover:bg-ink-800',
  saffron: 'bg-saffron-400 text-ink-900 hover:bg-saffron-500'
}

const buttonSizes = {
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'h-9.5 gap-2 rounded-lg px-3.5 text-[13px]',
  lg: 'h-11 gap-2 rounded-xl px-5 text-sm'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
  loading?: boolean
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export function IconButton({
  className,
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ivory-200 hover:text-ink-900 disabled:opacity-40',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>
}

export function SectionCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            {title && <h3 className="font-display text-[17px] font-semibold leading-tight text-ink-900">{title}</h3>}
            {description && <p className="mt-1 text-xs leading-5 text-ink-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

const fieldBase =
  'w-full rounded-lg border border-line bg-ivory-50 px-3 text-[13px] text-ink-900 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] transition-colors placeholder:text-ink-300 hover:border-ivory-400 focus:border-terracotta-400 focus:outline-none focus:ring-4 focus:ring-terracotta-500/10 disabled:cursor-not-allowed disabled:bg-ivory-200/60 disabled:text-ink-400'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'h-9.5', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-20 py-2 leading-5', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'h-9.5 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
            {label}
            {required && <span className="ml-0.5 text-terracotta-500">*</span>}
          </span>
          {hint && <span className="text-[10px] text-ink-400">{hint}</span>}
        </span>
      )}
      {children}
      {error && <span className="mt-1 block text-[11px] font-medium text-brick-500">{error}</span>}
    </label>
  )
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-700', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-line text-terracotta-500 accent-terracotta-500 focus:ring-terracotta-400"
        {...props}
      />
      {label}
    </label>
  )
}

const badgeTones: Record<Tone, string> = {
  neutral: 'border-line bg-ivory-200/70 text-ink-600',
  success: 'border-sage-200 bg-sage-100 text-sage-600',
  warning: 'border-saffron-200 bg-saffron-100 text-saffron-500',
  danger: 'border-brick-300/50 bg-brick-100 text-brick-600',
  info: 'border-ivory-300 bg-ivory-100 text-ink-500',
  accent: 'border-terracotta-200 bg-terracotta-50 text-terracotta-600'
}

export function Badge({
  tone = 'neutral',
  dot,
  className,
  children
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
        badgeTones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-terracotta-500', className)} size={18} />
}

export function LoadingBlock({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-40 flex-col items-center justify-center gap-3 text-ink-400', className)}>
      <Spinner className="h-6 w-6" />
      <span className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ivory-100 text-ink-400">
          <Icon size={20} strokeWidth={1.8} />
        </span>
      )}
      <h4 className="font-display text-lg font-semibold text-ink-800">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label-xs mb-2 text-terracotta-500">{eyebrow}</p>}
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink-900">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[13px] leading-6 text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  className?: string
}) {
  const iconTones: Record<Tone, string> = {
    neutral: 'bg-ivory-200 text-ink-500',
    success: 'bg-sage-100 text-sage-600',
    warning: 'bg-saffron-100 text-saffron-500',
    danger: 'bg-brick-100 text-brick-500',
    info: 'bg-ivory-200 text-ink-500',
    accent: 'bg-terracotta-50 text-terracotta-500'
  }
  return (
    <div className={cn('card relative overflow-hidden p-4.5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-xs text-ink-400">{label}</p>
          <p className="num mt-2 truncate text-[22px] font-semibold leading-none text-ink-900">{value}</p>
          {hint && <p className="mt-2 text-[11px] leading-4 text-ink-400">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', iconTones[tone])}>
            <Icon size={16} strokeWidth={1.9} />
          </span>
        )}
      </div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  className
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    full: 'max-w-[min(1200px,calc(100vw_-_2rem))]'
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="animate-fade absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'animate-rise relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-ivory-50 pb-[env(safe-area-inset-bottom)] shadow-float sm:rounded-2xl sm:pb-0',
          widths[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div>
              {title && (
                <h2 id={titleId} className="font-display text-xl font-semibold leading-tight text-ink-900">
                  {title}
                </h2>
              )}
              {description && <p className="mt-1 text-xs leading-5 text-ink-500">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-1 -mt-1">
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-ivory-100/50 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

export function Tabs({
  items,
  value,
  onChange,
  className
}: {
  items: { id: string; label: string; count?: number }[]
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('scrollbar-none flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12px] font-bold transition-colors',
              active
                ? 'border-terracotta-500 text-terracotta-600'
                : 'border-transparent text-ink-400 hover:border-ivory-400 hover:text-ink-700'
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                  active ? 'bg-terracotta-50 text-terracotta-600' : 'bg-ivory-200 text-ink-400'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-ivory-100/70">{children}</thead>
}

export function TH({ children, className, align }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-line px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </th>
  )
}

export function TD({ children, className, align, colSpan }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-line-soft px-4 py-3 align-middle text-ink-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  )
}

export function TR({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn('transition-colors hover:bg-ivory-100/60', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(fieldBase, 'h-9.5 pl-9')}
      />
    </div>
  )
}

export function Pagination({
  page,
  totalPages,
  totalElements,
  onChange
}: {
  page: number
  totalPages: number
  totalElements: number
  onChange: (page: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-[11px] text-ink-400">
        <span className="num text-ink-600">{totalElements}</span> records · page{' '}
        <span className="num text-ink-600">{totalPages === 0 ? 0 : page + 1}</span> of{' '}
        <span className="num text-ink-600">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" disabled={page <= 0} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-ivory-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-400">
      {children}
    </kbd>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line-soft', className)} />
}
