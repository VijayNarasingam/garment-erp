import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  ClipboardList,
  Layers,
  PackageSearch,
  Plus,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  Warehouse
} from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime, money, qty, statusTone, titleCase, todayISO } from '../lib/format'
import type {
  CostingConfig,
  Movement,
  PageResponse,
  StockRow,
  StockSummary,
  Transfer,
  Valuation
} from '../lib/types'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  SectionCard,
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
import { useVariantOptions } from '../lib/options'

type Tab = 'stock' | 'movements' | 'transfers' | 'costing'

const adjustmentTypes = ['ADJUSTMENT', 'DAMAGE', 'PHYSICAL_COUNT', 'OPENING']

export function InventoryPage() {
  const { branchId, branches, has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('stock')
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [movementPage, setMovementPage] = useState(0)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [costingOpen, setCostingOpen] = useState(false)
  const [adjust, setAdjust] = useState({
    variantId: 0,
    quantityDelta: '',
    unitCost: '',
    reason: '',
    movementType: 'ADJUSTMENT',
    approverUsername: 'owner',
    approverPin: ''
  })
  const [transferForm, setTransferForm] = useState({
    fromBranchId: branchId ?? 0,
    toBranchId: 0,
    notes: '',
    items: [{ variantId: 0, quantity: 1 }]
  })
  const [costingForm, setCostingForm] = useState({
    method: 'FIFO',
    effectiveFrom: todayISO(),
    note: '',
    approverUsername: 'owner',
    approverPin: ''
  })

  const { variants } = useVariantOptions(tab === 'transfers' || adjustOpen)

  const summaryQuery = useQuery({
    queryKey: ['inventory-summary', branchId],
    queryFn: () => api<StockSummary>(`/api/inventory/summary?branchId=${branchId}`),
    enabled: branchId != null
  })

  const stockQuery = useQuery({
    queryKey: ['inventory-stock', branchId],
    queryFn: () => api<StockRow[]>(`/api/inventory/stock?branchId=${branchId}`),
    enabled: branchId != null
  })

  const valuationQuery = useQuery({
    queryKey: ['inventory-valuation', branchId],
    queryFn: () => api<Valuation>(`/api/inventory/valuation?branchId=${branchId}`),
    enabled: branchId != null
  })

  const movementsQuery = useQuery({
    queryKey: ['inventory-movements', branchId, movementPage],
    queryFn: () =>
      api<PageResponse<Movement>>(
        `/api/inventory/movements${qs({ branchId, page: movementPage, size: 25 })}`
      ),
    enabled: branchId != null && tab === 'movements'
  })

  const transfersQuery = useQuery({
    queryKey: ['inventory-transfers'],
    queryFn: () => api<Transfer[]>('/api/inventory/transfers'),
    enabled: tab === 'transfers'
  })

  const costingQuery = useQuery({
    queryKey: ['inventory-costing'],
    queryFn: () => api<CostingConfig[]>('/api/inventory/costing'),
    enabled: tab === 'costing'
  })

  const stock = stockQuery.data ?? []
  const filteredStock = useMemo(() => {
    const term = search.trim().toLowerCase()
    return stock.filter((row) => {
      if (lowOnly && !row.lowStock) return false
      if (!term) return true
      return [row.productName, row.sku, row.barcode, row.size, row.color]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [stock, search, lowOnly])

  const selectedStock = stock.find((row) => row.variantId === adjust.variantId)
  const resultingQuantity = selectedStock ? selectedStock.quantity + Number(adjust.quantityDelta || 0) : 0
  const needsApproval = resultingQuantity < 0

  useEffect(() => {
    if (branchId && !transferOpen) {
      const other = branches.find((branch) => branch.id !== branchId)
      setTransferForm((current) => ({
        ...current,
        fromBranchId: branchId,
        toBranchId: other?.id ?? current.toBranchId
      }))
    }
  }, [branchId, branches, transferOpen])

  const openAdjust = (row?: StockRow) => {
    setAdjust({
      variantId: row?.variantId ?? stock[0]?.variantId ?? 0,
      quantityDelta: '',
      unitCost: row ? String(row.averageCost || '') : '',
      reason: '',
      movementType: 'ADJUSTMENT',
      approverUsername: 'owner',
      approverPin: ''
    })
    setAdjustOpen(true)
  }

  const invalidateInventory = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const adjustMutation = useMutation({
    mutationFn: () =>
      api('/api/inventory/adjustments', {
        method: 'POST',
        body: {
          branchId,
          variantId: adjust.variantId,
          quantityDelta: Number(adjust.quantityDelta),
          unitCost: adjust.unitCost === '' ? null : Number(adjust.unitCost),
          reason: adjust.reason.trim(),
          movementType: adjust.movementType,
          approverUsername: needsApproval ? adjust.approverUsername : null,
          approverPin: needsApproval ? adjust.approverPin : null
        }
      }),
    onSuccess: () => {
      toast.push('Stock adjusted', {
        description: 'The movement and its inventory journal were posted.',
        tone: 'success'
      })
      setAdjustOpen(false)
      invalidateInventory()
    },
    onError: (error: Error) => toast.push('Adjustment failed', { description: error.message, tone: 'error' })
  })

  const transferMutation = useMutation({
    mutationFn: () =>
      api<Transfer>('/api/inventory/transfers', {
        method: 'POST',
        body: {
          fromBranchId: transferForm.fromBranchId,
          toBranchId: transferForm.toBranchId,
          notes: transferForm.notes.trim() || undefined,
          items: transferForm.items
            .filter((item) => item.variantId && item.quantity > 0)
            .map((item) => ({ variantId: item.variantId, quantity: Number(item.quantity) }))
        }
      }),
    onSuccess: (created) => {
      toast.push('Transfer drafted', {
        description: `${created.transferNo} is ready to complete.`,
        tone: 'success'
      })
      setTransferOpen(false)
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] })
    },
    onError: (error: Error) => toast.push('Transfer failed', { description: error.message, tone: 'error' })
  })

  const completeTransfer = useMutation({
    mutationFn: (id: number) => api<Transfer>(`/api/inventory/transfers/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      toast.push('Transfer completed', { description: 'Stock moved between branches.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] })
      invalidateInventory()
    },
    onError: (error: Error) => toast.push('Could not complete transfer', { description: error.message, tone: 'error' })
  })

  const cancelTransfer = useMutation({
    mutationFn: (id: number) => api<Transfer>(`/api/inventory/transfers/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast.push('Transfer cancelled', { tone: 'info' })
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] })
    },
    onError: (error: Error) => toast.push('Could not cancel transfer', { description: error.message, tone: 'error' })
  })

  const costingMutation = useMutation({
    mutationFn: () =>
      api('/api/inventory/costing', {
        method: 'POST',
        body: {
          method: costingForm.method,
          effectiveFrom: costingForm.effectiveFrom,
          note: costingForm.note.trim(),
          approverUsername: costingForm.approverUsername,
          approverPin: costingForm.approverPin
        }
      }),
    onSuccess: () => {
      toast.push('Costing method changed', {
        description: 'Inventory was revalued and the difference posted to the books.',
        tone: 'success'
      })
      setCostingOpen(false)
      queryClient.invalidateQueries({ queryKey: ['inventory-costing'] })
      invalidateInventory()
    },
    onError: (error: Error) => toast.push('Costing change failed', { description: error.message, tone: 'error' })
  })

  if (branchId == null) return <LoadingBlock label="Choose a branch…" />

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Stock · inventory"
        title="The shelf, in real time"
        description="Every receipt, sale, transfer and adjustment is a stock movement with a matching journal. Nothing is edited in place."
        actions={
          <>
            <Button variant="secondary" onClick={() => stockQuery.refetch()} loading={stockQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {has('inventory.adjust') && (
              <Button onClick={() => openAdjust()}>
                <SlidersHorizontal size={14} /> Adjust stock
              </Button>
            )}
            {has('inventory.transfer') && (
              <Button variant="dark" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight size={14} /> Transfer
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="On hand"
          value={qty(summaryQuery.data?.totalQuantity ?? 0)}
          hint="Pieces across active variants"
          icon={Boxes}
          tone="accent"
        />
        <StatCard
          label="Stock value"
          value={money(summaryQuery.data?.totalValue ?? 0)}
          hint={`${valuationQuery.data?.rows.length ?? 0} valuation rows`}
          icon={Warehouse}
          tone="success"
        />
        <StatCard
          label="Low stock"
          value={qty(summaryQuery.data?.lowStockCount ?? 0)}
          hint="At or below reorder level"
          icon={PackageSearch}
          tone={summaryQuery.data?.lowStockCount ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Out of stock"
          value={qty(summaryQuery.data?.outOfStockCount ?? 0)}
          hint="Zero pieces on hand"
          icon={TrendingDown}
          tone={summaryQuery.data?.outOfStockCount ? 'danger' : 'neutral'}
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <Tabs
            className="border-0"
            value={tab}
            onChange={(value) => setTab(value as Tab)}
            items={[
              { id: 'stock', label: 'Stock on hand' },
              { id: 'movements', label: 'Movements' },
              { id: 'transfers', label: 'Transfers' },
              { id: 'costing', label: 'Costing' }
            ]}
          />
        </div>

        {tab === 'stock' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search style, SKU, barcode…"
                className="w-full max-w-sm"
              />
              <Checkbox label="Low stock only" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} />
              <span className="ml-auto text-[11px] text-ink-400">
                <span className="num font-semibold text-ink-600">{filteredStock.length}</span> of{' '}
                <span className="num">{stock.length}</span> SKUs
              </span>
            </div>
            {stockQuery.isLoading ? (
              <LoadingBlock label="Counting the shelves…" />
            ) : filteredStock.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="No stock rows match"
                description="Try a different search, or clear the low-stock filter."
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Product</TH>
                    <TH>SKU</TH>
                    <TH>Size / colour</TH>
                    <TH align="right">On hand</TH>
                    <TH align="right">Avg cost</TH>
                    <TH align="right">Value</TH>
                    <TH align="right">Reorder</TH>
                    <TH align="right">Selling</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </THead>
                <tbody>
                  {filteredStock.map((row) => (
                    <TR key={row.variantId}>
                      <TD>
                        <span className="font-semibold text-ink-800">{row.productName}</span>
                        {row.barcode && <span className="mt-0.5 block font-mono text-[9.5px] text-ink-400">{row.barcode}</span>}
                      </TD>
                      <TD className="font-mono text-[10.5px] text-ink-500">{row.sku}</TD>
                      <TD className="text-[11px] text-ink-500">
                        {row.size ?? '—'} · {row.color ?? '—'}
                      </TD>
                      <TD align="right">
                        <span className={`num font-semibold ${row.quantity <= 0 ? 'text-brick-500' : row.lowStock ? 'text-saffron-500' : 'text-ink-900'}`}>
                          {qty(row.quantity)}
                        </span>
                        {row.lowStock && (
                          <Badge tone={row.quantity <= 0 ? 'danger' : 'warning'} className="ml-1.5">
                            {row.quantity <= 0 ? 'Out' : 'Low'}
                          </Badge>
                        )}
                      </TD>
                      <TD align="right" className="num text-[11px] text-ink-500">
                        {money(row.averageCost)}
                      </TD>
                      <TD align="right" className="num font-semibold text-ink-800">
                        {money(row.stockValue)}
                      </TD>
                      <TD align="right" className="num text-[11px] text-ink-400">
                        {row.reorderLevel}
                      </TD>
                      <TD align="right" className="num text-[11px] text-ink-500">
                        {money(row.sellingPrice)}
                      </TD>
                      <TD align="right">
                        {has('inventory.adjust') && (
                          <Button variant="ghost" size="sm" onClick={() => openAdjust(row)}>
                            Adjust
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'movements' && (
          <div className="border-t border-line-soft">
            {movementsQuery.isLoading ? (
              <LoadingBlock label="Reading stock history…" />
            ) : (movementsQuery.data?.content.length ?? 0) === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No movements yet"
                description="Sales, purchases, transfers and adjustments will appear here as they happen."
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Type</TH>
                      <TH>Product</TH>
                      <TH>Reference</TH>
                      <TH align="right">Change</TH>
                      <TH align="right">Balance</TH>
                      <TH align="right">Unit cost</TH>
                      <TH>By</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {movementsQuery.data!.content.map((movement) => (
                      <TR key={movement.id}>
                        <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(movement.movementDate)}</TD>
                        <TD>
                          <Badge tone={movement.quantity >= 0 ? 'success' : 'warning'}>{titleCase(movement.type)}</Badge>
                        </TD>
                        <TD>
                          <span className="block text-[12px] font-semibold text-ink-800">{movement.productName}</span>
                          <span className="block font-mono text-[9.5px] text-ink-400">
                            {movement.sku} · {movement.size ?? '—'} / {movement.color ?? '—'}
                          </span>
                        </TD>
                        <TD className="max-w-[180px] text-[10.5px] text-ink-500">
                          <span className="block truncate">{movement.reason ?? movement.referenceType ?? '—'}</span>
                          {movement.referenceId && (
                            <span className="block truncate font-mono text-[9px] text-ink-400">
                              {movement.referenceType} #{movement.referenceId}
                            </span>
                          )}
                        </TD>
                        <TD align="right" className={`num font-semibold ${movement.quantity >= 0 ? 'text-sage-600' : 'text-brick-500'}`}>
                          {movement.quantity > 0 ? '+' : ''}
                          {movement.quantity}
                        </TD>
                        <TD align="right" className="num text-[11px] text-ink-500">
                          {movement.previousQuantity} → {movement.newQuantity}
                        </TD>
                        <TD align="right" className="num text-[11px] text-ink-500">
                          {money(movement.unitCost)}
                        </TD>
                        <TD className="text-[10.5px] text-ink-500">{movement.username ?? '—'}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={movementPage}
                  totalPages={movementsQuery.data?.totalPages ?? 0}
                  totalElements={movementsQuery.data?.totalElements ?? 0}
                  onChange={setMovementPage}
                />
              </>
            )}
          </div>
        )}

        {tab === 'transfers' && (
          <div className="border-t border-line-soft">
            {transfersQuery.isLoading ? (
              <LoadingBlock label="Reading transfers…" />
            ) : (transfersQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No stock transfers"
                description="Move stock between branches with a draft and a completed movement trail."
                action={has('inventory.transfer') ? <Button size="sm" onClick={() => setTransferOpen(true)}>Create transfer</Button> : undefined}
              />
            ) : (
              <div className="divide-y divide-line-soft">
                {transfersQuery.data!.map((transfer) => (
                  <div key={transfer.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] font-semibold text-ink-900">{transfer.transferNo}</span>
                          <Badge tone={statusTone(transfer.status)}>{titleCase(transfer.status)}</Badge>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                          {transfer.fromBranchName} <ArrowRight size={11} /> {transfer.toBranchName}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-400">
                          {formatDate(transfer.transferDate)} · {transfer.items.length} line
                          {transfer.items.length === 1 ? '' : 's'}
                          {transfer.notes ? ` · ${transfer.notes}` : ''}
                        </p>
                      </div>
                      {transfer.status === 'DRAFT' && has('inventory.transfer') && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            loading={completeTransfer.isPending}
                            onClick={() => completeTransfer.mutate(transfer.id)}
                          >
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => cancelTransfer.mutate(transfer.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {transfer.items.map((item) => (
                        <span
                          key={item.variantId}
                          className="rounded-md border border-line-soft bg-ivory-100/50 px-2 py-1 text-[10px] text-ink-500"
                        >
                          {item.sku} · <span className="num">{item.quantity}</span> pcs
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'costing' && (
          <div className="border-t border-line-soft p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-ink-800">Inventory costing method</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  Current: <span className="font-mono font-semibold text-ink-600">{costingQuery.data?.[0]?.method ?? '—'}</span>
                  . Changes require an approval PIN and post a revaluation journal.
                </p>
              </div>
              {has('inventory.costing') && (
                <Button size="sm" onClick={() => setCostingOpen(true)}>
                  <Scale size={13} /> Change method
                </Button>
              )}
            </div>
            {costingQuery.isLoading ? (
              <LoadingBlock label="Reading costing history…" />
            ) : (costingQuery.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Scale} title="No costing changes" description="The initial costing configuration will appear here." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Method</TH>
                    <TH>Effective from</TH>
                    <TH>Note</TH>
                    <TH align="right">Revaluation</TH>
                    <TH>Recorded</TH>
                  </tr>
                </THead>
                <tbody>
                  {costingQuery.data!.map((config) => (
                    <TR key={config.id}>
                      <TD>
                        <Badge tone="info">{config.method}</Badge>
                      </TD>
                      <TD className="text-[11px] text-ink-500">{formatDate(config.effectiveFrom)}</TD>
                      <TD className="text-[11px] text-ink-500">{config.note ?? '—'}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-700">
                        {money(config.revaluationAmount)}
                      </TD>
                      <TD className="text-[10.5px] text-ink-400">{formatDateTime(config.createdAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <SectionCard
        className="mt-4"
        title="Valuation snapshot"
        description="Average cost × on-hand quantity at this branch"
        bodyClassName="p-0"
      >
        {valuationQuery.isLoading ? (
          <LoadingBlock label="Valuing stock…" />
        ) : (valuationQuery.data?.rows.length ?? 0) === 0 ? (
          <EmptyState icon={Layers} title="No valuation rows" description="Stock receipts will populate the valuation." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>SKU</TH>
                <TH align="right">Quantity</TH>
                <TH align="right">Average cost</TH>
                <TH align="right">Value</TH>
              </tr>
            </THead>
            <tbody>
              {valuationQuery.data!.rows.slice(0, 8).map((row) => (
                <TR key={`${row.branchId}-${row.variantId}`}>
                  <TD className="text-[12px] font-medium text-ink-800">{row.productName}</TD>
                  <TD className="font-mono text-[10px] text-ink-500">{row.sku}</TD>
                  <TD align="right" className="num text-[11px]">{row.quantity}</TD>
                  <TD align="right" className="num text-[11px] text-ink-500">{money(row.averageCost)}</TD>
                  <TD align="right" className="num font-semibold text-ink-800">{money(row.stockValue)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust stock"
        description="Positive adjustments receive stock at the entered cost; negative adjustments issue at the current cost. The movement posts a journal."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={adjustMutation.isPending}
              disabled={!adjust.variantId || !adjust.reason.trim() || Number(adjust.quantityDelta) === 0}
              onClick={() => adjustMutation.mutate()}
            >
              Post adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Variant" required>
            <Select
              value={adjust.variantId}
              onChange={(event) => {
                const id = Number(event.target.value)
                const row = stock.find((item) => item.variantId === id)
                setAdjust((current) => ({ ...current, variantId: id, unitCost: row ? String(row.averageCost) : current.unitCost }))
              }}
            >
              <option value={0}>Select a stock item…</option>
              {stock.map((row) => (
                <option key={row.variantId} value={row.variantId}>
                  {row.productName} · {row.sku} · on hand {row.quantity}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Quantity change" hint="Use − for issue" required>
              <Input
                type="number"
                value={adjust.quantityDelta}
                onChange={(event) => setAdjust((current) => ({ ...current, quantityDelta: event.target.value }))}
                placeholder="e.g. 5 or -2"
              />
            </Field>
            <Field label="Unit cost" hint="Positive only">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={adjust.unitCost}
                onChange={(event) => setAdjust((current) => ({ ...current, unitCost: event.target.value }))}
                placeholder="0.00"
              />
            </Field>
            <Field label="Movement type">
              <Select
                value={adjust.movementType}
                onChange={(event) => setAdjust((current) => ({ ...current, movementType: event.target.value }))}
              >
                {adjustmentTypes.map((type) => (
                  <option key={type} value={type}>
                    {titleCase(type)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reason" required>
            <Textarea
              value={adjust.reason}
              onChange={(event) => setAdjust((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Damaged during display, physical count correction…"
            />
          </Field>
          {selectedStock && (
            <div className="rounded-lg border border-line-soft bg-ivory-100/60 px-3 py-2 text-[11px] text-ink-500">
              Current <span className="num font-semibold text-ink-800">{selectedStock.quantity}</span> → resulting{' '}
              <span className={`num font-semibold ${resultingQuantity < 0 ? 'text-brick-500' : 'text-ink-800'}`}>
                {resultingQuantity}
              </span>
            </div>
          )}
          {needsApproval && (
            <div className="space-y-3 rounded-xl border border-saffron-200 bg-saffron-100/60 p-3">
              <p className="text-[10.5px] font-semibold leading-4 text-saffron-500">
                This adjustment takes stock negative. An approver with negative-stock permission must authorise it.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Approver username" required>
                  <Input
                    value={adjust.approverUsername}
                    onChange={(event) => setAdjust((current) => ({ ...current, approverUsername: event.target.value }))}
                  />
                </Field>
                <Field label="Approval PIN" required>
                  <Input
                    type="password"
                    inputMode="numeric"
                    value={adjust.approverPin}
                    onChange={(event) =>
                      setAdjust((current) => ({ ...current, approverPin: event.target.value.replace(/\D/g, '').slice(0, 6) }))
                    }
                    placeholder="••••"
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="New stock transfer"
        description="Draft the transfer, then complete it to issue from the source and receive at the destination."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={transferMutation.isPending}
              disabled={
                transferForm.fromBranchId === transferForm.toBranchId ||
                !transferForm.items.some((item) => item.variantId && item.quantity > 0)
              }
              onClick={() => transferMutation.mutate()}
            >
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From branch" required>
              <Select
                value={transferForm.fromBranchId}
                onChange={(event) => setTransferForm((current) => ({ ...current, fromBranchId: Number(event.target.value) }))}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To branch" required>
              <Select
                value={transferForm.toBranchId}
                onChange={(event) => setTransferForm((current) => ({ ...current, toBranchId: Number(event.target.value) }))}
              >
                <option value={0}>Select destination…</option>
                {branches
                  .filter((branch) => branch.id !== transferForm.fromBranchId)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              value={transferForm.notes}
              onChange={(event) => setTransferForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Seasonal replenishment for the Baner floor…"
            />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Items</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setTransferForm((current) => ({
                    ...current,
                    items: [...current.items, { variantId: 0, quantity: 1 }]
                  }))
                }
              >
                <Plus size={12} /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {transferForm.items.map((item, index) => (
                <div key={index} className="flex items-end gap-2">
                  <Field label={index === 0 ? 'Variant' : undefined} className="flex-1">
                    <Select
                      value={item.variantId}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          items: current.items.map((row, i) =>
                            i === index ? { ...row, variantId: Number(event.target.value) } : row
                          )
                        }))
                      }
                    >
                      <option value={0}>Select variant…</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={index === 0 ? 'Qty' : undefined} className="w-24">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          items: current.items.map((row, i) =>
                            i === index ? { ...row, quantity: Number(event.target.value) || 1 } : row
                          )
                        }))
                      }
                    />
                  </Field>
                  <IconButton
                    label="Remove line"
                    className="mb-0.5"
                    disabled={transferForm.items.length === 1}
                    onClick={() =>
                      setTransferForm((current) => ({
                        ...current,
                        items: current.items.filter((_, i) => i !== index)
                      }))
                    }
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
        open={costingOpen}
        onClose={() => setCostingOpen(false)}
        title="Change inventory costing"
        description="The change revalues every branch's stock and posts the difference to the inventory revaluation journal."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCostingOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={costingMutation.isPending}
              disabled={!costingForm.note.trim() || !costingForm.approverUsername || costingForm.approverPin.length < 4}
              onClick={() => costingMutation.mutate()}
            >
              Revalue & change
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New method" required>
              <Select
                value={costingForm.method}
                onChange={(event) => setCostingForm((current) => ({ ...current, method: event.target.value }))}
              >
                <option value="FIFO">FIFO — first in, first out</option>
                <option value="WEIGHTED_AVERAGE">Weighted average</option>
              </Select>
            </Field>
            <Field label="Effective from" required>
              <Input
                type="date"
                value={costingForm.effectiveFrom}
                onChange={(event) => setCostingForm((current) => ({ ...current, effectiveFrom: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Reason / note" required>
            <Textarea
              value={costingForm.note}
              onChange={(event) => setCostingForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Aligning valuation with the new purchase policy…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Approver username" required>
              <Input
                value={costingForm.approverUsername}
                onChange={(event) => setCostingForm((current) => ({ ...current, approverUsername: event.target.value }))}
              />
            </Field>
            <Field label="Approval PIN" required>
              <Input
                type="password"
                inputMode="numeric"
                value={costingForm.approverPin}
                onChange={(event) =>
                  setCostingForm((current) => ({ ...current, approverPin: event.target.value.replace(/\D/g, '').slice(0, 6) }))
                }
                placeholder="••••"
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
