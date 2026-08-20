import {Command, Flags} from '@oclif/core'

import type {AsaBulkOperationListDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {asaPaginationFlags, parseDate} from '../../../lib/asa-flags.js'
import {isValidUuid, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

async function parseAppId(input: string): Promise<string> {
  if (!isValidUuid(input)) throw new Error('Invalid app ID format. Run `adapty asa apps list` to find your app ID.')
  return input
}

export default class AsaCampaignsBulkList extends Command {
  static description = "This company's bulk operations, newest first; inspect one with bulk-status"
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns bulk-list',
    '<%= config.bin %> asa campaigns bulk-list --status partial --status failed',
    '<%= config.bin %> asa campaigns bulk-list --created-from 2026-08-01 --created-to 2026-08-20',
  ]
  static flags = {
    ...asaPaginationFlags,
    app: Flags.string({description: 'Keep only operations of this app (UUID)', parse: parseAppId}),
    'created-from': Flags.string({
      description: 'Keep only operations created on or after this date (YYYY-MM-DD)',
      parse: parseDate,
    }),
    'created-to': Flags.string({
      description: 'Keep only operations created on or before this date (YYYY-MM-DD)',
      parse: parseDate,
    }),
    status: Flags.string({
      description: 'Keep only operations in this state; repeatable',
      multiple: true,
      options: ['failed', 'partial', 'pending', 'running', 'success'],
    }),
  }

  async run(): Promise<AsaBulkOperationListDTO> {
    const {flags} = await this.parse(AsaCampaignsBulkList)
    const client = await createAsaClient(this.config)
    const result = await client.get<AsaBulkOperationListDTO>('/bulk-operations', {
      ...paginationParams(flags),
      app_id: flags.app,
      created_from: flags['created-from'],
      created_to: flags['created-to'],
      status: flags.status,
    })

    const pages = Math.max(1, Math.ceil(result.total / result.limit))
    printList(result.items as unknown as Record<string, unknown>[], this.log.bind(this), {
      count: result.total,
      page: flags.page,
      pages,
    })

    return result
  }
}
