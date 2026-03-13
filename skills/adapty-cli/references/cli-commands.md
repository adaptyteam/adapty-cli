# CLI Command Reference

All resource commands (except `apps`) require `--app <APP_ID>` (UUID).
All `list` commands support `--page` (default 1) and `--page-size` (default 20, max 100).
All commands support `--json` for machine-readable output.

## Auth

| Command               | Description                        |
|-----------------------|-----------------------------------|
| `auth login`          | OAuth device flow (opens browser) |
| `auth logout`         | Remove stored token               |
| `auth revoke`         | Revoke token server-side + logout |
| `auth whoami`         | Show authenticated user info      |
| `auth status`         | Show local auth state             |

## Apps

| Command                | Required flags                                          |
|-----------------------|-------------------------------------------------------|
| `apps list`            | (pagination only)                                      |
| `apps get <app_id>`    | positional arg only (no `--app` flag)                  |
| `apps create`          | `--title`, `--platform` (repeatable: ios/android), `--apple-bundle-id` (if ios), `--google-bundle-id` (if android) |
| `apps update <app_id>` | At least one of: `--title`, `--apple-bundle-id`, `--google-bundle-id` |

## Products

| Command                      | Required flags                                    |
|-----------------------------|--------------------------------------------------|
| `products list`              | `--app`                                           |
| `products get <product_id>`  | `--app`                                           |
| `products create`            | `--app`, `--title`, `--period`, `--access-level-id`, at least one of `--ios-product-id` / `--android-product-id`. Android subscriptions also need `--android-base-plan-id` |
| `products update <product_id>` | `--app`, `--title`, `--access-level-id`         |

**Immutable on create:** `--period`, `--ios-product-id`, `--android-product-id`, `--android-base-plan-id` cannot be changed after creation.

## Paywalls

| Command                      | Required flags                  |
|-----------------------------|---------------------------------|
| `paywalls list`              | `--app`                         |
| `paywalls get <paywall_id>`  | `--app`                         |
| `paywalls create`            | `--app`, `--title`, `--product-id` (repeatable) |
| `paywalls update <paywall_id>` | `--app`, `--title`, `--product-id` (repeatable) |

## Placements

| Command                           | Required flags                                    |
|----------------------------------|--------------------------------------------------|
| `placements list`                 | `--app`                                           |
| `placements get <placement_id>`   | `--app`                                           |
| `placements create`               | `--app`, `--title`, `--developer-id`, `--paywall-id` |
| `placements update <placement_id>` | `--app`, `--title`, `--developer-id`, `--paywall-id` |

## Access Levels

| Command                                    | Required flags           |
|-------------------------------------------|-------------------------|
| `access-levels list`                       | `--app`                  |
| `access-levels get <access_level_id>`      | `--app`                  |
| `access-levels create`                     | `--app`, `--sdk-id`, `--title` |
| `access-levels update <access_level_id>`   | `--app`, `--title`       |

## Validation Rules

- `--app` must be a valid UUID
- `--product-id`, `--paywall-id`, `--access-level-id` must be valid UUIDs
- `--period`: weekly | monthly | two_months | trimonthly | semiannual | annual | lifetime
- `--platform`: ios | android (repeatable for apps create)
- `--platform ios` requires `--apple-bundle-id`; `--platform android` requires `--google-bundle-id`
- Android non-lifetime products require `--android-base-plan-id` with `--android-product-id`
- `--page` min 1, `--page-size` max 100
