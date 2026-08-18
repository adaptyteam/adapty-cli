import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/** Payload the render page expects: the builder config plus its remote configs. */
export interface PreviewPayload {
  flow: Record<string, unknown>
  remoteConfigs: unknown[]
}

const BUILDER_CONFIG_KEYS = ['screens', 'locales', 'theme'] as const

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
  if (Array.isArray(screens)) {
    for (const screen of screens) {
      if (isRecord(screen) && typeof screen.id === 'string') return screen.id
    }

    return undefined
  }

  if (isRecord(screens)) {
    const [first] = Object.keys(screens)
    return first
  }

  return undefined
}

/** Writes the payload where a browser file input can pick it up. */
export async function writePayloadFile(payload: PreviewPayload): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'adapty-preview-'))
  const path = join(dir, 'flow-config.json')
  await writeFile(path, JSON.stringify(payload), 'utf8')
  return path
}
