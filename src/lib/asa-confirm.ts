import {Command, Flags} from '@oclif/core'
import {createInterface} from 'node:readline/promises'

export const confirmFlags = {
  yes: Flags.boolean({
    char: 'y',
    description: 'Apply without asking; required when the output is piped or --json is used',
  }),
}

export type ConfirmDecision = 'ask' | 'proceed' | 'refuse'

export function decideConfirmation(opts: {isTty: boolean; json: boolean; yes: boolean}): ConfirmDecision {
  if (opts.yes) return 'proceed'
  if (opts.json || !opts.isTty) return 'refuse'
  return 'ask'
}

export interface MutationPreview {
  body?: unknown
  method: string
  path: string
  summary: string
}

export function renderPreview(preview: MutationPreview): string {
  const lines = [preview.summary, `${preview.method} ${preview.path}`]
  if (preview.body !== undefined) lines.push(JSON.stringify(preview.body, null, 2))
  return lines.join('\n')
}

export async function confirmMutation(command: Command, preview: MutationPreview, yes: boolean): Promise<void> {
  const decision = decideConfirmation({isTty: process.stdin.isTTY === true, json: command.jsonEnabled(), yes})
  if (decision === 'proceed') return

  if (decision === 'refuse') {
    const reason = `${preview.summary} changes your account. Re-run with --yes to apply it without a prompt.`
    process.stderr.write(`${reason}\n${renderPreview(preview)}\n`)
    command.error(reason, {exit: 2})
  }

  process.stderr.write(`${renderPreview(preview)}\n`)
  const reader = createInterface({input: process.stdin, output: process.stderr})
  try {
    const answer = await reader.question('Apply? [y/N] ')
    if (!/^y(es)?$/i.test(answer.trim())) command.error('Cancelled, nothing was sent.', {exit: 1})
  } finally {
    reader.close()
  }
}
