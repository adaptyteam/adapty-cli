import {Flags} from '@oclif/core'

import type {QueryParams} from './api-client.js'
import type {AsaMoney, AsaMutationError} from './asa-schemas.js'

import {describeListedError} from './errors.js'
import {isValidUuid} from './flags.js'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MONEY_REGEX = /^\d+(\.\d{1,6})?$/

export const MAX_BULK_ITEMS = 100
export const MAX_BY_DAYS = 16
export const ASA_METRIC_ENTITIES = ['ad', 'ad-group', 'campaign', 'keyword']
export const ASA_GROUP_BY_DIMENSIONS = ['country', 'day', 'month', 'quarter', 'week', 'year']

export const byDaysFlag = {
  'by-days': Flags.integer({
    description: 'Renewal window in days for cohort metrics, repeatable; omit for the dashboard defaults',
    multiple: true,
  }),
}

async function parseDate(input: string): Promise<string> {
  if (!DATE_REGEX.test(input)) throw new Error('Dates must be written as YYYY-MM-DD.')
  return input
}

export const periodFlags = {
  'date-from': Flags.string({
    description: 'Start of the reporting period (YYYY-MM-DD), defaults to today',
    parse: parseDate,
  }),
  'date-to': Flags.string({
    description: 'End of the reporting period (YYYY-MM-DD), defaults to today',
    parse: parseDate,
  }),
}

async function parseId(input: string): Promise<string> {
  if (!isValidUuid(input)) throw new Error('Ids are the UUIDs printed by the matching list command.')
  return input
}

function idFilter(entity: string) {
  return Flags.string({description: `Keep only rows in this ${entity}; repeatable`, multiple: true, parse: parseId})
}

const searchFilter = {search: Flags.string({description: 'Case-insensitive substring match on the name'})}

export const assetScopeFlags = {
  app: idFilter('app'),
  'campaign-group': idFilter('campaign group'),
}

export const orgScopeFlags = {...assetScopeFlags, ...searchFilter}

export const campaignScopeFlags = {...orgScopeFlags, campaign: idFilter('campaign')}

export const adGroupScopeFlags = {...campaignScopeFlags, 'ad-group': idFilter('ad group')}

export const adScopeFlags = {
  'ad-group': idFilter('ad group'),
  campaign: idFilter('campaign'),
  'campaign-group': idFilter('campaign group'),
  ...searchFilter,
}

export const statusFilter = (options: string[]) => ({
  status: Flags.string({description: 'Keep only rows in this state', options}),
})

interface ScopeFlags {
  'ad-group'?: string[]
  app?: string[]
  campaign?: string[]
  'campaign-group'?: string[]
  search?: string
  status?: string
}

export function scopeParams(flags: ScopeFlags): QueryParams {
  return {
    ad_group_id: flags['ad-group'],
    app_id: flags.app,
    campaign_group_id: flags['campaign-group'],
    campaign_id: flags.campaign,
    search: flags.search,
    status: flags.status,
  }
}

export const scheduleFlags = {
  'end-time': Flags.string({description: 'Schedule end (YYYY-MM-DD)', parse: parseDate}),
  'start-time': Flags.string({description: 'Schedule start (YYYY-MM-DD), defaults to today', parse: parseDate}),
}

export const pricingModelFlag = {
  'pricing-model': Flags.string({
    default: 'CPC',
    description: 'Pricing model; Apple requires one on every ad group',
    options: ['CPC', 'CPM'],
  }),
}

export function startOfDayUtc(date: string | undefined): string | undefined {
  return date === undefined ? undefined : `${date}T00:00:00Z`
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function periodParams(flags: {'date-from'?: string; 'date-to'?: string}): Record<string, string> {
  const params: Record<string, string> = {}
  if (flags['date-from']) params.date_from = flags['date-from']
  if (flags['date-to']) params.date_to = flags['date-to']
  return params
}

async function parseMoney(input: string): Promise<string> {
  if (!MONEY_REGEX.test(input)) throw new Error('Amounts must be plain numbers, e.g. 50 or 12.50.')
  return input
}

export function moneyFlag(description: string, opts: {required?: boolean} = {}) {
  return Flags.string({
    description: `${description} (amount, e.g. 50 or 12.50)`,
    parse: parseMoney,
    required: opts.required,
  })
}

export const currencyFlag = {
  currency: Flags.string({default: 'USD', description: 'Currency code for the amounts in this call'}),
}

export const idempotencyFlags = {
  'idempotency-key': Flags.string({
    description:
      'Idempotency key for this write; re-running with the same key replays the stored result instead of applying twice',
  }),
}

export function money(amount: string | undefined, currency: string): AsaMoney | undefined {
  return amount === undefined ? undefined : {amount, currency}
}

interface BulkOutcome {
  applied: unknown[]
  errors: AsaMutationError[]
  isValidationFailure: boolean
  kind: string
}

export function reportBulkOutcome(
  {applied, errors, isValidationFailure, kind}: BulkOutcome,
  log: (msg: string) => void,
): void {
  if (isValidationFailure) {
    log(`Nothing was applied: the batch failed validation before Apple was called.`)
  } else {
    log(`${applied.length} ${kind} applied, ${errors.length} rejected.`)
  }

  for (const error of errors) {
    log(`  ${describeListedError(error).text}`)
  }
}
