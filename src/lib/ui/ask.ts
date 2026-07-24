import * as clack from '@clack/prompts'

/**
 * Thin wrapper over @clack/prompts so callers stay library-agnostic.
 * Non-interactive runs (piped stdin OR stdout, CI) never render prompts -
 * every function resolves to its default immediately, so headless flows keep
 * working.
 */

export interface SelectOption {
  hint?: string
  label: string
  value: string
}

/**
 * The single definition of "can we ask the user something": both streams
 * must be terminals (clack renders on stdout and reads stdin). Commands must
 * use this - not process.stdin.isTTY alone - or they will believe a question
 * was asked when it silently auto-resolved.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

/** Arrow-key select. Returns the chosen value, or null when cancelled (Esc/Ctrl-C). */
export async function select(message: string, options: SelectOption[], defaultValue?: string): Promise<null | string> {
  if (!isInteractive()) return defaultValue ?? null
  const result = await clack.select({
    initialValue: defaultValue,
    message,
    options: options.map((o) => ({hint: o.hint, label: o.label, value: o.value})),
  })
  return clack.isCancel(result) ? null : result
}

/** Yes/no. Returns null when cancelled (Esc/Ctrl-C) so callers can distinguish "No" from "get me out". */
export async function confirm(message: string, defaultYes = true): Promise<boolean | null> {
  if (!isInteractive()) return defaultYes
  const result = await clack.confirm({initialValue: defaultYes, message})
  return clack.isCancel(result) ? null : result
}

export async function text(message: string, defaultValue?: string): Promise<string> {
  if (!isInteractive()) return defaultValue ?? ''
  const result = await clack.text({defaultValue: defaultValue ?? '', message, placeholder: defaultValue})
  return clack.isCancel(result) ? '' : (result ?? '')
}

export interface Spinner {
  message(text: string): void
  start(text: string): void
  stop(text: string): void
}

/** East-Asian wide chars and emoji occupy ~2 terminal columns. */
const WIDE_CHAR =
   
  /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u

/**
 * A spinner line that wraps past the terminal edge breaks clack's in-place
 * redraw - every frame then prints a NEW line and the spinner looks stuck in
 * a loop. Clip by DISPLAY width (code points, wide chars counted double) so
 * it can never wrap; clack's own prefix + frame glyph eat a few columns.
 */
function clipToWidth(text: string): string {
  const budget = (process.stdout.columns ?? 80) - 8
  let width = 0
  let out = ''
  for (const ch of text) {
    width += WIDE_CHAR.test(ch) ? 2 : 1
    if (width > budget - 1) return `${out}…`
    out += ch
  }

  return out
}

/** In-place spinner; in non-interactive runs it degrades to plain log lines so CI output stays readable. */
export function spinner(): Spinner {
  if (!isInteractive()) {
    return {
      message: (t) => console.log(`  • ${t}`),
      start: (t) => console.log(t),
      stop: (t) => console.log(t),
    }
  }

  const s = clack.spinner()
  let lastMessage = ''
  return {
    message(t) {
      const clipped = clipToWidth(t)
      if (clipped === lastMessage) return
      lastMessage = clipped
      s.message(clipped)
    },
    start: (t) => s.start(clipToWidth(t)),
    stop: (t) => s.stop(t),
  }
}
