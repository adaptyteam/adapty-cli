import {ApiError, type ApiErrorFormat, NetworkError, parseApiError} from './errors.js'

const DEFAULT_API_URL = 'https://api-admin.adapty.io/api/v1/developer'

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

export type QueryParams = Record<string, string | string[] | undefined>

export interface ApiClientOptions {
  baseUrl?: string
  defaultBaseUrl?: string
  errorFormat?: ApiErrorFormat
  token?: null | string
  urlEnvVar?: string
  userAgent?: string
}

export class ApiClient {
  private baseUrl: string
  private errorFormat: ApiErrorFormat
  private token: null | string
  private userAgent: string

  constructor(opts: ApiClientOptions = {}) {
    const defaultBaseUrl = opts.defaultBaseUrl ?? DEFAULT_API_URL
    const envBaseUrl = process.env[opts.urlEnvVar ?? 'ADAPTY_API_URL']
    this.baseUrl = (opts.baseUrl ?? envBaseUrl ?? defaultBaseUrl).replace(/\/$/, '')
    if (this.baseUrl !== defaultBaseUrl) {
      process.stderr.write(`Warning: using non-default API URL: ${this.baseUrl}\n`)
    }

    this.errorFormat = opts.errorFormat ?? 'developer'
    this.token = opts.token ?? null
    this.userAgent = opts.userAgent ?? 'adapty-cli'
  }

  async get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>(this.buildUrl(path, params), {method: 'GET'})
  }

  async post<T = unknown>(path: string, body?: unknown, params?: QueryParams): Promise<T> {
    return this.request<T>(this.buildUrl(path, params), {
      body: body ? JSON.stringify(body) : undefined,
      method: 'POST',
    })
  }

  async put<T = unknown>(path: string, body?: unknown, params?: QueryParams): Promise<T> {
    return this.request<T>(this.buildUrl(path, params), {
      body: body ? JSON.stringify(body) : undefined,
      method: 'PUT',
    })
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = `${this.baseUrl}${ensureTrailingSlash(path)}`
    if (!params) return url

    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      for (const item of Array.isArray(value) ? value : [value]) search.append(key, item)
    }

    return search.size === 0 ? url : `${url}?${search.toString()}`
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

    const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10)
    const errorOptions = this.errorFormat === 'asa' && !Number.isNaN(retryAfter) ? {retryAfterSeconds: retryAfter} : {}

    let body: unknown
    try {
      body = await response.json()
    } catch {
      if (!response.ok) {
        throw new ApiError(response.status, `http_${response.status}`, {}, errorOptions)
      }

      return undefined as T
    }

    if (!response.ok) {
      const error = parseApiError(response.status, body, errorOptions, this.errorFormat)
      if (response.status === 401) {
        error.message = 'Token expired or invalid. Run `adapty auth login`.'
      }

      throw error
    }

    return body as T
  }
}
