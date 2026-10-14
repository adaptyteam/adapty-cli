# Analytics — Charts, Cohorts, Conversions, Funnel, LTV, Retention

The `analytics` topic reads the analytics of one app as the Adapty dashboard shows them: the charts (revenue, MRR,
installs, ...), conversions, the funnel, retention, LTV and install cohorts. It talks to the Developer API with the
same developer token as the rest of the CLI, so one login reads every app the token can access. Every command is
read-only and takes `--app` (the app UUID from `adapty apps list`).

Ad-network attribution (campaigns, ad sets, spend, ROAS) belongs to the `attribution` topic, not this one. Never
add `analytics` numbers to `attribution` numbers: they come from different calculations.

## Commands

| Command | Flags | Notes |
|---|---|---|
| `analytics catalog` | `--app` | What the app's analytics can answer: the six operations with their options (accepted values and defaults), groupings and filter keys, whether each can compare two periods (`can_compare`), every chart with its unit and its own groupings and filters, every conversion id, and every filter dimension. |
| `analytics values` | `--app`, `--dimension` | The values one filter dimension takes for the app: `[{value, label, group}]`. `value` is what `--filter <dimension>=<value>` takes, exactly as the API lists it (the human view shows an empty value as `""`; `--filter <dimension>=` sends it). |
| `analytics chart` | `--app`, `--chart`, `--date-from`, `--date-to` required; `--compare-from`, `--compare-to`, `--group-by`, `--filter` (repeatable), `--granularity` (default `month`), `--revenue-basis` (money charts only), `--timezone`, `--csv` optional | One chart: `data.value` is the number of the whole period, each segment has `value` and its points `values: [{x, value}]`. |
| `analytics conversion` | `--app`, `--conversion`, `--date-from`, `--date-to` required; `--compare-from`, `--compare-to`, `--group-by`, `--filter` (repeatable), `--granularity` (default `day`), `--timezone`, `--csv` optional | One conversion: `value` is the rate in percent, `value_to` of `value_from`. With no conversions in the window, `meta.recommended_period` can name a window that has some. |
| `analytics funnel` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--timezone`, `--csv` optional | The count at each step from install on; `value` is the installs. No compared period. |
| `analytics retention` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--use-trial`, `--timezone`, `--csv` optional | The subscribers left in each period; `value` and `first_value` are the subscribers of the first period. No compared period. |
| `analytics ltv` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--revenue-basis`, `--period-type`, `--renewal-days` (only with `--period-type days`), `--timezone`, `--csv` optional | Revenue per paying user after each renewal or day; a point the cohort has not reached yet is `null`. No compared period. |
| `analytics cohort` | `--app`, `--date-from`, `--date-to` required; `--filter` (repeatable), `--granularity` (the length of one cohort, default `month`), `--revenue-basis`, `--period-type`, `--renewal-days` (only with `--period-type days`), `--timezone`, `--csv` optional | One segment per install cohort, its start date as `key`, with revenue, subscribers, averages and `predict`. No grouping and no compared period. |

## Discovery order

1. `catalog`: pick the operation, the chart or conversion id, a grouping (`--group-by` takes one key of that
   operation, or of that chart for `chart`) and the filter keys.
2. `values`: only when you filter. Get the exact values that `--filter` takes.
3. The data command: one call answers the question.

```sh
adapty analytics catalog --app APP_UUID --json
adapty analytics values --app APP_UUID --dimension country --json
adapty analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --group-by country --json
adapty analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --filter country=US --json
```

### Filters

`--filter dimension=value[,value]` sends each value exactly as written, spaces included; an empty value is a value.
A comma inside a value is written `\,`. Two `--filter` of one dimension become one list. Take the values from
`values`, not from the group keys of an answer: a group key is the raw backend value and is not always a value that
a filter takes.

The CLI checks what needs no catalog before it sends anything, and exits 2 with the flag's name: the app UUID,
the dates (shape, a real day, the end not before the start), a compared period with both ends, `--renewal-days`
only with `--period-type days` and only whole days in ascending order, each day once, a `--filter` without `=`, and
`--csv` together with `--json`. Which names exist is the server's knowledge: the API refuses an unknown chart,
conversion, grouping, filter key or time zone, and `--revenue-basis` on a chart that is not about money, with exit 4
and an error that names the field. `adapty analytics catalog --app <app>` lists the valid names.

## The answer

Every data command answers in one shape, so one parser reads all six:

```json
{"data": {"value": 94, "segments": [{"key": null, "title": "Total", "is_total": true, "value": 94, "values": []}]},
 "meta": {"query": {"filters": {"date": ["2026-07-01", "2026-09-30"]}, "timezone": "UTC", "timezone_source": "app"}}}
```

- `data.segments` starts with the total (`is_total` true, `key` null). Each other segment is one group: `key` is
  the raw value that the backend gives for that group, `title` the dashboard title, "No Data" included. Any key is
  possible: a "No Data" group can have `null`, `""` or `"None"` as `key`. Tell the total from a group by
  `is_total` only, never by a null `key`. A `key` is not promised to be a `--filter` value. A funnel group `key` is
  its title and can repeat, so two groups can have the same `key`; every group stays a row of its own. Examples of raw
  keys: `null`, `""`, `"None"`, `"00000000-0000-0000-0000-000000000000"` (the zero UUID) and a title such as `"Pro annual"`.
- No rows for the window: `data.segments` is `[]`, and the human view prints `No data for this period.`
- Numbers are the dashboard's numbers. A real zero is `0`. `null` means the backend has no value (an LTV period not
  reached yet, a cohort that cannot be predicted): never count it as 0.
- Two known differences from the dashboard. The funnel applies the `cancellation_reason` filter, which the
  dashboard funnel ignores, so with that filter the number can differ from the dashboard. The retention groupings are
  the backend's retention list, which differs from the dashboard's list.
- `meta.query` is the query that ran: every field of the operation with its default, the filters as sent,
  `timezone` and `timezone_source` (`request` when `--timezone` was given, else `app`).
- Some fields are objects: a cohort gives `revenue`, `arpu`, `arppu` and `arpas` on each basis
  (`{gross, proceeds, net}`) and `predict` per basis; a funnel step gives `following_changes`, `churn_reasons` and
  `parts`.
- `chart` and `conversion` take a compared period (`--compare-from`, `--compare-to`); `data.compare` then holds its
  own `value` and `segments`, built from that period only. The funnel, retention, LTV and cohort queries cannot keep
  two periods apart, so those commands have no compare flags.

Dates are inclusive days of the query time zone: `--timezone` (an IANA name such as `Europe/Berlin`), else the app
time zone.

## Outputs

- Default: a short table for a human. A heading: what the answer is (`Chart revenue, gross, by country`), then
  the period, the length of one point, the time zone and where it comes from, and the filters. Then one row per
  group, the total first, named by its title (the `key` is in `--json` and `--csv`); the
  main numbers of the group; one column per point (a date, a funnel step or retention period with its title such
  as `-2 Install`, an LTV or cohort renewal or day). Money (a money chart, LTV, cohort revenue) has 2 decimals;
  other numbers print as the API gives them; `null` prints as `—`. A compared period has its own table under
  `Compared period: <from> – <to>`. The main numbers per command:
  - `chart`: `Total` (the group's `value`), then the value of each point.
  - `conversion`: `Conversion %`, `From`, `To`, then the rate of each point.
  - `funnel`: `Installs`, then the count of each step.
  - `retention`: `Subscribers` (the first period), then the count of each period.
  - `ltv`: `LTV`, `Cohort size`, then the LTV after each renewal or day.
  - `cohort`: `Revenue` (on the asked basis), `Installs`, `Subscribers`, then the revenue of each period.

  Where the table leaves fields out (conversion counts per point, funnel shares and churn reasons, retention
  shares, cohort money on each basis and predictions), one line under it says that `--json` and `--csv` give
  every field. No segments: `No data for this period.`, then the summary of the period, every field of `data`
  besides the segments and of `meta` (the resolved query, a conversion's `recommended_period`), null as `—`.
- `--json`: the API answer unchanged. Read numbers from here.
- `--csv`: a table the CLI makes from that answer, one row per group and the total first. It reads its fields from
  the answer itself, so it has every field the API gives, a field the API adds later included. A nested field has a
  dotted name (`revenue.gross`, `following_changes.value`), a list item its index (`churn_reasons[0].value`); an
  empty list has no field. A group is the total or
  one key: a group that has a segment in the asked period, in the compared one, or in both is one row. Columns:
  - `key`, `title`, `is_total`. The total has `is_total` `true` and an empty `key` cell. A group's raw key is
    written as the API gives it: `null` is an empty cell too, `""` is written `""`. Tell the total from a group by
    `is_total` only.
  - The numbers of the group in the asked period (`value`, and the operation's own fields), then for each point its
    `value` in a column named by its `x`, and its other fields in columns `<x>.<field>`: the same names for every
    segment. A funnel step or a retention period has its title in `<x>.title` (the title can differ between
    groups), for example `-2`, `-2.title`, `-2.relative_changes`, `1.revenue.net`.
  - The same for the compared period, under `compare.` (`compare.value`, `compare.2026-06-01`), on the same row. A
    group that has no segment in one period has empty cells there.
  - Every other field of the answer under its JSON path, the same on every row: `data.value` (and a conversion's
    `data.value_from`, `data.value_to`), `data.compare.value` (or an empty `data.compare` without a compared
    period), every field of `meta.query` (`meta.query.timezone`, `meta.query.timezone_source`,
    `meta.query.filters.date[0]`, `meta.query.revenue_basis`, ...), `meta.recommended_period...`.

  A `null` value is an empty cell. No groups: stdout has the header line only. Whenever the asked period has no
  groups, stderr has `No data for this period.` and the summary of each period, as the human view shows it under
  its heading.

## Errors and limits

A server refusal exits 4 and prints the API's error code (`--json`: `error.code`). A success that is not the API
envelope (a proxy page) exits 4 with `malformed_response`, and nothing is printed. No token exits 3 with the hint
"Not authenticated. Run `adapty auth login`." A 403 (a token without access to the app) also exits 3.

Each analytics route has its own rate limits, as the Export API: 2 requests per second per app and 360 per minute
for all callers together. The data commands are sent once and never retried: over a limit, a `429` exits 4, and the
`--json` error carries the wait as `retry_after_seconds`.
