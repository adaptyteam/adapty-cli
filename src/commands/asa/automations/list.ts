import {Command} from '@oclif/core'

import type {AsaAutomationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {type PaginatedResponse, paginationFlags, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaAutomationsList extends Command {
  static description = 'List automation rules; status 1 is active, 0 is stopped'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa automations list']
  static flags = {...paginationFlags}

  async run(): Promise<PaginatedResponse<AsaAutomationDTO>> {
    const {flags} = await this.parse(AsaAutomationsList)
    const client = await createAsaClient(this.config)
    const result = await client.get<PaginatedResponse<AsaAutomationDTO>>('/automations', paginationParams(flags))

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
