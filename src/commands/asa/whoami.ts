import { Command } from '@oclif/core';

import { createAsaClient } from '../../lib/asa-client.js';
import { printResponse } from '../../lib/output.js';

import type { AsaMeDTO } from '../../lib/asa-schemas.js';

export default class AsaWhoami extends Command {
    static override description = `Show which company the token unlocks, whether Apple Ads is connected, and the request budgets it gets

Limits are raised per company, so read them here rather than assuming the defaults: metrics_limit_per_minute
and metrics_burst_limit govern asa metrics, keywords_read_limit_per_minute the keyword lists,
metrics_inflight_limit how many analytics calls may overlap, and max_breakdown_rows_per_page the size a
grouped page may project to before it is refused.`;

    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa whoami'];

    async run(): Promise<AsaMeDTO> {
        await this.parse(AsaWhoami);
        const client = await createAsaClient(this);
        const result = await client.get<AsaMeDTO>('/me');

        printResponse(result, this.log.bind(this));

        if (result.apple_credentials_status !== 'active') {
            this.log('\nApple Ads is not connected. Run `adapty asa connect` to link an account.');
        }

        if (result.access_source === 'none') {
            this.log('\nNo active Ads Manager subscription for this company: connecting an account works, but every');
            this.log('data command answers 402 until the subscription is in place.');
        }

        return result;
    }
}
