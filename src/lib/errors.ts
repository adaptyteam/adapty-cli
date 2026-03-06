export interface ApiErrorBody {
  error?: string
  error_code?: string
  errors?: Record<string, string[]>
  status_code?: number
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public fieldErrors: Record<string, string[]>,
  ) {
    super(errorCode)
    this.name = 'ApiError'
  }

  toHuman(): string {
    const lines: string[] = [`Error: ${this.errorCode}`]
    const entries = Object.entries(this.fieldErrors)
    if (entries.length > 0) {
      lines.push('Field errors:')
      for (const [field, msgs] of entries) {
        for (const msg of msgs) {
          lines.push(`  ${field}: ${msg}`)
        }
      }
    }

    return lines.join('\n')
  }

  toJSON(): ApiErrorBody {
    return {
      error_code: this.errorCode,
      errors: Object.keys(this.fieldErrors).length > 0 ? this.fieldErrors : undefined,
      status_code: this.statusCode,
    }
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }

  toHuman(): string {
    return `Error: Could not reach Adapty API. ${this.message}`
  }

  toJSON(): ApiErrorBody {
    return {error_code: 'network_error', errors: {connection: [this.message]}, status_code: 0}
  }
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Not authenticated. Run `adapty auth login`.')
    this.name = 'AuthRequiredError'
  }
}

export function parseApiError(statusCode: number, body: unknown): ApiError {
  if (!body || typeof body !== 'object') {
    return new ApiError(statusCode, `http_${statusCode}`, {})
  }

  const parsed = body as ApiErrorBody
  if (parsed.error_code) {
    return new ApiError(statusCode, parsed.error_code, parsed.errors ?? {})
  }

  if (parsed.error) {
    return new ApiError(statusCode, parsed.error, {})
  }

  return new ApiError(statusCode, `http_${statusCode}`, {})
}
