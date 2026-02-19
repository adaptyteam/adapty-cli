import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {isValidUuid} from '../../lib/output.js'

interface PaywallResponse {
  id: string
  name: string
}

export default class PaywallsCreate extends Command {
  static description = 'Create a paywall with products'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> paywalls create --app UUID --name "Default Paywall" --product-id UUID1 --product-id UUID2',
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
    const {flags} = await this.parse(PaywallsCreate)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.post<PaywallResponse>(`/apps/${flags.app}/paywalls`, {
      name: flags.name,
      product_ids: flags['product-id'],
    })

    this.log('Paywall created!')
    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)

    return result
  }
}
