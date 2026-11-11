import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BranchInfo, BusinessInfo, CreateSaleRequest, Customer, Invoice, UserInfo } from '../lib/types'
import type { CartLine, SaleTotals } from '../lib/pos'
import {
  buildEscPos,
  CALIBRATION_RULER,
  columnsFor,
  foldAscii,
  formatAmount,
  layoutReceipt,
  qrModuleSize,
  row,
  toBase64,
  upiUri,
  wrapText
} from './escpos'
import {
  buildOfflineSnapshot,
  buildPreviewModel,
  buildReceiptModel,
  type ReceiptSettingsLike
} from './receiptModel'
import {
  DEFAULT_AGENT_URL,
  DEFAULT_PRINT_PREFS,
  clampColumns,
  columnsForPrinter,
  loadPrintPrefs,
  normalizeAgentUrl,
  normalizePrintPrefs,
  savePrintPrefs
} from './printPrefs'
import { AgentError, agentPrint, agentPrinters } from './printAgent'
import type { PrintPrefs, ReceiptModel } from './types'

const prefs: PrintPrefs = { ...DEFAULT_PRINT_PREFS, paperWidth: 80, fontSize: 'normal' }

function business(overrides: Partial<BusinessInfo> = {}): BusinessInfo {
  return {
    id: 1,
    name: 'Vijay Trendy Hub',
    legalName: 'Vijay Trendy Hub',
    gstin: '33ABCDE1234F1Z5',
    stateCode: '33',
    address: '12 Gandhi Street\nChennai',
    phone: '9876543210',
    email: 'shop@example.com',
    gstEnabled: true,
    currency: 'INR',
    invoicePrefix: 'INV',
    roundOffEnabled: true,
    defaultTaxInclusive: false,
    returnWindowDays: 7,
    exchangeWindowDays: 15,
    returnApprovalRequired: true,
    refundToOriginalMethodOnly: true,
    allowNegativeStockWithApproval: false,
    costingMethod: 'FIFO',
    financialYearStartMonth: 4,
    thankYouNote: 'Thank you for shopping with us!',
    receiptShowCustomer: true,
    receiptShowCashier: true,
    receiptShowPayment: true,
    receiptShowUpiQr: true,
    receiptShowTerms: true,
    receiptShowSku: false,
    receiptShowSizeColor: false,
    receiptShowHsn: false,
    receiptShowItemRate: true,
    receiptShowItemDiscount: true,
    receiptTerms: 'Exchange within 15 days with this bill.',
    upiId: 'vijaytrendy@okaxis',
    upiPayeeName: 'Vijay Trendy Hub',
    ...overrides
  } as BusinessInfo
}

const branch = {
  id: 2,
  code: 'MAIN',
  name: 'Main Store',
  address: '12 Gandhi Street',
  city: 'Chennai',
  stateCode: '33',
  gstin: '33ABCDE1234F1Z5',
  invoicePrefix: 'INV',
  primaryBranch: true
} as BranchInfo

const user = { id: 5, fullName: 'Priya', username: 'priya' } as UserInfo

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 10,
    invoiceNo: 'INV/2026-27/000123',
    financialYear: '2026-27',
    branchId: 2,
    branchName: 'Main Store',
    invoiceDate: '2026-03-04',
    status: 'COMPLETED',
    customerId: 3,
    customerName: 'Ramesh',
    customerPhone: '9000000000',
    subtotal: 1000,
    itemDiscount: 0,
    billDiscount: 0,
    additionalCharges: 0,
    taxableAmount: 1000,
    taxTotal: 50,
    roundOff: 0,
    total: 1050,
    paidAmount: 1050,
    balanceAmount: 0,
    costOfGoods: 0,
    grossProfit: 0,
    gstEnabled: true,
    taxInclusive: false,
    createdByName: 'Priya',
    source: 'POS',
    postedAt: '2026-03-04T10:05:00',
    items: [
      {
        id: 1,
        variantId: 11,
        productName: 'Cotton Kurta',
        sku: 'KURTA-M-BLU',
        size: 'M',
        color: 'Blue',
        hsnCode: '6205',
        quantity: 2,
        unitPrice: 500,
        mrp: 599,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: 5,
        taxInclusive: false,
        taxableAmount: 1000,
        taxAmount: 50,
        lineTotal: 1050,
        costPrice: 0,
        costAmount: 0,
        returnedQuantity: 0
      }
    ],
    charges: [],
    payments: [{ id: 1, method: 'CASH', amount: 1050, reference: undefined }],
    ...overrides
  } as Invoice
}

function settingsForm(overrides: Partial<ReceiptSettingsLike> = {}): ReceiptSettingsLike {
  return {
    name: 'Vijay Trendy Hub',
    address: '12 Gandhi Street\nChennai',
    phone: '9876543210',
    gstEnabled: true,
    gstin: '33ABCDE1234F1Z5',
    stateCode: '33',
    thankYouNote: 'Thank you for shopping with us!',
    receiptShowCustomer: true,
    receiptShowCashier: true,
    receiptShowPayment: true,
    receiptShowUpiQr: true,
    receiptShowTerms: true,
    receiptShowSku: false,
    receiptShowSizeColor: false,
    receiptShowHsn: false,
    receiptShowItemRate: true,
    receiptShowItemDiscount: true,
    receiptTerms: 'Exchange within 15 days with this bill.',
    upiId: 'vijaytrendy@okaxis',
    upiPayeeName: 'Vijay Trendy Hub',
    exchangeWindowDays: 15,
    returnWindowDays: 7,
    ...overrides
  }
}

function baseModel(overrides: Partial<ReceiptModel> = {}): ReceiptModel {
  return {
    kind: 'sale',
    duplicate: false,
    cancelled: false,
    paperWidth: 80,
    fontSize: 'normal',
    invoiceNo: 'INV/2026-27/000123',
    invoiceDate: '04-03-2026 10:05',
    shop: {
      name: 'Vijay Trendy Hub',
      branchName: 'Main Store',
      addressLines: ['12 Gandhi Street', 'Chennai'],
      phone: '9876543210',
      gstin: '33ABCDE1234F1Z5',
      gstEnabled: true
    },
    customer: { name: 'Ramesh', phone: '9000000000' },
    cashier: 'Priya',
    items: [
      {
        name: 'Cotton Kurta',
        sku: 'KURTA-M-BLU',
        size: 'M',
        color: 'Blue',
        hsnCode: '6205',
        quantity: 2,
        unitPrice: 500,
        discountAmount: 100,
        taxRate: 5,
        taxInclusive: false,
        lineAmount: 900
      }
    ],
    charges: [],
    totals: {
      subtotal: 1000,
      discountTotal: 100,
      taxableAmount: 900,
      taxTotal: 45,
      roundOff: -0.05,
      total: 945,
      paidAmount: 945,
      balanceAmount: 0
    },
    payments: [{ method: 'CASH', amount: 945 }],
    taxGroups: [{ rate: 5, taxable: 900, tax: 45 }],
    interState: false,
    shows: {
      customer: true,
      cashier: true,
      payment: true,
      upiQr: true,
      terms: true,
      sku: false,
      sizeColor: false,
      hsn: false,
      itemRate: true,
      itemDiscount: true
    },
    upi: {
      vpa: 'vijaytrendy@okaxis',
      payeeName: 'Vijay Trendy Hub',
      amount: 945,
      note: 'INV/2026-27/000123'
    },
    terms: 'Exchange within 15 days with this bill.',
    footer: 'Thank you for shopping with us!',
    ...overrides
  }
}

describe('escpos text helpers', () => {
  it('folds unsupported characters and strips control bytes', () => {
    expect(foldAscii('₹1,234 – “kurta”\u001b@')).toBe("Rs.1,234 - \"kurta\"@")
    expect(foldAscii('Café')).toBe('Caf?')
    expect(foldAscii(null)).toBe('')
  })

  it('formats amounts with Indian digit grouping', () => {
    expect(formatAmount(945)).toBe('945.00')
    expect(formatAmount(1234.5)).toBe('1,234.50')
    expect(formatAmount(1234567.891)).toBe('12,34,567.89')
    expect(formatAmount(-1234.5)).toBe('-1,234.50')
    expect(formatAmount(Number.NaN)).toBe('0.00')
  })

  it('uses 48/32 columns at normal size and 64/42 at small size', () => {
    expect(columnsFor({ paperWidth: 80, fontSize: 'normal' })).toBe(48)
    expect(columnsFor({ paperWidth: 58, fontSize: 'normal' })).toBe(32)
    expect(columnsFor({ paperWidth: 80, fontSize: 'small' })).toBe(64)
    expect(columnsFor({ paperWidth: 58, fontSize: 'small' })).toBe(42)
  })

  it('wraps on words and hard-splits words longer than the line', () => {
    expect(wrapText('Cotton Kurta', 48)).toEqual(['Cotton Kurta'])
    expect(wrapText('Cotton Kurta', 6)).toEqual(['Cotton', 'Kurta'])
    expect(wrapText('ABCDEFGH', 3)).toEqual(['ABC', 'DEF', 'GH'])
    expect(wrapText('', 10)).toEqual([''])
  })

  it('right-aligns the amount to the configured width and wraps long rows', () => {
    expect(row('Subtotal', '1,000.00', 20)).toEqual([pad('Subtotal', '1,000.00', 20)])
    const wrapped = row('A very long label for a narrow thermal printer', '1,000.00', 20)
    expect(wrapped.every((line) => line.length <= 20)).toBe(true)
    expect(wrapped[wrapped.length - 1].endsWith('1,000.00')).toBe(true)
  })
})

describe('layoutReceipt', () => {
  it('prints header, item, totals, tax split, payment and terms', () => {
    const lines = layoutReceipt(baseModel())
    const text = lines.map((line) => line.text)

    expect(text[0]).toBe('Vijay Trendy Hub')
    expect(lines[0]).toMatchObject({ align: 'center', bold: true, large: true })
    expect(text).toContain('TAX INVOICE')
    expect(text).toContain('Bill: INV/2026-27/000123'.padEnd(48 - '04-03-2026 10:05'.length) + '04-03-2026 10:05')
    expect(text).toContain('Cashier: Priya')
    expect(text).toContain('Customer: Ramesh')
    expect(text).toContain('Cotton Kurta')
    expect(text).toContain(pad('  2 x 500.00  -100.00', '900.00'))
    expect(text).toContain(pad('Discounts', '-100.00'))
    expect(text).toContain(pad('CGST 2.5%', '22.50'))
    expect(text).toContain(pad('SGST 2.5%', '22.50'))
    expect(text).toContain(pad('Round off', '-0.05'))
    expect(text).toContain(pad('TOTAL', 'Rs.945.00'))
    expect(text).toContain(pad('Paid (Cash)', '945.00'))
    expect(text).toContain('Exchange within 15 days with this bill.')
    expect(text).toContain('Thank you for shopping with us!')
  })

  it('uses IGST for inter-state bills', () => {
    const text = layoutReceipt(baseModel({ interState: true })).map((line) => line.text)
    expect(text).toContain('IGST 5%'.padEnd(48 - '45.00'.length) + '45.00')
    expect(text.some((line) => line.startsWith('CGST'))).toBe(false)
  })

  it('honours item toggles and hides customer/payment sections', () => {
    const model = baseModel({
      customer: undefined,
      cashier: undefined,
      payments: [],
      upi: undefined,
      terms: undefined,
      shows: {
        customer: false,
        cashier: false,
        payment: false,
        upiQr: false,
        terms: false,
        sku: true,
        sizeColor: true,
        hsn: true,
        itemRate: false,
        itemDiscount: false
      }
    })
    const text = layoutReceipt(model).map((line) => line.text)

    expect(text.some((line) => line.startsWith('Customer:'))).toBe(false)
    expect(text.some((line) => line.startsWith('Paid'))).toBe(false)
    expect(text).not.toContain('Exchange within 15 days with this bill.')
    expect(text).toContain('M / Blue / SKU KURTA-M-BLU / HSN 6205')
    expect(text).toContain(pad('  2 pc', '900.00'))
  })

  it('marks duplicates and cancellations', () => {
    const text = layoutReceipt(baseModel({ duplicate: true, cancelled: true })).map((line) => line.text)
    expect(text.filter((line) => line === '*** DUPLICATE ***')).toHaveLength(2)
    expect(text).toContain('*** CANCELLED ***')
  })

  it('renders the UPI QR as a QR line with the bill amount', () => {
    const qr = layoutReceipt(baseModel()).find((line) => line.qr)
    expect(qr?.qr).toBe(upiUri(baseModel().upi!))
    expect(qr?.qr).toContain('upi://pay?pa=vijaytrendy%40okaxis')
    expect(qr?.qr).toContain('am=945.00')
    expect(qr?.align).toBe('center')
  })

  it('wraps the receipt to 32 columns on 58 mm paper', () => {
    const lines = layoutReceipt(baseModel({ paperWidth: 58 }))
    const separators = lines.filter((line) => line.text === '-'.repeat(32))
    expect(separators.length).toBeGreaterThan(0)
    expect(lines.some((line) => line.text === '-'.repeat(48))).toBe(false)
    for (const line of lines) {
      expect(line.text.length).toBeLessThanOrEqual(32)
    }
  })

  it('keeps a long shop name and thank-you note inside the paper', () => {
    const model = baseModel({
      shop: { ...baseModel().shop, name: 'Vijay Trendy hub of Madurai' },
      footer: 'Thank you for shopping with us! Visit again soon.'
    })
    const lines = layoutReceipt(model).map((line) => line.text)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(48)
    expect(lines).toContain('Thank you for shopping with us! Visit again')
    expect(lines).toContain('soon.')
  })

  it('puts the date on its own line on narrow paper instead of splitting the bill number', () => {
    const lines = layoutReceipt(baseModel({ paperWidth: 58 })).map((line) => line.text)
    expect(lines).toContain('Bill: INV/2026-27/000123')
    expect(lines.some((line) => line.trim() === '04-03-2026 10:05')).toBe(true)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32)
  })

  it('uses a calibrated character width instead of the paper preset', () => {
    const model = baseModel({ columns: 42 })
    expect(columnsFor(model)).toBe(42)
    const lines = layoutReceipt(model).map((line) => line.text)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(42)
    // The amount stays whole on one line instead of being split by the printer.
    expect(lines).toContain(pad('  2 x 500.00  -100.00', '900.00', 42))
    expect(lines.some((line) => line.endsWith('900.00') && line.length === 42)).toBe(true)
  })

  it('ignores a calibrated width that is out of range', () => {
    expect(columnsFor(baseModel({ columns: 0 }))).toBe(48)
    expect(columnsFor(baseModel({ columns: 200 }))).toBe(48)
    expect(columnsFor(baseModel({ columns: 10 }))).toBe(48)
  })

  it('prints the calibration ruler for the test print', () => {
    const lines = layoutReceipt(baseModel({ showRuler: true })).map((line) => line.text)
    expect(lines).toContain('PRINTER WIDTH TEST')
    expect(lines).toContain(CALIBRATION_RULER)
    // The ruler is longer than any paper on purpose, so the break shows the width.
    expect(CALIBRATION_RULER.length).toBeGreaterThan(48)
  })

  it('prints a QR big enough to scan', () => {
    expect(qrModuleSize(baseModel())).toBe(6)
    expect(qrModuleSize({ paperWidth: 58 })).toBe(5)
    expect(qrModuleSize({ paperWidth: 80, qrSize: 8 })).toBe(8)

    // GS ( k 3 0 1 43 <module size> carries the module size.
    const bytes = buildEscPos(baseModel({ qrSize: 8 }))
    const marker = [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43]
    const at = bytes.findIndex((_, index) => marker.every((value, offset) => bytes[index + offset] === value))
    expect(at).toBeGreaterThan(0)
    expect(bytes[at + marker.length]).toBe(8)
  })
})

describe('upiUri', () => {
  it('encodes payee, amount and note for UPI apps', () => {
    expect(
      upiUri({ vpa: 'shop@bank', payeeName: 'Shree Fashion', amount: 1234.5, note: 'INV/1 A' })
    ).toBe('upi://pay?pa=shop%40bank&pn=Shree%20Fashion&am=1234.50&cu=INR&tn=INV%2F1%20A')
  })
})

describe('buildEscPos', () => {
  it('initialises the printer, emits QR commands, advances paper and cuts', () => {
    const bytes = buildEscPos(baseModel())
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40])

    const asText = new TextDecoder('latin1').decode(bytes)
    expect(asText).toContain('Vijay Trendy Hub')
    expect(asText).toContain('TOTAL')
    expect(asText).toContain('Rs.945.00')

    // GS ( k ... 1 P 0 <payload> — the UPI payload must be inside the byte stream.
    expect(asText).toContain('upi://pay?pa=vijaytrendy%40okaxis')
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00])
  })

  it('never emits raw ESC/POS control bytes from user text', () => {
    const model = baseModel({
      items: [
        {
          name: 'Kurta\u001b@\u001dV',
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
          taxRate: 0,
          taxInclusive: false,
          lineAmount: 100
        }
      ]
    })
    const layout = layoutReceipt(model)
    const itemLine = layout.find((line) => line.text.startsWith('Kurta'))
    expect(itemLine?.text).toBe('Kurta@V')
    expect(Array.from(itemLine!.text).some((character) => character.charCodeAt(0) < 0x20)).toBe(false)
  })

  it('base64-encodes the payload for the agent', () => {
    const bytes = new Uint8Array([0x1b, 0x40, 0x41, 0xff])
    expect(toBase64(bytes)).toBe('G0BB/w==')
  })
})

describe('buildReceiptModel', () => {
  it('maps an invoice with totals, tax groups, cashier, UPI and duplicate flag', () => {
    const model = buildReceiptModel(
      { invoice: invoice(), business: business(), branch, user, prefs },
      { duplicate: true }
    )!

    expect(model.kind).toBe('sale')
    expect(model.duplicate).toBe(true)
    expect(model.invoiceNo).toBe('INV/2026-27/000123')
    expect(model.invoiceDate).toBe('04-03-2026 10:05')
    expect(model.cashier).toBe('Priya')
    expect(model.customer).toMatchObject({ name: 'Ramesh', phone: '9000000000' })
    expect(model.items[0]).toMatchObject({ name: 'Cotton Kurta', lineAmount: 1050, taxRate: 5 })
    expect(model.totals).toMatchObject({ subtotal: 1000, taxTotal: 50, total: 1050 })
    expect(model.taxGroups).toEqual([{ rate: 5, taxable: 1000, tax: 50 }])
    expect(model.upi).toMatchObject({ vpa: 'vijaytrendy@okaxis', amount: 1050 })
    expect(model.terms).toContain('Exchange within 15 days')
    expect(model.interState).toBe(false)
  })

  it('marks inter-state supply and falls back to generic terms', () => {
    const model = buildReceiptModel({
      invoice: invoice({ placeOfSupplyStateCode: '29' }),
      business: business({ receiptTerms: undefined }),
      branch,
      user,
      prefs
    })!

    expect(model.interState).toBe(true)
    expect(model.terms).toBe('Exchange within 15 days with this bill. Returns within 7 days.')
  })

  it('hides the customer for a walk-in bill and defaults the footer', () => {
    const model = buildReceiptModel({
      invoice: invoice({ customerName: 'Walk-in Customer', customerPhone: undefined }),
      business: business({ thankYouNote: '  ' }),
      branch,
      user,
      prefs
    })!
    expect(model.customer).toBeUndefined()
    expect(model.footer).toBe('Thank you for shopping with us!')
    expect(model.shows.hsn).toBe(false)
  })

  it('shows HSN when the customer has a GSTIN even if the toggle is off', () => {
    const model = buildReceiptModel({
      invoice: invoice({ customerGstin: '33ZZZZZ9999Z1Z9' }),
      business: business(),
      branch,
      user,
      prefs
    })!
    expect(model.shows.hsn).toBe(true)
    expect(model.customer?.gstin).toBe('33ZZZZZ9999Z1Z9')
  })

  it('skips the UPI QR when no VPA is configured', () => {
    const model = buildReceiptModel({
      invoice: invoice(),
      business: business({ upiId: undefined }),
      branch,
      user,
      prefs
    })!
    expect(model.upi).toBeUndefined()
    expect(layoutReceipt(model).some((line) => line.qr)).toBe(false)
  })

  it('reuses the stored offline snapshot and applies the current paper prefs', () => {
    const snapshot = buildOfflineSnapshot({
      offlineId: 'abcdef12-3456-7890-abcd-ef1234567890',
      createdAt: '2026-03-04T10:05:00',
      request: request(),
      lines: cartLines(),
      totals: saleTotals(),
      customer: { name: 'Asha', phone: '9111111111' } as Customer,
      cashier: 'Priya',
      business: business(),
      branch
    })
    const model = buildReceiptModel(
      {
        offline: {
          offlineId: 'abcdef12-3456-7890-abcd-ef1234567890',
          branchId: 2,
          createdAt: '2026-03-04T10:05:00',
          request: request(),
          lastKnownStock: [],
          total: 1050,
          status: 'QUEUED',
          receiptSnapshot: snapshot
        },
        business: business(),
        branch,
        user,
        prefs: { ...prefs, paperWidth: 58 }
      },
      { duplicate: true }
    )!

    expect(model.invoiceNo).toBe('OFFLINE-ABCDEF12')
    expect(model.paperWidth).toBe(58)
    expect(model.duplicate).toBe(true)
    expect(model.items.map((item) => item.name)).toEqual(['Cotton Kurta', 'Silk Dupatta'])
    expect(model.customer?.name).toBe('Asha')
  })

  it('falls back to generic item labels for legacy queued sales', () => {
    const model = buildReceiptModel({
      offline: {
        offlineId: 'ffffffff-1111-2222-3333-444444444444',
        branchId: 2,
        createdAt: '2026-03-04T10:05:00',
        request: request(),
        lastKnownStock: [],
        total: 1050,
        status: 'QUEUED'
      },
      business: business(),
      branch,
      user,
      prefs
    })!
    expect(model.kind).toBe('offline')
    expect(model.items).toHaveLength(2)
    expect(model.offlineNote).toContain('OFFLINE BILL')
    expect(model.payments[0]).toMatchObject({ method: 'CASH', amount: 1050 })
  })
})

describe('buildOfflineSnapshot', () => {
  it('captures names, discounts and totals for a queued bill', () => {
    const snapshot = buildOfflineSnapshot({
      offlineId: 'abcdef12-3456-7890-abcd-ef1234567890',
      createdAt: '2026-03-04T10:05:00',
      request: request(),
      lines: cartLines(),
      totals: saleTotals(),
      customer: { name: 'Asha', phone: '9111111111' } as Customer,
      cashier: 'Priya',
      business: business(),
      branch
    })

    expect(snapshot.invoiceNo).toBe('OFFLINE-ABCDEF12')
    expect(snapshot.shop.name).toBe('Vijay Trendy Hub')
    expect(snapshot.items).toHaveLength(2)
    expect(snapshot.items[0]).toMatchObject({
      name: 'Cotton Kurta',
      sku: 'KURTA-M-BLU',
      quantity: 2,
      unitPrice: 500,
      lineAmount: 1000
    })
    expect(snapshot.totals).toMatchObject({ subtotal: 1000, total: 1050, paidAmount: 1050 })
    expect(snapshot.payments).toEqual([{ method: 'CASH', amount: 1050 }])
    expect(snapshot.upi?.amount).toBe(1050)
  })

  it('leaves the balance due when the bill is part-paid', () => {
    const totals = { ...saleTotals(), total: 1200 }
    const snapshot = buildOfflineSnapshot({
      offlineId: 'abcdef12-3456-7890-abcd-ef1234567890',
      createdAt: '2026-03-04T10:05:00',
      request: request(),
      lines: cartLines(),
      totals,
      customer: null,
      business: business(),
      branch
    })
    expect(snapshot.totals.balanceAmount).toBe(150)
  })
})

describe('buildPreviewModel', () => {
  it('uses the approved sample totals and reflects unsaved toggles', () => {
    const model = buildPreviewModel({
      form: settingsForm(),
      business: business(),
      branch,
      user,
      prefs
    })
    expect(model.totals).toMatchObject({
      subtotal: 3497,
      discountTotal: 100,
      taxableAmount: 3447,
      taxTotal: 172.35,
      roundOff: -0.35,
      total: 3619
    })
    expect(model.items.map((item) => item.name)).toEqual(['Cotton Kurta', 'Silk Dupatta'])

    const hidden = buildPreviewModel({
      form: settingsForm({
        receiptShowCustomer: false,
        receiptShowPayment: false,
        receiptShowUpiQr: false,
        receiptShowSku: true,
        receiptShowSizeColor: true,
        receiptShowHsn: true,
        receiptShowItemRate: false
      }),
      business: business(),
      branch,
      user,
      prefs
    })
    expect(hidden.customer).toBeUndefined()
    expect(hidden.payments).toEqual([])
    expect(hidden.upi).toBeUndefined()
    expect(hidden.shows).toMatchObject({
      customer: false,
      payment: false,
      upiQr: false,
      sku: true,
      sizeColor: true,
      hsn: true,
      itemRate: false
    })
    const text = layoutReceipt(hidden).map((line) => line.text)
    expect(text).toContain('M / Blue / SKU KURTA-M-BLU / HSN 6205')
    expect(text).toContain(pad('  2 pc  -100.00', '2,498.00'))
  })

  it('renders the configured UPI QR in the preview', () => {
    const model = buildPreviewModel({ form: settingsForm(), business: business(), branch, user, prefs })
    expect(model.upi).toMatchObject({ vpa: 'vijaytrendy@okaxis', amount: 3619 })
  })
})

describe('print preferences', () => {
  it('normalises agent URLs', () => {
    expect(normalizeAgentUrl(undefined)).toBe(DEFAULT_AGENT_URL)
    expect(normalizeAgentUrl('')).toBe(DEFAULT_AGENT_URL)
    expect(normalizeAgentUrl('127.0.0.1:17890/')).toBe('http://127.0.0.1:17890')
    expect(normalizeAgentUrl('http://localhost:9000///')).toBe('http://localhost:9000')
  })

  it('clamps copies to 1-3 and validates paper/font values', () => {
    expect(normalizePrintPrefs({ copies: 9 }).copies).toBe(3)
    expect(normalizePrintPrefs({ copies: -2 }).copies).toBe(1)
    expect(normalizePrintPrefs({ copies: 2.6 }).copies).toBe(3)
    expect(normalizePrintPrefs({ copies: 'nope' }).copies).toBe(1)
    expect(normalizePrintPrefs({ paperWidth: 58 }).paperWidth).toBe(58)
    expect(normalizePrintPrefs({ paperWidth: 90 }).paperWidth).toBe(80)
    expect(normalizePrintPrefs({ fontSize: 'large' }).fontSize).toBe('large')
    expect(normalizePrintPrefs({ fontSize: 'huge' }).fontSize).toBe('normal')
    expect(normalizePrintPrefs({ autoPrint: 'yes' }).autoPrint).toBe(false)
  })

  it('loads defaults for missing or corrupt storage', () => {
    expect(loadPrintPrefs(null)).toEqual(DEFAULT_PRINT_PREFS)
    expect(loadPrintPrefs({ getItem: () => null })).toEqual(DEFAULT_PRINT_PREFS)
    expect(loadPrintPrefs({ getItem: () => '{broken' })).toEqual(DEFAULT_PRINT_PREFS)

    const stored = loadPrintPrefs({
      getItem: () =>
        JSON.stringify({ copies: 2, paperWidth: 58, printer: 'EPSON TM-T82', token: ' abc ', autoPrint: true })
    })
    expect(stored).toMatchObject({ copies: 2, paperWidth: 58, printer: 'EPSON TM-T82', token: 'abc', autoPrint: true })
  })

  it('saves the normalised prefs', () => {
    const written: Record<string, string> = {}
    const saved = savePrintPrefs(
      { ...DEFAULT_PRINT_PREFS, copies: 12, paperWidth: 58 },
      { setItem: (key, value) => void (written[key] = value) }
    )
    expect(saved.copies).toBe(3)
    expect(JSON.parse(written['garment.print.prefs.v1'])).toMatchObject({ copies: 3, paperWidth: 58 })
  })

  it('remembers a calibrated width per printer', () => {
    expect(clampColumns(42)).toBe(42)
    expect(clampColumns(0)).toBe(0)
    expect(clampColumns(500)).toBe(64)
    expect(clampColumns(10)).toBe(24)

    const prefs = normalizePrintPrefs({ columnsByPrinter: { 'RP 3220 star': 42, 'Broken': 0, Other: 900 } })
    expect(prefs.columnsByPrinter).toEqual({ 'RP 3220 star': 42, Other: 64 })
    expect(columnsForPrinter(prefs, 'RP 3220 star')).toBe(42)
    expect(columnsForPrinter(prefs, 'Some Other Printer')).toBe(0)
  })
})

describe('print agent client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the token header and returns the printer list', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'X-Print-Agent-Token': 'secret' })
      return new Response(JSON.stringify({ defaultPrinter: 'EPSON', printers: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await agentPrinters('127.0.0.1:17890/', 'secret')
    expect(response.defaultPrinter).toBe('EPSON')
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:17890/printers')
  })

  it('maps unreachable agents to AGENT_UNREACHABLE without claiming the job was sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    const error = await agentPrint('http://127.0.0.1:17890', 'secret', {
      printer: 'EPSON',
      jobName: 'INV-1',
      dataBase64: 'G0A=',
      copies: 1
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AgentError)
    expect((error as AgentError).code).toBe('AGENT_UNREACHABLE')
    expect((error as AgentError).sent).toBe(false)
  })

  it('marks a timed-out print as possibly sent so the UI never auto-opens the dialog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')))
    )

    const error = await agentPrint('http://127.0.0.1:17890', 'secret', {
      printer: 'EPSON',
      jobName: 'INV-1',
      dataBase64: 'G0A=',
      copies: 1
    }).catch((caught: unknown) => caught)

    expect((error as AgentError).code).toBe('AGENT_TIMEOUT')
    expect((error as AgentError).sent).toBe(true)
  })

  it('surfaces agent error codes and messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 'UNKNOWN_PRINTER', message: 'Printer not found.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    const error = await agentPrinters('http://127.0.0.1:17890', 'secret').catch((caught: unknown) => caught)
    expect((error as AgentError).code).toBe('UNKNOWN_PRINTER')
    expect((error as AgentError).message).toBe('Printer not found.')
    expect((error as AgentError).sent).toBe(true)
  })
})

function pad(left: string, right: string, width = 48): string {
  return left + ' '.repeat(width - left.length - right.length) + right
}

function cartLines(): CartLine[] {
  return [
    {
      variantId: 11,
      productId: 1,
      productName: 'Cotton Kurta',
      sku: 'KURTA-M-BLU',
      size: 'M',
      color: 'Blue',
      unitPrice: 500,
      mrp: 599,
      taxRate: 5,
      taxInclusive: false,
      quantity: 2,
      stock: 5
    },
    {
      variantId: 12,
      productId: 2,
      productName: 'Silk Dupatta',
      sku: 'DUP-001',
      unitPrice: 50,
      mrp: 99,
      taxRate: 5,
      taxInclusive: false,
      quantity: 1,
      stock: 3
    }
  ]
}

function saleTotals(): SaleTotals {
  return {
    subtotal: 1000,
    itemDiscount: 0,
    billDiscount: 0,
    taxableAmount: 1000,
    taxTotal: 50,
    additionalCharges: 0,
    roundOff: 0,
    total: 1050,
    lineTotals: {
      11: { taxable: 1000, tax: 50, total: 1000, lineDiscount: 0, allocatedDiscount: 0 },
      12: { taxable: 0, tax: 0, total: 0, lineDiscount: 0, allocatedDiscount: 0 }
    }
  }
}

function request(): CreateSaleRequest {
  return {
    branchId: 2,
    customerId: 3,
    items: [
      { variantId: 11, quantity: 2, unitPrice: 500 },
      { variantId: 12, quantity: 1, unitPrice: 50 }
    ],
    payments: [{ method: 'CASH', amount: 1050 }]
  }
}
