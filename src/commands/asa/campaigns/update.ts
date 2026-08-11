import {Args, Command, Flags} from '@oclif/core'

import type {AsaCampaignMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {currencyFlag, idempotencyFlags, money, moneyFlag} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaCampaignsUpdate extends Command {
  static args = {
    campaign_id: Args.string({description: 'Campaign ID (UUID)', required: true}),
  }
  static description = 'Change a campaign: budgets, countries, status or schedule'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns update UUID --status PAUSED',
    '<%= config.bin %> asa campaigns update UUID --daily-budget 80',
  ]
  static flags = {
    ...currencyFlag,
    ...confirmFlags,
    ...idempotencyFlags,
    'bidding-strategy': Flags.string({
      description: 'Bidding strategy',
      options: ['MANUAL_CPT', 'MAX_CONVERSIONS'],
    }),
    budget: moneyFlag('Lifetime budget'),
    country: Flags.string({description: 'Replace the country list, repeatable', multiple: true}),
    'daily-budget': moneyFlag('Daily budget'),
    name: Flags.string({description: 'Campaign name'}),
    status: Flags.string({description: 'Campaign status', options: ['ENABLED', 'PAUSED']}),
    'target-cpa': moneyFlag('Target CPA'),
  }

  async run(): Promise<AsaCampaignMutationDTO> {
    const {args, flags} = await this.parse(AsaCampaignsUpdate)
    if (!isValidUuid(args.campaign_id)) this.error('Invalid campaign ID format.', {exit: 2})

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.status !== undefined) body.status = flags.status
    if (flags.country !== undefined) body.countries_or_regions = flags.country
    if (flags['daily-budget'] !== undefined) body.daily_budget_amount = money(flags['daily-budget'], flags.currency)
    if (flags.budget !== undefined) body.budget_amount = money(flags.budget, flags.currency)
    if (flags['target-cpa'] !== undefined) body.target_cpa = money(flags['target-cpa'], flags.currency)
    if (flags['bidding-strategy'] !== undefined) body.bidding_strategy = flags['bidding-strategy']

    if (Object.keys(body).length === 0) {
      this.error('Nothing to change. Pass at least one field, e.g. --status PAUSED.', {exit: 2})
    }

    await confirmMutation(
      this,
      {body, method: 'PUT', path: `/campaigns/${args.campaign_id}/`, summary: 'Update campaign'},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const {replayed, result} = await asaWrite<AsaCampaignMutationDTO>(client, 'put', `/campaigns/${args.campaign_id}`, {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    noteReplay(replayed, this.log.bind(this))
    if (result.campaign && !replayed) this.log('Campaign updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
