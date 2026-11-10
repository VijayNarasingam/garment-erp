import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookUser, IndianRupee, Pencil, Plus, RefreshCw, Users, Wallet } from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, money, statusTone } from '../lib/format'
import type { Customer, PageResponse, PartyLedger } from '../lib/types'
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
  Textarea
} from '../components/ui'
import { useToast } from '../components/toast'

interface CustomerForm {
  code: string
  name: string
  phone: string
  email: string
  gstin: string
  address: string
  city: string
  state: string
  stateCode: string
  creditLimit: string
  discountPercent: string
  openingBalance: string
  notes: string
  active: boolean
}

const emptyForm = (): CustomerForm => ({
  code: '',
  name: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  stateCode: '',
  creditLimit: '0',
  discountPercent: '0',
  openingBalance: '0',
  notes: '',
  active: true
})

export function CustomersPage() {
  const { has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm())
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null)

  const customersQuery = useQuery({
    queryKey: ['customers', search, activeFilter, page],
    queryFn: () =>
      api<PageResponse<Customer>>(
        `/api/customers${qs({
          q: search,
          active: activeFilter === '' ? undefined : activeFilter === 'active',
          page,
          size: 20
        })}`
      )
  })

  const ledgerQuery = useQuery({
    queryKey: ['customer-ledger', ledgerCustomer?.id],
    queryFn: () => api<PartyLedger>(`/api/customers/${ledgerCustomer!.id}/ledger`),
    enabled: ledgerCustomer != null
  })

  const rows = customersQuery.data?.content ?? []
  const pageOutstanding = rows.reduce((sum, customer) => sum + Number(customer.outstandingBalance || 0), 0)
  const pageCredit = rows.reduce((sum, customer) => sum + Number(customer.creditLimit || 0), 0)
  const activeCount = rows.filter((customer) => customer.active).length

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (customer: Customer) => {
    setEditing(customer)
    setForm({
      code: customer.code,
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      gstin: customer.gstin ?? '',
      address: customer.address ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      stateCode: customer.stateCode ?? '',
      creditLimit: String(customer.creditLimit ?? 0),
      discountPercent: String(customer.discountPercent ?? 0),
      openingBalance: String(customer.openingBalance ?? 0),
      notes: customer.notes ?? '',
      active: customer.active
    })
    setFormOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api<Customer>(editing ? `/api/customers/${editing.id}` : '/api/customers', {
        method: editing ? 'PUT' : 'POST',
        body: {
          code: form.code.trim() || null,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          gstin: form.gstin.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          stateCode: form.stateCode.trim() || null,
          creditLimit: Number(form.creditLimit || 0),
          discountPercent: Number(form.discountPercent || 0),
          openingBalance: Number(form.openingBalance || 0),
          notes: form.notes.trim() || null,
          active: form.active
        }
      }),
    onSuccess: (saved) => {
      toast.push(editing ? 'Customer updated' : 'Customer added', {
        description: editing ? saved.name : `${saved.name} · ${saved.code}`,
        tone: 'success'
      })
      setFormOpen(false)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-options'] })
    },
    onError: (error: Error) => toast.push('Could not save customer', { description: error.message, tone: 'error' })
  })

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Relationships · customers"
        title="The people who wear it"
        description="Customer records carry credit limits, GST details and a running ledger built from posted invoices and payments — not a typed-in number."
        actions={
          <>
            <Button variant="secondary" onClick={() => customersQuery.refetch()} loading={customersQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {has('customer.manage') && (
              <Button onClick={openCreate}>
                <Plus size={14} /> New customer
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customers" value={customersQuery.data?.totalElements ?? 0} hint="Matching this view" icon={Users} tone="accent" />
        <StatCard label="Active on page" value={activeCount} hint={`${rows.length} records loaded`} icon={BookUser} tone="success" />
        <StatCard label="Outstanding (page)" value={money(pageOutstanding)} hint="Opening balances + unpaid bills" icon={IndianRupee} tone={pageOutstanding > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Credit granted (page)" value={money(pageCredit)} hint="Sum of credit limits" icon={Wallet} tone="info" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(0)
            }}
            placeholder="Name, phone, code or GSTIN…"
            className="w-full max-w-sm"
          />
          <Select
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value)
              setPage(0)
            }}
            className="w-40"
          >
            <option value="">All customers</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </Select>
          <span className="ml-auto text-[11px] text-ink-400">
            <span className="num font-semibold text-ink-600">{customersQuery.data?.totalElements ?? 0}</span> records
          </span>
        </div>

        {customersQuery.isLoading ? (
          <LoadingBlock label="Opening the customer book…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers in this view"
            description="Add a customer to start tracking credit, GST details and purchase history."
            action={has('customer.manage') ? <Button size="sm" onClick={openCreate}>Add customer</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Customer</TH>
                  <TH>Contact</TH>
                  <TH>City / state</TH>
                  <TH align="right">Credit limit</TH>
                  <TH align="right">Discount</TH>
                  <TH align="right">Outstanding</TH>
                  <TH align="right">Status</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((customer) => (
                  <TR key={customer.id}>
                    <TD>
                      <span className="block text-[12.5px] font-semibold text-ink-800">{customer.name}</span>
                      <span className="block font-mono text-[9.5px] text-ink-400">{customer.code}</span>
                    </TD>
                    <TD className="text-[11px] text-ink-500">
                      <span className="block">{customer.phone ?? '—'}</span>
                      <span className="block text-[10px] text-ink-400">{customer.email ?? '—'}</span>
                    </TD>
                    <TD className="text-[11px] text-ink-500">
                      <span className="block">{customer.city ?? '—'}</span>
                      <span className="block text-[10px] text-ink-400">
                        {customer.state ?? '—'}
                        {customer.stateCode ? ` (${customer.stateCode})` : ''}
                      </span>
                    </TD>
                    <TD align="right" className="num text-[11px] text-ink-500">{money(customer.creditLimit)}</TD>
                    <TD align="right" className="num text-[11px] text-ink-500">{Number(customer.discountPercent).toFixed(2)}%</TD>
                    <TD align="right">
                      <span className={`num text-[11px] font-semibold ${Number(customer.outstandingBalance) > 0 ? 'text-brick-500' : 'text-ink-400'}`}>
                        {money(customer.outstandingBalance)}
                      </span>
                    </TD>
                    <TD align="right">
                      <Badge tone={customer.active ? 'success' : 'danger'} dot>
                        {customer.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setLedgerCustomer(customer)}>
                          Ledger
                        </Button>
                        {has('customer.manage') && (
                          <IconButton label="Edit customer" onClick={() => openEdit(customer)}>
                            <Pencil size={14} />
                          </IconButton>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              totalPages={customersQuery.data?.totalPages ?? 0}
              totalElements={customersQuery.data?.totalElements ?? 0}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit customer' : 'New customer'}
        description={
          editing
            ? 'The opening balance is locked after creation. Post an adjusting journal to correct it.'
            : 'Opening balances post a real opening-balance journal and cannot be edited later.'
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={saveMutation.isPending} disabled={!form.name.trim()} onClick={() => saveMutation.mutate()}>
              {editing ? 'Save changes' : 'Add customer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Customer code" hint="Leave blank to auto-generate">
              <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="CUST-0007" />
            </Field>
            <Field label="Full name" required className="sm:col-span-2">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ananya Deshpande" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98220 11223" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="ananya@example.com" />
            </Field>
          </div>
          <Field label="GSTIN" hint="Required for B2B invoices">
            <Input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })} placeholder="27ABCDE1234F1Z5" />
          </Field>
          <Field label="Address">
            <Textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Flat, street, area…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City">
              <Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </Field>
            <Field label="State">
              <Input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            </Field>
            <Field label="State code">
              <Input value={form.stateCode} onChange={(event) => setForm({ ...form, stateCode: event.target.value })} placeholder="27" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Credit limit">
              <Input type="number" min={0} step="0.01" value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} />
            </Field>
            <Field label="Default discount %">
              <Input type="number" min={0} max={100} step="0.01" value={form.discountPercent} onChange={(event) => setForm({ ...form, discountPercent: event.target.value })} />
            </Field>
            <Field label="Opening balance" hint={editing ? 'Locked' : 'Posts a journal'}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.openingBalance}
                disabled={editing != null}
                onChange={(event) => setForm({ ...form, openingBalance: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Preferences, alterations, style notes…" />
          </Field>
          <Checkbox label="Customer is active" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
        </div>
      </Modal>

      <Modal
        open={ledgerCustomer != null}
        onClose={() => setLedgerCustomer(null)}
        title={ledgerCustomer ? `${ledgerCustomer.name} · ledger` : 'Customer ledger'}
        description="Running receivable balance from opening balance, posted invoices, payments and returns."
        size="xl"
      >
        {ledgerQuery.isLoading ? (
          <LoadingBlock label="Building the ledger…" />
        ) : !ledgerQuery.data ? (
          <EmptyState icon={BookUser} title="No ledger available" />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Opening', ledgerQuery.data.openingBalance],
                ['Debits', ledgerQuery.data.totalDebit],
                ['Credits', ledgerQuery.data.totalCredit],
                ['Closing', ledgerQuery.data.closingBalance ?? 0]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">{label}</p>
                  <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(value as number)}</p>
                </div>
              ))}
            </div>
            {ledgerQuery.data.entries.length === 0 ? (
              <EmptyState icon={BookUser} title="No ledger entries" description="Invoices, payments and returns will appear here." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-line-soft">
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Type</TH>
                      <TH>Reference</TH>
                      <TH>Description</TH>
                      <TH align="right">Debit</TH>
                      <TH align="right">Credit</TH>
                      <TH align="right">Balance</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {ledgerQuery.data.entries.map((entry, index) => (
                      <TR key={`${entry.type}-${entry.reference}-${index}`}>
                        <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(entry.date)}</TD>
                        <TD>
                          <Badge tone={statusTone(entry.type)}>{entry.type}</Badge>
                        </TD>
                        <TD className="font-mono text-[10px] text-ink-500">{entry.reference}</TD>
                        <TD className="text-[11px] text-ink-600">{entry.description}</TD>
                        <TD align="right" className="num text-[11px] text-ink-600">{entry.debit ? money(entry.debit) : '—'}</TD>
                        <TD align="right" className="num text-[11px] text-ink-600">{entry.credit ? money(entry.credit) : '—'}</TD>
                        <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(entry.balance)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <SectionCard
        className="mt-4"
        title="How customer balances work"
        description="Nothing is typed in by hand"
      >
        <div className="grid gap-3 text-[11.5px] leading-5 text-ink-500 sm:grid-cols-3">
          <p>
            <span className="font-semibold text-ink-700">Opening balances</span> post once to the receivable ledger and are
            locked afterwards.
          </p>
          <p>
            <span className="font-semibold text-ink-700">Credit sales</span> increase the outstanding balance. Split and
            partial payments reduce it as they post.
          </p>
          <p>
            <span className="font-semibold text-ink-700">Returns</span> credit the customer through a refund or store
            credit, keeping the ledger auditable.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
