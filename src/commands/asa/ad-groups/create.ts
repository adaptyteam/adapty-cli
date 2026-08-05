import {Command, Flags} from '@oclif/core'

import type {AsaAdGroupMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {
  currencyFlag,
  money,
  moneyFlag,
  pricingModelFlag,
  scheduleFlags,
  startOfDayUtc,
  todayUtc,
} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdGroupsCreate extends Command {
  static description = 'Create an ad group inside a campaign'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa ad-groups create --campaign UUID --name "Brand terms" --default-bid 1.20',
    '<%= config.bin %> asa ad-groups create --campaign UUID --name "Brand terms" --default-bid 1.20 --start-time 2026-09-01 --pricing-model CPM',
  ]
  static flags = {
    ...currencyFlag,
    ...scheduleFlags,
    ...pricingModelFlag,
    ...confirmFlags,
    'automated-keywords': Flags.boolean({allowNo: true, description: 'Let Apple add keywords automatically'}),
    campaign: Flags.string({description: 'Campaign ID (UUID)', required: true}),
    'cpa-goal': moneyFlag('CPA goal'),
    'default-bid': moneyFlag('Default bid', {required: true}),
    name: Flags.string({description: 'Ad group name', required: true}),
    status: Flags.string({description: 'Initial status', options: ['ENABLED', 'PAUSED']}),
  }

  async run(): Promise<AsaAdGroupMutationDTO> {
    const {flags} = await this.parse(AsaAdGroupsCreate)
    if (!isValidUuid(flags.campaign)) this.error('Invalid campaign ID format.', {exit: 2})

    const body = {
      automated_keywords_opt_in: flags['automated-keywords'],
      campaign_id: flags.campaign,
      cpa_goal: money(flags['cpa-goal'], flags.currency),
      default_bid_amount: money(flags['default-bid'], flags.currency),
      end_time: startOfDayUtc(flags['end-time']),
      name: flags.name,
      pricing_model: flags['pricing-model'],
      start_time: startOfDayUtc(flags['start-time'] ?? todayUtc()),
      status: flags.status,
    }
    await confirmMutation(
      this,
      {body, method: 'POST', path: '/ad-groups/', summary: `Create ad group ${flags.name}`},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const result = await client.post<AsaAdGroupMutationDTO>('/ad-groups', body)

    if (result.ad_group) this.log('Ad group created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
