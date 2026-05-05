import {Args, Command} from '@oclif/core'

import type {PaywallDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

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

  async run(): Promise<PaywallDTO> {
    const {args, flags} = await this.parse(PaywallsGet)

    if (!isValidUuid(args.paywall_id)) {
      this.error('Invalid paywall ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaywallDTO>(`/apps/${flags.app}/paywalls/${args.paywall_id}`)

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
