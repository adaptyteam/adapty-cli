import {Command, Flags} from '@oclif/core'

import type {AsaAdMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {idempotencyFlags} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdsCreate extends Command {
  static description = 'Create an ad from a creative in an ad group'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa ads create --ad-group UUID --creative-id 4321 --name "Summer ad"']
  static flags = {
    ...confirmFlags,
    ...idempotencyFlags,
    'ad-group': Flags.string({description: 'Ad group ID (UUID) — the campaign is resolved from it', required: true}),
    'creative-id': Flags.integer({description: 'Apple creative ID from a product page or the default set', required: true}),
    name: Flags.string({description: 'Ad name', required: true}),
    status: Flags.string({description: 'Initial status', options: ['ENABLED', 'PAUSED']}),
  }

  async run(): Promise<AsaAdMutationDTO> {
    const {flags} = await this.parse(AsaAdsCreate)
    if (!isValidUuid(flags['ad-group'])) this.error('Invalid ad group ID format.', {exit: 2})

    const body = {
      ad_group_id: flags['ad-group'],
      creative_id: flags['creative-id'],
      name: flags.name,
      ...(flags.status === undefined ? {} : {status: flags.status}),
    }
    await confirmMutation(this, {body, method: 'POST', path: '/ads/', summary: `Create ad ${flags.name}`}, flags.yes)

    const client = await createAsaClient(this.config)
    const {replayed, result} = await asaWrite<AsaAdMutationDTO>(client, 'post', '/ads', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    noteReplay(replayed, this.log.bind(this))
    if (result.ad && !replayed) this.log('Ad created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
