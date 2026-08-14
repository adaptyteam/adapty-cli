import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {integrateAction} from '../lib/agent/actions/integrate.js'
import {DRIVER_IDS, DRIVERS} from '../lib/agent/drivers/index.js'
import {collectStoreProducts} from '../lib/agent/products.js'
import {emitCopyPrompt, prepareWorkBranch, reportActionFailure, runActionWithFollowUp} from '../lib/agent/run.js'
import {preparePromptContext, prepareWizard, resolvePlacementDeveloperId} from '../lib/agent/wizard.js'
import {billingLabel, detectBilling} from '../lib/project/billing.js'
import {confirm, isInteractive, select} from '../lib/ui/ask.js'

/** Every integrate flag re-expressed as migrate argv, so the switch loses nothing the user typed. */
function migratePassthrough(
  path: string,
  flags: {app?: string; 'code-only'?: boolean; copy?: boolean; driver?: string; 'no-telemetry'?: boolean},
): string[] {
  const passthrough = ['--path', path]
  if (flags.app) passthrough.push('--app', flags.app)
  if (flags.driver) passthrough.push('--driver', flags.driver)
  if (flags.copy) passthrough.push('--copy')
  if (flags['code-only'] !== undefined) passthrough.push(flags['code-only'] ? '--code-only' : '--no-code-only')
  if (flags['no-telemetry']) passthrough.push('--no-telemetry')
  return passthrough
}

export default class Integrate extends Command {
  static description = `Set up the Adapty SDK in your app using your coding agent (${DRIVERS.map(
    (d) => d.displayName,
  ).join(', ')})`
static examples = [
    '<%= config.bin %> integrate',
    '<%= config.bin %> integrate --path ./apps/mobile',
    '<%= config.bin %> integrate --copy',
  ]
static flags = {
    app: Flags.string({description: 'Adapty app ID (UUID) to connect; skips the app picker'}),
    'code-only': Flags.boolean({
      allowNo: true,
      description:
        'The dashboard is already set up - wire the code to the existing entities and create nothing (--no-code-only forces entity creation; without either, the CLI asks when the app is not empty)',
    }),
    copy: Flags.boolean({
      description: 'Print the integration prompt instead of running an agent (paste it into any coding agent)',
    }),
    driver: Flags.string({description: 'Force a specific coding agent', options: DRIVER_IDS}),
    'no-telemetry': Flags.boolean({
      description: 'Do not send anonymous usage stats (also honored: ADAPTY_TELEMETRY_DISABLED=1, DO_NOT_TRACK=1)',
    }),
    path: Flags.string({description: 'App directory (defaults to the current directory)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Integrate)
    const path = resolve(flags.path ?? process.cwd())

    // A project that already has a billing SDK is a migration, not a fresh
    // integration - offer the switch BEFORE the wizard so no question runs twice.
    const billing = await detectBilling(path)
    if (billing) {
      if (isInteractive()) {
        const wantsMigrate = await confirm(
          `Found ${billingLabel(billing)} in this project - \`adapty migrate\` replaces it with Adapty end-to-end. Switch to migrate?`,
        )
        if (wantsMigrate === null) return this.log('Cancelled.')
        if (wantsMigrate) return this.config.runCommand('migrate', migratePassthrough(path, flags))
      } else {
        this.log(
          `Found ${billingLabel(billing)} in this project - \`adapty migrate\` is built for replacing it. Continuing with a fresh integration.`,
        )
      }
    }

    const setup = await prepareWizard(this, {...flags, path})
    if (!setup) return
    const {copyOnly, driver, installSkill, interactive, project, token} = setup

    // Paywall approach - the one product question the skill needs answered upfront.
    const approach = await select(
      'How do you want to build paywalls?',
      [
        {hint: 'no-code visual editor, recommended', label: 'Flow Builder', value: 'flow_builder'},
        {hint: 'you build the UI, Adapty handles products & purchases', label: 'Custom paywall', value: 'custom'},
        {hint: 'keep existing purchase code, Adapty only tracks', label: 'Observer mode', value: 'observer'},
      ],
      'flow_builder',
    )
    if (!approach) return this.log('Cancelled.')

    // The go/no-go gate comes BEFORE the product interview - never collect
    // answers that a declined confirm would throw away.
    if (!copyOnly && interactive && !(await confirm(`Integrate the Adapty SDK into "${project.name}" now?`))) {
      return this.log('No problem - run `adapty integrate` again anytime, or use --copy to drive your own agent.')
    }

    // In code-only mode the placement's developer ID is settled here, by the
    // user, not later by the agent - a wrong guess fails silently at runtime.
    const placementDeveloperId = await resolvePlacementDeveloperId(this, setup, approach)
    if (placementDeveloperId === null) return this.log('Cancelled.')

    // Real store IDs turn "defer everything to ADAPTY_SETUP.md" into a full dashboard
    // setup - pointless in code-only mode, where the products already exist in Adapty.
    const products = setup.dashboardMode === 'code-only' ? [] : await collectStoreProducts(project.platform)
    if (products === null) return this.log('Cancelled.')
    const promptCtx = await preparePromptContext(setup, approach, products, {placementDeveloperId})

    if (copyOnly) {
      return emitCopyPrompt(this, integrateAction, promptCtx, {installSkill})
    }

    // Every run gets its own branch; no git at all is the one case that stops us.
    const branch = await prepareWorkBranch(this, project.path, 'integrate', interactive)
    if (branch === null) return this.log('Run `git init` and commit what you have, then re-run `adapty integrate`.')

    const result = await runActionWithFollowUp(this, {
      action: integrateAction,
      branch,
      ctx: promptCtx,
      driver: driver!,
      env: token ? {ADAPTY_TOKEN: token} : undefined,
      interactive,
      noTelemetry: flags['no-telemetry'],
    })
    if (!result.ok) reportActionFailure(this, driver!, result)
  }
}
