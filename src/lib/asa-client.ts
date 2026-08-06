import type {Config} from '@oclif/core'

import {randomUUID} from 'node:crypto'

import {ApiClient, type QueryParams} from './api-client.js'
import {resolveToken} from './auth.js'
import {buildUserAgent} from './client-from-config.js'
import {AuthRequiredError, NetworkError} from './errors.js'

export const ASA_API_URL = 'https://api-asa-admin.adapty.io/api/v1/cli'
export const ASA_API_URL_ENV_VAR = 'ADAPTY_ASA_API_URL'

export async function createAsaClient(config: Config): Promise<ApiClient> {
  const token = await resolveToken(config.configDir)
  if (!token) throw new AuthRequiredError()

  return new ApiClient({
    defaultBaseUrl: ASA_API_URL,
    errorFormat: 'asa',
    token,
    urlEnvVar: ASA_API_URL_ENV_VAR,
    userAgent: buildUserAgent(config),
  })
}

export interface AsaWriteOptions {
  body?: unknown
  idempotencyKey?: string
  params?: QueryParams
}

export interface AsaWriteOutcome<T> {
  replayed: boolean
  result: T
}

export async function asaWrite<T>(
  client: ApiClient,
  method: 'post' | 'put',
  path: string,
  opts: AsaWriteOptions = {},
): Promise<AsaWriteOutcome<T>> {
  const key = opts.idempotencyKey ?? randomUUID()
  let replayed = false
  const requestOpts = {
    headers: {'Idempotency-Key': key},
    onResponse(headers: Headers) {
      replayed = headers.get('Idempotency-Replayed') === 'true'
    },
  }
  const send = (): Promise<T> =>
    method === 'post'
      ? client.post<T>(path, opts.body, opts.params, requestOpts)
      : client.put<T>(path, opts.body, opts.params, requestOpts)

  try {
    const result = await send()
    return {replayed, result}
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error
    const result = await send()
    return {replayed, result}
  }
}

export function noteReplay(replayed: boolean, log: (msg: string) => void): void {
  if (replayed) log('Already applied earlier — showing the stored result.')
}
