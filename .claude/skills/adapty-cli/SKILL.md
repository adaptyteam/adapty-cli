---
name: adapty-cli
description: Guide for working with the Adapty CLI — a command-line client for the Adapty Developer API. Use when building, debugging, or extending the CLI, when running CLI commands to manage Adapty resources (apps, products, paywalls, placements, access levels), or when the user asks about Adapty concepts. Triggers on mentions of "adapty", CLI commands, subscription management, paywalls, placements, or Adapty Developer API.
---

# Adapty CLI

CLI for Adapty Developer API. Built with oclif v4 + TypeScript (ESM).

## Quick Reference

```
adapty auth login              # OAuth device flow (opens browser)
adapty auth logout             # Remove stored token
adapty auth whoami             # Verify token, show user info
adapty auth status             # Show local auth state

adapty apps list               # List all apps (paginated)
adapty apps get <id>           # Show app details
adapty apps create             # Create app (--name, --platform, --*-bundle-id)
adapty apps update <id>        # Update app

adapty products list           # List products (--app required)
adapty products get <id>       # Show product details
adapty products create         # Create product (--name, --period, --access-level-id)
adapty products update <id>    # Update product

adapty paywalls list           # List paywalls (--app required)
adapty paywalls get <id>       # Show paywall details
adapty paywalls create         # Create paywall (--name, --product-id repeatable)
adapty paywalls update <id>    # Update paywall

adapty placements list         # List placements (--app required)
adapty placements get <id>     # Show placement details
adapty placements create       # Create placement (--name, --developer-id, --paywall-id)
adapty placements update <id>  # Update placement

adapty access-levels list      # List access levels (--app required)
adapty access-levels get <id>  # Get access level details
adapty access-levels create    # Create access level (--sdk-id, --title)
adapty access-levels update <id> # Update access level title
```

All resource commands (except apps) require `--app APP_ID` (UUID).
All list commands support `--page` and `--page-size`. All commands support `--json`.

## Typical Workflow

```bash
# 1. Authenticate
adapty auth login

# 2. Create app
adapty apps create --name "MyApp" --platform ios --ios-bundle-id com.example.app
# → returns app_id + default_access_level_id

# 3. Create product
adapty products create --app <APP_ID> --name "Premium Monthly" \
  --period monthly --access-level-id <AL_ID> --ios-product-id com.example.premium

# 4. Create paywall with products
adapty paywalls create --app <APP_ID> --name "Default Paywall" \
  --product-id <PRODUCT_ID_1> --product-id <PRODUCT_ID_2>

# 5. Create placement linking paywall
adapty placements create --app <APP_ID> --name "Onboarding" \
  --developer-id onboarding_screen --paywall-id <PAYWALL_ID>
```

## Architecture

```
src/
  commands/           # oclif command classes (one file per command)
    auth/             # login, logout, whoami, status
    apps/             # list, get, create, update
    products/         # list, get, create, update
    paywalls/         # list, get, create, update
    placements/       # list, get, create, update
    access-levels/    # list, get, create, update
  lib/
    api-client.ts     # fetch-based HTTP client, bearer auth
    config.ts         # ~/.config/adapty/config.json (mode 0o600)
    auth.ts           # token from config or ADAPTY_TOKEN env
    client-from-config.ts  # factory: config → ApiClient
    errors.ts         # ApiError, NetworkError, AuthRequiredError
    flags.ts          # --app (UUID), --page, --page-size
    output.ts         # printKeyValue(), printList()
```

Key patterns:
- Each command = single class extending `Command`
- `createAuthenticatedClient(config)` — factory for token-aware client
- `PaginatedResponse<T>` — standard list wrapper with meta.pagination
- Human output via `printKeyValue()`/`printList()`; JSON via `--json`
- Auth: device flow OAuth (POST /auth/device → poll /auth/token)
- API base: `https://api.adapty.io/api/v1/developer`
- Env overrides: `ADAPTY_TOKEN` (auth), `ADAPTY_API_URL` (base URL)

## Adapty Docs

Full docs index for LLM consumption: https://adapty.io/docs/llms.txt
Individual doc pages: `https://adapty.io/docs/<slug>.md`

Fetch the llms.txt URL when you need to find the right doc page for any Adapty topic. It contains all doc slugs organized by platform and feature area.

## Adapty Concepts

Key concepts:
- **Products** — subscription/purchase items linked to App Store/Play Store product IDs. Period: weekly, monthly, 2_months, 3_months, 6_months, yearly, lifetime.
- **Paywalls** — UI screens showing products to users. Contain ordered product lists. Can be built with Paywall Builder or remote config.
- **Placements** — locations in the app where paywalls appear (e.g., onboarding, settings). Identified by `developer_id`. Link to a paywall.
- **Access Levels** — permission gates controlling feature access (e.g., "premium"). Products grant access levels on purchase.
- **Audiences** — user segments that can see different paywalls at the same placement.
- **A/B Tests** — run on placements to compare paywall variants.

## Validation Rules

- `--app` must be a valid UUID
- `--product-id`, `--paywall-id`, `--access-level-id` must be valid UUIDs
- `--period`: weekly | monthly | 2_months | 3_months | 6_months | yearly | lifetime
- `--platform`: ios | android (repeatable for apps create)
- `--platform ios` requires `--ios-bundle-id`; `--platform android` requires `--android-bundle-id`
- Android non-lifetime products require `--android-base-plan-id` with `--android-product-id`
- `--page` min 1, `--page-size` max 100

## SDK Integration

When the user needs SDK-side guidance (showing paywalls, handling purchases, etc.), fetch the relevant doc from `https://adapty.io/docs/<slug>.md`. Use the llms.txt index above to find the right slug for the platform (iOS, Android, Flutter, React Native, Unity, Capacitor, KMP).
