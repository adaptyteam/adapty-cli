import {Command, Flags} from '@oclif/core'
import {execFile} from 'node:child_process'
import {resolve} from 'node:path'
import {promisify} from 'node:util'

import {buildMigrateAction} from '../lib/agent/actions/migrate.js'
import {DRIVER_IDS} from '../lib/agent/drivers/index.js'
import {emitCopyPrompt, reportActionFailure, runActionWithFollowUp} from '../lib/agent/run.js'
import {preparePromptContext, prepareWizard} from '../lib/agent/wizard.js'
import {BILLING_LABELS, type BillingId, billingLabel, detectBilling} from '../lib/project/billing.js'
import {fetchRcCatalog, renderRcCatalog} from '../lib/project/revenuecat.js'
import {confirm, select, spinner} from '../lib/ui/ask.js'

export default class Migrate extends Command {
  static description = 'Migrate your app from RevenueCat, Superwall, or Qonversion to Adapty using your coding agent'
static examples = [
    '<%= config.bin %> migrate',
    '<%= config.bin %> migrate --path ./apps/mobile',
    '<%= config.bin %> migrate --copy',
  ]
static flags = {
    app: Flags.string({description: 'Adapty app ID (UUID) to connect; skips the app picker'}),
    copy: Flags.boolean({
      description: 'Print the migration prompt instead of running an agent (paste it into any coding agent)',
    }),
    driver: Flags.string({description: 'Force a specific coding agent', options: DRIVER_IDS}),
    'no-telemetry': Flags.boolean({
      description: 'Do not send anonymous usage stats (also honored: ADAPTY_TELEMETRY_DISABLED=1, DO_NOT_TRACK=1)',
    }),
    path: Flags.string({description: 'App directory (defaults to the current directory)'}),
    'rc-key': Flags.string({
      description:
        'RevenueCat v2 secret API key - pulls your RC catalog (entitlements, products, offerings) so entities are recreated exactly instead of guessed from code',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Migrate)
    const path = resolve(flags.path ?? process.cwd())

    const setup = await prepareWizard(this, {...flags, path})
    if (!setup) return
    const {driver, interactive, project, token} = setup

    // With an RC key the source is a given; otherwise auto-detect and let the user correct.
    let providerLabel = 'RevenueCat'
    let rcCatalog: string | undefined
    if (flags['rc-key']) {
      const rcSpin = spinner()
      rcSpin.start('Pulling your RevenueCat catalog')
      const catalog = await fetchRcCatalog(flags['rc-key'])
      if (catalog) {
        rcSpin.stop(
          `RevenueCat catalog loaded: "${catalog.projectName}" - ${catalog.entitlements.length} entitlement(s), ${catalog.products.length} product(s), ${catalog.offerings.length} offering(s)`,
        )
        if (!catalog.complete) {
          this.warn(
            'Some RevenueCat requests failed or were truncated - the catalog may be incomplete. The agent is told to flag this in ADAPTY_SETUP.md.',
          )
        }

        rcCatalog = renderRcCatalog(catalog)
      } else {
        rcSpin.stop('Could not read the RevenueCat catalog')
        this.error(
          'The RevenueCat API rejected the key or returned no project. Use a v2 SECRET key (sk_...) with read scopes for projects, apps, entitlements, products, and offerings.',
        )
      }
    } else {
      const detected = await detectBilling(path)
      if (detected) this.log(`Detected ${billingLabel(detected)} in this project`)
      if (interactive) {
        const choice = await select(
          'What are you migrating from?',
          [
            {label: 'RevenueCat', value: 'revenuecat'},
            {label: 'Superwall', value: 'superwall'},
            {label: 'Qonversion', value: 'qonversion'},
            {hint: 'in_app_purchase, react-native-iap, Unity IAP, ...', label: 'A store plugin', value: 'store-plugin'},
            {hint: 'hand-rolled StoreKit / Play Billing', label: 'Custom store code', value: 'native-store'},
          ],
          detected?.id,
        )
        if (!choice) return this.log('Cancelled.')
        // Prefer the detected detail ("the in_app_purchase plugin") when the user confirms the detected kind.
        providerLabel = detected && detected.id === choice ? billingLabel(detected) : BILLING_LABELS[choice as BillingId]
        if (choice === 'revenuecat') {
          this.log(
            'Tip: pass --rc-key <v2 secret key> to recreate your RC entitlements, products, and offerings exactly.',
          )
        }
      } else {
        // Headless: never dead-end on a missing answer - fall back to a generic label.
        providerLabel = detected ? billingLabel(detected) : 'the current billing SDK'
      }
    }

    const approach = await select(
      'How do you want to build paywalls in Adapty?',
      [
        {hint: 'no-code visual editor, recommended', label: 'Flow Builder', value: 'flow_builder'},
        {hint: 'you build the UI, Adapty handles products & purchases', label: 'Custom paywall', value: 'custom'},
      ],
      'flow_builder',
    )
    if (!approach) return this.log('Cancelled.')

    const promptCtx = await preparePromptContext(setup, approach)
    const action = buildMigrateAction(providerLabel, rcCatalog)

    if (flags.copy) {
      return emitCopyPrompt(this, action, promptCtx)
    }

    // A migration rewrites many files - a clean tree makes it reviewable and revertable.
    if (await hasDirtyWorkingTree(path)) {
      this.warn('This project has uncommitted changes. Commit or stash them so `git diff` shows only the migration.')
      if (interactive && !(await confirm('Proceed on the dirty working tree anyway?', false))) {
        return this.log('Commit your changes and re-run `adapty migrate`.')
      }
    }

    if (interactive && !(await confirm(`Migrate "${project.name}" from ${providerLabel} to Adapty now?`))) {
      return this.log('No problem - run `adapty migrate` again anytime, or use --copy to drive your own agent.')
    }

    const result = await runActionWithFollowUp(this, {
      action,
      ctx: promptCtx,
      driver: driver!,
      env: token ? {ADAPTY_TOKEN: token} : undefined,
      interactive,
      noTelemetry: flags['no-telemetry'],
    })
    if (!result.ok) reportActionFailure(this, driver!, result)
  }
}

const execFileAsync = promisify(execFile)

/** Uncommitted changes present? Outside a git repo -> false (nothing to protect). */
async function hasDirtyWorkingTree(dir: string): Promise<boolean> {
  try {
    const {stdout} = await execFileAsync('git', ['-C', dir, 'status', '--porcelain'], {timeout: 5000})
    return stdout.trim().length > 0
  } catch {
    return false
  }
}
