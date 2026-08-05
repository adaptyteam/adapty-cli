import {Command} from '@oclif/core'

import type {AsaCreativeDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {assetScopeFlags, scopeParams} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaCreativesList extends Command {
  static description = 'List creatives; creative_id is what `asa ads create` needs'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa creatives list',
    '<%= config.bin %> asa creatives list --app APP_UUID',
  ]
  static flags = {...paginationFlags, ...assetScopeFlags}

  async run(): Promise<PaginatedResponse<AsaCreativeDTO>> {
    const {flags} = await this.parse(AsaCreativesList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaCreativeDTO>>('/creatives', {
      ...paginationParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
