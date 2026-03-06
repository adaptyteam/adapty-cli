import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'

interface PlacementResponse {
  developer_id: string
  id: string
  name: string
}

export default class PlacementsUpdate extends Command {
  static args = {
    placement_id: Args.string({description: 'Placement ID (UUID)', required: true}),
  }
static description = 'Update a placement'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> placements update --app UUID 550e8400-... --name "Default" --developer-id default --paywall-id UUID',
  ]
static flags = {
    ...appFlag,
    'developer-id': Flags.string({description: 'Developer ID for the placement', required: true}),
    name: Flags.string({description: 'Placement name', required: true}),
    'paywall-id': Flags.string({description: 'Paywall ID (UUID)', required: true}),
  }

  async run(): Promise<PlacementResponse> {
    const {args, flags} = await this.parse(PlacementsUpdate)

    if (!isValidUuid(args.placement_id)) {
      this.error('Invalid placement ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.put<PlacementResponse>(`/apps/${flags.app}/placements/${args.placement_id}`, {
      developer_id: flags['developer-id'],
      name: flags.name,
      paywall_id: flags['paywall-id'],
    })

    this.log('Placement updated!')
    this.log(`ID: ${result.id}`)
    this.log(`Developer ID: ${result.developer_id}`)
    this.log(`Name: ${result.name}`)

    return result
  }
}
