import {Command} from '@oclif/core'

import type {AsaKeywordDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {adGroupScopeFlags, periodFlags, periodParams, scopeParams, statusFilter} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaKeywordsList extends Command {
  static description = 'List targeting keywords with their metrics'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa keywords list --date-from 2026-07-01 --date-to 2026-07-31',
    '<%= config.bin %> asa keywords list --ad-group AD_GROUP_UUID --status ACTIVE',
  ]
  static flags = {...paginationFlags, ...periodFlags, ...adGroupScopeFlags, ...statusFilter(['ACTIVE', 'PAUSED'])}

  async run(): Promise<PaginatedResponse<AsaKeywordDTO>> {
    const {flags} = await this.parse(AsaKeywordsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaKeywordDTO>>('/keywords', {
      ...paginationParams(flags),
      ...periodParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
