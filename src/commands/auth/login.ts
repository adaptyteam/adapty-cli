import {Command} from '@oclif/core'
import open from 'open'

import {ApiClient} from '../../lib/api-client.js'
import {buildUserAgent} from '../../lib/client-from-config.js'
import {readConfig, writeConfig} from '../../lib/config.js'
import {ApiError} from '../../lib/errors.js'

interface DeviceResponse {
  device_code: string
  expires_in: number
  interval_seconds: number
  user_code: string
  verification_uri: string
  verification_uri_complete: string
}

interface TokenSuccessResponse {
  access_token: string
  expires_in: number
  token_type: string
  user: {email: string; name: string}
}

interface TokenErrorResponse {
  error: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export default class AuthLogin extends Command {
  static description = 'Authenticate with Adapty via browser'
static examples = ['<%= config.bin %> auth login']

  async run(): Promise<void> {
    const config = await readConfig(this.config.configDir)
    if (config.access_token && config.user) {
      this.log(`Already authenticated as ${config.user.email}. Re-authenticating...`)
    }

    const client = new ApiClient({
      userAgent: buildUserAgent(this.config),
    })

    let device: DeviceResponse
    try {
      device = await client.post<DeviceResponse>('/auth/device', {client_id: 'adapty-cli'})
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'Failed to initiate auth flow', {exit: 1})
    }

    this.log(`\nYour code: ${device.user_code}\n`)
    this.log(`If browser doesn't open, visit: ${device.verification_uri_complete}\n`)

    try {
      await open(device.verification_uri_complete)
    } catch {
      // browser open failed silently — URL already printed
    }

    this.log('Waiting for authorization...')

    let interval = Math.max((device.interval_seconds || 5) * 1000, 5000)
    const deadline = Date.now() + device.expires_in * 1000
    let consecutiveErrors = 0

    // Handle Ctrl+C
    const onSignal = (): void => {
      this.log('\nLogin cancelled.')
      process.exit(0)
    }

    process.on('SIGINT', onSignal)

    try {
      while (Date.now() < deadline) {
        await sleep(interval)

        let result: TokenErrorResponse | TokenSuccessResponse
        try {
          result = await client.post<TokenErrorResponse | TokenSuccessResponse>('/auth/token', {
            client_id: 'adapty-cli',
            device_code: device.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          })
        } catch (error) {
          if (error instanceof ApiError) {
            switch (error.errorCode) {
              case 'authorization_pending': {
                continue
              }

              case 'slow_down': {
                interval += 5000
                continue
              }

              case 'access_denied': {
                this.error('Authorization denied.', {exit: 1})
                break
              }

              case 'expired_token': {
                this.error('Code expired. Run `adapty auth login` again.', {exit: 1})
                break
              }

              default:
                // unexpected API error — fall through to network error handling
            }
          }

          consecutiveErrors++
          if (consecutiveErrors >= 10) {
            this.error('Too many consecutive network errors. Check your connection and try again.', {exit: 1})
          }

          if (consecutiveErrors >= 3) {
            process.stderr.write(`Warning: ${consecutiveErrors} consecutive network errors (${error instanceof Error ? error.message : 'unknown'})\n`)
          }

          continue
        }

        consecutiveErrors = 0

        if ('access_token' in result) {
          await writeConfig(
            {
              access_token: result.access_token,
              user: result.user,
            },
            this.config.configDir,
          )

          this.log(`\nAuthenticated as ${result.user.email}`)
          this.log(`Token saved to ${this.config.configDir}/config.json`)
          return
        }
      }

      this.error('Code expired. Run `adapty auth login` again.', {exit: 1})
    } finally {
      process.removeListener('SIGINT', onSignal)
    }
  }
}
