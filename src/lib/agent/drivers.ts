import {execFile, spawn} from 'node:child_process'
import {readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export type DriverId = 'claude' | 'codex'

export interface AgentDriver {
  bin: string
  displayName: string
  id: DriverId
  /** How the user re-authenticates this agent when its own session expires. */
  loginHint: string
}

export interface AgentRunOptions {
  cwd: string
  /** Extra env vars for the agent process only (e.g. ADAPTY_TOKEN) - never mutate process.env. */
  env?: Record<string, string>
  onStatus?: (text: string) => void
  prompt: string
}

export interface AgentResult {
  /** Set when the failure is recognizably the agent's own expired/missing login. */
  failureReason?: 'auth'
  finalText?: string
  ok: boolean
}

const DRIVERS: AgentDriver[] = [
  {bin: 'claude', displayName: 'Claude Code', id: 'claude', loginHint: 'run `claude` and complete /login'},
  {bin: 'codex', displayName: 'Codex', id: 'codex', loginHint: 'run `codex login`'},
]

/** The agent's own session is expired/missing (Anthropic OAuth, Codex login) - not an Adapty error. */
const AGENT_AUTH_ERROR =
  /OAuth (access|refresh) token (has )?expired|failed to authenticate|please run \/login|invalid api key|re-authenticate|not logged in/i

function withAuthCheck(result: AgentResult): AgentResult {
  if (!result.ok && result.finalText && AGENT_AUTH_ERROR.test(result.finalText)) {
    return {...result, failureReason: 'auth'}
  }

  return result
}

async function onPath(bin: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [bin], {timeout: 5000})
    return true
  } catch {
    return false
  }
}

export async function detectDrivers(): Promise<AgentDriver[]> {
  const found = await Promise.all(DRIVERS.map(async (d) => ((await onPath(d.bin)) ? d : null)))
  return found.filter((d): d is AgentDriver => d !== null)
}

const ALLOWED_TOOLS = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch']

function extractStatus(textBlock: string): null | string {
  return textBlock.match(/\[STATUS\]\s*(.+?)\s*$/m)?.[1]?.trim() ?? null
}

interface SpawnStreamOptions {
  args: string[]
  bin: string
  cwd: string
  env?: Record<string, string>
  onLine: (line: string) => void
  onStderrLine?: (line: string) => void
}

function spawnStream({args, bin, cwd, env, onLine, onStderrLine}: SpawnStreamOptions): Promise<null | number> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: env ? {...process.env, ...env} : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    createInterface({input: child.stdout}).on('line', onLine)
    createInterface({input: child.stderr}).on('line', onStderrLine ?? (() => {}))
    child.on('error', reject)
    child.on('close', (code) => resolve(code))
  })
}

const STDERR_TAIL_LINES = 30

/** Agents print auth errors to stderr without producing a result payload - keep a tail so failures stay diagnosable. */
function stderrTailCollector(): {push: (line: string) => void; tail: () => string} {
  const lines: string[] = []
  return {
    push(line) {
      lines.push(line)
      if (lines.length > STDERR_TAIL_LINES) lines.shift()
    },
    tail: () => lines.join('\n').trim(),
  }
}

async function runClaude(opts: AgentRunOptions): Promise<AgentResult> {
  const args = [
    '-p',
    opts.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--add-dir',
    opts.cwd,
    '--allowedTools',
    ALLOWED_TOOLS.join(','),
  ]

  let finalText: string | undefined
  let ok = false
  const stderr = stderrTailCollector()

  const code = await spawnStream({
    args,
    bin: 'claude',
    cwd: opts.cwd,
    env: opts.env,
    onStderrLine: stderr.push,
    // eslint-disable-next-line perfectionist/sort-objects
    onLine(line) {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }

      if (msg.type === 'assistant') {
        const content = (msg.message as {content?: unknown})?.content
        if (!Array.isArray(content)) return
        for (const block of content) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            const status = extractStatus(block.text)
            if (status) opts.onStatus?.(status)
          }
        }
      } else if (msg.type === 'result') {
        if (typeof msg.result === 'string') finalText = msg.result
        ok = msg.subtype === 'success' && msg.is_error !== true
      }
    },
  })

  // Auth errors often land only on stderr with no result payload.
  if (!finalText && code !== 0) finalText = stderr.tail() || undefined
  return withAuthCheck({finalText, ok: ok && code === 0})
}

async function runCodex(opts: AgentRunOptions): Promise<AgentResult> {
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

  const stderr = stderrTailCollector()
  const code = await spawnStream({
    args,
    bin: 'codex',
    cwd: opts.cwd,
    env: opts.env,
    onStderrLine: stderr.push,
    // eslint-disable-next-line perfectionist/sort-objects
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
          const status = extractStatus(textValue)
          if (status) opts.onStatus?.(status)
        }
      }
    },
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
  return withAuthCheck({finalText, ok: code === 0})
}

export async function runAgent(driver: AgentDriver, opts: AgentRunOptions): Promise<AgentResult> {
  return driver.id === 'claude' ? runClaude(opts) : runCodex(opts)
}
