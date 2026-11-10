import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  LockKeyhole,
  Plus,
  RefreshCw,
  Scale,
  ScrollText,
  Trash2,
  TrendingUp,
  UnlockKeyhole,
  Wallet
} from 'lucide-react'
import { api, downloadFile, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatDateTime, money, monthStartISO, statusTone, titleCase, todayISO } from '../lib/format'
import type {
  Account,
  AccountLedger,
  BalanceSheet,
  FinancialPeriod,
  GstSummary,
  Journal,
  ProfitLoss,
  TrialBalance
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

type Tab = 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'gst' | 'day-book' | 'accounts' | 'periods'

interface JournalFormLine {
  accountId: number
  debit: string
  credit: string
  description: string
}

const emptyJournalLine = (): JournalFormLine => ({ accountId: 0, debit: '', credit: '', description: '' })

const emptyAccountForm = () => ({
  code: '',
  name: '',
  type: 'EXPENSE',
  subtype: '',
  parentId: 0,
  cashBank: false
})

const emptyPeriodForm = () => ({
  name: '',
  startDate: `${new Date().getFullYear()}-04-01`,
  endDate: `${new Date().getFullYear() + 1}-03-31`,
  notes: ''
})

const accountTypes = [
  ['ASSET', 'Asset'],
  ['LIABILITY', 'Liability'],
  ['EQUITY', 'Equity'],
  ['INCOME', 'Income'],
  ['EXPENSE', 'Expense']
]

const reportTabs: { id: Tab; label: string; permissions: string[] }[] = [
  { id: 'trial-balance', label: 'Trial balance', permissions: ['accounting.view', 'report.view'] },
  { id: 'profit-loss', label: 'Profit & loss', permissions: ['report.view'] },
  { id: 'balance-sheet', label: 'Balance sheet', permissions: ['report.view'] },
  { id: 'gst', label: 'GST summary', permissions: ['report.view'] },
  { id: 'day-book', label: 'Day book', permissions: ['accounting.view', 'report.view'] },
  { id: 'accounts', label: 'Chart of accounts', permissions: ['accounting.view'] },
  { id: 'periods', label: 'Financial periods', permissions: ['accounting.view'] }
]

export function AccountingPage() {
  const { branchId, has, hasAny } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('trial-balance')
  const [branchFilter, setBranchFilter] = useState(0)
  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo] = useState(todayISO())
  const [asOf, setAsOf] = useState(todayISO())
  const [includeInactive, setIncludeInactive] = useState(false)

  const [journalDetail, setJournalDetail] = useState<Journal | null>(null)
  const [ledgerAccount, setLedgerAccount] = useState<Account | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [journalForm, setJournalForm] = useState({
    entryDate: todayISO(),
    description: '',
    reference: '',
    lines: [emptyJournalLine(), emptyJournalLine()]
  })
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountForm, setAccountForm] = useState(emptyAccountForm())
  const [periodOpen, setPeriodOpen] = useState(false)
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm())
  const [reopenPeriod, setReopenPeriod] = useState<FinancialPeriod | null>(null)
  const [reopenReason, setReopenReason] = useState('')

  const canSeeTab = (item: (typeof reportTabs)[number]) => hasAny(...item.permissions)
  const visibleTabs = reportTabs.filter(canSeeTab)

  const trialQuery = useQuery({
    queryKey: ['trial-balance', branchFilter, from, to],
    queryFn: () =>
      api<TrialBalance>(`/api/accounting/trial-balance${qs({ branchId: branchFilter || undefined, from, to })}`),
    enabled: tab === 'trial-balance'
  })

  const profitLossQuery = useQuery({
    queryKey: ['profit-loss', branchFilter, from, to],
    queryFn: () =>
      api<ProfitLoss>(`/api/accounting/profit-loss${qs({ branchId: branchFilter || undefined, from, to })}`),
    enabled: tab === 'profit-loss'
  })

  const balanceSheetQuery = useQuery({
    queryKey: ['balance-sheet', branchFilter, asOf],
    queryFn: () =>
      api<BalanceSheet>(`/api/accounting/balance-sheet${qs({ branchId: branchFilter || undefined, asOf })}`),
    enabled: tab === 'balance-sheet'
  })

  const gstQuery = useQuery({
    queryKey: ['gst-summary', branchFilter, from, to],
    queryFn: () =>
      api<GstSummary>(`/api/accounting/gst-summary${qs({ branchId: branchFilter || undefined, from, to })}`),
    enabled: tab === 'gst'
  })

  const dayBookQuery = useQuery({
    queryKey: ['day-book', branchFilter, from, to],
    queryFn: () =>
      api<{ from: string; to: string; entries: Journal[] }>(
        `/api/accounting/day-book${qs({ branchId: branchFilter || undefined, from, to })}`
      ),
    enabled: tab === 'day-book'
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts', includeInactive],
    queryFn: () => api<Account[]>(`/api/accounting/accounts${qs({ includeInactive })}`),
    enabled: tab === 'accounts' || manualOpen || accountOpen || ledgerAccount != null
  })

  const periodsQuery = useQuery({
    queryKey: ['financial-periods'],
    queryFn: () => api<FinancialPeriod[]>('/api/accounting/periods'),
    enabled: tab === 'periods'
  })

  const ledgerQuery = useQuery({
    queryKey: ['account-ledger', ledgerAccount?.id, branchFilter, from, to],
    queryFn: () =>
      api<AccountLedger>(
        `/api/accounting/accounts/${ledgerAccount!.id}/ledger${qs({ branchId: branchFilter || undefined, from, to })}`
      ),
    enabled: ledgerAccount != null
  })

  const accounts = accountsQuery.data ?? []
  const activeAccounts = accounts.filter((account) => account.active)
  const trial = trialQuery.data
  const profitLoss = profitLossQuery.data
  const balanceSheet = balanceSheetQuery.data
  const gst = gstQuery.data
  const dayBook = dayBookQuery.data?.entries ?? []
  const periods = periodsQuery.data ?? []

  const openPeriods = periods.filter((period) => period.status === 'OPEN').length
  const dayBookDebit = dayBook.reduce(
    (sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + Number(line.debit || 0), 0),
    0
  )

  const validJournalLines = journalForm.lines.filter(
    (line) => line.accountId > 0 && (Number(line.debit) > 0 || Number(line.credit) > 0)
  )
  const journalDebit = validJournalLines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
  const journalCredit = validJournalLines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
  const journalBalanced = validJournalLines.length >= 2 && journalDebit > 0 && Math.abs(journalDebit - journalCredit) < 0.005

  const invalidateAccounting = () => {
    queryClient.invalidateQueries({ queryKey: ['trial-balance'] })
    queryClient.invalidateQueries({ queryKey: ['profit-loss'] })
    queryClient.invalidateQueries({ queryKey: ['balance-sheet'] })
    queryClient.invalidateQueries({ queryKey: ['gst-summary'] })
    queryClient.invalidateQueries({ queryKey: ['day-book'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['financial-periods'] })
    queryClient.invalidateQueries({ queryKey: ['account-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const manualMutation = useMutation({
    mutationFn: () =>
      api<Journal>('/api/accounting/journals', {
        method: 'POST',
        body: {
          branchId,
          entryDate: journalForm.entryDate,
          description: journalForm.description.trim(),
          reference: journalForm.reference.trim() || null,
          lines: validJournalLines.map((line) => ({
            accountId: line.accountId,
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            description: line.description.trim() || null
          }))
        }
      }),
    onSuccess: (journal) => {
      toast.push('Journal posted', {
        description: `${journal.entryNo} · ${money(journalDebit)} debited and credited`,
        tone: 'success'
      })
      setManualOpen(false)
      setJournalForm({ entryDate: todayISO(), description: '', reference: '', lines: [emptyJournalLine(), emptyJournalLine()] })
      invalidateAccounting()
    },
    onError: (error: Error) => toast.push('Could not post journal', { description: error.message, tone: 'error' })
  })

  const accountMutation = useMutation({
    mutationFn: () =>
      api<Account>('/api/accounting/accounts', {
        method: 'POST',
        body: {
          code: accountForm.code.trim().toUpperCase(),
          name: accountForm.name.trim(),
          type: accountForm.type,
          subtype: accountForm.subtype.trim() || null,
          parentId: accountForm.parentId || null,
          cashBank: accountForm.cashBank
        }
      }),
    onSuccess: (account) => {
      toast.push('Account created', { description: `${account.code} · ${account.name}`, tone: 'success' })
      setAccountOpen(false)
      setAccountForm(emptyAccountForm())
      invalidateAccounting()
    },
    onError: (error: Error) => toast.push('Could not create account', { description: error.message, tone: 'error' })
  })

  const periodMutation = useMutation({
    mutationFn: () =>
      api<FinancialPeriod>('/api/accounting/periods', {
        method: 'POST',
        body: {
          name: periodForm.name.trim(),
          startDate: periodForm.startDate,
          endDate: periodForm.endDate,
          notes: periodForm.notes.trim() || null
        }
      }),
    onSuccess: (period) => {
      toast.push('Financial period created', {
        description: `${period.name} · ${formatDate(period.startDate)} to ${formatDate(period.endDate)}`,
        tone: 'success'
      })
      setPeriodOpen(false)
      setPeriodForm(emptyPeriodForm())
      invalidateAccounting()
    },
    onError: (error: Error) => toast.push('Could not create period', { description: error.message, tone: 'error' })
  })

  const closePeriodMutation = useMutation({
    mutationFn: (id: number) => api<FinancialPeriod>(`/api/accounting/periods/${id}/close`, { method: 'POST' }),
    onSuccess: (period) => {
      toast.push('Period closed', {
        description: `${period.name} is locked against new postings.`,
        tone: 'success'
      })
      invalidateAccounting()
    },
    onError: (error: Error) => toast.push('Could not close period', { description: error.message, tone: 'error' })
  })

  const reopenPeriodMutation = useMutation({
    mutationFn: () =>
      api<FinancialPeriod>(`/api/accounting/periods/${reopenPeriod!.id}/reopen`, {
        method: 'POST',
        body: { reason: reopenReason.trim() }
      }),
    onSuccess: (period) => {
      toast.push('Period reopened', { description: `${period.name} accepts postings again.`, tone: 'info' })
      setReopenPeriod(null)
      setReopenReason('')
      invalidateAccounting()
    },
    onError: (error: Error) => toast.push('Could not reopen period', { description: error.message, tone: 'error' })
  })

  const exportReport = async (format: 'pdf' | 'xlsx') => {
    const bases: Partial<Record<Tab, string>> = {
      'trial-balance': '/api/accounting/trial-balance/export',
      'profit-loss': '/api/accounting/profit-loss/export',
      'balance-sheet': '/api/accounting/balance-sheet/export',
      gst: '/api/accounting/gst-summary/export',
      'day-book': '/api/accounting/day-book/export'
    }
    const base = bases[tab]
    if (!base) return
    try {
      const params =
        tab === 'balance-sheet'
          ? qs({ branchId: branchFilter || undefined, asOf, format })
          : qs({ branchId: branchFilter || undefined, from, to, format })
      await downloadFile(`${base}${params}`, `${tab}.${format}`)
      toast.push(`${format === 'pdf' ? 'PDF' : 'Excel'} export ready`, {
        description: 'The report downloaded with the selected branch and dates.',
        tone: 'success'
      })
    } catch (error) {
      toast.push('Export failed', { description: (error as Error).message, tone: 'error' })
    }
  }

  const exportLedger = async (format: 'pdf' | 'xlsx') => {
    if (!ledgerAccount) return
    try {
      await downloadFile(
        `/api/accounting/accounts/${ledgerAccount.id}/ledger/export${qs({
          branchId: branchFilter || undefined,
          from,
          to,
          format
        })}`,
        `ledger-${ledgerAccount.code}.${format}`
      )
      toast.push('Ledger exported', { description: `${ledgerAccount.code} · ${format.toUpperCase()}`, tone: 'success' })
    } catch (error) {
      toast.push('Export failed', { description: (error as Error).message, tone: 'error' })
    }
  }

  const openManual = () => {
    setJournalForm({
      entryDate: todayISO(),
      description: '',
      reference: '',
      lines: [emptyJournalLine(), emptyJournalLine()]
    })
    setManualOpen(true)
  }

  const summary = useMemo(() => {
    switch (tab) {
      case 'trial-balance':
        return [
          { label: 'Total debits', value: money(trial?.totalDebit ?? 0), hint: 'Across posted journals', icon: Scale, tone: 'accent' as const },
          { label: 'Total credits', value: money(trial?.totalCredit ?? 0), hint: 'Must equal debits', icon: Scale, tone: 'info' as const },
          {
            label: 'Balance check',
            value: trial?.balanced ? 'Balanced' : 'Out',
            hint: trial ? `${trial.rows.length} accounts with movement` : 'Waiting for the ledger',
            icon: trial?.balanced ? CheckCircle2 : LockKeyhole,
            tone: trial?.balanced ? ('success' as const) : ('danger' as const)
          },
          { label: 'Period', value: `${formatDate(from)} — ${formatDate(to)}`, hint: 'Report window', icon: CalendarRange, tone: 'neutral' as const }
        ]
      case 'profit-loss':
        return [
          { label: 'Income', value: money(profitLoss?.totalIncome ?? 0), hint: 'Sales less returns and discounts', icon: TrendingUp, tone: 'success' as const },
          { label: 'Expenses', value: money(profitLoss?.totalExpenses ?? 0), hint: 'Cost of goods plus overheads', icon: Wallet, tone: 'warning' as const },
          {
            label: 'Net profit',
            value: money(profitLoss?.netProfit ?? 0),
            hint: Number(profitLoss?.netProfit ?? 0) >= 0 ? 'Profit for the period' : 'Loss for the period',
            icon: Scale,
            tone: Number(profitLoss?.netProfit ?? 0) >= 0 ? ('success' as const) : ('danger' as const)
          },
          { label: 'Margin', value: `${profitLoss && Number(profitLoss.totalIncome) > 0 ? ((Number(profitLoss.netProfit) / Number(profitLoss.totalIncome)) * 100).toFixed(1) : '0.0'}%`, hint: 'Net profit over income', icon: TrendingUp, tone: 'info' as const }
        ]
      case 'balance-sheet':
        return [
          { label: 'Total assets', value: money(balanceSheet?.totalAssets ?? 0), hint: 'As of the selected date', icon: Landmark, tone: 'accent' as const },
          { label: 'Liabilities', value: money(balanceSheet?.totalLiabilities ?? 0), hint: 'Payables, GST and advances', icon: Wallet, tone: 'warning' as const },
          {
            label: 'Equity',
            value: money(Number(balanceSheet?.totalEquity ?? 0) + Number(balanceSheet?.currentEarnings ?? 0)),
            hint: 'Including current earnings',
            icon: BookOpen,
            tone: 'info' as const
          },
          {
            label: 'Difference',
            value: money(balanceSheet?.difference ?? 0),
            hint: Number(balanceSheet?.difference ?? 0) === 0 ? 'Assets equal liabilities plus equity' : 'Investigate the imbalance',
            icon: Scale,
            tone: Number(balanceSheet?.difference ?? 0) === 0 ? ('success' as const) : ('danger' as const)
          }
        ]
      case 'gst':
        return [
          { label: 'Output tax', value: money(gst?.outputTax ?? 0), hint: 'Collected on sales', icon: TrendingUp, tone: 'accent' as const },
          { label: 'Input tax', value: money(gst?.inputTax ?? 0), hint: 'Paid on purchases', icon: Wallet, tone: 'info' as const },
          {
            label: 'Net payable',
            value: money(gst?.netPayable ?? 0),
            hint: Number(gst?.netPayable ?? 0) >= 0 ? 'Due to the tax authority' : 'Input credit carried forward',
            icon: Scale,
            tone: Number(gst?.netPayable ?? 0) >= 0 ? ('warning' as const) : ('success' as const)
          },
          { label: 'Rates in use', value: `${gst?.salesByRate.length ?? 0} / ${gst?.purchasesByRate.length ?? 0}`, hint: 'Sales / purchase slabs', icon: FileSpreadsheet, tone: 'neutral' as const }
        ]
      case 'day-book':
        return [
          { label: 'Journal entries', value: dayBook.length, hint: 'Posted in this window', icon: ScrollText, tone: 'accent' as const },
          { label: 'Total posted', value: money(dayBookDebit), hint: 'Debit value of all entries', icon: Scale, tone: 'info' as const },
          { label: 'Branches', value: new Set(dayBook.map((entry) => entry.branchName)).size, hint: 'Represented in the day book', icon: Landmark, tone: 'neutral' as const },
          { label: 'Period', value: `${formatDate(from)} — ${formatDate(to)}`, hint: 'Report window', icon: CalendarRange, tone: 'neutral' as const }
        ]
      case 'accounts':
        return [
          { label: 'Accounts', value: accounts.length, hint: `${activeAccounts.length} active`, icon: BookOpen, tone: 'accent' as const },
          { label: 'Assets', value: accounts.filter((account) => account.type === 'ASSET').length, hint: 'Cash, bank, receivables, stock', icon: Landmark, tone: 'success' as const },
          { label: 'Income & expense', value: accounts.filter((account) => account.type === 'INCOME' || account.type === 'EXPENSE').length, hint: 'Profit and loss accounts', icon: TrendingUp, tone: 'info' as const },
          { label: 'System accounts', value: accounts.filter((account) => account.systemAccount).length, hint: 'Protected from deletion', icon: LockKeyhole, tone: 'neutral' as const }
        ]
      case 'periods':
        return [
          { label: 'Periods', value: periods.length, hint: 'Defined financial windows', icon: CalendarRange, tone: 'accent' as const },
          { label: 'Open', value: openPeriods, hint: 'Accepting journal entries', icon: UnlockKeyhole, tone: 'success' as const },
          { label: 'Closed', value: periods.length - openPeriods, hint: 'Locked to new postings', icon: LockKeyhole, tone: 'neutral' as const },
          { label: 'Latest', value: periods[0]?.name ?? '—', hint: periods[0] ? `${formatDate(periods[0].startDate)} — ${formatDate(periods[0].endDate)}` : 'No periods yet', icon: BookOpen, tone: 'info' as const }
        ]
    }
  }, [tab, trial, profitLoss, balanceSheet, gst, dayBook, dayBookDebit, accounts, activeAccounts.length, periods, openPeriods, from, to])

  if (!hasAny('accounting.view', 'report.view')) {
    return <EmptyState icon={LockKeyhole} title="Accounting needs ledger access" />
  }

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="The books · accounting"
        title="Every posting, balanced"
        description="A double-entry ledger built from real documents. Reports are computed from posted journals, and closed periods cannot be reopened without a recorded reason."
        actions={
          <>
            {has('report.export') && ['trial-balance', 'profit-loss', 'balance-sheet', 'gst', 'day-book'].includes(tab) && (
              <>
                <Button variant="secondary" onClick={() => exportReport('pdf')}>
                  <FileText size={14} /> PDF
                </Button>
                <Button variant="secondary" onClick={() => exportReport('xlsx')}>
                  <FileSpreadsheet size={14} /> Excel
                </Button>
              </>
            )}
            {tab === 'accounts' && has('accounting.manage') && (
              <Button onClick={() => { setAccountForm(emptyAccountForm()); setAccountOpen(true) }}>
                <Plus size={14} /> New account
              </Button>
            )}
            {tab === 'periods' && has('accounting.close') && (
              <Button onClick={() => { setPeriodForm(emptyPeriodForm()); setPeriodOpen(true) }}>
                <Plus size={14} /> New period
              </Button>
            )}
            {has('accounting.manage') && tab !== 'accounts' && tab !== 'periods' && (
              <Button onClick={openManual}>
                <Plus size={14} /> Manual journal
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} icon={item.icon} tone={item.tone} />
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            className="border-0"
            value={tab}
            onChange={(value) => setTab(value as Tab)}
            items={visibleTabs.map((item) => ({ id: item.id, label: item.label }))}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2 border-y border-line-soft bg-ivory-100/40 px-4 py-3">
          <Field label="Branch" className="w-52">
            <Select value={branchFilter} onChange={(event) => setBranchFilter(Number(event.target.value))}>
              <option value={0}>All branches</option>
              <option value={branchId ?? 0} disabled={branchId == null}>
                Current branch
              </option>
            </Select>
          </Field>
          {tab === 'balance-sheet' ? (
            <Field label="As of" className="w-40">
              <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            </Field>
          ) : tab !== 'accounts' && tab !== 'periods' ? (
            <>
              <Field label="From" className="w-40">
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </Field>
              <Field label="To" className="w-40">
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </Field>
            </>
          ) : tab === 'accounts' ? (
            <Checkbox
              className="mb-2.5"
              label="Include inactive accounts"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
          ) : null}
          <div className="mb-0.5 ml-auto flex items-center gap-2">
            {has('accounting.manage') && tab !== 'accounts' && tab !== 'periods' && (
              <Button variant="ghost" size="sm" onClick={openManual}>
                <Plus size={12} /> Journal
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                trialQuery.refetch()
                profitLossQuery.refetch()
                balanceSheetQuery.refetch()
                gstQuery.refetch()
                dayBookQuery.refetch()
                accountsQuery.refetch()
                periodsQuery.refetch()
              }}
              loading={
                trialQuery.isFetching ||
                profitLossQuery.isFetching ||
                balanceSheetQuery.isFetching ||
                gstQuery.isFetching ||
                dayBookQuery.isFetching
              }
            >
              <RefreshCw size={12} /> Refresh
            </Button>
          </div>
        </div>

        {tab === 'trial-balance' && (
          <div>
            {trialQuery.isLoading ? (
              <LoadingBlock label="Balancing the ledger…" />
            ) : trialQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load the trial balance" description={(trialQuery.error as Error).message} />
            ) : !trial || trial.rows.length === 0 ? (
              <EmptyState icon={Scale} title="No postings in this window" description="Post a sale, purchase, expense or manual journal to see account balances." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Account</TH>
                    <TH>Type</TH>
                    <TH align="right">Debit</TH>
                    <TH align="right">Credit</TH>
                    <TH align="right">Balance</TH>
                    <TH align="right">Ledger</TH>
                  </tr>
                </THead>
                <tbody>
                  {trial.rows.map((row) => (
                    <TR key={row.accountId}>
                      <TD className="font-mono text-[10.5px] text-ink-500">{row.code}</TD>
                      <TD className="text-[12px] font-semibold text-ink-800">{row.name}</TD>
                      <TD><Badge tone="info">{titleCase(row.type)}</Badge></TD>
                      <TD align="right" className="num text-[11px] text-ink-600">{money(row.debit)}</TD>
                      <TD align="right" className="num text-[11px] text-ink-600">{money(row.credit)}</TD>
                      <TD align="right" className={`num text-[11px] font-semibold ${Number(row.balance) < 0 ? 'text-brick-500' : 'text-ink-900'}`}>
                        {money(row.balance)}
                      </TD>
                      <TD align="right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setLedgerAccount({
                              id: row.accountId,
                              code: row.code,
                              name: row.name,
                              type: row.type,
                              systemAccount: false,
                              cashBank: false,
                              active: true
                            })
                          }
                        >
                          View
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot className="bg-ivory-100/70">
                  <tr>
                    <TD colSpan={3} className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Totals</TD>
                    <TD align="right" className="num text-[12px] font-bold text-ink-900">{money(trial.totalDebit)}</TD>
                    <TD align="right" className="num text-[12px] font-bold text-ink-900">{money(trial.totalCredit)}</TD>
                    <TD align="right" colSpan={2}>
                      <Badge tone={trial.balanced ? 'success' : 'danger'} dot>
                        {trial.balanced ? 'Balanced' : 'Out of balance'}
                      </Badge>
                    </TD>
                  </tr>
                </tfoot>
              </Table>
            )}
          </div>
        )}

        {tab === 'profit-loss' && (
          <div>
            {profitLossQuery.isLoading ? (
              <LoadingBlock label="Computing profit and loss…" />
            ) : profitLossQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load profit & loss" description={(profitLossQuery.error as Error).message} />
            ) : !profitLoss ? (
              <EmptyState icon={TrendingUp} title="No profit and loss data" />
            ) : (
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-line-soft">
                  <div className="border-b border-line-soft bg-ivory-100/60 px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Income</p>
                  </div>
                  <Table>
                    <THead>
                      <tr><TH>Code</TH><TH>Account</TH><TH align="right">Amount</TH></tr>
                    </THead>
                    <tbody>
                      {profitLoss.income.map((line) => (
                        <TR key={line.code}>
                          <TD className="font-mono text-[10px] text-ink-400">{line.code}</TD>
                          <TD className="text-[11.5px] text-ink-700">{line.name}</TD>
                          <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(line.amount)}</TD>
                        </TR>
                      ))}
                      {profitLoss.income.length === 0 && (
                        <TR><TD colSpan={3} className="py-6 text-center text-[11px] text-ink-400">No income posted.</TD></TR>
                      )}
                    </tbody>
                    <tfoot className="bg-ivory-100/70">
                      <tr>
                        <TD colSpan={2} className="text-[11px] font-bold text-ink-600">Total income</TD>
                        <TD align="right" className="num text-[12px] font-bold text-sage-600">{money(profitLoss.totalIncome)}</TD>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
                <div className="overflow-hidden rounded-xl border border-line-soft">
                  <div className="border-b border-line-soft bg-ivory-100/60 px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Expenses</p>
                  </div>
                  <Table>
                    <THead>
                      <tr><TH>Code</TH><TH>Account</TH><TH align="right">Amount</TH></tr>
                    </THead>
                    <tbody>
                      {profitLoss.expenses.map((line) => (
                        <TR key={line.code}>
                          <TD className="font-mono text-[10px] text-ink-400">{line.code}</TD>
                          <TD className="text-[11.5px] text-ink-700">{line.name}</TD>
                          <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(line.amount)}</TD>
                        </TR>
                      ))}
                      {profitLoss.expenses.length === 0 && (
                        <TR><TD colSpan={3} className="py-6 text-center text-[11px] text-ink-400">No expenses posted.</TD></TR>
                      )}
                    </tbody>
                    <tfoot className="bg-ivory-100/70">
                      <tr>
                        <TD colSpan={2} className="text-[11px] font-bold text-ink-600">Total expenses</TD>
                        <TD align="right" className="num text-[12px] font-bold text-brick-500">{money(profitLoss.totalExpenses)}</TD>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
                <div className="lg:col-span-2 rounded-xl bg-ink-900 px-5 py-4 text-ivory-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ivory-200/50">Net profit for the period</p>
                      <p className="mt-1 text-[11px] text-ivory-200/50">{formatDate(profitLoss.from)} — {formatDate(profitLoss.to)}</p>
                    </div>
                    <p className={`num text-[26px] font-semibold ${Number(profitLoss.netProfit) >= 0 ? 'text-saffron-300' : 'text-brick-300'}`}>
                      {money(profitLoss.netProfit)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'balance-sheet' && (
          <div>
            {balanceSheetQuery.isLoading ? (
              <LoadingBlock label="Reading the balance sheet…" />
            ) : balanceSheetQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load the balance sheet" description={(balanceSheetQuery.error as Error).message} />
            ) : !balanceSheet ? (
              <EmptyState icon={Landmark} title="No balance sheet data" />
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    ['Assets', balanceSheet.assets, balanceSheet.totalAssets, 'success'],
                    ['Liabilities', balanceSheet.liabilities, balanceSheet.totalLiabilities, 'warning'],
                    ['Equity', balanceSheet.equity, Number(balanceSheet.totalEquity) + Number(balanceSheet.currentEarnings), 'info']
                  ].map(([title, lines, total, tone]) => (
                    <div key={String(title)} className="overflow-hidden rounded-xl border border-line-soft">
                      <div className="border-b border-line-soft bg-ivory-100/60 px-4 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">{title as string}</p>
                      </div>
                      <Table>
                        <THead>
                          <tr><TH>Account</TH><TH align="right">Balance</TH></tr>
                        </THead>
                        <tbody>
                          {(lines as { code: string; name: string; amount: number }[]).map((line) => (
                            <TR key={line.code}>
                              <TD className="text-[11.5px] text-ink-700">
                                <span className="block">{line.name}</span>
                                <span className="font-mono text-[9px] text-ink-400">{line.code}</span>
                              </TD>
                              <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(line.amount)}</TD>
                            </TR>
                          ))}
                          {(lines as unknown[]).length === 0 && (
                            <TR><TD colSpan={2} className="py-5 text-center text-[11px] text-ink-400">No balances.</TD></TR>
                          )}
                        </tbody>
                        <tfoot className="bg-ivory-100/70">
                          <tr>
                            <TD className="text-[11px] font-bold text-ink-600">Total</TD>
                            <TD align="right" className={`num text-[12px] font-bold ${tone === 'warning' ? 'text-brick-500' : 'text-ink-900'}`}>
                              {money(total as number)}
                            </TD>
                          </tr>
                        </tfoot>
                      </Table>
                    </div>
                  ))}
                </div>
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${Number(balanceSheet.difference) === 0 ? 'border-sage-200 bg-sage-100/50' : 'border-brick-300/50 bg-brick-100/40'}`}>
                  <div>
                    <p className="text-[11px] font-bold text-ink-700">Assets vs liabilities and equity</p>
                    <p className="text-[10.5px] text-ink-500">
                      Current earnings of {money(balanceSheet.currentEarnings)} are included in equity.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Difference</p>
                    <p className={`num text-[18px] font-semibold ${Number(balanceSheet.difference) === 0 ? 'text-sage-600' : 'text-brick-500'}`}>
                      {money(balanceSheet.difference)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'gst' && (
          <div>
            {gstQuery.isLoading ? (
              <LoadingBlock label="Summarising GST…" />
            ) : gstQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load the GST summary" description={(gstQuery.error as Error).message} />
            ) : !gst ? (
              <EmptyState icon={FileSpreadsheet} title="No GST data" />
            ) : (
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="rounded-xl border border-line-soft">
                  <div className="border-b border-line-soft bg-ivory-100/60 px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Sales by rate</p>
                  </div>
                  <Table>
                    <THead>
                      <tr><TH align="right">Rate</TH><TH align="right">Taxable</TH><TH align="right">Tax</TH><TH align="right">Qty</TH></tr>
                    </THead>
                    <tbody>
                      {gst.salesByRate.map((row) => (
                        <TR key={`sale-${row.taxRate}`}>
                          <TD align="right" className="num text-[11px] font-semibold">{Number(row.taxRate).toFixed(2)}%</TD>
                          <TD align="right" className="num text-[11px] text-ink-600">{money(row.taxableAmount)}</TD>
                          <TD align="right" className="num text-[11px] text-ink-600">{money(row.taxAmount)}</TD>
                          <TD align="right" className="num text-[11px] text-ink-500">{row.quantity}</TD>
                        </TR>
                      ))}
                      {gst.salesByRate.length === 0 && (
                        <TR><TD colSpan={4} className="py-6 text-center text-[11px] text-ink-400">No taxable sales in this window.</TD></TR>
                      )}
                    </tbody>
                  </Table>
                </div>
                <div className="rounded-xl border border-line-soft">
                  <div className="border-b border-line-soft bg-ivory-100/60 px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Purchases by rate</p>
                  </div>
                  <Table>
                    <THead>
                      <tr><TH align="right">Rate</TH><TH align="right">Taxable</TH><TH align="right">Tax</TH><TH align="right">Qty</TH></tr>
                    </THead>
                    <tbody>
                      {gst.purchasesByRate.map((row) => (
                        <TR key={`purchase-${row.taxRate}`}>
                          <TD align="right" className="num text-[11px] font-semibold">{Number(row.taxRate).toFixed(2)}%</TD>
                          <TD align="right" className="num text-[11px] text-ink-600">{money(row.taxableAmount)}</TD>
                          <TD align="right" className="num text-[11px] text-ink-600">{money(row.taxAmount)}</TD>
                          <TD align="right" className="num text-[11px] text-ink-500">{row.quantity}</TD>
                        </TR>
                      ))}
                      {gst.purchasesByRate.length === 0 && (
                        <TR><TD colSpan={4} className="py-6 text-center text-[11px] text-ink-400">No taxable purchases in this window.</TD></TR>
                      )}
                    </tbody>
                  </Table>
                </div>
                <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-ivory-100/50 px-4 py-3">
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Output tax</p>
                      <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(gst.outputTax)}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Input tax</p>
                      <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(gst.inputTax)}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Net payable</p>
                      <p className={`num mt-1 text-[15px] font-semibold ${Number(gst.netPayable) >= 0 ? 'text-saffron-500' : 'text-sage-600'}`}>{money(gst.netPayable)}</p>
                    </div>
                  </div>
                  <Badge tone={Number(gst.netPayable) >= 0 ? 'warning' : 'success'} dot>
                    {Number(gst.netPayable) >= 0 ? 'Payable' : 'Credit carried forward'}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'day-book' && (
          <div>
            {dayBookQuery.isLoading ? (
              <LoadingBlock label="Reading the day book…" />
            ) : dayBookQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load the day book" description={(dayBookQuery.error as Error).message} />
            ) : dayBook.length === 0 ? (
              <EmptyState icon={ScrollText} title="No journals in this window" description="Sales, purchases, expenses and manual journals appear here as soon as they post." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Entry</TH>
                    <TH>Date</TH>
                    <TH>Description</TH>
                    <TH>Source</TH>
                    <TH>Branch</TH>
                    <TH align="right">Debit</TH>
                    <TH align="right">Credit</TH>
                    <TH align="right">Lines</TH>
                  </tr>
                </THead>
                <tbody>
                  {dayBook.map((entry) => {
                    const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
                    const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
                    return (
                      <TR key={entry.id} onClick={() => setJournalDetail(entry)}>
                        <TD className="font-mono text-[11px] font-semibold text-ink-900">{entry.entryNo}</TD>
                        <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(entry.entryDate)}</TD>
                        <TD className="max-w-[280px] truncate text-[11.5px] text-ink-700">{entry.description}</TD>
                        <TD><Badge tone="info">{titleCase(entry.sourceType)}</Badge></TD>
                        <TD className="text-[10.5px] text-ink-500">{entry.branchName}</TD>
                        <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(debit)}</TD>
                        <TD align="right" className="num text-[11px] text-ink-600">{money(credit)}</TD>
                        <TD align="right" className="num text-[11px] text-ink-400">{entry.lines.length}</TD>
                      </TR>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'accounts' && (
          <div>
            {accountsQuery.isLoading ? (
              <LoadingBlock label="Reading the chart of accounts…" />
            ) : accountsQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load accounts" description={(accountsQuery.error as Error).message} />
            ) : accounts.length === 0 ? (
              <EmptyState icon={BookOpen} title="No accounts yet" description="Seed the chart of accounts or add the first ledger account." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Account</TH>
                    <TH>Type</TH>
                    <TH>Subtype</TH>
                    <TH align="right">Flags</TH>
                    <TH align="right">Status</TH>
                    <TH align="right">Ledger</TH>
                  </tr>
                </THead>
                <tbody>
                  {accounts.map((account) => (
                    <TR key={account.id}>
                      <TD className="font-mono text-[10.5px] text-ink-500">{account.code}</TD>
                      <TD className="text-[12px] font-semibold text-ink-800">{account.name}</TD>
                      <TD><Badge tone={account.type === 'INCOME' ? 'success' : account.type === 'EXPENSE' ? 'warning' : 'info'}>{titleCase(account.type)}</Badge></TD>
                      <TD className="text-[10.5px] text-ink-400">{account.subtype ?? '—'}</TD>
                      <TD align="right" className="text-[10px] text-ink-400">
                        {[account.systemAccount ? 'System' : null, account.cashBank ? 'Cash/Bank' : null].filter(Boolean).join(' · ') || '—'}
                      </TD>
                      <TD align="right">
                        <Badge tone={account.active ? 'success' : 'danger'} dot>{account.active ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD align="right">
                        <Button size="sm" variant="ghost" onClick={() => setLedgerAccount(account)}>View</Button>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {tab === 'periods' && (
          <div>
            {periodsQuery.isLoading ? (
              <LoadingBlock label="Reading financial periods…" />
            ) : periodsQuery.isError ? (
              <EmptyState icon={LockKeyhole} title="Could not load periods" description={(periodsQuery.error as Error).message} />
            ) : periods.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="No financial periods"
                description="Define a financial year or month, then close it to prevent back-dated postings."
                action={has('accounting.close') ? <Button size="sm" onClick={() => setPeriodOpen(true)}>Create period</Button> : undefined}
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Period</TH>
                    <TH>Start</TH>
                    <TH>End</TH>
                    <TH>Status</TH>
                    <TH>Closed by</TH>
                    <TH>Notes</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {periods.map((period) => (
                    <TR key={period.id}>
                      <TD className="text-[12px] font-semibold text-ink-800">{period.name}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(period.startDate)}</TD>
                      <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(period.endDate)}</TD>
                      <TD><Badge tone={statusTone(period.status)} dot>{titleCase(period.status)}</Badge></TD>
                      <TD className="text-[10.5px] text-ink-400">
                        {period.closedByName ? `${period.closedByName} · ${formatDateTime(period.closedAt)}` : '—'}
                      </TD>
                      <TD className="max-w-[220px] truncate text-[10.5px] text-ink-400">{period.notes ?? '—'}</TD>
                      <TD align="right">
                        {has('accounting.close') && (
                          <div className="flex items-center justify-end gap-1">
                            {period.status === 'OPEN' ? (
                              <Button size="sm" loading={closePeriodMutation.isPending} onClick={() => closePeriodMutation.mutate(period.id)}>
                                <LockKeyhole size={12} /> Close
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setReopenPeriod(period)
                                  setReopenReason('')
                                }}
                              >
                                <UnlockKeyhole size={12} /> Reopen
                              </Button>
                            )}
                          </div>
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

      <SectionCard className="mt-4" title="How the books stay honest" description="Documents post journals; nothing is typed twice">
        <div className="grid gap-3 text-[11.5px] leading-5 text-ink-500 sm:grid-cols-3">
          <p>
            <span className="font-semibold text-ink-700">Sales and purchases</span> post their own journals, including cost
            of goods, input tax and supplier payable.
          </p>
          <p>
            <span className="font-semibold text-ink-700">Closed periods</span> reject new postings. Reopening a period
            requires a reason and leaves an audit trail.
          </p>
          <p>
            <span className="font-semibold text-ink-700">Manual journals</span> must balance before they can be posted;
            each line is linked to a real ledger account.
          </p>
        </div>
      </SectionCard>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Manual journal"
        description="Post a balanced double-entry journal. Debits and credits must match exactly."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={manualMutation.isPending}
              disabled={!journalBalanced || !journalForm.description.trim() || branchId == null}
              onClick={() => manualMutation.mutate()}
            >
              Post journal
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Entry date" required>
              <Input type="date" value={journalForm.entryDate} onChange={(event) => setJournalForm({ ...journalForm, entryDate: event.target.value })} />
            </Field>
            <Field label="Reference" hint="Optional">
              <Input value={journalForm.reference} onChange={(event) => setJournalForm({ ...journalForm, reference: event.target.value })} placeholder="Journal voucher no…" />
            </Field>
            <Field label="Branch">
              <Input value={branchId ? `Branch #${branchId}` : 'Select a branch'} disabled />
            </Field>
          </div>
          <Field label="Description" required>
            <Input
              value={journalForm.description}
              onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })}
              placeholder="Owner capital introduced, stock revaluation, correction…"
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Journal lines</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setJournalForm({ ...journalForm, lines: [...journalForm.lines, emptyJournalLine()] })}
              >
                <Plus size={12} /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {journalForm.lines.map((line, index) => (
                <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_110px_110px_1fr_36px]">
                  <Field label={index === 0 ? 'Account' : undefined}>
                    <Select
                      value={line.accountId}
                      onChange={(event) =>
                        setJournalForm({
                          ...journalForm,
                          lines: journalForm.lines.map((row, i) => (i === index ? { ...row, accountId: Number(event.target.value) } : row))
                        })
                      }
                    >
                      <option value={0}>Select account…</option>
                      {activeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={index === 0 ? 'Debit' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.debit}
                      onChange={(event) =>
                        setJournalForm({
                          ...journalForm,
                          lines: journalForm.lines.map((row, i) =>
                            i === index ? { ...row, debit: event.target.value, credit: event.target.value ? '' : row.credit } : row
                          )
                        })
                      }
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label={index === 0 ? 'Credit' : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.credit}
                      onChange={(event) =>
                        setJournalForm({
                          ...journalForm,
                          lines: journalForm.lines.map((row, i) =>
                            i === index ? { ...row, credit: event.target.value, debit: event.target.value ? '' : row.debit } : row
                          )
                        })
                      }
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label={index === 0 ? 'Line note' : undefined}>
                    <Input
                      value={line.description}
                      onChange={(event) =>
                        setJournalForm({
                          ...journalForm,
                          lines: journalForm.lines.map((row, i) => (i === index ? { ...row, description: event.target.value } : row))
                        })
                      }
                      placeholder="Optional"
                    />
                  </Field>
                  <IconButton
                    label="Remove line"
                    className="mb-0.5"
                    disabled={journalForm.lines.length <= 2}
                    onClick={() => setJournalForm({ ...journalForm, lines: journalForm.lines.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-ivory-100/50 px-4 py-3">
            <div className="flex gap-8">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Total debit</p>
                <p className="num mt-1 text-[16px] font-semibold text-ink-900">{money(journalDebit)}</p>
              </div>
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">Total credit</p>
                <p className="num mt-1 text-[16px] font-semibold text-ink-900">{money(journalCredit)}</p>
              </div>
            </div>
            <Badge tone={journalBalanced ? 'success' : 'danger'} dot>
              {journalBalanced ? 'Balanced' : `${money(Math.abs(journalDebit - journalCredit))} ${journalDebit > journalCredit ? 'debit' : 'credit'} difference`}
            </Badge>
          </div>
        </div>
      </Modal>

      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="New ledger account"
        description="Add a custom account to the chart. System accounts are seeded and protected."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAccountOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={accountMutation.isPending}
              disabled={!accountForm.code.trim() || !accountForm.name.trim()}
              onClick={() => accountMutation.mutate()}
            >
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Account code" required hint="e.g. 6100">
              <Input value={accountForm.code} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} placeholder="6100" />
            </Field>
            <Field label="Account type" required>
              <Select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}>
                {accountTypes.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Account name" required>
            <Input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} placeholder="Marketing expense" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subtype" hint="Optional">
              <Input value={accountForm.subtype} onChange={(event) => setAccountForm({ ...accountForm, subtype: event.target.value })} placeholder="Operating expense" />
            </Field>
            <Field label="Parent account" hint="Optional">
              <Select value={accountForm.parentId} onChange={(event) => setAccountForm({ ...accountForm, parentId: Number(event.target.value) })}>
                <option value={0}>No parent</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox
            label="This is a cash or bank account"
            checked={accountForm.cashBank}
            onChange={(event) => setAccountForm({ ...accountForm, cashBank: event.target.checked })}
          />
        </div>
      </Modal>

      <Modal
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        title="New financial period"
        description="Postings dated inside a closed period are rejected. Choose the window carefully."
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPeriodOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={periodMutation.isPending}
              disabled={!periodForm.name.trim() || !periodForm.startDate || !periodForm.endDate}
              onClick={() => periodMutation.mutate()}
            >
              Create period
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Period name" required>
            <Input value={periodForm.name} onChange={(event) => setPeriodForm({ ...periodForm, name: event.target.value })} placeholder="FY 2026-27" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date" required>
              <Input type="date" value={periodForm.startDate} onChange={(event) => setPeriodForm({ ...periodForm, startDate: event.target.value })} />
            </Field>
            <Field label="End date" required>
              <Input type="date" value={periodForm.endDate} onChange={(event) => setPeriodForm({ ...periodForm, endDate: event.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={periodForm.notes} onChange={(event) => setPeriodForm({ ...periodForm, notes: event.target.value })} placeholder="Purpose, approval context…" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={reopenPeriod != null}
        onClose={() => setReopenPeriod(null)}
        title="Reopen financial period"
        description={reopenPeriod ? `${reopenPeriod.name} will accept new postings again. The reason is recorded in the audit trail.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setReopenPeriod(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="danger"
              loading={reopenPeriodMutation.isPending}
              disabled={!reopenReason.trim()}
              onClick={() => reopenPeriodMutation.mutate()}
            >
              <UnlockKeyhole size={13} /> Reopen period
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Late supplier bill, audit adjustment…" />
        </Field>
      </Modal>

      <Modal
        open={journalDetail != null}
        onClose={() => setJournalDetail(null)}
        title={journalDetail ? `${journalDetail.entryNo} · ${titleCase(journalDetail.sourceType)}` : 'Journal entry'}
        description={journalDetail ? `${formatDate(journalDetail.entryDate)} · ${journalDetail.branchName} · posted by ${journalDetail.createdByName}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setJournalDetail(null)}>Close</Button>
          </>
        }
      >
        {journalDetail && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line-soft bg-ivory-100/50 px-4 py-3">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-400">Description</p>
              <p className="mt-1 text-[12px] font-medium text-ink-800">{journalDetail.description}</p>
              {journalDetail.sourceId && (
                <p className="mt-1 text-[10px] text-ink-400">Source reference {journalDetail.sourceId}</p>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-line-soft">
              <Table>
                <THead>
                  <tr>
                    <TH>Account</TH>
                    <TH>Note</TH>
                    <TH align="right">Debit</TH>
                    <TH align="right">Credit</TH>
                  </tr>
                </THead>
                <tbody>
                  {journalDetail.lines.map((line) => (
                    <TR key={line.id}>
                      <TD>
                        <span className="block text-[11.5px] font-semibold text-ink-800">{line.accountName}</span>
                        <span className="block font-mono text-[9px] text-ink-400">{line.accountCode}</span>
                      </TD>
                      <TD className="text-[10.5px] text-ink-400">{line.description ?? '—'}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-800">{Number(line.debit) ? money(line.debit) : '—'}</TD>
                      <TD align="right" className="num text-[11px] text-ink-600">{Number(line.credit) ? money(line.credit) : '—'}</TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot className="bg-ivory-100/70">
                  <tr>
                    <TD colSpan={2} className="text-[11px] font-bold text-ink-600">Totals</TD>
                    <TD align="right" className="num text-[12px] font-bold text-ink-900">
                      {money(journalDetail.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0))}
                    </TD>
                    <TD align="right" className="num text-[12px] font-bold text-ink-900">
                      {money(journalDetail.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0))}
                    </TD>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={ledgerAccount != null}
        onClose={() => setLedgerAccount(null)}
        title={ledgerAccount ? `${ledgerAccount.code} · ${ledgerAccount.name}` : 'Account ledger'}
        description={ledgerAccount ? `${titleCase(ledgerAccount.type)} ledger · ${formatDate(from)} to ${formatDate(to)}` : undefined}
        size="xl"
        footer={
          <>
            {has('report.export') && (
              <>
                <Button variant="secondary" size="sm" onClick={() => exportLedger('pdf')}>
                  <FileText size={13} /> PDF
                </Button>
                <Button variant="secondary" size="sm" onClick={() => exportLedger('xlsx')}>
                  <FileSpreadsheet size={13} /> Excel
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setLedgerAccount(null)}>Close</Button>
          </>
        }
      >
        {ledgerQuery.isLoading ? (
          <LoadingBlock label="Reading the ledger…" />
        ) : !ledgerQuery.data ? (
          <EmptyState icon={BookOpen} title="No ledger available" />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Opening', ledgerQuery.data.openingBalance],
                ['Debits', ledgerQuery.data.totalDebit],
                ['Credits', ledgerQuery.data.totalCredit],
                ['Closing', ledgerQuery.data.closingBalance]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-line-soft bg-ivory-100/50 px-3 py-2.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">{label}</p>
                  <p className="num mt-1 text-[15px] font-semibold text-ink-900">{money(value as number)}</p>
                </div>
              ))}
            </div>
            {ledgerQuery.data.rows.length === 0 ? (
              <EmptyState icon={BookOpen} title="No entries in this window" />
            ) : (
              <div className="overflow-hidden rounded-xl border border-line-soft">
                <Table>
                  <THead>
                    <tr>
                      <TH>Date</TH>
                      <TH>Entry</TH>
                      <TH>Description</TH>
                      <TH>Branch</TH>
                      <TH align="right">Debit</TH>
                      <TH align="right">Credit</TH>
                      <TH align="right">Balance</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {ledgerQuery.data.rows.map((row, index) => (
                      <TR key={`${row.entryNo}-${index}`}>
                        <TD className="whitespace-nowrap text-[11px] text-ink-500">{formatDate(row.date)}</TD>
                        <TD className="font-mono text-[10px] text-ink-500">{row.entryNo}</TD>
                        <TD className="text-[11px] text-ink-600">
                          <span className="block">{row.description}</span>
                          {row.lineDescription && <span className="block text-[9.5px] text-ink-400">{row.lineDescription}</span>}
                        </TD>
                        <TD className="text-[10px] text-ink-400">{row.branchName}</TD>
                        <TD align="right" className="num text-[11px] text-ink-600">{Number(row.debit) ? money(row.debit) : '—'}</TD>
                        <TD align="right" className="num text-[11px] text-ink-600">{Number(row.credit) ? money(row.credit) : '—'}</TD>
                        <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(row.balance)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <p className="mt-4 flex items-center gap-2 text-[10.5px] text-ink-400">
        <Download size={13} /> Exports honour the selected branch and dates. Reports are generated from posted journals, not
        from editable totals.
      </p>
    </div>
  )
}
