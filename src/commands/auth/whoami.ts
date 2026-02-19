import {Command} from '@oclif/core'

import {ApiClient} from '../../lib/api-client.js'
import {resolveToken} from '../../lib/auth.js'
import {AuthRequiredError} from '../../lib/errors.js'

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
    const token = await resolveToken(this.config.configDir)
    if (!token) throw new AuthRequiredError()

    const client = new ApiClient({
      token,
      userAgent: `adapty-cli/${this.config.version} node/${process.version} ${process.platform}/${process.arch}`,
    })

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
