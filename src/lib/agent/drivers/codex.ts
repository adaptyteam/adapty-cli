import {readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  type AgentDriver,
  type AgentResult,
  type AgentRunOptions,
  extractStatuses,
  OAUTH_AUTH_ERROR,
  spawnStream,
  STDERR_TAIL_LINES,
  tailCollector,
} from './shared.js'

async function run(opts: AgentRunOptions): Promise<AgentResult> {
  const lastMsgFile = join(tmpdir(), `adapty-codex-${process.pid}-${Date.now()}.txt`)
  const args = [
    'exec',
    opts.prompt,
    '--json',
    '--sandbox',
    'workspace-write',
    '-c',
    'sandbox_workspace_write.network_access=true',
    '-C',
    opts.cwd,
    '--skip-git-repo-check',
    '--output-last-message',
    lastMsgFile,
  ]

  const stderr = tailCollector(STDERR_TAIL_LINES)
  const code = await spawnStream({
    args,
    bin: 'codex',
    cwd: opts.cwd,
    env: opts.env,
    onLine(line) {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }

      // Codex's event schema shifts between versions; pull message text defensively.
      const node = (msg.msg ?? msg.item ?? msg) as Record<string, unknown>
      const type = String(node.type ?? msg.type ?? '')
      if (type.includes('agent_message') || type.includes('assistant')) {
        const textValue = node.message ?? node.text ?? node.delta
        if (typeof textValue === 'string') {
          for (const status of extractStatuses(textValue)) opts.onStatus?.(status)
        }
      }
    },
    onStderrLine: stderr.push,
  })

  let finalText: string | undefined
  try {
    finalText = (await readFile(lastMsgFile, 'utf8')).trim() || undefined
  } catch {
    // no final message file - fine
  } finally {
    await rm(lastMsgFile, {force: true}).catch(() => {})
  }

  // Auth errors often land only on stderr with no last-message file.
  if (!finalText && code !== 0) finalText = stderr.tail() || undefined
  return {finalText, ok: code === 0}
}

export const codexDriver: AgentDriver = {
  authErrorPattern: OAUTH_AUTH_ERROR,
  bin: 'codex',
  displayName: 'Codex',
  id: 'codex',
  installHint: 'npm install --global @openai/codex',
  loginHint: 'run `codex login`',
  resumeHint: 'codex "work through ADAPTY_SETUP.md"',
  run,
}
