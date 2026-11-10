import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  Boxes,
  CircleAlert,
  CreditCard,
  IndianRupee,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  TrendingUp,
  Wallet
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateShort, money, moneyCompact, statusTone, titleCase } from '../lib/format'
import type { DashboardData } from '../lib/types'
import { Badge, Button, Card, EmptyState, LoadingBlock, PageHeader, SectionCard, StatCard, TD, TH, THead, TR, Table } from '../components/ui'
import { InvoiceDetailModal } from '../components/InvoiceDetail'

export function DashboardPage() {
  const { user, branchId, branches } = useAuth()
  const [invoiceId, setInvoiceId] = useState<number | null>(null)
  const branch = branches.find((item) => item.id === branchId)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', branchId],
    queryFn: () => api<DashboardData>(`/api/dashboard${branchId ? `?branchId=${branchId}` : ''}`)
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.fullName?.split(' ')[0] ?? 'there'

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader eyebrow="Overview" title={`${greeting}, ${firstName}`} />
        <LoadingBlock label="Reading the day's ledger…" />
      </div>
    )
  }

  const trend = data.salesTrend.map((point) => ({ ...point, label: formatDateShort(point.date) }))
  const peak = Math.max(...data.salesTrend.map((point) => point.sales), 0)

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow={`${branch?.name ?? 'All branches'} · ${formatDate(data.date)}`}
        title={`${greeting}, ${firstName}.`}
        description={
          data.todayInvoices > 0
            ? `${data.todayInvoices} bill${data.todayInvoices === 1 ? '' : 's'} rung up today for ${money(data.todaySales)}. The counter is moving.`
            : 'The counter is quiet so far. Open a sale when the first customer walks in.'
        }
        actions={
          <Button variant="secondary" size="md" onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today’s sales"
          value={money(data.todaySales)}
          hint={`${data.todayInvoices} invoice${data.todayInvoices === 1 ? '' : 's'} · ${branch?.code ?? 'all'}`}
          icon={IndianRupee}
          tone="accent"
        />
        <StatCard
          label="Month to date"
          value={money(data.monthSales)}
          hint={`${data.monthInvoices} bills · avg ${money(data.averageBill)}`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Receivables"
          value={money(data.outstandingReceivables)}
          hint="Customer credit outstanding"
          icon={CreditCard}
          tone={data.outstandingReceivables > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Cash in hand"
          value={money(data.cashInHand)}
          hint={`Inventory at ${money(data.inventoryValue)}`}
          icon={Banknote}
          tone="info"
        />
      </div>

      {(data.pendingReturns > 0 || data.pendingExpenses > 0 || data.lowStockCount > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.pendingReturns > 0 && (
            <Link to="/returns" className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-terracotta-300">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-saffron-100 text-saffron-500">
                <RotateCcw size={15} />
              </span>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-ink-800">{data.pendingReturns} return awaiting approval</p>
                <p className="text-[10px] text-ink-400">Review and complete the refund</p>
              </div>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
          )}
          {data.pendingExpenses > 0 && (
            <Link to="/expenses" className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-terracotta-300">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brick-100 text-brick-500">
                <Wallet size={15} />
              </span>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-ink-800">{data.pendingExpenses} expense awaiting approval</p>
                <p className="text-[10px] text-ink-400">Approve to post the journal</p>
              </div>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
          )}
          {data.lowStockCount > 0 && (
            <Link to="/inventory" className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-terracotta-300">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta-50 text-terracotta-500">
                <PackageSearch size={15} />
              </span>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-ink-800">{data.lowStockCount} SKUs at reorder level</p>
                <p className="text-[10px] text-ink-400">Replenish before the next rush</p>
              </div>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="p-5 xl:col-span-8">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-xs text-ink-400">Sales rhythm</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-ink-900">Last fourteen days</h2>
            </div>
            <div className="text-right">
              <p className="label-xs text-ink-400">Peak day</p>
              <p className="num mt-1 text-sm font-semibold text-ink-800">{money(peak)}</p>
            </div>
          </div>
          <div className="h-[268px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b8532f" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#b8532f" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5dac8" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#8b8273', fontFamily: 'Manrope' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#8b8273', fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => moneyCompact(value)}
                />
                <Tooltip content={<SalesTooltip />} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#b8532f"
                  strokeWidth={2}
                  fill="url(#salesFill)"
                  activeDot={{ r: 4, fill: '#b8532f', stroke: '#fdfaf4', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-4 xl:col-span-4">
          <SectionCard
            title="Counter health"
            description="What is on the shelf and in the drawer"
            bodyClassName="space-y-4"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat icon={Banknote} label="Cash" value={money(data.cashInHand)} />
              <MiniStat icon={Boxes} label="Stock value" value={money(data.inventoryValue)} />
              <MiniStat icon={PackageSearch} label="Low stock" value={String(data.lowStockCount)} tone={data.lowStockCount > 0 ? 'warning' : 'neutral'} />
              <MiniStat icon={CircleAlert} label="Receivables" value={money(data.outstandingReceivables)} tone={data.outstandingReceivables > 0 ? 'warning' : 'neutral'} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label-xs text-ink-400">Branch performance · MTD</p>
                <Link to="/sales" className="text-[10px] font-bold text-terracotta-500 hover:text-terracotta-600">
                  View bills
                </Link>
              </div>
              <div className="space-y-2.5">
                {data.branchPerformance.map((item) => {
                  const max = Math.max(...data.branchPerformance.map((row) => row.sales), 1)
                  return (
                    <div key={item.branchId}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold text-ink-700">{item.branchName}</span>
                        <span className="num shrink-0 text-ink-500">{money(item.sales)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ivory-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-terracotta-400 to-saffron-400"
                          style={{ width: `${Math.max((item.sales / max) * 100, item.sales > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {data.branchPerformance.length === 0 && <p className="text-[11px] text-ink-400">No branch activity yet.</p>}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <SectionCard
          className="xl:col-span-7"
          title="Recent bills"
          description="Latest posted invoices across the selected branch"
          action={
            <Link to="/sales">
              <Button variant="ghost" size="sm">
                All invoices <ArrowRight size={13} />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          {data.recentInvoices.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No bills yet"
              description="The first sale of the day will appear here with its live status."
              action={
                <Link to="/pos">
                  <Button size="sm">Open POS</Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Invoice</TH>
                  <TH>Customer</TH>
                  <TH>Date</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Status</TH>
                </tr>
              </THead>
              <tbody>
                {data.recentInvoices.map((invoice) => (
                  <TR key={invoice.id} onClick={() => setInvoiceId(invoice.id)}>
                    <TD className="font-mono text-[11px] font-semibold text-ink-900">{invoice.invoiceNo}</TD>
                    <TD className="text-ink-600">{invoice.customerName}</TD>
                    <TD className="text-[11px] text-ink-400">{formatDate(invoice.invoiceDate)}</TD>
                    <TD align="right" className="num font-semibold text-ink-900">
                      {money(invoice.total)}
                    </TD>
                    <TD align="right">
                      <Badge tone={statusTone(invoice.status)}>{titleCase(invoice.status)}</Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          className="xl:col-span-5"
          title="Best sellers"
          description="By quantity this month"
          bodyClassName="p-0"
        >
          {data.topProducts.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No product sales yet" description="Top styles will rank here once bills are posted." />
          ) : (
            <div className="divide-y divide-line-soft">
              {data.topProducts.map((product, index) => (
                <div key={product.variantId} className="flex items-center gap-3 px-5 py-3">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ivory-200 text-[10px] font-bold text-ink-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink-800">{product.productName}</p>
                    <p className="mt-0.5 truncate font-mono text-[9.5px] text-ink-400">
                      {product.sku} · {product.size ?? '—'} / {product.color ?? '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[12px] font-semibold text-ink-900">{money(product.sales)}</p>
                    <p className="text-[10px] text-ink-400">{product.quantity} pcs</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {data.lowStockItems.length > 0 && (
        <SectionCard
          className="mt-4"
          title="Reorder soon"
          description="SKUs at or below their reorder level"
          action={
            <Link to="/inventory">
              <Button variant="ghost" size="sm">
                Manage stock <ArrowRight size={13} />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>SKU</TH>
                <TH>Branch</TH>
                <TH align="right">On hand</TH>
                <TH align="right">Reorder at</TH>
              </tr>
            </THead>
            <tbody>
              {data.lowStockItems.map((item) => (
                <TR key={`${item.branchId}-${item.variantId}`}>
                  <TD>
                    <span className="font-semibold text-ink-800">{item.productName}</span>
                    <span className="ml-1.5 text-[10px] text-ink-400">
                      {item.size} · {item.color}
                    </span>
                  </TD>
                  <TD className="font-mono text-[10.5px] text-ink-500">{item.sku}</TD>
                  <TD className="text-[11px] text-ink-500">{item.branchName}</TD>
                  <TD align="right" className="num font-semibold text-brick-500">
                    {item.quantity}
                  </TD>
                  <TD align="right" className="num text-ink-400">
                    {item.reorderLevel}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      )}

      <InvoiceDetailModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone = 'neutral'
}: {
  icon: typeof Banknote
  label: string
  value: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-ivory-100/50 px-3 py-2.5">
      <span className={tone === 'warning' ? 'text-saffron-500' : 'text-ink-300'}>
        <Icon size={14} />
      </span>
      <p className="num mt-1.5 text-[14px] font-semibold leading-none text-ink-900">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">{label}</p>
    </div>
  )
}

function SalesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as { sales: number; invoices: number }
  return (
    <div className="rounded-lg border border-line bg-ivory-50 px-3 py-2 shadow-float">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</p>
      <p className="num mt-1 text-[13px] font-semibold text-ink-900">{money(point.sales)}</p>
      <p className="text-[10px] text-ink-400">{point.invoices} invoices</p>
    </div>
  )
}
