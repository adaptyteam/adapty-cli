import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, paginationFlags, paginationParams} from '../../lib/flags.js'
import {isValidUuid, printList} from '../../lib/output.js'

interface PaywallItem {
  id: string
  name: string
}

interface PaginatedResponse {
  data: PaywallItem[]
  meta: {pagination: {count: number; page: number; pages: number}}
}

export default class PaywallsList extends Command {
  static description = 'List paywalls for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> paywalls list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse> {
    const {flags} = await this.parse(PaywallsList)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse>(
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
