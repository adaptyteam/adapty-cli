import {Command} from '@oclif/core'

import type {AsaAdDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {adScopeFlags, asaPaginationFlags, scopeParams, statusFilter} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaAdsList extends Command {
  static description = 'List ads; serving_state_reasons explains why an enabled ad is not running'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa ads list',
    '<%= config.bin %> asa ads list --ad-group AD_GROUP_UUID --status ENABLED',
  ]
  static flags = {...asaPaginationFlags, ...adScopeFlags, ...statusFilter(['ENABLED', 'PAUSED'])}

  async run(): Promise<PaginatedResponse<AsaAdDTO>> {
    const {flags} = await this.parse(AsaAdsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaAdDTO>>('/ads', {
      ...paginationParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
