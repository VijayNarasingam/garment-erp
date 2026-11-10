const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1
})

export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return inr.format(Number.isFinite(n) ? n : 0)
}

export function moneyCompact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return inrCompact.format(Number.isFinite(n) ? n : 0)
}

export function qty(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0))
}

export function pct(value: number | string | null | undefined): string {
  return `${Number(value ?? 0).toFixed(2)}%`
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateShort(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function monthStartISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function financialYearStart(month: number): string {
  const now = new Date()
  const year = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export function statusTone(status?: string | null): Tone {
  const s = (status ?? '').toUpperCase()
  if (['POSTED', 'PAID', 'ACTIVE', 'COMPLETED', 'APPROVED', 'ACCEPTED', 'BALANCED', 'CLOSED', 'OPTED_IN', 'SENT'].includes(s)) {
    return 'success'
  }
  if (['PENDING', 'DRAFT', 'OPEN', 'PARTIAL', 'HELD', 'SKIPPED', 'REVIEW'].includes(s)) return 'warning'
  if (['CANCELLED', 'REJECTED', 'VOID', 'FAILED', 'CONFLICT', 'AMENDED', 'EXPIRED', 'INACTIVE'].includes(s)) return 'danger'
  if (['DUPLICATE'].includes(s)) return 'info'
  if (['RECEIVED', 'ORDERED', 'IN_TRANSIT'].includes(s)) return 'accent'
  return 'neutral'
}

export function initials(name?: string): string {
  if (!name) return '·'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function titleCase(value?: string | null): string {
  if (!value) return '—'
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function roundOff(value: number): number {
  const rounded = Math.round(value)
  return round2(rounded - value)
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function fileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
