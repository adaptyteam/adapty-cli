import {type AgentDriver, runPlainText} from './shared.js'

export const geminiDriver: AgentDriver = {
  authErrorPattern: /set an auth method|not authenticated|login required|oauth.*(expired|invalid)|reauthenticate/i,
  bin: 'gemini',
  displayName: 'Gemini CLI',
  id: 'gemini',
  installHint: 'npm install --global @google/gemini-cli',
  loginHint: 'run `gemini` and pick an auth method',
  resumeHint: 'gemini -i "work through ADAPTY_SETUP.md"',
  // --yolo auto-approves edits and shell commands - the same posture as the
  // Claude driver (acceptEdits + Bash in allowedTools); headless runs would
  // otherwise stall on approval prompts.
  run: (opts) => runPlainText({args: ['-p', opts.prompt, '--yolo'], bin: 'gemini'}, opts),
}
