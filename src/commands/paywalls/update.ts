import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'

interface PaywallResponse {
  id: string
  name: string
}

export default class PaywallsUpdate extends Command {
  static args = {
    paywall_id: Args.string({description: 'Paywall ID (UUID)', required: true}),
  }
static description = 'Update a paywall'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> paywalls update --app UUID 550e8400-... --name "Default Paywall" --product-id UUID1 --product-id UUID2',
  ]
static flags = {
    ...appFlag,
    name: Flags.string({description: 'Paywall name', required: true}),
    'product-id': Flags.string({
      description: 'Product ID (UUID). Repeat for multiple.',
      multiple: true,
      required: true,
    }),
  }

  async run(): Promise<PaywallResponse> {
    const {args, flags} = await this.parse(PaywallsUpdate)

    if (!isValidUuid(args.paywall_id)) {
      this.error('Invalid paywall ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.put<PaywallResponse>(`/apps/${flags.app}/paywalls/${args.paywall_id}`, {
      name: flags.name,
      product_ids: flags['product-id'],
    })

    this.log('Paywall updated!')
    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)

    return result
  }
}
