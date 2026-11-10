import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Banknote,
  Check,
  ChevronDown,
  CloudOff,
  CreditCard,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserRound,
  UserRoundPlus,
  Wallet,
  X
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime, initials, money, statusTone, titleCase, todayISO, uuid } from '../lib/format'
import { buildSaleRequest, calculateSale, paymentMethods, type CartLine, type Charge, type Discount, type PaymentLine } from '../lib/pos'
import { deviceIdForBranch, enqueueSale, getPull, listQueue, registerDevice, savePull, syncQueuedSales, type OfflineSale } from '../lib/offline'
import { InvoiceDetailModal, type ReturnExchangeItem, type ReturnExchangePayload } from '../components/InvoiceDetail'
import type { Customer, HeldBill, Invoice, PageResponse, Product, PullSnapshot, SalesReturn, StockRow } from '../lib/types'
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingBlock,
  Modal,
  SearchInput,
  Select,
  Textarea,
  cn
} from '../components/ui'
import { useToast } from '../components/toast'

const palettes = [
  ['#b8532f', '#7d341f'],
  ['#5e7153', '#3d4a36'],
  ['#c08a3e', '#8a5f24'],
  ['#7b5c4b', '#4e3930'],
  ['#4f6b73', '#33474d'],
  ['#8d5a6b', '#5f3845']
]

function paletteFor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) % 997
  return palettes[hash % palettes.length]
}

export function PosPage() {
  const { branchId, branches, business, user, has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const online = useOnline()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [lines, setLines] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [discount, setDiscount] = useState<Discount>({ type: 'amount', value: 0 })
  const [chargeEnabled, setChargeEnabled] = useState(false)
  const [charge, setCharge] = useState<Charge>({ name: 'Alteration', amount: 0, taxable: false, taxRate: 0 })
  const [notes, setNotes] = useState('')
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: 0 }])
  const [paymentDirty, setPaymentDirty] = useState(false)
  const [deviceId, setDeviceId] = useState<string>('')
  const [cachedPull, setCachedPull] = useState<PullSnapshot | null>(null)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '' })
  const [heldOpen, setHeldOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdLabel, setHoldLabel] = useState('')
  const [approverOpen, setApproverOpen] = useState(false)
  const [approverUsername, setApproverUsername] = useState('manager')
  const [approverPin, setApproverPin] = useState('')
  const [receipt, setReceipt] = useState<{
    invoice?: Invoice
    offline?: OfflineSale
    exchange?: { origin: string; due: number; credit: number; lines: ReturnExchangeItem[]; returnNo?: string }
  } | null>(null)
  const [returnCart, setReturnCart] = useState<{
    kind: 'return' | 'exchange'
    invoiceId: number
    invoiceNo: string
    sourcePaymentMethod: string
    items: ReturnExchangeItem[]
  } | null>(null)
  const [queueCount, setQueueCount] = useState(0)
  const [scanFlash, setScanFlash] = useState('')
  const [invoiceListOpen, setInvoiceListOpen] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [invoiceListSearch, setInvoiceListSearch] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  const scanTimer = useRef<number>(0)

  const branch = branches.find((item) => item.id === branchId)

  const { data: productPage, isLoading: productsLoading, isError: productsError } = useQuery({
    queryKey: ['pos-products'],
    queryFn: () => api<PageResponse<Product>>('/api/catalog/products?active=true&size=100'),
    enabled: online
  })
  const backendOffline = !online || productsError

  const { data: stockRows } = useQuery({
    queryKey: ['stock', branchId],
    queryFn: () => api<StockRow[]>(`/api/inventory/stock?branchId=${branchId}`),
    enabled: online && branchId != null
  })

  const { data: pulled } = useQuery({
    queryKey: ['pull', branchId],
    queryFn: () => api<PullSnapshot>(`/api/sync/pull?branchId=${branchId}`),
    enabled: online && branchId != null && has('sync.use'),
    retry: false,
    staleTime: 30_000
  })

  const { data: customerData } = useQuery({
    queryKey: ['customer-lookup', customerSearch],
    queryFn: () => api<Customer[]>(`/api/customers/lookup?q=${encodeURIComponent(customerSearch)}`),
    enabled: customerOpen && online
  })

  const { data: heldBills } = useQuery({
    queryKey: ['held-bills', branchId],
    queryFn: () => api<HeldBill[]>(`/api/sales/held-bills?branchId=${branchId}`),
    enabled: heldOpen && branchId != null
  })

  const { data: recentInvoices, isLoading: invoiceListLoading } = useQuery({
    queryKey: ['pos-invoices', branchId],
    queryFn: () => api<PageResponse<Invoice>>(`/api/sales/invoices?branchId=${branchId}&status=POSTED&size=30&sort=postedAt,desc`),
    enabled: invoiceListOpen && branchId != null
  })

  const location = useLocation()
  const navigate = useNavigate()

  // Arriving from the invoice detail modal (e.g. from Invoices page): fold the picked return lines into the bill.
  useEffect(() => {
    const payload = (location.state as { returnPayload?: ReturnExchangePayload } | null)?.returnPayload
    if (!payload) return
    setReturnCart({ ...payload, sourcePaymentMethod: payload.sourcePaymentMethod ?? 'CASH' })
    const count = payload.items.reduce((sum, item) => sum + item.quantity, 0)
    toast.push('Return lines added', {
      description: `${payload.invoiceNo} · ${count} unit${count === 1 ? '' : 's'} queued for ${payload.kind}. Finish the bill to complete it.`,
      tone: 'info'
    })
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    if (!branchId) return
    void getPull(branchId).then(setCachedPull)
    void deviceIdForBranch(branchId).then(setDeviceId)
    void listQueue(branchId).then((items) => setQueueCount(items.length))
  }, [branchId, online])

  /** When the counter comes back online, post any bills that were queued offline — once per page load. */
  const queueSyncedRef = useRef(false)
  useEffect(() => {
    if (queueSyncedRef.current) return
    if (!branchId || !online) return
    queueSyncedRef.current = true
    void syncQueuedSales(branchId)
      .then((outcome) => {
        if (!outcome) return
        void listQueue(branchId).then((items) => setQueueCount(items.length))
        toast.push('Offline bills synced', {
          description: `${outcome.batch.acceptedCount} invoice(s) posted to the server.`,
          tone: 'success'
        })
      })
      .catch(() => {
        // Stay queued — will retry on the next open.
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, online])

  useEffect(() => {
    if (pulled && branchId) {
      setCachedPull(pulled)
      void savePull(branchId, pulled)
    }
  }, [pulled, branchId])

  const effectivePull = pulled ?? cachedPull
  const isOfflineData = backendOffline

  const stockMap = useMemo(() => {
    const map = new Map<number, number>()
    if (online && stockRows) {
      for (const row of stockRows) map.set(row.variantId, row.quantity)
    } else if (effectivePull) {
      for (const row of effectivePull.stock) map.set(row.variantId, row.quantity)
    }
    return map
  }, [online, stockRows, effectivePull])

  const variants = useMemo(() => {
    if (!backendOffline && productPage) {
      return productPage.content.flatMap((product) =>
        product.variants
          .filter((variant) => variant.active && product.active)
          .map((variant) => ({
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            sku: variant.sku,
            barcode: variant.barcode,
            size: variant.size,
            color: variant.color,
            sellingPrice: variant.sellingPrice,
            mrp: variant.mrp,
            taxRate: product.taxRate,
            taxInclusive: product.taxInclusive,
            categoryName: product.categoryName,
            stock: stockMap.get(variant.id) ?? 0
          }))
      )
    }
    if (effectivePull) {
      return effectivePull.variants
        .filter((variant) => variant.active)
        .map((variant) => ({
          variantId: variant.id,
          productId: variant.productId,
          productName: variant.productName,
          sku: variant.sku,
          barcode: variant.barcode,
          size: variant.size,
          color: variant.color,
          sellingPrice: variant.sellingPrice,
          mrp: variant.mrp,
          taxRate: variant.taxRate,
          taxInclusive: variant.taxInclusive,
          categoryName: variant.categoryName,
          stock: stockMap.get(variant.id) ?? 0
        }))
    }
    return []
  }, [backendOffline, productPage, effectivePull, stockMap])

  const categories = useMemo(() => {
    const values = new Set<string>()
    for (const variant of variants) if (variant.categoryName) values.add(variant.categoryName)
    return Array.from(values).sort()
  }, [variants])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return variants.filter((variant) => {
      if (category !== 'all' && variant.categoryName !== category) return false
      if (!term) return true
      return [variant.productName, variant.sku, variant.barcode, variant.size, variant.color, variant.categoryName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [variants, search, category])

  const chargeList = chargeEnabled ? [charge] : []
  const gstOn = business?.gstEnabled ?? true
  const totals = useMemo(
    () => calculateSale(lines, discount, chargeList, business?.roundOffEnabled ?? true, gstOn),
    [lines, discount, chargeEnabled, charge, business?.roundOffEnabled, gstOn]
  )

  const returnCredit = (returnCart?.items ?? []).reduce((sum, item) => sum + item.perUnit * item.quantity, 0)
  const dueTotal = Math.max(0, Math.round((totals.total - returnCredit) * 100) / 100)

  useEffect(() => {
    if (!paymentDirty) {
      setPayments((current) => {
        if (current.length !== 1) return current
        if (Math.abs(current[0].amount - (returnCredit > 0 ? dueTotal : totals.total)) < 0.005) return current
        return [{ ...current[0], amount: returnCredit > 0 ? dueTotal : totals.total }]
      })
    }
  }, [totals.total, dueTotal, returnCredit, paymentDirty])

  const paid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  const balance = Math.round(((returnCredit > 0 ? dueTotal : totals.total) - paid) * 100) / 100

  const cartStockIssue = lines.some((line) => line.quantity > (stockMap.get(line.variantId) ?? 0))
  const offlineStockIssue = backendOffline && cartStockIssue

  const addVariant = (variant: (typeof variants)[number]) => {
    if (backendOffline && variant.stock <= 0) {
      toast.push('Out of stock offline', {
        description: `${variant.productName} has no last-known stock at this branch. Sync when you are back online.`,
        tone: 'warning'
      })
      return
    }
    if (!backendOffline && variant.stock <= 0 && !business?.allowNegativeStockWithApproval) {
      toast.push('Out of stock', { description: 'Negative stock is disabled for this business.', tone: 'warning' })
      return
    }
    setLines((current) => {
      const existing = current.find((line) => line.variantId === variant.variantId)
      if (existing) {
        if (backendOffline && existing.quantity + 1 > variant.stock) {
          toast.push('Not enough stock offline', { description: `Only ${variant.stock} available in the last sync.`, tone: 'warning' })
          return current
        }
        return current.map((line) =>
          line.variantId === variant.variantId ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...current,
        {
          variantId: variant.variantId,
          productId: variant.productId,
          productName: variant.productName,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          unitPrice: variant.sellingPrice,
          mrp: variant.mrp,
          taxRate: variant.taxRate,
          taxInclusive: variant.taxInclusive,
          quantity: 1,
          stock: variant.stock,
          lineDiscount: { type: 'percent', value: 0 }
        }
      ]
    })
  }

  const updateQuantity = (variantId: number, delta: number) => {
    setLines((current) =>
      current
        .map((line) => {
          if (line.variantId !== variantId) return line
          const next = line.quantity + delta
          if (backendOffline && next > (stockMap.get(variantId) ?? line.stock)) {
            toast.push('Last-known stock limit', { description: 'This bill cannot exceed the stock captured at the last sync.', tone: 'warning' })
            return line
          }
          return { ...line, quantity: Math.max(1, next) }
        })
        .filter((line) => line.quantity > 0)
    )
  }

  const updatePrice = (variantId: number, value: number) => {
    setLines((current) =>
      current.map((line) => (line.variantId === variantId ? { ...line, unitPrice: Number.isFinite(value) ? value : 0 } : line))
    )
  }

  const updateLineDiscount = (variantId: number, value: number) => {
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId
          ? {
              ...line,
              lineDiscount: {
                type: line.lineDiscount?.type ?? 'percent',
                value: Number.isFinite(value) ? value : 0
              }
            }
          : line
      )
    )
  }

  const toggleLineDiscount = (variantId: number) => {
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId
          ? {
              ...line,
              lineDiscount: {
                type: line.lineDiscount?.type === 'percent' ? 'amount' : 'percent',
                value: line.lineDiscount?.value ?? 0
              }
            }
          : line
      )
    )
  }

  const clearCart = () => {
    setLines([])
    setCustomer(null)
    setDiscount({ type: 'amount', value: 0 })
    setChargeEnabled(false)
    setCharge({ name: 'Alteration', amount: 0, taxable: false, taxRate: 0 })
    setNotes('')
    setPayments([{ method: 'CASH', amount: 0 }])
    setPaymentDirty(false)
    setReturnCart(null)
  }

  const handleScanEnter = () => {
    const term = search.trim()
    if (!term) return
    const value = term.toLowerCase()
    const exact = (pick: (variant: (typeof variants)[number]) => string | null | undefined) =>
      variants.find((variant) => (pick(variant) ?? '').trim().toLowerCase() === value)
    // Scanners send barcode + Enter: exact barcode first, then SKU, then a single fuzzy match.
    const match =
      exact((variant) => variant.barcode) ?? exact((variant) => variant.sku) ?? (filtered.length === 1 ? filtered[0] : null)
    if (!match) {
      toast.push('Product not found', { description: `No product matches "${term}".`, tone: 'warning' })
      setSearch('')
      return
    }
    addVariant(match)
    setSearch('')
    window.clearTimeout(scanTimer.current)
    setScanFlash(`${match.productName} added to bill`)
    scanTimer.current = window.setTimeout(() => setScanFlash(''), 2200)
  }

  /**
   * Shared sale identifier for the in-flight charge. The online request sends it as
   * offlineId (server dedups on it) and a same-sale offline queue re-uses the same id,
   * so a network stall between "server committed" and "client saw the response" can
   * never double-post the bill.
   */
  const pendingSaleIdRef = useRef<string | null>(null)

  const createCustomerMutation = useMutation({

    mutationFn: () =>
      api<Customer>('/api/customers', {
        method: 'POST',
        body: {
          name: newCustomerForm.name.trim(),
          phone: newCustomerForm.phone.trim() || null,
          email: newCustomerForm.email.trim() || null,
          creditLimit: 0,
          discountPercent: 0,
          openingBalance: 0,
          notes: null,
          active: true
        }
      }),
    onSuccess: (saved) => {
      toast.push('Customer added', { description: `${saved.name} · ${saved.code}`, tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['customer-lookup'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setCustomer(saved)
      setCustomerOpen(false)
      setShowNewCustomer(false)
      setNewCustomerForm({ name: '', phone: '', email: '' })
      setCustomerSearch('')
      setPaymentDirty(false)
    },
    onError: (error: Error) => toast.push('Could not add customer', { description: error.message, tone: 'error' })
  })

  const chargeMutation = useMutation({
    mutationFn: (approver?: { username: string; pin: string }) => {
      if (!branchId) throw new Error('Select a branch first.')
      if (!pendingSaleIdRef.current) pendingSaleIdRef.current = uuid()
      const pendingOfflineId = pendingSaleIdRef.current
      const request = buildSaleRequest({
        branchId,
        lines,
        customerId: customer?.id ?? null,
        discount,
        charges: chargeList,
        payments,
        notes,
        stateCode: business?.stateCode,
        deviceId,
        offlineId: pendingOfflineId,
        approverUsername: approver?.username,
        approverPin: approver?.pin
      })
      return api<Invoice>('/api/sales/invoices', {
        method: 'POST',
        headers: { 'Idempotency-Key': `pos-${pendingOfflineId}` },
        body: request
      })
    },
    onSuccess: (invoice) => {
      pendingSaleIdRef.current = null
      setReceipt({ invoice })
      clearCart()
      setApproverOpen(false)
      setApproverPin('')
      queryClient.invalidateQueries({ queryKey: ['stock', branchId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.push('Invoice posted', { description: `${invoice.invoiceNo} · ${money(invoice.total)}`, tone: 'success' })
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && (error.code === 'APPROVAL_REQUIRED' || error.code === 'APPROVAL_DENIED')) {
        setApproverOpen(true)
        if (error.code === 'APPROVAL_DENIED') toast.push('Approval rejected', { description: error.message, tone: 'error' })
        return
      }
      if (error instanceof ApiError && error.network) {
        // Server died mid-session — keep the counter moving: save the bill locally.
        void queueOfflineSale()
        return
      }
      toast.push('Bill not posted', { description: error.message, tone: 'error' })
    }
  })

  const submitCharge = () => {
    const hasReturns = Boolean(returnCart && returnCart.items.length > 0)
    if (lines.length === 0 && !hasReturns) {
      toast.push('Cart is empty', { description: 'Scan or tap a style to begin.', tone: 'warning' })
      return
    }
    if (offlineStockIssue && lines.length > 0) {
      toast.push('Last-known stock exceeded', {
        description: 'Reduce the quantity or reconnect to sync fresh stock before billing.',
        tone: 'error'
      })
      return
    }
    if (paid > dueTotal + 0.005) {
      toast.push('Tendered amount is too high', { description: `Reduce payments by ${money(paid - dueTotal)}.`, tone: 'error' })
      return
    }
    if (balance > 0.005 && !customer) {
      toast.push('Customer required for credit', { description: 'Select a customer or collect the full amount.', tone: 'warning' })
      return
    }
    if (backendOffline) {
      if (hasReturns) {
        toast.push('Exchange needs the server', {
          description: 'Returns and exchanges can only post while the server is reachable. Reconnect and try again.',
          tone: 'warning'
        })
        return
      }
      if (!pendingSaleIdRef.current) pendingSaleIdRef.current = uuid()
      void queueOfflineSale(pendingSaleIdRef.current)
      pendingSaleIdRef.current = null
      return
    }
    if (hasReturns) {
      void submitReturnOrExchange()
      return
    }
    chargeMutation.mutate(undefined)
  }

  /** Posts a pure return (no new items) or a full exchange (return + new invoice). */
  const submitReturnOrExchange = async () => {
    if (!branchId || !returnCart) return
    if (returnCart.items.length === 0) return
    const isExchange = lines.length > 0
    const returnCreditTotal = returnCredit
    if (isExchange && totals.total < returnCreditTotal) {
      toast.push('New items are cheaper than the credit', {
        description: `Add items worth at least ${money(returnCreditTotal)} or process a return for the difference.`,
        tone: 'warning'
      })
      return
    }
    try {
      // 1) Return — type EXCHANGE, no refund payment is posted. The credit is consumed by the
      //    invoice's EXCHANGE payment (net receivable = 0). For a pure refund we post type RETURN
      //    with the source payment method, so the money path stays on the original tender.
      const returnsResponse = await api<SalesReturn>('/api/returns', {
        method: 'POST',
        body: {
          branchId,
          invoiceId: returnCart.invoiceId,
          type: isExchange ? 'EXCHANGE' : 'RETURN',
          returnDate: todayISO(),
          reason: isExchange ? 'Counter exchange' : 'Counter return',
          refundMethod: isExchange ? 'EXCHANGE' : (returnCart.sourcePaymentMethod ?? 'CASH'),
          refundAmount: isExchange ? 0 : returnCreditTotal,
          refundReference: returnCart.invoiceNo,
          restock: true,
          items: returnCart.items.map((item) => ({
            invoiceItemId: item.invoiceItemId,
            quantity: item.quantity,
            restockItem: true
          }))
        }
      })

      // 2) Fresh invoice — only when the bill has new items. EXCHANGE payment settles the return credit.
      let posted: Invoice | undefined
      if (lines.length > 0) {
        if (returnsResponse.status === 'PENDING') {
          throw new Error('The exchange return is still awaiting approval, so the new bill was not posted.')
        }
        const exchangePayments = [...payments, { method: 'EXCHANGE', amount: returnCreditTotal }]
        const request = buildSaleRequest({
          branchId,
          lines,
          customerId: customer?.id ?? null,
          discount,
          charges: chargeList,
          payments: exchangePayments,
          exchangeReturnId: returnsResponse.id,
          notes: [notes, `Exchange vs ${returnCart.invoiceNo} · return ${returnsResponse.returnNo}`].filter(Boolean).join(' · ') || undefined,
          stateCode: business?.stateCode,
          deviceId
        })
        if (!pendingSaleIdRef.current) pendingSaleIdRef.current = uuid()
        const pendingOfflineId = pendingSaleIdRef.current
        posted = await api<Invoice>('/api/sales/invoices', {
          method: 'POST',
          headers: { 'Idempotency-Key': `pos-${pendingOfflineId}` },
          body: request
        })
        pendingSaleIdRef.current = null
      }

      if (!isExchange && returnsResponse.status === 'PENDING') {
        clearCart()
        setReturnCart(null)
        toast.push('Return sent for approval', {
          description: `${returnsResponse.returnNo} · refund ${money(returnCreditTotal)} awaits manager approval`,
          tone: 'info'
        })
        return
      }

      setReceipt({
        invoice: posted,
        exchange: {
          origin: returnCart.invoiceNo,
          due: Math.max(0, totals.total - returnCreditTotal),
          credit: returnCreditTotal,
          lines: returnCart.items,
          returnNo: returnsResponse.returnNo
        }
      })
      clearCart()
      setReturnCart(null)
      toast.push(isExchange ? 'Exchange complete' : 'Return recorded', {
        description: isExchange
          ? `Return ${returnsResponse.returnNo} · new bill ${posted?.invoiceNo ?? ''}`
          : `Refund ${money(returnCreditTotal)} · ${returnsResponse.returnNo}`,
        tone: 'success'
      })
    } catch (error) {
      toast.push(returnCart && lines.length > 0 ? 'Exchange incomplete' : 'Return not recorded', {
        description: error instanceof Error ? error.message : 'Check the return queue and try again.',
        tone: 'error'
      })
    }
  }

  const queueOfflineSale = async (reuseOfflineId?: string) => {
    if (!branchId) return
    const offlineId = reuseOfflineId ?? uuid()
    const request = buildSaleRequest({
      branchId,
      lines,
      customerId: customer?.id ?? null,
      discount,
      charges: chargeList,
      payments,
      notes,
      stateCode: business?.stateCode,
      deviceId,
      offlineId
    })
    const lastKnownStock = lines.map((line) => ({
      variantId: line.variantId,
      quantity: stockMap.get(line.variantId) ?? line.stock
    }))
    const offlineSale: OfflineSale = {
      offlineId,
      branchId,
      createdAt: new Date().toISOString(),
      request,
      lastKnownStock,
      total: totals.total,
      status: 'QUEUED'
    }
    try {
      await enqueueSale(offlineSale)
      setQueueCount((count) => count + 1)
      setReceipt({ offline: offlineSale })
      clearCart()
      toast.push('Saved offline', {
        description: 'The bill is queued and will receive a server invoice number at sync.',
        tone: 'info'
      })
    } catch {
      toast.push('Could not save offline bill', { description: 'Browser storage is unavailable.', tone: 'error' })
    }
  }

  const holdBill = useMutation({
    mutationFn: () =>
      api<HeldBill>('/api/sales/held-bills', {
        method: 'POST',
        body: {
          branchId,
          label: holdLabel.trim() || `Held ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
          customerId: customer?.id ?? null,
          dataJson: JSON.stringify({ lines, customer, discount, chargeEnabled, charge, notes, payments })
        }
      }),
    onSuccess: () => {
      toast.push('Bill held', { description: 'Resume it from Held bills at any time.', tone: 'success' })
      setHoldOpen(false)
      setHoldLabel('')
      clearCart()
      queryClient.invalidateQueries({ queryKey: ['held-bills', branchId] })
    },
    onError: (error: Error) => toast.push('Could not hold bill', { description: error.message, tone: 'error' })
  })

  const resumeBill = (bill: HeldBill) => {
    try {
      const data = JSON.parse(bill.dataJson)
      setLines(
        (data.lines ?? []).map((line: CartLine) => ({
          ...line,
          lineDiscount: line.lineDiscount ?? { type: 'percent', value: 0 }
        }))
      )
      setCustomer(data.customer ?? null)
      setDiscount(data.discount ?? { type: 'amount', value: 0 })
      setChargeEnabled(Boolean(data.chargeEnabled))
      setCharge(data.charge ?? { name: 'Alteration', amount: 0, taxable: false, taxRate: 0 })
      setNotes(data.notes ?? '')
      setPayments(data.payments?.length ? data.payments : [{ method: 'CASH', amount: 0 }])
      setPaymentDirty(false)
      setHeldOpen(false)
      toast.push('Bill resumed', { description: bill.label, tone: 'success' })
    } catch {
      toast.push('Could not resume bill', { description: 'The held bill data is invalid.', tone: 'error' })
    }
  }

  const deleteHeld = useMutation({
    mutationFn: (id: number) => api<void>(`/api/sales/held-bills/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['held-bills', branchId] })
  })

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault()
        searchRef.current?.querySelector('input')?.focus()
      }
      if (event.key === 'F8') {
        event.preventDefault()
        submitCharge()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const customerOptions: Customer[] = (online ? (customerData ?? []) : (effectivePull?.customers ?? []))
    .filter((item) =>
      customerSearch.trim()
        ? [item.name, item.phone, item.code].filter(Boolean).some((value) => String(value).toLowerCase().includes(customerSearch.toLowerCase()))
        : true
    )
    .map((item) => ({
      ...item,
      openingBalance: 'openingBalance' in item ? item.openingBalance : 0,
      outstandingBalance: 'outstandingBalance' in item ? item.outstandingBalance : 0
    }))

  if (!branchId) return <LoadingBlock label="Choose a branch…" />

  // One receipt body shared by the on-screen modal and the print-only portal (#print-root),
  // so the paper exactly matches what was shown after the bill was posted.
  const receiptBody = receipt ? (
    <div className="print-receipt">
      <div className="rounded-xl border border-line bg-ivory-50 p-5">
        <div className="text-center">
          <p className="font-display text-xl font-semibold text-ink-900">{business?.name}</p>
          <p className="mt-1 text-[10px] text-ink-400">{branch?.name}</p>
          {business?.address && (
            <p className="whitespace-pre-line text-[10px] leading-4 text-ink-400">{business.address}</p>
          )}
          {business?.phone && <p className="text-[10px] text-ink-400">Contact: {business.phone}</p>}
          {business?.gstEnabled && <p className="mt-0.5 font-mono text-[9px] text-ink-400">GSTIN {branch?.gstin ?? business.gstin}</p>}
        </div>
        <Divider className="my-3" />
        <div className="flex justify-between text-[10px] text-ink-500">
          <span>{receipt.invoice ? receipt.invoice.invoiceNo : receipt.offline?.offlineId.slice(0, 13)}</span>
          <span>{formatDate(receipt.invoice?.invoiceDate ?? todayISO())}</span>
        </div>
        {receipt.invoice && (
          <p className="mt-0.5 text-[10px] text-ink-400">
            {receipt.invoice.customerName} · {receipt.invoice.createdByName}
          </p>
        )}
        <Divider className="my-3" />
        <div className="space-y-1.5">
          {(receipt.invoice?.items ?? receipt.offline?.request.items ?? []).map((item: any, index: number) => (
            <div key={index} className="flex items-start justify-between gap-2 text-[10.5px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink-800">{item.productName ?? item.name ?? `Item ${index + 1}`}</span>
                <span className="text-[9px] text-ink-400">
                  {item.sku ?? ''} × {item.quantity}
                </span>
              </span>
              <span className="num shrink-0 text-ink-700">
                {money(
                  receipt.invoice
                    ? item.lineTotal + item.taxAmount
                    : (item.unitPrice ?? 0) * item.quantity
                )}
              </span>
            </div>
          ))}
        </div>
        <Divider className="my-3" />
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Total</span>
          <span className="num font-display text-xl font-semibold text-ink-900">
            {money(receipt.invoice?.total ?? receipt.offline?.total ?? 0)}
          </span>
        </div>
        {receipt.invoice && (
          <div className="mt-1 flex justify-between text-[10px] text-ink-500">
            <span>{receipt.invoice.payments.map((payment) => titleCase(payment.method)).join(' + ') || 'Credit'}</span>
            <span className="num">{money(receipt.invoice.paidAmount)}</span>
          </div>
        )}
        {receipt.exchange && (
          <>
            <Divider className="my-3" />
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-saffron-600">
              Exchange · vs {receipt.exchange.origin}
            </p>
            <div className="mt-1 space-y-1">
              {receipt.exchange.lines.map((item) => (
                <div key={item.invoiceItemId} className="flex items-start justify-between gap-2 text-[10px]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-800">{item.productName}</span>
                    <span className="text-[9px] text-ink-400">
                      {item.sku} × −{item.quantity}
                    </span>
                  </span>
                  <span className="num shrink-0 text-ink-700">({money(item.perUnit * item.quantity)})</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 space-y-1 text-[10px] text-ink-500">
              <div className="flex justify-between">
                <span>Return credit</span>
                <span className="num">− {money(receipt.exchange.credit)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-ink-800">Net paid</span>
                <span className="num">{money(receipt.exchange.due)}</span>
              </div>
              {receipt.exchange.returnNo && (
                <p className="text-[8.5px] text-ink-400">
                  Return {receipt.exchange.returnNo} · routed for approval · new bill {receipt.invoice?.invoiceNo}
                </p>
              )}
            </div>
          </>
        )}
        <Divider className="my-3" />
        <p className="text-center text-[9px] leading-4 text-ink-400">
          {receipt.offline
            ? 'Saved offline. This bill will be numbered and posted when the till syncs.'
            : business?.thankYouNote || 'Thank you for shopping with us!'}
        </p>
      </div>
    </div>
  ) : null

  // Hidden container on <body> that becomes the ONLY visible element while printing,
  // so the app, overlays and repeated position:fixed copies never reach the paper.
  let printTarget: HTMLElement | null = null
  if (typeof document !== 'undefined') {
    let el = document.getElementById('print-root')
    if (!el) {
      el = document.createElement('div')
      el.id = 'print-root'
      document.body.appendChild(el)
    }
    printTarget = el
  }

  const filteredInvoiceList = useMemo(
    () =>
      (recentInvoices?.content ?? []).filter((inv) => {
        const term = invoiceListSearch.trim().toLowerCase()
        if (!term) return true
        return [inv.invoiceNo, inv.customerName, inv.customerPhone ?? ''].join(' ').toLowerCase().includes(term)
      }),
    [recentInvoices, invoiceListSearch]
  )

  return (
    <div className="animate-fade">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-xs mb-1.5 text-terracotta-500">Counter · {branch?.name}</p>
          <h1 className="font-display text-[30px] font-semibold leading-none tracking-[-0.01em] text-ink-900">Point of sale</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {backendOffline && (
            <Badge tone="danger" dot>
              Offline · {queueCount} queued
            </Badge>
          )}
          <Button variant="secondary" size="sm" onClick={() => setHeldOpen(true)}>
            <PauseCircle size={14} /> Held bills
            {heldBills && heldBills.length > 0 && (
              <span className="ml-0.5 rounded-full bg-terracotta-50 px-1.5 text-[9px] text-terracotta-600">{heldBills.length}</span>
            )}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => !backendOffline && setInvoiceListOpen(true)}
            disabled={backendOffline}
            title={backendOffline ? 'Reconnect to look up bills' : 'Bills at this branch — open one for print, return or exchange'}
          >
            <ReceiptText size={14} /> Invoices
          </Button>
          <Badge tone="info">{user?.fullName}</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_408px]">
        <div className="min-w-0">
          <div className="card p-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1" ref={searchRef}>
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleScanEnter()
                    }
                  }}
                  placeholder="Scan barcode · style, SKU, size search…"
                  className="h-11 w-full rounded-xl border border-line bg-ivory-50 pl-10 pr-16 text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-terracotta-400 focus:outline-none focus:ring-4 focus:ring-terracotta-500/10"
                  autoFocus
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-ivory-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-400">
                  F2
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
                  All
                </CategoryChip>
                {categories.slice(0, 5).map((item) => (
                  <CategoryChip key={item} active={category === item} onClick={() => setCategory(item)}>
                    {item}
                  </CategoryChip>
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between px-1 text-[10px] text-ink-400">
              {scanFlash ? (
                <span className="flex items-center gap-1.5 font-semibold text-sage-600">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sage-200 text-sage-700">
                    <Check size={10} strokeWidth={3} />
                  </span>
                  {scanFlash}
                </span>
              ) : (
                <span>
                  {filtered.length} styles · {variants.reduce((sum, variant) => sum + variant.stock, 0)} pieces on hand
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', backendOffline ? 'bg-brick-500' : 'bg-sage-400')} />
                {backendOffline ? 'Last synced stock' : 'Live stock'}
              </span>
            </div>
          </div>

          {productsLoading && online ? (
            <LoadingBlock className="card mt-4" label="Opening the catalogue…" />
          ) : filtered.length === 0 ? (
            <div className="card mt-4">
              <EmptyState
                icon={Search}
                title={variants.length === 0 ? 'Catalogue not available' : 'No styles match'}
                description={
                  variants.length === 0
                    ? online
                      ? 'Add products in the catalogue first.'
                      : 'Connect once to cache the catalogue for offline billing.'
                    : 'Try a different size, colour or SKU.'
                }
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((variant) => {
                const [from, to] = paletteFor(variant.productName)
                const inCart = lines.find((line) => line.variantId === variant.variantId)
                return (
                  <button
                    key={variant.variantId}
                    type="button"
                    onClick={() => addVariant(variant)}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border bg-ivory-50 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-float',
                      inCart ? 'border-terracotta-300 ring-1 ring-terracotta-300/40' : 'border-line'
                    )}
                  >
                    <div
                      className="relative flex h-[82px] items-start justify-between overflow-hidden px-3 py-2.5"
                      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                    >
                      <span className="font-display text-[26px] font-semibold leading-none text-white/35">
                        {initials(variant.productName)}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider',
                          variant.stock <= 0
                            ? 'bg-ink-900/40 text-white/80'
                            : variant.stock <= 3
                              ? 'bg-saffron-300/90 text-ink-900'
                              : 'bg-ivory-50/20 text-white'
                        )}
                      >
                        {variant.stock <= 0 ? 'Out' : `${variant.stock} left`}
                      </span>
                      <span className="absolute bottom-2 right-2.5 font-mono text-[8.5px] text-white/55">
                        {variant.categoryName ?? 'Style'}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 min-h-[32px] text-[11.5px] font-bold leading-4 text-ink-800">{variant.productName}</p>
                      <p className="mt-0.5 truncate text-[9.5px] text-ink-400">
                        {variant.size ?? '—'} · {variant.color ?? '—'}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[9px] font-semibold text-terracotta-500">{variant.sku}</p>
                      <div className="mt-1.5 flex items-end justify-between gap-1">
                        <span className="num text-[13px] font-semibold text-ink-900">{money(variant.sellingPrice)}</span>
                        {inCart ? (
                          <span className="flex items-center gap-0.5 rounded-full bg-terracotta-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            <Check size={9} /> {inCart.quantity}
                          </span>
                        ) : (
                          <span className="rounded-full bg-ivory-200 p-1 text-ink-500 transition-colors group-hover:bg-terracotta-500 group-hover:text-white">
                            <Plus size={11} />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <aside className="card flex min-h-[600px] flex-col overflow-hidden xl:sticky xl:top-[70px] xl:max-h-[calc(100vh-86px)]">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
            <div>
              <p className="label-xs text-ink-400">Current bill</p>
              <p className="mt-0.5 font-display text-[17px] font-semibold leading-none text-ink-900">
                {lines.length === 0 ? 'New sale' : `${lines.reduce((sum, line) => sum + line.quantity, 0)} pieces`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setHoldOpen(true)} disabled={lines.length === 0 || returnCart !== null} title={returnCart ? 'Complete the exchange or remove return lines before holding' : undefined}>
                Hold
              </Button>
              <IconButton label="Clear bill" onClick={clearCart} disabled={lines.length === 0}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCustomerSearch('')
              setShowNewCustomer(false)
              setCustomerOpen(true)
            }}
            className="flex items-center gap-2.5 border-b border-line-soft bg-ivory-100/40 px-4 py-2.5 text-left transition-colors hover:bg-ivory-100"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ivory-200 text-ink-500">
              <UserRound size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-semibold text-ink-800">
                {customer?.name ?? 'Walk-in customer'}
              </span>
              <span className="block truncate text-[9.5px] text-ink-400">
                {customer
                  ? `${customer.phone ?? 'No phone'} · outstanding ${money(customer.outstandingBalance)}`
                  : 'Tap to attach a customer for credit or loyalty'}
              </span>
            </span>
            {customer ? (
              <X
                size={13}
                className="text-ink-300 hover:text-brick-500"
                onClick={(event) => {
                  event.stopPropagation()
                  setCustomer(null)
                }}
              />
            ) : (
              <ChevronDown size={13} className="text-ink-300" />
            )}
          </button>

          {returnCart && (
            <div className="border-b border-line-soft bg-saffron-400/[0.07] px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-saffron-600">
                  <ArrowLeftRight size={11} className="shrink-0" />
                  <span className="truncate">
                    Exchange · vs {returnCart.invoiceNo}
                  </span>
                </p>
                <button
                  type="button"
                  title="Remove the return lines"
                  onClick={() => setReturnCart(null)}
                  className="shrink-0 rounded p-1 text-ink-300 transition-colors hover:bg-ivory-100 hover:text-brick-500"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="mt-1.5 space-y-1">
                {returnCart.items.map((item) => (
                  <div key={item.invoiceItemId} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-800">
                      {item.productName}
                      {item.size ? <span className="ml-1 font-mono text-[9px] text-ink-400">{item.size}</span> : null}
                    </span>
                    <span className="num text-ink-500">−{item.quantity}</span>
                    <span className="num w-20 shrink-0 text-right text-ink-700">{money(-(item.perUnit * item.quantity))}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-saffron-300/50 pt-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-wide text-saffron-700">Return credit</span>
                <span className="num text-[11px] font-bold text-saffron-700">{money(returnCredit)}</span>
              </div>
            </div>
          )}

          <div className="min-h-[160px] flex-1 overflow-y-auto">
            {lines.length === 0 && !returnCart && (
              <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-ivory-400 bg-ivory-100 text-ink-300">
                  <ShoppingBag size={20} strokeWidth={1.6} />
                </span>
                <p className="font-display text-base font-semibold text-ink-700">The bag is empty</p>
                <p className="mt-1 max-w-[220px] text-[10.5px] leading-4 text-ink-400">
                  Scan a barcode or tap a style to start the bill.
                </p>
              </div>
            )}
            {lines.length === 0 && returnCart && (
              <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-400/15 text-saffron-600">
                  <ArrowLeftRight size={20} strokeWidth={1.6} />
                </span>
                <p className="font-display text-base font-semibold text-ink-700">Return-only bill</p>
                <p className="mt-1 max-w-[240px] text-[10.5px] leading-4 text-ink-400">
                  Charge to refund the credit through the original payment method, or scan the new item for an exchange.
                </p>
              </div>
            )}
            {lines.length > 0 && (
              <div className="divide-y divide-line-soft">
                {lines.map((line) => {
                  const lineTotal = totals.lineTotals[line.variantId]?.total ?? line.unitPrice * line.quantity
                  return (
                    <div key={line.variantId} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-bold text-ink-800">{line.productName}</p>
                          <p className="mt-0.5 truncate font-mono text-[9px] text-ink-400">
                            {line.sku} · {line.size ?? '—'} / {line.color ?? '—'}
                          </p>
                        </div>
                        <button
                          onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}
                          className="rounded p-1 text-ink-300 hover:bg-brick-100 hover:text-brick-500"
                          aria-label="Remove line"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        {/* Qty stepper */}
                        <div className="flex items-center rounded-lg border border-line bg-ivory-50">
                          <button
                            onClick={() => updateQuantity(line.variantId, -1)}
                            className="flex h-6.5 w-5.5 items-center justify-center text-ink-400 hover:bg-ivory-200 hover:text-ink-800"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="num w-5 text-center text-[11px] font-semibold">{line.quantity}</span>
                          <button
                            onClick={() => updateQuantity(line.variantId, 1)}
                            className="flex h-6.5 w-5.5 items-center justify-center text-ink-400 hover:bg-ivory-200 hover:text-ink-800"
                            aria-label="Increase quantity"
                          >
                            <Plus size={10} />
                          </button>
                        </div>

                        {/* Per-product discount (₹ or %) */}
                        <div
                          className="flex items-center rounded-lg border border-line bg-ivory-50"
                          title="Per-product discount — ₹ amount or % of this line"
                        >
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.lineDiscount?.value || ''}
                            placeholder="0"
                            aria-label={`Discount for ${line.productName}`}
                            onChange={(event) => updateLineDiscount(line.variantId, Number(event.target.value))}
                            className="num h-6.5 w-[34px] bg-transparent px-1 text-right text-[10px] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => toggleLineDiscount(line.variantId)}
                            className="mr-0.5 rounded bg-ivory-200 px-1 py-0.5 text-[9px] font-bold text-ink-500 hover:bg-ivory-300"
                            aria-label="Toggle discount type"
                          >
                            {line.lineDiscount?.type === 'percent' ? '%' : '₹'}
                          </button>
                        </div>

                        {/* Unit price */}
                        <div className="flex items-center gap-0.5" title="Unit price">
                          <span className="num text-[9px] text-ink-300">₹</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(event) => updatePrice(line.variantId, Number(event.target.value))}
                            aria-label={`Price for ${line.productName}`}
                            className="num h-6.5 w-[46px] rounded border border-line bg-ivory-50 px-1 text-right text-[10.5px] focus:border-terracotta-400 focus:outline-none"
                          />
                        </div>

                        {/* Line total */}
                        <span className="num ml-auto text-right text-[11.5px] font-semibold text-ink-900">{money(lineTotal)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line-soft bg-ivory-100/40 px-4 py-3">
            <div className="space-y-1 text-[11px]">
              <TotalRow label="Subtotal" value={money(totals.subtotal)} />
              {totals.itemDiscount > 0 && <TotalRow label="Item discount" value={`− ${money(totals.itemDiscount)}`} accent />}
              {totals.billDiscount > 0 && <TotalRow label="Bill discount" value={`− ${money(totals.billDiscount)}`} accent />}
              {totals.additionalCharges > 0 && <TotalRow label="Charges" value={money(totals.additionalCharges)} />}
              {gstOn && <TotalRow label="GST" value={money(totals.taxTotal)} />}
              {Math.abs(totals.roundOff) > 0.001 && <TotalRow label="Round off" value={money(totals.roundOff)} />}
              {returnCart && (
                <TotalRow label="Return credit" value={`− ${money(returnCredit)}`} accent />
              )}
              <div className="flex items-baseline justify-between pt-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                  {returnCart ? 'Due after return' : 'Total'}
                </span>
                <span className="num font-display text-[24px] font-semibold leading-none text-ink-900">{money(returnCart ? dueTotal : totals.total)}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center rounded-lg border border-line bg-ivory-50">
                <input
                  type="number"
                  min={0}
                  value={discount.value || ''}
                  placeholder="0"
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setDiscount((current) => ({ ...current, value: Number.isFinite(value) ? value : 0 }))
                  }}
                  className="num h-7.5 w-full bg-transparent px-2 text-[10.5px] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDiscount((current) => ({ ...current, type: current.type === 'amount' ? 'percent' : 'amount', value: 0 }))}
                  className="mr-1 rounded bg-ivory-200 px-1.5 py-0.5 text-[9px] font-bold text-ink-500 hover:bg-ivory-300"
                >
                  {discount.type === 'amount' ? '₹' : '%'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setChargeEnabled((value) => !value)}
                className={cn(
                  'flex h-7.5 items-center justify-center gap-1 rounded-lg border text-[10px] font-semibold',
                  chargeEnabled ? 'border-terracotta-300 bg-terracotta-50 text-terracotta-600' : 'border-line bg-ivory-50 text-ink-500 hover:bg-ivory-100'
                )}
              >
                <Wallet size={11} /> {chargeEnabled ? 'Remove charge' : 'Add charge'}
              </button>
            </div>
            {chargeEnabled && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  value={charge.name}
                  onChange={(event) => setCharge((current) => ({ ...current, name: event.target.value }))}
                  className="h-7.5 min-w-0 flex-1 rounded border border-line bg-ivory-50 px-2 text-[10px] focus:border-terracotta-400 focus:outline-none"
                  placeholder="Charge name"
                />
                <input
                  type="number"
                  min={0}
                  value={charge.amount || ''}
                  onChange={(event) => setCharge((current) => ({ ...current, amount: Number(event.target.value) || 0 }))}
                  className="num h-7.5 w-16 rounded border border-line bg-ivory-50 px-2 text-right text-[10px] focus:border-terracotta-400 focus:outline-none"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div className="border-t border-line-soft px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="label-xs text-ink-400">Payment</p>
              {payments.length > 1 && <span className="text-[9px] text-ink-400">{payments.length} tenders</span>}
            </div>
            <div className="space-y-1.5">
              {payments.map((payment, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <Select
                    value={payment.method}
                    onChange={(event) => {
                      setPayments((current) => current.map((item, i) => (i === index ? { ...item, method: event.target.value } : item)))
                      setPaymentDirty(true)
                    }}
                    className="h-7.5 w-[96px] text-[10px]"
                  >
                    {paymentMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </Select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payment.amount || ''}
                    onChange={(event) => {
                      const amount = Number(event.target.value)
                      setPayments((current) => current.map((item, i) => (i === index ? { ...item, amount: Number.isFinite(amount) ? amount : 0 } : item)))
                      setPaymentDirty(true)
                    }}
                    className="num h-7.5 min-w-0 flex-1 rounded-lg border border-line bg-ivory-50 px-2 text-right text-[10.5px] focus:border-terracotta-400 focus:outline-none"
                  />
                  {payments.length > 1 && (
                    <button
                      onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                      className="rounded p-1 text-ink-300 hover:text-brick-500"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const remaining = Math.max(0, Math.round(((returnCart ? dueTotal : totals.total) - paid) * 100) / 100)
                  setPayments((current) => [...current, { method: remaining > 0 ? 'CARD' : 'CASH', amount: remaining }])
                  setPaymentDirty(true)
                }}
                className="text-[9.5px] font-bold text-terracotta-500 hover:text-terracotta-600"
              >
                + Split payment
              </button>
              <span className={cn('text-[9.5px] font-semibold', balance > 0.005 ? 'text-saffron-500' : 'text-sage-600')}>
                {balance > 0.005 ? `Balance ${money(balance)}` : balance < -0.005 ? `Over ${money(Math.abs(balance))}` : 'Fully tendered'}
              </span>
            </div>

            <Button
              className="mt-3 h-11 w-full text-[13px]"
              onClick={submitCharge}
              loading={chargeMutation.isPending}
              disabled={(lines.length === 0 && !(returnCart && returnCart.items.length > 0)) || (offlineStockIssue && lines.length > 0)}
            >
              {backendOffline
                ? <CloudOff size={15} />
                : returnCart
                  ? <ArrowLeftRight size={15} />
                  : <CreditCard size={15} />}
              {backendOffline
                ? `Save offline · ${money(totals.total)}`
                : returnCart
                  ? lines.length > 0
                    ? `Exchange · ${money(dueTotal)}`
                    : `Refund · ${money(returnCredit)}`
                  : `Charge ${money(totals.total)}`}
              <span className="ml-auto rounded bg-white/15 px-1.5 py-0.5 font-mono text-[9px]">F8</span>
            </Button>
            {offlineStockIssue && (
              <p className="mt-1.5 text-center text-[9.5px] font-semibold text-brick-500">Reduce quantity — last synced stock exceeded.</p>
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        title="Attach a customer"
        description="Credit bills, advances and loyalty need a customer on file."
        size="md"
      >
        <div className="space-y-3">
          <SearchInput value={customerSearch} onChange={setCustomerSearch} placeholder="Search name, phone or code…" autoFocus />
          <button
            type="button"
            onClick={() => {
              setCustomer(null)
              setCustomerOpen(false)
            }}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-ivory-100/50 px-3 py-2.5 text-left hover:bg-ivory-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ivory-200 text-ink-400">
              <UserRound size={14} />
            </span>
            <span>
              <span className="block text-[12px] font-semibold text-ink-800">Walk-in customer</span>
              <span className="block text-[10px] text-ink-400">No customer record · cash / card only</span>
            </span>
          </button>
          {!showNewCustomer && (
            <>
              {online && (
                <button
                  type="button"
                  onClick={() => {
                    setNewCustomerForm({ name: '', phone: customerSearch.replace(/\D/g, ''), email: '' })
                    setShowNewCustomer(true)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed border-terracotta-300/70 px-3 py-2.5 text-left text-terracotta-600 transition-colors hover:border-terracotta-400 hover:bg-terracotta-50/40"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta-500/10">
                    <UserRoundPlus size={14} />
                  </span>
                  <span>
                    <span className="block text-[12px] font-semibold">Add new customer</span>
                    <span className="block truncate text-[10px] text-ink-400">
                      {customerSearch.trim() ? `Create "${customerSearch.trim()}" on file` : 'Name, phone, email — takes seconds'}
                    </span>
                  </span>
                </button>
              )}
              <div className="max-h-[360px] space-y-1 overflow-y-auto">
                {customerOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCustomer(item)
                      setCustomerOpen(false)
                      setPaymentDirty(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line-soft px-3 py-2.5 text-left hover:border-terracotta-200 hover:bg-terracotta-50/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-ink-800">{item.name}</span>
                      <span className="block truncate text-[10px] text-ink-400">
                        {item.phone ?? 'No phone'} · {item.code}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="num block text-[11px] font-semibold text-ink-700">{money(item.outstandingBalance)}</span>
                      <span className="block text-[9px] text-ink-400">outstanding</span>
                    </span>
                  </button>
                ))}
                {customerOptions.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-ink-400">
                    {online ? 'No customers match — add one below.' : 'Offline search uses the last synced list. Connect the internet to add a new customer.'}
                  </p>
                )}
              </div>
            </>
          )}

          {showNewCustomer && (
            <div className="rounded-lg border border-terracotta-200 bg-terracotta-50/30 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-terracotta-500">New customer</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Name" required>
                  <Input
                    value={newCustomerForm.name}
                    onChange={(event) => setNewCustomerForm({ ...newCustomerForm, name: event.target.value })}
                    placeholder="Full name"
                    autoFocus
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={newCustomerForm.phone}
                    onChange={(event) => setNewCustomerForm({ ...newCustomerForm, phone: event.target.value })}
                    placeholder="Mobile number"
                    inputMode="tel"
                  />
                </Field>
                <Field label="Email" hint="Optional">
                  <Input
                    type="email"
                    value={newCustomerForm.email}
                    onChange={(event) => setNewCustomerForm({ ...newCustomerForm, email: event.target.value })}
                    placeholder="name@email.com"
                  />
                </Field>
              </div>
              <div className="mt-2.5 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowNewCustomer(false)
                    setNewCustomerForm({ name: '', phone: '', email: '' })
                  }}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={!newCustomerForm.name.trim() || createCustomerMutation.isPending}
                  loading={createCustomerMutation.isPending}
                  onClick={() => createCustomerMutation.mutate()}
                >
                  <Check size={13} /> Save &amp; attach
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        title="Held bills"
        description="Parked carts at this branch. Resume or release them."
        size="md"
      >
        {!heldBills || heldBills.length === 0 ? (
          <EmptyState icon={PauseCircle} title="No held bills" description="Use Hold on the current bill to park it for later." />
        ) : (
          <div className="space-y-1.5">
            {heldBills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-ink-800">{bill.label}</p>
                  <p className="text-[9.5px] text-ink-400">{formatDateTime(bill.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" onClick={() => resumeBill(bill)}>
                    Resume
                  </Button>
                  <IconButton label="Delete held bill" onClick={() => deleteHeld.mutate(bill.id)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={invoiceListOpen}
        onClose={() => setInvoiceListOpen(false)}
        title="Invoices"
        description="Posted bills at this branch — open one for print, return or exchange. This is the bill history, right here at the counter."
        size="lg"
      >
        <div className="space-y-2">
          <SearchInput value={invoiceListSearch} onChange={setInvoiceListSearch} placeholder="Search invoice no, customer, phone…" autoFocus />
          {invoiceListLoading && <LoadingBlock label="Reading invoices…" />}
          {!invoiceListLoading && filteredInvoiceList.length === 0 && (
            <EmptyState icon={ReceiptText} title="No invoices found" description="Nothing matches the search at this branch." />
          )}
          <div className="max-h-[480px] space-y-1.5 overflow-y-auto">
            {filteredInvoiceList.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => {
                  setSelectedInvoiceId(inv.id)
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-line-soft px-3 py-2.5 text-left transition-colors hover:border-terracotta-200 hover:bg-terracotta-50/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ivory-200 text-[9px] font-bold uppercase text-ink-400">
                  INV
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink-800">
                    {inv.invoiceNo} · {inv.customerName}
                  </span>
                  <span className="mt-0.5 block truncate text-[9.5px] text-ink-400">
                    {formatDateTime(inv.postedAt)} · {money(inv.total)} · {inv.items.length} item{inv.items.length === 1 ? '' : 's'}
                    {inv.payments.length > 0 ? ` · ${inv.payments.map((payment) => titleCase(payment.method)).join(' + ')}` : ''}
                  </span>
                </span>
                <ChevronDown size={14} className="-rotate-90 shrink-0 text-ink-300" />
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onPickReturn={(payload) => {
          setReturnCart({
            kind: payload.kind,
            invoiceId: payload.invoiceId,
            invoiceNo: payload.invoiceNo,
            sourcePaymentMethod: payload.sourcePaymentMethod ?? 'CASH',
            items: payload.items
          })
          setSelectedInvoiceId(null)
          setInvoiceListOpen(false)
          toast.push('Return lines added', {
            description: `${payload.invoiceNo} · ${payload.items.reduce((sum, item) => sum + item.quantity, 0)} unit(s) queued for ${payload.kind}.`,
            tone: 'info'
          })
        }}
      />

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Hold this bill"
        description="The cart is saved on the server and can be resumed from any till in this branch."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setHoldOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={holdBill.isPending} onClick={() => holdBill.mutate()}>
              Hold bill
            </Button>
          </>
        }
      >
        <Field label="Label" hint="Optional">
          <Input value={holdLabel} onChange={(event) => setHoldLabel(event.target.value)} placeholder="Customer trying another size…" />
        </Field>
      </Modal>

      <Modal
        open={approverOpen}
        onClose={() => setApproverOpen(false)}
        title="Manager approval needed"
        description="This bill takes stock below zero. An approver with the negative-stock permission must authorise it."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setApproverOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={chargeMutation.isPending}
              disabled={!approverUsername || approverPin.length < 4}
              onClick={() => chargeMutation.mutate({ username: approverUsername, pin: approverPin })}
            >
              Authorise & charge
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Approver username" required>
            <Input value={approverUsername} onChange={(event) => setApproverUsername(event.target.value)} />
          </Field>
          <Field label="Approval PIN" required hint="4–6 digits">
            <Input
              type="password"
              inputMode="numeric"
              value={approverPin}
              onChange={(event) => setApproverPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              autoFocus
            />
          </Field>
          <p className="rounded-lg border border-saffron-200 bg-saffron-100 px-3 py-2 text-[10.5px] leading-4 text-saffron-500">
            Demo manager PIN is <span className="font-mono font-bold">1111</span>. Every approval is written to the audit trail.
          </p>
        </div>
      </Modal>

      <Modal
        open={receipt != null}
        onClose={() => setReceipt(null)}
        title={receipt?.invoice ? 'Invoice posted' : 'Bill saved offline'}
        description={receipt?.invoice ? receipt.invoice.invoiceNo : 'Queued for sync — no server number yet.'}
        size="md"
        footer={
          <>
            {receipt?.invoice && (
              <>
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <Printer size={13} /> Print
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const headers: Record<string, string> = {}
                    const token = localStorage.getItem('garment.token')
                    if (token) headers.Authorization = `Bearer ${token}`
                    fetch(`/api/sales/invoices/${receipt.invoice!.id}/pdf`, { headers })
                      .then((response) => response.blob())
                      .then((blob) => window.open(URL.createObjectURL(blob), '_blank', 'noopener'))
                      .catch(() => toast.push('PDF unavailable', { tone: 'error' }))
                  }}
                >
                  PDF
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setReceipt(null)}>
              Next bill
            </Button>
          </>
        }
      >
        {receiptBody}
      </Modal>

      {/* Print-only copy: goes to #print-root, which is the sole printable element. */}
      {receiptBody && printTarget && createPortal(receiptBody, printTarget)}
    </div>
  )
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors',
        active ? 'border-ink-900 bg-ink-900 text-ivory-50' : 'border-line bg-ivory-50 text-ink-500 hover:border-ivory-400'
      )}
    >
      {children}
    </button>
  )
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-400">{label}</span>
      <span className={cn('num', accent ? 'text-terracotta-600' : 'text-ink-700')}>{value}</span>
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
