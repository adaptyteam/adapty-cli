import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import open from 'open'

import {APP_URL_ENV_VAR} from '../../../lib/app-url.js'
import {
  buildRenderUrl,
  DEFAULT_DEVICE_ID,
  DEFAULT_ORIENTATION,
  normalizePreviewConfig,
  ORIENTATIONS,
  type PreviewPayload,
} from '../../../lib/preview.js'

export interface PreviewResult {
  render_url: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default class FlowsConfigPreview extends Command {
  static args = {
    config_file: Args.string({description: 'Path to a local flow config JSON file', required: true}),
  }
static description = `Build a render URL for a local flow config and open it. Opens the browser on a TTY; when piped, prints the URL alone. The render host comes from $${APP_URL_ENV_VAR}.`
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> flows config preview ./config.json',
    '<%= config.bin %> flows config preview ./config.json --screen welcome --device ipad-pro --orientation landscape',
    '<%= config.bin %> flows config preview ./config.json --json',
  ]
static flags = {
    device: Flags.string({default: DEFAULT_DEVICE_ID, description: 'Device frame to render in'}),
    orientation: Flags.string({
      default: DEFAULT_ORIENTATION,
      description: 'Device orientation to render in',
      options: [...ORIENTATIONS],
    }),
    screen: Flags.string({description: "Screen ID to render (default: the flow's first screen)"}),
  }

  async run(): Promise<PreviewResult> {
    const {args, flags} = await this.parse(FlowsConfigPreview)

    const configPath = resolve(args.config_file)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(configPath, 'utf8'))
    } catch (error) {
      this.error(`Could not read config file ${configPath}: ${describeError(error)}`, {exit: 2})
    }

    let payload: PreviewPayload
    try {
      payload = normalizePreviewConfig(raw)
    } catch (error) {
      this.error(describeError(error), {exit: 2})
    }

    let renderUrl: string
    try {
      renderUrl = buildRenderUrl({device: flags.device, orientation: flags.orientation, screen: flags.screen}, payload)
    } catch (error) {
      this.error(describeError(error), {exit: 2})
    }

    const result: PreviewResult = {render_url: renderUrl}
    if (this.jsonEnabled()) return result

    // Piped output stays a bare URL so it composes — the whole config rides in the fragment, which
    // is why a TTY gets the browser opened instead of a screenful of base64.
    if (process.stdout.isTTY !== true) {
      this.log(renderUrl)
      return result
    }

    const target = [flags.screen ?? 'first screen', flags.device, flags.orientation].join(', ')
    try {
      await open(renderUrl)
      this.log(`Opened the preview in your browser (${target}).`)
    } catch {
      this.log(renderUrl)
    }

    return result
  }
}
