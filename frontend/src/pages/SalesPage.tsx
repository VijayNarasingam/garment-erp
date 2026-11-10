import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download, Plus, ReceiptText } from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, money, statusTone, titleCase } from '../lib/format'
import type { Invoice, PageResponse } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table
} from '../components/ui'
import { InvoiceDetailModal } from '../components/InvoiceDetail'

const statuses = ['', 'POSTED', 'CANCELLED', 'AMENDED']

export function SalesPage() {
  const { branchId } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [invoiceId, setInvoiceId] = useState<number | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['invoices', branchId, status, from, to, search, page],
    queryFn: () =>
      api<PageResponse<Invoice>>(
        `/api/sales/invoices${qs({ branchId, status, from, to, q: search, page, size: 20 })}`
      )
  })

  const rows = data?.content ?? []
  const pageTotal = rows.reduce((sum, invoice) => sum + (invoice.status === 'POSTED' ? invoice.total : 0), 0)

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Sell · invoices"
        title="Every bill, accounted for"
        description="Search posted, cancelled and amended invoices. Open any bill to inspect its tax, payments and linked journals."
        actions={
          <Link to="/pos">
            <Button>
              <Plus size={14} /> New sale
            </Button>
          </Link>
        }
      />

      <Card className="mb-4 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_150px_150px_150px]">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(0) }} placeholder="Invoice number, customer or phone…" />
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value ? titleCase(value) : 'All statuses'}
              </option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0) }} aria-label="From date" />
          <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0) }} aria-label="To date" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          <div className="flex items-center gap-4 text-[11px] text-ink-400">
            <span>
              <span className="num font-semibold text-ink-700">{data?.totalElements ?? 0}</span> invoices
            </span>
            <span>
              Page value <span className="num font-semibold text-ink-700">{money(pageTotal)}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-ink-400">
            {isFetching && <span className="animate-pulse">Refreshing…</span>}
            <Download size={12} />
            <span>Open a bill for PDF</span>
          </div>
        </div>

        {isLoading ? (
          <LoadingBlock label="Reading invoices…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No invoices in this view"
            description="Adjust the filters or ring up the first sale of the day."
            action={
              <Link to="/pos">
                <Button size="sm">Open POS</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Invoice</TH>
                  <TH>Date</TH>
                  <TH>Customer</TH>
                  <TH>Branch</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Paid</TH>
                  <TH align="right">Balance</TH>
                  <TH align="right">Status</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((invoice) => (
                  <TR key={invoice.id} onClick={() => setInvoiceId(invoice.id)}>
                    <TD>
                      <span className="font-mono text-[11px] font-semibold text-ink-900">{invoice.invoiceNo}</span>
                      {invoice.source === 'OFFLINE' && (
                        <span className="ml-1.5 rounded bg-ivory-200 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-ink-400">
                          offline
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(invoice.invoiceDate)}</TD>
                    <TD>
                      <span className="block text-[12px] font-medium text-ink-800">{invoice.customerName}</span>
                      <span className="block text-[9.5px] text-ink-400">{invoice.customerPhone ?? '—'}</span>
                    </TD>
                    <TD className="text-[11px] text-ink-500">{invoice.branchName}</TD>
                    <TD align="right" className="num font-semibold text-ink-900">
                      {money(invoice.total)}
                    </TD>
                    <TD align="right" className="num text-[11px] text-ink-500">
                      {money(invoice.paidAmount)}
                    </TD>
                    <TD align="right" className={`num text-[11px] ${invoice.balanceAmount > 0 ? 'font-semibold text-brick-500' : 'text-ink-300'}`}>
                      {money(invoice.balanceAmount)}
                    </TD>
                    <TD align="right">
                      <Badge tone={statusTone(invoice.status)} dot>
                        {titleCase(invoice.status)}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} totalPages={data?.totalPages ?? 0} totalElements={data?.totalElements ?? 0} onChange={setPage} />
          </>
        )}
      </Card>

      <InvoiceDetailModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
    </div>
  )
}
