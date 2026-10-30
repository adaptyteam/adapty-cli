import { Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../cli/input/app.js';
import { paywallFieldFlags, paywallFieldsFromFlags } from '../../cli/input/paywall.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { printResponse } from '../../lib/output.js';

import type { PaywallCreateRequestDTO, PaywallDTO } from '../../lib/api-schemas.js';

export default class PaywallsCreate extends Command {
    static override description
        = 'Create a paywall with products. A field that is not given gets the dashboard default: '
            + 'no remote configs, no builder, no screenshots, no web purchase URL.';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> paywalls create --app UUID --title "Default Paywall" --product-id UUID1 --product-id UUID2',
        '<%= config.bin %> paywalls create --app UUID --title "Default Paywall" --product-id UUID1 '
        + '--remote-configs \'[{"locale":"en","data":"{}"}]\'',
    ];

    static override flags = {
        ...appIdFlag,
        ...paywallFieldFlags,
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

        const body = paywallFieldsFromFlags(flags) as PaywallCreateRequestDTO;

        const result = await client.post<PaywallDTO>(`/apps/${flags.app}/paywalls`, body);

        this.log('Paywall created!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
