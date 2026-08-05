import {Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'

import type {AsaKeywordMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {currencyFlag, MAX_BULK_ITEMS, money, moneyFlag, reportBulkOutcome} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'

export default class AsaKeywordsAdd extends Command {
  static description = 'Add targeting keywords to an ad group'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa keywords add --ad-group UUID --text "running shoes" --text "trail shoes" --bid 1.20',
    '<%= config.bin %> asa keywords add --ad-group UUID --from-file keywords.txt --match-type EXACT',
  ]
  static flags = {
    ...currencyFlag,
    ...confirmFlags,
    'ad-group': Flags.string({description: 'Ad group ID (UUID) — the campaign is resolved from it', required: true}),
    bid: moneyFlag('Bid per keyword'),
    'from-file': Flags.string({description: 'File with one keyword per line, combined with any --text values'}),
    'match-type': Flags.string({default: 'BROAD', description: 'Match type', options: ['BROAD', 'EXACT']}),
    status: Flags.string({default: 'ACTIVE', description: 'Keyword status', options: ['ACTIVE', 'PAUSED']}),
    text: Flags.string({description: 'Keyword text, repeatable', multiple: true}),
  }

  async run(): Promise<AsaKeywordMutationDTO> {
    const {flags} = await this.parse(AsaKeywordsAdd)
    if (!isValidUuid(flags['ad-group'])) this.error('Invalid ad group ID format.', {exit: 2})

    const texts = [...(flags.text ?? []), ...(await this.readTexts(flags['from-file']))]
    if (texts.length === 0) this.error('Pass at least one --text or a --from-file with keywords.', {exit: 2})
    if (texts.length > MAX_BULK_ITEMS) {
      this.error(`A single call takes at most ${MAX_BULK_ITEMS} keywords, got ${texts.length}.`, {exit: 2})
    }

    const body = {
      keywords: texts.map((text) => ({
        ad_group_id: flags['ad-group'],
        bid_amount: money(flags.bid, flags.currency),
        match_type: flags['match-type'],
        status: flags.status,
        text,
      })),
    }
    await confirmMutation(
      this,
      {body, method: 'POST', path: '/keywords/', summary: `Add ${texts.length} keyword(s)`},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const result = await client.post<AsaKeywordMutationDTO>('/keywords', body)

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

  private async readTexts(path: string | undefined): Promise<string[]> {
    if (!path) return []

    try {
      const raw = await readFile(path, 'utf8')
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      this.error(`Could not read ${path}.`, {exit: 2})
    }
  }
}
