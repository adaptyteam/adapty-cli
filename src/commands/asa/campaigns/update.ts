import {Args, Command, Flags} from '@oclif/core'

import type {AsaCampaignMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {
  currencyFlag,
  idempotencyFlags,
  invoiceFlags,
  locInvoiceDetails,
  money,
  moneyFlag,
  reportServingState,
} from '../../../lib/asa-flags.js'
import {confirmFlags, confirmMutation} from '../../../lib/confirm.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaCampaignsUpdate extends Command {
  static args = {
    campaign_id: Args.string({description: 'Campaign ID (UUID)', required: true}),
  }
  static description =
    'Change a campaign: budgets, countries, status, schedule or Invoicing Options (all five --invoice-* flags together; they replace the stored set)'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns update UUID --status PAUSED',
    '<%= config.bin %> asa campaigns update UUID --daily-budget 80',
    '<%= config.bin %> asa campaigns update UUID --invoice-advertiser "Acme Inc" --invoice-order-number PO-42 --invoice-contact-name "Jane Doe" --invoice-contact-email jane@acme.com --invoice-billing-email billing@acme.com',
  ]
  static flags = {
    ...currencyFlag,
    ...confirmFlags,
    ...idempotencyFlags,
    ...invoiceFlags,
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
    try {
      const details = locInvoiceDetails(flags)
      if (details) body.loc_invoice_details = details
    } catch (error) {
      this.error((error as Error).message, {exit: 2})
    }

    if (Object.keys(body).length === 0) {
      this.error(
        'Nothing to change. Pass at least one field, e.g. --status PAUSED, or the five --invoice-* flags for a line-of-credit organization.',
        {exit: 2},
      )
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
    reportServingState(result.campaign, this.warn.bind(this))

    return result
  }
}
