import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'

import type {AsaAutomationMutationDTO} from '../../../lib/asa-schemas.js'

import {createAsaClient} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaAutomationsUpdate extends Command {
  static args = {
    automation_id: Args.string({description: 'Automation rule ID (UUID)', required: true}),
  }
  static description = 'Change an automation rule: stop it, rename it, or replace parts of the rule'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa automations update UUID --stop',
    '<%= config.bin %> asa automations update UUID --file rule.json',
  ]
  static flags = {
    ...confirmFlags,
    file: Flags.string({description: 'JSON file with the parts to change, or - to read stdin'}),
    name: Flags.string({description: 'Rule name'}),
    start: Flags.boolean({description: 'Activate the rule', exclusive: ['stop']}),
    stop: Flags.boolean({description: 'Stop the rule and clear its next run', exclusive: ['start']}),
  }

  async run(): Promise<AsaAutomationMutationDTO> {
    const {args, flags} = await this.parse(AsaAutomationsUpdate)
    if (!isValidUuid(args.automation_id)) this.error('Invalid automation ID format.', {exit: 2})

    const body: Record<string, unknown> = flags.file ? await this.readRule(flags.file) : {}
    if (flags.name !== undefined) body.name = flags.name
    if (flags.start) body.status = 1
    if (flags.stop) body.status = 0

    if (Object.keys(body).length === 0) {
      this.error('Nothing to change. Pass --stop, --start, --name or --file.', {exit: 2})
    }

    if ('internal_id' in body) {
      this.error('Remove internal_id from the file: the rule ID comes from the command line.', {exit: 2})
    }

    await confirmMutation(
      this,
      {body, method: 'PUT', path: `/automations/${args.automation_id}/`, summary: 'Update automation rule'},
      flags.yes,
    )

    const client = await createAsaClient(this.config)
    const result = await client.put<AsaAutomationMutationDTO>(`/automations/${args.automation_id}`, body)

    if (result.automation) this.log('Automation updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
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
