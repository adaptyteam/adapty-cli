import {Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'

import type {AsaAutomationMutationDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {addKeywordActionFlags, idempotencyFlags} from '../../../lib/asa-flags.js'
import {
  type AddKeywordActionFlags,
  hasAddKeywordActionFlags,
  rebuildAddKeywordAction,
  requireSingleAction,
} from '../../../lib/asa-keyword-action.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAutomationsCreate extends Command {
  static description =
    'Create an automation rule from a JSON rule file. The add-as-keyword action flags fill in or override actions[0].params, so the bid, the match type and the target ad groups need no hand-written JSON.'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa automations create --file rule.json',
    '<%= config.bin %> asa automations create --file rule.json --run-now',
    '<%= config.bin %> asa automations create --file rule.json --target-ad-group AD_GROUP_ID --match-type EXACT --cpt-bid-type search_term_current_cpt',
    '<%= config.bin %> asa automations create --file rule.json --target-ad-group AD_GROUP_ID --match-type EXACT --cpt-bid-type set_to --cpt-bid 1.50 --negate ad-group',
  ]
  static flags = {
    ...addKeywordActionFlags,
    ...confirmFlags,
    ...idempotencyFlags,
    file: Flags.string({description: 'JSON file with the rule body, or - to read stdin', required: true}),
    'run-now': Flags.boolean({description: 'Queue the first run right after the rule is stored'}),
  }

  async run(): Promise<AsaAutomationMutationDTO> {
    const {flags} = await this.parse(AsaAutomationsCreate)

    const body = await this.readRule(flags.file)
    if (flags['run-now']) body.run_immediately = true
    this.applyActionFlags(body, flags)

    const summary = flags['run-now'] ? 'Create automation rule and run it immediately' : 'Create automation rule'
    await confirmMutation(this, {body, method: 'POST', path: '/automations/', summary}, flags.yes)

    const client = await createAsaClient(this.config)
    const {replayed, result} = await asaWrite<AsaAutomationMutationDTO>(client, 'post', '/automations', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })

    noteReplay(replayed, this.log.bind(this))
    if (result.automation && !replayed) {
      this.log(flags['run-now'] ? 'Automation created and the first run queued!' : 'Automation created!')
    }

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }

  private applyActionFlags(body: Record<string, unknown>, flags: AddKeywordActionFlags): void {
    try {
      requireSingleAction(body.actions)
      if (!hasAddKeywordActionFlags(flags)) return
      body.actions = rebuildAddKeywordAction(body.actions, body.operate_with, flags)
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error), {exit: 2})
    }
  }

  private async readRule(path: string): Promise<Record<string, unknown>> {
    let raw: string
    try {
      raw = path === '-' ? await this.readStdin() : await readFile(path, 'utf8')
    } catch {
      this.error(`Could not read ${path}.`, {exit: 2})
    }

    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      this.error(`${path} is not valid JSON.`, {exit: 2})
    }
  }

  private async readStdin(): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  }
}
