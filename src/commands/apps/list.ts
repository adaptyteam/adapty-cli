import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface AppItem {
  id: string
  sdk_key: string
  title: string
}

export default class AppsList extends Command {
  static description = 'List Adapty apps'
static enableJsonFlag = true
static examples = ['<%= config.bin %> apps list', '<%= config.bin %> apps list --page 2 --page-size 10']
static flags = {
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<AppItem>> {
    const {flags} = await this.parse(AppsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<AppItem>>('/apps', paginationParams(flags))

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
