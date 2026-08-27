# Apple Search Ads — Managing Campaigns

Everything under `adapty asa` is scoped to the company behind the token, not to one app.
No command in this file takes `--app` to select scope — the one exception is `--app` as a
list filter, covered in [Scope filters](#scope-filters). Ids are the UUIDs printed by the
matching list command; never invent one.

All `list` commands paginate: `--page` (default `1`), `--page-size` (default `100`, max
`1000`) — prefer one big page over a pagination loop. Counting entities costs nothing
extra: every list response carries `meta.pagination.count`, so `--page-size 1` answers
"how many X do I have" without walking pages.

Every `list` and `get` command in this file returns metadata only, no metrics. Every number
— spend, ROAS, or anything else — comes from `asa metrics`.

## Account and discovery

| Command | Flags | Notes |
|---|---|---|
| `asa whoami` | none | Company, how access was granted, Apple connection state. Run this first. No connected Apple Ads account or no active Ads Manager subscription answers `402 ads_manager_subscription_required` on every other `asa` command. |
| `asa connect` | `--no-wait` optional | Prints the Apple authorization link and waits for the link to be completed; `--no-wait` returns immediately instead of waiting. |
| `asa apps list` | pagination only | Apps promoted in Apple Search Ads. Its rows supply `--adam-id` for `campaigns create`. |
| `asa orgs list` | pagination only | Apple Search Ads organizations. Each row carries two identifiers, not interchangeable: `internal_id` (a UUID) and `org_id` (Apple's numeric id). `--org` on `campaigns create` takes `internal_id` — passing the numeric `org_id` fails with "Invalid org ID format." `payment_model` (`LOC`/`PAYG`) tells you whether campaigns in that organization need Invoicing Options — see [Line of credit](#line-of-credit-loc-organizations). |

## Campaigns

| Command | Flags | Notes |
|---|---|---|
| `asa campaigns list` | scope filters only | Metadata only. |
| `asa campaigns get <id>` | positional UUID | Metadata only. |
| `asa campaigns create` | `--org`, `--name`, `--adam-id`, `--country` (repeatable), `--daily-budget`; optional `--status` (`ENABLED`/`PAUSED`, no default), `--budget` (lifetime), `--target-cpa`, `--bidding-strategy`, `--supply-source` (repeatable, default `APPSTORE_SEARCH_RESULTS`), `--billing-event` (`IMPRESSIONS`/`TAPS`, default `TAPS`), `--ad-channel-type` (`DISPLAY`/`SEARCH`, default `SEARCH`), `--invoice-advertiser`, `--invoice-order-number`, `--invoice-contact-name`, `--invoice-contact-email`, `--invoice-billing-email` (all five together, LOC organizations only) | `--org` takes the UUID (`internal_id`) from `asa orgs list`, not that row's numeric `org_id`; `--adam-id` comes from `asa apps list`. `--status` has no default — pass `--status PAUSED` to launch without spending until you enable it. The response carries `serving_status` and `serving_state_reasons`; when the campaign is `NOT_RUNNING` the command prints the reason and the fixing command — see [Max Conversions](#max-conversions-campaigns) and [Line of credit](#line-of-credit-loc-organizations). |
| `asa campaigns update <id>` | at least one of `--name`, `--status`, `--country`, `--daily-budget`, `--budget`, `--target-cpa`, `--bidding-strategy`, or `--invoice-advertiser`, `--invoice-order-number`, `--invoice-contact-name`, `--invoice-contact-email`, `--invoice-billing-email` together | The `--invoice-*` flags replace the stored Invoicing Options as a whole — pass all five, a partial set exits 2 before the network. |
| `asa campaigns bulk-create` | exactly one of `--file` (JSON structure, `-` for stdin) / `--from-file` (Apple Ads template, `.xlsx` or keywords `.csv`); `--org-id` required with `--from-file`; optional `--preview`, `--no-wait`, `--poll-interval` (default `5`), `--timeout` (default `900`) | Creates a whole structure — campaigns → ad groups → keywords/negative keywords/ads — as one queued operation. `--org-id` is the exception to this file's UUID rule: it takes the **numeric** `org_id` from `asa orgs list` (Apple's `campaign_group_id`), not the `internal_id` UUID that `campaigns create --org` takes. `--from-file` converts the template server-side first (its own budget — see [Request budgets](#request-budgets)); with `--preview` the command prints the converted request and creates nothing. By default it polls until the operation finishes (`success`/`partial`/`failed`, per-object failures listed); `--no-wait` prints the `operation_id` and returns — follow up with `bulk-status`. |
| `asa campaigns bulk-status <operation-id>` | positional operation id, printed by `bulk-create` | Progress of one bulk operation: status, applied/failed counts, and the per-object log with each failure's reason. |
| `asa campaigns bulk-list` | optional `--status` (`pending`/`running`/`success`/`partial`/`failed`, repeatable), `--app` (UUID), `--created-from`/`--created-to` (YYYY-MM-DD) | This company's bulk operations, newest first — one row per operation with its verdict and timestamps, no per-object detail. Use it to find an `operation_id` you lost or to check what ran recently, then drill in with `bulk-status`. Cheap catalog read. |

### Max Conversions campaigns

A campaign with `--bidding-strategy MAX_CONVERSIONS` is created fine but stays `NOT_RUNNING` with
`serving_state_reasons: ["AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_MISSING"]` until it has an **automated ad group**.
Always create the pair:

```sh
adapty asa campaigns create --org ORG_UUID --name "Max Conv" --adam-id 123456 --country US --daily-budget 50 --bidding-strategy MAX_CONVERSIONS
adapty asa ad-groups create --campaign CAMPAIGN_UUID --name "Automated Max Conv" --automated
```

`--automated` sends `automated_keywords_required: true` and `automated_keywords_opt_in: true`, omits `start_time`
(Apple schedules the automated group itself — combining it with `--start-time` exits 2), must stay `ENABLED`
(`--status PAUSED` exits 2; pause the campaign instead) and makes `--default-bid` optional (Apple reports the bid as
`0` when omitted). A plain ad group, even with `--automated-keywords`, does not satisfy the requirement. On the
campaign, `--target-cpa` must be lower than `--daily-budget`.

### Line of credit (LOC) organizations

`asa orgs list` shows each organization's `payment_model`. When it is `LOC`, Apple requires Invoicing Options on
every campaign — without them the campaign is created but sits `NOT_RUNNING` with
`serving_state_reasons: ["MISSING_BO_OR_INVOICING_FIELDS"]`. Pass all five flags together (a partial set exits 2
before the network):

```sh
adapty asa campaigns create --org ORG_UUID --name "LOC push" --adam-id 123456 --country US --daily-budget 50 \
  --invoice-advertiser "Acme Inc" --invoice-order-number PO-42 --invoice-contact-name "Jane Doe" \
  --invoice-contact-email jane@acme.com --invoice-billing-email billing@acme.com
```

For a campaign that already exists, the same five flags on `asa campaigns update <id>` set (or replace) its
Invoicing Options. They map to `loc_invoice_details` in the request: advertiser → `client_name`, order number →
`order_number`, contact name → `buyer_name`, contact email → `buyer_email`, billing email → `billing_contact_email`.

## Ad groups

| Command | Flags | Notes |
|---|---|---|
| `asa ad-groups list` | scope filters only | Metadata only. |
| `asa ad-groups get <id>` | positional UUID | Metadata only. |
| `asa ad-groups create` | `--campaign`, `--name`, `--default-bid` (optional with `--automated`); optional `--automated` | Apple also requires a pricing model and a start time; the CLI defaults `--pricing-model` to `CPC` (the only other option is `CPM`) and `--start-time` to today if you don't pass them. `--automated` creates the automated ad group a Max Conversions campaign needs: it implies automated keywords, sends no `start_time` (exits 2 if `--start-time` is also given), must be `ENABLED` (exits 2 on `--status PAUSED`) and does not require `--default-bid` — see [Max Conversions](#max-conversions-campaigns). |
| `asa ad-groups update <id>` | at least one field | The campaign is resolved server-side and is never passed on update. |

## Ads

| Command | Flags | Notes |
|---|---|---|
| `asa ads list` | scope filters only | Ads hang off ad groups, not apps directly — there is no `--app`; filter by `--ad-group` or `--campaign` instead. Metadata only. |
| `asa ads get <id>` | positional UUID | `serving_state_reasons` in the response explains a non-running ad. |
| `asa ads create` | `--ad-group`, `--creative-id`, `--name` | The creative id comes from `asa creatives list`. |
| `asa ads update <id>` | `--name` and/or `--status` | The creative and the parent ad group are fixed at creation and cannot be changed. |

## Keywords

| Command | Flags | Notes |
|---|---|---|
| `asa keywords list` | scope filters only | Metadata only. Filter by `--ad-group` — unfiltered, this is the widest read in the surface. |
| `asa keywords add` | `--ad-group` plus `--text` (repeatable) and/or `--from-file`; optional `--bid`, `--match-type` (`BROAD`/`EXACT`, default `BROAD`), `--status` (`ACTIVE`/`PAUSED`, default `ACTIVE`) | Batch call, capped at 100 keywords per call — the skill's own practice caps a single call lower, at 15 (see `SKILL.md`'s `## Never`). `--from-file` reads one keyword per line, trims each line, drops blank lines, and combines the result with any `--text` values. Default match type is `BROAD`, which widens spend beyond exact matches; pass `--match-type EXACT` to narrow it. |
| `asa keywords update <id> [<id>...]` | one or more positional ids | The same change (e.g. `--bid`, `--status`) is applied to every id in the list. `--text` is only valid when a single id is given — you cannot bulk-rename keyword text. |

## Negative keywords

| Command | Flags | Notes |
|---|---|---|
| `asa negative-keywords list` | scope filters only | Metadata only. `ad_group_id` is empty (`null`) on campaign-level rows; `--campaign-level-only` keeps only those rows. |
| `asa negative-keywords add` | exactly one of `--ad-group` / `--campaign`, plus `--text` (repeatable); optional `--match-type` (`BROAD`/`EXACT`, default `EXACT`), `--status` (`ACTIVE`/`PAUSED`, default `ACTIVE`) | `--all-ad-groups` applies the negative keyword to every ad group in the campaign and requires `--campaign`. Same 100-item batch cap as `keywords add`, and the same 15-per-call practice (see `SKILL.md`'s `## Never`). Default match type here is `EXACT` — the opposite of `keywords add`'s `BROAD` default. |

## Product pages

| Command | Flags | Notes |
|---|---|---|
| `asa product-pages list` | see Scope filters | Read-only, metadata only. |
| `asa product-pages sync [--adam-id]` | `--adam-id` optional | Queued rather than awaited; the response's `replayed` field is what tells the two outcomes apart. `replayed: false` means this call just queued a sync (the CLI prints "Sync queued."). `replayed: true` means one was already running and this call queued nothing new (the CLI prints "Already running; nothing new was queued."). The response also carries `state`, `sync_id`, and `accepted_at`. |

## Creatives

| Command | Flags | Notes |
|---|---|---|
| `asa creatives list` | see Scope filters | Yields the Apple `creative_id` that `ads create` needs. |

## Automations

| Command | Flags | Notes |
|---|---|---|
| `asa automations list` | pagination only, no scope filters | `status` in the response is `1` for active, `0` for stopped. |
| `asa automations get <id>` | positional UUID | Same `status` convention as `list`. |
| `asa automations create` | `--file rule.json` (or `--file -` for stdin) | `--run-now` queues the rule's first run immediately after creation. |
| `asa automations update <id>` | one or more of `--stop`, `--start`, `--name`, `--file` | If you pass `--file`, that file must not carry `internal_id` — the CLI treats a JSON body with `internal_id` in it as an error, since that field is server-assigned. |
| `asa automations run <id>` | `--dry-run` optional | Queued; the command prints a run id. `--dry-run` evaluates the rule and logs what it would do without touching Apple. |
| `asa automations runs <id>` | positional UUID | Past runs for this automation, dry runs included. |

## Scope filters

Filters narrow the query itself, not the printed page: an unfiltered `asa keywords list`
pages through the whole account, while one ad group's list is a handful of rows. Always
scope a read.

| Filter | Lists that accept it |
|---|---|
| `--campaign-group` | campaigns, ad groups, ads, keywords, negative keywords, search terms, product pages, creatives — not `apps list`, `orgs list`, or `automations list` |
| `--app` | campaigns, ad groups, keywords, negative keywords, search terms, product pages, creatives |
| `--campaign` | ad groups, keywords, negative keywords, search terms, ads |
| `--ad-group` | keywords, negative keywords, search terms, ads |
| `--status` | campaigns, ad groups, ads (`ENABLED`/`PAUSED`), keywords (`ACTIVE`/`PAUSED`) |
| `--search` | campaigns, ad groups, keywords, negative keywords, search terms, ads — not product pages, creatives, `apps list`, `orgs list`, or `automations list` |
| `--campaign-level-only` | negative keywords only |

Id filters (`--campaign-group`, `--app`, `--campaign`, `--ad-group`) are repeatable and take
UUIDs. `--app`, `--campaign`, and `--ad-group` take the UUIDs printed by the matching list
command (`apps list`, `campaigns list`, `ad-groups list`). There is no `campaign-groups
list` — organizations and campaign groups are the same thing here, so `--campaign-group`
takes the `internal_id` UUIDs printed by `asa orgs list`. An id owned by another company
matches nothing — the page comes back empty rather than erroring, so an empty result is
not proof the entity doesn't exist anywhere, only that it isn't yours.

`asa ads list` has no `--app` filter, because ads hang off ad groups, not apps — use
`--ad-group` or `--campaign` to scope it instead.

## Status

```
Campaigns, ad groups, ads:  --status ENABLED | PAUSED
Keywords:                   --status ACTIVE  | PAUSED
```

The keyword enum is different from every other entity's — `ACTIVE`/`PAUSED`, not
`ENABLED`/`PAUSED`. There is no `DISABLED` value anywhere in the `asa` surface, on any
entity.

## Request budgets

Every `asa` command is rate limited per company, not per token:

| Commands | Budget |
|---|---|
| catalog lists and gets, automation reads | 120/min |
| `keywords list` | 30/min, burst 5 per 10s, its own 2-concurrent pool, 60s server timeout |
| all writes | 20/min |
| template conversion (`bulk-create --from-file`) | 10/min, one conversion at a time |
| `whoami` | 60/min |

`keywords list` is the heaviest metadata read in the surface — its own budget is on top of
the account-size reason to filter it in Scope filters. `metrics`, `metrics overview`,
`search-terms list`, and `competitors summary` share a separate analytics pool with its own
budget and its own `429 cli_analytics_busy`; that pool and its numbers live in the metrics
reference, not here.

A budget running out answers `429 cli_rate_limit_exceeded` with the wait in `Retry-After` —
a different code from `cli_analytics_busy` (that other pool's concurrency cap) and from
`cli_cooldown_active` (the token-wide escalation described next). The CLI already waits
out and retries the first 429 of any command on its own — the exact `Retry-After`, up to
60 seconds, cool-downs excluded — so a 429 that reaches you means the retry also failed and
the budget is genuinely exhausted; don't loop, wait for the window to reset or reduce the
call. Twenty rejections within 5 minutes escalate any of these commands into
`429 cli_cooldown_active`, a cool-down scoped to the token (5m → 30m → 3h) that stops every
`asa` command from that token, not just the one that tripped it.

## Writes and idempotency

- Every mutating command prints the exact request body it will send and waits for
  confirmation. `--yes` skips the prompt. Under `--json` or in a pipe, the command refuses
  rather than hanging.
- Every write sends an `Idempotency-Key`. It is auto-generated per invocation; one network
  error is retried automatically with the same key, so a request that died on the wire is
  never applied twice.
- `--idempotency-key <key>` pins the key yourself. A repeat with the same key and body
  within 24 hours replays the stored result and prints "Already applied earlier — showing
  the stored result." instead of creating a second entity.
- Same key, different body: `422 cli_idempotency_key_reuse`. Concurrent duplicate:
  `409 cli_idempotency_in_progress`.
- Keyword and negative-keyword calls are batches: one bad id fails the whole batch before
  Apple is called; Apple may still reject individual items within an otherwise valid batch,
  each with its own reason.
- Money flags take a bare amount (`--daily-budget 50`); `--currency` defaults to `USD`.
- There is no delete command in the `asa` topic.
