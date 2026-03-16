---
name: adapty-cli
description: Use when setting up or managing Adapty in-app subscriptions, paywalls, or placements via CLI.
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

Two modes: **Setup** (new users, quiz-driven) and **Manage** (existing users, direct commands).

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
3. For each product: `adapty products create --app <APP_ID> --title "..." --period ... --access-level-id <DEFAULT_AL_ID> --ios-product-id/--android-product-id ... [--android-base-plan-id ...]` → save product IDs. Android subscriptions (non-lifetime) require `--android-base-plan-id`.
4. `adapty paywalls create --app <APP_ID> --title "..." --product-id <ID1> --product-id <ID2> ...` → save paywall ID
5. For each placement: `adapty placements create --app <APP_ID> --title "..." --developer-id ... --paywall-id <PAYWALL_ID>`

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

## Adapty Concepts

- **Product** — subscription or one-time purchase mapped to store product IDs. Has a period, grants an access level.
- **Paywall** — screen showing products. Can use Paywall Builder (visual editor) or remote config (custom JSON).
- **Placement** — location in app where paywall appears. Identified by `developer_id`. Links to one paywall per audience.
- **Access Level** — permission gate (e.g. "premium"). Products grant access levels on purchase. Identified by `sdk_id`.
- **Audience** — user segment. Different audiences at same placement can see different paywalls.

---

## Documentation

- Full docs index: `https://adapty.io/docs/llms.txt`
- Individual pages: `https://adapty.io/docs/<slug>.md`
- SDK code examples: Context7 MCP with `adaptyteam/adapty-docs`
