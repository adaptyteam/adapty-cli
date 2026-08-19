import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'

import type {FlowConfigDTO, FlowConfigWriteRequestDTO, FlowRemoteConfigDTO} from '../../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class FlowsConfigUpdate extends Command {
  static args = {
    flow_id: Args.string({description: 'Flow ID (UUID)', required: true}),
  }
static description = 'Write the flow builder config (creates the first version, or edits/forks the current one)'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> flows config update --app UUID FLOW_UUID --config-file config.json',
    'cat config.json | <%= config.bin %> flows config update --app UUID FLOW_UUID --config-file -',
    '<%= config.bin %> flows config update --app UUID FLOW_UUID --config \'{"screens":[],"locales":[]}\' --expected-updated-at 1755001800000',
  ]
static flags = {
    ...appFlag,
    config: Flags.string({
      description: 'Builder config as a JSON string',
      exactlyOne: ['config', 'config-file'],
    }),
    'config-file': Flags.string({
      description: 'JSON file with the builder config, or - to read stdin',
      exactlyOne: ['config', 'config-file'],
    }),
    'expected-updated-at': Flags.integer({
      description: 'Optimistic lock: the `updated_at` from a prior config read. Omit for last-write-wins.',
    }),
    'remote-configs': Flags.string({
      description: 'JSON array of remote config entries: [{locale, data}]',
    }),
  }

  async run(): Promise<FlowConfigDTO> {
    const {args, flags} = await this.parse(FlowsConfigUpdate)

    if (!isValidUuid(args.flow_id)) {
      this.error('Invalid flow ID format.', {exit: 2})
    }

    const config = await this.readConfig(flags)

    const body: FlowConfigWriteRequestDTO = {config}

    if (flags['remote-configs'] !== undefined) {
      body.remote_configs = this.parseJson<FlowRemoteConfigDTO[]>(flags['remote-configs'], '--remote-configs')
    }

    if (flags['expected-updated-at'] !== undefined) {
      body.expected_updated_at = flags['expected-updated-at']
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.put<FlowConfigDTO>(`/apps/${flags.app}/flows/${args.flow_id}/config`, body)

    this.log('Flow config saved!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }

  private parseJson<T>(raw: string, label: string): T {
    try {
      return JSON.parse(raw) as T
    } catch (error) {
      this.error(`Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`, {exit: 2})
    }
  }

  private async readConfig(flags: {config?: string; 'config-file'?: string}): Promise<Record<string, unknown>> {
    if (flags.config !== undefined) {
      return this.parseJson<Record<string, unknown>>(flags.config, '--config')
    }

    const path = flags['config-file']
    if (path === undefined) {
      this.error('Provide --config or --config-file.', {exit: 2})
    }

    let raw: string
    try {
      raw = path === '-' ? await this.readStdin() : await readFile(path, 'utf8')
    } catch {
      this.error(`Could not read ${path}.`, {exit: 2})
    }

    return this.parseJson<Record<string, unknown>>(raw, path)
  }

  private async readStdin(): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  }
}
