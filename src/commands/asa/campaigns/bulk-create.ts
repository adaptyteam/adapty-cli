import {Command, Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'

import type {
  AsaBulkConvertResultDTO,
  AsaBulkOperationAcceptedDTO,
  AsaBulkOperationStateDTO,
  AsaTemplateIssueDTO,
} from '../../../lib/asa-schemas.js'

import {ApiClient} from '../../../lib/api-client.js'
import {asaWrite, createAsaClient, noteReplay} from '../../../lib/asa-client.js'
import {confirmFlags, confirmMutation} from '../../../lib/asa-confirm.js'
import {idempotencyFlags} from '../../../lib/asa-flags.js'
import {printResponse} from '../../../lib/output.js'

const TERMINAL_STATUSES = new Set(['failed', 'partial', 'success'])

interface StructureCounts {
  adGroups: number
  ads: number
  campaigns: number
  keywords: number
  negativeKeywords: number
}

export default class AsaCampaignsBulkCreate extends Command {
  static description =
    'Create a whole campaign structure (campaigns → ad groups → keywords/negative keywords/ads) in one bulk operation'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> asa campaigns bulk-create --file structure.json',
    'cat structure.json | <%= config.bin %> asa campaigns bulk-create --file -',
    '<%= config.bin %> asa campaigns bulk-create --from-file Campaign_And_Adgroup_Template.xlsx --org-id 1234567',
    '<%= config.bin %> asa campaigns bulk-create --from-file keywords_template.csv --org-id 1234567 --preview',
  ]
  static flags = {
    ...confirmFlags,
    ...idempotencyFlags,
    file: Flags.string({
      description: 'JSON file with the campaign structure (the POST /bulk-operations/ body); use "-" for stdin',
      exactlyOne: ['file', 'from-file'],
    }),
    'from-file': Flags.string({
      description: 'Apple Ads bulk template (Campaign_And_Adgroup_Template.xlsx or keywords .csv) to convert and submit',
    }),
    'org-id': Flags.integer({
      description: 'Apple org id (campaign_group_id) the converted template will target; required with --from-file',
    }),
    'poll-interval': Flags.integer({default: 5, description: 'Seconds between progress polls'}),
    preview: Flags.boolean({
      description: 'With --from-file: print the converted request and stop, nothing is created',
    }),
    timeout: Flags.integer({default: 900, description: 'Max seconds to wait for the operation to finish'}),
    wait: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Poll the operation until it finishes; --no-wait returns the operation id immediately',
    }),
  }

  async run(): Promise<AsaBulkOperationStateDTO | Record<string, unknown>> {
    const {flags} = await this.parse(AsaCampaignsBulkCreate)
    const client = await createAsaClient(this.config)

    const body = flags['from-file'] ? await this.convertTemplate(client, flags) : await this.readStructure(flags.file!)
    if (flags.preview) {
      this.log(JSON.stringify(body, null, 2))
      return body
    }

    const counts = this.countStructure(body)
    const summary =
      `Bulk-create: ${counts.campaigns} campaign node(s), ${counts.adGroups} ad group(s), ` +
      `${counts.keywords} keyword(s), ${counts.negativeKeywords} negative keyword(s), ${counts.ads} ad(s)`
    await confirmMutation(this, {body, method: 'POST', path: '/bulk-operations/', summary}, flags.yes)

    const {replayed, result} = await asaWrite<AsaBulkOperationAcceptedDTO>(client, 'post', '/bulk-operations', {
      body,
      idempotencyKey: flags['idempotency-key'],
    })
    noteReplay(replayed, this.log.bind(this))
    this.log(`Operation accepted: ${result.operation_id}`)

    if (!flags.wait) {
      this.log(`Check progress with: adapty asa campaigns bulk-status ${result.operation_id}`)
      return {operation_id: result.operation_id}
    }

    const state = await this.waitForCompletion(client, result.operation_id, flags['poll-interval'], flags.timeout)
    this.report(state)
    return state
  }

  private async convertTemplate(
    client: ApiClient,
    flags: {'from-file'?: string; 'org-id'?: number;},
  ): Promise<Record<string, unknown>> {
    if (flags['org-id'] === undefined) this.error('--org-id is required with --from-file.', {exit: 2})

    const path = flags['from-file']!
    let content: Buffer
    try {
      content = await readFile(path)
    } catch {
      this.error(`Cannot read file: ${path}`, {exit: 2})
    }

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(content)]), basename(path))
    form.append('campaign_group_id', String(flags['org-id']))
    const result = await client.postForm<AsaBulkConvertResultDTO>('/bulk-operations/convert', form)

    for (const warning of result.warnings) this.warn(this.formatIssue(warning))
    if (result.errors.length > 0 || result.request === null) {
      for (const issue of result.errors) this.log(this.formatIssue(issue))
      this.error(`Template conversion failed with ${result.errors.length} error(s); nothing was created.`, {exit: 2})
    }

    return result.request
  }

  private countStructure(body: Record<string, unknown>): StructureCounts {
    const counts: StructureCounts = {adGroups: 0, ads: 0, campaigns: 0, keywords: 0, negativeKeywords: 0}
    const campaigns = Array.isArray(body.campaigns) ? body.campaigns : []
    counts.campaigns = campaigns.length
    for (const campaign of campaigns) {
      if (typeof campaign !== 'object' || campaign === null) continue
      const campaignNode = campaign as Record<string, unknown>
      counts.negativeKeywords += Array.isArray(campaignNode.negative_keywords) ? campaignNode.negative_keywords.length : 0
      const adGroups = Array.isArray(campaignNode.ad_groups) ? campaignNode.ad_groups : []
      counts.adGroups += adGroups.length
      for (const adGroup of adGroups) {
        if (typeof adGroup !== 'object' || adGroup === null) continue
        const adGroupNode = adGroup as Record<string, unknown>
        counts.keywords += Array.isArray(adGroupNode.keywords) ? adGroupNode.keywords.length : 0
        counts.negativeKeywords += Array.isArray(adGroupNode.negative_keywords) ? adGroupNode.negative_keywords.length : 0
        counts.ads += Array.isArray(adGroupNode.ads) ? adGroupNode.ads.length : 0
      }
    }

    return counts
  }

  private formatIssue(issue: AsaTemplateIssueDTO): string {
    const place = [issue.sheet, issue.row === null ? undefined : `row ${issue.row}`, issue.column ?? undefined]
      .filter(Boolean)
      .join(', ')
    return place ? `${place}: ${issue.message}` : issue.message
  }

  private async readStructure(source: string): Promise<Record<string, unknown>> {
    let raw: string
    if (source === '-') {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      raw = Buffer.concat(chunks).toString('utf8')
    } else {
      try {
        raw = await readFile(source, 'utf8')
      } catch {
        this.error(`Cannot read file: ${source}`, {exit: 2})
      }
    }

    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      this.error('The structure is not valid JSON.', {exit: 2})
    }
  }

  private report(state: AsaBulkOperationStateDTO): void {
    const {counts} = state
    this.log(`Finished: ${state.status} — ${counts.applied}/${counts.total} applied, ${counts.failed} failed`)
    const failedObjects = state.objects.filter((object) => object.status === 'failed')
    for (const object of failedObjects) {
      printResponse(object as unknown as Record<string, unknown>, this.log.bind(this))
      this.log('---')
    }

    if (state.status === 'failed') this.error('Bulk operation failed.', {exit: 1})
    if (state.status === 'partial') this.warn('Some objects were not created — see the failures above.')
  }

  private async waitForCompletion(
    client: ApiClient,
    operationId: string,
    pollIntervalSeconds: number,
    timeoutSeconds: number,
  ): Promise<AsaBulkOperationStateDTO> {
    const startedAt = Date.now()
    let lastProgress = ''
    for (;;) {
      const state = await client.get<AsaBulkOperationStateDTO>(`/bulk-operations/${operationId}`)
      const progress = `${state.status}: ${state.counts.applied}/${state.counts.total} applied, ${state.counts.failed} failed`
      if (progress !== lastProgress) {
        this.log(progress)
        lastProgress = progress
      }

      if (TERMINAL_STATUSES.has(state.status)) return state
      if ((Date.now() - startedAt) / 1000 >= timeoutSeconds) {
        this.warn(`Still ${state.status} after ${timeoutSeconds}s — check later with: adapty asa campaigns bulk-status ${operationId}`)
        return state
      }

      await new Promise((resolve) => {
        setTimeout(resolve, pollIntervalSeconds * 1000)
      })
    }
  }
}
