import { round2 } from './format'
import type { CreateSaleRequest, SaleChargeRequest, SalePaymentRequest } from './types'

export interface CartLine {
  variantId: number
  productId?: number
  productName: string
  sku: string
  size?: string
  color?: string
  unitPrice: number
  mrp: number
  taxRate: number
  taxInclusive: boolean
  quantity: number
  stock: number
  /** Discount applied to THIS line only (in addition to the bill-level discount). */
  lineDiscount?: Discount
}

export interface Discount {
  type: 'amount' | 'percent'
  value: number
}

export interface Charge {
  name: string
  amount: number
  taxable: boolean
  taxRate: number
}

export interface PaymentLine {
  method: string
  amount: number
  reference?: string
}

export interface SaleTotals {
  subtotal: number
  itemDiscount: number
  billDiscount: number
  taxableAmount: number
  taxTotal: number
  additionalCharges: number
  roundOff: number
  total: number
  lineTotals: Record<
    number,
    { taxable: number; tax: number; total: number; lineDiscount: number; allocatedDiscount: number }
  >
}

export function calculateSale(
  lines: CartLine[],
  discount: Discount,
  charges: Charge[],
  roundOffEnabled: boolean,
  gstEnabled = true
): SaleTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + round2(line.unitPrice * line.quantity), 0))

  const base = lines.map((line) => {
    const gross = round2(line.unitPrice * line.quantity)
    // Per-line discount mirrors the backend: amount is the whole-line value and is
    // capped at the line gross; percent is computed on gross (HALF_UP at 2 dp).
    let lineDiscountValue = 0
    if (line.lineDiscount && line.lineDiscount.value > 0) {
      lineDiscountValue =
        line.lineDiscount.type === 'percent'
          ? round2((gross * Math.min(line.lineDiscount.value, 100)) / 100)
          : round2(Math.min(line.lineDiscount.value, gross))
    }
    const net = round2(gross - lineDiscountValue)
    // GST disabled → rates are zero and inclusive pricing is ignored (backend parity).
    const rate = gstEnabled ? line.taxRate : 0
    const inclusive = gstEnabled && line.taxInclusive
    let taxable: number
    let tax: number
    if (inclusive && rate > 0) {
      taxable = round2(net / (1 + rate / 100))
      tax = round2(net - taxable)
    } else {
      taxable = net
      tax = round2((taxable * rate) / 100)
    }
    return { line, gross, lineDiscount: lineDiscountValue, taxable, tax, net }
  })

  const lineNetTotal = round2(base.reduce((sum, entry) => sum + entry.net, 0))
  let billDiscount = 0
  if (discount.value > 0) {
    billDiscount =
      discount.type === 'percent'
        ? round2((lineNetTotal * Math.min(discount.value, 100)) / 100)
        : round2(Math.min(discount.value, lineNetTotal))
  }

  const ratio = lineNetTotal > 0 ? billDiscount / lineNetTotal : 0
  const lineTotals: SaleTotals['lineTotals'] = {}
  let allocatedTotal = 0
  base.forEach((entry, index) => {
    const allocated =
      index === base.length - 1
        ? round2(billDiscount - allocatedTotal)
        : round2(entry.net * ratio)
    allocatedTotal = round2(allocatedTotal + allocated)
    const factor = 1 - ratio
    lineTotals[entry.line.variantId] = {
      taxable: round2(entry.taxable * factor),
      tax: round2(entry.tax * factor),
      total: round2(entry.net - allocated),
      lineDiscount: entry.lineDiscount,
      allocatedDiscount: allocated
    }
  })

  let taxableAmount = round2(Object.values(lineTotals).reduce((sum, entry) => sum + entry.taxable, 0))
  let taxTotal = round2(Object.values(lineTotals).reduce((sum, entry) => sum + entry.tax, 0))
  let additionalCharges = 0
  let nonTaxableCharges = 0

  for (const charge of charges) {
    if (!charge.name.trim() || charge.amount <= 0) continue
    const amount = round2(charge.amount)
    additionalCharges = round2(additionalCharges + amount)
    if (charge.taxable) {
      const tax = round2((amount * (gstEnabled ? charge.taxRate : 0)) / 100)
      taxableAmount = round2(taxableAmount + amount)
      taxTotal = round2(taxTotal + tax)
    } else {
      nonTaxableCharges = round2(nonTaxableCharges + amount)
    }
  }

  const beforeRound = round2(taxableAmount + taxTotal + nonTaxableCharges)
  const rounded = Math.round(beforeRound)
  const roundOff = roundOffEnabled ? round2(rounded - beforeRound) : 0
  const total = round2(beforeRound + roundOff)

  return {
    subtotal,
    itemDiscount: round2(base.reduce((sum, entry) => sum + entry.lineDiscount, 0)),
    billDiscount,
    taxableAmount,
    taxTotal,
    additionalCharges,
    roundOff,
    total,
    lineTotals
  }
}

export function buildSaleRequest(options: {
  branchId: number
  lines: CartLine[]
  customerId: number | null
  discount: Discount
  charges: Charge[]
  payments: PaymentLine[]
  notes?: string
  stateCode?: string
  deviceId?: string
  offlineId?: string
  exchangeReturnId?: number
  approverUsername?: string
  approverPin?: string
}): CreateSaleRequest {
  const payloadCharges: SaleChargeRequest[] = options.charges
    .filter((charge) => charge.name.trim() && charge.amount > 0)
    .map((charge) => ({
      name: charge.name.trim(),
      amount: round2(charge.amount),
      taxable: charge.taxable,
      taxRate: charge.taxable ? charge.taxRate : 0
    }))

  const payloadPayments: SalePaymentRequest[] = options.payments
    .filter((payment) => payment.amount > 0)
    .map((payment) => ({
      method: payment.method,
      amount: round2(payment.amount),
      reference: payment.reference?.trim() || undefined
    }))

  return {
    branchId: options.branchId,
    customerId: options.customerId,
    invoiceDate: undefined,
    placeOfSupplyStateCode: options.stateCode,
    notes: options.notes?.trim() || undefined,
    items: options.lines.map((line) => {
      const gross = round2(line.unitPrice * line.quantity)
      const item = {
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: round2(line.unitPrice)
      }
      // The backend rejects a line carrying BOTH percent and amount, so send exactly one.
      if (line.lineDiscount && line.lineDiscount.value > 0 && line.lineDiscount.type === 'percent') {
        return { ...item, discountPercent: Math.min(line.lineDiscount.value, 100) }
      }
      if (line.lineDiscount && line.lineDiscount.value > 0) {
        return { ...item, discountAmount: round2(Math.min(line.lineDiscount.value, gross)) }
      }
      return item
    }),
    charges: payloadCharges.length > 0 ? payloadCharges : undefined,
    billDiscountAmount:
      options.discount.type === 'amount' && options.discount.value > 0
        ? round2(options.discount.value)
        : undefined,
    billDiscountPercent:
      options.discount.type === 'percent' && options.discount.value > 0
        ? options.discount.value
        : undefined,
    payments: payloadPayments.length > 0 ? payloadPayments : undefined,
    exchangeReturnId: options.exchangeReturnId,
    deviceId: options.deviceId,
    offlineId: options.offlineId,
    clientInvoiceRef: options.offlineId ? `OFFLINE-${options.offlineId}` : `POS-${Date.now()}`,
    approverUsername: options.approverUsername,
    approverPin: options.approverPin
  }
}

export const paymentMethods = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ADVANCE', label: 'Store credit' },
  { value: 'EXCHANGE', label: 'Exchange credit' }
]
