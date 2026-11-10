import { getMeta, setMeta } from './offline'
import { getStoredSession } from './api'
import { uuid } from './format'
import type { LoginResponse } from './types'

/**
 * Device-local offline sign-in store.
 *
 * After a successful ONLINE login the full session (token, user, business) is cached
 * alongside a salted PBKDF2-HMAC-SHA256 hash of the password and — when the account
 * owner sets one — a counter PIN. When the server is unreachable, the login screen
 * validates the typed password or PIN against these local hashes and restores the
 * cached session, so the billing counter keeps working with no backend running.
 *
 * Secrets are never stored in plaintext — PBKDF2 with 100k iterations. Brute-force
 * protection: 5 failed attempts per account lock that account for 30 seconds
 * (owner's account is never blocked by a cashier's misses).
 */

export interface OfflineUserRecord {
  username: string
  fullName: string
  passwordHash: string
  pinHash: string | null
  cachedAt: string
  session: LoginResponse
}

export interface OfflineUserSummary {
  username: string
  fullName: string
  cachedAt: string
  hasPin: boolean
}

interface OfflineLockBucket {
  failures: number
  lockedUntil: string | null
}

const USERS_KEY = 'offlineAuth.users'
const SALT_KEY = 'offlineAuth.salt'
const LOCK_KEY = 'offlineAuth.lock'
const MAX_FAILURES = 5
const LOCK_SECONDS = 30
const PBKDF2_ITERATIONS = 100_000
const LEGACY_DOMAIN = 'password'

const encoder = new TextEncoder()

async function getSalt(): Promise<string> {
  const salt = await getMeta<string>(SALT_KEY)
  if (salt) return salt
  const next = uuid()
  await setMeta(SALT_KEY, next)
  // If two tabs raced to create the salt, keep the winner for every future hash.
  return (await getMeta<string>(SALT_KEY)) ?? next
}

function hex(bits: ArrayBuffer): string {
  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

async function hashSecret(secret: string, domain: string): Promise<string> {
  const salt = await getSalt()
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const key = await subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`${salt}:${domain}`), iterations: PBKDF2_ITERATIONS },
      key,
      256
    )
    return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(bits)}`
  }
  // Fallback for plain-http (LAN) contexts — weaker; pair with localhost/HTTPS in production.
  let hash = 0n
  const text = `${salt}:${domain}:${secret}`
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 1099511628211n + BigInt(text.charCodeAt(index))) & ((1n << 64n) - 1n)
  }
  return `fnv64$${hash.toString(16)}`
}

/** Legacy SHA-256 hash used by the first version of this feature (never stored again after upgrade-on-verify). */
async function legacyHashSecret(secret: string, domain: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    let hash = 5381
    for (let index = 0; index < `${salt}:${domain}:${secret}`.length; index++) {
      hash = ((hash << 5) + hash + `${salt}:${domain}:${secret}`.charCodeAt(index)) & 0xffffffff
    }
    return hash.toString(16).padStart(8, '0')
  }
  const digest = await subtle.digest('SHA-256', encoder.encode(`${salt}:${domain}:${secret}`))
  return hex(digest)
}

/** Verifies against stored hashes, accepting legacy v1 entries. Returns 'ok' when matched, 'upgrade' when it matched a legacy hash and should be re-hashed. */
async function verifySecret(stored: string, secret: string, domain: string): Promise<'ok' | 'upgrade' | 'no'> {
  if (stored.startsWith('pbkdf2$') || stored.startsWith('fnv64$')) {
    return constantTimeEqual(stored, await hashSecret(secret, domain)) ? 'ok' : 'no'
  }
  return (await legacyHashSecret(secret, domain, await getSalt())) === stored ? 'upgrade' : 'no'
}

async function listRecords(): Promise<OfflineUserRecord[]> {
  return (await getMeta<OfflineUserRecord[]>(USERS_KEY)) ?? []
}

export async function listOfflineUsers(): Promise<OfflineUserSummary[]> {
  const users = await listRecords()
  return users
    .map((record) => ({
      username: record.username,
      fullName: record.fullName,
      cachedAt: record.cachedAt,
      hasPin: Boolean(record.pinHash)
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** Updates the cached copy of a session in-place (fresh permissions/business, same credential hashes). Never drops the sign-in token. */
export async function refreshOfflineSession(session: LoginResponse): Promise<void> {
  const users = await listRecords()
  const record = users.find((user) => user.username.toLowerCase() === session.user.username.toLowerCase())
  if (!record) return
  record.session = { ...session, token: session.token ?? record.session.token }
  await setMeta(USERS_KEY, users)
}

/** Caches (or refreshes) the device copy of a signed-in user. Call after every successful online login. */
export async function saveOfflineCredential(session: LoginResponse, password: string): Promise<void> {
  const users = await listRecords()
  const existing = users.find((user) => user.username === session.user.username)
  const record: OfflineUserRecord = {
    username: session.user.username,
    fullName: session.user.fullName,
    passwordHash: await hashSecret(password, LEGACY_DOMAIN),
    pinHash: existing?.pinHash ?? null,
    cachedAt: new Date().toISOString(),
    session
  }
  await setMeta(USERS_KEY, [...users.filter((user) => user.username !== record.username), record])
}

/** Re-hashes the cached password after the user changes it online (keeps the old offline copy usable). */
export async function updateOfflinePassword(session: LoginResponse | null, newPassword: string): Promise<void> {
  if (!session?.user?.username) return
  const users = await listRecords()
  const record = users.find((user) => user.username.toLowerCase() === session.user.username.toLowerCase())
  if (!record) return
  record.passwordHash = await hashSecret(newPassword, LEGACY_DOMAIN)
  record.cachedAt = new Date().toISOString()
  record.session = { ...session, token: session.token }
  await setMeta(USERS_KEY, users)
}

/** Sets or clears (empty pin) the counter PIN of a cached user. Restricted to the currently signed-in account. */
export async function setOfflinePin(username: string, pin: string): Promise<void> {
  const target = username.trim()
  const caller = getStoredSession<LoginResponse>()?.user?.username?.trim().toLowerCase()
  if (caller !== target.toLowerCase()) {
    throw new Error('Only the account you are signed in with can change its offline PIN.')
  }
  const users = await listRecords()
  const record = users.find((user) => user.username === target)
  if (!record) throw new Error('Sign in online once before setting an offline PIN for this user.')
  const trimmed = pin.trim()
  if (/^\d{4,6}$/.test(trimmed)) {
    record.pinHash = await hashSecret(trimmed, 'pin')
  } else if (trimmed === '') {
    record.pinHash = null
  } else {
    throw new Error('PIN must be 4-6 digits.')
  }
  record.cachedAt = new Date().toISOString()
  await setMeta(USERS_KEY, users)
}

export async function forgetOfflineUser(username: string): Promise<void> {
  const users = await listRecords()
  const target = username.trim().toLowerCase()
  await setMeta(USERS_KEY, users.filter((user) => user.username.toLowerCase() !== target))
  const locks = await readLocks()
  delete locks[target]
  await setMeta(LOCK_KEY, locks)
}

export async function clearOfflineUsers(): Promise<void> {
  await setMeta(USERS_KEY, [])
  await setMeta(LOCK_KEY, {})
}

async function readLocks(): Promise<Record<string, OfflineLockBucket>> {
  const stored = await getMeta<Record<string, OfflineLockBucket> | OfflineLockBucket>(LOCK_KEY)
  if (!stored) return {}
  // Migrate the old single-bucket shape into the per-user map.
  if ('failures' in stored || 'lockedUntil' in stored) return {}
  return stored as Record<string, OfflineLockBucket>
}

function lockOf(locks: Record<string, OfflineLockBucket>, username: string): OfflineLockBucket {
  return locks[username.toLowerCase()] ?? { failures: 0, lockedUntil: null }
}

/** True when the cached JWT is expired (token can no longer unlock anything, online or offline). */
export function cachedSessionExpired(session: LoginResponse | null | undefined): boolean {
  const token = session?.token
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(payload64 + '='.repeat((4 - (payload64.length % 4)) % 4))) as { exp?: number }
    if (!payload.exp) return false
    return payload.exp * 1000 <= Date.now()
  } catch {
    return false
  }
}

/**
 * Validates a password or counter PIN against the local cache and returns the cached
 * session. Throws with a shop-friendly message on mismatch or lock.
 */
export async function unlockOffline(usernameInput: string, secret: string): Promise<LoginResponse> {
  const username = usernameInput.trim().toLowerCase()
  if (!username) throw new Error('Enter the username.')
  if (!secret.trim()) throw new Error('Enter the counter password or PIN.')

  const locks = await readLocks()
  const bucket = lockOf(locks, username)
  if (bucket.lockedUntil) {
    const until = new Date(bucket.lockedUntil).getTime()
    if (until > Date.now()) {
      const seconds = Math.ceil((until - Date.now()) / 1000)
      throw new Error(`Too many attempts — offline sign-in is locked for ${seconds} more seconds.`)
    }
    delete locks[username]
    await setMeta(LOCK_KEY, locks)
    bucket.failures = 0
    bucket.lockedUntil = null
  }

  const fail = async (message: string): Promise<never> => {
    const failures = bucket.failures + 1
    if (failures >= MAX_FAILURES) {
      locks[username] = { failures: 0, lockedUntil: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() }
      await setMeta(LOCK_KEY, locks)
      throw new Error(`Incorrect password or PIN — offline sign-in locked for ${LOCK_SECONDS} seconds.`)
    }
    locks[username] = { failures, lockedUntil: null }
    await setMeta(LOCK_KEY, locks)
    const left = MAX_FAILURES - failures
    throw new Error(`${message} ${left} attempt${left === 1 ? '' : 's'} left.`)
  }

  const users = await listRecords()
  const record = users.find((user) => user.username.toLowerCase() === username)
  if (!record) {
    return fail('Incorrect password or PIN.')
  }

  const secretTrimmed = secret.trim()
  const passwordMatch = await verifySecret(record.passwordHash, secretTrimmed, LEGACY_DOMAIN)
  const pinMode = /^\d{4,6}$/.test(secretTrimmed)
  const pinMatch = record.pinHash ? await verifySecret(record.pinHash, secretTrimmed, 'pin') : 'no'

  if (passwordMatch === 'no' && pinMatch === 'no') {
    return fail('Incorrect password or PIN.')
  }

  // Transparent upgrade: re-hash legacy hashes with PBKDF2.
  let changed = false
  if (passwordMatch === 'upgrade') {
    record.passwordHash = await hashSecret(secretTrimmed, LEGACY_DOMAIN)
    changed = true
  }
  if (pinMatch === 'upgrade' && record.pinHash) {
    record.pinHash = await hashSecret(secretTrimmed, 'pin')
    changed = true
  }
  if (changed) {
    await setMeta(USERS_KEY, users)
  }

  if (locks[username]) {
    delete locks[username]
    await setMeta(LOCK_KEY, locks)
  }

  if (cachedSessionExpired(record.session)) {
    throw new Error('This device needs one online sign-in to re-enable offline access (the saved session expired).')
  }

  return record.session
}
