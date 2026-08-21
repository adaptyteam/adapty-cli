import {Command, Flags} from '@oclif/core'

import {asaWrite, createAsaClient} from '../../../lib/asa-client.js'
import {ASA_GROUP_BY_DIMENSIONS, ASA_METRIC_ENTITIES, asaPaginationFlags, byDaysFlag, MAX_BY_DAYS} from '../../../lib/asa-flags.js'
import {type PaginatedResponse, paginationParams} from '../../../lib/flags.js'
import {printList} from '../../../lib/output.js'

export default class AsaMetrics extends Command {
  static description = `Query metrics for any level of the account over a date range

One row per entity, already aggregated server-side and sorted by --order-by, so a top-N question is one
call with --order-by and --page-size N — never sum pages yourself. Account-level totals are one call to
asa metrics overview instead. The date window is capped by the finest --group-by period: 28 days when
day is grouped, 90 with no period grouping, 180 by week, 365 by month and coarser — widen the window by
coarsening the grouping, not by splitting into more calls. Budget: 5 metrics calls per minute, at most
2 per 10 seconds, one at a time.`
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31',
    '<%= config.bin %> asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --order-by spend --page-size 5',
    '<%= config.bin %> asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --group-by country --page-size 1000',
    '<%= config.bin %> asa metrics --entity keyword --date-from 2026-07-01 --date-to 2026-07-31 --metric spend --metric roas',
    '<%= config.bin %> asa metrics --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --metric roas --by-days 7 --by-days 90',
  ]
  static flags = {
    ...asaPaginationFlags,
    ...byDaysFlag,
    'date-from': Flags.string({description: 'Start of the period (YYYY-MM-DD)', required: true}),
    'date-to': Flags.string({description: 'End of the period (YYYY-MM-DD)', required: true}),
    entity: Flags.string({description: 'What to report on', options: ASA_METRIC_ENTITIES, required: true}),
    'group-by': Flags.string({
      description: 'Break the rows down by a dimension, repeatable',
      multiple: true,
      options: ASA_GROUP_BY_DIMENSIONS,
    }),
    metric: Flags.string({
      description:
        'Metric name (dashboard nomenclature, e.g. spend, taps, gross_roas), repeatable; omit for every metric; a wrong name fails listing all valid ones',
      multiple: true,
    }),
    order: Flags.string({default: 'desc', description: 'Sort direction', options: ['asc', 'desc']}),
    'order-by': Flags.string({
      description: 'Metric or field to sort by; cohort metrics rank via their gross_/proceeds_/net_ names',
    }),
    'order-by-day': Flags.integer({
      description: 'Rank by a cohort metric at this renewal window; must be one of the --by-days values',
    }),
  }

  async run(): Promise<PaginatedResponse<Record<string, unknown>>> {
    const {flags} = await this.parse(AsaMetrics)
    if (flags['by-days'] && flags['by-days'].length > MAX_BY_DAYS) {
      this.error(`At most ${MAX_BY_DAYS} renewal windows per call, got ${flags['by-days'].length}.`, {exit: 2})
    }

    const client = await createAsaClient(this.config)

    const {result} = await asaWrite<PaginatedResponse<Record<string, unknown>>>(client, 'post', '/metrics', {
      body: {
        date_from: flags['date-from'],
        date_to: flags['date-to'],
        entity: flags.entity,
        order: flags.order,
        ...(flags.metric === undefined ? {} : {metrics: flags.metric}),
        ...(flags['by-days'] === undefined ? {} : {by_days: flags['by-days']}),
        ...(flags['group-by'] === undefined ? {} : {group_by: flags['group-by']}),
        ...(flags['order-by'] === undefined ? {} : {order_by: flags['order-by']}),
        ...(flags['order-by-day'] === undefined ? {} : {order_by_day: flags['order-by-day']}),
      },
      params: paginationParams(flags),
    })

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta?.pagination)

    return result
  }
}
