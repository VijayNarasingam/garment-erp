import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Ban, Check, Download, FileText, Printer, ReceiptText, RotateCcw } from 'lucide-react'
import { api, downloadFile } from '../lib/api'
import { formatDate, formatDateTime, money, statusTone, titleCase } from '../lib/format'
import type { Invoice } from '../lib/types'
import { Badge, Button, Divider, Field, LoadingBlock, Modal, Textarea } from './ui'
import { useToast } from './toast'
import { useAuth } from '../lib/auth'

export interface ReturnExchangeItem {
  invoiceItemId: number
  variantId: number
  productName: string
  sku: string
  size?: string
  color?: string
  /** Gross value of a single unit (line total + tax, divided by original quantity). */
  perUnit: number
  quantity: number
  maxQuantity: number
}

export interface ReturnExchangePayload {
  kind: 'return' | 'exchange'
  invoiceId: number
  invoiceNo: string
  /** Payment method of the source invoice, used as the refund channel when the money flows back. */
  sourcePaymentMethod?: string
  items: ReturnExchangeItem[]
}

interface InvoiceDetailModalProps {
  invoiceId: number | null
  onClose: () => void
  /** When provided, Exchange/Return skip navigation and hand the selection straight to the caller (POS). */
  onPickReturn?: (payload: ReturnExchangePayload) => void
}

export function InvoiceDetailModal({ invoiceId, onClose, onPickReturn }: InvoiceDetailModalProps) {
  const { has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pickMode, setPickMode] = useState<false | 'return' | 'exchange'>(false)
  const [pickQty, setPickQty] = useState<Record<number, number>>({})

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api<Invoice>(`/api/sales/invoices/${invoiceId}`),
    enabled: invoiceId != null
  })

  useEffect(() => {
    setPickMode(false)
    setPickQty({})
  }, [invoiceId])

  const pickableItems = useMemo(
    () =>
      (invoice?.items ?? [])
        .map((item) => ({
          item,
          remaining: Math.max(0, item.quantity - (item.returnedQuantity ?? 0)),
          perUnit: (item.lineTotal + (item.taxAmount ?? 0)) / Math.max(1, item.quantity)
        }))
        .filter(({ remaining }) => remaining > 0),
    [invoice]
  )

  const pickedLines = useMemo(
    () =>
      pickableItems
        .filter(({ item }) => pickQty[item.id] && pickQty[item.id] > 0)
        .map(({ item, remaining, perUnit }) => ({
          invoiceItemId: item.id,
          variantId: item.variantId,
          productName: item.productName,
          sku: item.sku,
          size: item.size,
          color: item.color,
          perUnit,
          quantity: Math.min(remaining, pickQty[item.id]),
          maxQuantity: remaining
        })),
    [pickableItems, pickQty]
  )

  const pickedCredit = pickedLines.reduce((sum, line) => sum + line.perUnit * line.quantity, 0)

  const confirmPick = () => {
    if (!invoice) return
    if (pickedLines.length === 0) {
      toast.push('Pick at least one item', { description: 'Choose what is coming back before continuing.', tone: 'warning' })
      return
    }
    const payload: ReturnExchangePayload = {
      kind: pickMode as 'return' | 'exchange',
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      sourcePaymentMethod: invoice.payments?.[0]?.method ?? 'CASH',
      items: pickedLines
    }
    if (onPickReturn) {
      onPickReturn(payload)
      return
    }
    navigate('/pos', { state: { returnPayload: payload } })
  }

  const cancelMutation = useMutation({
    mutationFn: () =>
      api<Invoice>(`/api/sales/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        body: { reason }
      }),
    onSuccess: (updated) => {
      toast.push('Invoice cancelled', {
        description: `${updated.invoiceNo} was reversed. Stock and ledgers were restored.`,
        tone: 'success'
      })
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCancelOpen(false)
      setReason('')
    },
    onError: (error: Error) => toast.push('Could not cancel invoice', { description: error.message, tone: 'error' })
  })

  const openPdf = async () => {
    try {
      const headers: Record<string, string> = {}
      const token = localStorage.getItem('garment.token')
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(`/api/sales/invoices/${invoiceId}/pdf`, { headers })
      if (!response.ok) throw new Error('PDF could not be generated')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      toast.push('PDF unavailable', { description: (error as Error).message, tone: 'error' })
    }
  }

  return (
    <Modal
      open={invoiceId != null}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <ReceiptText size={19} className="text-terracotta-500" />
          {invoice ? invoice.invoiceNo : 'Invoice'}
        </span>
      }
      description={invoice ? `${invoice.branchName} · ${formatDate(invoice.invoiceDate)}` : undefined}
      footer={
        invoice && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(invoice.status)} dot>
                {titleCase(invoice.status)}
              </Badge>
              {invoice.source === 'OFFLINE' && <Badge tone="info">Synced offline</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={openPdf}>
                <Printer size={13} /> Print
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadFile(`/api/sales/invoices/${invoice.id}/pdf`, `${invoice.invoiceNo}.pdf`)}
              >
                <Download size={13} /> PDF
              </Button>
              {invoice.status === 'POSTED' && (has('pos.return') || has('invoice.view')) && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-saffron-300 text-saffron-600 hover:border-saffron-400 hover:bg-saffron-400/10"
                    onClick={() => setPickMode('return')}
                  >
                    <RotateCcw size={13} /> Return
                  </Button>
                  <Button variant="dark" size="sm" onClick={() => setPickMode('exchange')}>
                    <ArrowLeftRight size={13} /> Exchange
                  </Button>
                </>
              )}
              {invoice.status === 'POSTED' && has('invoice.cancel') && (
                <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                  <Ban size={13} /> Cancel bill
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {isLoading || !invoice ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line-soft bg-ivory-100/60 p-3.5">
              <p className="label-xs text-ink-400">Customer</p>
              <p className="mt-1.5 text-[13px] font-bold text-ink-900">{invoice.customerName}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">{invoice.customerPhone ?? 'Walk-in · no phone'}</p>
              {invoice.customerGstin && <p className="mt-0.5 font-mono text-[10px] text-ink-400">GSTIN {invoice.customerGstin}</p>}
            </div>
            <div className="rounded-xl border border-line-soft bg-ivory-100/60 p-3.5">
              <p className="label-xs text-ink-400">Billed by</p>
              <p className="mt-1.5 text-[13px] font-bold text-ink-900">{invoice.createdByName}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">{formatDateTime(invoice.postedAt)}</p>
              {invoice.deviceId && <p className="mt-0.5 truncate font-mono text-[9px] text-ink-400">{invoice.deviceId}</p>}
            </div>
            <div className="rounded-xl border border-line-soft bg-ivory-100/60 p-3.5">
              <p className="label-xs text-ink-400">Place of supply</p>
              <p className="mt-1.5 font-mono text-[13px] font-bold text-ink-900">{invoice.placeOfSupplyStateCode ?? '—'}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {invoice.gstEnabled ? 'GST invoice' : 'Non-GST invoice'} · {invoice.taxInclusive ? 'tax inclusive' : 'tax exclusive'}
              </p>
            </div>
          </div>

          {pickMode !== false ? (
            <div className="overflow-hidden rounded-xl border border-saffron-300/70">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-saffron-200 bg-saffron-400/10 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-saffron-600">
                  {pickMode === 'exchange' ? 'Exchange — pick what goes back' : 'Return — pick what goes back'}
                </p>
                <p className="text-[10.5px] font-semibold text-ink-500">
                  Credit <span className="num text-saffron-600">{money(pickedCredit)}</span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-ivory-100/80">
                    <tr>
                      {['', 'Item', 'Remaining', 'Return qty', 'Credit/unit', ''].map((head, index) => (
                        <th
                          key={head + String(index)}
                          className="border-b border-line px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pickableItems.map(({ item, remaining, perUnit }) => {
                      const qty = pickQty[item.id] ?? 0
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-line-soft last:border-0 transition-colors ${
                            qty > 0 ? 'bg-saffron-400/5' : ''
                          }`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#b8532f]"
                              checked={qty > 0}
                              onChange={(event) =>
                                setPickQty((current) => ({ ...current, [item.id]: event.target.checked ? remaining : 0 }))
                              }
                              aria-label={`Return ${item.productName}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-ink-800">{item.productName}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-ink-400">
                              {item.sku}
                              {item.size ? ` · ${item.size}` : ''}
                              {item.color ? ` · ${item.color}` : ''}
                            </p>
                          </td>
                          <td className="num px-3 py-2 text-right text-ink-500">{remaining} left</td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex items-center overflow-hidden rounded-lg border border-line">
                              <button
                                type="button"
                                className="h-7 w-7 text-[13px] font-bold text-ink-500 hover:bg-ivory-100 disabled:opacity-30"
                                disabled={qty <= 0}
                                onClick={() => setPickQty((current) => ({ ...current, [item.id]: Math.max(0, qty - 1) }))}
                                aria-label="Decrease"
                              >
                                −
                              </button>
                              <span className="num w-9 text-center text-[12px] font-semibold text-ink-800">{qty}</span>
                              <button
                                type="button"
                                className="h-7 w-7 text-[13px] font-bold text-ink-500 hover:bg-ivory-100 disabled:opacity-30"
                                disabled={qty >= remaining}
                                onClick={() => setPickQty((current) => ({ ...current, [item.id]: Math.min(remaining, qty + 1) }))}
                                aria-label="Increase"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="num px-3 py-2 text-right font-semibold text-ink-900">
                            {money(perUnit * (qty > 0 ? qty : 1))}
                          </td>
                          <td />
                        </tr>
                      )
                    })}
                    {pickableItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-[12px] text-ink-400">
                          Every line of this invoice has already been returned.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => setPickMode(false)}>
                  Back to invoice
                </Button>
                <div className="flex items-center gap-3">
                  <p className="text-[10.5px] font-semibold text-ink-500">
                    {pickedLines.length} line{pickedLines.length === 1 ? '' : 's'} selected
                  </p>
                  <Button size="sm" onClick={confirmPick} disabled={pickedLines.length === 0}>
                    <Check size={13} /> {onPickReturn ? 'Add to bill' : 'Open in billing'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-ivory-100/80">
                <tr>
                  {['Item', 'HSN', 'Qty', 'Rate', 'Disc.', 'Tax', 'Amount'].map((head, index) => (
                    <th
                      key={head}
                      className={`border-b border-line px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400 ${
                        index > 1 ? 'text-right' : ''
                      }`}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-ink-800">
                        {item.productName}
                        {(item.returnedQuantity ?? 0) > 0 && (
                          <Badge tone="warning" className="ml-1.5 align-middle text-[8px]">{item.returnedQuantity} returned</Badge>
                        )}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-400">
                        {item.sku}
                        {item.size ? ` · ${item.size}` : ''}
                        {item.color ? ` · ${item.color}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-ink-400">{item.hsnCode ?? '—'}</td>
                    <td className="num px-3 py-2.5 text-right">{item.quantity}</td>
                    <td className="num px-3 py-2.5 text-right">{money(item.unitPrice)}</td>
                    <td className="num px-3 py-2.5 text-right text-ink-500">{money(item.discountAmount)}</td>
                    <td className="num px-3 py-2.5 text-right text-ink-500">
                      {money(item.taxAmount)}
                      <span className="ml-1 text-[9px] text-ink-300">{item.taxRate}%</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right font-semibold text-ink-900">
                      {money(item.lineTotal + item.taxAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          <div className="grid gap-5 sm:grid-cols-[1fr_290px]">
            <div className="space-y-3">
              {invoice.notes && (
                <div className="rounded-lg border border-line-soft bg-ivory-100/50 px-3 py-2 text-[11px] text-ink-500">
                  <span className="font-bold uppercase tracking-wider text-ink-400">Note · </span>
                  {invoice.notes}
                </div>
              )}
              {invoice.payments.length > 0 && (
                <div>
                  <p className="label-xs mb-2 text-ink-400">Payments</p>
                  <div className="space-y-1.5">
                    {invoice.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between rounded-lg border border-line-soft bg-ivory-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-[11px] font-semibold text-ink-700">
                          <FileText size={12} className="text-ink-300" />
                          {titleCase(payment.method)}
                          <span className="font-mono text-[9px] text-ink-400">{payment.paymentNo}</span>
                        </span>
                        <span className="num text-[11px] font-semibold text-ink-900">{money(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {invoice.cancelReason && (
                <div className="rounded-lg border border-brick-300/50 bg-brick-100 px-3 py-2 text-[11px] text-brick-600">
                  <span className="font-bold uppercase tracking-wider">Cancelled · </span>
                  {invoice.cancelReason}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line bg-ivory-100/50 p-4">
              <dl className="space-y-1.5 text-[12px]">
                <Row label="Subtotal" value={money(invoice.subtotal)} />
                {invoice.itemDiscount > 0 && <Row label="Item discount" value={`− ${money(invoice.itemDiscount)}`} />}
                {invoice.billDiscount > 0 && <Row label="Bill discount" value={`− ${money(invoice.billDiscount)}`} />}
                {invoice.additionalCharges > 0 && <Row label="Charges" value={money(invoice.additionalCharges)} />}
                <Row label="Taxable" value={money(invoice.taxableAmount)} />
                <Row label="GST" value={money(invoice.taxTotal)} />
                <Row label="Round off" value={money(invoice.roundOff)} />
                <Divider className="my-2" />
                <div className="flex items-baseline justify-between">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">Total</dt>
                  <dd className="num font-display text-[22px] font-semibold text-ink-900">{money(invoice.total)}</dd>
                </div>
                <Row label="Paid" value={money(invoice.paidAmount)} />
                <Row label="Balance" value={money(invoice.balanceAmount)} strong={invoice.balanceAmount > 0} />
              </dl>
            </div>
          </div>

          <div className="grid gap-2 text-[10px] text-ink-400 sm:grid-cols-2">
            <p>
              Journal entry <span className="font-mono text-ink-600">#{invoice.journalEntryId ?? '—'}</span> · COGS journal{' '}
              <span className="font-mono text-ink-600">#{invoice.costJournalEntryId ?? '—'}</span>
            </p>
            <p className="sm:text-right">
              COGS <span className="num text-ink-600">{money(invoice.costOfGoods)}</span> · Gross profit{' '}
              <span className="num text-ink-600">{money(invoice.grossProfit)}</span>
            </p>
          </div>
        </div>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this invoice?"
        description="The invoice will be reversed — stock is returned and both sales and COGS journals are reversed. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)}>
              Keep invoice
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={cancelMutation.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => cancelMutation.mutate()}
            >
              Cancel invoice
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer returned the full bill at the counter…" />
        </Field>
      </Modal>
    </Modal>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`num ${strong ? 'font-semibold text-brick-500' : 'text-ink-700'}`}>{value}</dd>
    </div>
  )
}
