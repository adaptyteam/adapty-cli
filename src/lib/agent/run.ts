import type {Command} from '@oclif/core'

import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {availableBranchName, createBranch, isGitRepo} from '../project/git.js'
import {confirm, spinner, text} from '../ui/ask.js'
import {copyToClipboard} from '../ui/clipboard.js'
import {type AgentDriver, type AgentResult, runAgent} from './drivers/index.js'
import {type AgentAction, buildActionPrompt, buildCopyPrompt, type PromptContext} from './prompt.js'
import {installAgentSkills} from './skills-install.js'
import {telemetryDisabled, trackAgentRun} from './telemetry.js'

const DASHBOARD_URL = 'https://app.adapty.io'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface RunActionResult {
  failureReason?: 'auth'
  finalText?: string
  ok: boolean
}

/** Leave the skill installed in the user's agents so future sessions know Adapty. */
async function installSkill(): Promise<void> {
  const spin = spinner()
  spin.start('Installing the Adapty skill into your coding agent')
  const installed = await installAgentSkills()
  spin.stop(
    installed
      ? 'Adapty skill installed - your agent can now handle Adapty tasks in any session.'
      : 'Skill install skipped - run `npx skills add adaptyteam/adapty-skills` to add it manually.',
  )
}

/**
 * The copy-only exit shared by every agent-driven command: put the prompt on
 * the clipboard (or print it). `installSkill` comes from the no-agent path,
 * where the user asked for the skill in the agent they actually use.
 */
export async function emitCopyPrompt(
  command: Command,
  action: AgentAction,
  ctx: PromptContext,
  opts: {installSkill?: boolean} = {},
): Promise<void> {
  const prompt = buildCopyPrompt(action, ctx)
  const copied = await copyToClipboard(prompt)
  if (copied) command.log(`\n${capitalize(action.title)} prompt copied to clipboard - paste it into any coding agent.`)
  else command.log(`\n${prompt}\n\n(Copy the prompt above into any coding agent.)`)

  // After the prompt, never before: the install can take a minute, and the
  // clipboard is what the user is waiting for.
  if (opts.installSkill) await installSkill()
}

/** The failure exit shared by every agent-driven command; never returns. */
export function reportActionFailure(command: Command, driver: AgentDriver, result: RunActionResult): never {
  const name = command.id ?? 'integrate'
  command.error(
    result.failureReason === 'auth'
      ? `${driver.displayName} isn't logged in (its own session expired - not your Adapty login). ` +
          `To fix: ${driver.loginHint}, then re-run \`adapty ${name}\`. Or use --copy to drive your own agent.`
      : `The agent stopped before finishing. Re-run \`adapty ${name}\`, or use --copy to drive your own agent.`,
  )
}

/**
 * Put the run on a branch of its own. An agent rewrites files all over the
 * project; on its own branch that is one `git switch -` away from undone, and
 * the diff reviews like any other PR. Not a question - the branch costs the
 * user nothing and its absence costs them a lot, so it just happens.
 *
 * No git at all is the case worth stopping for: there is then no way to see
 * what changed or to undo it, and that is the user's call to make.
 *
 * Returns the branch name, undefined when there is none (no repo, or git
 * refused), or null when the user chose not to continue without git.
 */
export async function prepareWorkBranch(
  command: Command,
  dir: string,
  actionId: string,
  interactive: boolean,
): Promise<null | string | undefined> {
  if (!(await isGitRepo(dir))) {
    command.warn(
      'This project is not a git repository - there will be no way to review the agent\'s changes with `git diff` or undo them.',
    )
    // Headless has nobody to ask; warning them is all we can do.
    if (!interactive) return undefined
    const proceed = await confirm('Continue anyway?', false)
    return proceed ? undefined : null
  }

  const name = await availableBranchName(dir, `adapty-${actionId}`)
  if (await createBranch(dir, name)) {
    command.log(`Working on branch ${name}`)
    return name
  }

  command.warn(`Could not create branch ${name} - continuing on the current branch.`)
  return undefined
}

export interface RunActionOptions {
  action: AgentAction
  /** Branch created for this run, if any - named in the closing message. */
  branch?: string
  ctx: PromptContext
  driver: AgentDriver
  /** Extra env for the agent process only (e.g. ADAPTY_TOKEN) - keeps secrets out of the global process.env. */
  env?: Record<string, string>
  interactive: boolean
  /** --no-telemetry: skip the usage event entirely (also honored: ADAPTY_TELEMETRY_DISABLED=1, DO_NOT_TRACK=1). */
  noTelemetry?: boolean
}

/**
 * The full post-question sequence shared by every agent-driven command:
 * run the agent headless → surface [STATUS] lines → rating → telemetry →
 * install the Adapty skill → point at ADAPTY_SETUP.md. Returns the result;
 * the caller decides how to fail.
 */
export async function runActionWithFollowUp(
  command: Command,
  {action, branch, ctx, driver, env, interactive, noTelemetry}: RunActionOptions,
): Promise<RunActionResult> {
  // Disclosed once during setup (see prepareWizard) - nothing to print here.
  const sendTelemetry = !noTelemetry && !telemetryDisabled()

  const spin = spinner()
  spin.start(`Running ${driver.displayName} - this can take a few minutes`)
  const started = Date.now()
  let result: AgentResult
  try {
    result = await runAgent(driver, {
      cwd: ctx.project.path,
      env,
      onStatus: (statusText) => spin.message(statusText),
      prompt: buildActionPrompt(action, ctx),
    })
  } catch (error) {
    // spawn itself failed (binary vanished, unspawnable) - fail with the crafted path, not a raw stack.
    result = {finalText: error instanceof Error ? error.message : String(error), ok: false}
  }

  spin.stop(result.ok ? `${capitalize(action.title)} complete` : 'The agent stopped before finishing.')

  const track = async (rating: null | number) => {
    if (!sendTelemetry) return
    await trackAgentRun({
      appId: ctx.appId,
      command: action.id,
      driver: driver.id,
      durationS: Math.round((Date.now() - started) / 1000),
      isDev: existsSync(join(command.config.root, '.git')),
      ok: result.ok,
      paywallApproach: ctx.paywallApproach,
      platform: ctx.project.platform,
      rating,
      version: command.config.version,
    })
  }

  if (!result.ok) {
    if (result.finalText) command.log(`\n${result.finalText.slice(0, 1500)}`)
    await track(null)
    return {failureReason: result.failureReason, finalText: result.finalText, ok: false}
  }

  if (result.finalText) command.log(`\n${result.finalText}`)

  let rating: null | number = null
  if (interactive) {
    const answer = (await text(`How was the ${action.title}? Rate 1-5 (enter to skip)`)) ?? ''
    const parsed = Number.parseInt(answer, 10)
    if (parsed >= 1 && parsed <= 5) rating = parsed
  }

  await track(rating)

  await installSkill()

  command.log(
    `\nDone. Review the changes with \`git diff\`${branch ? ` on branch ${branch}` : ''}, then finish up in the dashboard: ${DASHBOARD_URL}`,
  )
  if (existsSync(join(ctx.project.path, 'ADAPTY_SETUP.md'))) {
    command.log(
      'The remaining steps are in ADAPTY_SETUP.md - work through it yourself, or hand it to your agent:\n' +
        `  ${driver.resumeHint}`,
    )
  }

  return {finalText: result.finalText, ok: true}
}
