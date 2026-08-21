# Apple Search Ads — Metrics and Analytics

No `asa` command takes `--app` to select scope — the token's company already fixes that.
The one exception is `--app` as a list filter, and among the four commands here it applies
only to `search-terms list` (the full filter set is in `asa-management.md`).

`metrics` and `metrics overview` take no scope filter at all — no `--app`, `--campaign`,
`--ad-group`, `--search`, `--status`. A call covers the whole account at the `--entity`
level and date window you give it; narrow the answer by matching the returned rows against
ids from a scoped list in `asa-management.md`, not by looking for a flag that isn't there.

`asa-management.md`'s `list` and `get` commands return metadata only — no spend, no ROAS,
no counts of any kind. Every number comes from the commands in this file. To count entities
instead of reading their numbers — "how many active campaigns do I have" — skip metrics
entirely: every list response carries `meta.pagination.count`; pass `--page-size 1` and read
that field.

## Commands

| Command | Flags | Notes |
|---|---|---|
| `asa metrics` | `--entity`, `--date-from`, `--date-to` required; `--metric` (repeatable), `--group-by` (repeatable), `--order` (`asc`/`desc`, default `desc`), `--order-by`, `--by-days` (repeatable, max 16), `--order-by-day`, `--page` (default `1`), `--page-size` (default `100`, max `1000`) optional | One row per entity — `ad`, `ad-group`, `campaign`, or `keyword` — already aggregated over the period and already sorted server-side by `--order-by`. A top-N question is one call, `--order-by X --page-size N`; never paginate and sum yourself, and for a full breakdown take one big page (`--page-size 1000`) instead of looping. `--order` defaults to `desc`; pass `--order asc` for a "worst" question instead of "best." `--group-by` is one of `country`, `day`, `month`, `quarter`, `week`, `year`, and its coarseness sets the date-window cap (see [Date window caps](#date-window-caps)). Account-level totals are one call to `metrics overview` instead. |
| `asa metrics overview` | `--entity`, `--date-from`, `--date-to` required; `--metric` (repeatable, root names only), `--by-days` (repeatable, max 16), `--period-unit` (`day`/`week`/`month`/`quarter`/`year`, default `day`) optional | Returns one response, not a list — totals for the whole entity level plus a per-period series in the same call, no pagination, no client-side summing. That's the one-call answer to a trend question ("today vs. yesterday," "this week vs. last"). Has no `--group-by` and no `--order`/`--order-by`/`--order-by-day`. Shares the 5-per-minute metrics budget with `metrics` (see [The analytics pool](#the-analytics-pool)). Metric names here are root names only — see [Metric vocabulary](#metric-vocabulary). |
| `asa search-terms list` | `--date-from` / `--date-to` (default: today); scope with `--ad-group` / `--campaign`; `--page` (default `1`), `--page-size` (default `100`, max `1000`) | The only list command in the `asa` topic that takes period flags — it draws on the same analytics pool as `metrics` (see [The analytics pool](#the-analytics-pool)), not the metadata store the other lists use. The full scope-filter set (`--app`, `--campaign-group`, `--search` included) is in `asa-management.md`. This file covers *reading* search terms; turning what you find into keywords or negative keywords is in `asa-management.md`. |
| `asa competitors summary` | `--app-ids` (1–5 Apple App Store IDs, comma-separated) | Covers the last full month across every country — there are deliberately no period or country flags. The first call on a cold cache can take tens of seconds. |

## Date window caps

`metrics` and `metrics overview` cap the date window by the call's grouping. On `metrics`
the finest `--group-by` period sets the cap; on `metrics overview` it follows `--period-unit`:

| Grouping | Max window on `metrics` | Max window on `metrics overview` |
|---|---|---|
| `day` | 28 days | 90 days |
| no period grouping | 90 days | — |
| `week` | 180 days | 180 days |
| `month`, `quarter`, or `year` | 365 days | 365 days |

A window too wide for the grouping you asked for is fixed by coarsening that flag, never by
splitting the request into more calls — a year of data is one call at `--group-by month` (or
`--period-unit month`), not a series of month-long day-grain calls.

Day grain is a drill-down for windows up to four weeks, not an export format. For anything
longer than a month, ask at `week` grain — half a year of weekly dynamics is **one** call at
`--group-by week`, and a year is one call at `--group-by month`. Never loop day-grain calls
over consecutive 28-day windows to cover a long period: that is the exact burst pattern that
gets a token throttled, and the daily points add nothing a weekly series doesn't show at that
time scale.

## Metric vocabulary

`--metric` and `--order-by` take the dashboard's own metric names — never invent or guess
one. A wrong name fails the call with an error that lists every valid name, so probing for
names costs at most one call and should never be done on purpose.

Cohort roots — `revenue`, `arpu`, `arppu`, `arpas` (alias `cohort_arpas`), `roas`, `roi` —
expand to `gross_`, `proceeds_`, and `net_` variants (`gross_roas`, `proceeds_revenue`,
`net_arpu`, and so on). To rank by a cohort metric with `--order-by`, use the expanded name
— `--order-by net_roas`, not `--order-by roas`. Agent workflows use the `net_` variant and do
not ask users to choose gross or proceeds. There is no `ltv` metric; see [Cohort
windows](#cohort-windows).

`metrics overview` accepts the root names only (`revenue`, `roas`, `arpu`, …) — no
`gross_`/`proceeds_`/`net_` variants, and no keyword-only names.

**Apple spend metrics:** `spend`, `local_spend`, `impressions`, `taps`, `ttr`, `avg_cpt`,
`avg_cpm`, `ipm`, `total_installs`, `total_new_downloads`, `total_redownloads`,
`tap_installs`, `tap_new_downloads`, `tap_redownloads`, `view_installs`,
`view_new_downloads`, `view_redownloads`, `total_avg_cpi`, `total_install_rate`,
`tap_install_cpi`, `tap_install_rate`.

**Adapty attribution metrics:** `adapty_installs`, `trials_started`, `trials_converted`,
`subscriptions_started`, `non_subscriptions`, `paid`, `conversion`, `paid_subscribers`,
`subscribers`, `adapty_install_cr`, `trial_cr`, `trials_converted_cr`,
`subscriptions_started_cr`, `non_subscriptions_cr`, `paid_cr`, `conversion_cr`,
`cost_per_adapty_install`, `cost_per_trial`, `cost_per_trials_converted`,
`cost_per_subscriptions_started`, `cost_per_non_subscriptions`, `cost_per_paid`,
`cost_per_conversion`.

**Cohort (revenue) metrics**, per gross/proceeds/net: `gross_revenue`, `proceeds_revenue`,
`net_revenue`, and the same triple for `arpu`, `arppu`, `arpas`, `roas`, `roi`.

**Keyword-only:** `rank`, `search_popularity`, `impression_midpoint`.

## Cohort windows

The single most misunderstood part of the surface: there is no `ltv` metric. Lifetime value
is a cohort metric read at a renewal window, so `--by-days` is how you ask for a day-7 or
day-90 value.

- `--by-days` applies only to the cohort roots `revenue`, `roas`, `arpu`, `arppu`, `arpas`, and
  `roi`. It is repeatable, at most 16 windows per call, on both `metrics` and `metrics overview`.
  Omit it entirely to get the dashboard's default figures instead of cohort values.
- `--order-by-day` ranks rows by one of those windows — the way to get top campaigns by
  day-90 ROAS in a single call. Its value must be one of the windows passed to `--by-days`.
- Ranking by a cohort metric takes the expanded name. Agent workflows use `--order-by net_roas`,
  not `--order-by roas` — see [Metric vocabulary](#metric-vocabulary).
- Apple spend, Adapty attribution, count, conversion, and cost metrics are not cohort-windowed.
  In particular, `cost_per_paid` and `cost_per_trial` are values for the requested date window;
  `--by-days` does not turn either into a day-X metric. Never ask for a cohort day, pass
  `--by-days` / `--order-by-day`, or attach a `day-X` label for a non-cohort metric.

```sh
adapty asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 \
  --metric roas --by-days 7 --by-days 90 --order-by net_roas --order-by-day 90
```

## The analytics pool

Three commands draw on one single-slot pool per company: `metrics`, `metrics overview`, and
`search-terms list` — only one of them runs at a time, a slot held by one is a slot the
others can't use (`competitors summary` holds its own single slot). On top of that shared
concurrency, each pair also carries its own per-minute budget:

| Commands | Per-minute budget |
|---|---|
| `metrics`, `metrics overview` | 5/min, burst at most 2 per 10s |
| `search-terms list`, `competitors summary` | 30/min |

Three 429 codes, not one:

- `cli_analytics_busy` — another analytics query is still running; wait about 5 seconds.
- `cli_rate_limit_exceeded` — the per-minute window (5/min or 30/min, whichever pair) is
  full.
- `cli_cooldown_active` — stop entirely; tell the user when to retry.

Every refusal carries the wait in `Retry-After`. The CLI already absorbs the first 429 of
any single command on its own — it waits the exact `Retry-After` (up to 60s; cool-downs
excluded) and retries once. So a 429 that reaches you is the *second* attempt failing: the
budget is genuinely exhausted for now. Don't loop on it — cut the number of calls in the
plan, or tell the user when to retry.

20 rejections within 5 minutes put the token — not the whole company — into an escalating
cool-down: `cli_cooldown_active`, 5m → 30m → 3h. Retrying during the pause does not extend
it; the fix is calling less, not retrying harder.

These limits are specific to the four commands above. They do not apply to the management
commands in `asa-management.md` — campaigns, ad groups, ads, keywords, negative keywords,
product pages, creatives, automations all run outside this pool. `asa keywords list` looks
like it belongs here (it's the heaviest metadata read in the topic) but runs on its own,
separate 2-concurrent pool with its own 30/min budget — documented in `asa-management.md`,
shared with nothing in this file.
