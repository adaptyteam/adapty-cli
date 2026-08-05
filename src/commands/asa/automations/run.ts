import {Args, Command, Flags} from '@oclif/core'

import type {AsaAutomationRunEnqueuedDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {isValidUuid} from '../../../lib/flags.js'

export default class AsaAutomationsRun extends Command {
  static args = {
    automation_id: Args.string({description: 'Automation rule ID (UUID)', required: true}),
  }
  static description = 'Run an automation rule now; the run is queued, not awaited'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa automations run UUID',
    '<%= config.bin %> asa automations run UUID --dry-run',
  ]
  static flags = {
    ...confirmFlags,
    'dry-run': Flags.boolean({description: 'Evaluate and log the rule without touching Apple'}),
  }

  async run(): Promise<AsaAutomationRunEnqueuedDTO> {
    const {args, flags} = await this.parse(AsaAutomationsRun)
    if (!isValidUuid(args.automation_id)) this.error('Invalid automation ID format.', {exit: 2})

    if (!flags['dry-run']) {
      await confirmMutation(
        this,
        {
          method: 'POST',
          path: `/automations/${args.automation_id}/run/`,
          summary: 'Run the rule for real — it applies its actions to Apple',
        },
        flags.yes,
      )
    }

    const client = await createAsaClient(this.config)
    const result = await client.post<AsaAutomationRunEnqueuedDTO>(
      `/automations/${args.automation_id}/run`,
      undefined,
      flags['dry-run'] ? {dry_run: 'true'} : undefined,
    )

    this.log(flags['dry-run'] ? 'Dry run queued.' : 'Run queued.')
    this.log(`Run ID: ${result.run_id ?? 'unknown'}`)
    this.log(`Follow it with: ${this.config.bin} asa automations runs ${args.automation_id}`)

    return result
  }
}
