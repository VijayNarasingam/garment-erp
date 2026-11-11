import { normalizeAgentUrl } from './printPrefs'
import type { AgentHealth, AgentPrintResponse, AgentPrintersResponse } from './types'

export class AgentError extends Error {
  code: string
  status?: number
  /** True when the request may have reached the agent. Used to avoid duplicate paper. */
  sent: boolean

  constructor(code: string, message: string, status?: number, sent = false) {
    super(message)
    this.name = 'AgentError'
    this.code = code
    this.status = status
    this.sent = sent
  }
}

async function request(
  baseUrl: string,
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown; timeout: number; sentOnTimeout: boolean }
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout)
  try {
    const response = await fetch(`${normalizeAgentUrl(baseUrl)}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.token ? { 'X-Print-Agent-Token': options.token } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    })

    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }

    if (!response.ok) {
      const body = (payload ?? {}) as { code?: string; message?: string; error?: { code?: string; message?: string } }
      const code = body.error?.code ?? body.code ?? `HTTP_${response.status}`
      const message = body.error?.message ?? body.message ?? `Print agent returned ${response.status}.`
      throw new AgentError(code, message, response.status, true)
    }

    if (payload === null) throw new AgentError('INVALID_RESPONSE', 'Print agent returned an unreadable response.', response.status, true)
    return payload
  } catch (error) {
    if (error instanceof AgentError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AgentError(
        'AGENT_TIMEOUT',
        'The print agent did not respond in time. Check the paper before retrying.',
        undefined,
        options.sentOnTimeout
      )
    }
    throw new AgentError(
      'AGENT_UNREACHABLE',
      'The local print agent is not running. Start it or use browser print.',
      undefined,
      false
    )
  } finally {
    clearTimeout(timer)
  }
}

export function agentHealth(baseUrl: string, timeout = 1500): Promise<AgentHealth> {
  return request(baseUrl, '/health', { timeout, sentOnTimeout: false }) as Promise<AgentHealth>
}

export function agentPrinters(baseUrl: string, token: string, timeout = 3000): Promise<AgentPrintersResponse> {
  return request(baseUrl, '/printers', { token, timeout, sentOnTimeout: false }) as Promise<AgentPrintersResponse>
}

export function agentPrint(
  baseUrl: string,
  token: string,
  job: { printer: string; jobName: string; dataBase64: string; copies: number },
  timeout = 12000
): Promise<AgentPrintResponse> {
  return request(baseUrl, '/print', {
    method: 'POST',
    token,
    body: job,
    timeout,
    sentOnTimeout: true
  }) as Promise<AgentPrintResponse>
}

/**
 * Stores the measured characters per line with the printer, so every browser on
 * this PC uses the same width.
 */
export function agentSetColumns(
  baseUrl: string,
  token: string,
  printer: string,
  columns: number,
  timeout = 5000
): Promise<{ printer: string; columns: number }> {
  return request(baseUrl, '/printer-columns', {
    method: 'POST',
    token,
    body: { printer, columns },
    timeout,
    sentOnTimeout: false
  }) as Promise<{ printer: string; columns: number }>
}
