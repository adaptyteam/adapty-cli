import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'

interface PlacementDetailResponse {
  developer_id: string
  id: string
  name: string
  paywall_id: string
}

export default class PlacementsGet extends Command {
  static args = {
    placement_id: Args.string({description: 'Placement ID (UUID)', required: true}),
  }
static description = 'Get placement details'
static enableJsonFlag = true
static examples = ['<%= config.bin %> placements get --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
  }

  async run(): Promise<PlacementDetailResponse> {
    const {args, flags} = await this.parse(PlacementsGet)

    if (!isValidUuid(args.placement_id)) {
      this.error('Invalid placement ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PlacementDetailResponse>(`/apps/${flags.app}/placements/${args.placement_id}`)

    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)
    this.log(`Developer ID: ${result.developer_id}`)
    this.log(`Paywall ID: ${result.paywall_id}`)

    return result
  }
}
