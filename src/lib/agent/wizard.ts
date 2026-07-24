import type {Command} from '@oclif/core'

import type {ApiClient} from '../api-client.js'
import type {AppDetailDTO, AppSummaryDTO} from '../api-schemas.js'

import {resolveToken} from '../auth.js'
import {createAuthenticatedClient} from '../client-from-config.js'
import {isValidUuid, type PaginatedResponse, paginationParams} from '../flags.js'
import {type DetectedProject, scanProject} from '../project/scan.js'
import {confirm, isInteractive, select, spinner, text} from '../ui/ask.js'
import {type AgentDriver, detectDrivers} from './drivers.js'
import {type PromptContext, resolveCliCommand} from './prompt.js'
import {loadPlatformReference} from './skill-source.js'

export interface WizardFlags {
  app?: string
  copy?: boolean
  driver?: string
  path: string
}

export interface WizardSetup {
  appId: string
  /** null only in --copy mode. */
  driver: AgentDriver | null
  interactive: boolean
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

  // 2. Which agent will do the work?
  let driver: AgentDriver | null = null
  if (!flags.copy) {
    const drivers = await detectDrivers()
    driver = flags.driver ? (drivers.find((d) => d.id === flags.driver) ?? null) : (drivers[0] ?? null)
    if (flags.driver && !driver) {
      command.error(
        `Agent "${flags.driver}" not found on PATH. Detected: ${drivers.map((d) => d.id).join(', ') || 'none'}.`,
      )
    }

    if (!driver) {
      command.log('\nNo coding agent found (looked for Claude Code and Codex).')
      command.log(`Install one and re-run, or use \`adapty ${commandName} --copy\` to get a prompt for any agent:`)
      command.log('  Claude Code: npm install --global @anthropic-ai/claude-code')
      command.log('  Codex:       npm install --global @openai/codex')
      return null
    }

    command.log(`Using ${driver.displayName} as the coding agent`)
  }

  // 3. Auth - needed to pick/create the app and for the agent's `adapty` CLI calls.
  const interactive = isInteractive()
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

  if (!token && !flags.copy) {
    command.error('This command needs an authenticated session. Run `adapty auth login` and try again.')
  }

  // 4. Connect to an Adapty app and get its public SDK key. With --copy this
  // is best-effort: the prompt is still useful with the key left blank.
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
      if (!flags.copy) {
        command.error(`Couldn't bind an Adapty app (${message}). Fix that and try again.`)
      }

      command.warn(`Couldn't bind an Adapty app (${message}) - the prompt will leave the SDK key blank.`)
    }
  }

  return {appId, driver, interactive, project, sdkKey, token: token ?? ''}
}

/** Fetch the platform playbook and assemble the PromptContext - identical for every agent-driven command. */
export async function preparePromptContext(setup: WizardSetup, paywallApproach: string): Promise<PromptContext> {
  const spin = spinner()
  spin.start('Fetching the integration playbook')
  const platformReference = await loadPlatformReference(setup.project.platform)
  spin.stop('Integration playbook ready')

  return {
    appId: setup.appId,
    cliCommand: resolveCliCommand(),
    paywallApproach,
    platformReference,
    project: setup.project,
    sdkKey: setup.sdkKey,
  }
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
