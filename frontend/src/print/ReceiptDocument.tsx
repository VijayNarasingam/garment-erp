import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import QRCode from 'qrcode'
import { clsx } from 'clsx'
import { layoutReceipt } from './escpos'
import type { ReceiptModel } from './types'

interface ReceiptDocumentProps {
  model: ReceiptModel
  /** Pre-rendered QR data URL. When omitted the document renders its own. */
  qrDataUrl?: string | null
  /** Adds the paper look used in the on-screen preview. Never applied while printing. */
  preview?: boolean
  className?: string
}

/**
 * One receipt body shared by the on-screen preview, browser print and the modal.
 * The lines come from `layoutReceipt`, so this HTML matches the ESC/POS paper.
 */
export function ReceiptDocument({ model, qrDataUrl, preview = false, className }: ReceiptDocumentProps) {
  const lines = useMemo(() => layoutReceipt(model), [model])
  const qrPayload = lines.find((line) => line.qr)?.qr
  const [generatedQr, setGeneratedQr] = useState<string | null>(null)

  useEffect(() => {
    if (!qrPayload || qrDataUrl) {
      setGeneratedQr(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(qrPayload, { margin: 0, width: 360, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setGeneratedQr(url)
      })
      .catch(() => {
        if (!cancelled) setGeneratedQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [qrPayload, qrDataUrl])

  const qr = qrDataUrl ?? generatedQr
  const paper = model.paperWidth === 58 ? '58mm' : '80mm'
  // Keep the preview close to the paper: bigger modules mean a bigger code.
  const qrMm = model.qrSize && model.qrSize >= 7 ? 38 : model.qrSize && model.qrSize <= 4 ? 22 : 30

  return (
    <div
      className={clsx('receipt-document', preview && 'receipt-document-preview', className)}
      style={{ '--receipt-paper': paper } as CSSProperties}
      data-font={model.fontSize}
    >
      {lines.map((line, index) => {
        if (line.qr) {
          return (
            <div key={`qr-${index}`} className="receipt-qr" style={{ ['--receipt-qr' as string]: `${qrMm}mm` } as CSSProperties}>
              {qr ? <img src={qr} alt="UPI payment QR code" /> : <span className="receipt-qr-missing">QR</span>}
            </div>
          )
        }
        return (
          <div
            key={index}
            className={clsx(
              'receipt-line',
              line.align === 'center' && 'receipt-line-center',
              line.align === 'right' && 'receipt-line-right',
              line.bold && 'receipt-line-bold',
              line.large && 'receipt-line-large'
            )}
          >
            {line.text || '\u00a0'}
          </div>
        )
      })}
    </div>
  )
}
