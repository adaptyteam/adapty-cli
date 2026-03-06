import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface PaywallItem {
  id: string
  name: string
}

export default class PaywallsList extends Command {
  static description = 'List paywalls for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> paywalls list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<PaywallItem>> {
    const {flags} = await this.parse(PaywallsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<PaywallItem>>(
      `/apps/${flags.app}/paywalls`,
      paginationParams(flags),
    )

    printList(
      result.data.map((pw) => ({ID: pw.id, Name: pw.name})),
      this.log.bind(this),
      result.meta.pagination,
    )

    return result
  }
}
