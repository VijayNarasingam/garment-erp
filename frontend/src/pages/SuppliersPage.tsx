import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Pencil, Plus, RefreshCw, Truck, Wallet } from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, money, statusTone } from '../lib/format'
import type { PageResponse, PartyLedger, Supplier } from '../lib/types'
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

interface SupplierForm {
  code: string
  name: string
  contactPerson: string
  phone: string
  email: string
  gstin: string
  address: string
  city: string
  state: string
  stateCode: string
  paymentTermsDays: string
  openingBalance: string
  notes: string
  active: boolean
}

const emptyForm = (): SupplierForm => ({
  code: '',
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  stateCode: '',
  paymentTermsDays: '30',
  openingBalance: '0',
  notes: '',
  active: true
})

export function SuppliersPage() {
  const { has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierForm>(emptyForm())
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null)

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', search, activeFilter, page],
    queryFn: () =>
      api<PageResponse<Supplier>>(
        `/api/suppliers${qs({
          q: search,
          active: activeFilter === '' ? undefined : activeFilter === 'active',
          page,
          size: 20
        })}`
      )
  })

  const ledgerQuery = useQuery({
    queryKey: ['supplier-ledger', ledgerSupplier?.id],
    queryFn: () => api<PartyLedger>(`/api/suppliers/${ledgerSupplier!.id}/ledger`),
    enabled: ledgerSupplier != null
  })

  const rows = suppliersQuery.data?.content ?? []
  const pagePayable = rows.reduce((sum, supplier) => sum + Number(supplier.outstandingPayable || 0), 0)
  const activeCount = rows.filter((supplier) => supplier.active).length
  const averageTerms = rows.length
    ? Math.round(rows.reduce((sum, supplier) => sum + Number(supplier.paymentTermsDays || 0), 0) / rows.length)
    : 0

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier)
    setForm({
      code: supplier.code,
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      gstin: supplier.gstin ?? '',
      address: supplier.address ?? '',
      city: supplier.city ?? '',
      state: supplier.state ?? '',
      stateCode: supplier.stateCode ?? '',
      paymentTermsDays: String(supplier.paymentTermsDays ?? 30),
      openingBalance: String(supplier.openingBalance ?? 0),
      notes: supplier.notes ?? '',
      active: supplier.active
    })
    setFormOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api<Supplier>(editing ? `/api/suppliers/${editing.id}` : '/api/suppliers', {
        method: editing ? 'PUT' : 'POST',
        body: {
          code: form.code.trim() || null,
          name: form.name.trim(),
          contactPerson: form.contactPerson.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          gstin: form.gstin.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          stateCode: form.stateCode.trim() || null,
          paymentTermsDays: Number(form.paymentTermsDays || 0),
          openingBalance: Number(form.openingBalance || 0),
          notes: form.notes.trim() || null,
          active: form.active
        }
      }),
    onSuccess: (saved) => {
      toast.push(editing ? 'Supplier updated' : 'Supplier added', {
        description: editing ? saved.name : `${saved.name} · ${saved.code}`,
        tone: 'success'
      })
      setFormOpen(false)
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-options'] })
    },
    onError: (error: Error) => toast.push('Could not save supplier', { description: error.message, tone: 'error' })
  })

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Relationships · suppliers"
        title="Where the stock begins"
        description="Supplier records hold payment terms, GST identity and a payable ledger fed by purchase invoices, returns and payments."
        actions={
          <>
            <Button variant="secondary" onClick={() => suppliersQuery.refetch()} loading={suppliersQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {has('supplier.manage') && (
              <Button onClick={openCreate}>
                <Plus size={14} /> New supplier
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Suppliers" value={suppliersQuery.data?.totalElements ?? 0} hint="Matching this view" icon={Truck} tone="accent" />
        <StatCard label="Active on page" value={activeCount} hint={`${rows.length} records loaded`} icon={Building2} tone="success" />
        <StatCard label="Payable (page)" value={money(pagePayable)} hint="Opening + unpaid purchase bills" icon={Wallet} tone={pagePayable > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Average terms" value={`${averageTerms} days`} hint="Across loaded suppliers" icon={RefreshCw} tone="info" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(0)
            }}
            placeholder="Name, contact, code or GSTIN…"
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
            <option value="">All suppliers</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </Select>
          <span className="ml-auto text-[11px] text-ink-400">
            <span className="num font-semibold text-ink-600">{suppliersQuery.data?.totalElements ?? 0}</span> records
          </span>
        </div>

        {suppliersQuery.isLoading ? (
          <LoadingBlock label="Opening the supplier book…" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No suppliers in this view"
            description="Add a supplier to raise purchase orders and track payables."
            action={has('supplier.manage') ? <Button size="sm" onClick={openCreate}>Add supplier</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Supplier</TH>
                  <TH>Contact</TH>
                  <TH>City / state</TH>
                  <TH align="right">Terms</TH>
                  <TH align="right">Opening</TH>
                  <TH align="right">Payable</TH>
                  <TH align="right">Status</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((supplier) => (
                  <TR key={supplier.id}>
                    <TD>
                      <span className="block text-[12.5px] font-semibold text-ink-800">{supplier.name}</span>
                      <span className="block font-mono text-[9.5px] text-ink-400">{supplier.code}</span>
                    </TD>
                    <TD className="text-[11px] text-ink-500">
                      <span className="block">{supplier.contactPerson ?? '—'}</span>
                      <span className="block text-[10px] text-ink-400">{supplier.phone ?? supplier.email ?? '—'}</span>
                    </TD>
                    <TD className="text-[11px] text-ink-500">
                      <span className="block">{supplier.city ?? '—'}</span>
                      <span className="block text-[10px] text-ink-400">
                        {supplier.state ?? '—'}
                        {supplier.stateCode ? ` (${supplier.stateCode})` : ''}
                      </span>
                    </TD>
                    <TD align="right" className="num text-[11px] text-ink-500">{supplier.paymentTermsDays} d</TD>
                    <TD align="right" className="num text-[11px] text-ink-400">{money(supplier.openingBalance)}</TD>
                    <TD align="right">
                      <span className={`num text-[11px] font-semibold ${Number(supplier.outstandingPayable) > 0 ? 'text-brick-500' : 'text-ink-400'}`}>
                        {money(supplier.outstandingPayable)}
                      </span>
                    </TD>
                    <TD align="right">
                      <Badge tone={supplier.active ? 'success' : 'danger'} dot>
                        {supplier.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setLedgerSupplier(supplier)}>
                          Ledger
                        </Button>
                        {has('supplier.manage') && (
                          <IconButton label="Edit supplier" onClick={() => openEdit(supplier)}>
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
              totalPages={suppliersQuery.data?.totalPages ?? 0}
              totalElements={suppliersQuery.data?.totalElements ?? 0}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit supplier' : 'New supplier'}
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
              {editing ? 'Save changes' : 'Add supplier'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Supplier code" hint="Leave blank to auto-generate">
              <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="SUP-0007" />
            </Field>
            <Field label="Business name" required className="sm:col-span-2">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Rangoli Textiles Pvt Ltd" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Contact person">
              <Input value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
          </div>
          <Field label="GSTIN">
            <Input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })} placeholder="27ABCDE1234F1Z5" />
          </Field>
          <Field label="Address">
            <Textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Payment terms (days)">
              <Input type="number" min={0} value={form.paymentTermsDays} onChange={(event) => setForm({ ...form, paymentTermsDays: event.target.value })} />
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
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Lead times, minimum order, fabric notes…" />
          </Field>
          <Checkbox label="Supplier is active" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
        </div>
      </Modal>

      <Modal
        open={ledgerSupplier != null}
        onClose={() => setLedgerSupplier(null)}
        title={ledgerSupplier ? `${ledgerSupplier.name} · ledger` : 'Supplier ledger'}
        description="Running payable balance from opening balance, purchase invoices, returns and payments."
        size="xl"
      >
        {ledgerQuery.isLoading ? (
          <LoadingBlock label="Building the ledger…" />
        ) : !ledgerQuery.data ? (
          <EmptyState icon={Truck} title="No ledger available" />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Opening', ledgerQuery.data.openingBalance],
                ['Debits', ledgerQuery.data.totalDebit],
                ['Credits', ledgerQuery.data.totalCredit],
                ['Closing payable', ledgerQuery.data.closingPayable ?? 0]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">{label}</p>
                  <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(value as number)}</p>
                </div>
              ))}
            </div>
            {ledgerQuery.data.entries.length === 0 ? (
              <EmptyState icon={Truck} title="No ledger entries" description="Purchase invoices and payments will appear here." />
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
    </div>
  )
}
