# Analytics — Charts, Cohorts, Conversions, Funnel, LTV, Retention

The `analytics` topic reads the analytics of one app as the Adapty dashboard shows them: the charts (revenue, MRR,
installs, ...), conversions, the funnel, retention, LTV and install cohorts. It talks to the Developer API with the
same developer token as the rest of the CLI, so one login reads every app the token can access. Every command is
read-only and takes `--app` (the app UUID from `adapty apps list`).

## Commands

| Command | Flags | Notes |
|---|---|---|
| `analytics catalog` | `--app` | What the app's analytics can answer: the six operations with their options (accepted values and defaults), groupings and filter keys, whether each can compare two periods (`can_compare`), every chart with its unit and its own groupings and filters, every conversion id, and every filter dimension. |
| `analytics values` | `--app`, `--dimension` | The values one filter dimension takes for the app: `[{value, label, group}]`. `value` is what `--filter <dimension>=<value>` takes and the `key` of that group in a grouped answer, the "No Data" value included as the API lists it (the human view shows an empty value as `""`; `--filter <dimension>=` sends it). See [Drill down into a group](#drill-down-into-a-group). |
| `analytics chart` | `--app`, `--chart`, `--date-from`, `--date-to` required; `--compare-from`, `--compare-to`, `--group-by`, `--filter` (repeatable), `--granularity` (default `month`), `--revenue-basis` (money charts only), `--timezone`, `--csv` optional | One chart: `data.value` is the number of the whole period, each segment has `value` and its points `values: [{x, value}]`. |
| `analytics conversion` | `--app`, `--conversion`, `--date-from`, `--date-to` required; `--compare-from`, `--compare-to`, `--group-by`, `--filter` (repeatable), `--granularity` (default `day`), `--timezone`, `--csv` optional | One conversion: `value` is the rate in percent, `value_to` of `value_from`. With no conversions in the window, `meta.recommended_period` can name a window that has some. |
| `analytics funnel` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--timezone`, `--csv` optional | The count at each step from install on; `value` is the installs. No compared period. |
| `analytics retention` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--use-trial`, `--timezone`, `--csv` optional | The subscribers left in each period; `value` and `first_value` are the subscribers of the first period. No compared period. |
| `analytics ltv` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--revenue-basis`, `--period-type`, `--renewal-days` (only with `--period-type days`), `--timezone`, `--csv` optional | Revenue per paying user after each renewal or day; a point the cohort has not reached yet is `null`. No compared period. |
| `analytics cohort` | `--app`, `--date-from`, `--date-to` required; `--filter` (repeatable), `--granularity` (the length of one cohort, default `month`), `--revenue-basis`, `--period-type`, `--renewal-days` (only with `--period-type days`), `--timezone`, `--csv` optional | One segment per install cohort, its start date as `key`, with revenue, subscribers, averages and `predict`. No grouping and no compared period. |

## Discovery order

1. `catalog`: pick the operation, the chart or conversion id, a grouping (`--group-by` takes one key of that
   operation, or of that chart for `chart`) and the filter keys. Each grouping names its `filter`: the filter key
   that takes the keys of its groups there. `null` means no drill-down.
2. `values`: only when you filter. Get the exact raw values.
3. The data command: one call answers the question.

```sh
adapty analytics catalog --app APP_UUID --json
adapty analytics values --app APP_UUID --dimension country --json
adapty analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --group-by country --json
adapty analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --filter country=US --json
```

### Drill down into a group

Use the grouping's `filter` from the catalog of that operation (of that chart, for `chart`) and the group's `key`
from the answer: `--filter <filter>=<key>` answers with that group's number. `null` means no drill-down. The filter
is not always the grouping's own name: a `period` group goes to `renewal_period`, whose key `7` is "Renewals 6+"
(the seventh period and later).

The "No Data" group has as `key` the value that its filter takes, as `values` lists it:

- the zero UUID for an id grouping (`paywall_id`, `audience_id`, `placement_id`, `flow_id`, `segment_id`):
  `--filter paywall_id=00000000-0000-0000-0000-000000000000`;
- `no_offer` for `offer_type` and `offer_category`;
- `Uncategorized` for `duration`;
- `""` for the other text groupings (`country`, `store`, the attribution groupings, `offer_id`): `--filter country=`.

The "No Data" group of `store_product_id`, `flow_screen_id` and `period` cannot be selected by a filter: those
filters take only typed values. A product key has the form `<store>:<product id>` and can be a list
(`<store>:<product id>,<store>:<product id>`); a pair filter (`store_product_id`, `flow_screen_id`) takes every
form that `values` lists.

`--filter dimension=value[,value]` sends each value exactly as written, spaces included; an empty value is a value.
A comma inside a value is written `\,` (a product key that is a list, for example). Two `--filter` of one dimension
become one list.

The CLI checks what needs no catalog before it sends anything, and exits 2 with the flag's name: the app UUID,
the dates (shape, a real day, the end not before the start), the chart and conversion ids, a compared period with
both ends, `--revenue-basis` only with a money chart (`revenue`, `mrr`, `arr`, `arppu`, `arpu`, `refund_money`,
`billing_issue_converted_revenue`, `grace_period_converted_revenue`), `--renewal-days` only with
`--period-type days` and only whole days in ascending order, each day once, a `--filter` without `=`, and `--csv`
together with `--json`. The API refuses the rest (an
unknown grouping, filter key or time zone) with exit 4 and an error that names the field.

## The answer

Every data command answers in one shape, so one parser reads all six:

```json
{"data": {"value": 94, "segments": [{"key": null, "title": "Total", "is_total": true, "value": 94, "values": []}]},
 "meta": {"query": {"filters": {"date": ["2026-07-01", "2026-09-30"]}, "timezone": "UTC", "timezone_source": "app"}}}
```

- `data.segments` starts with the total (`is_total` true, `key` null: the only null key). Each other segment is
  one group: `key` is the raw value that the grouping's filter takes, `title` the dashboard title, "No Data"
  included (its key: see [Drill down into a group](#drill-down-into-a-group)).
- No rows for the window: `data.segments` is `[]`, and the human view prints `No data for this period.`
- Numbers are the dashboard's numbers. A real zero is `0`. `null` means the backend has no value (an LTV period not
  reached yet, a cohort that cannot be predicted): never count it as 0.
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

The human view and the CSV read their fields from the answer itself, so they show every field the API gives, a
field the API adds later included. A nested field has a dotted name (`revenue.gross`, `following_changes.value`), a
list item its index (`churn_reasons[0].value`); an empty list has no field.

- Default: a view for a human. The summary of the asked period, then one block per segment, total first, `---`
  between blocks, field names as in `--json`. Each point is one line: its `x` (with the title of a funnel step or a
  retention period, the number once: `-2 Install`, `1 Paid`, `2 Period`), its `value`, then its other fields in
  parentheses. `null` prints as
  `—`, an empty text (a "No Data" key) as `""`. The summary is every field of `data` besides the segments, every
  field of `meta.query` (the resolved query: time zone, filters, defaults such as `period_unit`, `revenue_basis`,
  `renewal_days`), and every other field of `meta` (a conversion's `recommended_period`). No segments: `No data for this
  period.`, then that summary. A compared period follows under its own heading.
- `--json`: the API answer unchanged. Read numbers from here.
- `--csv`: a table the CLI makes from that answer, one row per group and the total first. A group is the total or
  one key: a group that has a segment in the asked period, in the compared one, or in both is one row. Columns:
  - `key`, `title`, `is_total`. The total has `is_total` `true` and an empty `key` cell; the "No Data" key `""` is
    written `""`, so tell the two apart by `is_total`.
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
  groups, stderr has `No data for this period.` and the summary of each period, as the human view shows it.

## Errors and limits

A server refusal exits 4 and prints the API's error code (`--json`: `error.code`). A success that is not the API
envelope (a proxy page) exits 4 with `malformed_response`, and nothing is printed. No token exits 3 with the hint
"Not authenticated. Run `adapty auth login`." A 403 (a token without access to the app) also exits 3.

All analytics calls of one app share a rate limit of 2 requests per second. The data commands are sent once and
never retried: a `429` exits 4, and the `--json` error carries the wait as `retry_after_seconds`.
