import {writeFile} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'

import {appUrl} from './app-url.js'

/** The render route is fixed; only its host is configurable, via ADAPTY_APP_URL. */
export const PREVIEW_PATH = '/flow-preview'
export const DEFAULT_DEVICE_ID = 'iphone-14'
/** Orientations the render page accepts; anything else falls back to its own default. */
export const ORIENTATIONS = ['landscape', 'portrait'] as const
export const DEFAULT_ORIENTATION = 'portrait'

/** Payload the render page expects. Wire format shared with the UI, hence camelCase. */
export interface PreviewPayload {
  flow: Record<string, unknown>
  remoteConfigs: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Accepts either a dashboard-api envelope (`{config, remote_configs, ...}`) or a bare
 * builder config, and returns the shape the render page injects.
 *
 * `screens` must be an array: that is exactly what the page's own payload guard checks
 * before it treats the payload as a builder draft, so a config without it would be
 * rejected there instead — better to say so here, against the file the user named.
 */
export function normalizePreviewConfig(raw: unknown): PreviewPayload {
  if (!isRecord(raw)) {
    throw new Error('Config file must contain a JSON object.')
  }

  const envelopeConfig = isRecord(raw.config) ? raw.config : null
  const flow = envelopeConfig ?? raw
  if (!Array.isArray(flow.screens)) {
    throw new TypeError(
      'Unrecognized config file. Expected a dashboard-api envelope with a `config` object, or a bare builder config — either way `screens` must be an array.',
    )
  }

  const remoteConfigs = envelopeConfig && Array.isArray(raw.remote_configs) ? raw.remote_configs : []
  return {flow, remoteConfigs}
}

/**
 * Fragment wire format shared with the render page: bare `base64url(gzip(utf8(JSON)))`, no
 * prefix — the page compresses unconditionally too, so there is no plain shape to mark it
 * apart from. Node's base64url already omits the `=` padding the page strips.
 */
function encodeConfigFragment(payload: PreviewPayload): string {
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64url')
}

export interface RenderTarget {
  device: string
  orientation: string
  /** Omitted lets the render page fall back to the flow's first screen. */
  screen?: string
}

/**
 * Omit `payload` when the config travels as a file instead: the page ignores the hash once it is
 * handed a file, so carrying the fragment as well would only bloat the output.
 */
export function buildRenderUrl(target: RenderTarget, payload?: PreviewPayload): string {
  const url = appUrl(PREVIEW_PATH)
  if (target.screen) url.searchParams.set('screen', target.screen)
  url.searchParams.set('device', target.device)
  url.searchParams.set('orientation', target.orientation)
  if (payload) url.hash = `config=${encodeConfigFragment(payload)}`
  return url.toString()
}

/** Writes the payload for the render page's file input, the escape hatch for oversized configs. */
export async function writePayloadFile(payload: PreviewPayload, outPath: string): Promise<void> {
  await writeFile(outPath, JSON.stringify(payload), 'utf8')
}
