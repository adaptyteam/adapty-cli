import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface PlacementItem {
  developer_id: string
  id: string
  name: string
}

export default class PlacementsList extends Command {
  static description = 'List placements for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> placements list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<PlacementItem>> {
    const {flags} = await this.parse(PlacementsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<PlacementItem>>(
      `/apps/${flags.app}/placements`,
      paginationParams(flags),
    )

    printList(
      result.data.map((pl) => ({'Developer ID': pl.developer_id, ID: pl.id, Name: pl.name})),
      this.log.bind(this),
      result.meta.pagination,
    )

    return result
  }
}
