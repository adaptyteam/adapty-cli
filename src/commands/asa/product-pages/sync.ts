import {Command, Flags} from '@oclif/core'

import type {AsaProductPageSyncDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {idempotencyFlags} from '../../../lib/asa-flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaProductPagesSync extends Command {
  static description = 'Refresh custom product pages from Apple'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa product-pages sync', '<%= config.bin %> asa product-pages sync --adam-id 123456']
  static flags = {
    ...confirmFlags,
    ...idempotencyFlags,
    'adam-id': Flags.integer({description: 'Limit the refresh to one app; omit to cover every app'}),
  }

  async run(): Promise<AsaProductPageSyncDTO> {
    const {flags} = await this.parse(AsaProductPagesSync)

    const body = {...(flags['adam-id'] === undefined ? {} : {adam_id: flags['adam-id']})}
    await confirmMutation(
      this,
      {body, method: 'POST', path: '/product-pages/sync/', summary: 'Queue a product page refresh from Apple'},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const {result} = await asaWrite<AsaProductPageSyncDTO>(client, 'post', '/product-pages/sync', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    this.log(result.replayed ? 'Already running; nothing new was queued.' : 'Sync queued.')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
