import { Command } from '@oclif/core';

import { createAsaClient } from '../../lib/asa-client.js';
import { printResponse } from '../../lib/output.js';

import type { AsaMeDTO } from '../../lib/asa-schemas.js';

export default class AsaWhoami extends Command {
    static override description = 'Show which company the token unlocks and whether Apple Ads is connected';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa whoami'];

    async run(): Promise<AsaMeDTO> {
        await this.parse(AsaWhoami);
        const client = await createAsaClient(this.config);
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
