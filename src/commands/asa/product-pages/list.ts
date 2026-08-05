import {Command} from '@oclif/core'

import type {AsaProductPageDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {assetScopeFlags, scopeParams} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaProductPagesList extends Command {
  static description = 'List custom product pages (read-only; authoring stays in App Store Connect)'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa product-pages list',
    '<%= config.bin %> asa product-pages list --app APP_UUID',
  ]
  static flags = {...paginationFlags, ...assetScopeFlags}

  async run(): Promise<PaginatedResponse<AsaProductPageDTO>> {
    const {flags} = await this.parse(AsaProductPagesList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaProductPageDTO>>('/product-pages', {
      ...paginationParams(flags),
      ...scopeParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
