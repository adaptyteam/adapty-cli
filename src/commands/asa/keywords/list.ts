import {Command} from '@oclif/core'

import type {AsaKeywordDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {adGroupScopeFlags, scopeParams, statusFilter} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaKeywordsList extends Command {
  static description = 'List targeting keywords; read numbers with asa metrics'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa keywords list',
    '<%= config.bin %> asa keywords list --ad-group AD_GROUP_UUID --status ACTIVE',
  ]
  static flags = {...paginationFlags, ...adGroupScopeFlags, ...statusFilter(['ACTIVE', 'PAUSED'])}

  async run(): Promise<PaginatedResponse<AsaKeywordDTO>> {
    const {flags} = await this.parse(AsaKeywordsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaKeywordDTO>>('/keywords', {
      ...paginationParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
