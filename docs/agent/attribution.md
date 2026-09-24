# UA Attribution — Reports and Metrics

The `attribution` topic reads the UA dashboard's own numbers for one app: spend, installs, revenue, ROAS,
cohort values, and predictions across every connected ad network. Every command is read-only and uses the
same login as the rest of the CLI. There is no separate credential.

`report` and `values` take `--app` (the app UUID from `adapty apps list`) and a day range. `metrics` and
`dimensions` take neither, because the vocabulary is the same for every app. A company without UA analytics
access gets `402 attribution_access_required` from `report` and `values`, never an empty result. The two
catalogs answer without that access, so a working `metrics` call proves the login, not the access.

Apple-reported campaign data belongs to the `asa` topic, not this one. Which topic answers which question is in
[Crosswalk with `asa metrics`](#crosswalk-with-asa-metrics).

## Commands

| Command | Flags | Notes |
|---|---|---|
| `attribution metrics` | none besides `--json` | The metric catalog: every name `report` accepts, each with `unit`, `label`, `description`, `family`, `pattern` (a `d{N}_…` name template, with an `example`), `denominator` (the metrics a ratio divides by), `spend_based`, and `additive`. It also returns `limits`, the report caps as numbers (see [Caps](#caps)). Not scoped to an app. |
| `attribution dimensions` | none besides `--json` | What `--group-by` and `--filter` accept: `groupable`, `filterable`, the `granularities` of `date`, and `identity`. `identity: id` marks campaign, ad set, and ad, which filter by id; `identity: value` marks the rest. Not scoped to an app. |
| `attribution values` | `--app`, `--date-from`, `--date-to`, `--dimension` required; `--revenue-basis` (`gross`/`proceeds`/`net`) optional | The values one filterable dimension takes for the app over the period, which are exactly what `report --filter` accepts. An `id` dimension returns `{id, name, channel}` items and the rest return `{value}` items. It runs an analytics query, so the CLI sends it once and never retries it. |
| `attribution report` | `--app`, `--date-from`, `--date-to`, `--metrics` (repeatable or comma-separated, max 25), `--group-by` (repeatable or comma-separated) required; `--granularity` (`day`/`week`/`month`/`quarter`/`year`, required with `--group-by date` and allowed only with it), `--filter` (repeatable, `dimension=value[,value]`, one per dimension), `--revenue-basis` (`gross`/`proceeds`/`net`, default `gross`), `--sort` (`field:asc` or `field:desc`, ascending when the suffix is left out) optional | Rows for every combination of the `--group-by` dimensions, plus `totals`, in one call. Rows come already sorted by `--sort`, with nulls last. `meta.query` echoes the query as the service resolved it (timezone, `currency`, revenue basis). Read a total from `totals`: ratios and unique counts do not add up across rows. The CLI sends it once and never retries it. |

Dates are inclusive days in the app's reporting timezone. The CLI has no timezone override, and no command reports
the timezone on its own: it appears only as `meta.query.timezone` in a `report` or `values` answer. The cheapest
call that reveals it is a one-day `values` query, read for `meta.query.timezone`:

```sh
adapty attribution values --app APP_UUID --date-from 2026-08-31 --date-to 2026-08-31 --dimension channel --json
```

`--group-by` takes `date`, `campaign`, `adset`, `ad`, `keyword`, `channel`, `country`, and `store`, and at least
one is required. Grouping by `date` requires `--granularity`, and `--granularity` is allowed only then; the CLI
refuses either mistake before sending anything. Each `date` key is the ISO start day of its bucket, so a week row
is keyed by the first day of that week. Duplicate metrics or groupings are dropped in first-seen order.

## Discovery order

Build a report from the catalog, in this order:

1. `metrics`: pick metric names, and check each one's unit.
2. `dimensions`: pick the groupings, and see which dimensions filter by id.
3. `values`: only when you filter. Get the exact ids or values for the period.
4. `report`: the single call that answers the question.

```sh
adapty attribution metrics --json
adapty attribution dimensions --json
adapty attribution values --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --dimension campaign --json
adapty attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend,installs,cpi,d7_roas --group-by campaign --sort spend:desc --json
```

The catalogs are the same for every app and change only with a service release. Read them once per session, not
before every report.

Never guess a name. An unknown metric fails the whole report with `422 attribution_unknown_metric`, which names
every invalid metric. Nothing partial comes back, so one bad name costs the whole query. An unknown dimension or
a filter value the dimension does not allow fails with `422 attribution_validation_error`. Take names from
the catalog rather than probing for them.

The service owns the vocabulary. The CLI checks only syntax (the app UUID, the dates, non-empty lists), so a name
the catalog lists works even when this CLI version predates it. This file describes the families with examples.
It is not the full list; the catalog is.

## Metric vocabulary

Metric names are the UA dashboard's own names.

**Base metrics:** `spend`, `impressions`, `clicks`, `clicks_attributed`, `inline_link_clicks`, `cpc`, `cpm`,
`ctr`, `cost_per_inline_link_click`, `inline_link_click_ctr`, `installs`, `total_revenue`, `payers`, `cpi`,
`arpu`, `arpt`, `arpas`, `roas`, `ad_profit`, `icr`, `icr_attributed`, `ipm`, `cost_per_trial`,
`cost_per_subscription`.

**Event metrics:** `count_<event>` and `rate_<event>`, for each of the 21 subscription events the catalog lists.
Examples are `count_trial_started`, `count_trial_converted`, `count_subscription_started`, and
`rate_trial_converted`. The event list is closed, so an event name outside the catalog is refused.

**Cohort metrics:** `d{N}_revenue`, `d{N}_roas`, `d{N}_arpu`, `d{N}_arppu`, `d{N}_arpt`, `d{N}_arpas`,
`d{N}_ad_profit`, `d{N}_payers`, `d{N}_uniq_paying_users`, `d{N}_paying_users_revenue`, `d{N}_count_<event>`,
and `d{N}_rate_<event>`. N is any whole number of days from 0, written without leading zeros: `d0_revenue`,
`d7_roas`, and `d365_arpu` are valid, while `d07_roas` is refused. The value is what the install cohort has
actually realized by day N, not a projection. See [Cohort windows and young cohorts](#cohort-windows-and-young-cohorts).

**Predictions:** `d{N}_predict_revenue`, `d{N}_predict_roas`, `d{N}_predict_ad_profit`, `d{N}_predict_arpu`,
and `d{N}_predict_arppu`, with N at most 365. They are ordinary catalog metrics with a stricter query shape.
See [Predictions](#predictions).

There is no `ltv` metric. Lifetime value is `d{N}_revenue` or `d{N}_arpu` at a horizon, or the prediction of
either.

### Units

Each catalog entry carries a `unit`:

- `usd`: money is always in US dollars, whatever currency the ad account uses. `meta.query` carries the currency.
- `count`: a plain count.
- `percent`: a value on a 0–100 scale. A `roas` of 150 means 150%, and a `ctr` of 1.2 means 1.2%. Never
  multiply these by 100 again.
- `per_mille`: a value per 1,000. An `ipm` of 8 means 8 installs per 1,000 impressions.

### Revenue basis

Every revenue-based metric follows `--revenue-basis`. That includes `roas`, `arpu`, `ad_profit`, and their
`d{N}_` and prediction forms. The choices are:

- `gross`: the default, and the UA dashboard's default.
- `proceeds`: after store commission.
- `net`: after store commission and taxes.

`meta.query` always echoes the basis in effect. Leave the default when the numbers must match the dashboard,
and name the basis whenever you quote a revenue figure.

## `null` means not computable

In `--json` output, `null` means the value cannot be computed — never zero. A real zero is `0`, and the table
view prints a non-computable value as `—`. Never count a `null` as 0 when you sum, average, or rank. Leave it
out and say why it is missing. A value is `null` when:

- **A ratio has nothing to divide by.** The catalog's `denominator` names what a ratio divides by. For
  example, `arpas` divides by `count_subscription_started` plus `count_trial_started`. When that sum is zero,
  or a denominator metric is missing, the ratio is `null`. So `cpi` with no installs is `null`, not 0.
- **A prediction is missing.** A day whose prediction is absent is `null`. The `totals` prediction is `null`
  unless every row carries one.
- **The channel has no ad-spend source.** Every `spend_based: true` metric in the catalog reads ad-network data:
  `spend`, `impressions`, network `clicks`, `inline_link_clicks`, and the metrics computed from them, such as
  `cpi`, `cpm`, `ctr`, `roas`, `ad_profit`, and `cost_per_trial`, in their `d{N}_` and prediction forms too.
  `clicks_attributed` and `icr_attributed` come from UA's own click tracking and stay numbers.
  UA collects spend for `facebook`, `tiktok`, and `google` only. A paid channel outside that list has no ad-spend
  source in UA; today that is `apple_search_ads`, whose spend comes from the `asa` topic. Spend-based metrics are:
  - `null` on every row whose channel has no ad-spend source;
  - `null` on every row and in `totals` when the report's `channel` filter lists only such channels;
  - in `totals`, once any row is spend-unknown, `null` for the spend-based ratios and for the profit metrics
    (`ad_profit`, `d{N}_ad_profit`, `d{N}_predict_ad_profit`), while the pure ad-network sums (`spend`,
    `impressions`, `clicks`, `inline_link_clicks`) still add up the rows that have a spend source, and are `null`
    when no row has one;
  - with a mixed `channel` filter, or none, not split by spend source inside a row that mixes channels, so such a
    row counts spend from `facebook`, `tiktok`, and `google` only.

  Never paste `asa` spend into these rows.
- **An entity id is absent.** Rows without a campaign, ad set, or ad have `null` in both the `*_id` and the
  `*_name` field. See [Grouping and filtering](#grouping-and-filtering).

**The prediction model can fail silently.** When the prediction model or its queries fail, the report still
succeeds, and the predictions come back `null`. A column of `null` predictions therefore can mean "the model
did not run", not only "too little data". Do not read it as zero value. Report the realized `d{N}_` metric,
say the prediction is unavailable, and try again later.

## Cohort windows and young cohorts

A `d{N}_` metric counts the users who installed during the period, and what they did within N days of
installing. A cohort that has not lived N days yet reports only what it has done so far, so a young cohort looks
worse than it will be.

The youngest cohort in the period has lived the days from `--date-to` to today, in the app timezone
(`meta.query.timezone`); for a period that ends today that is 0. Treat any `d{N}` with N above that age as not
reached:

- Compare periods, campaigns, or countries only at a horizon all of them have reached.
- Do not divide a clipped cohort value by a full-horizon value, such as `d90_revenue` of a young cohort against
  a mature cohort's `d90_revenue`.
- Days earlier in the period are older by their distance from `--date-to`. The check covers the period, not each
  row.

The report does not flag these metrics: compare each requested horizon with the youngest cohort's age yourself.

## Predictions

A prediction metric (`d{N}_predict_…`) needs `--group-by date --granularity day`, and allows at most 2 other
`--group-by` dimensions. N is at most 365, and one report takes at most 4 distinct prediction horizons.
Anything else fails with `422 attribution_query_too_large`, which names what to change.

A day row is a single install cohort, so each prediction is either present or `null`. That is why predictions
need day grain. Because day grain caps the window at 31 days, a longer prediction series takes one call per
month-long window.

```sh
adapty attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend,d7_revenue,d180_predict_revenue,d180_predict_roas --group-by date --granularity day --json
```

## Grouping and filtering

Rows grouped by `campaign`, `adset`, or `ad` carry `<dimension>_id`, `<dimension>_name`, and `channel`, such as
`campaign_id`, `campaign_name`, and `channel`.

Campaign, ad set, and ad filters take ids, never names. Get the ids from `values` with `--dimension campaign`
(or `adset`, or `ad`) and pass them as `--filter campaign=<id>`. A name is not a filter value: names change, and
two campaigns on different networks can share one.

The name shown is the latest name the entity had within the requested period. A campaign renamed between two
periods therefore shows different names in the two reports. Always match entities across periods by id, never
by name.

Rows without a campaign, ad set, or ad id hold organic and store-referrer traffic. Their `*_id` and `*_name` are
`null`, and they split into one row per `channel`. No id filter can select them. Tell them apart by their
`channel` in the output. The same traffic shows up in `values` as items with `id: null`, which are not filter
values.

Filter values are checked per dimension:

- `channel` and `store` take the values `values` returns.
- `country` takes ISO 3166 alpha-2 codes in upper case, such as `US` or `GB`.
- `keyword` takes free text.

Pass one `--filter` per dimension, with every value for that dimension in it. One value matches exactly, and
several comma-separated values match any of them. Write `\,` for a comma inside a value. A second `--filter` on
the same dimension is refused with `422 attribution_validation_error`. Filters on different dimensions combine
with AND, so each one narrows the result further.

`--sort` takes one of the requested metrics or `--group-by` dimensions, never another metric. Rows with a `null`
in the sort field come last whatever the direction.

```sh
adapty attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend,installs,d7_roas --group-by date,campaign --granularity week --filter campaign=CAMPAIGN_ID --filter country=US,GB --sort d7_roas:desc --json
```

## Caps

The finest date grouping sets the widest window a report may cover:

| Grouping | Max window |
|---|---|
| `--granularity day` | 31 days |
| `--granularity week` | 180 days |
| `--granularity month`, `quarter`, or `year` | 366 days |
| no `date` grouping | 92 days |

A window too wide for its grouping is fixed by coarsening `--granularity`, never by splitting the request into
more calls. A year of data is one call at `--granularity month`, not twelve month-long day-grain calls.

A report is also refused, with `422 attribution_query_too_large`, when:

- it would return more than 10,000 rows;
- it asks for more than 4 distinct prediction horizons, or a prediction horizon above 365.

The refusal names what to coarsen. For rows, coarsen the date grouping first. Then drop the widest grouping
(`keyword` or `ad`), filter to the campaigns in question, or shorten the window. Retrying the same request is
pointless.

More than 25 distinct metrics, more than 100 values in one filter, or a `keyword` value over 256 characters is
refused with `422 attribution_validation_error` instead. Ask for fewer metrics or values; coarsening does not help.

`attribution metrics` also returns these caps as numbers in `data.limits`: `max_metrics`, `max_filter_values`,
`max_keyword_length`, `max_rows`, `max_prediction_horizons`, `max_prediction_day`,
`max_prediction_non_date_dimensions`, and `max_window_days` (one entry per granularity, plus `no_date_grouping`).
Size a request from them rather than from the numbers written here.

The service runs only a few queries per company at a time. Run `report` and `values` calls one after another,
never in parallel.

## Errors, exit codes, and retries

A rejected request exits 4. Under `--json`, the error carries the service's `error_code` and the HTTP `status`.
Input the CLI can reject by itself (a malformed UUID or date, `--granularity` without `--group-by date`, or
`--group-by date` without `--granularity`) exits 2 before any request is sent. A 401 exits 3, and an unreachable
service exits 5. A success that is not the service's JSON answer, such as a proxy's error page, exits 4 with
`malformed_response`: nothing was read.

| Code | HTTP | Meaning | What to do |
|---|---|---|---|
| `attribution_token_invalid` | 401 | The token is missing, expired, or not a developer token. The CLI reports it as `auth_required` and exits 3. | Log in again with `adapty auth login`, once. |
| `attribution_access_required` | 402 | The company has no UA analytics access. | Stop and tell the user. Logging in again does not help. |
| `attribution_app_not_found` | 404 | The app is unknown, belongs to another company, is not set up for UA, or your Adapty user has no access to it (a member can be limited to some of the company's apps). | Check the UUID with `adapty apps list`, which lists only the apps you can read. Do not retry. |
| `attribution_unknown_metric` | 422 | One or more metric names are not in the catalog. The message names each one. | Fix the names from `attribution metrics`. |
| `attribution_validation_error` | 422 | A dimension, filter, filter value, sort field, or date range is not accepted, or the report names more than 25 metrics. | Fix the request from the message. |
| `attribution_query_too_large` | 422 | A window, row, or prediction cap was exceeded, or predictions were asked for without day grain. | Coarsen as the message says. See [Caps](#caps). |
| `attribution_busy` | 429 | The company already has as many queries running as it may. | Wait `retry_after_seconds`, then run the query once more. |
| `attribution_upstream_unavailable` | 503 | The Adapty service that verifies the token is unreachable. Nothing ran. | Wait `retry_after_seconds`. If it persists, say the dependency is down. |
| `attribution_query_unavailable` | 503 | The analytics query failed or ran past its time limit. | Wait `retry_after_seconds`. If it repeats, make the query smaller. |

Never retry an access error. After a 402, a 404, or a 401 that survives one fresh login, the same call fails
the same way, so tell the user instead of looping.

`report` and `values` are sent once and never retried by the CLI. On a 429 or a 503, the `--json` error carries
`retry_after_seconds`: the service's `Retry-After`, in whole seconds. Read it from the error, wait at least that
long before running the same query again, run it once, and do not loop. The field is absent when the service
sent no `Retry-After`. The catalog commands are
retried automatically on 429 and 5xx, so a failure that reaches you from `metrics` or `dimensions` has already
been retried.

## Crosswalk with `asa metrics`

The two topics keep their own vocabularies. Some concepts overlap under different names, and some names
look the same while meaning different things.

**Routing rule:**

- Apple-reported ad data comes from `asa`. That covers Apple Search Ads spend, taps, impressions, and keywords
  as Apple counts them, in the campaign group currency.
- Cross-network UA, predictions, and parity with the UA dashboard come from `attribution`.
- Never add, subtract, or merge numbers across the two topics. Where both topics can answer a question, pick
  one and say which.

| `asa` name | `attribution` name | Difference |
|---|---|---|
| `adapty_installs` | `installs` | Same concept, different names. |
| `trials_started` | `count_trial_started` | Same concept, different names. |
| `trials_converted` | `count_trial_converted` | Same concept, different names. |
| `subscriptions_started` | `count_subscription_started` | Same concept, different names. |
| `spend` | `spend` | Same name, different data. `asa` spend is Apple-reported, in the campaign group currency. `attribution` spend is USD from the UA spend sources, and `null` on Apple Search Ads rows. |
| `roas` | `roas`, `d{N}_roas` | Same name, different rules. `asa` expands `roas` into `gross_`, `proceeds_`, and `net_` variants read at `--by-days` windows. `attribution` takes the basis from `--revenue-basis`, on a 0–100 percent scale, with cohort horizons as `d{N}_roas`. |
| `ipm` | `ipm` | Same name, different counts. `asa` divides Apple-reported installs, while `attribution` divides UA-attributed installs, per 1,000 impressions. |
| `cost_per_trial` | `cost_per_trial` | Same name, different spend. `asa` divides Apple spend in the group currency, while `attribution` divides UA spend in USD. It is `null` on Apple Search Ads rows. |
