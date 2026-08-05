import {Args, Command} from '@oclif/core'

import type {AsaAdGroupDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {periodFlags, periodParams} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdGroupsGet extends Command {
  static args = {
    ad_group_id: Args.string({description: 'Ad group ID (UUID)', required: true}),
  }
  static description = 'Show one ad group with its metrics'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa ad-groups get 550e8400-e29b-41d4-a716-446655440000']
  static flags = {...periodFlags}

  async run(): Promise<AsaAdGroupDTO> {
    const {args, flags} = await this.parse(AsaAdGroupsGet)
    if (!isValidUuid(args.ad_group_id)) this.error('Invalid ad group ID format.', {exit: 2})

    const client = await createAsaClient(this.config)
    const result = await client.get<AsaAdGroupDTO>(`/ad-groups/${args.ad_group_id}`, periodParams(flags))

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
