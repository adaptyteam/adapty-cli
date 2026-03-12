---
name: adapty-cli
description: Guide users from zero to fully integrated Adapty subscriptions via CLI. Covers auth, app creation, products, paywalls, placements, store setup, and SDK integration. Triggers on mentions of adapty, subscriptions, paywalls, placements, in-app purchases, mobile monetization, CLI commands, or Adapty Developer API.
---

# Adapty CLI Skill

Help users set up and manage in-app subscriptions with the Adapty CLI. This skill covers the full journey: authenticate, create Adapty entities, connect stores, integrate the SDK, and wire everything together in code.

## Quickstart Workflow

Follow this decision tree when a user wants to set up Adapty from scratch or manage existing resources.

### Step 0: Detect Platform

Explore the user's codebase to determine their platform:

| Platform     | Glob pattern to check                                      |
|-------------|-----------------------------------------------------------|
| iOS/Swift    | `**/*.swift`, `**/Package.swift`, `*.xcodeproj`           |
| Android/Kotlin | `**/*.kt`, `**/build.gradle.kts`                       |
| Flutter      | `**/pubspec.yaml` (look for `flutter:` key)               |
| React Native | `**/react-native.config.js`, `**/app.json` with RN deps  |
| Unity        | `**/ProjectSettings/ProjectSettings.asset`                |
| Capacitor    | `**/capacitor.config.ts`, `**/capacitor.config.json`      |
| KMP          | `**/build.gradle.kts` with `kotlin("multiplatform")`      |

### Step 1: Install CLI

```bash
# npm
npm install -g @nicklane/adapty-cli
# or run directly
npx @nicklane/adapty-cli auth login
```

### Step 2: Authenticate

```bash
adapty auth login
# Opens browser for OAuth device flow. Token saved to ~/.config/adapty/config.json
```

Verify: `adapty auth whoami`

### Step 3: Create App

```bash
# iOS only
adapty apps create --title "My App" --platform ios --apple-bundle-id com.example.app

# Android only
adapty apps create --title "My App" --platform android --google-bundle-id com.example.app

# Both platforms
adapty apps create --title "My App" \
  --platform ios --platform android \
  --apple-bundle-id com.example.app \
  --google-bundle-id com.example.app
```

**Save the output** — you get:
- `app.id` — use as `--app` in all subsequent commands
- `app.sdk_key` — use in SDK activation
- `default_access_level.id` — UUID for the "premium" access level
- `default_access_level.sdk_id` — string identifier used in SDK code

### Step 4: Connect Stores

Before creating products, the user must configure store credentials in the Adapty Dashboard.
Fetch setup guides: `https://adapty.io/docs/app-store-connection-configuration.md`, `https://adapty.io/docs/google-play-store-connection-configuration.md`

### Step 5: Create Products

Products must first exist in App Store Connect / Google Play Console before referencing them here.

```bash
# iOS subscription
adapty products create --app <APP_ID> \
  --title "Premium Monthly" \
  --period monthly \
  --access-level-id <ACCESS_LEVEL_ID> \
  --ios-product-id com.example.premium.monthly

# Android subscription (requires base plan ID)
adapty products create --app <APP_ID> \
  --title "Premium Monthly" \
  --period monthly \
  --access-level-id <ACCESS_LEVEL_ID> \
  --android-product-id com.example.premium.monthly \
  --android-base-plan-id monthly-base

# Lifetime (no base plan needed for Android)
adapty products create --app <APP_ID> \
  --title "Lifetime" \
  --period lifetime \
  --access-level-id <ACCESS_LEVEL_ID> \
  --ios-product-id com.example.lifetime
```

Valid periods: `weekly`, `monthly`, `2_months`, `3_months`, `6_months`, `yearly`, `lifetime`

### Step 6: Create Paywall

```bash
adapty paywalls create --app <APP_ID> \
  --title "Main Paywall" \
  --product-id <PRODUCT_UUID_1> \
  --product-id <PRODUCT_UUID_2>
```

### Step 7: Create Placement

```bash
adapty placements create --app <APP_ID> \
  --title "Onboarding" \
  --developer-id onboarding_screen \
  --paywall-id <PAYWALL_UUID>
```

**Important**: The `--developer-id` is the string you'll use in SDK code to fetch this paywall. Choose something descriptive and stable (e.g., `onboarding_screen`, `settings_premium`, `feature_gate`).

### Step 8: Integrate SDK

Use Context7 MCP (`adaptyteam/adapty-docs`) to get latest SDK install + usage code for the detected platform. Or fetch: `https://adapty.io/docs/installation-of-adapty-sdks.md`

### Step 9: Wire IDs into Code

After creating all entities, collect these values and wire them into the app:

| Value               | Where to get it                           | Where it goes in SDK                                |
|--------------------|------------------------------------------|---------------------------------------------------|
| SDK key             | `adapty apps get <APP_ID>` → `sdk_key`  | `Adapty.activate("<sdk_key>")`                     |
| Placement developer ID | From `--developer-id` you set in Step 7 | `Adapty.getPaywall("<developer_id>")`              |
| Access level sdk_id | `adapty access-levels get <AL_ID> --app <APP_ID>` → `sdk_id` | `profile.accessLevels["<sdk_id>"]?.isActive` |

---

## CLI Command Reference

All resource commands (except `apps`) require `--app <APP_ID>` (UUID).
All `list` commands support `--page` (default 1) and `--page-size` (default 20, max 100).
All commands support `--json` for machine-readable output.

### Auth

| Command               | Description                        |
|-----------------------|-----------------------------------|
| `auth login`          | OAuth device flow (opens browser) |
| `auth logout`         | Remove stored token               |
| `auth revoke`         | Revoke token server-side + logout |
| `auth whoami`         | Show authenticated user info      |
| `auth status`         | Show local auth state             |

### Apps

| Command                | Required flags                                          |
|-----------------------|-------------------------------------------------------|
| `apps list`            | (pagination only)                                      |
| `apps get <app_id>`    | —                                                      |
| `apps create`          | `--title`, `--platform` (repeatable: ios/android), `--apple-bundle-id` (if ios), `--google-bundle-id` (if android) |
| `apps update <app_id>` | At least one of: `--title`, `--apple-bundle-id`, `--google-bundle-id` |

### Products

| Command                      | Required flags                                    |
|-----------------------------|--------------------------------------------------|
| `products list`              | `--app`                                           |
| `products get <product_id>`  | `--app`                                           |
| `products create`            | `--app`, `--title`, `--period`, `--access-level-id`, at least one of `--ios-product-id` / `--android-product-id`. Android subscriptions also need `--android-base-plan-id` |
| `products update <product_id>` | `--app`, `--title`, `--access-level-id`         |

### Paywalls

| Command                      | Required flags                  |
|-----------------------------|---------------------------------|
| `paywalls list`              | `--app`                         |
| `paywalls get <paywall_id>`  | `--app`                         |
| `paywalls create`            | `--app`, `--title`, `--product-id` (repeatable) |
| `paywalls update <paywall_id>` | `--app`, `--title`, `--product-id` (repeatable) |

### Placements

| Command                           | Required flags                                    |
|----------------------------------|--------------------------------------------------|
| `placements list`                 | `--app`                                           |
| `placements get <placement_id>`   | `--app`                                           |
| `placements create`               | `--app`, `--title`, `--developer-id`, `--paywall-id` |
| `placements update <placement_id>` | `--app`, `--title`, `--developer-id`, `--paywall-id` |

### Access Levels

| Command                                    | Required flags           |
|-------------------------------------------|-------------------------|
| `access-levels list`                       | `--app`                  |
| `access-levels get <access_level_id>`      | `--app`                  |
| `access-levels create`                     | `--app`, `--sdk-id`, `--title` |
| `access-levels update <access_level_id>`   | `--app`, `--title`       |

---

## Adapty Concepts

- **Product** — a subscription or one-time purchase mapped to App Store / Play Store product IDs. Has a period and grants an access level.
- **Paywall** — a screen showing products to users. Contains an ordered list of products. Can use Paywall Builder (visual editor) or remote config (custom JSON).
- **Placement** — a location in the app where a paywall appears (e.g., onboarding, settings). Identified by `developer_id`. Links to one paywall per audience.
- **Access Level** — a permission gate (e.g., "premium"). Products grant access levels on purchase. Identified by `sdk_id` in code.
- **Audience** — a user segment. Different audiences at the same placement can see different paywalls.
- **A/B Test** — runs on a placement to compare paywall variants across audiences.

---

## Documentation Strategy

Two sources for Adapty documentation:

### Dashboard, Concepts, Analytics
Fetch from `https://adapty.io/docs/<slug>.md`. Full index at `https://adapty.io/docs/llms.txt` — fetch this to find the right slug for any topic.

### SDK Integration Code
Use Context7 MCP with the `adaptyteam/adapty-docs` library for latest SDK code examples:
```
resolve-library-id: "adaptyteam/adapty-docs"
query-docs: topic="<platform> <feature>"
```

---

## Deep-Dive Doc Links

Fetch these `.md` URLs when user needs more detail on a topic:

- **Store setup (Apple)**: `https://adapty.io/docs/app-store-connection-configuration.md`
- **Server notifications (Apple)**: `https://adapty.io/docs/enable-app-store-server-notifications.md`
- **In-App Purchase Key**: `https://adapty.io/docs/in-app-purchase-api-storekit-2.md`
- **Store setup (Google)**: `https://adapty.io/docs/google-play-store-connection-configuration.md`
- **RTDN (Google)**: `https://adapty.io/docs/enable-real-time-developer-notifications-rtdn.md`
- **SDK installation**: `https://adapty.io/docs/installation-of-adapty-sdks.md`
- **Observer vs full mode**: `https://adapty.io/docs/observer-vs-full-mode.md`
- **Paywall Builder**: `https://adapty.io/docs/adapty-paywall-builder.md`
- **Full index**: `https://adapty.io/docs/llms.txt`
