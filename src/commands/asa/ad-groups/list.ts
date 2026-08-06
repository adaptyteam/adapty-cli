import {Command} from '@oclif/core'

import type {AsaAdGroupDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {campaignScopeFlags, scopeParams, statusFilter} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaAdGroupsList extends Command {
  static description = 'List ad groups; read numbers with asa metrics'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa ad-groups list',
    '<%= config.bin %> asa ad-groups list --campaign CAMPAIGN_UUID',
  ]
  static flags = {...paginationFlags, ...campaignScopeFlags, ...statusFilter(['ENABLED', 'PAUSED'])}

  async run(): Promise<PaginatedResponse<AsaAdGroupDTO>> {
    const {flags} = await this.parse(AsaAdGroupsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaAdGroupDTO>>('/ad-groups', {
      ...paginationParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
