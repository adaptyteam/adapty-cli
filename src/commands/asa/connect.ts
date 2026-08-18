import {Command, Flags} from '@oclif/core'
import open from 'open'

import type {AsaAppleOAuthDTO, AsaMeDTO} from '../../lib/asa-schemas.js'

import {createAsaClient} from '../../lib/asa-client.js'

const POLL_INTERVAL_MS = 3000

export default class AsaConnect extends Command {
  static description = 'Connect an Apple Search Ads account to this company'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa connect', '<%= config.bin %> asa connect --no-wait']
  static flags = {
    timeout: Flags.integer({default: 300, description: 'Seconds to wait for the browser step'}),
    wait: Flags.boolean({allowNo: true, default: true, description: 'Wait until Apple Ads reports as connected'}),
  }

  async run(): Promise<AsaAppleOAuthDTO | AsaMeDTO> {
    const {flags} = await this.parse(AsaConnect)
    const client = await createAsaClient(this.config)

    const {auth_url: authUrl} = await client.get<AsaAppleOAuthDTO>('/apple/oauth')
    this.log(`If the browser doesn't open, visit: ${authUrl}\n`)
    this.log('The link is valid for one hour. Sign in to the Adapty dashboard in that browser first — the last')
    this.log('step is authorized by the dashboard session, not by this CLI.')

    if (process.stdin.isTTY === true) await open(authUrl).catch(() => false)

    if (!flags.wait) return {auth_url: authUrl}

    const deadline = Date.now() + flags.timeout * 1000
    let status: AsaMeDTO | undefined
    while (Date.now() < deadline) {
      status = await client.get<AsaMeDTO>('/me')
      if (status.apple_credentials_status === 'active') {
        this.log('Apple Ads connected. The first metadata import starts automatically.')
        return status
      }

      await new Promise((resolve) => {
        setTimeout(resolve, POLL_INTERVAL_MS)
      })
    }

    this.log(`Still not connected after ${flags.timeout}s. The usual cause is a browser that is not signed in to`)
    this.log(`the Adapty dashboard. Finish the browser step, then check with: ${this.config.bin} asa whoami`)

    return status ?? {auth_url: authUrl}
  }
}
