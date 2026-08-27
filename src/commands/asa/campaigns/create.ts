import {Command, Flags} from '@oclif/core'

import type {AsaCampaignMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {
  currencyFlag,
  idempotencyFlags,
  invoiceFlags,
  locInvoiceDetails,
  money,
  moneyFlag,
  reportServingState,
} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaCampaignsCreate extends Command {
  static description =
    'Create a campaign in Apple Search Ads. A Max Conversions campaign also needs an automated ad group (`asa ad-groups create --automated`); line-of-credit organizations must pass all five --invoice-* flags'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns create --org UUID --name "Winter push" --adam-id 123456 --country US --daily-budget 50',
    '<%= config.bin %> asa campaigns create --org UUID --name "Max Conv" --adam-id 123456 --country US --daily-budget 50 --bidding-strategy MAX_CONVERSIONS',
    '<%= config.bin %> asa campaigns create --org UUID --name "LOC push" --adam-id 123456 --country US --daily-budget 50 --invoice-advertiser "Acme Inc" --invoice-order-number PO-42 --invoice-contact-name "Jane Doe" --invoice-contact-email jane@acme.com --invoice-billing-email billing@acme.com',
  ]
  static flags = {
    ...currencyFlag,
    ...confirmFlags,
    ...idempotencyFlags,
    ...invoiceFlags,
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
      loc_invoice_details: locInvoiceDetails(flags, (msg) => this.error(msg, {exit: 2})),
      name: flags.name,
      status: flags.status,
      supply_sources: flags['supply-source'],
      target_cpa: money(flags['target-cpa'], flags.currency),
    }
    await confirmMutation(this, {body, method: 'POST', path: '/campaigns/', summary: `Create campaign ${flags.name}`}, flags.yes)

    const client = await createAsaClient(this.config)
    const {replayed, result} = await asaWrite<AsaCampaignMutationDTO>(client, 'post', '/campaigns', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    noteReplay(replayed, this.log.bind(this))
    if (result.campaign && !replayed) this.log('Campaign created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))
    reportServingState(result.campaign, this.log.bind(this))

    return result
  }
}
