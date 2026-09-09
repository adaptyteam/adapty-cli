import { Command, Flags } from '@oclif/core';

import { asaWrite, createAsaClient } from '../../../lib/asa-client.js';
import { idempotencyFlags } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaProductPageSyncDTO } from '../../../lib/asa-schemas.js';

export default class AsaProductPagesSync extends Command {
    static override description = 'Refresh custom product pages from Apple';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> asa product-pages sync', '<%= config.bin %> asa product-pages sync --adam-id 123456'];
    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
        'adam-id': Flags.integer({ description: 'Limit the refresh to one app; omit to cover every app' }),
    };

    async run(): Promise<AsaProductPageSyncDTO> {
        const { flags } = await this.parse(AsaProductPagesSync);

        const body = { ...(flags['adam-id'] === undefined ? {} : { adam_id: flags['adam-id'] }) };

        await confirmMutation(
            this,
            { body, method: 'POST', path: '/product-pages/sync/', summary: 'Queue a product page refresh from Apple' },
            flags.yes,
        );

        const client = await createAsaClient(this);

        const { result } = await asaWrite<AsaProductPageSyncDTO>(client, 'post', '/product-pages/sync', {
            body,
            idempotencyKey: flags['idempotency-key'],
        });

        this.log(result.replayed ? 'Already running; nothing new was queued.' : 'Sync queued.');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
