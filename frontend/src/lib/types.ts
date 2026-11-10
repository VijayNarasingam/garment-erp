export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface BranchInfo {
  id: number
  code: string
  name: string
  address?: string
  city?: string
  stateCode?: string
  gstin?: string
  invoicePrefix?: string
  primaryBranch: boolean
}

export interface BusinessInfo {
  id: number
  name: string
  legalName?: string
  gstin?: string
  stateCode?: string
  address?: string
  phone?: string
  email?: string
  gstEnabled: boolean
  currency: string
  invoicePrefix: string
  roundOffEnabled: boolean
  defaultTaxInclusive: boolean
  returnWindowDays: number
  exchangeWindowDays: number
  returnApprovalRequired: boolean
  refundToOriginalMethodOnly: boolean
  allowNegativeStockWithApproval: boolean
  costingMethod: string
  financialYearStartMonth: number
  thankYouNote?: string
}

export interface BusinessSettings extends BusinessInfo {
  maxDiscountPercent: number
  timezone: string
}

export interface UserInfo {
  id: number
  username: string
  fullName: string
  email?: string
  phone?: string
  roles: string[]
  permissions: string[]
  branches: BranchInfo[]
  defaultBranchId?: number
  discountLimitPercent: number
  businessId: number
}

export interface LoginResponse {
  token: string
  expiresIn: number
  user: UserInfo
  business: BusinessInfo
}

export interface Branch {
  id: number
  code: string
  name: string
  address?: string
  city?: string
  state?: string
  stateCode?: string
  phone?: string
  email?: string
  gstin?: string
  invoicePrefix: string
  active: boolean
  primaryBranch: boolean
}

export interface DashboardData {
  date: string
  todaySales: number
  todayInvoices: number
  monthSales: number
  monthInvoices: number
  averageBill: number
  outstandingReceivables: number
  cashInHand: number
  inventoryValue: number
  lowStockCount: number
  pendingReturns: number
  pendingExpenses: number
  salesTrend: { date: string; sales: number; invoices: number }[]
  topProducts: { variantId: number; productName: string; sku: string; size: string; color: string; quantity: number; sales: number }[]
  branchPerformance: { branchId: number; branchName: string; sales: number; invoices: number }[]
  lowStockItems: {
    branchId: number
    branchName: string
    variantId: number
    productName: string
    sku: string
    size: string
    color: string
    quantity: number
    reorderLevel: number
  }[]
  recentInvoices: { id: number; invoiceNo: string; invoiceDate: string; customerName: string; total: number; status: string }[]
}

export interface Variant {
  id: number
  sku: string
  barcode?: string
  barcodeInternal?: boolean
  size?: string
  color?: string
  purchasePrice: number
  sellingPrice: number
  mrp: number
  reorderLevel: number
  active: boolean
}

export interface Product {
  id: number
  code: string
  name: string
  categoryId?: number
  categoryName?: string
  brandId?: number
  brandName?: string
  supplierId?: number
  supplierName?: string
  description?: string
  hsnCode?: string
  taxCategoryId?: number
  taxCategoryName?: string
  taxRate: number
  taxInclusive: boolean
  purchasePrice: number
  sellingPrice: number
  mrp: number
  defaultDiscountPercent: number
  reorderLevel: number
  imageUrl?: string
  active: boolean
  variants: Variant[]
}

export interface Category {
  id: number
  name: string
  description?: string
  active: boolean
}

export interface Brand {
  id: number
  name: string
  description?: string
  active: boolean
}

export interface TaxCategory {
  id: number
  name: string
  hsnCode?: string
  gstRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  exempt: boolean
  taxInclusive?: boolean | null
  active: boolean
}

export interface VariantSearchResult {
  variantId: number
  productId: number
  productName: string
  sku: string
  barcode?: string
  size?: string
  color?: string
  sellingPrice: number
  mrp: number
  purchasePrice: number
  taxCategoryName?: string
  taxRate: number
  taxInclusive: boolean
  stockQuantity: number
  reorderLevel: number
  active: boolean
}

export interface StockRow {
  variantId: number
  productId: number
  productName: string
  sku: string
  barcode?: string
  size?: string
  color?: string
  quantity: number
  averageCost: number
  stockValue: number
  reorderLevel: number
  lowStock: boolean
  sellingPrice: number
  mrp: number
}

export interface StockSummary {
  branchId: number
  totalQuantity: number
  totalValue: number
  lowStockCount: number
  outOfStockCount: number
}

export interface ValuationRow {
  branchId: number
  branchName: string
  variantId: number
  productName: string
  sku: string
  quantity: number
  averageCost: number
  stockValue: number
}

export interface Valuation {
  totalValue: number
  totalQuantity: number
  rows: ValuationRow[]
}

export interface CostingConfig {
  id: number
  method: string
  effectiveFrom: string
  note?: string
  revaluationAmount: number
  createdAt: string
}

export interface BarcodeResponse {
  variantId: number
  barcode: string
  symbology: string
  internal: boolean
  note?: string
}

export interface BarcodeLabel {
  variantId: number
  productName: string
  sku: string
  size?: string
  color?: string
  price: number
  mrp: number
  barcode: string
  symbology: string
  internal: boolean
  businessName: string
  branchName: string
}

export interface Movement {
  id: number
  movementDate: string
  type: string
  quantity: number
  previousQuantity: number
  newQuantity: number
  unitCost: number
  totalCost: number
  reason?: string
  referenceType?: string
  referenceId?: string
  username?: string
  variantId: number
  productName: string
  sku: string
  size?: string
  color?: string
  branchId: number
  branchName: string
}

export interface Transfer {
  id: number
  transferNo: string
  fromBranchId: number
  fromBranchName: string
  toBranchId: number
  toBranchName: string
  status: string
  transferDate: string
  notes?: string
  items: { variantId: number; productName: string; sku: string; quantity: number; unitCost: number }[]
  completedAt?: string
}

export interface Customer {
  id: number
  code: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
  city?: string
  state?: string
  stateCode?: string
  creditLimit: number
  discountPercent: number
  openingBalance: number
  notes?: string
  active: boolean
  outstandingBalance: number
}

export interface Supplier {
  id: number
  code: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
  city?: string
  state?: string
  stateCode?: string
  paymentTermsDays: number
  openingBalance: number
  notes?: string
  active: boolean
  outstandingPayable: number
}

export interface LedgerEntry {
  date: string
  type: string
  reference: string
  description: string
  debit: number
  credit: number
  balance: number
}

export interface PartyLedger {
  customerId?: number
  supplierId?: number
  customerName?: string
  supplierName?: string
  openingBalance: number
  totalDebit: number
  totalCredit: number
  closingBalance?: number
  closingPayable?: number
  entries: LedgerEntry[]
}

export interface SaleItemRequest {
  variantId: number
  quantity: number
  unitPrice?: number
  discountPercent?: number
  discountAmount?: number
}

export interface SaleChargeRequest {
  name: string
  amount: number
  taxable: boolean
  taxRate?: number
}

export interface SalePaymentRequest {
  method: string
  amount: number
  reference?: string
  bankAccountId?: number
}

export interface CreateSaleRequest {
  branchId: number
  customerId?: number | null
  invoiceDate?: string
  placeOfSupplyStateCode?: string
  notes?: string
  items: SaleItemRequest[]
  charges?: SaleChargeRequest[]
  billDiscountPercent?: number
  billDiscountAmount?: number
  payments?: SalePaymentRequest[]
  exchangeReturnId?: number
  approverUsername?: string
  approverPin?: string
  deviceId?: string
  offlineId?: string
  clientInvoiceRef?: string
}

export interface InvoiceItem {
  id: number
  variantId: number
  productName: string
  sku: string
  size?: string
  color?: string
  hsnCode?: string
  quantity: number
  unitPrice: number
  mrp: number
  discountPercent: number
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  taxableAmount: number
  taxAmount: number
  lineTotal: number
  costPrice: number
  costAmount: number
  returnedQuantity: number
}

export interface InvoiceCharge {
  id: number
  name: string
  amount: number
  taxable: boolean
  taxRate: number
  taxAmount: number
}

export interface InvoicePayment {
  id: number
  paymentNo: string
  type: string
  method: string
  amount: number
  reference?: string
  status: string
  postedAt: string
}

export interface Invoice {
  id: number
  invoiceNo: string
  financialYear: string
  branchId: number
  branchName: string
  invoiceDate: string
  status: string
  customerId?: number
  customerName: string
  customerPhone?: string
  customerGstin?: string
  placeOfSupplyStateCode?: string
  subtotal: number
  itemDiscount: number
  billDiscount: number
  additionalCharges: number
  taxableAmount: number
  taxTotal: number
  roundOff: number
  total: number
  paidAmount: number
  balanceAmount: number
  costOfGoods: number
  grossProfit: number
  gstEnabled: boolean
  taxInclusive: boolean
  notes?: string
  originalInvoiceId?: number
  amendmentReason?: string
  createdByName: string
  deviceId?: string
  offlineId?: string
  clientInvoiceRef?: string
  source: string
  journalEntryId?: number
  costJournalEntryId?: number
  postedAt: string
  cancelledAt?: string
  cancelReason?: string
  items: InvoiceItem[]
  charges: InvoiceCharge[]
  payments: InvoicePayment[]
}

export interface HeldBill {
  id: number
  branchId: number
  label: string
  customerId?: number
  dataJson: string
  createdBy: number
  createdAt: string
}

export interface ReturnItem {
  id: number
  invoiceItemId: number
  variantId: number
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  taxRate: number
  taxableAmount: number
  taxAmount: number
  lineTotal: number
  costPrice: number
  costAmount: number
  restockItem: boolean
  conditionNote?: string
}

export interface SalesReturn {
  id: number
  returnNo: string
  branchId: number
  branchName: string
  invoiceId: number
  invoiceNo: string
  customerId?: number
  customerName: string
  returnDate: string
  type: string
  status: string
  subtotal: number
  taxTotal: number
  total: number
  refundAmount: number
  costAmount: number
  reason: string
  conditionNotes?: string
  refundMethod?: string
  refundReference?: string
  exchangeInvoiceId?: number
  requestedByName: string
  approvedByName?: string
  approvedAt?: string
  rejectionReason?: string
  journalEntryId?: number
  refundPaymentId?: number
  completedAt?: string
  restock: boolean
  source: string
  deviceId?: string
  offlineId?: string
  createdAt: string
  items: ReturnItem[]
}

export interface ExpenseCategory {
  id: number
  name: string
  accountId: number
  accountCode: string
  accountName: string
  active: boolean
}

export interface Expense {
  id: number
  expenseNo: string
  branchId: number
  branchName: string
  categoryId: number
  categoryName: string
  expenseDate: string
  amount: number
  paymentMethod: string
  description: string
  attachmentUrl?: string
  status: string
  requestedByName: string
  approvedByName?: string
  approvedAt?: string
  rejectionReason?: string
  journalEntryId?: number
  cashSessionId?: number
  notes?: string
  createdAt: string
}

export interface CashMovement {
  id: number
  type: string
  amount: number
  reference?: string
  notes?: string
  userName: string
  createdAt: string
}

export interface CashSession {
  id: number
  branchId: number
  branchName: string
  cashierId: number
  cashierName: string
  openingBalance: number
  openedAt: string
  closedAt?: string
  cashSales: number
  cashRefunds: number
  cashExpenses: number
  deposits: number
  withdrawals: number
  expectedClosing: number
  actualClosing?: number
  difference?: number
  status: string
  notes?: string
  discrepancyReason?: string
  closedByName?: string
  approvedAt?: string
  movements: CashMovement[]
}

export interface DailyClosing {
  date: string
  branchId: number
  branchName: string
  salesTotal: number
  cashSales: number
  cardSales: number
  upiSales: number
  bankSales: number
  creditSales: number
  refunds: number
  expenses: number
  netCash: number
  invoiceCount: number
}

export interface Account {
  id: number
  code: string
  name: string
  type: string
  subtype?: string
  systemAccount: boolean
  cashBank: boolean
  active: boolean
}

export interface JournalLine {
  id: number
  accountId: number
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description?: string
}

export interface Journal {
  id: number
  entryNo: string
  entryDate: string
  description: string
  sourceType: string
  sourceId?: string
  status: string
  branchName: string
  createdByName: string
  postedAt: string
  lines: JournalLine[]
}

export interface TrialBalance {
  from: string
  to: string
  rows: { accountId: number; code: string; name: string; type: string; debit: number; credit: number; balance: number }[]
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

export interface LedgerRow {
  date: string
  entryNo: string
  description: string
  lineDescription?: string
  branchName: string
  debit: number
  credit: number
  balance: number
}

export interface AccountLedger {
  accountId: number
  code: string
  name: string
  type: string
  from: string
  to: string
  openingBalance: number
  totalDebit: number
  totalCredit: number
  closingBalance: number
  rows: LedgerRow[]
}

export interface ProfitLossLine {
  code: string
  name: string
  amount: number
}

export interface ProfitLoss {
  from: string
  to: string
  income: ProfitLossLine[]
  expenses: ProfitLossLine[]
  totalIncome: number
  totalExpenses: number
  netProfit: number
}

export interface BalanceSheet {
  asOf: string
  assets: ProfitLossLine[]
  liabilities: ProfitLossLine[]
  equity: ProfitLossLine[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  currentEarnings: number
  difference: number
}

export interface GstSummary {
  from: string
  to: string
  outputTax: number
  inputTax: number
  netPayable: number
  salesByRate: { taxRate: number; taxableAmount: number; taxAmount: number; quantity: number }[]
  purchasesByRate: { taxRate: number; taxableAmount: number; taxAmount: number; quantity: number }[]
}

export interface FinancialPeriod {
  id: number
  name: string
  startDate: string
  endDate: string
  status: string
  closedByName?: string
  closedAt?: string
  notes?: string
}

export interface PurchaseOrder {
  id: number
  orderNo: string
  branchId: number
  branchName: string
  supplierId: number
  supplierName: string
  status: string
  orderDate: string
  expectedDate?: string
  notes?: string
  subtotal: number
  taxTotal: number
  total: number
  createdAt: string
  items: {
    id: number
    variantId: number
    productName: string
    sku: string
    quantityOrdered: number
    quantityReceived: number
    unitCost: number
    taxRate: number
    lineTotal: number
  }[]
}

export interface PurchaseInvoice {
  id: number
  internalNo: string
  supplierInvoiceNo: string
  branchId: number
  branchName: string
  supplierId: number
  supplierName: string
  invoiceDate: string
  status: string
  subtotal: number
  discountAmount: number
  taxTotal: number
  total: number
  paidAmount: number
  balance: number
  notes?: string
  purchaseOrderId?: number
  journalEntryId?: number
  postedAt: string
  items: {
    id: number
    variantId: number
    productName: string
    sku: string
    quantity: number
    returnedQuantity: number
    unitCost: number
    discountAmount: number
    taxRate: number
    taxAmount: number
    lineTotal: number
    hsnCode?: string
  }[]
}

export interface SupplierPayment {
  id: number
  paymentNo: string
  supplierId: number
  supplierName: string
  purchaseInvoiceId?: number
  paymentDate: string
  amount: number
  method: string
  reference?: string
  status: string
  journalEntryId?: number
  postedAt: string
}

export interface PurchaseReturn {
  id: number
  returnNo: string
  branchId: number
  branchName: string
  supplierId: number
  supplierName: string
  purchaseInvoiceId?: number
  returnDate: string
  reason: string
  status: string
  subtotal: number
  taxTotal: number
  total: number
  journalEntryId?: number
  items: {
    id: number
    variantId: number
    productName: string
    sku: string
    quantity: number
    unitCost: number
    taxRate: number
    taxAmount: number
    lineTotal: number
  }[]
}

export interface SyncDevice {
  id: number
  deviceId: string
  branchId: number
  branchName: string
  name: string
  appVersion?: string
  active: boolean
  lastSyncAt?: string
  lastSeenAt?: string
  registeredAt: string
}

export interface SyncBatchSummary {
  id: number
  batchId: string
  branchId: number
  branchName: string
  deviceId: string
  status: string
  itemCount: number
  acceptedCount: number
  duplicateCount: number
  conflictCount: number
  rejectedCount: number
  processedAt: string
}

export interface SyncItemResult {
  offlineId: string
  status: 'ACCEPTED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED'
  invoiceId?: number
  invoiceNo?: string
  code?: string
  message?: string
  conflicts?: { variantId: number; lastKnownQuantity: number; requestedQuantity: number; currentQuantity: number }[]
}

export interface SyncBatchResponse {
  batchId: string
  status: string
  itemCount: number
  acceptedCount: number
  duplicateCount: number
  conflictCount: number
  rejectedCount: number
  processedAt: string
  items: SyncItemResult[]
}

export interface PullSnapshot {
  serverTime: string
  since?: string
  business: {
    id: number
    name: string
    currency: string
    gstEnabled: boolean
    gstin?: string
    stateCode?: string
    defaultTaxInclusive: boolean
    roundOffEnabled: boolean
    invoicePrefix: string
    financialYearStartMonth: number
    maxDiscountPercent: number
    allowNegativeStockWithApproval: boolean
    returnWindowDays: number
    exchangeWindowDays: number
    timezone: string
  }
  branch: {
    id: number
    code: string
    name: string
    address?: string
    city?: string
    state?: string
    stateCode?: string
    gstin?: string
    phone?: string
    invoicePrefix: string
  }
  variants: {
    id: number
    productId: number
    productCode: string
    productName: string
    categoryName?: string
    brandName?: string
    sku: string
    barcode?: string
    size?: string
    color?: string
    purchasePrice: number
    sellingPrice: number
    mrp: number
    reorderLevel: number
    active: boolean
    hsnCode?: string
    taxCategoryId?: number
    taxRate: number
    taxInclusive: boolean
    updatedAt?: string
  }[]
  stock: { variantId: number; sku: string; quantity: number; averageCost: number; lastMovementAt?: string; updatedAt?: string }[]
  customers: {
    id: number
    code: string
    name: string
    phone?: string
    email?: string
    gstin?: string
    address?: string
    city?: string
    state?: string
    stateCode?: string
    creditLimit: number
    discountPercent: number
    active: boolean
    updatedAt?: string
  }[]
  taxCategories: {
    id: number
    name: string
    hsnCode?: string
    gstRate: number
    cgstRate: number
    sgstRate: number
    igstRate: number
    exempt: boolean
    taxInclusive: boolean
    active: boolean
    updatedAt?: string
  }[]
}

export interface Backup {
  id: number
  fileName: string
  sizeBytes: number
  status: string
  type: string
  startedAt: string
  finishedAt?: string
  message?: string
  createdBy?: number
  checksum?: string
}

export interface NotificationTemplate {
  id: number
  event: string
  channel: string
  subject: string
  body: string
  active: boolean
}

export interface NotificationLog {
  id: number
  customerId?: number
  channel: string
  event: string
  recipient?: string
  subject?: string
  message: string
  status: string
  provider?: string
  providerMessageId?: string
  errorMessage?: string
  attempts: number
  sentAt?: string
  referenceType?: string
  referenceId?: string
  createdAt: string
}

export interface Role {
  id: number
  code: string
  name: string
  description?: string
  systemRole: boolean
  discountLimitPercent: number
  permissions: { id: number; code: string; module: string; description: string }[]
}

export interface User {
  id: number
  username: string
  email?: string
  fullName: string
  phone?: string
  active: boolean
  roles: { id: number; code: string; name: string; systemRole: boolean; discountLimitPercent: number; permissions: string[] }[]
  branches: { id: number; code: string; name: string }[]
  defaultBranchId?: number
  hasPin: boolean
  lastLoginAt?: string
}

export interface PermissionInfo {
  id: number
  code: string
  module: string
  description: string
}
