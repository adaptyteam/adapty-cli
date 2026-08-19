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
  writePayloadFile,
} from '../../../lib/preview.js'

export interface PreviewResult {
  payload_path?: string
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
    'payload-out': Flags.string({
      description:
        'Write the normalized payload JSON here and leave it out of the URL, for configs too large to sit in one',
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

    let payloadPath: string | undefined
    if (flags['payload-out']) {
      payloadPath = resolve(flags['payload-out'])
      await writePayloadFile(payload, payloadPath)
    }

    let renderUrl: string
    try {
      // The fragment and the payload file are alternatives: emitting both would repeat the whole
      // config in output an agent has to read.
      renderUrl = buildRenderUrl(
        {device: flags.device, orientation: flags.orientation, screen: flags.screen},
        payloadPath ? undefined : payload,
      )
    } catch (error) {
      this.error(describeError(error), {exit: 2})
    }

    // Key order is the print order: the URL is the primary handle.
    /* eslint-disable perfectionist/sort-objects */
    const result: PreviewResult = {
      render_url: renderUrl,
      payload_path: payloadPath,
    }
    /* eslint-enable perfectionist/sort-objects */

    if (this.jsonEnabled()) return result

    // Piped output stays a bare URL so it composes; on a TTY the URL is far too long to read, so
    // open it instead. With a payload file there is nothing to open — the config is not in the URL.
    if (process.stdout.isTTY !== true) {
      this.log(renderUrl)
      return result
    }

    if (payloadPath) {
      this.log(`Payload written to ${payloadPath}`)
      this.log(`Render URL (feed the payload to the page's file input): ${renderUrl}`)
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
