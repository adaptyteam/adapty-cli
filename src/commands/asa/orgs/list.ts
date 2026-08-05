import {Command} from '@oclif/core'

import type {AsaCampaignGroupDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaOrgsList extends Command {
  static description = 'List the Apple Search Ads organizations this company can spend from'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa orgs list']
  static flags = {...paginationFlags}

  async run(): Promise<PaginatedResponse<AsaCampaignGroupDTO>> {
    const {flags} = await this.parse(AsaOrgsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaCampaignGroupDTO>>('/campaign-groups', paginationParams(flags))

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
