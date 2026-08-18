import {Args, Command} from '@oclif/core'

import type {FlowConfigDTO} from '../../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class FlowsConfigGet extends Command {
  static args = {
    flow_id: Args.string({description: 'Flow ID (UUID)', required: true}),
  }
static description = 'Read the flow builder config (404 until the config has been written at least once)'
static enableJsonFlag = true
static examples = ['<%= config.bin %> flows config get --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
  }

  async run(): Promise<FlowConfigDTO> {
    const {args, flags} = await this.parse(FlowsConfigGet)

    if (!isValidUuid(args.flow_id)) {
      this.error('Invalid flow ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<FlowConfigDTO>(`/apps/${flags.app}/flows/${args.flow_id}/config`)

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
