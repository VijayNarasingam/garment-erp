import type { ReceiptModel } from './types'

export interface ReceiptLine {
  text: string
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  large?: boolean
  /** When set, the printer renders a QR code instead of text. */
  qr?: string
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  BANK: 'Bank transfer',
  CHEQUE: 'Cheque',
  ADVANCE: 'Store credit',
  EXCHANGE: 'Exchange credit',
  CREDIT: 'Credit'
}

export function foldAscii(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
}

export function formatAmount(value: number): string {
  const number = Number.isFinite(value) ? value : 0
  const sign = number < 0 ? '-' : ''
  const [whole, decimals] = Math.abs(number).toFixed(2).split('.')
  const lastThree = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree
  return `${sign}${grouped}.${decimals}`
}

export function columnsFor(
  model: Pick<ReceiptModel, 'paperWidth' | 'fontSize'> & { columns?: number }
): number {
  // A calibrated width always wins: the driver's paper size is often wider than
  // what the printer really prints, and every extra column splits an amount.
  if (model.columns && model.columns >= 24 && model.columns <= 64) return model.columns
  if (model.fontSize === 'small') return model.paperWidth === 80 ? 64 : 42
  return model.paperWidth === 80 ? 48 : 32
}

/** Digits used by the calibration ruler: the last visible digit is the width. */
export const CALIBRATION_RULER =
  '1234567890123456789012345678901234567890123456789012345678901234'

export function wrapText(value: string, width: number): string[] {
  const clean = foldAscii(value).replace(/\s+/g, ' ').trim()
  if (!clean) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of clean.split(' ')) {
    if (word.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width))
      continue
    }
    if (!current) current = word
    else if (current.length + 1 + word.length <= width) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

/** Left label + right amount; wraps the label when the pair cannot fit on one line. */
export function row(left: string, right: string, width: number): string[] {
  const safeLeft = foldAscii(left)
  const safeRight = foldAscii(right)
  if (safeLeft.length + 1 + safeRight.length <= width) {
    return [safeLeft + ' '.repeat(width - safeLeft.length - safeRight.length) + safeRight]
  }
  if (safeRight.length >= width) {
    return wrapText(safeLeft, width).concat(wrapText(safeRight, width))
  }
  const wrapped = wrapText(safeLeft, Math.max(1, width - safeRight.length - 1))
  const last = wrapped.pop() ?? ''
  return [...wrapped, last + ' '.repeat(Math.max(1, width - last.length - safeRight.length)) + safeRight]
}

function signed(value: number): string {
  return value < 0 ? `-${formatAmount(Math.abs(value))}` : formatAmount(value)
}

export function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method?.toUpperCase()] ?? method
}

export function layoutReceipt(model: ReceiptModel): ReceiptLine[] {
  const width = columnsFor(model)
  const lines: ReceiptLine[] = []
  const push = (text = '', options: Omit<ReceiptLine, 'text'> = {}) => {
    lines.push({ text, ...options })
  }
  const centered = (text: string, options: Omit<ReceiptLine, 'text' | 'align'> = {}) =>
    push(text, { ...options, align: 'center' })
  /** Centred text folded to the paper width, so nothing runs off the roll. */
  const centeredLines = (text: string, options: Omit<ReceiptLine, 'text' | 'align'> = {}) => {
    for (const line of wrapText(text, width)) push(line, { ...options, align: 'center' })
  }
  const separator = (character: string) => push(character.repeat(width))

  if (model.showRuler) {
    // The ruler is printed longer than the paper on purpose: where it breaks
    // shows how many characters this printer really fits.
    push('PRINTER WIDTH TEST', { bold: true })
    push('Count the digits on the first ruler line.')
    push(CALIBRATION_RULER)
    push('|         |         |         |         |         |')
    separator('-')
  }
  /**
   * Label and amount on one line when they fit. On narrow paper the amount moves
   * to its own right-aligned line, so numbers are never split in the middle.
   */
  const rowOrStack = (left: string, right: string, options: Omit<ReceiptLine, 'text' | 'align'> = {}) => {
    if (foldAscii(left).length + 1 + foldAscii(right).length <= width) {
      for (const line of row(left, right, width)) push(line, options)
      return
    }
    for (const line of wrapText(left, width)) push(line, options)
    push(right, { ...options, align: 'right' })
  }

  centeredLines(model.shop.name, { bold: true, large: true })
  if (model.shop.branchName) centeredLines(model.shop.branchName)
  for (const address of model.shop.addressLines) {
    for (const line of wrapText(address, width)) centered(line)
  }
  if (model.shop.phone) centeredLines(`Contact: ${model.shop.phone}`)
  if (model.shop.gstEnabled && model.shop.gstin) centeredLines(`GSTIN ${model.shop.gstin}`)
  centeredLines(model.shop.gstEnabled ? 'TAX INVOICE' : 'BILL', { bold: true })

  if (model.duplicate) centered('*** DUPLICATE ***', { bold: true })
  if (model.cancelled) centered('*** CANCELLED ***', { bold: true })

  separator('=')
  rowOrStack(`Bill: ${model.invoiceNo}`, model.invoiceDate)
  if (model.offlineNote) centered(model.offlineNote, { bold: true })

  if (model.shows.cashier && model.cashier) push(`Cashier: ${model.cashier}`)
  if (model.customer && (model.shows.customer || Boolean(model.customer.gstin))) {
    push(`Customer: ${model.customer.name}`)
    if (model.customer.phone) push(`Phone: ${model.customer.phone}`)
    if (model.customer.gstin) push(`GSTIN ${model.customer.gstin}`)
  }

  separator('-')
  for (const item of model.items) {
    for (const line of wrapText(item.name, width)) push(line, { bold: true })

    const meta: string[] = []
    if (model.shows.sizeColor) {
      if (item.size) meta.push(item.size)
      if (item.color) meta.push(item.color)
    }
    if (model.shows.sku && item.sku) meta.push(`SKU ${item.sku}`)
    if (model.shows.hsn && item.hsnCode) meta.push(`HSN ${item.hsnCode}`)
    if (meta.length > 0) {
      for (const line of wrapText(`  ${Array.from(new Set(meta)).join(' / ')}`, width)) push(line)
    }

    const amount = formatAmount(item.lineAmount)
    let left = model.shows.itemRate ? `  ${item.quantity} x ${formatAmount(item.unitPrice)}` : `  ${item.quantity} pc`
    if (model.shows.itemDiscount && item.discountAmount > 0) left += `  -${formatAmount(item.discountAmount)}`
    rowOrStack(left, amount)
  }

  separator('-')
  rowOrStack('Subtotal', formatAmount(model.totals.subtotal))
  if (model.totals.discountTotal > 0) {
    rowOrStack('Discounts', `-${formatAmount(model.totals.discountTotal)}`)
  }
  for (const charge of model.charges) {
    rowOrStack(charge.name, formatAmount(charge.amount))
  }
  if (model.shop.gstEnabled) {
    rowOrStack('Taxable value', formatAmount(model.totals.taxableAmount))
    for (const group of model.taxGroups) {
      if (model.interState) {
        rowOrStack(`IGST ${formatTaxRate(group.rate)}`, formatAmount(group.tax))
      } else {
        const cgst = Math.round((group.tax / 2) * 100) / 100
        const sgst = Math.round((group.tax - cgst) * 100) / 100
        rowOrStack(`CGST ${formatTaxRate(group.rate / 2)}`, formatAmount(cgst))
        rowOrStack(`SGST ${formatTaxRate(group.rate / 2)}`, formatAmount(sgst))
      }
    }
  }
  if (Math.abs(model.totals.roundOff) >= 0.005) {
    rowOrStack('Round off', signed(model.totals.roundOff))
  }
  rowOrStack('TOTAL', `Rs.${formatAmount(model.totals.total)}`, { bold: true, large: true })

  if (model.shows.payment) {
    for (const payment of model.payments) {
      rowOrStack(`Paid (${paymentLabel(payment.method)})`, formatAmount(payment.amount))
    }
    if (model.totals.balanceAmount > 0.004) {
      rowOrStack('Balance due', formatAmount(model.totals.balanceAmount))
    }
    const change = model.totals.paidAmount - model.totals.total
    if (change > 0.004) {
      rowOrStack('Change', formatAmount(change))
    }
  }

  if (model.exchange) {
    separator('-')
    push(`EXCHANGE vs ${model.exchange.originInvoiceNo}`, { bold: true })
    for (const item of model.exchange.returnedItems) {
      for (const line of row(`  ${item.name}  -${item.quantity}`, `-${formatAmount(item.amount)}`, width)) push(line)
    }
    for (const line of row('Return credit', `-${formatAmount(model.exchange.credit)}`, width)) push(line)
    for (const line of row('Net paid', formatAmount(model.exchange.due), width)) push(line, { bold: true })
    if (model.exchange.returnNo) push(`Return ${model.exchange.returnNo}`)
  }

  if (model.shows.upiQr && model.upi) {
    push()
    push('', { align: 'center', qr: upiUri(model.upi) })
    centeredLines(`Scan to pay Rs.${formatAmount(model.upi.amount)}`)
    centeredLines(`UPI: ${model.upi.vpa}`)
  }

  if (model.shows.terms && model.terms) {
    push()
    for (const line of wrapText(model.terms, width)) push(line, { align: 'center' })
  }

  if (model.duplicate) centered('*** DUPLICATE ***', { bold: true })
  push()
  centeredLines(model.footer)
  return lines
}

export function upiUri(upi: { vpa: string; payeeName: string; amount: number; note: string }): string {
  const params = [
    `pa=${encodeURIComponent(upi.vpa)}`,
    `pn=${encodeURIComponent(upi.payeeName)}`,
    `am=${upi.amount.toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(upi.note)}`
  ]
  return `upi://pay?${params.join('&')}`
}

function formatTaxRate(rate: number): string {
  return `${Number(rate.toFixed(2))}%`
}

function qrCommand(data: string, moduleSize: number): number[] {
  const payload = Array.from(foldAscii(data), (character) => character.charCodeAt(0) & 0xff)
  const length = payload.length + 3
  return [
    0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30, ...payload,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30
  ]
}

/** Module size in dots: bigger modules make the QR easier to scan. */
export function qrModuleSize(model: Pick<ReceiptModel, 'qrSize' | 'paperWidth'>): number {
  if (model.qrSize && model.qrSize >= 3 && model.qrSize <= 10) return model.qrSize
  return model.paperWidth === 80 ? 6 : 5
}

export function buildEscPos(model: ReceiptModel): Uint8Array {
  const bytes: number[] = []
  const command = (...values: number[]) => bytes.push(...values)
  const text = (value: string) => {
    for (const character of foldAscii(value)) bytes.push(character.charCodeAt(0) & 0xff)
  }

  command(0x1b, 0x40)
  command(0x1b, 0x74, 0x00)
  // The manual recommends CP437; Font B doubles the characters per line for the small setting.
  command(0x1b, 0x4d, model.fontSize === 'small' ? 0x01 : 0x00)

  for (const line of layoutReceipt(model)) {
    if (line.qr) {
      command(0x1b, 0x61, 0x01)
      command(0x1d, 0x21, 0x00)
      command(0x1b, 0x45, 0x00)
      command(...qrCommand(line.qr, qrModuleSize(model)))
      continue
    }
    command(0x1b, 0x61, line.align === 'center' ? 0x01 : line.align === 'right' ? 0x02 : 0x00)
    command(0x1b, 0x45, line.bold ? 0x01 : 0x00)
    // 0x10 = double height only, so the 48/32-column layout still fits.
    command(0x1d, 0x21, line.large ? 0x10 : 0x00)
    text(line.text)
    bytes.push(0x0a)
  }

  command(0x1b, 0x61, 0x00)
  command(0x1b, 0x45, 0x00)
  command(0x1d, 0x21, 0x00)
  command(0x1b, 0x64, 0x03)
  command(0x1d, 0x56, 0x42, 0x00)
  return new Uint8Array(bytes)
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}
