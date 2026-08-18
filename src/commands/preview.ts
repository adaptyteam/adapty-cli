import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {printResponse} from '../lib/output.js'
import {firstScreenId, normalizePreviewConfig} from '../lib/preview-config.js'
import {
  DEFAULT_DEVICE_ID,
  defaultScreenshotPath,
  RENDER_URL_ENV_VAR,
  renderPreview,
  resolveRenderUrl,
} from '../lib/preview-render.js'

export interface PreviewResult {
  device: string
  path: string
  screen?: string
}

export default class Preview extends Command {
  static args = {
    config_file: Args.string({description: 'Path to a local flow config JSON file', required: true}),
  }
static description = 'Render a local flow config to a PNG screenshot with a headless browser'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> preview ./paywall.json',
    '<%= config.bin %> preview ./paywall.json --screen welcome --device ipad-pro --out ./preview.png',
  ]
static flags = {
    device: Flags.string({default: DEFAULT_DEVICE_ID, description: 'Device frame to render in'}),
    out: Flags.string({description: 'Where to write the PNG (default: a temp file)'}),
    'render-url': Flags.string({description: `Render page base URL (defaults to $${RENDER_URL_ENV_VAR})`}),
    screen: Flags.string({description: 'Screen ID to render (default: first screen in the config)'}),
    timeout: Flags.integer({default: 30_000, description: 'Per-step timeout in milliseconds', min: 1000}),
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
    let renderUrl
    try {
      payload = normalizePreviewConfig(raw)
      renderUrl = resolveRenderUrl(flags['render-url'])
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error), {exit: 2})
    }

    const screen = flags.screen ?? firstScreenId(payload.flow)
    const outPath = flags.out ? resolve(flags.out) : await defaultScreenshotPath()
    const path = await renderPreview({
      device: flags.device,
      outPath,
      payload,
      renderUrl,
      screen,
      timeoutMs: flags.timeout,
    })

    const result: PreviewResult = {device: flags.device, path, screen}
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
