import {Command} from '@oclif/core'

import {readConfig} from '../../lib/config.js'

export default class AuthStatus extends Command {
  static description = 'Show current authentication state (local only)'
static enableJsonFlag = true
static examples = ['<%= config.bin %> auth status']

  async run(): Promise<Record<string, unknown>> {
    await this.parse(AuthStatus)
    const config = await readConfig(this.config.configDir)

    if (!config.access_token || !config.user) {
      this.log('Not authenticated. Run `adapty auth login`.')
      return {authenticated: false}
    }

    const masked = config.access_token.slice(0, 8) + '****'
    const configPath = `${this.config.configDir}/config.json`

    this.log(`Email: ${config.user.email}`)
    this.log(`Token: ${masked}`)
    this.log(`Config: ${configPath}`)

    return {
      authenticated: true,
      config_path: configPath,
      email: config.user.email,
      token_prefix: config.access_token.slice(0, 8),
    }
  }
}
