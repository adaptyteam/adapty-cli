import {dirname, join} from 'node:path'

import type {DetectedProject} from '../project/scan.js'

/**
 * Shared context every agent-driven command provides. Action-specific data
 * (e.g. a migration's source provider) travels inside the action's task body.
 */
export interface PromptContext {
  appId: string
  /** How the agent invokes this exact CLI build (never `npx adapty@latest` - version skew). */
  cliCommand: string
  paywallApproach: string
  platformReference: string
  project: DetectedProject
  sdkKey: string
}

/**
 * One agent-driven task (integrate, migrate, ...). The shared wrapper below
 * supplies the context block, the common rules, the [STATUS] protocol, and
 * the ADAPTY_SETUP.md finish conventions - an action only defines its
 * mission-specific task body and human labels.
 */
export interface AgentAction {
  /** Command id, used in telemetry tags (e.g. 'integrate'). */
  id: string
  /** The task body. Opens with the mission sentence; conditional content lives here. */
  task(ctx: PromptContext): string
  /** Human noun for messages like "How was the integration?" */
  title: string
}

/** 'headless' = run by this CLI, no user available; 'copy' = pasted into the user's own interactive agent. */
export type PromptMode = 'copy' | 'headless'

/**
 * The command the agent must use to invoke THIS build of the CLI. Never
 * `npx adapty@latest` (the published package can lag behind the commands the
 * prompt relies on). bin/dev.js only works through its shebang (ts-node
 * loader flags), so a bare `node dev.js` child would crash on .ts imports -
 * point at its sibling run.js instead.
 */
export function resolveCliCommand(): string {
  const entry = process.argv[1]
  if (!entry) return 'npx -y adapty@latest'
  const resolved = entry.endsWith('dev.js') ? join(dirname(entry), 'run.js') : entry
  return `node "${resolved}"`
}

function contextBlock(ctx: PromptContext): string {
  const {appId, paywallApproach, project, sdkKey} = ctx
  return `<context>
  <platform>${project.platformLabel}</platform>
  <app_directory>${project.path}</app_directory>
  <adapty_app_id>${appId || '(not provided)'}</adapty_app_id>
  <public_sdk_key purpose="Adapty.activate()">${sdkKey || '(not provided - ask the user to paste it from the Adapty dashboard before running)'}</public_sdk_key>
  ${paywallApproach ? `<paywall_approach>${paywallApproach}</paywall_approach>\n  ` : ''}<docs note="every page is fetchable as markdown">https://adapty.io/docs/llms.txt lists all pages; fetch any page as https://adapty.io/docs/{slug}.md</docs>
</context>`
}

function rulesBlock(ctx: PromptContext, actionId: string, mode: PromptMode): string {
  const interactionRule =
    mode === 'headless'
      ? `<rule>This is a HEADLESS run - there is no user to ask. Never ask questions. Where a playbook says to ask the user, pick the stated default (or the most conservative option), continue, and record the decision in ADAPTY_SETUP.md (see the finish instructions).</rule>`
      : `<rule>When a decision genuinely needs the user (store product IDs, existing dashboard setup), ask - otherwise pick the stated default and record it in ADAPTY_SETUP.md (see the finish instructions).</rule>`
  const statusRule =
    mode === 'headless'
      ? `\n  <rule>Emit a one-line progress update prefixed with '[STATUS] ' before EVERY step, including before running any shell command (e.g. '[STATUS] Installing the Adapty package', '[STATUS] Creating the placement'). The user only sees these [STATUS] lines - never go more than one tool call without one.</rule>`
      : ''

  return `<rules>
  <rule>Make the smallest set of edits that achieves a working, verifiable result. Do not refactor unrelated code or reformat files.</rule>
  ${interactionRule}
  <rule>Never invent an Adapty API key. Use the exact public SDK key from the context. Never write a secret key into source.</rule>
  <rule>Before editing any file, read it first. Match the file's existing style and conventions.</rule>
  <rule>Detect the package manager / build system from the project (lockfiles, Podfile, gradle files, pubspec.yaml) rather than assuming.</rule>
  <rule>Dashboard entities (access levels, products, paywalls, placements) are managed with the Adapty CLI. Invoke it EXACTLY as \`${ctx.cliCommand} <command> --json\` and scope every command with --app ${ctx.appId || '<APP_ID>'}. It authenticates via the ADAPTY_TOKEN environment variable, which is already set for you. Never ask the user for IDs the CLI can return.</rule>
  <rule>NEVER run the CLI's auth commands (auth login / logout / revoke) - login needs a browser and logout would destroy the user's session. If a CLI call fails with an auth error, do NOT retry or troubleshoot auth: record the exact remaining commands in ADAPTY_SETUP.md and continue with the code stages.</rule>
  <rule>Store product IDs are IMMUTABLE in Adapty - once a product is created its store IDs can never be changed, only the whole product deleted and recreated. So NEVER create a product with a guessed or placeholder store ID. Create products only with real IDs you found in the code, config, or provided data. When you do not know the real ID, skip creating that product and put the exact ready-to-run \`products create\` command in ADAPTY_SETUP.md with a <REAL_PRODUCT_ID> slot to fill in. Paywall product lists ARE editable later - create paywalls/placements now and note in ADAPTY_SETUP.md to attach the products once created.</rule>
  <rule>Never invent an SDK API. Every symbol you write must come from the playbook below or a docs page you fetched. Where a docs URL in the playbook carries a ?ref=skill-<sessionToken> tag, use ref=cli-${actionId} instead.</rule>${statusRule}
</rules>`
}

function finishBlock(mode: PromptMode): string {
  return `<finish>
When the task is complete:

1. Write a checklist file \`ADAPTY_SETUP.md\` in the app directory root covering everything that still needs a human (or another agent session). Use GitHub checkboxes (\`- [ ]\`), be specific (exact IDs, file paths, dashboard URLs), and group into these sections, skipping any that are empty:
   - **Replace placeholders** - every placeholder or default you chose, with where it lives (Adapty dashboard and/or code) and what to put there instead.
   - **Dashboard steps** - what must be done at https://app.adapty.io.
   - **Verify on device** - run the app, see the paywall at the placement(s), complete a sandbox purchase.
   - **Before release** - fetch https://adapty.io/docs/release-checklist.md and include the few items relevant to this app (e.g. server notifications, switching placeholder products to real ones).
   Start the file with one line stating what was done and when to delete the file, and end it with: "Tip: you can hand this file to a coding agent - e.g. \`claude "work through ADAPTY_SETUP.md"\` - to finish these steps."
2. End with a 3-5 line summary (what was changed and configured, the key IDs, and that the remaining steps are in ADAPTY_SETUP.md).${
    mode === 'headless' ? `\n   Then a final line '[STATUS] Done'.` : ''
  }
</finish>`
}

export function buildActionPrompt(action: AgentAction, ctx: PromptContext, mode: PromptMode = 'headless'): string {
  return `${contextBlock(ctx)}

${rulesBlock(ctx, action.id, mode)}

<task>
${action.task(ctx)}
</task>

${finishBlock(mode)}`
}

/** Same prompt for pasting into the user's own interactive agent: no [STATUS] protocol, and questions are allowed. */
export function buildCopyPrompt(action: AgentAction, ctx: PromptContext): string {
  return buildActionPrompt(action, ctx, 'copy')
}
