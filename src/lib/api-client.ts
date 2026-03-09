import {ApiError, NetworkError, parseApiError} from './errors.js'

const DEFAULT_API_URL = 'https://api.adapty.io/api/v1/developer'

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

export interface ApiClientOptions {
  baseUrl?: string
  token?: null | string
  userAgent?: string
}

export class ApiClient {
  private baseUrl: string
  private token: null | string
  private userAgent: string

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.ADAPTY_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '')
    if (this.baseUrl !== DEFAULT_API_URL) {
      process.stderr.write(`Warning: using non-default API URL: ${this.baseUrl}\n`)
    }

    this.token = opts.token ?? null
    this.userAgent = opts.userAgent ?? 'adapty-cli'
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${ensureTrailingSlash(path)}`
    if (params) {
      const qs = new URLSearchParams(params)
      url += `?${qs.toString()}`
    }

    return this.request<T>(url, {method: 'GET'})
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(`${this.baseUrl}${ensureTrailingSlash(path)}`, {
      body: body ? JSON.stringify(body) : undefined,
      method: 'POST',
    })
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(`${this.baseUrl}${ensureTrailingSlash(path)}`, {
      body: body ? JSON.stringify(body) : undefined,
      method: 'PUT',
    })
  }

  // eslint-disable-next-line no-undef
  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
    }

    if (init.body) {
      headers['Content-Type'] = 'application/json'
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    let response: Response
    try {
      response = await fetch(url, {...init, headers})
    } catch (error) {
      throw new NetworkError(error instanceof Error ? error.message : 'Connection failed')
    }

    if (response.status === 204) {
      return undefined as T
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      if (!response.ok) {
        throw new ApiError(response.status, `http_${response.status}`, {})
      }

      return undefined as T
    }

    if (!response.ok) {
      const error = parseApiError(response.status, body)
      if (response.status === 401) {
        error.message = 'Token expired or invalid. Run `adapty auth login`.'
      }

      throw error
    }

    return body as T
  }
}
