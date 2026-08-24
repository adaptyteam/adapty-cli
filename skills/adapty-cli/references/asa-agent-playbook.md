# ASA Agent Playbook — answering questions without wasting requests

How to turn a user's question about Apple Search Ads into the **minimum** number of CLI calls.
Read this before answering any performance question. The budgets here are hard server limits:
an agent that ignores them gets 429s, then a token cool-down, and then it cannot answer at all.

## How the system is built (mental model)

- **Catalog reads** (`campaigns/ad-groups/keywords/negative-keywords/ads/creatives/product-pages list|get`)
  return synced **metadata only** — names, ids, statuses, budgets, bids. No numbers. Cheap (Postgres).
- **Numbers** come from exactly two commands, both ClickHouse-backed and rate-limited hard:
  - `asa metrics` — one row **per entity** (campaign / ad-group / keyword / ad), already aggregated over
    the period and **already sorted** by `--order-by`. Pagination walks entities, not raw data.
  - `asa metrics overview` — **account-level totals** for one entity level + a per-period time series.
- `asa search-terms list` is the only catalog-style list that still carries metrics and a period.
- Numbers equal the dashboard: both commands proxy the same v5 layer the dashboard reads.
- Money and ratio values arrive as **strings** (decimal precision), statuses as enums.

## Iron rules

1. **One question → one call.** Decide the single command that answers the question before running
   anything. Do not add period comparisons, trends or extra breakdowns the user did not ask for —
   propose them in the answer instead, as a follow-up the user can accept.
2. **Never sum pages yourself.** The server aggregates. Totals = `metrics overview` (one call).
   Top-N = `metrics --order-by X --page-size N` (one call). If a breakdown genuinely needs every row,
   ask for one big page: `--page-size` goes up to **1000** on every asa command.
3. **Trend and comparison questions are still one call.** A per-day/week/month series from
   `metrics overview` contains both "today" and "yesterday", both "this week" and "last week".
   Never make one call per period.
4. **Never guess or probe metric names.** The full vocabulary is below. A wrong name is a 422 whose
   message lists every valid name — one failed call is the most discovery ever costs, so never spend
   calls "checking what works".
5. **Respect the metrics budget: 5 calls/minute, at most 2 per any 10 seconds, one at a time.**
   Plan the whole answer inside that. Sequential calls only. The CLI absorbs a single 429 by itself —
   it waits the exact `Retry-After` (up to 60s, cool-downs excluded) and retries once — so if a command
   still fails with 429, the budget is genuinely gone: do not loop, reduce the number of calls or tell
   the user when to retry. 20 rejections within 5 minutes put the token into an escalating cool-down
   (5m → 30m → 3h) that blocks everything.
6. **A too-wide date window is fixed by coarsening, not splitting.** Caps on `metrics`: 28 days when
   `day` is in `--group-by`, 90 with no period grouping, 180 by week, 365 by month/quarter/year
   (`metrics overview` keeps 90 at `--period-unit day`). Need a year of data? `--group-by month`
   (or `--period-unit month`) in one call — never a series of day-grain calls. Day grain is a
   drill-down for up to 4 weeks: for a longer period use `week` (half a year = one call) or `month`
   (a year = one call), and never loop consecutive 28-day day-grain windows to stitch a long range —
   that burst is what throttles the token, and weekly points already show the trend at that scale.
   Each `metrics` page is also capped at 20 000 breakdown rows (entities × countries × periods) — a
   422 `cli_response_too_large` means coarsen the grouping, narrow the window, or reduce `--page-size`.
7. **Counting entities needs no data.** Every list response carries `meta.pagination.count` — use
   `--page-size 1` and read the count.
8. **Keyword metadata list is the heaviest read.** `asa keywords list` has its own budget (30/min,
   5 per 10s, 2 concurrent, 60s server timeout). Always filter it with `--ad-group`/`--campaign`.
   Note this is the *metadata* list; keyword *numbers* come from `metrics --entity keyword`, which
   ranks the whole account in one call.
9. **Writes change a live ad account.** Preview + explicit user confirmation, `--yes` only after the
   user agreed, pin `--idempotency-key` in scripts. 20 writes/minute.

## Request budgets (per company, not per token)

| Commands | Budget |
|---|---|
| `metrics`, `metrics overview` | 5/min, burst 2 per 10s, one at a time (pool shared with search-terms) |
| `search-terms list`, `competitors summary` | 30/min, search-terms shares the single-slot analytics pool |
| `keywords list` | 30/min, burst 5 per 10s, own 2-concurrent pool, 60s timeout |
| catalog lists and gets, automation reads | 120/min |
| all writes | 20/min |
| `whoami` | 60/min |

Every refusal is a `429` with the exact wait in `Retry-After`; `cli_analytics_busy` means another
analytics query is still running (wait ~5s), `cli_rate_limit_exceeded` means the window is full,
`cli_cooldown_active` means stop entirely and tell the user when to retry. The CLI already waits out
and retries the first 429 of a command on its own — a surfaced 429 means the second attempt failed too.
`cli_response_too_large` is the exception: a 422 (a `metrics` page over 20 000 breakdown rows) with no
`Retry-After` and no cool-down strike — waiting fixes nothing, change the request instead.

## Metric vocabulary

`--metric` and `--order-by` take the dashboard's own names. Cohort roots — `revenue`, `arpu`, `arppu`,
`arpas` (alias `cohort_arpas`), `roas`, `roi` — expand to their `gross_` / `proceeds_` / `net_` variants;
to *rank* by a cohort metric use the expanded name (e.g. `--order-by gross_roas`). There is **no `ltv`
metric**: lifetime value = cohort metrics read at renewal windows via `--by-days` (up to 16 per call).

**Apple spend metrics:** `spend`, `local_spend`, `impressions`, `taps`, `ttr`, `avg_cpt`, `avg_cpm`,
`ipm`, `total_installs`, `total_new_downloads`, `total_redownloads`, `tap_installs`,
`tap_new_downloads`, `tap_redownloads`, `view_installs`, `view_new_downloads`, `view_redownloads`,
`total_avg_cpi`, `total_install_rate`, `tap_install_cpi`, `tap_install_rate`.

**Adapty attribution metrics:** `adapty_installs`, `trials_started`, `trials_converted`,
`subscriptions_started`, `non_subscriptions`, `paid`, `conversion`, `paid_subscribers`, `subscribers`,
`adapty_install_cr`, `trial_cr`, `trials_converted_cr`, `subscriptions_started_cr`,
`non_subscriptions_cr`, `paid_cr`, `conversion_cr`, `cost_per_adapty_install`, `cost_per_trial`,
`cost_per_trials_converted`, `cost_per_subscriptions_started`, `cost_per_non_subscriptions`,
`cost_per_paid`, `cost_per_conversion`.

**Cohort (revenue) metrics**, per gross/proceeds/net: `gross_revenue`, `proceeds_revenue`,
`net_revenue`, and the same triple for `arpu`, `arppu`, `arpas`, `roas`, `roi`.

**Keyword-only:** `rank`, `search_popularity`, `impression_midpoint`.

`asa metrics overview` accepts the **root names only** (`revenue`, `roas`, `spend`, `taps`, …) — no
`gross_`/`proceeds_`/`net_` variants and no keyword-only names there.

## Recipes: question → command

Each recipe is the whole answer — if it says one call, a second call is a mistake.
Substitute the user's period; default to the current month when they don't name one.

**"How much did I spend today / this week / this month?"** — one call:
```sh
adapty asa metrics overview --entity campaign --date-from 2026-08-01 --date-to 2026-08-11 --metric spend
```

**"Did spend go up or down vs yesterday / last week?" (any trend)** — one call, the series covers
both periods; compare the buckets in the response:
```sh
adapty asa metrics overview --entity campaign --date-from 2026-08-04 --date-to 2026-08-11 --metric spend [--period-unit week]
```

**"Best / worst campaign by ROAS (or any metric)?"** — one call, the server ranks:
```sh
adapty asa metrics --entity campaign --date-from ... --date-to ... --order-by gross_roas --page-size 5
adapty asa metrics --entity campaign --date-from ... --date-to ... --order-by gross_roas --order asc --page-size 5   # worst
```

**"Top / bottom keywords by spend this week?"** — one call:
```sh
adapty asa metrics --entity keyword --date-from ... --date-to ... --metric spend --metric gross_roas --order-by spend --page-size 10
```

**"Performance by country?"** — one call; every row carries its country breakdown, take the single
big page and aggregate in your answer (not by fetching more pages):
```sh
adapty asa metrics --entity campaign --date-from ... --date-to ... --group-by country --page-size 1000
```

**"Is campaign X hitting its budget? / Is it spending?"** — two calls maximum: budget is metadata,
spend is metrics; match the campaign by id or name in the metrics rows:
```sh
adapty asa campaigns list --search "Brand US"
adapty asa metrics --entity campaign --date-from ... --date-to ... --metric spend
```

**"Keywords spending without converting (wasted spend)?"** — one call, scan rows where the
conversion columns are zero:
```sh
adapty asa metrics --entity keyword --date-from ... --date-to ... --metric spend --metric adapty_installs --metric trials_started --order-by spend --page-size 50
```

**"What's my D7 / D30 ROAS? Which campaigns hit the D30 target?"** — one call; `--by-days` reads the
cohort at those windows, `--order-by-day` ranks by one of them:
```sh
adapty asa metrics --entity campaign --date-from ... --date-to ... --metric roas --by-days 7 --by-days 30 --order-by gross_roas --order-by-day 30
```

**"How many active campaigns do I have?"** — one call, read `meta.pagination.count`:
```sh
adapty asa campaigns list --status ENABLED --page-size 1 --json
```

**"New search terms worth adding? Terms to negate?"** — one call, then propose the write and wait
for a yes:
```sh
adapty asa search-terms list --campaign CAMPAIGN_UUID --date-from ... --date-to ...
```

**"Raise/lower bids, pause things" (any mutation)** — read the target first if you don't have its
UUID, preview to the user, apply only after an explicit yes:
```sh
adapty asa keywords update KW_UUID [KW_UUID...] --bid 2.00 --yes
```

**"How do I compare to competitors?"** — one call, expect tens of seconds on a cold cache:
```sh
adapty asa competitors summary --app-ids 1668337467,6503873027
```

## What the failed sessions did wrong (do not repeat)

- Looped `--page 1..4` to build an account total → burned the 5/min budget, hit 429s, gave up.
  Right: one `overview` call, or one `--page-size 1000` page.
- Queried once "to see valid metric names" → the vocabulary is above; a typo'd call already returns
  the full list in its error.
- Added an unrequested previous-period comparison → doubled the calls; the user only asked for now.
- Retried with a guessed `sleep 25` instead of the `Retry-After` value → wasted the retry inside the
  same window and struck the cool-down counter again.
