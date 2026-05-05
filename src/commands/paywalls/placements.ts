import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface PlacementSummary {
  developer_id: string
  id: string
  title: string
}

interface PlacementsByPaywallResponse {
  data: PlacementSummary[]
}

export default class PaywallsPlacements extends Command {
  static args = {
    paywall_id: Args.string({description: 'Paywall ID (UUID)', required: true}),
  }
static description = 'List placements that currently use this paywall'
static enableJsonFlag = true
static examples = ['<%= config.bin %> paywalls placements --app UUID 770e8400-e29b-41d4-a716-446655440002']
static flags = {
    ...appFlag,
  }

  async run(): Promise<PlacementsByPaywallResponse> {
    const {args, flags} = await this.parse(PaywallsPlacements)

    if (!isValidUuid(args.paywall_id)) {
      this.error('Invalid paywall ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PlacementsByPaywallResponse>(
      `/apps/${flags.app}/paywalls/${args.paywall_id}/placements`,
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this))

    return result
  }
}
