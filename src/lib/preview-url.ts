import {gzipSync} from 'node:zlib'

import type {PreviewPayload} from './preview-config.js'

export const RENDER_URL_ENV_VAR = 'ADAPTY_PREVIEW_RENDER_URL'
export const DEFAULT_DEVICE_ID = 'iphone-14'
/** Marks a fragment payload as gzipped base64url rather than plain url-encoded JSON. */
export const FRAGMENT_GZIP_PREFIX = 'gz:'

export interface RenderTarget {
  device: string
  screen?: string
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
 * Wire format shared with the render page: `gz:<base64url(gzip(JSON))>`. The page also accepts
 * plain url-encoded JSON, but the CLI always compresses so large configs fit in a URL.
 */
export function encodeConfigFragment(payload: PreviewPayload): string {
  const gzipped = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${FRAGMENT_GZIP_PREFIX}${gzipped.toString('base64url')}`
}

export function buildRenderUrl(renderUrl: string, target: RenderTarget, payload?: PreviewPayload): string {
  const url = new URL(renderUrl)
  if (target.screen) url.searchParams.set('screen', target.screen)
  if (target.device) url.searchParams.set('device', target.device)
  if (payload) url.hash = `config=${encodeConfigFragment(payload)}`
  return url.toString()
}
