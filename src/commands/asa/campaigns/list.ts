import {Command} from '@oclif/core'

import type {AsaCampaignDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {asaPaginationFlags, orgScopeFlags, scopeParams, statusFilter} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaCampaignsList extends Command {
  static description = 'List Apple Search Ads campaigns; read numbers with asa metrics'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns list',
    '<%= config.bin %> asa campaigns list --app APP_UUID --status PAUSED',
  ]
  static flags = {...asaPaginationFlags, ...orgScopeFlags, ...statusFilter(['ENABLED', 'PAUSED'])}

  async run(): Promise<PaginatedResponse<AsaCampaignDTO>> {
    const {flags} = await this.parse(AsaCampaignsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaCampaignDTO>>('/campaigns', {
      ...paginationParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
