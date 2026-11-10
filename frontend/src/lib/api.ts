const TOKEN_KEY = 'garment.token'
const SESSION_KEY = 'garment.session'

export class ApiError extends Error {
  status: number
  code: string
  fieldErrors?: Record<string, string>
  /** True when the request never reached the server (offline, refused, timed out). */
  network: boolean

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string>, network = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.network = network
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getStoredSession<T>(): T | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setStoredSession(session: unknown | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

type QueryValue = string | number | boolean | null | undefined

export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const out = search.toString()
  return out ? `?${out}` : ''
}

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  raw?: boolean
  /** Hard response timeout in ms — turns a hanging server into a NETWORK_ERROR. */
  timeout?: number
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
  }

  let timedOut = false
  let controller: AbortController | undefined
  let timer: number | undefined
  let signal = options.signal
  if (options.timeout && options.timeout > 0) {
    controller = new AbortController()
    timer = window.setTimeout(() => {
      timedOut = true
      controller?.abort()
    }, options.timeout)
    if (signal) signal.addEventListener('abort', () => controller?.abort(), { once: true })
    signal = controller.signal
  }

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal
    })
  } catch (error) {
    if (timer) window.clearTimeout(timer)
    if ((error as Error).name === 'AbortError' && !timedOut && !controller) throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'You appear to be offline. The action could not reach the server.', undefined, true)
  }
  if (timer) window.clearTimeout(timer)

  if (response.status === 401) {
    setToken(null)
    setStoredSession(null)
    window.dispatchEvent(new CustomEvent('garment:unauthorized'))
  }

  if (!response.ok) {
    let code = 'REQUEST_FAILED'
    let message = `Request failed (${response.status}).`
    let fieldErrors: Record<string, string> | undefined
    let parsed = false
    try {
      const data = await response.json()
      code = data.code ?? code
      message = data.message ?? message
      fieldErrors = data.fieldErrors ?? undefined
      parsed = true
    } catch {
      // no JSON body
    }
    // 5xx means the server or proxy died before producing a meaningful HTTP response —
    // treat it as an unreachable server so auth keeps the cached counter session.
    const serverFailure = response.status >= 500
    if (!parsed && serverFailure) {
      throw new ApiError(
        response.status,
        'NETWORK_ERROR',
        'You appear to be offline. The action could not reach the server.',
        undefined,
        true
      )
    }
    throw new ApiError(response.status, code, message, fieldErrors, serverFailure)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, { headers })
  if (!response.ok) {
    throw new ApiError(response.status, 'DOWNLOAD_FAILED', 'The file could not be generated.')
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const name = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
