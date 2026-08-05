import {Args, Command, Flags} from '@oclif/core'

import type {AsaAdMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdsUpdate extends Command {
  static args = {
    ad_id: Args.string({description: 'Ad ID (UUID)', required: true}),
  }
  static description = 'Rename an ad or pause it; the creative and ad group are fixed at creation'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa ads update UUID --status PAUSED']
  static flags = {
    ...confirmFlags,
    name: Flags.string({description: 'Ad name'}),
    status: Flags.string({description: 'Ad status', options: ['ENABLED', 'PAUSED']}),
  }

  async run(): Promise<AsaAdMutationDTO> {
    const {args, flags} = await this.parse(AsaAdsUpdate)
    if (!isValidUuid(args.ad_id)) this.error('Invalid ad ID format.', {exit: 2})

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.status !== undefined) body.status = flags.status

    if (Object.keys(body).length === 0) {
      this.error('Nothing to change. Pass --name or --status.', {exit: 2})
    }

    await confirmMutation(this, {body, method: 'PUT', path: `/ads/${args.ad_id}/`, summary: 'Update ad'}, flags.yes)

    const client = await createAsaClient(this.config)
    const result = await client.put<AsaAdMutationDTO>(`/ads/${args.ad_id}`, body)

    if (result.ad) this.log('Ad updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
