import { Args, Command, Flags } from '@oclif/core';

import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { appFlag, isValidUuid } from '../../lib/flags.js';
import { draftFlowError } from '../../lib/flow-help.js';
import { printResponse } from '../../lib/output.js';
import { audienceEntryProblem } from '../../lib/placement-audiences.js';

import type { PlacementAudienceEntryDTO, PlacementDetailDTO, PlacementWriteRequestDTO } from '../../lib/api-schemas.js';

export default class PlacementsUpdate extends Command {
    static override args = {
        placement_id: Args.string({ description: 'Placement ID (UUID)', required: true }),
    };

    static override description = 'Update a placement';
    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> placements update --app UUID 550e8400-... --title "Default" --developer-id default --audiences \'[{"content_type":"paywall","segment_ids":[],"paywall_id":"PAYWALL_UUID","priority":0}]\'',
        '<%= config.bin %> placements update --app UUID 550e8400-... --title "Default" --developer-id default --audiences \'[{"content_type":"flow","segment_ids":[],"flow_id":"FLOW_UUID","priority":0}]\'',
        '<%= config.bin %> placements update --app UUID 550e8400-... --title "Default" --developer-id default --paywall-id PAYWALL_UUID',
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
        const { args, flags } = await this.parse(PlacementsUpdate);

        if (!isValidUuid(args.placement_id)) {
            this.error('Invalid placement ID format.', { exit: 2 });
        }

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

            process.stderr.write(
                '⚠️  --paywall-id will rewrite all audiences on this placement.\n'
                + '    If the placement has segment-specific paywalls, they will be replaced\n'
                + '    by a single default audience. Use --audiences to preserve them.\n',
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
            result = await client.put<PlacementDetailDTO>(`/apps/${flags.app}/placements/${args.placement_id}`, body);
        } catch (error) {
            const message = draftFlowError(error, flags.app, body.audiences);

            if (message) {
                this.error(message, { exit: 2 });
            }

            throw error;
        }

        this.log('Placement updated!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
