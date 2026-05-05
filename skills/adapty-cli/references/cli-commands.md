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

| Command                              | Required flags                  |
|-------------------------------------|---------------------------------|
| `paywalls list`                      | `--app`                         |
| `paywalls get <paywall_id>`          | `--app`                         |
| `paywalls create`                    | `--app`, `--title`, `--product-id` (repeatable) |
| `paywalls update <paywall_id>`       | `--app`, `--title`, `--product-id` (repeatable) |
| `paywalls placements <paywall_id>`   | `--app` — lists placements that currently use this paywall (slim summary; no `audiences`) |

## Placements

| Command                           | Required flags                                    |
|----------------------------------|--------------------------------------------------|
| `placements list`                 | `--app`                                           |
| `placements get <placement_id>`   | `--app`                                           |
| `placements create`               | `--app`, `--title`, `--developer-id`, exactly one of `--audiences` or `--paywall-id` (deprecated) |
| `placements update <placement_id>` | `--app`, `--title`, `--developer-id`, exactly one of `--audiences` or `--paywall-id` (deprecated) |

**`--audiences` JSON shape** — array of `{segment_ids: string[], paywall_id: string, priority: number}`:
- Default audience uses `segment_ids: []` and must have max priority (last evaluated). Exactly one default required.
- `segment_ids` capped at length 0 or 1 (UI/API convention; legacy multi-segment data is read-only).
- `priority` is 0-based, unique per placement.

Example:
```sh
adapty placements update <id> --app <APP> --title "Default" --developer-id default \
  --audiences '[{"segment_ids":["<SEG_VIP>"],"paywall_id":"<PW_VIP>","priority":0},{"segment_ids":[],"paywall_id":"<PW_DEFAULT>","priority":1}]'
```

**`--paywall-id` is deprecated.** CLI wraps it client-side into a single default audience and emits stderr warnings:
- Always: `--paywall-id is deprecated. Use --audiences instead.`
- On `update` only (additional): `--paywall-id will rewrite all audiences on this placement.` — full replace; segment-specific paywalls are dropped.

**`placements get` response shape** — returns `audiences[]` (no top-level `paywall_id` from the server). The CLI's human output additionally surfaces a derived `Paywall ID` line (the default-audience paywall) for convenience; `--json` returns the raw API shape unchanged.

**Workflow — swap a paywall across placements:**
1. `paywalls placements <PAYWALL_ID> --app <APP>` → list affected placements.
2. For each: `placements get <ID> --app <APP> --json` → read full `audiences[]`.
3. Mutate the matching entries client-side.
4. `placements update <ID> --app <APP> --title ... --developer-id ... --audiences '...'` → write back.

## Segments

| Command                           | Required flags |
|----------------------------------|----------------|
| `segments list`                   | `--app`        |
| `segments get <segment_id>`       | `--app`        |

Read-only. Response shape: `{segment_id, title, description}`. Filters are not exposed via this API.

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
- `--audiences` must be a valid JSON array; each entry's `segment_ids` array length 0 or 1
- On `placements create`/`update`: exactly one of `--audiences` or `--paywall-id` (passing both or neither errors)
