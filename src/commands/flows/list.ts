import {Command} from '@oclif/core'

import type {FlowDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

export default class FlowsList extends Command {
  static description = 'List flows for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> flows list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<FlowDTO>> {
    const {flags} = await this.parse(FlowsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<FlowDTO>>(`/apps/${flags.app}/flows`, paginationParams(flags))

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
