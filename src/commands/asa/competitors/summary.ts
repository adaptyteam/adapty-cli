import {Command, Flags} from '@oclif/core'

import type {AsaCompetitorsSummaryDTO} from '../../../lib/asa-schemas.js'

import {asaWrite, createAsaClient} from '../../../lib/asa-client.js'
import {printList, printResponse} from '../../../lib/output.js'

const MAX_APP_IDS = 5

export default class AsaCompetitorsSummary extends Command {
  static description =
    'Competitor summary for up to five App Store apps; the server covers the last full month and every country'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> asa competitors summary --app-ids 1668337467,6503873027']
  static flags = {
    'app-ids': Flags.string({
      description: `Apple App Store IDs (adam_id), comma-separated, 1-${MAX_APP_IDS} values`,
      required: true,
    }),
  }

  async run(): Promise<AsaCompetitorsSummaryDTO> {
    const {flags} = await this.parse(AsaCompetitorsSummary)
    const appIds = flags['app-ids']
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (appIds.length === 0 || appIds.length > MAX_APP_IDS) {
      this.error(`Pass 1 to ${MAX_APP_IDS} App Store IDs, got ${appIds.length}.`, {exit: 2})
    }

    if (appIds.some((id) => !/^\d+$/.test(id))) {
      this.error('App Store IDs are numbers, e.g. --app-ids 1668337467,6503873027.', {exit: 2})
    }

    const client = await createAsaClient(this.config)
    const {result} = await asaWrite<AsaCompetitorsSummaryDTO>(client, 'post', '/competitors/summary', {
      body: {app_ids: appIds.map(Number)},
    })

    const {total} = result
    printResponse(
      {
        competitors_count: total.competitorsCount,
        countries_asa_count: total.countriesAsaCount,
        countries_with_asa_terms: total.countriesWithAsaTerms,
        total_unique_terms: total.totalUniqueTerms,
      },
      this.log.bind(this),
    )

    this.log('')
    this.log('Top apps by performance:')
    printList(
      total.topAppsByPerformance.map((app) => ({
        adam_id: app.adamId,
        avg_sov: app.avgSov,
        countries: app.countries,
        name: app.name,
        terms_count: app.termsCount,
      })),
      this.log.bind(this),
    )

    this.log('')
    this.log('Most contested terms:')
    printList(
      total.mostContestedTerms.map((term) => ({
        competitor_count: term.competitorCount,
        max_sov: term.maxSov,
        term: term.term,
      })),
      this.log.bind(this),
    )

    return result
  }
}
