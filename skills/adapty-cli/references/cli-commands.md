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
| `products create`            | `--app`, `--title`, `--period`, `--access-level-id`, at least one store binding (`--ios-product-id` / `--android-product-id` / `--stripe-product-id` / `--paddle-product-id`). Android subscriptions also need `--android-base-plan-id`. Stripe/Paddle each require the product+price pair together: `--stripe-product-id` + `--stripe-price-id`, `--paddle-product-id` + `--paddle-price-id` |
| `products update <product_id>` | `--app`, `--title`, `--access-level-id`         |

**Immutable on create:** `--period` and all store bindings (`--ios-product-id`, `--android-product-id`, `--android-base-plan-id`, `--stripe-product-id`, `--stripe-price-id`, `--paddle-product-id`, `--paddle-price-id`) cannot be changed after creation.

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

**`--paywall-id` is deprecated.** CLI sends it as `paywall_id` in the request body unchanged; server translates it into a single default audience. CLI emits stderr warnings:
- Always: `--paywall-id is deprecated. Use --audiences instead.`
- On `update` only (additional): `--paywall-id will rewrite all audiences on this placement.` — full replace; segment-specific paywalls are dropped (server-side).

**`placements get` response shape** — returns `audiences[]` (no top-level `paywall_id`). To get the default paywall, read the entry with `segment_ids: []`.

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

Read-only. Response shape: `{id, title, description}`. Filters are not exposed via this API.

## Access Levels

| Command                                    | Required flags           |
|-------------------------------------------|-------------------------|
| `access-levels list`                       | `--app`                  |
| `access-levels get <access_level_id>`      | `--app`                  |
| `access-levels create`                     | `--app`, `--sdk-id`, `--title` |
| `access-levels update <access_level_id>`   | `--app`, `--title`       |

## Preview

| Command                                    | Required flags |
|-------------------------------------------|----------------|
| `flows config preview <config_file>`       | none           |

Takes a **local** flow config JSON file, normalizes it, and builds a render URL that carries the whole config
in its gzipped fragment. **Treat it as a quick-look escape hatch for small configs:** past roughly **32KB of
pretty-printed JSON** the render page turns slow and unreliable, so trim to the screen you are working on
rather than throwing a whole 600KB flow at it. **No API call and no `--app`.** The CLI does not screenshot anything — it owns the
fragment format, capture is yours: open the URL with your browser/computer-use tool and screenshot the
`[data-screen-content]` element.

Accepts either a dashboard-api envelope (`{config, remote_configs, ...}`) or a bare builder config; both
normalize to `{flow, remoteConfigs}` (camelCase: that payload is a wire format shared with the render page).
`screens` must be an array — that is what the render page's own payload guard requires, so the CLI rejects
anything it would reject.

Render page location is **env-only**: `ADAPTY_APP_URL` (default `https://app.adapty.io`) sets the host; the
`/flow-preview` route is fixed and there is no flag for it. The same env var also moves `auth login`'s
verification link onto that host, so a local or staging dashboard stays consistent across both commands.

Flags: `--screen` (default: the render page falls back to the flow's first screen), `--device` (default:
`iphone-14`), `--orientation` (`portrait` | `landscape`, default `portrait`).

Output depends on where stdout goes, because the URL is far too long to read:

- **TTY** — opens the URL in the browser and prints a one-line confirmation, not the URL.
- **Piped or redirected** — prints the bare URL and nothing else.
- **`--json`** — `{render_url}`, and never opens a browser.

⚠️ **Never read this command's output.** Piped or `--json`, it emits one very long line — thousands of
characters even for a config the page renders well, ~113,000 for a 668KB flow — because the entire config is
gzipped into the fragment. Running it as a bare command and letting the output land in your transcript burns
context for zero information. Always hand it to the next process instead — and never `echo`, `cat` or
`--json | jq .render_url` it just to look.

`render_url` is `<host>/flow-preview?screen=<id>&device=<id>&orientation=<o>#config=<base64url(gzip(json))>`.
The fragment is gzipped unconditionally and carries **no prefix** — the page compresses too, so there is no
plain shape to mark it apart from. An unknown `device` renders an error message instead of a screen, so pass
one the builder knows.

**Keep the URL out of your context.** Pipe it straight into whatever captures the screenshot — stdin has no
size limit:

```sh
adapty flows config preview flow.json --screen scr_abc | node capture.mjs --out shot.png
```

If the tool insists on a flag, command substitution works too, capped by the shell's ~1MB argument limit (a
config around 6MB, since configs compress roughly 6x):

```sh
node capture.mjs --url "$(adapty flows config preview flow.json --screen scr_abc)" --out shot.png
```

There is no file-based hand-off flag: the config always rides in the URL.

## Apple Search Ads (`asa` topic)

Different service behind the same token. **No `--app`**: every command is scoped to the company the token
belongs to. Requires a connected Apple Ads account plus an active Ads Manager subscription — without one
every `asa` command answers `402 ads_manager_subscription_required`. Start with `asa whoami`.

| Command                              | Required flags / notes                                                     |
|-------------------------------------|----------------------------------------------------------------------------|
| `asa whoami`                         | company, how access was granted, Apple connection state                     |
| `asa connect`                        | prints the Apple authorization link and waits; `--no-wait` returns at once  |
| `asa apps list`                      | (pagination only)                                                           |
| `asa orgs list`                      | ASA organizations; their ID is the `--org` of `campaigns create`            |
| `asa campaigns list`                 | metadata only, no metrics; filters below                                    |
| `asa campaigns get <campaign_id>`    | positional UUID                                                             |
| `asa campaigns create`               | `--org`, `--name`, `--adam-id`, `--country` (repeatable), `--daily-budget`; optional `--target-cpa`, `--bidding-strategy` |
| `asa campaigns update <campaign_id>` | at least one of `--name`, `--status`, `--country`, `--daily-budget`, `--budget`, `--target-cpa`, `--bidding-strategy` |
| `asa ad-groups list` / `get <id>`    | metadata only, like campaigns; numbers come from `asa metrics`              |
| `asa ad-groups create`               | `--campaign`, `--name`, `--default-bid`; Apple also needs `--pricing-model` (default CPC) and `--start-time` (default today) |
| `asa ad-groups update <id>`          | at least one field; the campaign is resolved server-side, never passed      |
| `asa keywords list`                  | metadata only; **filter by `--ad-group`** — the heaviest read, own budget (30/min, 2 concurrent, 60s cap) |
| `asa keywords add`                   | `--ad-group` plus `--text` (repeatable) and/or `--from-file`; max 100 per call |
| `asa keywords update <id> [<id>...]` | one change applied to every id; `--text` only for a single keyword           |
| `asa negative-keywords list`         | `ad_group_id` is empty for campaign-level rows; `--campaign-level-only` keeps only those |
| `asa negative-keywords add`          | exactly one of `--ad-group` / `--campaign`; `--all-ad-groups` needs `--campaign` |
| `asa search-terms list`              | period flags; filter by `--ad-group` / `--campaign` to build the keyword pipeline |
| `asa ads list` / `get <id>`          | `serving_state_reasons` explains a non-running ad; list has no `--app` filter |
| `asa ads create`                     | `--ad-group`, `--creative-id`, `--name`; the creative id comes from `asa creatives list` |
| `asa ads update <ad_id>`             | `--name` and/or `--status`; creative and parent are fixed at creation        |
| `asa product-pages list`             | read-only; filter by `--app`                                                |
| `asa creatives list`                 | the Apple `creative_id` an ad is created against; filter by `--app`         |
| `asa product-pages sync`             | `--adam-id` optional; queued, 200 means already running or nothing to sync  |
| `asa automations list` / `get <id>`  | `status` is 1 for active, 0 for stopped                                     |
| `asa automations create`             | `--file rule.json` (or `-` for stdin); `--run-now` queues the first run      |
| `asa automations update <id>`        | `--stop` / `--start` / `--name` / `--file`; the file must not carry `internal_id` |
| `asa automations run <id>`           | queued, prints a run ID; `--dry-run` evaluates without touching Apple        |
| `asa automations runs <id>`          | past runs, including dry runs                                               |
| `asa metrics`                        | `--entity`, `--date-from`, `--date-to`; `--metric` repeatable, `--group-by`, `--order-by`, `--by-days` (max 16), `--order-by-day`; one server-sorted row per entity — top-N is one call |
| `asa metrics overview`               | same, plus `--period-unit` (day/week/month/quarter/year); account totals + per-period series in one call |
| `asa competitors summary`            | `--app-ids` (1–5 Apple App Store IDs, comma-separated); last full month, all countries, no period/country flags; slow on a cold cache |

Filters on list commands — they narrow the query, not the printed page, so always scope a read:

| Filter             | Lists that accept it                                                   |
|--------------------|------------------------------------------------------------------------|
| `--campaign-group` | every list below                                                        |
| `--app`            | campaigns, ad groups, keywords, negative keywords, search terms, product pages, creatives |
| `--campaign`       | ad groups, keywords, negative keywords, search terms, ads               |
| `--ad-group`       | keywords, negative keywords, search terms, ads                          |
| `--status`         | campaigns, ad groups (`ENABLED`/`PAUSED`), keywords (`ACTIVE`/`PAUSED`), ads |
| `--search`         | every list except product pages and creatives                           |
| `--campaign-level-only` | negative keywords: only campaign-level rows (`ad_group_id` is null)  |

Id filters are repeatable and take the UUIDs from the matching list command; an id owned by another company
matches nothing, so the page comes back empty rather than erroring.

Before running any of these:

- **Writes reach Apple directly** and take seconds. Each writing command prints the body it will send and asks
  for confirmation; `--yes` skips the question, and in a pipe or under `--json` the command refuses rather than
  hanging. There is no server-side preview, but every write sends an `Idempotency-Key` header — auto-generated
  per invocation, or pinned with `--idempotency-key <key>` on any mutating command. A repeat with the same key
  and body within 24 hours replays the stored result (the CLI prints "Already applied earlier") instead of
  creating a second entity; the same key with a different body fails with `422 cli_idempotency_key_reuse`, and
  a concurrent duplicate with `409 cli_idempotency_in_progress`. One network error is retried automatically
  with the same key.
- **Keyword and negative-keyword calls are batches.** One bad ID fails the whole batch before Apple is
  called; Apple may still reject individual items, and each rejection comes back with its reason.
- **Analytics budgets are tight and per company**: `metrics`/`metrics overview` get 5 calls/min (max 2 per
  10s) and share a 2-concurrent pool with the search-terms list (`429 cli_analytics_busy`); search terms and
  competitors get 30/min; keyword lists 30/min on their own 2-concurrent pool; catalog reads 120/min; writes
  20/min. Every 429 carries the exact wait in `Retry-After`; the CLI waits it out and retries once by itself
  (up to 60s, cool-downs excluded), so a surfaced 429 means the retry failed too. A burst of 429s (20 within 5 minutes) puts the
  token into a cool-down (`429 cli_cooldown_active`, escalating 5m → 30m → 3h); retrying during the pause does
  not extend it, but the cure is fixing the request, not hammering. Answer questions with the fewest calls —
  recipes in `asa-agent-playbook.md`.
- **`--page-size` goes up to 1000 on asa commands** — one big page always beats a pagination loop, and
  `meta.pagination.count` answers "how many" without reading the rows.
- **Money flags take a bare amount** (`--daily-budget 50`); `--currency` defaults to USD.
- Anything owned by another company reads as missing, so a 404 means "not yours, or not there".

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
