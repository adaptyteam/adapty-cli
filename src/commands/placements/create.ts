import { Command, Flags } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag } from '../../lib/flags.js';
import { draftFlowError } from '../../lib/flow-help.js';
import { printResponse } from '../../lib/output.js';
import { audienceEntryProblem } from '../../lib/placement-audiences.js';

import type { PlacementAudienceEntryDTO, PlacementDetailDTO, PlacementWriteRequestDTO } from '../../lib/api-schemas.js';

export default class PlacementsCreate extends Command {
    static override description = 'Create a placement with a paywall';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> placements create --app UUID --title "Default" --developer-id default --audiences \'[{"content_type":"paywall","segment_ids":[],"paywall_id":"PAYWALL_UUID","priority":0}]\'',
        '<%= config.bin %> placements create --app UUID --title "Default" --developer-id default --audiences \'[{"content_type":"flow","segment_ids":[],"flow_id":"FLOW_UUID","priority":0}]\'',
        '<%= config.bin %> placements create --app UUID --title "Default" --developer-id default --paywall-id PAYWALL_UUID',
    ];

    static override flags = {
        ...appFlag,
        'audiences': Flags.string({
            description:
                'JSON array of audience entries. Every entry needs an explicit content_type. '
                + 'Paywall: {content_type:"paywall", segment_ids, paywall_id, priority}. '
                + 'Flow: {content_type:"flow", segment_ids, flow_id, priority}. '
                + 'A flow must be published first (flows publish) — attaching a draft flow returns 400.',
            exactlyOne: ['paywall-id', 'audiences'],
        }),
        'developer-id': Flags.string({ description: 'Developer ID for the placement', required: true }),
        'paywall-id': Flags.string({
            description: 'Paywall ID (UUID). DEPRECATED: use --audiences.',
            exactlyOne: ['paywall-id', 'audiences'],
        }),
        'title': Flags.string({ description: 'Placement title', required: true }),
    };

    async run(): Promise<PlacementDetailDTO> {
        const { flags } = await this.parse(PlacementsCreate);

        const body: PlacementWriteRequestDTO = {
            audiences: null,
            developer_id: flags['developer-id'],
            paywall_id: null,
            title: flags.title,
        };

        if (flags['paywall-id']) {
            process.stderr.write(
                '⚠️  --paywall-id is deprecated. Use --audiences instead.\n'
                + '    `paywall_id` will be removed from the API in a future release.\n',
            );

            // eslint-disable-next-line @typescript-eslint/no-deprecated -- FIXME if you see this
            body.paywall_id = flags['paywall-id'];
        } else {
            let parsed: unknown;

            try {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- FIXME if you see this
                parsed = JSON.parse(flags.audiences!);
            } catch (error) {
                this.error(`Invalid --audiences JSON: ${error instanceof Error ? error.message : String(error)}`, { exit: 2 });
            }

            if (!Array.isArray(parsed)) {
                this.error('--audiences must be a JSON array of audience entries.', { exit: 2 });
            }

            const entries = parsed as unknown[];

            for (const [index, entry] of entries.entries()) {
                const problem = audienceEntryProblem(entry);

                if (problem) {
                    this.error(`--audiences[${index}]: ${problem}`, { exit: 2 });
                }
            }

            body.audiences = entries as PlacementAudienceEntryDTO[];
        }

        const client = await createAuthenticatedClient(this.config);
        let result: PlacementDetailDTO;

        try {
            result = await client.post<PlacementDetailDTO>(`/apps/${flags.app}/placements`, body);
        } catch (error) {
            const message = draftFlowError(error, flags.app, body.audiences);

            if (message) {
                this.error(message, { exit: 2 });
            }

            throw error;
        }

        this.log('Placement created!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
