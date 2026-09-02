import {Command, Flags} from '@oclif/core'

import type {AsaAdGroupMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {
  currencyFlag,
  idempotencyFlags,
  money,
  moneyFlag,
  pricingModelFlag,
  scheduleFlags,
  startOfDayUtc,
  todayUtc,
} from '../../../lib/asa-flags.js'
import {confirmFlags, confirmMutation} from '../../../lib/confirm.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdGroupsCreate extends Command {
  static description =
    'Create an ad group inside a campaign; --automated creates the automated ad group a Max Conversions campaign needs to run'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa ad-groups create --campaign UUID --name "Brand terms" --default-bid 1.20',
    '<%= config.bin %> asa ad-groups create --campaign UUID --name "Brand terms" --default-bid 1.20 --start-time 2026-09-01 --pricing-model CPM',
    '<%= config.bin %> asa ad-groups create --campaign UUID --name "Automated Max Conv" --automated',
  ]
  static flags = {
    ...currencyFlag,
    ...scheduleFlags,
    ...pricingModelFlag,
    ...confirmFlags,
    ...idempotencyFlags,
    automated: Flags.boolean({
      description: 'Create the automated ad group a Max Conversions campaign needs (no bid, no schedule, always ENABLED)',
      exclusive: ['automated-keywords'],
    }),
    'automated-keywords': Flags.boolean({allowNo: true, description: 'Let Apple add keywords automatically'}),
    campaign: Flags.string({description: 'Campaign ID (UUID)', required: true}),
    'cpa-goal': moneyFlag('CPA goal'),
    'default-bid': moneyFlag('Default bid; required unless --automated is set'),
    name: Flags.string({description: 'Ad group name', required: true}),
    status: Flags.string({description: 'Initial status', options: ['ENABLED', 'PAUSED']}),
  }

  async run(): Promise<AsaAdGroupMutationDTO> {
    const {flags} = await this.parse(AsaAdGroupsCreate)
    if (!isValidUuid(flags.campaign)) this.error('Invalid campaign ID format.', {exit: 2})
    if (!flags.automated && flags['default-bid'] === undefined) {
      this.error('--default-bid is required unless --automated is set.', {exit: 2})
    }

    if (flags.automated && flags['start-time'] !== undefined) {
      this.error('--start-time is not allowed with --automated: Apple schedules the automated ad group itself.', {exit: 2})
    }

    if (flags.automated && flags.status === 'PAUSED') {
      this.error('An automated ad group must be ENABLED; pause the campaign instead.', {exit: 2})
    }

    const body = {
      automated_keywords_opt_in: flags.automated ? true : flags['automated-keywords'],
      automated_keywords_required: flags.automated ? true : undefined,
      campaign_id: flags.campaign,
      cpa_goal: money(flags['cpa-goal'], flags.currency),
      default_bid_amount: money(flags['default-bid'], flags.currency),
      end_time: startOfDayUtc(flags['end-time']),
      name: flags.name,
      pricing_model: flags['pricing-model'],
      start_time: flags.automated ? undefined : startOfDayUtc(flags['start-time'] ?? todayUtc()),
      status: flags.status,
    }
    await confirmMutation(
      this,
      {body, method: 'POST', path: '/ad-groups/', summary: `Create ad group ${flags.name}`},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const {replayed, result} = await asaWrite<AsaAdGroupMutationDTO>(client, 'post', '/ad-groups', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    noteReplay(replayed, this.log.bind(this))
    if (result.ad_group && !replayed) this.log('Ad group created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
