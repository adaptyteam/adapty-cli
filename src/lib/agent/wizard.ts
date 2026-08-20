import type {Command} from '@oclif/core'

import type {ApiClient} from '../api-client.js'
import type {
  AccessLevelDTO,
  AppDetailDTO,
  AppSummaryDTO,
  PaywallDTO,
  PlacementSummaryDTO,
  ProductDTO,
} from '../api-schemas.js'

import {resolveToken} from '../auth.js'
import {createAuthenticatedClient} from '../client-from-config.js'
import {isValidUuid, type PaginatedResponse, paginationParams} from '../flags.js'
import {type DetectedProject, scanProject} from '../project/scan.js'
import {confirm, isInteractive, select, spinner, text} from '../ui/ask.js'
import {type AgentDriver, detectDrivers, DRIVERS} from './drivers/index.js'
import {renderStoreProducts, type StoreProduct} from './products.js'
import {type DashboardMode, type PromptContext, resolveCliCommand} from './prompt.js'
import {loadPlatformReference} from './skill-source.js'
import {telemetryDisabled} from './telemetry.js'

/** Everything already in the bound Adapty app - the basis for mode detection and the placement picker. */
export interface DashboardSnapshot {
  accessLevels: AccessLevelDTO[]
  paywalls: PaywallDTO[]
  placements: PlacementSummaryDTO[]
  products: ProductDTO[]
  /** Server-side totals per kind - the lists above hold only the first page (100). */
  totals: {accessLevels: number; paywalls: number; placements: number; products: number}
}

// One page is plenty here: the snapshot exists to detect a populated app and
// to offer a placement picker, not to mirror the account.
const SNAPSHOT_PAGE = paginationParams({page: 1, 'page-size': 100})

/** Four parallel GETs against endpoints that already back the CLI's own `list` commands. */
export async function fetchDashboardSnapshot(client: ApiClient, appId: string): Promise<DashboardSnapshot> {
  const [accessLevels, products, paywalls, placements] = await Promise.all([
    client.get<PaginatedResponse<AccessLevelDTO>>(`/apps/${appId}/access-levels`, SNAPSHOT_PAGE),
    client.get<PaginatedResponse<ProductDTO>>(`/apps/${appId}/products`, SNAPSHOT_PAGE),
    client.get<PaginatedResponse<PaywallDTO>>(`/apps/${appId}/paywalls`, SNAPSHOT_PAGE),
    client.get<PaginatedResponse<PlacementSummaryDTO>>(`/apps/${appId}/placements`, SNAPSHOT_PAGE),
  ])
  return {
    accessLevels: accessLevels.data,
    paywalls: paywalls.data,
    placements: placements.data,
    products: products.data,
    totals: {
      accessLevels: accessLevels.meta.pagination.count,
      paywalls: paywalls.meta.pagination.count,
      placements: placements.meta.pagination.count,
      products: products.meta.pagination.count,
    },
  }
}

export function snapshotIsEmpty(snapshot: DashboardSnapshot): boolean {
  return (
    snapshot.accessLevels.length === 0 &&
    snapshot.products.length === 0 &&
    snapshot.paywalls.length === 0 &&
    snapshot.placements.length === 0
  )
}

/** "Products  Monthly, Annual, Lifetime + 2 more" - names, because counts don't let the user recognize their own setup. */
function nameRow(label: string, names: string[], total: number): string[] {
  if (names.length === 0) return []
  // The list is one page; the server total keeps "+ N more" honest past it.
  const count = Math.max(total, names.length)
  const shown = names.slice(0, 3).join(', ')
  const more = count > 3 ? ` + ${count - 3} more` : ''
  return [`${label.padEnd(14)} ${shown}${more}`]
}

/** One line per non-empty entity kind, named by the field that identifies it to a human. */
export function renderSnapshotLines(snapshot: DashboardSnapshot): string[] {
  const {totals} = snapshot
  return [
    // sdk_id / developer_id are the strings that end up in code; titles are what the dashboard shows.
    ...nameRow('Access levels', snapshot.accessLevels.map((a) => a.sdk_id), totals.accessLevels),
    ...nameRow('Products', snapshot.products.map((p) => p.title), totals.products),
    ...nameRow('Paywalls', snapshot.paywalls.map((p) => p.title), totals.paywalls),
    ...nameRow('Placements', snapshot.placements.map((p) => p.developer_id), totals.placements),
  ]
}

export type {DashboardMode} from './prompt.js'

/**
 * The CLI decides the mode BEFORE the agent launches - the prompt never asks
 * the agent to work out which mode it is in. 'ask' sends the question to the
 * user; 'headless-needs-flag' makes the command error: headless is scripting,
 * and a wrong guess against a populated app is silent and unrecoverable
 * (immutable store IDs, placements that block flow IDs), while a refused run
 * is cheap to restart.
 */
export function decideDashboardMode(opts: {
  codeOnlyFlag: boolean | undefined
  interactive: boolean
  snapshot: DashboardSnapshot | null
}): 'ask' | 'headless-needs-flag' | DashboardMode {
  if (opts.codeOnlyFlag !== undefined) return opts.codeOnlyFlag ? 'code-only' : 'create'
  if (opts.snapshot === null) return opts.interactive ? 'ask' : 'create' // fetch failed: never fatal
  if (snapshotIsEmpty(opts.snapshot)) return 'create'
  return opts.interactive ? 'ask' : 'headless-needs-flag'
}

/**
 * The one snapshot value the agent must not choose for itself: several
 * placements and nothing in the code says which one this app fetches - that
 * information was lost when the setup happened in the dashboard - and a wrong
 * developer_id compiles, ships, and silently returns nothing at runtime.
 *
 * Called by the command AFTER its paywall-approach question (which is why this
 * cannot run inside prepareWizard); reuses the placements the wizard already
 * fetched. flow_builder always gets the text prompt: the placements endpoint
 * returns paywall placements only, so an empty list is ambiguous there. Both
 * text prompts are Enter-to-skip - skipping falls through to the playbook's
 * inferred-ID rule, same contract as collectStoreProducts.
 *
 * null = cancelled; undefined = skipped or not applicable; string = resolved.
 */
export async function resolvePlacementDeveloperId(
  command: Command,
  setup: WizardSetup,
  approach: string,
): Promise<null | string | undefined> {
  if (setup.dashboardMode !== 'code-only') return undefined
  if (approach === 'observer') return undefined

  const {interactive, placements} = setup

  if (approach === 'custom' && placements.length === 1) {
    command.log(`Using placement "${placements[0].developer_id}" from your dashboard.`)
    return placements[0].developer_id
  }

  if (!interactive) return undefined // never prompt without a TTY

  if (approach === 'custom' && placements.length > 1) {
    const choice = await select(
      'Which placement should the code fetch?',
      placements.map((p) => ({hint: p.title, label: p.developer_id, value: p.developer_id})),
      placements[0].developer_id,
    )
    return choice // null = cancelled, passed straight through
  }

  // flow_builder (flows aren't in the endpoint yet), or custom with zero placements.
  const answer = await text(
    approach === 'flow_builder'
      ? "Your flow's placement ID from the dashboard (Enter to skip - the agent will pick one and flag it)"
      : 'Placement ID the code should fetch (Enter to skip - the agent will pick one and flag it)',
  )
  if (answer === null) return null
  return answer.trim() || undefined
}

export interface WizardFlags {
  app?: string
  'code-only'?: boolean
  copy?: boolean
  driver?: string
  'no-telemetry'?: boolean
  path: string
}

export interface WizardSetup {
  appId: string
  /** Nothing will be run for the user: --copy, or no agent was found and they took the prompt instead. */
  copyOnly: boolean
  /** Resolved BEFORE the agent launches: 'code-only' = wire code to existing entities, create nothing. */
  dashboardMode: DashboardMode
  /** null whenever copyOnly is true. */
  driver: AgentDriver | null
  /** The user asked for the Adapty skill in the agent they actually use (only offered when none was found). */
  installSkill: boolean
  interactive: boolean
  /** Paywall placements already in the app (flow placements are not returned by the API yet). */
  placements: PlacementSummaryDTO[]
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
  const token = await ensureToken(command, interactive)
  if (token === null) return null // cancelled (already logged)

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
  // The explicit flag must win even when no app gets bound (keyless --copy
  // runs skip the whole block below); with an app, resolveDashboardMode
  // re-applies the same flag-first precedence.
  let dashboardMode: DashboardMode = flags['code-only'] ? 'code-only' : 'create'
  let placements: PlacementSummaryDTO[] = []
  if (token) {
    const bound = await bindApp(command, copyOnly, {appFlag: flags.app, interactive, project})
    if (!bound) return null // cancelled (already logged)
    appId = bound.appId
    sdkKey = bound.sdkKey

    // OUTSIDE bindApp's try/catch: that catch downgrades binding failures to a
    // warning on --copy runs, and the mode refusal must never be downgraded - a
    // copy prompt generated in the wrong mode tells an agent to create entities
    // in an app that already has them.
    if (appId && bound.client) {
      const resolved = await resolveDashboardMode(command, bound.client, {
        appId,
        codeOnlyFlag: flags['code-only'],
        interactive,
      })
      if (!resolved) return null // cancelled (already logged)
      dashboardMode = resolved.mode
      placements = resolved.placements
    }
  }

  return {
    appId,
    copyOnly,
    dashboardMode,
    driver,
    installSkill,
    interactive,
    placements,
    playbook,
    project,
    sdkKey,
    token: token ?? '',
  }
}

/** Await the prefetched playbook and assemble the PromptContext - identical for every agent-driven command. */
export async function preparePromptContext(
  setup: WizardSetup,
  paywallApproach: string,
  storeProducts?: StoreProduct[],
  opts: {migrationReference?: string; placementDeveloperId?: string} = {},
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
    dashboardMode: setup.dashboardMode,
    migrationReference: opts.migrationReference,
    paywallApproach,
    placementDeveloperId: opts.placementDeveloperId,
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

/**
 * Bind the Adapty app and its public SDK key. Best-effort on --copy runs: a
 * failure there degrades to an empty binding (the prompt is still useful with
 * the key blank) instead of aborting. null = the user cancelled the picker.
 */
async function bindApp(
  command: Command,
  copyOnly: boolean,
  opts: {appFlag?: string; interactive: boolean; project: DetectedProject},
): Promise<null | {appId: string; client?: ApiClient; sdkKey: string}> {
  try {
    const client = await createAuthenticatedClient(command.config)
    const picked = await resolveApp(command, client, opts)
    if (!picked) {
      command.log('Cancelled.')
      return null
    }

    if (!picked.sdkKey)
      command.warn('This app has no public SDK key yet - the agent will need one to call Adapty.activate().')
    return {appId: picked.appId, client, sdkKey: picked.sdkKey}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!copyOnly) {
      command.error(`Couldn't bind an Adapty app (${message}). Fix that and try again.`)
    }

    command.warn(`Couldn't bind an Adapty app (${message}) - the prompt will leave the SDK key blank.`)
    return {appId: '', sdkKey: ''}
  }
}

/** Resolve or interactively acquire a session token. null = user cancelled (already logged); undefined = still no token. */
async function ensureToken(command: Command, interactive: boolean): Promise<null | string | undefined> {
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

  return token ?? undefined
}

/**
 * Fetch what's already in the app and settle the mode BEFORE any agent runs.
 * Returns null only when the user cancels the question. A failed fetch is
 * never fatal: interactive asks without the names, headless proceeds as today.
 */
async function resolveDashboardMode(
  command: Command,
  client: ApiClient,
  opts: {appId: string; codeOnlyFlag: boolean | undefined; interactive: boolean},
): Promise<null | {mode: DashboardMode; placements: PlacementSummaryDTO[]}> {
  const {appId, codeOnlyFlag, interactive} = opts
  let snapshot: DashboardSnapshot | null = null
  try {
    snapshot = await fetchDashboardSnapshot(client, appId)
  } catch {
    command.warn("Couldn't read this app's current dashboard setup - continuing without it.")
  }

  const placements = snapshot?.placements ?? []
  const decision = decideDashboardMode({codeOnlyFlag, interactive, snapshot})

  if (decision === 'headless-needs-flag') {
    command.error(
      'This app already has dashboard entities. Pass --code-only to wire the code to them (nothing is created), or --no-code-only to also create what is missing.',
    )
  }

  if (decision !== 'ask') {
    if (decision === 'code-only')
      command.log('Code-only run: the agent will use the existing dashboard entities and create nothing.')
    return {mode: decision, placements}
  }

  // Names, not counts - the user has to recognize their own setup.
  if (snapshot) {
    command.log('\nThis app already has:')
    for (const line of renderSnapshotLines(snapshot)) command.log(`  ${line}`)
  }

  const answer = await select(
    snapshot
      ? 'Use these entities, or create what is missing?'
      : "Couldn't read this app's setup - have you already created your entities in the dashboard?",
    [
      {hint: 'wires code to them, creates nothing', label: 'Use these - I set them up already', value: 'code-only'},
      {hint: 'the agent creates whatever the app is missing', label: "Create what's missing", value: 'create'},
    ],
    // Two defaults on purpose: a KNOWN populated app most likely means the user
    // set it up (code-only); an UNREADABLE app is an unknown, and unknowns
    // default to today's behavior (create).
    snapshot ? 'code-only' : 'create',
  )
  if (!answer) {
    command.log('Cancelled.')
    return null
  }

  return {mode: answer as DashboardMode, placements}
}

async function resolveApp(
  command: Command,
  client: ApiClient,
  opts: {appFlag?: string; interactive: boolean; project: DetectedProject},
): Promise<null | {appId: string; sdkKey: string}> {
  const {appFlag, interactive, project} = opts
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
