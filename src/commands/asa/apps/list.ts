import {Command} from '@oclif/core'

import type {AsaAppDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaAppsList extends Command {
  static description = 'List the apps promoted by this company in Apple Search Ads'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa apps list', '<%= config.bin %> asa apps list --page 2 --page-size 50']
  static flags = {...paginationFlags}

  async run(): Promise<PaginatedResponse<AsaAppDTO>> {
    const {flags} = await this.parse(AsaAppsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaAppDTO>>('/apps', paginationParams(flags))

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
