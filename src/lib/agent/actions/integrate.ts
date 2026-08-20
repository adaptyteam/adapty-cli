import type {AgentAction, PromptContext} from '../prompt.js'

export const integrateAction: AgentAction = {
  id: 'integrate',
  task(ctx: PromptContext): string {
    const {appId, cliCommand, paywallApproach, platformReference, storeProducts} = ctx
    return `You are integrating the Adapty SDK into the user's app, end-to-end:

1. Dashboard setup via \`${cliCommand}\` (app already exists - see context):
   a. Get the access level ID: \`access-levels list --app ${appId || '<APP_ID>'} --json\` (default is usually "premium").
   b. ${
     storeProducts
       ? `Products: run \`products list\` first (skip ones that already exist), then create each product below with \`products create\` (Android subscriptions need --android-base-plan-id). If any of these products do not exist in the stores yet, add that store-side work to ADAPTY_SETUP.md: create them in App Store Connect / Google Play Console with these EXACT IDs (Google Play only allows creating products after an AAB with the billing permission has been uploaded).\n\n<store_products>\n${storeProducts}\n</store_products>\n`
       : 'Products: run `products list` first. Create products ONLY when you know their real store product IDs (from the code, a .storekit file, or store config found in the project) - store IDs are immutable after creation, so a guessed ID is unfixable junk. Real IDs unknown -> create no products; put the ready-to-run `products create` commands in ADAPTY_SETUP.md instead (Android subscriptions also need --android-base-plan-id, and Google Play product IDs can only exist after an AAB with billing permission is uploaded).'
   }
   c. ONLY if step (b) actually created products - without them a paywall/placement is an empty shell, so skip creation and put the whole command sequence in ADAPTY_SETUP.md right after the products create commands: ${
     paywallApproach === 'flow_builder'
       ? 'Flow Builder needs a FLOW placement, and this CLI can create neither the flow nor that placement - both are dashboard-only. Create NOTHING here, not even the placement: a placement carries a type (flow / paywall / onboarding) fixed at creation, this CLI only creates paywall placements, and a developer ID can never be changed or reused - so a placement created now would permanently burn the ID your code uses and force the user to rename it everywhere. Instead put the dashboard steps in ADAPTY_SETUP.md: create a FLOW placement at https://app.adapty.io/placements with the EXACT developer ID your code uses, build a flow at https://app.adapty.io/flows with the products above, and attach it to that placement. The same holds when you defer everything because the store IDs are unknown: the deferred sequence carries the `products create` commands only - no `paywalls create`, no `placements create` - and the flow placement stays a dashboard step.'
       : 'Create a paywall and a placement: `paywalls create --app <APP_ID> --title "Main Paywall" --json`, then `placements create --app <APP_ID> --title "Main" --developer-id "main" --audiences \'[{"segment_ids":[],"paywall_id":"<PAYWALL_ID>","priority":0}]\'`.'
   }
2. Decide where the paywall belongs in THIS app before you create the placement (or hand it off in ADAPTY_SETUP.md). Read the project and look for the natural spots: onboarding, entry points of premium features, a settings/upgrade screen, locked content. Pick the one that fits the app best, name the placement after it (\`--developer-id\` like "onboarding" or "premium_feature", not a generic "main"), and show the paywall from that spot in the code. In ADAPTY_SETUP.md, say which spot you chose and list the other candidates you found, so the user can move it without hunting.
3. Implement the SDK following the platform playbook below, stage by stage, fetching the listed docs pages before writing each stage's code.
4. If a build command exists for this project, build to verify it compiles. Fix what you broke; do not chase pre-existing failures.

--- PLATFORM PLAYBOOK (from the adapty-integration skill) ---

${platformReference}`
  },
  title: 'integration',
}
