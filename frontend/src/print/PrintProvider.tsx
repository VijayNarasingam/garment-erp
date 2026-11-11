import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { AgentError, agentHealth, agentPrinters, agentPrint, agentSetColumns } from './printAgent'
import { buildEscPos, layoutReceipt, toBase64 } from './escpos'
import { clampCopies, loadPrintPrefs, normalizeAgentUrl, savePrintPrefs } from './printPrefs'
import { ReceiptDocument } from './ReceiptDocument'
import type {
  AgentHealth,
  AgentPrinter,
  PrintOutcome,
  PrintPrefs,
  ReceiptModel
} from './types'

export type AgentStatus = 'unknown' | 'checking' | 'online' | 'offline' | 'unauthorized'

export type PrintMode = 'auto' | 'manual'

export interface PrintContextValue {
  prefs: PrintPrefs
  updatePrefs: (patch: Partial<PrintPrefs>) => PrintPrefs
  status: AgentStatus
  health: AgentHealth | null
  printers: AgentPrinter[]
  defaultPrinter?: string
  printersLoading: boolean
  busy: boolean
  lastError: string | null
  checkAgent: () => Promise<boolean>
  refreshPrinters: () => Promise<AgentPrinter[]>
  connect: (token: string, agentUrl?: string) => Promise<AgentPrinter[]>
  testPrint: (model: ReceiptModel) => Promise<PrintOutcome>
  /** Stores the measured width with the printer in the agent and in this browser. */
  setPrinterColumns: (printer: string, columns: number) => Promise<void>
  printReceipt: (
    model: ReceiptModel,
    mode: PrintMode,
    options?: { copies?: number }
  ) => Promise<PrintOutcome>
  printBrowser: (model: ReceiptModel) => Promise<PrintOutcome>
}

const PrintContext = createContext<PrintContextValue | null>(null)

const PRINT_ROOT_ID = 'print-root'

export function PrintProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<PrintPrefs>(() => loadPrintPrefs())
  const prefsRef = useRef(prefs)
  const [status, setStatus] = useState<AgentStatus>('unknown')
  const [health, setHealth] = useState<AgentHealth | null>(null)
  const [printers, setPrinters] = useState<AgentPrinter[]>([])
  const [defaultPrinter, setDefaultPrinter] = useState<string | undefined>(undefined)
  const [printersLoading, setPrintersLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [portal, setPortal] = useState<{ model: ReceiptModel; qrDataUrl?: string } | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const busyRef = useRef(false)

  const updatePrefs = useCallback((patch: Partial<PrintPrefs>): PrintPrefs => {
    const next = savePrintPrefs({ ...prefsRef.current, ...patch })
    prefsRef.current = next
    setPrefs(next)
    return next
  }, [])

  useEffect(() => {
    let host = document.getElementById(PRINT_ROOT_ID)
    if (!host) {
      host = document.createElement('div')
      host.id = PRINT_ROOT_ID
      document.body.appendChild(host)
    }
    setPortalHost(host)
  }, [])

  const checkAgent = useCallback(async (): Promise<boolean> => {
    setStatus((current) => (current === 'unknown' ? 'checking' : current))
    try {
      const result = await agentHealth(prefsRef.current.agentUrl)
      setHealth(result)
      setStatus('online')
      setLastError(null)
      return true
    } catch (error) {
      setHealth(null)
      setStatus('offline')
      setLastError(error instanceof Error ? error.message : 'The print agent is not running.')
      return false
    }
  }, [])

  const refreshPrinters = useCallback(async (): Promise<AgentPrinter[]> => {
    const { agentUrl, token } = prefsRef.current
    if (!token) {
      setStatus((current) => (current === 'unknown' ? 'unauthorized' : current))
      setLastError('Pair this till with the print agent token first.')
      return []
    }
    setPrintersLoading(true)
    try {
      const result = await agentPrinters(agentUrl, token)
      setPrinters(result.printers)
      setDefaultPrinter(result.defaultPrinter)
      setStatus('online')
      setLastError(null)

      // The agent keeps the measured width with the printer, so every browser on
      // this PC prints the same way.
      const measured: Record<string, number> = {}
      for (const printer of result.printers) {
        if (printer.calibratedColumns && printer.calibratedColumns > 0) {
          measured[printer.name] = printer.calibratedColumns
        }
      }
      if (Object.keys(measured).length > 0) {
        const merged = { ...prefsRef.current.columnsByPrinter, ...measured }
        if (JSON.stringify(merged) !== JSON.stringify(prefsRef.current.columnsByPrinter)) {
          updatePrefs({ columnsByPrinter: merged })
        }
      }

      const current = prefsRef.current.printer
      const stillThere = result.printers.some((printer) => printer.name === current)
      if (!stillThere) {
        const fallback =
          result.defaultPrinter ??
          result.printers.find((printer) => !printer.isVirtual && !printer.isLabelPrinter)?.name ??
          result.printers[0]?.name
        if (fallback) updatePrefs({ printer: fallback })
      }
      return result.printers
    } catch (error) {
      if (error instanceof AgentError) {
        if (error.status === 401 || error.status === 403) {
          setStatus('unauthorized')
          setLastError('The pairing token was rejected. Copy the token again from the print agent installer.')
        } else if (error.code === 'AGENT_UNREACHABLE') {
          setStatus('offline')
          setLastError(error.message)
        } else {
          setLastError(error.message)
        }
      } else {
        setLastError('Could not read the printer list from the agent.')
      }
      return []
    } finally {
      setPrintersLoading(false)
    }
  }, [updatePrefs])

  const connect = useCallback(
    async (token: string, agentUrl?: string): Promise<AgentPrinter[]> => {
      const nextToken = token.trim()
      if (!nextToken) throw new Error('Paste the pairing token shown by the print agent installer.')
      const nextUrl = normalizeAgentUrl(agentUrl ?? prefsRef.current.agentUrl)
      updatePrefs({ token: nextToken, agentUrl: nextUrl })
      try {
        const result = await agentHealth(nextUrl)
        setHealth(result)
        setStatus('online')
        setLastError(null)
      } catch (error) {
        setHealth(null)
        setStatus('offline')
        const message = error instanceof Error ? error.message : 'The print agent is not running.'
        setLastError(message)
        throw error
      }
      return refreshPrinters()
    },
    [refreshPrinters, updatePrefs]
  )

  const openBrowserPrint = useCallback(async (model: ReceiptModel): Promise<PrintOutcome> => {
    if (typeof window === 'undefined') {
      return { status: 'failed', error: new Error('Browser print is only available in a browser.') }
    }
    const payload = layoutReceipt(model).find((line) => line.qr)?.qr
    let qrDataUrl: string | undefined
    if (payload) {
      try {
        qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 360, errorCorrectionLevel: 'M' })
        const image = new Image()
        image.src = qrDataUrl
        await image.decode().catch(() => undefined)
      } catch {
        qrDataUrl = undefined
      }
    }

    setPortal({ model, qrDataUrl })
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    try {
      window.print()
    } catch (error) {
      setPortal(null)
      return { status: 'failed', error: error instanceof Error ? error : new Error('Browser print failed.') }
    }
    window.addEventListener('afterprint', () => setPortal(null), { once: true })
    window.setTimeout(() => setPortal(null), 2000)
    return { status: 'browser' }
  }, [])

  const sendToAgent = useCallback(async (model: ReceiptModel, copies: number): Promise<PrintOutcome> => {
    const { agentUrl, token, printer } = prefsRef.current
    if (!token || !printer) {
      return {
        status: 'not-configured',
        warning: token
          ? 'Choose a printer in Settings > Bill print.'
          : 'Pair the print agent in Settings > Bill print.'
      }
    }

    const dataBase64 = toBase64(buildEscPos(model))
    const jobName = model.duplicate ? `${model.invoiceNo} [DUP]` : model.invoiceNo
    try {
      const response = await agentPrint(agentUrl, token, {
        printer,
        jobName,
        dataBase64,
        copies: clampCopies(copies)
      })
      setStatus('online')
      setLastError(null)
      return { status: 'sent', printer: response.printer, warning: response.warning }
    } catch (error) {
      const agentError =
        error instanceof AgentError
          ? error
          : new AgentError('PRINT_FAILED', error instanceof Error ? error.message : 'The print agent rejected the job.')
      setLastError(agentError.message)
      if (agentError.code === 'AGENT_UNREACHABLE') setStatus('offline')
      if (agentError.status === 401 || agentError.status === 403) setStatus('unauthorized')
      return { status: 'failed', error: agentError, warning: agentError.message }
    }
  }, [])

  const runExclusive = useCallback(async (task: () => Promise<PrintOutcome>): Promise<PrintOutcome> => {
    if (busyRef.current) return { status: 'busy' }
    busyRef.current = true
    setBusy(true)
    try {
      return await task()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const printBrowser = useCallback(
    (model: ReceiptModel) => runExclusive(() => openBrowserPrint(model)),
    [openBrowserPrint, runExclusive]
  )

  const printReceipt = useCallback(
    (model: ReceiptModel, mode: PrintMode, options?: { copies?: number }) =>
      runExclusive(async () => {
        const outcome = await sendToAgent(model, options?.copies ?? prefsRef.current.copies)

        if (mode === 'auto') return outcome

        if (outcome.status === 'not-configured') {
          return openBrowserPrint(model)
        }
        if (outcome.status === 'failed') {
          // Only fall back when nothing reached the agent. A timeout may have printed
          // already, and opening the dialog would produce a second copy.
          const sent = outcome.error instanceof AgentError ? outcome.error.sent : true
          if (!sent) return openBrowserPrint(model)
        }
        return outcome
      }),
    [openBrowserPrint, runExclusive, sendToAgent]
  )

  const setPrinterColumns = useCallback(
    async (printer: string, columns: number) => {
      const next = { ...prefsRef.current.columnsByPrinter }
      if (columns > 0) next[printer] = columns
      else delete next[printer]
      updatePrefs({ columnsByPrinter: next })
      // Keep the measurement with the printer, so other browsers pick it up.
      try {
        await agentSetColumns(prefsRef.current.agentUrl, prefsRef.current.token, printer, columns)
      } catch (error) {
        setLastError(error instanceof Error ? error.message : 'The agent could not store the width.')
        throw error
      }
    },
    [updatePrefs]
  )

  const testPrint = useCallback(
    (model: ReceiptModel) => runExclusive(() => sendToAgent({ ...model, duplicate: false, cancelled: false }, 1)),
    [runExclusive, sendToAgent]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const online = await checkAgent()
      if (!cancelled && online && prefsRef.current.token) await refreshPrinters()
    })()
    return () => {
      cancelled = true
    }
  }, [checkAgent, refreshPrinters])

  const value = useMemo<PrintContextValue>(
    () => ({
      prefs,
      updatePrefs,
      status,
      health,
      printers,
      defaultPrinter,
      printersLoading,
      busy,
      lastError,
      checkAgent,
      refreshPrinters,
      connect,
      testPrint,
      setPrinterColumns,
      printReceipt,
      printBrowser
    }),
    [
      prefs,
      updatePrefs,
      status,
      health,
      printers,
      defaultPrinter,
      printersLoading,
      busy,
      lastError,
      checkAgent,
      refreshPrinters,
      connect,
      testPrint,
      setPrinterColumns,
      printReceipt,
      printBrowser
    ]
  )

  return (
    <PrintContext.Provider value={value}>
      {children}
      {portalHost &&
        portal &&
        createPortal(
          <ReceiptDocument model={portal.model} qrDataUrl={portal.qrDataUrl} className="print-receipt" />,
          portalHost
        )}
    </PrintContext.Provider>
  )
}

export function usePrint(): PrintContextValue {
  const context = useContext(PrintContext)
  if (!context) throw new Error('usePrint must be used inside a PrintProvider.')
  return context
}
