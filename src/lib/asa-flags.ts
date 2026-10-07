import { Flags } from '@oclif/core';

import { CPT_BID_TYPES, KEYWORD_MATCH_TYPES, NEGATE_TYPES } from './asa-keyword-action.js';
import { describeListedError } from './errors.js';
import { isValidUuid } from './flags.js';

import type { QueryParams } from './api-client.js';
import type { SegmentFilterInput } from './api-schemas.js';
import type { AsaLocInvoiceDetails, AsaMoney, AsaMutationError } from './asa-schemas.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_REGEX = /^\d+(\.\d{1,6})?$/;

export const MAX_BULK_ITEMS = 100;
export const MAX_BY_DAYS = 16;
export const ASA_METRIC_ENTITIES = ['ad', 'ad-group', 'campaign', 'keyword'];
export const ASA_GROUP_BY_DIMENSIONS = ['country', 'day', 'month', 'quarter', 'week', 'year'];

export const asaPaginationFlags = {
    'page': Flags.integer({
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
};

export const byDaysFlag = {
    'by-days': Flags.integer({
        description: 'Renewal window in days for cohort metrics, repeatable; omit for the dashboard defaults',
        multiple: true,
    }),
};

// eslint-disable-next-line @typescript-eslint/require-await -- FIXME if you see this
export async function parseDate(input: string): Promise<string> {
    if (!DATE_REGEX.test(input)) {
        throw new Error('Dates must be written as YYYY-MM-DD.');
    }

    return input;
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
};

// eslint-disable-next-line @typescript-eslint/require-await -- FIXME if you see this
async function parseId(input: string): Promise<string> {
    if (!isValidUuid(input)) {
        throw new Error('Ids are the UUIDs printed by the matching list command.');
    }

    return input;
}

function idFilter(entity: string) {
    return Flags.string({ description: `Keep only rows in this ${entity}; repeatable`, multiple: true, parse: parseId });
}

const searchFilter = { search: Flags.string({ description: 'Case-insensitive substring match on the name' }) };

export const assetScopeFlags = {
    'app': idFilter('app'),
    'campaign-group': idFilter('campaign group'),
};

export const orgScopeFlags = { ...assetScopeFlags, ...searchFilter };

export const campaignScopeFlags = { ...orgScopeFlags, campaign: idFilter('campaign') };

export const adGroupScopeFlags = { ...campaignScopeFlags, 'ad-group': idFilter('ad group') };

export const adScopeFlags = {
    'ad-group': idFilter('ad group'),
    'campaign': idFilter('campaign'),
    'campaign-group': idFilter('campaign group'),
    ...searchFilter,
};

export const metricsScopeFlags = {
    'ad-group': idFilter('ad group'),
    'app': idFilter('app'),
    'campaign': idFilter('campaign'),
};

export function metricsScopeBody(flags: {
    'ad-group'?: string[] | undefined;
    'app'?: string[] | undefined;
    'campaign'?: string[] | undefined;
}) {
    return {
        ...(flags['ad-group'] === undefined ? {} : { ad_group_id: flags['ad-group'] }),
        ...(flags.app === undefined ? {} : { app_id: flags.app }),
        ...(flags.campaign === undefined ? {} : { campaign_id: flags.campaign }),
    };
}

export const statusFilter = (options: string[]) => ({
    status: Flags.string({ description: 'Keep only rows in this state', options }),
});

type ScopeFlags = {
    'ad-group'?: string[] | undefined;
    'app'?: string[] | undefined;
    'campaign'?: string[] | undefined;
    'campaign-group'?: string[] | undefined;
    'search'?: string | undefined;
    'status'?: string | undefined;
};

export function scopeParams(flags: ScopeFlags): QueryParams {
    return {
        ad_group_id: flags['ad-group'],
        app_id: flags.app,
        campaign_group_id: flags['campaign-group'],
        campaign_id: flags.campaign,
        search: flags.search,
        status: flags.status,
    };
}

export const scheduleFlags = {
    'end-time': Flags.string({ description: 'Schedule end (YYYY-MM-DD)', parse: parseDate }),
    'start-time': Flags.string({ description: 'Schedule start (YYYY-MM-DD), defaults to today', parse: parseDate }),
};

export const pricingModelFlag = {
    'pricing-model': Flags.string({
        default: 'CPC',
        description: 'Pricing model; Apple requires one on every ad group',
        options: ['CPC', 'CPM'],
    }),
};

export function startOfDayUtc(date: string | undefined): string | undefined {
    return date === undefined ? undefined : `${date}T00:00:00Z`;
}

export function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

export function periodParams(flags: {
    'date-from'?: string | undefined;
    'date-to'?: string | undefined;
}): Record<string, string> {
    const params: Record<string, string> = {};

    if (flags['date-from']) {
        params.date_from = flags['date-from'];
    }

    if (flags['date-to']) {
        params.date_to = flags['date-to'];
    }

    return params;
}

// eslint-disable-next-line @typescript-eslint/require-await -- FIXME if you see this
async function parseMoney(input: string): Promise<string> {
    if (!MONEY_REGEX.test(input)) {
        throw new Error('Amounts must be plain numbers, e.g. 50 or 12.50.');
    }

    return input;
}

export function moneyFlag(description: string, opts: { required?: boolean } = {}) {
    return Flags.string({
        description: `${description} (amount, e.g. 50 or 12.50)`,
        parse: parseMoney,
        ...(opts.required === undefined ? {} : { required: opts.required }),
    });
}

export const currencyFlag = {
    currency: Flags.string({ default: 'USD', description: 'Currency code for the amounts in this call' }),
};

// Params of the add-as-keyword-to action, shared by `automations create` and `automations update`.
// The API picks the params variant by shape, so which of these apply depends on the rule's
// operate_with: --negate/--no-negate/--skip-enable-duplicates are search-term only,
// --pause-original is targeting-keyword only. See lib/asa-keyword-action.ts.
export const addKeywordActionFlags = {
    'cpt-bid': Flags.string({
        description:
      'cpt_bid.value: the bid itself with --cpt-bid-type set_to, or a percent markup on the entity bid with '
      + 'search_term_current_cpt / keyword_current_bid; not accepted with ad_group_default_bid',
        parse: parseMoney,
    }),
    'cpt-bid-type': Flags.string({
        description: 'Where the bid of the created keyword comes from; the API has no default',
        options: CPT_BID_TYPES,
    }),
    'match-type': Flags.string({
        description: 'Match type of the created keyword; the API has no default',
        options: KEYWORD_MATCH_TYPES,
    }),
    'negate': Flags.string({
        description: 'Also add the search term as a negative keyword at this level (search-term rules)',
        exclusive: ['no-negate'],
        options: NEGATE_TYPES,
    }),
    'no-negate': Flags.boolean({
        description: 'Leave no negative keyword behind (search-term rules)',
        exclusive: ['negate'],
    }),
    'pause-original': Flags.boolean({
        allowNo: true,
        description: 'Pause the source keyword in its own ad group (targeting-keyword rules)',
    }),
    'skip-enable-duplicates': Flags.boolean({
        allowNo: true,
        description: 'Skip a keyword that already exists in the target ad group instead of enabling it (search-term rules)',
    }),
    'target-ad-group': Flags.string({
        description: 'Ad group the keyword is added to (UUID), repeatable; a rule without one does nothing',
        multiple: true,
        parse: parseId,
    }),
};

export const idempotencyFlags = {
    'idempotency-key': Flags.string({
        description:
      'Idempotency key for this write; re-running with the same key replays the stored result instead of applying twice',
    }),
};

export function money(amount: string | undefined, currency: string): AsaMoney | undefined {
    return amount === undefined ? undefined : { amount, currency };
}

const INVOICE_FIELDS = {
    'invoice-advertiser': 'client_name',
    'invoice-billing-email': 'billing_contact_email',
    'invoice-contact-email': 'buyer_email',
    'invoice-contact-name': 'buyer_name',
    'invoice-order-number': 'order_number',
} as const;

type InvoiceFlagName = keyof typeof INVOICE_FIELDS;

const INVOICE_PREFIX = 'Invoicing Options (line-of-credit orgs, see payment_model in asa orgs list)';

function invoiceFlag(what: string) {
    return Flags.string({ description: `${INVOICE_PREFIX}: ${what}` });
}

export const invoiceFlags = {
    'invoice-advertiser': invoiceFlag('advertiser name'),
    'invoice-billing-email': invoiceFlag('billing contact email'),
    'invoice-contact-email': invoiceFlag('buyer contact email'),
    'invoice-contact-name': invoiceFlag('buyer contact name'),
    'invoice-order-number': invoiceFlag('order number'),
};

export function locInvoiceDetails(
    flags: Partial<Record<InvoiceFlagName, string | undefined>>,
): Record<keyof AsaLocInvoiceDetails, string> | undefined {
    const names = Object.keys(INVOICE_FIELDS) as InvoiceFlagName[];
    const missing = names.filter(name => flags[name] === undefined);

    if (missing.length === names.length) {
        return undefined;
    }

    if (missing.length > 0) {
        throw new Error(`Invoicing Options need all five flags; missing: ${missing.map(name => `--${name}`).join(', ')}`);
    }

    return Object.fromEntries(names.map(name => [INVOICE_FIELDS[name], flags[name]])) as Record<
        keyof AsaLocInvoiceDetails,
        string
    >;
}

const SERVING_HINTS: Record<string, (campaignId: string) => string> = {
    AUTOMATED_KEYWORDS_REQUIRED_AD_GROUP_MISSING: campaignId =>
        `Max Conversions campaign needs an automated ad group: adapty asa ad-groups create --campaign ${campaignId} --name "Automated Max Conv" --automated`,
    MISSING_BO_OR_INVOICING_FIELDS: campaignId =>
        `This organization bills by line of credit — add Invoicing Options: adapty asa campaigns update ${campaignId} --invoice-advertiser ... --invoice-order-number ... --invoice-contact-name ... --invoice-contact-email ... --invoice-billing-email ...`,
    PAUSED_BY_USER: campaignId =>
        `Campaign is paused — to serve, enable it: adapty asa campaigns update ${campaignId} --status ENABLED; its ad groups and keywords must be enabled too: adapty asa ad-groups update ... --status ENABLED, adapty asa keywords update ... --status ACTIVE`,
};

export function reportServingState(
    campaign: null | { internal_id: string; serving_state_reasons?: null | string[]; serving_status?: null | string },
    warn: (msg: string) => void,
): void {
    if (campaign?.serving_status !== 'NOT_RUNNING' || !campaign.serving_state_reasons?.length) {
        return;
    }

    const reasons = campaign.serving_state_reasons;

    for (const reason of reasons) {
        const hint = SERVING_HINTS[reason];

        if (hint) {
            warn(hint(campaign.internal_id));
        }
    }

    const other = reasons.filter(reason => !SERVING_HINTS[reason]);

    if (other.length > 0) {
        warn(`Not serving: ${other.join(', ')}`);
    }
}

type BulkOutcome = {
    applied: unknown[];
    errors: AsaMutationError[];
    isValidationFailure: boolean;
    kind: string;
};

export function reportBulkOutcome(
    { applied, errors, isValidationFailure, kind }: BulkOutcome,
    log: (msg: string) => void,
): void {
    if (isValidationFailure) {
        log(`Nothing was applied: the batch failed validation before Apple was called.`);
    } else {
        log(`${applied.length} ${kind} applied, ${errors.length} rejected.`);
    }

    for (const error of errors) {
        log(`  ${describeListedError(error).text}`);
    }
}

const FILTER_USAGE = 'Filters are written as field:OPERATOR:value[,value...], e.g. campaign:IN:2144520245.';

export function parseSegmentFilter(input: string): SegmentFilterInput {
    const [fieldName, operator, ...rest] = input.split(':');

    if (!fieldName || !operator || rest.length === 0) {
        throw new Error(FILTER_USAGE);
    }

    const valueList = rest.join(':').split(',').map(value => value.trim()).filter(value => value !== '');

    if (valueList.length === 0) {
        throw new Error(`A filter needs at least one value. ${FILTER_USAGE}`);
    }

    return { field_name: fieldName, operator, value_list: valueList };
}

export const segmentWriteFlags = {
    description: Flags.string({ description: 'Segment description' }),
    filter: Flags.string({
        description: 'Filter as field:OPERATOR:value[,value...], repeatable; e.g. campaign:IN:2144520245',
        multiple: true,
        // oclif keeps a string flag a string: the parsed filter travels as JSON and segmentFilters unpacks it
        // eslint-disable-next-line @typescript-eslint/require-await -- oclif parse hooks are async
        parse: async (input: string) => JSON.stringify(parseSegmentFilter(input)),
        required: true,
    }),
    title: Flags.string({ description: 'Segment title', required: true }),
};

export function segmentFilters(flags: { filter?: string[] | undefined }): SegmentFilterInput[] {
    return (flags.filter ?? []).map(raw => JSON.parse(raw) as SegmentFilterInput);
}

export type AsaSegmentSource = 'ad-group' | 'campaign' | 'keyword';

export const asaSegmentSourceFlags = {
    'ad-group': idFilter('ad group'),
    'campaign': idFilter('campaign'),
    'keyword': idFilter('keyword'),
};

export type AsaSegmentSourceFlags = {
    'ad-group'?: string[] | undefined;
    'campaign'?: string[] | undefined;
    'keyword'?: string[] | undefined;
};

/**
 * One source kind per segment, as in the Ads Manager modal. Keywords are looked up inside one ad group, so
 * `--keyword` borrows `--ad-group` as its scope instead of competing with it.
 */
export type AsaSegmentSelection = { ids: string[]; scopeAdGroup: string | undefined; source: AsaSegmentSource };

export function resolveAsaSegmentSource(flags: AsaSegmentSourceFlags): AsaSegmentSelection {
    const keywords = flags.keyword ?? [];
    const adGroups = flags['ad-group'] ?? [];
    const campaigns = flags.campaign ?? [];

    if (keywords.length > 0) {
        const [scopeAdGroup] = adGroups;

        if (campaigns.length > 0 || adGroups.length !== 1 || scopeAdGroup === undefined) {
            throw new Error('--keyword takes exactly one --ad-group as the lookup scope and no --campaign.');
        }

        return { ids: [...new Set(keywords)], scopeAdGroup, source: 'keyword' };
    }

    if (campaigns.length > 0 && adGroups.length > 0) {
        throw new Error('Pass either --campaign or --ad-group, not both: a segment is built from one kind of entity.');
    }

    if (campaigns.length > 0) {
        return { ids: [...new Set(campaigns)], scopeAdGroup: undefined, source: 'campaign' };
    }

    if (adGroups.length > 0) {
        return { ids: [...new Set(adGroups)], scopeAdGroup: undefined, source: 'ad-group' };
    }

    throw new Error('Pass at least one --campaign, --ad-group or --keyword.');
}

export const ASA_SEGMENT_FIELD: Record<AsaSegmentSource, string> = {
    'ad-group': 'ad_group',
    'campaign': 'campaign',
    // The portal calls a keyword attribution "creative"
    'keyword': 'creative',
};

export type AsaSegmentEntity = { id: string; name: string };

const ASA_TITLE_MAX = 120;
const ASA_DESCRIPTION_MAX = 240;
const ASA_PREVIEW_COUNT = 3;

const ASA_SOURCE_WORDS: Record<AsaSegmentSource, { one: string; many: string; title: string }> = {
    'ad-group': { many: 'ad groups', one: 'ad group', title: 'Ad group' },
    'campaign': { many: 'campaigns', one: 'campaign', title: 'Campaign' },
    'keyword': { many: 'keywords', one: 'keyword', title: 'Keyword' },
};

function truncate(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }

    return max <= 3 ? text.slice(0, max) : `${text.slice(0, max - 3)}...`;
}

function withRest(preview: string, rest: number): string {
    return rest > 0 ? `${preview} +${rest}...` : preview;
}

/** The dashboard's own title and description for an Ads Manager segment, so it recognises the segment as its own. */
export function buildAsaSegmentNaming(
    source: AsaSegmentSource,
    entities: AsaSegmentEntity[],
): { description: string; title: string } {
    const words = ASA_SOURCE_WORDS[source];

    if (entities.length === 1) {
        const [entity] = entities as [AsaSegmentEntity];

        return {
            description: truncate(`Created from Apple Search Ads ${words.one} "${entity.name}".\n\nID: ${entity.id}`, ASA_DESCRIPTION_MAX),
            title: truncate(`[ASA] ${words.title}: ${entity.name}`, ASA_TITLE_MAX),
        };
    }

    const shown = entities.slice(0, ASA_PREVIEW_COUNT);
    const rest = entities.length - shown.length;
    const names = withRest(shown.map(entity => entity.name).join(', '), rest);
    const ids = withRest(shown.map(entity => entity.id).join(', '), rest);

    return {
        description: truncate(
            `Created from Apple Search Ads ${words.many} (${entities.length}).\n\nPreview: ${names}\n\nIDs: ${ids}`,
            ASA_DESCRIPTION_MAX,
        ),
        title: truncate(`[ASA] ${entities.length} ${words.many}: ${names}`, ASA_TITLE_MAX),
    };
}
