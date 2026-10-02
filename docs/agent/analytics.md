# Analytics — Dashboard Charts

The `analytics` topic reads the subscription charts of the Adapty dashboard for one app: revenue, MRR, ARR,
ARPPU, ARPU, refunds, subscriptions, trials, grace period, billing issues, non-subscriptions, and installs. Every
command is read-only, takes `--app` (the app UUID from `adapty apps list`), and uses the same login as the rest of
the CLI. The numbers are the dashboard's own: the same calculation backs both.

Ad-network attribution (campaigns, ad sets, spend, ROAS, cohort predictions) belongs to the `attribution` topic,
not this one. Never sum numbers across the two topics.

## Commands

| Command | Flags | Notes |
|---|---|---|
| `analytics charts` | `--app` required | The chart catalog: each `chart_id` with its `title`, `unit` (when the chart has one), whether it takes a `revenue_basis`, and the `segmentations` and `filters` it accepts. It also lists the `period_units` and `revenue_bases`. The catalog is static; read it once per session. |
| `analytics dimensions` | `--app` required | Every dimension with its `title` and whether it can be a `filter` and a `segmentation`. Same answer as `charts`, printed by dimension. |
| `analytics values <dimension>` | `--app` required | The values a filter dimension takes in the app (`value`, `label`, and `group` when the values have a parent, such as countries by region). The `value` is what `chart --filter` takes. |
| `analytics chart <chart-id>` | `--app`, `--date-from`, `--date-to` required; `--granularity` (`day`/`week`/`month`/`quarter`/`year`, default `month`), `--segment-by` (one dimension), `--filter` (repeatable, `dimension=value[,value]`, once per dimension), `--revenue-basis` (`gross`/`proceeds`/`net`, default `gross`, revenue charts only), `--csv` (not with `--json`) optional | One chart over the period: the chart `value`, then `segments`, the total first. Each segment has a `key` (the raw value to filter by; `null` for the total), a `title`, a `value`, and `values`, one per period start. `meta.query` is the query as the server resolved it, with defaults and `timezone`; `meta.definitions` says in plain text what `value` counts. The CLI sends it once and never retries it. |

```sh
adapty analytics charts --app APP_UUID --json
adapty analytics values country --app APP_UUID --json
adapty analytics chart revenue --app APP_UUID --date-from 2026-09-01 --date-to 2026-09-28 --granularity week --segment-by country --filter store=play_store --json
adapty analytics chart installs --app APP_UUID --date-from 2026-01-01 --date-to 2026-09-30 --csv
```

## Rules

- Dates are inclusive days in the app's reporting timezone; `meta.query.timezone` names it. `--granularity day`
  allows at most 366 days.
- One breakdown dimension per chart. A chart accepts only the segmentations and filters its catalog entry
  lists: `installs` and `arpu` take only install filters (country, store, attribution, segment).
- Filter values match case-insensitively (`de` is `DE`, `annual` is `Annual`). Values of one `--filter` match any
  of them; filters on different dimensions combine with AND.
- `--revenue-basis` applies to `revenue`, `mrr`, `arr`, `arppu`, `arpu`, and `refund_money` only; on any other
  chart the server refuses it.
- `null` means the value cannot be computed — never zero. The table prints `—`; `--csv` leaves the field empty.
- Past dates can still change when late store events arrive.

## Errors

The CLI checks only syntax: the app UUID, the dates and their order, `--filter` syntax, and each filter dimension
given once. That exits 2 before any request is sent. Which charts, dimensions, and values exist is the server's
knowledge: an unknown name, a segmentation or filter the chart does not accept, or a bad value is a
`400 validation_error` that names the field and lists the allowed values, and exits 4. A 401 exits 3, an unknown
app is a 404 (exit 4), and an unreachable server exits 5.

A `429` carries `retry_after_seconds` in the `--json` error. `chart` is never retried: wait at least that long, run
it once more, and do not loop. `charts`, `dimensions`, and `values` are retried automatically.
