import type {AgentAction, PromptContext} from '../prompt.js'

/**
 * Migration reuses the integration playbook (same skill) - what differs is
 * the mission: map every call site of the current billing system to its
 * Adapty equivalent instead of integrating from scratch. `label` names what
 * is being replaced ("RevenueCat", "the in_app_purchase plugin", ...);
 * `rcCatalog` is a rendered snapshot of the RevenueCat project (from
 * --rc-key) that upgrades placeholder guessing into exact recreation.
 *
 * The mapping rules are NOT inlined here. They live in the skill's
 * references/migration.md (plus references/migration-<source>.md where one
 * exists) and arrive as ctx.migrationReference, so this prompt and the skill
 * cannot drift apart. Only knowledge this CLI has and the skill cannot -
 * which source the user picked, whether a catalog was actually fetched -
 * stays here.
 */
export function buildMigrateAction(label: string, rcCatalog?: string): AgentAction {
  return {
    id: 'migrate',
    task(ctx: PromptContext): string {
      const {appId, cliCommand, migrationReference, platformReference} = ctx
      const codeOnly = ctx.dashboardMode === 'code-only'
      return `You are migrating the user's app from ${label} to Adapty - Adapty fully replaces ${label}.

1. Map the existing setup. Find every call site of ${label}: SDK init, user identification, paywall/product fetching, purchase & restore, entitlement/subscription checks, event listeners.${
        rcCatalog
          ? ' The full RevenueCat catalog is provided below - treat it as ground truth; use the code only to learn which entities the app actually calls.'
          : ' Extract the REAL store product IDs and entitlement names from the code and config - use them below instead of placeholders wherever they exist.'
      }

2. ${
        codeOnly
          ? `The user has ALREADY set up this app's dashboard - map ${label}'s concepts onto the entities that exist (list them via \`${cliCommand}\` with --app ${appId || '<APP_ID>'}). Create nothing; the playbook's mapping rules below tell you how a ${label} concept matches an existing Adapty entity.`
          : `Dashboard setup via \`${cliCommand}\` (app already exists - see context; scope every command with --app ${appId || '<APP_ID>'}).`
      }
${
  !rcCatalog && ctx.storeProducts
    ? `\nThe user also typed in their store product IDs below. Identifiers you find in the code are trustworthy as-is - do not second-guess or replace them. Treat the user's list as a COMPLEMENT: create every product from it that the code does not already cover, and when the same product appears in both with a different identifier, keep the code's identifier and flag the mismatch in ADAPTY_SETUP.md for the user to double-check.\n\n<store_products>\n${ctx.storeProducts}\n</store_products>\n`
    : ''
}
The MIGRATION PLAYBOOK below governs which entities to create, which to skip, and what the ADAPTY_SETUP.md handoff must contain. Follow it - do not improvise a mapping. Its rules on never creating an entity that does not map cleanly, and on never writing a guessed store identifier, are the ones that cause unfixable damage when ignored.${
        rcCatalog ? `\n\n<revenuecat_catalog note="fetched live from the RevenueCat API">\n${rcCatalog}\n</revenuecat_catalog>` : ''
      }

3. Replace the code, call site by call site, using the platform playbook below for every Adapty API (init/activate, identify, getPaywall/getFlow, makePurchase, restorePurchases, access level checks). Then remove ${label} from the dependencies and delete all now-dead code that used it.

4. If a build command exists for this project, build to verify it compiles. Fix what you broke; do not chase pre-existing failures.
${
        rcCatalog
          ? ''
          : `\nYou worked WITHOUT access to the ${label} account, so the code was your only source and the account almost certainly holds entities you could not see. The migration playbook's "verify against your source's dashboard" checklist is mandatory for this run.${
              label === 'RevenueCat' && !codeOnly
                ? ' Mention that re-running `adapty migrate --rc-key <v2 secret key>` automates that comparison.'
                : ''
            }\n`
      }
--- MIGRATION PLAYBOOK (from the adapty-integration skill) ---

${migrationReference || '(not available - state this in ADAPTY_SETUP.md and map conservatively: create nothing you cannot verify.)'}

--- PLATFORM PLAYBOOK (from the adapty-integration skill) ---

${platformReference}`
    },
    title: 'migration',
  }
}
