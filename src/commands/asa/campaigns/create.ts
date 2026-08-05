import {Command, Flags} from '@oclif/core'

import type {AsaCampaignMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {currencyFlag, money, moneyFlag} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaCampaignsCreate extends Command {
  static description = 'Create a campaign in Apple Search Ads'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns create --org UUID --name "Winter push" --adam-id 123456 --country US --daily-budget 50',
  ]
  static flags = {
    ...currencyFlag,
    ...confirmFlags,
    'ad-channel-type': Flags.string({default: 'SEARCH', description: 'Ad channel type', options: ['DISPLAY', 'SEARCH']}),
    'adam-id': Flags.integer({description: 'App Store app ID (adam_id)', required: true}),
    'bidding-strategy': Flags.string({
      description: 'Bidding strategy; Apple defaults to MANUAL_CPT when omitted',
      options: ['MANUAL_CPT', 'MAX_CONVERSIONS'],
    }),
    'billing-event': Flags.string({default: 'TAPS', description: 'Billing event', options: ['IMPRESSIONS', 'TAPS']}),
    budget: moneyFlag('Lifetime budget'),
    country: Flags.string({description: 'Country or region code, repeatable', multiple: true, required: true}),
    'daily-budget': moneyFlag('Daily budget', {required: true}),
    name: Flags.string({description: 'Campaign name', required: true}),
    org: Flags.string({description: 'Campaign group ID (UUID) — see `adapty asa orgs list`', required: true}),
    status: Flags.string({description: 'Initial status', options: ['ENABLED', 'PAUSED']}),
    'supply-source': Flags.string({
      default: ['APPSTORE_SEARCH_RESULTS'],
      description: 'Supply source, repeatable',
      multiple: true,
    }),
    'target-cpa': moneyFlag('Target CPA'),
  }

  async run(): Promise<AsaCampaignMutationDTO> {
    const {flags} = await this.parse(AsaCampaignsCreate)
    if (!isValidUuid(flags.org)) this.error('Invalid org ID format.', {exit: 2})

    const body = {
      ad_channel_type: flags['ad-channel-type'],
      adam_id: flags['adam-id'],
      bidding_strategy: flags['bidding-strategy'],
      billing_event: flags['billing-event'],
      budget_amount: money(flags.budget, flags.currency),
      campaign_group_id: flags.org,
      countries_or_regions: flags.country,
      daily_budget_amount: money(flags['daily-budget'], flags.currency),
      name: flags.name,
      status: flags.status,
      supply_sources: flags['supply-source'],
      target_cpa: money(flags['target-cpa'], flags.currency),
    }
    await confirmMutation(this, {body, method: 'POST', path: '/campaigns/', summary: `Create campaign ${flags.name}`}, flags.yes)

    const client = await createAsaClient(this.config)
    const result = await client.post<AsaCampaignMutationDTO>('/campaigns', body)

    if (result.campaign) this.log('Campaign created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
