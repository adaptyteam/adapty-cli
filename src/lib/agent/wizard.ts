import type {Command} from '@oclif/core'

import type {ApiClient} from '../api-client.js'
import type {AppDetailDTO, AppSummaryDTO} from '../api-schemas.js'

import {resolveToken} from '../auth.js'
import {createAuthenticatedClient} from '../client-from-config.js'
import {isValidUuid, type PaginatedResponse, paginationParams} from '../flags.js'
import {type DetectedProject, scanProject} from '../project/scan.js'
import {confirm, isInteractive, select, spinner, text} from '../ui/ask.js'
import {type AgentDriver, detectDrivers, DRIVERS} from './drivers/index.js'
import {renderStoreProducts, type StoreProduct} from './products.js'
import {type PromptContext, resolveCliCommand} from './prompt.js'
import {loadPlatformReference} from './skill-source.js'
import {telemetryDisabled} from './telemetry.js'

export interface WizardFlags {
  app?: string
  copy?: boolean
  driver?: string
  'no-telemetry'?: boolean
  path: string
}

export interface WizardSetup {
  appId: string
  /** Nothing will be run for the user: --copy, or no agent was found and they took the prompt instead. */
  copyOnly: boolean
  /** null whenever copyOnly is true. */
  driver: AgentDriver | null
  /** The user asked for the Adapty skill in the agent they actually use (only offered when none was found). */
  installSkill: boolean
  interactive: boolean
  /** Playbook fetch started during the wizard so its latency hides behind the user's answers. */
  playbook: Promise<{error: unknown; ok: false} | {ok: true; reference: string}>
  project: DetectedProject
  sdkKey: string
  /** Adapty session token, for scoping into the agent's environment. Empty in keyless --copy runs. */
  token: string
}

/**
 * The gathering steps shared by every agent-driven command (integrate,
 * migrate, ...): detect the project, find a coding agent, ensure an Adapty
 * session, and bind an Adapty app + SDK key. Returns null when the user
 * cancels (already logged); throws command.error on fatals.
 */
export async function prepareWizard(command: Command, flags: WizardFlags): Promise<null | WizardSetup> {
  const commandName = command.id ?? 'integrate'

  // 1. What app is this?
  const project = await scanProject(flags.path)
  if (!project) {
    command.error(
      'No supported mobile app found here. Supported: iOS, Android, Flutter, React Native, Capacitor, Unity, Kotlin Multiplatform.\n' +
        'Run from the app directory or pass --path.',
      {exit: 2},
    )
  }

  command.log(`Detected ${project.platformLabel} app "${project.name}"`)

  // Kick off the GitHub fetch now; the .catch keeps a failure from becoming
  // an unhandled rejection while the user is still answering questions.
  const playbook = loadPlatformReference(project.platform).then(
    (reference) => ({ok: true as const, reference}),
    (error: unknown) => ({error, ok: false as const}),
  )

  // 2. Who does the work - an agent we can run, or the user's own agent?
  const interactive = isInteractive()
  const execution = await resolveExecution(command, commandName, interactive, flags)
  if (!execution) return null
  const {copyOnly, driver, installSkill} = execution

  // 3. Auth - needed to pick/create the app and for the agent's `adapty` CLI calls.
  let token = await resolveToken(command.config.configDir)
  if (!token && interactive) {
    const wantsLogin = await confirm('You are not logged in to Adapty. Log in now?')
    if (wantsLogin === null) {
      command.log('Cancelled.')
      return null
    }

    if (wantsLogin) {
      await command.config.runCommand('auth:login')
      token = await resolveToken(command.config.configDir)
    }
  }

  if (!token && !copyOnly) {
    command.error('This command needs an authenticated session. Run `adapty auth login` and try again.')
  }

  // Disclose telemetry here, right after sign-in: said once among the other
  // setup lines it scrolls away, whereas saying it last would leave it pinned
  // above the run spinner for the whole integration. A copy-only run sends nothing.
  if (!copyOnly && !flags['no-telemetry'] && !telemetryDisabled()) {
    command.log(
      'Anonymous usage stats are shared with Adapty (platform, outcome, duration - never your code or keys). Disable with --no-telemetry or ADAPTY_TELEMETRY_DISABLED=1.',
    )
  }

  // 4. Connect to an Adapty app and get its public SDK key. Without an agent
  // to run this is best-effort: the prompt is still useful with the key blank.
  let appId = ''
  let sdkKey = ''
  if (token) {
    try {
      const picked = await resolveApp(command, project, interactive, flags.app)
      if (!picked) {
        command.log('Cancelled.')
        return null
      }

      appId = picked.appId
      sdkKey = picked.sdkKey
      if (!sdkKey)
        command.warn('This app has no public SDK key yet - the agent will need one to call Adapty.activate().')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!copyOnly) {
        command.error(`Couldn't bind an Adapty app (${message}). Fix that and try again.`)
      }

      command.warn(`Couldn't bind an Adapty app (${message}) - the prompt will leave the SDK key blank.`)
    }
  }

  return {appId, copyOnly, driver, installSkill, interactive, playbook, project, sdkKey, token: token ?? ''}
}

/** Await the prefetched playbook and assemble the PromptContext - identical for every agent-driven command. */
export async function preparePromptContext(
  setup: WizardSetup,
  paywallApproach: string,
  storeProducts?: StoreProduct[],
  migrationReference?: string,
): Promise<PromptContext> {
  const spin = spinner()
  spin.start('Fetching the integration playbook')
  const playbook = await setup.playbook
  if (!playbook.ok) {
    spin.stop('Could not fetch the integration playbook')
    throw playbook.error instanceof Error ? playbook.error : new Error(String(playbook.error))
  }

  spin.stop('Integration playbook ready')

  return {
    appId: setup.appId,
    cliCommand: resolveCliCommand(),
    migrationReference,
    paywallApproach,
    platformReference: playbook.reference,
    project: setup.project,
    sdkKey: setup.sdkKey,
    storeProducts: storeProducts && storeProducts.length > 0 ? renderStoreProducts(storeProducts) : undefined,
  }
}

/** 'none-installed' = no agent on PATH; null = the user cancelled (already logged). */
type DriverResolution = 'none-installed' | AgentDriver | null

/** How this run will be carried out: by an agent we spawn, or by the user's own agent via the clipboard. */
interface Execution {
  copyOnly: boolean
  driver: AgentDriver | null
  installSkill: boolean
}

/**
 * Decide who does the work. --copy skips agent detection entirely; otherwise
 * we look for an agent on PATH and, finding none, offer the agentless path
 * instead of dead-ending. Returns null when the user backs out (already logged).
 */
async function resolveExecution(
  command: Command,
  commandName: string,
  interactive: boolean,
  flags: WizardFlags,
): Promise<Execution | null> {
  if (flags.copy) return {copyOnly: true, driver: null, installSkill: false}

  const resolved = await resolveDriver(command, interactive, flags.driver)
  if (resolved === null) return null

  if (resolved === 'none-installed') {
    const agentless = await offerAgentlessPath(command, commandName, interactive)
    if (!agentless) return null
    return {copyOnly: true, driver: null, installSkill: agentless.installSkill}
  }

  command.log(`Using ${resolved.displayName} as the coding agent`)
  return {copyOnly: false, driver: resolved, installSkill: false}
}

/**
 * Pick the coding agent: --driver wins, a single detected agent is used
 * as-is, several detected agents become an interactive choice (first =
 * default; headless runs also take the first).
 */
async function resolveDriver(command: Command, interactive: boolean, driverFlag?: string): Promise<DriverResolution> {
  const drivers = await detectDrivers()

  if (driverFlag) {
    const driver = drivers.find((d) => d.id === driverFlag)
    if (!driver) {
      command.error(`Agent "${driverFlag}" not found on PATH. Detected: ${drivers.map((d) => d.id).join(', ') || 'none'}.`)
    }

    return driver
  }

  if (drivers.length === 0) return 'none-installed'

  if (drivers.length === 1 || !interactive) return drivers[0]

  const choice = await select(
    'Which coding agent should do the work?',
    drivers.map((d) => ({label: d.displayName, value: d.id})),
    drivers[0].id,
  )
  if (!choice) {
    command.log('Cancelled.')
    return null
  }

  // choice comes from options built from this same drivers list, so the lookup always succeeds.
  return drivers.find((d) => d.id === choice)!
}

function logInstallHints(command: Command): void {
  const longestName = Math.max(...DRIVERS.map((d) => d.displayName.length))
  command.log('\nTo have the CLI do the work itself, install one of these and re-run:')
  for (const d of DRIVERS) command.log(`  ${`${d.displayName}:`.padEnd(longestName + 1)} ${d.installHint}`)
}

/**
 * No agent on PATH is not a dead end. Most people run their agent inside an
 * editor (Cursor, Copilot in VS Code, Windsurf, ...), where this CLI cannot
 * invoke it - but the two things that actually help still work: the prompt on
 * their clipboard, and the Adapty skill installed into whatever agent they do
 * use. Returns null when the user declines or cancels (already logged).
 */
async function offerAgentlessPath(
  command: Command,
  commandName: string,
  interactive: boolean,
): Promise<null | {installSkill: boolean}> {
  command.log(`\nNo coding agent found in your terminal (looked for ${DRIVERS.map((d) => d.displayName).join(', ')}).`)

  // Headless: nobody is here to take a clipboard or answer a question.
  if (!interactive) {
    command.log(`Run \`adapty ${commandName} --copy\` to get a prompt for any agent.`)
    logInstallHints(command)
    return null
  }

  command.log('If you use an agent inside your editor, this CLI still has two things for you.')

  const wantsPrompt = await confirm(`Put the ${commandName} prompt on your clipboard, ready to paste into it?`)
  if (wantsPrompt === null) {
    command.log('Cancelled.')
    return null
  }

  if (!wantsPrompt) {
    logInstallHints(command)
    return null
  }

  const wantsSkill = await confirm(
    'Also install the Adapty skill into your agent, so it knows Adapty in every future session?',
  )
  if (wantsSkill === null) {
    command.log('Cancelled.')
    return null
  }

  // The rest of the wizard still runs: the prompt is only worth pasting with
  // the app ID and SDK key already in it.
  return {installSkill: wantsSkill}
}

async function createApp(
  command: Command,
  client: ApiClient,
  project: DetectedProject,
): Promise<null | {appId: string; sdkKey: string}> {
  const title = await text('Name for the new app', project.name)
  if (!title) return null
  const app = await client.post<AppDetailDTO>('/apps', {title})
  command.log(`Created Adapty app "${app.title}"`)
  return {appId: app.id, sdkKey: app.sdk_key ?? ''}
}

async function resolveApp(
  command: Command,
  project: DetectedProject,
  interactive: boolean,
  appFlag?: string,
): Promise<null | {appId: string; sdkKey: string}> {
  const client = await createAuthenticatedClient(command.config)

  if (appFlag) {
    if (!isValidUuid(appFlag)) command.error('Invalid app ID format. Run `adapty apps list` to find your app ID.')
    const app = await client.get<AppDetailDTO>(`/apps/${appFlag}`)
    command.log(`Using Adapty app "${app.title}"`)
    return {appId: app.id, sdkKey: app.sdk_key ?? ''}
  }

  const {data: apps} = await client.get<PaginatedResponse<AppSummaryDTO>>(
    '/apps',
    paginationParams({page: 1, 'page-size': 100}),
  )

  // Never create or guess an app without a user: creating is a real, visible
  // side effect. Headless runs must pass --app (or have exactly one app).
  if (!interactive) {
    if (apps.length === 1) {
      const app = apps[0]
      command.log(`Using Adapty app "${app.title}"`)
      return {appId: app.id, sdkKey: app.sdk_key ?? ''}
    }

    throw new Error(
      apps.length === 0
        ? 'no apps in this account - run interactively to create one, or create it in the dashboard'
        : `${apps.length} apps in this account - pass --app <id> to choose (see \`adapty apps list\`)`,
    )
  }

  if (apps.length === 0) {
    command.log('No apps in your Adapty account yet.')
    return createApp(command, client, project)
  }

  const CREATE = '__create__'
  const choice = await select(
    'Which Adapty app is this project?',
    [
      {hint: 'a new app with its own SDK key', label: '+ Create a new app', value: CREATE},
      ...apps.map((app) => ({label: app.title, value: app.id})),
    ],
    CREATE,
  )
  if (!choice) return null
  if (choice === CREATE) return createApp(command, client, project)
  const app = apps.find((a) => a.id === choice)!
  return {appId: app.id, sdkKey: app.sdk_key ?? ''}
}
