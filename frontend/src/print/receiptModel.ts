import type { BranchInfo, BusinessInfo, Customer, Invoice, UserInfo } from '../lib/types'
import type { CartLine, SaleTotals } from '../lib/pos'
import { round2 } from '../lib/format'
import type { OfflineSale } from '../lib/offline'
import type {
  PrintPrefs,
  ReceiptModel,
  ReceiptShows,
  ReceiptSnapshot,
  ReceiptTotals
} from './types'

export interface ReceiptExchangeSource {
  origin: string
  due: number
  credit: number
  lines: { productName: string; sku?: string; perUnit: number; quantity: number }[]
  returnNo?: string
}

export interface ReceiptBuildInput {
  invoice?: Invoice
  offline?: OfflineSale
  exchange?: ReceiptExchangeSource
  business: BusinessInfo | null
  branch?: BranchInfo | null
  user?: UserInfo | null
  prefs: PrintPrefs
}

export interface ReceiptSettingsLike {
  name: string
  address: string
  phone: string
  gstEnabled: boolean
  gstin: string
  stateCode: string
  thankYouNote: string
  receiptShowCustomer: boolean
  receiptShowCashier: boolean
  receiptShowPayment: boolean
  receiptShowUpiQr: boolean
  receiptShowTerms: boolean
  receiptShowSku: boolean
  receiptShowSizeColor: boolean
  receiptShowHsn: boolean
  receiptShowItemRate: boolean
  receiptShowItemDiscount: boolean
  receiptTerms: string
  upiId: string
  upiPayeeName: string
  exchangeWindowDays: number | string
  returnWindowDays: number | string
}

export function buildReceiptModel(
  input: ReceiptBuildInput,
  options: { duplicate?: boolean; cancelled?: boolean } = {}
): ReceiptModel | null {
  const { invoice, offline, exchange, business, branch, user, prefs } = input
  const duplicate = options.duplicate === true
  const cancelled = options.cancelled === true

  if (offline?.receiptSnapshot) {
    return {
      ...offline.receiptSnapshot,
      paperWidth: prefs.paperWidth,
      fontSize: prefs.fontSize,
      duplicate,
      cancelled
    }
  }

  if (invoice) {
    return fromInvoice(invoice, business, branch, user, prefs, duplicate, cancelled, exchange)
  }

  if (offline) {
    return fromOffline(offline, business, branch, user, prefs, duplicate, cancelled)
  }

  if (exchange) {
    const shows = showsFor(business)
    const totals: ReceiptTotals = {
      subtotal: 0,
      discountTotal: 0,
      taxableAmount: 0,
      taxTotal: 0,
      roundOff: 0,
      total: exchange.due,
      paidAmount: exchange.due,
      balanceAmount: 0
    }
    return {
      kind: 'exchange',
      duplicate,
      cancelled,
      paperWidth: prefs.paperWidth,
      fontSize: prefs.fontSize,
      invoiceNo: exchange.returnNo ?? 'RETURN',
      invoiceDate: dateTimeLabel(new Date().toISOString()),
      shop: shopFor(business, branch),
      customer: undefined,
      cashier: user?.fullName,
      items: [],
      charges: [],
      totals,
      payments: [],
      taxGroups: [],
      interState: false,
      shows,
      exchange: exchangeFor(exchange),
      terms: undefined,
      footer: business?.thankYouNote?.trim() || 'Thank you for shopping with us!'
    }
  }

  return null
}

function fromInvoice(
  invoice: Invoice,
  business: BusinessInfo | null,
  branch: BranchInfo | null | undefined,
  user: UserInfo | null | undefined,
  prefs: PrintPrefs,
  duplicate: boolean,
  cancelled: boolean,
  exchange?: ReceiptExchangeSource
): ReceiptModel {
  const shows = showsFor(business, invoice.customerGstin)
  const gstin = branch?.gstin?.trim() || business?.gstin
  const customerName = invoice.customerName?.trim()
  const customer =
    customerName && (customerName.toLowerCase() !== 'walk-in customer' || invoice.customerGstin)
      ? { name: customerName, phone: invoice.customerPhone, gstin: invoice.customerGstin }
      : undefined

  const taxGroups = buildTaxGroups(
    invoice.items.map((item) => ({
      rate: item.taxRate,
      taxable: item.taxableAmount,
      tax: item.taxAmount
    })),
    invoice.charges.map((charge) => ({
      rate: charge.taxRate,
      taxable: charge.taxable ? charge.amount : 0,
      tax: charge.taxAmount
    })),
    invoice.taxTotal
  )

  const total = invoice.total
  const upiAmount = exchange ? exchange.due : total
  const upi = upiFor(business, upiAmount, invoice.invoiceNo)

  return {
    kind: 'sale',
    duplicate,
    cancelled,
    paperWidth: prefs.paperWidth,
    fontSize: prefs.fontSize,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: dateTimeLabel(invoice.postedAt ?? invoice.invoiceDate),
    shop: shopFor(business, branch, gstin),
    customer,
    cashier: invoice.createdByName,
    items: invoice.items.map((item) => ({
      name: item.productName,
      sku: item.sku,
      size: item.size,
      color: item.color,
      hsnCode: item.hsnCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
      lineAmount: item.lineTotal
    })),
    charges: invoice.charges.map((charge) => ({ name: charge.name, amount: charge.amount })),
    totals: {
      subtotal: invoice.subtotal,
      discountTotal: round2(invoice.itemDiscount + invoice.billDiscount),
      taxableAmount: invoice.taxableAmount,
      taxTotal: invoice.taxTotal,
      roundOff: invoice.roundOff,
      total,
      paidAmount: invoice.paidAmount,
      balanceAmount: invoice.balanceAmount
    },
    payments: invoice.payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
    taxGroups,
    interState: isInterState(invoice.placeOfSupplyStateCode, branch, business),
    shows,
    exchange: exchange ? exchangeFor(exchange) : undefined,
    upi,
    terms: shows.terms ? termsFor(business) : undefined,
    footer: business?.thankYouNote?.trim() || 'Thank you for shopping with us!'
  }
}

function fromOffline(
  sale: OfflineSale,
  business: BusinessInfo | null,
  branch: BranchInfo | null | undefined,
  user: UserInfo | null | undefined,
  prefs: PrintPrefs,
  duplicate: boolean,
  cancelled: boolean
): ReceiptModel {
  const request = sale.request
  const shows = showsFor(business)
  const invoiceNo = `OFFLINE-${sale.offlineId.slice(0, 8).toUpperCase()}`
  const subtotal = round2(
    (request.items ?? []).reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0), 0)
  )
  const itemDiscount = round2(
    (request.items ?? []).reduce((sum, item) => sum + Number(item.discountAmount ?? 0), 0)
  )
  const items = (request.items ?? []).map((item, index) => ({
    name: `Item ${index + 1}`,
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? 0),
    discountAmount: Number(item.discountAmount ?? 0),
    taxRate: 0,
    taxInclusive: false,
    lineAmount: round2(Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0) - Number(item.discountAmount ?? 0))
  }))
  const payments = (request.payments ?? []).map((payment) => ({
    method: payment.method,
    amount: Number(payment.amount ?? 0)
  }))
  const paidAmount = round2(payments.reduce((sum, payment) => sum + payment.amount, 0))

  return {
    kind: 'offline',
    duplicate,
    cancelled,
    paperWidth: prefs.paperWidth,
    fontSize: prefs.fontSize,
    invoiceNo,
    invoiceDate: dateTimeLabel(sale.createdAt),
    shop: shopFor(business, branch),
    customer: request.customerId ? { name: 'Customer' } : undefined,
    cashier: user?.fullName,
    items,
    charges: (request.charges ?? []).map((charge) => ({ name: charge.name, amount: Number(charge.amount ?? 0) })),
    totals: {
      subtotal,
      discountTotal: round2(itemDiscount + Number(request.billDiscountAmount ?? 0)),
      taxableAmount: 0,
      taxTotal: 0,
      roundOff: 0,
      total: Number(sale.total ?? 0),
      paidAmount,
      balanceAmount: Math.max(0, round2(Number(sale.total ?? 0) - paidAmount))
    },
    payments,
    taxGroups: [],
    interState: false,
    shows,
    upi: upiFor(business, Number(sale.total ?? 0), invoiceNo),
    terms: shows.terms ? termsFor(business) : undefined,
    footer: business?.thankYouNote?.trim() || 'Thank you for shopping with us!',
    offlineNote: 'OFFLINE BILL - pending sync'
  }
}

export interface OfflineSnapshotInput {
  offlineId: string
  createdAt: string
  request: OfflineSale['request']
  lines: CartLine[]
  totals: SaleTotals
  customer: Customer | null
  cashier?: string
  business: BusinessInfo | null
  branch?: BranchInfo | null
}

export function buildOfflineSnapshot(input: OfflineSnapshotInput): ReceiptSnapshot {
  const { business, branch, totals, lines, customer, request } = input
  const shows = showsFor(business)
  const invoiceNo = `OFFLINE-${input.offlineId.slice(0, 8).toUpperCase()}`
  const payments = (request.payments ?? []).map((payment) => ({
    method: payment.method,
    amount: Number(payment.amount ?? 0)
  }))
  const paidAmount = round2(payments.reduce((sum, payment) => sum + payment.amount, 0))
  const taxGroups = buildTaxGroups(
    lines.map((line) => {
      const entry = totals.lineTotals[line.variantId]
      return { rate: line.taxRate, taxable: entry?.taxable ?? 0, tax: entry?.tax ?? 0 }
    }),
    [],
    totals.taxTotal
  )

  return {
    kind: 'offline',
    invoiceNo,
    invoiceDate: dateTimeLabel(input.createdAt),
    shop: shopFor(business, branch),
    customer: customer ? { name: customer.name, phone: customer.phone ?? undefined, gstin: customer.gstin ?? undefined } : undefined,
    cashier: input.cashier,
    items: lines.map((line) => {
      const entry = totals.lineTotals[line.variantId]
      return {
        name: line.productName,
        sku: line.sku,
        size: line.size,
        color: line.color,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: round2((entry?.lineDiscount ?? 0) + (entry?.allocatedDiscount ?? 0)),
        taxRate: line.taxRate,
        taxInclusive: line.taxInclusive,
        lineAmount: entry?.total ?? round2(line.unitPrice * line.quantity)
      }
    }),
    charges: (request.charges ?? []).map((charge) => ({ name: charge.name, amount: Number(charge.amount ?? 0) })),
    totals: {
      subtotal: totals.subtotal,
      discountTotal: round2(totals.itemDiscount + totals.billDiscount),
      taxableAmount: totals.taxableAmount,
      taxTotal: totals.taxTotal,
      roundOff: totals.roundOff,
      total: totals.total,
      paidAmount,
      balanceAmount: Math.max(0, round2(totals.total - paidAmount))
    },
    payments,
    taxGroups,
    interState: false,
    shows,
    upi: upiFor(business, totals.total, invoiceNo),
    terms: shows.terms ? termsFor(business) : undefined,
    footer: business?.thankYouNote?.trim() || 'Thank you for shopping with us!',
    offlineNote: 'OFFLINE BILL - pending sync'
  }
}

export function buildPreviewModel(input: {
  form: ReceiptSettingsLike
  business: BusinessInfo | null
  branch?: BranchInfo | null
  user?: UserInfo | null
  prefs: PrintPrefs
}): ReceiptModel {
  const { form, branch, user, prefs } = input
  const shows = showsFor(form)
  const totals: ReceiptTotals = {
    subtotal: 3497,
    discountTotal: 100,
    taxableAmount: 3447,
    taxTotal: 172.35,
    roundOff: -0.35,
    total: 3619,
    paidAmount: 3619,
    balanceAmount: 0
  }
  const gstin = branch?.gstin?.trim() || form.gstin
  return {
    kind: 'sale',
    duplicate: false,
    cancelled: false,
    paperWidth: prefs.paperWidth,
    fontSize: prefs.fontSize,
    invoiceNo: `${form.name ? 'INV' : 'INV'}/2026-27/000123`,
    invoiceDate: dateTimeLabel(new Date().toISOString()),
    shop: {
      name: form.name || 'Shop name',
      branchName: branch?.name ?? '',
      addressLines: addressLines(form.address),
      phone: form.phone || undefined,
      gstin: form.gstEnabled ? gstin || undefined : undefined,
      gstEnabled: form.gstEnabled
    },
    customer: shows.customer ? { name: 'Ramesh', phone: '98765 12345' } : undefined,
    cashier: shows.cashier ? user?.fullName ?? 'Priya' : undefined,
    items: [
      {
        name: 'Cotton Kurta',
        sku: 'KURTA-M-BLU',
        size: 'M',
        color: 'Blue',
        hsnCode: '6205',
        quantity: 2,
        unitPrice: 1299,
        discountAmount: 100,
        taxRate: 5,
        taxInclusive: false,
        lineAmount: 2498
      },
      {
        name: 'Silk Dupatta',
        sku: 'DUP-001',
        size: 'Free',
        color: 'Maroon',
        hsnCode: '6214',
        quantity: 1,
        unitPrice: 899,
        discountAmount: 0,
        taxRate: 5,
        taxInclusive: false,
        lineAmount: 899
      }
    ],
    charges: [{ name: 'Alteration', amount: 50 }],
    totals,
    payments: shows.payment ? [{ method: 'CASH', amount: 3619 }] : [],
    taxGroups: [{ rate: 5, taxable: 3447, tax: 172.35 }],
    interState: false,
    shows,
    upi: upiFor(form, totals.total, 'INV/2026-27/000123'),
    terms: shows.terms ? termsFor(form) : undefined,
    footer: form.thankYouNote.trim() || 'Thank you for shopping with us!'
  }
}

function exchangeFor(exchange: ReceiptExchangeSource) {
  return {
    originInvoiceNo: exchange.origin,
    credit: exchange.credit,
    due: exchange.due,
    returnNo: exchange.returnNo,
    returnedItems: exchange.lines.map((line) => ({
      name: line.productName,
      quantity: line.quantity,
      amount: round2(line.perUnit * line.quantity)
    }))
  }
}

function showsFor(settings: BusinessInfo | ReceiptSettingsLike | null, customerGstin?: string): ReceiptShows {
  return {
    customer: settings?.receiptShowCustomer !== false,
    cashier: settings?.receiptShowCashier !== false,
    payment: settings?.receiptShowPayment !== false,
    upiQr: settings?.receiptShowUpiQr !== false,
    terms: settings?.receiptShowTerms !== false,
    sku: settings?.receiptShowSku === true,
    sizeColor: settings?.receiptShowSizeColor === true,
    hsn: settings?.receiptShowHsn === true || Boolean(customerGstin?.trim()),
    itemRate: settings?.receiptShowItemRate !== false,
    itemDiscount: settings?.receiptShowItemDiscount !== false
  }
}

function shopFor(
  business: BusinessInfo | ReceiptSettingsLike | null,
  branch?: BranchInfo | null,
  gstinOverride?: string
): ReceiptModel['shop'] {
  return {
    name: business?.name ?? 'Garment Shop',
    branchName: branch?.name ?? '',
    addressLines: addressLines(business?.address ?? ''),
    phone: business?.phone || undefined,
    gstin: gstinOverride || business?.gstin || undefined,
    gstEnabled: business?.gstEnabled === true
  }
}

function addressLines(address: string): string[] {
  return address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function termsFor(settings: BusinessInfo | ReceiptSettingsLike | null): string | undefined {
  const custom = settings?.receiptTerms?.trim()
  if (custom) return custom
  const exchangeDays = Number(settings?.exchangeWindowDays ?? 0)
  const returnDays = Number(settings?.returnWindowDays ?? 0)
  const parts: string[] = []
  if (exchangeDays > 0) parts.push(`Exchange within ${exchangeDays} days with this bill.`)
  if (returnDays > 0) parts.push(`Returns within ${returnDays} days.`)
  return parts.length > 0 ? parts.join(' ') : undefined
}

function upiFor(
  settings: BusinessInfo | ReceiptSettingsLike | null,
  amount: number,
  note: string
): ReceiptModel['upi'] {
  const vpa = settings?.upiId?.trim()
  if (settings?.receiptShowUpiQr === false || !vpa || amount <= 0.004) return undefined
  return {
    vpa,
    payeeName: settings?.upiPayeeName?.trim() || settings?.name || 'Garment Shop',
    amount: round2(amount),
    note
  }
}

function isInterState(
  placeOfSupply: string | undefined,
  branch: BranchInfo | null | undefined,
  business: BusinessInfo | null
): boolean {
  const supply = placeOfSupply?.trim()
  const home = branch?.stateCode?.trim() || business?.stateCode?.trim()
  return Boolean(supply && home && supply !== home)
}

function buildTaxGroups(
  itemGroups: { rate: number; taxable: number; tax: number }[],
  chargeGroups: { rate: number; taxable: number; tax: number }[],
  expectedTax: number
): { rate: number; taxable: number; tax: number }[] {
  const map = new Map<number, { taxable: number; tax: number }>()
  for (const group of [...itemGroups, ...chargeGroups]) {
    const rate = round2(Number(group.rate))
    if (!(rate > 0)) continue
    const current = map.get(rate) ?? { taxable: 0, tax: 0 }
    current.taxable = round2(current.taxable + Number(group.taxable ?? 0))
    current.tax = round2(current.tax + Number(group.tax ?? 0))
    map.set(rate, current)
  }
  const groups = Array.from(map.entries())
    .sort(([left], [right]) => left - right)
    .map(([rate, value]) => ({ rate, taxable: value.taxable, tax: value.tax }))
  const groupedTax = round2(groups.reduce((sum, group) => sum + group.tax, 0))
  const difference = round2(expectedTax - groupedTax)
  if (groups.length > 0 && Math.abs(difference) <= 0.05 && difference !== 0) {
    const largest = groups.reduce((best, group) => (group.tax > best.tax ? group : best), groups[0])
    largest.tax = round2(largest.tax + difference)
  }
  return groups
}

function dateTimeLabel(value?: string): string {
  const raw = value?.trim()
  if (!raw) return ''
  const date = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
