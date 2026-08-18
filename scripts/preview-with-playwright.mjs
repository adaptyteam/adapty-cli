#!/usr/bin/env node
/**
 * Reference preview renderer for `adapty preview`.
 *
 * The CLI does not bundle Playwright: it only prepares a render URL and a payload file. Run this
 * script with Playwright supplied at run time:
 *
 *   npx --yes --package=playwright node <this-file> --url "<renderUrl>" --out preview.png
 *
 * For very large configs, hand over the payload file instead of the URL fragment:
 *
 *   npx --yes --package=playwright node <this-file> --url "<renderUrl>" --config <payloadPath> --out preview.png
 *
 * An agent that already has a browser or computer-use tool can skip this script entirely: open
 * `renderUrl` and screenshot the `[data-screen-content]` element.
 */

import {createRequire} from 'node:module'
import {delimiter, join, resolve} from 'node:path'
import {parseArgs} from 'node:util'

const CONFIG_INPUT_SELECTOR = '[data-testid="preview-config-input"]'
const SCREEN_CONTENT_SELECTOR = '[data-screen-content]'
const SETTLE_MS = 300
const TIMEOUT_MS = 30_000

/** Playwright is a run-time dependency of the caller: this script, npx, or the current project. */
async function loadChromium() {
  try {
    // eslint-disable-next-line import/no-unresolved -- supplied at run time, never a CLI dependency
    return (await import('playwright')).chromium
  } catch {
    // Not resolvable from this file; fall back to the caller's project and to any node_modules
    // that npx put on PATH.
    const roots = [
      process.cwd(),
      ...(process.env.PATH ?? '')
        .split(delimiter)
        .filter((dir) => dir.endsWith(join('node_modules', '.bin')))
        .map((dir) => join(dir, '..')),
    ]

    for (const root of roots) {
      try {
        return createRequire(join(root, 'noop.js'))('playwright').chromium
      } catch {
        continue
      }
    }

    console.error(
      'Could not resolve Playwright. Run this script through `npx --yes --package=playwright node ...`, or `npm i -D playwright` first.',
    )
    process.exit(1)
  }
}

const USAGE = 'Usage: node preview-with-playwright.mjs --url <renderUrl> [--config <payloadPath>] [--out <png>]'

function fail(message) {
  console.error(`${message}\n${USAGE}`)
  process.exit(2)
}

let args
try {
  ;({values: args} = parseArgs({
    options: {
      config: {type: 'string'},
      out: {default: 'preview.png', type: 'string'},
      url: {type: 'string'},
    },
  }))
} catch (error) {
  fail(error.message)
}

if (!args.url) fail('--url is required')

const chromium = await loadChromium()

let browser
try {
  browser = await chromium.launch({headless: true})
} catch (error) {
  console.error(`Could not launch headless Chromium. Run \`npx playwright install chromium\`.\n${error.message}`)
  process.exit(1)
}

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(TIMEOUT_MS)

  if (args.config) {
    // File-input path: drop the gz: fragment and hand the payload over as a file, which has no
    // practical size limit.
    const target = new URL(args.url)
    target.hash = ''
    await page.goto(target.toString(), {waitUntil: 'load'})
    await page.locator(CONFIG_INPUT_SELECTOR).setInputFiles(resolve(args.config))
  } else {
    await page.goto(args.url, {waitUntil: 'load'})
  }

  const content = page.locator(SCREEN_CONTENT_SELECTOR).first()
  await content.waitFor({state: 'visible'})
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(SETTLE_MS)
  await content.screenshot({path: resolve(args.out), type: 'png'})
  console.log(resolve(args.out))
} finally {
  await browser.close()
}
