import {fileURLToPath} from 'node:url'

/**
 * Self-contained Playwright script shipped alongside the CLI. Playwright itself is supplied by
 * whoever runs it (npx or the caller's project), so the CLI never depends on it.
 */
export function referenceScriptPath(): string {
  return fileURLToPath(new URL('../../scripts/preview-with-playwright.mjs', import.meta.url))
}

export interface ReferenceCommandOptions {
  outPath?: string
  renderUrl: string
}

export function buildReferenceCommand(opts: ReferenceCommandOptions): string {
  const script = referenceScriptPath()
  const out = opts.outPath ?? 'preview.png'
  return `npx --yes --package=playwright node "${script}" --url "${opts.renderUrl}" --out "${out}"`
}
