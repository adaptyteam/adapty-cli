---
name: adapty-cli
description: Use when setting up or managing Adapty in-app subscriptions, paywalls, placements, or Apple Search Ads campaigns via CLI.
---

# Adapty CLI Skill

## Installation

```sh
npm install -g adapty
```

Or run without installing:

```sh
npx adapty@latest
```

---

Three modes: **Setup** (new users, quiz-driven), **Manage** (existing users, direct commands) and **Apple Search Ads** (`adapty asa`, ad spend).

## Mode: Setup (New to Adapty)

The setup flow has 3 phases: **Quiz → Create → Guide**. Collect ALL information first, then create everything, then tell the user what to do next.

### Phase 1: Quiz

Before creating anything, detect the platform and then run an interactive quiz to collect all data.

**CRITICAL: You MUST use the AskUserQuestion tool for EVERY quiz question.** Do NOT print questions as regular text output. Each question must be a separate AskUserQuestion tool call so the user gets an interactive input prompt. After each answer, proceed to the next AskUserQuestion. This is non-negotiable.

**Step 1: Detect platform** — silently glob the codebase:

| Platform       | Glob pattern                                            |
| -------------- | ------------------------------------------------------- |
| iOS/Swift      | `**/*.swift`, `**/Package.swift`, `*.xcodeproj`         |
| Android/Kotlin | `**/*.kt`, `**/build.gradle.kts`                        |
| Flutter        | `**/pubspec.yaml` (look for `flutter:` key)             |
| React Native   | `**/react-native.config.js`, `**/app.json` with RN deps |
| Unity          | `**/ProjectSettings/ProjectSettings.asset`              |
| Capacitor      | `**/capacitor.config.ts`, `**/capacitor.config.json`    |
| KMP            | `**/build.gradle.kts` with `kotlin("multiplatform")`    |

**Step 2: Ask questions** — use AskUserQuestion tool calls. Bundle related sub-questions into a single AskUserQuestion to minimize round-trips (e.g. app name + platforms + bundle ID = one question). Suggest defaults so the user can just confirm or pick a number. Aim for 2-3 total AskUserQuestion calls, not one per field.

Bundle into 2-3 AskUserQuestion calls:

**AskUserQuestion 1: App + Products** — bundle app info and product selection:
> App name: [suggest from package.json, Info.plist, or AndroidManifest]
> Bundle ID: [suggest from detected config files]
> Platforms: 1. iOS only / 2. Android only / 3. Both
>
> Products: 1. Monthly (`monthly`) / 2. Annual (`annual`) / 3. Monthly + Annual / 4. Weekly (`weekly`) / 5. Lifetime (`lifetime`) / 6. Custom
>
> Valid `--period` values: `weekly`, `monthly`, `two_months`, `trimonthly`, `semiannual`, `annual`, `lifetime`. Do NOT use `month`, `year`, `yearly`, or any other aliases — use these exact API values.
> Product name prefix: [suggest based on app name, e.g. "Premium"]

After this answer, you have enough to generate store product IDs. Pre-fill them using the convention `<bundle_id>.<prefix>.<period>` and include in the next question.

**AskUserQuestion 2: Store IDs + Placements + Paywall approach** — confirm generated IDs and collect remaining info:
> **Store product IDs** — these MUST match the IDs you create (or will create) in App Store Connect / Google Play Console.
> Confirm or edit the suggested IDs:
> - iOS: `com.example.app.premium.monthly` / `com.example.app.premium.annual`
> - Android product ID: `premium_monthly` / base plan: `monthly-base` (if Android)
>
> If your iOS and Android IDs differ, enter them separately (e.g. "iOS: com.app.monthly, Android: monthly_sub / base plan: monthly-bp").
> If you haven't created store products yet, these suggestions work — just use the same IDs when you set them up in App Store Connect / Google Play Console later.
>
> Placements: 1. Onboarding (`onboarding`) / 2. Settings (`settings`) / 3. Feature gate (`feature_gate`) / 4. All of the above / 5. Custom
>
> Paywall UI: 1. Paywall Builder (visual editor, no UI code) / 2. Custom (your own UI)

### Phase 2: Create

After collecting all answers, confirm the plan with the user in a summary table, then create everything sequentially. Do NOT ask questions during creation — use collected data.

**IMPORTANT: Products and paywalls cannot be fully edited after creation** (period, store product IDs, base plan IDs are permanent). This is why Phase 1 confirmation is critical.

Execution order (each step uses output from previous):
1. `adapty auth login` (if not already authenticated, check with `adapty auth whoami`)
2. `adapty apps create --title "..." --platform ... --apple-bundle-id/--google-bundle-id ...` → save output: `id` (use as `--app`), `sdk_key` (use in SDK), plus the default access level `id` and `sdk_id` printed after creation
3. For each product: `adapty products create --app <APP_ID> --title "..." --period ... --access-level-id <DEFAULT_AL_ID> --ios-product-id/--android-product-id ... [--android-base-plan-id ...]` → save product IDs. Android subscriptions (non-lifetime) require `--android-base-plan-id`. Web products bind Stripe/Paddle instead: `--stripe-product-id`+`--stripe-price-id` or `--paddle-product-id`+`--paddle-price-id` (each pair required together).
4. `adapty paywalls create --app <APP_ID> --title "..." --product-id <ID1> --product-id <ID2> ...` → save paywall ID
5. For each placement: `adapty placements create --app <APP_ID> --title "..." --developer-id ... --audiences '[{"segment_ids":[],"paywall_id":"<PAYWALL_ID>","priority":0}]'`
   - `--paywall-id <PAYWALL_ID>` is still accepted as legacy shorthand but emits a stderr deprecation warning. Prefer `--audiences` for the canonical default-audience shape.

Print progress as you go (e.g. "Created app ✓", "Created product 'Monthly' ✓").
If a step fails, stop and ask the user how to proceed — don't retry blindly.

### Phase 3: Guide (Interactive Loop)

After all entities are created, print a brief summary with key values:

```
Dashboard:              https://app.adapty.io
Your SDK key:           <sdk_key from apps create>
Placement developer IDs: <list of developer_ids>
Access level SDK ID:    <sdk_id from access level, e.g. "premium">
```

Then use AskUserQuestion to ask what they want to do next. **Repeat this after each sub-guide until the user says they're done.** Build the options dynamically based on their setup answers:

> What do you want to do next?
> 1. Integrate SDK into the codebase
> 2. Configure app/products on Apple side *(only if iOS)*
> 3. Configure app/products on Google side *(only if Android)*
> 4. Design paywall in Paywall Builder *(only if they chose Paywall Builder)*
> 5. I'm done for now

**Option 1: SDK Integration** — print the quickstart link for their platform + paywall approach, plus the key values above. Use Context7 MCP for latest SDK code examples:
```
resolve-library-id: "adaptyteam/adapty-docs"
query-docs: topic="<platform> <feature>"
```

Paywall Builder quickstarts:
- iOS: `https://adapty.io/docs/ios-quickstart-paywalls.md`
- Android: `https://adapty.io/docs/android-quickstart-paywalls.md`
- Flutter: `https://adapty.io/docs/flutter-quickstart-paywalls.md`
- React Native: `https://adapty.io/docs/react-native-quickstart-paywalls.md`

Custom paywall quickstarts:
- iOS: `https://adapty.io/docs/ios-quickstart-manual.md`
- Android: `https://adapty.io/docs/android-quickstart-manual.md`
- Flutter: `https://adapty.io/docs/flutter-quickstart-manual.md`
- React Native: `https://adapty.io/docs/react-native-quickstart-manual.md`

**Option 2: Apple side** — print checklist:
- Create subscription products in App Store Connect with IDs: `<list ios_product_ids>`
- Adapty Dashboard → App Store Connect: upload In-App Purchase Key (.p8), enter Key ID, Issuer ID, Bundle ID, App Apple ID → `https://adapty.io/docs/app-store-connection-configuration.md`
- App Store Connect → Server Notifications V2: set URL from Adapty Dashboard → `https://adapty.io/docs/enable-app-store-server-notifications.md`

**Option 3: Google side** — print checklist:
- Create subscription products in Google Play Console with IDs: `<list android_product_ids>`, base plans: `<list base_plan_ids>`
- Adapty Dashboard → Google Play: upload service account JSON key, enter Package Name → `https://adapty.io/docs/google-play-store-connection-configuration.md`
- Google Play Console → RTDN: configure Pub/Sub topic from Adapty Dashboard → `https://adapty.io/docs/enable-real-time-developer-notifications-rtdn.md`

**Option 4: Paywall Builder** — link to dashboard paywalls section and guide: `https://adapty.io/docs/adapty-paywall-builder.md`

After showing any option's guide, **loop back** — ask "What's next?" again with the same AskUserQuestion (minus completed items if user indicates they're done with a step). Stop only when user picks "I'm done."

---

## Mode: Manage (Existing Adapty Users)

For users who already have an Adapty app and want to manage entities, see `references/cli-commands.md` for the full command reference.

Key notes:
- All resource commands (except `apps`) require `--app <APP_ID>` (UUID)
- `apps get <app_id>` and `apps update <app_id>` use a positional arg (no `--app` flag)
- All other `get`/`update` commands use a positional arg for the resource ID **plus** `--app` flag
- All `list` commands support `--page` and `--page-size`
- All commands support `--json`
- Use `--title` (not `--name`) for all entities
- Use `--apple-bundle-id` / `--google-bundle-id` (not ios/android)

---

## Mode: Apple Search Ads (`adapty asa`)

Ad spend, not subscriptions. The `asa` topic manages Apple Search Ads campaigns, keywords, ads and
automations, and reads their performance. Full reference in `references/cli-commands.md`.

**Before answering any performance question, read `references/asa-agent-playbook.md`** — it maps the
common questions (spend, trends, top-N, geo, wasted keywords, LTV, search terms, competitors) to the
single command that answers each, lists every valid metric name, and gives the request budgets. The
short version:

- One question → one call. Totals and trends = `asa metrics overview`; per-entity ranking =
  `asa metrics --order-by ... --page-size N`. The server aggregates and sorts — never loop pages to
  sum things yourself; a page holds up to 1000 rows if you really need them all.
- Metrics budget is 5 calls/min (max 2 per 10s, 2 concurrent). Plan inside it; the CLI absorbs one
  429 by itself (waits `Retry-After`, retries once), so a surfaced 429 means back off for real.
  Don't add comparisons the user didn't ask for.
- Metric names are fixed and listed in the playbook; a wrong name fails with the full valid list, so
  never spend calls probing.
- Date window caps: 90 days at day grain, 180 by week, 365 by month — widen by coarsening
  `--group-by`/`--period-unit`, not by splitting into several calls.

**These commands spend money and change a live ad account.** Treat every write as irreversible:

- **Confirm before any write.** State plainly what will change — which campaign, which budget, how many
  keywords — and get an explicit yes. The command asks too: it prints the request body it is about to send and
  waits. Pass `--yes` only after the user has agreed; there is no undo and no delete.
- **Never invent IDs or budgets.** Read them first (`asa orgs list`, `asa campaigns list`) or ask.
- **Re-runs are safe when the key is pinned.** Every write sends an auto-generated `Idempotency-Key`, and one
  network error is retried with the same key, so a call is never applied twice by accident. In scripts pass
  `--idempotency-key` so the whole pipeline can be re-run: a repeat replays the stored result (the CLI prints
  "Already applied earlier") instead of applying again.
- **Prefer the smallest step.** Add a handful of keywords, check the result, then continue. A 100-item batch
  that Apple partially rejects is harder to reason about than three small ones.
- **A dry run is available for automations only**: `asa automations run <id> --dry-run` evaluates a rule and
  logs what it would do without touching Apple. Use it before enabling a rule that changes bids.
- **Metrics are cheap, writes are not.** Reads and `--dry-run` are safe to run freely; anything else is not.

Key notes that differ from the rest of the CLI:

- No required `--app`: scope comes from the token's company. `--app` exists on lists only, as a filter
- **Filter every list you can.** `--campaign-group`, `--app`, `--campaign`, `--ad-group`, `--status`, `--search`
  narrow the query itself, so a scoped read is cheap and an unscoped one pages the whole account. `asa keywords
  list` without `--ad-group` is still the widest read in the surface
- `asa whoami` first — it reports whether Apple Ads is connected and whether the company may use the CLI
- A 402 means the company has no Ads Manager subscription; a 404 means the entity is not theirs or absent
- A 429 carries the wait in `Retry-After`. Metrics and the search-terms list share one
  analytics pool (2 concurrent queries per company, `cli_analytics_busy`); a burst of 429s triggers an
  escalating token cool-down (`cli_cooldown_active`, 5m → 30m → 3h) — fix the request, don't hammer
- Keywords are always batches, capped at 100 per call, and a partial rejection is reported per item

---

## Adapty Concepts

- **Product** — subscription or one-time purchase mapped to store product IDs. Has a period, grants an access level.
- **Paywall** — screen showing products. Can use Paywall Builder (visual editor) or remote config (custom JSON).
- **Placement** — location in app where paywall appears. Identified by `developer_id`. Holds one or more audiences; each audience routes a segment to a paywall by priority. Default audience (`segment_ids: []`) is the fallback and must have max priority.
- **Access Level** — permission gate (e.g. "premium"). Products grant access levels on purchase. Identified by `sdk_id`.
- **Segment** — filter rule (e.g. "VIP users"). Read-only via CLI: `adapty segments list --app <APP_ID>`. Compose into placement audiences to give different segments different paywalls at the same placement.
- **Audience** — `(segments, paywall, priority)` tuple inside a placement. Auto-materialized from segment composition. CLI exposes audiences as the `--audiences` JSON shape on `placements create`/`update`.

---

## Documentation

- Full docs index: `https://adapty.io/docs/llms.txt`
- Individual pages: `https://adapty.io/docs/<slug>.md`
- SDK code examples: Context7 MCP with `adaptyteam/adapty-docs`
