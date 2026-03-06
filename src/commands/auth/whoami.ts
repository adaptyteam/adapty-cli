import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'

interface MeResponse {
  companies: Array<{id: string; title: string}>
  email: string
  name: string
}

export default class AuthWhoami extends Command {
  static description = 'Show current user info from server (verifies token)'
static enableJsonFlag = true
static examples = ['<%= config.bin %> auth whoami']

  async run(): Promise<MeResponse> {
    await this.parse(AuthWhoami)
    const client = await createAuthenticatedClient(this.config)
    const me = await client.get<MeResponse>('/me')

    this.log(`Email: ${me.email}`)
    this.log(`Name: ${me.name}`)
    if (me.companies.length > 0) {
      this.log('Companies:')
      for (const company of me.companies) {
        this.log(`  ${company.title} (${company.id})`)
      }
    }

    return me
  }
}
