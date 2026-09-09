import {Args, Command, Flags} from '@oclif/core'

import type {FlowDTO, FlowWriteRequestDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class FlowsUpdate extends Command {
  static args = {
    flow_id: Args.string({description: 'Flow ID (UUID)', required: true}),
  }
static description = 'Rename a flow'
static enableJsonFlag = true
static examples = ['<%= config.bin %> flows update --app UUID 550e8400-e29b-41d4-a716-446655440000 --name "Onboarding v2"']
static flags = {
    ...appFlag,
    name: Flags.string({description: 'New flow name', required: true}),
  }

  async run(): Promise<FlowDTO> {
    const {args, flags} = await this.parse(FlowsUpdate)

    if (!isValidUuid(args.flow_id)) {
      this.error('Invalid flow ID format.', {exit: 2})
    }

    const body: FlowWriteRequestDTO = {name: flags.name}

    const client = await createAuthenticatedClient(this.config)
    const result = await client.put<FlowDTO>(`/apps/${flags.app}/flows/${args.flow_id}/`, body)

    this.log('Flow updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
