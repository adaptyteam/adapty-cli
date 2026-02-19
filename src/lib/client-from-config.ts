import type {Config} from '@oclif/core'

import {ApiClient} from './api-client.js'
import {resolveToken} from './auth.js'
import {AuthRequiredError} from './errors.js'

export async function createAuthenticatedClient(config: Config): Promise<ApiClient> {
  const token = await resolveToken(config.configDir)
  if (!token) throw new AuthRequiredError()

  return new ApiClient({
    token,
    userAgent: `adapty-cli/${config.version} node/${process.version} ${process.platform}/${process.arch}`,
  })
}
