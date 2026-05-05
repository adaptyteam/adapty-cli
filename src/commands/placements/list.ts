import {Command} from '@oclif/core'

import type {PlacementSummaryDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

export default class PlacementsList extends Command {
  static description = 'List placements for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> placements list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<PlacementSummaryDTO>> {
    const {flags} = await this.parse(PlacementsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<PlacementSummaryDTO>>(
      `/apps/${flags.app}/placements`,
      paginationParams(flags),
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
