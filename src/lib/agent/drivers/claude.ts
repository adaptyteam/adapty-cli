import {type AgentDriver, OAUTH_AUTH_ERROR, runStreamJson} from './shared.js'

const ALLOWED_TOOLS = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch']

export const claudeDriver: AgentDriver = {
  authErrorPattern: OAUTH_AUTH_ERROR,
  bin: 'claude',
  displayName: 'Claude Code',
  id: 'claude',
  installHint: 'npm install --global @anthropic-ai/claude-code',
  loginHint: 'run `claude` and complete /login',
  resumeHint: 'claude "work through ADAPTY_SETUP.md"',
  run: (opts) =>
    runStreamJson(
      {
        args: [
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
        ],
        bin: 'claude',
      },
      opts,
    ),
}
