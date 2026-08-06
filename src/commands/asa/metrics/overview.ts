import {Command, Flags} from '@oclif/core'

import {asaWrite, createAsaClient} from '../../../lib/asa-client.js'
import {ASA_METRIC_ENTITIES, byDaysFlag, MAX_BY_DAYS} from '../../../lib/asa-flags.js'
import {printResponse} from '../../../lib/output.js'

export default class AsaMetricsOverview extends Command {
  static description = 'Totals for a period, optionally split into day, week or month buckets'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa metrics overview --entity campaign --date-from 2026-07-01 --date-to 2026-07-31',
    '<%= config.bin %> asa metrics overview --entity campaign --date-from 2026-07-01 --date-to 2026-07-31 --period-unit WEEK',
  ]
  static flags = {
    ...byDaysFlag,
    'date-from': Flags.string({description: 'Start of the period (YYYY-MM-DD)', required: true}),
    'date-to': Flags.string({description: 'End of the period (YYYY-MM-DD)', required: true}),
    entity: Flags.string({description: 'What to report on', options: ASA_METRIC_ENTITIES, required: true}),
    metric: Flags.string({description: 'Metric name, repeatable; omit for every metric', multiple: true}),
    'period-unit': Flags.string({
      default: 'day',
      description: 'Bucket size',
      options: ['day', 'month', 'quarter', 'week', 'year'],
    }),
  }

  async run(): Promise<Record<string, unknown>> {
    const {flags} = await this.parse(AsaMetricsOverview)
    if (flags['by-days'] && flags['by-days'].length > MAX_BY_DAYS) {
      this.error(`At most ${MAX_BY_DAYS} renewal windows per call, got ${flags['by-days'].length}.`, {exit: 2})
    }

    const client = await createAsaClient(this.config)
    const {result} = await asaWrite<Record<string, unknown>>(client, 'post', '/metrics/overview', {
      body: {
        date_from: flags['date-from'],
        date_to: flags['date-to'],
        entity: flags.entity,
        period_unit: flags['period-unit'],
        ...(flags.metric === undefined ? {} : {metrics: flags.metric}),
        ...(flags['by-days'] === undefined ? {} : {by_days: flags['by-days']}),
      },
    })

    printResponse(result, this.log.bind(this))

    return result
  }
}
