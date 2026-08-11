import {Args, Command} from '@oclif/core'

import type {AsaAdDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdsGet extends Command {
  static args = {
    ad_id: Args.string({description: 'Ad ID (UUID)', required: true}),
  }
  static description = 'Show one ad and its serving state'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa ads get 550e8400-e29b-41d4-a716-446655440000']

  async run(): Promise<AsaAdDTO> {
    const {args} = await this.parse(AsaAdsGet)
    if (!isValidUuid(args.ad_id)) this.error('Invalid ad ID format.', {exit: 2})

    const client = await createAsaClient(this.config)
    const result = await client.get<AsaAdDTO>(`/ads/${args.ad_id}`)

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
