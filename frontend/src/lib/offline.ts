import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { api } from './api'
import { uuid } from './format'
import type { CreateSaleRequest, PullSnapshot, SyncBatchResponse, SyncItemResult } from './types'

export interface OfflineSale {
  offlineId: string
  branchId: number
  createdAt: string
  request: CreateSaleRequest
  lastKnownStock: { variantId: number; quantity: number }[]
  total: number
  status: 'QUEUED' | 'CONFLICT' | 'REJECTED'
  message?: string
  result?: SyncItemResult
}

interface ErpDB extends DBSchema {
  queue: {
    key: string
    value: OfflineSale
    indexes: { 'by-branch': number }
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

let dbPromise: Promise<IDBPDatabase<ErpDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ErpDB>('garment-erp', 1, {
      upgrade(database) {
        const queue = database.createObjectStore('queue', { keyPath: 'offlineId' })
        queue.createIndex('by-branch', 'branchId')
        database.createObjectStore('meta', { keyPath: 'key' })
      }
    })
    // A rejected open (quota, blocked upgrade, private mode) must not poison this session forever — retry next call.
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const record = await (await db()).get('meta', key)
  return (record?.value as T) ?? null
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', { key, value })
}

export async function getDeviceBase(): Promise<string> {
  let base = await getMeta<string>('deviceBase')
  if (!base) {
    base = uuid()
    await setMeta('deviceBase', base)
  }
  return base
}

export async function deviceIdForBranch(branchId: number): Promise<string> {
  return `${await getDeviceBase()}-b${branchId}`
}

export async function savePull(branchId: number, snapshot: PullSnapshot): Promise<void> {
  await setMeta(`pull:${branchId}`, snapshot)
}

export async function getPull(branchId: number): Promise<PullSnapshot | null> {
  return getMeta<PullSnapshot>(`pull:${branchId}`)
}

export async function enqueueSale(sale: OfflineSale): Promise<void> {
  await (await db()).put('queue', sale)
}

export async function listQueue(branchId?: number): Promise<OfflineSale[]> {
  const database = await db()
  const items = branchId
    ? await database.getAllFromIndex('queue', 'by-branch', branchId)
    : await database.getAll('queue')
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removeFromQueue(offlineIds: string[]): Promise<void> {
  const database = await db()
  const tx = database.transaction('queue', 'readwrite')
  await Promise.all(offlineIds.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function markQueueItem(offlineId: string, patch: Partial<OfflineSale>): Promise<void> {
  const database = await db()
  const existing = await database.get('queue', offlineId)
  if (existing) await database.put('queue', { ...existing, ...patch })
}

export async function clearQueue(): Promise<void> {
  await (await db()).clear('queue')
}

export async function registerDevice(branchId: number, name: string): Promise<void> {
  const deviceId = await deviceIdForBranch(branchId)
  await api('/api/sync/devices', {
    method: 'POST',
    body: { deviceId, branchId, name, appVersion: '1.0.0' }
  })
}

export interface SyncOutcome {
  batch: SyncBatchResponse
  branchId: number
}

/**
 * Pushes every queued invoice for a branch to the server as one idempotent batch.
 * Accepted and duplicate items leave the queue; conflicts stay for review.
 */
export async function syncQueuedSales(branchId: number): Promise<SyncOutcome | null> {
  const queued = await listQueue(branchId)
  if (queued.length === 0) return null

  const deviceId = await deviceIdForBranch(branchId)
  await registerDevice(branchId, navigator.userAgent.includes('Mobile') ? 'Mobile POS' : 'Web POS')

  const batchId = uuid()
  const response = await api<SyncBatchResponse>('/api/sync/batches', {
    method: 'POST',
    body: {
      batchId,
      deviceId,
      branchId,
      invoices: queued.map((item) => ({
        offlineId: item.offlineId,
        invoice: { ...item.request, offlineId: item.offlineId, deviceId },
        lastKnownStock: item.lastKnownStock
      }))
    }
  })

  const finished: string[] = []
  for (const result of response.items) {
    if (result.status === 'ACCEPTED' || result.status === 'DUPLICATE') {
      finished.push(result.offlineId)
    } else {
      await markQueueItem(result.offlineId, {
        status: result.status === 'CONFLICT' ? 'CONFLICT' : 'REJECTED',
        message: result.message ?? result.code ?? 'The server rejected this bill.',
        result
      })
    }
  }
  await removeFromQueue(finished)
  return { batch: response, branchId }
}
