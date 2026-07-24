import {type AgentDriver, runPlainText} from './shared.js'

export const copilotDriver: AgentDriver = {
  authErrorPattern: /not (logged in|authenticated)|authentication (required|failed)|use \/login|gh auth login/i,
  bin: 'copilot',
  displayName: 'Copilot CLI',
  id: 'copilot',
  installHint: 'npm install --global @github/copilot',
  loginHint: 'run `copilot` and complete /login',
  resumeHint: 'copilot -p "work through ADAPTY_SETUP.md"',
  // --allow-all-tools skips per-tool approval prompts (headless runs would
  // otherwise stall); --add-dir grants write access to the project.
  run: (opts) =>
    runPlainText({args: ['-p', opts.prompt, '--allow-all-tools', '--add-dir', opts.cwd], bin: 'copilot'}, opts),
}
