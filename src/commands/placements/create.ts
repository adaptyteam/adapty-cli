import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class PlacementsCreate extends Command {
  static description = 'Create a placement with a paywall'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> placements create --app UUID --title "Default" --developer-id default --paywall-id UUID',
  ]
static flags = {
    ...appFlag,
    'developer-id': Flags.string({description: 'Developer ID for the placement', required: true}),
    'paywall-id': Flags.string({description: 'Paywall ID (UUID)', required: true}),
    title: Flags.string({description: 'Placement title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
    const {flags} = await this.parse(PlacementsCreate)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.post<Record<string, unknown>>(`/apps/${flags.app}/placements`, {
      developer_id: flags['developer-id'],
      paywall_id: flags['paywall-id'],
      title: flags.title,
    })

    this.log('Placement created!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
