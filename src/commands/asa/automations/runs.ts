import {Args, Command} from '@oclif/core'

import type {AsaAutomationRunDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {isValidUuid} from '../../../lib/flags.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaAutomationsRuns extends Command {
  static args = {
    automation_id: Args.string({description: 'Automation rule ID (UUID)', required: true}),
  }
  static description = 'List past runs of an automation rule, including dry runs'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa automations runs 550e8400-e29b-41d4-a716-446655440000']
  static flags = {...paginationFlags}

  async run(): Promise<PaginatedResponse<AsaAutomationRunDTO>> {
    const {args, flags} = await this.parse(AsaAutomationsRuns)
    if (!isValidUuid(args.automation_id)) this.error('Invalid automation ID format.', {exit: 2})

    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaAutomationRunDTO>>(
      `/automations/${args.automation_id}/runs`,
      paginationParams(flags),
    )

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
