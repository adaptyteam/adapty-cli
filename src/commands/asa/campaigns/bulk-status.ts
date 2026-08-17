import {Args, Command} from '@oclif/core'

import type {AsaBulkOperationStateDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {asaPaginationFlags} from '../../../lib/asa-flags.js'
import {isValidUuid, paginationParams} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaCampaignsBulkStatus extends Command {
  static args = {
    'operation-id': Args.string({description: 'Bulk operation ID returned by bulk-create', required: true}),
  }
  static description = 'Progress board of one bulk operation: counts, pipelines and the per-object log'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa campaigns bulk-status 660e8400-e29b-41d4-a716-446655440001']
  static flags = {
    ...asaPaginationFlags,
  }

  async run(): Promise<AsaBulkOperationStateDTO> {
    const {args, flags} = await this.parse(AsaCampaignsBulkStatus)
    const operationId = args['operation-id']
    if (!isValidUuid(operationId)) this.error('Invalid operation ID format.', {exit: 2})

    const client = await createAsaClient(this.config)
    const state = await client.get<AsaBulkOperationStateDTO>(`/bulk-operations/${operationId}`, paginationParams(flags))

    printResponse(state as unknown as Record<string, unknown>, this.log.bind(this))
    return state
  }
}
