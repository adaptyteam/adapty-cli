import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'

export type DriverId = 'claude' | 'codex' | 'copilot' | 'cursor' | 'gemini'

export interface AgentDriver {
  /** Matches when a failure is recognizably this agent's own expired/missing login - drives the loginHint messaging. */
  authErrorPattern: RegExp
  bin: string
  displayName: string
  id: DriverId
  /** Shown when no agent is found on PATH. */
  installHint: string
  /** How the user re-authenticates this agent when its own session expires. */
  loginHint: string
  /** Command that hands ADAPTY_SETUP.md to this agent after the run. */
  resumeHint: string
  run(opts: AgentRunOptions): Promise<AgentResult>
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

/** Claude Code and Codex share OAuth-style login wording; kept in one place so a wording change can't drift between them. */
export const OAUTH_AUTH_ERROR =
  /OAuth (access|refresh) token (has )?expired|failed to authenticate|please run \/login|invalid api key|re-authenticate|not logged in/i

export function withAuthCheck(result: AgentResult, authErrorPattern: RegExp): AgentResult {
  if (!result.ok && result.finalText && authErrorPattern.test(result.finalText)) {
    return {...result, failureReason: 'auth'}
  }

  return result
}

/** [STATUS] must start its line - agents also mention the token mid-sentence when describing their own work. */
export function extractStatuses(textBlock: string): string[] {
  return [...textBlock.matchAll(/^\[STATUS\]\s*(.+?)\s*$/gm)].map((m) => m[1].trim())
}

export interface SpawnStreamOptions {
  args: string[]
  bin: string
  cwd: string
  env?: Record<string, string>
  onLine: (line: string) => void
  onStderrLine?: (line: string) => void
}

/** Kill agents that stop producing output - a headless CLI stuck on an interactive prompt would otherwise hang the spinner forever. */
const IDLE_TIMEOUT_MS = 15 * 60_000

export function spawnStream({args, bin, cwd, env, onLine, onStderrLine}: SpawnStreamOptions): Promise<null | number> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      // NO_COLOR keeps ANSI escapes out of everything surfaced to the user (stderr tails included).
      env: {...process.env, NO_COLOR: '1', ...env},
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const idleTimer = setTimeout(() => child.kill('SIGTERM'), IDLE_TIMEOUT_MS)
    createInterface({input: child.stdout}).on('line', (line) => {
      idleTimer.refresh()
      onLine(line)
    })
    createInterface({input: child.stderr}).on('line', (line) => {
      idleTimer.refresh()
      onStderrLine?.(line)
    })
    child.on('error', (error) => {
      clearTimeout(idleTimer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(idleTimer)
      resolve(code)
    })
  })
}

export const STDERR_TAIL_LINES = 30
/** Enough for the closing summary the prompt asks for; bounded so a chatty transcript can't grow without limit. */
const STDOUT_TAIL_LINES = 100

/** Agents print auth errors to stderr without producing a result payload, and chatty stdout is unbounded - keep tails so both stay diagnosable in constant memory. */
export function tailCollector(maxLines: number): {push: (line: string) => void; tail: () => string} {
  const lines: string[] = []
  return {
    push(line) {
      lines.push(line)
      if (lines.length > maxLines) lines.shift()
    },
    tail: () => lines.join('\n').trim(),
  }
}

export interface StreamJsonOptions {
  args: string[]
  bin: string
  /** Fall back to the exit code when the stream never emits a result event - for third-party CLIs whose protocol varies between versions. */
  exitCodeFallback?: boolean
  /** Whether a `result` event means success; default requires subtype "success" and no is_error. */
  okFromResult?: (msg: Record<string, unknown>) => boolean
}

/**
 * Runner for agents that speak the Claude Code stream-json protocol
 * (Claude Code, Cursor): `assistant` events carry [STATUS] text blocks,
 * a final `result` event carries the outcome and summary.
 */
export async function runStreamJson(
  {args, bin, exitCodeFallback, okFromResult}: StreamJsonOptions,
  opts: AgentRunOptions,
): Promise<AgentResult> {
  const isOk = okFromResult ?? ((msg) => msg.subtype === 'success' && msg.is_error !== true)
  let finalText: string | undefined
  let ok = false
  let sawResult = false
  const stderr = tailCollector(STDERR_TAIL_LINES)

  const code = await spawnStream({
    args,
    bin,
    cwd: opts.cwd,
    env: opts.env,
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
            for (const status of extractStatuses(block.text)) opts.onStatus?.(status)
          }
        }
      } else if (msg.type === 'result') {
        sawResult = true
        if (typeof msg.result === 'string') finalText = msg.result
        ok = isOk(msg)
      }
    },
    onStderrLine: stderr.push,
  })

  if (!sawResult && exitCodeFallback) ok = code === 0
  // Auth errors often land only on stderr with no result payload.
  if (!finalText && code !== 0) finalText = stderr.tail() || undefined
  return {finalText, ok: ok && code === 0}
}

/**
 * Runner for agents that stream plain text with no event protocol
 * (Gemini, Copilot): [STATUS] lines drive the spinner and everything else
 * accumulates into finalText.
 */
export async function runPlainText(
  {args, bin}: {args: string[]; bin: string},
  opts: AgentRunOptions,
): Promise<AgentResult> {
  const output = tailCollector(STDOUT_TAIL_LINES)
  const stderr = tailCollector(STDERR_TAIL_LINES)
  let sawStdout = false

  const code = await spawnStream({
    args,
    bin,
    cwd: opts.cwd,
    env: opts.env,
    onLine(line) {
      sawStdout = true
      const [status] = extractStatuses(line)
      if (status) {
        opts.onStatus?.(status)
        return
      }

      output.push(line)
    },
    onStderrLine: stderr.push,
  })

  // An agent that exits 0 without a single stdout line almost certainly stalled
  // (auth refusals often land only on stderr) - don't report that as success.
  const ok = code === 0 && sawStdout
  let finalText = output.tail() || undefined
  if (!finalText && !ok) finalText = stderr.tail() || undefined
  return {finalText, ok}
}
