import type { PrintPrefs } from './types'

export const PRINT_PREFS_KEY = 'garment.print.prefs.v1'
export const DEFAULT_AGENT_URL = 'http://127.0.0.1:17890'

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
  version: 1,
  agentUrl: DEFAULT_AGENT_URL,
  token: '',
  printer: '',
  labelPrinter: '',
  autoPrint: false,
  copies: 1,
  paperWidth: 80,
  fontSize: 'normal',
  columnsByPrinter: {},
  qrSize: 6
}

/** Printable widths a thermal printer can manage, in characters per line. */
export const COLUMN_PRESETS = [48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 24]

/** QR module sizes in printer dots. Bigger modules scan more reliably. */
export const QR_SIZE_PRESETS = [4, 5, 6, 7, 8]

export function clampQrSize(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 6
  return Math.min(10, Math.max(3, Math.round(parsed)))
}

export function clampColumns(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  const rounded = Math.round(parsed)
  if (rounded <= 0) return 0
  return Math.min(64, Math.max(24, rounded))
}

export function clampCopies(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(3, Math.max(1, Math.round(parsed)))
}

export function normalizeAgentUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return DEFAULT_AGENT_URL
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  return withProtocol.replace(/\/+$/, '')
}

export function normalizePrintPrefs(value: unknown): PrintPrefs {
  const source = value && typeof value === 'object' ? (value as Partial<PrintPrefs>) : {}
  const columnsByPrinter: Record<string, number> = {}
  const rawColumns = (source.columnsByPrinter ?? {}) as Record<string, unknown>
  for (const [printer, columns] of Object.entries(rawColumns)) {
    const clamped = clampColumns(columns)
    if (printer && clamped > 0) columnsByPrinter[printer] = clamped
  }
  return {
    version: 1,
    agentUrl: normalizeAgentUrl(source.agentUrl),
    token: typeof source.token === 'string' ? source.token.trim() : '',
    printer: typeof source.printer === 'string' ? source.printer : '',
    labelPrinter: typeof source.labelPrinter === 'string' ? source.labelPrinter : '',
    autoPrint: source.autoPrint === true,
    copies: clampCopies(source.copies),
    paperWidth: source.paperWidth === 58 ? 58 : 80,
    fontSize:
      source.fontSize === 'small' || source.fontSize === 'large' || source.fontSize === 'normal'
        ? source.fontSize
        : 'normal',
    columnsByPrinter,
    qrSize: clampQrSize(source.qrSize)
  }
}

/** Characters per line for a printer: the calibrated value, or 0 for "auto". */
export function columnsForPrinter(prefs: PrintPrefs, printer: string): number {
  if (!printer) return 0
  return clampColumns(prefs.columnsByPrinter?.[printer] ?? 0)
}

export function loadPrintPrefs(storage: Pick<Storage, 'getItem'> | null = safeStorage()): PrintPrefs {
  if (!storage) return { ...DEFAULT_PRINT_PREFS }
  try {
    const raw = storage.getItem(PRINT_PREFS_KEY)
    if (!raw) return { ...DEFAULT_PRINT_PREFS }
    return normalizePrintPrefs(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PRINT_PREFS }
  }
}

export function savePrintPrefs(
  prefs: PrintPrefs,
  storage: Pick<Storage, 'setItem'> | null = safeStorage()
): PrintPrefs {
  const normalized = normalizePrintPrefs(prefs)
  try {
    storage?.setItem(PRINT_PREFS_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be full or blocked; the in-memory prefs still apply for this session.
  }
  return normalized
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
