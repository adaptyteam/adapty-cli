import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { isValidUuid } from '../../../lib/flags.js';

import type { AsaKeywordDuplicatesDTO } from '../../../lib/asa-schemas.js';

export default class AsaKeywordsDuplicates extends Command {
    static override description
        = 'Find keywords of one app that are duplicated across ad groups and campaigns (same text, country and level); at most 500 groups, `truncated` says when the list was capped';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keywords duplicates --app APP_UUID',
        '<%= config.bin %> asa keywords duplicates --app APP_UUID --country US --country DE --ignore-match-type',
    ];

    static override flags = {
        'app': Flags.string({ description: 'App ID (UUID) — see `adapty asa apps list`', required: true }),
        'country': Flags.string({ description: 'ISO country code (e.g. US); repeatable, scan only these countries', multiple: true }),
        'ignore-match-type': Flags.boolean({ description: 'Group by country and text only, merging match types' }),
    };

    async run(): Promise<AsaKeywordDuplicatesDTO> {
        const { flags } = await this.parse(AsaKeywordsDuplicates);

        if (!isValidUuid(flags.app)) {
            this.error('Invalid app ID format.', { exit: 2 });
        }

        const countries = (flags.country ?? []).map(code => code.trim().toUpperCase());

        if (countries.some(code => !/^[A-Z]{2}$/.test(code))) {
            this.error('--country takes two-letter ISO codes, e.g. --country US.', { exit: 2 });
        }

        const client = await createAsaClient(this);

        const result = await client.get<AsaKeywordDuplicatesDTO>('/keywords/duplicates', {
            app_id: flags.app,
            countries: countries.length > 0 ? countries : undefined,
            ignore_match_type: flags['ignore-match-type'] ? 'true' : undefined,
        });

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
