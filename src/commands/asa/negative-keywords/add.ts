import {Command, Flags} from '@oclif/core'

import type {AsaNegativeKeywordMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {MAX_BULK_ITEMS, reportBulkOutcome} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'

export default class AsaNegativeKeywordsAdd extends Command {
  static description = 'Add negative keywords to an ad group or across a campaign'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa negative-keywords add --ad-group UUID --text "free"',
    '<%= config.bin %> asa negative-keywords add --campaign UUID --text "free" --text "cheap"',
    '<%= config.bin %> asa negative-keywords add --campaign UUID --all-ad-groups --text "free"',
  ]
  static flags = {
    ...confirmFlags,
    'ad-group': Flags.string({description: 'Ad group ID (UUID) — the campaign is resolved from it', exclusive: ['campaign']}),
    'all-ad-groups': Flags.boolean({
      dependsOn: ['campaign'],
      description: 'Apply to every ad group of the campaign instead of the campaign itself',
    }),
    campaign: Flags.string({description: 'Campaign ID (UUID)', exclusive: ['ad-group']}),
    'match-type': Flags.string({default: 'EXACT', description: 'Match type', options: ['BROAD', 'EXACT']}),
    status: Flags.string({default: 'ACTIVE', description: 'Keyword status', options: ['ACTIVE', 'PAUSED']}),
    text: Flags.string({description: 'Keyword text, repeatable', multiple: true, required: true}),
  }

  async run(): Promise<AsaNegativeKeywordMutationDTO> {
    const {flags} = await this.parse(AsaNegativeKeywordsAdd)
    const target = flags['ad-group'] ?? flags.campaign
    if (!target) this.error('Pass either --ad-group or --campaign.', {exit: 2})
    if (!isValidUuid(target)) this.error('Invalid ID format.', {exit: 2})
    if (flags.text.length > MAX_BULK_ITEMS) {
      this.error(`A single call takes at most ${MAX_BULK_ITEMS} keywords, got ${flags.text.length}.`, {exit: 2})
    }

    const scope = flags['ad-group'] ? 'AD_GROUP' : flags['all-ad-groups'] ? 'ALL_CAMPAIGN_AD_GROUPS' : 'CAMPAIGN'
    const parent = flags['ad-group'] ? {ad_group_id: flags['ad-group']} : {campaign_id: flags.campaign}

    const body = {
      negative_keywords: flags.text.map((text) => ({
        ...parent,
        match_type: flags['match-type'],
        status: flags.status,
        text,
      })),
      scope,
    }
    await confirmMutation(
      this,
      {
        body,
        method: 'POST',
        path: '/negative-keywords/',
        summary:
          scope === 'ALL_CAMPAIGN_AD_GROUPS'
            ? `Add ${flags.text.length} negative keyword(s) to every ad group of the campaign`
            : `Add ${flags.text.length} negative keyword(s) in ${scope} scope`,
      },
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const result = await client.post<AsaNegativeKeywordMutationDTO>('/negative-keywords', body)

    reportBulkOutcome(
      {
        applied: result.negative_keywords,
        errors: result.errors,
        isValidationFailure: result.is_validation_failure,
        kind: 'negative keywords',
      },
      this.log.bind(this),
    )

    return result
  }
}
