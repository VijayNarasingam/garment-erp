/**
 * Prints the exact bytes the thermal printer would receive, then replays them
 * through a small ESC/POS interpreter and saves a picture of the paper.
 *
 *   npm run print:preview
 *
 * Output lands in frontend/print-preview (receipt.bin, receipt.txt, receipt.png).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import QRCode from 'qrcode'
import { buildEscPos } from '../src/print/escpos'
import { buildReceiptModel } from '../src/print/receiptModel'
import { DEFAULT_PRINT_PREFS } from '../src/print/printPrefs'
import type { Invoice } from '../src/lib/types'

const business = {
  id: 1,
  name: 'Vijay Trendy hub',
  legalName: 'Vijay Trendy hub',
  gstin: '33ABCDE1234F1Z5',
  stateCode: '33',
  address: 'Vijay Trendy hub - FC Road\nShop 4, Sakharkar Market, Baner Road\nTamil Nadu 411045, Tamil Nadu',
  phone: '98220 41145',
  email: 'bill@example.com',
  gstEnabled: true,
  currency: 'INR',
  invoicePrefix: 'AGM',
  roundOffEnabled: true,
  defaultTaxInclusive: false,
  returnWindowDays: 7,
  exchangeWindowDays: 15,
  returnApprovalRequired: true,
  refundToOriginalMethodOnly: true,
  allowNegativeStockWithApproval: false,
  costingMethod: 'FIFO',
  financialYearStartMonth: 4,
  thankYouNote: 'Thank you for shopping with us! Visit again soon.',
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
  receiptTerms: 'Exchange within 15 days with this bill. Returns within 7 days.',
  upiId: 'vijaytrendy@okaxis',
  upiPayeeName: 'Vijay Trendy hub'
} as never

const branch = {
  id: 2,
  code: 'MAIN',
  name: 'Main Store',
  address: 'Shop 4, Sakharkar Market, Baner Road',
  city: 'Chennai',
  stateCode: '33',
  gstin: '33ABCDE1234F1Z5',
  invoicePrefix: 'AGM',
  primaryBranch: true
} as never

const user = { id: 5, fullName: 'Vijay Owner', username: 'owner' } as never

const invoice = {
  id: 54,
  invoiceNo: 'AGM/2026-27/000054',
  financialYear: '2026-27',
  branchId: 2,
  branchName: 'Main Store',
  invoiceDate: '2026-11-11',
  status: 'COMPLETED',
  customerId: 3,
  customerName: 'Ramesh',
  customerPhone: '98765 12345',
  placeOfSupplyStateCode: '33',
  subtotal: 3497,
  itemDiscount: 100,
  billDiscount: 0,
  additionalCharges: 50,
  taxableAmount: 3447,
  taxTotal: 172.35,
  roundOff: -0.35,
  total: 3619,
  paidAmount: 3619,
  balanceAmount: 0,
  gstEnabled: true,
  taxInclusive: false,
  createdByName: 'Vijay Owner',
  source: 'POS',
  postedAt: '2026-11-11T13:32:00',
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
      unitPrice: 1299,
      mrp: 1799,
      discountPercent: 0,
      discountAmount: 100,
      taxRate: 5,
      taxInclusive: false,
      taxableAmount: 2498,
      taxAmount: 124.9,
      lineTotal: 2498,
      costPrice: 0,
      costAmount: 0,
      returnedQuantity: 0
    },
    {
      id: 2,
      variantId: 12,
      productName: 'Silk Dupatta',
      sku: 'DUP-001',
      size: 'Free',
      color: 'Maroon',
      hsnCode: '6214',
      quantity: 1,
      unitPrice: 899,
      mrp: 1199,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 5,
      taxInclusive: false,
      taxableAmount: 899,
      taxAmount: 44.95,
      lineTotal: 899,
      costPrice: 0,
      costAmount: 0,
      returnedQuantity: 0
    }
  ],
  charges: [
    { id: 1, name: 'Alteration', amount: 50, taxable: true, taxRate: 5, taxAmount: 2.5 }
  ],
  payments: [{ id: 1, method: 'CASH', amount: 3619 }]
} as unknown as Invoice

// --- minimal ESC/POS replay so the paper can be read back --------------------
interface PaperLine {
  text: string
  align: 'left' | 'center' | 'right'
  bold: boolean
  double: boolean
  qr?: string
}

function replay(stream: Uint8Array): { lines: PaperLine[]; qrPayloads: string[]; cut: boolean } {
  const lines: PaperLine[] = []
  const qrPayloads: string[] = []
  let align: PaperLine['align'] = 'left'
  let bold = false
  let double = false
  let text = ''
  let cut = false

  const flush = () => {
    if (text.length > 0) {
      lines.push({ text, align, bold, double })
      text = ''
    }
  }

  for (let index = 0; index < stream.length; index += 1) {
    const byte = stream[index]
    if (byte === 0x0a) {
      flush()
      continue
    }
    if (byte === 0x1b) {
      const command = stream[index + 1]
      if (command === 0x40) {
        flush()
        align = 'left'
        bold = false
        double = false
        index += 1 // ESC @ (2 bytes)
        continue
      }
      if (command === 0x61) {
        flush()
        const value = stream[index + 2]
        align = value === 1 ? 'center' : value === 2 ? 'right' : 'left'
        index += 2 // ESC a n (3 bytes)
        continue
      }
      if (command === 0x45) {
        flush()
        bold = stream[index + 2] === 1
        index += 2 // ESC E n (3 bytes)
        continue
      }
      index += 2 // ESC M n, ESC t n, ESC d n (3 bytes)
      continue
    }
    if (byte === 0x1d) {
      const command = stream[index + 1]
      if (command === 0x21) {
        flush()
        double = (stream[index + 2] & 0x10) === 0x10
        index += 2 // GS ! n (3 bytes)
        continue
      }
      if (command === 0x56) {
        cut = true
        index += 3 // GS V m n (4 bytes)
        continue
      }
      if (command === 0x28) {
        // GS ( k <pL> <pH> <payload>
        const length = stream[index + 3] | (stream[index + 4] << 8)
        const payload = Array.from(stream.slice(index + 5, index + 5 + length))
        const marker = payload.indexOf(0x31)
        if (marker >= 0 && payload[marker + 1] === 0x50 && payload[marker + 2] === 0x30) {
          const data = Buffer.from(payload.slice(marker + 3)).toString('latin1')
          qrPayloads.push(data)
          lines.push({ text: '[QR]', align: 'center', bold: false, double: false, qr: data })
        }
        index += 4 + length
        continue
      }
      index += 2
      continue
    }
    text += String.fromCharCode(byte)
  }
  flush()
  return { lines, qrPayloads, cut }
}

const model = buildReceiptModel({ invoice, business, branch, user, prefs: DEFAULT_PRINT_PREFS })!
const bytes = buildEscPos(model)

const outDir = resolve(process.cwd(), 'print-preview')
mkdirSync(outDir, { recursive: true })

const variants = [
  { name: 'receipt', model, paper: 80 },
  { name: 'receipt-58mm', model: buildReceiptModel({ invoice, business, branch, user, prefs: { ...DEFAULT_PRINT_PREFS, paperWidth: 58 } })!, paper: 58 },
  { name: 'receipt-duplicate', model: buildReceiptModel({ invoice, business, branch, user, prefs: DEFAULT_PRINT_PREFS }, { duplicate: true })!, paper: 80 }
] as const

for (const variant of variants) {
  const bytes = buildEscPos(variant.model)
  writeFileSync(resolve(outDir, `${variant.name}.bin`), bytes)
  const replayed = replay(bytes)
  const qrImages = new Map<string, string>()
  for (const payload of replayed.qrPayloads) {
    qrImages.set(payload, await QRCode.toDataURL(payload, { margin: 0, width: 320, errorCorrectionLevel: 'M' }))
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Thermal receipt preview</title>
<style>
  body { margin: 0; background: #e7e2d8; display: flex; justify-content: center; padding: 24px; }
  .paper {
    width: ${variant.paper}mm; background: #fff; padding: 4mm 3mm; color: #000;
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: ${variant.paper === 58 ? '9.6px' : '9.6px'}; line-height: 1.34;
    box-shadow: 0 18px 40px -24px rgba(0,0,0,.5);
  }
  .line { white-space: pre; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .double { transform: scaleY(1.5); transform-origin: center; margin: .2em 0; }
  .qr { display: flex; justify-content: center; padding: 2mm 0 1mm; }
  .qr img { width: ${variant.paper === 58 ? '28mm' : '34mm'}; height: ${variant.paper === 58 ? '28mm' : '34mm'}; }
</style></head>
<body><div class="paper" id="paper">
${replayed.lines
  .map((line) =>
    line.qr
      ? `<div class="qr"><img src="${qrImages.get(line.qr) ?? ''}" alt="UPI QR"></div>`
      : `<div class="line ${line.align === 'center' ? 'center' : line.align === 'right' ? 'right' : ''} ${line.bold ? 'bold' : ''} ${line.double ? 'double' : ''}">${line.text || '&nbsp;'}</div>`
  )
  .join('\n')}
</div></body></html>`

  writeFileSync(resolve(outDir, `${variant.name}.html`), html)
  writeFileSync(resolve(outDir, `${variant.name}.txt`), replayed.lines.map((line) => line.text).join('\n'))

  const widest = replayed.lines.reduce((max, line) => Math.max(max, line.text.length), 0)
  console.log(
    `${variant.name.padEnd(18)} bytes=${String(bytes.length).padStart(5)} lines=${String(replayed.lines.length).padStart(3)}` +
      ` widest=${String(widest).padStart(3)} qr=${replayed.qrPayloads.length} cut=${replayed.cut}`
  )
}

console.log('upi in model :', JSON.stringify(model.upi))
console.log('output       :', outDir)

// --- picture of the paper ---------------------------------------------------
const browser = await chromium.launch()
for (const variant of variants) {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`file:///${resolve(outDir, `${variant.name}.html`).replace(/\\/g, '/')}`)
  const paper = page.locator('#paper')
  await paper.waitFor()
  await paper.screenshot({ path: resolve(outDir, `${variant.name}.png`) })
  await page.close()
}
await browser.close()
