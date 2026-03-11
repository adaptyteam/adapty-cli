import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {readConfig, writeConfig} from '../../lib/config.js'

export default class AuthRevoke extends Command {
  static description = 'Revoke the current authentication token'
static enableJsonFlag = true
static examples = ['<%= config.bin %> auth revoke']

  async run(): Promise<{status: string}> {
    await this.parse(AuthRevoke)
    const config = await readConfig(this.config.configDir)

    if (!config.access_token) {
      this.log('Not currently authenticated.')
      return {status: 'not_authenticated'}
    }

    const client = await createAuthenticatedClient(this.config)
    await client.post('/auth/tokens/revoke', {token: config.access_token})
    await writeConfig({}, this.config.configDir)

    this.log('Token revoked and logged out.')
    return {status: 'revoked'}
  }
}
