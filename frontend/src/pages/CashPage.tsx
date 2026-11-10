import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wallet
} from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime, money, statusTone, titleCase, todayISO } from '../lib/format'
import type { CashSession, DailyClosing } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
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

export function CashPage() {
  const { branchId, has } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [openOpen, setOpenOpen] = useState(false)
  const [movementOpen, setMovementOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [openForm, setOpenForm] = useState({ openingBalance: '', notes: '' })
  const [movementForm, setMovementForm] = useState({ type: 'DEPOSIT', amount: '', reference: '', notes: '' })
  const [closeForm, setCloseForm] = useState({ actualClosing: '', discrepancyReason: '', notes: '' })
  const [closingDate, setClosingDate] = useState(todayISO())

  const currentQuery = useQuery({
    queryKey: ['cash-current', branchId],
    queryFn: () => api<CashSession | undefined>(`/api/cash/sessions/current?branchId=${branchId}`),
    enabled: branchId != null
  })

  const sessionsQuery = useQuery({
    queryKey: ['cash-sessions', branchId],
    queryFn: () => api<CashSession[]>(`/api/cash/sessions${qs({ branchId })}`),
    enabled: branchId != null && has('cash.view')
  })

  const closingQuery = useQuery({
    queryKey: ['cash-closing', branchId, closingDate],
    queryFn: () =>
      api<DailyClosing>(`/api/cash/daily-closing${qs({ branchId, date: closingDate })}`),
    enabled: branchId != null && has('cash.view', 'report.view')
  })

  const current = currentQuery.data ?? null
  const expected = Number(current?.expectedClosing ?? 0)
  const counted = Number(closeForm.actualClosing || 0)
  const difference = counted - expected

  useEffect(() => {
    if (current && !closeOpen) {
      setCloseForm((form) => ({ ...form, actualClosing: String(current.expectedClosing) }))
    }
  }, [current, closeOpen])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cash-current'] })
    queryClient.invalidateQueries({ queryKey: ['cash-sessions'] })
    queryClient.invalidateQueries({ queryKey: ['cash-closing'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const openMutation = useMutation({
    mutationFn: () =>
      api<CashSession>('/api/cash/sessions', {
        method: 'POST',
        body: { branchId, openingBalance: Number(openForm.openingBalance || 0), notes: openForm.notes.trim() || null }
      }),
    onSuccess: (session) => {
      toast.push('Cash session opened', {
        description: `Opening float ${money(session.openingBalance)}`,
        tone: 'success'
      })
      setOpenOpen(false)
      setOpenForm({ openingBalance: '', notes: '' })
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not open session', { description: error.message, tone: 'error' })
  })

  const movementMutation = useMutation({
    mutationFn: () =>
      api<CashSession>(`/api/cash/sessions/${current!.id}/movements`, {
        method: 'POST',
        body: {
          type: movementForm.type,
          amount: Number(movementForm.amount),
          reference: movementForm.reference.trim() || null,
          notes: movementForm.notes.trim() || null
        }
      }),
    onSuccess: (session) => {
      toast.push(movementForm.type === 'DEPOSIT' ? 'Cash deposited' : 'Cash withdrawn', {
        description: `Session expected closing ${money(session.expectedClosing)}`,
        tone: 'success'
      })
      setMovementOpen(false)
      setMovementForm({ type: 'DEPOSIT', amount: '', reference: '', notes: '' })
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not record movement', { description: error.message, tone: 'error' })
  })

  const closeMutation = useMutation({
    mutationFn: () =>
      api<CashSession>(`/api/cash/sessions/${current!.id}/close`, {
        method: 'POST',
        body: {
          actualClosing: Number(closeForm.actualClosing),
          discrepancyReason: closeForm.discrepancyReason.trim() || null,
          notes: closeForm.notes.trim() || null
        }
      }),
    onSuccess: (session) => {
      toast.push(
        session.status === 'PENDING_APPROVAL' ? 'Session closed — awaiting approval' : 'Cash session closed',
        {
          description:
            session.status === 'PENDING_APPROVAL'
              ? `Difference ${money(session.difference)} needs a manager's approval.`
              : `Difference ${money(session.difference)} posted to cash over/short.`,
          tone: session.status === 'PENDING_APPROVAL' ? 'warning' : 'success'
        }
      )
      setCloseOpen(false)
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not close session', { description: error.message, tone: 'error' })
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api<CashSession>(`/api/cash/sessions/${id}/approve`, { method: 'POST', body: {} }),
    onSuccess: (session) => {
      toast.push('Cash discrepancy approved', {
        description: `${session.branchName} · difference ${money(session.difference)}`,
        tone: 'success'
      })
      invalidate()
    },
    onError: (error: Error) => toast.push('Could not approve session', { description: error.message, tone: 'error' })
  })

  if (branchId == null) return <LoadingBlock label="Choose a branch…" />

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="The drawer · cash register"
        title="Count it, close it, account for it"
        description="A cash session tracks the opening float, cash receipts, refunds, expenses, deposits and withdrawals. The expected closing is computed; the difference is posted, never ignored."
        actions={
          <>
            <Button variant="secondary" onClick={() => { currentQuery.refetch(); sessionsQuery.refetch(); closingQuery.refetch() }} loading={currentQuery.isFetching}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {!current && has('cash.open') && (
              <Button onClick={() => setOpenOpen(true)}>
                <Plus size={14} /> Open session
              </Button>
            )}
            {current && has('cash.open') && (
              <Button variant="dark" onClick={() => setMovementOpen(true)}>
                <Banknote size={14} /> Deposit / withdraw
              </Button>
            )}
            {current && has('cash.close') && (
              <Button variant="secondary" onClick={() => setCloseOpen(true)}>
                <LockKeyhole size={14} /> Close session
              </Button>
            )}
          </>
        }
      />

      {currentQuery.isLoading ? (
        <LoadingBlock label="Checking the drawer…" />
      ) : current ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(current.status)} dot>{titleCase(current.status)}</Badge>
                <span className="text-[10px] text-ink-400">Session #{current.id}</span>
              </div>
              <p className="mt-1.5 font-display text-xl font-semibold text-ink-900">
                {current.cashierName} · {current.branchName}
              </p>
              <p className="mt-0.5 text-[10.5px] text-ink-400">Opened {formatDateTime(current.openedAt)}</p>
            </div>
            <div className="text-right">
              <p className="label-xs text-ink-400">Expected closing</p>
              <p className="num mt-1 text-[26px] font-semibold leading-none text-ink-900">{money(current.expectedClosing)}</p>
            </div>
          </div>

          <div className="grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Opening float', current.openingBalance, 'neutral'],
              ['Cash receipts', current.cashSales, 'success'],
              ['Refunds', current.cashRefunds, 'danger'],
              ['Cash expenses', current.cashExpenses, 'danger'],
              ['Deposits', current.deposits, 'success'],
              ['Withdrawals', current.withdrawals, 'warning'],
              ['Actual counted', current.actualClosing ?? 0, 'neutral'],
              ['Difference', current.difference ?? 0, (current.difference ?? 0) === 0 ? 'success' : 'danger']
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="bg-ivory-50 px-5 py-4">
                <p className="label-xs text-ink-400">{label}</p>
                <p
                  className={`num mt-1.5 text-[17px] font-semibold ${
                    tone === 'success' ? 'text-sage-600' : tone === 'danger' ? 'text-brick-500' : 'text-ink-900'
                  }`}
                >
                  {money(value as number)}
                </p>
              </div>
            ))}
          </div>

          <div className="px-5 py-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Session movements</p>
            {current.movements.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-[11px] text-ink-400">
                No manual deposits or withdrawals yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {current.movements.map((movement) => (
                  <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-soft bg-ivory-100/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${movement.type === 'DEPOSIT' ? 'bg-sage-100 text-sage-600' : 'bg-saffron-100 text-saffron-500'}`}>
                        {movement.type === 'DEPOSIT' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                      </span>
                      <div>
                        <p className="text-[11.5px] font-semibold text-ink-800">{titleCase(movement.type)}</p>
                        <p className="text-[9.5px] text-ink-400">{movement.reference ?? movement.notes ?? '—'} · {formatDateTime(movement.createdAt)}</p>
                      </div>
                    </div>
                    <p className={`num text-[12px] font-semibold ${movement.type === 'DEPOSIT' ? 'text-sage-600' : 'text-saffron-500'}`}>
                      {movement.type === 'DEPOSIT' ? '+' : '−'}{money(movement.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Wallet}
            title="The drawer is closed"
            description="Open a cash session with the opening float to start recording cash sales, expenses and movements for this branch."
            action={has('cash.open') ? <Button size="sm" onClick={() => setOpenOpen(true)}>Open cash session</Button> : undefined}
          />
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Daily closing"
          description="Payments by method, refunds and cash expenses for the selected day."
          action={<Input type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} className="w-40" />}
        >
          {!has('cash.view', 'report.view') ? (
            <EmptyState icon={LockKeyhole} title="Daily closing needs cash view access" />
          ) : closingQuery.isLoading ? (
            <LoadingBlock label="Tallying the day…" />
          ) : !closingQuery.data ? (
            <EmptyState icon={Clock3} title="No closing data" />
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-ink-900 px-4 py-3.5 text-ivory-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ivory-400">Net cash movement</p>
                    <p className="num mt-1 text-[24px] font-semibold leading-none">{money(closingQuery.data.netCash)}</p>
                  </div>
                  <Badge tone="accent">{closingQuery.data.invoiceCount} bills</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  ['Sales total', closingQuery.data.salesTotal],
                  ['Cash', closingQuery.data.cashSales],
                  ['Card', closingQuery.data.cardSales],
                  ['UPI', closingQuery.data.upiSales],
                  ['Bank', closingQuery.data.bankSales],
                  ['Credit', closingQuery.data.creditSales],
                  ['Refunds', closingQuery.data.refunds],
                  ['Expenses', closingQuery.data.expenses]
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-lg border border-line-soft px-3 py-2">
                    <span className="text-ink-500">{label}</span>
                    <span className="num font-semibold text-ink-800">{money(value as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Session history" description="Closed sessions and their counted differences." bodyClassName="p-0">
          {!has('cash.view') ? (
            <EmptyState icon={LockKeyhole} title="Session history needs cash view access" />
          ) : sessionsQuery.isLoading ? (
            <LoadingBlock label="Reading sessions…" />
          ) : (sessionsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState icon={Clock3} title="No sessions yet" description="Open the first session to start the day." />
          ) : (
            <div className="divide-y divide-line-soft">
              {sessionsQuery.data!.map((session) => (
                <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11.5px] font-semibold text-ink-800">{formatDate(session.openedAt.slice(0, 10))}</span>
                      <Badge tone={statusTone(session.status)}>{titleCase(session.status)}</Badge>
                    </div>
                    <p className="mt-0.5 text-[9.5px] text-ink-400">
                      {session.cashierName} · expected {money(session.expectedClosing)}
                      {session.actualClosing != null ? ` · counted ${money(session.actualClosing)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.difference != null && Number(session.difference) !== 0 && (
                      <span className={`num text-[11px] font-semibold ${Number(session.difference) < 0 ? 'text-brick-500' : 'text-saffron-500'}`}>
                        {money(session.difference)}
                      </span>
                    )}
                    {session.status === 'PENDING_APPROVAL' && has('cash.approve') && (
                      <Button size="sm" loading={approveMutation.isPending} onClick={() => approveMutation.mutate(session.id)}>
                        <ShieldCheck size={12} /> Approve
                      </Button>
                    )}
                    {session.status === 'CLOSED' && Number(session.difference ?? 0) === 0 && (
                      <CheckCircle2 size={15} className="text-sage-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Modal
        open={openOpen}
        onClose={() => setOpenOpen(false)}
        title="Open cash session"
        description="Count the opening float before the first sale. Only one open session per cashier and branch is allowed."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpenOpen(false)}>Cancel</Button>
            <Button size="sm" loading={openMutation.isPending} onClick={() => openMutation.mutate()}>
              Open drawer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Opening float" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={openForm.openingBalance}
              onChange={(event) => setOpenForm({ ...openForm, openingBalance: event.target.value })}
              placeholder="0.00"
              autoFocus
            />
          </Field>
          <Field label="Notes">
            <Textarea value={openForm.notes} onChange={(event) => setOpenForm({ ...openForm, notes: event.target.value })} placeholder="Morning shift handover…" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        title="Cash deposit or withdrawal"
        description="Manual movements post to owner equity and adjust the expected closing."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMovementOpen(false)}>Cancel</Button>
            <Button size="sm" loading={movementMutation.isPending} disabled={!movementForm.amount || Number(movementForm.amount) <= 0} onClick={() => movementMutation.mutate()}>
              Record movement
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Movement type" required>
            <Select value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}>
              <option value="DEPOSIT">Deposit into drawer</option>
              <option value="WITHDRAWAL">Withdrawal from drawer</option>
            </Select>
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={movementForm.amount}
              onChange={(event) => setMovementForm({ ...movementForm, amount: event.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Reference">
            <Input value={movementForm.reference} onChange={(event) => setMovementForm({ ...movementForm, reference: event.target.value })} placeholder="Bank slip, cheque no…" />
          </Field>
          <Field label="Notes">
            <Textarea value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close cash session"
        description="Count the drawer and enter the actual closing amount. Any difference needs a reason and may need approval."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={closeMutation.isPending}
              disabled={closeForm.actualClosing === '' || (difference !== 0 && !closeForm.discrepancyReason.trim())}
              onClick={() => closeMutation.mutate()}
            >
              Close session
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Expected closing</p>
              <p className="num mt-1 text-[17px] font-semibold text-ink-900">{money(expected)}</p>
            </div>
            <div className={`rounded-xl border px-3 py-2.5 ${difference === 0 ? 'border-sage-200 bg-sage-100/50' : 'border-brick-300/50 bg-brick-100/40'}`}>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Difference</p>
              <p className={`num mt-1 text-[17px] font-semibold ${difference === 0 ? 'text-sage-600' : 'text-brick-500'}`}>
                {money(difference)}
              </p>
            </div>
          </div>
          <Field label="Actual cash counted" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={closeForm.actualClosing}
              onChange={(event) => setCloseForm({ ...closeForm, actualClosing: event.target.value })}
              autoFocus
            />
          </Field>
          {difference !== 0 && (
            <Field label="Discrepancy reason" required>
              <Textarea
                value={closeForm.discrepancyReason}
                onChange={(event) => setCloseForm({ ...closeForm, discrepancyReason: event.target.value })}
                placeholder="Short by ₹50 — change given without bill, counted twice…"
              />
            </Field>
          )}
          <Field label="Closing notes">
            <Textarea value={closeForm.notes} onChange={(event) => setCloseForm({ ...closeForm, notes: event.target.value })} />
          </Field>
          {difference !== 0 && !has('cash.approve') && (
            <p className="rounded-lg border border-saffron-200 bg-saffron-100/60 px-3 py-2 text-[10.5px] leading-4 text-saffron-500">
              You do not hold cash approval. The session will be submitted as pending approval and the over/short journal will
              post once a manager approves it.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
