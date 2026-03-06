import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'

interface PaywallDetailResponse {
  id: string
  name: string
  product_ids: string[]
}

export default class PaywallsGet extends Command {
  static args = {
    paywall_id: Args.string({description: 'Paywall ID (UUID)', required: true}),
  }
static description = 'Get paywall details'
static enableJsonFlag = true
static examples = ['<%= config.bin %> paywalls get --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
  }

  async run(): Promise<PaywallDetailResponse> {
    const {args, flags} = await this.parse(PaywallsGet)

    if (!isValidUuid(args.paywall_id)) {
      this.error('Invalid paywall ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaywallDetailResponse>(`/apps/${flags.app}/paywalls/${args.paywall_id}`)

    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)
    this.log(`Product IDs: ${result.product_ids.join(', ')}`)

    return result
  }
}
