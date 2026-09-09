import { Command, Flags } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { PaywallDTO, PaywallWriteRequestDTO } from '../../lib/api-schemas.js';

export default class PaywallsCreate extends Command {
    static override description = 'Create a paywall with products';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> paywalls create --app UUID --title "Default Paywall" --product-id UUID1 --product-id UUID2',
    ];

    static override flags = {
        ...appFlag,
        'product-id': Flags.string({
            description: 'Product ID (UUID). Repeat for multiple.',
            multiple: true,
            required: true,
        }),
        'title': Flags.string({ description: 'Paywall title', required: true }),
    };

    async run(): Promise<PaywallDTO> {
        const { flags } = await this.parse(PaywallsCreate);
        const client = await createAuthenticatedClient(this.config);

        const body: PaywallWriteRequestDTO = {
            product_ids: flags['product-id'],
            title: flags.title,
        };

        const result = await client.post<PaywallDTO>(`/apps/${flags.app}/paywalls`, body);

        this.log('Paywall created!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
