import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  Laptop,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDateTime, money, statusTone, titleCase } from '../lib/format'
import {
  getPull,
  listQueue,
  markQueueItem,
  registerDevice,
  removeFromQueue,
  savePull,
  syncQueuedSales,
  type OfflineSale
} from '../lib/offline'
import type {
  PageResponse,
  PullSnapshot,
  SyncBatchResponse,
  SyncBatchSummary,
  SyncDevice
} from '../lib/types'
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
  Pagination,
  SectionCard,
  Select,
  StatCard,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs
} from '../components/ui'
import { useToast } from '../components/toast'

type Tab = 'queue' | 'devices' | 'history'

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

export function SyncPage() {
  const { branchId, branches, has, hasAny } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const online = useOnline()

  const canManage = has('sync.manage')
  const canSync = has('sync.use')

  const [tab, setTab] = useState<Tab>('queue')
  const [deviceBranch, setDeviceBranch] = useState<number>(branchId ?? 0)
  const [deviceName, setDeviceName] = useState('Web POS')
  const [queue, setQueue] = useState<OfflineSale[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [localPull, setLocalPull] = useState<PullSnapshot | null>(null)
  const [lastOutcome, setLastOutcome] = useState<SyncBatchResponse | null>(null)
  const [batchPage, setBatchPage] = useState(0)
  const [batchDetail, setBatchDetail] = useState<SyncBatchResponse | null>(null)
  const [batchDetailId, setBatchDetailId] = useState<string | null>(null)

  const activeBranch = branches.find((branch) => branch.id === deviceBranch)

  const loadLocal = useCallback(async () => {
    setQueueLoading(true)
    try {
      const [items, pull] = await Promise.all([
        listQueue(branchId ?? undefined),
        branchId ? getPull(branchId) : Promise.resolve(null)
      ])
      setQueue(items)
      setLocalPull(pull)
    } finally {
      setQueueLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    void loadLocal()
  }, [loadLocal])

  useEffect(() => {
    if (branchId != null) setDeviceBranch((current) => (current === 0 ? branchId : current))
  }, [branchId])

  const devicesQuery = useQuery({
    queryKey: ['sync-devices'],
    queryFn: () => api<SyncDevice[]>('/api/sync/devices'),
    enabled: canManage
  })

  const batchesQuery = useQuery({
    queryKey: ['sync-batches', branchId, batchPage],
    queryFn: () =>
      api<PageResponse<SyncBatchSummary>>(
        `/api/sync/batches${qs({ branchId: branchId || undefined, page: batchPage, size: 20 })}`
      ),
    enabled: canManage && tab === 'history'
  })

  const devices = devicesQuery.data ?? []
  const batches = batchesQuery.data?.content ?? []

  const queueStats = useMemo(() => {
    const queued = queue.filter((item) => item.status === 'QUEUED')
    const conflicts = queue.filter((item) => item.status === 'CONFLICT')
    const rejected = queue.filter((item) => item.status === 'REJECTED')
    return {
      queued,
      conflicts,
      rejected,
      total: queue.reduce((sum, item) => sum + Number(item.total || 0), 0)
    }
  }, [queue])

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!deviceBranch) throw new Error('Choose a branch first.')
      if (!deviceName.trim()) throw new Error('Give this device a name.')
      await registerDevice(deviceBranch, deviceName.trim())
    },
    onSuccess: () => {
      toast.push('Device registered', {
        description: `${deviceName.trim()} is bound to ${activeBranch?.name ?? 'the branch'} for offline billing.`,
        tone: 'success'
      })
      queryClient.invalidateQueries({ queryKey: ['sync-devices'] })
    },
    onError: (error: Error) => toast.push('Could not register device', { description: error.message, tone: 'error' })
  })

  const deviceStatusMutation = useMutation({
    mutationFn: ({ deviceId, active }: { deviceId: string; active: boolean }) =>
      api<SyncDevice>(`/api/sync/devices/${encodeURIComponent(deviceId)}/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST'
      }),
    onSuccess: (device) => {
      toast.push(device.active ? 'Device activated' : 'Device deactivated', {
        description: `${device.name} · ${device.branchName}`,
        tone: 'info'
      })
      queryClient.invalidateQueries({ queryKey: ['sync-devices'] })
    },
    onError: (error: Error) => toast.push('Could not change device status', { description: error.message, tone: 'error' })
  })

  const pullMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Select a branch before pulling data.')
      const since = localPull?.serverTime
      const snapshot = await api<PullSnapshot>(`/api/sync/pull${qs({ branchId, since })}`)
      await savePull(branchId, snapshot)
      return snapshot
    },
    onSuccess: (snapshot) => {
      setLocalPull(snapshot)
      toast.push('Branch data refreshed', {
        description: `${snapshot.variants.length} variants · ${snapshot.stock.length} stock rows · ${snapshot.customers.length} customers`,
        tone: 'success'
      })
    },
    onError: (error: Error) => toast.push('Could not pull branch data', { description: error.message, tone: 'error' })
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Select a branch before syncing.')
      return syncQueuedSales(branchId)
    },
    onSuccess: async (outcome) => {
      if (!outcome) {
        toast.push('Nothing to sync', { description: 'The local queue is empty for this branch.', tone: 'info' })
        return
      }
      setLastOutcome(outcome.batch)
      await loadLocal()
      queryClient.invalidateQueries({ queryKey: ['sync-batches'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      const { batch } = outcome
      const tone =
        batch.conflictCount || batch.rejectedCount ? 'warning' : batch.acceptedCount ? 'success' : 'info'
      toast.push('Sync finished', {
        description: `${batch.acceptedCount} accepted · ${batch.duplicateCount} duplicate · ${batch.conflictCount} conflict · ${batch.rejectedCount} rejected`,
        tone
      })
    },
    onError: (error: Error) => toast.push('Sync failed', { description: error.message, tone: 'error' })
  })

  const discardMutation = useMutation({
    mutationFn: (offlineId: string) => removeFromQueue([offlineId]),
    onSuccess: async () => {
      toast.push('Bill removed from queue', {
        description: 'The local copy was discarded. No server record was created.',
        tone: 'info'
      })
      await loadLocal()
    },
    onError: (error: Error) => toast.push('Could not remove bill', { description: error.message, tone: 'error' })
  })

  const retryItemMutation = useMutation({
    mutationFn: async (item: OfflineSale) => {
      await markQueueItem(item.offlineId, { status: 'QUEUED', message: undefined, result: undefined })
      await loadLocal()
    },
    onError: (error: Error) => toast.push('Could not requeue bill', { description: error.message, tone: 'error' })
  })

  const openBatch = async (batchId: string) => {
    setBatchDetailId(batchId)
    try {
      const detail = await api<SyncBatchResponse>(`/api/sync/batches/${encodeURIComponent(batchId)}`)
      setBatchDetail(detail)
    } catch (error) {
      toast.push('Could not load batch', { description: (error as Error).message, tone: 'error' })
      setBatchDetailId(null)
    }
  }

  const visibleTabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: 'Local queue' },
    ...(canManage ? [{ id: 'devices' as Tab, label: 'Devices' }, { id: 'history' as Tab, label: 'Sync history' }] : [])
  ]

  if (!canSync && !canManage) {
    return <EmptyState icon={CloudOff} title="Offline sync needs sync access" />
  }

  const pullAge = localPull ? formatDateTime(localPull.serverTime) : 'Never pulled'

  return (
    <div className="animate-fade">
      <PageHeader
        eyebrow="Resilience · offline sync"
        title="Keep selling when the line drops"
        description="Offline bills queue on this device, then post to the server as one idempotent batch. Stock conflicts and rejections stay visible for a human decision."
        actions={
          <>
            <Badge tone={online ? 'success' : 'danger'} dot>
              {online ? 'Online' : 'Offline'}
            </Badge>
            <Button variant="secondary" onClick={() => void loadLocal()} loading={queueLoading}>
              <RefreshCw size={14} /> Refresh queue
            </Button>
            {branchId != null && canSync && (
              <Button
                loading={pullMutation.isPending}
                disabled={!online}
                onClick={() => pullMutation.mutate()}
              >
                <CloudUpload size={14} /> Pull branch data
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Queued bills"
          value={queueStats.queued.length}
          hint={`${money(queueStats.total)} waiting on this device`}
          icon={CloudUpload}
          tone="accent"
        />
        <StatCard
          label="Conflicts"
          value={queueStats.conflicts.length}
          hint={queueStats.conflicts.length ? 'Stock changed while offline' : 'No stock conflicts'}
          icon={AlertTriangle}
          tone={queueStats.conflicts.length ? 'warning' : 'success'}
        />
        <StatCard
          label="Devices"
          value={canManage ? devices.length : '—'}
          hint={canManage ? `${devices.filter((device) => device.active).length} active` : 'Device list needs sync manage'}
          icon={Laptop}
          tone="info"
        />
        <StatCard
          label="Last pull"
          value={localPull ? `${localPull.variants.length}` : '—'}
          hint={localPull ? `${pullAge} · ${localPull.stock.length} stock rows` : 'Pull branch data for offline billing'}
          icon={PackageCheck}
          tone="neutral"
        />
      </div>

      {!online && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-saffron-200 bg-saffron-100/60 px-4 py-3">
          <WifiOff size={16} className="mt-0.5 shrink-0 text-saffron-500" />
          <div className="text-[11.5px] leading-5 text-ink-700">
            <p className="font-semibold">This device is offline.</p>
            <p className="text-ink-500">
              POS bills continue to queue locally using the last pulled stock snapshot. Sync once the connection returns;
              accepted bills receive server invoice numbers at that point.
            </p>
          </div>
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs className="border-0" items={visibleTabs} value={tab} onChange={(value) => setTab(value as Tab)} />
        </div>

        {tab === 'queue' && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-[11px] text-ink-400">
                  {branchId != null
                    ? `Queue for ${branches.find((branch) => branch.id === branchId)?.name ?? 'the current branch'}`
                    : 'Queue across all branches'}
                </p>
                <p className="mt-0.5 text-[10px] text-ink-400">
                  Accepted and duplicate items leave the queue. Conflicts must be resolved or discarded.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {branchId != null && canSync && (
                  <Button
                    loading={syncMutation.isPending}
                    disabled={!online || queueStats.queued.length === 0}
                    onClick={() => syncMutation.mutate()}
                  >
                    <CloudUpload size={13} /> Sync {queueStats.queued.length || ''} queued
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => void loadLocal()}>
                  <RefreshCw size={12} /> Reload
                </Button>
              </div>
            </div>

            {queueLoading ? (
              <LoadingBlock label="Reading the local queue…" />
            ) : queue.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing waiting to sync"
                description="Bills rung up while offline appear here until the server assigns their invoice numbers."
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Captured</TH>
                    <TH>Branch</TH>
                    <TH>Customer</TH>
                    <TH align="right">Lines</TH>
                    <TH align="right">Total</TH>
                    <TH>Status</TH>
                    <TH>Detail</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {queue.map((item) => (
                    <TR key={item.offlineId}>
                      <TD className="whitespace-nowrap text-[10.5px] text-ink-500">{formatDateTime(item.createdAt)}</TD>
                      <TD className="text-[10.5px] text-ink-500">
                        {branches.find((branch) => branch.id === item.branchId)?.code ?? `#${item.branchId}`}
                      </TD>
                      <TD className="text-[11.5px] text-ink-700">
                        {item.request.customerId ? `Customer #${item.request.customerId}` : 'Walk-in'}
                      </TD>
                      <TD align="right" className="num text-[10.5px] text-ink-500">{item.request.items.length}</TD>
                      <TD align="right" className="num text-[11px] font-semibold text-ink-800">{money(item.total)}</TD>
                      <TD><Badge tone={statusTone(item.status)} dot>{titleCase(item.status)}</Badge></TD>
                      <TD className="max-w-[280px] text-[10.5px] leading-4 text-ink-500">
                        {item.result?.invoiceNo ? (
                          <span className="font-mono text-[10px] text-ink-700">{item.result.invoiceNo}</span>
                        ) : (
                          item.message ?? 'Waiting for sync'
                        )}
                        {item.result?.conflicts?.map((conflict) => (
                          <span key={conflict.variantId} className="mt-0.5 block text-[9.5px] text-brick-500">
                            Variant #{conflict.variantId}: needed {conflict.requestedQuantity}, last known{' '}
                            {conflict.lastKnownQuantity}, now {conflict.currentQuantity}
                          </span>
                        ))}
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          {(item.status === 'CONFLICT' || item.status === 'REJECTED') && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={retryItemMutation.isPending}
                              onClick={() => retryItemMutation.mutate(item)}
                            >
                              <RotateCcw size={12} /> Requeue
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={discardMutation.isPending}
                            onClick={() => discardMutation.mutate(item.offlineId)}
                          >
                            <Trash2 size={12} /> Discard
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}

            {lastOutcome && (
              <div className="border-t border-line-soft bg-ivory-100/50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Last batch</p>
                  <span className="font-mono text-[10px] text-ink-500">{lastOutcome.batchId}</span>
                  <Badge tone={statusTone(lastOutcome.status)} dot>{titleCase(lastOutcome.status)}</Badge>
                  <span className="text-[10.5px] text-ink-500">
                    {lastOutcome.acceptedCount} accepted · {lastOutcome.duplicateCount} duplicate ·{' '}
                    {lastOutcome.conflictCount} conflict · {lastOutcome.rejectedCount} rejected
                  </span>
                  <span className="text-[10px] text-ink-400">{formatDateTime(lastOutcome.processedAt)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'devices' && canManage && (
          <div className="border-t border-line-soft">
            <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
              <SectionCard
                title="Register this device"
                description="A device is bound to one branch and can only push invoices for that branch."
              >
                <div className="space-y-3">
                  <Field label="Branch" required>
                    <Select value={deviceBranch} onChange={(event) => setDeviceBranch(Number(event.target.value))}>
                      <option value={0}>Select a branch…</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Device name" required hint="Shown in the device register">
                    <Input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Front counter tablet" />
                  </Field>
                  <Button
                    className="w-full"
                    loading={registerMutation.isPending}
                    disabled={!deviceBranch || !deviceName.trim() || !online}
                    onClick={() => registerMutation.mutate()}
                  >
                    <Plus size={13} /> Register this device
                  </Button>
                  <p className="text-[10px] leading-4 text-ink-400">
                    The device identifier is generated once per browser and suffixed with the branch id, so the same
                    browser keeps a stable identity across sessions.
                  </p>
                </div>
              </SectionCard>

              <SectionCard title="Device register" description="Deactivate a lost or retired till to block its syncs." bodyClassName="p-0">
                {devicesQuery.isLoading ? (
                  <LoadingBlock label="Reading devices…" />
                ) : devices.length === 0 ? (
                  <EmptyState icon={Smartphone} title="No devices registered" description="Register the first till or tablet to enable offline billing." />
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <TH>Device</TH>
                        <TH>Branch</TH>
                        <TH>App</TH>
                        <TH align="right">Last sync</TH>
                        <TH align="right">Last seen</TH>
                        <TH align="right">Status</TH>
                        <TH align="right">Action</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {devices.map((device) => (
                        <TR key={device.id}>
                          <TD>
                            <span className="block text-[11.5px] font-semibold text-ink-800">{device.name}</span>
                            <span className="block max-w-[200px] truncate font-mono text-[9px] text-ink-400">{device.deviceId}</span>
                          </TD>
                          <TD className="text-[10.5px] text-ink-500">{device.branchName}</TD>
                          <TD className="text-[10px] text-ink-400">{device.appVersion ?? '—'}</TD>
                          <TD align="right" className="whitespace-nowrap text-[10px] text-ink-400">
                            {device.lastSyncAt ? formatDateTime(device.lastSyncAt) : 'Never'}
                          </TD>
                          <TD align="right" className="whitespace-nowrap text-[10px] text-ink-400">
                            {device.lastSeenAt ? formatDateTime(device.lastSeenAt) : 'Never'}
                          </TD>
                          <TD align="right">
                            <Badge tone={device.active ? 'success' : 'danger'} dot>{device.active ? 'Active' : 'Disabled'}</Badge>
                          </TD>
                          <TD align="right">
                            <Button
                              size="sm"
                              variant={device.active ? 'ghost' : 'secondary'}
                              loading={deviceStatusMutation.isPending}
                              onClick={() => deviceStatusMutation.mutate({ deviceId: device.deviceId, active: !device.active })}
                            >
                              {device.active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                )}
              </SectionCard>
            </div>

            <div className="border-t border-line-soft px-4 py-3">
              <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-ink-500">
                <ShieldCheck size={13} className="text-sage-500" />
                Only active devices bound to the invoice branch can submit a batch. Every batch is audited with its
                device and branch.
              </div>
            </div>
          </div>
        )}

        {tab === 'history' && canManage && (
          <div className="border-t border-line-soft">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-[11px] text-ink-400">
                Replaying a batch id returns the original stored response; batches are never posted twice.
              </p>
              <Button variant="secondary" size="sm" onClick={() => batchesQuery.refetch()} loading={batchesQuery.isFetching}>
                <RefreshCw size={12} /> Refresh
              </Button>
            </div>
            {batchesQuery.isLoading ? (
              <LoadingBlock label="Reading sync history…" />
            ) : batches.length === 0 ? (
              <EmptyState icon={CloudUpload} title="No sync batches yet" description="Batches appear here after the first offline till syncs." />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Processed</TH>
                      <TH>Batch</TH>
                      <TH>Branch</TH>
                      <TH>Device</TH>
                      <TH align="right">Items</TH>
                      <TH align="right">Accepted</TH>
                      <TH align="right">Duplicate</TH>
                      <TH align="right">Conflict</TH>
                      <TH align="right">Rejected</TH>
                      <TH align="right">Status</TH>
                      <TH align="right">Detail</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {batches.map((batch) => (
                      <TR key={batch.id}>
                        <TD className="whitespace-nowrap text-[10px] text-ink-400">{formatDateTime(batch.processedAt)}</TD>
                        <TD className="max-w-[160px] truncate font-mono text-[9.5px] text-ink-500">{batch.batchId}</TD>
                        <TD className="text-[10.5px] text-ink-500">{batch.branchName}</TD>
                        <TD className="max-w-[140px] truncate font-mono text-[9px] text-ink-400">{batch.deviceId}</TD>
                        <TD align="right" className="num text-[10.5px] text-ink-600">{batch.itemCount}</TD>
                        <TD align="right" className="num text-[10.5px] text-sage-600">{batch.acceptedCount}</TD>
                        <TD align="right" className="num text-[10.5px] text-ink-500">{batch.duplicateCount}</TD>
                        <TD align="right" className={`num text-[10.5px] ${batch.conflictCount ? 'text-saffron-500' : 'text-ink-400'}`}>{batch.conflictCount}</TD>
                        <TD align="right" className={`num text-[10.5px] ${batch.rejectedCount ? 'text-brick-500' : 'text-ink-400'}`}>{batch.rejectedCount}</TD>
                        <TD align="right"><Badge tone={statusTone(batch.status)} dot>{titleCase(batch.status)}</Badge></TD>
                        <TD align="right">
                          <Button size="sm" variant="ghost" onClick={() => void openBatch(batch.batchId)}>
                            View
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={batchPage}
                  totalPages={batchesQuery.data?.totalPages ?? 0}
                  totalElements={batchesQuery.data?.totalElements ?? 0}
                  onChange={setBatchPage}
                />
              </>
            )}
          </div>
        )}
      </Card>

      <SectionCard className="mt-4" title="How offline billing stays safe" description="No collisions, no silent overwrites">
        <div className="grid gap-3 text-[11.5px] leading-5 text-ink-500 sm:grid-cols-3">
          <p>
            <span className="font-semibold text-ink-700">Offline IDs</span> are generated on the device before the bill
            exists. The server treats a repeated offline ID as a duplicate, so retries cannot double-post a sale.
          </p>
          <p>
            <span className="font-semibold text-ink-700">Invoice numbers</span> are assigned by the server per branch and
            financial year at sync time, keeping each sequence gap-free and collision-free.
          </p>
          <p>
            <span className="font-semibold text-ink-700">Last-known stock</span> is checked on arrival. If the branch sold
            the same piece while this till was offline, the item is held as a conflict instead of overselling.
          </p>
        </div>
      </SectionCard>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[10.5px] text-ink-400">
        {online ? <Wifi size={13} className="text-sage-500" /> : <WifiOff size={13} className="text-brick-500" />}
        <span>{online ? 'Connected to the server.' : 'Working from the local queue and last pulled snapshot.'}</span>
        <span>·</span>
        <span>Queue scope: {branchId != null ? branches.find((branch) => branch.id === branchId)?.name ?? `Branch #${branchId}` : 'all branches'}</span>
      </div>

      <Modal
        open={batchDetailId != null}
        onClose={() => {
          setBatchDetailId(null)
          setBatchDetail(null)
        }}
        title="Sync batch detail"
        description={batchDetailId ? `Batch ${batchDetailId}` : undefined}
        size="lg"
        footer={
          <Button variant="ghost" size="sm" onClick={() => { setBatchDetailId(null); setBatchDetail(null) }}>
            Close
          </Button>
        }
      >
        {!batchDetail ? (
          <LoadingBlock label="Reading batch results…" />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(batchDetail.status)} dot>{titleCase(batchDetail.status)}</Badge>
              <span className="text-[10.5px] text-ink-500">{batchDetail.itemCount} items</span>
              <span className="text-[10.5px] text-sage-600">{batchDetail.acceptedCount} accepted</span>
              <span className="text-[10.5px] text-ink-500">{batchDetail.duplicateCount} duplicate</span>
              <span className="text-[10.5px] text-saffron-500">{batchDetail.conflictCount} conflict</span>
              <span className="text-[10.5px] text-brick-500">{batchDetail.rejectedCount} rejected</span>
              <span className="ml-auto text-[10px] text-ink-400">{formatDateTime(batchDetail.processedAt)}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-line-soft">
              <Table>
                <THead>
                  <tr>
                    <TH>Offline ID</TH>
                    <TH>Result</TH>
                    <TH>Invoice</TH>
                    <TH>Message</TH>
                  </tr>
                </THead>
                <tbody>
                  {batchDetail.items.map((item) => (
                    <TR key={item.offlineId}>
                      <TD className="max-w-[150px] truncate font-mono text-[9.5px] text-ink-500">{item.offlineId}</TD>
                      <TD><Badge tone={statusTone(item.status)} dot>{titleCase(item.status)}</Badge></TD>
                      <TD className="font-mono text-[10px] text-ink-700">{item.invoiceNo ?? '—'}</TD>
                      <TD className="max-w-[260px] text-[10.5px] leading-4 text-ink-500">
                        {item.message ?? item.code ?? '—'}
                        {item.conflicts?.map((conflict) => (
                          <span key={conflict.variantId} className="mt-0.5 block text-[9.5px] text-brick-500">
                            Variant #{conflict.variantId}: needed {conflict.requestedQuantity}, last known{' '}
                            {conflict.lastKnownQuantity}, now {conflict.currentQuantity}
                          </span>
                        ))}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
