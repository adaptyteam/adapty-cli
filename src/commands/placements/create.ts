import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {isValidUuid} from '../../lib/output.js'

interface PlacementResponse {
  developer_id: string
  id: string
  name: string
}

export default class PlacementsCreate extends Command {
  static description = 'Create a placement with a paywall'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> placements create --app UUID --name "Default" --developer-id default --paywall-id UUID',
  ]
static flags = {
    ...appFlag,
    'developer-id': Flags.string({description: 'Developer ID for the placement', required: true}),
    name: Flags.string({description: 'Placement name', required: true}),
    'paywall-id': Flags.string({description: 'Paywall ID (UUID)', required: true}),
  }

  async run(): Promise<PlacementResponse> {
    const {flags} = await this.parse(PlacementsCreate)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.post<PlacementResponse>(`/apps/${flags.app}/placements`, {
      developer_id: flags['developer-id'],
      name: flags.name,
      paywall_id: flags['paywall-id'],
    })

    this.log('Placement created!')
    this.log(`ID: ${result.id}`)
    this.log(`Developer ID: ${result.developer_id}`)
    this.log(`Name: ${result.name}`)

    return result
  }
}
