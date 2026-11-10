import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  PackageCheck,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Trash2,
  Truck
} from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime, money, statusTone, titleCase, todayISO } from '../lib/format'
import type {
  PageResponse,
  PurchaseInvoice,
  PurchaseOrder,
  PurchaseReturn,
  SupplierPayment
} from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
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
  Tabs,
  Textarea
} from '../components/ui'
import { useToast } from '../components/toast'
import { useSupplierOptions, useVariantOptions } from '../lib/options'

type Tab = 'orders' | 'invoices' | 'payments' | 'returns'

interface OrderLine {
  variantId: number
  quantity: number
  unitCost: string
  taxRate: string
}

interface InvoiceLine {
  variantId: number
  quantity: number
  unitCost: string
  discountAmount: string
  taxRate: string
  hsnCode: string
}

interface ReturnLine {
  variantId: number
  quantity: number
  unitCost: string
  taxRate: string
}

const emptyOrderLine = (): OrderLine => ({ variantId: 0, quantity: 1, unitCost: '', taxRate: '' })
const emptyInvoiceLine = (): InvoiceLine => ({
  variantId: 0,
  quantity: 1,
  unitCost: '',
  discountAmount: '0',
  taxRate: '',
  hsnCode: ''
})
const emptyReturnLine = (): ReturnLine => ({ variantId: 0, quantity: 1, unitCost: '', taxRate: '' })

export function PurchasingPage() {
  const { branchId, has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { suppliers } = useSupplierOptions()
  const { variants } = useVariantOptions()

  const [tab, setTab] = useState<Tab>('orders')
  const [orderStatus, setOrderStatus] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceFrom, setInvoiceFrom] = useState('')
  const [invoiceTo, setInvoiceTo] = useState('')
  const [invoicePage, setInvoicePage] = useState(0)

  const [orderOpen, setOrderOpen] = useState(false)
  const [orderForm, setOrderForm] = useState({
    supplierId: 0,
    orderDate: todayISO(),
    expectedDate: '',
    notes: '',
    items: [emptyOrderLine()]
  })

  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: 0,
    purchaseOrderId: 0,
    supplierInvoiceNo: '',
    invoiceDate: todayISO(),
    notes: '',
    items: [emptyInvoiceLine()]
  })

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    supplierId: 0,
    purchaseInvoiceId: 0,
    paymentDate: todayISO(),
    amount: '',
    method: 'BANK',
    reference: '',
    notes: ''
  })

  const [returnOpen, setReturnOpen] = useState(false)
  const [returnForm, setReturnForm] = useState({
    supplierId: 0,
    purchaseInvoiceId: 0,
    returnDate: todayISO(),
    reason: '',
    items: [emptyReturnLine()]
  })

  const ordersQuery = useQuery({
    queryKey: ['purchase-orders', orderStatus],
    queryFn: () => api<PurchaseOrder[]>(`/api/purchasing/orders${qs({ status: orderStatus })}`),
    enabled: tab === 'orders'
  })

  const invoicesQuery = useQuery({
    queryKey: ['purchase-invoices', branchId, invoiceFrom, invoiceTo, invoiceSearch, invoicePage],
    queryFn: () =>
      api<PageResponse<PurchaseInvoice>>(
        `/api/purchasing/invoices${qs({
          branchId,
          from: invoiceFrom,
          to: invoiceTo,
          q: invoiceSearch,
          page: invoicePage,
          size: 20
        })}`
      ),
    enabled: tab === 'invoices' || invoiceOpen || returnOpen
  })

  const paymentsQuery = useQuery({
    queryKey: ['supplier-payments'],
    queryFn: () => api<SupplierPayment[]>('/api/purchasing/payments'),
    enabled: tab === 'payments'
  })

  const returnsQuery = useQuery({
    queryKey: ['purchase-returns'],
    queryFn: () => api<PurchaseReturn[]>('/api/purchasing/returns'),
    enabled: tab === 'returns'
  })

  const variantById = useMemo(() => new Map(variants.map((variant) => [variant.id, variant])), [variants])

  const invoiceRows = invoicesQuery.data?.content ?? []
  const orderRows = ordersQuery.data ?? []
  const paymentRows = paymentsQuery.data ?? []
  const returnRows = returnsQuery.data ?? []

  const openOrders = orderRows.filter((order) => ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status)).length
  const invoiceTotal = invoiceRows.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  const payableTotal = invoiceRows.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0)
  const paidTotal = paymentRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  const invalidatePurchasing = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
    queryClient.invalidateQueries({ queryKey: ['purchase-returns'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const applyVariantDefaults = <T extends { variantId: number; taxRate: string; unitCost: string }>(
    line: T,
    variantId: number
  ): T => {
    const variant = variantById.get(variantId)
    return {
      ...line,
      variantId,
      unitCost: line.unitCost || (variant ? String(variant.purchasePrice) : ''),
      taxRate: line.taxRate || (variant ? String(variant.taxRate) : '')
    }
  }

  const createOrder = useMutation({
    mutationFn: () =>
      api<PurchaseOrder>('/api/purchasing/orders', {
        method: 'POST',
        body: {
          branchId,
          supplierId: orderForm.supplierId,
          orderDate: orderForm.orderDate,
          expectedDate: orderForm.expectedDate || null,
          notes: orderForm.notes.trim() || null,
          items: orderForm.items
            .filter((line) => line.variantId && line.quantity > 0)
            .map((line) => ({
              variantId: line.variantId,
              quantity: Number(line.quantity),
              unitCost: Number(line.unitCost || 0),
              taxRate: Number(line.taxRate || 0)
            }))
        }
      }),
    onSuccess: (order) => {
      toast.push('Purchase order created', { description: `${order.orderNo} · ${money(order.total)}`, tone: 'success' })
      setOrderOpen(false)
      invalidatePurchasing()
    },
    onError: (error: Error) => toast.push('Could not create purchase order', { description: error.message, tone: 'error' })
  })

  const approveOrder = useMutation({
    mutationFn: (id: number) => api<PurchaseOrder>(`/api/purchasing/orders/${id}/approve`, { method: 'POST' }),
    onSuccess: (order) => {
      toast.push('Purchase order approved', { description: `${order.orderNo} is now ordered.`, tone: 'success' })
      invalidatePurchasing()
    },
    onError: (error: Error) => toast.push('Could not approve order', { description: error.message, tone: 'error' })
  })

  const cancelOrder = useMutation({
    mutationFn: (id: number) => api<PurchaseOrder>(`/api/purchasing/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: (order) => {
      toast.push('Purchase order cancelled', { description: order.orderNo, tone: 'info' })
      invalidatePurchasing()
    },
    onError: (error: Error) => toast.push('Could not cancel order', { description: error.message, tone: 'error' })
  })

  const createInvoice = useMutation({
    mutationFn: () =>
      api<PurchaseInvoice>('/api/purchasing/invoices', {
        method: 'POST',
        body: {
          branchId,
          supplierId: invoiceForm.supplierId,
          purchaseOrderId: invoiceForm.purchaseOrderId || null,
          supplierInvoiceNo: invoiceForm.supplierInvoiceNo.trim(),
          invoiceDate: invoiceForm.invoiceDate,
          notes: invoiceForm.notes.trim() || null,
          items: invoiceForm.items
            .filter((line) => line.variantId && line.quantity > 0)
            .map((line) => ({
              variantId: line.variantId,
              quantity: Number(line.quantity),
              unitCost: Number(line.unitCost || 0),
              discountAmount: Number(line.discountAmount || 0),
              taxRate: Number(line.taxRate || 0),
              hsnCode: line.hsnCode.trim() || null
            }))
        }
      }),
    onSuccess: (invoice) => {
      toast.push('Purchase invoice posted', {
        description: `${invoice.internalNo} · stock received · journal #${invoice.journalEntryId ?? '—'}`,
        tone: 'success'
      })
      setInvoiceOpen(false)
      invalidatePurchasing()
    },
    onError: (error: Error) => toast.push('Could not post purchase invoice', { description: error.message, tone: 'error' })
  })

  const paySupplier = useMutation({
    mutationFn: () =>
      api<SupplierPayment>('/api/purchasing/payments', {
        method: 'POST',
        body: {
          branchId,
          supplierId: paymentForm.supplierId,
          purchaseInvoiceId: paymentForm.purchaseInvoiceId || null,
          paymentDate: paymentForm.paymentDate,
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          reference: paymentForm.reference.trim() || null,
          notes: paymentForm.notes.trim() || null
        }
      }),
    onSuccess: (payment) => {
      toast.push('Supplier payment posted', {
        description: `${payment.paymentNo} · ${money(payment.amount)}`,
        tone: 'success'
      })
      setPaymentOpen(false)
      invalidatePurchasing()
    },
    onError: (error: Error) => toast.push('Could not pay supplier', { description: error.message, tone: 'error' })
  })

  const createReturn = useMutation({
    mutationFn: () =>
      api<PurchaseReturn>('/api/purchasing/returns', {
        method: 'POST',
        body: {
          branchId,
          supplierId: returnForm.supplierId,
          purchaseInvoiceId: returnForm.purchaseInvoiceId || null,
          returnDate: returnForm.returnDate,
          reason: returnForm.reason.trim(),
          items: returnForm.items
            .filter((line) => line.variantId && line.quantity > 0)
            .map((line) => ({
              variantId: line.variantId,
              quantity: Number(line.quantity),
              unitCost: Number(line.unitCost || 0),
              taxRate: Number(line.taxRate || 0)
            }))
        }
      }),
    onSuccess: (result) => {
      toast.push('Purchase return posted', { description: `${result.returnNo} · ${money(result.total)}`, tone: 'success' })
      setReturnOpen(false)
      invalidatePurchasing()
    },
    onError: (error: Error) => toast.push('Could not create purchase return', { description: error.message, tone: 'error' })
  })

  const openOrder = () => {
    setOrderForm({
      supplierId: suppliers[0]?.id ?? 0,
      orderDate: todayISO(),
      expectedDate: '',
      notes: '',
      items: [emptyOrderLine()]
    })
    setOrderOpen(true)
  }

  const openInvoice = (order?: PurchaseOrder) => {
    if (order) {
      setInvoiceForm({
        supplierId: order.supplierId,
        purchaseOrderId: order.id,
        supplierInvoiceNo: '',
        invoiceDate: todayISO(),
        notes: `Received against ${order.orderNo}`,
        items: order.items
          .filter((item) => item.quantityOrdered - item.quantityReceived > 0)
          .map((item) => ({
            variantId: item.variantId,
            quantity: item.quantityOrdered - item.quantityReceived,
            unitCost: String(item.unitCost),
            discountAmount: '0',
            taxRate: String(item.taxRate),
            hsnCode: variantById.get(item.variantId)?.barcode ? '' : ''
          }))
      })
    } else {
      setInvoiceForm({
        supplierId: suppliers[0]?.id ?? 0,
        purchaseOrderId: 0,
        supplierInvoiceNo: '',
        invoiceDate: todayISO(),
        notes: '',
        items: [emptyInvoiceLine()]
      })
    }
    setInvoiceOpen(true)
  }

  const openPayment = (invoice?: PurchaseInvoice) => {
    setPaymentForm({
      supplierId: invoice?.supplierId ?? suppliers[0]?.id ?? 0,
      purchaseInvoiceId: invoice?.id ?? 0,
      paymentDate: todayISO(),
      amount: invoice ? String(invoice.balance) : '',
      method: 'BANK',
      reference: '',
      notes: ''
    })
    setPaymentOpen(true)
  }

  const openReturn = (invoice?: PurchaseInvoice) => {
    setReturnForm({
      supplierId: invoice?.supplierId ?? suppliers[0]?.id ?? 0,
      purchaseInvoiceId: invoice?.id ?? 0,
      returnDate: todayISO(),
      reason: '',
      items: invoice
        ? invoice.items
            .filter((item) => item.quantity - item.returnedQuantity > 0)
            .map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity - item.returnedQuantity,
              unitCost: String(item.unitCost),
              taxRate: String(item.taxRate)
            }))
        : [emptyReturnLine()]
    })
    setReturnOpen(true)
  }

  if (branchId == null) return <LoadingBlock label="Choose a branch…" />

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Buying · purchasing"
        title="Order it, receive it, pay it"
        description="Purchase orders, goods receipts, supplier bills, payments and returns. Every receipt moves stock and posts inventory plus input-tax journals."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                ordersQuery.refetch()
                invoicesQuery.refetch()
                paymentsQuery.refetch()
                returnsQuery.refetch()
              }}
              loading={ordersQuery.isFetching || invoicesQuery.isFetching}
            >
              <RefreshCw size={14} /> Refresh
            </Button>
            {has('purchase.manage') && tab === 'orders' && (
              <Button onClick={openOrder}>
                <Plus size={14} /> New purchase order
              </Button>
            )}
            {has('purchase.manage') && tab === 'invoices' && (
              <Button onClick={() => openInvoice()}>
                <Plus size={14} /> Record purchase invoice
              </Button>
            )}
            {has('purchase.pay') && tab === 'payments' && (
              <Button onClick={() => openPayment()}>
                <Plus size={14} /> Pay supplier
              </Button>
            )}
            {has('purchase.manage') && tab === 'returns' && (
              <Button onClick={() => openReturn()}>
                <Plus size={14} /> New purchase return
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open orders" value={openOrders} hint={`${orderRows.length} orders in view`} icon={ClipboardList} tone={openOrders ? 'warning' : 'neutral'} />
        <StatCard label="Invoice value (page)" value={money(invoiceTotal)} hint={`${invoiceRows.length} purchase bills`} icon={Receipt} tone="accent" />
        <StatCard label="Payable (page)" value={money(payableTotal)} hint="Unpaid balance on these bills" icon={CreditCard} tone={payableTotal > 0 ? 'danger' : 'success'} />
        <StatCard label="Payments recorded" value={money(paidTotal)} hint={`${paymentRows.length} supplier payments`} icon={Truck} tone="success" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            className="border-0"
            value={tab}
            onChange={(value) => setTab(value as Tab)}
            items={[
              { id: 'orders', label: 'Purchase orders', count: orderRows.length },
              { id: 'invoices', label: 'Purchase invoices', count: invoicesQuery.data?.totalElements },
              { id: 'payments', label: 'Supplier payments', count: paymentRows.length },
              { id: 'returns', label: 'Purchase returns', count: returnRows.length }
            ]}
          />
        </div>

        {tab === 'orders' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)} className="w-48">
                <option value="">All order statuses</option>
                {['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
              <span className="ml-auto text-[11px] text-ink-400">
                <span className="num font-semibold text-ink-600">{orderRows.length}</span> orders
              </span>
            </div>
            {ordersQuery.isLoading ? (
              <LoadingBlock label="Reading purchase orders…" />
            ) : orderRows.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No purchase orders"
                description="Draft an order, approve it and receive stock against it when the supplier delivers."
                action={has('purchase.manage') ? <Button size="sm" onClick={openOrder}>Create purchase order</Button> : undefined}
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH>Supplier</TH>
                    <TH>Ordered</TH>
                    <TH>Expected</TH>
                    <TH align="right">Lines</TH>
                    <TH align="right">Total</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {orderRows.map((order) => (
                    <TR key={order.id}>
                      <TD>
                        <span className="block font-mono text-[11px] font-semibold text-ink-900">{order.orderNo}</span>
                        <span className="block text-[9.5px] text-ink-400">{order.branchName}</span>
                      </TD>
                      <TD className="text-[11.5px] text-ink-700">{order.supplierName}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(order.orderDate)}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(order.expectedDate)}</TD>
                      <TD align="right" className="num text-[11px]">{order.items.length}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(order.total)}</TD>
                      <TD align="right">
                        <Badge tone={statusTone(order.status)} dot>{titleCase(order.status)}</Badge>
                      </TD>
                      <TD align="right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {order.status === 'DRAFT' && has('purchase.approve') && (
                            <Button size="sm" loading={approveOrder.isPending} onClick={() => approveOrder.mutate(order.id)}>
                              Approve
                            </Button>
                          )}
                          {['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status) && has('purchase.manage') && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => openInvoice(order)}>
                                <PackageCheck size={12} /> Receive
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => cancelOrder.mutate(order.id)}>
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'invoices' && (
          <div className="border-t border-line-soft">
            <div className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_150px_150px]">
              <SearchInput
                value={invoiceSearch}
                onChange={(value) => { setInvoiceSearch(value); setInvoicePage(0) }}
                placeholder="Internal no, supplier bill, supplier…"
              />
              <Input type="date" value={invoiceFrom} onChange={(event) => { setInvoiceFrom(event.target.value); setInvoicePage(0) }} aria-label="From date" />
              <Input type="date" value={invoiceTo} onChange={(event) => { setInvoiceTo(event.target.value); setInvoicePage(0) }} aria-label="To date" />
            </div>
            {invoicesQuery.isLoading ? (
              <LoadingBlock label="Reading purchase invoices…" />
            ) : invoiceRows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No purchase invoices"
                description="Record the supplier bill to receive stock and post input GST."
                action={has('purchase.manage') ? <Button size="sm" onClick={() => openInvoice()}>Record invoice</Button> : undefined}
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Internal no</TH>
                      <TH>Supplier bill</TH>
                      <TH>Supplier</TH>
                      <TH>Date</TH>
                      <TH align="right">Total</TH>
                      <TH align="right">Paid</TH>
                      <TH align="right">Balance</TH>
                      <TH align="right">Actions</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {invoiceRows.map((invoice) => (
                      <TR key={invoice.id}>
                        <TD>
                          <span className="block font-mono text-[11px] font-semibold text-ink-900">{invoice.internalNo}</span>
                          <span className="block text-[9.5px] text-ink-400">{invoice.branchName}</span>
                        </TD>
                        <TD className="font-mono text-[10px] text-ink-500">{invoice.supplierInvoiceNo}</TD>
                        <TD className="text-[11.5px] text-ink-700">{invoice.supplierName}</TD>
                        <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(invoice.invoiceDate)}</TD>
                        <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(invoice.total)}</TD>
                        <TD align="right" className="num text-[11px] text-ink-500">{money(invoice.paidAmount)}</TD>
                        <TD align="right">
                          <span className={`num text-[11px] font-semibold ${Number(invoice.balance) > 0 ? 'text-brick-500' : 'text-ink-300'}`}>
                            {money(invoice.balance)}
                          </span>
                        </TD>
                        <TD align="right">
                          <div className="flex items-center justify-end gap-1">
                            {Number(invoice.balance) > 0 && has('purchase.pay') && (
                              <Button size="sm" onClick={() => openPayment(invoice)}>Pay</Button>
                            )}
                            {has('purchase.manage') && (
                              <Button size="sm" variant="ghost" onClick={() => openReturn(invoice)}>Return</Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={invoicePage}
                  totalPages={invoicesQuery.data?.totalPages ?? 0}
                  totalElements={invoicesQuery.data?.totalElements ?? 0}
                  onChange={setInvoicePage}
                />
              </>
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div className="border-t border-line-soft">
            {paymentsQuery.isLoading ? (
              <LoadingBlock label="Reading supplier payments…" />
            ) : paymentRows.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No supplier payments"
                description="Pay against a purchase invoice or on account. The payment posts a real bank or cash journal."
                action={has('purchase.pay') ? <Button size="sm" onClick={() => openPayment()}>Record payment</Button> : undefined}
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Payment</TH>
                    <TH>Supplier</TH>
                    <TH>Date</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    <TH align="right">Amount</TH>
                    <TH align="right">Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {paymentRows.map((payment) => (
                    <TR key={payment.id}>
                      <TD>
                        <span className="block font-mono text-[11px] font-semibold text-ink-900">{payment.paymentNo}</span>
                        {payment.purchaseInvoiceId && <span className="block text-[9px] text-ink-400">Bill #{payment.purchaseInvoiceId}</span>}
                      </TD>
                      <TD className="text-[11.5px] text-ink-700">{payment.supplierName}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(payment.paymentDate)}</TD>
                      <TD><Badge tone="info">{titleCase(payment.method)}</Badge></TD>
                      <TD className="max-w-[180px] truncate text-[10.5px] text-ink-400">{payment.reference ?? '—'}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(payment.amount)}</TD>
                      <TD align="right"><Badge tone={statusTone(payment.status)}>{titleCase(payment.status)}</Badge></TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'returns' && (
          <div className="border-t border-line-soft">
            {returnsQuery.isLoading ? (
              <LoadingBlock label="Reading purchase returns…" />
            ) : returnRows.length === 0 ? (
              <EmptyState
                icon={RotateCcw}
                title="No purchase returns"
                description="Send damaged or incorrect stock back to the supplier and reverse the input tax."
                action={has('purchase.manage') ? <Button size="sm" onClick={() => openReturn()}>Create return</Button> : undefined}
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Return</TH>
                    <TH>Supplier</TH>
                    <TH>Date</TH>
                    <TH>Reason</TH>
                    <TH align="right">Items</TH>
                    <TH align="right">Total</TH>
                    <TH align="right">Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {returnRows.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <span className="block font-mono text-[11px] font-semibold text-ink-900">{item.returnNo}</span>
                        {item.purchaseInvoiceId && <span className="block text-[9px] text-ink-400">Bill #{item.purchaseInvoiceId}</span>}
                      </TD>
                      <TD className="text-[11.5px] text-ink-700">{item.supplierName}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(item.returnDate)}</TD>
                      <TD className="max-w-[240px] truncate text-[10.5px] text-ink-500">{item.reason}</TD>
                      <TD align="right" className="num text-[11px]">{item.items.length}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(item.total)}</TD>
                      <TD align="right"><Badge tone={statusTone(item.status)}>{titleCase(item.status)}</Badge></TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        title="New purchase order"
        description="Draft the order, then approve it. Receiving happens through a purchase invoice so stock and GST post together."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOrderOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={createOrder.isPending}
              disabled={!orderForm.supplierId || !orderForm.items.some((line) => line.variantId && line.quantity > 0)}
              onClick={() => createOrder.mutate()}
            >
              Create draft order
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" required>
              <Select value={orderForm.supplierId} onChange={(event) => setOrderForm({ ...orderForm, supplierId: Number(event.target.value) })}>
                <option value={0}>Select a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Order date" required>
              <Input type="date" value={orderForm.orderDate} onChange={(event) => setOrderForm({ ...orderForm, orderDate: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Expected delivery">
              <Input type="date" value={orderForm.expectedDate} onChange={(event) => setOrderForm({ ...orderForm, expectedDate: event.target.value })} />
            </Field>
            <Field label="Notes">
              <Input value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} placeholder="Seasonal buy, colours…" />
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Order lines</p>
              <Button size="sm" variant="secondary" onClick={() => setOrderForm({ ...orderForm, items: [...orderForm.items, emptyOrderLine()] })}>
                <Plus size={12} /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {orderForm.items.map((line, index) => (
                <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_80px_110px_90px_36px]">
                  <Field label={index === 0 ? 'Variant' : undefined}>
                    <Select
                      value={line.variantId}
                      onChange={(event) =>
                        setOrderForm({
                          ...orderForm,
                          items: orderForm.items.map((row, i) =>
                            i === index ? applyVariantDefaults(row, Number(event.target.value)) : row
                          )
                        })
                      }
                    >
                      <option value={0}>Select variant…</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={index === 0 ? 'Qty' : undefined}>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        setOrderForm({
                          ...orderForm,
                          items: orderForm.items.map((row, i) =>
                            i === index ? { ...row, quantity: Number(event.target.value) || 1 } : row
                          )
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Unit cost' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitCost}
                      onChange={(event) =>
                        setOrderForm({
                          ...orderForm,
                          items: orderForm.items.map((row, i) => (i === index ? { ...row, unitCost: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Tax %' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={line.taxRate}
                      onChange={(event) =>
                        setOrderForm({
                          ...orderForm,
                          items: orderForm.items.map((row, i) => (i === index ? { ...row, taxRate: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <IconButton
                    label="Remove line"
                    className="mb-0.5"
                    disabled={orderForm.items.length === 1}
                    onClick={() => setOrderForm({ ...orderForm, items: orderForm.items.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Record purchase invoice"
        description="Receiving stock posts inventory, input GST and supplier payable. The supplier bill number must match their document."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={createInvoice.isPending}
              disabled={
                !invoiceForm.supplierId ||
                !invoiceForm.supplierInvoiceNo.trim() ||
                !invoiceForm.items.some((line) => line.variantId && line.quantity > 0)
              }
              onClick={() => createInvoice.mutate()}
            >
              Receive & post invoice
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Supplier" required>
              <Select value={invoiceForm.supplierId} onChange={(event) => setInvoiceForm({ ...invoiceForm, supplierId: Number(event.target.value) })}>
                <option value={0}>Select a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier invoice no" required>
              <Input value={invoiceForm.supplierInvoiceNo} onChange={(event) => setInvoiceForm({ ...invoiceForm, supplierInvoiceNo: event.target.value })} placeholder="INV/2026/184" />
            </Field>
            <Field label="Invoice date" required>
              <Input type="date" value={invoiceForm.invoiceDate} onChange={(event) => setInvoiceForm({ ...invoiceForm, invoiceDate: event.target.value })} />
            </Field>
          </div>
          {invoiceForm.purchaseOrderId > 0 && (
            <p className="rounded-lg border border-sage-200 bg-sage-100/50 px-3 py-2 text-[10.5px] text-sage-600">
              Receiving against purchase order #{invoiceForm.purchaseOrderId}. Remaining ordered quantities are pre-filled.
            </p>
          )}
          <Field label="Notes">
            <Input value={invoiceForm.notes} onChange={(event) => setInvoiceForm({ ...invoiceForm, notes: event.target.value })} />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Received lines</p>
              <Button size="sm" variant="secondary" onClick={() => setInvoiceForm({ ...invoiceForm, items: [...invoiceForm.items, emptyInvoiceLine()] })}>
                <Plus size={12} /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {invoiceForm.items.map((line, index) => (
                <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_70px_100px_80px_80px_36px]">
                  <Field label={index === 0 ? 'Variant' : undefined}>
                    <Select
                      value={line.variantId}
                      onChange={(event) =>
                        setInvoiceForm({
                          ...invoiceForm,
                          items: invoiceForm.items.map((row, i) =>
                            i === index ? applyVariantDefaults(row, Number(event.target.value)) : row
                          )
                        })
                      }
                    >
                      <option value={0}>Select variant…</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={index === 0 ? 'Qty' : undefined}>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        setInvoiceForm({
                          ...invoiceForm,
                          items: invoiceForm.items.map((row, i) =>
                            i === index ? { ...row, quantity: Number(event.target.value) || 1 } : row
                          )
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Unit cost' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitCost}
                      onChange={(event) =>
                        setInvoiceForm({
                          ...invoiceForm,
                          items: invoiceForm.items.map((row, i) => (i === index ? { ...row, unitCost: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Discount' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.discountAmount}
                      onChange={(event) =>
                        setInvoiceForm({
                          ...invoiceForm,
                          items: invoiceForm.items.map((row, i) => (i === index ? { ...row, discountAmount: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Tax %' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={line.taxRate}
                      onChange={(event) =>
                        setInvoiceForm({
                          ...invoiceForm,
                          items: invoiceForm.items.map((row, i) => (i === index ? { ...row, taxRate: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <IconButton
                    label="Remove line"
                    className="mb-0.5"
                    disabled={invoiceForm.items.length === 1}
                    onClick={() => setInvoiceForm({ ...invoiceForm, items: invoiceForm.items.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Pay supplier"
        description="The payment reduces the supplier payable and posts to the selected cash or bank account."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button size="sm" loading={paySupplier.isPending} disabled={!paymentForm.supplierId || !paymentForm.amount || Number(paymentForm.amount) <= 0} onClick={() => paySupplier.mutate()}>
              Post payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" required>
              <Select value={paymentForm.supplierId} onChange={(event) => setPaymentForm({ ...paymentForm, supplierId: Number(event.target.value) })}>
                <option value={0}>Select a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Purchase invoice" hint="Optional">
              <Select value={paymentForm.purchaseInvoiceId} onChange={(event) => setPaymentForm({ ...paymentForm, purchaseInvoiceId: Number(event.target.value) })}>
                <option value={0}>On account</option>
                {invoiceRows
                  .filter((invoice) => invoice.supplierId === paymentForm.supplierId && Number(invoice.balance) > 0)
                  .map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.internalNo} · balance {money(invoice.balance)}</option>
                  ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" required>
              <Input type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} />
            </Field>
            <Field label="Amount" required>
              <Input type="number" min={0.01} step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
            </Field>
            <Field label="Method" required>
              <Select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                {['BANK', 'CASH', 'UPI', 'CARD', 'CHEQUE'].map((method) => (
                  <option key={method} value={method}>{titleCase(method)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reference">
            <Input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder="UTR, cheque no…" />
          </Field>
          <Field label="Notes">
            <Textarea value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Purchase return"
        description="Returning stock reduces inventory and reverses input tax. The supplier payable is debited."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={createReturn.isPending}
              disabled={!returnForm.supplierId || !returnForm.reason.trim() || !returnForm.items.some((line) => line.variantId && line.quantity > 0)}
              onClick={() => createReturn.mutate()}
            >
              Post return
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Supplier" required>
              <Select value={returnForm.supplierId} onChange={(event) => setReturnForm({ ...returnForm, supplierId: Number(event.target.value) })}>
                <option value={0}>Select a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Purchase invoice" hint="Optional">
              <Select value={returnForm.purchaseInvoiceId} onChange={(event) => setReturnForm({ ...returnForm, purchaseInvoiceId: Number(event.target.value) })}>
                <option value={0}>Not linked</option>
                {invoiceRows
                  .filter((invoice) => invoice.supplierId === returnForm.supplierId)
                  .map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.internalNo} · {invoice.supplierInvoiceNo}</option>
                  ))}
              </Select>
            </Field>
            <Field label="Return date" required>
              <Input type="date" value={returnForm.returnDate} onChange={(event) => setReturnForm({ ...returnForm, returnDate: event.target.value })} />
            </Field>
          </div>
          <Field label="Reason" required>
            <Input value={returnForm.reason} onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })} placeholder="Fabric defect, wrong size ratio…" />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Return lines</p>
              <Button size="sm" variant="secondary" onClick={() => setReturnForm({ ...returnForm, items: [...returnForm.items, emptyReturnLine()] })}>
                <Plus size={12} /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {returnForm.items.map((line, index) => (
                <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_80px_110px_90px_36px]">
                  <Field label={index === 0 ? 'Variant' : undefined}>
                    <Select
                      value={line.variantId}
                      onChange={(event) =>
                        setReturnForm({
                          ...returnForm,
                          items: returnForm.items.map((row, i) =>
                            i === index ? applyVariantDefaults(row, Number(event.target.value)) : row
                          )
                        })
                      }
                    >
                      <option value={0}>Select variant…</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={index === 0 ? 'Qty' : undefined}>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        setReturnForm({
                          ...returnForm,
                          items: returnForm.items.map((row, i) =>
                            i === index ? { ...row, quantity: Number(event.target.value) || 1 } : row
                          )
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Unit cost' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitCost}
                      onChange={(event) =>
                        setReturnForm({
                          ...returnForm,
                          items: returnForm.items.map((row, i) => (i === index ? { ...row, unitCost: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? 'Tax %' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={line.taxRate}
                      onChange={(event) =>
                        setReturnForm({
                          ...returnForm,
                          items: returnForm.items.map((row, i) => (i === index ? { ...row, taxRate: event.target.value } : row))
                        })
                      }
                    />
                  </Field>
                  <IconButton
                    label="Remove line"
                    className="mb-0.5"
                    disabled={returnForm.items.length === 1}
                    onClick={() => setReturnForm({ ...returnForm, items: returnForm.items.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <p className="mt-4 flex items-center gap-2 text-[10.5px] text-ink-400">
        <ClipboardCheck size={13} /> Purchase invoices receive stock immediately. To correct a posted receipt, post a purchase
        return or an inventory adjustment with approval.
      </p>
    </div>
  )
}
