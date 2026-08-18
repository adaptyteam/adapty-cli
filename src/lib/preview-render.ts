import type {Browser, Page} from 'playwright'

import {mkdir, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {type PreviewPayload, writePayloadFile} from './preview-config.js'

export const RENDER_URL_ENV_VAR = 'ADAPTY_PREVIEW_RENDER_URL'
export const DEFAULT_DEVICE_ID = 'iphone-14'
export const CONFIG_INPUT_SELECTOR = '[data-testid="preview-config-input"]'
export const SCREEN_CONTENT_SELECTOR = '[data-screen-content]'

/** Configs shorter than this can travel in the URL fragment instead of a file input. */
const MAX_FRAGMENT_LENGTH = 8000
const SETTLE_MS = 300

export interface RenderTarget {
  device: string
  screen?: string
}

export interface RenderPreviewOptions extends RenderTarget {
  outPath: string
  payload: PreviewPayload
  renderUrl: string
  timeoutMs: number
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

export function buildRenderUrl(renderUrl: string, target: RenderTarget, fragmentConfig?: string): string {
  const url = new URL(renderUrl)
  if (target.screen) url.searchParams.set('screen', target.screen)
  if (target.device) url.searchParams.set('device', target.device)
  if (fragmentConfig) url.hash = `config=${encodeURIComponent(fragmentConfig)}`
  return url.toString()
}

export async function defaultScreenshotPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'adapty-preview-'))
  return join(dir, 'preview.png')
}

async function launchChromium(): Promise<Browser> {
  let chromium
  try {
    ;({chromium} = await import('playwright'))
  } catch {
    throw new Error('Preview needs Playwright. Install it with `npm i playwright` and `npx playwright install chromium`.')
  }

  try {
    return await chromium.launch({headless: true})
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not launch headless Chromium. Run \`npx playwright install chromium\`.\n${detail}`)
  }
}

interface InjectOptions extends RenderPreviewOptions {
  target: RenderTarget
}

async function injectConfig(page: Page, opts: InjectOptions): Promise<void> {
  const payloadPath = await writePayloadFile(opts.payload)
  const input = page.locator(CONFIG_INPUT_SELECTOR)
  try {
    await input.waitFor({state: 'attached', timeout: opts.timeoutMs})
  } catch (error) {
    const serialized = JSON.stringify(opts.payload)
    if (serialized.length > MAX_FRAGMENT_LENGTH) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Render page never exposed ${CONFIG_INPUT_SELECTOR}, and the config is too large for the URL fragment fallback.\n${detail}`,
      )
    }

    await page.goto(buildRenderUrl(opts.renderUrl, opts.target, serialized), {
      timeout: opts.timeoutMs,
      waitUntil: 'load',
    })
    // Adding a fragment to the already-loaded page is a same-document navigation, so the
    // render page would never re-read it without an explicit reload.
    await page.reload({timeout: opts.timeoutMs, waitUntil: 'load'})
    return
  }

  await input.setInputFiles(payloadPath)
}

/** Drives the public render page headlessly and writes one screen to `outPath`. */
export async function renderPreview(opts: RenderPreviewOptions): Promise<string> {
  const target: RenderTarget = {device: opts.device, screen: opts.screen}
  await mkdir(dirname(opts.outPath), {recursive: true})

  const browser = await launchChromium()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(opts.timeoutMs)
    await page.goto(buildRenderUrl(opts.renderUrl, target), {timeout: opts.timeoutMs, waitUntil: 'load'})
    await injectConfig(page, {...opts, target})

    const content = page.locator(SCREEN_CONTENT_SELECTOR).first()
    await content.waitFor({state: 'visible', timeout: opts.timeoutMs})
    await page.waitForLoadState('networkidle', {timeout: opts.timeoutMs})
    await page.waitForTimeout(SETTLE_MS)
    await content.screenshot({path: opts.outPath, type: 'png'})
    return opts.outPath
  } finally {
    await browser.close()
  }
}
