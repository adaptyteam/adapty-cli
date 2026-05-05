import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface AudienceEntry {
  paywall_id: string
  priority: number
  segment_ids: string[]
}

export default class PlacementsCreate extends Command {
  static description = 'Create a placement with a paywall'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> placements create --app UUID --title "Default" --developer-id default --audiences \'[{"segment_ids":[],"paywall_id":"PAYWALL_UUID","priority":0}]\'',
    '<%= config.bin %> placements create --app UUID --title "Default" --developer-id default --paywall-id PAYWALL_UUID',
  ]
static flags = {
    ...appFlag,
    audiences: Flags.string({
      description: 'JSON array of audience entries: [{segment_ids, paywall_id, priority}]',
      exactlyOne: ['paywall-id', 'audiences'],
    }),
    'developer-id': Flags.string({description: 'Developer ID for the placement', required: true}),
    'paywall-id': Flags.string({
      description: 'Paywall ID (UUID). DEPRECATED: use --audiences.',
      exactlyOne: ['paywall-id', 'audiences'],
    }),
    title: Flags.string({description: 'Placement title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
    const {flags} = await this.parse(PlacementsCreate)

    let audiences: AudienceEntry[]
    if (flags['paywall-id']) {
      process.stderr.write(
        '⚠️  --paywall-id is deprecated. Use --audiences instead.\n' +
          '    `paywall_id` will be removed from the API in a future release.\n',
      )
      audiences = [{paywall_id: flags['paywall-id'], priority: 0, segment_ids: []}]
    } else {
      try {
        audiences = JSON.parse(flags.audiences!) as AudienceEntry[]
      } catch (error) {
        this.error(`Invalid --audiences JSON: ${error instanceof Error ? error.message : String(error)}`, {exit: 2})
      }
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.post<Record<string, unknown>>(`/apps/${flags.app}/placements`, {
      audiences,
      developer_id: flags['developer-id'],
      title: flags.title,
    })

    this.log('Placement created!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
