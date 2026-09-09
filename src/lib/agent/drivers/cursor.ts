import {type AgentDriver, runStreamJson} from './shared.js'

export const cursorDriver: AgentDriver = {
  authErrorPattern: /not (logged in|authenticated)|cursor-agent login|unauthorized|sign in/i,
  bin: 'cursor-agent',
  displayName: 'Cursor CLI',
  id: 'cursor',
  installHint: 'curl https://cursor.com/install -fsS | bash',
  loginHint: 'run `cursor-agent login`',
  resumeHint: 'cursor-agent "work through ADAPTY_SETUP.md"',
  run: (opts) =>
    runStreamJson(
      {
        // --force allows file edits and commands in print mode - the same posture as the Claude driver.
        args: ['-p', opts.prompt, '--output-format', 'stream-json', '--force'],
        bin: 'cursor-agent',
        // Cursor's stream-json protocol varies between versions; don't fail a clean exit just because no result event arrived.
        exitCodeFallback: true,
        // Cursor's result event doesn't always carry a subtype; is_error is the reliable signal.
        okFromResult: (msg) => msg.is_error !== true,
      },
      opts,
    ),
}
