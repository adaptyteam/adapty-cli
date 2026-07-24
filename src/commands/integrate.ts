import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {integrateAction} from '../lib/agent/actions/integrate.js'
import {DRIVER_IDS, DRIVERS} from '../lib/agent/drivers/index.js'
import {emitCopyPrompt, reportActionFailure, runActionWithFollowUp} from '../lib/agent/run.js'
import {preparePromptContext, prepareWizard} from '../lib/agent/wizard.js'
import {billingLabel, detectBilling} from '../lib/project/billing.js'
import {confirm, isInteractive, select} from '../lib/ui/ask.js'

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
        if (wantsMigrate) {
          const passthrough = ['--path', path]
          if (flags.app) passthrough.push('--app', flags.app)
          if (flags.driver) passthrough.push('--driver', flags.driver)
          if (flags.copy) passthrough.push('--copy')
          if (flags['no-telemetry']) passthrough.push('--no-telemetry')
          return this.config.runCommand('migrate', passthrough)
        }
      } else {
        this.log(
          `Found ${billingLabel(billing)} in this project - \`adapty migrate\` is built for replacing it. Continuing with a fresh integration.`,
        )
      }
    }

    const setup = await prepareWizard(this, {...flags, path})
    if (!setup) return
    const {driver, interactive, project, token} = setup

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

    const promptCtx = await preparePromptContext(setup, approach)

    if (flags.copy) {
      return emitCopyPrompt(this, integrateAction, promptCtx)
    }

    if (interactive && !(await confirm(`Integrate the Adapty SDK into "${project.name}" now?`))) {
      return this.log('No problem - run `adapty integrate` again anytime, or use --copy to drive your own agent.')
    }

    const result = await runActionWithFollowUp(this, {
      action: integrateAction,
      ctx: promptCtx,
      driver: driver!,
      env: token ? {ADAPTY_TOKEN: token} : undefined,
      interactive,
      noTelemetry: flags['no-telemetry'],
    })
    if (!result.ok) reportActionFailure(this, driver!, result)
  }
}
