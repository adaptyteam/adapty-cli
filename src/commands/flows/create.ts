import {Command, Flags} from '@oclif/core'

import type {FlowDTO, FlowWriteRequestDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

export default class FlowsCreate extends Command {
  static description = 'Create a flow (row only — write its config with `flows config update`)'
static enableJsonFlag = true
static examples = ['<%= config.bin %> flows create --app UUID --name "Onboarding"']
static flags = {
    ...appFlag,
    name: Flags.string({description: 'Flow name', required: true}),
  }

  async run(): Promise<FlowDTO> {
    const {flags} = await this.parse(FlowsCreate)
    const client = await createAuthenticatedClient(this.config)

    const body: FlowWriteRequestDTO = {name: flags.name}

    const result = await client.post<FlowDTO>(`/apps/${flags.app}/flows`, body)

    this.log('Flow created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
