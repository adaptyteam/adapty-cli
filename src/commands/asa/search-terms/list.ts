import {Command} from '@oclif/core'

import type {AsaSearchTermDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {adGroupScopeFlags, periodFlags, periodParams, scopeParams} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaSearchTermsList extends Command {
  static description = 'List the search terms your ads matched, with their metrics'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa search-terms list --date-from 2026-07-01 --date-to 2026-07-31',
    '<%= config.bin %> asa search-terms list --ad-group AD_GROUP_UUID',
  ]
  static flags = {...paginationFlags, ...periodFlags, ...adGroupScopeFlags}

  async run(): Promise<PaginatedResponse<AsaSearchTermDTO>> {
    const {flags} = await this.parse(AsaSearchTermsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaSearchTermDTO>>('/search-terms', {
      ...paginationParams(flags),
      ...periodParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
