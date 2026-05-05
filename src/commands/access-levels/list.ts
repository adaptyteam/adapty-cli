import {Command} from '@oclif/core'

import type {AccessLevelDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

export default class AccessLevelsList extends Command {
  static description = 'List access levels for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> access-levels list --app 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<AccessLevelDTO>> {
    const {flags} = await this.parse(AccessLevelsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<AccessLevelDTO>>(
      `/apps/${flags.app}/access-levels`,
      paginationParams(flags),
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
