import {Args, Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {printResponse} from '../lib/output.js'
import {
  buildRenderUrl,
  DEFAULT_DEVICE_ID,
  DEFAULT_ORIENTATION,
  normalizePreviewConfig,
  ORIENTATIONS,
  type PreviewPayload,
  RENDER_URL_ENV_VAR,
  resolveRenderUrl,
  writePayloadFile,
} from '../lib/preview.js'

export interface PreviewResult {
  payload_path?: string
  reference_command: string
  render_url: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function referenceScriptPath(): string {
  return fileURLToPath(new URL('../../scripts/preview-with-playwright.mjs', import.meta.url))
}

export default class Preview extends Command {
  static args = {
    config_file: Args.string({description: 'Path to a local flow config JSON file', required: true}),
  }
static description = 'Prepare a render URL for a local flow config, then screenshot it with your own browser tool or the shipped reference script'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> preview ./paywall.json',
    '<%= config.bin %> preview ./paywall.json --screen welcome --device ipad-pro --orientation landscape --json',
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
    'render-url': Flags.string({description: `Render page base URL (defaults to $${RENDER_URL_ENV_VAR})`}),
    screen: Flags.string({description: "Screen ID to render (default: the flow's first screen)"}),
  }

  async run(): Promise<PreviewResult> {
    const {args, flags} = await this.parse(Preview)

    const configPath = resolve(args.config_file)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(configPath, 'utf8'))
    } catch (error) {
      this.error(`Could not read config file ${configPath}: ${describeError(error)}`, {exit: 2})
    }

    let payload: PreviewPayload
    let renderBaseUrl: string
    try {
      payload = normalizePreviewConfig(raw)
      renderBaseUrl = resolveRenderUrl(flags['render-url'])
    } catch (error) {
      this.error(describeError(error), {exit: 2})
    }

    const renderUrl = buildRenderUrl(
      renderBaseUrl,
      {device: flags.device, orientation: flags.orientation, screen: flags.screen},
      payload,
    )

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

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))
    this.log('')
    this.log('Open the render URL with any browser tool and screenshot [data-screen-content], or run the')
    this.log('reference command.')
    if (!payloadPath) {
      this.log('If the config is too large for a URL, re-run with --payload-out <file> and add')
      this.log('--config <file> to the reference command to use the page file input instead.')
    }

    return result
  }
}
