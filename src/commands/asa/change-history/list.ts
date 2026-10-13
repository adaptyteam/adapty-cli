import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { asaPaginationFlags, parseDate, periodParams } from '../../../lib/asa-flags.js';
import { isValidUuid, paginationParams } from '../../../lib/flags.js';
import { printList } from '../../../lib/output.js';

import type { AsaChangeHistoryEventDTO, AsaChangeHistoryFieldEventDTO } from '../../../lib/asa-schemas.js';
import type { PaginatedResponse } from '../../../lib/flags.js';

const FIELDS_MAX_PAGE_SIZE = 10;
const MAX_SPAN_DAYS = 14;
const MS_PER_DAY = 86_400_000;

type ChangeHistoryPage = PaginatedResponse<AsaChangeHistoryEventDTO> | PaginatedResponse<AsaChangeHistoryFieldEventDTO>;

export default class AsaChangeHistoryList extends Command {
    static override description
        = 'Apple Ads change history of one organization, read live from Apple (proxied from the Apple Ads Platform API)';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa change-history list --campaign-group <uuid>',
        '<%= config.bin %> asa change-history list --campaign-group <uuid> --date-from 2026-09-01 --entity-type Campaign --event-type UPDATE',
        '<%= config.bin %> asa change-history list --campaign-group <uuid> --fields',
    ];

    static override flags = {
        ...asaPaginationFlags,
        'ad-group': Flags.string({
            description: 'Keep only changes inside these Apple ad group ids (not UUIDs); repeatable',
            multiple: true,
        }),
        'campaign': Flags.string({
            description: 'Keep only changes inside these Apple campaign ids (not UUIDs); repeatable',
            multiple: true,
        }),
        'campaign-group': Flags.string({
            description: 'Organization to read (UUID from asa orgs list); one organization per call',
            required: true,
        }),
        'date-from': Flags.string({
            description: 'Start of the period (YYYY-MM-DD), defaults to 7 days ago; at most 14 days per call, Apple keeps 6 months',
            parse: parseDate,
        }),
        'date-to': Flags.string({
            description: 'End of the period (YYYY-MM-DD), defaults to today',
            parse: parseDate,
        }),
        'entity-id': Flags.string({
            description: 'Keep only changes of these Apple entity ids (not UUIDs); repeatable',
            multiple: true,
        }),
        'entity-type': Flags.string({
            description:
                'Keep only changes of this entity type; repeatable. Default is the campaign domain (Campaign, AdGroup, Keyword, NegativeKeyword, Ad, Creative, LocationGroup); Org and AdAccount cannot be mixed with it',
            multiple: true,
            options: ['Ad', 'AdAccount', 'AdGroup', 'Campaign', 'Creative', 'Keyword', 'LocationGroup', 'NegativeKeyword', 'Org'],
        }),
        'event-type': Flags.string({
            description: 'Keep only this operation; repeatable',
            multiple: true,
            options: ['CREATE', 'DELETE', 'UPDATE'],
        }),
        'fields': Flags.boolean({
            description: `Expand into flat field-level rows (field, old values, new values); page size defaults to ${FIELDS_MAX_PAGE_SIZE} and may not exceed it`,
        }),
        'txn': Flags.string({ description: 'Keep only these Apple transaction ids; repeatable', multiple: true }),
        'user': Flags.string({
            description: 'Keep only changes made by these Apple user ids (not emails); repeatable',
            multiple: true,
        }),
        'user-type': Flags.string({
            description: 'Keep only changes by this actor category; repeatable',
            multiple: true,
            options: ['APPLE_SUPPORT', 'CUSTOMER', 'CUSTOMER_API'],
        }),
    };

    async run(): Promise<ChangeHistoryPage> {
        const { flags } = await this.parse(AsaChangeHistoryList);

        const isPageSizeGiven = this.argv.some(arg => arg === '--page-size' || arg.startsWith('--page-size='));

        if (flags.fields && isPageSizeGiven && flags['page-size'] > FIELDS_MAX_PAGE_SIZE) {
            this.error(`--fields allows --page-size up to ${FIELDS_MAX_PAGE_SIZE}.`, { exit: 2 });
        }

        if (!isValidUuid(flags['campaign-group'])) {
            this.error('Invalid campaign group ID format. Run `adapty asa orgs list` to find it.', { exit: 2 });
        }

        const dateFrom = flags['date-from'];
        const dateTo = flags['date-to'];

        if (
            dateFrom !== undefined
            && dateTo !== undefined
            && (Date.parse(dateTo) - Date.parse(dateFrom)) / MS_PER_DAY >= MAX_SPAN_DAYS
        ) {
            this.error(`--date-from/--date-to may span at most ${MAX_SPAN_DAYS} days.`, { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<ChangeHistoryPage>('/change-history', {
            ...paginationParams(flags),
            ...(flags.fields && !isPageSizeGiven ? { 'page[size]': String(FIELDS_MAX_PAGE_SIZE) } : {}),
            ...periodParams(flags),
            ad_group_id: flags['ad-group'],
            campaign_group_id: flags['campaign-group'],
            campaign_id: flags.campaign,
            entity_id: flags['entity-id'],
            entity_type: flags['entity-type'],
            event_type: flags['event-type'],
            fields: flags.fields ? 'true' : undefined,
            txn_id: flags.txn,
            user_id: flags.user,
            user_type: flags['user-type'],
        });

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
