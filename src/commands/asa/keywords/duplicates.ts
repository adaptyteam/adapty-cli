import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaKeywordDuplicatesDTO } from '../../../lib/asa-schemas.js';

export default class AsaKeywordsDuplicates extends Command {
    static override description
        = 'Find keywords of one app that are duplicated across ad groups and campaigns (same text, country and level); at most 500 groups, `truncated` says when the list was capped';

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa keywords duplicates --app APP_UUID'];
    static override flags = { app: Flags.string({ description: 'App ID (UUID) — see `adapty asa apps list`', required: true }) };

    async run(): Promise<AsaKeywordDuplicatesDTO> {
        const { flags } = await this.parse(AsaKeywordsDuplicates);

        if (!isValidUuid(flags.app)) {
            this.error('Invalid app ID format.', { exit: 2 });
        }

        const client = await createAsaClient(this);
        const result = await client.get<AsaKeywordDuplicatesDTO>('/keywords/duplicates', { app_id: flags.app });

        for (const group of result.duplicates) {
            this.log(`"${group.keyword_text}" ${group.match_types_present.join('+')} ${group.country} (${group.level}): ${group.keyword_count} keywords in ${group.ad_group_count} ad groups, ${group.campaign_count} campaigns`);

            for (const item of group.instances) {
                this.log(`  ${item.match_type} ${item.bid_amount.amount} ${item.bid_amount.currency}  ${item.linked_campaign_name} / ${item.linked_ad_group_name}  ${item.keyword_internal_id}`);
            }
        }

        this.log(`\n${result.total_duplicate_groups} duplicate groups, ${result.total_affected_keywords} keywords affected.`);

        if (result.truncated) {
            this.warn(`Only the first ${result.duplicates.length} of ${result.total_duplicate_groups} groups are shown.`);
        }

        return result;
    }
}
