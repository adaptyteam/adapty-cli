import { Args, Command } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, isValidUuid } from '../../lib/flags.js';
import { printList } from '../../lib/output.js';

import type { PlacementSummaryDTO } from '../../lib/api-schemas.js';

type PlacementsByPaywallResponse = {
    data: PlacementSummaryDTO[];
};

export default class PaywallsPlacements extends Command {
    static override args = {
        paywall_id: Args.string({ description: 'Paywall ID (UUID)', required: true }),
    };

    static override description = 'List placements that currently use this paywall';
    static override enableJsonFlag = true;
    static override examples = ['<%= config.bin %> paywalls placements --app UUID 770e8400-e29b-41d4-a716-446655440002'];
    static override flags = {
        ...appFlag,
    };

    async run(): Promise<PlacementsByPaywallResponse> {
        const { args, flags } = await this.parse(PaywallsPlacements);

        if (!isValidUuid(args.paywall_id)) {
            this.error('Invalid paywall ID format.', { exit: 2 });
        }

        const client = await createAuthenticatedClient(this.config);

        const result = await client.get<PlacementsByPaywallResponse>(
            `/apps/${flags.app}/paywalls/${args.paywall_id}/placements`,
        );

        printList(result.data, this.log.bind(this));

        return result;
    }
}
