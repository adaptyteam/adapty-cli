import {Args, Command, Flags} from '@oclif/core'

import type {AsaAdGroupMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {currencyFlag, money, moneyFlag, scheduleFlags, startOfDayUtc} from '../../../lib/asa-flags.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAdGroupsUpdate extends Command {
  static args = {
    ad_group_id: Args.string({description: 'Ad group ID (UUID)', required: true}),
  }
  static description = 'Change an ad group: bid, CPA goal, status or schedule'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa ad-groups update UUID --default-bid 1.50',
    '<%= config.bin %> asa ad-groups update UUID --status PAUSED',
  ]
  static flags = {
    ...currencyFlag,
    ...scheduleFlags,
    ...confirmFlags,
    'automated-keywords': Flags.boolean({allowNo: true, description: 'Let Apple add keywords automatically'}),
    'cpa-goal': moneyFlag('CPA goal'),
    'default-bid': moneyFlag('Default bid'),
    name: Flags.string({description: 'Ad group name'}),
    status: Flags.string({description: 'Ad group status', options: ['ENABLED', 'PAUSED']}),
  }

  async run(): Promise<AsaAdGroupMutationDTO> {
    const {args, flags} = await this.parse(AsaAdGroupsUpdate)
    if (!isValidUuid(args.ad_group_id)) this.error('Invalid ad group ID format.', {exit: 2})

    const body: Record<string, unknown> = {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.status !== undefined) body.status = flags.status
    if (flags['default-bid'] !== undefined) body.default_bid_amount = money(flags['default-bid'], flags.currency)
    if (flags['cpa-goal'] !== undefined) body.cpa_goal = money(flags['cpa-goal'], flags.currency)
    if (flags['automated-keywords'] !== undefined) body.automated_keywords_opt_in = flags['automated-keywords']
    if (flags['start-time'] !== undefined) body.start_time = startOfDayUtc(flags['start-time'])
    if (flags['end-time'] !== undefined) body.end_time = startOfDayUtc(flags['end-time'])

    if (Object.keys(body).length === 0) {
      this.error('Nothing to change. Pass at least one field, e.g. --status PAUSED.', {exit: 2})
    }

    await confirmMutation(
      this,
      {body, method: 'PUT', path: `/ad-groups/${args.ad_group_id}/`, summary: 'Update ad group'},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const result = await client.put<AsaAdGroupMutationDTO>(`/ad-groups/${args.ad_group_id}`, body)

    if (result.ad_group) this.log('Ad group updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
