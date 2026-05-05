import {Command} from '@oclif/core'

import type {PaywallDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

export default class PaywallsList extends Command {
  static description = 'List paywalls for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> paywalls list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<PaywallDTO>> {
    const {flags} = await this.parse(PaywallsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<PaywallDTO>>(
      `/apps/${flags.app}/paywalls`,
      paginationParams(flags),
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
