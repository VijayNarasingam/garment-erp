import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, getStoredSession, getToken, setStoredSession, setToken } from './api'
import { refreshOfflineSession, saveOfflineCredential, unlockOffline } from './offlineAuth'
import type { BranchInfo, BusinessInfo, LoginResponse, UserInfo } from './types'

interface AuthContextValue {
  session: LoginResponse | null
  user: UserInfo | null
  business: BusinessInfo | null
  branches: BranchInfo[]
  branchId: number | null
  setBranchId: (id: number) => void
  login: (username: string, password: string) => Promise<LoginResponse>
  /** Local, server-free sign-in from the cached device credentials. Sets `offline`. */
  offlineUnlock: (username: string, secret: string) => Promise<LoginResponse>
  logout: () => void
  has: (...permissions: string[]) => boolean
  hasAny: (...permissions: string[]) => boolean
  refresh: () => Promise<void>
  ready: boolean
  /** Session is valid but the server is unreachable (or the session was unlocked offline). */
  offline: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)
const BRANCH_KEY = 'garment.branch'
/** Poll used to detect the server coming back while in offline mode. */
const RECONNECT_POLL_MS = 25_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<LoginResponse | null>(() => getStoredSession<LoginResponse>())
  const [offline, setOffline] = useState(false)
  const [branchId, setBranchIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(BRANCH_KEY)
    return stored ? Number(stored) : null
  })
  const [ready, setReady] = useState(false)
  /** Avoids racing StrictMode double-mount refreshes against an offline fallback. */
  const refreshingRef = useRef(false)
  /** Consecutive network misses — a single slow poll must not bounce the counter offline. */
  const networkMissesRef = useRef(0)

  const logout = useCallback(() => {
    setToken(null)
    setStoredSession(null)
    setSession(null)
    setOffline(false)
    queryClient.clear()
  }, [queryClient])

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setReady(true)
      return
    }
    if (refreshingRef.current) return
    refreshingRef.current = true
    try {
      const next = await api<LoginResponse>('/api/auth/me', { timeout: 10000 })
      networkMissesRef.current = 0
      const current = getStoredSession<LoginResponse>()
      // /api/auth/me intentionally returns no token — keep the one we signed in with.
      const merged = { ...next, token: next.token ?? current?.token }
      // Keep the poll silent — only replace the session when identity details actually change.
      const stable = (response: LoginResponse) => JSON.stringify({ u: response.user, b: response.business })
      setOffline(false)
      if (current && stable(current) === stable(merged)) {
        void refreshOfflineSession(merged).catch(() => undefined)
      } else {
        setSession(merged)
        setStoredSession(merged)
        void refreshOfflineSession(merged).catch(() => undefined)
      }
      // Repair localStorage: an earlier refresh may have stamped a tokenless /me body.
      if (merged.token) setToken(merged.token)
    } catch (error) {
      if (error instanceof ApiError && error.network) {
        // Server unreachable — a single slow poll must not bounce the counter out
        // of the full app. Two consecutive misses mean it is really down.
        networkMissesRef.current += 1
        if (networkMissesRef.current >= 2) setOffline(true)
      } else {
        logout()
      }
    } finally {
      refreshingRef.current = false
      setReady(true)
    }
  }, [logout])

  const applyOfflineSession = useCallback((response: LoginResponse) => {
    // Preserve a token from the cache if present; otherwise keep the existing one.
    const token = response.token ?? getToken()
    setToken(token)
    const merged = { ...response, token: token ?? undefined }
    setStoredSession(merged)
    setSession(merged)
    setOffline(true)
    const preferred = response.user.defaultBranchId ?? response.user.branches[0]?.id ?? null
    if (preferred) {
      setBranchIdState(preferred)
      localStorage.setItem(BRANCH_KEY, String(preferred))
    }
    return response
  }, [])

  useEffect(() => {
    void refresh()
    const handler = () => {
      networkMissesRef.current = 0
      queryClient.clear()
      setOffline(false)
      setSession(null)
    }
    window.addEventListener('garment:unauthorized', handler)
    // While offline, quietly look for the server to come back and re-validate.
    const poll = window.setInterval(() => {
      if (getToken() && !refreshingRef.current) void refresh()
    }, RECONNECT_POLL_MS)
    const networkHandler = () => {
      if (getToken()) void refresh()
    }
    window.addEventListener('online', networkHandler)
    return () => {
      window.removeEventListener('garment:unauthorized', handler)
      window.removeEventListener('online', networkHandler)
      window.clearInterval(poll)
    }
  }, [refresh, queryClient])

  const login = useCallback(async (username: string, password: string) => {
    const response = await api<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      timeout: 7000
    })
    setToken(response.token)
    setStoredSession(response)
    setSession(response)
    setOffline(false)
    // Cache for future offline sign-ins — best effort, never blocks login.
    void saveOfflineCredential(response, password).catch(() => undefined)
    const preferred = response.user.defaultBranchId ?? response.user.branches[0]?.id ?? null
    if (preferred) {
      setBranchIdState(preferred)
      localStorage.setItem(BRANCH_KEY, String(preferred))
    }
    return response
  }, [])

  const offlineUnlock = useCallback(
    async (username: string, secret: string) => {
      const response = await unlockOffline(username, secret)
      return applyOfflineSession(response)
    },
    [applyOfflineSession]
  )

  const branches = session?.user.branches ?? []

  const setBranchId = useCallback((id: number) => {
    setBranchIdState(id)
    localStorage.setItem(BRANCH_KEY, String(id))
  }, [])

  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchIdState(branches[0].id)
      localStorage.setItem(BRANCH_KEY, String(branches[0].id))
    }
  }, [branchId, branches])

  const has = useCallback(
    (...permissions: string[]) => {
      const owned = new Set(session?.user.permissions ?? [])
      return permissions.every((permission) => owned.has(permission))
    },
    [session]
  )

  const hasAny = useCallback(
    (...permissions: string[]) => {
      const owned = new Set(session?.user.permissions ?? [])
      return permissions.some((permission) => owned.has(permission))
    },
    [session]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      business: session?.business ?? null,
      branches,
      branchId: branchId && branches.some((branch) => branch.id === branchId) ? branchId : (branches[0]?.id ?? null),
      setBranchId,
      login,
      offlineUnlock,
      logout,
      has,
      hasAny,
      refresh,
      ready,
      offline
    }),
    [session, branches, branchId, setBranchId, login, offlineUnlock, logout, has, hasAny, refresh, ready, offline]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
