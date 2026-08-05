import {Command} from '@oclif/core'

import type {AsaNegativeKeywordDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {adGroupScopeFlags, scopeParams} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaNegativeKeywordsList extends Command {
  static description = 'List negative keywords; ad_group_id is empty for campaign-level ones'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa negative-keywords list',
    '<%= config.bin %> asa negative-keywords list --campaign CAMPAIGN_UUID',
  ]
  static flags = {...paginationFlags, ...adGroupScopeFlags}

  async run(): Promise<PaginatedResponse<AsaNegativeKeywordDTO>> {
    const {flags} = await this.parse(AsaNegativeKeywordsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaNegativeKeywordDTO>>(
      '/negative-keywords',
      {...paginationParams(flags), ...scopeParams(flags)},
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
