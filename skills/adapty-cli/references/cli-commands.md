# CLI Command Reference

Product, paywall, placement, access-level and segment commands require `--app <APP_ID>` (UUID).
Lists of these entities and apps support `--page` (default 1) and `--page-size` (default 20, max 100).
Migrations use their own IDs and have no list pagination; ASA scope and pagination are described below.
All commands support `--json` for machine-readable output.

## Auth

| Command               | Description                        |
|-----------------------|-----------------------------------|
| `auth login`          | OAuth device flow (opens browser) |
| `auth logout`         | Remove stored credentials and migration selection locally |
| `auth revoke`         | Revoke effective token, then remove matching credentials and selection |
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

## Migrations

Manage migrations into Adapty: catalog, transactions and store events. The server provides the
available flows, steps, actions and input schemas. Choose values from the current response.

| Command | Flags |
|---------|-------|
| `migrations create` | `--name <app name>` (main flow), or `--flow <flow> --app <app_id>`; `--no-select` |
| `migrations list` | — |
| `migrations use <id>` | Verify access and save the selection for the current token |
| `migrations current` | Show the effective local selection and source; no network |
| `migrations unuse` | Clear saved selection without authentication; no network |
| `migrations status` | `-m`, `--wait`, `--timeout <duration>` (needs `--wait`, default 120s, range 1–600s) |
| `migrations steps` | `-m` |
| `migrations show [<resource>]` | `-m`; no argument lists what can be read |
| `migrations run <action_id>` | `-m`, `--input <json>` \| `--input-file <path\|->`, `--yes`, `--open` \| `--no-browser` |
| `migrations close` | `--outcome finish\|cancel`, `--yes` (required), `-m` |

**Scope and creation.** `create --name` starts a catalog migration into a new app. For an existing
app, choose a flow and its app from `list.available`, then pass `--flow` and `--app` together.
These modes are mutually exclusive. Creation starts the flow, returns its ID in `migration.id`
and saves it as current unless `--no-select` is supplied. A local save failure warns on stderr
but preserves the successful creation response; do not retry creation to repair local state.
For `status`, `steps`, `show`, `run` and `close`, pass `-m <id>` explicitly. The CLI also accepts
`ADAPTY_MIGRATION` or saved context, with priority `-m` > non-empty environment > saved selection.

**Saved selection.** `use` verifies access before saving the returned ID. `current --json` returns
`{ "currentMigrationId": "...", "source": "env" }` or source `"context"`; both fields are null
when no selection applies. `unuse` clears saved state even if malformed, but cannot unset
`ADAPTY_MIGRATION` in the parent shell. Selection is shared across terminals, but each operation
captures its target once, including polling and GET/POST pairs. `run` and `close` identify a saved
target on stderr before mutation. Use explicit IDs and `create --no-select` in scripts to avoid
changing or depending on the shared default.

`auth logout` removes saved context even without credentials. `auth revoke` removes it only after
successful server revocation and only for the revoked token; other tokens' context is preserved.
Failed revocation preserves local state. Incomplete local cleanup returns exit 1 with
`auth_cleanup_failed`; if the error says the token was revoked, repair local state without repeating
the revoke request. Shell environment overrides must be unset separately.

**Inspect before acting.** Use `status --json` to read `next_actions` and `available_actions`.
Select an action relevant to the task; optional actions are not a queue to execute. `steps` is a
checklist, not a source of action IDs. `show` without a resource lists readable names; read the
resources named in the chosen action's `reads` before preparing input.

**Input actions.** The input must be a JSON object matching the current `input_schema`. Use one
of `--input`, `--input-file PATH`, or `--input-file -` for stdin. Omitting input sends `{}`.
Review the full `confirm` text before adding `--yes`. Without it, an input action requiring
confirmation exits **6** with that text. There is no interactive prompt; the CLI reads status
but does not send the action request. After an action, inspect the returned state and actions again.

**External actions.** Complete the browser step, then read status again. The CLI reads status
and prints the action details and link without sending an action request. The browser opens by
default in an interactive terminal; pipes and `--json` require `--open`. `--no-browser` suppresses
opening, `BROWSER=none` disables it, and only HTTPS links are supported. External actions reject
`--input` and `--input-file` with exit 2 (`action_input_unsupported`); stdin is rejected before
being read. Upload actions are marked unsupported in `status`; use the dashboard or an offered Cloud Export action.

**Waiting.** `status --wait` returns when the revision changes, the state is no longer `running`,
or the polling budget cannot accommodate another pause. `--timeout` accepts integer seconds or
minutes (`300`, `300s`, `5m`); it does not interrupt in-flight requests or retries. Progress goes
to stderr; Ctrl+C exits **130**. Exit **0** means a successful request, including when the returned
state is `running` or `failed`. Branch on `migration.state`:

- `running`: wait again within the task's overall time budget.
- `action_required`: inspect and choose an offered action.
- `completed` or `canceled`: stop.
- `failed`: inspect issues and offered recovery actions.
- Unknown state: the CLI prints an upgrade hint and returns successfully; `--wait` stops polling.
  Inspect the response and update the CLI before continuing.

**Unknown action kinds.** With no `href`, `run` prints the action details and an upgrade hint,
returns exit **0**, and sends no action request, even with `--yes`. It does not read stdin.
With an `href`, the CLI hands over the link using the external-action rules above.
Under `--json`, it returns the original envelope without adding fields or text.
Known `upload` actions remain unsupported and return exit **2**; use the dashboard or Cloud Export.

**Recovery and closure.** After `revision_conflict`, read status and reconsider the action, input
and confirmation before retrying. Exit **2** can indicate an unavailable action, unsupported upload
or invalid input; inspect the error rather than inferring its cause from the exit code alone.
HTTP **403** returns auth exit **3**, preserving the server's message and diagnostics.
Transport retries reuse an idempotency key within one invocation; a new CLI invocation creates a
new key. After an unclear write result, inspect the migration (or `list` after `create`) before
repeating the write. `close --outcome finish` marks completed; `cancel` abandons the migration.
Both permanently close it and require `--yes`, with no interactive prompt. `list --all` is unsupported.

Wizard Service JSON errors retain `error.detail`, `error.fields` (each with `path` and `message`),
`error.next_step`, `error.request_id`, `error.retryable` and `error.retry_after_seconds` when supplied.
Use these to diagnose the request and plan recovery. Automatic retries still use HTTP status and
the `Retry-After` header; the body fields do not change that policy.

### Migration JSON and examples

| Command with `--json` | Response / relevant fields |
| --- | --- |
| `list` | `{items, available}` |
| `create`, `status`, input `run`, `close` | Full migration response (envelope), including `migration` and actions |
| `steps` | Envelope; checklist in `steps` |
| `show` without a resource | Envelope; readable names in `resources` |
| `show RESOURCE` | Envelope; resource data in `result`, which may be `null` |
| external `run` | Envelope from before the browser step |

Without `--json`, `show RESOURCE` prints only the resource data as JSON, or a message if empty.
Replace `mig_7x2` with an ID from `create` or `list`, `ACTION_ID` with an offered action ID,
and `RESOURCE` with a name from `reads` or `resources`.

```sh
adapty migrations list --json
adapty migrations create --name "Acme Fitness" --json
adapty migrations status -m mig_7x2 --json
adapty migrations show RESOURCE -m mig_7x2 --json
```

Prepare `decisions.json` from the action's current schema. These are alternative ways to submit
the same input; add `--yes` only after reviewing `confirm`:

```sh
adapty migrations run ACTION_ID -m mig_7x2 --input-file ./decisions.json --json
adapty migrations run ACTION_ID -m mig_7x2 --input-file - --json < ./decisions.json
```

For a selected external action, complete the linked step before waiting or checking status:

```sh
adapty migrations run ACTION_ID -m mig_7x2 --no-browser
adapty migrations status -m mig_7x2 --wait --timeout 5m --json
```

Optional JSON filters require the separate `jq` utility:

```sh
adapty migrations steps -m mig_7x2 --json | jq '.steps'
adapty migrations show RESOURCE -m mig_7x2 --json | jq '.result'
```

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
belongs to. Requires a connected Apple Ads account plus Ads Manager access — the 14-day trial counts, same
as a paid subscription. Without access every `asa` command answers `402 ads_manager_subscription_required`.
Start with `asa whoami`: its `access_source` says which one granted access (`trial`, `payg`, `legacy`).

| Command                              | Required flags / notes                                                     |
|-------------------------------------|----------------------------------------------------------------------------|
| `asa whoami`                         | company, how access was granted, Apple connection state                     |
| `asa connect`                        | prints the Apple authorization link and waits; `--no-wait` returns at once  |
| `asa apps list`                      | (pagination only)                                                           |
| `asa orgs list`                      | ASA organizations; their ID is the `--org` of `campaigns create`; `payment_model: LOC` means campaigns need the five `--invoice-*` flags |
| `asa campaigns list`                 | metadata only, no metrics; filters below                                    |
| `asa campaigns get <campaign_id>`    | positional UUID                                                             |
| `asa campaigns create`               | `--org`, `--name`, `--adam-id`, `--country` (repeatable), `--daily-budget`; optional `--target-cpa`, `--bidding-strategy`; LOC orgs: all five `--invoice-*` flags. A `MAX_CONVERSIONS` campaign also needs `ad-groups create --automated` or it stays `NOT_RUNNING` (`AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_MISSING`) |
| `asa campaigns update <campaign_id>` | at least one of `--name`, `--status`, `--country`, `--daily-budget`, `--budget`, `--target-cpa`, `--bidding-strategy`, or the five `--invoice-*` flags together (fixes `MISSING_BO_OR_INVOICING_FIELDS`) |
| `asa ad-groups list` / `get <id>`    | metadata only, like campaigns; numbers come from `asa metrics`              |
| `asa ad-groups create`               | `--campaign`, `--name`, `--default-bid`; Apple also needs `--pricing-model` (default CPC) and `--start-time` (default today). `--automated` = the automated group for Max Conversions: no `--start-time`, no `--status PAUSED`, `--default-bid` optional |
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
| `asa automations create`             | `--file rule.json` (or `-` for stdin), which must carry exactly one action and one condition; `--run-now` queues the first run; for an `add-as-keyword-to` action the params come from `--target-ad-group` (repeatable UUID), `--match-type`, `--cpt-bid-type`, `--cpt-bid`, `--negate` / `--no-negate`, `--skip-enable-duplicates` (search-term rules), `--pause-original` (targeting-keyword rules) — see README for the rule.json schema |
| `asa automations update <id>`        | `--stop` / `--start` / `--name` / `--file`; the file must not carry `internal_id`; the same action flags as `create` — passing one reads the rule, rebuilds `actions[0].params` and writes the whole `actions` list back (two calls, overwrites a concurrent dashboard edit), which is also how a rule with the wrong `params` shape is repaired |
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
