import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {buildMigrateAction} from '../lib/agent/actions/migrate.js'
import {DRIVER_IDS} from '../lib/agent/drivers/index.js'
import {collectStoreProducts} from '../lib/agent/products.js'
import {emitCopyPrompt, prepareWorkBranch, reportActionFailure, runActionWithFollowUp} from '../lib/agent/run.js'
import {loadMigrationReference} from '../lib/agent/skill-source.js'
import {preparePromptContext, prepareWizard, resolvePlacementDeveloperId} from '../lib/agent/wizard.js'
import {BILLING_LABELS, type BillingId, billingLabel, detectBilling} from '../lib/project/billing.js'
import {hasUncommittedChanges} from '../lib/project/git.js'
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
    'code-only': Flags.boolean({
      allowNo: true,
      description:
        'The dashboard is already set up - wire the code to the existing entities and create nothing (--no-code-only forces entity creation; without either, the CLI asks when the app is not empty)',
    }),
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

    // --rc-key exists to recreate RC entities in Adapty; --code-only creates nothing.
    if (flags['rc-key'] && flags['code-only']) {
      this.error(
        '--rc-key recreates your RevenueCat entities in Adapty, but --code-only creates nothing - pass one or the other.',
      )
    }

    const setup = await prepareWizard(this, {...flags, path})
    if (!setup) return
    const {copyOnly, driver, installSkill, interactive, project, token} = setup

    // With an RC key the source is a given; otherwise auto-detect and let the user correct.
    let providerLabel = 'RevenueCat'
    // The label is for humans; the id picks references/migration-<id>.md.
    let sourceId: BillingId | undefined = 'revenuecat'
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
        sourceId = choice as BillingId
        if (choice === 'revenuecat') {
          this.log(
            'Tip: pass --rc-key <v2 secret key> to recreate your RC entitlements, products, and offerings exactly.',
          )
        }
      } else {
        // Headless: never dead-end on a missing answer - fall back to a generic label.
        providerLabel = detected ? billingLabel(detected) : 'the current billing SDK'
        sourceId = detected?.id
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

    // Cheap, deterministic gates come BEFORE the product interview - never
    // collect answers that a declined confirm would throw away.
    if (!copyOnly) {
      // A migration rewrites many files - a clean tree makes it reviewable and revertable.
      if (await hasUncommittedChanges(path)) {
        this.warn('This project has uncommitted changes. Commit or stash them so `git diff` shows only the migration.')
        if (interactive && !(await confirm('Proceed on the dirty working tree anyway?', false))) {
          return this.log('Commit your changes and re-run `adapty migrate`.')
        }
      }

      if (interactive && !(await confirm(`Migrate "${project.name}" from ${providerLabel} to Adapty now?`))) {
        return this.log('No problem - run `adapty migrate` again anytime, or use --copy to drive your own agent.')
      }
    }

    // In code-only mode the placement's developer ID is settled here, by the
    // user, not later by the agent - a wrong guess fails silently at runtime.
    const placementDeveloperId = await resolvePlacementDeveloperId(this, setup, approach)
    if (placementDeveloperId === null) return this.log('Cancelled.')

    // Without the RC catalog the user's own store IDs are the only ground truth
    // available - except in code-only mode, where Adapty already has better ones.
    const products =
      rcCatalog || setup.dashboardMode === 'code-only' ? [] : await collectStoreProducts(project.platform)
    if (products === null) return this.log('Cancelled.')
    // The spine carries the mapping rules and the ADAPTY_SETUP.md contract the
    // prompt no longer inlines, so a failure here must stop the run, not warn.
    const mSpin = spinner()
    mSpin.start('Fetching the migration playbook')
    const migrationReference = await loadMigrationReference(sourceId).catch((error: unknown) => {
      mSpin.stop('Could not fetch the migration playbook')
      return this.error(error instanceof Error ? error.message : String(error))
    })
    mSpin.stop('Migration playbook ready')

    const promptCtx = await preparePromptContext(setup, approach, products, {migrationReference, placementDeveloperId})
    const action = buildMigrateAction(providerLabel, rcCatalog)

    if (copyOnly) {
      return emitCopyPrompt(this, action, promptCtx, {installSkill})
    }

    // Every run gets its own branch; no git at all is the one case that stops us.
    const branch = await prepareWorkBranch(this, project.path, 'migrate', interactive)
    if (branch === null) return this.log('Run `git init` and commit what you have, then re-run `adapty migrate`.')

    const result = await runActionWithFollowUp(this, {
      action,
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

