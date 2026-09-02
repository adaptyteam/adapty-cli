import {Args, Command} from '@oclif/core'

import type {FlowDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {confirmFlags, confirmMutation} from '../../lib/confirm.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class FlowsPublish extends Command {
  static args = {
    flow_id: Args.string({description: 'Flow ID (UUID)', required: true}),
  }
static description = 'Publish a flow (async — publication completes in the background)'
static enableJsonFlag = true
static examples = ['<%= config.bin %> flows publish --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
    ...confirmFlags,
  }

  async run(): Promise<FlowDTO> {
    const {args, flags} = await this.parse(FlowsPublish)

    if (!isValidUuid(args.flow_id)) {
      this.error('Invalid flow ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const flow = await client.get<FlowDTO>(`/apps/${flags.app}/flows/${args.flow_id}/`)

    await confirmMutation(
      this,
      {
        method: 'POST',
        path: `/apps/${flags.app}/flows/${args.flow_id}/publish/`,
        summary: `Publish flow "${flow.name}" live to end users`,
      },
      flags.yes,
    )

    const result = await client.post<FlowDTO>(`/apps/${flags.app}/flows/${args.flow_id}/publish/`)

    this.log('Publishing started — status: publishing. Publication completes asynchronously.')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
