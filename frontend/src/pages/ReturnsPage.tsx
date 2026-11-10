import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, CheckCircle2, PackageCheck, Plus, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, money, statusTone, titleCase, todayISO } from '../lib/format'
import type { Invoice, PageResponse, ReturnSummary, SalesReturn } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea
} from '../components/ui'
import { useToast } from '../components/toast'

const refundMethods = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'ADVANCE']

interface ReturnLine {
  invoiceItemId: number
  quantity: number
  restockItem: boolean
  conditionNote: string
}

export function ReturnsPage() {
  const { branchId, has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<SalesReturn | null>(null)
  const [rejecting, setRejecting] = useState<SalesReturn | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [cancelling, setCancelling] = useState<SalesReturn | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [completing, setCompleting] = useState<SalesReturn | null>(null)
  const [completeForm, setCompleteForm] = useState({ refundMethod: 'CASH', refundAmount: '', refundReference: '' })

  const [form, setForm] = useState({
    invoiceId: 0,
    type: 'RETURN',
    returnDate: todayISO(),
    reason: '',
    conditionNotes: '',
    restock: true,
    refundMethod: 'CASH',
    refundReference: ''
  })
  const [lines, setLines] = useState<ReturnLine[]>([])

  const returnsQuery = useQuery({
    queryKey: ['returns', branchId, status, search, page],
    queryFn: () =>
      api<PageResponse<SalesReturn>>(
        `/api/returns${qs({ branchId, status, q: search, page, size: 25 })}`
      ),
    enabled: branchId != null
  })

  const summaryQuery = useQuery({
    queryKey: ['returns-summary', branchId],
    queryFn: () => api<ReturnSummary>(`/api/returns/summary${qs({ branchId })}`),
    enabled: branchId != null
  })

  const invoicesQuery = useQuery({
    queryKey: ['return-invoices', branchId],
    queryFn: () =>
      api<PageResponse<Invoice>>(
        `/api/sales/invoices${qs({ branchId, status: 'POSTED', size: 100 })}`
      ),
    enabled: createOpen && branchId != null
  })

  const selectedInvoice = useMemo(
    () => (invoicesQuery.data?.content ?? []).find((invoice) => invoice.id === form.invoiceId),
    [invoicesQuery.data, form.invoiceId]
  )

  const rows = returnsQuery.data?.content ?? []

  const pendingCount = summaryQuery.data?.pending ?? 0
  const approvedCount = summaryQuery.data?.approved ?? 0
  const completedTotal = Number(summaryQuery.data?.completedValue ?? 0)

  const openCreate = () => {
    setForm({
      invoiceId: 0,
      type: 'RETURN',
      returnDate: todayISO(),
      reason: '',
      conditionNotes: '',
      restock: true,
      refundMethod: 'CASH',
      refundReference: ''
    })
    setLines([])
    setCreateOpen(true)
  }

  const selectInvoice = (invoiceId: number) => {
    const invoice = (invoicesQuery.data?.content ?? []).find((row) => row.id === invoiceId)
    setForm((current) => ({ ...current, invoiceId }))
    setLines(
      invoice
        ? invoice.items
            .filter((item) => item.quantity - item.returnedQuantity > 0)
            .map((item) => ({
              invoiceItemId: item.id,
              quantity: 0,
              restockItem: true,
              conditionNote: ''
            }))
        : []
    )
  }

  const setType = (type: string) => {
    setForm((current) => ({
      ...current,
      type,
      refundMethod: type === 'EXCHANGE' ? 'ADVANCE' : current.refundMethod === 'ADVANCE' ? 'CASH' : current.refundMethod
    }))
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['returns'] })
    queryClient.invalidateQueries({ queryKey: ['returns-summary'] })
    queryClient.invalidateQueries({ queryKey: ['return-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api<SalesReturn>('/api/returns', {
        method: 'POST',
        body: {
          branchId,
          invoiceId: form.invoiceId,
          type: form.type,
          returnDate: form.returnDate,
          reason: form.reason.trim(),
          conditionNotes: form.conditionNotes.trim() || null,
          restock: form.restock,
          refundMethod: form.refundMethod,
          refundReference: form.refundReference.trim() || null,
          items: lines
            .filter((line) => line.quantity > 0)
            .map((line) => ({
              invoiceItemId: line.invoiceItemId,
              quantity: line.quantity,
              restockItem: line.restockItem,
              conditionNote: line.conditionNote.trim() || null
            }))
        }
      }),
    onSuccess: (created) => {
      toast.push(created.status === 'COMPLETED' ? 'Return completed' : 'Return submitted', {
        description:
          created.status === 'PENDING'
            ? `${created.returnNo} is waiting for approval.`
            : `${created.returnNo} · refund ${money(created.refundAmount)}`,
        tone: 'success'
      })
      setCreateOpen(false)
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not create return', { description: error.message, tone: 'error' })
  })

  const approveMutation = useMutation({
    mutationFn: (item: SalesReturn) =>
      api<SalesReturn>(`/api/returns/${item.id}/approve`, { method: 'POST', body: {} }),
    onSuccess: (updated) => {
      toast.push('Return approved', { description: `${updated.returnNo} is ready to complete.`, tone: 'success' })
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not approve return', { description: error.message, tone: 'error' })
  })

  const rejectMutation = useMutation({
    mutationFn: () =>
      api<SalesReturn>(`/api/returns/${rejecting!.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() }
      }),
    onSuccess: (updated) => {
      toast.push('Return rejected', { description: updated.returnNo, tone: 'info' })
      setRejecting(null)
      setRejectReason('')
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not reject return', { description: error.message, tone: 'error' })
  })

  const cancelMutation = useMutation({
    mutationFn: () =>
      api<SalesReturn>(`/api/returns/${cancelling!.id}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason.trim() }
      }),
    onSuccess: (updated) => {
      toast.push('Return cancelled', { description: updated.returnNo, tone: 'info' })
      setCancelling(null)
      setCancelReason('')
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not cancel return', { description: error.message, tone: 'error' })
  })

  const completeMutation = useMutation({
    mutationFn: () =>
      api<SalesReturn>(`/api/returns/${completing!.id}/complete`, {
        method: 'POST',
        body: {
          refundMethod: completeForm.refundMethod,
          refundAmount: completeForm.refundAmount === '' ? null : Number(completeForm.refundAmount),
          refundReference: completeForm.refundReference.trim() || null
        }
      }),
    onSuccess: (updated) => {
      toast.push('Return completed', {
        description: `${updated.returnNo} · refund ${money(updated.refundAmount)}`,
        tone: 'success'
      })
      setCompleting(null)
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not complete return', { description: error.message, tone: 'error' })
  })

  const openComplete = (item: SalesReturn) => {
    setCompleting(item)
    setCompleteForm({
      refundMethod: item.refundMethod ?? (item.type === 'EXCHANGE' ? 'ADVANCE' : 'CASH'),
      refundAmount: String(item.refundAmount || item.total),
      refundReference: item.refundReference ?? ''
    })
  }

  const selectedLines = lines.filter((line) => line.quantity > 0)
  const estimatedValue = selectedLines.reduce((sum, line) => {
    const invoiceItem = selectedInvoice?.items.find((item) => item.id === line.invoiceItemId)
    return sum + (invoiceItem ? Number(invoiceItem.lineTotal) / invoiceItem.quantity * line.quantity : 0)
  }, 0)

  if (branchId == null) return <LoadingBlock label="Choose a branch…" />

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="After the sale · returns"
        title="Make it right, on the record"
        description="Returns and exchanges reverse the sale, restock what can be resold and refund through a real payment. Posted returns are never edited."
        actions={
          <>
            <Button variant="secondary" onClick={() => returnsQuery.refetch()} loading={returnsQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {has('pos.return') && (
              <Button onClick={openCreate}>
                <Plus size={14} /> New return
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Returns" value={summaryQuery.data?.total ?? 0} hint="In this branch" icon={RotateCcw} tone="accent" />
        <StatCard label="Awaiting approval" value={pendingCount} hint="Pending manager review" icon={ShieldCheck} tone={pendingCount ? 'warning' : 'neutral'} />
        <StatCard label="Ready to complete" value={approvedCount} hint="Approved, not yet refunded" icon={PackageCheck} tone={approvedCount ? 'info' : 'neutral'} />
        <StatCard label="Completed value" value={money(completedTotal)} hint="All completed returns in branch" icon={CheckCircle2} tone="success" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <SearchInput
            value={search}
            onChange={(value) => { setSearch(value); setPage(0) }}
            placeholder="Return no, invoice, customer…"
            className="w-full max-w-sm"
          />
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }} className="w-44">
            <option value="">All statuses</option>
            {['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </Select>
          <span className="ml-auto text-[11px] text-ink-400">
            <span className="num font-semibold text-ink-600">{returnsQuery.data?.totalElements ?? 0}</span> returns
          </span>
        </div>

        {returnsQuery.isLoading ? (
          <LoadingBlock label="Reading returns…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No returns in this view"
            description="When a customer brings something back, record the return here with its reason and refund method."
            action={has('pos.return') ? <Button size="sm" onClick={openCreate}>Record a return</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Return</TH>
                <TH>Invoice</TH>
                <TH>Customer</TH>
                <TH>Type</TH>
                <TH align="right">Value</TH>
                <TH align="right">Refund</TH>
                <TH align="right">Status</TH>
                <TH align="right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((item) => (
                <TR key={item.id} onClick={() => setDetail(item)}>
                  <TD>
                    <span className="block font-mono text-[11px] font-semibold text-ink-900">{item.returnNo}</span>
                    <span className="block text-[9.5px] text-ink-400">{formatDate(item.returnDate)}</span>
                  </TD>
                  <TD className="font-mono text-[10px] text-ink-500">{item.invoiceNo}</TD>
                  <TD>
                    <span className="block text-[12px] font-medium text-ink-800">{item.customerName}</span>
                    <span className="block max-w-[180px] truncate text-[9.5px] text-ink-400">{item.reason}</span>
                  </TD>
                  <TD>
                    <Badge tone={item.type === 'EXCHANGE' ? 'accent' : 'info'}>{titleCase(item.type)}</Badge>
                  </TD>
                  <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(item.total)}</TD>
                  <TD align="right" className="num text-[11px] text-ink-500">
                    {item.refundAmount > 0 ? money(item.refundAmount) : '—'}
                    {item.refundMethod && <span className="ml-1 block text-[9px] text-ink-400">{titleCase(item.refundMethod)}</span>}
                  </TD>
                  <TD align="right">
                    <Badge tone={statusTone(item.status)} dot>{titleCase(item.status)}</Badge>
                  </TD>
                  <TD align="right">
                    <div className="flex flex-wrap items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                      {item.status === 'PENDING' && has('return.approve') && (
                        <>
                          <Button size="sm" loading={approveMutation.isPending} onClick={() => approveMutation.mutate(item)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setRejecting(item)}>
                            Reject
                          </Button>
                        </>
                      )}
                      {item.status === 'APPROVED' && has('pos.return') && (
                        <Button size="sm" onClick={() => openComplete(item)}>
                          Complete
                        </Button>
                      )}
                      {(item.status === 'PENDING' || item.status === 'APPROVED') && has('pos.return') && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(item)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={page}
          totalPages={returnsQuery.data?.totalPages ?? 0}
          totalElements={returnsQuery.data?.totalElements ?? 0}
          onChange={setPage}
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record a return"
        description="Pick the original invoice, choose what is coming back and how the customer is refunded. Stock and journals post on completion."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={createMutation.isPending}
              disabled={!form.invoiceId || !form.reason.trim() || selectedLines.length === 0}
              onClick={() => createMutation.mutate()}
            >
              {form.type === 'EXCHANGE' ? 'Issue store credit' : 'Submit return'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Original invoice" required>
              <Select value={form.invoiceId} onChange={(event) => selectInvoice(Number(event.target.value))}>
                <option value={0}>Select an invoice…</option>
                {(invoicesQuery.data?.content ?? []).map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNo} · {invoice.customerName} · {money(invoice.total)} · {formatDate(invoice.invoiceDate)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Return type" required>
              <Select value={form.type} onChange={(event) => setType(event.target.value)}>
                <option value="RETURN">Return with refund</option>
                <option value="EXCHANGE">Exchange — issue store credit</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Return date" required>
              <Input type="date" value={form.returnDate} onChange={(event) => setForm({ ...form, returnDate: event.target.value })} />
            </Field>
            <Field label="Refund method">
              <Select
                value={form.refundMethod}
                onChange={(event) => setForm({ ...form, refundMethod: event.target.value })}
              >
                {refundMethods.map((method) => (
                  <option key={method} value={method}>
                    {titleCase(method)}{method === 'ADVANCE' ? ' (store credit)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Refund reference" hint="Optional">
              <Input value={form.refundReference} onChange={(event) => setForm({ ...form, refundReference: event.target.value })} placeholder="UPI ref, cheque no…" />
            </Field>
          </div>
          <Field label="Reason" required>
            <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Size did not fit, colour differs…" />
          </Field>
          <Field label="Condition notes">
            <Textarea value={form.conditionNotes} onChange={(event) => setForm({ ...form, conditionNotes: event.target.value })} placeholder="Tags intact, unwashed, packaging opened…" />
          </Field>
          <Checkbox label="Restock returned items that are in resaleable condition" checked={form.restock} onChange={(event) => setForm({ ...form, restock: event.target.checked })} />

          {selectedInvoice ? (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="border-b border-line-soft bg-ivory-100/60 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Invoice lines · {selectedInvoice.invoiceNo}
              </div>
              <Table>
                <THead>
                  <tr>
                    <TH>Item</TH>
                    <TH align="right">Sold</TH>
                    <TH align="right">Returned</TH>
                    <TH align="right">Available</TH>
                    <TH align="right">Return qty</TH>
                    <TH align="center">Restock</TH>
                    <TH>Condition</TH>
                  </tr>
                </THead>
                <tbody>
                  {selectedInvoice.items.map((invoiceItem) => {
                    const line = lines.find((row) => row.invoiceItemId === invoiceItem.id)
                    const available = invoiceItem.quantity - invoiceItem.returnedQuantity
                    return (
                      <TR key={invoiceItem.id}>
                        <TD>
                          <span className="block text-[11.5px] font-semibold text-ink-800">{invoiceItem.productName}</span>
                          <span className="block font-mono text-[9px] text-ink-400">
                            {invoiceItem.sku} · {invoiceItem.size ?? '—'} / {invoiceItem.color ?? '—'}
                          </span>
                        </TD>
                        <TD align="right" className="num text-[11px]">{invoiceItem.quantity}</TD>
                        <TD align="right" className="num text-[11px] text-ink-400">{invoiceItem.returnedQuantity}</TD>
                        <TD align="right" className="num text-[11px] font-semibold">{available}</TD>
                        <TD align="right">
                          <Input
                            type="number"
                            min={0}
                            max={available}
                            value={line?.quantity ?? 0}
                            className="ml-auto w-20 text-right"
                            disabled={available <= 0}
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((row) =>
                                  row.invoiceItemId === invoiceItem.id
                                    ? { ...row, quantity: Math.max(0, Math.min(available, Number(event.target.value) || 0)) }
                                    : row
                                )
                              )
                            }
                          />
                        </TD>
                        <TD align="center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-terracotta-500"
                            checked={line?.restockItem ?? true}
                            disabled={!line || line.quantity <= 0}
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((row) =>
                                  row.invoiceItemId === invoiceItem.id ? { ...row, restockItem: event.target.checked } : row
                                )
                              )
                            }
                          />
                        </TD>
                        <TD>
                          <Input
                            value={line?.conditionNote ?? ''}
                            disabled={!line || line.quantity <= 0}
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((row) =>
                                  row.invoiceItemId === invoiceItem.id ? { ...row, conditionNote: event.target.value } : row
                                )
                              )
                            }
                            placeholder="Optional"
                          />
                        </TD>
                      </TR>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[11.5px] text-ink-400">
              Select an invoice to load its returnable lines.
            </div>
          )}

          {selectedInvoice && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50/50 px-3 py-2.5">
              <p className="text-[11px] text-ink-500">
                Estimated return value from selected lines. Final tax and refund are computed by the server.
              </p>
              <p className="num text-[16px] font-semibold text-ink-900">{money(estimatedValue)}</p>
            </div>
          )}

          {form.type === 'EXCHANGE' && (
            <div className="flex gap-2 rounded-xl border border-saffron-200 bg-saffron-100/60 p-3 text-[10.5px] leading-4 text-saffron-500">
              <ArrowLeftRight size={14} className="mt-0.5 shrink-0" />
              <p>
                Exchange returns the goods and issues store credit to the customer. Ring up the replacement as a new sale and
                apply the credit at payment.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.returnNo} · ${titleCase(detail.status)}` : 'Return'}
        description={detail ? `${titleCase(detail.type)} against ${detail.invoiceNo} · ${detail.customerName}` : undefined}
        size="lg"
        footer={
          detail && detail.status === 'APPROVED' && has('pos.return') ? (
            <Button size="sm" onClick={() => { openComplete(detail); setDetail(null) }}>
              Complete return
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Return value</p>
                <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(detail.total)}</p>
              </div>
              <div className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Refund</p>
                <p className="num mt-1 text-[15px] font-semibold text-ink-900">
                  {money(detail.refundAmount)}
                  {detail.refundMethod && <span className="ml-1 text-[9px] font-normal text-ink-400">{titleCase(detail.refundMethod)}</span>}
                </p>
              </div>
              <div className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Tax reversed</p>
                <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(detail.taxTotal)}</p>
              </div>
            </div>
            <div className="grid gap-2 text-[11px] text-ink-500 sm:grid-cols-2">
              <p><span className="font-semibold text-ink-700">Reason:</span> {detail.reason}</p>
              <p><span className="font-semibold text-ink-700">Condition:</span> {detail.conditionNotes ?? '—'}</p>
              <p><span className="font-semibold text-ink-700">Requested by:</span> {detail.requestedByName} · {formatDate(detail.returnDate)}</p>
              <p><span className="font-semibold text-ink-700">Approved by:</span> {detail.approvedByName ?? '—'}</p>
              {detail.refundReference && <p><span className="font-semibold text-ink-700">Refund ref:</span> {detail.refundReference}</p>}
              {detail.rejectionReason && <p><span className="font-semibold text-ink-700">Note:</span> {detail.rejectionReason}</p>}
            </div>
            <div className="overflow-hidden rounded-xl border border-line-soft">
              <Table>
                <THead>
                  <tr>
                    <TH>Item</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Unit price</TH>
                    <TH align="right">Tax</TH>
                    <TH align="right">Total</TH>
                    <TH align="center">Restock</TH>
                  </tr>
                </THead>
                <tbody>
                  {detail.items.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <span className="block text-[11.5px] font-semibold text-ink-800">{item.productName}</span>
                        <span className="block font-mono text-[9px] text-ink-400">{item.sku}</span>
                        {item.conditionNote && <span className="block text-[9.5px] text-ink-400">{item.conditionNote}</span>}
                      </TD>
                      <TD align="right" className="num text-[11px]">{item.quantity}</TD>
                      <TD align="right" className="num text-[11px] text-ink-500">{money(item.unitPrice)}</TD>
                      <TD align="right" className="num text-[11px] text-ink-500">{money(item.taxAmount)}</TD>
                      <TD align="right" className="num text-[11px] font-semibold">{money(item.lineTotal)}</TD>
                      <TD align="center">
                        <Badge tone={item.restockItem ? 'success' : 'neutral'}>{item.restockItem ? 'Yes' : 'No'}</Badge>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={completing != null}
        onClose={() => setCompleting(null)}
        title="Complete return"
        description={completing ? `${completing.returnNo} · ${money(completing.total)} return value` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
              Post refund & restock
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Refund method" required>
              <Select
                value={completeForm.refundMethod}
                onChange={(event) => setCompleteForm({ ...completeForm, refundMethod: event.target.value })}
              >
                {refundMethods.map((method) => (
                  <option key={method} value={method}>
                    {titleCase(method)}{method === 'ADVANCE' ? ' (store credit)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Refund amount" hint={`Max ${money(completing?.total ?? 0)}`}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={completeForm.refundAmount}
                onChange={(event) => setCompleteForm({ ...completeForm, refundAmount: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Reference" hint="Optional">
            <Input
              value={completeForm.refundReference}
              onChange={(event) => setCompleteForm({ ...completeForm, refundReference: event.target.value })}
              placeholder="UPI ref, cheque no…"
            />
          </Field>
          <p className="rounded-lg border border-line-soft bg-ivory-100/60 px-3 py-2 text-[10.5px] leading-4 text-ink-500">
            Completing posts the sales-return journal, restocks resaleable items and records the refund payment against the
            original invoice. This action cannot be undone.
          </p>
        </div>
      </Modal>

      <Modal
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title="Reject return"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={rejectMutation.isPending} disabled={!rejectReason.trim()} onClick={() => rejectMutation.mutate()}>
              <XCircle size={13} /> Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Outside policy, item used…" />
        </Field>
      </Modal>

      <Modal
        open={cancelling != null}
        onClose={() => setCancelling(null)}
        title="Cancel return"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCancelling(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={cancelMutation.isPending} disabled={!cancelReason.trim()} onClick={() => cancelMutation.mutate()}>
              Cancel return
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Customer changed their mind…" />
        </Field>
      </Modal>
    </div>
  )
}
