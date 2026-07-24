import type {AgentAction, PromptContext} from '../prompt.js'

export const integrateAction: AgentAction = {
  id: 'integrate',
  task(ctx: PromptContext): string {
    const {appId, cliCommand, paywallApproach, platformReference} = ctx
    return `You are integrating the Adapty SDK into the user's app, end-to-end:

1. Dashboard setup via \`${cliCommand}\` (app already exists - see context):
   a. Get the access level ID: \`access-levels list --app ${appId || '<APP_ID>'} --json\` (default is usually "premium").
   b. Products: run \`products list\` first. Create products ONLY when you know their real store product IDs (from the code, a .storekit file, or store config found in the project) - store IDs are immutable after creation, so a guessed ID is unfixable junk. Real IDs unknown -> create no products; put the ready-to-run \`products create\` commands in ADAPTY_SETUP.md instead (Android subscriptions also need --android-base-plan-id, and Google Play product IDs can only exist after an AAB with billing permission is uploaded).
   c. ONLY if step (b) actually created products - without them a paywall/placement is an empty shell, so skip creation and put the whole command sequence in ADAPTY_SETUP.md right after the products create commands: ${
     paywallApproach === 'flow_builder'
       ? 'Flow Builder flows are dashboard-only and can NOT be created from the CLI. Create the placement(s) only (`placements create --app <APP_ID> --title "Main" --developer-id "main" --audiences \'[]\'`), and add to ADAPTY_SETUP.md: create a flow at https://app.adapty.io/flows and attach it to the placement(s).'
       : 'Create a paywall and a placement: `paywalls create --app <APP_ID> --title "Main Paywall" --json`, then `placements create --app <APP_ID> --title "Main" --developer-id "main" --audiences \'[{"segment_ids":[],"paywall_id":"<PAYWALL_ID>","priority":0}]\'`.'
   }
2. Implement the SDK following the platform playbook below, stage by stage, fetching the listed docs pages before writing each stage's code.
3. If a build command exists for this project, build to verify it compiles. Fix what you broke; do not chase pre-existing failures.

--- PLATFORM PLAYBOOK (from the adapty-sdk-integration skill) ---

${platformReference}`
  },
  title: 'integration',
}
