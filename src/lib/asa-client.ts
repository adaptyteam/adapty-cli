import type {Config} from '@oclif/core'

import {ApiClient} from './api-client.js'
import {resolveToken} from './auth.js'
import {buildUserAgent} from './client-from-config.js'
import {AuthRequiredError} from './errors.js'

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
