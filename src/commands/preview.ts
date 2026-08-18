import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {firstScreenId, normalizePreviewConfig, writePayloadFile} from '../lib/preview-config.js'
import {buildReferenceCommand} from '../lib/preview-reference.js'
import {buildRenderUrl, DEFAULT_DEVICE_ID, RENDER_URL_ENV_VAR, resolveRenderUrl} from '../lib/preview-url.js'

export interface PreviewResult {
  payloadPath: string
  referenceCommand: string
  renderUrl: string
}

export default class Preview extends Command {
  static args = {
    config_file: Args.string({description: 'Path to a local flow config JSON file', required: true}),
  }
static description = 'Prepare a render URL and payload for a local flow config, then screenshot it with your own browser tool or the shipped reference script'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> preview ./paywall.json',
    '<%= config.bin %> preview ./paywall.json --screen welcome --device ipad-pro --json',
  ]
static flags = {
    device: Flags.string({default: DEFAULT_DEVICE_ID, description: 'Device frame to render in'}),
    'payload-out': Flags.string({description: 'Where to write the normalized payload JSON (default: a temp file)'}),
    'render-url': Flags.string({description: `Render page base URL (defaults to $${RENDER_URL_ENV_VAR})`}),
    screen: Flags.string({description: 'Screen ID to render (default: first screen in the config)'}),
  }

  async run(): Promise<PreviewResult> {
    const {args, flags} = await this.parse(Preview)

    const configPath = resolve(args.config_file)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(configPath, 'utf8'))
    } catch (error) {
      this.error(`Could not read config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`, {
        exit: 2,
      })
    }

    let payload
    let renderBaseUrl
    try {
      payload = normalizePreviewConfig(raw)
      renderBaseUrl = resolveRenderUrl(flags['render-url'])
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error), {exit: 2})
    }

    const screen = flags.screen ?? firstScreenId(payload.flow)
    const renderUrl = buildRenderUrl(renderBaseUrl, {device: flags.device, screen}, payload)
    const payloadPath = await writePayloadFile(payload, flags['payload-out'] ? resolve(flags['payload-out']) : undefined)
    const result: PreviewResult = {
      payloadPath,
      referenceCommand: buildReferenceCommand({renderUrl}),
      renderUrl,
    }

    this.log(`Render URL: ${result.renderUrl}`)
    this.log(`Payload file: ${result.payloadPath}`)
    this.log(`Reference command: ${result.referenceCommand}`)
    this.log('')
    this.log('Open the render URL with any browser tool and screenshot [data-screen-content], or run the')
    this.log('reference command. For a config too large for a URL, add --config <payload file> to it.')

    return result
  }
}
