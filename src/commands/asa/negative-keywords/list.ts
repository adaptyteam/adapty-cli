import {Command, Flags} from '@oclif/core'

import type {AsaNegativeKeywordDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {adGroupScopeFlags, asaPaginationFlags, scopeParams} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaNegativeKeywordsList extends Command {
  static description = 'List negative keywords; ad_group_id is empty for campaign-level ones'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa negative-keywords list',
    '<%= config.bin %> asa negative-keywords list --campaign CAMPAIGN_UUID',
  ]
  static flags = {
    ...asaPaginationFlags,
    ...adGroupScopeFlags,
    'campaign-level-only': Flags.boolean({description: 'Keep only campaign-level rows (ad_group_id is null)'}),
  }

  async run(): Promise<PaginatedResponse<AsaNegativeKeywordDTO>> {
    const {flags} = await this.parse(AsaNegativeKeywordsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaNegativeKeywordDTO>>('/negative-keywords', {
      ...paginationParams(flags),
      ...scopeParams(flags),
      ...(flags['campaign-level-only'] ? {campaign_level_only: 'true'} : {}),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
