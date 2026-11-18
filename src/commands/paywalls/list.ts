import { Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../cli/input/app.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { paginationFlags, paginationParams } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { PaywallSummaryDTO } from '../../lib/api-schemas.js';
import type { PaginatedResponse } from '../../lib/flags.js';

export default class PaywallsList extends Command {
    static override summary = 'List paywalls for an app';
    static override description = [
        '--kind lists only the paywalls of one kind.',
        '',
        'Each paywall has a read-only `kind`: `custom` when it uses no legacy Paywall Builder, `legacy_builder` when it is set to use one.',
        '`kind` follows the builder setting, not a saved layout, and names no builder version.',
        '`paywalls placements` gives the placements that use a paywall now; `paywalls metrics get` gives its traffic in a period, by paywall ID and date.',
    ].join('\n');

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> paywalls list --app 550e8400-...',
        '<%= config.bin %> paywalls list --app 550e8400-... --kind legacy_builder',
    ];

    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
        // The server owns the list of kinds and answers a wrong one with a 400 that names them
        kind: Flags.string({ description: 'Only paywalls of this kind: custom or legacy_builder' }),
    };

    async run(): Promise<PaginatedResponse<PaywallSummaryDTO>> {
        const { flags } = await this.parse(PaywallsList);
        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PaginatedResponse<PaywallSummaryDTO>>(
            `/apps/${flags.app}/paywalls`,
            { ...paginationParams(flags), 'filter[kind]': flags.kind },
        );

        printList(result.data, this.log.bind(this), result.meta.pagination);

        return result;
    }
}
