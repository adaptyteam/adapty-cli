import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, paginationFlags, paginationParams} from '../../lib/flags.js'
import {isValidUuid, printList} from '../../lib/output.js'

interface PlacementItem {
  developer_id: string
  id: string
  name: string
}

interface PaginatedResponse {
  data: PlacementItem[]
  meta: {pagination: {count: number; page: number; pages: number}}
}

export default class PlacementsList extends Command {
  static description = 'List placements for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> placements list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse> {
    const {flags} = await this.parse(PlacementsList)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse>(
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
