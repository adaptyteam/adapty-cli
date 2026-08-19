import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import open from 'open'

import {
  APP_URL_ENV_VAR,
  buildRenderUrl,
  DEFAULT_DEVICE_ID,
  DEFAULT_ORIENTATION,
  normalizePreviewConfig,
  ORIENTATIONS,
  type PreviewPayload,
  writePayloadFile,
} from '../../../lib/preview.js'

export interface PreviewResult {
  payload_path?: string
  reference_command: string
  render_url: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function referenceScriptPath(): string {
  return fileURLToPath(new URL('../../../../scripts/preview-with-playwright.mjs', import.meta.url))
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
    'payload-out': Flags.string({
      description: 'Also write the normalized payload JSON here, for configs too large to sit in a URL',
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
    let renderUrl: string
    try {
      payload = normalizePreviewConfig(raw)
      renderUrl = buildRenderUrl(
        {device: flags.device, orientation: flags.orientation, screen: flags.screen},
        payload,
      )
    } catch (error) {
      this.error(describeError(error), {exit: 2})
    }

    let payloadPath: string | undefined
    if (flags['payload-out']) {
      payloadPath = resolve(flags['payload-out'])
      await writePayloadFile(payload, payloadPath)
    }

    const config = payloadPath ? ` --config "${payloadPath}"` : ''
    // Key order is the print order: the URL is the primary handle.
    /* eslint-disable perfectionist/sort-objects */
    const result: PreviewResult = {
      render_url: renderUrl,
      reference_command: `npx --yes --package=playwright node "${referenceScriptPath()}" --url "${renderUrl}"${config} --out "preview.png"`,
      payload_path: payloadPath,
    }
    /* eslint-enable perfectionist/sort-objects */

    if (this.jsonEnabled()) return result

    // The URL carries the whole gzipped config, so it is far too long to read: open it instead, and
    // when stdout is piped emit nothing but the URL so it stays composable.
    if (process.stdout.isTTY === true) {
      const target = [flags.screen ?? 'first screen', flags.device, flags.orientation].join(', ')
      try {
        await open(renderUrl)
        this.log(`Opened the preview in your browser (${target}).`)
        this.log('Run with --json for the render URL, the screenshot command and the payload path.')
      } catch {
        this.log(renderUrl)
      }
    } else {
      this.log(renderUrl)
    }

    return result
  }
}
