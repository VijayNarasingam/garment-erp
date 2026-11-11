export type PaperWidth = 80 | 58
export type FontSize = 'small' | 'normal' | 'large'
export type ReceiptKind = 'sale' | 'offline' | 'exchange'

export interface ReceiptItem {
  name: string
  sku?: string
  size?: string
  color?: string
  hsnCode?: string
  quantity: number
  unitPrice: number
  /** Item discount plus the allocated share of the bill discount. */
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  /** Line value after discounts. Tax-exclusive for exclusive lines, tax-inclusive otherwise. */
  lineAmount: number
}

export interface ReceiptShows {
  customer: boolean
  cashier: boolean
  payment: boolean
  upiQr: boolean
  terms: boolean
  sku: boolean
  sizeColor: boolean
  hsn: boolean
  itemRate: boolean
  itemDiscount: boolean
}

export interface ReceiptTotals {
  subtotal: number
  discountTotal: number
  taxableAmount: number
  taxTotal: number
  roundOff: number
  total: number
  paidAmount: number
  balanceAmount: number
}

export interface ReceiptExchange {
  originInvoiceNo: string
  credit: number
  due: number
  returnNo?: string
  returnedItems: { name: string; quantity: number; amount: number }[]
}

export interface ReceiptModel {
  kind: ReceiptKind
  duplicate: boolean
  cancelled: boolean
  paperWidth: PaperWidth
  fontSize: FontSize
  /** Characters per line. Missing or 0 means "use the paper width preset". */
  columns?: number
  /** Adds the calibration ruler used by the test print. */
  showRuler?: boolean
  invoiceNo: string
  invoiceDate: string
  shop: {
    name: string
    branchName: string
    addressLines: string[]
    phone?: string
    gstin?: string
    gstEnabled: boolean
  }
  customer?: { name: string; phone?: string; gstin?: string }
  cashier?: string
  items: ReceiptItem[]
  charges: { name: string; amount: number }[]
  totals: ReceiptTotals
  payments: { method: string; amount: number }[]
  taxGroups: { rate: number; taxable: number; tax: number }[]
  interState: boolean
  shows: ReceiptShows
  exchange?: ReceiptExchange
  upi?: { vpa: string; payeeName: string; amount: number; note: string }
  terms?: string
  footer: string
  offlineNote?: string
}

export type ReceiptSnapshot = Omit<ReceiptModel, 'paperWidth' | 'fontSize' | 'duplicate' | 'cancelled'>

export interface PrintPrefs {
  version: 1
  agentUrl: string
  token: string
  printer: string
  labelPrinter: string
  autoPrint: boolean
  copies: number
  paperWidth: PaperWidth
  fontSize: FontSize
  /** Calibrated characters per line, remembered per printer. */
  columnsByPrinter: Record<string, number>
}

export interface AgentHealth {
  status: string
  version: string
  uptimeSeconds: number
}

export interface AgentPrinter {
  name: string
  driverName?: string
  portName?: string
  status?: string
  isDefault: boolean
  isVirtual: boolean
  isLabelPrinter: boolean
  /** Printable width the driver reports, in millimetres. 0 when unknown. */
  paperWidthMm?: number
  /** Characters per line the driver implies. 0 when unknown. */
  suggestedColumns?: number
}

export interface AgentPrintersResponse {
  defaultPrinter?: string
  printers: AgentPrinter[]
}

export interface AgentPrintResponse {
  jobId: string
  printer: string
  bytes: number
  copies: number
  warning?: string
}

export interface PrintOutcome {
  status: 'sent' | 'browser' | 'browser-fallback' | 'failed' | 'not-configured' | 'busy'
  printer?: string
  warning?: string
  error?: Error
}
