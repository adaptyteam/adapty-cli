import {Command} from '@oclif/core'

import {readConfig, writeConfig} from '../../lib/config.js'

export default class AuthLogout extends Command {
  static description = 'Remove stored authentication token'
static enableJsonFlag = true
static examples = ['<%= config.bin %> auth logout']

  async run(): Promise<{status: string}> {
    await this.parse(AuthLogout)
    const config = await readConfig(this.config.configDir)

    if (!config.access_token) {
      this.log('Not currently authenticated.')
      return {status: 'not_authenticated'}
    }

    await writeConfig({}, this.config.configDir)
    this.log('Logged out. Note: token remains valid server-side until expiry.')
    return {status: 'logged_out'}
  }
}
