import {spawn} from 'node:child_process'

/**
 * Install the adapty-integration skill into the user's coding agents
 * (Claude Code, Codex, Cursor, ...) via the `skills` CLI, so the agent knows
 * Adapty in every future session - not just this run. Same source repo the
 * integrate prompt is built from.
 */
const SKILL_SOURCE = 'adaptyteam/adapty-sdk-integration-skill'

export function installAgentSkills(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['-y', 'skills@latest', 'add', SKILL_SOURCE, '--global', '--yes'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 120_000,
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}
