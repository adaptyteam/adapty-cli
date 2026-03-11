import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface PlacementDetailResponse {
  developer_id: string
  id: string
  paywall_id: string
  title: string
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

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
