import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleDollarSign, Pencil, Plus, Receipt, RefreshCw, Tags, XCircle } from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, money, statusTone, titleCase, todayISO } from '../lib/format'
import type { Account, Expense, ExpenseCategory, PageResponse } from '../lib/types'
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
  Tabs,
  Textarea
} from '../components/ui'
import { useToast } from '../components/toast'

const paymentMethods = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE']

export function ExpensesPage() {
  const { branchId, has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'expenses' | 'categories'>('expenses')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [rejecting, setRejecting] = useState<Expense | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryEdit, setCategoryEdit] = useState<ExpenseCategory | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', accountId: 0, active: true })
  const [form, setForm] = useState({
    categoryId: 0,
    expenseDate: todayISO(),
    amount: '',
    paymentMethod: 'CASH',
    description: '',
    attachmentUrl: '',
    notes: ''
  })

  const expensesQuery = useQuery({
    queryKey: ['expenses', branchId, status, from, to, page],
    queryFn: () =>
      api<PageResponse<Expense>>(
        `/api/expenses${qs({ branchId, status, from, to, page, size: 20 })}`
      ),
    enabled: branchId != null
  })

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api<ExpenseCategory[]>('/api/expenses/categories')
  })

  const accountsQuery = useQuery({
    queryKey: ['expense-accounts'],
    queryFn: () => api<Account[]>('/api/accounting/accounts'),
    enabled: categoryOpen
  })

  const rows = (expensesQuery.data?.content ?? []).filter((expense) => {
    if (!search.trim()) return true
    const term = search.trim().toLowerCase()
    return [expense.expenseNo, expense.categoryName, expense.description, expense.requestedByName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term))
  })

  const pageTotal = rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const pendingCount = rows.filter((expense) => expense.status === 'PENDING').length
  const approvedTotal = rows.filter((expense) => expense.status === 'APPROVED').reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const categories = categoriesQuery.data ?? []
  const expenseAccounts = (accountsQuery.data ?? []).filter((account) => account.type === 'EXPENSE' && account.active)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['cash-current'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api<Expense>('/api/expenses', {
        method: 'POST',
        body: {
          branchId,
          categoryId: form.categoryId,
          expenseDate: form.expenseDate,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          description: form.description.trim(),
          attachmentUrl: form.attachmentUrl.trim() || null,
          notes: form.notes.trim() || null
        }
      }),
    onSuccess: (saved) => {
      toast.push(saved.status === 'APPROVED' ? 'Expense posted' : 'Expense submitted', {
        description:
          saved.status === 'APPROVED'
            ? `${saved.expenseNo} · journal #${saved.journalEntryId ?? '—'}`
            : `${saved.expenseNo} is waiting for approval.`,
        tone: 'success'
      })
      setCreateOpen(false)
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not save expense', { description: error.message, tone: 'error' })
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api<Expense>(`/api/expenses/${id}/approve`, { method: 'POST' }),
    onSuccess: (saved) => {
      toast.push('Expense approved', { description: `${saved.expenseNo} posted to the books.`, tone: 'success' })
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not approve expense', { description: error.message, tone: 'error' })
  })

  const rejectMutation = useMutation({
    mutationFn: () =>
      api<Expense>(`/api/expenses/${rejecting!.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() }
      }),
    onSuccess: (saved) => {
      toast.push('Expense rejected', { description: saved.expenseNo, tone: 'info' })
      setRejecting(null)
      setRejectReason('')
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not reject expense', { description: error.message, tone: 'error' })
  })

  const categoryMutation = useMutation({
    mutationFn: () =>
      api<ExpenseCategory>(categoryEdit ? `/api/expenses/categories/${categoryEdit.id}` : '/api/expenses/categories', {
        method: categoryEdit ? 'PUT' : 'POST',
        body: { name: categoryForm.name.trim(), accountId: categoryForm.accountId, active: categoryForm.active }
      }),
    onSuccess: () => {
      toast.push(categoryEdit ? 'Category updated' : 'Category created', { tone: 'success' })
      setCategoryOpen(false)
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    },
    onError: (error: Error) => toast.push('Could not save category', { description: error.message, tone: 'error' })
  })

  const openCreate = () => {
    setForm({
      categoryId: categories[0]?.id ?? 0,
      expenseDate: todayISO(),
      amount: '',
      paymentMethod: 'CASH',
      description: '',
      attachmentUrl: '',
      notes: ''
    })
    setCreateOpen(true)
  }

  if (branchId == null) return <LoadingBlock label="Choose a branch…" />

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Overheads · expenses"
        title="Every rupee that leaves"
        description="Expenses post to real expense accounts. Cash expenses flow through the open cash session; approval rules are enforced by permission, not by a checkbox."
        actions={
          <>
            <Button variant="secondary" onClick={() => expensesQuery.refetch()} loading={expensesQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {has('expense.manage') && (
              <Button onClick={openCreate}>
                <Plus size={14} /> New expense
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Expenses (page)" value={money(pageTotal)} hint={`${rows.length} records`} icon={CircleDollarSign} tone="accent" />
        <StatCard label="Pending approval" value={pendingCount} hint="Awaiting a manager" icon={Receipt} tone={pendingCount ? 'warning' : 'neutral'} />
        <StatCard label="Approved (page)" value={money(approvedTotal)} hint="Posted to expense accounts" icon={CheckCircle2} tone="success" />
        <StatCard label="Categories" value={categories.length} hint="Mapped to expense accounts" icon={Tags} tone="info" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            className="border-0"
            value={tab}
            onChange={(value) => setTab(value as 'expenses' | 'categories')}
            items={[
              { id: 'expenses', label: 'Expenses', count: expensesQuery.data?.totalElements },
              { id: 'categories', label: 'Categories', count: categories.length }
            ]}
          />
        </div>

        {tab === 'expenses' && (
          <div className="border-t border-line-soft">
            <div className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_150px_150px_150px]">
              <SearchInput value={search} onChange={setSearch} placeholder="Expense no, category, description…" />
              <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>
                <option value="">All statuses</option>
                {['PENDING', 'APPROVED', 'REJECTED'].map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
              <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0) }} aria-label="From date" />
              <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0) }} aria-label="To date" />
            </div>

            {expensesQuery.isLoading ? (
              <LoadingBlock label="Reading expenses…" />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expenses in this view"
                description="Record rent, salaries, electricity and other overheads with their supporting details."
                action={has('expense.manage') ? <Button size="sm" onClick={openCreate}>Add expense</Button> : undefined}
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Expense</TH>
                      <TH>Category</TH>
                      <TH>Description</TH>
                      <TH>Method</TH>
                      <TH align="right">Amount</TH>
                      <TH align="right">Status</TH>
                      <TH align="right">Actions</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((expense) => (
                      <TR key={expense.id}>
                        <TD>
                          <span className="block font-mono text-[11px] font-semibold text-ink-900">{expense.expenseNo}</span>
                          <span className="block text-[9.5px] text-ink-400">{formatDate(expense.expenseDate)} · {expense.requestedByName}</span>
                        </TD>
                        <TD className="text-[11px] text-ink-600">{expense.categoryName}</TD>
                        <TD>
                          <span className="block max-w-[260px] truncate text-[11.5px] text-ink-700">{expense.description}</span>
                          {expense.rejectionReason && <span className="block text-[9.5px] text-brick-500">{expense.rejectionReason}</span>}
                        </TD>
                        <TD>
                          <Badge tone="info">{titleCase(expense.paymentMethod)}</Badge>
                        </TD>
                        <TD align="right" className="num font-semibold text-ink-900">{money(expense.amount)}</TD>
                        <TD align="right">
                          <Badge tone={statusTone(expense.status)} dot>{titleCase(expense.status)}</Badge>
                        </TD>
                        <TD align="right">
                          <div className="flex items-center justify-end gap-1">
                            {expense.status === 'PENDING' && has('expense.approve') && (
                              <>
                                <Button size="sm" loading={approveMutation.isPending} onClick={() => approveMutation.mutate(expense.id)}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setRejecting(expense)}>
                                  Reject
                                </Button>
                              </>
                            )}
                            {expense.journalEntryId && (
                              <span className="font-mono text-[9px] text-ink-400">J#{expense.journalEntryId}</span>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={page}
                  totalPages={expensesQuery.data?.totalPages ?? 0}
                  totalElements={expensesQuery.data?.totalElements ?? 0}
                  onChange={setPage}
                />
              </>
            )}
          </div>
        )}

        {tab === 'categories' && (
          <div className="border-t border-line-soft">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Each category maps to an account of type <span className="font-semibold text-ink-600">EXPENSE</span>.
              </p>
              {has('expense.manage') && (
                <Button
                  size="sm"
                  onClick={() => {
                    setCategoryEdit(null)
                    setCategoryForm({ name: '', accountId: expenseAccounts[0]?.id ?? 0, active: true })
                    setCategoryOpen(true)
                  }}
                >
                  <Plus size={12} /> New category
                </Button>
              )}
            </div>
            {categoriesQuery.isLoading ? (
              <LoadingBlock />
            ) : categories.length === 0 ? (
              <EmptyState icon={Tags} title="No expense categories" description="Map rent, salaries and utilities to ledger accounts." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Category</TH>
                    <TH>Ledger account</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </THead>
                <tbody>
                  {categories.map((category) => (
                    <TR key={category.id}>
                      <TD className="font-semibold text-ink-800">{category.name}</TD>
                      <TD className="font-mono text-[10.5px] text-ink-500">{category.accountCode} · {category.accountName}</TD>
                      <TD align="right">
                        <Badge tone={category.active ? 'success' : 'danger'}>{category.active ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD align="right">
                        {has('expense.manage') && (
                          <IconButton
                            label="Edit category"
                            onClick={() => {
                              setCategoryEdit(category)
                              setCategoryForm({ name: category.name, accountId: category.accountId, active: category.active })
                              setCategoryOpen(true)
                            }}
                          >
                            <Pencil size={14} />
                          </IconButton>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New expense"
        description={
          has('expense.approve')
            ? 'You can approve expenses, so this posts immediately with its journal.'
            : 'This will be submitted for approval. No journal posts until a manager approves it.'
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={createMutation.isPending}
              disabled={!form.categoryId || !form.amount || Number(form.amount) <= 0 || !form.description.trim()}
              onClick={() => createMutation.mutate()}
            >
              {has('expense.approve') ? 'Post expense' : 'Submit for approval'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <Select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: Number(event.target.value) })}>
                <option value={0}>Select a category…</option>
                {categories.filter((category) => category.active).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Expense date" required>
              <Input type="date" value={form.expenseDate} onChange={(event) => setForm({ ...form, expenseDate: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input type="number" min={0.01} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Payment method" required>
              <Select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{titleCase(method)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" required>
            <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="November shop electricity" />
          </Field>
          <Field label="Attachment URL" hint="Optional">
            <Input value={form.attachmentUrl} onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Internal context for the approver…" />
          </Field>
          {form.paymentMethod === 'CASH' && (
            <p className="rounded-lg border border-line-soft bg-ivory-100/60 px-3 py-2 text-[10.5px] leading-4 text-ink-500">
              Cash expenses are linked to your open cash session so the closing count reconciles.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={categoryEdit ? 'Edit expense category' : 'New expense category'}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={categoryMutation.isPending}
              disabled={!categoryForm.name.trim() || !categoryForm.accountId}
              onClick={() => categoryMutation.mutate()}
            >
              Save category
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Category name" required>
            <Input value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Shop rent" />
          </Field>
          <Field label="Expense account" required hint="Only EXPENSE accounts are listed">
            <Select value={categoryForm.accountId} onChange={(event) => setCategoryForm({ ...categoryForm, accountId: Number(event.target.value) })}>
              <option value={0}>Select an account…</option>
              {expenseAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
              ))}
            </Select>
          </Field>
          <Checkbox label="Active" checked={categoryForm.active} onChange={(event) => setCategoryForm({ ...categoryForm, active: event.target.checked })} />
        </div>
      </Modal>

      <Modal
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title="Reject expense"
        description={rejecting ? `${rejecting.expenseNo} · ${money(rejecting.amount)}` : undefined}
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
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Missing bill, wrong category…" />
        </Field>
      </Modal>
    </div>
  )
}
