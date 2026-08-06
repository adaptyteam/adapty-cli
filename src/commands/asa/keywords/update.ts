import {Args, Command, Flags} from '@oclif/core'

import type {AsaKeywordMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {currencyFlag, idempotencyFlags, money, moneyFlag, reportBulkOutcome} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'

export default class AsaKeywordsUpdate extends Command {
  static args = {
    keyword_id: Args.string({description: 'Keyword ID (UUID), repeatable as extra arguments', required: true}),
  }
  static description = 'Change bid, status, text or match type of keywords'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa keywords update UUID --bid 2.00',
    '<%= config.bin %> asa keywords update UUID_A UUID_B --status PAUSED',
  ]
  static flags = {
    ...currencyFlag,
    ...confirmFlags,
    ...idempotencyFlags,
    bid: moneyFlag('Bid'),
    'match-type': Flags.string({description: 'Match type', options: ['BROAD', 'EXACT']}),
    status: Flags.string({description: 'Keyword status', options: ['ACTIVE', 'PAUSED']}),
    text: Flags.string({description: 'Keyword text (only meaningful for a single keyword)'}),
  }
  static strict = false

  async run(): Promise<AsaKeywordMutationDTO> {
    const {argv, flags} = await this.parse(AsaKeywordsUpdate)
    const keywordIds = argv as string[]
    for (const id of keywordIds) {
      if (!isValidUuid(id)) this.error(`Invalid keyword ID format: ${id}`, {exit: 2})
    }

    const change: Record<string, unknown> = {}
    if (flags.bid !== undefined) change.bid_amount = money(flags.bid, flags.currency)
    if (flags.status !== undefined) change.status = flags.status
    if (flags['match-type'] !== undefined) change.match_type = flags['match-type']
    if (flags.text !== undefined) change.text = flags.text

    if (Object.keys(change).length === 0) {
      this.error('Nothing to change. Pass at least one field, e.g. --bid 2.00.', {exit: 2})
    }

    if (flags.text !== undefined && keywordIds.length > 1) {
      this.error('--text would give every keyword the same text. Update them one at a time.', {exit: 2})
    }

    const body = {keywords: keywordIds.map((id) => ({id, ...change}))}
    await confirmMutation(
      this,
      {body, method: 'PUT', path: '/keywords/', summary: `Update ${keywordIds.length} keyword(s)`},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const {replayed, result} = await asaWrite<AsaKeywordMutationDTO>(client, 'put', '/keywords', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    noteReplay(replayed, this.log.bind(this))
    reportBulkOutcome(
      {
        applied: result.keywords,
        errors: result.errors,
        isValidationFailure: result.is_validation_failure,
        kind: 'keywords',
      },
      this.log.bind(this),
    )

    return result
  }
}
