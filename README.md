<a href="https://adapty.io/?utm_source=github&utm_medium=referral&utm_campaign=adapty-cli">
    <img src="https://adapty-portal-media-production.s3.amazonaws.com/github/logo-adapty-new.svg">
</a>

# Adapty CLI

[Adapty Developer CLI](https://adapty.io/docs/developer-cli). Manage apps, products, paywalls, placements, flows, and access levels from your terminal.

## Installation

```sh
npm install -g adapty
```

Requires Node.js >= 18.

## Authentication

```sh
adapty auth login
```

Opens browser for OAuth device flow. Token is stored in `~/.config/adapty/config.json`.

Override with `ADAPTY_TOKEN` environment variable:

```sh
ADAPTY_TOKEN=your-token adapty apps list
```

Other auth commands:

```sh
adapty auth whoami     # verify token, show user info
adapty auth status     # show local auth state
adapty auth logout     # clear stored token (local only)
adapty auth revoke     # revoke token server-side and clear local
```

## Commands

All resource commands require `--app APP_ID` (UUID). Use `adapty apps list` to find your app ID.

### Apps

```sh
adapty apps list [--page N] [--page-size N]
adapty apps get APP_ID
adapty apps create --title "My App" --platform ios --apple-bundle-id com.example.app
adapty apps update APP_ID [flags]
```

### Products

```sh
adapty products list --app UUID [--page N] [--page-size N]
adapty products get --app UUID PRODUCT_ID
adapty products create --app UUID [flags]
adapty products update --app UUID PRODUCT_ID [flags]
```

### Paywalls

```sh
adapty paywalls list --app UUID [--page N] [--page-size N]
adapty paywalls get --app UUID PAYWALL_ID
adapty paywalls create --app UUID --title "Name" --product-id UUID1 [--product-id UUID2]
adapty paywalls update --app UUID PAYWALL_ID [flags]
```

### Placements

```sh
adapty placements list --app UUID [--page N] [--page-size N]
adapty placements get --app UUID PLACEMENT_ID
adapty placements create --app UUID [flags]
adapty placements update --app UUID PLACEMENT_ID [flags]
```

### Flows

```sh
adapty flows list --app UUID [--page N] [--page-size N]
adapty flows get --app UUID FLOW_ID
adapty flows create --app UUID --name "Name"
adapty flows config get --app UUID FLOW_ID
adapty flows config update --app UUID FLOW_ID (--config JSON | --config-file PATH|-) [--remote-configs JSON] [--expected-updated-at MS]
```

A freshly created flow has no config until the first `flows config update`; `flows config get` returns 404
until then. Pass `--expected-updated-at` (the `updated_at` from a prior `config get`) to fail instead of
overwriting a concurrent dashboard edit.

### Access Levels

```sh
adapty access-levels list --app UUID [--page N] [--page-size N]
adapty access-levels get --app UUID ACCESS_LEVEL_ID
adapty access-levels create --app UUID [flags]
adapty access-levels update --app UUID ACCESS_LEVEL_ID [flags]
```

### Apple Search Ads

Apple Search Ads commands live under `adapty asa` and talk to the ASA service rather than the Developer
API. They take **no `--app`**: the scope is the company behind your token. A connected Apple Ads account and
an active Ads Manager subscription are required — `adapty asa whoami` tells you where you stand.

```sh
adapty asa whoami                      # company, how access was granted, Apple connection state
adapty asa connect [--no-wait]         # link an Apple Search Ads account
adapty asa apps list                   # apps promoted in Apple Search Ads
adapty asa orgs list                   # Apple Search Ads organizations
```

Every list takes scope filters, and they narrow the query rather than the printed page — `asa keywords list`
unfiltered pages through the whole account, while one ad group is a handful of rows, so scope the read:

```sh
adapty asa campaigns list --app APP_UUID --status PAUSED
adapty asa ad-groups list --campaign CAMPAIGN_UUID
adapty asa keywords list --ad-group AD_GROUP_UUID --status ACTIVE
adapty asa keywords list --ad-group AD_GROUP_UUID --ad-group OTHER_UUID   # repeatable
adapty asa creatives list --app APP_UUID
```

`--campaign-group`, `--app`, `--campaign`, `--ad-group` are repeatable and take the UUIDs printed by the
matching list command; `--search` matches names case-insensitively. Each list accepts only the filters that
make sense for it: `--ad-group` starts at keywords, negative keywords, search terms and ads, `--status` is
`ENABLED`/`PAUSED` everywhere except keywords, which are `ACTIVE`/`PAUSED`, and `asa ads list` has no `--app`
because ads hang off ad groups. An id belonging to another company simply matches nothing.

Campaign structure. These lists return metadata only — numbers come from `asa metrics`, and only
`asa search-terms list` takes `--date-from` / `--date-to` (default: today):

```sh
adapty asa campaigns list
adapty asa campaigns get CAMPAIGN_ID
adapty asa campaigns create --org UUID --name "Winter push" --adam-id 123456 --country US --daily-budget 50
adapty asa campaigns update CAMPAIGN_ID [--status PAUSED] [--daily-budget 80] [--country US]

adapty asa ad-groups list
adapty asa ad-groups get AD_GROUP_ID
adapty asa ad-groups create --campaign UUID --name "Brand terms" --default-bid 1.20
adapty asa ad-groups update AD_GROUP_ID [--default-bid 1.50] [--status PAUSED]

adapty asa ads list
adapty asa ads get AD_ID
adapty asa ads create --ad-group UUID --creative-id 4321 --name "Summer ad"
adapty asa ads update AD_ID [--name "..."] [--status PAUSED]
```

Bulk structure creation submits a whole tree — campaigns with nested ad groups, keywords, negative keywords
and ads — in one call. The input is a JSON structure (the natural path for an AI agent: generate it, pipe it
in), or a native Apple Ads template converted server-side. The whole payload is validated before anything is
created — a rejection lists every bad node; on acceptance the command polls progress and prints the final
report (`success` / `partial` / `failed`, with per-object failures):

```sh
adapty asa campaigns bulk-create --file structure.json          # JSON structure, waits and reports
cat structure.json | adapty asa campaigns bulk-create --file -  # same, from stdin
adapty asa campaigns bulk-create --file structure.json --no-wait
adapty asa campaigns bulk-create --from-file Campaign_And_Adgroup_Template.xlsx --org-id 1234567
adapty asa campaigns bulk-create --from-file keywords_template.csv --org-id 1234567 --preview
adapty asa campaigns bulk-status OPERATION_ID
```

The structure is `{campaign_group_id | campaign_group_internal_id, campaigns: [...]}` where each campaign
node either creates (`payload`) or addresses an existing campaign by id (an *anchor*, optionally carrying
`update_payload`), and nests `ad_groups` with `keywords`, `negative_keywords` and `ads` the same way.
`--from-file` takes the native Apple Ads templates and needs `--org-id` (the Apple org id from
`asa orgs list`); `--preview` prints the converted request without creating anything. Conversion issues are
reported with their sheet, row and column.

Keywords are always applied as a batch, at most 100 per call, and a partial rejection is reported per item:

```sh
adapty asa keywords list
adapty asa keywords add --ad-group UUID --text "running shoes" --text "trail shoes" [--bid 1.20] [--match-type EXACT]
adapty asa keywords add --ad-group UUID --from-file keywords.txt
adapty asa keywords update KEYWORD_ID [KEYWORD_ID...] [--bid 2.00] [--status PAUSED]

adapty asa negative-keywords list
adapty asa negative-keywords add --ad-group UUID --text free
adapty asa negative-keywords add --campaign UUID [--all-ad-groups] --text free

adapty asa search-terms list [--date-from ... --date-to ...]
```

Product pages and rule-based automations:

```sh
adapty asa product-pages list
adapty asa product-pages sync [--adam-id 123456]

adapty asa automations list
adapty asa automations get AUTOMATION_ID
adapty asa automations create --file rule.json [--run-now]
adapty asa automations update AUTOMATION_ID [--stop] [--start] [--name "..."] [--file rule.json]
adapty asa automations run AUTOMATION_ID [--dry-run]
adapty asa automations runs AUTOMATION_ID
```

Metrics take an entity level, a period and an optional metric selection. Rows come back one per entity,
aggregated and sorted server-side, so a top-N or a breakdown is a single call — use `--order-by` with a small
`--page-size` for rankings, `metrics overview` for account totals and time series, and one big page (up to
1000 rows) when you genuinely need every row; never sum pages client-side:

```sh
adapty asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31
adapty asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --order-by spend --page-size 5
adapty asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --group-by country --page-size 1000
adapty asa metrics --entity keyword --date-from 2026-07-01 --date-to 2026-07-31 --metric spend --metric roas
adapty asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --metric roas --by-days 7 --by-days 90
adapty asa metrics overview --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 [--period-unit week]
```

There is no `ltv` metric: lifetime value is a cohort metric read at a renewal window, so `--by-days` is how you
ask for day-7 or day-90 values — on either route, up to 16 windows per call. `--order-by-day` ranks the rows by
one of those windows, which is how you get the top campaigns by day-90 ROAS in a single call.

Competitor summary takes 1–5 Apple App Store IDs and covers the last full month across every country — there
are no period or country flags on purpose. The first call on a cold cache can take tens of seconds:

```sh
adapty asa competitors summary --app-ids 111111111,2222222
```

Writes go straight to Apple and take seconds, so every writing command first prints the exact request body and
asks for a yes. `--yes` skips the question for scripts; in a pipe or under `--json` the command refuses instead
of waiting for input that will never come. There is no undo — the CLI has no delete.

Every write also carries an idempotency key. The CLI generates one per invocation and retries once on a
network error, so a request that died on the wire is never applied twice. Pass `--idempotency-key` to pin the
key yourself: re-running a script with the same key within 24 hours replays the stored result — the CLI prints
"Already applied earlier — showing the stored result." — instead of creating a second entity. The same key
with a different body is rejected (`422 cli_idempotency_key_reuse`), and a concurrent duplicate answers
`409 cli_idempotency_in_progress`.

Analytics is rate limited per company: the metrics routes get 5 calls a minute (at most 2 in any 10 seconds)
and share a pool of two concurrent queries with the search-terms list — a busy pool answers
`429 cli_analytics_busy`, an exhausted window `429 cli_rate_limit_exceeded`, both with the exact wait in
`Retry-After`. The CLI absorbs a single 429 on its own — it waits the announced `Retry-After` (up to 60
seconds; cool-downs are never waited out) and retries once — so a 429 that reaches you means the retry failed
too. A burst of 429s puts the token into an escalating cool-down (`cli_cooldown_active`, 5 minutes →
30 minutes → 3 hours); retries during the pause don't extend it, but the cure is fixing the failing request,
not waiting out the pause in a loop. An automation run is queued rather than awaited: `run` prints a run ID
and the outcome shows up in `adapty asa automations runs`.

### Global Flags

| Flag          | Description                            |
| ------------- | -------------------------------------- |
| `--json`      | Output as JSON                         |
| `--help`      | Show help                              |
| `--page`      | Page number (default: 1)               |
| `--page-size` | Items per page (default: 20, max: 100; `asa` commands: default 100, max 1000) |

## Paywall Preview

`adapty flows config preview <config_file>` turns a local flow config into a render URL — it opens in your
browser on a TTY, and prints the bare URL when piped. Screenshotting is the caller's job; the CLI only builds
the URL. See
[skills/adapty-cli/references/cli-commands.md](skills/adapty-cli/references/cli-commands.md#preview) for the
flags and how to pass the URL straight to a screenshot tool.

## Environment Variables

| Variable             | Description                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| `ADAPTY_TOKEN`       | Override stored auth token                                                              |
| `ADAPTY_API_URL`     | Override Developer API base URL (default: `https://api-admin.adapty.io/api/v1/developer`) |
| `ADAPTY_ASA_API_URL` | Override Apple Search Ads base URL (default: `https://api-asa-admin.adapty.io/api/v1/cli`) |
| `ADAPTY_APP_URL`     | Override dashboard base URL (default: `https://app.adapty.io`). Used by `flows config preview` for the fixed `/flow-preview` route, and by `auth login` to keep the verification link on that host |

The two API URLs are independent: pointing `ADAPTY_API_URL` at a staging host leaves `adapty asa` on the ASA
default, and the other way round.

## Claude Code Skill

Install the Adapty CLI skill for Claude Code:

```sh
npx skills add adaptyteam/adapty-cli --skill adapty-cli
```

## Development

```sh
pnpm install
pnpm build
./bin/run.js apps list
```

## License

MIT
