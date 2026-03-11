import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {printResponse} from '../../lib/output.js'

export default class AuthWhoami extends Command {
  static description = 'Show current user info from server (verifies token)'
static enableJsonFlag = true
static examples = ['<%= config.bin %> auth whoami']

  async run(): Promise<Record<string, unknown>> {
    await this.parse(AuthWhoami)
    const client = await createAuthenticatedClient(this.config)
    const me = await client.get<Record<string, unknown>>('/me')

    printResponse(me, this.log.bind(this))

    return me
  }
}
