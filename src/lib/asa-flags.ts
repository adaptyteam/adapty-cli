import {Flags} from '@oclif/core'

import type {QueryParams} from './api-client.js'
import type {AsaLocInvoiceDetails, AsaMoney, AsaMutationError, AsaServingStatus} from './asa-schemas.js'

import {describeListedError} from './errors.js'
import {isValidUuid} from './flags.js'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MONEY_REGEX = /^\d+(\.\d{1,6})?$/

export const MAX_BULK_ITEMS = 100
export const MAX_BY_DAYS = 16
export const ASA_METRIC_ENTITIES = ['ad', 'ad-group', 'campaign', 'keyword']
export const ASA_GROUP_BY_DIMENSIONS = ['country', 'day', 'month', 'quarter', 'week', 'year']

export const asaPaginationFlags = {
  page: Flags.integer({
    default: 1,
    description: 'Page number',
    min: 1,
  }),
  'page-size': Flags.integer({
    default: 100,
    description: 'Items per page (max 1000); prefer one big page over a pagination loop',
    max: 1000,
    min: 1,
  }),
}

export const byDaysFlag = {
  'by-days': Flags.integer({
    description: 'Renewal window in days for cohort metrics, repeatable; omit for the dashboard defaults',
    multiple: true,
  }),
}

export async function parseDate(input: string): Promise<string> {
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

const INVOICE_FIELDS = {
  'invoice-advertiser': 'client_name',
  'invoice-billing-email': 'billing_contact_email',
  'invoice-contact-email': 'buyer_email',
  'invoice-contact-name': 'buyer_name',
  'invoice-order-number': 'order_number',
} as const

type InvoiceFlagName = keyof typeof INVOICE_FIELDS

const INVOICE_SUFFIX =
  'Invoicing Options, required for line-of-credit (LOC) organizations — see `payment_model` in `asa orgs list`'

function invoiceFlag(what: string) {
  return Flags.string({description: `${what} for ${INVOICE_SUFFIX}`})
}

export const invoiceFlags = {
  'invoice-advertiser': invoiceFlag('Advertiser name'),
  'invoice-billing-email': invoiceFlag('Billing contact email'),
  'invoice-contact-email': invoiceFlag('Buyer contact email'),
  'invoice-contact-name': invoiceFlag('Buyer contact name'),
  'invoice-order-number': invoiceFlag('Order number'),
}

export function locInvoiceDetails(
  flags: Partial<Record<InvoiceFlagName, string>>,
  fail: (msg: string) => never,
): Record<keyof AsaLocInvoiceDetails, string> | undefined {
  const names = Object.keys(INVOICE_FIELDS) as InvoiceFlagName[]
  const missing = names.filter((name) => flags[name] === undefined)
  if (missing.length === names.length) return undefined
  if (missing.length > 0) {
    fail(`Invoicing Options must be passed together; missing: ${missing.map((name) => `--${name}`).join(', ')}.`)
  }

  return Object.fromEntries(names.map((name) => [INVOICE_FIELDS[name], flags[name]])) as Record<
    keyof AsaLocInvoiceDetails,
    string
  >
}

const SERVING_HINTS: Record<string, (campaignId: string) => string> = {
  AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_MISSING: (campaignId) =>
    `Max Conversions campaign needs an automated ad group: adapty asa ad-groups create --campaign ${campaignId} --name "Automated Max Conv" --automated`,
  MISSING_BO_OR_INVOICING_FIELDS: (campaignId) =>
    `This organization bills by line of credit — add Invoicing Options: adapty asa campaigns update ${campaignId} --invoice-advertiser ... --invoice-order-number ... --invoice-contact-name ... --invoice-contact-email ... --invoice-billing-email ...`,
}

export function reportServingState(
  campaign: null | {internal_id: string; serving_state_reasons?: null | string[]; serving_status?: AsaServingStatus | null},
  log: (msg: string) => void,
): void {
  if (campaign?.serving_status !== 'NOT_RUNNING' || !campaign.serving_state_reasons?.length) return
  log(`Campaign is not running: ${campaign.serving_state_reasons.join(', ')}`)
  for (const reason of campaign.serving_state_reasons) {
    const hint = SERVING_HINTS[reason]
    if (hint) log(hint(campaign.internal_id))
  }
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
