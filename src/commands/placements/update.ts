import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class PlacementsUpdate extends Command {
  static args = {
    placement_id: Args.string({description: 'Placement ID (UUID)', required: true}),
  }
static description = 'Update a placement'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> placements update --app UUID 550e8400-... --title "Default" --developer-id default --paywall-id UUID',
  ]
static flags = {
    ...appFlag,
    'developer-id': Flags.string({description: 'Developer ID for the placement', required: true}),
    'paywall-id': Flags.string({description: 'Paywall ID (UUID)', required: true}),
    title: Flags.string({description: 'Placement title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
    const {args, flags} = await this.parse(PlacementsUpdate)

    if (!isValidUuid(args.placement_id)) {
      this.error('Invalid placement ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.put<Record<string, unknown>>(`/apps/${flags.app}/placements/${args.placement_id}`, {
      developer_id: flags['developer-id'],
      paywall_id: flags['paywall-id'],
      title: flags.title,
    })

    this.log('Placement updated!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
