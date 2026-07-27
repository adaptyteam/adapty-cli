import type {AgentAction, PromptContext} from '../prompt.js'

/**
 * Migration reuses the integration playbook (same skill) - what differs is
 * the mission: map every call site of the current billing system to its
 * Adapty equivalent instead of integrating from scratch. `label` names what
 * is being replaced ("RevenueCat", "the in_app_purchase plugin", ...);
 * `rcCatalog` is a rendered snapshot of the RevenueCat project (from
 * --rc-key) that upgrades placeholder guessing into exact recreation.
 *
 * The mapping rules mirror the dashboard's RC import wizard: entities that
 * do not map cleanly are NOT created - junk in the user's account is worse
 * than a skipped entity. Everything skipped lands in ADAPTY_SETUP.md.
 */
export function buildMigrateAction(label: string, rcCatalog?: string): AgentAction {
  return {
    id: 'migrate',
    task(ctx: PromptContext): string {
      const {appId, cliCommand, platformReference} = ctx
      return `You are migrating the user's app from ${label} to Adapty - Adapty fully replaces ${label}.

1. Map the existing setup. Find every call site of ${label}: SDK init, user identification, paywall/product fetching, purchase & restore, entitlement/subscription checks, event listeners.${
        rcCatalog
          ? ' The full RevenueCat catalog is provided below - treat it as ground truth; use the code only to learn which entities the app actually calls.'
          : ' Extract the REAL store product IDs and entitlement names from the code and config - use them below instead of placeholders wherever they exist.'
      }

2. Dashboard setup via \`${cliCommand}\` (app already exists - see context; scope every command with --app ${appId || '<APP_ID>'}).
${
  !rcCatalog && ctx.storeProducts
    ? `\nThe user also typed in their store product IDs below. Identifiers you find in the code are trustworthy as-is - do not second-guess or replace them. Treat the user's list as a COMPLEMENT: create every product from it that the code does not already cover, and when the same product appears in both with a different identifier, keep the code's identifier and flag the mismatch in ADAPTY_SETUP.md for the user to double-check.\n\n<store_products>\n${ctx.storeProducts}\n</store_products>\n`
    : ''
}

<mapping_rules>
The prime rule: an entity that does not map cleanly must NOT be created. Creating junk in the user's Adapty account is worse than skipping - when in doubt, create nothing and describe exactly what to do (and why you skipped it) in ADAPTY_SETUP.md.

- Access levels: one per active entitlement, ID = the entitlement's lookup_key. Skip archived entitlements. No entitlements at all -> use the default "premium" access level and say so in ADAPTY_SETUP.md.
- Products: use EXACT store identifiers (never invent or "normalize" them) - store IDs are IMMUTABLE once an Adapty product is created, so a wrong ID can only be fixed by deleting and recreating the product. No real ID available -> create no product; put the ready-to-run \`products create\` command in ADAPTY_SETUP.md with a <REAL_PRODUCT_ID> slot instead. A product's access level = its entitlement's lookup_key. Product attached to several entitlements -> assign the one the code actually gates on and flag the choice in ADAPTY_SETUP.md; attached to none -> the default access level, flagged. Same store identifier on both stores -> ONE Adapty product with both store IDs, not two.
- Placements: ID = the offering's lookup_key, so \`getOffering("x")\` call sites map mechanically to placement "x". Create a placement + paywall (paywall products in package order) only for offerings the app actually uses: the current offering plus any offering referenced in code by lookup_key. Offerings never referenced and not current -> list them in ADAPTY_SETUP.md instead of creating them.
- Offering backed by a PUBLISHED RC Paywall Builder paywall: create NOTHING for it. Paywall and flow placements share one ID namespace in Adapty, and the user should rebuild builder paywalls as flows - a placement created now would permanently block the flow placement with that ID. Add a "Rebuild as flows" section to ADAPTY_SETUP.md listing each reserved placement ID with its product list and metadata.
- Offering metadata maps to paywall remote config, which this CLI cannot set - put the metadata JSON in ADAPTY_SETUP.md next to its paywall.
- NEVER create or imitate: webhooks (Adapty's payload format differs - checklist item), audiences/targeting/experiments (not exportable from RC - checklist item), store credentials (write-only in RC, cannot be exported - the user re-enters them in Adapty).
</mapping_rules>
${rcCatalog ? `\n<revenuecat_catalog note="fetched live from the RevenueCat API">\n${rcCatalog}\n</revenuecat_catalog>\n` : ''}
3. Replace the code, call site by call site, using the platform playbook below for every Adapty API (init/activate, identify, getPaywall/getFlow, makePurchase, restorePurchases, access level checks). Then remove ${label} from the dependencies and delete all now-dead code that used it.

4. If a build command exists for this project, build to verify it compiles. Fix what you broke; do not chase pre-existing failures.

Besides the standard sections, ADAPTY_SETUP.md must have a **Migration** section covering: the entitlement -> access level mapping; every entity you skipped and why, with exact steps to finish it by hand (reserved flow placements, offering metadata -> remote config, webhooks, audiences/experiments); re-entering store credentials in Adapty (cannot be exported from ${label}); switching App Store Server Notifications and Google Real-time Developer Notifications to Adapty; and historical data import - wait about a week after the Adapty release before importing (the SDK collects price data meanwhile), Google purchase tokens require a CSV requested from RC support.${
        rcCatalog
          ? ''
          : `\n\nYou worked WITHOUT access to the ${label} account, so the code was your only source - the account almost certainly holds entities you could not see. Open the Migration section with a **"Verify against your ${label} dashboard"** subsection listing, as concrete checkboxes, everything the user must compare by hand: the products you did NOT create because their store IDs were not in the code (include the ready-to-run commands); entitlements beyond the ones referenced in code; offerings/paywalls that exist only in the dashboard (each unmigrated offering needs a decision: recreate as placement + paywall, or rebuild as a flow if it used a visual paywall builder); and any offering metadata that should become paywall remote config. If the source is RevenueCat, mention that re-running \`adapty migrate --rc-key <v2 secret key>\` automates this comparison.`
      }

--- PLATFORM PLAYBOOK (from the adapty-sdk-integration skill) ---

${platformReference}`
    },
    title: 'migration',
  }
}
