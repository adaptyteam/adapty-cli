import {Args, Command, Flags} from '@oclif/core'

import type {PaywallDTO, PaywallWriteRequestDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class PaywallsUpdate extends Command {
  static args = {
    paywall_id: Args.string({description: 'Paywall ID (UUID)', required: true}),
  }
static description = 'Update a paywall'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> paywalls update --app UUID 550e8400-... --title "Default Paywall" --product-id UUID1 --product-id UUID2',
  ]
static flags = {
    ...appFlag,
    'product-id': Flags.string({
      description: 'Product ID (UUID). Repeat for multiple.',
      multiple: true,
      required: true,
    }),
    title: Flags.string({description: 'Paywall title', required: true}),
  }

  async run(): Promise<PaywallDTO> {
    const {args, flags} = await this.parse(PaywallsUpdate)

    if (!isValidUuid(args.paywall_id)) {
      this.error('Invalid paywall ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: PaywallWriteRequestDTO = {
      product_ids: flags['product-id'],
      title: flags.title,
    }

    const result = await client.put<PaywallDTO>(`/apps/${flags.app}/paywalls/${args.paywall_id}`, body)

    this.log('Paywall updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
