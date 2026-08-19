import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'

import type {FlowConfigValidateRequestDTO, FlowConfigValidationDTO} from '../../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../../lib/flags.js'
import {printResponse} from '../../../lib/output.js'

export default class FlowsConfigValidate extends Command {
  static args = {
    flow_id: Args.string({description: 'Flow ID (UUID)', required: true}),
  }
static description =
    'Check whether a builder config is publishable (advisory; does not save). Exits non-zero when the config is not publishable.'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> flows config validate --app UUID FLOW_UUID --config-file config.json',
    'cat config.json | <%= config.bin %> flows config validate --app UUID FLOW_UUID --config-file -',
    '<%= config.bin %> flows config validate --app UUID FLOW_UUID --config \'{"screens":[],"locales":[]}\'',
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
    source: Flags.string({
      default: 'adapty-cli',
      description: 'Caller attribution, sent as X-Adapty-Source (e.g. byo-cli)',
    }),
  }

  async run(): Promise<FlowConfigValidationDTO> {
    const {args, flags} = await this.parse(FlowsConfigValidate)

    if (!isValidUuid(args.flow_id)) {
      this.error('Invalid flow ID format.', {exit: 2})
    }

    const config = await this.readConfig(flags)
    const body: FlowConfigValidateRequestDTO = {config}

    const client = await createAuthenticatedClient(this.config)
    const result = await client.post<FlowConfigValidationDTO>(
      `/apps/${flags.app}/flows/${args.flow_id}/config/validate`,
      body,
      undefined,
      {headers: {'X-Adapty-Source': flags.source}},
    )

    this.log(result.valid ? 'Config is publishable.' : 'Config is NOT publishable.')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    // Advisory endpoint always returns HTTP 200; surface the verdict as an exit code so scripts and agents
    // can gate on it. The JSON/`valid` field stays the source of truth for programmatic consumers.
    if (!result.valid) {
      process.exitCode = 1
    }

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
