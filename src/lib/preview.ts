import {writeFile} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'

export const RENDER_URL_ENV_VAR = 'ADAPTY_PREVIEW_RENDER_URL'
export const DEFAULT_DEVICE_ID = 'iphone-14'

/** Marks a fragment payload as gzipped base64url rather than plain url-encoded JSON. */
const FRAGMENT_GZIP_PREFIX = 'gz:'
const BUILDER_CONFIG_KEYS = ['screens', 'locales', 'theme'] as const

/** Payload the render page expects. Wire format shared with the UI, hence camelCase. */
export interface PreviewPayload {
  flow: Record<string, unknown>
  remoteConfigs: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBuilderConfig(value: Record<string, unknown>): boolean {
  return BUILDER_CONFIG_KEYS.some((key) => key in value)
}

/**
 * Accepts either a dashboard-api envelope (`{config, remote_configs, ...}`) or a bare
 * builder config, and returns the shape the render page injects.
 */
export function normalizePreviewConfig(raw: unknown): PreviewPayload {
  if (!isRecord(raw)) {
    throw new Error('Config file must contain a JSON object.')
  }

  if (isRecord(raw.config)) {
    const remoteConfigs = raw.remote_configs
    return {
      flow: raw.config,
      remoteConfigs: Array.isArray(remoteConfigs) ? remoteConfigs : [],
    }
  }

  if (isBuilderConfig(raw)) {
    return {flow: raw, remoteConfigs: []}
  }

  throw new Error(
    'Unrecognized config file. Expected a dashboard-api envelope with a `config` object, or a builder config with `screens`, `locales` or `theme`.',
  )
}

/** First screen id declared by the config, used when `--screen` is omitted. */
export function firstScreenId(flow: Record<string, unknown>): string | undefined {
  const {screens} = flow
  if (!Array.isArray(screens)) return undefined

  for (const screen of screens) {
    if (isRecord(screen) && typeof screen.id === 'string') return screen.id
  }

  return undefined
}

/**
 * The render page is being built in parallel, so its URL is never hard-coded: it comes from
 * the flag or from ADAPTY_PREVIEW_RENDER_URL.
 */
export function resolveRenderUrl(flagValue?: string): string {
  const url = flagValue ?? process.env[RENDER_URL_ENV_VAR]
  if (!url) {
    throw new Error(`No render page URL. Pass --render-url or set ${RENDER_URL_ENV_VAR}.`)
  }

  return url
}

/**
 * Fragment wire format shared with the render page: `gz:<base64url(gzip(JSON))>`. The page also
 * accepts plain url-encoded JSON, but the CLI always compresses so large configs fit in a URL.
 */
function encodeConfigFragment(payload: PreviewPayload): string {
  const gzipped = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${FRAGMENT_GZIP_PREFIX}${gzipped.toString('base64url')}`
}

export function buildRenderUrl(
  baseUrl: string,
  target: {device: string; screen?: string},
  payload: PreviewPayload,
): string {
  const url = new URL(baseUrl)
  if (target.screen) url.searchParams.set('screen', target.screen)
  url.searchParams.set('device', target.device)
  url.hash = `config=${encodeConfigFragment(payload)}`
  return url.toString()
}

/** Writes the payload for the render page's file input, the escape hatch for oversized configs. */
export async function writePayloadFile(payload: PreviewPayload, outPath: string): Promise<void> {
  await writeFile(outPath, JSON.stringify(payload), 'utf8')
}
