# Analytics — Charts, Cohorts, Conversions, Funnel, LTV, Retention

The `analytics` topic reads the analytics of one app as the Adapty dashboard shows them: the charts (revenue, MRR,
installs, ...), conversions, the funnel, retention, LTV and install cohorts. It talks to the Developer API with the
same developer token as the rest of the CLI, so one login reads every app the token can access. Every command is
read-only and takes `--app` (the app UUID from `adapty apps list`).

## Commands

| Command | Flags | Notes |
|---|---|---|
| `analytics catalog` | `--app` | What the app's analytics can answer: the six operations with their options (accepted values and defaults), groupings and filter keys, whether each can compare two periods (`can_compare`), every chart with its unit and its own groupings and filters, every conversion id, and every filter dimension. |
| `analytics values` | `--app`, `--dimension` | The values one filter dimension takes for the app: `[{value, label, group}]`. `value` is what `--filter <dimension>=<value>` takes and the `key` of that group in a grouped answer, the "No Data" value included as the API lists it. |
| `analytics chart` | `--app`, `--chart`, `--date-from`, `--date-to` required; `--compare-from`, `--compare-to`, `--group-by`, `--filter` (repeatable), `--granularity` (default `month`), `--revenue-basis` (money charts only), `--timezone`, `--csv` optional | One chart: `data.value` is the number of the whole period, each segment has `value` and its points `values: [{x, value}]`. |
| `analytics conversion` | `--app`, `--conversion`, `--date-from`, `--date-to` required; `--compare-from`, `--compare-to`, `--group-by`, `--filter` (repeatable), `--granularity` (default `day`), `--timezone`, `--csv` optional | One conversion: `value` is the rate in percent, `value_to` of `value_from`. With no conversions in the window, `meta.recommended_period` can name a window that has some. |
| `analytics funnel` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--timezone`, `--csv` optional | The count at each step from install on; `value` is the installs. No compared period. |
| `analytics retention` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--use-trial`, `--timezone`, `--csv` optional | The subscribers left in each period; `value` and `first_value` are the subscribers of the first period. No compared period. |
| `analytics ltv` | `--app`, `--date-from`, `--date-to` required; `--group-by`, `--filter` (repeatable), `--revenue-basis`, `--period-type`, `--renewal-days` (only with `--period-type days`), `--timezone`, `--csv` optional | Revenue per paying user after each renewal or day; a point the cohort has not reached yet is `null`. No compared period. |
| `analytics cohort` | `--app`, `--date-from`, `--date-to` required; `--filter` (repeatable), `--granularity` (the length of one cohort, default `month`), `--revenue-basis`, `--period-type`, `--renewal-days` (only with `--period-type days`), `--timezone`, `--csv` optional | One segment per install cohort, its start date as `key`, with revenue, subscribers, averages and `predict`. No grouping and no compared period. |

## Discovery order

1. `catalog`: pick the operation, the chart or conversion id, a grouping (`--group-by` takes one key of that
   operation, or of that chart for `chart`) and the filter keys.
2. `values`: only when you filter. Get the exact raw values.
3. The data command: one call answers the question.

```sh
adapty analytics catalog --app APP_UUID --json
adapty analytics values --app APP_UUID --dimension country --json
adapty analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --group-by country --json
adapty analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --filter country=US --json
```

The CLI checks what needs no catalog before it sends anything, and exits 2 with the flag's name: the app UUID,
the dates (shape, a real day, the end not before the start), the chart and conversion ids, a compared period with
both ends, `--renewal-days` only with `--period-type days`, `--filter dimension=value[,value]`, and `--csv`
together with `--json`. The API refuses the rest (an unknown grouping, filter key or time zone, `--revenue-basis`
for a chart that is not about money) with exit 4 and an error that names the field.

## The answer

Every data command answers in one shape, so one parser reads all six:

```json
{"data": {"value": 94, "segments": [{"key": null, "title": "Total", "is_total": true, "value": 94, "values": []}]},
 "meta": {"query": {"filters": {"date": ["2026-07-01", "2026-09-30"]}, "timezone": "UTC", "timezone_source": "app"}}}
```

- `data.segments` starts with the total (`is_total` true, `key` null). Each other segment is one group: `key` is
  the raw value that `--filter <grouping>=<key>` takes, `title` the dashboard title, "No Data" included. Use a
  group's `key` as a filter to drill down.
- No rows for the window: `data.segments` is `[]`, and the human view prints `No data for this period.`
- Numbers are the dashboard's numbers. A real zero is `0`. `null` means the backend has no value (an LTV period not
  reached yet, a cohort that cannot be predicted): never count it as 0.
- `meta.query` is the query that ran, every default filled in, with `timezone` and `timezone_source` (`request`
  when `--timezone` was given, else `app`).
- `chart` and `conversion` take a compared period (`--compare-from`, `--compare-to`); `data.compare` then holds its
  own `value` and `segments`, built from that period only. The funnel, retention, LTV and cohort queries cannot keep
  two periods apart, so those commands have no compare flags.

Dates are inclusive days of the query time zone: `--timezone` (an IANA name such as `Europe/Berlin`), else the app
time zone.

## Outputs

- Default: a view for a human. The numbers of the period and its time zone, then one block per segment, total
  first, `---` between blocks, field names as in `--json`. `null` prints as `—`, an empty key (a "No Data" group)
  as `""`.
- `--json`: the API answer unchanged. Read numbers from here.
- `--csv`: a table the CLI makes from that answer. A header line, then one row per segment, total first. Columns:
  `period` (`main` or `compare`; `chart` and `conversion` only, compared rows after the main rows), the segment
  fields (`key`, `title`, `is_total`, `value`, and the operation's own: `value_from` and `value_to`, `first_value`,
  `cohort_size`, the cohort fields and `predict.*`), then one column per point (its `x`, or the step title for the
  funnel and retention) holding the point's `value`. A `null` value is an empty cell; an empty text is `""`. No
  segments: the header line alone.

## Errors and limits

A server refusal exits 4 and prints the API's error code (`--json`: `error.code`). No token exits 3 with the hint
"Not authenticated. Run `adapty auth login`." A 403 (a token without access to the app) also exits 3.

All analytics calls of one app share a rate limit of 2 requests per second. The data commands are sent once and
never retried: a `429` exits 4, and the `--json` error carries the wait as `retry_after_seconds`.
